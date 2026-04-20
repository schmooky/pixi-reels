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
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'pixi.js',
        'gsap',
        '@esotericsoftware/spine-pixi-v8',
      ],
    },
    sourcemap: true,
    outDir: resolve(__dirname, 'dist'),
  },
});
