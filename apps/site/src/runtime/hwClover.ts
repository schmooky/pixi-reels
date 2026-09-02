import { Assets, BitmapText, Sprite, type Spritesheet, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSymbol } from 'pixi-reels';

/**
 * The Playson "Four Charged Clovers" art set behind the rectangular Hold & Win
 * recipes: a fruit base game with clover coins, packed from the game's own
 * sprites (used with permission). Everything is a plain TexturePacker sheet
 * served from `apps/site/public/hw-clover/`.
 *
 * Symbol keys (crisp + matching motion-blur frame): the fruits
 * `cherry orange lemon plum grapes watermelon bar bell seven`, the clovers
 * `gold` (money, carries a value), `collect`, `multi`, `mystery`, `super`
 * (the crystal one), the `capsule` (a sealed jackpot), `empty` (the blank
 * cell) and `sealed` (the purple tile of a row that has not opened yet).
 *
 * Titles: `mini`, `minor`, `major` (large), plus `grand`, `super` and the
 * small `*_small` set from the jackpot panel. Plaques: `mini minor major
 * grand super`.
 *
 * Three bitmap fonts register as a side effect: `CloverValue` (gold coin
 * amounts: `0-9 . , + x`), `CloverJackpot` (`0-9 . ,`) and `CloverMult`
 * (pink multiplier `0-9 . , x`).
 */
export interface HwCloverArt {
  symbols: Record<string, Texture>;
  blur: Record<string, Texture>;
  titles: Record<string, Texture>;
  plaques: Record<string, Texture>;
  fx: Record<string, Texture>;
  sheets: { symbols: Spritesheet; plaques: Spritesheet };
}

/** The cell the art was authored for; keep this aspect and it fits edge to edge. */
export const CLOVER_CELL = { width: 202, height: 170 } as const;

export const CLOVER_FRUITS = [
  'cherry', 'orange', 'lemon', 'plum', 'grapes', 'watermelon', 'bar', 'bell', 'seven',
] as const;
export const CLOVER_FEATURES = ['collect', 'multi', 'mystery', 'super'] as const;

export async function loadHwClover(base = '/hw-clover/'): Promise<HwCloverArt> {
  await Assets.load([base + 'value.fnt', base + 'jackpot.fnt', base + 'mult.fnt']);
  const [symbolsSheet, plaquesSheet] = (await Promise.all([
    Assets.load(base + 'symbols.json'),
    Assets.load(base + 'plaques.json'),
  ])) as [Spritesheet, Spritesheet];

  const symbols: Record<string, Texture> = {};
  const blur: Record<string, Texture> = {};
  const titles: Record<string, Texture> = {};
  const plaques: Record<string, Texture> = {};
  const fx: Record<string, Texture> = {};
  const sort = (key: string, tex: Texture): void => {
    const slash = key.indexOf('/');
    const group = key.slice(0, slash);
    const name = key.slice(slash + 1);
    if (group === 'normal') symbols[name] = tex;
    else if (group === 'blur') blur[name] = tex;
    else if (group === 'title') titles[name] = tex;
    else if (group === 'plaque') plaques[name] = tex;
    else if (group === 'fx') fx[name] = tex;
  };
  for (const [key, tex] of Object.entries(symbolsSheet.textures)) sort(key, tex);
  for (const [key, tex] of Object.entries(plaquesSheet.textures)) sort(key, tex);
  return { symbols, blur, titles, plaques, fx, sheets: { symbols: symbolsSheet, plaques: plaquesSheet } };
}

export interface CloverSymbolOptions {
  /** The loaded art set. */
  art: HwCloverArt;
  /** Bitmap font face for `setLabel`. Default `CloverValue`. */
  font?: string;
  /**
   * Where the label sits, as a fraction of the cell height from the centre.
   * The gold clover's face is a little below centre. Default 0.06.
   */
  labelOffset?: number;
  /** Where the badge sits, same units. Default -0.12, clear of a label below it. */
  badgeOffset?: number;
}

/**
 * One rectangular-cell symbol from the clover set: a sprite that swaps to its
 * motion-blur frame while the reel spins, plus an optional value label and an
 * optional badge (a jackpot title over the capsule).
 *
 * Every frame is scaled by the SAME factor - the cell divided by the authored
 * 202x170 - so a cherry stays smaller than a clover the way the artist drew
 * it, instead of each texture being inflated to the cell on its own.
 *
 * `playLanding()` is a short settle (the Hold & Win board calls it on lock
 * when built with `lockAnimation('landing')`); `playWin()` is the pulse the
 * board plays on lock by default, or on `board.playWin()`.
 */
export class CloverSymbol extends ReelSymbol {
  private readonly _art: HwCloverArt;
  private readonly _font: string;
  private readonly _labelOffset: number;
  private readonly _badgeOffset: number;
  private readonly _sprite: Sprite;
  private readonly _badge: Sprite;
  private _label: BitmapText | null = null;
  private _cellW = 0;
  private _cellH = 0;
  private _blurred = false;
  private _tween: gsap.core.Timeline | gsap.core.Tween | null = null;

