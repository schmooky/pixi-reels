import { Container } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { SymbolFactory } from '../symbols/SymbolFactory.js';
import type { SymbolData, Stacking } from '../config/types.js';
import { ReelMotion } from './ReelMotion.js';
import type { ReelAxis } from './ReelAxis.js';
import { VERTICAL_FORWARD } from './ReelAxis.js';
import { StopSequencer } from './StopSequencer.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelEvents } from '../events/ReelEvents.js';
import type { RandomSymbolProvider } from '../frame/RandomSymbolProvider.js';
import { columnTargetToStrip, type ColumnTarget } from '../frame/ColumnTarget.js';
import type { ReelViewport } from './ReelViewport.js';
import type { SpinningMode } from '../spin/modes/SpinningMode.js';
import { StandardMode } from '../spin/modes/StandardMode.js';
import { DEFAULT_GSAP, type Gsap } from '../utils/gsap.js';

/**
 * Upper bound (ms) on a single `update()` delta. Matches Pixi's default
 * minFPS-derived `maxElapsedMS`; bounds spin displacement when a backgrounded
 * tab refocuses or a non-Pixi ticker reports a huge delta.
 */
const MAX_TICK_MS = 100;

/**
 * Options for `Reel.nudge()` / `ReelSet.nudge()`. a post-stop reposition
 * that shifts the reel by `distance` symbol positions and reveals new
 * caller-supplied symbols.
 *
 * Nudges run only while the reel is at rest (post-stop). Calling on a
 * moving reel throws.
 */
export interface NudgeOptions {
  /**
   * Number of full symbol positions to shift. Must be a positive integer
   * strictly less than the reel's total strip capacity
   * (`bufferStart + visibleCells + bufferEnd`). `incoming.length` must
   * equal this exactly.
   */
  distance: number;
  /**
   * Travel direction, **relative to the reel's own axis**.
   *
   *   - `'forward'`. the strip travels the way this reel normally spins.
   *     On a vertical/forward reel that is downward, with new symbols
   *     entering from the top.
   *   - `'reverse'`. the strip travels the other way, with new symbols
   *     entering from the opposite edge.
   *
   * Which screen edge feeds the reel is derived from the axis polarity,
   * so a reel built with `direction('reverse')` nudges upward on
   * `'forward'` without the caller re-deriving anything.
   */
  direction: 'forward' | 'reverse';
  /**
   * Symbol ids in **start-to-end order of their final on-strip position**
   * (top-down for vertical, left-to-right for horizontal), including any
   * overflow into the off-screen buffer. Length must equal `distance`
   * exactly.
   *
   *   - `incoming[0]` ends up at the start-most new position. When the
   *     reel feeds from its start edge this is the new first visible cell
   *     (or, if `distance > bufferStart + visibleCells`, spills into
   *     bufferEnd tail-first via the trailing entries). When it feeds from
   *     the end edge and `distance > visibleCells`, `incoming[0]` lands in
   *     bufferStart (still start-most).
   *   - `incoming[distance-1]` ends up at the end-most new position.
   *     Mirror of the above.
   *
   * For the common case of `distance <= visibleCells`, every entry is a
   * visible cell in strip order and you can ignore the overflow rules.
   */
  incoming: string[];
  /** Total animation duration in ms. Defaults to `200 * distance`. */
  duration?: number;
  /**
   * GSAP easing function name. Defaults to `'power2.out'`. a smooth
   * deceleration with NO overshoot. If you pass an overshooting ease
   * (`back.out(N)`, `elastic.out(...)`), the engine clamps the displacement
   * so wraps never fire past the landing position; the eased value is
   * computed but the strip's travel is bounded.
   */
  ease?: string;
  /**
   * Optional delay (ms) before the tween begins. Validation throws fire
   * immediately on the call, but the actual reel mutation + tween are
   * deferred by this much. Useful with `Promise.all([...])` to stagger
   * parallel nudges:
   *
   * ```ts
   * await Promise.all(
   *   reels.map((reel, i) =>
   *     reelSet.nudge(reel, { ..., startDelay: i * 80 }),
   *   ),
   * );
   * ```
   *
   * `ReelSet.nudge(reel, options, { stagger })` is sugar for the common
   * uniform-stagger case.
   */
  startDelay?: number;
  /**
   * Abort the nudge mid-flight. If signalled before the tween starts, the
   * call rejects with an `AbortError` and no strip mutation happens. If
   * signalled during the tween, the tween is killed, the strip is snapped
   * to its post-nudge position (deterministic landing. the contract is
   * "incoming lands at these positions"), and the promise rejects with an
   * `AbortError`. `nudge:cancelled` fires on the reel-set bus.
   */
  signal?: AbortSignal;
}

/**
 * Internal placeholder for OCCUPIED cells inside a big-symbol block. Has
 * no animation, no rendering. its view is invisible. Not registered in
 * `SymbolFactory`; allocated directly by `Reel` and disposed with it.
 */
class OccupiedStub extends ReelSymbol {
  protected onActivate(): void { this.view.alpha = 0; this.view.visible = false; }
  protected onDeactivate(): void {}
  async playWin(): Promise<void> {}
  stopAnimation(): void {}
  resize(): void {}
}

export interface ReelConfig {
  reelIndex: number;
  visibleCells: number;
  bufferStart: number;
  bufferEnd: number;
  symbolWidth: number;
  symbolHeight: number;
  symbolGapX: number;
  symbolGapY: number;
  symbolsData: Record<string, SymbolData>;
  initialSymbols: string[];
  /**
   * Y offset of this reel relative to the viewport's top edge. Set by the
   * builder so jagged shapes (pyramids) align according to `reelAnchor`.
   * Default 0.
   */
  mainOffset?: number;
  /** Travel projection for this reel. Defaults to vertical/forward. */
  axis?: ReelAxis;
  /**
   * Pixel height of this reel's box. Used for MultiWays cell-height
   * derivation (`extent / visibleCells`). Defaults to
   * `visibleCells * symbolHeight`.
   */
  extent?: number;
  /**
   * SPIN-time uniform cell height. During SPIN every reel uses this same
   * height. AdjustPhase later swaps to per-reel `extent / visibleCells`.
   * Defaults to `symbolHeight`.
   */
  spinCellSize?: number;
  /**
   * Render order of cells within the reel. Default `'ascending'`. the cell
   * at the larger main coordinate draws in front.
   */
  /**
   * The gsap instance this reel's tweens live on. Defaults to the one
   * resolved at lib-load time; `ReelSetBuilder.gsap(...)` overrides it PER
   * SET, so two sets on one stage can use different instances.
   */
  gsap?: Gsap;
  cellStacking?: Stacking;
  /**
   * Render order of reels within the set. Default `'ascending'`. the last
   * reel draws in front.
   */
  reelStacking?: Stacking;
}

/**
 * Internal sentinel marking non-anchor cells of a big symbol's block.
 * Never crosses the public API. `getVisibleSymbols()` resolves it to the
 * anchor's id.
 */
export const OCCUPIED_SENTINEL = '__pixi_reels_occupied__';

/**
 * One vertical column of a slot board.
 *
 * A `Reel` owns:
 *   - the `ReelSymbol[]` currently on screen (a small buffer above the
 *     visible cells + the visible cells + a small buffer below. so symbols
 *     can fade in from off-screen cleanly)
 *   - the `ReelMotion` that adds a Y delta each tick and wraps symbols
 *     that scroll off the ends
 *   - a `StopSequencer`. the queue of target symbols the reel still has
 *     to land on before it can stop
 *
 * You generally do not touch a `Reel` directly. Drive the `ReelSet` and
 * let it fan out. Reels are exposed on `reelSet.reels` so you can read
 * the current grid (`reel.getSymbolAt(cell)`) or listen to per-reel
 * events (`phase:enter`, `landed`, `symbol:created`, ...).
 */
export class Reel implements Disposable {
  public readonly container: Container;
  public readonly events: EventEmitter<ReelEvents>;
  public readonly reelIndex: number;

  /** Current symbols in order (top buffer → visible → bottom buffer). */
  public symbols: ReelSymbol[];

  /** Current spin speed (pixels per frame). Set by phases. */
  public speed: number = 0;

  /** Current spinning mode. */
  public spinningMode: SpinningMode = new StandardMode();

  /**
   * The reel's motion layer.
   *
   * @internal `ReelMotion` was hidden from the package entry in 1.0.0 (PR #140)
   * along with `StopSequencer` and `RandomSymbolProvider`. This field being
   * public re-exposed the type through `dist/core/Reel.d.ts` and semver-locked
   * it into 2.x anyway. Public geometry lives on `ReelSet.getCellBounds()` /
   * `getBlockBounds()` and `Reel.cellMain` / `.extent` / `.mainOffset`.
   */
  public readonly motion: ReelMotion;
  /**
   * The reel's target-frame queue for the current stop.
   *
   * @internal Same as `motion`: hidden as a type in 1.0.0, re-exposed by this
   * field. Consumers drive landing through `setResult()` / `slamStop()`.
   */
  public readonly stopSequencer: StopSequencer;
  private readonly _axis: ReelAxis;
  private readonly _mainCell: number;
  private readonly _mainGap: number;
  private readonly _crossGap: number;
  /** This reel's cell extent along the strip. Varies per reel; reshape mutates it. */
  private _cellMain: number;
  /** This reel's cell extent across the strip. Uniform across the set. */
  private readonly _cellCross: number;

  private _symbolFactory: SymbolFactory;
  private _randomProvider: RandomSymbolProvider;
  private _viewport: ReelViewport;
  private _symbolsData: Record<string, SymbolData>;
  private _visibleCells: number;
  private _bufferStart: number;
  private _mainOffset: number;
  private readonly _gsap: Gsap;
  private _cellStacking: Stacking;
  private _reelStacking: Stacking;
  private _extent: number;
  private _spinCellSize: number;
  private _symbolGapY: number;
  private _symbolGapX: number;
  private _isDestroyed = false;
  private _isStopping = false;

