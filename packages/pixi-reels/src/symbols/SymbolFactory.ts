import type { ReelSymbol } from './ReelSymbol.js';
import type { SymbolRegistry } from './SymbolRegistry.js';
import { ObjectPool } from '../pool/ObjectPool.js';

/**
 * Creates and pools ReelSymbol instances.
 *
 * Wraps SymbolRegistry for creation and ObjectPool for recycling.
 * Game code should not need to interact with this directly —
 * it's managed by Reel internally.
 */
export class SymbolFactory {
  private _pool: ObjectPool<ReelSymbol>;

  constructor(
    private _registry: SymbolRegistry,
    maxPoolPerKey: number = 20,
  ) {
    this._pool = new ObjectPool<ReelSymbol>(
      (key: string) => this._registry.create(key),
      (item: ReelSymbol) => item.reset(),
      (item: ReelSymbol) => item.destroy(),
      maxPoolPerKey,
    );
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
