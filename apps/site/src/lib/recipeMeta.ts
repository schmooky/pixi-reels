/**
 * Every recipe's `meta`, keyed by slug, read from the modules at build time.
 *
 * The topic pages list their demos from this rather than from a hand-kept
 * table: a recipe's title, topic, tags, canvas height and asset needs live
 * in the one file that also runs.
 */
import type { RecipeMeta } from '@pixi-reels/kit';

const modules = import.meta.glob('../recipes/*.recipe.ts', {
  import: 'meta',
  eager: true,
}) as Record<string, RecipeMeta>;

export const RECIPE_META: Record<string, RecipeMeta> = {};
for (const [path, meta] of Object.entries(modules)) {
  const slug = path.replace(/^.*\//, '').replace(/\.recipe\.ts$/, '');
  RECIPE_META[slug] = meta;
}

/** The slugs under one umbrella page, in file order. */
export function recipesForTopic(topic: string): string[] {
  return Object.keys(RECIPE_META).filter((slug) => RECIPE_META[slug].topic === topic);
}
