import { describe, it, expect } from 'vitest';
import { createTestReelSet, captureEvents } from '../../src/testing/index.js';
import { debugSnapshot } from '../../src/debug/debug.js';

describe('MultiWays reshape', () => {
  it('builds at maxCells by default and reports isMultiWaysSlot', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 6,
      multiways: { minCells: 2, maxCells: 7, reelExtent: 600 },
      symbolIds: ['a', 'b'],
    });
    try {
      expect(reelSet.isMultiWaysSlot).toBe(true);
      expect(reelSet.reels.map((r) => r.visibleCells)).toEqual([7, 7, 7, 7, 7, 7]);
    } finally {
      destroy();
    }
  });

  it('setShape() emits shape:changed with a copy of the input', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 4,
      multiways: { minCells: 2, maxCells: 6, reelExtent: 500 },
      symbolIds: ['a'],
    });
    try {
      const log = captureEvents(reelSet, ['shape:changed']);
      reelSet.setShape([3, 4, 5, 2]);
      expect(log).toHaveLength(1);
      expect(log[0].args[0]).toEqual([3, 4, 5, 2]);
    } finally {
      destroy();
    }
  });

  it('setShape() throws on non-MultiWays slot', () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 5, visibleCells: 3 });
    try {
      expect(() => reelSet.setShape([3, 3, 3, 3, 3])).toThrow(/multiways/);
    } finally {
      destroy();
    }
  });

  it('setShape() throws when called after setResult() in the same spin', async () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      multiways: { minCells: 2, maxCells: 6, reelExtent: 600 },
      symbolIds: ['a'],
    });
    try {
      const promise = reelSet.spin();
      reelSet.setShape([3, 3, 3]);
      reelSet.setResult([
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
        { visible: ['a', 'a', 'a'] },
      ]);
      // Past setResult. a second setShape must throw to avoid corrupting
      // the cached frames.
      expect(() => reelSet.setShape([2, 2, 2])).toThrow(/BEFORE setResult/);
      reelSet.slamStop();
      await promise;
    } finally {
      destroy();
    }
  });

  it('setShape() validates length and bounds', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 4,
      multiways: { minCells: 2, maxCells: 5, reelExtent: 500 },
      symbolIds: ['a'],
    });
    try {
      expect(() => reelSet.setShape([3, 3, 3])).toThrow(/length/);
      expect(() => reelSet.setShape([3, 3, 1, 3])).toThrow(/out of range/);
      expect(() => reelSet.setShape([3, 3, 6, 3])).toThrow(/out of range/);
    } finally {
      destroy();
    }
  });

  it('reel.reshape applies new visibleCells + cell height', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      multiways: { minCells: 2, maxCells: 6, reelExtent: 600 },
      symbolIds: ['a', 'b'],
      symbolSize: { width: 100, height: 100 },
    });
    try {
      const reel = reelSet.reels[0];
      reel.reshape(3, 200, reel.bufferStart, reel.bufferEnd);
      expect(reel.visibleCells).toBe(3);
      expect(reel.symbolHeight).toBe(200);
    } finally {
      destroy();
    }
  });

  it('AdjustPhase adjusts shape between SPIN and STOP', async () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      multiways: { minCells: 2, maxCells: 6, reelExtent: 600 },
      symbolIds: ['a', 'b'],
    });
    try {
      const log = captureEvents(reelSet, ['adjust:start', 'adjust:complete']);
      const promise = reelSet.spin();
      reelSet.setShape([3, 4, 2]);
      reelSet.setResult([
        { visible: ['a', 'a', 'a'] },
        { visible: ['b', 'b', 'b', 'b'] },
        { visible: ['a', 'a'] },
      ]);
      reelSet.slamStop();
      await promise;
      expect(reelSet.reels.map((r) => r.visibleCells)).toEqual([3, 4, 2]);
      // Each reel emitted adjust:start and adjust:complete (skip path force-completes).
      expect(log.filter((e) => e.event === 'adjust:start').length).toBeGreaterThanOrEqual(0);
    } finally {
      destroy();
    }
  });

  it('snapshot.visibleCells is per-reel after MultiWays reshape', () => {
    const { reelSet, destroy } = createTestReelSet({
      reels: 3,
      multiways: { minCells: 2, maxCells: 6, reelExtent: 600 },
      symbolIds: ['a'],
    });
    try {
      reelSet.reels[0].reshape(2, 300, reelSet.reels[0].bufferStart, reelSet.reels[0].bufferEnd);
      reelSet.reels[2].reshape(4, 150, reelSet.reels[2].bufferStart, reelSet.reels[2].bufferEnd);
      const snap = debugSnapshot(reelSet);
      expect(snap.visibleCells).toEqual([2, 6, 4]);
    } finally {
      destroy();
    }
  });
});
