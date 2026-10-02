/**
 * Pay-ways evaluation for demos and tests.
 *
 * Win detection is game math and stays out of the library (ADR 007): a real
 * game gets its wins from the server. These helpers are the stand-in the
 * docs site and the tests use, in the same spirit as the cheats beside them.
 *
 * A "ways" game pays a symbol that lands on consecutive reels from the left,
 * on any cell of each reel. The number of ways a win pays is the product of
 * how many matching cells each of those reels shows, so it is counted, never
 * enumerated: eight reels of seven matching cells is 5,764,801 ways and one
 * multiplication per reel.
 */

/** A cell on the board. The same shape as the library's `SymbolPosition`. */
export interface WaysCell {
  reelIndex: number;
  cellIndex: number;
}

export interface WaysOptions {
  /** Symbols that stand in for any paying symbol. They never pay on their own. */
  wilds?: readonly string[];
  /** Symbols that never pay as ways: scatters, coins, blanks. */
  exclude?: readonly string[];
  /** Fewest consecutive reels that pay. Default 3. */
  minReels?: number;
  /**
   * Pay per way for `symbol` on `reels` consecutive reels. A win's `value` is
   * this times its `ways`. Without it `value` is the ways count, so wins still
   * sort by size.
   */
  pays?: (symbol: string, reels: number) => number;
}

/** One paying symbol's ways win. Assignable to the library's `Win`. */
export interface WaysWin {
  kind: 'ways';
  symbol: string;
  /** Consecutive reels from the left the symbol (or a wild) lands on. */
  reels: number;
  /** Ways paid: the product of `perReel[i].length`. */
  ways: number;
  /** Matching cell indices on each of those reels, reel 0 first. */
  perReel: number[][];
  /** Every matching cell, reel by reel: what to highlight. */
  cells: WaysCell[];
  /** `pays(symbol, reels) * ways`, or `ways` without a pay table. */
  value: number;
}

/**
 * Ways a board of this shape has: the product of each reel's visible cells.
 * A float past `Number.MAX_SAFE_INTEGER` (about 9e15), which a board only
 * reaches past eighteen reels of seven.
 *
 * ```ts
 * countWays([7, 7, 7, 7, 7, 7, 7, 7]); // 5_764_801
 * countWays(reelSet.reels.map((r) => r.visibleCells));
 * ```
 */
export function countWays(cellsPerReel: readonly number[]): number {
  let ways = 1;
  for (const cells of cellsPerReel) ways *= cells;
  return cellsPerReel.length === 0 ? 0 : ways;
}

/**
 * Every ways win on `grid` (one array of visible symbol ids per reel, as
 * `reelSet.getVisibleGrid()` returns it), best first.
 *
 * Each distinct paying symbol on the board is tried once: walk the reels
 * from the left, collect the cells showing it or a wild, stop at the first
 * reel with none. A run of `minReels` or more is a win. A reel of all wilds
 * extends every symbol's run, and a symbol that first appears on reel 2
 * still wins if wilds cover reels 0 and 1.
 *
 * ```ts
 * const wins = evaluateWays(reelSet.getVisibleGrid(), { wilds: ['wild'], exclude: ['scatter'] });
 * await presenter.show(wins);           // WaysWin is a Win
 * ```
 */
export function evaluateWays(grid: readonly (readonly string[])[], options: WaysOptions = {}): WaysWin[] {
  const wilds = new Set(options.wilds ?? []);
  const exclude = new Set(options.exclude ?? []);
  const minReels = options.minReels ?? 3;

  const candidates = new Set<string>();
  for (const reel of grid) {
    for (const id of reel) if (!wilds.has(id) && !exclude.has(id)) candidates.add(id);
  }

  const wins: WaysWin[] = [];
  for (const symbol of candidates) {
    const perReel: number[][] = [];
    for (const reel of grid) {
      const cells: number[] = [];
      reel.forEach((id, cell) => {
        if (id === symbol || wilds.has(id)) cells.push(cell);
      });
      if (cells.length === 0) break;
      perReel.push(cells);
    }
    // A run of wilds alone is not this symbol's win.
    const landsItself = perReel.some((cells, r) => cells.some((cell) => grid[r][cell] === symbol));
    if (perReel.length < minReels || !landsItself) continue;

    const ways = countWays(perReel.map((cells) => cells.length));
    const cells: WaysCell[] = [];
    perReel.forEach((rows, reelIndex) => {
      for (const cellIndex of rows) cells.push({ reelIndex, cellIndex });
    });
    const perWay = options.pays ? options.pays(symbol, perReel.length) : 1;
    wins.push({ kind: 'ways', symbol, reels: perReel.length, ways, perReel, cells, value: perWay * ways });
  }
  return wins.sort((a, b) => b.value - a.value || b.reels - a.reels || (a.symbol < b.symbol ? -1 : 1));
}
