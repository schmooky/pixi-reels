import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

/**
 * If a type appears in the signature of something `index.ts` exports on
 * purpose, a consumer must be able to name it. Otherwise they can hold the
 * value but never write it down: `const cb: ??? = (dt) => ...`.
 *
 * TypeDoc reports these as "referenced but not included in the
 * documentation" during the site build, which nothing gates on. This test
 * gates on it for the types we decided are part of the surface.
 *
 * NOT covered on purpose: ReelMotion, StopSequencer, SymbolFactory,
 * RandomSymbolProvider, ReelSetParams. Those were hidden in 1.0.0 as a
 * deliberate call (see the comment above the Spin block in index.ts).
 */
const MUST_BE_NAMEABLE = [
  'PhaseConstructor',
  'PhaseCreatorFn',
  'PinOverlayTween',
  'TickerCallback',
] as const;

describe('public type surface', () => {
  const index = readFileSync(`${SRC}/index.ts`, 'utf8');

  for (const name of MUST_BE_NAMEABLE) {
    it(`exports ${name}, which a public signature mentions`, () => {
      // Match it as a whole word inside an export clause, so a substring of
      // some other identifier cannot satisfy this.
      const clause = new RegExp(`export\\s+type\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'([^']+)'`);
      const m = index.match(clause);
      expect(m, `${name} is used by an exported symbol but index.ts does not re-export it`).not.toBeNull();

      // Re-exporting is not enough: the defining module has to export it too.
      // All four of these were declared module-local, so index.ts listed
      // names that did not resolve -- the re-export alone looked right.
      const from = `${SRC}/${m![1].replace(/^\.\//, '').replace(/\.js$/, '.ts')}`;
      const declares = new RegExp(`export\\s+(?:type|interface)\\s+${name}\\b`).test(readFileSync(from, 'utf8'));
      expect(declares, `${m![1]} declares ${name} but does not export it`).toBe(true);
    });
  }
});
