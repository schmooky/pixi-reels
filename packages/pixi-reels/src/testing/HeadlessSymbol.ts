import { ReelSymbol } from '../symbols/ReelSymbol.js';

/**
 * A `ReelSymbol` implementation that does no rendering at all.
 *
 * It creates a `Container` for its `view` (so the Reel's child-tree logic works)
 * but never paints anything. This lets tests build a real `ReelSet` without a
 * renderer, textures, or assets.
 *
 * ```ts
 * builder.symbols((r) => {
 *   for (const id of ['cherry', 'lemon', 'seven']) {
 *     r.register(id, HeadlessSymbol, {});
 *   }
 * });
 * ```
 */
export class HeadlessSymbol extends ReelSymbol {
  private _width = 0;
  private _height = 0;

  protected onActivate(_symbolId: string): void {
    // no-op
  }

  protected onDeactivate(): void {
    // no-op
  }

  async playWin(): Promise<void> {
    // resolve immediately
  }

  stopAnimation(): void {
    // no-op
  }

  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }
}
