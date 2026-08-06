import type { SymbolData } from '../config/types.js';
import type {
  RandomSymbolControl,
  SymbolPool,
  SymbolPoolScope,
  SymbolPoolSlots,
} from './SymbolPool.js';

/**
 * Which slot the engine is filling. `'buffer'` is a LAYER, never a slot: a
 * real cell is always on one side or the other.
 */
export type DrawSlot = 'spinning' | 'bufferStart' | 'bufferEnd';

/** A compiled draw table: ids with weight > 0 plus their cumulative weights. */
interface DrawTable {
  ids: string[];
  cumulative: number[];
  total: number;
}

/** Global layers use this in place of a reel index. */
const ALL_REELS = '*';

/**
 * Weighted random symbol selector using binary search on cumulative weights.
 *
 * On top of the registered weights it carries layers of `SymbolPool`
 * overrides. global and per-reel, for the spinning strip, for both buffer
 * ends at once, and for either end on its own. See `SymbolPoolScope` for
 * how they resolve.
 */
export class RandomSymbolProvider implements RandomSymbolControl {
  private _symbols: string[];
  private _baseWeights: Record<string, number> = {};
  /** Installed pools, keyed by `${slots}:${reel}`. */
  private _pools = new Map<string, SymbolPool>();
  /** Compiled tables, same key shape. Dropped wholesale on any mutation. */
  private _tables = new Map<string, DrawTable>();
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
    this._readBaseWeights(symbolsData);
    this._assertUsable();
  }

  /**
   * Get a random symbol for one slot.
   *
   * @param slot - Which slot is being filled. A buffer slot names its side,
   *   so the pools for that side apply on top of the wider ones.
   * @param reelIndex - Reel the slot belongs to. Omit for a draw that
   *   belongs to no particular reel; per-reel pools then don't apply.
   */
  next(slot: DrawSlot = 'spinning', reelIndex?: number): string {
    const table = this._table(slot, reelIndex);
    const rand = this._rng() * table.total;
    let lo = 0;
    let hi = table.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (table.cumulative[mid] <= rand) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return table.ids[lo];
  }

  /** @inheritdoc */
  set(pool: SymbolPool | null, scope: SymbolPoolScope = {}): void {
    const key = this._key(scope.slots ?? 'spinning', scope.reel);
    const previous = this._pools.get(key);
    if (pool === null) {
      this._pools.delete(key);
    } else {
      this._assertKnownIds(pool, scope);
      this._pools.set(key, {
        weights: pool.weights ? { ...pool.weights } : undefined,
        exclude: pool.exclude ? [...pool.exclude] : undefined,
      });
    }
    this._tables.clear();
    // Roll back rather than leave the set holding a pool it cannot draw from.
    try {
      this._assertDrawable();
    } catch (err) {
      if (previous === undefined) this._pools.delete(key);
      else this._pools.set(key, previous);
      this._tables.clear();
      throw err;
    }
  }

  /** @inheritdoc */
  clear(): void {
    this._pools.clear();
    this._tables.clear();
  }

  /** @inheritdoc */
  weights(scope: SymbolPoolScope = {}): Record<string, number> {
    const resolved = this._resolve(scope.slots ?? 'spinning', scope.reel);
    const out: Record<string, number> = {};
    for (const id of this._symbols) out[id] = resolved[id];
    return out;
  }

  /**
   * Set symbols to exclude during spinning.
   *
   * Sugar for `set({ exclude }, { slots: 'spinning' })` that leaves any
   * weight overrides on the global spinning pool alone.
   */
  setExcludeSpinning(symbolIds: string[]): void {
    this._setExclude('spinning', symbolIds);
  }

  /**
   * Set symbols to exclude from buffer (above/below) areas.
   *
   * Sugar for `set({ exclude }, { slots: 'buffer' })` that leaves any
   * weight overrides on the global buffer pool alone.
   */
  setExcludeBuffer(symbolIds: string[]): void {
    this._setExclude('buffer', symbolIds);
  }

  /** Update weights at runtime (e.g., for different game modes). */
  updateWeights(symbolsData: Record<string, SymbolData>): void {
    this._symbols = Object.keys(symbolsData);
    this._readBaseWeights(symbolsData);
    this._assertUsable();
    // Drop pool entries that reference symbols no longer present in this mode,
    // otherwise a stale exclusion from the previous game mode silently lingers.
    const present = new Set(this._symbols);
    for (const [key, pool] of this._pools) {
      this._pools.set(key, {
        weights: pool.weights
          ? Object.fromEntries(
              Object.entries(pool.weights).filter(([id]) => present.has(id)),
            )
          : undefined,
        exclude: pool.exclude?.filter((id) => present.has(id)),
      });
    }
    this._tables.clear();
    this._assertDrawable();
  }

  private _setExclude(slots: SymbolPoolSlots, symbolIds: string[]): void {
    const current = this._pools.get(this._key(slots, undefined));
    this.set({ weights: current?.weights, exclude: symbolIds }, { slots });
  }

  private _key(slots: SymbolPoolSlots, reel: number | undefined): string {
    return `${slots}:${reel ?? ALL_REELS}`;
  }

  private _readBaseWeights(symbolsData: Record<string, SymbolData>): void {
    this._baseWeights = {};
    for (const id of this._symbols) {
      this._baseWeights[id] = symbolsData[id].weight;
    }
  }

  /**
   * The layer keys that apply to one draw, widest first.
   *
   * A `'bufferStart'` cell reads the spinning layers, then the both-sides
   * buffer layers, then its own side's - so every layer only ever narrows
   * the one before it. Asking for `'buffer'` stops before the side layers:
   * that is what both sides inherit, and what `weights()` reports for it.
   */
  private _layerKeys(slots: SymbolPoolSlots, reelIndex: number | undefined): string[] {
    const perReel = (key: SymbolPoolSlots): string[] =>
      reelIndex === undefined
        ? [this._key(key, undefined)]
        : [this._key(key, undefined), this._key(key, reelIndex)];

    const keys = perReel('spinning');
    if (slots === 'spinning') return keys;
    keys.push(...perReel('buffer'));
    if (slots === 'buffer') return keys;
    keys.push(...perReel(slots));
    return keys;
  }

  /**
   * Effective weight per symbol id for one draw, excluded ids flattened to
   * `0`. See `_layerKeys` for the order.
   */
  private _resolve(
    slots: SymbolPoolSlots,
    reelIndex: number | undefined,
  ): Record<string, number> {
    const weights = { ...this._baseWeights };
    const layers = this._layerKeys(slots, reelIndex);
    const excluded = new Set<string>();
    for (const key of layers) {
      const pool = this._pools.get(key);
      if (!pool) continue;
      if (pool.weights) {
        for (const [id, weight] of Object.entries(pool.weights)) {
          if (id in weights) weights[id] = weight;
        }
      }
      if (pool.exclude) {
        for (const id of pool.exclude) excluded.add(id);
      }
    }
    // Exclusions win over every weight in the chain: a narrower layer can't
    // re-admit what a wider one banned, it can only ban more.
    for (const id of excluded) weights[id] = 0;
    return weights;
  }

  private _table(slots: SymbolPoolSlots, reelIndex: number | undefined): DrawTable {
    const key = this._key(slots, reelIndex);
    const cached = this._tables.get(key);
    if (cached) return cached;
    const table = this._compile(slots, reelIndex);
    if (table.total <= 0) {
      throw new Error(this._emptyPoolMessage(slots, reelIndex));
    }
    this._tables.set(key, table);
    return table;
  }

  private _compile(slots: SymbolPoolSlots, reelIndex: number | undefined): DrawTable {
    const weights = this._resolve(slots, reelIndex);
    const table: DrawTable = { ids: [], cumulative: [], total: 0 };
    for (const id of this._symbols) {
      const weight = weights[id];
      // Zero-weight ids are dropped rather than carried at a repeated
      // cumulative value: same draw either way, smaller table.
      if (weight <= 0) continue;
      table.total += weight;
      table.ids.push(id);
      table.cumulative.push(table.total);
    }
    return table;
  }

  private _assertKnownIds(pool: SymbolPool, scope: SymbolPoolScope): void {
    const ids = [...Object.keys(pool.weights ?? {}), ...(pool.exclude ?? [])];
    for (const id of ids) {
      if (this._baseWeights[id] === undefined) {
        throw new Error(
          `SymbolPool ${this._scopeName(scope.slots ?? 'spinning', scope.reel)} names symbol '${id}', ` +
            `which is not registered. Registered ids: ${this._symbols.join(', ')}.`,
        );
      }
    }
  }

  /**
   * Every scope a draw can reach must still have something to draw. Checked
   * on mutation so a pool that empties the strip fails at the call that
   * caused it, not mid-spin on whichever reel happens to wrap first.
   */
  private _assertDrawable(): void {
    const reels = new Set<number>();
    for (const key of this._pools.keys()) {
      const reel = key.slice(key.indexOf(':') + 1);
      if (reel !== ALL_REELS) reels.add(Number(reel));
    }
    // Widest scope first, so the message names the layer that actually
    // emptied things: a pool that clears `'buffer'` empties both sides, and
    // "buffer cells" is a better answer than "buffer-start cells".
    const drawn: SymbolPoolSlots[] = ['spinning', 'buffer', 'bufferStart', 'bufferEnd'];
    const scopes: [SymbolPoolSlots, number | undefined][] = drawn.map((slot) => [slot, undefined]);
    for (const reel of reels) {
      for (const slot of drawn) scopes.push([slot, reel]);
    }
    for (const [slot, reel] of scopes) {
      if (this._compile(slot, reel).total <= 0) {
        throw new Error(this._emptyPoolMessage(slot, reel));
      }
    }
  }

  private _emptyPoolMessage(slots: SymbolPoolSlots, reelIndex: number | undefined): string {
    return (
      `No symbol left to draw ${this._scopeName(slots, reelIndex)}: every registered symbol is ` +
      'excluded or weighted 0, so the strip cannot be filled. Leave at least one symbol drawable.'
    );
  }

  private _scopeName(slots: SymbolPoolSlots, reelIndex: number | undefined): string {
    const where = {
      spinning: 'spinning cells',
      buffer: 'buffer cells',
      bufferStart: 'buffer-start cells',
      bufferEnd: 'buffer-end cells',
    }[slots];
    return reelIndex === undefined ? `for ${where} on every reel` : `for ${where} on reel ${reelIndex}`;
  }

  private _assertUsable(): void {
    if (this._symbols.length === 0) {
      throw new Error('RandomSymbolProvider requires at least one symbol.');
    }
    let total = 0;
    for (const id of this._symbols) total += Math.max(0, this._baseWeights[id]);
    if (total <= 0) {
      throw new Error(
        'RandomSymbolProvider requires at least one symbol with weight > 0; ' +
          'all registered symbols have weight 0, so the spinning strip cannot be filled.',
      );
    }
  }
}
