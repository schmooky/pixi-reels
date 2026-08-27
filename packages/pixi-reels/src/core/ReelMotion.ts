import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { ReelAxis } from './ReelAxis.js';
import { VERTICAL_FORWARD } from './ReelAxis.js';
import type { ReelCurve } from './ReelCurve.js';

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
  /**
   * Total UNSIGNED distance travelled, in pixels, for the life of the reel.
   *
   * Separate from `_travel`, which is signed and resets on every
   * `snapToGrid()` - and the engine snaps often (each stop, each cascade
   * refill), so `_travel` cannot answer "how far has this reel moved since the
   * tease began". This one only ever grows.
   */
  private _odometer = 0;

  constructor(
    private _symbols: ReelSymbol[],
    symbolHeight: number,
    symbolGapY: number,
    bufferStart: number,
    _visibleCells: number,
    _bufferEnd: number,
    private _onSymbolWrapped: (symbol: ReelSymbol) => void,
    axis: ReelAxis = VERTICAL_FORWARD,
    private _curve?: ReelCurve,
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
    this._odometer += Math.abs(delta);

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

  /**
   * Swap the curvature in or out at runtime. Symbols projected by the outgoing
   * curve are flattened first, otherwise dropping to `amount: 0` would leave
   * the last quad it handed out still on screen.
   */
  setCurve(curve: ReelCurve | undefined): void {
    if (this._curve && !curve) {
      // Tell every symbol the reel is flat again, otherwise dropping to
      // `amount: 0` leaves the last projection it was given on screen.
      for (let i = 0; i < this._symbols.length; i++) this._symbols[i].applyCellQuad(null);
    }
    this._curve = curve;
    this._render();
  }

  /** Snap all symbols to their grid positions (array index = visual cell). */
  snapToGrid(): void {
    this._travel = 0;
    this._rot = 0;
    this._off = 0;
    this._render();
  }

  /** The correct main-axis coordinate for a symbol at visual cell `cell`. */
  getCellMain(cell: number): number {
    return (cell - this._bufferStart) * this._pitch;
  }

  get slotPitch(): number {
    return this._pitch;
  }

  /**
   * Total distance travelled in pixels, unsigned, never reset. Divide by
   * {@link slotPitch} for a count in symbols. Read by `AnticipationPhase` to
   * end a tease after N cells rather than after N milliseconds.
   */
  get odometer(): number {
    return this._odometer;
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
    this._onSymbolWrapped(s);
  }

  private _rotateToEnd(): void {
    const s = this._symbols.shift() as ReelSymbol;
    this._symbols.push(s);
    this._onSymbolWrapped(s);
  }

  private _render(): void {
    const off = this._off;
    const curve = this._curve;
    for (let i = 0; i < this._symbols.length; i++) {
      const symbol = this._symbols[i];
      const main = (i - this._bufferStart) * this._pitch + off;
      this._axis.setMain(symbol.view, main);
      // The projection is derived from this same flat coordinate and handed to
      // the symbol as a view-LOCAL quad, so the value we just wrote survives
      // untouched for the reads in `Reel` that recover a slot from a view.
      if (curve) symbol.applyCellQuad(curve.quadFor(main, symbol.cellInset));
    }
  }
}
