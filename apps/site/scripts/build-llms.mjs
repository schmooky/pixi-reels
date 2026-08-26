#!/usr/bin/env node
/**
 * Generate `public/llms.txt` from the Astro page tree.
 *
 * Walks the route tree (`src/pages/architecture`) plus the Keystatic content
 * collections (`src/content/{recipes,guides,docs}`) and extracts each page's
 * frontmatter (title, description, tags). The FAQ is a separate collection of
 * one-question YAML files rather than MDX pages, so it is read on its own -
 * it used to be dropped entirely, because nothing here matched a `.yaml`.
 * Groups by section and emits a single text file an LLM can fetch to
 * understand the whole library surface in one request.
 *
 * For recipes specifically, also inlines the parallel `*.recipe.ts` source
 * code from `src/recipes/`. that's the pattern an LLM most needs to
 * write working code against the library.
 *
 * Wired into the docs build via `pnpm llms:gen` (run by predev/prebuild).
 *
 * Output is deterministic: stable order, and no build timestamp. The file is
 * committed, so stamping every regeneration made a diff out of a rebuild that
 * changed nothing. The version line below is the freshness signal instead.
 */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PAGES = resolve(ROOT, 'src/pages');
// Recipes/guides/docs prose moved to Keystatic content collections; demos and
// architecture are still route MDX/astro under src/pages.
const CONTENT = resolve(ROOT, 'src/content');
const RECIPES_SRC = resolve(ROOT, 'src/recipes');
const FAQ_DIR = resolve(CONTENT, 'faq');
const FAQ_GROUPS_DIR = resolve(CONTENT, 'faq-groups');
const PKG = resolve(ROOT, '../../packages/pixi-reels/package.json');
const OUT = resolve(ROOT, 'public/llms.txt');

const SITE_URL = 'https://pixi-reels.schmooky.dev';

/**
 * Section order for the rendered llms.txt. Within each section the items
 * are sorted alphabetically by slug for stable diffs.
 */
const SECTIONS = [
  { id: 'guides', label: 'Guides', match: (p) => p.startsWith('guides/') },
  { id: 'docs', label: 'API reference', match: (p) => p.startsWith('docs/') },
  { id: 'architecture', label: 'Architecture deep-dives', match: (p) => p.startsWith('architecture/') },
  { id: 'recipes', label: 'Recipes', match: (p) => p.startsWith('recipes/') },
];

const SKIP_BASENAMES = new Set(['llms.txt', 'index']);

async function main() {
  // Walk both roots; slugs are computed relative to each base, so
  // src/content/recipes/x.mdx → "recipes/x" exactly as the old page did.
  const pages = [...(await collectPages(PAGES)), ...(await collectPages(CONTENT))];
  const recipes = await collectRecipes();
  const faq = await collectFaq();
  const version = JSON.parse(await readFile(PKG, 'utf-8')).version;

  const grouped = SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    items: pages.filter((p) => s.match(p.slug)).sort((a, b) => a.slug.localeCompare(b.slug)),
  })).filter((g) => g.items.length > 0);

  const out = render(grouped, recipes, faq, version);
  await writeFile(OUT, out, 'utf-8');

  const total = grouped.reduce((n, g) => n + g.items.length, 0);
  const answered = faq.reduce((n, g) => n + g.questions.length, 0);
  console.log(
    `[build-llms] Wrote ${total} pages + ${recipes.length} recipe sources + ` +
    `${answered} answered FAQ entries (v${version}) to ${OUT}`,
  );
}

async function collectPages(baseDir) {
  const entries = await walk(baseDir);
  const out = [];
  for (const file of entries) {
    if (!/\.(mdx|astro)$/.test(file)) continue;
    const rel = relative(baseDir, file);
    const base = baseNoExt(rel.split('/').pop());
    if (SKIP_BASENAMES.has(base)) continue;
    if (rel.includes('[')) continue; // dynamic routes

    const raw = await readFile(file, 'utf-8');
    const fm = parseFrontmatter(raw);
    if (!fm) continue;

    const slug = relToSlug(rel);
    out.push({
      slug,
      href: `${SITE_URL}/${slug}/`,
      title: fm.title ?? slug,
      description: fm.description ?? '',
      tags: fm.tags ?? [],
      realGameVideo: extractRealGameVideo(raw),
    });
  }
  return out;
}

