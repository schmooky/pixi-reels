#!/usr/bin/env node
// Post-process the emitted declarations. Two jobs:
//
//  1. Rewrite relative import specifiers `./x.ts` -> `./x.js`.
//     Source files import the real filename (`./Reel.ts`); the JS build lets
//     Rollup rewrite those specifiers to `./Reel.js`, but `vite-plugin-dts`
//     does NOT honour `rewriteRelativeImportExtensions`, so the emitted `.d.ts`
//     would otherwise point at `.ts` files that don't exist in `dist/`.
//
//  2. Mirror every `.d.ts` to a sibling `.d.cts` for the `require` export
//     condition. The declaration bodies are format-agnostic and reference
//     siblings via `./x.js`, which resolves to `./x.d.cts` first inside a
//     `.d.cts` module, so a copy under the `.d.cts` extension is a correct CJS
//     declaration for every module.
//
// Zero-dependency on purpose. matches scripts/size-check.mjs house style.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error(`postbuild-types: dist/ not found at ${distDir}. run the build first.`);
  process.exit(1);
}

/** Recursively collect every `*.d.ts` (skipping already-generated `*.d.cts`). */
function collect(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

// Relative specifier ('./' or '../') ending in `.ts`, before its closing quote.
// Covers `from './x.ts'` and `import('./x.ts')`. Bare specifiers never match.
const TS_SPECIFIER = /(["'])(\.\.?\/[^"'\n]*?)\.ts(["'])/g;

const files = collect(distDir);
let rewritten = 0;
let written = 0;

for (const file of files) {
  let contents = fs.readFileSync(file, 'utf8');
  const fixed = contents.replace(TS_SPECIFIER, (_m, q1, spec, q2) => q1 + spec + '.js' + q2);
  if (fixed !== contents) {
    fs.writeFileSync(file, fixed);
    contents = fixed;
    rewritten++;
  }

  // Emit the CJS twin from the corrected declaration.
  const base = path.basename(file);
  const cts = contents.replace(
    /\/\/# sourceMappingURL=.*\.d\.ts\.map\s*$/m,
    `//# sourceMappingURL=${base}.map`,
  );
  fs.writeFileSync(file.replace(/\.d\.ts$/, '.d.cts'), cts);
  written++;
}

console.log(
  `postbuild-types: rewrote .ts->.js specifiers in ${rewritten} file(s), wrote ${written} .d.cts file(s)`,
);