  /**
   * True between `notifySpinStart()` and `notifySpinEnd()`. While set,
   * `_replaceSymbol` fires `onReelSpinStart(true)` on each freshly
   * installed symbol so it can join the spin presentation (pool recycling
   * wipes per-instance state, so the symbol can't know on its own).
   */
  private _spinPresentationActive = false;
  private _anticipationActive = false;
  /**
   * True only while the reel is fully at rest (build time, and from
   * `notifyLanded()` until the next `notifySpinStart()`). NOT the inverse
   * of `_spinPresentationActive`: that flag drops at `notifySpinEnd()`,
   * just before the bounce, while the strip is still visibly moving and
   * the stop sequencer is still installing the result symbols.
   */
  private _atRest = true;
  private _isNudging = false;
  /**
   * Symbol-id queue consulted by `_onSymbolWrapped` during a nudge. Each
   * wrap pulls one id from the front; when empty (or `null`), the wrap
   * falls back to `stopSequencer` (if `_isStopping`) or `_randomProvider`.
   *
   * Populated by `nudge()` and cleared once the tween completes.
   */
  private _nudgeQueue: string[] | null = null;
  /**
   * GSAP tween handle for the active nudge animation. Stored so `destroy()`
   * and `skipNudge()` can `kill()` it cleanly; cleared in `onComplete` and
   * on cancellation. `null` between nudges.
   */
  private _nudgeTween: ReturnType<Gsap['to']> | null = null;
  /**
   * Rejection function for the in-flight nudge's promise. Called by
   * `destroy()` and `signal.abort()` so consumers `await`-ing the nudge
   * see a deterministic error instead of a hung promise. Cleared on
   * `onComplete`. `null` between nudges.
   */
  private _nudgeReject: ((err: Error) => void) | null = null;
  /**
   * Internal stub instances reused for OCCUPIED cells inside a big-symbol
   * block. Allocated on demand (one per concurrent OCCUPIED cell on this
   * reel), never pooled through `SymbolFactory`. The views are invisible.
   * the anchor symbol is sized up to cover the whole block.
   */
  private _occupiedStubs: OccupiedStub[] = [];
  /**
   * Per-cell marker recording which cells are non-anchor cells of a big
   * symbol. Populated when frames are placed; consulted by `getVisibleSymbols`
   * and `getSymbolAt` so anchor identity propagates through the block.
   *
   * Indexed by visible-cell 0..visibleCells-1. Each entry is `null` for a
   * normal cell, or `{ anchorCell }` for a cell occupied by another cell's
   * anchor.
   */
  private _occupancy: Array<{ anchorCell: number } | null> = [];
  /**
   * Optional resolver for cross-reel OCCUPIED cells. Set by `ReelSet` so
   * `getVisibleSymbols()` returns the anchor's id even when the anchor
   * lives on a different reel (a 2x2 bonus straddles reels c, c+1).
   * Without it, cross-reel OCCUPIED cells return the OCCUPIED sentinel.
   */
  private _crossReelResolver: ((reel: number, cell: number) => string) | null = null;

