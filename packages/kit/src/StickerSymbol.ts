import { Container, FillGradient, Graphics, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSymbol, type ReelCellInset } from 'pixi-reels';
import { playMotion, resetMotion, seconds, EASE, type MotionHandle, type MotionRig } from './motion.js';

/**
 * A symbol made of one flat sticker and the studio motion. No sprite sheet
 * per state, no skeleton: the same texture is the art, the flash and the
 * mask of the shine, and the rig moves and squashes it.
 *
 * Three layers under the body, all cut from the one texture:
 * - `art`, the sticker itself;
 * - `flash`, the sticker again in additive blend, pulsed on a win;
 * - `blick`, a white band swept across the sticker's own alpha on a win.
 *
 * The reel lands it with `impact` (the squash the playbook's `land` ends
 * with; the reel already brought it to its cell), and a win is `wowL` with
 * the flash and the blick on top. Losers dim through the spotlight.
 */
export interface StickerSymbolOptions {
  /** symbolId -> the sticker. Square cells drawn at 384 px fit best. */
  textures: Record<string, Texture>;
  /** How much of the cell the sticker fills, 0..1. Default 1: the art carries its own margin. */
  fit?: number;
  /** Squash on landing. Default true. */
  land?: boolean;
}

export class StickerSymbol extends ReelSymbol {
  private readonly _textures: Record<string, Texture>;
  private readonly _fit: number;
  private readonly _land: boolean;
  private readonly _move = new Container();
  private readonly _body = new Container();
  private readonly _art = new Sprite();
  private readonly _flash = new Sprite();
  private readonly _blick = new Container();
  private readonly _blickMask = new Sprite();
  private readonly _band = new Graphics();
  private _cellW = 0;
  private _cellH = 0;
  private _motion: MotionHandle | null = null;
  private _fx: gsap.core.Timeline | null = null;

  constructor(options: StickerSymbolOptions) {
    super();
    this._textures = options.textures;
    this._fit = options.fit ?? 1;
    this._land = options.land ?? true;
    this._art.anchor.set(0.5);
    this._flash.anchor.set(0.5);
    this._flash.blendMode = 'add';
    this._flash.alpha = 0;
    this._blickMask.anchor.set(0.5);
    this._blick.addChild(this._blickMask, this._band);
    this._blick.mask = this._blickMask;
    this._band.alpha = 0;
    this._body.addChild(this._art, this._flash, this._blick);
    this._move.addChild(this._body);
    this.view.addChild(this._move);
  }

  private get _rig(): MotionRig {
    return {
      move: this._move,
      body: this._body,
      cell: { width: this._cellW, height: this._cellH },
      at: { x: this._cellW / 2, y: this._cellH / 2 },
    };
  }

  /** Where the sticker sits in its cell, so a curved reel projects the art, not the cell. */
  override get cellInset(): ReelCellInset | null {
    if (this._cellW <= 0 || this._cellH <= 0) return null;
    const tex = this._art.texture;
    const scale = this._art.scale.x;
    if (!(scale > 0)) return null;
    const left = (this._cellW - tex.width * scale) / 2;
    const top = (this._cellH - tex.height * scale) / 2;
    return {
      left: left / this._cellW,
      top: top / this._cellH,
      right: (left + tex.width * scale) / this._cellW,
      bottom: (top + tex.height * scale) / this._cellH,
    };
  }

  protected onActivate(symbolId: string): void {
    const tex = this._textures[symbolId];
    if (!tex) {
      throw new Error(`StickerSymbol: no texture for "${symbolId}". Known: ${Object.keys(this._textures).join(', ')}.`);
    }
    this._art.texture = tex;
    this._flash.texture = tex;
    this._blickMask.texture = tex;
    this._layout();
  }

  protected onDeactivate(): void {
    this.stopAnimation();
  }

  override onReelLanded(): void {
    if (!this._land || this._cellW <= 0) return;
    this._motion?.kill();
    this._motion = playMotion(this._rig, 'impact');
  }

  /** The win: wow L, a flash right after it starts, one blick across the art. */
  async playWin(): Promise<void> {
    this._motion?.kill();
    this._fx?.kill();
    const w = this._cellW;
    this._band.alpha = 1;
    const bandW = w * 0.4;
    this._fx = gsap
      .timeline()
      .fromTo(this._flash, { alpha: 0 }, { alpha: 0.75, duration: seconds(8), ease: 'none' }, seconds(1))
      .to(this._flash, { alpha: 0, duration: seconds(8), ease: 'none' })
      .fromTo(this._band, { x: -w / 2 - bandW * 1.1 }, { x: -w / 2 + bandW * 2.7, duration: 0.5, ease: EASE.glide }, seconds('quick'))
      .set(this._band, { alpha: 0 });
    this._motion = playMotion(this._rig, 'wowL');
    await this._motion.finished;
  }

  stopAnimation(): void {
    this._motion?.kill();
    this._motion = null;
    this._fx?.kill();
    this._fx = null;
    this._flash.alpha = 0;
    this._band.alpha = 0;
    if (this._cellW > 0) resetMotion(this._rig);
  }

  resize(width: number, height: number): void {
    this._cellW = width;
    this._cellH = height;
    this._layout();
    resetMotion(this._rig);
  }

  protected override onDestroy(): void {
    this._motion?.kill();
    this._fx?.kill();
  }

  private _layout(): void {
    const tex = this._art.texture;
    if (this._cellW <= 0 || this._cellH <= 0 || tex.width <= 0 || tex.height <= 0) return;
    const scale = Math.min(this._cellW / tex.width, this._cellH / tex.height) * this._fit;
    this._art.scale.set(scale);
    this._flash.scale.set(scale);
    this._blickMask.scale.set(scale);
    // The band: 40 % of the cell wide, taller than the cell, leaning 18
    // degrees, white in the middle and clear at both edges. It parks off the
    // left side until a win sweeps it across.
    const w = this._cellW;
    const h = this._cellH;
    const bandW = w * 0.4;
    const gradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      colorStops: [
        { offset: 0, color: 'rgba(255,255,255,0)' },
        { offset: 0.5, color: 'rgba(255,255,255,0.85)' },
        { offset: 1, color: 'rgba(255,255,255,0)' },
      ],
    });
    this._band.clear().rect(0, -h * 0.6, bandW, h * 1.2).fill(gradient);
    this._band.skew.x = -18 * (Math.PI / 180);
    this._band.x = -w / 2 - bandW * 1.1;
  }
}
