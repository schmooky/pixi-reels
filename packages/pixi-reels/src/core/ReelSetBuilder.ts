import type { Ticker } from 'pixi.js';
import type { gsap } from 'gsap';
import { setGsap } from '../utils/gsapRef.js';
import type {
  SpeedProfile,
  SymbolData,
  OffsetConfig,
  ReelSetInternalConfig,
  MultiWaysConfig,
  ReelAnchor,
} from '../config/types.js';
import type { ReelMaskRect, MaskStrategy } from './ReelViewport.js';
import { RectMaskStrategy, SharedRectMaskStrategy } from './ReelViewport.js';
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
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import { assertBufferCountsInRange, columnTargetToArray } from '../frame/ColumnTarget.js';
import type { TumbleConfig, ResolvedTumbleConfig } from '../cascade/TumbleConfig.js';
import { resolveTumbleConfig } from '../cascade/TumbleConfig.js';
import { CascadeFallPhase } from '../spin/phases/CascadeFallPhase.js';
import { CascadePlacePhase } from '../spin/phases/CascadePlacePhase.js';
import { CascadeDropInPhase } from '../spin/phases/CascadeDropInPhase.js';
import { AdjustPhase } from '../spin/phases/AdjustPhase.js';

/**
 * The configurator you call before every reel set.
 *
 * `ReelSetBuilder` is a fluent, chainable builder: every call returns the
 * builder so you can string setup onto one expression. It hides the
 * twenty-odd subsystems you would otherwise have to wire by hand, and its
 * `.build()` step validates that every required piece is present (throws
 * at construction, not at first spin).
 *
 * Required calls (in any order): `.reels(n)`, `.visibleRows(n)`,
 * `.symbolSize(w, h)`, `.symbols((registry) => ...)`, `.ticker(app.ticker)`.
 * Optional: `.symbolGap()`, `.weights()`, `.symbolData()`, `.speed()`,
 * `.bufferSymbols()`, `.offset()`, `.frameMiddleware()`, `.phases()`,
 * `.spinningMode()`.
 *
 * ```ts
 * const reelSet = new ReelSetBuilder()
 *   .reels(5)
 *   .visibleRows(3)
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
  private _initialFrame?: ColumnTarget[];
  private _symbolDataOverrides: Record<string, Partial<SymbolData>> = {};
  private _tumbleConfig?: ResolvedTumbleConfig;
  private _defaultSpinMode: 'standard' | 'cascade' = 'standard';
  /** Per-reel static row counts (jagged shapes like 3-5-5-5-3). */
  private _visibleRowsPerReel?: number[];
  /** Per-reel pixel-box heights. used for both pyramids and MultiWays. */
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
  /** True if the user explicitly set a mask strategy (no auto-pick override). */
  private _maskStrategyExplicit = false;

  /** Set number of reel columns. */
  reels(count: number): this {
    this._reelCount = count;
    return this;
  }

  /**
   * Number of visible rows per reel (uniform across all reels).
   * Mutually exclusive with `visibleRowsPerReel()`. calling both throws
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
   * Per-reel static row counts. Length MUST equal `reels()`. Mutually
   * exclusive with `visibleRows()`; calling both throws at `build()`.
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
   * `reelPixelHeights` wins. anchor is derived from the explicit boxes.
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
   * (one clip rect per reel. clean for pyramid + uniform layouts).
   *
   * Use {@link SharedRectMaskStrategy} when reels have horizontal gaps
   * AND symbols (typically big symbols) need to overlap across reel
   * boundaries. the per-reel default would clip them at the gaps.
   *
   * Or pass any custom `MaskStrategy` for non-rectangular masks (rounded
   * frames, hexagonal grids, etc.).
   *
   * @example
   * import { SharedRectMaskStrategy } from 'pixi-reels';
   * builder.maskStrategy(new SharedRectMaskStrategy())
   */
  maskStrategy(strategy: MaskStrategy): this {
    // TS catches `null`/`undefined` for typed callers, but plain-JS callers
    // get a confusing crash deep inside `ReelViewport` later. Throw here
    // with a name they can grep.
    if (
      strategy == null ||
      typeof strategy.build !== 'function' ||
      typeof strategy.update !== 'function'
    ) {
      throw new Error(
        'maskStrategy(): expected a MaskStrategy with build(...) and update(...) methods ' +
        '(e.g. new RectMaskStrategy() or new SharedRectMaskStrategy()).',
      );
    }
    this._maskStrategy = strategy;
    this._maskStrategyExplicit = true;
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
   *. its duration is independent of `stopDelay`.
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

  /**
   * Set number of buffer symbols above/below the visible area. Default: 1.
   *
   * Buffer rows are off-screen cells the reel keeps around the visible
   * window so symbols can fade/slide in cleanly. The motion layer's wrap
   * detection assumes at least one buffer row above and one below. the
   * minimum supported value is **1**. Passing `0` (or a negative number)
   * is clamped to `1` and a single console warning is printed; the
   * builder does not throw, so existing user code keeps running.
   */
  bufferSymbols(count: number): this {
    if (!Number.isFinite(count) || count < 1) {
      if (!ReelSetBuilder._bufferWarnedThisProcess) {
        ReelSetBuilder._bufferWarnedThisProcess = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[pixi-reels] bufferSymbols(${count}) is below the minimum of 1; clamping to 1. ` +
            `The motion layer needs at least one buffer row above and below the visible window for wrap detection.`,
        );
      }
      this._bufferSymbols = 1;
      return this;
    }
    this._bufferSymbols = count;
    return this;
  }
  /** One-shot guard so we don't spam consoles when builders are constructed in a loop. */
  private static _bufferWarnedThisProcess = false;

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
   *. any field you don't specify falls back to the default.
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

  /**
   * Inject the GSAP instance the engine should use for tweens.
   *
   * **When you need this:** if your app already imports `gsap` and your
   * bundler resolves `gsap` to a different module instance than the one
   * `pixi-reels` resolved (common with symlinked workspaces, npm-link, or
   * misconfigured `dedupe`), every tween you start on a target the engine
   * also tweens will fight a separate timeline. Symptoms: spotlights that
   * render but never finish, animations that double-fire, tweens that
   * silently drop on hidden tabs in only one of the two instances.
   *
   * Calling `.gsap(myGsap)` rebinds every internal phase, motion tween,
   * pin-flight tween, and SpriteSymbol win pulse to the GSAP you pass.
   * guaranteed to be the same instance that drives your own animations.
   *
   * Default: the `gsap` import resolved at the engine's own
   * `node_modules/gsap` path. If your app and the engine resolve to the
   * same instance (the common case in production bundles with proper
   * `dedupe`), you do NOT need to call this.
   *
   * Idempotent. calling again with the same instance is a no-op. Calling
   * with a different instance after `.build()` only affects tweens
   * started after the swap.
   *
   * @example
   * import { gsap } from 'gsap';
   * const reelSet = new ReelSetBuilder()
   *   .reels(5).visibleRows(3).symbolSize(200, 200)
   *   .symbols(...)
   *   .ticker(app.ticker)
   *   .gsap(gsap)              // ensure engine and app share one instance
   *   .build();
   */
  gsap(instance: typeof gsap): this {
    setGsap(instance);
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
   * Enable tumble cascade mechanics. Replaces strip-spin + bounce-stop with
   * a three-phase pipeline:
   *
   *   1. **`cascade:fall`**. on `spin()`, existing visible symbols fall
   *      off the bottom of the viewport.
   *   2. **`cascade:place`**. when `setResult()` arrives, new symbol
   *      identities swap into the buffer at their final grid positions.
   *   3. **`cascade:dropIn`**. new symbols animate from above (and
   *      survivors slide down to fill holes) into the grid.
   *
   * For a Moment B refill after wins are cleared, call
   * `reelSet.refill({ winners, grid })`. that skips fall + wait and runs
   * `place` + `dropIn` only, with gravity-correct geometry driven by the
   * `winners` list (untouched symbols don't animate; survivors slide;
   * new symbols come from above).
   *
   * Every phase boundary fires a `cascade:*` event on
   * `reelSet.events`. per-symbol events (`cascade:fall:symbol` /
   * `cascade:dropIn:symbol`) carry the symbol, view, and the timing the
   * library is about to apply, so listeners can run parallel tweens on
   * any other property in sync with the library's `view.y` motion.
   *
   * Override any individual phase via `.phases(f => f.register('cascade:fall', MyPhase))`.
   *
   * @example
   * builder.tumble({
   *   fall:   { duration: 300, ease: 'sine.in',    rowStagger: 60 },
   *   dropIn: { duration: 600, ease: 'power2.out', rowStagger: 60, distance: 'perHole' },
   * });
   */
  tumble(config?: TumbleConfig): this {
    this._tumbleConfig = resolveTumbleConfig(config);
    this._defaultSpinMode = 'cascade';
    return this;
  }

  /**
   * Set the initial symbol grid the reels show before the first spin.
   *
   * One `ColumnTarget` per reel. `visible` lists the symbols in the visible
   * window; optional `bufferAbove` / `bufferBelow` prefill cells outside it
   * (`[0]` is the slot closest to the visible window, later indices go
   * further out).
   *
   * @example
   * builder.initialFrame([
   *   { visible: ['A','B','C'] },
   *   { visible: ['A','B','C'], bufferAbove: ['COIN'] },
   *   { visible: ['A','B','C'], bufferBelow: ['SCATTER'] },
   * ]);
   */
  initialFrame(frame: ColumnTarget[]): this {
    // Stored un-materialized so `build()` can validate it against the
    // final bufferSymbols config. Builder methods are order-free, so
    // `bufferSymbols()` may not have been called yet when `initialFrame()`
    // runs.
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

    // Wire the three tumble cascade phases under their named keys. The
    // defaults registered here can be overridden via `.phases(...)` after
    // `.tumble(...)` was called. The default spin mode flips to 'cascade'
    // when `.tumble()` ran.
    if (this._tumbleConfig) {
      const fall = this._tumbleConfig.fall;
      const drop = this._tumbleConfig.dropIn;
      this._phaseFactory.registerFactory('cascade:fall', (reel, speed) => new CascadeFallPhase(reel, speed, fall));
      this._phaseFactory.register('cascade:place', CascadePlacePhase);
      this._phaseFactory.registerFactory('cascade:dropIn', (reel, speed) => new CascadeDropInPhase(reel, speed, drop));
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

    // Create viewport. width covers all reels, height covers tallest box.
    const viewportWidth = reelCount * (symbolWidth + this._symbolGap.x) - this._symbolGap.x;
    const viewportHeight = tallest;

    // Auto-pick `SharedRectMaskStrategy` when the layout has horizontal
    // gaps AND any registered symbol needs to span across reel boundaries:
    //
    //   - **big symbols** (footprint w > 1 or h > 1). the per-reel mask
    //     would clip cross-reel big symbols at every column gap (visible
    //     vertical strips through the symbol), so we share a single mask.
    //   - **unmasked symbols** (`SymbolData.unmask: true`). these render
    //     above the per-reel mask anyway, but neighboring (masked)
    //     symbols still get clipped at the gap. Players see a
    //     half-cropped neighbor next to the unmasked overlay. Sharing
    //     one mask removes the gap stripe.
    //
    // Explicit `.maskStrategy(...)` calls always win.
    const hasBigSymbols = Object.values(symbolsData).some(
      (d) => d.size && (d.size.w > 1 || d.size.h > 1),
    );
    const hasUnmaskedSymbols = Object.values(symbolsData).some((d) => d.unmask);

    // Pyramid + unmask is not supported. `ReelMotion.snapToGrid()` and
    // `displace()` write reel-local Y to every symbol view. including
    // unmasked views that live in `viewport.unmaskedContainer`. On a
    // pyramid (any reel with offsetY != 0), the unmasked view's at-rest
    // Y is misset by `reel.container.y`. The activate path compensates,
    // but the next snap (landing/skip) re-breaks it. Fail at config time
    // rather than ship a layout the engine can't keep aligned.
    if (hasUnmaskedSymbols && offsetsY.some((y) => y !== 0)) {
      const pyramidIdx = offsetsY.findIndex((y) => y !== 0);
      throw new Error(
        `[pixi-reels] unmask + pyramid layout is not supported (reel ${pyramidIdx} ` +
        `has offsetY=${offsetsY[pyramidIdx]}). The motion layer writes reel-local ` +
        `Y to unmasked views, which mispositions them by reel.container.y on every ` +
        `snap. Use cell pins (reelSet.pin(...)) for above-mask overlays on pyramid ` +
        `slots, or remove the per-reel offset.`,
      );
    }

    if (
      !this._maskStrategyExplicit &&
      (hasBigSymbols || hasUnmaskedSymbols) &&
      this._symbolGap.x > 0
    ) {
      this._maskStrategy = new SharedRectMaskStrategy();
      // Heads-up so devs see the auto-pick in their console.
      const reason = hasBigSymbols
        ? 'big symbols are registered'
        : 'one or more symbols use `unmask: true`';
      // eslint-disable-next-line no-console
      console.info(
        `[pixi-reels] auto-selected SharedRectMaskStrategy because ${reason} ` +
        'and symbolGap.x > 0. Pass .maskStrategy(...) explicitly to override.',
      );
    }
    const viewport = new ReelViewport(viewportWidth, viewportHeight, undefined, this._maskStrategy);

    // Create offset calculator (X-axis)
    const totalRowsForOffset = bufferAbove + Math.max(...visibleRowsPerReel) + bufferBelow;
    const offsetCalc = new OffsetCalculator(
      reelCount,
      totalRowsForOffset,
      symbolWidth,
      this._offset,
    );

    // Validate + materialize the initial frame now that buffer counts are
    // fully resolved. `initialFrame()` stores the raw `ColumnTarget[]` so
    // the validator runs against the final bufferSymbols config.
    let materializedInitialFrame: string[][] | undefined;
    if (this._initialFrame) {
      const bufferAboveArr = new Array(reelCount).fill(bufferAbove);
      const bufferBelowArr = new Array(reelCount).fill(bufferBelow);
      assertBufferCountsInRange(
        this._initialFrame,
        bufferAboveArr,
        bufferBelowArr,
        'initialFrame',
      );
      materializedInitialFrame = this._initialFrame.map(columnTargetToArray);
    }

    // Create reels with per-reel geometry.
    const reels: Reel[] = [];
    const maskRects: ReelMaskRect[] = [];
    for (let reelIndex = 0; reelIndex < reelCount; reelIndex++) {
      const rows = visibleRowsPerReel[reelIndex];
      const initialCellH = initialSymbolHeight[reelIndex];

      // Per-reel initial frame at its own visibleRows count.
      const initialFrame = materializedInitialFrame
        ? frameBuilder.build(reelIndex, rows, bufferAbove, bufferBelow, materializedInitialFrame[reelIndex])
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
      defaultSpinMode: this._defaultSpinMode,
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
      errors.push('cannot call both visibleRows() and visibleRowsPerReel(). pick one.');
    }
    if (hasMega && hasShape) {
      errors.push('cannot combine multiways() with visibleRowsPerReel(). MultiWays shapes are server-driven.');
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
      // multiways({reelPixelHeight}) sets a uniform reel-pixel height for
      // every reel; reelPixelHeights([...]) sets per-reel heights for
      // pyramid layouts. Setting both is ambiguous. fail loud.
      if (this._reelPixelHeights) {
        errors.push(
          'cannot combine multiways({reelPixelHeight}) with reelPixelHeights([...]). ' +
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
    // only. random fill skips them in v1 (a 2x2 with a non-zero weight
    // would silently never get picked, since RandomFillMiddleware can't
    // place blocks). Throw to surface the misunderstanding.
    for (const id of this._symbolRegistry.symbolIds) {
      const override = this._symbolDataOverrides[id] ?? {};
      const size = override.size;
      if (!size || (size.w === 1 && size.h === 1)) continue;
      const weight = override.weight ?? this._weights[id];
      if (weight !== undefined && weight > 0) {
        errors.push(
          `big symbol '${id}' (size ${size.w}x${size.h}) must have weight 0. ` +
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