  constructor(
    config: ReelConfig,
    symbolFactory: SymbolFactory,
    randomProvider: RandomSymbolProvider,
    viewport: ReelViewport,
  ) {
    this.reelIndex = config.reelIndex;
    this._symbolFactory = symbolFactory;
    this._randomProvider = randomProvider;
    this._viewport = viewport;
    this._symbolsData = config.symbolsData;
    this._visibleCells = config.visibleCells;
    this._bufferStart = config.bufferStart;
    this._mainOffset = config.mainOffset ?? 0;
    this._gsap = config.gsap ?? DEFAULT_GSAP;
    this._cellStacking = config.cellStacking ?? 'ascending';
    this._reelStacking = config.reelStacking ?? 'ascending';
    this._symbolGapY = config.symbolGapY;
    this._symbolGapX = config.symbolGapX;
    this._occupancy = new Array(config.visibleCells).fill(null);
    this.events = new EventEmitter<ReelEvents>();
    this.stopSequencer = new StopSequencer();

    // Create container positioned at the reel's X column. Sortable so that
    // per-symbol zIndex (set from symbolData.zIndex + visual cell) controls
    // render order. bottom-cell symbols render in front, and flagged "big"
    // symbols like wild/bonus can override to render above neighbors.
    this._axis = config.axis ?? VERTICAL_FORWARD;
    // The reel stores its cell size AXIS-RELATIVE, not as screen width and
    // height. `cellMain` is the extent along the strip and is the value a
    // pyramid or MultiWays reshape varies per reel; `cellCross` is the
    // reel-marching extent and is uniform across the set. Screen dimensions
    // are projected back out of the pair whenever art has to be resized, so
    // a jagged horizontal set varies WIDTH where a vertical one varies
    // height, from the same arithmetic.
    const cell = this._axis.toLocal(config.symbolWidth, config.symbolHeight);
    const gap = this._axis.toLocal(config.symbolGapX, config.symbolGapY);
    this._cellMain = cell.main;
    this._cellCross = cell.cross;
    this._mainGap = gap.main;
    this._crossGap = gap.cross;
    this._extent = config.extent ?? config.visibleCells * cell.main;
    this._spinCellSize = config.spinCellSize ?? cell.main;
    this._mainCell = this._spinCellSize;
    const crossPitch = cell.cross + gap.cross;
    this.container = new Container();
    this.container.sortableChildren = true;
    // Cross axis marches the reels; the main axis carries the reel's own
    // offset. For vertical this is (x = column, y = mainOffset), unchanged.
    this._axis.setCross(this.container, config.reelIndex * crossPitch);
    this._axis.setMain(this.container, this._mainOffset);
    // Explicit zIndex so the reel's layer in `ReelViewport.maskedContainer`
    // (sortableChildren = true) is deterministic. Rightmost reel draws on
    // top by default. same visual order as insertion, but now set via
    // zIndex so callers can flip it for bottom-left diagonal overflow.
    this.container.zIndex =
      this._reelStacking === 'ascending'
        ? config.reelIndex
        : -config.reelIndex;

    // Create initial symbols. Use spinCellSize so during SPIN every reel
    // uses the same uniform cell height regardless of post-AdjustPhase shape.
    this.symbols = config.initialSymbols.map((symbolId, cell) => {
      const symbol = symbolFactory.acquire(symbolId);
      const spinSize = this._screenSize(this._spinCellSize, this._cellCross);
      symbol.resize(spinSize.width, spinSize.height);
      return symbol;
    });

    // Create motion handler. SPIN-time slot height is `spinCellSize`;
    // AdjustPhase reshapes motion to the per-reel cell height.
    this.motion = new ReelMotion(
      this.symbols,
      this._mainCell,
      this._mainGap,
      config.bufferStart,
      config.visibleCells,
      config.bufferEnd,
      (symbol) => this._onSymbolWrapped(symbol),
      this._axis,
    );

    this._setupSymbolPositions(config);
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  get isStopping(): boolean {
    return this._isStopping;
  }

  set isStopping(value: boolean) {
    this._isStopping = value;
  }

  /** True while a `nudge()` tween is in flight on this reel. */
  get isNudging(): boolean {
    return this._isNudging;
  }

  get bufferStart(): number {
    return this._bufferStart;
  }

  get bufferEnd(): number {
    return this.symbols.length - this._bufferStart - this._visibleCells;
  }

  get visibleCells(): number {
    return this._visibleCells;
  }

  /**
   * This reel's cell width in SCREEN pixels - the first argument to
   * `ReelSymbol.resize`. On a vertical set this is the cross extent and is
   * constant; on a horizontal set it is the MAIN extent, so a pyramid or
   * MultiWays reshape moves it.
   */
  get symbolWidth(): number {
    return this._axis.toScreen(this._cellCross, this._cellMain).x;
  }

  /**
   * This reel's cell height in SCREEN pixels - the second argument to
   * `ReelSymbol.resize`. Mirror of {@link Reel.symbolWidth}: on a vertical
   * set this is the main extent and a MultiWays reshape moves it; on a
   * horizontal set it is the constant cross extent.
   *
   * During SPIN the main extent is still `spinCellSize`; the per-reel target
   * comes into effect when AdjustPhase commits the reshape.
   */
  get symbolHeight(): number {
    return this._axis.toScreen(this._cellCross, this._cellMain).y;
  }

  /**
   * Project an axis-relative (main, cross) pair back to the screen
   * `(width, height)` that `ReelSymbol.resize` takes. The single place the
   * engine converts back, so a jagged horizontal set varies width from
   * exactly the arithmetic a vertical one uses to vary height.
   */
  private _screenSize(main: number, cross: number): { width: number; height: number } {
    const s = this._axis.toScreen(cross, main);
    return { width: s.x, height: s.y };
  }

  /**
   * Screen size of an `reels x cells` block, gaps included. `reels` always
   * spans the cross axis and `cells` the main axis, so the screen width and
   * height this maps to swap between orientations.
   */
  private _blockSize(reels: number, cells: number): { width: number; height: number } {
    return this._screenSize(
      cells * this._cellMain + (cells - 1) * this._mainGap,
      reels * this._cellCross + (reels - 1) * this._crossGap,
    );
  }

  /** This reel's cell extent ALONG the strip. A reshape moves it. */
  get cellMain(): number {
    return this._cellMain;
  }

  /** This reel's cell extent ACROSS the strip. Uniform across the set. */
  get cellCross(): number {
    return this._cellCross;
  }

  /** The inter-cell gap along the strip (symbolGap.y vertical, .x horizontal). */
  get mainGap(): number {
    return this._mainGap;
  }

  /** The inter-reel gap across the strip (symbolGap.x vertical, .y horizontal). */
  get crossGap(): number {
    return this._crossGap;
  }

  /** Pixel extent of this reel's box along the strip. Set by builder. */
  get extent(): number {
    return this._extent;
  }

  /** Y offset of this reel relative to the viewport top. Set by builder, immutable. */
  get mainOffset(): number {
    return this._mainOffset;
  }

  /**
   * SPIN-time uniform cell height. All reels in a slot use this value during
   * the SPIN phase regardless of their per-reel `symbolHeight`. Frozen at
   * construction.
   */
  get spinCellSize(): number {
    return this._spinCellSize;
  }

  /** The gsap instance this reel's tweens live on. Read by every phase. */
  get gsap(): Gsap {
    return this._gsap;
  }

  /** This reel's travel projection (orientation + direction). */
  get axis(): ReelAxis {
    return this._axis;
  }

  /** Update reel for one frame. Called by SpinController via ticker. */
  update(deltaMs: number): void {
    if (this.speed === 0) return;

    // Clamp pathological frame spikes (a backgrounded tab refocusing, a custom
    // or fake ticker without Pixi's minFPS floor) to a sane per-tick budget.
    // Defence in depth on top of each mode's own displacement cap — the tumble
    // mode caps at a full slot, so an unbounded deltaMs there could still skip.
    const dt = Math.min(deltaMs, MAX_TICK_MS);

    const deltaY = this.spinningMode.computeDelta(
      this.motion.slotPitch,
      this.speed,
      dt,
    );

    if (deltaY !== 0) {
      this.motion.advance(deltaY);
    }
  }

  /**
   * Set the target frame for stopping.
   *
   * @internal Called by SpinController during the stop sequence.
   */
  setStopFrame(frame: string[]): void {
    // Feed the frame from the edge new symbols enter during the stop: forward
    // reels fill from the start edge (consume end-first), reverse reels fill
    // from the end edge (consume head-first). See StopSequencer.setFrame.
    this.stopSequencer.setFrame(frame, this._axis.feedEdge);
  }

  /**
   * Get visible symbol IDs (top to bottom, excluding buffers).
   *
   * Big-symbol cells resolve to the anchor's id. both **same-reel**
   * (the anchor lives on this reel) and **cross-reel** (the anchor is on
   * a leftward reel of a wider block). The cross-reel resolver is
   * injected by `ReelSet`; without it, cross-reel OCCUPIED cells would
   * return the OCCUPIED sentinel, which is the only difference vs.
   * `ReelSet.getVisibleGrid()`. With the resolver wired, the two are
   * equivalent for any reel. `reels.map(r => r.getVisibleSymbols())`
   * matches `reelSet.getVisibleGrid()`.
   */
  getVisibleSymbols(): string[] {
    const result: string[] = [];
    for (let cell = 0; cell < this._visibleCells; cell++) {
      const occ = this._occupancy[cell];
      if (occ) {
        const anchor = this.symbols[this._bufferStart + occ.anchorCell];
        result.push(anchor.symbolId);
      } else {
        const id = this.symbols[this._bufferStart + cell].symbolId;
        if (id === OCCUPIED_SENTINEL && this._crossReelResolver) {
          result.push(this._crossReelResolver(this.reelIndex, cell));
        } else {
          result.push(id);
        }
      }
    }
    return result;
  }

  /**
   * This reel's full strip as a `ColumnTarget` -- buffers included, anchors
   * at their true positions.
   *
   * `getVisibleSymbols()` reports the visible window only, so it cannot be
   * handed back: a block anchored in `bufferStart` with just its tail
   * showing reads as that id at visible cell 0, and feeding it to
   * `setResult` re-anchors the block there. This keeps the anchor where it
   * is, so `setResult(reelSet.getTargets())` reproduces the board.
   */
  getTarget(): ColumnTarget {
    const idAt = (stripIndex: number): string => {
      const id = this.symbols[stripIndex]?.symbolId ?? '';
      if (id !== OCCUPIED_SENTINEL) return id;
      // Never leak the sentinel. Walk back along the strip to the anchor that
      // owns this slot. Deliberately NOT the occupancy map or the cross-reel
      // resolver: both are keyed on VISIBLE cells, and a block anchored in
      // bufferStart has occupied slots at negative cells, where the resolver
      // throws "cell -1 out of range".
      for (let i = stripIndex - 1; i >= 0; i--) {
        const prev = this.symbols[i]?.symbolId;
        if (prev && prev !== OCCUPIED_SENTINEL) return prev;
      }
      // Cross-reel block whose anchor lives on another reel: any id is safe
      // here, since that anchor repaints this slot on replay.
      const cell = stripIndex - this._bufferStart;
      if (cell >= 0 && this._crossReelResolver) return this._crossReelResolver(this.reelIndex, cell);
      return this.symbols[this._bufferStart]?.symbolId ?? '';
    };

    const visible: string[] = [];
    for (let cell = 0; cell < this._visibleCells; cell++) visible.push(idAt(this._bufferStart + cell));

    const target: ColumnTarget = { visible };
    // `bufferStart[0]` is the slot nearest the window; later indices go further out.
    if (this._bufferStart > 0) {
      const start: string[] = [];
      for (let k = 0; k < this._bufferStart; k++) start.push(idAt(this._bufferStart - 1 - k));
      target.bufferStart = start;
    }
    if (this.bufferEnd > 0) {
      const end: string[] = [];
      for (let k = 0; k < this.bufferEnd; k++) end.push(idAt(this._bufferStart + this._visibleCells + k));
      target.bufferEnd = end;
    }
    return target;
  }

  /**
   * Internal: register a callback used to resolve cross-reel OCCUPIED
   * cells to the originating big-symbol's id. Wired by `ReelSet` so this
   * reel can answer "what id is at (myReel, cell)?" even when the anchor is
   * on a different reel.
   *
   * @internal
   */
  setCrossReelResolver(resolver: ((reel: number, cell: number) => string) | null): void {
    this._crossReelResolver = resolver;
  }

  /**
   * Get symbol at a visible cell (0-indexed from top visible).
   * For non-anchor cells of a big symbol, walks up to the anchor cell and
   * returns the anchor symbol so animations target the actual visual.
   */
  getSymbolAt(visibleCell: number): ReelSymbol {
    const occ = this._occupancy[visibleCell];
    const anchorCell = occ ? occ.anchorCell : visibleCell;
    return this.symbols[this._bufferStart + anchorCell];
  }

  /**
   * Resolve a visible cell to its anchor cell when a big symbol occupies it.
   *
   * @internal Wired by ReelSet and SymbolSpotlight. Consumers should call
   * `ReelSet.getSymbolFootprint()` or `ReelSet.getBlockBounds()` instead.
   */
  getAnchorCell(visibleCell: number): number {
    const occ = this._occupancy[visibleCell];
    return occ ? occ.anchorCell : visibleCell;
  }

  /**
   * Record that the given visible cell is the non-anchor cell of a big
   * symbol whose anchor lives at `anchorCell`. Pass `null` to clear the
   * occupancy mark.
   *
   * @internal. called by `_finalizeFrame` and the big-symbol coordinator.
   */
  _setOccupancy(visibleCell: number, anchorCell: number | null): void {
    if (anchorCell === null) {
      this._occupancy[visibleCell] = null;
    } else {
      this._occupancy[visibleCell] = { anchorCell };
    }
  }

  /**
   * Notify all strip symbols (visible and buffer cells. buffers scroll into
   * view within a frame of spin start) that the reel has started spinning,
   * and arm mid-spin notification: every symbol installed by
   * `_replaceSymbol` until `notifySpinEnd()` receives
   * `onReelSpinStart(true)` so pool-recycled symbols joining a moving reel
   * can apply their spin presentation (blur, static snapshot).
   *
   * @internal Called by SpinController on phase transition.
   */
  notifySpinStart(): void {
    this._spinPresentationActive = true;
    this._anticipationActive = false;
    // Safety net for callers that don't run `beginMotion()` first (skip
    // path, cascade phases). No-op once already re-masked. idempotent.
    this.beginMotion();
    for (let i = 0; i < this.symbols.length; i++) {
      this.symbols[i].onReelSpinStart();
    }
  }

  /**
   * Mark the reel as leaving rest and re-mask any lifted unmask symbols.
   *
   * Called the INSTANT this reel begins to move (start of the accel ramp),
   * not at `notifySpinStart` which fires only once the reel reaches full
   * speed. Unmask is an at-rest presentation: an unmasked symbol left in
   * `viewport.unmaskedContainer` would float above the mask while the
   * strip scrolls underneath it for the whole acceleration. Pull every
   * lifted view back into the masked reel container up front, and clear
   * `_atRest` so `_replaceSymbol` doesn't re-lift a result symbol mid-spin.
   *
   * @internal Called by StartPhase on launch. Idempotent.
   */
  beginMotion(): void {
    if (!this._atRest) return;
    this._atRest = false;
    for (let i = 0; i < this.symbols.length; i++) {
      const view = this.symbols[i].view;
      if (view.parent === this._viewport.unmaskedContainer) {
        const reelLocalY = this._axis.getMain(view) - this._axis.getMain(this.container);
        this.container.addChild(view);
        this._placeSymbolView(view, reelLocalY, false);
      }
    }
  }

  /**
   * Notify all strip symbols that this reel entered its anticipation
   * (tease) phase, and arm mid-anticipation notification: every symbol
   * installed by `_replaceSymbol` until `notifySpinEnd()` also receives
   * `onReelAnticipationStart()` so cells wrapping in during the tease
   * apply the readable (un-blurred) presentation.
   *
   * @internal Called by SpinController when the anticipation phase starts.
   */
  notifyAnticipationStart(): void {
    this._anticipationActive = true;
    for (let i = 0; i < this.symbols.length; i++) {
      this.symbols[i].onReelAnticipationStart();
    }
  }

  /**
   * Notify all strip symbols that the reel is about to stop (just before
   * bounce) and disarm mid-spin notification.
   *
   * @internal Called by SpinController on phase transition.
   */
  notifySpinEnd(): void {
    this._spinPresentationActive = false;
    this._anticipationActive = false;
    for (let i = 0; i < this.symbols.length; i++) {
      this.symbols[i].onReelSpinEnd();
    }
  }

  /**
   * Notify visible symbols that the reel has landed on its target.
   *
   * @param landedCells - Optional filter of visible cells (0-indexed) whose
   *   symbols receive `onReelLanded()`. Omit for a strip-spin landing
   *   (every visible symbol landed). Cascade refills pass only the cells
   *   that MOVED: an untouched survivor (offsetCells 0) replaying its
   *   landing animation on every cascade stage reads as the whole board
   *   twitching after each pop. The at-rest unmask lift always applies
   *   to every visible cell. it's presentation state, not a landing.
   *
   * @internal Called by SpinController / CascadeDropInPhase on phase transition.
   */
  notifyLanded(landedCells?: readonly number[]): void {
    this._atRest = true;
    const only = landedCells ? new Set(landedCells) : null;
    for (let i = this._bufferStart; i < this._bufferStart + this._visibleCells; i++) {
      const symbol = this.symbols[i];
      // Lift landed unmask symbols above the mask. visible cells only, so
      // a buffer-cell scatter never sits parked outside the grid.
      if (this._isUnmasked(symbol.symbolId) && symbol.view.parent === this.container) {
        const reelLocalY = this._axis.getMain(symbol.view);
        this._viewport.unmaskedContainer.addChild(symbol.view);
        this._placeSymbolView(symbol.view, reelLocalY, true);
      }
      if (only === null || only.has(i - this._bufferStart)) {
        symbol.onReelLanded();
      }
    }
  }

  /**
   * Snap all symbols to grid and finalize big-symbol layout. Called at the
   * end of every stop sequence.
   *
   * @internal SpinController and AdjustPhase finalization only.
   */
  snapToGrid(): void {
    this._reMaskLiftedBufferSlots();
    this.motion.snapToGrid();
    this._syncUnmaskedViewOffsets();
    this._finalizeFrame();
    this.refreshZIndex();
  }

  /**
   * Pull any lifted (unmasked) view that has ended up in a buffer slot back
   * under the mask.
   *
   * `_replaceSymbol` never lifts a buffer slot, but a symbol lifted while it
   * was VISIBLE can still travel into a buffer slot without being replaced:
   * a nudge rotates the array and only the wrapped symbol goes through
   * `_replaceSymbol`, so an unmask symbol nudged out of the window kept its
   * seat above the mask and hung there outside the grid. Runs on every
   * settle, where the strip's final slots are known.
   */
  private _reMaskLiftedBufferSlots(): void {
    for (let i = 0; i < this.symbols.length; i++) {
      const view = this.symbols[i].view;
      if (view.parent !== this._viewport.unmaskedContainer) continue;
      if (!this._isBufferSlot(i)) continue;
      const reelLocalMain = this._toReelLocalY(view);
      this.container.addChild(view);
      this._placeSymbolView(view, reelLocalMain, false);
    }
  }

  /**
   * Swap the symbol at a single visible cell in-place, without restarting
   * the spin or rebuilding the rest of the strip.
   *
   * Useful for live presentation effects at rest. converting a wild
   * after a cascade pop, swapping to a sticky variant after a win.
   * without going through the full `placeSymbols` / `setResult` paths.
   *
   * The symbol's `zIndex`, parent (masked vs unmasked), and visual state
   * are reset by `_replaceSymbol` so callers don't need to follow up
   * with `refreshZIndex`. The motion layer is **not** snapped. call
   * `snapToGrid()` separately if you need to re-grid.
   *
   * Throws if:
   *   - the reel is currently moving (`speed !== 0` or `isStopping`).
   *     A mid-spin swap would be overwritten by the next wrap/stop frame
   *     anyway; the fail-loud throw spares the caller the silent loss.
   *   - `visibleCell` is out of `[0, visibleCells)`.
   *   - `symbolId` is not registered.
   *   - the cell is a non-anchor cell of an existing big-symbol block.
   *   - the cell currently holds the anchor of a big-symbol block. big
   *     blocks span multiple cells (and possibly reels) and require
   *     `placeSymbols` + the cross-reel OCCUPIED coordinator.
   *   - `symbolId` itself is a big symbol. same reason.
   *
   * Pin overlap is **not** detected at this layer (Reel doesn't see the
   * pin map). Use `ReelSet.setSymbolAt(reel, cell, id)` for the safe
   * caller-facing surface that also throws on pinned cells.
   */
  setSymbolAt(visibleCell: number, symbolId: string): void {
    if (this.speed !== 0 || this._isStopping || this._isNudging) {
      throw new Error(
        `setSymbolAt: cannot swap mid-motion (speed=${this.speed}, isStopping=${this._isStopping}, isNudging=${this._isNudging}). ` +
        `Wait for the spin or nudge to land before calling, or use the result grid via setResult().`,
      );
    }
    if (!Number.isInteger(visibleCell) || visibleCell < 0 || visibleCell >= this._visibleCells) {
      throw new Error(
        `setSymbolAt: visibleCell ${visibleCell} is out of range [0, ${this._visibleCells}).`,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(this._symbolsData, symbolId)) {
      throw new Error(
        `setSymbolAt: symbolId '${symbolId}' is not registered. Register it via builder.symbols(...).`,
      );
    }
    const occ = this._occupancy[visibleCell];
    if (occ) {
      throw new Error(
        `setSymbolAt: visible cell ${visibleCell} is a non-anchor cell of a big symbol (anchor at cell ${occ.anchorCell}). ` +
        `Use placeSymbols to rebuild the frame.`,
      );
    }
    const arrayIndex = this._bufferStart + visibleCell;
    const oldSym = this.symbols[arrayIndex];
    const oldMeta = this._symbolsData[oldSym.symbolId];
    if (oldMeta?.size && (oldMeta.size.reels > 1 || oldMeta.size.cells > 1)) {
      throw new Error(
        `setSymbolAt: cell ${visibleCell} currently holds the anchor of big symbol ` +
        `'${oldSym.symbolId}' (${oldMeta.size.reels}x${oldMeta.size.cells}). Big blocks span multiple ` +
        `cells (and possibly reels); use placeSymbols + the OCCUPIED coordinator instead.`,
      );
    }
    const newMeta = this._symbolsData[symbolId];
    if (newMeta?.size && (newMeta.size.reels > 1 || newMeta.size.cells > 1)) {
      throw new Error(
        `setSymbolAt: '${symbolId}' is a big symbol (${newMeta.size.reels}x${newMeta.size.cells}). ` +
        `Use placeSymbols + the OCCUPIED coordinator instead.`,
      );
    }
    this._replaceSymbol(arrayIndex, symbolId);
  }

  /**
   * Shift the reel by `distance` symbol positions, animating the strip with
   * a GSAP tween and revealing caller-supplied `incoming` symbols. The reel
   * must be at rest (post-stop). throws otherwise.
   *
   * The wrap pipeline drives identity changes during the tween: any incoming
   * symbol whose final destination is reachable via pre-placement (within
   * the leading buffer) is set up front; the rest stream through the wrap
   * callback as the strip moves. `incoming` is always top-down by final
   * on-strip position. see `NudgeOptions.incoming` for the overflow rules.
   *
   * **Big symbols are supported** as long as every block on the strip
   * (anchor + stubs) survives the rotation without crossing the wrap
   * boundary:
   *   - down: anchorCell + h - 1 + distance < total
   *   - up:   anchorCell ≥ distance
   *
   * Blocks that wouldn't survive throw, as do cross-reel blocks (w > 1).
   * Use case: a 1xH block lands with stubs in bufferEnd. nudge up to
   * bring the whole block into view.
   *
   * Throws if:
   *   - the reel is spinning, stopping, already nudging, or destroyed,
   *   - `distance < 1`, `>= total strip capacity`, `direction` invalid, or
   *     `incoming.length !== distance`,
   *   - any `incoming` id is unregistered or is a big symbol,
   *   - any block on the reel wouldn't survive the rotation,
   *   - any cell on this reel is part of a cross-reel block (w > 1),
   *   - the abort signal is already aborted on entry.
   *
   * Resolves with `{ symbols }`. the new visible column top-to-bottom.
   * Rejects with an `AbortError` if `options.signal` aborts mid-tween or
   * if the reel is destroyed before the tween completes.
   *
   * @param onPrepared Internal hook fired once pre-placement + grid snap
   *   are done but before the tween starts. `ReelSet.nudge` uses this to
   *   emit `nudge:start` after the strip has been mutated, so listeners
   *   observe the about-to-animate state, not the pre-mutation state.
   */
  async nudge(
    options: NudgeOptions,
    onPrepared?: () => void,
  ): Promise<{ symbols: string[] }> {
    if (this._isDestroyed) {
      throw new Error('nudge: reel has been destroyed.');
    }
    if (this.speed !== 0 || this._isStopping || this._isNudging) {
      throw new Error(
        `nudge: cannot nudge a reel in motion (speed=${this.speed}, isStopping=${this._isStopping}, isNudging=${this._isNudging}). ` +
        `Wait for the spin or previous nudge to land first.`,
      );
    }
    const { distance, direction, incoming, signal } = options;
    if (!Number.isInteger(distance) || distance < 1) {
      throw new Error(`nudge: distance must be a positive integer, got ${distance}.`);
    }
    const total = this.symbols.length;
    if (distance >= total) {
      throw new Error(
        `nudge: distance ${distance} must be strictly less than total strip capacity ` +
        `(bufferStart + visibleCells + bufferEnd = ${total}). At distance = total the strip ` +
        `rotates fully and pre-placed buffer entries would be silently dropped.`,
      );
    }
    if (direction !== 'forward' && direction !== 'reverse') {
      throw new Error(
        `nudge: direction must be 'forward' or 'reverse', got ${String(direction)}.`,
      );
    }
    if (!Array.isArray(incoming) || incoming.length !== distance) {
      throw new Error(
        `nudge: incoming must be an array of exactly ${distance} symbol id(s), got length ${incoming?.length}.`,
      );
    }
    // `direction` is relative to the reel's own travel, so a signed travel
    // request is all `motion.advance` needs. it applies the polarity itself.
    const travelSign = direction === 'forward' ? 1 : -1;
    // Which array end new symbols arrive at. `advance` rotates toward the
    // array start when `polarity * delta > 0`, so a reverse-polarity reel
    // nudging 'forward' feeds from the opposite edge to a forward one.
    const wrapsIntoStart = travelSign * this._axis.polarity > 0;
    for (const id of incoming) {
      if (!Object.prototype.hasOwnProperty.call(this._symbolsData, id)) {
        throw new Error(`nudge: incoming symbol '${id}' is not registered. Register it via builder.symbols(...).`);
      }
      const meta = this._symbolsData[id];
      if (meta?.size && (meta.size.reels > 1 || meta.size.cells > 1)) {
        throw new Error(
          `nudge: incoming symbol '${id}' is a big symbol (${meta.size.reels}x${meta.size.cells}). ` +
          `Big symbols are not supported as incoming items (they need an anchor + OCCUPIED ` +
          `coordinator). Pre-existing big symbols on the strip CAN be nudged through.`,
        );
      }
    }

    // Scan the ENTIRE strip (not just visible) for big-symbol anchors.
    // A block survives the rotation iff none of its cells crosses the wrap
    // boundary during the `distance` advance ticks:
    //   - down: anchor + h - 1 + distance < total
    //     (the block's bottommost cell stays on the strip; it may land
    //     in bufferEnd. rendered half-clipped by the mask, which is
    //     fine: `_finalizeFrame` sizes anchors that extend past visible
    //     in either direction.)
    //   - up:   anchor - distance >= 0
    //     (the anchor stays on the strip; it may land in bufferStart.
    //     rendered correctly because `_finalizeFrame` scans bufferStart
    //     anchors too and sizes them to the full block.)
    //
    // Cross-reel blocks (w > 1) can never be nudged on a single reel.
    // the other-reel cells stay put and the block splits visually + logically.
    for (let i = 0; i < total; i++) {
      const sym = this.symbols[i];
      if (sym instanceof OccupiedStub) continue;
      const meta = this._symbolsData[sym.symbolId];
      if (!meta?.size) continue;
      const { reels: w, cells: h } = meta.size;
      if (w === 1 && h === 1) continue;
      if (w > 1) {
        throw new Error(
          `nudge: reel ${this.reelIndex} carries cross-reel big symbol '${sym.symbolId}' ` +
          `(${w}x${h}) at strip[${i}]. Cross-reel blocks can't be nudged from a single ` +
          `reel. the other-reel cells would stay put and split the block.`,
        );
      }
      if (h > 1) {
        const survives = wrapsIntoStart
          ? i + h - 1 + distance < total
          : i - distance >= 0;
        if (!survives) {
          const failureDetail = wrapsIntoStart
            ? `anchor + h - 1 + distance < total (${i} + ${h} - 1 + ${distance} = ${i + h - 1 + distance} vs ${total})`
            : `anchor - distance >= 0 (${i} - ${distance} = ${i - distance})`;
          throw new Error(
            `nudge: block '${sym.symbolId}' (${w}x${h}) at strip[${i}] wouldn't survive a ` +
            `distance=${distance} ${direction} nudge. the wrap boundary would split the ` +
            `anchor from its stubs. Block survival: ${failureDetail}.`,
          );
        }
      }
    }
    // Cross-reel stubs (cells with OCCUPIED sentinel whose anchor lives on
    // another reel) appear with `symbolId === OCCUPIED_SENTINEL` and no
    // entry in our local `_occupancy` map.
    for (let cell = 0; cell < this._visibleCells; cell++) {
      const sym = this.symbols[this._bufferStart + cell];
      if (sym.symbolId === OCCUPIED_SENTINEL && !this._occupancy[cell]) {
        throw new Error(
          `nudge: visible cell ${cell} is a non-anchor cell of a cross-reel big symbol. ` +
          `Cross-reel blocks can't be nudged from a single reel.`,
        );
      }
    }

    // Abort signal check. bail before any mutation if already aborted.
    if (signal?.aborted) {
      const err = new Error('nudge: aborted before start.');
      err.name = 'AbortError';
      throw err;
    }

    // Optional pre-tween delay. useful for staggered Promise.all calls.
    // Validation already passed, so consumers can rely on synchronous
    // error throws for invalid input.
    const startDelay = options.startDelay ?? 0;
    if (startDelay > 0) {
      // The abort listener must come back off on the NORMAL path too. `{ once:
      // true }` only self-removes when the event actually fires, so a signal
      // reused across the documented staggered-`Promise.all` pattern accrued
      // one dead listener per delayed nudge for the life of the controller.
      let onAbort: (() => void) | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          const tId = setTimeout(resolve, startDelay);
          if (signal) {
            onAbort = () => {
              clearTimeout(tId);
              const err = new Error('nudge: aborted during startDelay.');
              err.name = 'AbortError';
              reject(err);
            };
            signal.addEventListener('abort', onAbort, { once: true });
          }
        });
      } finally {
        if (onAbort) signal?.removeEventListener('abort', onAbort);
      }
      // Re-check destroy / motion after the async gap.
      if (this._isDestroyed) {
        const err = new Error('nudge: reel destroyed during startDelay.');
        err.name = 'AbortError';
        throw err;
      }
    }

