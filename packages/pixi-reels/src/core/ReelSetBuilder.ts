import type { Ticker } from 'pixi.js';
import type { SpeedProfile, SymbolData, OffsetConfig, ReelSetInternalConfig } from '../config/types.js';
import { DEFAULTS } from '../config/defaults.js';
import { SpeedPresets } from '../config/SpeedPresets.js';
import { ReelSet, type ReelSetParams } from './ReelSet.js';
import { Reel, type ReelConfig } from './Reel.js';
import { ReelViewport } from './ReelViewport.js';
import { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import { SymbolFactory } from '../symbols/SymbolFactory.js';
import { RandomSymbolProvider } from '../frame/RandomSymbolProvider.js';
import { FrameBuilder } from '../frame/FrameBuilder.js';
import { OffsetCalculator } from '../frame/OffsetCalculator.js';
import { PhaseFactory } from '../spin/phases/PhaseFactory.js';
import type { SpinningMode } from '../spin/modes/SpinningMode.js';
import { StandardMode } from '../spin/modes/StandardMode.js';
import type { FrameMiddleware } from '../frame/FrameBuilder.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';

/**
 * The configurator you call before every reel set.
 *
 * `ReelSetBuilder` is a fluent, chainable builder: every call returns the
 * builder so you can string setup onto one expression. It exists for two
 * reasons — it hides the twenty-odd subsystems you'd otherwise have to
 * wire by hand, and its `.build()` step validates that every required
 * piece is present (throws at construction, not at first spin).
 *
 * Required calls (in any order): `.reels(n)`, `.visibleSymbols(n)`,
 * `.symbolSize(w, h)`, `.symbols((registry) => ...)`, `.ticker(app.ticker)`.
 * Optional: `.symbolGap()`, `.weights()`, `.symbolData()`, `.speed()`,
 * `.bufferSymbols()`, `.offset()`, `.frameMiddleware()`, `.phases()`,
 * `.spinningMode()`.
 *
 * Reduces ~100 lines of manual wiring to ~10 lines of configuration.
 *
 * ```ts
 * const reelSet = new ReelSetBuilder()
 *   .reels(5)
 *   .visibleSymbols(3)
 *   .symbolSize(200, 200)
 *   .symbols((r) => {
 *     r.register('cherry', SpriteSymbol, { textures: { cherry: tex } });
 *   })
 *   .weights({ cherry: 20 })
 *   .ticker(app.ticker)
 *   .build();
 * ```
 */
export class ReelSetBuilder {
  private _reelCount?: number;
  private _visibleRows?: number;
  private _symbolWidth?: number;
  private _symbolHeight?: number;
  private _symbolGap = { ...DEFAULTS.symbolGap };
  private _bufferSymbols = DEFAULTS.bufferSymbols;
  private _symbolRegistry = new SymbolRegistry();
  private _weights: Record<string, number> = {};
  private _speeds = new Map<string, SpeedProfile>();
  private _initialSpeed = DEFAULTS.initialSpeed;
  private _offset: OffsetConfig = { mode: 'none' };
  private _ticker?: Ticker;
  private _spinningMode: SpinningMode = new StandardMode();
  private _phaseFactory = new PhaseFactory();
  private _middlewares: FrameMiddleware[] = [];
  private _initialFrame?: string[][];
  private _symbolDataOverrides: Record<string, Partial<SymbolData>> = {};

  /** Set number of reel columns. */
  reels(count: number): this {
    this._reelCount = count;
    return this;
  }

  /** Set number of visible symbol rows per reel. */
  visibleSymbols(count: number): this {
    this._visibleRows = count;
    return this;
  }

  /** Set symbol dimensions in pixels. */
  symbolSize(width: number, height: number): this {
    this._symbolWidth = width;
    this._symbolHeight = height;
    return this;
  }

  /** Set gap between symbols. Default: { x: 0, y: 0 }. */
  symbolGap(x: number, y: number): this {
    this._symbolGap = { x, y };
    return this;
  }

  /** Set number of buffer symbols above/below visible area. Default: 1. */
  bufferSymbols(count: number): this {
    this._bufferSymbols = count;
    return this;
  }

  /** Configure symbols via a registry callback. */
  symbols(configurator: (registry: SymbolRegistry) => void): this {
    configurator(this._symbolRegistry);
    return this;
  }

  /** Set weights for random symbol generation. */
  weights(weights: Record<string, number>): this {
    this._weights = weights;
    return this;
  }

  /**
   * Per-symbol metadata overrides (zIndex, unmask, or a custom weight that
   * replaces the one from `weights()`). Merged into the final symbolsData map
   * — any field you don't specify falls back to the default.
   *
   * @example
   * .symbolData({
   *   wild:  { zIndex: 5 },                // render above neighbours
   *   bonus: { zIndex: 10, unmask: true }, // render outside the reel mask
   * })
   */
  symbolData(overrides: Record<string, Partial<SymbolData>>): this {
    this._symbolDataOverrides = { ...this._symbolDataOverrides, ...overrides };
    return this;
  }

  /** Add a named speed profile. */
  speed(name: string, profile: SpeedProfile): this {
    this._speeds.set(name, profile);
    return this;
  }

  /** Set which speed profile to use initially. Default: 'normal'. */
  initialSpeed(name: string): this {
    this._initialSpeed = name;
    return this;
  }

  /** Set X-axis offset config (e.g., trapezoid perspective). Default: 'none'. */
  offsetConfig(config: OffsetConfig): this {
    this._offset = config;
    return this;
  }

  /** Set the PixiJS ticker for frame updates. */
  ticker(ticker: Ticker): this {
    this._ticker = ticker;
    return this;
  }

  /** Set the spinning mode. Default: StandardMode. */
  spinningMode(mode: SpinningMode): this {
    this._spinningMode = mode;
    return this;
  }

  /** Add custom frame middleware. */
  frameMiddleware(middleware: FrameMiddleware): this {
    this._middlewares.push(middleware);
    return this;
  }

  /** Override default phases. */
  phases(configurator: (factory: PhaseFactory) => void): this {
    configurator(this._phaseFactory);
    return this;
  }

  /** Set the initial symbol grid (visible symbols only). */
  initialFrame(frame: string[][]): this {
    this._initialFrame = frame;
    return this;
  }

  /** Build the ReelSet. Validates configuration and assembles all internal objects. */
  build(): ReelSet {
    this._validate();

    const reelCount = this._reelCount!;
    const visibleRows = this._visibleRows!;
    const symbolWidth = this._symbolWidth!;
    const symbolHeight = this._symbolHeight!;
    const bufferAbove = this._bufferSymbols;
    const bufferBelow = this._bufferSymbols;
    const ticker = this._ticker!;

    // Apply default speed if none registered
    if (this._speeds.size === 0) {
      this._speeds.set('normal', SpeedPresets.NORMAL);
    }

    // Build symbols data from weights + per-symbol overrides
    const symbolsData: Record<string, SymbolData> = {};
    const symbolIds = this._symbolRegistry.symbolIds;
    for (const id of symbolIds) {
      const override = this._symbolDataOverrides[id] ?? {};
      symbolsData[id] = {
        weight: override.weight ?? this._weights[id] ?? 10,
        zIndex: override.zIndex ?? 1,
        unmask: override.unmask,
      };
    }

    // Build internal config
    const config: ReelSetInternalConfig = {
      grid: {
        reelCount,
        visibleRows,
        symbolWidth,
        symbolHeight,
        symbolGap: { ...this._symbolGap },
        bufferSymbols: this._bufferSymbols,
      },
      symbols: symbolsData,
      speeds: this._speeds,
      initialSpeed: this._initialSpeed,
      offset: this._offset,
      ticker,
    };

    // Create subsystems
    const symbolFactory = new SymbolFactory(this._symbolRegistry);
    const randomProvider = new RandomSymbolProvider(symbolsData);
    const frameBuilder = new FrameBuilder(randomProvider);

    // Add custom middlewares
    for (const mw of this._middlewares) {
      frameBuilder.use(mw);
    }

    // Create viewport
    const viewportWidth = reelCount * (symbolWidth + this._symbolGap.x) - this._symbolGap.x;
    const viewportHeight = visibleRows * (symbolHeight + this._symbolGap.y) - this._symbolGap.y;
    const viewport = new ReelViewport(viewportWidth, viewportHeight);

    // Create offset calculator
    const totalRows = bufferAbove + visibleRows + bufferBelow;
    const offsetCalc = new OffsetCalculator(
      reelCount,
      totalRows,
      symbolWidth,
      this._offset,
    );

    // Create initial frames
    const initialFrames = this._initialFrame
      ? frameBuilder.buildAll(reelCount, visibleRows, bufferAbove, bufferBelow, this._initialFrame)
      : frameBuilder.buildAll(reelCount, visibleRows, bufferAbove, bufferBelow);

    // Create reels
    const reels: Reel[] = [];
    for (let reelIndex = 0; reelIndex < reelCount; reelIndex++) {
      const reelConfig: ReelConfig = {
        reelIndex,
        visibleRows,
        bufferAbove,
        bufferBelow,
        symbolWidth,
        symbolHeight,
        symbolGapX: this._symbolGap.x,
        symbolGapY: this._symbolGap.y,
        symbolsData,
        initialSymbols: initialFrames[reelIndex],
      };

      const reel = new Reel(reelConfig, symbolFactory, randomProvider, viewport);
      reels.push(reel);
    }

    // Build params
    const params: ReelSetParams = {
      config,
      reels,
      viewport,
      symbolFactory,
      frameBuilder,
      phaseFactory: this._phaseFactory,
      spinningMode: this._spinningMode,
    };

    return new ReelSet(params);
  }

  private _validate(): void {
    const errors: string[] = [];

    if (this._reelCount === undefined || this._reelCount <= 0) {
      errors.push('reels() must be called with a positive number.');
    }
    if (this._visibleRows === undefined || this._visibleRows <= 0) {
      errors.push('visibleSymbols() must be called with a positive number.');
    }
    if (this._symbolWidth === undefined || this._symbolHeight === undefined) {
      errors.push('symbolSize() must be called with width and height.');
    }
    if (this._symbolRegistry.size === 0) {
      errors.push('symbols() must register at least one symbol.');
    }
    if (!this._ticker) {
      errors.push('ticker() must be called with a PixiJS Ticker.');
    }
    if (this._speeds.size > 0 && !this._speeds.has(this._initialSpeed)) {
      errors.push(
        `initialSpeed '${this._initialSpeed}' does not match any registered speed profile. ` +
        `Available: ${[...this._speeds.keys()].join(', ')}`,
      );
    }

    if (errors.length > 0) {
      throw new Error(`ReelSetBuilder validation failed:\n  - ${errors.join('\n  - ')}`);
    }
  }
}
