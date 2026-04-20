import { resolve } from 'path';
import type { UserConfig } from 'vite';

/**
 * Shared Vite config for all examples.
 * Resolves shared dependencies from the example's own node_modules.
 *
 * Aliases point at the library's `src/` so examples get HMR on library
 * edits and always consume the current branch's source — never the built
 * `dist/` or a published npm version.
 */
export function createExampleConfig(exampleDir: string): UserConfig {
  const nm = (pkg: string) => resolve(exampleDir, 'node_modules', pkg);

  return {
    resolve: {
      // Array form so the subpath `pixi-reels/spine` wins over the bare
      // `pixi-reels` alias. Vite resolves aliases in the order listed.
      alias: [
        { find: /^pixi-reels\/spine$/, replacement: resolve(exampleDir, '../../packages/pixi-reels/src/spine/index.ts') },
        { find: /^pixi-reels$/, replacement: resolve(exampleDir, '../../packages/pixi-reels/src/index.ts') },
        { find: 'pixi.js', replacement: nm('pixi.js') },
        { find: 'gsap', replacement: nm('gsap') },
      ],
    },
    publicDir: resolve(exampleDir, '../assets'),
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    assetsInclude: ['**/*.atlas'],
  };
}
