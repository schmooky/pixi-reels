import { Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSymbol } from 'pixi-reels';

/**
 * Sprite symbol that swaps to a pre-rendered motion-blur texture during the
 * SPIN phase. Canonical slot-production pattern: while the reel is spinning,
 * show the blurred variant; on landing, show the crisp base texture.
 *
 * Callers wire blur toggling to reel events:
 *
 * ```ts
 * reel.events.on('phase:enter', (name) => {
 *   if (name === 'spin') setBlurOnAllCells(reel, true);
 * });
 * reel.events.on('phase:enter', (name) => {
 *   if (name === 'stop') setBlurOnAllCells(reel, false);
 * });
 * ```
 *
 * This class lives in `examples/shared/` because blur-on-spin is a
 * canonical pattern, not library API. Copy it into your game code
 * unchanged — it is 60 lines.
 */
export interface BlurSpriteSymbolOptions {
  /** Map of symbolId -> base Texture. */
  textures: Record<string, Texture>;
  /** Optional map of symbolId -> motion-blur Texture. Missing entries fall through to base. */
  blurTextures?: Record<string, Texture>;
  /** Anchor on the underlying Sprite. Default: { x: 0.5, y: 0.5 } — centered in the cell. */
  anchor?: { x: number; y: number };
  /** Letterbox-fit to the cell instead of stretching (maintains aspect). Default: true. */
  fit?: boolean;
}

export class BlurSpriteSymbol extends ReelSymbol {
  private _sprite: Sprite;
  private _textures: Record<string, Texture>;
  private _blurTextures: Record<string, Texture>;
  private _fit: boolean;
  private _cellW = 0;
  private _cellH = 0;
  private _blurred = false;
  private _winTween: gsap.core.Tween | null = null;

  constructor(options: BlurSpriteSymbolOptions) {
    super();
    this._textures = options.textures;
    this._blurTextures = options.blurTextures ?? {};
    this._fit = options.fit ?? true;
    const anchor = options.anchor ?? { x: 0.5, y: 0.5 };
    this._sprite = new Sprite();
    this._sprite.anchor.set(anchor.x, anchor.y);
    this.view.addChild(this._sprite);
  }

  protected onActivate(_symbolId: string): void {
    this._applyTexture();
  }

  protected onDeactivate(): void {
    this._killWinTween();
    this._blurred = false;
    this._sprite.scale.set(1, 1);
  }

  /** Swap between base and blur textures. No-op if already in that state. */
  setBlurred(blurred: boolean): void {
    if (this._blurred === blurred) return;
    this._blurred = blurred;
    this._applyTexture();
  }

  get blurred(): boolean {
    return this._blurred;
  }

  async playWin(): Promise<void> {
    this._killWinTween();
    return new Promise<void>((resolve) => {
      this._winTween = gsap.to(this._sprite.scale, {
        x: this._sprite.scale.x * 1.15,
        y: this._sprite.scale.y * 1.15,
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
    this._rescale();
  }

  resize(width: number, height: number): void {
    this._cellW = width;
    this._cellH = height;
    this._sprite.x = width / 2;
    this._sprite.y = height / 2;
    this._rescale();
  }

  protected override onDestroy(): void {
    this._killWinTween();
  }

  private _applyTexture(): void {
    const id = this.symbolId;
    if (!id) return;
    const tex =
      (this._blurred ? this._blurTextures[id] : undefined) ?? this._textures[id];
    if (tex) {
      this._sprite.texture = tex;
      this._rescale();
    }
  }

  private _rescale(): void {
    if (this._cellW <= 0 || this._cellH <= 0) return;
    if (!this._fit) {
      this._sprite.width = this._cellW;
      this._sprite.height = this._cellH;
      return;
    }
    const tw = this._sprite.texture.width;
    const th = this._sprite.texture.height;
    if (tw <= 0 || th <= 0) return;
    const scale = Math.min(this._cellW / tw, this._cellH / th);
    this._sprite.scale.set(scale);
  }

  private _killWinTween(): void {
    if (this._winTween) {
      this._winTween.kill();
      this._winTween = null;
    }
  }
}
