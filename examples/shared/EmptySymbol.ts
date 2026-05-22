import { ReelSymbol } from 'pixi-reels';

/**
 * No-op {@link ReelSymbol} subclass. Renders nothing, never animates.
 *
 * Injected into the recipe / Studio / shared-studio runtime as a placeholder
 * symbol class — useful when a recipe wants to register a symbol id that
 * occupies a slot in the grid without producing any visual output (cascade
 * "hole" cells, debug fillers, dry-run symbol-set wiring).
 */
export class EmptySymbol extends ReelSymbol {
  protected onActivate(_symbolId: string): void {}
  protected onDeactivate(): void {}
  async playWin(): Promise<void> {}
  stopAnimation(): void {}
  resize(_w: number, _h: number): void {}
}
