import type { SymbolData } from '../config/types.js';
import { OCCUPIED_SENTINEL } from '../core/Reel.js';
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import { clearTargetSlot, cloneColumnTarget, getTargetSlot, setTargetSlot } from '../frame/ColumnTarget.js';

/** Options for {@link coordinateBigSymbols}. */
export interface CoordinateBigSymbolsOptions {
  /** Visible cells of each reel the grid will land on. */
  visibleCellsForReel: (reel: number) => number;
  symbolsData: Readonly<Record<string, SymbolData>>;
  /** Buffer slots above and below every reel's visible window. */
  bufferStart: number;
  bufferEnd: number;
  /**
   * `'land'` (default) checks every block the way a landing does and throws
   * on one that does not fit. `'rest'` is for a board already on screen,
   * re-placed at rest: a block that no longer fits is not an error.
   */
  mode?: 'land' | 'rest';
}

/**
 * Big symbols cross-reel coordinator. Walks the grid, locates big symbols
 * (those with `SymbolData.size.reels * size.cells > 1`), validates that each
 * block fits within reel bounds, and paints OCCUPIED sentinels into the
 * non-anchor cells so per-reel FrameBuilder leaves them alone.
 *
 * Every path that puts a grid on the reels goes through it: a landing, the
 * builder's `initialFrame`, `addReels()` seeds, and the at-rest board edits
 * (`addRows()`, `removeRows()`, `pin()`, `movePin()`).
 *
 * Pure: returns a new grid; does not mutate the input. Zero-overhead for
 * slots with no big symbols (the loop runs but never matches metadata).
 *
 * @internal Not part of the public API.
 */
export function coordinateBigSymbols(
  grid: readonly ColumnTarget[],
  options: CoordinateBigSymbolsOptions,
): ColumnTarget[] {
  const { visibleCellsForReel, symbolsData: symData, bufferStart, bufferEnd } = options;
  const mode = options.mode ?? 'land';
  const out = grid.map(cloneColumnTarget);

  // Buffer geometry is treated as uniform across all reels. This holds today
  // because `ReelSetBuilder.bufferSymbols(n)` is the only buffer-setting API
  // and applies a single global value; there is no per-reel buffer API. If
  // you ever add one (e.g. a `bufferSymbolsPerReel([...])` builder method),
  // propagate per-reel values into the validator loop below: the
  // `targetCells` lookup already supports per-reel geometry; only the
  // buffers are still global here.

  // Read/write a per-reel target slot for any cell in
  // `[-bufferStart, cells + bufferEnd)`. Row is visible-relative: negative
  // cells address `bufferStart`, cells past `visible.length` address
  // `bufferEnd`. See `getTargetSlot` / `setTargetSlot`.
  const readSlot = (reel: number, cell: number): string | undefined =>
    getTargetSlot(out[reel], cell);
  const writeSlot = (reel: number, cell: number, value: string): void => {
    setTargetSlot(out[reel], cell, value);
  };
  // Unspecify a slot: `Reel.placeStrip` random-fills it.
  const clearSlot = (reel: number, cell: number): void => clearTargetSlot(out[reel], cell);

  for (let reel = 0; reel < out.length; reel++) {
    const cells = visibleCellsForReel(reel);
    // Iterate the FULL strip range, not just visible. A big-symbol anchor
    // may sit in bufferStart (partial-visibility from the top. only the
    // block's tail shows in cell 0) or in bufferEnd (the head shows at
    // the last visible cell, the rest is clipped below the mask).
    // `_finalizeFrame` sizes anchors anywhere on the strip, so the engine
    // renders both cases correctly.
    for (let cell = -bufferStart; cell < cells + bufferEnd; cell++) {
      const id = readSlot(reel, cell);
      if (id === undefined) continue;
      const meta = symData[id];
      if (!meta?.size) continue;
      const w = meta.size.reels;
      const h = meta.size.cells;
      if (w === 1 && h === 1) continue;

      // At rest, a block already on the board never throws. One past the
      // last reel is cut at the board's edge, as `removeReels()` leaves it:
      // reels never move sideways, so the mask clips it for good. One past
      // the bottom of a strip that got shorter is random-filled: no slots
      // lie under its overhang, which a reel travelling up would scroll in.
      const across = mode === 'rest' ? Math.min(w, out.length - reel) : w;
      if (mode === 'rest') {
        let fits = true;
        for (let dx = 0; dx < across; dx++) {
          if (cell + h > visibleCellsForReel(reel + dx) + bufferEnd) fits = false;
        }
        if (!fits) {
          for (let dx = 0; dx < across; dx++) {
            const end = visibleCellsForReel(reel + dx) + bufferEnd;
            for (let dy = 0; dy < h && cell + dy < end; dy++) clearSlot(reel + dx, cell + dy);
          }
          continue;
        }
      }

      // Validate block fit on this reel: anchor + h must stay on the
      // strip. The strip ends at `cells + bufferEnd - 1` (last bufferEnd
      // slot) and starts at `-bufferStart` (first bufferStart slot).
      if (cell + h > cells + bufferEnd) {
        throw new Error(
          `big symbol '${id}' (${w}x${h}) at (reel=${reel}, cell=${cell}) ` +
          `extends past the bottom of the strip on reel ${reel} ` +
          `(anchor cell + h = ${cell + h} > visibleCells + bufferEnd = ${cells + bufferEnd}).`,
        );
      }
      if (reel + across > out.length) {
        throw new Error(
          `big symbol '${id}' (${w}x${h}) at (reel=${reel}, cell=${cell}) ` +
          `exceeds reel count ${out.length}.`,
        );
      }
      for (let dx = 0; dx < across; dx++) {
        const targetReel = reel + dx;
        const targetCells = visibleCellsForReel(targetReel);
        if (cell + h > targetCells + bufferEnd) {
          throw new Error(
            `big symbol '${id}' (${w}x${h}) at (reel=${reel}, cell=${cell}) ` +
            `extends past the bottom of the strip on reel ${targetReel} ` +
            `(anchor cell + h = ${cell + h} > visibleCells + bufferEnd = ${targetCells + bufferEnd}).`,
          );
        }
      }

      // Paint OCCUPIED across the block (skip the anchor itself at dx=0,dy=0).
      // Stub cells may land in bufferStart (negative cell), visible, or
      // bufferEnd (cell >= visibleCells). `writeSlot` handles all three.
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < across; dx++) {
          if (dx === 0 && dy === 0) continue;
          writeSlot(reel + dx, cell + dy, OCCUPIED_SENTINEL);
        }
      }
    }
  }
  return out;
}
