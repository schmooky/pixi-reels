import { SeededRng } from './seededRng.js';

export interface CheatSpinResult {
  symbols: string[][];
  anticipationReels: number[];
  /** Arbitrary metadata a demo can read out (e.g., `{ forced: 'scatters' }`). */
  meta?: Record<string, unknown>;
}

export interface CheatContext {
  reelCount: number;
  visibleRows: number;
  symbolIds: string[];
  rng: SeededRng;
  /** What the previous spin landed on, if any. Useful for hold-and-win. */
  lastGrid: string[][] | null;
  /** Which symbols are currently "held" (reel,row pairs) — set by a demo. */
  held: Array<{ reel: number; row: number; symbolId: string }>;
}

export type Cheat = (ctx: CheatContext) => CheatSpinResult | null;

export interface CheatDefinition {
  id: string;
  label: string;
  description?: string;
  /** If true, the cheat is currently active. */
  enabled: boolean;
  /** Run the cheat. Returning null means "pass through, no override". */
  cheat: Cheat;
}

/**
 * CheatEngine — orchestrates deterministic outcomes for a demo.
 *
 * Cheats are tried in registration order. The first one whose `cheat()` returns
 * a non-null `CheatSpinResult` wins. If none match, a default random spin is
 * produced using the context's RNG.
 */
export class CheatEngine {
  private _cheats: CheatDefinition[] = [];
  private _reelCount: number;
  private _visibleRows: number;
  private _symbolIds: string[];
  private _rng: SeededRng;
  private _lastGrid: string[][] | null = null;
  private _held: Array<{ reel: number; row: number; symbolId: string }> = [];

  constructor(opts: {
    reelCount: number;
    visibleRows: number;
    symbolIds: string[];
    seed?: number;
  }) {
    this._reelCount = opts.reelCount;
    this._visibleRows = opts.visibleRows;
    this._symbolIds = [...opts.symbolIds];
    this._rng = new SeededRng(opts.seed ?? 1);
  }

  get reelCount(): number {
    return this._reelCount;
  }

  get visibleRows(): number {
    return this._visibleRows;
  }

  get rng(): SeededRng {
    return this._rng;
  }

  get lastGrid(): string[][] | null {
    return this._lastGrid;
  }

  setHeld(held: Array<{ reel: number; row: number; symbolId: string }>): void {
    this._held = held.slice();
  }

  getHeld(): Array<{ reel: number; row: number; symbolId: string }> {
    return this._held.slice();
  }

  register(def: CheatDefinition): void {
    this._cheats.push(def);
  }

  list(): ReadonlyArray<CheatDefinition> {
    return this._cheats;
  }

  setEnabled(id: string, enabled: boolean): void {
    const def = this._cheats.find((c) => c.id === id);
    if (def) def.enabled = enabled;
  }

  /** Turn every registered cheat off in one call. */
  disableAll(): void {
    for (const def of this._cheats) def.enabled = false;
  }

  /** Produce the next spin result, respecting active cheats. */
  next(): CheatSpinResult {
    const ctx: CheatContext = {
      reelCount: this._reelCount,
      visibleRows: this._visibleRows,
      symbolIds: this._symbolIds,
      rng: this._rng,
      lastGrid: this._lastGrid,
      held: this._held.slice(),
    };

    for (const def of this._cheats) {
      if (!def.enabled) continue;
      const out = def.cheat(ctx);
      if (out) {
        this._applyHeld(out.symbols);
        this._lastGrid = cloneGrid(out.symbols);
        return out;
      }
    }

    const symbols = randomGrid(ctx);
    this._applyHeld(symbols);
    const result: CheatSpinResult = { symbols, anticipationReels: [] };
    this._lastGrid = cloneGrid(symbols);
    return result;
  }

