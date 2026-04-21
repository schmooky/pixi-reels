/**
 * Slug->code registry for every recipe module under src/recipeCode/.
 * Discovery is automatic via Vite's import.meta.glob with eager + default
 * loading, so dropping a new `<slug>.ts` file into src/recipeCode/ is
 * enough to make it available to both the recipe page and the sandbox.
 */

const modules = import.meta.glob('../recipeCode/*.ts', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const REGISTRY: Record<string, string> = {};
for (const [path, code] of Object.entries(modules)) {
  const match = path.match(/\/([^/]+)\.ts$/);
  if (match && typeof code === 'string') {
    REGISTRY[match[1]] = code;
  }
}

export function getRecipeCode(slug: string): string | null {
  return REGISTRY[slug] ?? null;
}

export function hasRecipeCode(slug: string): boolean {
  return slug in REGISTRY;
}

export function listRecipeSlugs(): string[] {
  return Object.keys(REGISTRY).sort();
}
