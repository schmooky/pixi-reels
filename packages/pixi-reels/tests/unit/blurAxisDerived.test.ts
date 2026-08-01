/**
 * `StaticSpinSymbol`'s motion blur must smear ALONG the strip.
 *
 * `MotionBlurOptions.axis` defaulted to `'y'` and its docs told you to pass
 * `{ axis: 'x' }` "for a HorizontalReel" - a class v2 deleted. So a horizontal
 * set using StaticSpinSymbol smeared vertically, across the direction of
 * travel, and nothing anywhere said so: no type error, no throw, just a blur
 * pointing the wrong way. ADR 016 section 5 said this should derive from the
 * reel's orientation, and now it does.
 *
 * The symbol learns its set's travel axis from `SymbolFactory` at create time,
 * the same channel that binds gsap. `resize(width, height)` stays
 * screen-space; this is the one effect that genuinely follows travel.
 */
import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { ReelSymbol } from '../../src/symbols/ReelSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

/** Exposes the protected binding so the test can read what the set bound. */
class AxisProbeSymbol extends ReelSymbol {
  static seen: Array<'x' | 'y'> = [];
  protected onActivate(): void {}
  protected onDeactivate(): void {}
  async playWin(): Promise<void> {}
  stopAnimation(): void {}
  resize(): void {}
  /** Read the protected accessor the blur pipeline uses. */
  readAxis(): 'x' | 'y' {
    return this.mainAxis;
  }
}

const build = (orientation: 'vertical' | 'horizontal') =>
  new ReelSetBuilder()
    .orientation(orientation)
    .reels(2)
    .visibleCells(3)
    .symbolSize(orientation === 'vertical' ? 120 : 100, orientation === 'vertical' ? 100 : 120)
    .symbols((r) => r.register('a', AxisProbeSymbol, {}))
    .weights({ a: 1 })
    .ticker(new FakeTicker() as unknown as Ticker)
    .build();

describe('symbols learn their set travel axis', () => {
  it.each([
    ['vertical', 'y'],
    ['horizontal', 'x'],
  ] as const)('%s set binds mainAxis %s', (orientation, expected) => {
    const set = build(orientation);
    try {
      for (const reel of set.reels) {
        for (const sym of reel.symbols) {
          expect((sym as AxisProbeSymbol).readAxis()).toBe(expected);
        }
      }
    } finally {
      set.destroy();
    }
  });

  it('binds every symbol, including ones created later by a swap', async () => {
    const set = build('horizontal');
    try {
      const spin = set.spin();
      set.setResult([{ visible: ['a', 'a', 'a'] }, { visible: ['a', 'a', 'a'] }]);
      set.slamStop();
      await spin;
      // Pool growth during the spin must not produce unbound symbols.
      for (const reel of set.reels) {
        for (const sym of reel.symbols) {
          expect((sym as AxisProbeSymbol).readAxis()).toBe('x');
        }
      }
    } finally {
      set.destroy();
    }
  });

  it('defaults to vertical for a symbol built outside any set', () => {
    const loose = new AxisProbeSymbol();
    expect(loose.readAxis()).toBe('y');
  });
});
