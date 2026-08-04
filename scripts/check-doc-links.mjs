#!/usr/bin/env node
/**
 * Guard: every in-repo link in the docs must resolve to a page that exists.
 *
 * A doc that points at a recipe someone renamed is worse than no link. It
 * looks authoritative and 404s. Nothing else in the build catches it: Astro
 * happily renders `[text](/recipes/gone/)` and only the reader finds out.
 *
 * Run after `pnpm --filter site build`, which is where the page list comes
 * from. Skipped (with a note) if `dist/` is not there.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'apps/site/dist');
const CONTENT = join(ROOT, 'apps/site/src/content');

if (!existsSync(DIST)) {
  console.log('check-doc-links: no apps/site/dist, run `pnpm --filter site build` first. Skipping.');
  process.exit(0);
}

async function walk(dir, exts) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, exts)));
    else if (exts.includes(extname(entry.name))) out.push(full);
  }
  return out;
}

/**
 * Resolve a link to the built file that serves it, or null.
 * Returns the path so the anchor check can read the same file.
 */
async function resolves(path) {
  const clean = path.replace(/\/$/, '');
  for (const candidate of [join(DIST, clean, 'index.html'), join(DIST, clean)]) {
    try {
      const st = await stat(candidate);
      if (st.isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/**
 * Every `id` the built page exposes. An anchor that names none of them
 * silently drops the reader at the top, which reads as "the section this
 * promised does not exist". Three of those shipped because this script used
 * to strip the fragment before checking.
 */
const idCache = new Map();
async function idsOf(builtPath) {
  if (!idCache.has(builtPath)) {
    const html = await readFile(builtPath, 'utf8');
    idCache.set(builtPath, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(builtPath);
}

/**
 * Astro emits a stub page for each configured redirect. Checking the anchor
 * against the STUB always passes -- it has no headings, and no ids at all --
 * so a redirect aimed at a fragment that does not exist on the destination
 * sails through. Two of them did. Follow the stub to the real page, and
 * prefer the fragment the redirect itself carries over the one in the link.
 */
async function follow(builtPath, anchor, depth = 0) {
  if (depth > 5) return { builtPath, anchor }; // redirect loop; report as-is
  const html = await readFile(builtPath, 'utf8');
  const m = html.match(/http-equiv="refresh"[^>]*url=([^"']+)["']/i);
  if (!m) return { builtPath, anchor };
  const [path, frag] = m[1].split('#');
  const next = await resolves(path);
  if (!next) return { builtPath, anchor };
  return follow(next, frag ?? anchor, depth + 1);
}

const files = await walk(CONTENT, ['.mdx', '.md', '.yaml']);
const broken = [];
let checked = 0;

/**
 * Every in-site link in one file: markdown `](/path#frag)` plus the FAQ's
 * YAML `href: /path#frag`. The 234 FAQ links were invisible here until now,
 * which is how an answer came to point at a redirect whose fragment did not
 * exist on the destination.
 */
function* linksIn(src) {
  for (const m of src.matchAll(/\]\((\/[^)\s#?]*)?(?:#([^)\s?]+))?(?:\?[^)]*)?\)/g))
    yield [m[1], m[2]];
  for (const m of src.matchAll(/^\s*href:\s*["']?(\/[^"'\s#?]*)?(?:#([^"'\s?]+))?["']?\s*$/gm))
    yield [m[1], m[2]];
}

for (const file of files) {
  const src = await readFile(file, 'utf8');
  const where = file.slice(ROOT.length + 1);
  for (const [path, anchor] of linksIn(src)) {
    if (!path && !anchor) continue;
    checked++;

    // A bare `#anchor` points at the page it is written on.
    const target = path ?? `/${where.replace(/^apps\/site\/src\/content\//, '').replace(/\.mdx?$/, '')}/`;
    const built = await resolves(target);
    if (!built) {
      broken.push(`${where}  ->  ${path ?? target}`);
      continue;
    }
    // A redirect stub has no ids, so resolve to the page that actually
    // renders before asking whether the fragment exists.
    const final = await follow(built, anchor);
    if (final.anchor && !(await idsOf(final.builtPath)).has(final.anchor)) {
      const via = final.builtPath === built ? '' : ' (via redirect)';
      broken.push(`${where}  ->  ${path ?? ''}#${final.anchor}${via}  (page exists, no such id)`);
    }
  }
}

if (broken.length > 0) {
  console.error(`check-doc-links: ${broken.length} broken link(s) of ${checked} checked:\n`);
  for (const b of broken) console.error(`  ${b}`);
  console.error('\nEither the target moved, or the link was always wrong.');
  process.exit(1);
}

console.log(`check-doc-links: ${checked} in-site links, all resolve.`);
