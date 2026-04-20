import { Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSymbol } from './ReelSymbol.js';

export interface SpriteSymbolOptions {
  /** Map of symbolId → Texture. */
  textures: Record<string, Texture>;
  /** Anchor point. Default: { x: 0.5, y: 0.5 }. */
  anchor?: { x: number; y: number };
}

/**
 * Symbol implementation using a simple PixiJS Sprite.
 * Swaps texture on activate. Win animation is a scale pulse via GSAP.
 */
export class SpriteSymbol extends ReelSymbol {
  private _sprite: Sprite;
  private _textures: Record<string, Texture>;
  private _winTween: gsap.core.Tween | null = null;

  constructor(options: SpriteSymbolOptions) {
    super();
    this._textures = options.textures;
    const anchor = options.anchor ?? { x: 0, y: 0 };
    this._sprite = new Sprite();
    this._sprite.anchor.set(anchor.x, anchor.y);
    this.view.addChild(this._sprite);
  }

  protected onActivate(symbolId: string): void {
    const texture = this._textures[symbolId];
    if (texture) {
      this._sprite.texture = texture;
    }
  }

  protected onDeactivate(): void {
    this._killWinTween();
    this._sprite.scale.set(1, 1);
  }

  async playWin(): Promise<void> {
    this._killWinTween();
    return new Promise<void>((resolve) => {
      this._winTween = gsap.to(this._sprite.scale, {
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
  }

  resize(width: number, height: number): void {
    this._sprite.width = width;
    this._sprite.height = height;
  }

  protected override onDestroy(): void {
    this._killWinTween();
  }

  private _killWinTween(): void {
    if (this._winTween) {
      this._winTween.kill();
      this._winTween = null;
    }
  }
}
