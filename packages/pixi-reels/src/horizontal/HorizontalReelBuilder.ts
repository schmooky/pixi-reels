import type { Graphics, Ticker } from 'pixi.js';
import type { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import { HorizontalReel } from './HorizontalReel.js';
import type {
  HorizontalCascadeOptions,
  HorizontalDirection,
} from './HorizontalReelTypes.js';

/**
 * Fluent builder for {@link HorizontalReel} — the sideways "these symbols pay
 * this round" banner that sits above the reels.
 *
 * Only `.symbols(...)`, `.content(...)` and `.ticker(...)` are required; every
 * other setting has a sensible default (a 4-wide, 72px, right-to-left smooth
 * scroll — the `1×4 reel` shape). Call `.scroll(px)` or `.cascade(...)` to pick
 * the motion; the last of the two wins.
 */
export class HorizontalReelBuilder {
  private _visibleCount = 4;
  private _cellW = 72;
  private _cellH = 72;
  private _gap = 4;
  private _direction: HorizontalDirection = 'rtl';
  private _mode: 'scroll' | 'cascade' = 'scroll';
  private _speed = 1.4;
  private _cascade: Required<HorizontalCascadeOptions> = { interval: 900, duration: 320 };
  private _content: string[] | null = null;
  private _configurator: ((registry: SymbolRegistry) => void) | null = null;
  private _chrome: ((g: Graphics, width: number, height: number) => void) | null = null;
  private _ticker: Ticker | null = null;
  private _autoStart = true;

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

  /** Travel direction. `rtl` scrolls leftward (default), `ltr` rightward. */
  direction(direction: HorizontalDirection): this {
    this._direction = direction;
    return this;
  }

  /** Smooth marquee mode at `pxPerFrame` (default motion). */
  scroll(pxPerFrame = 1.4): this {
    this._mode = 'scroll';
    this._speed = pxPerFrame;
    return this;
  }

  /** Discrete one-cell stepping mode — the tumble reveal laid sideways. */
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
   * `ReelSetBuilder.symbols`. Every id used in `.content(...)` must be registered
   * here.
   */
  symbols(configurator: (registry: SymbolRegistry) => void): this {
    this._configurator = configurator;
    return this;
  }

  /** The looping sequence of symbol ids the strip cycles through. Required. */
  content(ids: string[]): this {
    this._content = [...ids];
    return this;
  }

  /** Optional backing drawn behind the strip, sized to the visible window. */
  chrome(draw: (g: Graphics, width: number, height: number) => void): this {
    this._chrome = draw;
    return this;
  }

  /** Drives the motion — required. */
  ticker(ticker: Ticker): this {
    this._ticker = ticker;
    return this;
  }

  /** Start motion on build. Default true; pass false to build paused. */
  autoStart(on: boolean): this {
    this._autoStart = on;
    return this;
  }

  build(): HorizontalReel {
    if (!this._configurator) {
      throw new Error('HorizontalReelBuilder: .symbols(...) is required.');
    }
    if (!this._content || this._content.length === 0) {
      throw new Error('HorizontalReelBuilder: .content(...) is required (at least one id).');
    }
    if (!this._ticker) {
      throw new Error('HorizontalReelBuilder: .ticker(...) is required.');
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
      content: this._content,
      configurator: this._configurator,
      chrome: this._chrome,
      ticker: this._ticker,
      autoStart: this._autoStart,
    });
  }
}
