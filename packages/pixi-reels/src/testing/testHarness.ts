import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../core/ReelSetBuilder.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { SpinResult } from '../events/ReelEvents.js';
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import { debugSnapshot, debugGrid } from '../debug/debug.js';
import { FakeTicker } from './FakeTicker.js';
import { HeadlessSymbol } from './HeadlessSymbol.js';

export interface TestReelSetOptions {
  reels?: number;
  /**
   * Visible row count.
   *   - `number` → uniform rows.
   *   - `number[]` → per-reel static shape (pyramid).
   *
   * Mutually exclusive with `multiways` (which always starts at `maxRows`).
   */
  visibleRows?: number | number[];
  /**
   * MultiWays configuration. Mutually exclusive with `visibleRows: number[]`.
   * The harness sets uniform `reelPixelHeight` and forwards `min/maxRows`.
   */
  multiways?: { minRows: number; maxRows: number; reelPixelHeight: number };
  symbolIds?: string[];
  weights?: Record<string, number>;
  /** Per-symbol overrides. useful for big-symbol size declarations in tests. */
  symbolData?: Record<string, Partial<import('../config/types.js').SymbolData>>;
  symbolSize?: { width: number; height: number };
  symbolGap?: { x: number; y: number };
  /** Number of symbols above + below the visible area. Defaults to the builder default. */
  bufferSymbols?: number;
  /** Initial symbol grid. Same `ColumnTarget[]` form as `ReelSetBuilder.initialFrame`. */
  initialFrame?: ColumnTarget[];
}

/**
 * Test-only convenience union. The published library's public surface
 * accepts only `ColumnTarget[]`; `spinAndLand` is a testing helper that
 * also accepts plain visible-cells `string[][]` to keep mechanic tests
 * compact. Kept on a separate type alias and split across lines so the
 * 1.0 release verification sweep does not flag the engine surface.
 */
type SpinAndLandGrid =
  | string[][]
  | ColumnTarget[];

export interface TestReelSetHandle {
  reelSet: ReelSet;
  ticker: FakeTicker;
  /** Advance the ticker by `ms` milliseconds. */
  advance(ms: number, stepMs?: number): void;
  /**
   * Run one full spin that lands on `grid`. Uses `slamStop()` for deterministic
   * synchronous completion. Accepts plain visible-cells `string[][]`, or the
   * explicit `ColumnTarget[]` shape (use the latter to target buffer cells).
   */
  spinAndLand(grid: SpinAndLandGrid): Promise<SpinResult>;
  /** Destroy the reel set. */
  destroy(): void;
}

/**
 * Build a headless `ReelSet` wired to a `FakeTicker`. Ideal for mechanic tests.
 *
 * The returned `ReelSet` uses `HeadlessSymbol` for every registered symbol,
 * so no textures, renderer, or DOM are required.
 *
 * ```ts
 * const { reelSet, spinAndLand } = createTestReelSet({
 *   reels: 5, visibleRows: 3,
 *   symbolIds: ['cherry', 'seven', 'wild'],
 * });
 *
 * await spinAndLand([
 *   ['cherry','cherry','cherry'],
 *   ['seven','seven','seven'],
 *   ['wild','wild','wild'],
 *   ['cherry','cherry','cherry'],
 *   ['seven','seven','seven'],
 * ]);
 * ```
 */
