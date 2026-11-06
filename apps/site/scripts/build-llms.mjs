#!/usr/bin/env node
/**
 * Generate `public/llms.txt` (the index) and `public/llms-full.txt` from the
 * Astro page tree.
 *
 * Walks the route tree (`src/pages/{architecture,api}`) plus the Keystatic content
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
 * MDX pages (guides, docs, recipe umbrellas) are inlined in full: the prose
 * body with imports and JSX components stripped, body headings demoted two
 * levels so `##` stays the section marker and `###` the page marker. That
 * grammar in `llms-full.txt` (`## Section`, `### Page` + `URL:`, `####` sub-headings with an
 * optional `URL:` deep link) is what `@pixi-reels/docs-ask` chunks for the
 * Ask box, so keep it stable. `.astro` pages (architecture) have no markdown
 * body and stay title + description only.
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
// Two files, the llmstxt.org way: `llms.txt` is the index (one line per page,
// small enough to read whole), `llms-full.txt` inlines every page, recipe
// source and FAQ answer for a model that wants all of it in one request.
const OUT = resolve(ROOT, 'public/llms.txt');
const OUT_FULL = resolve(ROOT, 'public/llms-full.txt');

const SITE_URL = 'https://pixi-reels.schmooky.dev';

/**
 * Section order for the rendered llms.txt. Within each section the items
 * are sorted alphabetically by slug for stable diffs.
 */
/**
 * Content slugs and the URLs the site serves them at. The content tree kept
 * its collection names when the site collapsed into topic pages: `topics/x`
 * is the Concept and `recipes/x` the Demos of `/mechanics/x/`, `guides/`
 * became `/learn/`, `docs/` became `/reference/`.
 */
const URL_PREFIX = { topics: 'mechanics', recipes: 'mechanics', guides: 'learn', docs: 'reference' };
function hrefFor(slug) {
  const [head, ...rest] = slug.split('/');
  return `${SITE_URL}/${URL_PREFIX[head] ?? head}/${rest.join('/')}${rest.length ? '/' : ''}`;
}

const SECTIONS = [
  // One entry per mechanic: the Concept prose with the Demos body folded in
  // below it (see foldDemos), because both render on the same page.
  { id: 'mechanics', label: 'Mechanics', match: (p) => p.startsWith('topics/') },
  { id: 'learn', label: 'Learn', match: (p) => p.startsWith('guides/') },
  { id: 'reference', label: 'Reference', match: (p) => p.startsWith('docs/') || p.startsWith('reference/') },
  // TypeDoc output: one page per exported symbol. Listed by name, signature
  // and URL rather than inlined, because the bodies are 831KB - larger than
  // the rest of this file put together - and an LLM can fetch the one symbol
  // it needs. The point here is that it knows the symbol EXISTS.
  { id: 'api', label: 'Generated API (TypeDoc)', match: (p) => p.startsWith('api/') },
  { id: 'architecture', label: 'Architecture deep-dives', match: (p) => p.startsWith('architecture/') },
];

const SKIP_BASENAMES = new Set(['llms.txt', 'index']);

