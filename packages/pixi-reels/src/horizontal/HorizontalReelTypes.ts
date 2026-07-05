import type { Graphics, Ticker } from 'pixi.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';

/** Travel direction of the strip. `rtl` scrolls leftward, `ltr` rightward. */
export type HorizontalDirection = 'ltr' | 'rtl';

/**
 * How the strip advances.
 *   - `scroll` — smooth, continuous pixel motion (a classic marquee).
 *   - `cascade` — discrete stepping: hold, then ease one cell over, repeat.
 *     The stepped reveal every tumble/cascade game uses, laid on its side.
 */
export type HorizontalMode = 'scroll' | 'cascade';

/** Cascade-mode timing. */
export interface HorizontalCascadeOptions {
  /** Milliseconds the strip rests between steps. Default 900. */
  interval?: number;
  /** Milliseconds each one-cell shift takes. Default 320. */
  duration?: number;
}

/** Internal config produced by {@link HorizontalReelBuilder.build}. */
export interface HorizontalReelConfig {
  visibleCount: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  direction: HorizontalDirection;
  mode: HorizontalMode;
  /** Pixels per frame in `scroll` mode. */
  speed: number;
  cascade: Required<HorizontalCascadeOptions>;
  content: string[];
  configurator: (registry: SymbolRegistry) => void;
  chrome: ((g: Graphics, width: number, height: number) => void) | null;
  ticker: Ticker;
  /** Start scrolling immediately on build. Default true. */
  autoStart: boolean;
}

/** Typed events emitted by {@link HorizontalReel}. */
export type HorizontalReelEvents = {
  /**
   * A fresh symbol wrapped into view from the feed edge — the moment a new
   * "this symbol pays" tile appears. `edge` is the side it entered from.
   */
  'symbol:entered': [{ id: string; edge: 'left' | 'right' }];
  /** One cascade step finished settling (cascade mode only). */
  'cascade:step': [{ step: number }];
};
