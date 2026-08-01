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

const files = await walk(CONTENT, ['.mdx', '.md']);
const broken = [];
let checked = 0;

for (const file of files) {
  const src = await readFile(file, 'utf8');
  const where = file.slice(ROOT.length + 1);
  // In-site links: an absolute path, a bare `#anchor` on this same page, or
  // either with a fragment. External URLs and mailto: are not our problem.
  for (const m of src.matchAll(/\]\((\/[^)\s#?]*)?(?:#([^)\s?]+))?(?:\?[^)]*)?\)/g)) {
    const [, path, anchor] = m;
    if (!path && !anchor) continue;
    checked++;

    // A bare `#anchor` points at the page it is written on.
    const target = path ?? `/${where.replace(/^apps\/site\/src\/content\//, '').replace(/\.mdx?$/, '')}/`;
    const built = await resolves(target);
    if (!built) {
      broken.push(`${where}  ->  ${path ?? target}`);
      continue;
    }
    if (anchor && !(await idsOf(built)).has(anchor)) {
      broken.push(`${where}  ->  ${path ?? ''}#${anchor}  (page exists, no such id)`);
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
