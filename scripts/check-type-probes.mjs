#!/usr/bin/env node
/**
 * Guard: the compile-time promises this library makes, checked as types.
 *
 * `pnpm test` runs vitest, which strips types without checking them, and
 * `tsconfig.json` excludes `tests/`. So a change that silently widens a
 * public signature to `any` — making `StopPhase` generic once reduced
 * `f.register('stop', StopPhase, { steps })`'s callback parameter to an
 * implicit `any` — breaks no test and fails no gate. These probes close that
 * hole for the surface most likely to regress.
 *
 * Two runs:
 *
 *   1. `tests/types/*.types.ts` MUST compile. Each claim is either a plain
 *      declaration (compatibility) or an `@ts-expect-error` (a break we
 *      documented), so a break that stops happening fails just as loudly as
 *      a compatibility that stops holding.
 *   2. `tests/types/speedProfileMerge.types.ts` MUST NOT compile: declaration
 *      merging into `SpeedProfile` is the one thing sections took away, and
 *      its error lands on `config/types.ts`, which would poison the program
 *      above. It is checked on its own.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'packages/pixi-reels');
const TSC = join(ROOT, 'node_modules/.bin/tsc');

const tsc = (args) => spawnSync(TSC, args, { cwd: ROOT, encoding: 'utf8' });

const pass = tsc(['--noEmit', '-p', join(PKG, 'tsconfig.types.json')]);
if (pass.status !== 0) {
  console.error('check-type-probes: the compile-time probes no longer hold.\n');
  console.error(pass.stdout || pass.stderr);
  process.exit(1);
}

// The negative probe needs its own program; give it a throwaway tsconfig.
const dir = mkdtempSync(join(tmpdir(), 'pixi-reels-type-probe-'));
const negative = join(dir, 'tsconfig.json');
writeFileSync(
  negative,
  JSON.stringify({
    extends: join(ROOT, 'tsconfig.json'),
    compilerOptions: { noEmit: true },
    include: [
      join(PKG, 'src/**/*.ts'),
      join(PKG, 'tests/types/speedProfileMerge.types.ts'),
    ],
  }),
);
const fail = tsc(['--noEmit', '-p', negative]);
if (fail.status === 0) {
  console.error(
    'check-type-probes: declaration merging into `SpeedProfile` compiles again.\n' +
      'That is good news, but the changeset and the docs say it does not. Update them,\n' +
      'and delete tests/types/speedProfileMerge.types.ts.',
  );
  process.exit(1);
}

console.log('check-type-probes: compile-time promises hold, and the documented break still breaks.');
