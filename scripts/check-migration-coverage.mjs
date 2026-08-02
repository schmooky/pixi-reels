#!/usr/bin/env node
/**
 * Guard: every breaking change has somewhere for a user to land.
 *
 * A `major` changeset says "your code stops working". If the migration guide
 * never names the thing that broke, the user's only clue is a stack trace.
 * Two shipped that way: the whole `HorizontalReel` subtree was deleted with
 * no guide section, and `MotionBlurOptions.axis` changed its default
 * silently.
 *
 * What it catches: a type that no longer exists in `src` and is named
 * nowhere in the guide. That is the case that actually happened.
 *
 * What it does NOT catch: a name mentioned only in passing. If the guide
 * says "unlike the old `HorizontalReel`" somewhere unrelated, this passes.
 * Deciding whether a mention constitutes a migration path needs judgement,
 * and a guard that guesses at that would cry wolf until nobody read it.
 * Treat a pass as "somebody wrote the name down", not "the docs are good".
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHANGESETS = join(ROOT, '.changeset');
const GUIDE = join(ROOT, 'apps/site/src/content/docs/migrating-to-2-0.mdx');

/** Identifiers too generic to prove anything by their presence. */
const NOISE = new Set([
  'Add', 'Fix', 'Change', 'Remove', 'Rename', 'The', 'This', 'It', 'So', 'A', 'An',
  'ReelSet', 'ReelSetBuilder', 'ReelSymbol', 'PixiJS', 'TypeScript', 'ADR', 'API',
  'MultiWays', 'Both', 'Every', 'No', 'One', 'Use', 'You', 'Your', 'When', 'If',
]);

const guide = await readFile(GUIDE, 'utf8');

/** Every library source file concatenated, to ask "does this name still exist?". */
async function readSrc(dir) {
  let out = '';
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out += await readSrc(full);
    else if (e.name.endsWith('.ts')) out += await readFile(full, 'utf8');
  }
  return out;
}
const source = await readSrc(join(ROOT, 'packages/pixi-reels/src'));
const files = (await readdir(CHANGESETS)).filter((f) => f.endsWith('.md') && f !== 'README.md');

const gaps = [];

for (const file of files) {
  const src = await readFile(join(CHANGESETS, file), 'utf8');
  if (!/["']pixi-reels["']\s*:\s*major/.test(src)) continue;

  // Identifiers the changeset leans on: `backticked` CamelCase or camelCase()
  // names. Those are what a migrating user would search the guide for.
  const body = src.replace(/^---[\s\S]*?---/, '');
  // Names the changeset mentions that NO LONGER EXIST in src. That is the
  // precise shape of the failure: something a consumer imports was deleted,
  // so their build breaks and they search the guide for the name.
  //
  // Two looser rules were tried and thrown out. "Any one name appears" let a
  // whole deleted subtree lose its section, because an unrelated word in the
  // same changeset still matched. "Every type-shaped name appears" flagged
  // five changesets for mentioning things like `FrameBuilder` that are alive
  // and need no migration at all. Keying on absence-from-source needs no
  // judgement call and cannot drift.
  // Backticks are NOT required: the changeset that motivated this guard
  // ("Remove: the standalone HorizontalReel / HorizontalReelBuilder subtree")
  // has none, so an earlier version extracted nothing and skipped it.
  // Match a CamelCase hump or SCREAMING_CASE instead, which picks out type
  // names without dragging in ordinary capitalised prose.
  const named = new Set(
    [...body.matchAll(/\b([A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+|[A-Z][A-Z0-9_]{3,})\b/g)]
      .map((m) => m[1])
      .filter((n) => !NOISE.has(n)),
  );

  const removed = [...named].filter((n) => !new RegExp(`\\b${n}\\b`).test(source));
  if (removed.length === 0) continue;

  const missing = removed.filter((n) => !new RegExp(`\\b${n}`, 'i').test(guide));
  if (missing.length > 0) {
    gaps.push(`${file}\n      removes ${missing.join(', ')}, and the guide never names ${missing.length > 1 ? 'them' : 'it'}`);
  }
}

if (gaps.length > 0) {
  console.error(`check-migration-coverage: ${gaps.length} breaking change(s) with no migration path:\n`);
  for (const g of gaps) console.error(`  ${g}`);
  console.error('\nA major changeset without a guide section leaves the user a stack trace.');
  process.exit(1);
}

console.log(`check-migration-coverage: every major changeset is covered by the migration guide.`);
