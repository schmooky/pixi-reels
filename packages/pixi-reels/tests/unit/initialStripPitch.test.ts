import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { ReelSymbol } from '../../src/symbols/ReelSymbol.js';
import { FakeTicker } from '../../src/testing/index.js';

class P extends ReelSymbol {
  readonly view = new Container();
  protected onActivate(): void {}
  protected onDeactivate(): void {}
  async playWin(): Promise<void> {}
  stopAnimation(): void {}
  resize(): void {}
}

/**
 * The strip laid out at build must use the same pitch the motion layer uses.
 *
 * `_setupSymbolPositions` added `config.symbolGapY` -- the SCREEN vertical
 * gap -- rather than the axis-projected main gap. On a vertical set the two
 * are the same value, so this was invisible. On a horizontal set the main gap
 * is `symbolGapX`, so the initial strip was laid out at the bare cell size:
 * symbols touched, with no gap, until the first spin handed positions to
 * ReelMotion (which projects correctly) and they silently snapped apart.
 */
const build = (orientation: 'vertical' | 'horizontal') =>
  new ReelSetBuilder()
    .orientation(orientation)
    .reels(1)
    .visibleCells(5)
    .symbolSize(90, 90)
    // Gap on the travel axis for each orientation, zero across it.
    .symbolGap(orientation === 'horizontal' ? 6 : 0, orientation === 'horizontal' ? 0 : 6)
    .symbols((r) => { r.register('a', P, {}); })
    .weights({ a: 10 })
    .ticker(new FakeTicker() as never)
    .build();

describe.each(['vertical', 'horizontal'] as const)('initial strip pitch (%s)', (orientation) => {
  it('spaces symbols by slotPitch, not by the cell size', () => {
    const rs = build(orientation);
    try {
      const reel = rs.getReel(0);
      const axis = orientation === 'vertical' ? 'y' : 'x';
      const at = reel.symbols.map((s) => (s.view as unknown as Record<string, number>)[axis]);
      const steps = at.slice(1).map((v, i) => Math.round(v - at[i]));

      expect(reel.mainGap, 'gap must land on the travel axis').toBe(6);
      expect(reel.motion.slotPitch).toBe(reel.cellMain + reel.mainGap);
      // Every step is one pitch. With the bug this was cellMain (90) on a
      // horizontal set while slotPitch said 96.
      expect(new Set(steps)).toEqual(new Set([reel.motion.slotPitch]));
    } finally {
      rs.destroy();
    }
  });
});
