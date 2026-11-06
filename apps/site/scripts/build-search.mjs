#!/usr/bin/env node
/**
 * Build the Pagefind index for dist/ with the ranking the site wants.
 *
 * Replaces the bare `pagefind --site dist` call. The CLI indexes every page
 * equally, so the 341 TypeDoc pages under /api/ drown the topic pages a
 * reader is usually after. This script feeds Pagefind through its Node API
 * instead, which lets it decide per page what goes in and how heavy it is
 * without touching the (sibling-owned) layouts:
 *
 * - root selector `main`; nav, footer, sidebars and the search modal are
 *   excluded by selector, so chrome never matches a query
 * - listing pages (/guides/, /recipes/, /faq/, /docs/, /architecture/) are
 *   skipped: they only repeat the titles of the pages they link to
 * - /api/ pages get `data-pagefind-weight="0.3"`, and the modal multiplies
 *   their score by a section factor again before it sorts (Pagefind's own
 *   ranking favours short pages so strongly that weight alone does not move
 *   a two-word TypeDoc page below a guide). A symbol name still finds its
 *   reference page; a topic page that explains the same word ranks above it
 * - every page gets `data-pagefind-meta="section:<label>"` from its URL,
 *   which the modal shows as the eyebrow over each hit
 *
 * Run after `astro build`: `node scripts/build-search.mjs [dist]`.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import * as pagefind from 'pagefind';

const DIST = resolve(process.argv[2] ?? 'dist');

/** URL prefix -> section label and index weight. Order matters: first match wins. */
const SECTIONS = [
  { prefix: '/index.html', label: 'Home', weight: 0.5 },
  { prefix: '/api/', label: 'API reference', weight: 0.3 },
  { prefix: '/architecture/', label: 'Architecture' },
  { prefix: '/mechanics/', label: 'Mechanic' },
  { prefix: '/learn/', label: 'Learn' },
  { prefix: '/faq/', label: 'FAQ' },
  { prefix: '/reference/changelog/', label: 'Changelog', weight: 0.5 },
  { prefix: '/reference/', label: 'Reference' },
];

/** Pages that duplicate what they link to, or are not reading material. */
const SKIP = [
  /^\/(mechanics|learn|reference|faq|architecture|api)\/index\.html$/,
  /^\/(og|share|studio|keystatic|_astro|pagefind|ask)\//,
  /^\/404\.html$/,
];

async function main() {
  const t0 = Date.now();
  const files = (await walk(DIST)).filter((f) => f.endsWith('.html'));
  const { index, errors } = await pagefind.createIndex({
    rootSelector: 'main',
    // `.heading-anchor` is the permalink glyph inside every heading; without
    // this every sub-result title would end in "#".
    excludeSelectors: ['nav', 'footer', 'aside', 'header', '#search-root', '#search-trigger', '[data-pagefind-ignore]', '.heading-anchor', 'script', 'style', 'svg'],
    forceLanguage: 'en',
    // Identifiers like `setResult` or `ReelSetBuilder` are what readers type.
    includeCharacters: '_$',
  });
  if (!index) throw new Error(`pagefind: ${errors.join('; ')}`);

  let added = 0;
  let skipped = 0;
  for (const file of files) {
    const rel = `/${relative(DIST, file).split('\\').join('/')}`;
    if (SKIP.some((re) => re.test(rel))) {
      skipped++;
      continue;
    }
    const section = SECTIONS.find((s) => rel.startsWith(s.prefix));
    let html = await readFile(file, 'utf-8');
    const attrs = [`data-pagefind-meta="section:${section?.label ?? 'Page'}"`];
    if (section?.weight) attrs.push(`data-pagefind-weight="${section.weight}"`);
    // The attributes go on a wrapper just inside the root element: Pagefind
    // reads them on descendants of the root, not on the root itself.
    html = html.replace(/(<main\b[^>]*>)/, `$1<div ${attrs.join(' ')}>`).replace(/<\/main>(?![\s\S]*<\/main>)/, '</div></main>');
    const res = await index.addHTMLFile({ sourcePath: rel.slice(1), content: html });
    if (res.errors?.length) console.warn(`[build-search] ${rel}: ${res.errors.join('; ')}`);
    added++;
  }

  const out = await index.writeFiles({ outputPath: join(DIST, 'pagefind') });
  if (out.errors?.length) throw new Error(`pagefind: ${out.errors.join('; ')}`);
  await pagefind.close();
  console.log(`[build-search] indexed ${added} pages (${skipped} skipped) into dist/pagefind in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function walk(dir) {
  const out = [];
  for (const item of await readdir(dir)) {
    const full = join(dir, item);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

main().catch((err) => {
  console.error('[build-search] failed:', err);
  process.exit(1);
});
