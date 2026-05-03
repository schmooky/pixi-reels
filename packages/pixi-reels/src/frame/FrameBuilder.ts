import type { RandomSymbolProvider } from './RandomSymbolProvider.js';

/** Context passed through the middleware pipeline. */
export interface FrameContext {
  /** Reel column index. */
  readonly reelIndex: number;
  /** Total visible rows. */
  readonly visibleRows: number;
  /** Buffer symbols above visible area. */
  readonly bufferAbove: number;
  /** Buffer symbols below visible area. */
  readonly bufferBelow: number;
  /** The symbol array being built (buffer + visible + buffer). Mutable by middleware. */
  symbols: string[];
  /** Target symbols from setResult() (visible rows only), if available. */
  readonly targetSymbols?: string[];
  /** Whether the reel is currently spinning. */
  readonly isSpinning: boolean;
  /** Arbitrary metadata middleware can use to communicate. */
  metadata: Record<string, unknown>;
}

/** Middleware that participates in frame building. */
export interface FrameMiddleware {
  readonly name: string;
  /** Lower priority runs first. */
  readonly priority: number;
  process(context: FrameContext, next: () => void): void;
}

/**
 * Builds symbol frames using a middleware pipeline.
 *
 * Built-in middleware handles random fill and target placement.
 * Users can inject custom middleware for features like multiplier encoding
 * or triple-prevention.
 */
export class FrameBuilder {
  private _middlewares: FrameMiddleware[] = [];
  private _sorted = false;

  constructor(private _randomProvider: RandomSymbolProvider) {
    // Add built-in middleware
    this.use(new RandomFillMiddleware(_randomProvider));
    this.use(new TargetPlacementMiddleware());
  }

  /** Add a middleware to the pipeline. */
  use(middleware: FrameMiddleware): this {
    this._middlewares.push(middleware);
    this._sorted = false;
    return this;
  }

  /** Remove a middleware by name. */
  remove(name: string): this {
    this._middlewares = this._middlewares.filter((m) => m.name !== name);
    return this;
  }

  /** Build a frame for a single reel. */
  build(
    reelIndex: number,
    visibleRows: number,
    bufferAbove: number,
    bufferBelow: number,
    targetSymbols?: string[],
    isSpinning: boolean = false,
  ): string[] {
    if (!this._sorted) {
      this._middlewares.sort((a, b) => a.priority - b.priority);
      this._sorted = true;
    }

    const totalSlots = bufferAbove + visibleRows + bufferBelow;
    const context: FrameContext = {
      reelIndex,
      visibleRows,
      bufferAbove,
      bufferBelow,
      symbols: new Array<string>(totalSlots).fill(''),
      targetSymbols,
      isSpinning,
      metadata: {},
    };

    // Run middleware chain
    let index = 0;
    const next = (): void => {
      if (index < this._middlewares.length) {
        const mw = this._middlewares[index++];
        mw.process(context, next);
      }
    };
    next();

    return context.symbols;
  }

  /** Build frames for all reels. */
  buildAll(
    reelCount: number,
    visibleRows: number,
    bufferAbove: number,
    bufferBelow: number,
    targetSymbols?: string[][],
    isSpinning: boolean = false,
  ): string[][] {
    return Array.from({ length: reelCount }, (_, reelIndex) =>
      this.build(
        reelIndex,
        visibleRows,
        bufferAbove,
        bufferBelow,
        targetSymbols?.[reelIndex],
        isSpinning,
      ),
    );
  }

  get randomProvider(): RandomSymbolProvider {
    return this._randomProvider;
  }

  get middleware(): ReadonlyArray<FrameMiddleware> {
    return this._middlewares;
  }
}

/** Fills empty symbol slots with random symbols. OCCUPIED cells are kept verbatim. */
class RandomFillMiddleware implements FrameMiddleware {
  readonly name = 'random-fill';
  readonly priority = 0;

  constructor(private _provider: RandomSymbolProvider) {}

  process(context: FrameContext, next: () => void): void {
    for (let i = 0; i < context.symbols.length; i++) {
      if (!context.symbols[i]) {
        const isBuffer =
          i < context.bufferAbove ||
          i >= context.bufferAbove + context.visibleRows;
        context.symbols[i] = this._provider.next(isBuffer);
      }
    }
    next();
  }
}

/** Places target symbols (from setResult) into the visible area. */
class TargetPlacementMiddleware implements FrameMiddleware {
  readonly name = 'target-placement';
  readonly priority = 10;

  process(context: FrameContext, next: () => void): void {
    if (context.targetSymbols) {
      for (let row = 0; row < context.targetSymbols.length; row++) {
        const idx = context.bufferAbove + row;
        if (idx < context.symbols.length) {
          context.symbols[idx] = context.targetSymbols[row];
        }
      }
    }
    next();
  }
}