  /** Apply `_held` cells on top of any grid — sticky-wild style persistence. */
  private _applyHeld(grid: string[][]): void {
    for (const h of this._held) {
      if (grid[h.reel] && h.row < grid[h.reel].length) {
        grid[h.reel][h.row] = h.symbolId;
      }
    }
  }
}

// ── Built-in cheats ────────────────────────────────────────────────────────

/** Every spin lands on a fixed grid. Use for screenshots and exact reproductions. */
export function forceGrid(grid: string[][]): Cheat {
  const frozen = cloneGrid(grid);
  return () => ({ symbols: cloneGrid(frozen), anticipationReels: [] });
}

/**
 * Place exactly `count` scatters of `symbolId` across the grid at random
 * positions. The rest of the grid is filled with non-scatter noise, so
 * the final count is guaranteed.
 */
export function forceScatters(count: number, symbolId: string): Cheat {
  return (ctx) => {
    const noise = ctx.symbolIds.filter((s) => s !== symbolId);
    const nonScatterCtx: CheatContext = { ...ctx, symbolIds: noise.length > 0 ? noise : ctx.symbolIds };
    const grid = randomGrid(nonScatterCtx);
    const coords = allCoords(ctx.reelCount, ctx.visibleRows);
    shuffle(coords, ctx.rng);
    for (let i = 0; i < Math.min(count, coords.length); i++) {
      const [r, row] = coords[i];
      grid[r][row] = symbolId;
    }
    // Trigger anticipation on last 2 reels if a scatter lands there
    const anticipationReels: number[] = [];
    for (let r = ctx.reelCount - 2; r < ctx.reelCount; r++) {
      if (r >= 0 && grid[r].includes(symbolId)) anticipationReels.push(r);
    }
    return {
      symbols: grid,
      anticipationReels,
      meta: { forced: 'scatters', count, symbolId },
    };
  };
}

/** Forces a full horizontal line of `symbolId` at `rowIndex`. */
export function forceLine(rowIndex: number, symbolId: string): Cheat {
  return (ctx) => {
    const grid = randomGrid(ctx);
    for (let r = 0; r < ctx.reelCount; r++) {
      grid[r][rowIndex] = symbolId;
    }
    return { symbols: grid, anticipationReels: [], meta: { forced: 'line', rowIndex, symbolId } };
  };
}

/**
 * Near-miss: `count - 1` scatters plus one "almost" position on `nearReel`.
 * Great for demoing anticipation tension.
 */
export function forceNearMiss(count: number, symbolId: string, nearReel: number): Cheat {
  return (ctx) => {
    const grid = randomGrid(ctx);
    const candidates = allCoords(ctx.reelCount, ctx.visibleRows).filter(
      ([r]) => r !== nearReel,
    );
    shuffle(candidates, ctx.rng);
    for (let i = 0; i < Math.min(count - 1, candidates.length); i++) {
      const [r, row] = candidates[i];
      grid[r][row] = symbolId;
    }
    // Ensure `nearReel` has NO scatters (the "miss")
    for (let row = 0; row < ctx.visibleRows; row++) {
      if (grid[nearReel][row] === symbolId) {
        grid[nearReel][row] = otherSymbol(symbolId, ctx);
      }
    }
    return {
      symbols: grid,
      anticipationReels: [nearReel],
      meta: { forced: 'near-miss', count, symbolId },
    };
  };
}

/** Place a wild on a specific cell each spin. */
export function forceCell(reelIndex: number, rowIndex: number, symbolId: string): Cheat {
  return (ctx) => {
    const grid = randomGrid(ctx);
    grid[reelIndex][rowIndex] = symbolId;
    return { symbols: grid, anticipationReels: [], meta: { forced: 'cell' } };
  };
}

/**
 * Hold-and-win "guaranteed progression": every spin lands a new coin somewhere
 * that isn't already held, keeping held coins in place. When all cells are
 * covered, emits `meta.jackpot = true`.
 */
