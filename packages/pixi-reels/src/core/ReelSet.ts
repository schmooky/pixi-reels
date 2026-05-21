import { Container } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import type { ReelSetInternalConfig, CellBounds, SymbolData, SpinOptions } from '../config/types.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelSetEvents, SpinResult, RunCascadeResult as RunCascadeResultBase } from '../events/ReelEvents.js';
import { Reel, } from './Reel.js';
import type { NudgeOptions } from './Reel.js';
import { ReelViewport } from './ReelViewport.js';
import { SpinController } from '../spin/SpinController.js';
import { SpeedManager } from '../speed/SpeedManager.js';
import { SymbolSpotlight, } from '../spotlight/SymbolSpotlight.js';
import type { SymbolFactory } from '../symbols/SymbolFactory.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { FrameBuilder } from '../frame/FrameBuilder.js';
import type { PhaseFactory } from '../spin/phases/PhaseFactory.js';
import type { SpinningMode } from '../spin/modes/SpinningMode.js';
import type { CellPin, CellPinOptions, PinExpireReason, MovePinOptions, CellCoord } from '../pins/CellPin.js';
import { pinKey } from '../pins/CellPin.js';
import { getGsap } from '../utils/gsapRef.js';
import type { FrameMiddleware } from '../frame/FrameBuilder.js';
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import { cloneTargetGrid, toLegacyTargetGrid } from '../frame/ColumnTarget.js';
import type { Cell } from '../cascade/tumbleAlgorithm.js';

export interface ReelSetParams {
  config: ReelSetInternalConfig;
  reels: Reel[];
  viewport: ReelViewport;
  symbolFactory: SymbolFactory;
  frameBuilder: FrameBuilder;
  phaseFactory: PhaseFactory;
  spinningMode: SpinningMode;
  defaultSpinMode: 'standard' | 'cascade';
}

/**
 * The runtime-mutable frame-builder pipeline exposed on `reelSet.frame`.
 * Matches `FrameBuilder.use/remove` — the internal machinery that already
 * exists; this is the ergonomic surface.
 */
export interface FrameAPI {
  /** Add a middleware. Sorted by `priority` on next frame build. */
  use(middleware: FrameMiddleware): void;
  /** Remove a middleware by `name`. No-op if absent. */
  remove(name: string): void;
  /** Current middleware list in registration order. */
  readonly middleware: ReadonlyArray<FrameMiddleware>;
}

/**
 * Options for {@link ReelSet.destroySymbols}. Every field is optional;
 * the defaults produce the canonical "winners disintegrate" look (alternating
 * rotation by column, no stagger, no viewport dim, zIndex bumped to 1000
 * so destroy effects render above neighbouring cells).
 */
export interface DestroySymbolsOptions {
  /**
   * Per-cell rotation direction. Default: alternates by column
   * (`reel % 2 === 0 ? 1 : -1`) — produces a cohesive cluster pop.
   * Pass `1` / `-1` to force one direction, or a function for full control.
   */
  direction?: 1 | -1 | ((cell: Cell, index: number) => 1 | -1);
  /**
   * Per-cell start delay in seconds. Default `0` (every cell starts together).
   * Pass `(cell, i) => i * 0.03` for a per-cell stagger.
   */
  delay?: number | ((cell: Cell, index: number) => number);
  /**
   * zIndex applied to each cell's view for the duration of the animation
   * so destroy effects aren't clipped behind neighbours. Default `1000`.
   * The library does NOT restore the previous zIndex — the cell is
   * destroyed (alpha 0) and will be replaced on the next `refill()` /
   * `setResult()`. Pass `null` to skip the bump.
   */
  zIndex?: number | null;
  /**
   * Dim the viewport (`viewport.showDim(alpha)`) while the destroy
   * animation runs, restoring on completion. Pass `false` to skip,
   * a number for a custom alpha. Default: `false` (no dim).
   */
  dim?: boolean | number;
  /**
   * Abort signal. Aborting mid-destroy kills every in-flight
   * `playDestroy` tween and snaps the cells to their destroyed pose
   * (`alpha: 0`) without waiting for the natural end of the animation.
   * The returned promise still resolves normally — abort means
   * "fast-forward to the destroyed state," not "fail." Forwarded
   * automatically by `runCascade`'s own `signal`.
   */
  signal?: AbortSignal;
}

/**
 * Summary returned by {@link ReelSet.runCascade}. Re-exported from the
 * canonical definition in `events/ReelEvents.ts` so the events module
 * stays the single source of truth for shared shapes.
 */
export type RunCascadeResult = RunCascadeResultBase;

/**
 * Options for {@link ReelSet.runCascade}. The two required callbacks
 * (`detectWinners`, `nextGrid`) encode game rules; everything else is
 * timing / cancellation / forwarded-to-destroy plumbing with sensible
 * defaults.
 */
export interface RunCascadeOptions {
  /**
   * Win-detection callback. Receives the current grid (a fresh copy from
   * `getVisibleGrid()`) and the chain level (0 on the first iteration).
   * Returns the cells whose symbols are "winners" that should be cleared
   * before the next refill. Return `[]` to end the chain. Sync or async.
   */
  detectWinners: (
    grid: string[][],
    chainLevel: number,
  ) => readonly Cell[] | Promise<readonly Cell[]>;
  /**
   * Next-grid callback. Given the post-destroy grid and the winners that
   * were cleared, return the grid the survivors + new symbols should
   * land on. This is your server-side gravity simulation (or the
   * fallback `cascadeNextGrid` from your client). Sync or async.
   *
   * Must follow the gravity convention: top `winners.length` rows per
   * reel are new symbols; the rest are survivors in original top-to-
   * bottom order. Same contract as `refill({ grid })`.
   */
  nextGrid: (
    grid: string[][],
    winners: readonly Cell[],
    chainLevel: number,
  ) => string[][] | Promise<string[][]>;
  /**
   * Per-cascade hook fired AFTER `destroySymbols` and BEFORE the refill
   * starts. Use it to bump multipliers, play SFX, run "winners gone"
   * UI animations. Return a promise to delay the refill (e.g. for a
   * number-roll animation).
   *
   *   - `chain` — same 1-indexed chain stage as `cascade:chain:start`.
   *   - `winners` — cells that were just destroyed.
   *   - `currentGrid` — the grid as it stood at `cascade:chain:start`
   *     (same reference). The symbols at `winners` are visually gone but
   *     the grid array still names them — `nextGrid` will replace them.
   */
  onCascade?: (info: {
    chain: number;
    winners: readonly Cell[];
    currentGrid: string[][];
  }) => Promise<void> | void;
  /**
   * Milliseconds to wait between win-destroy completing and the next
   * refill starting. Commercial slots dial this between 150 ms (snappy)
   * and 500 ms (dramatic). Default `250`.
   */
  pauseAfterDestroyMs?: number;
  /**
   * Safety cap on cascade-chain length. Defaults to `32` — a sane
   * upper bound that protects against pathological server bugs while
   * being well above any commercial slot's natural cap. Pass `Infinity`
   * to disable.
   */
  maxChain?: number;
  /**
   * Forwarded to `destroySymbols(cells, opts)` on every cascade. Useful
   * for direction overrides, per-cell stagger, viewport dim, etc.
   */
  destroyOptions?: DestroySymbolsOptions;
  /**
   * How each refill in the chain animates.
   *
   *   - `'combined'` (default) — survivors and new symbols animate
   *     together in one drop-in beat. The Sweet Bonanza / Sugar Rush feel.
   *   - `'gravity-then-drop'` — survivors slide down to fill holes FIRST,
   *     then a global pause (`gravityHoldMs`), then new symbols enter
   *     from above with the per-reel stop delay applied. The Mummyland
   *     Treasures / Reactoonz feel — gives space for an anticipation
   *     beat between gravity and new-symbol entry.
   *
   * Per-column stagger inside the new-symbol drop is controlled by
   * `setDropOrder('ltr', stepMs)` exactly as in combined mode — when the
   * step is shorter than `dropIn.duration` you get overlapping waves;
   * when it's at least as long you get strictly sequential columns.
   */
  refillMode?: 'combined' | 'gravity-then-drop';
  /**
   * Fixed wall-clock pause between gravity end and drop-in start, in ms.
   * Only used when `refillMode === 'gravity-then-drop'`. Default `250`.
   * Combines via `Promise.all` with `gravityHold` if both are provided.
   *
   * The natural place for asymmetric anticipation visuals: register a
   * listener on `cascade:gravity:end` (one per reel) and trigger your
   * mascot / multiplier roll / SFX from there. Use `gravityHold` if you
   * already have an in-flight animation promise, or `onGravityComplete`
   * if you need a post-hold callback.
   */
  gravityHoldMs?: number;
  /**
   * Per-cascade promise-builder. Invoked once per chain stage at the
   * **gravity-end boundary** (i.e. AFTER every reel's gravity stage has
   * settled, just before the global hold begins). The returned promise
   * is awaited in parallel with `gravityHoldMs` via `Promise.all` —
   * whichever finishes LAST gates the drop-in. Only fires when
   * `refillMode === 'gravity-then-drop'`.
   *
   * Use this when each cascade starts its own anticipation animation
   * (multiplier roll, mascot reaction, anticipation SFX) and you want
   * the builder's *side effects* (e.g. `multiplier.bumpTo(chain + 1)`)
   * to fire AT gravity-end — not back when the refill args were
   * assembled. The library calls your function at the right beat and
   * awaits the promise you return.
   *
   *   - `chain` — same 1-indexed chain stage as `cascade:chain:start`.
   *   - `winners` — cells cleared this cascade.
   *
   * A rejection from the returned promise is surfaced via the
   * `cascade:gravity:error` event AND logged via `console.error`; the
   * engine slams the refill so the awaited promise still settles.
   */
  gravityHold?: (info: {
    chain: number;
    winners: readonly Cell[];
  }) => Promise<void>;
  /**
   * Per-cascade callback fired AFTER `gravityHoldMs` + `gravityHold` both
   * resolve, BEFORE the drop-in stage. Only fires when
   * `refillMode === 'gravity-then-drop'`. Use for last-mile side effects
   * that need to read post-hold state (e.g. snapshot the multiplier
   * value that just finished its count-up).
   *
   *   - `chain` — same 1-indexed chain stage as `cascade:chain:start`.
   *   - `winners` — cells cleared this cascade.
   */
  onGravityComplete?: (info: {
    chain: number;
    winners: readonly Cell[];
  }) => Promise<void> | void;
  /**
   * Abort signal for caller-driven cancellation. The loop exits at the
   * next await boundary, the in-flight refill (if any) is slammed via
   * `slamStop()`, and the resolved summary reports `wasSkipped: true`.
   *
   * Use this for "player tapped SLAM mid-cascade" — `reelSet.skip()` is
   * a no-op when called between refills (the engine is idle), so it
   * can't end the chain from a button handler. AbortController can.
   *
   * ```ts
   * const controller = new AbortController();
   * skipButton.addEventListener('click', () => controller.abort());
   * await reelSet.runCascade({ ..., signal: controller.signal });
   * ```
   */
  signal?: AbortSignal;
}

