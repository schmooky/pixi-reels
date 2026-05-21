import { Container } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { SymbolFactory } from '../symbols/SymbolFactory.js';
import type { SymbolData } from '../config/types.js';
import { ReelMotion } from './ReelMotion.js';
import { StopSequencer } from './StopSequencer.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelEvents } from '../events/ReelEvents.js';
import type { RandomSymbolProvider } from '../frame/RandomSymbolProvider.js';
import type { ReelViewport } from './ReelViewport.js';
import type { SpinningMode } from '../spin/modes/SpinningMode.js';
import { StandardMode } from '../spin/modes/StandardMode.js';
import { getGsap } from '../utils/gsapRef.js';

/**
 * Options for `Reel.nudge()` / `ReelSet.nudge()` — a post-stop reposition
 * that shifts the reel by `distance` symbol positions and reveals new
 * caller-supplied symbols. Modelled on classic UK fruit-machine nudges.
 *
 * Nudges run only while the reel is at rest (post-stop). Calling on a
 * moving reel throws.
 */
export interface NudgeOptions {
  /**
   * Number of full symbol positions to shift. Must be a positive integer
   * strictly less than the reel's total strip capacity
   * (`bufferAbove + visibleRows + bufferBelow`). `incoming.length` must
   * equal this exactly.
   */
  distance: number;
  /**
   * Travel direction.
   *
   *   - `'down'` — symbols visually move down the screen; new symbols
   *     enter from the top.
   *   - `'up'` — symbols visually move up; new symbols enter from the
   *     bottom.
   */
  direction: 'up' | 'down';
  /**
   * Symbol ids in **top-down order of their final on-strip position** —
   * including any overflow into the off-screen buffer. Length must equal
   * `distance` exactly.
   *
   *   - `incoming[0]` ends up at the topmost new position. For `'down'`
   *     this is the new top visible row (or, if `distance > bufferAbove + visibleRows`,
   *     spills into bufferBelow tail-first via the trailing entries).
   *     For `'up'` with `distance > visibleRows`, `incoming[0]` lands in
   *     bufferAbove (still topmost).
   *   - `incoming[distance-1]` ends up at the bottommost new position.
   *     Mirror of the above.
   *
   * For the common case of `distance <= visibleRows`, every entry is a
   * visible row top-to-bottom and you can ignore the overflow rules.
   */
  incoming: string[];
  /** Total animation duration in ms. Defaults to `200 * distance`. */
  duration?: number;
  /**
   * GSAP easing function name. Defaults to `'power2.out'` — a smooth
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
   *   cols.map((col, i) =>
   *     reelSet.nudge(col, { ..., startDelay: i * 80 }),
   *   ),
   * );
   * ```
   *
   * `ReelSet.nudge(col, options, { stagger })` is sugar for the common
   * uniform-stagger case.
   */
  startDelay?: number;
  /**
   * Abort the nudge mid-flight. If signalled before the tween starts, the
   * call rejects with an `AbortError` and no strip mutation happens. If
   * signalled during the tween, the tween is killed, the strip is snapped
   * to its post-nudge position (deterministic landing — the contract is
   * "incoming lands at these positions"), and the promise rejects with an
   * `AbortError`. `nudge:cancelled` fires on the reel-set bus.
   */
  signal?: AbortSignal;
}

/**
 * Internal placeholder for OCCUPIED cells inside a big-symbol block. Has
 * no animation, no rendering — its view is invisible. Not registered in
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
  visibleRows: number;
  bufferAbove: number;
  bufferBelow: number;
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
  offsetY?: number;
  /**
   * Pixel height of this reel's box. Used for MultiWays cell-height
   * derivation (`reelHeight / visibleRows`). Defaults to
   * `visibleRows * symbolHeight`.
   */
  reelHeight?: number;
  /**
   * SPIN-time uniform cell height. During SPIN every reel uses this same
   * height. AdjustPhase later swaps to per-reel `reelHeight / visibleRows`.
   * Defaults to `symbolHeight`.
   */
  spinSymbolHeight?: number;
}

/**
 * Internal sentinel marking non-anchor cells of a big symbol's block.
 * Never crosses the public API — `getVisibleSymbols()` resolves it to the
 * anchor's id.
 */
export const OCCUPIED_SENTINEL = '__pixi_reels_occupied__';

