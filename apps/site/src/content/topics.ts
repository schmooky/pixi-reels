export type TopicGroup = 'lines' | 'cascade' | 'hold-and-win' | 'ways' | 'symbols' | 'wins' | 'layout';

/**
 * One mechanic, one page: `/mechanics/<slug>/`. Read from the frontmatter of
 * `src/content/topics/<slug>.mdx` (the Concept prose); the matching
 * `src/content/recipes/<slug>.mdx` holds the page's live demos.
 */
export interface TopicMeta {
  slug: string;
  group: TopicGroup;
  title: string;
  oneLiner: string;
  tags: string[];
  /** Guides merged into this topic's Concept section; their old URLs redirect here. */
  guides: string[];
  /**
   * Card preview, OPTIONAL. By convention you don't set this: drop a file at
   * `public/recipes/<slug>/card.<ext>` (gif / webp / png / mp4 ...) and it is
   * picked up automatically. With no file the card renders a generated
   * placeholder from the title. Set this only to point at a non-conventional
   * path. See the "Recipe previews" page under Learn and `lib/recipeMedia.ts`.
   */
  image?: string;
}

/** Display order + label for each group on the /mechanics/ index page. */
export const TOPIC_GROUPS: Array<{ id: TopicGroup; label: string; description: string }> = [
  { id: 'lines', label: 'Line slots', description: 'Reels that spin, tease and stop, and what lands on them.' },
  { id: 'cascade', label: 'Cascade games', description: 'Winning symbols fall away and the board refills.' },
  { id: 'hold-and-win', label: 'Hold & Win games', description: 'Coins lock and the free cells respin.' },
  { id: 'ways', label: 'Ways and MultiWays', description: 'Boards that change size from spin to spin.' },
  { id: 'symbols', label: 'Symbols', description: 'The classes that draw a symbol, at rest and while it spins.' },
  { id: 'wins', label: 'Wins and overlays', description: 'Paylines, highlights and art drawn over the board.' },
  { id: 'layout', label: 'Reel layout', description: 'Which way the reels run, how they bend and what frames them.' },
];

import { parse } from 'yaml';

// Vite inlines each topic's raw MDX at build time; only the frontmatter block
// is parsed. Works identically in `astro dev` and the static build.
const topicFiles = import.meta.glob<string>('./topics/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const GROUP_RANK = new Map(TOPIC_GROUPS.map((g, i) => [g.id, i]));

interface TopicFrontmatter {
  title: string;
  group: TopicGroup;
  oneLiner: string;
  order?: number;
  tags?: string[];
  guides?: string[];
  image?: string;
}

function readFrontmatter(path: string, raw: string): TopicFrontmatter {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error(`Topic ${path} has no frontmatter`);
  return parse(m[1]) as TopicFrontmatter;
}

export const TOPICS: TopicMeta[] = Object.entries(topicFiles)
  .map(([path, raw]) => {
    const fm = readFrontmatter(path, raw);
    const meta: TopicMeta = {
      slug: path.replace(/^.*\//, '').replace(/\.mdx$/, ''),
      group: fm.group,
      title: fm.title,
      oneLiner: fm.oneLiner,
      tags: fm.tags ?? [],
      guides: fm.guides ?? [],
    };
    if (fm.image) meta.image = fm.image;
    return { meta, order: fm.order ?? 0 };
  })
  .sort((a, b) => {
    const g = (GROUP_RANK.get(a.meta.group) ?? 99) - (GROUP_RANK.get(b.meta.group) ?? 99);
    return g !== 0 ? g : a.order - b.order;
  })
  .map((r) => r.meta);

export const TOPIC_BY_SLUG: Record<string, TopicMeta> = Object.fromEntries(
  TOPICS.map((t) => [t.slug, t]),
);
