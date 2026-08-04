/**
 * The "what do I land on" queue for one reel.
 *
 * When a reel enters its stop phase, the `SpinController` loads the
 * target frame (the exact list of symbol ids that should appear on
 * screen, top-to-bottom, including the off-screen buffers). As the reel
 * keeps scrolling downward during deceleration, every `ReelMotion` wrap
 * event asks this sequencer for the next symbol. and it hands them back
 * from the END of the frame first, because new symbols arrive at the
 * top of a reel scrolling downward.
 *
 * After the last symbol is consumed the reel lands, and what you see on
 * screen matches the loaded frame exactly.
 */
export class StopSequencer {
  private _frame: string[] = [];
  private _remaining: number = 0;
  private _cursor: number = 0;
  private _step: 1 | -1 = -1;

  /**
   * Load a target frame in start-to-end order (top-to-bottom for a vertical
   * reel). `feedEdge` is the strip edge new symbols enter from during the stop:
   * `'start'` for a forward reel (symbols arrive at the start edge and are
   * pushed toward the end, so the frame is consumed end-first) and `'end'` for
   * a reverse reel (symbols arrive at the end edge, so the frame is consumed
   * head-first). Getting this backwards lands a correct-looking frame reversed.
   */
  setFrame(frame: string[], feedEdge: 'start' | 'end' = 'start'): void {
    this._frame = [...frame];
    this._remaining = this._frame.length;
    if (feedEdge === 'end') {
      this._cursor = 0;
      this._step = 1;
    } else {
      this._cursor = this._frame.length - 1;
      this._step = -1;
    }
  }

  /**
   * Deliver the next symbol, consumed from the feed-appropriate end.
   *
   * Throws when the frame is exhausted. Every caller is expected to gate on
   * {@link hasRemaining} first (the library's only one, `Reel._replaceSymbol`,
   * does). The old behaviour returned `_frame[0]`, or `''` after a `reset()` —
   * a symbol id that resolves to nothing, so an over-consuming caller landed a
   * silently wrong frame instead of failing where the bug was.
   */
  next(): string {
    if (this._remaining === 0) {
      throw new Error(
        'StopSequencer.next(): frame exhausted. Gate on `hasRemaining` before ' +
        'calling, or reload a frame with `setFrame()`.',
      );
    }
    this._remaining--;
    const value = this._frame[this._cursor];
    this._cursor += this._step;
    return value;
  }

  get hasRemaining(): boolean {
    return this._remaining > 0;
  }

  get remaining(): number {
    return this._remaining;
  }

  /** Drop the loaded frame and return to the just-constructed state. */
  reset(): void {
    this._frame = [];
    this._remaining = 0;
    this._cursor = 0;
    this._step = -1;
  }
}
