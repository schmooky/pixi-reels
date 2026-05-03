import { mkdir, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Canvas, loadImage } from 'skia-canvas';
import { SYMBOLS } from './symbols.config';
import { registerFonts } from './lib/fonts';
import { renderSymbol } from './lib/render';
import { pack } from './lib/pack';
import { writeAtlas } from './lib/atlas';
import { buildSkeleton } from './lib/skeleton';
import { getCompiledAnimations } from './animations';

const OUT = './out';
const PAGE_FILE = 'symbols.png';
const ATLAS_FILE = 'symbols.atlas';

/**
 * Deploy targets relative to this script's location. Both must mirror the
 * generated bundle exactly: examples serve from `examples/assets/` (their
 * shared `publicDir`), the docs site serves from `apps/site/public/`. We
 * copy after build so neither location can drift out of sync — there is
 * no manual `cp` step left for the next agent to forget.
 */
const DEPLOY_TARGETS = [
  '../../examples/assets/generated-symbols',
  '../../apps/site/public/generated-symbols',
] as const;

async function main() {
  registerFonts();
  await mkdir(OUT, { recursive: true });

  console.log('Compiling animations...');
  const animations = getCompiledAnimations();
  console.log(`  ${Object.keys(animations).join(', ')}`);

  console.log(`Rendering ${SYMBOLS.length} symbols (frame + icon each)...`);
  const buffers: { name: string; size: number; buf: Buffer }[] = [];
  for (const def of SYMBOLS) {
    const { frame, icon } = renderSymbol(def);
    const iconSize = def.iconSize ?? def.size;
    buffers.push({ name: `${def.name}_frame`, size: def.size, buf: frame });
    buffers.push({ name: `${def.name}_icon`,  size: iconSize, buf: icon  });
  }

  console.log('Packing atlas...');
  const packed = pack(buffers.map((b) => ({ name: b.name, w: b.size, h: b.size })));
  console.log(`  page: ${packed.pageW}x${packed.pageH}, ${packed.regions.length} regions`);

  console.log(`Compositing ${PAGE_FILE}...`);
  const page = new Canvas(packed.pageW, packed.pageH);
  const pctx = page.getContext('2d');
  for (const b of buffers) {
    const region = packed.regions.find((r) => r.name === b.name);
    if (!region) throw new Error(`No packed region for ${b.name}`);
    const img = await loadImage(b.buf);
    pctx.drawImage(img, region.x, region.y);
  }
  await writeFile(join(OUT, PAGE_FILE), await page.toBuffer('png'));

  console.log(`Writing ${ATLAS_FILE}...`);
  await writeFile(join(OUT, ATLAS_FILE), writeAtlas(PAGE_FILE, packed));

  console.log('Writing skeleton JSONs...');
  for (const def of SYMBOLS) {
    const skel = buildSkeleton(def.name, def.size, animations, def.iconSize ?? def.size);
    await writeFile(join(OUT, `${def.name}.json`), JSON.stringify(skel, null, 2));
  }

  console.log(`\nDeploying to ${DEPLOY_TARGETS.length} target(s)...`);
  await deployTo(OUT, DEPLOY_TARGETS);

  console.log(`\nDone. Output in ${OUT}/ and:`);
  for (const t of DEPLOY_TARGETS) console.log(`  ${t}`);
  console.log(`  ${SYMBOLS.length} skeleton JSONs`);
  console.log(`  1 atlas (${ATLAS_FILE}, ${packed.regions.length} regions)`);
  console.log(`  1 page (${PAGE_FILE})`);
}

/**
 * Mirror every file from `src` into each `dest`. Stale files in dest that
 * no longer exist in src (e.g. a renamed skeleton) are removed so the
 * deploy is a true mirror, not an additive merge.
 */
async function deployTo(src: string, dests: ReadonlyArray<string>): Promise<void> {
  const srcFiles = await readdir(src);
  const srcSet = new Set(srcFiles);
  for (const dest of dests) {
    await mkdir(dest, { recursive: true });
    const existing = await readdir(dest).catch(() => [] as string[]);
    for (const name of existing) {
      if (!srcSet.has(name)) await rm(join(dest, name), { force: true });
    }
    for (const name of srcFiles) {
      await copyFile(join(src, name), join(dest, name));
    }
    console.log(`  -> ${dest} (${srcFiles.length} files)`);
  }
}

main()
  .then(() => {
    // Force exit to avoid skia-canvas native-module teardown segfault on Bun/Windows.
    // All files are already flushed at this point.
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
