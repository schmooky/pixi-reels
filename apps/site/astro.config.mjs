import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');

// Keystatic's admin UI + API are injected as non-prerendered routes, which would
// force a server adapter onto an otherwise fully static build. Storage is local,
// so editing only happens under `astro dev` — register the integration for the
// dev/start commands only and keep `astro build` static. Open /keystatic in dev.
const isDev = process.argv.includes('dev') || process.argv.includes('start');

// Recipe pages were consolidated from ~86 single-mechanic files into 9 broad
// umbrella pages, each holding many live demos. Old /recipes/<slug>/ URLs
// redirect to their umbrella page plus the in-page anchor for that demo.
const recipeUmbrellas = {
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
const recipeRedirects = Object.fromEntries(
  Object.entries(recipeUmbrellas).flatMap(([umbrella, members]) =>
    members.map((slug) => [`/recipes/${slug}/`, `/recipes/${umbrella}/#${slug}`]),
  ),
);

// https://astro.build/config
export default defineConfig({
  site: 'https://pixi-reels.schmooky.dev',
  redirects: {
    // Renamed in 1.0.0. the pin primitive is general, not Spine-specific.
    '/guides/spine-pins/': '/guides/pins/',
    // Old destroy-stage recipes now live in the cascade umbrella page.
    '/recipes/remove-symbol/': '/recipes/cascade/#cascade-destroy-and-present',
    '/recipes/cascade-winpresenter/': '/recipes/cascade/#cascade-destroy-and-present',
    ...recipeRedirects,
  },
  // Prefetch on hover for instant subsequent navigations. Doesn't affect
  // the initial paint, but turns sub-200ms transitions into 0ms ones for
  // anyone reading the docs.
  prefetch: {
    defaultStrategy: 'hover',
    prefetchAll: false,
  },
  integrations: [
    mdx(),
    react(),
    ...(isDev ? [keystatic()] : []),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: [
        // The subpath alias must win over the bare one, so order matters:
        // '@rollup/plugin-alias' style arrays respect order of definition.
        // Both point at THIS branch's source. the site is always built
        // against the local library, never against a published npm version.
        { find: /^pixi-reels\/spine$/, replacement: resolve(repoRoot, 'packages/pixi-reels/src/spine/index.ts') },
        { find: /^pixi-reels\/testing$/, replacement: resolve(repoRoot, 'packages/pixi-reels/src/testing/index.ts') },
        { find: /^pixi-reels$/, replacement: resolve(repoRoot, 'packages/pixi-reels/src/index.ts') },
        { find: '@', replacement: resolve(here, 'src') },
        // gsap is a peer dep pulled in by examples/shared (BlurSpriteSymbol);
        // point it at the site's hoisted copy.
        { find: /^gsap$/, replacement: resolve(here, 'node_modules/gsap/index.js') },
      ],
      dedupe: ['react', 'react-dom', 'pixi.js', 'gsap'],
    },
    ssr: { noExternal: ['pixi-reels', 'gsap'] },
    server: { fs: { allow: [repoRoot] } },
  },
});
