export type RecipeGroup = 'starters' | 'mechanics' | 'tension' | 'rendering';

export interface RecipeMeta {
  slug: string;
  group: RecipeGroup;
  title: string;
  oneLiner: string;
  tags: string[];
  /**
   * Card preview, OPTIONAL. By convention you don't set this: drop a file at
   * `public/recipes/<slug>/card.<ext>` (gif / webp / png / mp4 ...) and it is
   * picked up automatically. With no file the card renders a generated
   * placeholder from the title. Set this only to point at a non-conventional
   * path. See the "Recipe previews" guide and `lib/recipeMedia.ts`.
   */
  image?: string;
}

/** Display order + label for each group on the /recipes/ index page. */
export const RECIPE_GROUPS: Array<{ id: RecipeGroup; label: string; description: string }> = [
  {
    id: 'starters',
    label: 'Start here',
    description: 'Copy-paste templates to clone for a new slot.',
  },
  {
    id: 'mechanics',
    label: 'Core mechanics',
    description: 'Hold & Win, big symbols and non-uniform grids, cascades, wilds and pins, nudge.',
  },
  {
    id: 'tension',
    label: 'Feel & tension',
    description: 'Anticipation, near-miss, and the slow build before a land.',
  },
  {
    id: 'rendering',
    label: 'Symbols & presentation',
    description: 'Symbol authoring, layering, motion blur, cell coordinates, paylines and banners.',
  },
];

/**
 * Every recipe card on /recipes/ is derived from the Keystatic-managed recipe
 * collection (src/content/recipes/<slug>.mdx). Edit recipe metadata at
 * /keystatic; this module reads each file's frontmatter synchronously at load
 * so the /recipes index and OG/sitemap consumers keep the same `RECIPES` shape.
 * Cards sort by group (RECIPE_GROUPS order) then by the per-recipe `order` field.
 */
import { parse } from 'yaml';

// Vite inlines each recipe's raw MDX at build time; we only parse the
// frontmatter block. Works identically in `astro dev` and the static build.
const recipeFiles = import.meta.glob<string>('./recipes/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const GROUP_RANK = new Map(RECIPE_GROUPS.map((g, i) => [g.id, i]));

interface RecipeFrontmatter {
  title: string;
  group: RecipeGroup;
  oneLiner: string;
  order?: number;
  tags?: string[];
  image?: string;
}

function readFrontmatter(path: string, raw: string): RecipeFrontmatter {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error(`Recipe ${path} has no frontmatter`);
  return parse(m[1]) as RecipeFrontmatter;
}

export const RECIPES: RecipeMeta[] = Object.entries(recipeFiles)
  .map(([path, raw]) => {
    const fm = readFrontmatter(path, raw);
    const meta: RecipeMeta = {
      slug: path.replace(/^.*\//, '').replace(/\.mdx$/, ''),
      group: fm.group,
      title: fm.title,
      oneLiner: fm.oneLiner,
      tags: fm.tags ?? [],
    };
    if (fm.image) meta.image = fm.image;
    return { meta, order: fm.order ?? 0 };
  })
  .sort((a, b) => {
    const g = (GROUP_RANK.get(a.meta.group) ?? 99) - (GROUP_RANK.get(b.meta.group) ?? 99);
    return g !== 0 ? g : a.order - b.order;
  })
  .map((r) => r.meta);
