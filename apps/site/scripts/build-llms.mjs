#!/usr/bin/env node
/**
 * Generate `public/llms.txt` from the Astro page tree.
 *
 * Walks `apps/site/src/pages/{recipes,docs,guides,architecture,demos}` and
 * extracts each page's frontmatter (title, description, tags, apis, steps).
 * Groups by section and emits a single text file an LLM can fetch to
 * understand the whole library surface in one request.
 *
 * For recipes specifically, also inlines the parallel `*.recipe.ts` source
 * code from `src/recipes/` — that's the pattern an LLM most needs in
 * order to write working code against the library.
 *
 * Wired into the docs build via `pnpm llms:gen` (run by predev/prebuild).
 *
 * Output is committed-time deterministic: stable order, ISO timestamp.
 */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PAGES = resolve(ROOT, 'src/pages');
const RECIPES_SRC = resolve(ROOT, 'src/recipes');
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
  { id: 'demos', label: 'Mechanic demos', match: (p) => p.startsWith('demos/') },
];

const SKIP_BASENAMES = new Set(['llms.txt', 'index']);

async function main() {
  const pages = await collectPages();
  const recipes = await collectRecipes();

  const grouped = SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    items: pages.filter((p) => s.match(p.slug)).sort((a, b) => a.slug.localeCompare(b.slug)),
  })).filter((g) => g.items.length > 0);

  const out = render(grouped, recipes);
  await writeFile(OUT, out, 'utf-8');

  const total = grouped.reduce((n, g) => n + g.items.length, 0);
  console.log(`[build-llms] Wrote ${total} pages + ${recipes.length} recipe sources to ${OUT}`);
}

async function collectPages() {
  const entries = await walk(PAGES);
  const out = [];
  for (const file of entries) {
    if (!/\.(mdx|astro)$/.test(file)) continue;
    const rel = relative(PAGES, file);
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
      apis: fm.apis ?? [],
      steps: fm.steps ?? [],
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
 * a full YAML parser — only flat strings, flat string lists, and flat
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

function render(sections, recipes) {
  const lines = [];
  lines.push('# pixi-reels');
  lines.push('');
  lines.push('Slot machine reel engine for PixiJS v8 — fluent builder, typed events, default phases, speed modes, win animations, cell pins, MultiWays, big symbols, holds, per-spin mode override, debug recorder.');
  lines.push('');
  lines.push(`Site: ${SITE_URL}`);
  lines.push('Repo: https://github.com/schmooky/pixi-reels');
  lines.push('Package: https://www.npmjs.com/package/pixi-reels');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
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
  lines.push('  .reels(5).visibleSymbols(3).symbolSize(120, 120)');
  lines.push("  .symbols(r => r.register('cherry', SpriteSymbol, { textures: { cherry: cherryTex } }))");
  lines.push('  .ticker(app.ticker)');
  lines.push('  .build();');
  lines.push('app.stage.addChild(reelSet);');
  lines.push('');
  lines.push('const result = await reelSet.spin();');
  lines.push("reelSet.setResult([['cherry','cherry','cherry'], ...]);");
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
      if (item.apis.length) lines.push(`APIs: ${item.apis.join(', ')}`);
      if (item.steps.length) {
        lines.push('Steps:');
        for (const s of item.steps) lines.push(`  - ${s}`);
      }
      if (item.realGameVideo) {
        const v = item.realGameVideo;
        const url = v.webm ?? v.mp4;
        lines.push(`Real game example: ${v.caption}${url ? ` (${SITE_URL}${url})` : ''}`);
      }
      lines.push('');
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
