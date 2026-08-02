#!/usr/bin/env node
/**
 * Guard: the three recipe runtimes must share one global surface.
 *
 * `RecipeRunner`, `Studio` and `ShareViewer` all evaluate recipe-shaped code.
 * Each used to build its own `new AsyncFunction(...names, src)` with a
 * hand-written parameter list and a comment asking the next person to keep
 * all three in lock-step. They drifted by 26 names, so "Open in Studio" on a
 * hold-and-win, static-spin, anticipation or thunderkick/cascade spine recipe
 * died with `Can't find variable: ...` - at run time, because recipe bodies
 * are `@ts-nocheck` strings that no compiler ever reads.
 *
 * They now all call `runRecipeSource` from `lib/recipeGlobals.ts`. This fails
 * the build if any of them goes back to rolling its own list.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const RUNTIMES = [
  'apps/site/src/components/RecipeRunner.tsx',
  'apps/site/src/components/Studio.tsx',
  'apps/site/src/components/ShareViewer.tsx',
];

const GLOBALS_MODULE = 'apps/site/src/lib/recipeGlobals.ts';

const problems = [];

for (const rel of RUNTIMES) {
  const src = await readFile(resolve(ROOT, rel), 'utf8');

  // Match a CALL, not the substring: `runRecipeSourceX(...)` contains
  // `runRecipeSource` and would sail through an includes() check.
  if (!/\brunRecipeSource\s*[<(]/.test(src)) {
    problems.push(
      `${rel}: does not use runRecipeSource(). Every recipe runtime must go ` +
      `through ${GLOBALS_MODULE} so the three cannot drift.`,
    );
    continue;
  }

  // A `new AsyncFunction(` with more than the source argument means someone
  // re-introduced a hand-written parameter list.
  const handRolled = /new AsyncFunction\(\s*['"]/.exec(src);
  if (handRolled) {
    problems.push(
      `${rel}: builds its own AsyncFunction parameter list (found ` +
      `\`${handRolled[0].trim()}\`). Add the value to ${GLOBALS_MODULE} instead.`,
    );
  }
}

// Every bundled spine loader must be reachable through the registry, or a
// surface that iterates SPINE_SETS silently offers fewer sets than exist.
const registry = await readFile(resolve(ROOT, 'apps/site/src/runtime/spineSets.ts'), 'utf8');
const LOADERS = {
  'generatedSpineLoader.ts': 'loadGeneratedSpines',
  'thunderkickSpineLoader.ts': 'loadThunderkickSpines',
  'cascadeSpineLoader.ts': 'loadCascadeSpines',
};
for (const [file, loader] of Object.entries(LOADERS)) {
  if (!registry.includes(loader)) {
    problems.push(
      `apps/site/src/runtime/spineSets.ts: does not register ${loader} from ${file}. ` +
      `Every bundled spine set belongs in SPINE_SETS so all surfaces get it.`,
    );
  }
}

if (problems.length > 0) {
  console.error('check-recipe-globals failed:\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(`check-recipe-globals: ${RUNTIMES.length} runtimes share one global surface.`);
