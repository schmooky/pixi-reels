import type { Ticker } from 'pixi.js';
import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { captureEvents } from '../../src/testing/testHarness.js';

interface Harness {
  reelSet: ReturnType<ReelSetBuilder['build']>;
  ticker: FakeTicker;
  /** Names of phases observed via the PhaseFactory in spin() order. */
  created: string[];
  destroy(): void;
}

function buildMultiwaysCascadeHarness(opts: {
  reels?: number;
  minRows?: number;
  maxRows?: number;
  reelPixelHeight?: number;
} = {}): Harness {
  const ticker = new FakeTicker();
  const created: string[] = [];
  const reelSet = new ReelSetBuilder()
    .reels(opts.reels ?? 3)
    .multiways({
      minRows: opts.minRows ?? 2,
      maxRows: opts.maxRows ?? 6,
      reelPixelHeight: opts.reelPixelHeight ?? 600,
    })
    .symbolSize(100, 100)
    .tumble()
    .ticker(ticker as unknown as Ticker)
    .symbols((r) => r.register('a', HeadlessSymbol, {}))
    .phases((factory) => {
      const original = factory.create.bind(factory);
      factory.create = ((name: string, reel, speed) => {
        const phase = original(name, reel, speed);
        created.push(`${name}:${phase.constructor.name}`);
        return phase;
      }) as typeof factory.create;
    })
    .build();
  return {
    reelSet,
    ticker,
    created,
    destroy() {
      reelSet.destroy();
      ticker.destroy();
    },
  };
}

describe('MultiWays + Cascade (issue #74)', () => {
  it('builds without throwing and reports isMultiWaysSlot', () => {
    const h = buildMultiwaysCascadeHarness();
    try {
      expect(h.reelSet.isMultiWaysSlot).toBe(true);
      // Default mode falls back to cascade because .tumble() was called.
      expect(h.reelSet.reels.map((r) => r.visibleRows)).toEqual([6, 6, 6]);
    } finally {
      h.destroy();
    }
  });

  it('uses cascade fall phase on a multiways cascade spin', async () => {
    // Skip-path tests can only observe phases created before skip() invalidates
    // the generation — that's `cascade:fall` for tumble (mirrors perSpinMode.test).
    // The "Adjust runs" guarantee is asserted via events in the next test.
    const h = buildMultiwaysCascadeHarness();
    try {
      const promise = h.reelSet.spin({ mode: 'cascade' });
      h.reelSet.setShape([3, 4, 2]);
      h.reelSet.setResult([
        ['a', 'a', 'a'],
        ['a', 'a', 'a', 'a'],
        ['a', 'a'],
      ]);
      h.reelSet.skip();
      await promise;

      expect(h.created.some((n) => n.startsWith('cascade:fall:'))).toBe(true);
      // Standard StartPhase must NOT be created — tumble mode replaced it.
      expect(h.created.some((n) => n.startsWith('start:'))).toBe(false);
      expect(h.reelSet.reels.map((r) => r.visibleRows)).toEqual([3, 4, 2]);
    } finally {
      h.destroy();
    }
  });

  it('emits adjust:start / adjust:complete on a multiways cascade spin when shape changes', async () => {
    const h = buildMultiwaysCascadeHarness();
    try {
      const log = captureEvents(h.reelSet, ['adjust:start', 'adjust:complete']);
      const promise = h.reelSet.spin({ mode: 'cascade' });
      h.reelSet.setShape([3, 4, 2]);
      h.reelSet.setResult([
        ['a', 'a', 'a'],
        ['a', 'a', 'a', 'a'],
        ['a', 'a'],
      ]);
      h.reelSet.skip();
      await promise;
      expect(log.filter((e) => e.event === 'adjust:start').length).toBe(3);
      expect(log.filter((e) => e.event === 'adjust:complete').length).toBe(3);
    } finally {
      h.destroy();
    }
  });

  it('handles two cascade spins in succession with different shapes', async () => {
    const h = buildMultiwaysCascadeHarness();
    try {
      // Spin 1 → shape [3,4,2].
      let promise = h.reelSet.spin({ mode: 'cascade' });
      h.reelSet.setShape([3, 4, 2]);
      h.reelSet.setResult([
        ['a', 'a', 'a'],
        ['a', 'a', 'a', 'a'],
        ['a', 'a'],
      ]);
      h.reelSet.skip();
      await promise;
      expect(h.reelSet.reels.map((r) => r.visibleRows)).toEqual([3, 4, 2]);

      // Spin 2 → shape [5,2,6]. AdjustPhase must reshape on each spin.
      promise = h.reelSet.spin({ mode: 'cascade' });
      h.reelSet.setShape([5, 2, 6]);
      h.reelSet.setResult([
        ['a', 'a', 'a', 'a', 'a'],
        ['a', 'a'],
        ['a', 'a', 'a', 'a', 'a', 'a'],
      ]);
      h.reelSet.skip();
      await promise;
      expect(h.reelSet.reels.map((r) => r.visibleRows)).toEqual([5, 2, 6]);
    } finally {
      h.destroy();
    }
  });

  it('cascade spin without setShape keeps the current shape', async () => {
    const h = buildMultiwaysCascadeHarness();
    try {
      const promise = h.reelSet.spin({ mode: 'cascade' });
      h.reelSet.setResult([
        ['a', 'a', 'a', 'a', 'a', 'a'],
        ['a', 'a', 'a', 'a', 'a', 'a'],
        ['a', 'a', 'a', 'a', 'a', 'a'],
      ]);
      h.reelSet.skip();
      await promise;
      // Builds at maxRows=6; no setShape → reshape is a no-op.
      expect(h.reelSet.reels.map((r) => r.visibleRows)).toEqual([6, 6, 6]);
    } finally {
      h.destroy();
    }
  });
});