async function main() {
  // Walk both roots; slugs are computed relative to each base, so
  // src/content/recipes/x.mdx → "recipes/x" exactly as the old page did.
  // `src/pages/api` is gitignored TypeDoc output, so on a clean checkout it
  // only exists after `pnpm api:gen`. Running before that used to write a
  // silently gutted file - 44 pages instead of 253, the whole generated API
  // reference missing, with a success message either way. Fail instead.
  try {
    await stat(resolve(PAGES, 'api'));
  } catch {
    throw new Error(
      'build-llms: src/pages/api is missing, so the generated API reference would ' +
      'be silently left out of llms.txt. Run `pnpm api:gen` first (predev / ' +
      'prebuild / prepreview already do, in that order).',
    );
  }

  const pages = foldDemos([...(await collectPages(PAGES)), ...(await collectPages(CONTENT))]);
  const demoUrls = demoUrlMap(pages);
  const recipes = (await collectRecipes()).map((r) => {
    const href = demoUrls.get(r.slug);
    if (!href) throw new Error(`build-llms: ${r.slug}.recipe.ts is rendered by no page body (no <RecipeDemo code="${r.slug}" />).`);
    return { ...r, href };
  });
  const faq = await collectFaq();
  const version = JSON.parse(await readFile(PKG, 'utf-8')).version;

  const grouped = SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    items: pages.filter((p) => s.match(p.slug)).sort((a, b) => a.slug.localeCompare(b.slug)),
  })).filter((g) => g.items.length > 0);

  await writeFile(OUT_FULL, render(grouped, recipes, faq, version, demoUrls), 'utf-8');
  await writeFile(OUT, renderIndex(grouped, faq, version), 'utf-8');

  const total = grouped.reduce((n, g) => n + g.items.length, 0);
  const answered = faq.reduce((n, g) => n + g.questions.length, 0);
  console.log(
    `[build-llms] Wrote ${total} pages + ${recipes.length} recipe sources + ` +
    `${answered} answered FAQ entries (v${version}) to ${OUT_FULL}, and the index to ${OUT}`,
  );
}

/**
 * An `.astro` page has code, not YAML, above its `---`. The architecture tour
 * keeps every page's title and subtitle in `architectureNav.ts`; any other
 * page names them in `const title = '...'` / `const description = '...'`.
 * Without this the index listed those pages by slug, with no description.
 */
let archMeta = null;
async function astroMeta(slug, raw) {
  if (!archMeta) {
    const nav = await readFile(resolve(CONTENT, 'architectureNav.ts'), 'utf-8');
    archMeta = new Map();
    for (const line of nav.split('\n')) {
      const s = line.match(/slug: '([^']+)'/);
      const t = line.match(/title: '((?:[^'\\]|\\.)*)'/);
      const d = line.match(/subtitle: '((?:[^'\\]|\\.)*)'/) ?? line.match(/subtitle: "((?:[^"\\]|\\.)*)"/);
      if (s && t) archMeta.set(`architecture/${s[1]}`, { title: t[1].replace(/\\'/g, "'"), description: d ? d[1].replace(/\\'/g, "'") : '' });
    }
  }
  if (archMeta.has(slug)) return archMeta.get(slug);
  const version = JSON.parse(await readFile(PKG, 'utf-8')).version;
  const str = (name) => raw.match(new RegExp(`const ${name} = ['\`]([^'\`]+)['\`]`))?.[1]?.replace(/\$\{PIXI_REELS_VERSION\}/g, version);
  const meta = {};
  const title = str('title');
  const description = str('description');
  if (title) meta.title = title;
  if (description) meta.description = description;
  return meta;
}

