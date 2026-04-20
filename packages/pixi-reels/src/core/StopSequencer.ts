/**
 * The "what do I land on" queue for one reel.
 *
 * When a reel enters its stop phase, the `SpinController` loads the
 * target frame (the exact list of symbol ids that should appear on
 * screen, top-to-bottom, including the off-screen buffers). As the reel
 * keeps scrolling downward during deceleration, every `ReelMotion` wrap
 * event asks this sequencer for the next symbol — and it hands them back
 * from the END of the frame first, because new symbols arrive at the
 * top of a reel scrolling downward.
 *
 * After the last symbol is consumed the reel lands, and what you see on
 * screen matches the loaded frame exactly.
 */
export class StopSequencer {
  private _frame: string[] = [];
  private _remaining: number = 0;

  /** Load a target frame in top-to-bottom order. */
  setFrame(frame: string[]): void {
    this._frame = [...frame];
    this._remaining = this._frame.length;
  }

  /** Deliver the next symbol (consumed from the end of the frame). */
  next(): string {
    if (this._remaining > 0) {
      this._remaining--;
      return this._frame[this._remaining];
    }
    return this._frame[0] ?? '';
  }

  get hasRemaining(): boolean {
    return this._remaining > 0;
  }

  get remaining(): number {
    return this._remaining;
  }

  reset(): void {
    this._frame = [];
    this._remaining = 0;
  }
}