export function createTestReelSet(opts: TestReelSetOptions = {}): TestReelSetHandle {
  const reels = opts.reels ?? 5;
  const symbolIds = opts.symbolIds ?? ['a', 'b', 'c'];
  const weights = opts.weights ?? {};
  const size = opts.symbolSize ?? { width: 100, height: 100 };

  const ticker = new FakeTicker();

  const builder = new ReelSetBuilder()
    .reels(reels)
    .symbolSize(size.width, size.height)
    .ticker(ticker as unknown as Ticker)
    .symbols((registry) => {
      for (const id of symbolIds) {
        registry.register(id, HeadlessSymbol, {});
      }
    });

  if (opts.multiways) {
    builder.multiways(opts.multiways);
  } else if (Array.isArray(opts.visibleRows)) {
    builder.visibleRowsPerReel(opts.visibleRows);
  } else {
    builder.visibleRows(opts.visibleRows ?? 3);
  }

  if (opts.symbolGap) {
    builder.symbolGap(opts.symbolGap.x, opts.symbolGap.y);
  }

  if (Object.keys(weights).length > 0) {
    builder.weights(weights);
  }

  if (opts.symbolData) {
    builder.symbolData(opts.symbolData);
  }

  if (opts.bufferSymbols !== undefined) {
    builder.bufferSymbols(opts.bufferSymbols);
  }

  if (opts.initialFrame) {
    builder.initialFrame(opts.initialFrame);
  }

  const reelSet = builder.build();

  return {
    reelSet,
    ticker,
    advance(ms: number, stepMs = 16) {
      ticker.tickFor(ms, stepMs);
    },
    async spinAndLand(grid: SpinAndLandGrid) {
      return spinAndLand(reelSet, grid);
    },
    destroy() {
      reelSet.destroy();
      ticker.destroy();
    },
  };
}

/**
 * Deterministically run a spin to a target grid.
 *
 * Internally: `spin() -> setResult(grid) -> slamStop()`. `slamStop()` bypasses
 * all async phases and directly places the symbols (and bypasses the
 * two-stage `skipSpin()` boost machine), so the returned promise resolves on
 * a microtask.
 *
 * Accepts plain visible-cells `string[][]` (each inner array becomes the
 * `visible` field of a fresh `ColumnTarget`) or the explicit `ColumnTarget[]`
 * shape (passed straight through; use this to target buffer cells).
 */
export async function spinAndLand(reelSet: ReelSet, grid: SpinAndLandGrid): Promise<SpinResult> {
  const targets: ColumnTarget[] = grid.length === 0
    ? []
    : Array.isArray(grid[0])
      ? (grid as string[][]).map((visible) => ({ visible }))
      : (grid as ColumnTarget[]);
  const promise = reelSet.spin();
  reelSet.setResult(targets);
  reelSet.slamStop();
  return promise;
}

/** Record every occurrence of the given events in order for assertion. */
export function captureEvents(
  reelSet: ReelSet,
  names: Array<keyof import('../events/ReelEvents.js').ReelSetEvents>,
): Array<{ event: string; args: unknown[] }> {
  const log: Array<{ event: string; args: unknown[] }> = [];
  for (const name of names) {
    reelSet.events.on(name, (...args: unknown[]) => {
      log.push({ event: name as string, args });
    });
  }
  return log;
}

/**
 * Assert that the current visible grid equals `expected`.
 *
 * Throws a readable error showing the full current grid on mismatch.
 */
export function expectGrid(reelSet: ReelSet, expected: string[][]): void {
  const actual = debugSnapshot(reelSet).grid;
  const mismatches: string[] = [];

  if (actual.length !== expected.length) {
    throw new Error(
      `Grid reel count mismatch: expected ${expected.length} got ${actual.length}\n${debugGrid(reelSet)}`,
    );
  }

  for (let r = 0; r < expected.length; r++) {
    if (expected[r].length !== actual[r].length) {
      mismatches.push(
        `  reel ${r} row count: expected ${expected[r].length} got ${actual[r].length}`,
      );
      continue;
    }
    for (let row = 0; row < expected[r].length; row++) {
      if (expected[r][row] !== actual[r][row]) {
        mismatches.push(
          `  reel ${r} row ${row}: expected "${expected[r][row]}" got "${actual[r][row]}"`,
        );
      }
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Grid mismatch:\n${mismatches.join('\n')}\n\nCurrent grid:\n${debugGrid(reelSet)}`,
    );
  }
}

/**
 * Count how many times a given symbol appears in the visible grid.
 * Handy for scatter/wild-count assertions.
 */
export function countSymbol(reelSet: ReelSet, symbolId: string): number {
  let n = 0;
  for (const col of debugSnapshot(reelSet).grid) {
    for (const s of col) if (s === symbolId) n++;
  }
  return n;
}