    const duration = options.duration ?? 200 * distance;
    const ease = options.ease ?? 'power2.out';
    const slotH = this.motion.slotPitch;
    const bufferStart = this._bufferStart;
    const bufferEnd = this.bufferEnd;

    // Pre-place incoming into the appropriate buffer; build the wrap queue
    // for the rest. Random fillers use `next(true)` so buffer-excluded
    // symbols don't leak into off-screen slots (matching placeSymbols).
    //
    // **Big-symbol awareness**: if a buffer slot we're about to write to
    // currently holds an `OccupiedStub` (a non-anchor cell of a surviving
    // block), we MUST NOT overwrite it. that would split the block from
    // its anchor. The corresponding `incoming` slot is silently dropped
    // for that position; the block "wins" the visible cell it survives
    // into. Same for slots that hold a same-reel big-symbol anchor.
    const isProtectedSlot = (stripIdx: number): boolean => {
      const sym = this.symbols[stripIdx];
      if (sym instanceof OccupiedStub) return true;
      const meta = this._symbolsData[sym.symbolId];
      return !!(meta?.size && (meta.size.reels > 1 || meta.size.cells > 1));
    };
    if (wrapsIntoStart) {
      const bufferSet = Math.min(distance, bufferStart);
      for (let i = 0; i < bufferSet; i++) {
        const stripIdx = bufferStart - bufferSet + i;
        const incIdx = distance - bufferSet + i;
        if (isProtectedSlot(stripIdx)) continue;
        this._replaceSymbol(stripIdx, incoming[incIdx]);
      }
      const queue: string[] = [];
      const wrapsToVisible = distance - bufferStart;
      for (let k = 1; k <= distance; k++) {
        if (k <= wrapsToVisible) {
          queue.push(incoming[wrapsToVisible - k]);
        } else {
          queue.push(this._randomProvider.next(true));
        }
      }
      this._nudgeQueue = queue;
    } else {
      const bufferSet = Math.min(distance, bufferEnd);
      for (let i = 0; i < bufferSet; i++) {
        const stripIdx = bufferStart + this._visibleCells + i;
        if (isProtectedSlot(stripIdx)) continue;
        this._replaceSymbol(stripIdx, incoming[i]);
      }
      const queue: string[] = [];
      const wrapsToVisible = distance - bufferEnd;
      for (let k = 1; k <= distance; k++) {
        if (k <= wrapsToVisible) {
          queue.push(incoming[bufferEnd + k - 1]);
        } else {
          queue.push(this._randomProvider.next(true));
        }
      }
      this._nudgeQueue = queue;
    }

