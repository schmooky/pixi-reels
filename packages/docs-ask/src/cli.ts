#!/usr/bin/env node
/**
 * docs-ask build <llms.txt> --out <dir> [--model <id>] [--min 300] [--max 600] [--site <url>]
 */
import { buildIndex } from './build.js';

const [cmd, ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

if (cmd !== 'build' || !rest[0] || rest[0].startsWith('--') || !flag('out')) {
  console.error('usage: docs-ask build <llms.txt> --out <dir> [--model <id>] [--min <tokens>] [--max <tokens>] [--site <url>]');
  process.exit(2);
}

const min = flag('min');
const max = flag('max');
buildIndex({
  corpus: rest[0],
  outDir: flag('out')!,
  model: flag('model'),
  siteUrl: flag('site'),
  minTokens: min ? Number(min) : undefined,
  maxTokens: max ? Number(max) : undefined,
  log: (line) => console.log(line),
}).catch((err) => {
  console.error('[docs-ask] failed:', err);
  process.exit(1);
});
