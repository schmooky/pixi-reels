#!/usr/bin/env node
/**
 * npx pixi-reels-codemod v1-to-v2 [paths...]
 *
 * Thin wrapper around jscodeshift so the published entry point reads as a
 * named migration rather than a transform path the caller has to remember.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRANSFORMS = { 'v1-to-v2': resolve(HERE, '../transforms/v1-to-v2.cjs') };

const [name, ...rest] = process.argv.slice(2);

if (!name || name === '--help' || name === '-h') {
  process.stdout.write(
    'Usage: npx pixi-reels-codemod v1-to-v2 [paths...] [-- <jscodeshift options>]\n\n' +
    'Rewrites pixi-reels v1 API names to v2 (ADR 016 section 5).\n' +
    'Defaults to `src` when no path is given. Pass --dry --print to preview.\n\n' +
    'Transforms: ' + Object.keys(TRANSFORMS).join(', ') + '\n',
  );
  process.exit(name ? 0 : 1);
}

const transform = TRANSFORMS[name];
if (!transform) {
  process.stderr.write(
    `pixi-reels-codemod: unknown transform '${name}'. ` +
    `Known: ${Object.keys(TRANSFORMS).join(', ')}.\n`,
  );
  process.exit(1);
}

const paths = rest.filter((a) => !a.startsWith('-'));
const flags = rest.filter((a) => a.startsWith('-'));
const jscodeshift = resolve(HERE, '../node_modules/.bin/jscodeshift');

const result = spawnSync(
  jscodeshift,
  [
    '-t', transform,
    '--parser', 'tsx',
    '--extensions', 'ts,tsx,js,jsx,mjs,cjs',
    ...flags,
    ...(paths.length > 0 ? paths : ['src']),
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
