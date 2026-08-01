import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { ReelAxis } from './ReelAxis.js';
import { VERTICAL_FORWARD } from './ReelAxis.js';

const EPS = 1e-9;

/**
 * The physics of one reel: march symbols along the travel axis and wrap them
 * around. Projected through a {@link ReelAxis} so the same code runs vertical
 * or horizontal, forward or reverse; the default axis is vertical/forward,
 * matching every v1 layout.
 *
 * Positions are DERIVED from array index every frame, never accumulated, and
 * the rotation count is DERIVED from total travel. Rigidity, ordering and
 * boundedness are therefore true by construction, and no "at most one wrap per
 * call" precondition exists - any step size is legal (ADR 016 section 3.2,
 * ADR 018). `_symbols[0]` is always the symbol nearest the strip's start edge
 * (top for vertical, left for horizontal); each wrap moves the wrapping symbol
 * to the array end that matches its travel so the ordering stays consistent
 * with the grid.
 */
export class ReelMotion {
  private _pitch: number;
  private _bufferStart: number;
  private _axis: ReelAxis;
  private _travel = 0; // total signed travel since the last snap
  private _rot = 0; // whole-slot rotations already applied
  private _off = 0; // sub-slot remainder

  constructor(
    private _symbols: ReelSymbol[],
    symbolHeight: number,
    symbolGapY: number,
    bufferStart: number,
    _visibleCells: number,
    _bufferEnd: number,
    private _onSymbolWrapped: (symbol: ReelSymbol, arrayIndex: number, direction: 'up' | 'down') => void,
    axis: ReelAxis = VERTICAL_FORWARD,
  ) {
    this._pitch = symbolHeight + symbolGapY;
    this._bufferStart = bufferStart;
    this._axis = axis;
    this._render();
  }

  /**
   * Move the strip by `delta` screen pixels along the travel axis (positive =
   * toward the larger coordinate: down for vertical, right for horizontal).
   * `delta` is relative to the reel's direction via the axis polarity, so
   * StartPhase's step-back pull (a negative delta) reads as "backwards for this
   * reel" in either direction. Any magnitude is legal.
   */
  advance(delta: number): void {
    if (delta === 0) return;
    this._travel += this._axis.polarity * delta;

    // Derive the rotation count from total travel rather than mutating it.
    // Snapping q to a whole number inside EPS lands an exact N-slot travel on
    // rotation N instead of N-1 when float residue leaves it 1e-14 short.
    let q = this._travel / this._pitch;
    const r = Math.round(q);
    if (Math.abs(q - r) < EPS) q = r;
    const targetRot = Math.floor(q);

    while (this._rot < targetRot) {
      this._rot++;
      this._rotateToStart();
    }
    while (this._rot > targetRot) {
      this._rot--;
      this._rotateToEnd();
    }

    this._off = this._travel - targetRot * this._pitch;
    if (Math.abs(this._off) < EPS) this._off = 0;
    this._render();
  }

  /** Snap all symbols to their grid positions (array index = visual cell). */
  snapToGrid(): void {
    this._travel = 0;
    this._rot = 0;
    this._off = 0;
    this._render();
  }

  /** The correct main-axis coordinate for a symbol at visual row `row`. */
  getCellMain(row: number): number {
    return (row - this._bufferStart) * this._pitch;
  }

  get slotPitch(): number {
    return this._pitch;
  }

  /**
   * Reshape the motion layer for a new visible-cell count and cell pitch.
   * Called by `Reel.reshape()` during AdjustPhase on MultiWays slots; the
   * symbol array is re-bound via the same reference, and `Reel` snaps right
   * after, so this only refreshes the geometry.
   */
  reshape(
    symbolHeight: number,
    symbolGapY: number,
    bufferStart: number,
    _visibleCells: number,
    _bufferEnd: number,
  ): void {
    this._pitch = symbolHeight + symbolGapY;
    this._bufferStart = bufferStart;
  }

  private _rotateToStart(): void {
    const s = this._symbols.pop() as ReelSymbol;
    this._symbols.unshift(s);
    this._onSymbolWrapped(s, 0, 'up');
  }

  private _rotateToEnd(): void {
    const s = this._symbols.shift() as ReelSymbol;
    this._symbols.push(s);
    this._onSymbolWrapped(s, this._symbols.length - 1, 'down');
  }

  private _render(): void {
    const off = this._off;
    for (let i = 0; i < this._symbols.length; i++) {
      this._axis.setMain(this._symbols[i].view, (i - this._bufferStart) * this._pitch + off);
    }
  }
}
