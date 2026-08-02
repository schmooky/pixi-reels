#!/usr/bin/env node
/**
 * Guard: no recipe or example may use a v1 name that the engine now rejects.
 *
 * The v2 rename left the builder throwing loudly at `build()` for every
 * renamed name. That is right for consumers, but recipe sources carry
 * `@ts-nocheck`, so nothing in the build catches a stale one. Eleven recipes
 * shipped passing `size: { w, h }` and every one threw the moment its demo
 * mounted -- green CI, dead page.
 *
 * The names come out of `config/v1Renames.ts`, so this cannot drift from
 * what the engine enforces. What each name looks like in source differs by
 * table, so the three tables are matched differently:
 *
 *   V1_BUILDER_METHODS  a call:            `.visibleRows(`
 *   V1_OPTION_KEYS      an object key:     `w:`
 *   V1_OPTION_VALUES    a string literal:  `'top'`
 *
 * Several names are single letters (`w`, `h`) or common words (`above`,
 * `top`, `down`). Recipes legitimately use those in their own objects
 * (`const TALL = { w: 1, h: 3 }`), so short names are only matched inside
 * the call or key that owns them. Anything else would cry wolf, and a guard
 * nobody trusts is worse than no guard.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENAMES = join(ROOT, 'packages/pixi-reels/src/config/v1Renames.ts');
const SCAN = ['apps/site/src/recipes', 'apps/site/src/components', 'apps/site/src/pages', 'apps/site/src/content', 'examples'];
const SKIP = new Set(['node_modules', 'dist', '.astro']);
const EXTS = ['.ts', '.tsx', '.mdx', '.md'];

/**
 * Files whose whole job is showing v1 names next to their v2 replacements.
 * Everything else that names a v1 key is either broken code or prose that
 * will send a reader into a throw.
 */
const ALLOWED = [/migrating-to-\d/];

/**
 * Where a grouped section's names may be looked for. Each regex must capture
 * the region that owns them. Sections absent here are matched anywhere,
 * which is only safe when every name in them stands alone.
 */
const SCOPES = {
  'symbolData() size': /\bsize\s*:\s*\{([^}]*)\}/g,
  'bufferSymbols()': /\bbufferSymbols\s*\(\s*\{([^}]*)\}/g,
  'reelAnchor()': /\breelAnchor\s*\(([^)]*)\)/g,
  'nudge() direction': /\bdirection\s*:\s*('[^']*')/g,
  'tumble() cellOrder': /\bcellOrder\s*:\s*('[^']*')/g,
};

/** Names at or below this length are ambiguous; refuse to match unscoped. */
const AMBIGUOUS_MAX_LEN = 6;

/** Pull one exported table out of the source. Returns [label, pairs][]. */
async function loadTable(src, name, grouped) {
  const start = src.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`check-v1-keys: ${name} not found in ${RENAMES}`);
  // Walk to the closing brace of the top-level object literal.
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}' && --depth === 0) break;
  }
  const body = src.slice(open + 1, end);

  if (!grouped) {
    const pairs = [...body.matchAll(/'?([A-Za-z_$][\w$]*)'?\s*:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]);
    return [['', pairs]];
  }
  const out = [];
  for (const m of body.matchAll(/'([^']+)'\s*:\s*\{([^}]*)\}/g)) {
    const pairs = [...m[2].matchAll(/'?([A-Za-z_$][\w$]*)'?\s*:\s*'([^']+)'/g)].map((p) => [p[1], p[2]]);
    if (pairs.length > 0) out.push([m[1], pairs]);
  }
  return out;
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // an optional scan root that is not there
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (EXTS.includes(extname(entry.name))) out.push(full);
  }
  return out;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

const src = await readFile(RENAMES, 'utf8');
const tables = [
  // kind decides what the name looks like at a call site.
  { kind: 'method', sections: await loadTable(src, 'V1_BUILDER_METHODS', false) },
  { kind: 'key', sections: await loadTable(src, 'V1_OPTION_KEYS', true) },
  { kind: 'value', sections: await loadTable(src, 'V1_OPTION_VALUES', true) },
];

const matcher = {
  method: (name) => new RegExp(`\\.${name}\\s*\\(`, 'g'),
  key: (name) => new RegExp(`(?:^|[{,\\s])'?${name}'?\\s*:`, 'g'),
  value: (name) => new RegExp(`'${name}'`, 'g'),
};

// A short name with no scope would spray false positives. Fail loudly rather
// than skip it silently, so adding one to v1Renames.ts forces a scope here.
for (const { kind, sections } of tables) {
  if (kind === 'method') continue; // a `.name(` call is unambiguous by shape
  for (const [label, pairs] of sections) {
    if (SCOPES[label]) continue;
    const short = pairs.filter(([o]) => o.length <= AMBIGUOUS_MAX_LEN);
    if (short.length > 0) {
      console.error(
        `check-v1-keys: section '${label}' has short name(s) ${short
          .map(([o]) => `'${o}'`)
          .join(', ')} but no entry in SCOPES. Add one, or they cannot be matched without false positives.`,
      );
      process.exit(1);
    }
  }
}

const files = (await Promise.all(SCAN.map((d) => walk(join(ROOT, d)))))
  .flat()
  .filter((f) => !ALLOWED.some((re) => re.test(f)));
const hits = [];
let watched = 0;

for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const { kind, sections } of tables) {
    for (const [label, pairs] of sections) {
      const scope = SCOPES[label];
      for (const [oldName, newName] of pairs) {
        const where = label ? `${label} ` : '';
        const note = `${where}'${oldName}' -> '${newName}'`;
        if (scope) {
          scope.lastIndex = 0;
          for (const m of text.matchAll(scope)) {
            if (matcher[kind](oldName).test(m[1])) {
              hits.push(`${file.slice(ROOT.length + 1)}:${lineOf(text, m.index)}  ${note}`);
            }
          }
        } else {
          for (const m of text.matchAll(matcher[kind](oldName))) {
            hits.push(`${file.slice(ROOT.length + 1)}:${lineOf(text, m.index)}  ${note}`);
          }
        }
      }
    }
  }
}

for (const { sections } of tables) for (const [, pairs] of sections) watched += pairs.length;

if (hits.length > 0) {
  console.error(`check-v1-keys: ${hits.length} v1 name(s) the engine throws on:\n`);
  for (const h of hits) console.error(`  ${h}`);
  console.error('\nThese pass typecheck (recipes are @ts-nocheck) and throw at build().');
  process.exit(1);
}

console.log(`check-v1-keys: ${files.length} files clean (${watched} renamed names watched).`);
