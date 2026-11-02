#!/usr/bin/env node
/**
 * Guard: every recipe module must parse as the runtimes will actually run it.
 *
 * The site build only bundles recipe sources as text, so a recipe can ship
 * with an early error that nothing reports until a reader opens the page.
 * Three once shipped with `(reel, reel)` -- a duplicate parameter, legal in
 * sloppy mode and a SyntaxError in strict. The loader wraps every recipe in
 * `"use strict"`, so all three were dead.
 *
 * This does what `lib/recipeModule.ts` does -- strip the types, turn the
 * imports into `require` calls, wrap in a strict function -- and reports
 * anything that will not parse, plus any import the loader cannot resolve.
 * It builds the function without calling it, so no recipe code executes.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECIPES = join(ROOT, 'apps/site/src/recipes');

const require = createRequire(join(ROOT, 'apps/site/package.json'));
let sucrase;
try {
  sucrase = require('sucrase');
} catch {
  console.log('check-recipe-syntax: sucrase not installed, skipping.');
  process.exit(0);
}

const LOADER = join(ROOT, 'apps/site/src/lib/recipeModule.ts');
const loaderSrc = await readFile(LOADER, 'utf8');
// The specifiers `recipeModule.ts` resolves: every key of its MODULES table.
const RESOLVABLE = new Set([...loaderSrc.matchAll(/^\s+'?([@\w./-]+)'?: \(\) => import\(/gm)].map((m) => m[1]));
if (RESOLVABLE.size === 0) {
  console.error(`check-recipe-syntax: found no module table in ${LOADER}.`);
  process.exit(1);
}

const files = (await readdir(RECIPES)).filter((f) => extname(f) === '.ts').sort();
const broken = [];

for (const file of files) {
  const src = await readFile(join(RECIPES, file), 'utf8');
  let js;
  try {
    js = sucrase.transform(src, { transforms: ['typescript', 'imports'] }).code;
  } catch (e) {
    broken.push(`${file}  TypeScript strip failed: ${e.message}`);
    continue;
  }
  try {
    // Same shape as evaluateRecipeModule: a strict CommonJS body. Constructing
    // it parses the body; it is never called.
    new Function('require', 'exports', 'module', `"use strict";\n${js}`);
  } catch (e) {
    broken.push(`${file}  ${e.name}: ${e.message}`);
    continue;
  }
  for (const m of js.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)) {
    if (!RESOLVABLE.has(m[2])) broken.push(`${file}  imports '${m[2]}', which lib/recipeModule.ts does not resolve`);
  }
}

if (broken.length > 0) {
  console.error(`check-recipe-syntax: ${broken.length} recipe(s) will not parse:\n`);
  for (const b of broken) console.error(`  ${b}`);
  console.error('\nThe site build only bundles recipe sources as text, so nothing else reports these.');
  process.exit(1);
}

console.log(`check-recipe-syntax: ${files.length} recipe modules parse under "use strict" and import only resolvable modules.`);
