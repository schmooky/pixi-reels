import type { Graphics, Ticker } from 'pixi.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import type { SpinResult } from '../events/ReelEvents.js';

/** Travel direction of the spin. `rtl` scrolls leftward, `ltr` rightward. */
export type HorizontalDirection = 'ltr' | 'rtl';

/** Drop/fall timing for {@link HorizontalReel.cascade}. */
export interface HorizontalCascadeTiming {
  /** Milliseconds a winning symbol takes to fall away. Default 240. */
  fall?: number;
  /** Milliseconds a replacement takes to drop into the empty cell. Default 260. */
  drop?: number;
}

/** Internal config produced by {@link HorizontalReelBuilder.build}. */
export interface HorizontalReelConfig {
  visibleCount: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  direction: HorizontalDirection;
  /** Pixels per frame while spinning. */
  speed: number;
  cascade: Required<HorizontalCascadeTiming>;
  /** Rest frame shown before the first spin - one `ColumnTarget` (this reel). */
  initialFrame: ColumnTarget[];
  configurator: (registry: SymbolRegistry) => void;
  chrome: ((g: Graphics, width: number, height: number) => void) | null;
  ticker: Ticker;
  rng: (() => number) | null;
}

/** Typed events emitted by {@link HorizontalReel} - mirrors the `ReelSet` names + shapes. */
export type HorizontalReelEvents = {
  /** The reel started spinning. */
  'spin:start': [];
  /**
   * The reel landed. Payload is the engine's {@link SpinResult}; for this
   * single reel `symbols` is a one-column grid (`[[...visible]]`).
   */
  'spin:complete': [result: SpinResult];
  /** A cascade finished: `winners` cells fell away and were replaced. */
  'cascade:complete': [{ winners: number[]; symbols: string[] }];
};
