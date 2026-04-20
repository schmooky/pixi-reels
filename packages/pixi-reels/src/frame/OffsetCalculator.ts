import type { OffsetConfig, TrapezoidConfig } from '../config/types.js';

/**
 * Computes X-position offsets for symbols to create visual effects
 * like trapezoid perspective.
 */
export class OffsetCalculator {
  private _offsets: number[][] = [];

  constructor(
    private _reelCount: number,
    private _totalRows: number,
    private _symbolWidth: number,
    private _config: OffsetConfig,
  ) {
    this._compute();
  }

  /** Get X offset for a specific reel and row. */
  getOffset(reelIndex: number, rowIndex: number): number {
    return this._offsets[reelIndex]?.[rowIndex] ?? 0;
  }

  /** Get all offsets as a 2D array [reelIndex][rowIndex]. */
  get offsets(): readonly (readonly number[])[] {
    return this._offsets;
  }

  private _compute(): void {
    if (this._config.mode === 'none') {
      this._offsets = Array.from({ length: this._reelCount }, () =>
        new Array(this._totalRows).fill(0),
      );
      return;
    }

    // Trapezoid mode
    const config = this._config as TrapezoidConfig;
    const centralIndex = (this._reelCount - 1) / 2;
    this._offsets = [];

    for (let reel = 0; reel < this._reelCount; reel++) {
      const relativePos =
        this._reelCount > 1
          ? (reel - centralIndex) / (this._reelCount / 2)
          : 0;

      const reelOffsets: number[] = [];
      for (let row = 0; row < this._totalRows; row++) {
        const rowNorm = this._totalRows > 1 ? row / (this._totalRows - 1) : 0.5;
        const topOffset = relativePos * config.widthDifference * config.topWidthFactor;
        const bottomOffset = relativePos * config.widthDifference * config.bottomWidthFactor;
        const offset = topOffset + (bottomOffset - topOffset) * rowNorm;
        reelOffsets.push(offset);
      }
      this._offsets.push(reelOffsets);
    }
  }
}
