/**
 * Slug-keyed registry of every recipe's raw `.recipe.ts` source.
 *
 * Recipe bodies used to import their demo source one file at a time
 * (`import code from '../recipes/<name>.recipe.ts?raw'`). That literal import
 * can't survive a CMS round-trip, so the body now carries only a `<RecipeDemo
 * code="<name>" />` marker and this registry resolves the name to its source at
 * render time. `<name>` is the `.recipe.ts` basename (defaults to the recipe
 * slug for single-demo pages).
 */
const modules = import.meta.glob('../recipes/*.recipe.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const byName: Record<string, string> = {};
for (const [path, source] of Object.entries(modules)) {
  const name = path.replace(/^.*\//, '').replace(/\.recipe\.ts$/, '');
  byName[name] = source;
}

export function getRecipeCode(name: string): string {
  const code = byName[name];
  if (code === undefined) {
    throw new Error(
      `No recipe source for "${name}". Expected src/recipes/${name}.recipe.ts. ` +
        `Known: ${Object.keys(byName).sort().join(', ')}`,
    );
  }
  return code;
}
