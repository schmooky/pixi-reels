import type { Graphics, Ticker } from 'pixi.js';
import { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import { HorizontalReel } from './HorizontalReel.js';
import type {
  HorizontalCascadeTiming,
  HorizontalDirection,
} from './HorizontalReelTypes.js';

/**
 * Fluent builder for {@link HorizontalReel} - the sideways "these symbols pay
 * this round" banner reel above the reels.
 *
 * Its API mirrors {@link ReelSetBuilder}: register `.symbols(...)`, give it a
 * `.ticker(...)`, and `.build()`. The reel then follows the engine's spin
 * contract (`spin()` then `setResult(ids)`) plus a `cascade(...)` tumble. Only
 * `.symbols(...)` and `.ticker(...)` are required; everything else defaults
 * (a 4-wide, 72px, right-to-left reel - the `1×4` shape).
 */
export class HorizontalReelBuilder {
  private _visibleCount = 4;
  private _cellW = 72;
  private _cellH = 72;
  private _gap = 4;
  private _direction: HorizontalDirection = 'rtl';
  private _speed = 22;
  private _cascade: Required<HorizontalCascadeTiming> = { fall: 240, drop: 260 };
  private _initialFrame: ColumnTarget[] | null = null;
  private _configurator: ((registry: SymbolRegistry) => void) | null = null;
  private _chrome: ((g: Graphics, width: number, height: number) => void) | null = null;
  private _ticker: Ticker | null = null;
  private _rng: (() => number) | null = null;

  /** How many symbol cells are visible at once. Default 4 (the `1×4` strip). */
  visibleCount(n: number): this {
    if (n < 1) throw new Error('HorizontalReelBuilder: visibleCount must be >= 1.');
    this._visibleCount = n;
    return this;
  }

  /** Cell dimensions. `height` defaults to `width` (square); `gap` defaults to 4. */
  cellSize(width: number, height: number = width, opts: { gap?: number } = {}): this {
    this._cellW = width;
    this._cellH = height;
    this._gap = opts.gap ?? this._gap;
    return this;
  }

  /** Travel direction while spinning. `rtl` scrolls leftward (default), `ltr` rightward. */
  direction(direction: HorizontalDirection): this {
    this._direction = direction;
    return this;
  }

  /** Spin speed in pixels per frame. Default 22. */
  spinSpeed(pxPerFrame: number): this {
    this._speed = pxPerFrame;
    return this;
  }

  /** Drop/fall timing for `cascade(...)`. */
  cascadeTiming(opts: HorizontalCascadeTiming): this {
    this._cascade = {
      fall: opts.fall ?? this._cascade.fall,
      drop: opts.drop ?? this._cascade.drop,
    };
    return this;
  }

  /**
   * Register the symbol classes shown on the reel, exactly like
   * `ReelSetBuilder.symbols`. The spin blur feeds from these ids; every id
   * passed to `setResult(...)` / `cascade(...)` must be registered here.
   * Required.
   */
  symbols(configurator: (registry: SymbolRegistry) => void): this {
    this._configurator = configurator;
    return this;
  }

  /**
   * Rest frame shown before the first spin - the same `ColumnTarget[]` as
   * `ReelSetBuilder.initialFrame`. This reel is one column, so pass exactly one
   * entry whose `visible` holds `visibleCount` ids. Defaults to the first
   * `visibleCount` registered ids.
   */
  initialFrame(frame: ColumnTarget[]): this {
    this._initialFrame = frame;
    return this;
  }

  /** Optional backing drawn behind the reel, sized to the visible window. */
  chrome(draw: (g: Graphics, width: number, height: number) => void): this {
    this._chrome = draw;
    return this;
  }

  /** Injected RNG for the spin blur (deterministic demos / tests). */
  rng(fn: () => number): this {
    this._rng = fn;
    return this;
  }

  /** Drives the spin - required. */
  ticker(ticker: Ticker): this {
    this._ticker = ticker;
    return this;
  }

  build(): HorizontalReel {
    if (!this._configurator) {
      throw new Error('HorizontalReelBuilder: .symbols(...) is required.');
    }
    if (!this._ticker) {
      throw new Error('HorizontalReelBuilder: .ticker(...) is required.');
    }
    // Default the rest frame to the first registered ids.
    let initialFrame = this._initialFrame;
    if (!initialFrame) {
      const reg = new SymbolRegistry();
      this._configurator(reg);
      const ids = reg.symbolIds;
      const visible = Array.from({ length: this._visibleCount }, (_, i) => ids[i % ids.length]);
      initialFrame = [{ visible }];
    }
    return new HorizontalReel({
      visibleCount: this._visibleCount,
      cellWidth: this._cellW,
      cellHeight: this._cellH,
      gap: this._gap,
      direction: this._direction,
      speed: this._speed,
      cascade: this._cascade,
      initialFrame,
      configurator: this._configurator,
      chrome: this._chrome,
      ticker: this._ticker,
      rng: this._rng,
    });
  }
}
