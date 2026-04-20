import type { ReelSet } from 'pixi-reels';

export interface Cell {
  reel: number;
  row: number;
}

/**
 * A stream of grids. Either an array (batch response) or an async iterable
 * (streamed from a real server). Each grid is one cascade stage.
 */
export type GridStream = string[][][] | AsyncIterable<string[][]>;

export interface CascadeLoopOptions {
  /**
   * Called after each stage settles (including stage 0, which the caller
   * usually already landed via their own `spin()`).
   */
  onStageLanded?: (grid: string[][], stageIndex: number) => Promise<void> | void;

  /**
   * Called just before the stage-N→stage-(N+1) transition. `winners` are the
   * cells whose symbol id changes between the two stages — the cells that
   * will "pop" before the drop.
   *
   * Override this to play your own vanish animation. By default we fade the
   * cell containers.
   */
  onWinnersVanish?: (
    reelSet: ReelSet,
    winners: Cell[],
    stageIndex: number,
  ) => Promise<void>;

  /** ms spent on the fade-out before the drop. Default 320. */
  vanishDuration?: number;

  /** ms of quiet between vanish finishing and the drop. Default 120. */
  pauseBetween?: number;

  /** ms for the drop-in animation. Default 420. */
  dropDuration?: number;

  /**
   * Identify which cells in `prev` were the winners that produced `next`.
   * Default: `diffCells(prev, next)` — only correct when survivors do NOT
   * slide into cells that previously held a different symbol id. For real
   * cascades where survivors fall past clears, pass your own match-detection
   * logic (e.g. "all cells in `prev` containing symbol `wild`").
   */
  winners?: (prev: string[][], next: string[][], stageIndex: number) => Cell[];

  /** Test injector for the tween driver. */
  animate?: Animator;
}

type Animator = (duration: number, onFrame: (t: number) => void) => Promise<void>;

/**
 * Compute cells that change between two grids. Used to identify "winners"
 * (cells that are about to vanish before the next stage lands).
 */
export function diffCells(prev: string[][], next: string[][]): Cell[] {
  const out: Cell[] = [];
  for (let reel = 0; reel < prev.length; reel++) {
    const colPrev = prev[reel] ?? [];
    const colNext = next[reel] ?? [];
    const rows = Math.max(colPrev.length, colNext.length);
    for (let row = 0; row < rows; row++) {
      if (colPrev[row] !== colNext[row]) out.push({ reel, row });
    }
  }
  return out;
}

/**
 * Drop next-stage symbols into the grid — a proper cascade with real
 * gravity physics: survivors fall **only as far as the cleared slots
 * beneath them require**, and symbols with no winners below them **do
 * not move at all**. New symbols enter from above, staggered per row.
 *
 * Per column, with visible rows indexed top-to-bottom and `winnerRows`
 * the set of rows that were removed:
 *
 *   survivors  = non-winner rows in prev-col order.
 *   For each final row R in next-col:
 *     if R < winnerRows.length → new symbol, starts (R+1) slots above
 *     else                      → survivor from nonWinnerRows[R - winCount];
 *                                 fall distance = R - originalRow (0 ⇒ no move)
 *
 * Cells with a zero fall distance are never touched.
 */
export async function tumbleToGrid(
  reelSet: ReelSet,
  nextGrid: string[][],
  winners: Cell[],
  opts: { dropDuration?: number; animate?: Animator } = {},
): Promise<void> {
  const dropMs = opts.dropDuration ?? 420;
  const animate = opts.animate ?? defaultAnimator;

  // Per-reel winner rows (ascending).
  const winnersByReel = new Map<number, number[]>();
  for (const w of winners) {
    if (!winnersByReel.has(w.reel)) winnersByReel.set(w.reel, []);
    winnersByReel.get(w.reel)!.push(w.row);
  }
  for (const arr of winnersByReel.values()) arr.sort((a, b) => a - b);

  interface Job { view: { y: number }; targetY: number; offset: number }
  const jobs: Job[] = [];

  const reelCount = reelSet.reels.length;
  for (let r = 0; r < reelCount; r++) {
    const reel = reelSet.getReel(r);
    const visible = reel.getVisibleSymbols().length;
    if (visible === 0) continue;

    // Slot height inferred from the snapped grid BEFORE we mutate.
    let slotHeight = 0;
    if (visible >= 2) {
      slotHeight = reel.getSymbolAt(1).view.y - reel.getSymbolAt(0).view.y;
    }

    const winnerRows = winnersByReel.get(r) ?? [];
    const winSet = new Set(winnerRows);
    const nonWinnerRows: number[] = [];
    for (let row = 0; row < visible; row++) {
      if (!winSet.has(row)) nonWinnerRows.push(row);
    }
    const winCount = winnerRows.length;

    // Swap identities into the final state. This doesn't move y — placeSymbols
    // snaps to grid — but symbol identities now match nextGrid[r].
    reel.placeSymbols(nextGrid[r]);

    if (winCount === 0 || slotHeight <= 0) continue;

    for (let row = 0; row < visible; row++) {
      let offsetRows: number;
      if (row < winCount) {
        // New symbol filling a cleared top slot — staggered entrance:
        // row 0 starts 1 slot above, row 1 starts 2, …
        offsetRows = row + 1;
      } else {
        // Survivor — its pre-drop row was nonWinnerRows[row - winCount].
        const originalRow = nonWinnerRows[row - winCount];
        offsetRows = row - originalRow; // 0 means: this symbol does NOT move.
      }
      if (offsetRows === 0) continue;

      const view = reel.getSymbolAt(row).view;
      const offsetPx = offsetRows * slotHeight;
      jobs.push({ view, targetY: view.y, offset: offsetPx });
      view.y -= offsetPx;
    }
  }

  if (jobs.length === 0) return;

  await animate(dropMs, (t) => {
    const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
    for (const job of jobs) {
      job.view.y = job.targetY - job.offset * (1 - ease);
    }
  });

  for (const job of jobs) job.view.y = job.targetY;
}