/**
 * The whole slot board as one object.
 *
 * A `ReelSet` is a PixiJS `Container` that owns every reel, the spin
 * controller, the speed manager, and the win spotlight. You `addChild` it
 * to your stage and then drive it from the four public verbs below:
 *
 *   - `spin()` — start the reels moving, returns a promise that resolves
 *     when every reel has landed (or been slam-stopped)
 *   - `setResult(grid)` — tell the reels what to land on; the spin
 *     controller consumes this and each reel queues its target symbols
 *   - `setAnticipation(reelIndices)` — slow the given reels before they
 *     stop, for "will the third scatter land?" tension
 *   - `skip()` — land immediately; useful for slam-stop UX
 *
 * Everything else is subsystems: `speed`, `spotlight`, `events`, `viewport`.
 * Construction goes through {@link ReelSetBuilder}, never `new ReelSet()`
 * directly — the builder enforces that every required piece is wired.
 *
 * ```ts
 * const reelSet = new ReelSetBuilder()
 *   .reels(5).visibleSymbols(3).symbolSize(140, 140)
 *   .symbols((r) => r.register('cherry', SpriteSymbol, { textures }))
 *   .ticker(app.ticker)
 *   .build();
 * app.stage.addChild(reelSet);
 *
 * const spin = reelSet.spin();
 * reelSet.setResult(await server.spin());
 * await spin;
 * ```
 *
 * Teardown cascades: one `reelSet.destroy()` disposes every child.
 */
export class ReelSet extends Container implements Disposable {
  /**
   * zIndex applied to pin overlays so they render above the reel strip.
   *
   * **The library's z-index budget**, for reference if you author symbols
   * that need to layer above defaults:
   *
   * | Layer | zIndex | Source |
   * |---|---|---|
   * | 1×1 symbol, default | `0 * 100 + arrayIndex` (~0–10) | `symbolData.zIndex ?? 0` |
   * | 1×1 symbol, elevated (`zIndex: 1` on `symbolData`) | `1 * 100 + arrayIndex` (~100) | `symbolData.zIndex` |
   * | Big-symbol anchor, default registration | `5 * 100 + arrayIndex` (~500) | recipe convention |
   * | Pin overlay (sticky/expanding wild during spin) | `10000` | `PIN_OVERLAY_Z_INDEX` |
   *
   * The 100× multiplier on `symbolData.zIndex` leaves room for per-row
   * stacking inside a layer (bottom rows render in front of top rows on
   * the same layer). The 10000 ceiling on pin overlays is set very high
   * so a consumer who sets `symbolData.zIndex: 50` (= 5000) still sits
   * below pins. If you need to stack ABOVE pin overlays — e.g. a win-
   * presenter symbol promotion — re-parent the symbol to
   * `viewport.spotlightContainer`, which is its own DisplayObject layer
   * above pin overlays.
   */
  private static readonly PIN_OVERLAY_Z_INDEX = 10000;

  private _events = new EventEmitter<ReelSetEvents>();
  private _reels: Reel[];
  private _viewport: ReelViewport;
  private _spinController: SpinController;
  private _speedManager: SpeedManager;
  private _spotlight: SymbolSpotlight;
  private _symbolFactory: SymbolFactory;
  private _frameBuilder: FrameBuilder;
  private _frameAPI: FrameAPI;
  private _isDestroyed = false;
  private _pins = new Map<string, CellPin>();
  /**
   * Visual overlays rendered above the reel viewport while a spin is in
   * motion. Each overlay is a pooled ReelSymbol sitting in the viewport's
   * unmaskedContainer at the pin's cell position — it keeps the pinned
   * symbol visible while the underlying reel scrolls. Created on
   * spin:start, destroyed on spin:allLanded. The pin is co-stored so
   * _destroyPinOverlay always has it available even after the pin is
   * removed from `_pins` (e.g. during unpin()).
   */
  private _pinOverlays = new Map<string, { pin: CellPin; overlay: ReelSymbol }>();

  /**
   * MultiWays: target row counts for the next AdjustPhase. Recorded by
   * `setShape()`, consumed by `SpinController` when it builds AdjustPhase
   * configs. `null` means "no shape change pending".
   */
  private _targetShape: number[] | null = null;

  /**
   * True once `setResult()` has been called for the current spin. Reset on
   * every `spin:start`. Used to enforce the contract that `setShape()`
   * must be called BEFORE `setResult()` — calling it after corrupts the
   * cached frames (pins were applied at their pre-migration rows; a later
   * setShape would migrate them but the frames are already built).
   */
  private _resultSetForCurrentSpin = false;

  /** Set at construction by the builder when `.multiways(...)` was called. */
  private _isMultiWaysSlot: boolean;
  private _multiwaysMinRows = 0;
  private _multiwaysMaxRows = 0;
  private _multiwaysReelPixelHeight = 0;

  /** Resolved per-symbol metadata (size, zIndex, etc). */
  private _symbolsData: Record<string, SymbolData>;

  /** Horizontal symbol gap (px). Used by `getBlockBounds` for big symbols. */
  private _configGapX: number;

  constructor(params: ReelSetParams) {
    super();

    this._reels = params.reels;
    this._viewport = params.viewport;
    this._symbolFactory = params.symbolFactory;
    this._frameBuilder = params.frameBuilder;
    this._symbolsData = params.config.symbols;
    this._configGapX = params.config.grid.symbolGap.x;
    this._isMultiWaysSlot = !!params.config.grid.multiways;
    if (params.config.grid.multiways) {
      this._multiwaysMinRows = params.config.grid.multiways.minRows;
      this._multiwaysMaxRows = params.config.grid.multiways.maxRows;
      this._multiwaysReelPixelHeight = params.config.grid.multiways.reelPixelHeight;
    }

    // Wire each reel's cross-reel resolver so `Reel.getVisibleSymbols()`
    // returns the anchor's id even when the OCCUPIED cell's anchor lives
    // on a different reel. Without this, per-reel surface returns the
    // sentinel for cross-reel cells — making it inconsistent with
    // `ReelSet.getVisibleGrid()`.
    for (const reel of this._reels) {
      reel.setCrossReelResolver((col, row) => {
        const fp = this.getSymbolFootprint(col, row);
        const anchorReel = this._reels[fp.anchor.col];
        // Anchor row is on its OWN reel — read its symbolId directly to
        // avoid recursing back through this resolver.
        return anchorReel.symbols[anchorReel.bufferAbove + fp.anchor.row].symbolId;
      });
    }

    const fb = this._frameBuilder;
    this._frameAPI = {
      use(mw: FrameMiddleware): void { fb.use(mw); },
      remove(name: string): void { fb.remove(name); },
      get middleware(): ReadonlyArray<FrameMiddleware> { return fb.middleware; },
    };

    // Speed manager
    this._speedManager = new SpeedManager(
      params.config.speeds,
      params.config.initialSpeed,
    );

    // Spin controller
    this._spinController = new SpinController(
      params.reels,
      this._speedManager,
      params.frameBuilder,
      params.phaseFactory,
      this._events,
      params.config.ticker,
      params.spinningMode,
      params.defaultSpinMode,
      {
        isMultiWaysSlot: this._isMultiWaysSlot,
        symbolsData: this._symbolsData,
        peekTargetShape: () => this._peekTargetShape(),
        clearTargetShape: () => this._clearTargetShape(),
        multiwaysReelPixelHeight: this._multiwaysReelPixelHeight,
        symbolGapY: params.config.grid.symbolGap.y,
        getPinsOnReel: (reelIndex) => this._pinsOnReel(reelIndex),
        migratePinsForReel: (reelIndex, newRows) => this._migratePinsForReel(reelIndex, newRows),
        refreshPinOverlaysForReel: (reelIndex) => this.refreshPinOverlaysForReel(reelIndex),
        buildPinOverlayTweens: (reelIndex, targetSymbolHeight, symbolGapY) =>
          this._buildPinOverlayTweens(reelIndex, targetSymbolHeight, symbolGapY),
      },
    );

    // Spotlight
    this._spotlight = new SymbolSpotlight(params.reels, params.viewport);

    // Add viewport to display
    this.addChild(this._viewport);

    // Pin lifecycle: decrement numeric turns when the spin lands; clear 'eval'
    // pins when the next spin starts.
    this._events.on('spin:allLanded', () => this._onSpinLanded());
    this._events.on('spin:start', () => this._onSpinStart());
  }

  // ─── Event system ──────────────────────────────────────────
  // Uses a dedicated emitter to avoid collision with PixiJS Container events.

  /** The event emitter for reel-specific events. */
  get events(): EventEmitter<ReelSetEvents> {
    return this._events;
  }

  // ─── Spin API ─────────────────────────────────────────────

