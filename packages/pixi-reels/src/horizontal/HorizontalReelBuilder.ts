import type { Graphics, Ticker } from 'pixi.js';
import { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import { HorizontalReel } from './HorizontalReel.js';
import type {
  HorizontalCascadeOptions,
  HorizontalDirection,
} from './HorizontalReelTypes.js';

/**
 * Fluent builder for {@link HorizontalReel} — the sideways "these symbols pay
 * this round" banner above the reels.
 *
 * Its API mirrors {@link ReelSetBuilder}: register `.symbols(...)`, give it a
 * `.ticker(...)`, and `.build()`. The reel then follows the engine's spin
 * contract — `spin()` then `setResult(ids)` then `await` the land. Only
 * `.symbols(...)` and `.ticker(...)` are required; everything else defaults
 * (a 4-wide, 72px, right-to-left smooth-scroll strip — the `1×4 reel` shape).
 */
export class HorizontalReelBuilder {
  private _visibleCount = 4;
  private _cellW = 72;
  private _cellH = 72;
  private _gap = 4;
  private _direction: HorizontalDirection = 'rtl';
  private _mode: 'scroll' | 'cascade' = 'scroll';
  private _speed = 22;
  private _cascade: Required<HorizontalCascadeOptions> = { interval: 90, duration: 220 };
  private _initialResult: string[] | null = null;
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

  /** Smooth marquee spin at `pxPerFrame` (default motion). */
  scroll(pxPerFrame = 22): this {
    this._mode = 'scroll';
    this._speed = pxPerFrame;
    return this;
  }

  /** Discrete one-cell stepping spin — the tumble reveal laid sideways. */
  cascade(opts: HorizontalCascadeOptions = {}): this {
    this._mode = 'cascade';
    this._cascade = {
      interval: opts.interval ?? this._cascade.interval,
      duration: opts.duration ?? this._cascade.duration,
    };
    return this;
  }

  /**
   * Register the symbol classes shown on the strip, exactly like
   * `ReelSetBuilder.symbols`. The spin blur feeds from these ids; every id
   * passed to `setResult(...)` must be registered here. Required.
   */
  symbols(configurator: (registry: SymbolRegistry) => void): this {
    this._configurator = configurator;
    return this;
  }

  /**
   * Visible symbols shown at rest before the first spin (`visibleCount` long).
   * Defaults to the first `visibleCount` registered ids.
   */
  initialResult(ids: string[]): this {
    this._initialResult = [...ids];
    return this;
  }

  /** Optional backing drawn behind the strip, sized to the visible window. */
  chrome(draw: (g: Graphics, width: number, height: number) => void): this {
    this._chrome = draw;
    return this;
  }

  /** Injected RNG for the spin blur (deterministic demos / tests). */
  rng(fn: () => number): this {
    this._rng = fn;
    return this;
  }

  /** Drives the spin — required. */
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
    // Default the rest display to the first registered ids.
    let initial = this._initialResult;
    if (!initial) {
      const reg = new SymbolRegistry();
      this._configurator(reg);
      const ids = reg.symbolIds;
      initial = Array.from({ length: this._visibleCount }, (_, i) => ids[i % ids.length]);
    }
    return new HorizontalReel({
      visibleCount: this._visibleCount,
      cellWidth: this._cellW,
      cellHeight: this._cellH,
      gap: this._gap,
      direction: this._direction,
      mode: this._mode,
      speed: this._speed,
      cascade: this._cascade,
      initialResult: initial,
      configurator: this._configurator,
      chrome: this._chrome,
      ticker: this._ticker,
      rng: this._rng,
    });
  }
}
