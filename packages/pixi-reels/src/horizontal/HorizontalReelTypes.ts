import type { Graphics, Ticker } from 'pixi.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';

/** Travel direction of the strip. `rtl` scrolls leftward, `ltr` rightward. */
export type HorizontalDirection = 'ltr' | 'rtl';

/**
 * How the strip moves while spinning.
 *   - `scroll` — smooth, continuous pixel motion (a classic marquee blur).
 *   - `cascade` — discrete stepping: ease one cell over, repeat.
 */
export type HorizontalMode = 'scroll' | 'cascade';

/** Cascade-mode timing. */
export interface HorizontalCascadeOptions {
  /** Milliseconds the strip rests between steps. Default 90. */
  interval?: number;
  /** Milliseconds each one-cell shift takes. Default 220. */
  duration?: number;
}

/** The landed result of a spin — mirrors `ReelSet`'s `SpinResult`. */
export interface HorizontalSpinResult {
  /** The visible symbol ids, left-to-right, after the strip landed. */
  symbols: string[];
}

/** Internal config produced by {@link HorizontalReelBuilder.build}. */
export interface HorizontalReelConfig {
  visibleCount: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  direction: HorizontalDirection;
  mode: HorizontalMode;
  /** Pixels per frame while spinning in `scroll` mode. */
  speed: number;
  cascade: Required<HorizontalCascadeOptions>;
  /** Visible symbols shown at rest before the first spin. */
  initialResult: string[];
  configurator: (registry: SymbolRegistry) => void;
  chrome: ((g: Graphics, width: number, height: number) => void) | null;
  ticker: Ticker;
  rng: (() => number) | null;
}

/** Typed events emitted by {@link HorizontalReel} — mirrors the `ReelSet` names. */
export type HorizontalReelEvents = {
  /** The strip started spinning. */
  'spin:start': [];
  /** The strip landed. Payload is the same result the `spin()` promise resolves with. */
  'spin:complete': [result: HorizontalSpinResult];
};
