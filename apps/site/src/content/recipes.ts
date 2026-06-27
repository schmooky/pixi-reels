export type RecipeGroup =
  | 'basics'        // beginner building blocks. the smallest pieces explained
  | 'starters'
  | 'pyramid'       // static per-reel shape
  | 'multiways'     // per-spin row variation
  | 'big-symbols'   // N×M block symbols
  | 'wilds'         // sticky/expanding/walking/multiplier wilds
  | 'features'      // bonus reveals, multipliers, coins, transforms
  | 'cascade'       // cascade physics + tumbling
  | 'wins'          // payline & cell-highlight presentation
  | 'tension'       // anticipation, near-miss, skip, respin
  | 'cell-coords'   // cell bounds, hit areas, overlays
  | 'symbol-formats' // texture atlas, animated, AI-generated
  | 'runtime';      // mode swaps, feature middleware

export interface RecipeMeta {
  slug: string;
  group: RecipeGroup;
  title: string;
  oneLiner: string;
  steps: string[];
  apis: string[];
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
    id: 'basics',
    label: 'Building blocks (start here)',
    description: 'The smallest pieces, explained step by step. how a symbol class works, how a coin carries a value.',
  },
  {
    id: 'starters',
    label: 'Starter templates',
    description: 'Copy-paste foundations to clone for a new slot.',
  },
  {
    id: 'pyramid',
    label: 'Per-reel geometry (pyramid layouts)',
    description: 'Static jagged shapes. non-uniform row counts fixed at build time.',
  },
  {
    id: 'multiways',
    label: 'MultiWays',
    description: 'Per-spin row variation. each reel can land on a different row count between minRows and maxRows.',
  },
  {
    id: 'big-symbols',
    label: 'Big symbols (N×M blocks)',
    description: 'Single symbol that occupies an N×M block of cells. 2×2 bonuses, 3×3 giants, 1×3 bars.',
  },
  {
    id: 'wilds',
    label: 'Wilds & sticky cells',
    description: 'Sticky, expanding, walking, multiplier wilds. all powered by the pin primitive.',
  },
  {
    id: 'features',
    label: 'Features, bonuses & transforms',
    description: 'Mystery reveals, value coins, collectors, symbol upgrades.',
  },
  {
    id: 'cascade',
    label: 'Cascade & tumbling',
    description: 'Drop physics, anticipation drops, removing winners.',
  },
  {
    id: 'wins',
    label: 'Wins & paylines',
    description: 'Highlight winning cells; draw your own paylines from events.',
  },
  {
    id: 'tension',
    label: 'Anticipation, skip & respin',
    description: 'Slow a reel, slam-stop, near-miss, single-reel respin.',
  },
  {
    id: 'cell-coords',
    label: 'Cell coordinates & hit areas',
    description: 'Pixel rects per cell; pointer-aligned overlays.',
  },
  {
    id: 'symbol-formats',
    label: 'Symbol authoring',
    description: 'Texture atlases, animated sprite sequences, AI-generated art.',
  },
  {
    id: 'runtime',
    label: 'Runtime & feature modes',
    description: 'Mid-spin mode swaps, frame middleware.',
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
  steps?: string[];
  apis?: string[];
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
      steps: fm.steps ?? [],
      apis: fm.apis ?? [],
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
