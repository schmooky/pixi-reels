import { Container, FillGradient, Graphics, NineSliceSprite, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSymbol, type ReelCellInset } from 'pixi-reels';
import { playMotion, resetMotion, seconds, EASE, type MotionHandle, type MotionRig } from './motion.js';
import {
  FRAME_METRICS,
  FRAME_OF,
  FRAME_SCALE,
  GENERIC_HUES,
  genericIdOf,
  type FrameColor,
  type PillarPart,
  type PillarVariant,
} from './genericSymbols.js';
import { WildPillar } from './pillar.js';

/**
 * A symbol made of modular pieces and the studio motion: a tile that
 * stretches to its box, a sticker that never stretches, and for a block a
 * 9-slice frame in the symbol's colour in place of the tile, or for a tall
 * wild the 5-slice pillar. No sheet per state, no skeleton.
 *
 * The tile (or frame) sits in `move`, outside `body`: it falls and fades
 * with the symbol, but a wow pops the sticker, never the cell. Under the
 * body, all cut from the one sticker texture: the art, the art again in
 * additive blend (pulsed on a win), and a white band swept across the art's
 * own alpha (the shine).
 *
 * The reel lands it with `impact`; a win is `wowL` on a cell, `wowM` on a
 * block, `wowS` on a pillar, with the flash and the shine. Losers dim
 * through the spotlight.
 */
export interface StickerSymbolOptions {
  /** symbolId -> the sticker. The generic set keys the deck's ids and the usual names too. */
  textures: Record<string, Texture>;
  /** The 9-slice frames, for a block. Without them a block gets the tile. */
  frames?: Record<FrameColor, Texture>;
  /** The WILD pillar slices, for a wild taller than a cell. */
  pillars?: Record<PillarVariant, Record<PillarPart, Texture>>;
  /** The block this symbol fills, in cells. Default 1 x 1. */
  span?: { reels: number; cells: number };
  /** Draw the colour tile behind a 1 x 1 sticker. Default true. */
  tile?: boolean;
  /** How much of its panel the sticker fills, 0..1. Default 0.88. */
  fit?: number;
  /** Squash on landing. Default true. */
  land?: boolean;
}

