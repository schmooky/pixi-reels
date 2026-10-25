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

/**
 * What a draw is for. `'cell'` fills one slot and can only return a 1x1 id.
 * `'strip'` feeds the scrolling strip and may also return a tall block
 * (`size.reels === 1`, `size.cells > 1`), which the reel then streams in as
 * an anchor plus its OCCUPIED cells. Wide blocks (`size.reels > 1`) are
 * never drawn: they need the cross-reel coordinator a landing runs.
 */
type DrawFill = 'cell' | 'strip';

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
  /** Ids a `'cell'` draw skips: tall blocks, which only a strip feed can place. */
  private _tallIds = new Set<string>();
  /** Ids no draw may return: wide blocks. A weight > 0 on one is an error. */
  private _wideIds = new Set<string>();
  private _sizes: Record<string, { reels: number; cells: number } | undefined> = {};
  /** Installed pools, keyed by `${slots}:${reel}`. */
  private _pools = new Map<string, SymbolPool>();
  /** Compiled tables, same key shape. Dropped wholesale on any mutation. */
  private _tables = new Map<string, DrawTable>();
  private _rng: () => number;

  /** Buffer slots before the window, when known. Bounds the tall blocks a strip may stream. */
  private _bufferStart: number | undefined;

  /**
   * @param symbolsData - Symbol id → weight/data map.
   * @param rng - Source of randomness returning a value in [0, 1). Defaults to
   *   `Math.random`. Regulated / provably-fair deployments must inject a
   *   seeded, audited PRNG so the on-screen strip can be replayed from a seed.
   * @param options.bufferStart - The set's buffer slots before the window. A
   *   tall block with a weight needs `cells <= bufferStart`, or its covered
   *   cells show blank while it enters a forward reel and leaves a reverse
   *   one; the check runs here so a weight that would do that fails at the
   *   call that set it. Omit to skip the check.
   */
  constructor(
    symbolsData: Record<string, SymbolData>,
    rng: () => number = Math.random,
    options: { bufferStart?: number } = {},
  ) {
    this._rng = rng;
    this._bufferStart = options.bufferStart;
    this._symbols = Object.keys(symbolsData);
    this._readBaseWeights(symbolsData);
    this._assertUsable();
  }

  /**
   * Get a random symbol for one slot. Never a big symbol: one slot holds one
   * cell, and a block needs its OCCUPIED cells placed next to it.
   *
   * @param slot - Which slot is being filled. A buffer slot names its side,
   *   so the pools for that side apply on top of the wider ones.
   * @param reelIndex - Reel the slot belongs to. Omit for a draw that
   *   belongs to no particular reel; per-reel pools then don't apply.
   */
  next(slot: DrawSlot = 'spinning', reelIndex?: number): string {
    return this._draw(this._table(slot, reelIndex, 'cell'));
  }

  /**
   * Get the next symbol to feed onto a spinning strip. Same `'spinning'`
   * pools as `next('spinning', reelIndex)`, but a tall block (one reel wide,
   * several cells high) with a weight > 0 may come back: the reel streams
   * it in whole, anchor and OCCUPIED cells together.
   */
  nextForStrip(reelIndex: number): string {
    return this._draw(this._table('spinning', reelIndex, 'strip'));
  }

  private _draw(table: DrawTable): string {
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

  private _tableKey(slots: SymbolPoolSlots, reel: number | undefined, fill: DrawFill): string {
    return `${this._key(slots, reel)}:${fill}`;
  }

  private _readBaseWeights(symbolsData: Record<string, SymbolData>): void {
    this._baseWeights = {};
    this._tallIds.clear();
    this._wideIds.clear();
    this._sizes = {};
    for (const id of this._symbols) {
      const data = symbolsData[id];
      this._baseWeights[id] = data.weight;
      const size = data.size;
      this._sizes[id] = size;
      if (!size || (size.reels === 1 && size.cells === 1)) continue;
      if (size.reels > 1) {
        if (data.weight > 0) throw new Error(this._wideWeightMessage(id, size));
        this._wideIds.add(id);
      } else {
        if (data.weight > 0) this._assertTallFits(id, size.cells);
        this._tallIds.add(id);
      }
    }
  }

  /**
   * A tall block's anchor is its start-most cell. It enters a forward reel
   * tail first and leaves a reverse reel anchor first, so its covered cells
   * are on the strip without the anchor that draws them for up to `cells - 1`
   * wraps. With `bufferStart >= cells` that happens outside the window.
   */
  private _assertTallFits(id: string, cells: number): void {
    if (this._bufferStart === undefined || cells <= this._bufferStart) return;
    throw new Error(
      `big symbol '${id}' (1x${cells}) cannot carry a weight on a set with ` +
        `bufferSymbols({ start: ${this._bufferStart} }): its ${cells} cells enter and leave the ` +
        `window before the anchor that draws them, so cells would show blank. Call ` +
        `builder.bufferSymbols({ start: ${cells}, end: ... }), or keep its weight 0.`,
    );
  }

  private _wideWeightMessage(id: string, size: { reels: number; cells: number }): string {
    return (
      `big symbol '${id}' (${size.reels}x${size.cells}) spans ${size.reels} reels and cannot be ` +
      'drawn at random: the random fill feeds one reel at a time and has no way to place the ' +
      'other reels of the block. Give it weight 0 and place it via setResult(). Only blocks one ' +
      'reel wide (size.reels === 1) may carry a weight.'
    );
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

  private _table(slots: SymbolPoolSlots, reelIndex: number | undefined, fill: DrawFill): DrawTable {
    const key = this._tableKey(slots, reelIndex, fill);
    const cached = this._tables.get(key);
    if (cached) return cached;
    const table = this._compile(slots, reelIndex, fill);
    if (table.total <= 0) {
      throw new Error(this._emptyPoolMessage(slots, reelIndex));
    }
    this._tables.set(key, table);
    return table;
  }

  private _compile(slots: SymbolPoolSlots, reelIndex: number | undefined, fill: DrawFill): DrawTable {
    const weights = this._resolve(slots, reelIndex);
    const table: DrawTable = { ids: [], cumulative: [], total: 0 };
    for (const id of this._symbols) {
      const weight = weights[id];
      // Zero-weight ids are dropped rather than carried at a repeated
      // cumulative value: same draw either way, smaller table.
      if (weight <= 0) continue;
      // A single slot cannot hold a block; a wide block has no random path at all.
      if (this._wideIds.has(id) || (fill === 'cell' && this._tallIds.has(id))) continue;
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
    for (const [id, weight] of Object.entries(pool.weights ?? {})) {
      if (weight <= 0) continue;
      if (this._wideIds.has(id)) {
        throw new Error(
          `SymbolPool ${this._scopeName(scope.slots ?? 'spinning', scope.reel)}: ` +
            `${this._wideWeightMessage(id, this._sizeOf(id))}`,
        );
      }
      if (this._tallIds.has(id)) this._assertTallFits(id, this._sizeOf(id).cells);
    }
  }

  private _sizeOf(id: string): { reels: number; cells: number } {
    return this._sizes[id] ?? { reels: 1, cells: 1 };
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
    // The single-cell table is the strict one: a strip draw adds the tall
    // blocks to it, so a pool that leaves a cell drawable leaves the strip
    // drawable too.
    for (const [slot, reel] of scopes) {
      if (this._compile(slot, reel, 'cell').total <= 0) {
        throw new Error(this._emptyPoolMessage(slot, reel));
      }
    }
  }

  private _emptyPoolMessage(slots: SymbolPoolSlots, reelIndex: number | undefined): string {
    return (
      `No symbol left to draw ${this._scopeName(slots, reelIndex)}: every registered symbol is ` +
      'excluded, weighted 0 or a big symbol, so the strip cannot be filled. Leave at least one ' +
      '1x1 symbol drawable.'
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
    for (const id of this._symbols) {
      if (this._tallIds.has(id) || this._wideIds.has(id)) continue;
      total += Math.max(0, this._baseWeights[id]);
    }
    if (total <= 0) {
      throw new Error(
        'RandomSymbolProvider requires at least one 1x1 symbol with weight > 0; ' +
          'every registered 1x1 symbol has weight 0, so the spinning strip cannot be filled.',
      );
    }
  }
}
