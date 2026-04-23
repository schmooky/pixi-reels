import type { Container } from 'pixi.js';
import type { CellBounds, Payline } from '../config/types.js';
import type { SymbolPosition } from '../events/ReelEvents.js';
import type { Disposable } from '../utils/Disposable.js';

/**
 * A pluggable way to draw a payline.
 *
 * `WinPresenter` calls `render(payline, cells, getCellBounds, parent)` for
 * each payline it shows, then `clear()` before moving to the next. The
 * renderer owns every PixiJS object it creates under `parent`.
 *
 * `parent` is a Container pinned to **ReelSet-local coordinates** — i.e.
 * the values returned by `reelSet.getCellBounds(col, row)` are ready to
 * use without further transforms.
 *
 * Build your own by implementing this interface — a Spine line rig, a
 * pulse-of-dots, a trail particle system, anything.
 */
export interface LineRenderer extends Disposable {
  /**
   * Draw one payline. Resolves when any entrance/draw-on animation is
   * complete. WinPresenter runs this in parallel with per-symbol animation,
   * so don't block longer than you want the whole payline moment to take.
   */
  render(
    payline: Payline,
    cells: readonly SymbolPosition[],
    getCellBounds: (col: number, row: number) => CellBounds,
    parent: Container,
  ): Promise<void>;

  /**
   * Remove or animate out anything this renderer added for the current
   * payline. WinPresenter calls this before the next payline's `render`
   * and at the end of a `show()` sequence.
   */
  clear(): void;
}