export function holdAndWinProgress(coinSymbol: string, landChance = 0.5): Cheat {
  return (ctx) => {
    const grid: string[][] = [];
    for (let r = 0; r < ctx.reelCount; r++) {
      grid.push(new Array(ctx.visibleRows).fill(''));
    }

    // Fill held cells first
    const heldSet = new Set<string>();
    for (const h of ctx.held) {
      grid[h.reel][h.row] = h.symbolId;
      heldSet.add(`${h.reel},${h.row}`);
    }

    // Fill non-held with random non-coin noise
    const noise = ctx.symbolIds.filter((s) => s !== coinSymbol);
    for (let r = 0; r < ctx.reelCount; r++) {
      for (let row = 0; row < ctx.visibleRows; row++) {
        if (grid[r][row] === '') {
          grid[r][row] = noise.length > 0 ? ctx.rng.pick(noise) : ctx.symbolIds[0];
        }
      }
    }

    // Maybe land a new coin
    const free = allCoords(ctx.reelCount, ctx.visibleRows).filter(
      ([r, row]) => !heldSet.has(`${r},${row}`),
    );
    const total = ctx.reelCount * ctx.visibleRows;
    const landed = ctx.rng.chance(landChance);
    let newCoin: [number, number] | null = null;
    if (landed && free.length > 0) {
      shuffle(free, ctx.rng);
      newCoin = free[0];
      grid[newCoin[0]][newCoin[1]] = coinSymbol;
    }

    const jackpot = ctx.held.length + (newCoin ? 1 : 0) >= total;
    return {
      symbols: grid,
      anticipationReels: [],
      meta: { forced: 'hold-and-win', newCoin, jackpot },
    };
  };
}

/**
 * Forces an entire cascade sequence.
 * Pop `sequence.shift()` on every call; when empty, passes through.
 */
export function cascadeSequence(sequence: string[][][]): Cheat {
  const queue = sequence.map((g) => cloneGrid(g));
  return () => {
    const next = queue.shift();
    if (!next) return null;
    return { symbols: next, anticipationReels: [], meta: { forced: 'cascade-step' } };
  };
}

/**
 * Returns the full cascade sequence on a single spin — the first stage is
 * the landed grid, remaining stages come back in `meta.stages` so the demo
 * can animate the whole chain from one SPIN click.
 *
 * Pair with `runCascade(reelSet, meta.stages)` from `cascadeLoop.ts`.
 */
export function cascadingStages(stages: string[][][]): Cheat {
  const frozen = stages.map((g) => cloneGrid(g));
  return () => {
    if (frozen.length === 0) return null;
    return {
      symbols: cloneGrid(frozen[0]),
      anticipationReels: [],
      meta: {
        forced: 'cascading-stages',
        stages: frozen.map((g) => cloneGrid(g)),
        stageCount: frozen.length,
      },
    };
  };
}

/** Always trigger anticipation on the given reels (no grid change). */
export function forceAnticipation(reelIndices: number[]): Cheat {
  return (ctx) => {
    const symbols = randomGrid(ctx);
    return { symbols, anticipationReels: [...reelIndices], meta: { forced: 'anticipation' } };
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function randomGrid(ctx: CheatContext): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < ctx.reelCount; r++) {
    const reel: string[] = [];
    for (let row = 0; row < ctx.visibleRows; row++) {
      reel.push(ctx.rng.pick(ctx.symbolIds));
    }
    out.push(reel);
  }
  return out;
}

function allCoords(reelCount: number, visibleRows: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < reelCount; r++) {
    for (let row = 0; row < visibleRows; row++) out.push([r, row]);
  }
  return out;
}

function shuffle<T>(arr: T[], rng: SeededRng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function cloneGrid(grid: string[][]): string[][] {
  return grid.map((col) => col.slice());
}

function otherSymbol(avoid: string, ctx: CheatContext): string {
  const others = ctx.symbolIds.filter((s) => s !== avoid);
  if (others.length === 0) return avoid;
  return ctx.rng.pick(others);
}