/**
 * One vertical column of a slot board.
 *
 * A `Reel` owns:
 *   - the `ReelSymbol[]` currently on screen (a small buffer above the
 *     visible rows + the visible rows + a small buffer below — so symbols
 *     can fade in from off-screen cleanly)
 *   - the `ReelMotion` that adds a Y delta each tick and wraps symbols
 *     that scroll off the ends
 *   - a `StopSequencer` — the queue of target symbols the reel still has
 *     to land on before it can stop
 *
 * You generally do not touch a `Reel` directly. Drive the `ReelSet` and
 * let it fan out. Reels are exposed on `reelSet.reels` so you can read
 * the current grid (`reel.getSymbolAt(row)`) or listen to per-reel
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

  public readonly motion: ReelMotion;
  public readonly stopSequencer: StopSequencer;

  private _symbolFactory: SymbolFactory;
  private _randomProvider: RandomSymbolProvider;
  private _viewport: ReelViewport;
  private _symbolsData: Record<string, SymbolData>;
  private _visibleRows: number;
  private _bufferAbove: number;
  private _symbolWidth: number;
  private _symbolHeight: number;
  private _offsetY: number;
  private _reelHeight: number;
  private _spinSymbolHeight: number;
  private _symbolGapY: number;
  private _symbolGapX: number;
  private _isDestroyed = false;
  private _isStopping = false;
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
  private _nudgeTween: ReturnType<ReturnType<typeof getGsap>['to']> | null = null;
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
   * reel), never pooled through `SymbolFactory`. The views are invisible —
   * the anchor symbol is sized up to cover the whole block.
   */
  private _occupiedStubs: OccupiedStub[] = [];
  /**
   * Per-row marker recording which rows are non-anchor cells of a big
   * symbol. Populated when frames are placed; consulted by `getVisibleSymbols`
   * and `getSymbolAt` so anchor identity propagates through the block.
   *
   * Indexed by visible-row 0..visibleRows-1. Each entry is `null` for a
   * normal cell, or `{ anchorRow }` for a cell occupied by another row's
   * anchor.
   */
  private _occupancy: Array<{ anchorRow: number } | null> = [];
  /**
   * Optional resolver for cross-reel OCCUPIED cells. Set by `ReelSet` so
   * `getVisibleSymbols()` returns the anchor's id even when the anchor
   * lives on a different reel (a 2×2 bonus straddles cols c, c+1).
   * Without it, cross-reel OCCUPIED cells return the OCCUPIED sentinel.
   */
  private _crossReelResolver: ((col: number, row: number) => string) | null = null;

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
    this._visibleRows = config.visibleRows;
    this._bufferAbove = config.bufferAbove;
    this._symbolWidth = config.symbolWidth;
    this._symbolHeight = config.symbolHeight;
    this._offsetY = config.offsetY ?? 0;
    this._reelHeight = config.reelHeight ?? config.visibleRows * config.symbolHeight;
    this._spinSymbolHeight = config.spinSymbolHeight ?? config.symbolHeight;
    this._symbolGapY = config.symbolGapY;
    this._symbolGapX = config.symbolGapX;
    this._occupancy = new Array(config.visibleRows).fill(null);
    this.events = new EventEmitter<ReelEvents>();
    this.stopSequencer = new StopSequencer();

    // Create container positioned at the reel's X column. Sortable so that
    // per-symbol zIndex (set from symbolData.zIndex + visual row) controls
    // render order — bottom-row symbols render in front, and flagged "big"
    // symbols like wild/bonus can override to render above neighbors.
    this.container = new Container();
    this.container.sortableChildren = true;
    this.container.x = config.reelIndex * (config.symbolWidth + config.symbolGapX);
    this.container.y = this._offsetY;
    // Explicit zIndex so the reel's layer in `ReelViewport.maskedContainer`
    // (sortableChildren = true) is deterministic. Rightmost reel draws on
    // top by default — same visual order as insertion, but now set via
    // zIndex so callers can flip it for bottom-left diagonal overflow.
    this.container.zIndex = config.reelIndex;

    // Create initial symbols. Use spinSymbolHeight so during SPIN every reel
    // uses the same uniform cell height regardless of post-AdjustPhase shape.
    this.symbols = config.initialSymbols.map((symbolId, row) => {
      const symbol = symbolFactory.acquire(symbolId);
      symbol.resize(config.symbolWidth, this._spinSymbolHeight);
      return symbol;
    });

    // Create motion handler. SPIN-time slot height is `spinSymbolHeight`;
    // AdjustPhase reshapes motion to the per-reel cell height.
    this.motion = new ReelMotion(
      this.symbols,
      this._spinSymbolHeight,
      config.symbolGapY,
      config.bufferAbove,
      config.visibleRows,
      (symbol, row, direction) => this._onSymbolWrapped(symbol, row, direction),
    );

    // Position symbols on grid and add to containers
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

  get bufferAbove(): number {
    return this._bufferAbove;
  }

  get bufferBelow(): number {
    return this.symbols.length - this._bufferAbove - this._visibleRows;
  }

  get visibleRows(): number {
    return this._visibleRows;
  }

  /** The symbol cell width (in pixels). Constant for the reel's lifetime. */
  get symbolWidth(): number {
    return this._symbolWidth;
  }

  /**
   * The symbol cell height (in pixels). Mutates on MultiWays reshape via
   * `reshape()`. During SPIN this still equals `spinSymbolHeight`; the
   * per-reel target value comes into effect when AdjustPhase commits the
   * reshape. For non-MultiWays slots this is constant for the reel's lifetime.
   */
  get symbolHeight(): number {
    return this._symbolHeight;
  }

  /** Pixel height of this reel's box. Set by builder, immutable. */
  get reelHeight(): number {
    return this._reelHeight;
  }

  /** Y offset of this reel relative to the viewport top. Set by builder, immutable. */
  get offsetY(): number {
    return this._offsetY;
  }

  /**
   * SPIN-time uniform cell height. All reels in a slot use this value during
   * the SPIN phase regardless of their per-reel `symbolHeight`. Frozen at
   * construction.
   */
  get spinSymbolHeight(): number {
    return this._spinSymbolHeight;
  }

  /** Update reel for one frame. Called by SpinController via ticker. */
  update(deltaMs: number): void {
    if (this.speed === 0) return;

    const deltaY = this.spinningMode.computeDeltaY(
      this.motion.slotHeight,
      this.speed,
      deltaMs,
    );

    if (deltaY !== 0) {
      this.motion.displace(deltaY);
    }
  }

  /** Set the target frame for stopping. */
  setStopFrame(frame: string[]): void {
    this.stopSequencer.setFrame(frame);
  }

  /**
   * Get visible symbol IDs (top to bottom, excluding buffers).
   *
   * Big-symbol cells resolve to the anchor's id — both **same-reel**
   * (the anchor lives on this reel) and **cross-reel** (the anchor is on
   * a leftward reel of a wider block). The cross-reel resolver is
   * injected by `ReelSet`; without it, cross-reel OCCUPIED cells would
   * return the OCCUPIED sentinel, which is the only difference vs.
   * `ReelSet.getVisibleGrid()`. With the resolver wired, the two are
   * equivalent for any reel — `reels.map(r => r.getVisibleSymbols())`
   * matches `reelSet.getVisibleGrid()`.
   */
  getVisibleSymbols(): string[] {
    const result: string[] = [];
    for (let row = 0; row < this._visibleRows; row++) {
      const occ = this._occupancy[row];
      if (occ) {
        const anchor = this.symbols[this._bufferAbove + occ.anchorRow];
        result.push(anchor.symbolId);
      } else {
        const id = this.symbols[this._bufferAbove + row].symbolId;
        if (id === OCCUPIED_SENTINEL && this._crossReelResolver) {
          result.push(this._crossReelResolver(this.reelIndex, row));
        } else {
          result.push(id);
        }
      }
    }
    return result;
  }

  /**
   * Internal: register a callback used to resolve cross-reel OCCUPIED
   * cells to the originating big-symbol's id. Wired by `ReelSet` so this
   * reel can answer "what id is at (myCol, row)?" even when the anchor is
   * on a different reel.
   *
   * @internal
   */
  setCrossReelResolver(resolver: ((col: number, row: number) => string) | null): void {
    this._crossReelResolver = resolver;
  }

  /**
   * Get symbol at a visible row (0-indexed from top visible).
   * For non-anchor cells of a big symbol, walks up to the anchor row and
   * returns the anchor symbol so animations target the actual visual.
   */
  getSymbolAt(visibleRow: number): ReelSymbol {
    const occ = this._occupancy[visibleRow];
    const anchorRow = occ ? occ.anchorRow : visibleRow;
    return this.symbols[this._bufferAbove + anchorRow];
  }

  /**
   * Anchor row for a visible row. Equals `visibleRow` for normal cells;
   * for non-anchor cells inside a big-symbol block, returns the row where
   * the anchor lives.
   *
   * @internal — used by `ReelSet.getSymbolFootprint` and the cross-reel
   * resolver wired in `ReelSet`'s constructor. Not intended for consumer
   * use; prefer `ReelSet.getSymbolFootprint(col, row)` which returns full
   * anchor + size info.
   */
  _getAnchorRow(visibleRow: number): number {
    const occ = this._occupancy[visibleRow];
    return occ ? occ.anchorRow : visibleRow;
  }

  /**
   * Record that the given visible row is the non-anchor cell of a big
   * symbol whose anchor lives at `anchorRow`. Pass `null` to clear the
   * occupancy mark.
   *
   * @internal — called by `_finalizeFrame` and the big-symbol coordinator.
   */
  _setOccupancy(visibleRow: number, anchorRow: number | null): void {
    if (anchorRow === null) {
      this._occupancy[visibleRow] = null;
    } else {
      this._occupancy[visibleRow] = { anchorRow };
    }
  }

  /** Notify all visible symbols that the reel has started spinning. */
  notifySpinStart(): void {
    for (let i = this._bufferAbove; i < this._bufferAbove + this._visibleRows; i++) {
      this.symbols[i].onReelSpinStart();
    }
  }

  /** Notify all visible symbols that the reel is about to stop (just before bounce). */
  notifySpinEnd(): void {
    for (let i = this._bufferAbove; i < this._bufferAbove + this._visibleRows; i++) {
      this.symbols[i].onReelSpinEnd();
    }
  }

  /** Notify all visible symbols that the reel has landed on its target. */
  notifyLanded(): void {
    for (let i = this._bufferAbove; i < this._bufferAbove + this._visibleRows; i++) {
      this.symbols[i].onReelLanded();
    }
  }

  /**
   * Snap all symbols to grid and finalize big-symbol layout. Called at the
   * end of every stop sequence.
   */
  snapToGrid(): void {
    this.motion.snapToGrid();
    this._finalizeFrame();
    this.refreshZIndex();
  }

  /**
   * Swap the symbol at a single visible row in-place, without restarting
   * the spin or rebuilding the rest of the strip.
   *
   * Useful for live presentation effects at rest — converting a wild
   * after a cascade pop, swapping to a sticky variant after a win —
   * without going through the full `placeSymbols` / `setResult` paths.
   *
   * The symbol's `zIndex`, parent (masked vs unmasked), and visual state
   * are reset by `_replaceSymbol` so callers don't need to follow up
   * with `refreshZIndex`. The motion layer is **not** snapped — call
   * `snapToGrid()` separately if you need to re-grid.
   *
   * Throws if:
   *   - the reel is currently moving (`speed !== 0` or `isStopping`).
   *     A mid-spin swap would be overwritten by the next wrap/stop frame
   *     anyway; the fail-loud throw spares the caller the silent loss.
   *   - `visibleRow` is out of `[0, visibleRows)`.
   *   - `symbolId` is not registered.
   *   - the row is a non-anchor cell of an existing big-symbol block.
   *   - the row currently holds the anchor of a big-symbol block — big
   *     blocks span multiple cells (and possibly reels) and require
   *     `placeSymbols` + the cross-reel OCCUPIED coordinator.
   *   - `symbolId` itself is a big symbol — same reason.
   *
   * Pin overlap is **not** detected at this layer (Reel doesn't see the
   * pin map). Use `ReelSet.setSymbolAt(col, row, id)` for the safe
   * caller-facing surface that also throws on pinned cells.
   */
  setSymbolAt(visibleRow: number, symbolId: string): void {
    if (this.speed !== 0 || this._isStopping || this._isNudging) {
      throw new Error(
        `setSymbolAt: cannot swap mid-motion (speed=${this.speed}, isStopping=${this._isStopping}, isNudging=${this._isNudging}). ` +
        `Wait for the spin or nudge to land before calling, or use the result grid via setResult().`,
      );
    }
    if (!Number.isInteger(visibleRow) || visibleRow < 0 || visibleRow >= this._visibleRows) {
      throw new Error(
        `setSymbolAt: visibleRow ${visibleRow} is out of range [0, ${this._visibleRows}).`,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(this._symbolsData, symbolId)) {
      throw new Error(
        `setSymbolAt: symbolId '${symbolId}' is not registered. Register it via builder.symbols(...).`,
      );
    }
    const occ = this._occupancy[visibleRow];
    if (occ) {
      throw new Error(
        `setSymbolAt: visible row ${visibleRow} is a non-anchor cell of a big symbol (anchor at row ${occ.anchorRow}). ` +
        `Use placeSymbols to rebuild the frame.`,
      );
    }
    const arrayIndex = this._bufferAbove + visibleRow;
    const oldSym = this.symbols[arrayIndex];
    const oldMeta = this._symbolsData[oldSym.symbolId];
    if (oldMeta?.size && (oldMeta.size.w > 1 || oldMeta.size.h > 1)) {
      throw new Error(
        `setSymbolAt: row ${visibleRow} currently holds the anchor of big symbol ` +
        `'${oldSym.symbolId}' (${oldMeta.size.w}x${oldMeta.size.h}). Big blocks span multiple ` +
        `cells (and possibly reels); use placeSymbols + the OCCUPIED coordinator instead.`,
      );
    }
    const newMeta = this._symbolsData[symbolId];
    if (newMeta?.size && (newMeta.size.w > 1 || newMeta.size.h > 1)) {
      throw new Error(
        `setSymbolAt: '${symbolId}' is a big symbol (${newMeta.size.w}x${newMeta.size.h}). ` +
        `Use placeSymbols + the OCCUPIED coordinator instead.`,
      );
    }
    this._replaceSymbol(arrayIndex, symbolId);
  }

  /**
   * Shift the reel by `distance` symbol positions, animating the strip with
   * a GSAP tween and revealing caller-supplied `incoming` symbols. The reel
   * must be at rest (post-stop) — throws otherwise.
   *
   * The wrap pipeline drives identity changes during the tween: any incoming
   * symbol whose final destination is reachable via pre-placement (within
   * the leading buffer) is set up front; the rest stream through the wrap
   * callback as the strip moves. `incoming` is always top-down by final
   * on-strip position — see `NudgeOptions.incoming` for the overflow rules.
   *
   * **Big symbols are supported** as long as every block on the strip
   * (anchor + stubs) survives the rotation without crossing the wrap
   * boundary:
   *   - down: anchorRow + h - 1 + distance < total
   *   - up:   anchorRow ≥ distance
   *
   * Blocks that wouldn't survive throw, as do cross-reel blocks (w > 1).
   * Use case: a 1xH block lands with stubs in bufferBelow — nudge up to
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
   * Resolves with `{ symbols }` — the new visible column top-to-bottom.
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
        `(bufferAbove + visibleRows + bufferBelow = ${total}). At distance = total the strip ` +
        `rotates fully and pre-placed buffer entries would be silently dropped.`,
      );
    }
    if (direction !== 'up' && direction !== 'down') {
      throw new Error(`nudge: direction must be 'up' or 'down', got ${String(direction)}.`);
    }
    if (!Array.isArray(incoming) || incoming.length !== distance) {
      throw new Error(
        `nudge: incoming must be an array of exactly ${distance} symbol id(s), got length ${incoming?.length}.`,
      );
    }
    for (const id of incoming) {
      if (!Object.prototype.hasOwnProperty.call(this._symbolsData, id)) {
        throw new Error(`nudge: incoming symbol '${id}' is not registered. Register it via builder.symbols(...).`);
      }
      const meta = this._symbolsData[id];
      if (meta?.size && (meta.size.w > 1 || meta.size.h > 1)) {
        throw new Error(
          `nudge: incoming symbol '${id}' is a big symbol (${meta.size.w}x${meta.size.h}). ` +
          `Big symbols are not supported as incoming items (they need an anchor + OCCUPIED ` +
          `coordinator). Pre-existing big symbols on the strip CAN be nudged through.`,
        );
      }
    }

    // Scan the ENTIRE strip (not just visible) for big-symbol anchors.
    // A block survives the rotation iff:
    //   - down: anchor + h - 1 + distance < total      — block stays on
    //     the strip; the bottom may extend into bufferBelow (rendered
    //     half-clipped by the mask, which is fine — `_finalizeFrame`
    //     sizes anchors at visible rows already).
    //   - up:   anchor - distance >= bufferAbove        — anchor lands
    //     IN visible. We deliberately reject anchor → bufferAbove because
    //     `_finalizeFrame` doesn't size anchors that sit above visible
    //     today, so the block would render at 1x1 with an invisible stub.
    //     Tracked as a follow-up; for now, fail loud rather than render
    //     a broken block. (See bufferAbove-anchor TODO in _finalizeFrame.)
    // Cross-reel blocks (w > 1) can never be nudged on a single reel —
    // the other-reel cells stay put and the block splits visually + logically.
    for (let i = 0; i < total; i++) {
      const sym = this.symbols[i];
      if (sym instanceof OccupiedStub) continue;
      const meta = this._symbolsData[sym.symbolId];
      if (!meta?.size) continue;
      const { w, h } = meta.size;
      if (w === 1 && h === 1) continue;
      if (w > 1) {
        throw new Error(
          `nudge: reel ${this.reelIndex} carries cross-reel big symbol '${sym.symbolId}' ` +
          `(${w}x${h}) at strip[${i}]. Cross-reel blocks can't be nudged from a single ` +
          `reel — the other-reel cells would stay put and split the block.`,
        );
      }
      if (h > 1) {
        const survives = direction === 'down'
          ? i + h - 1 + distance < total
          : i - distance >= this._bufferAbove;
        if (!survives) {
          const failureDetail = direction === 'down'
            ? `anchor + h + distance < total (${i} + ${h} + ${distance} = ${i + h + distance} vs ${total})`
            : `anchor - distance >= bufferAbove (${i} - ${distance} = ${i - distance} vs ${this._bufferAbove}). ` +
              `Block anchor must land IN visible; the engine doesn't render anchors that land in bufferAbove today.`;
          throw new Error(
            `nudge: block '${sym.symbolId}' (${w}x${h}) at strip[${i}] wouldn't survive a ` +
            `distance=${distance} ${direction} nudge. Survival: ${failureDetail}.`,
          );
        }
      }
    }
    // Cross-reel stubs (cells with OCCUPIED sentinel whose anchor lives on
    // another reel) appear with `symbolId === OCCUPIED_SENTINEL` and no
    // entry in our local `_occupancy` map.
    for (let row = 0; row < this._visibleRows; row++) {
      const sym = this.symbols[this._bufferAbove + row];
      if (sym.symbolId === OCCUPIED_SENTINEL && !this._occupancy[row]) {
        throw new Error(
          `nudge: visible row ${row} is a non-anchor cell of a cross-reel big symbol. ` +
          `Cross-reel blocks can't be nudged from a single reel.`,
        );
      }
    }

    // Abort signal check — bail before any mutation if already aborted.
    if (signal?.aborted) {
      const err = new Error('nudge: aborted before start.');
      err.name = 'AbortError';
      throw err;
    }

    // Optional pre-tween delay — useful for staggered Promise.all calls.
    // Validation already passed, so consumers can rely on synchronous
    // error throws for invalid input.
    const startDelay = options.startDelay ?? 0;
    if (startDelay > 0) {
      await new Promise<void>((resolve, reject) => {
        const tId = setTimeout(resolve, startDelay);
        if (signal) {
          const onAbort = () => {
            clearTimeout(tId);
            const err = new Error('nudge: aborted during startDelay.');
            err.name = 'AbortError';
            reject(err);
          };
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
      // Re-check destroy / motion after the async gap.
      if (this._isDestroyed) {
        const err = new Error('nudge: reel destroyed during startDelay.');
        err.name = 'AbortError';
        throw err;
      }
    }

    const duration = options.duration ?? 200 * distance;
    const ease = options.ease ?? 'power2.out';
    const slotH = this.motion.slotHeight;
    const bufferAbove = this._bufferAbove;
    const bufferBelow = this.bufferBelow;

    // Pre-place incoming into the appropriate buffer; build the wrap queue
    // for the rest. Random fillers use `next(true)` so buffer-excluded
    // symbols don't leak into off-screen slots (matching placeSymbols).
    if (direction === 'down') {
      const bufferSet = Math.min(distance, bufferAbove);
      for (let i = 0; i < bufferSet; i++) {
        const stripIdx = bufferAbove - bufferSet + i;
        const incIdx = distance - bufferSet + i;
        this._replaceSymbol(stripIdx, incoming[incIdx]);
      }
      const queue: string[] = [];
      const wrapsToVisible = distance - bufferAbove;
      for (let k = 1; k <= distance; k++) {
        if (k <= wrapsToVisible) {
          queue.push(incoming[wrapsToVisible - k]);
        } else {
          queue.push(this._randomProvider.next(true));
        }
      }
      this._nudgeQueue = queue;
    } else {
      const bufferSet = Math.min(distance, bufferBelow);
      for (let i = 0; i < bufferSet; i++) {
        const stripIdx = bufferAbove + this._visibleRows + i;
        this._replaceSymbol(stripIdx, incoming[i]);
      }
      const queue: string[] = [];
      const wrapsToVisible = distance - bufferBelow;
      for (let k = 1; k <= distance; k++) {
        if (k <= wrapsToVisible) {
          queue.push(incoming[bufferBelow + k - 1]);
        } else {
          queue.push(this._randomProvider.next(true));
        }
      }
      this._nudgeQueue = queue;
    }

    // Re-snap so pre-set symbols sit on the grid before the tween begins.
    this.motion.snapToGrid();
    this.refreshZIndex();

    this._isNudging = true;
    this.events.emit('phase:enter', 'nudge');
    // Hook fires AFTER pre-placement so listeners see the about-to-tween
    // state (ReelSet uses this to emit `nudge:start` at the right time).
    onPrepared?.();

    const totalDelta = direction === 'down' ? distance * slotH : -distance * slotH;
    // Cap per-tick displacement at < half a slot so ReelMotion fires exactly
    // one wrap per `displace` call (mirrors SpinningMode.computeDeltaY).
    const stepLimit = slotH * 0.45;

    // Finalize closure — runs at natural completion AND on skip / abort.
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
        const stepDir = direction === 'down' ? stepLimit : -stepLimit;
        // ceil(slotH / stepLimit) substeps per wrap = ceil(1/0.45) = 3
        // per remaining wrap. Conservative — actual wraps fire when the
        // tail symbol crosses the boundary.
        for (let i = 0; i < stepsLeft * 3 && (this._nudgeQueue?.length ?? 0) > 0; i++) {
          this.motion.displace(stepDir);
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
        this._nudgeTween = getGsap().to(state, {
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
            const target = direction === 'down'
              ? Math.min(eased, totalDelta)
              : Math.max(eased, totalDelta);
            let remaining = target - lastDisplaced;
            while (Math.abs(remaining) > stepLimit) {
              const step = remaining > 0 ? stepLimit : -stepLimit;
              this.motion.displace(step);
              remaining -= step;
            }
            if (remaining !== 0) {
              this.motion.displace(remaining);
            }
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
   * Place symbols immediately at target positions (for skip/turbo).
   *
   * `symbolIds[0..n-1]` is the visible area. `symbolIds[n..]` (if present)
   * targets buffer-below slots. Buffer-above slots are addressed via
   * negative-index string properties: `symbolIds[-1]` is the slot closest to
   * the visible top row, `symbolIds[-bufferAbove]` the furthest above.
   * Unset slots are filled with random symbols, matching the previous
   * behaviour when only visible-area entries were provided.
   */
  placeSymbols(symbolIds: string[]): void {
    const totalSlots = this.symbols.length;
    const bufferAbove = this._bufferAbove;
    for (let i = 0; i < totalSlots; i++) {
      let targetId: string | undefined;
      if (i < bufferAbove) {
        // Buffer above: look up via negative-index string property.
        // i=0 → -bufferAbove (furthest); i=bufferAbove-1 → -1 (closest).
        const bufRow = i - bufferAbove;
        targetId = (symbolIds as Record<number, string | undefined>)[bufRow];
      } else {
        targetId = symbolIds[i - bufferAbove];
      }
      if (targetId === undefined) targetId = this._randomProvider.next(true);
      this._replaceSymbol(i, targetId);
    }
    this.motion.snapToGrid();
    this._finalizeFrame();
    this.refreshZIndex();
  }

  /**
   * @internal — MultiWays orchestration only.
   *
   * Commit a new visible-row count and per-reel cell height. Resizes every
   * existing symbol on the strip to the new cell height, rebuilds the
   * symbol array (extending or truncating buffers as needed), reshapes the
   * motion layer, and recomputes `_reelHeight` from the new geometry so
   * `reelHeight` stays consistent. Idempotent if the shape doesn't change.
   *
   * Only the engine should call this — `SpinController._applyReshape` is
   * the single source of truth for reshape orchestration. Direct external
   * calls are unsupported and may leave pin overlays, the cross-reel
   * resolver, and the parent `ReelSet`'s shape state out of sync. Use
   * `ReelSet.setShape()` instead, which gates this method on a MultiWays
   * slot and migrates pins atomically.
   */
  reshape(
    newVisibleRows: number,
    newSymbolHeight: number,
    bufferAbove: number,
    bufferBelow: number,
  ): void {
    const newTotal = bufferAbove + newVisibleRows + bufferBelow;

    // Grow: append additional symbols at the bottom buffer. New symbols are
    // parented based on `unmask` flag — same rule as `_replaceSymbol`.
    while (this.symbols.length < newTotal) {
      const id = this._randomProvider.next(true);
      const sym = this._symbolFactory.acquire(id);
      sym.resize(this._symbolWidth, newSymbolHeight);
      this._placeSymbolView(sym.view, sym.view.y, this._isUnmasked(id));
      this._parentForSymbolId(id).addChild(sym.view);
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

    this._visibleRows = newVisibleRows;
    this._symbolHeight = newSymbolHeight;
    this._bufferAbove = bufferAbove;
    this._occupancy = new Array(newVisibleRows).fill(null);
    // Recompute pixel-box height from the new geometry. For MultiWays this
    // equals the fixed `multiways.reelPixelHeight` by construction (the cell
    // height is derived from it); for any non-MultiWays caller it matches
    // what the builder would have set at construction. Keeps `reelHeight`
    // from going stale across reshape.
    this._reelHeight =
      newVisibleRows * newSymbolHeight + (newVisibleRows - 1) * this._symbolGapY;

    // Resize every kept symbol to the new cell height.
    for (const sym of this.symbols) {
      if (sym instanceof OccupiedStub) continue;
      sym.resize(this._symbolWidth, newSymbolHeight);
    }

    // Update motion: new slot height + bounds.
    this.motion.reshape(newSymbolHeight, this._symbolGapY, bufferAbove, newVisibleRows);
    this.motion.snapToGrid();
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
    return base * 100 + index;
  }

  /**
   * Recompute `zIndex` for every symbol in the reel.
   *
   * Formula: `symbolData.zIndex ?? 0` (scaled by 100 to leave room for row
   * ordering), plus the symbol's current array index — so bottom-row symbols
   * render in front of top-row symbols and any symbol with a higher
   * configured base zIndex (e.g. wild, bonus) renders above its neighbors.
   *
   * Called automatically after wraps, snaps, and direct placement. Also
   * called inline by `_replaceSymbol` for the single newly-placed symbol —
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
    // Kill any in-flight nudge tween BEFORE we tear down views — otherwise
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
    for (const symbol of this.symbols) {
      if (symbol instanceof OccupiedStub) {
        symbol.destroy();
      } else {
        this._symbolFactory.release(symbol);
      }
    }
    for (const stub of this._occupiedStubs) {
      if (!stub.isDestroyed) stub.destroy();
    }
    this._occupiedStubs = [];
    this.symbols = [];
    this.events.removeAllListeners();
    this.container.destroy({ children: true });
    this._isDestroyed = true;
    this.events.emit('destroyed');
  }

  /**
   * Whether the symbol with this id has `unmask: true` in its data — i.e.
   * its view should be parented to `viewport.unmaskedContainer` to render
   * above the reel mask.
   */
  private _isUnmasked(symbolId: string): boolean {
    return !!this._symbolsData[symbolId]?.unmask;
  }

  /**
   * Pick the right parent container for a symbol view based on its
   * `unmask` flag. Unmasked symbols sit in `viewport.unmaskedContainer`
   * (above the reel mask); everything else lives in this reel's own
   * container (which is itself inside `viewport.maskedContainer`).
   */
  private _parentForSymbolId(symbolId: string): Container {
    return this._isUnmasked(symbolId)
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
  private _placeSymbolView(view: Container, reelLocalY: number, isUnmasked: boolean): void {
    if (isUnmasked) {
      view.x = this.container.x;
      view.y = this.container.y + reelLocalY;
    } else {
      view.x = 0;
      view.y = reelLocalY;
    }
  }

  /**
   * Convert a view's current y back to reel-local coords. The view may
   * be parented to either `this.container` (already reel-local) or
   * `viewport.unmaskedContainer` (viewport-local — needs the reel offset
   * subtracted).
   */
  private _toReelLocalY(view: Container): number {
    return view.parent === this._viewport.unmaskedContainer
      ? view.y - this.container.y
      : view.y;
  }

  private _setupSymbolPositions(config: ReelConfig): void {
    const slotH = this._spinSymbolHeight + config.symbolGapY;
    // Add the reel container to the viewport's masked area first so
    // `this.container.x/y` are in viewport coords if any initial symbol
    // has `unmask: true` and needs parent-translation.
    this._viewport.maskedContainer.addChild(this.container);

    for (let i = 0; i < this.symbols.length; i++) {
      const symbol = this.symbols[i];
      const y = (i - config.bufferAbove) * slotH;
      const unmasked = this._isUnmasked(symbol.symbolId);
      this._placeSymbolView(symbol.view, y, unmasked);
      this._parentForSymbolId(symbol.symbolId).addChild(symbol.view);
    }
  }

  private _onSymbolWrapped(symbol: ReelSymbol, row: number, direction: 'up' | 'down'): void {
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
    // in the tween's finalize step — `distance` wraps fire back-to-back
    // and a single refresh at the end produces the same final state.
    // Spin / cascade refill paths keep the per-wrap refresh so live
    // bottom-to-top stacking stays correct mid-spin.
    if (!this._isNudging) {
      // Array was rearranged by ReelMotion (pop+unshift or shift+push), so the
      // array index of every remaining symbol changed — refresh all zIndexes.
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

    // Capture old Y in reel-local coords before releasing — old view may
    // have been parented to viewport.unmaskedContainer and need an offset
    // subtraction to be reused as the new symbol's reel-local Y.
    const reelLocalY = isOldStub
      ? oldSymbol.view.y
      : this._toReelLocalY(oldSymbol.view);

    // OCCUPIED: install a stub. Stubs are not pooled through SymbolFactory
    // and never carry an `unmask` flag — they always live in `this.container`.
    if (newSymbolId === OCCUPIED_SENTINEL) {
      if (isOldStub) {
        oldSymbol.view.alpha = 0;
        return;
      }
      this._symbolFactory.release(oldSymbol);
      const stub = this._acquireOccupiedStub();
      stub.view.y = reelLocalY;
      stub.view.x = 0;
      stub.view.alpha = 0;
      stub.view.visible = true;
      stub.view.scale.set(1, 1);
      stub.view.zIndex = index;
      // Stubs are never unmasked — always live in this reel's container.
      if (stub.view.parent !== this.container) this.container.addChild(stub.view);
      this.symbols[index] = stub;
      return;
    }

    // Replacing a stub with a real symbol: release stub back to internal
    // cache. The new symbol may be unmasked → choose parent + offset by id.
    if (isOldStub) {
      this._releaseOccupiedStub(oldSymbol);
      const newSymbol = this._symbolFactory.acquire(newSymbolId);
      const newIsUnmasked = this._isUnmasked(newSymbolId);
      newSymbol.resize(this._symbolWidth, this._symbolHeight);
      this._placeSymbolView(newSymbol.view, reelLocalY, newIsUnmasked);
      newSymbol.view.alpha = 1;
      newSymbol.view.scale.set(1, 1);
      newSymbol.view.zIndex = this._computeSymbolZIndex(newSymbolId, index);
      this._parentForSymbolId(newSymbolId).addChild(newSymbol.view);
      this.symbols[index] = newSymbol;
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
      const target = this._parentForSymbolId(newSymbolId);
      if (oldSymbol.view.parent !== target) target.addChild(oldSymbol.view);
      // Reset Y in case spotlight or another mutator displaced it.
      this._placeSymbolView(oldSymbol.view, reelLocalY, this._isUnmasked(newSymbolId));
      return;
    }

    this._symbolFactory.release(oldSymbol);
    const newSymbol = this._symbolFactory.acquire(newSymbolId);
    const newIsUnmasked = this._isUnmasked(newSymbolId);
    newSymbol.resize(this._symbolWidth, this._symbolHeight);
    this._placeSymbolView(newSymbol.view, reelLocalY, newIsUnmasked);
    newSymbol.view.alpha = 1;
    newSymbol.view.scale.set(1, 1);
    newSymbol.view.zIndex = this._computeSymbolZIndex(newSymbolId, index);

    this._parentForSymbolId(newSymbolId).addChild(newSymbol.view);

    this.symbols[index] = newSymbol;
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
   * After the visible target frame has been placed, scan visible rows to
   * size big-symbol anchors and populate the OCCUPIED occupancy map.
   *
   * Called from `snapToGrid` and `placeSymbols` so it runs both for normal
   * stop landing AND for skip/turbo. For non-anchor rows of a block, the
   * anchor symbol is sized to span the block; the OCCUPIED stub at that
   * row stays invisible underneath.
   */
  private _finalizeFrame(): void {
    this._occupancy = new Array(this._visibleRows).fill(null);

    for (let row = 0; row < this._visibleRows; row++) {
      const sym = this.symbols[this._bufferAbove + row];
      if (sym instanceof OccupiedStub) continue;
      const meta = this._symbolsData[sym.symbolId];
      if (!meta?.size) continue;
      const w = meta.size.w;
      const h = meta.size.h;
      if (w === 1 && h === 1) continue;

      // Size the anchor to span the block PLUS inter-cell gaps. A 2x2
      // block on a (cellW=80, cellH=80, gapX=4, gapY=4) layout covers
      // 2*80 + 1*4 = 164px wide, not 160px. Without the gap, the anchor
      // leaves a thin uncovered strip at the gap row/col.
      const blockW = w * this._symbolWidth + (w - 1) * this._symbolGapX;
      const blockH = h * this._symbolHeight + (h - 1) * this._symbolGapY;
      sym.resize(blockW, blockH);
      for (let dy = 1; dy < h; dy++) {
        const occRow = row + dy;
        if (occRow < this._visibleRows) {
          this._occupancy[occRow] = { anchorRow: row };
        }
      }
    }
  }
}
