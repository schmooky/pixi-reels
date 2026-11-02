#!/usr/bin/env node
/**
 * Guard: the three recipe runtimes evaluate recipes through one loader.
 *
 * `RecipeRunner`, `Studio` and `ShareViewer` all run recipe modules from
 * source. They used to inject a hand-written list of globals into a
 * `new AsyncFunction(...names, src)`, and the three lists drifted by 26
 * names, so "Open in Studio" died with `Can't find variable: ...` at run
 * time. Recipes are modules now: every name is an import, and
 * `lib/recipeModule.ts` holds the one table of modules an import resolves
 * to. This fails the build if a runtime goes back to evaluating source on
 * its own.
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

const LOADER_MODULE = 'apps/site/src/lib/recipeModule.ts';

const problems = [];

for (const rel of RUNTIMES) {
  const src = await readFile(resolve(ROOT, rel), 'utf8');

  // Match a CALL, not the substring.
  if (!/\brunRecipeModule\s*[<(]/.test(src)) {
    problems.push(
      `${rel}: does not call runRecipeModule(). Every recipe runtime must go ` +
      `through ${LOADER_MODULE} so the three cannot drift.`,
    );
  }

  // Evaluating source anywhere else means a second table of resolvable names.
  const handRolled = /new (?:Async)?Function\(/.exec(src);
  if (handRolled) {
    problems.push(
      `${rel}: evaluates recipe source itself (found \`${handRolled[0]}\`). ` +
      `Resolve the import in ${LOADER_MODULE} instead.`,
    );
  }
  if (/sucraseTransform|from 'sucrase'/.test(src)) {
    problems.push(`${rel}: compiles recipe source itself. ${LOADER_MODULE} does that.`);
  }
}

// Every bundled spine loader must be reachable through the registry, or a
// surface that iterates SPINE_SETS silently offers fewer sets than exist.
const registry = await readFile(resolve(ROOT, 'packages/kit/src/spineSets.ts'), 'utf8');
const LOADERS = {
  'generatedSpineLoader.ts': 'loadGeneratedSpines',
  'thunderkickSpineLoader.ts': 'loadThunderkickSpines',
  'cascadeSpineLoader.ts': 'loadCascadeSpines',
};
for (const [file, loader] of Object.entries(LOADERS)) {
  if (!registry.includes(loader)) {
    problems.push(
      `packages/kit/src/spineSets.ts: does not register ${loader} from ${file}. ` +
      `Every bundled spine set belongs in SPINE_SETS so all surfaces get it.`,
    );
  }
}

if (problems.length > 0) {
  console.error('check-recipe-globals failed:\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(`check-recipe-globals: ${RUNTIMES.length} runtimes share one module loader.`);
