import { Sprite, type Texture } from 'pixi.js';
import type { gsap } from 'gsap';

import type { ReelCellInset, ReelCellQuad } from '../config/types.js';
import { ReelSymbol } from './ReelSymbol.js';
import { PerspectiveCell, textureCellInset } from './PerspectiveCell.js';

export interface SpriteSymbolOptions {
  /** Map of symbolId → Texture. */
  textures: Record<string, Texture>;
  /** Anchor point. Default: { x: 0.5, y: 0.5 }. */
  anchor?: { x: number; y: number };
}

/**
 * Symbol implementation using a simple PixiJS Sprite.
 * Swaps texture on activate. Win animation is a scale pulse via GSAP.
 *
 * On a curved reel it draws the same texture through a `PerspectiveMesh`
 * instead, so the cell is a real projected trapezoid rather than a rectangle
 * that has been scaled down. See {@link ReelSymbol.applyCellQuad}.
 */
export class SpriteSymbol extends ReelSymbol {
  private _sprite: Sprite;
  private _textures: Record<string, Texture>;
  private _winTween: gsap.core.Tween | null = null;
  private _perspective: PerspectiveCell;

  constructor(options: SpriteSymbolOptions) {
    super();
    this._textures = options.textures;
    const anchor = options.anchor ?? { x: 0, y: 0 };
    this._sprite = new Sprite();
    this._sprite.anchor.set(anchor.x, anchor.y);
    this.view.addChild(this._sprite);
    this._perspective = new PerspectiveCell(this.view, this._sprite);
  }

  protected onActivate(symbolId: string): void {
    const texture = this._textures[symbolId];
    if (texture) {
      this._sprite.texture = texture;
      // The pool hands this instance a new identity without re-projecting, so
      // the mesh has to be told about the swap or it keeps drawing the old one.
      this._perspective.syncTexture(texture);
    }
  }

  protected onDeactivate(): void {
    this._killWinTween();
    this._sprite.scale.set(1, 1);
    this._perspective.resetTransform();
  }

  override get cellInset(): ReelCellInset | null {
    return textureCellInset(this._sprite.texture);
  }

  override applyCellQuad(quad: ReelCellQuad | null): void {
    this._perspective.apply(quad, this._sprite.texture);
    // The mesh's own corners carry the whole projection, so the view must stay
    // at identity. Anything else would apply the curve twice.
    this.view.scale.set(1, 1);
    this.view.pivot.set(0, 0);
  }

  async playWin(): Promise<void> {
    this._killWinTween();
    // Pulse whichever object is actually on screen. The mesh is pivoted on the
    // quad's centre, so it swells in place the same way the sprite does.
    const target = this._perspective.isActive ? this._perspective.mesh : this._sprite;
    if (!target) return;
    return new Promise<void>((resolve) => {
      this._winTween = this.gsap.to(target.scale, {
        x: 1.15,
        y: 1.15,
        duration: 0.15,
        yoyo: true,
        repeat: 1,
        ease: 'power2.inOut',
        onComplete: resolve,
      });
    });
  }

  stopAnimation(): void {
    this._killWinTween();
    this._sprite.scale.set(1, 1);
    this._perspective.resetTransform();
  }

  resize(width: number, height: number): void {
    this._sprite.width = width;
    this._sprite.height = height;
  }

  protected override onDestroy(): void {
    this._killWinTween();
    this._perspective.destroy();
  }

  private _killWinTween(): void {
    if (this._winTween) {
      this._winTween.kill();
      this._winTween = null;
    }
  }
}