    // Re-snap so pre-set symbols sit on the grid before the tween begins.
    this.motion.snapToGrid();
    this._syncUnmaskedViewOffsets();
    this.refreshZIndex();

    this._isNudging = true;
    this.events.emit('phase:enter', 'nudge');
    // Hook fires AFTER pre-placement so listeners see the about-to-tween
    // state (ReelSet uses this to emit `nudge:start` at the right time).
    onPrepared?.();

    const totalDelta = travelSign * distance * slotH;
    // Cap per-tick displacement at < half a slot so ReelMotion fires exactly
    // one wrap per `advance` call (mirrors SpinningMode.computeDelta).
    const stepLimit = slotH * 0.45;

    // Finalize closure. runs at natural completion AND on skip / abort.
    // Captured here so `skipNudge()` can jump straight to the landed state
    // without re-deriving anything from the half-tweened strip.
    const finalize = () => {
      // Drain any remaining queue entries by completing the remaining
      // displacement in one shot. Each pending wrap fires its callback
      // and pulls from `_nudgeQueue` exactly as if the tween had run.
      const remainingQueue = this._nudgeQueue?.length ?? 0;
      if (remainingQueue > 0) {
        // Complete the remaining wraps. The strip's cumulative position
        // after k of D wraps is k * slotH worth of displacement (in the
        // tween's direction). We're at some intermediate position; just
        // drive to the final position one step at a time so each wrap fires.
        const stepsLeft = remainingQueue;
        const stepDir = travelSign * stepLimit;
        // ceil(slotH / stepLimit) substeps per wrap = ceil(1/0.45) = 3
        // per remaining wrap. Conservative. actual wraps fire when the
        // tail symbol crosses the boundary.
        for (let i = 0; i < stepsLeft * 3 && (this._nudgeQueue?.length ?? 0) > 0; i++) {
          this.motion.advance(stepDir);
        }
      }
      this.snapToGrid();
      this._isNudging = false;
      this._nudgeQueue = null;
      this._nudgeTween = null;
      this._nudgeReject = null;
      this.events.emit('phase:exit', 'nudge');
    };

