import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');

// https://astro.build/config
export default defineConfig({
  site: 'https://pixi-reels.dev',
  integrations: [
    tailwind(),
    mdx(),
    react(),
  ],
  vite: {
    resolve: {
      alias: [
        // The subpath alias must win over the bare one, so order matters:
        // '@rollup/plugin-alias' style arrays respect order of definition.
        // Both point at THIS branch's source — the site is always built
        // against the local library, never against a published npm version.
        { find: /^pixi-reels\/spine$/, replacement: resolve(repoRoot, 'packages/pixi-reels/src/spine/index.ts') },
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
