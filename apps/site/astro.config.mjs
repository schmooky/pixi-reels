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

// https://astro.build/config
export default defineConfig({
  site: 'https://pixi-reels.schmooky.dev',
  redirects: {
    // Renamed in 1.0.0. the pin primitive is general, not Spine-specific.
    '/guides/spine-pins/': '/guides/pins/',
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
