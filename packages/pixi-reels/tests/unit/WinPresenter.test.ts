import { Container } from 'pixi.js';
import { describe, it, expect, vi } from 'vitest';
import {
  WinPresenter,
  paylineToCells,
  winToCells,
  sortByValueDesc,
  isPayline,
  isCluster,
  type ClusterWin,
  type LineRenderer,
  type Payline,
  type SymbolPosition,
  type Win,
} from '../../src/index.js';
import { createTestReelSet } from '../../src/testing/index.js';

function mkPayline(lineId: number, line: (number | null)[], value: number): Payline {
  return { lineId, line, value };
}

function mkCluster(clusterId: number, cells: SymbolPosition[], value: number): ClusterWin {
  return { clusterId, cells, value };
}

function recorder(): LineRenderer & {
  renderCalls: Array<{ payline: Payline; cellCount: number }>;
  clearCalls: number;
  destroyCalls: number;
} {
  const renderCalls: Array<{ payline: Payline; cellCount: number }> = [];
  let clearCalls = 0;
  let destroyCalls = 0;
  let isDestroyed = false;
  return {
    renderCalls,
    get clearCalls() { return clearCalls; },
    get destroyCalls() { return destroyCalls; },
    get isDestroyed() { return isDestroyed; },
    async render(payline, cells) {
      renderCalls.push({ payline, cellCount: cells.length });
    },
    clear() { clearCalls++; },
    destroy() { destroyCalls++; isDestroyed = true; },
  } as LineRenderer & {
    renderCalls: Array<{ payline: Payline; cellCount: number }>;
    clearCalls: number;
    destroyCalls: number;
  };
}

describe('paylineToCells', () => {
  it('expands line array, skipping null entries', () => {
    const cells = paylineToCells(mkPayline(0, [1, 1, null, 2, 2], 50));
    expect(cells).toEqual([
      { reelIndex: 0, rowIndex: 1 },
      { reelIndex: 1, rowIndex: 1 },
      { reelIndex: 3, rowIndex: 2 },
      { reelIndex: 4, rowIndex: 2 },
    ]);
  });

  it('returns [] for an all-null payline', () => {
    expect(paylineToCells(mkPayline(0, [null, null], 0))).toEqual([]);
  });
});

describe('sortByValueDesc', () => {
  it('sorts by value descending without mutating input', () => {
    const a = mkPayline(0, [0], 10);
    const b = mkPayline(1, [0], 50);
    const c = mkPayline(2, [0], 25);
    const input = [a, b, c];
    const out = sortByValueDesc(input);
    expect(out.map((p) => p.lineId)).toEqual([1, 2, 0]);
    expect(input.map((p) => p.lineId)).toEqual([0, 1, 2]);
  });
});

