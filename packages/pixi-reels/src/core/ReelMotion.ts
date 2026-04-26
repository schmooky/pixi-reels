import type { ReelSymbol } from '../symbols/ReelSymbol.js';

/**
 * The physics of one reel — move symbols down, wrap them around.
 *
 * Every frame, `ReelMotion.update(delta)` adds `delta` to each symbol's
 * Y coordinate. A symbol whose position falls off the bottom wraps back
 * to the top (and vice versa — reels can run upward). Each wrap fires
 * the `_onSymbolWrapped` callback so the owning `Reel` can ask the
 * `FrameBuilder` for the next identity to paint on it.
 *
 * Maintains the invariant that `_symbols[0]` is always the visually
 * topmost symbol and `_symbols[N-1]` is always the bottommost. On each
 * wrap, the wrapping symbol is moved to the front (or back) of the array
 * so the ordering stays consistent with the grid. `snapToGrid` and the
 * visible window selection rely on this.
 */
export class ReelMotion {
  private _symbolHeight: number;
  private _symbolGapY: number;
  private _slotHeight: number;
  private _minY: number;
  private _maxY: number;

  constructor(
    private _symbols: ReelSymbol[],
    symbolHeight: number,
    symbolGapY: number,
    private _bufferAbove: number,
    visibleRows: number,
    private _onSymbolWrapped: (symbol: ReelSymbol, arrayIndex: number, direction: 'up' | 'down') => void,
  ) {
    this._symbolHeight = symbolHeight;
    this._symbolGapY = symbolGapY;
    this._slotHeight = symbolHeight + symbolGapY;
    this._maxY = (visibleRows + 1) * this._slotHeight;
    this._minY = -(this._bufferAbove + 1) * this._slotHeight;
  }

  /**
   * Move all symbols by deltaY pixels (positive = downward).
   * At most one wrap per call (deltaY is capped at half a symbol by the
   * spinning mode, so a single symbol can cross the boundary per tick).
   */
  displace(deltaY: number): void {
    if (deltaY === 0) return;
    for (const symbol of this._symbols) {
      symbol.view.y += deltaY;
    }
    if (deltaY > 0) {
      this._wrapBottomToTop();
    } else {
      this._wrapTopToBottom();
    }
  }

  /** Snap all symbols to their correct grid positions (array index = visual row). */
  snapToGrid(): void {
    for (let i = 0; i < this._symbols.length; i++) {
      const targetY = (i - this._bufferAbove) * this._slotHeight;
      this._symbols[i].view.y = targetY;
    }
  }

  /** Position all symbols above the visible area (for cascade mode start). */
  setToTopPosition(): void {
    for (let i = 0; i < this._symbols.length; i++) {
      this._symbols[i].view.y = this._minY - (this._symbols.length - i) * this._slotHeight;
    }
  }

  /** Get the correct Y position for a symbol at a given row. */
  getRowY(row: number): number {
    return (row - this._bufferAbove) * this._slotHeight;
  }

  get slotHeight(): number {
    return this._slotHeight;
  }

  /**
   * Reshape the motion layer for a new visible-row count and cell height.
   * Recomputes wrap bounds and the slot height. Called by `Reel.reshape()`
   * during AdjustPhase on Megaways slots. The symbol array is re-bound by
   * `Reel.reshape()` directly via the same array reference, so this method
   * doesn't take a new array.
   */
  reshape(symbolHeight: number, symbolGapY: number, bufferAbove: number, visibleRows: number): void {
    this._symbolHeight = symbolHeight;
    this._symbolGapY = symbolGapY;
    this._slotHeight = symbolHeight + symbolGapY;
    this._bufferAbove = bufferAbove;
    this._maxY = (visibleRows + 1) * this._slotHeight;
    this._minY = -(this._bufferAbove + 1) * this._slotHeight;
  }

  private _wrapBottomToTop(): void {
    const lastIdx = this._symbols.length - 1;
    const lastSymbol = this._symbols[lastIdx];
    if (lastSymbol.view.y < this._maxY) return;
    const firstSymbol = this._symbols[0];
    lastSymbol.view.y = firstSymbol.view.y - this._slotHeight;
    // Maintain array order: last symbol becomes the new first.
    this._symbols.pop();
    this._symbols.unshift(lastSymbol);
    this._onSymbolWrapped(lastSymbol, 0, 'up');
  }

  private _wrapTopToBottom(): void {
    const firstSymbol = this._symbols[0];
    if (firstSymbol.view.y >= this._minY) return;
    const lastSymbol = this._symbols[this._symbols.length - 1];
    firstSymbol.view.y = lastSymbol.view.y + this._slotHeight;
    // Maintain array order: first symbol becomes the new last.
    this._symbols.shift();
    this._symbols.push(firstSymbol);
    this._onSymbolWrapped(firstSymbol, this._symbols.length - 1, 'down');
  }
}
