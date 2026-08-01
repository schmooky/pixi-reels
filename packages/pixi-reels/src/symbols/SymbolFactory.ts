import type { ReelSymbol } from './ReelSymbol.js';
import type { SymbolRegistry } from './SymbolRegistry.js';
import { ObjectPool } from '../pool/ObjectPool.js';
import { DEFAULT_GSAP, type Gsap } from '../utils/gsap.js';

/**
 * Creates and pools ReelSymbol instances.
 *
 * Wraps SymbolRegistry for creation and ObjectPool for recycling.
 * Game code should not need to interact with this directly.
 * it's managed by Reel internally.
 */
export class SymbolFactory {
  private _pool: ObjectPool<ReelSymbol>;
  private _capacityPerKey: number;

  constructor(
    private _registry: SymbolRegistry,
    maxPoolPerKey: number = 20,
    gsap: Gsap = DEFAULT_GSAP,
  ) {
    this._capacityPerKey = maxPoolPerKey;
    this._pool = new ObjectPool<ReelSymbol>(
      // Bind at CREATE, not acquire: the factory belongs to one reel set for
      // its whole life, and a pooled symbol never crosses sets.
      (key: string) => {
        const symbol = this._registry.create(key);
        symbol.bindGsap(gsap);
        return symbol;
      },
      (item: ReelSymbol) => item.reset(),
      (item: ReelSymbol) => item.destroy(),
      maxPoolPerKey,
    );
  }

  /** Max recycled instances kept per symbol id before overflow is destroyed. */
  get capacityPerKey(): number {
    return this._capacityPerKey;
  }

  /** Get a symbol (from pool or newly created), activated with symbolId. */
  acquire(symbolId: string): ReelSymbol {
    const symbol = this._pool.acquire(symbolId);
    if (symbol.symbolId !== symbolId) {
      symbol.activate(symbolId);
    }
    return symbol;
  }

  /** Return a symbol to the pool. */
  release(symbol: ReelSymbol): void {
    const id = symbol.symbolId;
    symbol.deactivate();
    this._pool.release(id, symbol);
  }

  destroy(): void {
    this._pool.destroy();
  }
}
