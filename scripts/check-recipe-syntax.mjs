#!/usr/bin/env node
/**
 * Guard: every recipe source must parse as the runner will actually run it.
 *
 * Recipes carry `@ts-nocheck`, and the site build only bundles them as text,
 * so a recipe can ship with an early error that nothing reports until a
 * reader opens the page. Three shipped with `(reel, reel)` -- a duplicate
 * parameter, which is legal in sloppy mode and a SyntaxError in strict.
 * The runner wraps every recipe in `"use strict"`, so all three were dead:
 * "Duplicate parameter name not allowed in this context".
 *
 * This does what `runRecipeSource` does -- strip the types, wrap in a strict
 * AsyncFunction -- and reports anything that will not parse. It builds the
 * function without calling it, so no recipe code executes here.
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

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const files = (await readdir(RECIPES)).filter((f) => extname(f) === '.ts').sort();
const broken = [];

for (const file of files) {
  const src = await readFile(join(RECIPES, file), 'utf8');
  let js;
  try {
    js = sucrase.transform(src, { transforms: ['typescript'] }).code;
  } catch (e) {
    broken.push(`${file}  TypeScript strip failed: ${e.message}`);
    continue;
  }
  try {
    // Same shape as runRecipeSource: strict body, injected globals as params.
    // Constructing it parses the body; it is never called.
    new AsyncFunction('__globals', `"use strict"; ${js}`);
  } catch (e) {
    broken.push(`${file}  ${e.name}: ${e.message}`);
  }
}

if (broken.length > 0) {
  console.error(`check-recipe-syntax: ${broken.length} recipe(s) will not parse:\n`);
  for (const b of broken) console.error(`  ${b}`);
  console.error('\nRecipes are @ts-nocheck, so nothing else reports these.');
  process.exit(1);
}

console.log(`check-recipe-syntax: ${files.length} recipes parse under "use strict".`);