async function collectPages(baseDir) {
  const entries = await walk(baseDir);
  const out = [];
  for (const file of entries) {
    if (!/\.(mdx|md|astro)$/.test(file)) continue;
    const rel = relative(baseDir, file);
    const base = baseNoExt(rel.split('/').pop());
    if (SKIP_BASENAMES.has(base)) continue;
    if (rel.includes('[')) continue; // dynamic routes

    const raw = await readFile(file, 'utf-8');
    const fm = parseFrontmatter(raw);
    if (!fm) continue;
    if (file.endsWith('.astro')) Object.assign(fm, await astroMeta(relToSlug(rel), raw));

    const slug = relToSlug(rel);
    const href = hrefFor(slug);
    out.push({
      slug,
      href,
      title: fm.title ?? slug,
      description: fm.description ?? fm.oneLiner ?? '',
      tags: fm.tags ?? [],
      realGameVideo: extractRealGameVideo(raw),
      // TypeDoc pages stay title + signature + URL (see SECTIONS above).
      body: /\.mdx?$/.test(file) && !slug.startsWith('api/') ? cleanBody(raw, href) : '',
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

/**
 * Markdown body of an MDX page as plain prose: frontmatter, top-level
 * `import`/`export` lines and JSX components dropped, fenced code kept
 * verbatim, headings demoted by two so they nest under the `###` page line.
 *
 * `<RecipeDemo code="x" />` becomes a `Live demo:` line pointing at the demo's
 * anchor on this page (the nearest preceding `<a id>`), so a reader of the
 * text file, human or model, can find the runnable version.
 */
function cleanBody(raw, href) {
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const out = [];
  let inFence = false;
  let anchor = null;
  let pending = ''; // a JSX tag that spans lines
  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (pending) {
      pending += ` ${line.trim()}`;
      if (!/>\s*$/.test(line)) continue;
      out.push(...jsxToText(pending, href, (a) => { anchor = a; }, () => anchor));
      pending = '';
      continue;
    }
    if (/^(import|export)\s/.test(line)) continue;
    if (/^\s*<\/?[A-Za-z]/.test(line)) {
      if (!/>\s*$/.test(line)) {
        pending = line.trim();
        continue;
      }
      out.push(...jsxToText(line.trim(), href, (a) => { anchor = a; }, () => anchor));
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      out.push(`${'#'.repeat(Math.min(6, h[1].length + 2))} ${h[2]}`);
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function jsxToText(tag, href, setAnchor, getAnchor) {
  const a = tag.match(/^<a\s+id="([^"]+)"/);
  if (a) {
    setAnchor(a[1]);
    return [];
  }
  const demo = tag.match(/<RecipeDemo\b[^>]*\bcode="([^"]+)"/);
  if (demo) {
    const anchor = getAnchor();
    return [`Live demo (${demo[1]}): ${href}${anchor ? `#${anchor}` : ''}`];
  }
  // Inline components with text children (`<Timeline>...</Timeline>`) keep
  // their inner text on the lines between; the tags themselves go.
  return [];
}

/**
 * `/mechanics/x/` renders `topics/x` (Concept) and `recipes/x` (Demos) one
 * above the other, so the text file lists one page with both bodies. A demos
 * body without a topic is a site bug (the page would 404), so fail on it.
 */
function foldDemos(pages) {
  const topics = new Map(pages.filter((p) => p.slug.startsWith('topics/')).map((p) => [p.slug.slice('topics/'.length), p]));
  const out = [];
  for (const p of pages) {
    if (!p.slug.startsWith('recipes/')) {
      out.push(p);
      continue;
    }
    const topic = topics.get(p.slug.slice('recipes/'.length));
    if (!topic) throw new Error(`build-llms: src/content/${p.slug}.mdx has no src/content/topics/ page to render under.`);
    topic.body = [topic.body, '##### Demos', p.body].filter(Boolean).join('\n\n');
  }
  return out;
}

/**
 * Where each `*.recipe.ts` is shown live: scans every page body for the
 * `Live demo (code): url` lines cleanBody wrote. Mechanic pages win over
 * guides when a demo appears on both.
 */
function demoUrlMap(pages) {
  const map = new Map();
  const ranked = [...pages].sort((a, b) => Number(b.slug.startsWith('topics/')) - Number(a.slug.startsWith('topics/')));
  for (const p of ranked) {
    for (const m of p.body.matchAll(/^Live demo \(([^)]+)\): (\S+)$/gm)) {
      if (!map.has(m[1])) map.set(m[1], m[2]);
    }
  }
  return map;
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
  const noExt = rel.replace(/\.(mdx|md|astro)$/, '');
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
    // A folded scalar: Keystatic wraps a long description onto indented
    // lines, and dropping them cut the text mid-sentence.
    if (/^\s+\S/.test(line) && currentKey && typeof out[currentKey] === 'string') {
      out[currentKey] = `${out[currentKey]}${out[currentKey] ? ' ' : ''}${line.trim().replace(/['"]$/, '')}`;
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
      // `>-` / `|` block scalars start empty; their indented lines follow.
      out[key] = /^[>|][+-]?$/.test(val) ? '' : val.replace(/^['"]|['"]$/g, '');
      currentList = null;
      currentKey = key;
    }
  }
  void currentKey;
  return out;
}

function render(sections, recipes, faq, version, demoUrls) {
  const lines = [];
  lines.push('# pixi-reels');
  lines.push('');
  // Read from the package, never hand-written: this said 1.0.0 while the
  // library was on 2.2.0, so the whole file opened by telling an LLM the
  // wrong major.
  lines.push(`pixi-reels ${version} is a reel engine for PixiJS v8.`);
  lines.push('It ships reel-only primitives. Win math, paytable math, RNG, and audio live in consumer code.');
  lines.push('This file inlines every guide, API page, recipe (with source) and answered FAQ entry for offline LLM context.');
  lines.push(`The index alone, one line per page, is ${SITE_URL}/llms.txt.`);
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
      if (item.body) {
        lines.push('');
        lines.push(item.body);
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
      lines.push(`URL: ${SITE_URL}/faq/#${group.id}`);
      if (group.blurb) lines.push(group.blurb);
      lines.push('');
      for (const q of group.questions) {
        // One `####` per question with its own page URL, so a chunker can
        // cite the answer page rather than the group.
        lines.push(`#### Q: ${q.question}`);
        lines.push(`URL: ${SITE_URL}/faq/${q.id}/`);
        lines.push(`A: ${String(q.answer).trim()}`);
        if (q.recipe) {
          const url = demoUrls.get(q.recipe);
          if (!url) throw new Error(`build-llms: FAQ ${q.id} names recipe "${q.recipe}", which no page renders.`);
          lines.push(`Recipe: ${url}`);
        }
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
      lines.push(`URL: ${r.href}`);
      lines.push('```ts');
      lines.push(r.code);
      lines.push('```');
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** A description cut to one line at a word boundary, for the index. */
function oneLine(text, max = 160) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * The index: what the library is, where to start, and one link per page with
 * its description. The generated API goes under `## Optional`, the llmstxt.org
 * section a reader may skip, since a model can fetch the one symbol it needs.
 */
function renderIndex(sections, faq, version) {
  const lines = [];
  lines.push('# pixi-reels');
  lines.push('');
  lines.push(`> pixi-reels ${version} is a slot machine reel engine for PixiJS v8: a fluent builder, typed events, spin phases, speed modes, cascades, Hold & Win, big symbols and win spotlights. It ships reel-only primitives; win math, paytables, RNG and audio stay in the game.`);
  lines.push('');
  lines.push('Install with `npm install pixi-reels pixi.js gsap`. Every mechanic page opens on live demos whose source is the recipe module shown beside them, runnable as-is in the Studio.');
  lines.push(`Everything below, inlined with each recipe's source and every FAQ answer: ${SITE_URL}/llms-full.txt`);
  lines.push('');
  lines.push(`- Site: ${SITE_URL}`);
  lines.push('- Repo: https://github.com/schmooky/pixi-reels');
  lines.push('- Package: https://www.npmjs.com/package/pixi-reels');
  lines.push(`- Studio: ${SITE_URL}/studio/`);
  lines.push('');
  const api = sections.find((s) => s.id === 'api');
  for (const section of sections) {
    if (section === api) continue;
    lines.push(`## ${section.label}`);
    lines.push('');
    for (const item of section.items) {
      const desc = oneLine(item.description);
      lines.push(`- [${item.title}](${item.href})${desc ? `: ${desc}` : ''}`);
    }
    lines.push('');
  }
  if (faq.length) {
    lines.push('## FAQ');
    lines.push('');
    for (const group of faq) {
      for (const q of group.questions) lines.push(`- [${oneLine(q.question, 200)}](${SITE_URL}/faq/${q.id}/)`);
    }
    lines.push('');
  }
  if (api) {
    lines.push('## Optional');
    lines.push('');
    for (const item of api.items) lines.push(`- [${item.title}](${item.href})`);
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((err) => {
  console.error('[build-llms] failed:', err);
  process.exit(1);
});
