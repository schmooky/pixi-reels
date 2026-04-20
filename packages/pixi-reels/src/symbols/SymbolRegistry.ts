import type { ReelSymbol } from './ReelSymbol.js';

type SymbolConstructor<T extends ReelSymbol = ReelSymbol> = new (options: any) => T;

interface RegistryEntry {
  SymbolClass: SymbolConstructor;
  options: any;
}

/**
 * Registry that maps symbolIds to their constructors and options.
 *
 * Used by the builder and SymbolFactory to create symbols on demand.
 */
export class SymbolRegistry {
  private _entries = new Map<string, RegistryEntry>();

  /**
   * Register a symbol type.
   *
   * ```ts
   * registry.register('cherry', SpriteSymbol, { textures: { cherry: tex } });
   * ```
   */
  register<T extends ReelSymbol>(
    symbolId: string,
    SymbolClass: new (options: any) => T,
    options: T extends { constructor: (options: infer O) => any } ? O : any,
  ): void {
    if (this._entries.has(symbolId)) {
      throw new Error(`Symbol '${symbolId}' is already registered.`);
    }
    this._entries.set(symbolId, { SymbolClass, options });
  }

  /** Create a new symbol instance for the given symbolId. */
  create(symbolId: string): ReelSymbol {
    const entry = this._entries.get(symbolId);
    if (!entry) {
      throw new Error(
        `Symbol '${symbolId}' is not registered. Available: ${[...this._entries.keys()].join(', ')}`,
      );
    }
    const symbol = new entry.SymbolClass(entry.options);
    symbol.activate(symbolId);
    return symbol;
  }

  has(symbolId: string): boolean {
    return this._entries.has(symbolId);
  }

  get symbolIds(): string[] {
    return [...this._entries.keys()];
  }

  get size(): number {
    return this._entries.size;
  }
}