    try {
      await new Promise<void>((resolve, reject) => {
        this._nudgeReject = reject;

        const onAbort = () => {
          if (this._nudgeTween) {
            this._nudgeTween.kill();
            this._nudgeTween = null;
          }
          finalize();
          const err = new Error('nudge: aborted.');
          err.name = 'AbortError';
          reject(err);
        };

        if (signal) {
          signal.addEventListener('abort', onAbort, { once: true });
        }

        const state = { p: 0 };
        let lastDisplaced = 0;
        this._nudgeTween = this._gsap.to(state, {
          p: 1,
          duration: duration / 1000,
          ease,
          onUpdate: () => {
            // Clamp `state.p * totalDelta` to the intended trajectory so
            // overshooting eases (back.out(N), elastic.out, ...) can't fire
            // a spurious wrap past the landing position. The eased curve
            // is still computed by GSAP; we just don't ride the overshoot
            // into the wrap mechanism.
            const eased = state.p * totalDelta;
            const target = totalDelta > 0
              ? Math.min(eased, totalDelta)
              : Math.max(eased, totalDelta);
            let remaining = target - lastDisplaced;
            while (Math.abs(remaining) > stepLimit) {
              const step = remaining > 0 ? stepLimit : -stepLimit;
              this.motion.advance(step);
              remaining -= step;
            }
            if (remaining !== 0) {
              this.motion.advance(remaining);
            }
            // `advance()` re-derives every main coordinate from the array
            // index, so it OVERWRITES the reel offset baked into any lifted
            // view. A nudge runs while the reel is at rest, which is exactly
            // when lifted views exist, so the fixup belongs on every tick
            // here - not just after an absolute snap.
            this._syncUnmaskedViewOffsets();
            lastDisplaced = target;
          },
          onComplete: () => {
            if (signal) signal.removeEventListener('abort', onAbort);
            finalize();
            resolve();
          },
        });
      });
    } catch (err) {
      // Re-throw so the caller's await sees it; finalize already ran in
      // the abort path. Don't re-finalize on caught errors.
      throw err;
    }