describe('WinPresenter', () => {
  function setup() {
    const h = createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a', 'b'] });
    return h;
  }

  it('fires win:* events in order and respects sortByValue', async () => {
    const h = setup();
    try {
      const events: Array<{ name: string; data: unknown }> = [];
      h.reelSet.events.on('win:start', (paylines) => events.push({ name: 'win:start', data: paylines.map((p) => p.lineId) }));
      h.reelSet.events.on('win:line', (p) => events.push({ name: 'win:line', data: p.lineId }));
      h.reelSet.events.on('win:symbol', (_s, cell) => events.push({ name: 'win:symbol', data: cell }));
      h.reelSet.events.on('win:end', (reason) => events.push({ name: 'win:end', data: reason }));

      const p = new WinPresenter(h.reelSet);

      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);

      await p.show([
        mkPayline(0, [0, 0, 0, 0, 0], 10),
        mkPayline(1, [1, 1, 1, 1, 1], 50),
      ]);

      // win:start first with lineId 1 first (sorted desc)
      const startEv = events.find((e) => e.name === 'win:start');
      expect(startEv?.data).toEqual([1, 0]);

      // Two 'win:line' in descending value order
      const lineOrder = events.filter((e) => e.name === 'win:line').map((e) => e.data);
      expect(lineOrder).toEqual([1, 0]);

      // 10 win:symbol events (5 cells * 2 paylines)
      expect(events.filter((e) => e.name === 'win:symbol').length).toBe(10);

      // win:end last with reason 'complete'
      expect(events.at(-1)).toEqual({ name: 'win:end', data: 'complete' });

      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('dims losers during a payline and restores on win:end', async () => {
    const h = setup();
    try {
      const p = new WinPresenter(h.reelSet, { dimLosers: { alpha: 0.2 }, cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);

      // Hook a listener that samples alphas while a payline is live.
      let winnerAlpha = -1;
      let loserAlpha = -1;
      h.reelSet.events.on('win:line', () => {
        winnerAlpha = h.reelSet.getReel(0).getSymbolAt(1).view.alpha;
        loserAlpha = h.reelSet.getReel(0).getSymbolAt(0).view.alpha;
      });

      await p.show([mkPayline(0, [1, 1, 1, 1, 1], 10)]);

      expect(winnerAlpha).toBe(1);
      expect(loserAlpha).toBeCloseTo(0.2, 5);

      // After win:end, everything restored to 1.
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

  it('dimLosers: false leaves alphas untouched', async () => {
    const h = setup();
    try {
      const p = new WinPresenter(h.reelSet, { dimLosers: false, cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);
      let observedLoserAlpha = -1;
      h.reelSet.events.on('win:line', () => {
        observedLoserAlpha = h.reelSet.getReel(0).getSymbolAt(0).view.alpha;
      });
      await p.show([mkPayline(0, [1, 1, 1, 1, 1], 10)]);
      expect(observedLoserAlpha).toBe(1);
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('uses custom symbolAnim callback instead of playWin', async () => {
    const h = setup();
    try {
      const calls: Array<{ reelIndex: number; rowIndex: number; lineId: number }> = [];
      const p = new WinPresenter(h.reelSet, {
        cycleGap: 0,
        symbolAnim: async (_sym, cell, payline) => {
          calls.push({ ...cell, lineId: payline.lineId });
        },
      });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);
      await p.show([mkPayline(7, [1, 1, null, 1, 1], 10)]);
      expect(calls.length).toBe(4);
      expect(calls.every((c) => c.lineId === 7 && c.rowIndex === 1)).toBe(true);
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('calls the LineRenderer per payline and clears between / on end', async () => {
    const h = setup();
    try {
      const lr = recorder();
      const p = new WinPresenter(h.reelSet, { lineRenderer: lr, cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);
      await p.show([
        mkPayline(0, [0, 0, 0, 0, 0], 10),
        mkPayline(1, [1, 1, 1, 1, 1], 20),
      ]);
      expect(lr.renderCalls.length).toBe(2);
      expect(lr.renderCalls[0].cellCount).toBe(5);
      // One clear per payline plus one on finally.
      expect(lr.clearCalls).toBeGreaterThanOrEqual(2);

      p.destroy();
      expect(lr.destroyCalls).toBe(1);
    } finally {
      h.destroy();
    }
  });

  it('abort() ends the sequence with reason "aborted"', async () => {
    const h = setup();
    try {
      const endReasons: string[] = [];
      h.reelSet.events.on('win:end', (r) => endReasons.push(r));

      const p = new WinPresenter(h.reelSet, { cycleGap: 0, cycles: -1 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);

      const running = p.show([mkPayline(0, [1, 1, 1, 1, 1], 10)]);
      // Let one microtask pass so win:start fires; then abort.
      await Promise.resolve();
      p.abort();
      await running;

      expect(endReasons.at(-1)).toBe('aborted');
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('show([]) is a no-op and does not fire events', async () => {
    const h = setup();
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

describe('winToCells / discriminators', () => {
  it('isPayline / isCluster discriminate correctly', () => {
    const p: Win = mkPayline(0, [0, 1, null, 2], 10);
    const c: Win = mkCluster(0, [{ reelIndex: 0, rowIndex: 0 }], 10);
    expect(isPayline(p)).toBe(true);
    expect(isCluster(p)).toBe(false);
    expect(isCluster(c)).toBe(true);
    expect(isPayline(c)).toBe(false);
  });

  it('winToCells handles both shapes', () => {
    expect(winToCells(mkPayline(0, [null, 2, 2, null], 10))).toEqual([
      { reelIndex: 1, rowIndex: 2 },
      { reelIndex: 2, rowIndex: 2 },
    ]);
    const c = mkCluster(7, [
      { reelIndex: 3, rowIndex: 0 },
      { reelIndex: 3, rowIndex: 1 },
      { reelIndex: 4, rowIndex: 2 },
    ], 50);
    expect(winToCells(c)).toEqual(c.cells);
    // Copy (not reference) — mutation doesn't leak into the source.
    const extracted = winToCells(c);
    extracted.pop();
    expect(c.cells.length).toBe(3);
  });
});

describe('WinPresenter — cluster wins', () => {
  function setup() {
    return createTestReelSet({ reels: 5, visibleRows: 3, symbolIds: ['a', 'b'] });
  }

  it('fires win:start, win:cluster, win:symbol, win:end for a cluster', async () => {
    const h = setup();
    try {
      const events: Array<{ name: string; payload?: unknown }> = [];
      h.reelSet.events.on('win:start', (wins) => events.push({ name: 'win:start', payload: wins.length }));
      h.reelSet.events.on('win:cluster', (cluster) => events.push({ name: 'win:cluster', payload: cluster.clusterId }));
      h.reelSet.events.on('win:line', (p) => events.push({ name: 'win:line', payload: p.lineId }));
      h.reelSet.events.on('win:symbol', () => events.push({ name: 'win:symbol' }));
      h.reelSet.events.on('win:end', (r) => events.push({ name: 'win:end', payload: r }));

      const p = new WinPresenter(h.reelSet, { cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);

      await p.show([mkCluster(9, [
        { reelIndex: 0, rowIndex: 0 },
        { reelIndex: 0, rowIndex: 1 },
        { reelIndex: 2, rowIndex: 2 },
      ], 100)]);

      const names = events.map((e) => e.name);
      expect(names).toEqual([
        'win:start',
        'win:cluster',
        'win:symbol',
        'win:symbol',
        'win:symbol',
        'win:end',
      ]);
      // No win:line fired — clusters are not line-shaped.
      expect(events.find((e) => e.name === 'win:line')).toBeUndefined();
      expect(events.at(-1)).toEqual({ name: 'win:end', payload: 'complete' });
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('does NOT invoke the LineRenderer for clusters (only paylines)', async () => {
    const h = setup();
    try {
      const renderCalls: unknown[] = [];
      const lr: LineRenderer & { isDestroyed: boolean } = {
        isDestroyed: false,
        async render(win) { renderCalls.push(win); },
        clear() { /* no-op */ },
        destroy() { this.isDestroyed = true; },
      };
      const p = new WinPresenter(h.reelSet, { lineRenderer: lr, cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);
      await p.show([
        mkCluster(0, [{ reelIndex: 0, rowIndex: 0 }, { reelIndex: 0, rowIndex: 1 }], 50),
        mkPayline(1, [0, 0, 0, 0, 0], 100),
      ]);
      // One render call, for the payline.
      expect(renderCalls.length).toBe(1);
      expect((renderCalls[0] as Payline).lineId).toBe(1);
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('dims non-cluster cells while a cluster is active', async () => {
    const h = setup();
    try {
      const p = new WinPresenter(h.reelSet, { dimLosers: { alpha: 0.2 }, cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);
      let winnerAlpha = -1;
      let loserAlpha = -1;
      h.reelSet.events.on('win:cluster', () => {
        // Cluster is at (0,0) + (1,0). Any other cell is a loser.
        winnerAlpha = h.reelSet.getReel(0).getSymbolAt(0).view.alpha;
        loserAlpha = h.reelSet.getReel(2).getSymbolAt(2).view.alpha;
      });
      await p.show([mkCluster(0, [
        { reelIndex: 0, rowIndex: 0 },
        { reelIndex: 1, rowIndex: 0 },
      ], 50)]);
      expect(winnerAlpha).toBe(1);
      expect(loserAlpha).toBeCloseTo(0.2, 5);
      p.destroy();
    } finally {
      h.destroy();
    }
  });

  it('mixed sequence — paylines and clusters sort together by value desc', async () => {
    const h = setup();
    try {
      const order: string[] = [];
      h.reelSet.events.on('win:line', (p) => order.push(`line:${p.lineId}`));
      h.reelSet.events.on('win:cluster', (c) => order.push(`cluster:${c.clusterId}`));

      const p = new WinPresenter(h.reelSet, { cycleGap: 0 });
      await h.spinAndLand([
        ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a'],
      ]);
      await p.show([
        mkPayline(0, [0, 0, 0, 0, 0], 10),
        mkCluster(7, [{ reelIndex: 0, rowIndex: 0 }], 500),
        mkPayline(1, [1, 1, 1, 1, 1], 100),
      ]);
      expect(order).toEqual(['cluster:7', 'line:1', 'line:0']);
      p.destroy();
    } finally {
      h.destroy();
    }
  });
});

describe('WinPresenter — integration with ReelSet', () => {
  it('lineLayer is added to the ReelSet and removed on destroy', () => {
    const h = createTestReelSet();
    try {
      const countLayers = () => h.reelSet.children.filter((c: unknown) => c instanceof Container).length;
      const before = countLayers();
      const p = new WinPresenter(h.reelSet);
      expect(countLayers()).toBe(before + 1);
      p.destroy();
      expect(countLayers()).toBe(before);
    } finally {
      h.destroy();
    }
  });

  it('reel.container.zIndex equals the reel index (explicit cross-reel ordering)', () => {
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
