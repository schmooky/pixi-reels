import { ReelSymbol } from './ReelSymbol.js';

/**
 * A {@link ReelSymbol} that renders nothing and never animates.
 *
 * Register it for an id that needs to occupy a grid slot without producing
 * any visual — the blank rest state of a {@link HoldAndWinBoard} cell, a
 * cascade "hole", a dry-run symbol-set placeholder. The {@link HoldAndWinBuilder}
 * auto-registers one under its `emptyId` so callers never have to.
 */
export class EmptySymbol extends ReelSymbol {
  protected onActivate(_symbolId: string): void {}
  protected onDeactivate(): void {}
  async playWin(): Promise<void> {}
  stopAnimation(): void {}
  resize(_width: number, _height: number): void {}
}
