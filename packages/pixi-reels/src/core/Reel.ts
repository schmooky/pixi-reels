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
  private _isDestroyed = false;
  private _isStopping = false;
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
   * the anchor lives. Used by ReelSet.getSymbolFootprint.
   */
  getAnchorRow(visibleRow: number): number {
    const occ = this._occupancy[visibleRow];
    return occ ? occ.anchorRow : visibleRow;
  }

  /**
   * Internal: record that the given visible row is the non-anchor cell of a
   * big symbol whose anchor lives at `anchorRow`. Called by `placeSymbols`
   * when a big-symbol id appears in the target frame.
   */
  setOccupancy(visibleRow: number, anchorRow: number | null): void {
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

  /** Place symbols immediately at target positions (for skip/turbo). */
  placeSymbols(symbolIds: string[]): void {
    const totalSlots = this.symbols.length;
    for (let i = 0; i < totalSlots; i++) {
      const targetId =
        i < this._bufferAbove
          ? this._randomProvider.next(true)
          : i < this._bufferAbove + symbolIds.length
            ? symbolIds[i - this._bufferAbove]
            : this._randomProvider.next(true);

      this._replaceSymbol(i, targetId);
    }
    this.motion.snapToGrid();
    this._finalizeFrame();
    this.refreshZIndex();
  }

  /**
   * MultiWays: commit a new visible-row count and per-reel cell height.
   * Resizes every existing symbol on the strip to the new cell height,
   * rebuilds the symbol array (extending or truncating buffers as needed),
   * and reshapes the motion layer. Idempotent if the shape doesn't change.
   *
   * Only callable on MultiWays slots. Non-MultiWays callers should never
   * reach this — `ReelSet.setShape()` rejects up-front.
   */
  reshape(
    newVisibleRows: number,
    newSymbolHeight: number,
    bufferAbove: number,
    bufferBelow: number,
  ): void {
    const newTotal = bufferAbove + newVisibleRows + bufferBelow;
    const oldTotal = this.symbols.length;

    // Grow: append additional symbols at the bottom buffer.
    while (this.symbols.length < newTotal) {
      const id = this._randomProvider.next(true);
      const sym = this._symbolFactory.acquire(id);
      sym.resize(this._symbolWidth, newSymbolHeight);
      sym.view.x = 0;
      this.container.addChild(sym.view);
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
   * Recompute `zIndex` for every symbol in the reel.
   *
   * Formula: `symbolData.zIndex ?? 0` (scaled by 100 to leave room for row
   * ordering), plus the symbol's current array index — so bottom-row symbols
   * render in front of top-row symbols and any symbol with a higher
   * configured base zIndex (e.g. wild, bonus) renders above its neighbors.
   *
   * Called automatically after wraps, snaps, and direct placement. Call it
   * manually after mutating `symbolsData.zIndex` at runtime.
   */
  refreshZIndex(): void {
    for (let i = 0; i < this.symbols.length; i++) {
      const symbol = this.symbols[i];
      if (symbol instanceof OccupiedStub) {
        symbol.view.zIndex = i;
        continue;
      }
      const base = this._symbolsData[symbol.symbolId]?.zIndex ?? 0;
      symbol.view.zIndex = base * 100 + i;
    }
  }

  destroy(): void {
    if (this._isDestroyed) return;
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

  private _setupSymbolPositions(config: ReelConfig): void {
    const slotH = this._spinSymbolHeight + config.symbolGapY;
    for (let i = 0; i < this.symbols.length; i++) {
      const symbol = this.symbols[i];
      const y = (i - config.bufferAbove) * slotH;
      symbol.view.y = y;
      symbol.view.x = 0;

      // All symbols go into the reel's own container
      this.container.addChild(symbol.view);
    }
    // Add the reel container to the viewport's masked area
    this._viewport.maskedContainer.addChild(this.container);
  }

  private _onSymbolWrapped(symbol: ReelSymbol, row: number, direction: 'up' | 'down'): void {
    let newSymbolId: string;
    if (this._isStopping && this.stopSequencer.hasRemaining) {
      newSymbolId = this.stopSequencer.next();
    } else {
      newSymbolId = this._randomProvider.next();
    }

    this._replaceSymbol(this.symbols.indexOf(symbol), newSymbolId);
    // Array was rearranged by ReelMotion (pop+unshift or shift+push), so the
    // array index of every remaining symbol changed — refresh all zIndexes.
    this.refreshZIndex();
  }

  private _replaceSymbol(index: number, newSymbolId: string): void {
    const oldSymbol = this.symbols[index];
    const isOldStub = oldSymbol instanceof OccupiedStub;

    // OCCUPIED: install a stub. Stubs are not pooled through SymbolFactory.
    if (newSymbolId === OCCUPIED_SENTINEL) {
      if (isOldStub) {
        oldSymbol.view.alpha = 0;
        return;
      }
      const parent = oldSymbol.view.parent;
      const y = oldSymbol.view.y;
      this._symbolFactory.release(oldSymbol);
      const stub = this._acquireOccupiedStub();
      stub.view.y = y;
      stub.view.x = 0;
      stub.view.alpha = 0;
      stub.view.visible = true;
      stub.view.scale.set(1, 1);
      if (parent && stub.view.parent !== parent) parent.addChild(stub.view);
      this.symbols[index] = stub;
      return;
    }

    // Replacing a stub with a real symbol: release stub back to internal cache.
    if (isOldStub) {
      const parent = oldSymbol.view.parent;
      const y = oldSymbol.view.y;
      this._releaseOccupiedStub(oldSymbol);
      const newSymbol = this._symbolFactory.acquire(newSymbolId);
      newSymbol.resize(this._symbolWidth, this._symbolHeight);
      newSymbol.view.y = y;
      newSymbol.view.x = 0;
      newSymbol.view.alpha = 1;
      newSymbol.view.scale.set(1, 1);
      newSymbol.view.zIndex = 0;
      if (parent) parent.addChild(newSymbol.view);
      this.symbols[index] = newSymbol;
      this.events.emit('symbol:created', newSymbolId, index);
      return;
    }

    // Even if same symbolId, always reset visual state (alpha, scale, zIndex)
    if (oldSymbol.symbolId === newSymbolId) {
      oldSymbol.view.alpha = 1;
      oldSymbol.view.scale.set(1, 1);
      oldSymbol.view.zIndex = 0;
      return;
    }

    const parent = oldSymbol.view.parent;
    const y = oldSymbol.view.y;

    this._symbolFactory.release(oldSymbol);
    const newSymbol = this._symbolFactory.acquire(newSymbolId);
    newSymbol.resize(this._symbolWidth, this._symbolHeight);
    newSymbol.view.y = y;
    newSymbol.view.x = 0;
    newSymbol.view.alpha = 1;
    newSymbol.view.scale.set(1, 1);
    newSymbol.view.zIndex = 0;

    if (parent) {
      parent.addChild(newSymbol.view);
    }

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

      sym.resize(w * this._symbolWidth, h * this._symbolHeight);
      for (let dy = 1; dy < h; dy++) {
        const occRow = row + dy;
        if (occRow < this._visibleRows) {
          this._occupancy[occRow] = { anchorRow: row };
        }
      }
    }
  }
}