/**
 * Pull the nested `realGameVideo` block out of MDX frontmatter. The flat
 * `parseFrontmatter` above doesn't handle nested objects, so this is a
 * targeted secondary read for that one known shape:
 *
 *   realGameVideo:
 *     webm: /videos/foo.webm
 *     mp4:  /videos/foo.mp4   # optional
 *     caption: Foo Slot by Studio
 *
 * Returns null when the block isn't present.
 */
function extractRealGameVideo(raw) {
  const m = raw.match(/^realGameVideo:\s*\n((?:[ \t]+\S[^\n]*\n)+)/m);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^[ \t]+([A-Za-z][\w-]*):\s*(.+?)\s*$/);
    if (!kv) continue;
    out[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
  }
  if (!out.caption) return null;
  return out;
}

async function collectRecipes() {
  const out = [];
  let entries;
  try {
    entries = await readdir(RECIPES_SRC);
  } catch {
    return out;
  }
  for (const file of entries.sort()) {
    if (!file.endsWith('.recipe.ts')) continue;
    const slug = file.replace(/\.recipe\.ts$/, '');
    const code = await readFile(join(RECIPES_SRC, file), 'utf-8');
    out.push({ slug, code: code.trim() });
  }
  return out;
}

/**
 * The FAQ is 331 one-question YAML files plus a group index, not MDX pages, so
 * the page walker never saw it and the whole knowledge base was missing from
 * this file. Mirrors what `src/content/faq.ts` does for the site: groups sort
 * by `order`, questions by their zero-padded id.
 *
 * Only ANSWERED questions are emitted. An open one is a to-do on the site, and
 * a question with no answer is worse than nothing as LLM context.
 */
async function collectFaq() {
  const readYamlDir = async (dir) => {
    let entries;
    try { entries = await readdir(dir); } catch { return []; }
    const out = [];
    for (const file of entries.sort()) {
      if (!file.endsWith('.yaml')) continue;
      out.push({ id: file.replace(/\.yaml$/, ''), data: parseYaml(await readFile(join(dir, file), 'utf-8')) });
    }
    return out;
  };

  const groups = (await readYamlDir(FAQ_GROUPS_DIR))
    .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0) || a.id.localeCompare(b.id));
  const questions = await readYamlDir(FAQ_DIR);

  const byGroup = new Map();
  for (const { id, data } of questions) {
    if (!data.answer) continue;
    if (!byGroup.has(data.group)) byGroup.set(data.group, []);
    byGroup.get(data.group).push({ id, question: data.question, answer: data.answer, recipe: data.recipe });
  }

  return groups
    .map((g) => ({
      id: g.id,
      title: g.data.title,
      blurb: g.data.blurb,
      questions: byGroup.get(g.id) ?? [],
    }))
    .filter((g) => g.questions.length > 0);
}

