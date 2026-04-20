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

  constructor(symbolsData: Record<string, SymbolData>) {
    this._symbols = Object.keys(symbolsData);
    this._weights = this._symbols.map((id) => symbolsData[id].weight);
    this._rebuildWeights();
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

    const rand = Math.random() * total;
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
    const rand = Math.random() * this._totalWeight;
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