const INK = 0x1c1b22;
const mix = (hue: number, k: number): number => {
  const ch = (shift: number) => Math.round(((hue >> shift) & 0xff) * k + ((INK >> shift) & 0xff) * (1 - k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export class StickerSymbol extends ReelSymbol {
  private readonly _o: Required<Pick<StickerSymbolOptions, 'textures' | 'span' | 'tile' | 'fit' | 'land'>> &
    Pick<StickerSymbolOptions, 'frames' | 'pillars'>;
  private readonly _move = new Container();
  private readonly _plate = new Graphics();
  private _frame: NineSliceSprite | null = null;
  private readonly _body = new Container();
  private readonly _art = new Sprite();
  private readonly _flash = new Sprite();
  private readonly _blick = new Container();
  private readonly _blickMask = new Sprite();
  private readonly _band = new Graphics();
  private _pillar: WildPillar | null = null;
  private _w = 0;
  private _h = 0;
  private _hue = 0x9ca3ad;
  private _motion: MotionHandle | null = null;
  private _fx: gsap.core.Timeline | null = null;

  constructor(options: StickerSymbolOptions) {
    super();
    this._o = {
      textures: options.textures,
      frames: options.frames,
      pillars: options.pillars,
      span: options.span ?? { reels: 1, cells: 1 },
      tile: options.tile ?? true,
      fit: options.fit ?? 0.88,
      land: options.land ?? true,
    };
    this._art.anchor.set(0.5);
    this._flash.anchor.set(0.5);
    this._flash.blendMode = 'add';
    this._flash.alpha = 0;
    this._blickMask.anchor.set(0.5);
    this._blick.addChild(this._blickMask, this._band);
    this._blick.mask = this._blickMask;
    this._band.alpha = 0;
    this._body.addChild(this._art, this._flash, this._blick);
    this._move.addChild(this._plate, this._body);
    this.view.addChild(this._move);
  }

  private get _rig(): MotionRig {
    return { move: this._move, body: this._body, cell: { width: this._w, height: this._h }, at: { x: this._w / 2, y: this._h / 2 } };
  }

  private get _isBlock(): boolean {
    return this._o.span.reels * this._o.span.cells > 1;
  }

  private get _isPillar(): boolean {
    return !!this._o.pillars && this._o.span.reels === 1 && this._o.span.cells > 1 && genericIdOf(this.symbolId ?? '') === 'W';
  }

  /** Where the sticker sits in its cell, so a curved reel projects the art, not the cell. */
  override get cellInset(): ReelCellInset | null {
    if (this._w <= 0 || this._h <= 0 || !this._art.visible) return null;
    const tex = this._art.texture;
    const scale = this._art.scale.x;
    if (!(scale > 0)) return null;
    const left = this._w / 2 + this._art.x - (tex.width * scale) / 2;
    const top = this._h / 2 + this._art.y - (tex.height * scale) / 2;
    return {
      left: left / this._w,
      top: top / this._h,
      right: (left + tex.width * scale) / this._w,
      bottom: (top + tex.height * scale) / this._h,
    };
  }

  protected onActivate(symbolId: string): void {
    const tex = this._o.textures[symbolId];
    if (!tex) {
      throw new Error(`StickerSymbol: no texture for "${symbolId}". Known: ${Object.keys(this._o.textures).join(', ')}.`);
    }
    this._art.texture = tex;
    this._flash.texture = tex;
    this._blickMask.texture = tex;
    const generic = genericIdOf(symbolId);
    this._hue = generic ? GENERIC_HUES[generic] : 0x9ca3ad;
    this._setFrame(generic ? FRAME_OF[generic] : 'teal');
    this._layout();
  }

  protected onDeactivate(): void {
    this.stopAnimation();
  }

  override onReelLanded(): void {
    if (!this._o.land || this._w <= 0) return;
    this._motion?.kill();
    this._motion = playMotion(this._rig, 'impact');
  }

  /** The win: a wow sized to the piece, a flash right after it starts, one shine across the art. */
  async playWin(): Promise<void> {
    this._motion?.kill();
    this._fx?.kill();
    const size = this._isPillar ? 'wowS' : this._isBlock ? 'wowM' : 'wowL';
    this._paintPlate(true);
    if (!this._isPillar) {
      const w = this._w;
      const bandW = w * 0.4;
      this._band.alpha = 1;
      this._fx = gsap
        .timeline()
        .fromTo(this._flash, { alpha: 0 }, { alpha: 0.75, duration: seconds(8), ease: 'none' }, seconds(1))
        .to(this._flash, { alpha: 0, duration: seconds(8), ease: 'none' })
        .fromTo(this._band, { x: -w / 2 - bandW * 1.1 }, { x: -w / 2 + bandW * 2.7, duration: 0.5, ease: EASE.glide }, seconds(size === 'wowL' ? 8 : 5))
        .set(this._band, { alpha: 0 });
    }
    this._motion = playMotion(this._rig, size);
    await this._motion.finished;
    this._paintPlate(false);
  }

  /**
   * A winner being consumed by a cascade: the playbook's `exit`, a short
   * lift and then a shrink into nothing. An abort snaps to the end, as the
   * engine asks, and the view is left hidden for the refill to reveal.
   */
  async playDestroy(opts?: { delay?: number; signal?: AbortSignal }): Promise<void> {
    await this._exit(opts);
  }

  /** A reveal's out beat is the same exit. */
  override async playOut(opts?: { delay?: number; signal?: AbortSignal }): Promise<void> {
    await this._exit(opts);
  }

  private async _exit(opts?: { delay?: number; signal?: AbortSignal }): Promise<void> {
    this._fx?.kill();
    this._fx = null;
    this._flash.alpha = 0;
    this._band.alpha = 0;
    this._paintPlate(false);
    if (opts?.delay) await new Promise((r) => setTimeout(r, opts.delay));
    if (opts?.signal?.aborted || this._w <= 0) {
      this._move.alpha = 0;
      return;
    }
    this._motion?.kill();
    this._motion = playMotion(this._rig, 'exit');
    const onAbort = () => this._motion?.kill();
    opts?.signal?.addEventListener('abort', onAbort, { once: true });
    await this._motion.finished;
    opts?.signal?.removeEventListener('abort', onAbort);
    this._move.alpha = 0;
  }

  stopAnimation(): void {
    this._motion?.kill();
    this._motion = null;
    this._fx?.kill();
    this._fx = null;
    this._flash.alpha = 0;
    this._band.alpha = 0;
    this._paintPlate(false);
    if (this._w > 0) resetMotion(this._rig);
  }

  resize(width: number, height: number): void {
    this._w = width;
    this._h = height;
    this._layout();
    resetMotion(this._rig);
  }

  protected override onDestroy(): void {
    this._motion?.kill();
    this._fx?.kill();
  }

  /** The frame for this symbol's colour, built once per colour and kept behind the body. */
  private _setFrame(color: FrameColor): void {
    const tex = this._o.frames?.[color];
    if (!tex || !this._isBlock) {
      if (this._frame) { this._frame.destroy(); this._frame = null; }
      return;
    }
    const m = FRAME_METRICS[color];
    const [t, r, b, l] = m.slice;
    if (this._frame) this._frame.destroy();
    this._frame = new NineSliceSprite({ texture: tex, topHeight: t, rightWidth: r, bottomHeight: b, leftWidth: l });
    this._move.addChildAt(this._frame, 1);
  }

  private _paintPlate(hero: boolean): void {
    if (this._isPillar || this._isBlock || !this._o.tile || this._w <= 0) {
      this._plate.clear();
      return;
    }
    // The tile: the cell box inset a hair, corners proportional to the cell,
    // the symbol's hue dimmed into ink; brighter while the symbol is the hero.
    // `move` sits at the cell's centre, so the box starts half a cell up and left.
    const r = Math.round(Math.min(this._w, this._h) * 0.12);
    this._plate.clear().roundRect(-this._w / 2 + 2, -this._h / 2 + 2, this._w - 4, this._h - 4, r).fill(mix(this._hue, hero ? 0.42 : 0.26));
  }

  private _layout(): void {
    const tex = this._art.texture;
    if (this._w <= 0 || this._h <= 0 || tex === Texture.EMPTY || tex.width <= 0) return;
    const w = this._w;
    const h = this._h;
    this._paintPlate(false);

    if (this._isPillar) {
      if (!this._pillar) {
        this._pillar = new WildPillar(this._o.pillars!);
        this._body.addChild(this._pillar);
      }
      this._pillar.visible = true;
      this._pillar.layout(w, h);
      this._art.visible = this._flash.visible = this._blick.visible = false;
      if (this._frame) this._frame.visible = false;
      return;
    }
    if (this._pillar) this._pillar.visible = false;
    this._art.visible = this._flash.visible = this._blick.visible = true;

    // The panel the sticker fits: the box, or for a block the box inside the
    // frame's rim. The rim is the same at every block size: the frame's
    // source spans FRAME_SCALE of two cells. A 1 x 1 would leave a small
    // panel, so there the sticker sits further out over the rim.
    let px = 0, py = 0, pw = w, ph = h;
    if (this._frame) {
      this._frame.visible = true;
      const generic = genericIdOf(this.symbolId ?? '');
      const m = FRAME_METRICS[generic ? FRAME_OF[generic] : 'teal'];
      // A nine-slice keeps its cuts in texture pixels, so the rim's size on
      // screen is the sprite's scale: the frame is scaled to the cell and
      // sized in its own units to fill the box.
      const cellW = w / this._o.span.reels;
      const k = (cellW * FRAME_SCALE) / m.width;
      this._frame.scale.set(k);
      this._frame.width = w / k;
      this._frame.height = h / k;
      this._frame.position.set(-w / 2, -h / 2);
      const [t, r, b, l] = m.slice.map((v) => v * k) as [number, number, number, number];
      const o = this._isBlock ? 0.7 : 0.38;
      px = l * o; py = t * o; pw = w - (l + r) * o; ph = h - (t + b) * o;
    }
    const scale = Math.min(pw / tex.width, ph / tex.height) * this._o.fit;
    const cx = px + pw / 2 - w / 2;
    const cy = py + ph / 2 - h / 2;
    for (const s of [this._art, this._flash, this._blickMask]) {
      s.scale.set(scale);
      s.position.set(cx, cy);
    }
    // The shine band: 40 % of the box wide, taller than it, leaning 18
    // degrees, white in the middle and clear at both edges. It parks off the
    // left side until a win sweeps it across.
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
