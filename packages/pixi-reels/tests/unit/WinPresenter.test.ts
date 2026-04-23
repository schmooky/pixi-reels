import { describe, it, expect, vi } from 'vitest';
import {
  WinPresenter,
  sortByValueDesc,
  type SymbolPosition,
  type Win,
} from '../../src/index.js';
import { createTestReelSet } from '../../src/testing/index.js';

function mkWin(cells: SymbolPosition[], value?: number, id?: number): Win {
  return { cells, value, id };
}

function cell(r: number, row: number): SymbolPosition {
  return { reelIndex: r, rowIndex: row };
}

describe('sortByValueDesc', () => {
  it('sorts by value desc, treats missing value as 0, does not mutate', () => {
    const a = mkWin([cell(0, 0)], 10, 1);
    const b = mkWin([cell(1, 0)], 50, 2);
    const c = mkWin([cell(2, 0)], undefined, 3);
    const d = mkWin([cell(3, 0)], 25, 4);
    const input = [a, b, c, d];
    const out = sortByValueDesc(input);
    expect(out.map((w) => w.id)).toEqual([2, 4, 1, 3]);
    expect(input.map((w) => w.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('WinPresenter — basic sequencing', () => {
  function setup() {
    return createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a', 'b'] });
  }

  it('fires win:start, win:group, win:symbol, win:end in order', async () => {
    const h = setup();
    try {
      const log: string[] = [];
      h.reelSet.events.on('win:start', (wins) => log.push(`start:${wins.length}`));
      h.reelSet.events.on('win:group', (w) => log.push(`group:${w.id}`));
      h.reelSet.events.on('win:symbol', (_s, c) => log.push(`sym:${c.reelIndex},${c.rowIndex}`));
      h.reelSet.events.on('win:end', (r) => log.push(`end:${r}`));

      const p = new WinPresenter(h.reelSet, { cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);
      await p.show([mkWin([cell(0, 0), cell(1, 0), cell(2, 0)], 10, 7)]);

      expect(log).toEqual([
        'start:1',
        'group:7',
        'sym:0,0',
        'sym:1,0',
        'sym:2,0',
        'end:complete',
      ]);
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('default sort sorts wins by value descending', async () => {
    const h = setup();
    try {
      const groupOrder: Array<number | undefined> = [];
      h.reelSet.events.on('win:group', (w) => groupOrder.push(w.id));
      const p = new WinPresenter(h.reelSet, { cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);
      await p.show([
        mkWin([cell(0, 0)], 10, 1),
        mkWin([cell(0, 1)], 50, 2),
        mkWin([cell(0, 2)], 25, 3),
      ]);
      expect(groupOrder).toEqual([2, 3, 1]);
      p.destroy();
    } finally {
      h.destroy();
    }
  });
});

describe('WinPresenter — dim / restore', () => {
  it('dims non-winning cells during a group, restores on win:end', async () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a'] });
    try {
      const p = new WinPresenter(h.reelSet, { dimLosers: { alpha: 0.2 }, cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);
      let winnerAlpha = -1;
      let loserAlpha = -1;
      h.reelSet.events.on('win:group', () => {
        winnerAlpha = h.reelSet.getReel(0).getSymbolAt(1).view.alpha;
        loserAlpha = h.reelSet.getReel(0).getSymbolAt(0).view.alpha;
      });
      await p.show([mkWin([cell(0, 1), cell(1, 1), cell(2, 1), cell(3, 1), cell(4, 1)], 10)]);
      expect(winnerAlpha).toBe(1);
      expect(loserAlpha).toBeCloseTo(0.2, 5);
      for (let r = 0; r < 5; r++) {
        for (let row = 0; row < 3; row++) {
          expect(h.reelSet.getReel(r).getSymbolAt(row).view.alpha).toBe(1);
        }
      }
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('dimLosers: false leaves alphas at 1', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a'] });
    try {
      const p = new WinPresenter(h.reelSet, { dimLosers: false, cycleGap: 0 });
      await h.spinAndLand([['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a']]);
      let loserAlpha = -1;
      h.reelSet.events.on('win:group', () => {
        loserAlpha = h.reelSet.getReel(0).getSymbolAt(0).view.alpha;
      });
      await p.show([mkWin([cell(0, 1)], 10)]);
      expect(loserAlpha).toBe(1);
      p.destroy();
    } finally {
      h.destroy();
    }
  });
});

describe('WinPresenter — stagger', () => {
  it('stagger = 0: all win:symbol events fire synchronously inside one tick', async () => {
    const h = createTestReelSet({ reels: 5, visibleRows: 1, symbolIds: ['a'] });
    try {
      const timestamps: number[] = [];
      h.reelSet.events.on('win:symbol', () => timestamps.push(performance.now()));
      const p = new WinPresenter(h.reelSet, { stagger: 0, cycleGap: 0 });
      await h.spinAndLand([['a'], ['a'], ['a'], ['a'], ['a']]);
      await p.show([mkWin([cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0), cell(4, 0)])]);
      expect(timestamps.length).toBe(5);
      // All within the same microtask batch — under 5 ms is very safe.
      const spread = timestamps[timestamps.length - 1] - timestamps[0];
      expect(spread).toBeLessThan(5);
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('stagger > 0: successive win:symbol events are spaced by at least `stagger` ms', async () => {
    const h = createTestReelSet({ reels: 4, visibleRows: 1, symbolIds: ['a'] });
    try {
      const timestamps: number[] = [];
      h.reelSet.events.on('win:symbol', () => timestamps.push(performance.now()));
      const p = new WinPresenter(h.reelSet, { stagger: 40, cycleGap: 0 });
      await h.spinAndLand([['a'], ['a'], ['a'], ['a']]);
      await p.show([mkWin([cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0)])]);
      expect(timestamps.length).toBe(4);
      for (let i = 1; i < timestamps.length; i++) {
        // 40 ms stagger with setTimeout jitter — floor at 30 ms to stay stable on CI.
        expect(timestamps[i] - timestamps[i - 1]).toBeGreaterThanOrEqual(30);
      }
      p.destroy();
    } finally {
      h.destroy();
    }
  });
});

describe('WinPresenter — symbolAnim modes', () => {
  it('custom callback runs per cell with (symbol, cell, win)', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a'] });
    try {
      const calls: Array<{ r: number; row: number; id: number | undefined }> = [];
      const p = new WinPresenter(h.reelSet, {
        cycleGap: 0,
        symbolAnim: async (_sym, c, win) => {
          calls.push({ r: c.reelIndex, row: c.rowIndex, id: win.id });
        },
      });
      await h.spinAndLand([['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a']]);
      await p.show([mkWin([cell(0, 1), cell(2, 1)], 10, 42)]);
      expect(calls).toEqual([
        { r: 0, row: 1, id: 42 },
        { r: 2, row: 1, id: 42 },
      ]);
      p.destroy();
    } finally {
      h.destroy();
    }
  });
});

describe('WinPresenter — cancellation', () => {
  it('abort() resolves show() with reason "aborted"', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a'] });
    try {
      const reasons: string[] = [];
      h.reelSet.events.on('win:end', (r) => reasons.push(r));
      const p = new WinPresenter(h.reelSet, { cycleGap: 0, cycles: -1 });
      await h.spinAndLand([['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a']]);

      const running = p.show([mkWin([cell(0, 0)], 10)]);
      await Promise.resolve();
      p.abort();
      await running;

      expect(reasons.at(-1)).toBe('aborted');
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('show([]) is a no-op and does not fire events', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a'] });
    try {
      const spy = vi.fn();
      h.reelSet.events.on('win:start', spy);
      const p = new WinPresenter(h.reelSet);
      await p.show([]);
      expect(spy).not.toHaveBeenCalled();
      p.destroy();
    } finally {
      h.destroy();
    }
  });
});

describe('WinPresenter — ReelSet integration', () => {
  it('reel.container.zIndex equals the reel index', () => {
    const h = createTestReelSet({ reels: 4 });
    try {
      for (let i = 0; i < 4; i++) {
        expect(h.reelSet.getReel(i).container.zIndex).toBe(i);
      }
    } finally {
      h.destroy();
    }
  });
});
