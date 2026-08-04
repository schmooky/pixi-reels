#!/usr/bin/env node
/**
 * npx pixi-reels-codemod v1-to-v2 [paths...]
 *
 * Thin wrapper around jscodeshift so the published entry point reads as a
 * named migration rather than a transform path the caller has to remember.
 *
 * It also collects the sites the transform refused to rename (see
 * `transforms/v1-to-v2.cjs`) and prints them at the end, because a rename the
 * codemod could not prove is a rename a human still has to make.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRANSFORMS = { 'v1-to-v2': resolve(HERE, '../transforms/v1-to-v2.cjs') };

const [name, ...rest] = process.argv.slice(2);

if (!name || name === '--help' || name === '-h') {
  process.stdout.write(
    'Usage: npx pixi-reels-codemod v1-to-v2 [paths...] [-- <jscodeshift options>]\n\n' +
    'Rewrites pixi-reels v1 API names to v2 (ADR 016 section 5).\n' +
    'Defaults to `src` when no path is given. Pass --dry --print to preview.\n' +
    'Sites that cannot be proven to be pixi-reels are left alone and listed\n' +
    'at the end of the run for a manual pass.\n\n' +
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

// Resolve jscodeshift through the module graph, not through a guessed
// `node_modules/.bin` path: npm, yarn and `npx` hoist dependencies to the
// installing project's root, where that path does not exist.
const require = createRequire(import.meta.url);
let runner;
try {
  runner = require.resolve('jscodeshift/bin/jscodeshift.js');
} catch (err) {
  process.stderr.write(
    'pixi-reels-codemod: cannot find its jscodeshift dependency.\n' +
    `  ${err.message}\n` +
    '  Reinstall the package (`npm i -D pixi-reels-codemod`), or run the\n' +
    `  transform directly: npx jscodeshift -t ${transform} --parser tsx <paths>\n`,
  );
  process.exit(1);
}

const reportDir = mkdtempSync(join(tmpdir(), 'pixi-reels-codemod-'));
const reportFile = join(reportDir, 'skipped.jsonl');

const result = spawnSync(
  process.execPath,
  [
    runner,
    '-t', transform,
    '--parser', 'tsx',
    '--extensions', 'ts,tsx,js,jsx,mjs,cjs',
    ...flags,
    ...(paths.length > 0 ? paths : ['src']),
  ],
  { stdio: 'inherit', env: { ...process.env, PIXI_REELS_CODEMOD_REPORT: reportFile } },
);

printSkipped();
rmSync(reportDir, { recursive: true, force: true });

if (result.error) {
  process.stderr.write(
    `pixi-reels-codemod: could not run jscodeshift (${runner}).\n  ${result.error.message}\n`,
  );
  process.exit(1);
}

process.exit(result.status ?? 1);

/** Print the sites the transform deliberately left alone, file:line first. */
function printSkipped() {
  let raw;
  try {
    raw = readFileSync(reportFile, 'utf8');
  } catch {
    return; // nothing skipped
  }
  const seen = new Set();
  const entries = [];
  for (const line of raw.split('\n')) {
    if (line === '') continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const key = `${entry.file}:${entry.line}:${entry.column}:${entry.why}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  if (entries.length === 0) return;
  entries.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
  const lines = entries.map((e) => `  ${e.file}:${e.line}:${e.column}  ${e.why}`);
  process.stdout.write(
    `\npixi-reels-codemod: left ${lines.length} ambiguous site(s) alone.\n` +
    'These use a v1 name in a position that could equally be someone else\'s\n' +
    'API, so the codemod did not guess. Review and rename the pixi-reels ones\n' +
    'by hand:\n\n' + lines.join('\n') + '\n',
  );
}
