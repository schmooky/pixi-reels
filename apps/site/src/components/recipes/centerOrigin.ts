import type { Container } from 'pixi.js';

/**
 * The `view` container of a ReelSymbol is positioned at the TOP-LEFT of its
 * cell — scaling or tweening it directly shrinks toward (0,0), not the cell
 * center. These helpers bind a view's pivot+position so transforms happen
 * around the cell's visual center, then restore the original anchoring.
 *
 * Use in recipes whenever you scale/tween a `symbol.view`:
 *
 * ```ts
 * const restore = bindCenterPivot(sym.view, cellWidth, cellHeight);
 * await gsap.to(sym.view.scale, { x: 0, y: 0, duration: 0.3 });
 * restore();   // back to top-left origin for the reel layout
 * ```
 *
 * Internal renderables with a centered anchor (BlurSpriteSymbol's sprite,
 * BlockSymbol's inner, SpineReelSymbol's spine) don't need this — only the
 * outer `view` does.
 */
export function bindCenterPivot(
  view: Container,
  cellWidth: number,
  cellHeight: number,
): () => void {
  const origPivotX = view.pivot.x;
  const origPivotY = view.pivot.y;
  const origX = view.x;
  const origY = view.y;
  view.pivot.set(cellWidth / 2, cellHeight / 2);
  view.x = origX + (cellWidth / 2 - origPivotX);
  view.y = origY + (cellHeight / 2 - origPivotY);
  return () => {
    view.pivot.set(origPivotX, origPivotY);
    view.x = origX;
    view.y = origY;
  };
}
