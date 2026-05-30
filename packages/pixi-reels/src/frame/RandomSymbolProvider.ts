import type { SymbolData } from '../config/types.js';

/**
 * Weighted random symbol selector using binary search on cumulative weights.
 *
 * Supports exclusion lists for symbols that shouldn't appear during
 * spinning or in buffer areas.
 */
export class RandomSymbolProvider {
  private _symbols: string[];
  private _weights: number[];
  private _cumulativeWeights: number[] = [];
  private _totalWeight: number = 0;
  private _excludeSpinning = new Set<string>();
  private _excludeBuffer = new Set<string>();
  private _rng: () => number;

  /**
   * @param symbolsData - Symbol id → weight/data map.
   * @param rng - Source of randomness returning a value in [0, 1). Defaults to
   *   `Math.random`. Regulated / provably-fair deployments must inject a
   *   seeded, audited PRNG so the on-screen strip can be replayed from a seed.
   */
  constructor(symbolsData: Record<string, SymbolData>, rng: () => number = Math.random) {
    this._rng = rng;
    this._symbols = Object.keys(symbolsData);
    this._weights = this._symbols.map((id) => symbolsData[id].weight);
    this._rebuildWeights();
    this._assertUsable();
  }

  /** Get a random symbol, optionally excluding buffer-only symbols. */
  next(useBufferExclusion: boolean = false): string {
    const exclude = useBufferExclusion
      ? new Set([...this._excludeSpinning, ...this._excludeBuffer])
      : this._excludeSpinning;

    if (exclude.size === 0) {
      return this._pickWeighted();
    }

    // Build filtered weights on the fly for exclusions
    let total = 0;
    const filtered: { id: string; cumWeight: number }[] = [];
    for (let i = 0; i < this._symbols.length; i++) {
      if (exclude.has(this._symbols[i])) continue;
      total += this._weights[i];
      filtered.push({ id: this._symbols[i], cumWeight: total });
    }

    if (total === 0 || filtered.length === 0) {
      // Fallback: return first non-excluded symbol
      for (const s of this._symbols) {
        if (!exclude.has(s)) return s;
      }
      return this._symbols[0];
    }

    const rand = this._rng() * total;
    // Binary search
    let lo = 0;
    let hi = filtered.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (filtered[mid].cumWeight <= rand) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return filtered[lo].id;
  }

  /** Set symbols to exclude during spinning. */
  setExcludeSpinning(symbolIds: string[]): void {
    this._excludeSpinning = new Set(symbolIds);
  }

  /** Set symbols to exclude from buffer (above/below) areas. */
  setExcludeBuffer(symbolIds: string[]): void {
    this._excludeBuffer = new Set(symbolIds);
  }

  /** Update weights at runtime (e.g., for different game modes). */
  updateWeights(symbolsData: Record<string, SymbolData>): void {
    this._symbols = Object.keys(symbolsData);
    this._weights = this._symbols.map((id) => symbolsData[id].weight);
    this._rebuildWeights();
    this._assertUsable();
    // Drop exclusions that reference symbols no longer present in this mode,
    // otherwise a stale exclusion from the previous game mode silently lingers.
    const present = new Set(this._symbols);
    this._excludeSpinning = new Set(
      [...this._excludeSpinning].filter((id) => present.has(id)),
    );
    this._excludeBuffer = new Set(
      [...this._excludeBuffer].filter((id) => present.has(id)),
    );
  }

  private _assertUsable(): void {
    if (this._symbols.length === 0) {
      throw new Error('RandomSymbolProvider requires at least one symbol.');
    }
    if (this._totalWeight <= 0) {
      throw new Error(
        'RandomSymbolProvider requires at least one symbol with weight > 0; ' +
          'all registered symbols have weight 0, so the spinning strip cannot be filled.',
      );
    }
  }

  private _rebuildWeights(): void {
    this._cumulativeWeights = [];
    this._totalWeight = 0;
    for (const w of this._weights) {
      this._totalWeight += w;
      this._cumulativeWeights.push(this._totalWeight);
    }
  }

  private _pickWeighted(): string {
    const rand = this._rng() * this._totalWeight;
    let lo = 0;
    let hi = this._cumulativeWeights.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._cumulativeWeights[mid] <= rand) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return this._symbols[lo];
  }
}
