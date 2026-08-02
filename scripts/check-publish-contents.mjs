#!/usr/bin/env node
/**
 * Guard: the tarball npm would publish must contain what it promises.
 *
 * `package.json` listed README.md and LICENSE in `files` for a long time and
 * neither existed inside the package. npm drops a `files` entry that matches
 * nothing, without a word, so `pixi-reels` was one `npm publish` away from a
 * blank page on npmjs.com and an MIT-licensed package shipping no licence.
 *
 * This asks npm itself what it would pack -- lifecycle scripts and all --
 * rather than trusting the manifest.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'packages/pixi-reels');

/** Files a consumer or a licence audit would notice missing. */
const REQUIRED = ['README.md', 'LICENSE', 'CHANGELOG.md', 'package.json'];

let stdout;
try {
  ({ stdout } = await run('npm', ['pack', '--dry-run', '--json'], { cwd: PKG, maxBuffer: 32 * 1024 * 1024 }));
} catch (err) {
  console.error('check-publish-contents: `npm pack --dry-run` failed:\n', err.stderr || err.message);
  process.exit(1);
}

let packed;
try {
  packed = JSON.parse(stdout)[0].files.map((f) => f.path);
} catch {
  console.error('check-publish-contents: could not parse `npm pack --json` output.');
  console.error('A lifecycle script probably wrote to stdout; it must use stderr.');
  process.exit(1);
}

const missing = REQUIRED.filter((f) => !packed.includes(f));
// An entry point nobody can import is the other half of the same failure.
const entries = ['dist/index.js', 'dist/index.cjs', 'dist/index.d.ts'];
missing.push(...entries.filter((f) => !packed.includes(f)));

if (missing.length > 0) {
  console.error(`check-publish-contents: the published tarball would be missing:\n`);
  for (const m of missing) console.error(`  ${m}`);
  console.error('\nnpm silently ignores a `files` entry that matches nothing.');
  process.exit(1);
}

console.log(`check-publish-contents: ${packed.length} files, all required ones present.`);
