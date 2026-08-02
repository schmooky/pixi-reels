import { resolve } from 'path';
import { defineConfig } from 'vite';

/**
 * Self-contained config for the orientation-matrix e2e fixture.
 *
 * This used to share `examples/shared/viteSharedConfig.ts` with the demo
 * apps. Those moved to their own repo in 2.0; the fixture stayed because it
 * is the only browser coverage of all four orientation x direction
 * combinations, so it is now a test fixture rather than an example.
 *
 * Aliases point at the library's `src/` so the fixture always exercises the
 * current branch's source, never a built `dist/` or a published version.
 */
const HERE = __dirname;
const REPO = resolve(HERE, '../../../..');
const nm = (pkg: string) => resolve(HERE, 'node_modules', pkg);

export default defineConfig({
  resolve: {
    // Array form so the subpath `pixi-reels/spine` wins over the bare
    // `pixi-reels` alias. Vite resolves aliases in the order listed.
    alias: [
      { find: /^pixi-reels\/spine$/, replacement: resolve(REPO, 'packages/pixi-reels/src/spine/index.ts') },
      { find: /^pixi-reels$/, replacement: resolve(REPO, 'packages/pixi-reels/src/index.ts') },
      { find: 'pixi.js', replacement: nm('pixi.js') },
      { find: 'gsap', replacement: nm('gsap') },
    ],
  },
  // The prototype atlas now lives with the docs site.
  publicDir: resolve(REPO, 'apps/site/public'),
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  assetsInclude: ['**/*.atlas'],
});