async function walk(dir) {
  const out = [];
  let items;
  try { items = await readdir(dir); } catch { return out; }
  for (const item of items) {
    const full = join(dir, item);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function baseNoExt(p) { return (p ?? '').replace(/\.[^.]+$/, ''); }

function relToSlug(rel) {
  const noExt = rel.replace(/\.(mdx|astro)$/, '');
  return noExt.replace(/\/index$/, '');
}

/**
 * Pull the YAML-ish frontmatter block (`---\n...\n---`) from the top of
 * an .mdx or .astro file and parse the keys we care about. We don't need
 * a full YAML parser. only flat strings, flat string lists, and flat
 * objects appear in this site's frontmatter.
 */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const body = m[1];
  const out = {};
  let currentList = null;
  let currentKey = null;
  for (const line of body.split('\n')) {
    if (/^\s*-\s/.test(line) && currentList) {
      currentList.push(line.replace(/^\s*-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    if (val === '') {
      currentList = [];
      currentKey = key;
      out[key] = currentList;
    } else if (val.startsWith('[') && val.endsWith(']')) {
      out[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
      currentList = null;
      currentKey = null;
    } else {
      out[key] = val.replace(/^['"]|['"]$/g, '');
      currentList = null;
      currentKey = null;
    }
  }
  void currentKey;
  return out;
}

function render(sections, recipes, faq, version) {
  const lines = [];
  lines.push('# pixi-reels');
  lines.push('');
  // Read from the package, never hand-written: this said 1.0.0 while the
  // library was on 2.2.0, so the whole file opened by telling an LLM the
  // wrong major.
  lines.push(`pixi-reels ${version} is a reel engine for PixiJS v8.`);
  lines.push('It ships reel-only primitives. Win math, paytable math, RNG, and audio live in consumer code.');
  lines.push('This file inlines every guide, API page, recipe (with source) and answered FAQ entry for offline LLM context.');
  lines.push('');
  lines.push(`Site: ${SITE_URL}`);
  lines.push('Repo: https://github.com/schmooky/pixi-reels');
  lines.push('Package: https://www.npmjs.com/package/pixi-reels');
  lines.push('');
  lines.push('## Quick start');
  lines.push('');
  lines.push('```bash');
  lines.push('npm install pixi-reels pixi.js gsap');
  lines.push('```');
  lines.push('');
  lines.push('```ts');
  lines.push("import { Application } from 'pixi.js';");
  lines.push("import { ReelSetBuilder, SpriteSymbol } from 'pixi-reels';");
  lines.push('');
  lines.push('const app = new Application();');
  lines.push('await app.init({ width: 800, height: 480 });');
  lines.push('');
  lines.push('const reelSet = new ReelSetBuilder()');
  lines.push('  .reels(5).visibleCells(3).symbolSize(120, 120)');
  lines.push("  .symbols(r => r.register('cherry', SpriteSymbol, { textures: { cherry: cherryTex } }))");
  lines.push('  .ticker(app.ticker)');
  lines.push('  .build();');
  lines.push('app.stage.addChild(reelSet);');
  lines.push('');
  lines.push('const result = reelSet.spin();');
  lines.push("reelSet.setResult([{ visible: ['cherry','cherry','cherry'] }, /* one per reel */ ]);");
  lines.push('await result;');
  lines.push('```');
  lines.push('');

  for (const section of sections) {
    lines.push(`## ${section.label}`);
    lines.push('');
    for (const item of section.items) {
      lines.push(`### ${item.title}`);
      lines.push(`URL: ${item.href}`);
      if (item.description) lines.push(item.description);
      if (item.tags.length) lines.push(`Tags: ${item.tags.join(', ')}`);
      if (item.realGameVideo) {
        const v = item.realGameVideo;
        const url = v.webm ?? v.mp4;
        lines.push(`Real game example: ${v.caption}${url ? ` (${SITE_URL}${url})` : ''}`);
      }
      lines.push('');
    }
  }

  if (faq.length) {
    lines.push('## FAQ');
    lines.push('');
    lines.push('The knowledge base behind /faq/. Only answered questions appear here; open ones are to-dos on the site and would be worse than nothing as context.');
    lines.push('');
    for (const group of faq) {
      lines.push(`### ${group.title}`);
      if (group.blurb) lines.push(group.blurb);
      lines.push('');
      for (const q of group.questions) {
        lines.push(`Q (${q.id}): ${q.question}`);
        lines.push(`A: ${String(q.answer).trim()}`);
        if (q.recipe) lines.push(`Recipe: ${SITE_URL}/recipes/${q.recipe}/`);
        lines.push('');
      }
    }
  }

  if (recipes.length) {
    lines.push('## Recipe source code');
    lines.push('');
    lines.push('Each recipe page on the site renders one of the following TypeScript files. Inlining the source here lets an LLM read working code without a follow-up fetch.');
    lines.push('');
    for (const r of recipes) {
      lines.push(`### ${r.slug}`);
      lines.push(`URL: ${SITE_URL}/recipes/${r.slug}/`);
      lines.push('```ts');
      lines.push(r.code);
      lines.push('```');
      lines.push('');
    }
  }
  return lines.join('\n');
}

main().catch((err) => {
  console.error('[build-llms] failed:', err);
  process.exit(1);
});
