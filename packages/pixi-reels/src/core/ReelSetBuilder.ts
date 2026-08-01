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
import { reelAxis, type Orientation, type Direction } from './ReelAxis.js';
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
import { assertBufferCountsInRange } from '../frame/ColumnTarget.js';
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
 * Required calls (in any order): `.reels(n)`, `.visibleCells(n)`,
 * `.symbolSize(w, h)`, `.symbols((registry) => ...)`, `.ticker(app.ticker)`.
 * Optional: `.symbolGap()`, `.weights()`, `.symbolData()`, `.speed()`,
 * `.bufferSymbols()`, `.offset()`, `.frameMiddleware()`, `.phases()`,
 * `.spinningMode()`.
 *
 * ```ts
 * const reelSet = new ReelSetBuilder()
 *   .reels(5)
 *   .visibleCells(3)
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
  private _visibleCells?: number;
  private _symbolWidth?: number;
  private _symbolHeight?: number;
  private _symbolGap = { ...DEFAULTS.symbolGap };
  private _bufferStart = DEFAULTS.bufferSymbols;
  private _bufferEnd = DEFAULTS.bufferSymbols;
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
  /** Per-reel static cell counts (jagged shapes like 3-5-5-5-3). */
  private _visibleCellsPerReel?: number[];
  /** Per-reel pixel-box heights. used for both pyramids and MultiWays. */
  private _reelExtents?: number[];
  /** Vertical alignment of short reels inside the tallest reel's box. */
  private _reelAnchor: ReelAnchor = 'center';
  private _orientation: Orientation = 'vertical';
  private _direction: Direction = 'forward';
  private _directionPerReel?: Direction[];
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

  private _rng: () => number = Math.random;

  private _poolCapacity?: number;

  /** Set number of reel columns. */
  reels(count: number): this {
    this._reelCount = count;
    return this;
  }

  /**
   * Number of visible cells per reel (uniform across all reels).
   * Mutually exclusive with `visibleCellsPerReel()`. calling both throws
   * at `build()`.
   *
   * @example
   * builder.reels(5).visibleCells(3)  // classic 5x3
   */
  visibleCells(count: number): this {
    this._visibleCells = count;
    return this;
  }

  /**
   * Per-reel static cell counts. Length MUST equal `reels()`. Mutually
   * exclusive with `visibleCells()`; calling both throws at `build()`.
   *
   * @example
   * builder.reels(5).visibleCellsPerReel([3, 5, 5, 5, 3])  // pyramid
   */
  visibleCellsPerReel(cells: number[]): this {
    this._visibleCellsPerReel = [...cells];
    return this;
  }

  /**
   * Per-reel pixel-box heights. Length MUST equal `reels()`.
   *
   *   - Pyramid: defaults to `visibleCellsPerReel[i] * symbolHeight`. Override
   *     to make all reels the same height with different cell heights per
   *     reel.
   *   - MultiWays: every entry equals the same fixed reel height. Cell
   *     height per reel is derived as `reelExtent / visibleCells[i]`.
   *
   * Precedence: when both `reelExtents` and `reelAnchor` are set,
   * `reelExtents` wins. anchor is derived from the explicit boxes.
   */
  reelExtents(heights: number[]): this {
    this._reelExtents = [...heights];
    return this;
  }

  /** Vertical alignment of short reels inside the tallest reel's box. Default 'center'. */
  reelAnchor(anchor: ReelAnchor): this {
    this._reelAnchor = anchor;
    return this;
  }

  /**
   * Strip travel axis for the whole set. `'vertical'` (default) runs strips on
   * Y with reels marched along X. `'horizontal'` lands in a later v2 commit and
   * throws at `build()` for now.
   */
  orientation(orientation: Orientation): this {
    this._orientation = orientation;
    return this;
  }

  /**
   * Default travel direction for every reel. `'forward'` (default) heads toward
   * the larger coordinate (down for vertical); `'reverse'` runs the other way
   * (roll-up on a vertical set).
   */
  direction(direction: Direction): this {
    this._direction = direction;
    return this;
  }

  /**
   * Per-reel travel direction override (length must equal `reels()`), for
   * alternating-column effects. Reels omitted fall back to `direction()`.
   */
  directionPerReel(directions: Direction[]): this {
    this._directionPerReel = directions;
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
   * Configure this slot as MultiWays: per-spin cell variation. Pass minCells,
   * maxCells, and the fixed reel pixel height. After build, call
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
   * AdjustPhase plays on top of whatever stop staggering you've configured;
   * its duration is independent of `stopDelay`.
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
   * Buffer cells are off-screen cells the reel keeps around the visible
   * window so symbols can fade/slide in cleanly. The motion layer's wrap
   * detection assumes at least one buffer cell above and one below. the
   * minimum supported count is **1**. Passing `0` (or a negative number)
   * is clamped to `1` and a single console warning is printed; the
   * builder does not throw, so existing user code keeps running.
   *
   * **Tumble-only reel sets** may drop the below-window buffer entirely
   * with the object form: `bufferSymbols({ above: 1, below: 0 })`. A pure
   * tumble never scrolls the strip, so nothing ever wraps through the
   * below-window cells. they exist only to be hidden by the mask. This
   * requires `.tumble(...)` on the builder (validated at `build()`), and
   * strip spins (`spin({ mode: 'standard' })`) and `nudge()` throw on
   * such a set. `above` keeps the minimum of 1 (drop-in movers are
   * pre-positioned above the window).
   */
  bufferSymbols(count: number | { above: number; below: number }): this {
    if (typeof count === 'object') {
      this._bufferStart = this._clampBufferMin1(count.above, 'bufferSymbols({ above })');
      this._bufferEnd =
        Number.isFinite(count.below) && count.below >= 0 ? count.below : 0;
      return this;
    }
    const clamped = this._clampBufferMin1(count, `bufferSymbols(${count})`);
    this._bufferStart = clamped;
    this._bufferEnd = clamped;
    return this;
  }

  private _clampBufferMin1(count: number, label: string): number {
    if (!Number.isFinite(count) || count < 1) {
      if (!ReelSetBuilder._bufferWarnedThisProcess) {
        ReelSetBuilder._bufferWarnedThisProcess = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[pixi-reels] ${label} is below the minimum of 1; clamping to 1. ` +
            `The motion layer needs at least one buffer cell above (and, outside tumble-only sets, below) the visible window for wrap detection.`,
        );
      }
      return 1;
    }
    return count;
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
   * replaces the one from `weights()`). Merged into the final symbolsData map;
   * any field you don't specify falls back to the default.
   *
   * `zIndex` sorts within ONE reel's container only. it can never lift a
   * symbol above the reel to its right (reels are separate containers).
   * Cross-reel and out-of-mask layering needs `unmask: true`, which is an
   * **at-rest** presentation: while the reel spins the symbol stays masked
   * like everything else; on land, visible-cell instances are lifted into
   * the viewport-wide `unmaskedContainer` (above every reel and the mask)
   * and pulled back down when the next spin starts.
   *
   * @example
   * .symbolData({
   *   wild:  { zIndex: 5 },                // above reel-mates (same reel only)
   *   bonus: { zIndex: 10, unmask: true }, // landed: above all reels + mask
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
   * Inject the source of randomness used to fill the scrolling strip (buffer
   * fill, the symbols shown during SPIN before `setResult` lands, nudge
   * padding). Must return a value in [0, 1). Default: `Math.random`.
   *
   * **Why you'd set this:** server-authoritative *outcomes* do not make the
   * on-screen strip reproducible — the symbols a player sees scrolling are
   * drawn from this RNG. Injecting a seeded, audited PRNG lets you replay the
   * exact visual sequence from a seed, which provably-fair and regulated
   * real-money deployments are eventually required to produce.
   *
   * @example
   * import { ReelSetBuilder } from 'pixi-reels';
   * const seeded = mulberry32(serverSeed); // your audited PRNG
   * const reelSet = new ReelSetBuilder().reels(5).visibleCells(3)
   *   .symbols(...).ticker(app.ticker).rng(seeded).build();
   */
  rng(fn: () => number): this {
    this._rng = fn;
    return this;
  }

  /**
   * Override the per-symbol-id recycle-pool capacity. By default the engine
   * sizes the pool to the whole strip (every visible + buffer cell), so even a
   * grid that is briefly all one symbol recycles instead of churning through
   * `destroy()` + recreate. Set this only to cap memory on very large grids, or
   * to raise headroom for unusually heavy simultaneous symbol swaps.
   */
  poolCapacity(maxPerSymbol: number): this {
    this._poolCapacity = maxPerSymbol;
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
   *   .reels(5).visibleCells(3).symbolSize(200, 200)
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
   *   fall:   { duration: 300, ease: 'sine.in',    cellStagger: 60 },
   *   dropIn: { duration: 600, ease: 'power2.out', cellStagger: 60, distance: 'perHole' },
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
   * window; optional `bufferStart` / `bufferEnd` prefill cells outside it
   * (`[0]` is the slot closest to the visible window, later indices go
   * further out).
   *
   * @example
   * builder.initialFrame([
   *   { visible: ['A','B','C'] },
   *   { visible: ['A','B','C'], bufferStart: ['COIN'] },
   *   { visible: ['A','B','C'], bufferEnd: ['SCATTER'] },
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

    if (this._directionPerReel && this._directionPerReel.length !== this._reelCount) {
      throw new Error(
        `directionPerReel() length (${this._directionPerReel.length}) must equal reels() (${this._reelCount}).`,
      );
    }
    // Horizontal is supported for uniform grids (every reel the same cell
    // count). Pyramid / MultiWays horizontal needs per-reel main-extent shaping
    // that the geometry does not project yet, so fail loud rather than mis-lay.
    if (
      this._orientation === 'horizontal' &&
      (this._multiways || this._visibleCellsPerReel || this._reelExtents)
    ) {
      throw new Error(
        "orientation('horizontal') supports uniform grids only; pyramid / MultiWays " +
          'horizontal sets are not enabled yet. Use a uniform visibleCells.',
      );
    }

    const reelCount = this._reelCount!;
    const symbolWidth = this._symbolWidth!;
    const symbolHeight = this._symbolHeight!;
    const bufferStart = this._bufferStart;
    const bufferEnd = this._bufferEnd;
    if (bufferEnd === 0 && this._defaultSpinMode !== 'cascade') {
      throw new Error(
        'bufferSymbols({ below: 0 }) is tumble-only: the strip machinery wraps ' +
          'symbols through the below-window buffer. Add .tumble(...) to the ' +
          'builder, or keep bufferEnd >= 1.',
      );
    }
    const ticker = this._ticker!;
    const isMultiWays = !!this._multiways;

    // Set-level axis projection. `main` is the strip travel axis (Y vertical,
    // X horizontal), `cross` is the reel-marching axis. Symbol art always sizes
    // to screen (symbolWidth, symbolHeight); only the strip/marching geometry
    // swaps. Identity for vertical.
    const vertical = this._orientation === 'vertical';
    const setAxis = reelAxis(this._orientation, 'forward');
    const mainCellSize = vertical ? symbolHeight : symbolWidth;
    const crossCellSize = vertical ? symbolWidth : symbolHeight;
    const mainGap = vertical ? this._symbolGap.y : this._symbolGap.x;
    const crossGap = vertical ? this._symbolGap.x : this._symbolGap.y;

    // Resolve per-reel cell counts. MultiWays: every reel starts at maxCells.
    let visibleCellsPerReel: number[];
    if (isMultiWays) {
      visibleCellsPerReel = new Array(reelCount).fill(this._multiways!.maxCells);
    } else if (this._visibleCellsPerReel) {
      visibleCellsPerReel = this._visibleCellsPerReel;
    } else {
      const v = this._visibleCells!;
      visibleCellsPerReel = new Array(reelCount).fill(v);
    }

    // Resolve per-reel pixel-box heights. MultiWays: uniform reelExtent.
    // Pyramid: defaults to visibleCellsPerReel[i] * symbolHeight.
    let reelExtents: number[];
    if (isMultiWays) {
      reelExtents = new Array(reelCount).fill(this._multiways!.reelExtent);
    } else if (this._reelExtents) {
      reelExtents = this._reelExtents;
    } else {
      reelExtents = visibleCellsPerReel.map(
        (cells) => cells * symbolHeight + (cells - 1) * this._symbolGap.y,
      );
    }

    // Main-axis extent per reel (the strip length). For vertical this is the
    // pixel-box height; for a uniform horizontal set it is the strip width.
    const mainExtents = vertical
      ? reelExtents
      : visibleCellsPerReel.map((cells) => cells * mainCellSize + (cells - 1) * mainGap);

    // Compute per-reel main offset and target cell height.
    // SPIN-time uniform cell height equals the configured `symbolHeight`.
    const tallest = Math.max(...mainExtents);
    const mainOffsets = mainExtents.map((h) => {
      switch (this._reelAnchor) {
        case 'top': return 0;
        case 'bottom': return tallest - h;
        case 'center':
        default: return (tallest - h) / 2;
      }
    });
    const perReelCellSize: number[] = reelExtents.map((h, i) => {
      const cells = visibleCellsPerReel[i];
      return (h - (cells - 1) * this._symbolGap.y) / cells;
    });
    // MultiWays uses uniform spinCellSize = configured symbolHeight.
    // Pyramid: per-reel cell height. Uniform: same as symbolHeight.
    const spinCellSize = symbolHeight;
    const initialCellSize = isMultiWays
      ? new Array(reelCount).fill(spinCellSize)
      : perReelCellSize;

    if (this._speeds.size === 0) {
      this._speeds.set('normal', SpeedPresets.NORMAL);
    }

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

    const config: ReelSetInternalConfig = {
      grid: {
        reelCount,
        visibleCells: this._visibleCells ?? visibleCellsPerReel[0],
        symbolWidth,
        symbolHeight,
        symbolGap: { ...this._symbolGap },
        bufferSymbols: this._bufferStart,
        bufferEnd: this._bufferEnd,
        visibleCellsPerReel,
        reelExtents,
        reelAnchor: this._reelAnchor,
        multiways: this._multiways,
      },
      symbols: symbolsData,
      speeds: this._speeds,
      initialSpeed: this._initialSpeed,
      offset: this._offset,
      ticker,
    };

    // Pool cap per symbol id. The worst case for a single id is the whole
    // strip (every visible + buffer cell) showing it at once, so size the pool
    // to that to avoid destroy()+recreate churn on large/MultiWays grids. A
    // floor of 20 preserves headroom for small grids; an explicit
    // .poolCapacity() overrides the derivation.
    const totalStripCells = visibleCellsPerReel.reduce(
      (sum, cells) => sum + cells + bufferStart + bufferEnd,
      0,
    );
    const poolCapacity = this._poolCapacity ?? Math.max(20, totalStripCells);
    const symbolFactory = new SymbolFactory(this._symbolRegistry, poolCapacity);
    const randomProvider = new RandomSymbolProvider(symbolsData, this._rng);
    const frameBuilder = new FrameBuilder(randomProvider);

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
    // Viewport spans the cross axis across all reels and the main axis over the
    // tallest strip, projected to screen. Vertical: (crossSpan, mainSpan).
    const crossSpan = reelCount * (crossCellSize + crossGap) - crossGap;
    const viewportSize = setAxis.toScreen(crossSpan, tallest);
    const viewportWidth = viewportSize.x;
    const viewportHeight = viewportSize.y;

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

    // Unmask works on jagged/pyramid layouts (non-zero reel `mainOffset`) too:
    // unmask is an at-rest presentation, so a lifted view only exists while
    // the reel is stopped, and `Reel._syncUnmaskedViewOffsets()` re-bakes
    // `container.y` after every absolute motion snap. No config-time guard.

    if (
      !this._maskStrategyExplicit &&
      (hasBigSymbols || hasUnmaskedSymbols) &&
      crossGap > 0
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

    const totalRowsForOffset = bufferStart + Math.max(...visibleCellsPerReel) + bufferEnd;
    const offsetCalc = new OffsetCalculator(
      reelCount,
      totalRowsForOffset,
      symbolWidth,
      this._offset,
    );

    // Validate the initial frame now that buffer counts are fully resolved.
    // `initialFrame()` stores the raw `ColumnTarget[]` so the validator runs
    // against the final bufferSymbols config.
    if (this._initialFrame) {
      const bufferAboveArr = new Array(reelCount).fill(bufferStart);
      const bufferBelowArr = new Array(reelCount).fill(bufferEnd);
      assertBufferCountsInRange(
        this._initialFrame,
        bufferAboveArr,
        bufferBelowArr,
        'initialFrame',
      );
    }

    // Create reels with per-reel geometry.
    const reels: Reel[] = [];
    const maskRects: ReelMaskRect[] = [];
    for (let reelIndex = 0; reelIndex < reelCount; reelIndex++) {
      const cells = visibleCellsPerReel[reelIndex];
      const initialCellH = initialCellSize[reelIndex];

      // Per-reel initial frame at its own visibleCells count.
      const initialFrame = frameBuilder.build(
        reelIndex,
        cells,
        bufferStart,
        bufferEnd,
        this._initialFrame?.[reelIndex],
      );

      const reelConfig: ReelConfig = {
        reelIndex,
        visibleCells: cells,
        bufferStart,
        bufferEnd,
        symbolWidth,
        symbolHeight: initialCellH,
        symbolGapX: this._symbolGap.x,
        symbolGapY: this._symbolGap.y,
        symbolsData,
        initialSymbols: initialFrame,
        mainOffset: mainOffsets[reelIndex],
        extent: reelExtents[reelIndex],
        spinCellSize,
        axis: reelAxis(this._orientation, this._directionPerReel?.[reelIndex] ?? this._direction),
      };

      const reel = new Reel(reelConfig, symbolFactory, randomProvider, viewport);
      reels.push(reel);
      // Per-reel mask rect: cross position marches the reels, main position is
      // the reel's own offset, cross size is one cell, main size is the strip.
      const rectPos = setAxis.toScreen(reelIndex * (crossCellSize + crossGap), mainOffsets[reelIndex]);
      const rectSize = setAxis.toScreen(crossCellSize, mainExtents[reelIndex]);
      maskRects.push({
        x: rectPos.x,
        y: rectPos.y,
        width: rectSize.x,
        height: rectSize.y,
      });
    }
    viewport.updateMaskSize(viewportWidth, viewportHeight, maskRects);

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

    const hasShape = !!this._visibleCellsPerReel;
    const hasUniform = this._visibleCells !== undefined;
    const hasMega = !!this._multiways;

    if (!hasMega && !hasUniform && !hasShape) {
      errors.push('one of visibleCells(n) or visibleCellsPerReel([...]) or multiways({...}) must be called.');
    }
    if (hasUniform && hasShape) {
      errors.push('cannot call both visibleCells() and visibleCellsPerReel(). pick one.');
    }
    if (hasMega && hasShape) {
      errors.push('cannot combine multiways() with visibleCellsPerReel(). MultiWays shapes are server-driven.');
    }

    if (this._reelCount && hasShape && this._visibleCellsPerReel!.length !== this._reelCount) {
      errors.push(
        `visibleCellsPerReel length ${this._visibleCellsPerReel!.length} must equal reels(${this._reelCount}).`,
      );
    }
    if (hasShape) {
      for (let i = 0; i < this._visibleCellsPerReel!.length; i++) {
        if (this._visibleCellsPerReel![i] <= 0) {
          errors.push(`visibleCellsPerReel[${i}] = ${this._visibleCellsPerReel![i]} must be positive.`);
          break;
        }
      }
    }
    if (this._reelCount && this._reelExtents && this._reelExtents.length !== this._reelCount) {
      errors.push(
        `reelExtents length ${this._reelExtents.length} must equal reels(${this._reelCount}).`,
      );
    }

    if (hasMega) {
      const m = this._multiways!;
      if (m.minCells <= 0 || m.maxCells <= 0) {
        errors.push('multiways({minCells, maxCells}) must both be positive.');
      } else if (m.minCells > m.maxCells) {
        errors.push(`multiways: minCells ${m.minCells} cannot exceed maxCells ${m.maxCells}.`);
      }
      if (m.reelExtent <= 0) {
        errors.push('multiways({reelExtent}) must be positive.');
      }
      // multiways({reelExtent}) sets a uniform reel-pixel height for
      // every reel; reelExtents([...]) sets per-reel heights for
      // pyramid layouts. Setting both is ambiguous. fail loud.
      if (this._reelExtents) {
        errors.push(
          'cannot combine multiways({reelExtent}) with reelExtents([...]). ' +
          'multiways slots use a uniform reel pixel height. Drop reelExtents() or ' +
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

    if (this._visibleCells !== undefined && this._visibleCells <= 0) {
      errors.push('visibleCells() must be called with a positive number.');
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
