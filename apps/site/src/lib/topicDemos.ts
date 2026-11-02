/**
 * Which live demos a topic page shows, read from the demos body at
 * `src/content/recipes/<slug>.mdx`: every `<RecipeDemo code="..." />` marker
 * with the hand-placed `<a id>` anchor and `##` heading above it.
 *
 * TODO(recipe-modules): switch to `RECIPE_META` from `src/lib/recipeMeta.ts`
 * once every `src/recipes/*.recipe.ts` exports `meta = { title, topic, tags,
 * height?, needs? }`. From it this shim needs, per code: `topic` (which page
 * the demo belongs to), `title` (the heading to list it under) and `height`;
 * the anchor is the demo's own code, as the redirects already assume.
 */

export interface TopicDemo {
  /** The `.recipe.ts` basename; also the demo's anchor on the page. */
  code: string;
  /** Canvas height in px (RecipeDemo's default is 300). */
  height: number;
  /** The `<a id>` placed before the demo's heading, when there is one. */
  anchor: string | null;
  /** Text of the `##` heading the demo sits under. */
  heading: string;
}

const demoFiles = import.meta.glob<string>('../content/recipes/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const DEMO_TAG = /<RecipeDemo\s+([^>]*?)\/?>/g;

/** Every `<RecipeDemo>` in a body, in page order, with its anchor and heading. */
export function parseRecipeDemos(body: string): TopicDemo[] {
  const out: TopicDemo[] = [];
  let anchor: string | null = null;
  let heading = '';
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const a = line.match(/^<a id="([^"]+)"><\/a>\s*$/);
    if (a) { anchor = a[1]; continue; }
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { heading = h[1]; continue; }
    for (const m of line.matchAll(DEMO_TAG)) {
      const attrs = m[1];
      const code = attrs.match(/\bcode="([^"]+)"/)?.[1];
      if (!code) throw new Error(`RecipeDemo without a code attribute: ${m[0]}`);
      const height = Number(attrs.match(/\bheight=\{?(\d+)\}?/)?.[1] ?? 300);
      out.push({ code, height, anchor, heading });
    }
  }
  return out;
}

const byTopic: Record<string, TopicDemo[]> = {};
for (const [path, raw] of Object.entries(demoFiles)) {
  const slug = path.replace(/^.*\//, '').replace(/\.mdx$/, '');
  byTopic[slug] = parseRecipeDemos(raw.replace(/^---\n[\s\S]*?\n---\n?/, ''));
}

/** The demos on a topic's page, or a loud error for a topic without a demos body. */
export function getTopicDemos(slug: string): TopicDemo[] {
  const demos = byTopic[slug];
  if (!demos) {
    throw new Error(
      `Topic "${slug}" has no demos body. Expected src/content/recipes/${slug}.mdx. ` +
        `Known: ${Object.keys(byTopic).sort().join(', ')}`,
    );
  }
  return demos;
}
