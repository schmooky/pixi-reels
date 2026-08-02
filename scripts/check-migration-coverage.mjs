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
 * Two checks run here:
 *
 *   1. RENAME TABLE. `config/v1Renames.ts` is the single source of truth for
 *      the v1 -> v2 renames the engine throws on. Every one of them -- the v1
 *      name a user greps for AND the v2 name they land on -- has to be written
 *      down in the guide. This is the check that used to be a no-op: the name
 *      extractor demanded an initial uppercase letter and every entry in the
 *      table is lowercase-initial, so not one of the renames was ever looked
 *      at.
 *
 *   2. MAJOR CHANGESETS. A name a `major` changeset leans on that no longer
 *      exists in `src` is precisely the thing a consumer imports, cannot
 *      build against any more, and will search the guide for. It must appear
 *      in a section of the guide.
 *
 * What it does NOT catch: a name mentioned only in passing. If the guide says
 * "unlike the old `HorizontalReel`" somewhere unrelated, this passes.
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
const SRC = join(ROOT, 'packages/pixi-reels/src');
const RENAMES = join(SRC, 'config/v1Renames.ts');

/** Identifiers too generic to prove anything by their presence. */
const NOISE = new Set([
  'Add', 'Fix', 'Change', 'Remove', 'Rename', 'The', 'This', 'It', 'So', 'A', 'An',
  'ReelSet', 'ReelSetBuilder', 'ReelSymbol', 'PixiJS', 'TypeScript', 'ADR', 'API',
  'MultiWays', 'Both', 'Every', 'No', 'One', 'Use', 'You', 'Your', 'When', 'If',
]);

/**
 * The guide from its first `##` down. The frontmatter summarises the whole
 * migration ("Rows became cells, above/below became start/end"), so matching
 * against it would let a one-line description stand in for the sections that
 * actually tell a user what to type.
 */
const guideFile = await readFile(GUIDE, 'utf8');
const firstSection = guideFile.indexOf('\n## ');
if (firstSection === -1) {
  console.error(`check-migration-coverage: ${GUIDE} has no '## ' sections to land in.`);
  process.exit(1);
}
const guide = guideFile.slice(firstSection);

/** Whole word, case-sensitive: `top` must not be satisfied by `topToBottom`. */
const named = (name, text) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);

// ---------------------------------------------------------------------------
// 1. The v1 -> v2 rename table
// ---------------------------------------------------------------------------

/** Extract one exported object literal, brace-matched so nesting is safe. */
function table(src, name, grouped) {
  const start = src.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`check-migration-coverage: ${name} not found in ${RENAMES}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}' && --depth === 0) break;
  }
  const body = src.slice(open + 1, end);
  const pairs = (text) =>
    [...text.matchAll(/'?([A-Za-z_$][\w$]*)'?\s*:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]);
  if (!grouped) return pairs(body);
  const out = [];
  for (const m of body.matchAll(/'([^']+)'\s*:\s*\{([^}]*)\}/g)) out.push(...pairs(m[2]));
  return out;
}

const renamesSrc = await readFile(RENAMES, 'utf8');
const renames = [
  ...table(renamesSrc, 'V1_BUILDER_METHODS', false),
  ...table(renamesSrc, 'V1_OPTION_KEYS', true),
  ...table(renamesSrc, 'V1_OPTION_VALUES', true),
];
if (renames.length === 0) throw new Error('check-migration-coverage: parsed 0 renames');

const undocumented = [];
for (const [v1, v2] of renames) {
  // Both halves matter. The v1 name is what a user greps for after a throw;
  // the v2 name is the only thing that tells them what to type instead.
  const gaps = [];
  if (!named(v1, guide)) gaps.push(`the old name '${v1}'`);
  if (!named(v2, guide)) gaps.push(`the new name '${v2}'`);
  if (gaps.length > 0) undocumented.push(`${v1} -> ${v2}: the guide never names ${gaps.join(' or ')}`);
}

// ---------------------------------------------------------------------------
// 2. Major changesets
// ---------------------------------------------------------------------------

/**
 * Library source as a consumer sees it, for the question "does this name
 * still exist?".
 *
 * Three things are stripped, because each of them keeps a DELETED v1 name
 * alive in the source text and so hid the very changesets this check exists
 * for:
 *   - `config/v1Renames.ts`, which lists every v1 name by definition;
 *   - the `: never` builder stubs, whose only job is to throw the rename
 *     message (`visibleRows`, `visibleRowsPerReel`, `reelPixelHeights`);
 *   - comments, including those stubs' `@deprecated` JSDoc.
 */
async function readSrc(dir) {
  let out = '';
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (full === RENAMES) continue;
    if (e.isDirectory()) out += await readSrc(full);
    else if (e.name.endsWith('.ts')) out += await readFile(full, 'utf8');
  }
  return out;
}
const source = (await readSrc(SRC))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
  .replace(/[A-Za-z_$][\w$]*\s*\([^)]*\)\s*:\s*never\s*\{[\s\S]*?\n {2}\}/g, '');

const files = (await readdir(CHANGESETS)).filter((f) => f.endsWith('.md') && f !== 'README.md');
const gaps = [];

for (const file of files) {
  const src = await readFile(join(CHANGESETS, file), 'utf8');
  if (!/["']pixi-reels["']\s*:\s*major/.test(src)) continue;

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
  //
  // Backticks are NOT required: the changeset that motivated this guard
  // ("Remove: the standalone HorizontalReel / HorizontalReelBuilder subtree")
  // has none, so an earlier version extracted nothing and skipped it.
  // Match a CamelCase hump or SCREAMING_SNAKE instead, which picks out type
  // names without dragging in ordinary capitalised prose. The underscore is
  // required on the SCREAMING branch: changesets shout for emphasis ("cell
  // WIDTH", "the CROSS gap") and those are words, not identifiers.
  const mentioned = new Set(
    [...body.matchAll(/\b([A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g)]
      .map((m) => m[1])
      .filter((n) => !NOISE.has(n)),
  );

  const removed = [...mentioned].filter((n) => !named(n, source));
  if (removed.length === 0) continue;

  const missing = removed.filter((n) => !named(n, guide));
  if (missing.length > 0) {
    gaps.push(`${file}\n      removes ${missing.join(', ')}, and the guide never names ${missing.length > 1 ? 'them' : 'it'}`);
  }
}

// ---------------------------------------------------------------------------

if (undocumented.length > 0) {
  console.error(`check-migration-coverage: ${undocumented.length} rename(s) missing from the guide:\n`);
  for (const u of undocumented) console.error(`  ${u}`);
  console.error(`\nThe engine throws on these names. ${GUIDE.replace(`${ROOT}/`, '')} is where the message sends the user.`);
}
if (gaps.length > 0) {
  console.error(`check-migration-coverage: ${gaps.length} breaking change(s) with no migration path:\n`);
  for (const g of gaps) console.error(`  ${g}`);
  console.error('\nA major changeset without a guide section leaves the user a stack trace.');
}
if (undocumented.length > 0 || gaps.length > 0) process.exit(1);

console.log(
  `check-migration-coverage: all ${renames.length} v1 renames documented, every major changeset covered by the migration guide.`,
);