/**
 * Run a cascade sequence on an already-landed reel set.
 *
 * - stage 0 is assumed to already be showing (the caller's first spin landed it)
 * - for each subsequent stage: vanish winners → drop next symbols from above
 *
 * No respin, no reel acceleration — just symbol replacement + fall.
 *
 * Accepts either a pre-known array of stages **or** an async generator
 * (handy when each stage comes from a separate server response):
 *
 * ```ts
 * await runCascade(reelSet, [stage0, stage1, stage2]);
 *
 * async function* streamFromServer() {
 *   yield first.grid;                        // stage 0
 *   for await (const more of serverStream) { // more tumbles
 *     yield more.grid;
 *   }
 * }
 * await runCascade(reelSet, streamFromServer());
 * ```
 */
export async function runCascade(
  reelSet: ReelSet,
  stages: GridStream,
  opts: CascadeLoopOptions = {},
): Promise<{ stageCount: number; totalWinners: number }> {
  const vanishMs = opts.vanishDuration ?? 320;
  const pauseMs = opts.pauseBetween ?? 120;
  const dropMs = opts.dropDuration ?? 420;
  const animate = opts.animate ?? defaultAnimator;
  const vanish = opts.onWinnersVanish ?? ((rs, cells) => defaultVanish(rs, cells, vanishMs, animate));
  const computeWinners = opts.winners ?? ((prev, next) => diffCells(prev, next));

  let stageIndex = 0;
  let prevGrid: string[][] | null = null;
  let totalWinners = 0;

  const iter = toAsyncIterator(stages);
  for await (const grid of iter) {
    if (prevGrid === null) {
      if (opts.onStageLanded) await opts.onStageLanded(grid, stageIndex);
    } else {
      const winners = computeWinners(prevGrid, grid, stageIndex);
      totalWinners += winners.length;
      await vanish(reelSet, winners, stageIndex);
      if (pauseMs > 0) await sleep(pauseMs);
      await tumbleToGrid(reelSet, grid, winners, { dropDuration: dropMs, animate });
      if (opts.onStageLanded) await opts.onStageLanded(grid, stageIndex);
    }
    prevGrid = grid;
    stageIndex++;
  }

  return { stageCount: stageIndex, totalWinners };
}

// ── defaults ──

async function defaultVanish(
  reelSet: ReelSet,
  winners: Cell[],
  duration: number,
  animate: Animator,
): Promise<void> {
  if (winners.length === 0) return;

  // Scale-from-center: a symbol's `view` is positioned at its cell's top-left,
  // so scaling the container alone shrinks it toward (0,0). We need the shrink
  // to pull toward the cell center. Measure bounds before animating, set
  // pivot to the local center, translate position to compensate, then animate.
  interface PrepCell {
    view: import('pixi.js').Container;
    origX: number;
    origY: number;
    origPivotX: number;
    origPivotY: number;
    cx: number;
    cy: number;
  }
  const prepped: PrepCell[] = [];
  for (const c of winners) {
    const view = reelSet.getReel(c.reel).getSymbolAt(c.row).view;
    const bounds = view.getLocalBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const origPivotX = view.pivot.x;
    const origPivotY = view.pivot.y;
    const origX = view.x;
    const origY = view.y;
    view.pivot.set(cx, cy);
    view.x = origX + (cx - origPivotX);
    view.y = origY + (cy - origPivotY);
    prepped.push({ view, origX, origY, origPivotX, origPivotY, cx, cy });
  }

  await animate(duration, (t) => {
    for (const p of prepped) {
      p.view.alpha = 1 - t;
      p.view.scale.set(1 - 0.6 * t);
    }
  });

  // Restore pivot/position so the cell is back to a predictable transform
  // before the tumble drops symbols into it. Alpha stays 0 — the next
  // placeSymbols call swaps identities; callers that want alpha=1 for new
  // cells should reset explicitly (or use a subclass with onActivate reset).
  for (const p of prepped) {
    p.view.alpha = 0;
    p.view.scale.set(1);
    p.view.pivot.set(p.origPivotX, p.origPivotY);
    p.view.x = p.origX;
    p.view.y = p.origY;
  }
}

const defaultAnimator: Animator = (duration, onFrame) =>
  new Promise<void>((resolve) => {
    const start = performanceNow();
    const raf =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(performanceNow()), 16) as unknown as number;
    const step = (): void => {
      const t = Math.min(1, (performanceNow() - start) / duration);
      onFrame(t);
      if (t >= 1) resolve();
      else raf(step);
    };
    raf(step);
  });

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toAsyncIterator(stream: GridStream): AsyncIterable<string[][]> {
  if (Array.isArray(stream)) {
    return (async function* () {
      for (const g of stream) yield g;
    })();
  }
  return stream;
}
