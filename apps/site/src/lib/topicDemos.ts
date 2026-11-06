/**
 * Which live demos a topic page shows, read from the recipes' own `meta`
 * (`src/lib/recipeMeta.ts`): every `src/recipes/*.recipe.ts` whose
 * `meta.topic` is the page's slug. The demos body at
 * `src/content/recipes/<slug>.mdx` decides where on the page each one sits,
 * and may borrow a demo filed under another topic.
 */
import { RECIPE_META, recipesForTopic } from './recipeMeta.ts';

export interface TopicDemo {
  /** The `.recipe.ts` basename; also the demo's anchor on the page. */
  code: string;
  /** Canvas height in px (RecipeDemo's default is 300). */
  height: number;
  /** The recipe's own title, from its `meta`. */
  title: string;
}

/**
 * The demos on a topic's page: every recipe filed under the slug by its
 * `meta.topic`, then any the page's bodies render on loan from another topic
 * (the starters page shows the cascade and Hold & Win openers). A recipe
 * filed here that no body renders is a broken page, so fail the build and
 * name it; a topic with no recipes at all is the same.
 */
export function getTopicDemos(slug: string, bodies: string[]): TopicDemo[] {
  const filed = recipesForTopic(slug);
  if (!filed.length) {
    const known = [...new Set(Object.values(RECIPE_META).map((m) => m.topic))].sort();
    throw new Error(`Topic "${slug}" has no recipe with meta.topic === "${slug}". Known topics: ${known.join(', ')}`);
  }
  const rendered = bodies.flatMap(parseRecipeDemoCodes);
  const unrendered = filed.filter((c) => !rendered.includes(c));
  if (unrendered.length) {
    throw new Error(`Topic "${slug}" files ${unrendered.join(', ')} under it (meta.topic) but no body renders them.`);
  }
  const unknown = rendered.filter((c) => !RECIPE_META[c]);
  if (unknown.length) throw new Error(`Topic "${slug}" renders ${unknown.join(', ')}, which is no src/recipes/*.recipe.ts.`);
  const codes = [...filed, ...rendered.filter((c) => !filed.includes(c))];
  return [...new Set(codes)].map((code) => ({
    code,
    height: RECIPE_META[code].height ?? 300,
    title: RECIPE_META[code].title,
  }));
}

const DEMO_TAG = /<RecipeDemo\s+([^>]*?)\/?>/g;

/** Every `<RecipeDemo code>` in an MDX body, in page order, fenced code skipped. */
export function parseRecipeDemoCodes(body: string): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    for (const m of line.matchAll(DEMO_TAG)) {
      const code = m[1].match(/\bcode="([^"]+)"/)?.[1];
      if (!code) throw new Error(`RecipeDemo without a code attribute: ${m[0]}`);
      out.push(code);
    }
  }
  return out;
}
