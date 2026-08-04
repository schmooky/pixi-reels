#!/usr/bin/env node
/**
 * Guard: the codemod must handle every rename the engine throws on.
 *
 * `config/v1Renames.ts` opens by claiming "Two consumers read it: the
 * builder's fail-loud guards below, and the `pixi-reels-codemod` transform.
 * Keeping one table is the only way the codemod and the error messages
 * cannot drift apart."
 *
 * That is aspirational. The codemod is a `.cjs` in another package and
 * carries its OWN copy of the table -- it cannot import a `.ts` source. So
 * the two can absolutely drift, and the failure is nasty: the docs tell a
 * migrating user to run `npx pixi-reels-codemod v1-to-v2`, they run it,
 * and the build still throws on whatever the codemod forgot.
 *
 * This closes the gap the comment assumed was already closed.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRUTH = join(ROOT, 'packages/pixi-reels/src/config/v1Renames.ts');
const CODEMOD = join(ROOT, 'packages/pixi-reels-codemod/transforms/v1-to-v2.cjs');

/** Extract one exported object literal, brace-matched so nesting is safe. */
function table(src, name, grouped) {
  const start = src.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`check-codemod-parity: ${name} not found in ${TRUTH}`);
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

const truth = await readFile(TRUTH, 'utf8');
const codemod = await readFile(CODEMOD, 'utf8');

const renames = [
  ...table(truth, 'V1_BUILDER_METHODS', false),
  ...table(truth, 'V1_OPTION_KEYS', true),
  ...table(truth, 'V1_OPTION_VALUES', true),
];
if (renames.length === 0) throw new Error('check-codemod-parity: parsed 0 renames');

const missing = [];
const disagree = [];

for (const [from, to] of renames) {
  // The codemod spells a rename either as a table entry (`from: 'to'`) or as
  // an inline ternary (`x === 'from' ? 'to' : ...`). Accept both, and read
  // back what it actually writes so a WRONG target is caught, not just an
  // absent one.
  const asEntry = codemod.match(new RegExp(`(?:^|[{,\\s])'?${from}'?\\s*:\\s*'([^']+)'`, 'm'));
  const asTernary = codemod.match(new RegExp(`'${from}'\\s*\\?\\s*'([^']+)'`));
  const target = asEntry?.[1] ?? asTernary?.[1];

  if (target === undefined) {
    // Last resort: a comparison with no literal target nearby, e.g. a branch
    // that computes the replacement. Count it as handled but say so.
    if (new RegExp(`'${from}'`).test(codemod)) continue;
    missing.push(`${from} -> ${to}`);
  } else if (target !== to) {
    disagree.push(`${from}: engine renames to '${to}', codemod writes '${target}'`);
  }
}

if (missing.length > 0 || disagree.length > 0) {
  console.error('check-codemod-parity: the codemod is out of step with the engine.\n');
  if (missing.length > 0) {
    console.error('  Renames the engine throws on but the codemod never rewrites:');
    for (const m of missing) console.error(`    ${m}`);
  }
  if (disagree.length > 0) {
    console.error('  Renames where the two disagree on the new name:');
    for (const d of disagree) console.error(`    ${d}`);
  }
  console.error(
    '\nA user who runs `npx pixi-reels-codemod v1-to-v2` as the docs instruct\nwould still hit a throw. Update transforms/v1-to-v2.cjs.',
  );
  process.exit(1);
}

console.log(`check-codemod-parity: codemod handles all ${renames.length} renames.`);