  constructor(options: CloverSymbolOptions) {
    super();
    this._art = options.art;
    this._font = options.font ?? 'CloverValue';
    this._labelOffset = options.labelOffset ?? 0.06;
    this._badgeOffset = options.badgeOffset ?? -0.12;
    this._sprite = new Sprite();
    this._sprite.anchor.set(0.5);
    this._badge = new Sprite();
    this._badge.anchor.set(0.5);
    this._badge.visible = false;
    this.view.addChild(this._sprite, this._badge);
  }

  /** Uniform authored-space scale for the current cell. */
  get artScale(): number {
    return Math.min(this._cellW / CLOVER_CELL.width, this._cellH / CLOVER_CELL.height);
  }

  protected onActivate(_symbolId: string): void {
    this._blurred = false;
    this._applyTexture();
    this.setLabel(null);
    this.setBadge(null);
  }

  protected onDeactivate(): void {
    this._kill();
    this._blurred = false;
    this.setLabel(null);
    this.setBadge(null);
    this._sprite.scale.set(1);
    this._sprite.alpha = 1;
  }

  override onReelSpinStart(): void {
    this._setBlurred(true);
  }
  override onReelSpinEnd(): void {
    this._setBlurred(false);
  }
  override onReelLanded(): void {
    this._setBlurred(false);
  }

  /** Paint (or clear, with `null`) the value text over the symbol face. */
  setLabel(text: string | null): void {
    if (text === null) {
      if (this._label) {
        this._label.destroy();
        this._label = null;
      }
      return;
    }
    if (!this._label) {
      this._label = new BitmapText({ text, style: { fontFamily: this._font, fontSize: 60, letterSpacing: -2 } });
      this._label.anchor.set(0.5);
      this.view.addChild(this._label);
    } else {
      this._label.text = text;
    }
    this._layout();
  }

  /** Show (or hide, with `null`) a title texture over the symbol - the capsule's reveal. */
  setBadge(texture: Texture | null): void {
    if (!texture) {
      this._badge.visible = false;
      return;
    }
    this._badge.texture = texture;
    this._badge.visible = true;
    this._layout();
  }

  get label(): BitmapText | null {
    return this._label;
  }
  get badge(): Sprite {
    return this._badge;
  }
  get sprite(): Sprite {
    return this._sprite;
  }

  /** A settle: a quick squash and recover, about 260 ms. */
  override async playLanding(): Promise<void> {
    this._kill();
    const s = this.artScale;
    await new Promise<void>((resolve) => {
      this._tween = gsap
        .timeline({ onComplete: resolve })
        .to(this._sprite.scale, { x: s * 1.06, y: s * 0.9, duration: 0.09, ease: 'power2.out' })
        .to(this._sprite.scale, { x: s * 0.98, y: s * 1.04, duration: 0.09, ease: 'power1.inOut' })
        .to(this._sprite.scale, { x: s, y: s, duration: 0.08, ease: 'power1.out' });
    });
    this._tween = null;
  }

  /** A two-beat pulse, about 500 ms. */
  override async playWin(): Promise<void> {
    this._kill();
    const s = this.artScale;
    await new Promise<void>((resolve) => {
      this._tween = gsap.to(this._sprite.scale, {
        x: s * 1.14,
        y: s * 1.14,
        duration: 0.13,
        yoyo: true,
        repeat: 3,
        ease: 'power2.inOut',
        onComplete: resolve,
      });
    });
    this._tween = null;
    this._sprite.scale.set(s);
  }

  stopAnimation(): void {
    this._kill();
    this._sprite.scale.set(this.artScale);
  }

  resize(width: number, height: number): void {
    this._cellW = width;
    this._cellH = height;
    this._sprite.position.set(width / 2, height / 2);
    this._sprite.scale.set(this.artScale);
    this._layout();
  }

  protected override onDestroy(): void {
    this._kill();
  }

  private _setBlurred(blurred: boolean): void {
    if (this._blurred === blurred) return;
    this._blurred = blurred;
    this._applyTexture();
  }

  private _applyTexture(): void {
    const id = this.symbolId;
    if (!id) return;
    const tex = (this._blurred ? this._art.blur[id] : undefined) ?? this._art.symbols[id];
    if (tex) this._sprite.texture = tex;
  }

  private _layout(): void {
    if (this._cellW <= 0 || this._cellH <= 0) return;
    const s = this.artScale;
    if (this._label) {
      this._label.scale.set(s);
      this._label.position.set(this._cellW / 2, this._cellH / 2 + this._cellH * this._labelOffset);
      const maxW = this._cellW * 0.8;
      if (this._label.width > maxW) this._label.scale.set((s * maxW) / this._label.width);
    }
    if (this._badge.visible) {
      this._badge.scale.set(s);
      this._badge.position.set(this._cellW / 2, this._cellH / 2 + this._cellH * this._badgeOffset);
      const maxW = this._cellW * 0.9;
      if (this._badge.width > maxW) this._badge.scale.set((s * maxW) / this._badge.width);
    }
  }

  private _kill(): void {
    if (this._tween) {
      this._tween.kill();
      this._tween = null;
    }
  }
}
