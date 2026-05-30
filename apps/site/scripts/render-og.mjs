#!/usr/bin/env node
/**
 * Render every `public/og/*.svg` to a matching `.png` so social platforms
 * that reject SVG og:image (LinkedIn, some Twitter clients, most Slack
 * unfurls) still get a usable card.
 *
 * Reads the workspace's `sharp` (already a transitive dep via Astro).
 * Produces 1200x630 PNG at quality 90, the canonical Twitter Card large
 * image size. Output sits next to the source SVG so the SEO defaults
 * can swap `.svg` for `.png` without path math.
 *
 * Idempotent. re-runs overwrite. wire into `prebuild` so PNGs match the
 * latest source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ogRoot = path.resolve(here, '..', 'public', 'og');

async function main() {
  if (!fs.existsSync(ogRoot)) {
    console.warn(`render-og: ${ogRoot} not found, skipping.`);
    return;
  }

  // sharp is resolved from the workspace install, not declared as a
  // direct dep. astro pulls it transitively for image optimization.
  const sharp = (await import('sharp')).default;

  const svgs = fs
    .readdirSync(ogRoot)
    .filter((f) => f.endsWith('.svg'))
    .sort();

  if (svgs.length === 0) {
    console.warn(`render-og: no .svg files in ${ogRoot}.`);
    return;
  }

  let rendered = 0;
  for (const svg of svgs) {
    const inPath = path.join(ogRoot, svg);
    const outPath = path.join(ogRoot, svg.replace(/\.svg$/, '.png'));
    const buf = fs.readFileSync(inPath);
    await sharp(buf, { density: 144 })
      .resize(1200, 630, { fit: 'cover' })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(outPath);
    rendered++;
  }
  console.log(`render-og: rendered ${rendered} PNG(s) under ${path.relative(process.cwd(), ogRoot)}/.`);
}

main().catch((err) => {
  console.error('render-og failed:', err);
  process.exit(1);
});
