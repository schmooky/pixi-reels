import { Graphics } from 'pixi.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { Reel } from '../core/Reel.js';

/**
 * Debug snapshot — plain JSON representation of the entire reel state.
 *
 * Designed for AI agents that cannot see the canvas.
 * Returns no PixiJS display objects, only serializable data.
 *
 * **Breaking note (since v0.3):** `visibleRows` is now `number[]` (one entry
 * per reel) so jagged shapes (pyramids, MultiWays) are representable. For
 * uniform slots every entry is the same value. Adapt downstream code that
 * deep-reads the snapshot.
 */
export interface DebugSnapshot {
  timestamp: number;
  isSpinning: boolean;
  currentSpeed: string;
  availableSpeeds: string[];
  spotlightActive: boolean;
  reelCount: number;
  visibleRows: number[];
  reels: DebugReelSnapshot[];
  grid: string[][];
}

export interface DebugReelSnapshot {
  index: number;
  speed: number;
  isStopping: boolean;
  allSymbols: { row: number; symbolId: string; y: number }[];
  visibleSymbols: string[];
}

/**
 * Take a plain-JSON snapshot of the entire reel set state.
 *
 * This is the primary debugging tool for AI agents. The output is
 * a serializable object with no circular references, no PixiJS types.
 *
 * ```ts
 * const state = debugSnapshot(reelSet);
 * console.log(JSON.stringify(state, null, 2));
 * ```
 */
export function debugSnapshot(reelSet: ReelSet): DebugSnapshot {
  const reels = reelSet.reels;
  const reelSnapshots: DebugReelSnapshot[] = reels.map((reel: Reel, i: number) => ({
    index: i,
    speed: reel.speed,
    isStopping: reel.isStopping,
    allSymbols: reel.symbols.map((s, row) => ({
      row,
      symbolId: s.symbolId,
      y: Math.round(s.view.y),
    })),
    visibleSymbols: reel.getVisibleSymbols(),
  }));

  // Build the visual grid (what a player would see). Uses the ReelSet
  // resolver so cross-reel OCCUPIED cells of a big-symbol block render as
  // the anchor's id, not as the OCCUPIED sentinel.
  const grid: string[][] = reelSet.getVisibleGrid();

  return {
    timestamp: Date.now(),
    isSpinning: reelSet.isSpinning,
    currentSpeed: reelSet.speed.activeName,
    availableSpeeds: reelSet.speed.profileNames,
    spotlightActive: reelSet.spotlight.isActive,
    reelCount: reels.length,
    visibleRows: reels.map((r) => r.visibleRows),
    reels: reelSnapshots,
    grid,
  };
}

/**
 * Pretty-print the grid as an ASCII table.
 *
 * ```
 * ┌────────┬────────┬────────┬────────┬────────┐
 * │ cherry │ lemon  │ bar    │ seven  │ cherry │
 * │ plum   │ cherry │ wild   │ lemon  │ orange │
 * │ orange │ bell   │ cherry │ plum   │ bell   │
 * └────────┴────────┴────────┴────────┴────────┘
 * ```
 */
export function debugGrid(reelSet: ReelSet): string {
  const snap = debugSnapshot(reelSet);
  const { grid, visibleRows } = snap;
  if (grid.length === 0) return '(empty grid)';

  const colWidth = 8;
  const maxRows = Math.max(...visibleRows);
  const pad = (s: string) => s.slice(0, colWidth).padEnd(colWidth);
  const empty = ' '.repeat(colWidth);

  const border = (left: string, mid: string, right: string) =>
    left + grid.map(() => '─'.repeat(colWidth)).join(mid) + right;

  const lines: string[] = [];
  lines.push(border('┌', '┬', '┐'));

  for (let row = 0; row < maxRows; row++) {
    const cells = grid.map((col, i) => (row < visibleRows[i] ? pad(col[row] ?? '?') : empty));
    lines.push('│' + cells.join('│') + '│');
  }

  lines.push(border('└', '┴', '┘'));
  return lines.join('\n');
}

/**
 * Enable debug mode: attaches debug utilities to `window.__PIXI_REELS_DEBUG`.
 *
 * After calling this, an AI agent can run in the browser console:
 * ```js
 * __PIXI_REELS_DEBUG.snapshot()  // full state JSON
 * __PIXI_REELS_DEBUG.grid()      // ASCII grid
 * __PIXI_REELS_DEBUG.log()       // console.log the grid
 * ```
 */
export function enableDebug(reelSet: ReelSet): void {
  if (typeof window === 'undefined') return;

  let maskOverlay: Graphics | null = null;

  const debug = {
    reelSet,
    snapshot: () => debugSnapshot(reelSet),
    grid: () => debugGrid(reelSet),
    log: () => {
      const snap = debugSnapshot(reelSet);
      console.log(`[pixi-reels debug] spinning=${snap.isSpinning} speed=${snap.currentSpeed}`);
      console.log(debugGrid(reelSet));
      return snap;
    },
    /** Log every event as it happens */
    trace: () => {
      const events = [
        'spin:start', 'spin:allStarted', 'spin:stopping',
        'spin:reelLanded', 'spin:allLanded', 'spin:complete',
        'skip:requested', 'skip:completed', 'speed:changed',
        'spotlight:start', 'spotlight:end',
        'shape:changed', 'adjust:start', 'adjust:complete', 'pin:migrated',
        'destroyed',
      ] as const;
      for (const event of events) {
        reelSet.events.on(event as any, (...args: any[]) => {
          console.log(`[pixi-reels] ${event}`, ...args);
        });
      }
      console.log('[pixi-reels debug] tracing enabled for all events');
    },
    /**
     * Toggle a debug overlay on the unmasked container that visualizes the
     * mask shape and per-reel boxes. Useful for spotting pyramid peek and
     * confirming MultiWays box geometry.
     */
    showMask: (enabled: boolean) => {
      if (enabled) {
        if (maskOverlay) return;
        const g = new Graphics();
        g.rect(0, 0, reelSet.viewport.maskWidth, reelSet.viewport.maskHeight)
          .fill({ color: 0xff0000, alpha: 0.15 });
        for (const rect of reelSet.viewport.maskRects) {
          g.rect(rect.x, rect.y, rect.width, rect.height)
            .stroke({ color: 0x00ff00, width: 2 });
        }
        reelSet.viewport.unmaskedContainer.addChild(g);
        maskOverlay = g;
      } else if (maskOverlay) {
        reelSet.viewport.unmaskedContainer.removeChild(maskOverlay);
        maskOverlay.destroy();
        maskOverlay = null;
      }
    },
  };

  (window as any).__PIXI_REELS_DEBUG = debug;
  console.log('[pixi-reels] Debug mode enabled. Use __PIXI_REELS_DEBUG.log() to inspect state.');
}
