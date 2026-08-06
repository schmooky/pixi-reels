/**
 * What the engine is allowed to draw when it needs a random symbol.
 *
 * Every cell the game does not name explicitly (the strip streaming past
 * during a spin, and the buffer cells parked either side of the visible
 * window) is filled from a weighted draw. A pool narrows that draw: it
 * layers weight overrides on top of the registered `builder.weights(...)`
 * table and hard-excludes ids that must never show up.
 */
export interface SymbolPool {
  /**
   * Weight overrides by symbol id, layered over the registered weights.
   * A weight of `0` removes the symbol from this pool as surely as
   * listing it in `exclude` does.
   */
  weights?: Readonly<Record<string, number>>;
  /** Symbol ids that must never be drawn in this pool. */
  exclude?: readonly string[];
}

/**
 * Which draws a pool applies to.
 *
 * Layers resolve base -> global spinning -> per-reel spinning -> global
 * buffer -> per-reel buffer. Weights override per symbol id, exclusions
 * accumulate. So a `'buffer'` pool is always ON TOP of the spinning rules
 * for that reel: what the strip may not show while it scrolls, the buffer
 * may not show either.
 */
export interface SymbolPoolScope {
  /** Restrict to one reel index. Omit to apply to every reel. */
  reel?: number;
  /**
   * `'spinning'` (default) covers every random draw on the reel.
   * `'buffer'` narrows only the cells outside the visible window.
   */
  slots?: 'spinning' | 'buffer';
}

/**
 * Runtime control over the random symbol draw, reachable as
 * `reelSet.randomSymbols`.
 *
 * ```ts
 * // No EMPTY anywhere on any reel while it spins.
 * reelSet.randomSymbols.set({ exclude: ['EMPTY'] });
 *
 * // Reel 2 runs hot on wilds during the feature.
 * reelSet.randomSymbols.set({ weights: { WILD: 40 } }, { reel: 2 });
 *
 * // Nothing collectible may sit half-visible above or below the grid.
 * reelSet.randomSymbols.set({ exclude: ['COIN'] }, { slots: 'buffer' });
 *
 * // Drop one layer, or all of them.
 * reelSet.randomSymbols.set(null, { reel: 2 });
 * reelSet.randomSymbols.clear();
 * ```
 *
 * Changes apply to the next draw. symbols already on the strip stay until
 * they wrap out, so set the pools before `spin()` (or before the reels
 * reach the cells you care about), not after.
 */
export interface RandomSymbolControl {
  /**
   * Install (or with `null`, remove) the pool for one scope. Each scope
   * holds exactly one pool: setting it again replaces the previous one.
   *
   * @throws If the pool names an unregistered symbol id, or if it leaves
   *   some reachable scope with nothing left to draw.
   */
  set(pool: SymbolPool | null, scope?: SymbolPoolScope): void;

  /** Remove every pool. back to the weights the set was built with. */
  clear(): void;

  /**
   * The weights the engine will actually draw from for a scope, excluded
   * ids reported as `0`. For tests, debug overlays, and sanity checks.
   */
  weights(scope?: SymbolPoolScope): Record<string, number>;
}
