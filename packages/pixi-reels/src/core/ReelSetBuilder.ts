import type { Ticker } from 'pixi.js';
import type {
  SpeedProfile,
  SymbolData,
  OffsetConfig,
  ReelSetInternalConfig,
  MultiWaysConfig,
  ReelAnchor,
} from '../config/types.js';
import type { ReelMaskRect, MaskStrategy } from './ReelViewport.js';
import { RectMaskStrategy } from './ReelViewport.js';
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
import { CascadeMode } from '../spin/modes/CascadeMode.js';
import type { FrameMiddleware } from '../frame/FrameBuilder.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { CascadeDropConfig } from '../cascade/DropRecipes.js';
import { DropStartPhase } from '../spin/phases/DropStartPhase.js';
import { DropStopPhase } from '../spin/phases/DropStopPhase.js';
import { AdjustPhase } from '../spin/phases/AdjustPhase.js';

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
  private _cascadeDropConfig?: CascadeDropConfig;
  /** Per-reel static row counts (jagged shapes like 3-5-5-5-3). */
  private _visibleRowsPerReel?: number[];
  /** Per-reel pixel-box heights — used for both pyramids and MultiWays. */
  private _reelPixelHeights?: number[];
  /** Vertical alignment of short reels inside the tallest reel's box. */
  private _reelAnchor: ReelAnchor = 'center';
  /** MultiWays configuration. Set by `.multiways(...)`. */
  private _multiways?: MultiWaysConfig;
  /** Per-reel AdjustPhase tween duration in ms (MultiWays only). */
  private _pinMigrationDuration: number | ((reelIndex: number) => number) = 200;
  /** GSAP easing string used by AdjustPhase. Default: 'power2.out'. */
  private _pinMigrationEase = 'power2.out';
  /** Mask strategy. Default: per-reel `RectMaskStrategy`. */
  private _maskStrategy: MaskStrategy = new RectMaskStrategy();

  /** Set number of reel columns. */
  reels(count: number): this {
    this._reelCount = count;
    return this;
  }

  /**
   * Number of visible rows per reel (uniform across all reels).
   * Mutually exclusive with `visibleRowsPerReel()` — calling both throws
   * at `build()`.
   *
   * @example
   * builder.reels(5).visibleRows(3)  // classic 5x3
   */
  visibleRows(count: number): this {
    this._visibleRows = count;
    return this;
  }

  /**
   * Alias of {@link visibleRows} — kept for backwards compatibility with
   * the original API. New code should prefer `visibleRows(n)` so the
   * naming aligns with `visibleRowsPerReel([...])` (both are about rows;
   * the original name pre-dated jagged shapes).
   *
   * @deprecated Use `visibleRows(n)` instead.
   */
  visibleSymbols(count: number): this {
    return this.visibleRows(count);
  }

  /**
   * Per-reel static row counts. Length MUST equal `reels()`. Mutually
   * exclusive with `visibleRows()` / `visibleSymbols()` — calling both
   * throws at `build()`.
   *
   * @example
   * builder.reels(5).visibleRowsPerReel([3, 5, 5, 5, 3])  // pyramid
   */
  visibleRowsPerReel(rows: number[]): this {
    this._visibleRowsPerReel = [...rows];
    return this;
  }

  /**
   * Per-reel pixel-box heights. Length MUST equal `reels()`.
   *
   *   - Pyramid: defaults to `visibleRowsPerReel[i] * symbolHeight`. Override
   *     to make all reels the same height with different cell heights per
   *     reel.
   *   - MultiWays: every entry equals the same fixed reel height. Cell
   *     height per reel is derived as `reelPixelHeight / visibleRows[i]`.
   *
   * Precedence: when both `reelPixelHeights` and `reelAnchor` are set,
   * `reelPixelHeights` wins — anchor is derived from the explicit boxes.
   */
  reelPixelHeights(heights: number[]): this {
    this._reelPixelHeights = [...heights];
    return this;
  }

  /** Vertical alignment of short reels inside the tallest reel's box. Default 'center'. */
  reelAnchor(anchor: ReelAnchor): this {
    this._reelAnchor = anchor;
    return this;
  }

  /**
   * Custom mask strategy for the viewport. Defaults to {@link RectMaskStrategy}
   * (one clip rect per reel — clean for pyramid + uniform layouts).
   *
   * Use {@link SharedRectMaskStrategy} when reels have horizontal gaps
   * AND symbols (typically big symbols) need to overlap across reel
   * boundaries — the per-reel default would clip them at the gaps.
   *
   * Or pass any custom `MaskStrategy` for non-rectangular masks (rounded
   * frames, hexagonal grids, etc.).
   *
   * @example
   * import { SharedRectMaskStrategy } from 'pixi-reels';
   * builder.maskStrategy(new SharedRectMaskStrategy())
   */
  maskStrategy(strategy: MaskStrategy): this {
    this._maskStrategy = strategy;
    return this;
  }

  /**
   * Configure this slot as MultiWays: per-spin row variation. Pass minRows,
   * maxRows, and the fixed reel pixel height. After build, call
   * `reelSet.setShape(rowsPerReel)` mid-spin to set the next stop's shape.
   *
   * Mutually exclusive with big-symbol registration (`SymbolData.size`).
   * Mutually exclusive with cascade mode in v1.
   */
  multiways(config: MultiWaysConfig): this {
    this._multiways = { ...config };
    return this;
  }

  /**
   * AdjustPhase tween duration in ms (MultiWays only). Pass a number for a
   * uniform duration across reels, or a function `(reelIndex) => number`
   * for per-reel control. Default: 200. Pass `0` for an instant snap (no
   * tween).
   *
   * AdjustPhase plays on top of whatever stop staggering you've configured
   * — its duration is independent of `stopDelay`.
   */
  pinMigrationDuration(value: number | ((reelIndex: number) => number)): this {
    this._pinMigrationDuration = value;
    return this;
  }

  /**
   * GSAP easing string used by AdjustPhase tweens (MultiWays only).
   * Applied to both the cell-resize tween and any pin-overlay migration
   * tween. Defaults to `'power2.out'`. See gsap.com/docs/v3/Eases for
   * the full vocabulary.
   *
   * @example
   * builder.pinMigrationEase('back.out(1.4)')          // pop-in feel
   * builder.pinMigrationEase('expo.inOut')             // slow start + slow end
   */
  pinMigrationEase(ease: string): this {
    this._pinMigrationEase = ease;
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

  /**
   * Enable cascade drop-in mechanics.
   *
   * Replaces the strip-spin + bounce stop cycle with a stationary wait
   * followed by symbols dropping in from above the viewport.
   *
   * Usage is identical to standard spin — `spin()` / `setResult()` / `await`.
   * Use `reelSet.setDropOrder()` to control which columns drop first.
   *
   * @example
   * import { DropRecipes } from 'pixi-reels';
   * builder.cascade(DropRecipes.cascadeDrop)
   */
  cascade(config: CascadeDropConfig): this {
    this._cascadeDropConfig = config;
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
    const symbolWidth = this._symbolWidth!;
    const symbolHeight = this._symbolHeight!;
    const bufferAbove = this._bufferSymbols;
    const bufferBelow = this._bufferSymbols;
    const ticker = this._ticker!;
    const isMultiWays = !!this._multiways;

    // Resolve per-reel row counts. MultiWays: every reel starts at maxRows.
    let visibleRowsPerReel: number[];
    if (isMultiWays) {
      visibleRowsPerReel = new Array(reelCount).fill(this._multiways!.maxRows);
    } else if (this._visibleRowsPerReel) {
      visibleRowsPerReel = this._visibleRowsPerReel;
    } else {
      const v = this._visibleRows!;
      visibleRowsPerReel = new Array(reelCount).fill(v);
    }

    // Resolve per-reel pixel-box heights. MultiWays: uniform reelPixelHeight.
    // Pyramid: defaults to visibleRowsPerReel[i] * symbolHeight.
    let reelPixelHeights: number[];
    if (isMultiWays) {
      reelPixelHeights = new Array(reelCount).fill(this._multiways!.reelPixelHeight);
    } else if (this._reelPixelHeights) {
      reelPixelHeights = this._reelPixelHeights;
    } else {
      reelPixelHeights = visibleRowsPerReel.map(
        (rows) => rows * symbolHeight + (rows - 1) * this._symbolGap.y,
      );
    }

    // Compute per-reel offsetY and target cell height.
    // SPIN-time uniform cell height equals the configured `symbolHeight`.
    const tallest = Math.max(...reelPixelHeights);
    const offsetsY = reelPixelHeights.map((h) => {
      switch (this._reelAnchor) {
        case 'top': return 0;
        case 'bottom': return tallest - h;
        case 'center':
        default: return (tallest - h) / 2;
      }
    });
    const perReelSymbolHeight: number[] = reelPixelHeights.map((h, i) => {
      const rows = visibleRowsPerReel[i];
      return (h - (rows - 1) * this._symbolGap.y) / rows;
    });
    // MultiWays uses uniform spinSymbolHeight = configured symbolHeight.
    // Pyramid: per-reel cell height. Uniform: same as symbolHeight.
    const spinSymbolHeight = symbolHeight;
    const initialSymbolHeight = isMultiWays
      ? new Array(reelCount).fill(spinSymbolHeight)
      : perReelSymbolHeight;

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
        size: override.size,
      };
    }

    // Build internal config
    const config: ReelSetInternalConfig = {
      grid: {
        reelCount,
        visibleRows: this._visibleRows ?? visibleRowsPerReel[0],
        symbolWidth,
        symbolHeight,
        symbolGap: { ...this._symbolGap },
        bufferSymbols: this._bufferSymbols,
        visibleRowsPerReel,
        reelPixelHeights,
        reelAnchor: this._reelAnchor,
        multiways: this._multiways,
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

    // Wire cascade drop-in phases if configured
    if (this._cascadeDropConfig) {
      const dropConfig = this._cascadeDropConfig;
      this._phaseFactory.register('start', DropStartPhase);
      this._phaseFactory.registerFactory('stop', (reel, speed) => new DropStopPhase(reel, speed, dropConfig));
    }

    // MultiWays: wire AdjustPhase. Stay out of non-MultiWays chains entirely
    // so the default `start → spin → stop` flow is unchanged for them.
    if (isMultiWays) {
      const adjustDur = this._pinMigrationDuration;
      const pinMigrationEase = this._pinMigrationEase;
      this._phaseFactory.registerFactory('adjust', (reel, speed) => {
        const ms = typeof adjustDur === 'function' ? adjustDur(reel.reelIndex) : adjustDur;
        return new AdjustPhase(reel, speed, { durationMs: ms, ease: pinMigrationEase });
      });
    }

    // Create viewport — width covers all reels, height covers tallest box.
    const viewportWidth = reelCount * (symbolWidth + this._symbolGap.x) - this._symbolGap.x;
    const viewportHeight = tallest;
    const viewport = new ReelViewport(viewportWidth, viewportHeight, undefined, this._maskStrategy);

    // Create offset calculator (X-axis)
    const totalRowsForOffset = bufferAbove + Math.max(...visibleRowsPerReel) + bufferBelow;
    const offsetCalc = new OffsetCalculator(
      reelCount,
      totalRowsForOffset,
      symbolWidth,
      this._offset,
    );

    // Create reels with per-reel geometry.
    const reels: Reel[] = [];
    const maskRects: ReelMaskRect[] = [];
    for (let reelIndex = 0; reelIndex < reelCount; reelIndex++) {
      const rows = visibleRowsPerReel[reelIndex];
      const initialCellH = initialSymbolHeight[reelIndex];

      // Per-reel initial frame at its own visibleRows count.
      const initialFrame = this._initialFrame
        ? frameBuilder.build(reelIndex, rows, bufferAbove, bufferBelow, this._initialFrame[reelIndex])
        : frameBuilder.build(reelIndex, rows, bufferAbove, bufferBelow);

      const reelConfig: ReelConfig = {
        reelIndex,
        visibleRows: rows,
        bufferAbove,
        bufferBelow,
        symbolWidth,
        symbolHeight: initialCellH,
        symbolGapX: this._symbolGap.x,
        symbolGapY: this._symbolGap.y,
        symbolsData,
        initialSymbols: initialFrame,
        offsetY: offsetsY[reelIndex],
        reelHeight: reelPixelHeights[reelIndex],
        spinSymbolHeight,
      };

      const reel = new Reel(reelConfig, symbolFactory, randomProvider, viewport);
      reels.push(reel);
      maskRects.push({
        x: reelIndex * (symbolWidth + this._symbolGap.x),
        y: offsetsY[reelIndex],
        width: symbolWidth,
        height: reelPixelHeights[reelIndex],
      });
    }
    viewport.updateMaskSize(viewportWidth, viewportHeight, maskRects);

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

    const hasShape = !!this._visibleRowsPerReel;
    const hasUniform = this._visibleRows !== undefined;
    const hasMega = !!this._multiways;

    if (!hasMega && !hasUniform && !hasShape) {
      errors.push('one of visibleRows(n) or visibleRowsPerReel([...]) or multiways({...}) must be called.');
    }
    if (hasUniform && hasShape) {
      errors.push('cannot call both visibleRows() and visibleRowsPerReel() — pick one.');
    }
    if (hasMega && hasShape) {
      errors.push('cannot combine multiways() with visibleRowsPerReel() — MultiWays shapes are server-driven.');
    }

    if (this._reelCount && hasShape && this._visibleRowsPerReel!.length !== this._reelCount) {
      errors.push(
        `visibleRowsPerReel length ${this._visibleRowsPerReel!.length} must equal reels(${this._reelCount}).`,
      );
    }
    if (hasShape) {
      for (let i = 0; i < this._visibleRowsPerReel!.length; i++) {
        if (this._visibleRowsPerReel![i] <= 0) {
          errors.push(`visibleRowsPerReel[${i}] = ${this._visibleRowsPerReel![i]} must be positive.`);
          break;
        }
      }
    }
    if (this._reelCount && this._reelPixelHeights && this._reelPixelHeights.length !== this._reelCount) {
      errors.push(
        `reelPixelHeights length ${this._reelPixelHeights.length} must equal reels(${this._reelCount}).`,
      );
    }

    if (hasMega) {
      const m = this._multiways!;
      if (m.minRows <= 0 || m.maxRows <= 0) {
        errors.push('multiways({minRows, maxRows}) must both be positive.');
      } else if (m.minRows > m.maxRows) {
        errors.push(`multiways: minRows ${m.minRows} cannot exceed maxRows ${m.maxRows}.`);
      }
      if (m.reelPixelHeight <= 0) {
        errors.push('multiways({reelPixelHeight}) must be positive.');
      }
      if (this._spinningMode instanceof CascadeMode || this._cascadeDropConfig) {
        errors.push('multiways() is not supported with cascade mode in v1.');
      }
      // multiways({reelPixelHeight}) sets a uniform reel-pixel height for
      // every reel; reelPixelHeights([...]) sets per-reel heights for
      // pyramid layouts. Setting both is ambiguous — fail loud.
      if (this._reelPixelHeights) {
        errors.push(
          'cannot combine multiways({reelPixelHeight}) with reelPixelHeights([...]) — ' +
          'multiways slots use a uniform reel pixel height. Drop reelPixelHeights() or ' +
          'remove the multiways() configuration.',
        );
      }
      // Big symbols are mutually exclusive with MultiWays.
      for (const id of this._symbolRegistry.symbolIds) {
        const override = this._symbolDataOverrides[id] ?? {};
        if (override.size && (override.size.w > 1 || override.size.h > 1)) {
          errors.push(
            `big symbol '${id}' (size ${override.size.w}x${override.size.h}) cannot be ` +
            'registered on a MultiWays slot. Drop multiways() or remove the size metadata.',
          );
          break;
        }
      }
    }

    // Big symbols (size > 1x1) are placed by the server at anchor cells
    // only — random fill skips them in v1 (a 2x2 with a non-zero weight
    // would silently never get picked, since RandomFillMiddleware can't
    // place blocks). Throw to surface the misunderstanding.
    for (const id of this._symbolRegistry.symbolIds) {
      const override = this._symbolDataOverrides[id] ?? {};
      const size = override.size;
      if (!size || (size.w === 1 && size.h === 1)) continue;
      const weight = override.weight ?? this._weights[id];
      if (weight !== undefined && weight > 0) {
        errors.push(
          `big symbol '${id}' (size ${size.w}x${size.h}) must have weight 0 — ` +
          'big symbols are placed by the server at anchor cells only and never enter ' +
          'random fill in v1. Set weight to 0 (or omit it) and place the symbol via setResult().',
        );
      }
    }

    if (this._visibleRows !== undefined && this._visibleRows <= 0) {
      errors.push('visibleRows() must be called with a positive number.');
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
