#!/usr/bin/env node
/**
 * Copy the repo's README and LICENSE into the package for publishing.
 *
 * `package.json` has listed both in `files` for a long time, but neither
 * exists inside `packages/pixi-reels/` -- npm silently drops a `files` entry
 * that matches nothing. So the published tarball carried no README (a blank
 * page on npmjs.com) and no LICENSE, on a package whose manifest says MIT.
 *
 * Run from `prepack`, undone by `postpack --clean`, so the copies never sit
 * in the working tree and cannot drift from the originals.
 */
import { copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'packages/pixi-reels');
const FILES = ['README.md', 'LICENSE'];
const clean = process.argv.includes('--clean');

for (const name of FILES) {
  const dest = join(PKG, name);
  if (clean) {
    await rm(dest, { force: true });
    continue;
  }
  const src = join(ROOT, name);
  if (!existsSync(src)) {
    console.error(`stage-package-files: ${name} is not at the repo root. The published package needs it.`);
    process.exit(1);
  }
  await copyFile(src, dest);
}

// stderr, not stdout: this runs from `prepack`, and `npm pack --json`
// expects nothing but JSON on stdout.
console.error(`stage-package-files: ${clean ? 'removed' : 'staged'} ${FILES.join(', ')}`);
