/**
 * Integration tests that exercise each mechanic demo's cheat through the real
 * ReelSet + SpinController pipeline, using the headless test harness.
 *
 * These tests are exactly the kind of assurance we advertise in the docs:
 * "you can test a full slot mechanic without a renderer".
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet, expectGrid, countSymbol } from '../../src/testing/index.js';
import {
  CheatEngine,
  forceLine,
  forceScatters,
  forceCell,
  holdAndWinProgress,
  cascadeSequence,
  forceAnticipation,
} from '../../../../examples/shared/cheats.js';

const SYMBOLS = ['a', 'b', 'c', 'scatter', 'wild', 'coin'];

function makeHarness() {
  return createTestReelSet({
    reels: 5,
    visibleRows: 3,
    symbolIds: SYMBOLS,
  });
}

describe('mechanic: classic-lines (forceLine)', () => {
  it('lands a full row of the target symbol', async () => {
    const h = makeHarness();
    try {
      const engine = new CheatEngine({
        reelCount: 5, visibleRows: 3, symbolIds: SYMBOLS, seed: 1,
      });
      engine.register({ id: 'line', label: 'line', enabled: true, cheat: forceLine(1, 'a') });
      const { symbols } = engine.next();
      await h.spinAndLand(symbols);
      for (let r = 0; r < 5; r++) {
        expect(h.reelSet.reels[r].getVisibleSymbols()[1]).toBe('a');
      }
    } finally {
      h.destroy();
    }
  });
});

describe('mechanic: scatter-triggers-fs (forceScatters)', () => {
  it('produces >= 3 scatters on the visible grid', async () => {
    const h = makeHarness();
    try {
      const engine = new CheatEngine({
        reelCount: 5, visibleRows: 3, symbolIds: SYMBOLS, seed: 2,
      });
      engine.register({
        id: 's', label: 's', enabled: true,
        cheat: forceScatters(3, 'scatter'),
      });
      const { symbols } = engine.next();
      await h.spinAndLand(symbols);
      expect(countSymbol(h.reelSet, 'scatter')).toBe(3);
    } finally {
      h.destroy();
    }
  });
});

describe('mechanic: hold-and-win (holdAndWinProgress)', () => {
  it('keeps held coins in place and may add a new one each spin', async () => {
    const h = makeHarness();
    try {
      const engine = new CheatEngine({
        reelCount: 5, visibleRows: 3, symbolIds: SYMBOLS, seed: 3,
      });
      engine.register({
        id: 'h', label: 'h', enabled: true,
        cheat: holdAndWinProgress('coin', 1),
      });
      engine.setHeld([{ reel: 2, row: 1, symbolId: 'coin' }]);
      const first = engine.next();
      await h.spinAndLand(first.symbols);
      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('coin');
      expect(countSymbol(h.reelSet, 'coin')).toBeGreaterThanOrEqual(2);
    } finally {
      h.destroy();
    }
  });

  it('reaches jackpot when the grid fills with coins', () => {
    const engine = new CheatEngine({
      reelCount: 3, visibleRows: 3, symbolIds: SYMBOLS, seed: 4,
    });
    engine.register({
      id: 'h', label: 'h', enabled: true,
      cheat: holdAndWinProgress('coin', 1),
    });
    // Pre-fill held to n*m-1 = 8, next spin should complete
    const held = [];
    for (let r = 0; r < 3; r++) {
      for (let row = 0; row < 3; row++) {
        if (!(r === 2 && row === 2)) held.push({ reel: r, row, symbolId: 'coin' });
      }
    }
    engine.setHeld(held);
    const r = engine.next();
    expect(r.meta?.jackpot).toBe(true);
  });
});

describe('mechanic: cascade-multiplier (cascadeSequence)', () => {
  it('drives successive grids through the same reel set', async () => {
    const h = createTestReelSet({
      reels: 3, visibleRows: 3, symbolIds: SYMBOLS,
    });
    try {
      const g1: string[][] = [
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ];
      const g2: string[][] = [
        ['b', 'b', 'b'],
        ['b', 'b', 'b'],
        ['b', 'b', 'b'],
      ];
      const engine = new CheatEngine({
        reelCount: 3, visibleRows: 3, symbolIds: SYMBOLS, seed: 5,
      });
      engine.register({
        id: 'c', label: 'c', enabled: true,
        cheat: cascadeSequence([g1, g2]),
      });

      await h.spinAndLand(engine.next().symbols);
      expectGrid(h.reelSet, g1);

      await h.spinAndLand(engine.next().symbols);
      expectGrid(h.reelSet, g2);
    } finally {
      h.destroy();
    }
  });
});

describe('mechanic: sticky-wilds (forceCell)', () => {
  it('always places a wild on the targeted cell', async () => {
    const h = makeHarness();
    try {
      const engine = new CheatEngine({
        reelCount: 5, visibleRows: 3, symbolIds: SYMBOLS, seed: 6,
      });
      engine.register({
        id: 'w', label: 'w', enabled: true,
        cheat: forceCell(2, 1, 'wild'),
      });
      await h.spinAndLand(engine.next().symbols);
      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('wild');
      await h.spinAndLand(engine.next().symbols);
      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('wild');
    } finally {
      h.destroy();
    }
  });
});

describe('mechanic: anticipation-slam (forceAnticipation)', () => {
  it('reports anticipation reels in the cheat output', () => {
    const engine = new CheatEngine({
      reelCount: 5, visibleRows: 3, symbolIds: SYMBOLS, seed: 7,
    });
    engine.register({
      id: 'a', label: 'a', enabled: true,
      cheat: forceAnticipation([3, 4]),
    });
    const r = engine.next();
    expect(r.anticipationReels).toEqual([3, 4]);
  });
});
