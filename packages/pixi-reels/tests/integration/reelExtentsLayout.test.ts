/**
 * `reelExtents([...])` on a set that is not MultiWays: each reel divides its
 * own box among its cells and lays them out at that pitch, spinning and
 * landed.
 *
 * The builder sized every cell to its share of the box but handed each reel
 * the symbol size as the pitch its strip moves on, and a reel that is not
 * MultiWays never reshapes when it lands. A 4-cell reel in a 300px box drew
 * 75px cells 100px apart, the fourth past the bottom of its mask.
 */
import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import type { ReelSet } from '../../src/core/ReelSet.js';
import type { Orientation } from '../../src/core/ReelAxis.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

const IDS = ['a', 'b', 'c'];

interface Layout {
  cells: number[];
  extents?: number[];
  size?: [number, number];
  gap?: [number, number];
  orientation?: Orientation;
}

function build(layout: Layout): { reelSet: ReelSet; destroy(): void } {
  const ticker = new FakeTicker();
  const builder = new ReelSetBuilder()
    .reels(layout.cells.length)
    .visibleCellsPerReel(layout.cells)
    .symbolSize(...(layout.size ?? [100, 100]))
    .ticker(ticker as unknown as Ticker)
    .symbols((r) => {
      for (const id of IDS) r.register(id, HeadlessSymbol, {});
    });
  if (layout.extents) builder.reelExtents(layout.extents);
  if (layout.gap) builder.symbolGap(...layout.gap);
  if (layout.orientation) builder.orientation(layout.orientation);
  const reelSet = builder.build();
  return {
    reelSet,
    destroy: () => {
      reelSet.destroy();
      ticker.destroy();
    },
  };
}

async function land(reelSet: ReelSet): Promise<void> {
  const spin = reelSet.spin();
  reelSet.setResult(
    reelSet.reels.map((reel) => ({ visible: Array.from({ length: reel.visibleCells }, (_, i) => IDS[i % 3]) })),
  );
  reelSet.slamStop();
  await spin;
}

/**
 * Every visible cell of every reel sits at its own pitch along the strip and
 * inside the reel's box, and so does the symbol in it.
 */
function expectCellsInTheirBoxes(reelSet: ReelSet, main: 'y' | 'x'): void {
  reelSet.reels.forEach((reel, r) => {
    const pitch = reel.cellMain + reel.mainGap;
    expect(reel.motion.slotPitch).toBeCloseTo(pitch, 9);
    for (let c = 0; c < reel.visibleCells; c++) {
      const bounds = reelSet.getCellBounds(r, c);
      const start = main === 'y' ? bounds.y : bounds.x;
      const length = main === 'y' ? bounds.height : bounds.width;
      expect(start).toBeCloseTo(reel.mainOffset + c * pitch, 9);
      expect(start + length).toBeLessThanOrEqual(reel.mainOffset + reel.extent + 1e-9);
      expect(reel.getSymbolAt(c).view[main]).toBeCloseTo(c * pitch, 9);
    }
  });
}

describe('reelExtents() on a set that is not MultiWays', () => {
  it('lays each reel out at its share of the box, built and landed', async () => {
    const { reelSet, destroy } = build({ cells: [3, 4, 5, 4, 3], extents: [300, 300, 300, 300, 300] });
    try {
      expect(reelSet.reels.map((r) => r.cellMain)).toEqual([100, 75, 60, 75, 100]);
      expectCellsInTheirBoxes(reelSet, 'y');
      await land(reelSet);
      expectCellsInTheirBoxes(reelSet, 'y');
    } finally {
      destroy();
    }
  });

  it('fills the box exactly, cells and gaps, on reels of different heights', async () => {
    const { reelSet, destroy } = build({ cells: [3, 4, 3], extents: [320, 320, 200], gap: [6, 10] });
    try {
      await land(reelSet);
      expectCellsInTheirBoxes(reelSet, 'y');
      const reel = reelSet.reels[1];
      const last = reelSet.getCellBounds(1, 3);
      expect(last.y + last.height).toBeCloseTo(reel.mainOffset + 320, 9);
    } finally {
      destroy();
    }
  });

  it('divides a horizontal reel along its width', async () => {
    const { reelSet, destroy } = build({ cells: [3, 4], extents: [300, 300], orientation: 'horizontal' });
    try {
      expect(reelSet.reels.map((r) => r.cellMain)).toEqual([100, 75]);
      await land(reelSet);
      expectCellsInTheirBoxes(reelSet, 'x');
    } finally {
      destroy();
    }
  });

  it('lays out a reel added later in the box it takes', async () => {
    const { reelSet, destroy } = build({ cells: [3, 4, 5, 4, 3], extents: [300, 300, 300, 300, 300] });
    try {
      reelSet.addReels(1, { visibleCells: 4 });
      await land(reelSet);
      expectCellsInTheirBoxes(reelSet, 'y');
    } finally {
      destroy();
    }
  });
});

describe('a set without reelExtents()', () => {
  it('keeps the symbol size as its cell and its pitch, exactly', () => {
    // 203 * 0.55 is a size the old per-reel division drifted off by one bit.
    const height = 203 * 0.55;
    const { reelSet, destroy } = build({ cells: [3, 5, 3], size: [96, height], gap: [4, 4] });
    try {
      for (const reel of reelSet.reels) {
        expect(reel.cellMain).toBe(height);
        expect(reel.symbolHeight).toBe(height);
        expect(reel.motion.slotPitch).toBe(height + 4);
      }
    } finally {
      destroy();
    }
  });
});
