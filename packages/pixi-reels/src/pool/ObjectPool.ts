import type { Disposable } from '../utils/Disposable.js';

/**
 * Generic object pool for reusing expensive-to-create objects.
 *
 * Reduces GC pressure by recycling objects instead of creating/destroying them each frame.
 * Used internally for ReelSymbol instances and available to game code for trails, particles, etc.
 *
 * @typeParam T - The type of object to pool.
 */
export class ObjectPool<T> implements Disposable {
  private _pools = new Map<string, T[]>();
  private _isDestroyed = false;

  constructor(
    private _factory: (key: string) => T,
    private _reset?: (item: T) => void,
    private _dispose?: (item: T) => void,
    private _maxPerKey: number = 20,
  ) {}

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Get an object from the pool, or create a new one if the pool is empty.
   */
  acquire(key: string): T {
    const pool = this._pools.get(key);
    if (pool && pool.length > 0) {
      const item = pool.pop()!;
      this._reset?.(item);
      return item;
    }
    return this._factory(key);
  }

  /**
   * Return an object to the pool for reuse.
   * If the pool is at capacity, the object is disposed instead.
   */
  release(key: string, item: T): void {
    let pool = this._pools.get(key);
    if (!pool) {
      pool = [];
      this._pools.set(key, pool);
    }
    if (pool.length >= this._maxPerKey) {
      this._dispose?.(item);
      return;
    }
    pool.push(item);
  }

  /** Get the number of pooled items for a key. */
  size(key: string): number {
    return this._pools.get(key)?.length ?? 0;
  }

  /** Get total pooled items across all keys. */
  get totalSize(): number {
    let total = 0;
    for (const pool of this._pools.values()) {
      total += pool.length;
    }
    return total;
  }

  /** Clear all pooled items, calling dispose on each. */
  clear(): void {
    if (this._dispose) {
      for (const pool of this._pools.values()) {
        for (const item of pool) {
          this._dispose(item);
        }
      }
    }
    this._pools.clear();
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this.clear();
    this._isDestroyed = true;
  }
}