  /**
   * Start spinning. Returns a promise that resolves when all (non-held)
   * reels land.
   *
   * Pass `{ holdReels: [i, ...] }` to keep specific columns frozen for
   * this spin — they skip START / SPIN / STOP entirely and stay on
   * whatever symbols they're currently showing. The use cases are
   * Hold & Win respins, sticky / expanding wilds, and "the trigger
   * column stays in place" bonus rounds.
   *
   * Pass `{ mode: 'standard' | 'cascade' }` to override the builder-time
   * default for a single spin (e.g. classic strip-spin on the first round,
   * drop-in on the cascade waves). `'cascade'` requires `.tumble(...)`
   * on the builder.
   *
   * @example
   * // Plain spin — every reel animates.
   * await reelSet.spin();
   *
   * @example
   * // Hold reels 0 and 4; only the middle three reroll.
   * const spin = reelSet.spin({ holdReels: [0, 4] });
   * reelSet.setResult(serverGrid); // entries at 0/4 are ignored
   * await spin;
   *
   * @example
   * // Per-spin cascade override.
   * await reelSet.spin({ mode: 'cascade' });
   *
   * See {@link SpinOptions} for the full contract (event behaviour,
   * setResult interaction, setAnticipation filtering).
   */
  async spin(options?: SpinOptions): Promise<SpinResult> {
    return this._spinController.spin(options);
  }

  /**
   * Set the target result symbols. Triggers the stop sequence.
   *
   * Two input shapes are accepted:
   *
   *   1. **Legacy `string[][]`** — one column per reel, row-indexed. Set
   *      `frame[col][-1]` (or `[-2]`, etc.) to target a buffer-above slot,
   *      `frame[col][visibleRows]` for buffer-below.
   *   2. **Explicit `ColumnTarget[]`** — `{ visible, bufferAbove?, bufferBelow? }`
   *      per column. Preferred for code that crosses worker/network boundaries,
   *      structuredClones, or JSON-serializes (the legacy form's negative-index
   *      slots don't survive standard cloning; the explicit form does).
   *
   * If any pins are active (`reelSet.pin(...)`), their symbols are overlaid
   * onto the result before it reaches the stop sequencer — so pinned cells
   * always land on the pin's `symbolId` regardless of what the server sent.
   */
  setResult(symbols: string[][] | ColumnTarget[]): void {
    const grid = toLegacyTargetGrid(symbols);
    const withPins = this._applyPinsToGrid(grid);
    this._resultSetForCurrentSpin = true;
    this._spinController.setResult(withPins);
  }

  /**
   * Tumble cascade: cascade refill (Moment B). Call this AFTER you've faded
   * out the winning symbols in your own code, with the list of winner cells
   * and the next grid the server returned.
   *
   *   - Untouched survivors don't animate.
   *   - Survivors above a hole slide down to fill it.
   *   - New symbols enter from above into the top `winners.length` rows
   *     of each reel.
   *
   * The new grid must follow the gravity convention: per reel, the top
   * `winnerRows.length` rows are the new symbols, the remaining rows are
   * survivors in their original top-to-bottom order. This matches what
   * server-side gravity simulations emit.
   *
   * Resolves with the same `SpinResult` shape as `spin()`. Requires the
   * builder to have been configured with `.tumble(...)`.
   *
   * @example
   * const winners = detectWins(currentGrid);
   * await reelSet.destroySymbols(winners);
   * const next = await server.cascade(winners);
   * await reelSet.refill({ winners, grid: next });
   */
  async refill(opts: {
    winners: ReadonlyArray<Cell>;
    grid: string[][] | ColumnTarget[];
    /**
     * Pick the refill animation flavor. See `RunCascadeOptions.refillMode`
     * for the full description; the same modes apply here when you drive
     * the cascade loop yourself.
     */
    mode?: 'combined' | 'gravity-then-drop';
    /**
     * Fixed wall-clock pause (ms) between the gravity stage and the
     * drop-in stage. Only applies when `mode === 'gravity-then-drop'`.
     * Default `250`. Combines via `Promise.all` with `gravityHold` if
     * both are provided — whichever finishes LAST gates the drop-in.
     */
    gravityHoldMs?: number;
    /**
     * Promise (or zero-arg factory) gating the drop-in stage. Only
     * applies when `mode === 'gravity-then-drop'`.
     *
     *   - `Promise<void>` — pass an already-in-flight animation / SFX /
     *     network call's completion handle when you want the drop-in to
     *     wait for it. The promise is awaited as-is.
     *   - `() => Promise<void>` — pass a factory when the *side effects*
     *     of starting the promise (a `multiplier.bumpTo()`, a Spine
     *     track switch, an SFX cue) should fire AT gravity-end, not at
     *     refill-start. The engine calls the factory at the gravity-end
     *     boundary and awaits its returned promise.
     *
     * Combines via `Promise.all` with `gravityHoldMs` — pass both to
     * floor the hold to a minimum wall-clock duration even if the
     * promise resolves earlier.
     */
    gravityHold?: Promise<void> | (() => Promise<void>);
    /**
     * Awaitable callback fired AFTER `gravityHoldMs` + `gravityHold` both
     * resolve, BEFORE the drop-in stage. Only fires when
     * `mode === 'gravity-then-drop'`. Use for last-mile side effects that
     * need to read the post-hold state (e.g. snapshot the multiplier
     * value that finished counting up during the hold).
     */
    onGravityComplete?: () => Promise<void> | void;
  }): Promise<SpinResult> {
    return this._spinController.refill(opts);
  }

