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
        // Subpath export: `import { debugOverlay } from 'pixi-reels/debug'`
        //. the only entry that imports pixi-silk, an optional peer.
        debug: resolve(__dirname, 'src/debug/index.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'pixi.js',
        'gsap',
        '@esotericsoftware/spine-pixi-v8',
        'pixi-silk',
      ],
    },
    sourcemap: true,
    outDir: resolve(__dirname, 'dist'),
  },
});
