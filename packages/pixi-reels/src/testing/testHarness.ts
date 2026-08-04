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
   * Visible cell count.
   *   - `number` → uniform cells.
   *   - `number[]` → per-reel static shape (pyramid).
   *
   * Mutually exclusive with `multiways` (which always starts at `maxCells`).
   */
  visibleCells?: number | number[];
  /**
   * MultiWays configuration. Mutually exclusive with `visibleCells: number[]`.
   * The harness sets uniform `reelExtent` and forwards `min/maxCells`.
   */
  multiways?: { minCells: number; maxCells: number; reelExtent: number };
  symbolIds?: string[];
  weights?: Record<string, number>;
  /** Per-symbol overrides. useful for big-symbol size declarations in tests. */
  symbolData?: Record<string, Partial<import('../config/types.js').SymbolData>>;
  symbolSize?: { width: number; height: number };
  symbolGap?: { x: number; y: number };
  /** Strip orientation. Defaults to 'vertical'. */
  orientation?: import('../core/ReelAxis.js').Orientation;
  /** Travel direction for every reel. Defaults to 'forward'. */
  direction?: import('../core/ReelAxis.js').Direction;
  /** Per-reel travel direction override (length must equal `reels`). */
  directionPerReel?: import('../core/ReelAxis.js').Direction[];
  /**
   * Cascade/tumble config, same shape as `ReelSetBuilder.tumble(...)`. Pass
   * `{}` for the defaults. Without this the set spins strips instead of
   * cascading, so a cascade test that also wants a non-default
   * `orientation` / `direction` has to hand-roll a builder - which is
   * exactly why the cascade suite had no axis coverage.
   */
  tumble?: import('../cascade/TumbleConfig.js').TumbleConfig;
  /** Number of symbols above + below the visible area. Defaults to the builder default. */
  bufferSymbols?: number | { start: number; end: number };
  /** Initial symbol grid. Same `ColumnTarget[]` form as `ReelSetBuilder.initialFrame`. */
  initialFrame?: ColumnTarget[];
  /**
   * gsap instance for this set. Pass a synchronous shim to drive tweens
   * inline instead of waiting on a real clock. Per set, so two harnesses in
   * one file cannot clobber each other.
   */
  gsap?: import('../utils/gsap.js').Gsap;
}

export interface TestReelSetHandle {
  reelSet: ReelSet;
  ticker: FakeTicker;
  /** Advance the ticker by `ms` milliseconds. */
  advance(ms: number, stepMs?: number): void;
  /**
   * Run one full spin that lands on `grid`. Uses `slamStop()` for deterministic
   * synchronous completion. Takes `ColumnTarget[]`, the same shape as
   * `setResult` -- there is no `string[][]` convenience form anywhere.
   */
  spinAndLand(grid: ColumnTarget[]): Promise<SpinResult>;
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
 *   reels: 5, visibleCells: 3,
 *   symbolIds: ['cherry', 'seven', 'wild'],
 * });
 *
 * await spinAndLand([
 *   { visible: ['cherry','cherry','cherry'] },
 *   { visible: ['seven','seven','seven'] },
 *   { visible: ['wild','wild','wild'] },
 *   { visible: ['cherry','cherry','cherry'] },
 *   { visible: ['seven','seven','seven'] },
 * ]);
 * ```
 */
export function createTestReelSet(opts: TestReelSetOptions = {}): TestReelSetHandle {
  const reels = opts.reels ?? 5;
  const symbolIds = opts.symbolIds ?? ['a', 'b', 'c'];
  const weights = opts.weights ?? {};
  // NON-SQUARE on purpose (ADR 018 section 10.2). With a square default a test
  // cannot tell width from height, so an axis transposition passes every
  // assertion. 120x100 makes the two observably different.
  const size = opts.symbolSize ?? { width: 120, height: 100 };

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
  } else if (Array.isArray(opts.visibleCells)) {
    builder.visibleCellsPerReel(opts.visibleCells);
  } else {
    builder.visibleCells(opts.visibleCells ?? 3);
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

  if (opts.gsap) {
    builder.gsap(opts.gsap);
  }
  if (opts.orientation) {
    builder.orientation(opts.orientation);
  }
  if (opts.direction) {
    builder.direction(opts.direction);
  }
  if (opts.directionPerReel) {
    builder.directionPerReel(opts.directionPerReel);
  }
  if (opts.tumble) {
    builder.tumble(opts.tumble);
  }

  const reelSet = builder.build();

  return {
    reelSet,
    ticker,
    advance(ms: number, stepMs = 16) {
      ticker.tickFor(ms, stepMs);
    },
    async spinAndLand(grid: ColumnTarget[]) {
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
 * Takes `ColumnTarget[]`, the same as `setResult`. There is no `string[][]`
 * convenience form anywhere in v2.
 */
export async function spinAndLand(reelSet: ReelSet, grid: ColumnTarget[]): Promise<SpinResult> {
  const promise = reelSet.spin();
  reelSet.setResult(grid);
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
        `  reel ${r} cell count: expected ${expected[r].length} got ${actual[r].length}`,
      );
      continue;
    }
    for (let cell = 0; cell < expected[r].length; cell++) {
      if (expected[r][cell] !== actual[r][cell]) {
        mismatches.push(
          `  reel ${r} cell ${cell}: expected "${expected[r][cell]}" got "${actual[r][cell]}"`,
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
  for (const reel of debugSnapshot(reelSet).grid) {
    for (const s of reel) if (s === symbolId) n++;
  }
  return n;
}
