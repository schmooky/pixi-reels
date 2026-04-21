import { Container } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
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
}

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
  private _isDestroyed = false;
  private _isStopping = false;

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
    this.events = new EventEmitter<ReelEvents>();
    this.stopSequencer = new StopSequencer();

    // Create container positioned at the reel's X column. Sortable so that
    // per-symbol zIndex (set from symbolData.zIndex + visual row) controls
    // render order — bottom-row symbols render in front, and flagged "big"
    // symbols like wild/bonus can override to render above neighbors.
    this.container = new Container();
    this.container.sortableChildren = true;
    this.container.x = config.reelIndex * (config.symbolWidth + config.symbolGapX);

    // Create initial symbols
    this.symbols = config.initialSymbols.map((symbolId, row) => {
      const symbol = symbolFactory.acquire(symbolId);
      symbol.resize(config.symbolWidth, config.symbolHeight);
      return symbol;
    });

    // Create motion handler
    this.motion = new ReelMotion(
      this.symbols,
      config.symbolHeight,
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

  /** The symbol cell height (in pixels). Constant for the reel's lifetime. */
  get symbolHeight(): number {
    return this._symbolHeight;
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

  /** Get visible symbol IDs (top to bottom, excluding buffers). */
  getVisibleSymbols(): string[] {
    const result: string[] = [];
    for (let i = this._bufferAbove; i < this._bufferAbove + this._visibleRows; i++) {
      result.push(this.symbols[i].symbolId);
    }
    return result;
  }

  /** Get symbol at a visible row (0-indexed from top visible). */
  getSymbolAt(visibleRow: number): ReelSymbol {
    return this.symbols[this._bufferAbove + visibleRow];
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

  /** Snap all symbols to grid. */
  snapToGrid(): void {
    this.motion.snapToGrid();
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
      const base = this._symbolsData[symbol.symbolId]?.zIndex ?? 0;
      symbol.view.zIndex = base * 100 + i;
    }
  }

  destroy(): void {
    if (this._isDestroyed) return;
    for (const symbol of this.symbols) {
      this._symbolFactory.release(symbol);
    }
    this.symbols = [];
    this.events.removeAllListeners();
    this.container.destroy({ children: true });
    this._isDestroyed = true;
    this.events.emit('destroyed');
  }

  private _setupSymbolPositions(config: ReelConfig): void {
    for (let i = 0; i < this.symbols.length; i++) {
      const symbol = this.symbols[i];
      const y = (i - config.bufferAbove) * (config.symbolHeight + config.symbolGapY);
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
}