  /**
   * Destroy a batch of cells in parallel, deferring to each symbol's own
   * `playDestroy()` so subclasses (Spine, particles, custom sprites) can
   * provide art-appropriate disintegration without the spin handler caring.
   *
   * This is the canonical "fade out the winners" step in a cascade chain:
   * call it between win-detection and `refill()`. Every cell's view is
   * lifted with a high zIndex so the destroy animation isn't clipped by
   * neighbours, and rotation direction alternates by column for cohesive
   * cluster pops.
   *
   *   - Empty `cells` resolves immediately, no work.
   *   - Out-of-range cells throw — the contract is that you've already
   *     run win detection on the visible grid, so coords must be valid.
   *
   * @example
   * const winners = detectWinners(reelSet.getVisibleGrid());
   * await reelSet.destroySymbols(winners);
   * await reelSet.refill({ winners, grid: nextGrid });
   *
   * @example
   * // Per-cell stagger — disintegrate left-to-right with a 30 ms beat.
   * await reelSet.destroySymbols(winners, {
   *   delay: (cell, i) => i * 0.03,
   * });
   */
  async destroySymbols(
    cells: ReadonlyArray<Cell>,
    opts?: DestroySymbolsOptions,
  ): Promise<void> {
    if (cells.length === 0) return;

    const resolveDirection = (cell: Cell, i: number): 1 | -1 => {
      const d = opts?.direction;
      if (typeof d === 'function') return d(cell, i);
      if (d === 1 || d === -1) return d;
      return cell.reel % 2 === 0 ? 1 : -1;
    };
    const resolveDelay = (cell: Cell, i: number): number => {
      const d = opts?.delay;
      if (typeof d === 'function') return d(cell, i);
      return d ?? 0;
    };

    // Validate up-front so partial work doesn't leave the grid in a half-
    // destroyed state. Cheap O(n) walk; fails loud with the bad coord.
    for (const cell of cells) {
      if (cell.reel < 0 || cell.reel >= this._reels.length) {
        throw new RangeError(
          `destroySymbols: cell.reel ${cell.reel} out of range [0, ${this._reels.length})`,
        );
      }
      const reel = this._reels[cell.reel];
      if (cell.row < 0 || cell.row >= reel.visibleRows) {
        throw new RangeError(
          `destroySymbols: cell.row ${cell.row} out of range [0, ${reel.visibleRows}) ` +
          `for reel ${cell.reel}`,
        );
      }
    }

    const dim = opts?.dim;
    if (dim) {
      this._viewport.showDim(typeof dim === 'number' ? dim : 0.35);
    }

    const z = opts?.zIndex === undefined ? 1000 : opts.zIndex;

    const signal = opts?.signal;
    this._events.emit('cascade:destroy:start', { cells });
    try {
      // allSettled (not all) so a single misbehaving playDestroy doesn't
      // strand its siblings mid-animation. Failed cells are surfaced via
      // the `failed` field on `cascade:destroy:end` so listeners can log
      // / replay-mark / alarm; the cell stays at whatever pose its tween
      // left it in (typically still visible) — the next `refill()` resets
      // it via `_replaceSymbol` regardless.
      const results = await Promise.allSettled(cells.map((cell, i) => {
        const sym = this._reels[cell.reel].getSymbolAt(cell.row);
        if (z !== null) sym.view.zIndex = z;
        return sym.playDestroy({
          direction: resolveDirection(cell, i),
          delay: resolveDelay(cell, i),
          signal,
        });
      }));
      const failed: Cell[] = [];
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          failed.push(cells[i]);
          // eslint-disable-next-line no-console
          console.warn(
            `[pixi-reels] destroySymbols: cell (${cells[i].reel}, ${cells[i].row}) ` +
            'playDestroy rejected:',
            (results[i] as PromiseRejectedResult).reason,
          );
        }
      }
      this._events.emit('cascade:destroy:end',
        failed.length > 0 ? { cells, failed } : { cells });
    } finally {
      if (dim) this._viewport.hideDim();
    }
  }

  /**
   * Run the canonical cascade chain on top of `refill()`. Loops:
   * detect winners → destroy → pause → refill → emit — until
   * `detectWinners` returns an empty list (or `maxChain` is hit, or the
   * player slammed via `skip()` / abort). Resolves with the final grid
   * and a summary.
   *
   * The orchestration is library-owned; the **game rules** (what counts
   * as a winner, how the next grid is computed) stay in your callbacks.
   * This is the cascade equivalent of `spin()` + `setResult()` — three
   * lines instead of fifteen, and the slam path is handled for you.
   *
   * Typical usage:
   *
   * ```ts
   * await reelSet.spin();
   * reelSet.setResult(await server.spin());
   * const summary = await reelSet.runCascade({
   *   detectWinners: (grid) => detectClusters(grid),
   *   nextGrid: async (grid, winners) => server.cascade(winners),
   *   onCascade: ({ chain, winners }) => bumpMultiplier(chain),
   * });
   * console.log(summary.chainLength, summary.totalWinners);
   * ```
   *
   * Composes with everything else in the library:
   *  - `setDropOrder(...)` is honoured on every refill in the chain — set
   *    it before `runCascade` and the same order applies to every drop.
   *  - `cascade:fall:symbol`, `cascade:place:end`, `cascade:dropIn:symbol`
   *    fire on each refill.
   *  - `reelSet.skip()` ends the chain immediately; the returned summary
   *    reports `wasSkipped: true`.
   *
   * Event order per stage with winners: `cascade:chain:start` →
   *   `cascade:destroy:start` → (destroy tweens) → `cascade:destroy:end` →
   *   `onCascade` → pause → refill (`cascade:place:end` +
   *   `cascade:dropIn:*` per reel) → `cascade:chain:end`. The chain itself
   *   is delimited by the returned `Promise` — `await` the call to know
   *   when it's done.
   *
   * Requires `.tumble(...)` on the builder (same as `refill()`).
   */
  async runCascade(opts: RunCascadeOptions): Promise<RunCascadeResult> {
    const pauseMs = opts.pauseAfterDestroyMs ?? 250;
    const maxChain = opts.maxChain ?? 32;
    let wasSkipped = false;
    const onSkip = (): void => { wasSkipped = true; };
    this._events.on('skip:requested', onSkip);

    const onAbort = (): void => {
      wasSkipped = true;
      // If a refill is currently animating, slam it so the await unblocks
      // immediately rather than after the full drop-in. slamStop is a no-op
      // when the engine is idle (between refills), so we only need this
      // guard for in-flight cancellation.
      if (this._spinController.isSpinning) {
        this._spinController.slamStop();
      }
    };
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    let chainLength = 0;
    let totalWinners = 0;
    let current = this.getVisibleGrid();

    try {
      while (chainLength < maxChain && !wasSkipped) {
        const winners = await opts.detectWinners(current, chainLength);
        if (winners.length === 0) break;
        totalWinners += winners.length;

        const stage = chainLength + 1;
        this._events.emit('cascade:chain:start', {
          chain: stage,
          winners,
          currentGrid: current,
        });

        // Forward the round-level abort signal into destroySymbols so a
        // mid-destroy abort kills the in-flight tweens immediately instead
        // of letting them run their full ~300 ms. The opts.destroyOptions
        // signal (if any) takes precedence to honor explicit per-batch
        // overrides; otherwise we use the cascade-level one.
        const destroyOpts = opts.destroyOptions?.signal
          ? opts.destroyOptions
          : { ...opts.destroyOptions, signal: opts.signal };
        await this.destroySymbols(winners, destroyOpts);
        if (wasSkipped) break;

        if (opts.onCascade) {
          await opts.onCascade({ chain: stage, winners, currentGrid: current });
          if (wasSkipped) break;
        }

        if (pauseMs > 0) {
          // Abort-cancellable wait. A plain `setTimeout` would run to
          // completion regardless of `signal.aborted`, adding up to
          // `pauseMs` of dead air between an abort and the loop exit.
          // We race the timer against `signal.aborted` so an abort mid-
          // pause unblocks the loop within a microtask.
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, pauseMs);
            if (!opts.signal) return;
            const onAbortPause = (): void => {
              clearTimeout(timer);
              resolve();
            };
            if (opts.signal.aborted) onAbortPause();
            else opts.signal.addEventListener('abort', onAbortPause, { once: true });
          });
          if (wasSkipped) break;
        }

        const next = await opts.nextGrid(current, winners, chainLength);
        if (wasSkipped) break;

        const refillMode = opts.refillMode ?? 'combined';
        // Wrap `opts.gravityHold` in a FACTORY so the user's builder is
        // invoked at gravity-end (inside `_refillTwoStage`), not at
        // refill-start. This matters when the builder has side effects —
        // e.g. `multiplier.bumpTo(chain + 1); return multiplier.done` —
        // that the player should see synchronized with the gravity-end
        // beat. Without the wrapping the bump would fire ~the duration
        // of the gravity stage too early.
        await this.refill({
          winners: [...winners],
          grid: next,
          mode: refillMode,
          gravityHoldMs: opts.gravityHoldMs,
          gravityHold: opts.gravityHold
            ? () => opts.gravityHold!({ chain: stage, winners })
            : undefined,
          onGravityComplete: opts.onGravityComplete
            ? () => opts.onGravityComplete!({ chain: stage, winners })
            : undefined,
        });
        chainLength += 1;
        current = this.getVisibleGrid();

        this._events.emit('cascade:chain:end', {
          chain: stage,
          winners,
          nextGrid: current,
        });
      }
    } finally {
      this._events.off('skip:requested', onSkip);
      if (opts.signal) {
        opts.signal.removeEventListener('abort', onAbort);
      }
    }

    const summary: RunCascadeResult = {
      chainLength,
      totalWinners,
      finalGrid: current,
      wasSkipped,
    };
    return summary;
  }

  /** Set which reels should show anticipation before stopping. */
  setAnticipation(reelIndices: number[]): void {
    this._spinController.setAnticipation(reelIndices);
  }

  /**
   * Override the per-reel stop delay (in ms). Pass one value per reel.
   *
   * **Sticky.** The override persists indefinitely — it survives across
   * `spin()` AND `refill()` boundaries until you call `setStopDelays()`
   * (or `setDropOrder()`) again. The persistence is deliberate: cascade
   * recipes that set `setDropOrder('all')` once before `runCascade(...)`
   * want every internal `refill()` to honor it. If your rounds use
   * different patterns, re-set explicitly per round.
   *
   * @example
   * // Stagger the last two reels more than the default for dramatic effect:
   * reelSet.setStopDelays([0, 140, 280, 600, 1100]);
   */
  setStopDelays(delays: number[]): void {
    this._spinController.setStopDelays(delays);
  }

  /**
   * Round-aware skip — the button-press entry point. The first press in a
   * round slams the current drop AND applies a round-scoped side effect:
   *
   *   - Standard mode: boost the active speed profile to the fastest
   *     registered one (emits `skip:boosted`). Restored on the next
   *     `spin()` (unless the app manually changed speed in between).
   *   - Cascade/tumble mode: flag every subsequent `refill()` to
   *     auto-slam with no animation. One press ends a multi-drop
   *     cascade.
   *
   * Subsequent presses also slam each current drop.
   *
   * Throws if called before `setResult()` arrives (nothing to land on —
   * slamming now would land on random spin-buffer content). The universal
   * "spin/skip" button pattern should call `requestSkip()` in that window
   * (or wrap `skip()` in a try/catch that routes to `requestSkip()` in
   * the catch). Callers that want a slam *without* the round-scoped side
   * effects (tests, anti-cheat) should use `slamStop()`.
   */
  skip(): void {
    this._spinController.skip();
  }

  /**
   * Slam-stop safe before `setResult()` arrives — queues until then.
   * Bypasses the two-stage `skip()` machine: an explicit slam intent.
   *
   * Note on `skipStage`: when this call queues a slam (pre-`setResult`)
   * rather than firing one, `skipStage` stays at `0` until `setResult()`
   * arrives and the queued slam actually runs. If your UI labels the
   * button off `skipStage`, expect a beat of "Skip" still shown while
   * the queued intent is in flight — the queued state isn't exposed as
   * its own stage on purpose (kept the `0 | 1 | 2` shape stable).
   */
  requestSkip(): void {
    this._spinController.requestSkip();
  }

  /**
   * Hard slam-stop — always lands every un-landed reel immediately. Bypasses
   * the two-stage `skip()` machine and any speed boost. For tests, anti-cheat
   * flows, or any caller with unambiguous "end now" intent.
   */
  slamStop(): void {
    this._spinController.slamStop();
  }

  /**
   * Current `skip()` position within the active round. `0` until the
   * player presses the slam button, `2` after. Read this to drive button
   * labels (e.g. "Skip" → "Skipped"). `1` is reserved for forward compat
   * and is not currently reachable.
   *
   * `requestSkip()` that gets queued pre-`setResult()` does NOT advance
   * the stage until the queued slam actually fires (i.e. once
   * `setResult()` arrives). If you need a "queued" UI state, track that
   * yourself alongside `skipStage`.
   */
  get skipStage(): 0 | 1 | 2 {
    return this._spinController.skipStage;
  }

  /**
   * Swap the symbol at a single grid cell in-place, at rest.
   *
   * Caller-facing wrapper over `Reel.setSymbolAt` that ALSO refuses
   * pinned cells (since `Reel` itself can't see the pin map). Use this
   * for live presentation effects — sticky-after-win, mid-feature
   * rewrites — without going through `setResult()`.
   *
   * Throws (in addition to the per-reel guards documented on
   * `Reel.setSymbolAt`) if `(col, row)` currently has an active pin.
   * Use `unpin(col, row)` first if you intentionally want to overwrite it.
   *
   * @example
   * await reelSet.spin(); // landed
   * reelSet.setSymbolAt(2, 1, 'wild'); // swap centre cell to wild
   */
  setSymbolAt(col: number, row: number, symbolId: string): void {
    if (col < 0 || col >= this._reels.length) {
      throw new RangeError(`setSymbolAt: col ${col} out of range [0, ${this._reels.length})`);
    }
    if (this._pins.has(pinKey(col, row))) {
      throw new Error(
        `setSymbolAt: cell (${col}, ${row}) has an active pin. Call unpin(col, row) ` +
        `first if you intend to overwrite it.`,
      );
    }
    this._reels[col].setSymbolAt(row, symbolId);
  }

  /**
   * Shift a single reel by `distance` positions after it has landed, revealing
   * caller-supplied symbols. Classic UK fruit-machine "nudge."
   *
   * Per-reel by design — multi-reel sync is via `Promise.all([...])` of
   * independent calls. Each call emits its own `nudge:start` / `nudge:complete`
   * pair on the ReelSet bus and `phase:enter('nudge')` / `phase:exit('nudge')`
   * on the per-reel bus.
   *
   * Big-symbol blocks on the target reel are nudged through as a unit as
   * long as they fit on the strip post-rotation. Use case: a 1xH block
   * lands with stubs in bufferBelow; nudge up to reveal it fully.
   *
   * `nudge:start` fires AFTER pre-placement so listeners observe the
   * about-to-tween state, mirroring `nudge:complete` which fires after
   * the strip has snapped. To capture the pre-nudge state, snapshot the
   * grid in your call site before awaiting.
   *
   * Throws (synchronously) if:
   *   - the reel set is currently spinning (avoid races with the spin pipeline),
   *   - `col` is out of range,
   *   - any visible cell on the target reel has an active pin,
   *   - `Reel.nudge` itself rejects (bad distance / direction / incoming /
   *     incompatible big-symbol layout).
   *
   * Rejects with an `AbortError` if `options.signal` aborts or the reel
   * is destroyed mid-tween. `nudge:cancelled` fires on the bus in that case.
   *
   * @example
   * await reelSet.spin(); // landed
   * await reelSet.nudge(2, { distance: 1, direction: 'down', incoming: ['wild'] });
   *
   * @example Parallel nudges across two reels:
   * await Promise.all([
   *   reelSet.nudge(2, { distance: 1, direction: 'down', incoming: ['wild'] }),
   *   reelSet.nudge(3, { distance: 1, direction: 'down', incoming: ['wild'] }),
   * ]);
   *
   * @example Staggered parallel via `startDelay`:
   * await Promise.all(
   *   [1, 2, 3].map((col, i) =>
   *     reelSet.nudge(col, { ...opts, startDelay: i * 80 }),
   *   ),
   * );
   *
   * @example Abortable nudge:
   * const controller = new AbortController();
   * skipButton.onclick = () => controller.abort();
   * await reelSet.nudge(2, { ...opts, signal: controller.signal })
   *   .catch((e) => { if (e.name !== 'AbortError') throw e; });
   */
  async nudge(col: number, options: NudgeOptions): Promise<{ symbols: string[] }> {
    // TODO(reentrancy): a `spin()` / `setResult()` / `pin()` / `setShape()`
    // call made while a nudge is in flight will race on the same reel.
    // We currently guard the *forward* direction (nudge refuses while
    // spinning) but not the reverse. Add `_assertNoNudgeInFlight()` to
    // those entry points before broad production use.
    if (this._spinController.isSpinning) {
      throw new Error('nudge: cannot nudge while a spin or refill is in progress.');
    }
    if (!Number.isInteger(col) || col < 0 || col >= this._reels.length) {
      throw new RangeError(`nudge: col ${col} out of range [0, ${this._reels.length}).`);
    }
    // Pin overlap detection lives at the ReelSet layer (Reel can't see pins).
    // Nudges would shift symbols out from under a pinned cell visually but
    // leave the pin record stale — fail loudly instead.
    for (const pin of this._pins.values()) {
      if (pin.col === col) {
        throw new Error(
          `nudge: reel ${col} has an active pin at row ${pin.row}. ` +
          `Call unpin(${col}, ${pin.row}) first if you intend to nudge through it.`,
        );
      }
    }

    try {
      const result = await this._reels[col].nudge(options, () => {
        // Fires after Reel.nudge has validated, pre-placed, and snapped —
        // right before the GSAP tween starts. Now the bus event matches
        // observable state.
        this._events.emit('nudge:start', {
          reelIndex: col,
          distance: options.distance,
          direction: options.direction,
        });
      });
      this._events.emit('nudge:complete', {
        reelIndex: col,
        distance: options.distance,
        direction: options.direction,
        symbols: result.symbols,
      });
      return result;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      // If the ReelSet was destroyed mid-nudge, `super.destroy({children: true})`
      // has already torn down our event bus (PixiJS Container has its own
      // `_events` field that we shadow — after super.destroy ours is gone too).
      // Skip the emit; the consumer's `nudge()` await will still see the
      // AbortError via the re-throw below.
      if (isAbort && !this._isDestroyed) {
        this._events.emit('nudge:cancelled', {
          reelIndex: col,
          distance: options.distance,
          direction: options.direction,
          reason: err.message,
        });
      }
      throw err;
    }
  }

  /**
   * Fast-forward an in-flight nudge to its landed state. No-op if the
   * given reel isn't currently nudging.
   *
   * The tween's `onComplete` fires synchronously, the strip snaps to the
   * final position, and the original `nudge()` promise resolves on the
   * next microtask. `nudge:complete` fires normally — from a listener's
   * POV the nudge just landed fast.
   *
   * @param col Reel index, or `undefined` to skip all in-flight nudges.
   */
  skipNudge(col?: number): void {
    if (col === undefined) {
      for (const reel of this._reels) {
        if (reel.isNudging) reel.skipNudge();
      }
      return;
    }
    if (!Number.isInteger(col) || col < 0 || col >= this._reels.length) {
      throw new RangeError(`skipNudge: col ${col} out of range [0, ${this._reels.length}).`);
    }
    this._reels[col].skipNudge();
  }

  /**
   * Set the per-reel drop order for the next stop / refill sequence.
   *
   * Convenience wrapper over `setStopDelays()` for common patterns. The
   * stagger step defaults to the active speed profile's stopDelay (or
   * 150 ms if stopDelay is 0).
   *
   * **Sticky.** The override persists indefinitely — until another
   * `setDropOrder()` / `setStopDelays()` call overwrites it (a `null` /
   * absent override falls back to the default `i * speed.stopDelay`
   * stagger). It survives across `spin()` AND `refill()` boundaries by
   * design, because `runCascade(...)` calls `refill()` in a loop and the
   * order set once before the chain must apply to every iteration.
   *
   * The canonical cascade pattern resets it per phase:
   *
   *   - `setDropOrder('ltr')` before `spin()` — left-to-right reveal on
   *     the initial drop.
   *   - `setDropOrder('all')` before `runCascade()` — every refill in the
   *     chain drops all columns simultaneously (the commercial-cascade
   *     pattern).
   *
   * If you leave the order set between rounds and don't re-set before the
   * next `spin()`, the previous value carries over. Re-set explicitly per
   * round if your rounds use different patterns.
   *
   * Call again with a different value to change it; the previous value
   * is replaced, not stacked.
   *
   * @example
   * reelSet.setDropOrder('ltr');  // left-to-right
   * reelSet.setDropOrder('rtl');  // right-to-left
   * reelSet.setDropOrder('all');  // all columns simultaneously
   * reelSet.setDropOrder([0, 0, 200, 200, 400]); // custom per-reel delays
   */
  setDropOrder(order: 'ltr' | 'rtl' | 'all' | number[], stepMs?: number): void {
    if (Array.isArray(order)) {
      this._spinController.setStopDelays(order);
      return;
    }

    const n = this._reels.length;
    const step = stepMs ?? Math.max(this._speedManager.active.stopDelay, 150);
    let delays: number[];

    if (order === 'all') {
      delays = new Array(n).fill(0);
    } else if (order === 'ltr') {
      delays = Array.from({ length: n }, (_, i) => i * step);
    } else {
      delays = Array.from({ length: n }, (_, i) => (n - 1 - i) * step);
    }

    this._spinController.setStopDelays(delays);
  }

  get isSpinning(): boolean {
    return this._spinController.isSpinning;
  }

  /** Whether this slot was built with `.multiways(...)`. */
  get isMultiWaysSlot(): boolean {
    return this._isMultiWaysSlot;
  }

  // ─── MultiWays API ─────────────────────────────────────────

  /**
   * MultiWays: record the row count each reel should land on this spin. The
   * AdjustPhase between SPIN and STOP will reshape reels (resize symbols,
   * reshape motion) before the stop sequence runs.
   *
   * Must be called between `spin()` and `setResult()`. The shape stays in
   * effect for the current spin only — call again on every spin.
   *
   * Throws if:
   *  - this slot was not built with `.multiways(...)`
   *  - `rowsPerReel.length !== reelCount`
   *  - any entry falls outside `[multiways.minRows, multiways.maxRows]`
   */
  setShape(rowsPerReel: number[]): void {
    if (!this._isMultiWaysSlot) {
      throw new Error('setShape(): slot was not built with .multiways(...) — call ReelSetBuilder.multiways() first.');
    }
    if (this._resultSetForCurrentSpin) {
      throw new Error(
        'setShape(): must be called BEFORE setResult() in the current spin. ' +
        'Calling setShape after setResult corrupts the cached frames (pins were ' +
        'overlaid at their pre-migration rows). Reorder: spin() → setShape() → setResult().',
      );
    }
    if (rowsPerReel.length !== this._reels.length) {
      throw new Error(
        `setShape(): rowsPerReel length ${rowsPerReel.length} must equal reelCount ${this._reels.length}.`,
      );
    }
    for (let i = 0; i < rowsPerReel.length; i++) {
      const r = rowsPerReel[i];
      if (r < this._multiwaysMinRows || r > this._multiwaysMaxRows) {
        throw new Error(
          `setShape(): rowsPerReel[${i}] = ${r} out of range [${this._multiwaysMinRows}, ${this._multiwaysMaxRows}].`,
        );
      }
    }
    // Fast-path: if the requested shape matches the current shape per-reel,
    // there's nothing to do. Avoids spurious `shape:changed` events and
    // pointless migration loops in defensive callers that always invoke
    // `setShape` per spin even when the shape didn't actually change.
    let isUnchanged = true;
    for (let i = 0; i < this._reels.length; i++) {
      if (this._reels[i].visibleRows !== rowsPerReel[i]) {
        isUnchanged = false;
        break;
      }
    }
    if (isUnchanged) {
      return;
    }

    this._targetShape = [...rowsPerReel];
    this._events.emit('shape:changed', [...rowsPerReel]);

    // Migrate pins to their post-reshape rows EAGERLY — before any
    // `setResult` overlay or frame build runs. Otherwise a pin at row=4
    // on a 7-row reel is silently dropped when setResult overlays it onto
    // a 3-row grid (row 4 is out of bounds for the new shape).
    //
    // AdjustPhase later commits the geometry; the pin map is already at
    // the post-migration rows by then, so AdjustPhase only needs to
    // refresh overlays + tween (when implemented).
    for (let i = 0; i < this._reels.length; i++) {
      this._migratePinsForReel(i, rowsPerReel[i]);
    }
  }

  /**
   * Internal: read the pending MultiWays target shape (does not clear).
   * Used by `SpinController` via the hooks interface. Not part of the
   * public API — call `setShape()` to change shape.
   *
   * @internal
   */
  private _peekTargetShape(): number[] | null {
    return this._targetShape;
  }

  /**
   * Internal: clear the pending MultiWays target shape after the spin lands.
   *
   * @internal
   */
  private _clearTargetShape(): void {
    this._targetShape = null;
  }

  /**
   * Resolved grid, with all OCCUPIED cells (same-reel and cross-reel)
   * replaced by their anchor's symbol id. A 2×2 bonus reads as four
   * `'bonus'` cells.
   *
   * Equivalent to `reelSet.reels.map(r => r.getVisibleSymbols())` because
   * each reel has a cross-reel resolver wired in by ReelSet's constructor —
   * the per-reel surface and the grid surface are the same.
   */
  getVisibleGrid(): string[][] {
    return this._reels.map((r) => r.getVisibleSymbols());
  }

  /**
   * Footprint of the symbol at `(col, row)`.
   *
   *   - 1×1 symbols: `{ anchor: { col, row }, size: { w: 1, h: 1 } }`.
   *   - Big symbols: returns the anchor cell and block size.
   *   - OCCUPIED cells: resolves transparently to the anchor.
   *
   * Useful for win presenters that need to highlight a whole NxM block.
   */
  getSymbolFootprint(
    col: number,
    row: number,
  ): { anchor: { col: number; row: number }; size: { w: number; h: number } } {
    if (col < 0 || col >= this._reels.length) {
      throw new RangeError(`getSymbolFootprint: col ${col} out of range [0, ${this._reels.length})`);
    }
    const reel = this._reels[col];
    if (row < 0 || row >= reel.visibleRows) {
      throw new RangeError(`getSymbolFootprint: row ${row} out of range [0, ${reel.visibleRows})`);
    }

    // Resolve OCCUPIED → anchor row on this reel. Cross-reel OCCUPIED
    // requires walking left to find the anchoring column with size.w > col.
    const anchorRow = reel._getAnchorRow(row);
    const anchorSym = reel.getSymbolAt(row);
    const meta = this._symbolsData[anchorSym.symbolId];
    const size = meta?.size && (meta.size.w > 1 || meta.size.h > 1)
      ? meta.size
      : { w: 1, h: 1 };

    // Resolve cross-reel anchor column: if the anchor symbol on THIS reel
    // is itself an OCCUPIED stub painted by a big symbol on a leftward
    // reel, walk left until we find a column where the row matches a big
    // symbol whose width covers our column.
    let anchorCol = col;
    for (let c = col - 1; c >= 0; c--) {
      const leftReel = this._reels[c];
      if (anchorRow >= leftReel.visibleRows) break;
      const leftAnchorRow = leftReel._getAnchorRow(anchorRow);
      const leftSym = leftReel.getSymbolAt(anchorRow);
      const leftMeta = this._symbolsData[leftSym.symbolId];
      if (leftMeta?.size && leftMeta.size.w > col - c) {
        anchorCol = c;
        return {
          anchor: { col: anchorCol, row: leftAnchorRow },
          size: leftMeta.size,
        };
      }
    }

    return { anchor: { col: anchorCol, row: anchorRow }, size };
  }

  /**
   * Pixel rectangle covering a big symbol's whole `N×M` block, in
   * ReelSet-local coordinates. Returns the anchor cell's bounds for 1×1
   * symbols. Pass any cell of a block — anchor or non-anchor — and you
   * get the same rect.
   *
   * Useful for win presenters drawing an outline around a whole bonus, or
   * any overlay aligned to the visible footprint of a big symbol:
   *
   * ```ts
   * const rect = reelSet.getBlockBounds(2, 1);
   * gfx.rect(rect.x, rect.y, rect.width, rect.height)
   *    .stroke({ color: 0xff6b35, width: 4 });
   * reelSet.addChild(gfx);
   * ```
   *
   * For 1×1 cells this is equivalent to `getCellBounds(col, row)`. For
   * big-symbol cells it multiplies width/height by the block size and
   * starts from the anchor cell's bounds.
   */
  getBlockBounds(col: number, row: number): CellBounds {
    const fp = this.getSymbolFootprint(col, row);
    const anchorBounds = this.getCellBounds(fp.anchor.col, fp.anchor.row);
    // Block covers w * cellWidth + (w-1) * gapX horizontally — the
    // (w-1) inter-cell gaps are part of the block's visible footprint.
    // Same vertically for cellHeight + gapY.
    const reel = this._reels[fp.anchor.col];
    const gapX = this._configGapX;
    const slotH = reel.motion.slotHeight;
    const cellW = anchorBounds.width;
    const cellH = anchorBounds.height;
    const gapY = slotH - cellH;
    return {
      x: anchorBounds.x,
      y: anchorBounds.y,
      width: fp.size.w * cellW + (fp.size.w - 1) * gapX,
      height: fp.size.h * cellH + (fp.size.h - 1) * gapY,
    };
  }

  // ─── Speed API ────────────────────────────────────────────

  /** Speed profile manager. */
  get speed(): SpeedManager {
    return this._speedManager;
  }

  /** Change speed and emit event. */
  setSpeed(name: string): void {
    const { previous, current } = this._speedManager.set(name);
    this._events.emit('speed:changed', current, previous);
    // Tell the spin controller this was a user-driven change (not the
    // internal `skip()` boost), so the next `spin()`'s restore path
    // leaves the choice alone even if the name happens to match the
    // value we boosted into.
    this._spinController.notifyManualSpeedChange();
  }

  // ─── Spotlight API ────────────────────────────────────────

  get spotlight(): SymbolSpotlight {
    return this._spotlight;
  }

  // ─── Reel access ──────────────────────────────────────────

  /** Get all reels. */
  get reels(): readonly Reel[] {
    return this._reels;
  }

  /** Get a reel by index. */
  getReel(index: number): Reel {
    return this._reels[index];
  }

  /**
   * Returns the bounding box of a visible grid cell in ReelSet-local
   * coordinates (i.e. relative to this Container, before any parent
   * transforms). Row 0 is the top visible row.
   *
   * Use this to place payline graphics, hit areas, or debug overlays
   * that must align with a specific symbol cell:
   *
   * ```ts
   * const b = reelSet.getCellBounds(2, 1);
   * gfx.rect(b.x, b.y, b.width, b.height).stroke({ color: 0xff6b35 });
   * reelSet.addChild(gfx);
   * ```
   *
   * To convert to stage / global coordinates use PixiJS:
   * ```ts
   * const global = reelSet.toGlobal({ x: b.x, y: b.y });
   * ```
   */
  getCellBounds(col: number, row: number): CellBounds {
    if (col < 0 || col >= this._reels.length) {
      throw new RangeError(`getCellBounds: col ${col} out of range [0, ${this._reels.length})`);
    }
    const reel = this._reels[col];
    if (row < 0 || row >= reel.visibleRows) {
      throw new RangeError(`getCellBounds: row ${row} out of range [0, ${reel.visibleRows})`);
    }
    return {
      x: this._viewport.x + reel.container.x,
      y: this._viewport.y + reel.offsetY + row * reel.motion.slotHeight,
      width: reel.symbolWidth,
      height: reel.symbolHeight,
    };
  }

  /** Get the viewport. */
  get viewport(): ReelViewport {
    return this._viewport;
  }

  // ─── Pins (persistent cell claims) ────────────────────────
  //
  // A `CellPin` claims a grid cell: the strip cannot overwrite it, and
  // `setResult()` overlays the pin's symbolId at that cell before the
  // stop sequence runs. Pins persist across spins according to their
  // `turns` field. See `CellPin` for the full semantics.

  /**
   * Pin a symbol to a grid cell. Applied immediately if the reel is idle;
   * applied at the next `setResult()` otherwise. Fires `pin:placed`.
   *
   * Passing the same `(col, row)` replaces the previous pin — the old one
   * is replaced silently (no `pin:expired` fires for replacement).
   *
   * @example
   * // Sticky wild for 3 spins
   * reelSet.pin(2, 1, 'wild', { turns: 3 })
   *
   * // Hold & Win coin with a payout value
   * reelSet.pin(col, row, 'coin', { turns: 'permanent', payload: { value: 50 } })
   *
   * // Expanding wild — fill column for the current spin's evaluation only
   * for (let r = 0; r < 3; r++) reelSet.pin(2, r, 'wild', { turns: 'eval' })
   */
  pin(col: number, row: number, symbolId: string, options?: CellPinOptions): CellPin {
    if (col < 0 || col >= this._reels.length) {
      throw new Error(`pin(): col ${col} out of range [0, ${this._reels.length})`);
    }
    const reel = this._reels[col];
    if (row < 0 || row >= reel.visibleRows) {
      throw new Error(`pin(): row ${row} out of range [0, ${reel.visibleRows})`);
    }

    const pin: CellPin = {
      col,
      row,
      originRow: options?.originRow ?? row,
      migration: options?.migration ?? 'origin',
      symbolId,
      turns: options?.turns ?? 'permanent',
      payload: options?.payload,
    };

    const key = pinKey(col, row);
    // If we're replacing an existing pin, drop its overlay so a fresh one
    // with the new symbolId can be created.
    if (this._pins.has(key)) {
      this._destroyPinOverlay(key);
    }
    this._pins.set(key, pin);

    if (!this._spinController.isSpinning) {
      // Reel is idle: apply the pin visually on the reel itself so
      // `getVisibleSymbols()` matches what `pins` reports.
      this._applyPinVisually(col, row, symbolId);
    } else {
      // Mid-spin: create an overlay so the pinned symbol is visible
      // immediately even while the reel scrolls.
      this._ensurePinOverlay(pin);
    }

    this._events.emit('pin:placed', pin);
    return pin;
  }

  /**
   * Remove a pin at `(col, row)`. If no pin exists at that cell, this is a
   * no-op. Fires `pin:expired` with reason `'explicit'`.
   */
  unpin(col: number, row: number): void {
    const key = pinKey(col, row);
    const pin = this._pins.get(key);
    if (!pin) return;
    this._pins.delete(key);
    this._destroyPinOverlay(key);
    this._events.emit('pin:expired', pin, 'explicit');
  }

  /**
   * All active pins, keyed by `"col:row"`.
   *
   * Reads are safe at any time — during a spin the map reflects pins that
   * will apply to the NEXT `setResult()`, not the one already in flight.
   */
  get pins(): ReadonlyMap<string, CellPin> {
    return this._pins;
  }

  /** Convenience: get the pin at `(col, row)` or `undefined`. */
  getPin(col: number, row: number): CellPin | undefined {
    return this._pins.get(pinKey(col, row));
  }

  /**
   * Move an existing pin from one cell to another. Animates a flight symbol
   * between the two cells, updates pin state atomically, and resolves when
   * the animation completes.
   *
   * This is the engine-native replacement for ghost sprites in walking-wild
   * recipes. The flight symbol is a pooled `ReelSymbol` acquired from the
   * factory, parented briefly to the viewport's `unmaskedContainer` so it
   * can travel across reel boundaries without being clipped.
   *
   * Constraints:
   *  - Only callable at rest (throws if `isSpinning === true`).
   *  - `to` must be within the grid; no pin may already exist there.
   *  - Calling with `from === to` is a no-op that still fires `pin:moved`.
   *
   * @example
   * // Walking wild — move the pinned wild one column left each spin
   * reelSet.events.on('spin:complete', async () => {
   *   for (const pin of [...reelSet.pins.values()]) {
   *     if (pin.col > 0) {
   *       await reelSet.movePin(
   *         { col: pin.col, row: pin.row },
   *         { col: pin.col - 1, row: pin.row },
   *       );
   *     } else {
   *       reelSet.unpin(pin.col, pin.row);
   *     }
   *   }
   * });
   */
  async movePin(
    from: CellCoord,
    to: CellCoord,
    opts?: MovePinOptions,
  ): Promise<void> {
    if (this._spinController.isSpinning) {
      throw new Error('movePin(): cannot move pin while spinning');
    }

    const fromKey = pinKey(from.col, from.row);
    const pin = this._pins.get(fromKey);
    if (!pin) {
      throw new Error(
        `movePin(): no pin at (${from.col}, ${from.row})`,
      );
    }

    // Validate `to` bounds (same rules as pin()).
    if (to.col < 0 || to.col >= this._reels.length) {
      throw new Error(
        `movePin(): to col ${to.col} out of range [0, ${this._reels.length})`,
      );
    }
    const toReel = this._reels[to.col];
    if (to.row < 0 || to.row >= toReel.visibleRows) {
      throw new Error(
        `movePin(): to row ${to.row} out of range [0, ${toReel.visibleRows})`,
      );
    }

    // No-op self-move: still fire the event so callers can treat it uniformly.
    if (from.col === to.col && from.row === to.row) {
      this._events.emit('pin:moved', pin, { col: from.col, row: from.row });
      return;
    }

    const toKey = pinKey(to.col, to.row);
    if (this._pins.has(toKey)) {
      throw new Error(
        `movePin(): a pin already exists at (${to.col}, ${to.row})`,
      );
    }

    // Update pin state first (atomic). The map now reflects the new position
    // immediately — any subsequent spin sees the pin at `to`.
    this._pins.delete(fromKey);
    const movedPin: CellPin = { ...pin, col: to.col, row: to.row, originRow: to.row };
    this._pins.set(toKey, movedPin);

    // An overlay at the old cell (from a prior spin-interrupted state)
    // is no longer accurate — drop it; the flight symbol takes over.
    this._destroyPinOverlay(fromKey);

    // Gather viewport-local coordinates for both cells. The flight symbol
    // will be parented to `viewport.unmaskedContainer`, whose local space
    // matches `maskedContainer` (both sit at (0,0) inside viewport) — so
    // `reel.container.x + symbol.view.x/y` gives us the right offset.
    const fromReel = this._reels[from.col];
    const fromCellY = fromReel.getSymbolAt(from.row).view.y;
    const toCellY = toReel.getSymbolAt(to.row).view.y;
    const fromX = fromReel.container.x;
    const toX = toReel.container.x;

    // Backfill the vacated cell with a filler. Takes effect immediately —
    // the vacated cell visually swaps to the backfill while the flight
    // symbol is still in motion.
    const backfill =
      opts?.backfill ?? this._frameBuilder.randomProvider.next(false);
    const fromVisible = fromReel.getVisibleSymbols();
    fromVisible[from.row] = backfill;
    fromReel.placeSymbols(fromVisible);

    // Spawn the flight symbol on the unmasked container so it renders above
    // the reels and can cross column boundaries.
    const flight = this._symbolFactory.acquire(pin.symbolId);
    flight.resize(fromReel.symbolWidth, fromReel.symbolHeight);
    flight.view.x = fromX;
    flight.view.y = fromCellY;
    this._viewport.unmaskedContainer.addChild(flight.view);

    // onFlightCreated hook — fires after the flight symbol is in place but
    // before the tween begins. This is where consumers switch a Spine
    // symbol onto a `run` animation for the flight duration.
    //
    // A throw from the hook MUST NOT abort the move: the pin map is
    // already updated and the tween needs to run for the flight symbol
    // to reach its destination — leaking a flight symbol on the unmasked
    // container is worse than a noisy console.error. Log so the bug is
    // diagnosable instead of silently eaten.
    try {
      opts?.onFlightCreated?.(flight);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pixi-reels] movePin onFlightCreated hook threw — continuing the flight to avoid leaking the flight symbol:', err);
    }

    // Tween.
    const duration = (opts?.duration ?? 400) / 1000;
    const easing = opts?.easing ?? 'power2.inOut';
    await new Promise<void>((resolve) => {
      getGsap().to(flight.view, {
        x: toX,
        y: toCellY,
        duration,
        ease: easing,
        onComplete: () => resolve(),
      });
    });

    // onFlightCompleted hook — fires before releasing the flight symbol,
    // so consumers can return a Spine to `idle` or play a landing animation.
    //
    // A throw from the hook MUST NOT prevent the rest of the cleanup
    // (apply the pin at destination, release the flight symbol to the
    // pool) — otherwise we leak a flight symbol AND leave the pin map
    // out of sync with the reels. Log so the bug is diagnosable.
    try {
      opts?.onFlightCompleted?.(flight);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pixi-reels] movePin onFlightCompleted hook threw — continuing cleanup:', err);
    }

    // Apply the pin visually at the destination cell.
    const toVisible = toReel.getVisibleSymbols();
    toVisible[to.row] = pin.symbolId;
    toReel.placeSymbols(toVisible);

    // Release the flight symbol.
    this._viewport.unmaskedContainer.removeChild(flight.view);
    this._symbolFactory.release(flight);

    this._events.emit('pin:moved', movedPin, {
      col: from.col,
      row: from.row,
    });
  }

  // ─── Frame pipeline (strip generation) ────────────────────
  //
  // Exposes the runtime-mutable FrameBuilder middleware pipeline on ReelSet
  // so recipes can add/remove frame middleware after build — the entry
  // point for mode-specific strip changes (feature weights, mystery
  // injection, positional overrides) without a full rebuild.
  //
  // The internal machinery was already present on FrameBuilder; this is
  // pure exposure — no behaviour change for recipes that don't call it.

  /**
   * Runtime-mutable middleware pipeline for symbol-frame generation.
   *
   * @example
   * // Feature entry — swap to a middleware that injects more wilds
   * reelSet.frame.use(moreWildsMiddleware);
   *
   * // Feature exit
   * reelSet.frame.remove('more-wilds');
   */
  get frame(): FrameAPI {
    return this._frameAPI;
  }

  // ─── Lifecycle ────────────────────────────────────────────

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;

    this._spotlight.destroy();
    this._spinController.destroy();

    for (const reel of this._reels) {
      reel.destroy();
    }

    this._destroyAllPinOverlays();
    this._symbolFactory.destroy();
    this._viewport.destroy();
    this._pins.clear();
    this._events.emit('destroyed');
    this._events.removeAllListeners();

    super.destroy({ children: true });
  }

  // ─── Pin internals ────────────────────────────────────────

  /**
   * Return a deep copy of `symbols` with active pins overlaid. Pure — does
   * not mutate the input. When there are no pins, returns the input as-is
   * (fast path; identical behaviour to pre-pin code).
   *
   * IMPORTANT: clones via `cloneTargetGrid`, not `symbols.map(col => [...col])`.
   * Spread drops the negative-index string properties that carry buffer-above
   * targets (`col[-1] = 'COIN'`). If you refactor this method, keep the
   * helper. See `cloneTargetGrid`'s TSDoc for the full contract.
   */
  private _applyPinsToGrid(symbols: string[][]): string[][] {
    if (this._pins.size === 0) return symbols;

    const cloned = cloneTargetGrid(symbols, this._reels[0]?.bufferAbove ?? 0);
    for (const pin of this._pins.values()) {
      if (pin.col < cloned.length && pin.row < cloned[pin.col].length) {
        cloned[pin.col][pin.row] = pin.symbolId;
      }
    }
    return cloned;
  }

  /** Pins on a given reel, in row order. Used by AdjustPhase migration. */
  private _pinsOnReel(reelIndex: number): CellPin[] {
    const result: CellPin[] = [];
    for (const pin of this._pins.values()) {
      if (pin.col === reelIndex) result.push(pin);
    }
    return result;
  }

  /**
   * MultiWays: relocate pins on a reel for a new visible-row count. The new
   * row is computed as `min(originRow, newRows - 1)` — clamped only when
   * the origin no longer fits. Returns the migrated pins so AdjustPhase
   * can build tween descriptors. Mutates the pins map in place.
   */
  private _migratePinsForReel(reelIndex: number, newRows: number): {
    pin: CellPin;
    fromRow: number;
    toRow: number;
    clamped: boolean;
  }[] {
    const migrations: {
      pin: CellPin;
      fromRow: number;
      toRow: number;
      clamped: boolean;
    }[] = [];

    const reelPins = this._pinsOnReel(reelIndex);
    for (const pin of reelPins) {
      const fromRow = pin.row;

      // Compute target row based on migration policy.
      //   'origin'  → clamp to min(originRow, newRows - 1). Restores on grow.
      //   'frozen'  → stay at current row if it fits, else clamp to last
      //              visible row AND update originRow so future grows
      //              don't restore. "Lock at current position" semantics.
      let target: number;
      let clamped: boolean;
      let nextOriginRow = pin.originRow;
      if (pin.migration === 'frozen') {
        if (fromRow < newRows) {
          target = fromRow;
          clamped = false;
        } else {
          target = newRows - 1;
          clamped = true;
          nextOriginRow = target; // freeze the new row as the new "origin"
        }
      } else {
        // 'origin' (default)
        target = Math.min(pin.originRow, newRows - 1);
        clamped = target !== pin.originRow;
      }

      if (target === fromRow && nextOriginRow === pin.originRow) continue;

      const fromKey = pinKey(pin.col, fromRow);
      const toKey = pinKey(pin.col, target);

      this._pins.delete(fromKey);
      const moved: CellPin = { ...pin, row: target, originRow: nextOriginRow };
      this._pins.set(toKey, moved);

      // Keep overlay map keyed by the new cell.
      const overlayEntry = this._pinOverlays.get(fromKey);
      if (overlayEntry) {
        this._pinOverlays.delete(fromKey);
        this._pinOverlays.set(toKey, { pin: moved, overlay: overlayEntry.overlay });
      }

      migrations.push({ pin: moved, fromRow, toRow: target, clamped });
      this._events.emit('pin:migrated', moved, {
        fromRow,
        toRow: target,
        clamped,
        reelIndex,
      });
    }
    return migrations;
  }

  /**
   * Apply a pin to the idle reel's visible display immediately. Used when
   * `pin()` is called while no spin is in flight — the grid updates right
   * away so `getVisibleSymbols()` reflects the pin.
   */
  private _applyPinVisually(col: number, row: number, symbolId: string): void {
    const reel = this._reels[col];
    const current = reel.getVisibleSymbols();
    if (current[row] === symbolId) return; // already there
    current[row] = symbolId;
    reel.placeSymbols(current);
  }

  /**
   * Fires on `spin:allLanded`. Destroys visual pin overlays (the actual reel
   * cells now show the pinned symbols via setResult overlay), then
   * decrements numeric-turns pins and expires pins that hit zero.
   */
  private _onSpinLanded(): void {
    // Overlays are only needed during spin motion — destroy them all.
    this._destroyAllPinOverlays();

    if (this._pins.size === 0) return;

    const expired: CellPin[] = [];
    for (const pin of this._pins.values()) {
      if (typeof pin.turns === 'number') {
        // turns is readonly on the public interface; the engine owns the
        // mutation here — cast to the mutable internal representation.
        (pin as { turns: number }).turns -= 1;
        if (pin.turns <= 0) expired.push(pin);
      }
    }

    for (const pin of expired) {
      this._pins.delete(pinKey(pin.col, pin.row));
      this._events.emit('pin:expired', pin, 'turns' as PinExpireReason);
    }
  }

  /**
   * Fires on `spin:start`. Clears every `'eval'` pin from the previous spin,
   * then creates a visual overlay for every remaining pin so its symbol
   * stays visible while the reel scrolls underneath.
   */
  private _onSpinStart(): void {
    // Fresh spin — setResult hasn't been called yet, so setShape() is
    // allowed again until setResult() flips this back.
    this._resultSetForCurrentSpin = false;

    if (this._pins.size > 0) {
      const expired: CellPin[] = [];
      for (const pin of this._pins.values()) {
        if (pin.turns === 'eval') expired.push(pin);
      }

      for (const pin of expired) {
        this._pins.delete(pinKey(pin.col, pin.row));
        this._events.emit('pin:expired', pin, 'eval' as PinExpireReason);
      }
    }

    // Create overlays for all remaining pins. The overlay is what the player
    // sees during the spin motion phase — the underlying reel cell scrolls
    // normally but is visually covered.
    for (const pin of this._pins.values()) {
      this._ensurePinOverlay(pin);
    }
  }

  /**
   * Create an overlay ReelSymbol for a pin in the viewport's unmasked
   * container. No-op if one already exists at that cell. Fires
   * `pin:overlayCreated` after the overlay is positioned and added to the
   * display list — that's the hook consumers use to drive animation state
   * (e.g. setting a Spine track).
   */
  private _ensurePinOverlay(pin: CellPin): void {
    const key = pinKey(pin.col, pin.row);
    if (this._pinOverlays.has(key)) return;

    const reel = this._reels[pin.col];
    const overlay = this._symbolFactory.acquire(pin.symbolId);
    overlay.resize(reel.symbolWidth, reel.symbolHeight);
    // Viewport.unmaskedContainer sits at (0,0) inside the viewport — same
    // local space as maskedContainer. Reel x lives on the reel container;
    // symbol-view y is reel-local; pyramid layouts add `reel.container.y`
    // (the per-reel offsetY) so overlays line up with the actual cell.
    overlay.view.x = reel.container.x;
    overlay.view.y = reel.container.y + reel.getSymbolAt(pin.row).view.y;
    overlay.view.zIndex = ReelSet.PIN_OVERLAY_Z_INDEX;
    this._viewport.unmaskedContainer.addChild(overlay.view);
    this._pinOverlays.set(key, { pin, overlay });
    this._events.emit('pin:overlayCreated', pin, overlay);
  }

  /**
   * Reposition + resize every pin overlay on the given reel.
   *
   * The engine calls this automatically after every MultiWays AdjustPhase
   * reshape (and from the skip path), so applications that just use
   * `setShape()` / `setResult()` never need to invoke it. **Call it
   * yourself only if** you mutate `Reel.symbolWidth`, `Reel.symbolHeight`,
   * or a pin's row outside the normal MultiWays flow — e.g. a custom
   * mid-spin layout swap that bypasses `AdjustPhase`.
   *
   * No-op for reels with no active pin overlays.
   */
  refreshPinOverlaysForReel(reelIndex: number): void {
    const reel = this._reels[reelIndex];
    for (const [, entry] of this._pinOverlays) {
      if (entry.pin.col !== reelIndex) continue;
      const { pin, overlay } = entry;
      overlay.resize(reel.symbolWidth, reel.symbolHeight);
      overlay.view.x = reel.container.x;
      overlay.view.y = reel.container.y + pin.row * reel.motion.slotHeight;
    }
  }

  /**
   * Internal: build AdjustPhase pin-overlay tween descriptors for a reel.
   * Captures the overlays' CURRENT on-screen Y + size as the tween's
   * `from` state, then computes the post-reshape `to` state from the
   * pin's already-migrated row + the upcoming cell height. Called BEFORE
   * AdjustPhase commits the reshape, so the snapshot reflects what the
   * player actually sees.
   */
  private _buildPinOverlayTweens(
    reelIndex: number,
    targetSymbolHeight: number,
    symbolGapY: number,
  ): import('../spin/phases/AdjustPhase.js').PinOverlayTween[] {
    const reel = this._reels[reelIndex];
    const out: import('../spin/phases/AdjustPhase.js').PinOverlayTween[] = [];
    const newSlot = targetSymbolHeight + symbolGapY;
    for (const [, entry] of this._pinOverlays) {
      if (entry.pin.col !== reelIndex) continue;
      const { pin, overlay } = entry;
      out.push({
        symbol: overlay,
        cellWidth: reel.symbolWidth,
        oldCellHeight: reel.symbolHeight,
        newCellHeight: targetSymbolHeight,
        fromY: overlay.view.y,
        toY: reel.container.y + pin.row * newSlot,
        x: reel.container.x,
      });
    }
    return out;
  }

  /**
   * Destroy a single pin's overlay, if present. Fires
   * `pin:overlayDestroyed` BEFORE the overlay is released to the pool, so
   * consumers can stop animations / remove listeners on a still-valid
   * instance.
   */
  private _destroyPinOverlay(key: string): void {
    const entry = this._pinOverlays.get(key);
    if (!entry) return;
    const { pin, overlay } = entry;
    this._events.emit('pin:overlayDestroyed', pin, overlay);
    this._viewport.unmaskedContainer.removeChild(overlay.view);
    this._symbolFactory.release(overlay);
    this._pinOverlays.delete(key);
  }

  /** Destroy every active pin overlay. Called on spin land and on destroy. */
  private _destroyAllPinOverlays(): void {
    const keys = [...this._pinOverlays.keys()];
    for (const key of keys) this._destroyPinOverlay(key);
  }
}
