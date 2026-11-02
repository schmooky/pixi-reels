/**
 * Every URL the site used to serve, and where it lives now.
 *
 * Plain `.mjs` on purpose: `astro.config.mjs` imports it to register the
 * redirects, and the one-off migration scripts that rewrote the content's
 * internal links read the same table, so the two can never disagree.
 *
 * The site collapsed five shelves (guides, recipes, docs, FAQ groups, API)
 * into topics: one page per mechanic under /mechanics/<slug>/, with the
 * matching guide merged into its Concept section. Tutorials and author notes
 * moved to /learn/, the hand-written API guides, glossary, migrations and the
 * changelog to /reference/. The architecture tour and the TypeDoc output kept
 * their URLs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/** Guides that stayed guides: tutorials and author notes, now under /learn/. */
export const LEARN_SLUGS = [
  'getting-started',
  'your-first-reelset',
  'your-first-cascade',
  'cheats-and-testing',
  'debugging',
  'recipe-previews',
];

/** Hand-written reference pages, now under /reference/. */
export const REFERENCE_SLUGS = [
  'api-reelset',
  'api-builder',
  'api-events',
  'api-phases',
  'glossary',
  'migrating-to-1-0',
  'migrating-to-2-0',
  'migrating-to-3-0',
  'migrating-to-4-0',
];

/**
 * The v1 standalone recipe slugs, by the umbrella page that absorbed them in
 * 2.0. Each still answers at `/recipes/<slug>/`, now landing on the topic page
 * at the demo's own anchor (`<a id="<slug>">` in the demos body).
 */
export const LEGACY_RECIPE_MEMBERS = {
  'hold-and-win': [
    'hold-and-win-base-to-feature', 'hold-and-win-collector', 'hold-and-win-collector-particles',
    'hold-and-win-payer-coin', 'hold-and-win-multiplier', 'hold-and-win-mystery-coin',
    'hold-and-win-upgrade-coin', 'hold-and-win-tier-swap', 'hold-and-win-countup-coin',
    'hold-and-win-sprites', 'hold-and-win-spine', 'hold-and-win-meter', 'hold-and-win-row-jackpot',
    'hold-and-win-bonus-cell', 'hold-and-win-cell-control', 'hold-and-win-anticipation',
    'hold-and-win-skip', 'hold-and-win-sticky-overlay', 'hold-and-win-trace',
    'coin-value-symbol', 'coin-value-data', 'coin-value-overlay', 'value-coin-pin', 'collector-symbol-pin',
  ],
  'big-symbols': [
    'big-symbols-mxn', 'big-symbol-cascade-fall', 'big-symbol-partial-land', 'big-symbol-held-respin',
    'get-block-bounds', 'spine-big-symbols', 'multiways', 'multiways-cascade', 'pyramid-shape',
    'spine-pyramid-shape', 'sticky-wild-multiways',
  ],
  'cascade': [
    'cascade-6x5', 'cascade-destroy-and-present', 'fall-delays', 'refill-orders', 'tumble-feels',
    'tumble-anticipation', 'spin-then-cascade', 'peek-from-above',
  ],
  'wilds-and-pins': [
    'expanding-wild-pin', 'sticky-wild-pin', 'walking-wild-pin', 'multiplier-wild-pin',
    'positional-multiplier-pin', 'mystery-reveal-pin', 'spine-mystery-reveal', 'sticky-win-respin-pin',
  ],
  'nudge': ['nudge-stagger', 'nudge-spotlight', 'nudge-big-symbol', 'nudge-abort', 'nudge-skip'],
  'anticipation': [
    'anticipate-a-reel', 'anticipation-teaser', 'scatter-anticipation', 'staggered-anticipation',
    'slowing-anticipation', 'turbo-anticipation', 'skip-anticipation', 'spine-scatter-jaw-anticipation',
    'near-miss',
  ],
  'symbols': [
    'card-symbol-debug', 'empty-symbol', 'texture-atlas-symbols', 'symbol-transform', 'symbol-layering',
    'spine-skins-3-4-4-4-4-3', 'static-spin-blur', 'static-spin-provided-blur', 'static-spin-spine',
  ],
  'cells-and-banners': [
    'cell-bounds', 'cell-hit-areas', 'board-grid-reveal', 'paylines-events-only',
    'paylines-custom-animation', 'slam-stop', 'feature-mode-swap',
  ],
  // The old standalone horizontal-reel recipes were replaced by the v2
  // orientation-axis banner; point their URLs at the new umbrella.
  'orientation-and-direction': ['horizontal-reel', 'static-spin-horizontal'],
  'starters': ['classic-5x3'],
};

/** Retired recipe slugs whose demo carries a different anchor than the slug. */
export const LEGACY_RECIPE_ALIASES = {
  'remove-symbol': 'cascade#cascade-destroy-and-present',
  'cascade-winpresenter': 'cascade#cascade-destroy-and-present',
};

/**
 * Read `src/content/topics/<slug>.mdx` frontmatter: which guides each topic
 * absorbed. `siteRoot` is the apps/site directory.
 */
export function readTopics(siteRoot) {
  const dir = path.resolve(siteRoot, 'src/content/topics');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const m = raw.match(/^---\n([\s\S]*?)\n---/);
      if (!m) throw new Error(`Topic ${f} has no frontmatter`);
      const fm = parse(m[1]);
      return { slug: f.replace(/\.mdx$/, ''), guides: fm.guides ?? [] };
    });
}

/**
 * Where a merged guide's prose begins on its topic page: the Concept section
 * itself when it is the topic's only guide, its own part otherwise.
 */
export function conceptAnchor(topic, guideSlug) {
  return topic.guides.length === 1 ? 'concept' : `concept-${guideSlug}`;
}

/** The whole old -> new table, every old URL exactly once. */
export function buildRedirects(siteRoot) {
  const topics = readTopics(siteRoot);
  const out = {};

  out['/recipes/'] = '/mechanics/';
  out['/guides/'] = '/learn/';
  out['/docs/'] = '/reference/';
  out['/changelog/'] = '/reference/changelog/';
  // Renamed in 1.0.0. the pin primitive is general, not Spine-specific.
  out['/guides/spine-pins/'] = '/mechanics/wilds-and-pins/#concept';

  for (const t of topics) {
    out[`/recipes/${t.slug}/`] = `/mechanics/${t.slug}/`;
    for (const g of t.guides) {
      out[`/guides/${g}/`] = `/mechanics/${t.slug}/#${conceptAnchor(t, g)}`;
    }
  }
  for (const [umbrella, members] of Object.entries(LEGACY_RECIPE_MEMBERS)) {
    for (const slug of members) out[`/recipes/${slug}/`] = `/mechanics/${umbrella}/#${slug}`;
  }
  for (const [slug, target] of Object.entries(LEGACY_RECIPE_ALIASES)) {
    const [umbrella, anchor] = target.split('#');
    out[`/recipes/${slug}/`] = `/mechanics/${umbrella}/#${anchor}`;
  }
  for (const s of LEARN_SLUGS) out[`/guides/${s}/`] = `/learn/${s}/`;
  for (const s of REFERENCE_SLUGS) out[`/docs/${s}/`] = `/reference/${s}/`;

  return out;
}
