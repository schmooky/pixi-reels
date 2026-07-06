#!/usr/bin/env node
// Mirror every emitted `.d.ts` to a sibling `.d.cts`.
//
// The package ships a dual ESM + CJS build. `vite-plugin-dts` only emits
// `.d.ts` (ESM-flavoured) declarations, so the `require` export condition would
// otherwise point at an ESM type file next to a CommonJS `.cjs` runtime file.
// TypeScript's `node16`/`nodenext` resolver flags that as a mismatch
// ("masquerading as ESM", see @arethetypeswrong/cli).
//
// The declaration bodies are format-agnostic and the emitted files reference
// siblings via `./x.js` specifiers, which resolve to `./x.d.cts` first inside a
// `.d.cts` module. So a byte-for-byte copy under the `.d.cts` extension is a
// correct CJS declaration for every module. We rewrite the sourcemap comment so
// it does not dangle.
//
// Zero-dependency on purpose. matches scripts/size-check.mjs house style.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error(`emit-cts-types: dist/ not found at ${distDir}. run the build first.`);
  process.exit(1);
}

/** Recursively collect every `*.d.ts` (skipping already-generated `*.d.cts`). */
function collect(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collect(full));
    } else if (entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = collect(distDir);
let written = 0;

for (const file of files) {
  const target = file.replace(/\.d\.ts$/, '.d.cts');
  const base = path.basename(file);
  let contents = fs.readFileSync(file, 'utf8');
  // Repoint the sourcemap comment at the `.d.ts.map` that actually exists.
  contents = contents.replace(
    /\/\/# sourceMappingURL=.*\.d\.ts\.map\s*$/m,
    `//# sourceMappingURL=${base}.map`,
  );
  fs.writeFileSync(target, contents);
  written++;
}

console.log(`emit-cts-types: wrote ${written} .d.cts file(s) alongside .d.ts`);