    const symbols = this.getVisibleSymbols();
    return { symbols };
  }

  /**
   * Fast-forward the active nudge tween to its landed state and resolve.
   * No-op if no nudge is in flight. The tween's `onComplete` fires
   * synchronously, the strip snaps to the final position, `_nudgeQueue`
   * drains, and the original `nudge()` promise resolves on the next
   * microtask.
   *
   * Useful for player-driven "skip" buttons or accessibility paths that
   * want to land immediately without waiting for the full animation.
   */
  skipNudge(): void {
    if (!this._isNudging || !this._nudgeTween) return;
    // GSAP's progress(1) fires onComplete which invokes our finalize +
    // resolves the awaiting promise. Drop the tween reference first so
    // `destroy()` doesn't try to kill an already-completed tween.
    const tween = this._nudgeTween;
    this._nudgeTween = null;
    tween.progress(1);
  }

  /**
   * Place a target column immediately (for skip/turbo/cascade landing).
   *
   * `target.visible[0..n-1]` fills the visible window; `bufferStart` and
   * `bufferEnd` fill the off-window slots either side, closest cell first.
   * Slots the target does not specify are filled with random symbols.
   */
  placeSymbols(target: ColumnTarget): void {
    this.placeStrip(columnTargetToStrip(target, this._bufferStart));
  }

  /**
   * @internal. Engine and custom phases only.
   *
   * Place a full strip frame: one entry per strip slot, top to bottom,
   * index `0` being the furthest buffer-above cell. This is exactly what
   * `FrameBuilder.build` returns, so a phase holding a built frame can
   * land it without re-deriving buffer offsets. Missing or `undefined`
   * entries are filled with random symbols.
   */
  placeStrip(frame: ReadonlyArray<string | undefined>): void {
    const totalSlots = this.symbols.length;
    for (let i = 0; i < totalSlots; i++) {
      const targetId = frame[i] ?? this._randomProvider.next(true);
      this._replaceSymbol(i, targetId);
    }
    this.motion.snapToGrid();
    this._syncUnmaskedViewOffsets();
    this._finalizeFrame();
    this.refreshZIndex();
  }

  /**
   * @internal. MultiWays orchestration only.
   *
   * Commit a new visible-cell count and per-reel cell height. Resizes every
   * existing symbol on the strip to the new cell height, rebuilds the
   * symbol array (extending or truncating buffers as needed), reshapes the
   * motion layer, and recomputes `_extent` from the new geometry so
   * `extent` stays consistent. Idempotent if the shape doesn't change.
   *
   * Only the engine should call this. `SpinController._applyReshape` is
   * the single source of truth for reshape orchestration. Direct external
   * calls are unsupported and may leave pin overlays, the cross-reel
   * resolver, and the parent `ReelSet`'s shape state out of sync. Use
   * `ReelSet.setShape()` instead, which gates this method on a MultiWays
   * slot and migrates pins atomically.
   */
  reshape(
    newVisibleCells: number,
    newCellSize: number,
    bufferStart: number,
    bufferEnd: number,
  ): void {
    const newTotal = bufferStart + newVisibleCells + bufferEnd;
    const newSize = this._screenSize(newCellSize, this._cellCross);

    // Grow: append additional symbols at the bottom buffer. New symbols are
    // parented based on `unmask` flag. same rule as `_replaceSymbol`.
    while (this.symbols.length < newTotal) {
      const id = this._randomProvider.next(true);
      const sym = this._symbolFactory.acquire(id);
      const slot = this.symbols.length;
      sym.resize(newSize.width, newSize.height);
      this._placeSymbolView(sym.view, this._axis.getMain(sym.view), this._effectiveUnmask(id, slot));
      this._parentForSymbolId(id, slot).addChild(sym.view);
      this.symbols.push(sym);
    }

    // Shrink: release tail symbols.
    while (this.symbols.length > newTotal) {
      const sym = this.symbols.pop()!;
      if (sym instanceof OccupiedStub) {
        sym.view.parent?.removeChild(sym.view);
      } else {
        this._symbolFactory.release(sym);
      }
    }

    this._visibleCells = newVisibleCells;
    this._cellMain = newCellSize;
    this._bufferStart = bufferStart;
    this._occupancy = new Array(newVisibleCells).fill(null);
    // Recompute the reel's main-axis extent from the new geometry, using the
    // MAIN gap rather than symbolGapY (ADR 016 section 6.6 - under horizontal
    // the strip is spaced by the X gap). For MultiWays this equals the fixed
    // `multiways.reelExtent` by construction; for any non-MultiWays caller it
    // matches what the builder set at construction. Keeps `extent` from going
    // stale across reshape.
    this._extent =
      newVisibleCells * newCellSize + (newVisibleCells - 1) * this._mainGap;

    // Resize every kept symbol to the new cell extent.
    for (const sym of this.symbols) {
      if (sym instanceof OccupiedStub) continue;
      sym.resize(newSize.width, newSize.height);
    }

    // Update motion: new slot pitch + bounds, on the main axis.
    this.motion.reshape(newCellSize, this._mainGap, bufferStart, newVisibleCells, bufferEnd);
    this.motion.snapToGrid();
    this._syncUnmaskedViewOffsets();
    this.refreshZIndex();
  }

  /**
   * Compute the canonical zIndex for a single symbol view at a given
   * array index. Centralizes the formula used by both `refreshZIndex`
   * (full rescan) and the per-swap activate path (so newly placed
   * symbols land with their correct zIndex without the caller needing
   * to remember to call `refreshZIndex` afterwards).
   */
  private _computeSymbolZIndex(symbolId: string, index: number): number {
    const base = this._symbolsData[symbolId]?.zIndex ?? 0;
    const within =
      this._cellStacking === 'ascending' ? index : this.symbols.length - 1 - index;
    return base * 100 + within;
  }

  /**
   * Recompute `zIndex` for every symbol in the reel.
   *
   * Formula: `symbolData.zIndex ?? 0` (scaled by 100 to leave room for cell
   * ordering), plus the symbol's current array index. so bottom-cell symbols
   * render in front of top-cell symbols and any symbol with a higher
   * configured base zIndex (e.g. wild, bonus) renders above its neighbors.
   *
   * Called automatically after wraps, snaps, and direct placement. Also
   * called inline by `_replaceSymbol` for the single newly-placed symbol.
   * so consumers who swap one symbol at a time (via the public APIs that
   * funnel into `_replaceSymbol`) get correct layering for free, no
   * manual `refreshZIndex` required. Call it manually after mutating
   * `symbolsData.zIndex` at runtime.
   */
  refreshZIndex(): void {
    for (let i = 0; i < this.symbols.length; i++) {
      const symbol = this.symbols[i];
      if (symbol instanceof OccupiedStub) {
        symbol.view.zIndex = i;
        continue;
      }
      symbol.view.zIndex = this._computeSymbolZIndex(symbol.symbolId, i);
    }
  }

  destroy(): void {
    if (this._isDestroyed) return;
    // Kill any in-flight nudge tween BEFORE we tear down views. otherwise
    // its next onUpdate writes to destroyed PixiJS containers and crashes.
    // Reject the outstanding promise so awaiters see a deterministic error.
    if (this._nudgeTween) {
      this._nudgeTween.kill();
      this._nudgeTween = null;
    }
    if (this._nudgeReject) {
      const err = new Error('nudge: reel was destroyed.');
      err.name = 'AbortError';
      this._nudgeReject(err);
      this._nudgeReject = null;
    }
    this._nudgeQueue = null;
    this._isNudging = false;
    // Destroy every symbol's view. We must NOT release live symbols back into
    // the shared pool here: the container.destroy({ children: true }) below
    // would then destroy the views of symbols now sitting in the pool, so the
    // next acquire() would hand out a destroyed view. (Full and partial reel
    // teardown both run through here.)
    for (const symbol of this.symbols) {
      symbol.destroy();
    }
    for (const stub of this._occupiedStubs) {
      if (!stub.isDestroyed) stub.destroy();
    }
    this._occupiedStubs = [];
    this.symbols = [];
    this.container.destroy({ children: true });
    this._isDestroyed = true;
    // Emit 'destroyed' while listeners are still attached, THEN remove them —
    // emitting after removeAllListeners() would reach nobody.
    this.events.emit('destroyed');
    this.events.removeAllListeners();
  }

  /**
   * Whether the symbol with this id has `unmask: true` in its data. i.e.
   * its view should be parented to `viewport.unmaskedContainer` to render
   * above the reel mask.
   */
  private _isUnmasked(symbolId: string): boolean {
    return !!this._symbolsData[symbolId]?.unmask;
  }

  /** Whether strip slot `index` sits outside the visible window. */
  private _isBufferSlot(index: number): boolean {
    return index < this._bufferStart || index >= this._bufferStart + this._visibleCells;
  }

  /**
   * Whether the symbol at strip slot `index` should render above the mask
   * RIGHT NOW. Unmask is an at-rest presentation of a VISIBLE cell:
   *
   *   - while the reel is in motion (including the stop approach and
   *     bounce, when the result symbols are installed), every view
   *     (unmask ids included) stays in the masked reel container so
   *     nothing scrolls visibly outside the grid, and
   *   - a buffer slot never lifts at all. it is parked outside the window
   *     precisely so the mask hides it, and a lifted one hangs above or
   *     below the grid in plain sight until the next spin re-masks it.
   *     `placeStrip` writes buffer slots at rest on every skip, which is
   *     exactly when that used to happen.
   *
   * Landed visible-cell symbols are lifted by `notifyLanded()`;
   * `notifySpinStart()` pulls them back down before the strip moves.
   */
  private _effectiveUnmask(symbolId: string, index: number): boolean {
    return this._atRest && !this._isBufferSlot(index) && this._isUnmasked(symbolId);
  }

  /**
   * Pick the right parent container for a symbol view based on its
   * `unmask` flag, its slot, and the reel's spin state. At-rest unmasked
   * symbols in a visible cell sit in `viewport.unmaskedContainer` (above
   * the reel mask); everything else lives in this reel's own container
   * (which is itself inside `viewport.maskedContainer`).
   */
  private _parentForSymbolId(symbolId: string, index: number): Container {
    return this._effectiveUnmask(symbolId, index)
      ? this._viewport.unmaskedContainer
      : this.container;
  }

  /**
   * Position a symbol view at a given reel-local Y, choosing X and any
   * parent-translation offset based on whether the symbol is unmasked.
   *
   * Unmasked views live in `viewport.unmaskedContainer` (at viewport
   * (0,0)), so we add `reel.container.x` and `reel.container.y` to keep
   * the at-rest cell position aligned with the reel column. Masked views
   * live in `this.container`, so reel-local coords map directly.
   */
  private _placeSymbolView(view: Container, reelLocalMain: number, isUnmasked: boolean): void {
    if (isUnmasked) {
      // Viewport space: bake in the reel container's own offset on both axes.
      this._axis.setCross(view, this._axis.getCross(this.container));
      this._axis.setMain(view, this._axis.getMain(this.container) + reelLocalMain);
    } else {
      this._axis.setCross(view, 0);
      this._axis.setMain(view, reelLocalMain);
    }
  }

  /**
   * Convert a view's current y back to reel-local coords. The view may
   * be parented to either `this.container` (already reel-local) or
   * `viewport.unmaskedContainer` (viewport-local. needs the reel offset
   * subtracted).
   */
  private _toReelLocalY(view: Container): number {
    return view.parent === this._viewport.unmaskedContainer
      ? this._axis.getMain(view) - this._axis.getMain(this.container)
      : this._axis.getMain(view);
  }

  /**
   * Re-bake the reel's `container.x/y` offset into any currently-lifted
   * (unmasked) view.
   *
   * `ReelMotion.snapToGrid()` writes bare reel-local Y to every symbol
   * view — it has no notion that some views were re-parented into
   * `viewport.unmaskedContainer` and need the reel offset added to stay
   * aligned. Masked reels have `container.y === 0`, so the two spaces
   * coincide and this is a no-op; on a jagged/pyramid layout (non-zero
   * `mainOffset`) the snap would drop the offset and jump the lifted view.
   *
   * Call this after ANY motion write. `advance()` derives positions from the
   * array index and writes them absolutely (it was `+=` in v1, which is why
   * this used to be snap-only), so it drops the offset just as `snapToGrid`
   * does.
   *
   * During a spin the loop finds nothing: `beginMotion()` pulls every lifted
   * view back down before the strip moves. A nudge is the case that matters,
   * because it runs at rest with views still lifted.
   */
  private _syncUnmaskedViewOffsets(): void {
    const mainOff = this._axis.getMain(this.container);
    const crossOff = this._axis.getCross(this.container);
    if (mainOff === 0 && crossOff === 0) return;
    for (let i = 0; i < this.symbols.length; i++) {
      const view = this.symbols[i].view;
      if (view.parent === this._viewport.unmaskedContainer) {
        // Cross offset is absolute (set once); main offset is incremental
        // (the view already holds its reel-local main coordinate).
        this._axis.setCross(view, crossOff);
        this._axis.addMain(view, mainOff);
      }
    }
  }

  /**
   * Shift every currently-lifted (unmask) view by `delta` on the main axis.
   *
   * Lifted views sit in `viewport.unmaskedContainer`, so the reel container's
   * offset is *baked into their own coordinate* rather than inherited from a
   * parent. Anything that moves `this.container` while views are lifted leaves
   * them behind — today that is the stop bounce, which lifts in `notifyLanded()`
   * and then tweens the container for the whole ~600 ms overshoot, so an
   * unmasked scatter hung motionless while the reel bounced underneath it.
   *
   * A delta rather than an absolute re-anchor: the caller owns the tween and
   * already knows where the container was, and `_syncUnmaskedViewOffsets` is
   * incremental for the same reason (the view holds reel-local main plus the
   * baked offset, and the two are not separable after the fact).
   *
   * @internal `StopPhase`'s bounce only.
   */
  offsetLiftedViews(delta: number): void {
    if (delta === 0) return;
    for (let i = 0; i < this.symbols.length; i++) {
      const view = this.symbols[i].view;
      if (view.parent === this._viewport.unmaskedContainer) {
        this._axis.addMain(view, delta);
      }
    }
  }

  private _setupSymbolPositions(config: ReelConfig): void {
    // MAIN-axis pitch, not `symbolGapY`. The two coincide on a vertical set,
    // which is why this survived the axis refactor: a horizontal set laid its
    // initial strip out at `cellMain` with no gap at all, and only looked
    // right after the first spin, when ReelMotion (which does use `_mainGap`)
    // took over the positions.
    const slotH = this._spinCellSize + this._mainGap;
    // Add the reel container to the viewport's masked area first so
    // `this.container.x/y` are in viewport coords if any initial symbol
    // has `unmask: true` and needs parent-translation.
    this._viewport.maskedContainer.addChild(this.container);

    for (let i = 0; i < this.symbols.length; i++) {
      const symbol = this.symbols[i];
      const main = (i - config.bufferStart) * slotH;
      // Unmask applies to visible cells only. a buffer-cell symbol lifted
      // above the mask would sit visibly parked outside the grid.
      const unmasked = this._effectiveUnmask(symbol.symbolId, i);
      this._placeSymbolView(symbol.view, main, unmasked);
      (unmasked ? this._viewport.unmaskedContainer : this.container).addChild(symbol.view);
    }
  }

  private _onSymbolWrapped(symbol: ReelSymbol): void {
    let newSymbolId: string;
    if (this._nudgeQueue && this._nudgeQueue.length > 0) {
      // Nudge queue is exhaustively pre-built by `nudge()` to cover every
      // wrap fired during the tween (caller-supplied incoming first, then
      // random padding for wraps that target the off-screen buffer). Always
      // wins over the stop sequencer so a queued slam-stop on a stale spin
      // can't bleed symbols into a fresh nudge.
      newSymbolId = this._nudgeQueue.shift()!;
    } else if (this._isStopping && this.stopSequencer.hasRemaining) {
      newSymbolId = this.stopSequencer.next();
    } else {
      newSymbolId = this._randomProvider.next();
    }

    this._replaceSymbol(this.symbols.indexOf(symbol), newSymbolId);
    // During a nudge tween, defer the O(N) zIndex rescan to `snapToGrid()`
    // in the tween's finalize step. `distance` wraps fire back-to-back
    // and a single refresh at the end produces the same final state.
    // Spin / cascade refill paths keep the per-wrap refresh so live
    // bottom-to-top stacking stays correct mid-spin.
    if (!this._isNudging) {
      // Array was rearranged by ReelMotion (pop+unshift or shift+push), so the
      // array index of every remaining symbol changed. refresh all zIndexes.
      this.refreshZIndex();
    }
  }

  private _replaceSymbol(index: number, newSymbolId: string): void {
    const oldSymbol = this.symbols[index];
    const isOldStub = oldSymbol instanceof OccupiedStub;
    // The old symbol's `view.parent` is unsafe as a destination because
    // the shared symbol pool can recycle a view across reels (or the
    // spotlight may have promoted it above the mask). Always re-pick
    // the destination from `_parentForSymbolId(newSymbolId)` (or
    // `this.container` for OCCUPIED stubs, which never carry `unmask`).

    // Capture old Y in reel-local coords before releasing. old view may
    // have been parented to viewport.unmaskedContainer and need an offset
    // subtraction to be reused as the new symbol's reel-local Y.
    const reelLocalY = isOldStub
      ? this._axis.getMain(oldSymbol.view)
      : this._toReelLocalY(oldSymbol.view);

    // OCCUPIED: install a stub. Stubs are not pooled through SymbolFactory
    // and never carry an `unmask` flag. they always live in `this.container`.
    if (newSymbolId === OCCUPIED_SENTINEL) {
      if (isOldStub) {
        oldSymbol.view.alpha = 0;
        return;
      }
      this._symbolFactory.release(oldSymbol);
      const stub = this._acquireOccupiedStub();
      this._axis.setMain(stub.view, reelLocalY);
      this._axis.setCross(stub.view, 0);
      stub.view.alpha = 0;
      stub.view.visible = true;
      stub.view.scale.set(1, 1);
      stub.view.zIndex = index;
      // Stubs are never unmasked. always live in this reel's container.
      if (stub.view.parent !== this.container) this.container.addChild(stub.view);
      this.symbols[index] = stub;
      return;
    }

    // Replacing a stub with a real symbol: release stub back to internal
    // cache. The new symbol may be unmasked → choose parent + offset by id.
    if (isOldStub) {
      this._releaseOccupiedStub(oldSymbol);
      const newSymbol = this._symbolFactory.acquire(newSymbolId);
      const newIsUnmasked = this._effectiveUnmask(newSymbolId, index);
      newSymbol.resize(this.symbolWidth, this.symbolHeight);
      this._placeSymbolView(newSymbol.view, reelLocalY, newIsUnmasked);
      newSymbol.view.alpha = 1;
      newSymbol.view.scale.set(1, 1);
      newSymbol.view.zIndex = this._computeSymbolZIndex(newSymbolId, index);
      this._parentForSymbolId(newSymbolId, index).addChild(newSymbol.view);
      this.symbols[index] = newSymbol;
      if (this._spinPresentationActive) newSymbol.onReelSpinStart(true);
      if (this._anticipationActive) newSymbol.onReelAnticipationStart();
      this.events.emit('symbol:created', newSymbolId, index);
      return;
    }

    // Same id fast-path. Reset every mutable visual property (alpha, scale,
    // rotation, filters, zIndex) AND re-anchor the view to this reel's
    // container in case the pool moved it elsewhere since the last
    // activation (e.g. spotlight promotion above the mask).
    if (oldSymbol.symbolId === newSymbolId) {
      oldSymbol.view.alpha = 1;
      oldSymbol.view.scale.set(1, 1);
      oldSymbol.view.rotation = 0;
      oldSymbol.view.filters = null;
      oldSymbol.view.zIndex = this._computeSymbolZIndex(newSymbolId, index);
      // Same id → same unmask status; pick the right destination by id
      // so an unmasked symbol stays in `unmaskedContainer` post-spotlight.
      const target = this._parentForSymbolId(newSymbolId, index);
      if (oldSymbol.view.parent !== target) target.addChild(oldSymbol.view);
      // Reset Y in case spotlight or another mutator displaced it.
      this._placeSymbolView(oldSymbol.view, reelLocalY, this._effectiveUnmask(newSymbolId, index));
      // The instance was never deactivated, so it usually still carries its
      // spin state. re-notify anyway for uniformity (hooks are idempotent).
      if (this._spinPresentationActive) oldSymbol.onReelSpinStart(true);
      if (this._anticipationActive) oldSymbol.onReelAnticipationStart();
      return;
    }

    this._symbolFactory.release(oldSymbol);
    const newSymbol = this._symbolFactory.acquire(newSymbolId);
    const newIsUnmasked = this._effectiveUnmask(newSymbolId, index);
    newSymbol.resize(this.symbolWidth, this.symbolHeight);
    this._placeSymbolView(newSymbol.view, reelLocalY, newIsUnmasked);
    newSymbol.view.alpha = 1;
    newSymbol.view.scale.set(1, 1);
    newSymbol.view.zIndex = this._computeSymbolZIndex(newSymbolId, index);

    this._parentForSymbolId(newSymbolId, index).addChild(newSymbol.view);

    this.symbols[index] = newSymbol;
    if (this._spinPresentationActive) newSymbol.onReelSpinStart(true);
    if (this._anticipationActive) newSymbol.onReelAnticipationStart();
    this.events.emit('symbol:created', newSymbolId, index);
  }

  /**
   * Acquire an OCCUPIED stub. Reuses any free stub stored locally; allocates
   * a new one if none are available. Stubs are never returned to
   * `SymbolFactory`.
   */
  private _acquireOccupiedStub(): OccupiedStub {
    for (const stub of this._occupiedStubs) {
      if (!stub.view.parent) return stub;
    }
    const stub = new OccupiedStub();
    stub.activate(OCCUPIED_SENTINEL);
    this._occupiedStubs.push(stub);
    return stub;
  }

  private _releaseOccupiedStub(stub: ReelSymbol): void {
    stub.view.parent?.removeChild(stub.view);
  }

  /**
   * After the visible target frame has been placed, scan the strip to
   * size big-symbol anchors and populate the OCCUPIED occupancy map.
   *
   * Called from `snapToGrid` and `placeSymbols` so it runs both for normal
   * stop landing AND for skip/turbo. For non-anchor cells of a block, the
   * anchor symbol is sized to span the block; the OCCUPIED stub at that
   * cell stays invisible underneath.
   *
   * **Two scans:**
   *
   *  1. Visible anchors. sizes blocks whose anchor is in `[0, visibleCells)`.
   *     This is the common case (most blocks land fully visible). Blocks
   *     whose stubs spill into bufferEnd are handled here: the anchor is
   *     in visible, the sprite is sized to span `h * cellH`, and the mask
   *     clips the off-screen tail. No occupancy entry is written for the
   *     bufferEnd stubs because `_occupancy` is keyed by visible cells
   *     only. consumers can't query a non-visible cell anyway.
   *  2. BufferAbove anchors. sizes blocks whose anchor sits above visible
   *     but whose body extends into the visible window. This is the "tail
   *     visible" partial-visibility case: a 1xH block whose top is clipped
   *     by the reel mask, with only its bottom cells showing in the visible
   *     window. Without this scan, the anchor sprite would stay at the
   *     default 1x1 size and the block wouldn't render its visible portion
   *     correctly.
   *
   * **No Scan 3 for bufferEnd-only anchors.** A block whose anchor is at
   * `cell >= visibleCells` would lie entirely off-screen (the strip ends at
   * `visibleCells + bufferEnd - 1` and `h >= 1`, so no visible cell is
   * covered). The cross-reel coordinator already accepts such anchors as a
   * legal-but-invisible placement; there's nothing to size and nothing for
   * the consumer-facing query API to return. If you ever add a scenario
   * where bufferEnd-only anchors need rendering, add Scan 3 here.
   *
   * For bufferStart anchors, `_occupancy[visibleCell].anchorCell` is set to
   * a NEGATIVE value. the offset from `bufferStart`. So
   * `this.symbols[this._bufferStart + anchorCell]` walks back to the anchor
   * regardless of which side it lives on. Consumers (`getSymbolFootprint`,
   * `getBlockBounds`) handle negative anchor cells by clipping bounds to
   * the visible portion of the block.
   */
  private _finalizeFrame(): void {
    this._occupancy = new Array(this._visibleCells).fill(null);

    // Scan 1: visible-cell anchors.
    for (let cell = 0; cell < this._visibleCells; cell++) {
      const sym = this.symbols[this._bufferStart + cell];
      if (sym instanceof OccupiedStub) continue;
      const meta = this._symbolsData[sym.symbolId];
      if (!meta?.size) continue;
      const w = meta.size.reels;
      const h = meta.size.cells;
      if (w === 1 && h === 1) continue;

      // Size the anchor to span the block PLUS inter-cell gaps. A 2x2
      // block on a (cell=80, gap=4) layout covers 2*80 + 1*4 = 164px, not
      // 160px. Without the gap, the anchor leaves a thin uncovered strip.
      //
      // `size.reels` spans the CROSS axis and `size.cells` the MAIN axis in
      // every orientation (ADR 016 section 6.7), so a 2x2 is 2 reels by 2
      // cells whichever way the strip runs - which means the screen width
      // and height it maps to invert under horizontal.
      const block = this._blockSize(w, h);
      sym.resize(block.width, block.height);
      for (let dy = 1; dy < h; dy++) {
        const occCell = cell + dy;
        if (occCell < this._visibleCells) {
          this._occupancy[occCell] = { anchorCell: cell };
        }
      }
    }

    // Scan 2: bufferStart anchors whose block extends into visible.
    // Iterating strip cells [0, bufferStart); the anchor's visible-cell
    // equivalent is `stripIdx - bufferStart` (negative).
    for (let stripIdx = 0; stripIdx < this._bufferStart; stripIdx++) {
      const sym = this.symbols[stripIdx];
      if (sym instanceof OccupiedStub) continue;
      const meta = this._symbolsData[sym.symbolId];
      if (!meta?.size) continue;
      const w = meta.size.reels;
      const h = meta.size.cells;
      if (w === 1 && h === 1) continue;

      // Does the block extend into visible? The block spans strip indices
      // [stripIdx, stripIdx + h). Visible starts at `bufferStart`.
      const blockBottomStrip = stripIdx + h - 1;
      if (blockBottomStrip < this._bufferStart) continue;

      const block = this._blockSize(w, h);
      sym.resize(block.width, block.height);

      const anchorCell = stripIdx - this._bufferStart; // negative
      for (let dy = 1; dy < h; dy++) {
        const occCell = anchorCell + dy;
        if (occCell >= 0 && occCell < this._visibleCells) {
          this._occupancy[occCell] = { anchorCell };
        }
      }
    }
  }
}
