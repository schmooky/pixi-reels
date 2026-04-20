/** Symbol IDs used across examples. */
export const SYMBOLS = ['cherry', 'lemon', 'orange', 'plum', 'bell', 'seven', 'bar', 'wild'] as const;
export type SymbolId = (typeof SYMBOLS)[number];

const HIGH_SYMBOLS: SymbolId[] = ['seven', 'bar', 'wild'];
const MED_SYMBOLS: SymbolId[] = ['bell', 'plum'];
const LOW_SYMBOLS: SymbolId[] = ['cherry', 'lemon', 'orange'];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSymbol(): SymbolId {
  const r = Math.random();
  if (r < 0.15) return pick(HIGH_SYMBOLS);
  if (r < 0.40) return pick(MED_SYMBOLS);
  return pick(LOW_SYMBOLS);
}

export interface SpinResponse {
  symbols: string[][];
  wins: WinResult[];
  anticipationReels: number[];
}

export interface WinResult {
  positions: { reelIndex: number; rowIndex: number }[];
  symbolId: string;
  amount: number;
}

/** Simulate a server spin response with random results. */
export function mockSpin(reelCount: number, visibleRows: number, delay: number = 300): Promise<SpinResponse> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const symbols: string[][] = [];
      for (let r = 0; r < reelCount; r++) {
        const reel: string[] = [];
        for (let row = 0; row < visibleRows; row++) {
          reel.push(randomSymbol());
        }
        symbols.push(reel);
      }

      // Detect wins (simple: 3+ of same symbol on a row)
      const wins: WinResult[] = [];
      for (let row = 0; row < visibleRows; row++) {
        const rowSymbols = symbols.map((r) => r[row]);
        const counts = new Map<string, number[]>();
        rowSymbols.forEach((s, i) => {
          if (!counts.has(s)) counts.set(s, []);
          counts.get(s)!.push(i);
        });
        for (const [symbolId, indices] of counts) {
          if (indices.length >= 3) {
            wins.push({
              positions: indices.map((i) => ({ reelIndex: i, rowIndex: row })),
              symbolId,
              amount: symbolId === 'wild' ? 100 : symbolId === 'seven' ? 50 : 10,
            });
          }
        }
      }

      // Anticipation: show on last 2 reels if scatter-like symbol appears 3+ times
      const anticipationReels: number[] = [];
      const scatterCount = symbols.flat().filter((s) => s === 'bell').length;
      if (scatterCount >= 2) {
        anticipationReels.push(reelCount - 2, reelCount - 1);
      }

      resolve({ symbols, wins, anticipationReels });
    }, delay);
  });
}

/** Generate a cascade response (remove wins, fill from top). */
export function mockCascade(
  currentGrid: string[][],
  wins: WinResult[],
): { symbols: string[][]; newWins: WinResult[] } {
  const grid = currentGrid.map((r) => [...r]);

  // Remove winning positions
  for (const win of wins) {
    for (const pos of win.positions) {
      grid[pos.reelIndex][pos.rowIndex] = '';
    }
  }

  // Cascade: shift non-empty down, fill top with random
  for (let r = 0; r < grid.length; r++) {
    const nonEmpty = grid[r].filter((s) => s !== '');
    const fillCount = grid[r].length - nonEmpty.length;
    grid[r] = Array.from({ length: fillCount }, () => randomSymbol()).concat(nonEmpty);
  }

  // Detect new wins
  const newWins: WinResult[] = [];
  const rows = grid[0]?.length ?? 0;
  for (let row = 0; row < rows; row++) {
    const rowSymbols = grid.map((r) => r[row]);
    const counts = new Map<string, number[]>();
    rowSymbols.forEach((s, i) => {
      if (!counts.has(s)) counts.set(s, []);
      counts.get(s)!.push(i);
    });
    for (const [symbolId, indices] of counts) {
      if (indices.length >= 3) {
        newWins.push({
          positions: indices.map((i) => ({ reelIndex: i, rowIndex: row })),
          symbolId,
          amount: symbolId === 'wild' ? 100 : symbolId === 'seven' ? 50 : 10,
        });
      }
    }
  }

  return { symbols: grid, newWins };
}
