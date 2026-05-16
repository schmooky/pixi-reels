import { defineConfig } from 'vite';
import { createExampleConfig } from '../shared/viteSharedConfig.js';

export default defineConfig({
  ...createExampleConfig(__dirname),
  // Tell Vite that `.skel` (Spine binary skeletons) are static assets
  // — without this, the import-analysis plugin tries to parse them as
  // text modules and chokes.
  assetsInclude: ['**/*.atlas', '**/*.skel'],
});
