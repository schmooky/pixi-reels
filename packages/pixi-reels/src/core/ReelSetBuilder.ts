import type { Renderer, Ticker } from 'pixi.js';
import type { gsap } from 'gsap';
import { DEFAULT_GSAP, type Gsap } from '../utils/gsap.js';
import type {
  SpeedProfile,
  SymbolData,
  OffsetConfig,
  ReelSetInternalConfig,
  MultiWaysConfig,
  ReelAnchor,
  Stacking,
} from '../config/types.js';
import type { ReelMaskRect, MaskStrategy } from './ReelViewport.js';
import {
  MASK_STRATEGY_VERSION,
  RectMaskStrategy,
  SharedRectMaskStrategy,
} from './ReelViewport.js';
import { DEFAULTS } from '../config/defaults.js';
import { SpeedPresets } from '../config/SpeedPresets.js';
import { ReelSet, type ReelSetParams } from './ReelSet.js';
import { Reel, type ReelConfig } from './Reel.js';
import { reelAxis, type Orientation, type Direction } from './ReelAxis.js';
import type { ReelCurveConfig, ReelCurveInput, CurveFocus, CurveMode } from './ReelCurve.js';
import { CURVE_FOCUS_WEIGHT } from './ReelCurve.js';
import { ReelViewport } from './ReelViewport.js';
import { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import { SymbolFactory } from '../symbols/SymbolFactory.js';
import { RandomSymbolProvider } from '../frame/RandomSymbolProvider.js';
import type { SymbolPool, SymbolPoolScope } from '../frame/SymbolPool.js';
import { FrameBuilder } from '../frame/FrameBuilder.js';
import { PhaseFactory } from '../spin/phases/PhaseFactory.js';
import type { SpinningMode } from '../spin/modes/SpinningMode.js';
import { StandardMode } from '../spin/modes/StandardMode.js';
import type { FrameMiddleware } from '../frame/FrameBuilder.js';
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import { assertBufferCountsInRange, assertColumnTargets } from '../frame/ColumnTarget.js';
import {
  V1_BUILDER_METHODS,
  V1_OPTION_KEYS,
  V1_OPTION_VALUES,
  assertNoV1Keys,
  assertNoV1Value,
  renamedMessage,
} from '../config/v1Renames.js';
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
  private _symbolPools: { pool: SymbolPool; scope: SymbolPoolScope }[] = [];
  private _speeds = new Map<string, SpeedProfile>();
  private _initialSpeed = DEFAULTS.initialSpeed;
  private _offset: OffsetConfig = { mode: 'none' };
  private _ticker?: Ticker;
  private _spinningMode: SpinningMode = new StandardMode();
  private _phaseFactory = new PhaseFactory();
  /** Deferred `.phases(...)` configurators. See that method for why. */
  private _phaseConfigurators: Array<(factory: PhaseFactory) => void> = [];
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
  /** Render order of cells inside a reel, and of reels inside the set. */
  private _cellStacking: Stacking = 'ascending';
  private _reelStacking: Stacking = 'ascending';
  private _orientation: Orientation = 'vertical';
  private _direction: Direction = 'forward';
  private _directionPerReel?: Direction[];
  private _curve?: ReelCurveInput;
  private _curvePerReel?: ReelCurveInput[];
  private _curveFocus: CurveFocus = 'reel';
  private _curveMode: CurveMode = 'symbol';
  private _curveBleed = 0;
  private _renderer?: Renderer;
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

  private _gsap: Gsap = DEFAULT_GSAP;

  private _rng: () => number = Math.random;

  private _poolCapacity?: number;

  /**
   * @deprecated Removed in v2 - throws. Use {@link ReelSetBuilder.visibleCells}.
   *
   * TypeScript catches a v1 call at compile time, but an untyped consumer
   * would otherwise get "x.visibleRows is not a function", which names
   * neither the replacement nor the codemod. These stubs do.
   */
  visibleRows(_count: number): never {
    throw new Error(renamedMessage('ReelSetBuilder', 'visibleRows', V1_BUILDER_METHODS.visibleRows));
  }

  /** @deprecated Removed in v2 - throws. Use {@link ReelSetBuilder.visibleCellsPerReel}. */
  visibleRowsPerReel(_cells: number[]): never {
    throw new Error(
      renamedMessage('ReelSetBuilder', 'visibleRowsPerReel', V1_BUILDER_METHODS.visibleRowsPerReel),
    );
  }

  /** @deprecated Removed in v2 - throws. Use {@link ReelSetBuilder.reelExtents}. */
  reelPixelHeights(_heights: number[]): never {
    throw new Error(
      renamedMessage('ReelSetBuilder', 'reelPixelHeights', V1_BUILDER_METHODS.reelPixelHeights),
    );
  }

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
    assertNoV1Value(anchor, V1_OPTION_VALUES['reelAnchor()'], 'reelAnchor()');
    this._reelAnchor = anchor;
    return this;
  }

  /**
   * Render order of cells inside each reel. Default `'ascending'`. the cell
   * at the larger main coordinate (bottom for vertical, right for
   * horizontal) draws in front of its neighbour.
   *
   * Geometric on purpose: `direction('reverse')` and per-spin reversal do
   * NOT flip it, so symbol art lit from above keeps overlapping the way the
   * artist drew it. Set `'descending'` if your art wants the opposite.
   */
  cellStacking(order: Stacking): this {
    this._cellStacking = order;
    return this;
  }

  /**
   * Render order of reels inside the set. Default `'ascending'`. the last
   * reel draws in front, which reads as "rightmost on top" for vertical and
   * "bottom-most on top" for horizontal.
   */
  reelStacking(order: Stacking): this {
    this._reelStacking = order;
    return this;
  }

  /**
   * Strip travel axis for the whole set. `'vertical'` (default) runs strips on
   * Y with reels marched along X; `'horizontal'` runs them on X with reels
   * marched along Y.
   *
   * Everything else is orientation-neutral: uniform grids, pyramids
   * (`visibleCellsPerReel`), MultiWays, big symbols and cascades all work on
   * either axis from the same arithmetic. `symbolSize(width, height)` stays
   * SCREEN-space, so a horizontal set gives the cell its main extent through
   * `width` where a vertical one uses `height`.
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
   * Fake the curvature of the reel cylinder on every reel in the set.
   *
   * Cells bunch up and squash toward the window edges the way they would on a
   * real drum, while the middle of the window magnifies slightly because it is
   * the part facing you. It is a per-cell transform, so the art stays crisp,
   * there is no render texture or shader, and a flat set (the default) pays
   * nothing at all.
   *
   * @param curve `0` = flat, `1` = a hard barrel. Pass
   *   {@link ReelCurveConfig} to also tune `depth`, the cross-axis narrowing
   *   that keeps it reading as a drum rather than a squeezed flat strip.
   *
   * @example
   * builder.curve(0.35);
   * builder.curve({ amount: 0.5, depth: 0.3 });
   */
  curve(curve: ReelCurveInput): this {
    this._curve = curve;
    return this;
  }

  /**
   * Per-reel curvature override (length must equal `reels()`). Reels omitted
   * fall back to `curve()`.
   *
   * Use it when the reels are not all the same size, or for the common trick
   * of bending the middle reels harder than the outer ones so the board reads
   * as one wide drum rather than five identical ones.
   *
   * @example
   * builder.curvePerReel([0.2, 0.35, 0.5, 0.35, 0.2]);
   */
  curvePerReel(curves: ReelCurveInput[]): this {
    this._curvePerReel = curves;
    return this;
  }

  /**
   * Where the camera looking at the drum sits, across the strip.
   *
   * `'reel'` (default) puts one dead ahead of every reel, so each is its own
   * little drum. `'set'` puts a single camera in front of the middle of the
   * board: cells that rotate away also lean IN toward the centre, and the grid
   * reads as one wide cylinder instead of five identical ones. `'set-lean'` is
   * halfway, which is usually the sweet spot on a 5-wide board.
   *
   * Only has an effect alongside `curve(...)` / `curvePerReel(...)`.
   *
   * **Mask-strategy auto-pick:** leaning cells cross their own column, and the
   * default per-reel {@link RectMaskStrategy} would clip them at the boundary.
   * Anything other than `'reel'` therefore switches the default to
   * {@link SharedRectMaskStrategy}. Passing `.maskStrategy(...)` explicitly
   * always wins.
   *
   * @example
   * builder.curve(0.4).curveFocus('set-lean');
   */
  /**
   * How the curve is drawn.
   *
   * `'symbol'` (default) projects each cell on its own: crisp, free, and a real
   * keystone - but only for symbols whose content IS a texture. A `Container`
   * transform is affine, so a Spine skeleton, a `Graphics`, or a composite
   * subtree can only be displaced and scaled by it, never bent.
   *
   * `'warp'` renders each reel to a texture and draws it through a mesh whose
   * VERTICES are displaced by the projection. Everything inside the reel bends
   * identically - skeletons, atlas sprites, text, effects - and no symbol has
   * to cooperate. It costs one extra render pass per reel per frame and
   * resamples the reel once, so hairline art is marginally softer.
   *
   * `'warp'` requires {@link ReelSetBuilder.renderer}.
   *
   * @example
   * builder.curve(0.5).curveMode('warp').renderer(app.renderer);
   */
  curveMode(mode: CurveMode): this {
    if (mode !== 'symbol' && mode !== 'warp') {
      throw new Error(`curveMode(): expected 'symbol' or 'warp', got "${mode}".`);
    }
    this._curveMode = mode;
    return this;
  }

  /**
   * The renderer `curveMode('warp')` draws each reel's texture with. Required
   * for warp mode and unused otherwise.
   *
   * @example
   * builder.renderer(app.renderer)
   */
  renderer(renderer: Renderer): this {
    this._renderer = renderer;
    return this;
  }

  /**
   * Cross-axis room, in pixels per side, for symbols whose art is WIDER than
   * their cell - an overflowing mystery plate, leaves spilling past the tile.
   *
   * `curveMode('warp')` renders each reel into a texture the size of the reel,
   * so anything hanging over the edge is sliced off at the texture boundary.
   * This gives the texture room, and the overflow is captured, warped with
   * everything else, and sticks out over its neighbours.
   *
   * Costs texture area, so keep it to what the art actually needs. Warp mode
   * only; ignored under `curveMode('symbol')`, where symbols are real display
   * objects and overflow already draws.
   *
   * Pair it with {@link SharedRectMaskStrategy} (or a `curveFocus` other than
   * `'reel'`, which selects it for you) or the per-reel mask clips the
   * overhang straight back off.
   *
   * @example
   * builder.curve(0.45).curveMode('warp').curveBleed(40).renderer(app.renderer);
   */
  curveBleed(pixels: number): this {
    if (!Number.isFinite(pixels) || pixels < 0) {
      throw new Error(`curveBleed(): expected a non-negative number, got ${pixels}.`);
    }
    this._curveBleed = pixels;
    return this;
  }

  curveFocus(focus: CurveFocus): this {
    if (!(focus in CURVE_FOCUS_WEIGHT)) {
      throw new Error(
        `curveFocus(): unknown focus "${focus}". Expected one of ${Object.keys(CURVE_FOCUS_WEIGHT).join(', ')}.`,
      );
    }
    this._curveFocus = focus;
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
    // A v1 strategy takes positional (rects, totalWidth, totalHeight) and
    // knows nothing about the axis. Handed a MaskContext it would read
    // `rects` as an object, find no `.length`, and quietly draw a full-bleed
    // rect - a mask that clips nothing, with no error anywhere. Refuse it.
    if (strategy.version !== MASK_STRATEGY_VERSION) {
      throw new Error(
        `maskStrategy(): this strategy declares version ${String(strategy.version)}, ` +
        `but v2 requires ${MASK_STRATEGY_VERSION}. build(ctx) and update(graphics, ctx) now ` +
        'take a single MaskContext { rects, width, height, axis } instead of positional ' +
        'arguments, because a per-reel rect means different things on a vertical and a ' +
        'horizontal set. Add `readonly version = MASK_STRATEGY_VERSION` and read the ' +
        'context. See the Migrating to 2.0 guide.',
      );
    }
    this._maskStrategy = strategy;
    this._maskStrategyExplicit = true;
    return this;
  }

  /**
   * Configure this slot as MultiWays: per-spin cell variation. Pass minCells,
   * maxCells, and the fixed reel pixel height. After build, call
   * `reelSet.setShape(cellsPerReel)` mid-spin to set the next stop's shape.
   *
   * Mutually exclusive with big-symbol registration (`SymbolData.size`).
   * Mutually exclusive with cascade mode in v1.
   */
  multiways(config: MultiWaysConfig): this {
    assertNoV1Keys(config, V1_OPTION_KEYS['multiways()'], 'multiways()');
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
   * Set number of buffer symbols either side of the visible window.
   * Default: 1.
   *
   * `start` is the edge at the smaller main coordinate (above for
   * vertical, left for horizontal) and `end` the larger one. Both are
   * geometric, not travel-relative: flipping a reel's direction never
   * moves a buffer teaser to the opposite edge.
   *
   * Buffer cells are off-screen cells the reel keeps around the visible
   * window so symbols can fade/slide in cleanly. The motion layer's wrap
   * detection assumes at least one buffer cell each side. the minimum
   * supported count is **1**. Passing `0` (or a negative number) is
   * clamped to `1` and a single console warning is printed; the builder
   * does not throw, so existing user code keeps running.
   *
   * **Tumble-only reel sets** may drop the end-window buffer entirely
   * with the object form: `bufferSymbols({ start: 1, end: 0 })`. A pure
   * tumble never scrolls the strip, so nothing ever wraps through the
   * end-window cells. they exist only to be hidden by the mask. This
   * requires `.tumble(...)` on the builder (validated at `build()`), and
   * strip spins (`spin({ mode: 'standard' })`) and `nudge()` throw on
   * such a set. `start` keeps the minimum of 1 (drop-in movers are
   * pre-positioned outside the start edge).
   */
  bufferSymbols(count: number | { start: number; end: number }): this {
    assertNoV1Keys(count, V1_OPTION_KEYS['bufferSymbols()'], 'bufferSymbols()');
    if (typeof count === 'object') {
      this._bufferStart = this._clampBufferMin1(count.start, 'bufferSymbols({ start })');
      this._bufferEnd =
        Number.isFinite(count.end) && count.end >= 0 ? count.end : 0;
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
   * Narrow what the engine may draw when it fills a cell you did not name.
   *
   * `weights()` sets the base table for every reel; this layers pools on
   * top of it, so a symbol can be common on the strip and impossible in
   * the buffer cells, or heavy on one reel only. Call it once per scope.
   *
   * Buffer pools apply ON TOP of the spinning ones (see `SymbolPoolScope`),
   * and the same pools are reachable at run time as
   * `reelSet.randomSymbols`, which is where a game mode switch belongs.
   *
   * @example
   * .randomSymbols({ exclude: ['EMPTY'] })                       // every reel
   * .randomSymbols({ exclude: ['COIN'] }, { slots: 'buffer' })   // buffers only
   * .randomSymbols({ weights: { WILD: 40 } }, { reel: 2 })       // reel 2 only
   */
  randomSymbols(pool: SymbolPool, scope: SymbolPoolScope = {}): this {
    this._symbolPools.push({ pool, scope });
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
    for (const [id, data] of Object.entries(overrides ?? {})) {
      assertNoV1Keys(data?.size, V1_OPTION_KEYS['symbolData() size'], `symbolData('${id}').size`);
    }
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
    assertNoV1Keys(config, V1_OPTION_KEYS['offset() trapezoid'], 'offsetConfig()');
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
   * Calling `.gsap(myGsap)` binds every phase, motion tween, symbol
   * pin-flight tween, and SpriteSymbol win pulse to the GSAP you pass.
   * guaranteed to be the same instance that drives your own animations.
   *
   * Default: the `gsap` import resolved at the engine's own
   * `node_modules/gsap` path. If your app and the engine resolve to the
   * same instance (the common case in production bundles with proper
   * `dedupe`), you do NOT need to call this.
   *
   * **Per reel set, not process-wide.** v1 stored one instance in a module
   * global, so the last `.gsap()` call before any `build()` silently won for
   * every set. Each set now captures the instance at `build()` time, so a
   * composed stage can drive two sets from different instances. Pass the
   * same instance to `driveGsapWithTicker(ticker, instance)`.
   *
   * Read at `build()`. calling it afterwards does not move an existing set.
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
    this._gsap = instance;
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

  /**
   * Override default phases.
   *
   * Configurators are DEFERRED to `build()` and run after the built-in
   * registrations, so a `.phases(...)` override of a cascade or MultiWays key
   * wins regardless of where it sits in the chain. Running them at call time
   * meant `.tumble()` / `.multiways()` registered their defaults later, inside
   * `build()`, and silently clobbered any `'cascade:*'` / `'adjust'` override
   * the caller had made. no error, just the built-in phase.
   *
   * Multiple calls are kept and applied in call order, so the last override of
   * a given key wins.
   */
  phases(configurator: (factory: PhaseFactory) => void): this {
    this._phaseConfigurators.push(configurator);
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
   * Chain position does not matter. `.phases(...)` is applied after these
   * defaults regardless. Subclasses of the cascade phases need
   * `registerFactory` and the extra constructor args, which
   * `resolveTumbleConfig(config)` produces.
   *
   * @example
   * builder.tumble({
   *   fall:   { duration: 300, ease: 'sine.in',    cellStagger: 60 },
   *   dropIn: { duration: 600, ease: 'power2.out', cellStagger: 60, distance: 'perHole' },
   * });
   */
  tumble(config?: TumbleConfig): this {
    const tumbleKeys = V1_OPTION_KEYS['tumble() fall/dropIn'];
    assertNoV1Keys(config?.fall, tumbleKeys, 'tumble({ fall })');
    assertNoV1Keys(config?.dropIn, tumbleKeys, 'tumble({ dropIn })');
    assertNoV1Value(
      config?.fall?.cellOrder,
      V1_OPTION_VALUES['tumble() cellOrder'],
      'tumble({ fall: { cellOrder } })',
    );
    assertNoV1Value(
      config?.dropIn?.cellOrder,
      V1_OPTION_VALUES['tumble() cellOrder'],
      'tumble({ dropIn: { cellOrder } })',
    );
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
    assertColumnTargets(frame, 'initialFrame()');
    const columnKeys = V1_OPTION_KEYS['initialFrame() / setResult() column'];
    for (let i = 0; i < (frame?.length ?? 0); i++) {
      assertNoV1Keys(frame[i], columnKeys, `initialFrame() column ${i}`);
    }
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
    if (this._curveMode === 'warp' && !this._renderer) {
      throw new Error(
        "curveMode('warp') renders each reel to a texture, so it needs a renderer: " +
          'add .renderer(app.renderer). Use the default curveMode(\'symbol\') if you ' +
          'do not have one.',
      );
    }
    if (this._curvePerReel && this._curvePerReel.length !== this._reelCount) {
      throw new Error(
        `curvePerReel() length (${this._curvePerReel.length}) must equal reels() (${this._reelCount}).`,
      );
    }
    const reelCount = this._reelCount!;
    const symbolWidth = this._symbolWidth!;
    const symbolHeight = this._symbolHeight!;
    const bufferStart = this._bufferStart;
    const bufferEnd = this._bufferEnd;
    if (bufferEnd === 0 && this._defaultSpinMode !== 'cascade') {
      throw new Error(
        'bufferSymbols({ end: 0 }) is tumble-only: the strip machinery wraps ' +
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

    // Per-reel MAIN-AXIS extent (the strip length): pixel height for a
    // vertical set, pixel width for a horizontal one. `reelExtents([...])`
    // and `multiways({ reelExtent })` are both main-axis values, which is
    // what lets a pyramid or MultiWays set run sideways from exactly the
    // same arithmetic.
    let reelExtents: number[];
    if (isMultiWays) {
      reelExtents = new Array(reelCount).fill(this._multiways!.reelExtent);
    } else if (this._reelExtents) {
      reelExtents = this._reelExtents;
    } else {
      reelExtents = visibleCellsPerReel.map(
        (cells) => cells * mainCellSize + (cells - 1) * mainGap,
      );
    }
    const mainExtents = reelExtents;

    // Compute per-reel main offset and target cell height.
    // SPIN-time uniform cell height equals the configured `symbolHeight`.
    const tallest = Math.max(...mainExtents);
    const mainOffsets = mainExtents.map((h) => {
      switch (this._reelAnchor) {
        case 'start': return 0;
        case 'end': return tallest - h;
        case 'center':
        default: return (tallest - h) / 2;
      }
    });
    // Per-reel MAIN cell extent, derived by dividing the reel's extent by
    // its cell count (minus the inter-cell gaps).
    const perReelCellSize: number[] = reelExtents.map((extent, i) => {
      const cells = visibleCellsPerReel[i];
      return (extent - (cells - 1) * mainGap) / cells;
    });
    // SPIN-time uniform main cell extent. Every reel uses this while the
    // strip is scrolling, regardless of its post-AdjustPhase shape.
    const spinCellSize = mainCellSize;
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
    const symbolFactory = new SymbolFactory(
      this._symbolRegistry,
      poolCapacity,
      this._gsap,
      setAxis.mainProp,
    );
    const randomProvider = new RandomSymbolProvider(symbolsData, this._rng);
    for (const { pool, scope } of this._symbolPools) {
      randomProvider.set(pool, scope);
    }
    const frameBuilder = new FrameBuilder(randomProvider);

    for (const mw of this._middlewares) {
      frameBuilder.use(mw);
    }

    // Wire the three tumble cascade phases under their named keys. These are
    // DEFAULTS: the deferred `.phases(...)` configurators run after this block
    // and can replace any of them, from anywhere in the builder chain. The
    // default spin mode flips to 'cascade' when `.tumble()` ran.
    if (this._tumbleConfig) {
      const fall = this._tumbleConfig.fall;
      const drop = this._tumbleConfig.dropIn;
      // Gravity stays UNRESOLVED here: `'auto'` has to be read against each
      // reel's own axis, and `directionPerReel` lets those differ inside one
      // set. The phases resolve it per reel at run time.
      const gravity = this._tumbleConfig.gravity;
      this._phaseFactory.registerFactory('cascade:fall', (reel, speed) => new CascadeFallPhase(reel, speed, fall, gravity));
      this._phaseFactory.registerFactory('cascade:place', (reel, speed) => new CascadePlacePhase(reel, speed, gravity));
      this._phaseFactory.registerFactory('cascade:dropIn', (reel, speed) => new CascadeDropInPhase(reel, speed, drop, gravity));
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

    // User phase overrides run LAST, after the tumble / MultiWays defaults
    // above, so `.phases(f => f.registerFactory('cascade:dropIn', ...))` is
    // honoured no matter where it sat in the builder chain.
    for (const configurator of this._phaseConfigurators) {
      configurator(this._phaseFactory);
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
      (d) => d.size && (d.size.reels > 1 || d.size.cells > 1),
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
        `and the cross-axis gap (symbolGap.${vertical ? 'x' : 'y'}) is > 0. ` +
        'Pass .maskStrategy(...) explicitly to override.',
      );
    }

    // A set-focused curve makes receding cells LEAN toward the middle of the
    // board, which walks them out of their own column. The per-reel mask would
    // slice that overhang off at the boundary, so share one mask. Unlike the
    // cases above this does not need a cross gap - the lean crosses the column
    // edge whether or not there is a gap there.
    const curveLeans =
      this._curveFocus !== 'reel' && (this._curve !== undefined || this._curvePerReel !== undefined);
    if (!this._maskStrategyExplicit && curveLeans) {
      this._maskStrategy = new SharedRectMaskStrategy();
      // eslint-disable-next-line no-console
      console.info(
        `[pixi-reels] auto-selected SharedRectMaskStrategy because curveFocus('${this._curveFocus}') ` +
        'leans cells across their own reel column. Pass .maskStrategy(...) explicitly to override.',
      );
    }

    // Warp draws each reel through a texture, so anything the engine LIFTS out
    // of a reel container is not in that texture and is not bent: it draws
    // flat, over a curved board. Unmask is the one a game asks for by name, so
    // say so rather than let it look like a curve bug.
    if (this._curveMode === 'warp' && this._curve !== undefined && hasUnmaskedSymbols) {
      // eslint-disable-next-line no-console
      console.info(
        "[pixi-reels] curveMode('warp') does not bend symbols with `unmask: true`. " +
        'They are lifted into `viewport.unmaskedContainer`, outside the reel texture, ' +
        'so they render FLAT above a curved board. The same applies to the win ' +
        'spotlight and pin overlays. Use curveMode(\'symbol\') if those have to follow ' +
        'the drum.',
      );
    }

    // Reel-local cross coordinate each reel's perspective converges on. At
    // weight 0 that is the reel's own centreline; at 1 it is the middle of the
    // whole board, expressed in that reel's coordinates.
    const curveFocusWeight = CURVE_FOCUS_WEIGHT[this._curveFocus];
    const setCentreCross = crossSpan / 2;

    const viewport = new ReelViewport(
      viewportWidth,
      viewportHeight,
      undefined,
      this._maskStrategy,
      setAxis,
      this._curveMode === 'warp' ? this._curveBleed : 0,
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
      // Project this reel's (main, cross) cell extents back to the screen
      // pair `Reel` stores. For vertical that is (symbolWidth, cellMain) as
      // before; for horizontal the per-reel value lands on WIDTH instead,
      // which is what makes a sideways pyramid work.
      const cellScreen = setAxis.toScreen(crossCellSize, initialCellSize[reelIndex]);

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
        symbolWidth: cellScreen.x,
        symbolHeight: cellScreen.y,
        symbolGapX: this._symbolGap.x,
        symbolGapY: this._symbolGap.y,
        symbolsData,
        initialSymbols: initialFrame,
        mainOffset: mainOffsets[reelIndex],
        extent: reelExtents[reelIndex],
        spinCellSize,
        axis: reelAxis(this._orientation, this._directionPerReel?.[reelIndex] ?? this._direction),
        curve: this._curvePerReel?.[reelIndex] ?? this._curve,
        curveRenderer: this._curveMode === 'warp' ? this._renderer : undefined,
        curveTicker: this._curveMode === 'warp' ? ticker : undefined,
        curveBleed: this._curveBleed,
        curveFocus:
          curveFocusWeight === 0
            ? undefined
            : crossCellSize / 2 +
              curveFocusWeight *
                (setCentreCross - reelIndex * (crossCellSize + crossGap) - crossCellSize / 2),
        cellStacking: this._cellStacking,
        reelStacking: this._reelStacking,
        gsap: this._gsap,
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
        if (override.size && (override.size.reels > 1 || override.size.cells > 1)) {
          errors.push(
            `big symbol '${id}' (size ${override.size.reels}x${override.size.cells}) cannot be ` +
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
      if (!size || (size.reels === 1 && size.cells === 1)) continue;
      const weight = override.weight ?? this._weights[id];
      if (weight !== undefined && weight > 0) {
        errors.push(
          `big symbol '${id}' (size ${size.reels}x${size.cells}) must have weight 0. ` +
          'big symbols are placed by the server at anchor cells only and never enter ' +
          'random fill. Set weight to 0 (or omit it) and place the symbol via setResult().',
        );
      }
      // Cross-reel blocks vs per-reel direction (ADR 016 section 6.7). The
      // coordinator reads buffer geometry off reel 0 and paints stubs under
      // one shared "start = above the window" convention. With mixed
      // directions the reels a block spans can feed from opposite edges, so
      // a stub would land on the wrong side of the window on some of them.
      // Fail at build() rather than ship a block that splits at run time.
      if (size.reels > 1 && this._directionPerReel) {
        const distinct = new Set(this._directionPerReel);
        if (distinct.size > 1) {
          errors.push(
            `big symbol '${id}' spans ${size.reels} reels, which is not supported ` +
            'together with mixed directionPerReel([...]). The cross-reel coordinator ' +
            'assumes one shared feed edge for every reel a block covers. Use a single ' +
            'direction() for the set, or keep blocks within one reel (size.reels === 1).',
          );
        }
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
