/**
 * `.phases(...)` overrides must survive `.tumble()` / `.multiways()`.
 *
 * `phases()` used to run its configurator immediately, at call time, while
 * `.tumble()` and `.multiways()` register their own phase defaults later,
 * inside `build()`. So a caller who registered a `'cascade:*'` or `'adjust'`
 * phase got it silently overwritten by the built-in - no error, no warning,
 * just the default phase at run time. The builder's own doc comment told
 * people to call `.phases(...)` AFTER `.tumble(...)`, which did not help,
 * because chain position was never what decided the winner.
 *
 * Configurators are now deferred to the end of `build()`'s phase wiring, so
 * an override wins from anywhere in the chain.
 *
 * Each subclass records its own construction, so these assert what the
 * ENGINE actually instantiated during a real spin, not what a registry
 * lookup claims.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { CascadeDropInPhase } from '../../src/spin/phases/CascadeDropInPhase.js';
import { StopPhase } from '../../src/spin/phases/StopPhase.js';
import { resolveTumbleConfig } from '../../src/cascade/TumbleConfig.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';
import type { PhaseFactory } from '../../src/spin/phases/PhaseFactory.js';

const RESOLVED = resolveTumbleConfig({});
const GRID: ColumnTarget[] = Array.from({ length: 3 }, () => ({ visible: ['a', 'b', 'c'] }));

/** A `CascadeDropInPhase` subclass that logs every instance it builds. */
function makeDropIn(log: string[], tag: string) {
  return class TaggedDropIn extends CascadeDropInPhase {
    constructor(...args: ConstructorParameters<typeof CascadeDropInPhase>) {
      super(...args);
      log.push(tag);
    }
  };
}

function harness(phases: (f: PhaseFactory) => void, tumble = true) {
  const h = createTestReelSet({
    reels: 3,
    visibleCells: 3,
    symbolIds: ['a', 'b', 'c'],
    ...(tumble ? { tumble: {} } : {}),
    phases,
  });
  const pump = setInterval(() => h.ticker.tick(16), 16);
  return { ...h, stopPump: () => clearInterval(pump) };
}

describe('phase override ordering', () => {
  let active: ReturnType<typeof harness> | null = null;

  afterEach(() => {
    if (active) {
      active.stopPump();
      active.destroy();
      active = null;
    }
  });

  it('a cascade override wins over the built-in tumble registration', async () => {
    const log: string[] = [];
    const Tagged = makeDropIn(log, 'mine');
    const h = (active = harness((f) =>
      f.registerFactory(
        'cascade:dropIn',
        (reel, speed) => new Tagged(reel, speed, RESOLVED.dropIn, RESOLVED.gravity),
      ),
    ));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await p;

    // One per reel. If the built-in had clobbered the override, zero.
    expect(log).toEqual(['mine', 'mine', 'mine']);
  });

  it('later configurators win over earlier ones for the same key', async () => {
    const log: string[] = [];
    const First = makeDropIn(log, 'first');
    const Second = makeDropIn(log, 'second');
    const h = (active = harness((f) => {
      f.registerFactory(
        'cascade:dropIn',
        (reel, speed) => new First(reel, speed, RESOLVED.dropIn, RESOLVED.gravity),
      );
      f.registerFactory(
        'cascade:dropIn',
        (reel, speed) => new Second(reel, speed, RESOLVED.dropIn, RESOLVED.gravity),
      );
    }));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await p;

    expect(new Set(log)).toEqual(new Set(['second']));
  });

  it('a standard-phase override still works (no cascade wiring involved)', async () => {
    const log: string[] = [];
    class TaggedStop extends StopPhase {
      constructor(...args: ConstructorParameters<typeof StopPhase>) {
        super(...args);
        log.push('stop');
      }
    }
    const h = (active = harness((f) => f.register('stop', TaggedStop), false));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await p;

    expect(log).toEqual(['stop', 'stop', 'stop']);
  });
});
