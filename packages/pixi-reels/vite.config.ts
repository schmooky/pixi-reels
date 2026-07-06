import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      outDir: resolve(__dirname, 'dist'),
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        // Subpath export: `import { SpineReelSymbol } from 'pixi-reels/spine'`
        spine: resolve(__dirname, 'src/spine/index.ts'),
        // Subpath export: `import { createTestReelSet } from 'pixi-reels/testing'`
        //. keeps the headless harness out of production bundles.
        testing: resolve(__dirname, 'src/testing/index.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'pixi.js',
        'gsap',
        '@esotericsoftware/spine-pixi-v8',
      ],
      // Emit one output file per source module instead of collapsing the
      // library into a few big chunks. A downstream bundler then pulls only
      // the modules reachable from what the consumer actually imports, so
      // tree-shaking no longer depends on the consumer bundler being able to
      // see through a concatenated mega-chunk. The named `lib.entry` files
      // (index / spine / testing) stay at the dist root; everything else is
      // laid out mirroring `src/`.
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
    sourcemap: true,
    outDir: resolve(__dirname, 'dist'),
  },
});
