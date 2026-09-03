import { Assets, BitmapText, Container, Sprite, type Spritesheet, type Texture } from 'pixi.js';
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
 * The clovers are drawn BIGGER than the cell. At rest the engine lifts them
 * above the cell mask (`unmask: true`), but while the reel moves everything
 * is clipped to the cell, so an oversized clover scrolling into place would
 * show as a rectangle until the lift. So while its reel is in motion the art
 * is held at a contained scale that fits the cell, and on landing it grows
 * back to authored size in a short tween - the same beat the game's landing
 * animation plays, and no mask edge is ever seen.
 *
 * `playLanding()` is a short settle (the Hold & Win board calls it on lock
 * when built with `lockAnimation('landing')`); `playWin()` is the pulse the
 * board plays on lock by default, or on `board.playWin()`.
 */
export class CloverSymbol extends ReelSymbol {
  private readonly _artSet: HwCloverArt;
  private readonly _font: string;
  private readonly _labelOffset: number;
  private readonly _badgeOffset: number;
  /** Sprite, label and badge, centred on the cell; scaled as one while the reel moves. */
  private readonly _art: Container;
  private readonly _sprite: Sprite;
  private readonly _badge: Sprite;
  private _label: BitmapText | null = null;
  private _cellW = 0;
  private _cellH = 0;
  private _blurred = false;
  private _inMotion = false;
  private _tween: gsap.core.Timeline | gsap.core.Tween | null = null;
  private _grow: gsap.core.Tween | null = null;

  constructor(options: CloverSymbolOptions) {
    super();
    this._artSet = options.art;
    this._font = options.font ?? 'CloverValue';
    this._labelOffset = options.labelOffset ?? 0.06;
    this._badgeOffset = options.badgeOffset ?? -0.12;
    this._art = new Container();
    this._sprite = new Sprite();
    this._sprite.anchor.set(0.5);
    this._badge = new Sprite();
    this._badge.anchor.set(0.5);
    this._badge.visible = false;
    this._art.addChild(this._sprite, this._badge);
    this.view.addChild(this._art);
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
    // A symbol installed into a moving reel gets onReelSpinStart right after
    // this, which contains it; one placed at rest stays at authored size.
    this._killGrow();
    this._art.scale.set(this._inMotion ? this._containedScale() : 1);
  }

  protected onDeactivate(): void {
    this._kill();
    this._killGrow();
    this._blurred = false;
    this._inMotion = false;
    this.setLabel(null);
    this.setBadge(null);
    this._sprite.scale.set(1);
    this._sprite.alpha = 1;
    this._art.scale.set(1);
  }

  override onReelSpinStart(): void {
    this._inMotion = true;
    this._killGrow();
    this._art.scale.set(this._containedScale());
    this._setBlurred(true);
  }
  override onReelSpinEnd(): void {
    this._setBlurred(false);
  }
  override onReelLanded(): void {
    this._setBlurred(false);
    if (!this._inMotion) return;
    this._inMotion = false;
    // The lift above the mask happened just before this hook; grow out of
    // the cell now, so the overflow arrives as a land beat.
    this._killGrow();
    this._grow = gsap.to(this._art.scale, {
      x: 1,
      y: 1,
      duration: 0.16,
      ease: 'power2.out',
      onComplete: () => { this._grow = null; },
    });
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
      this._art.addChild(this._label);
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
    this._art.position.set(width / 2, height / 2);
    this._sprite.scale.set(this.artScale);
    if (this._inMotion && !this._grow) this._art.scale.set(this._containedScale());
    this._layout();
  }

  protected override onDestroy(): void {
    this._kill();
    this._killGrow();
  }

  /**
   * The factor that shrinks this symbol's authored art to fit inside the
   * cell, 1 when it already fits. Measured on the crisp frame and the blur
   * frame both, so the swap mid-spin never pokes past the mask either.
   */
  private _containedScale(): number {
    if (this._cellW <= 0 || this._cellH <= 0) return 1;
    const id = this.symbolId;
    let w = 0;
    let h = 0;
    for (const tex of [this._artSet.symbols[id], this._artSet.blur[id]]) {
      if (!tex) continue;
      w = Math.max(w, tex.orig.width);
      h = Math.max(h, tex.orig.height);
    }
    if (w <= 0 || h <= 0) return 1;
    const s = this.artScale;
    return Math.min(1, this._cellW / (w * s), this._cellH / (h * s));
  }

  private _setBlurred(blurred: boolean): void {
    if (this._blurred === blurred) return;
    this._blurred = blurred;
    this._applyTexture();
  }

  private _applyTexture(): void {
    const id = this.symbolId;
    if (!id) return;
    const tex = (this._blurred ? this._artSet.blur[id] : undefined) ?? this._artSet.symbols[id];
    if (tex) this._sprite.texture = tex;
  }

  private _layout(): void {
    if (this._cellW <= 0 || this._cellH <= 0) return;
    const s = this.artScale;
    if (this._label) {
      this._label.scale.set(s);
      this._label.position.set(0, this._cellH * this._labelOffset);
      const maxW = this._cellW * 0.8;
      if (this._label.width > maxW) this._label.scale.set((s * maxW) / this._label.width);
    }
    if (this._badge.visible) {
      this._badge.scale.set(s);
      this._badge.position.set(0, this._cellH * this._badgeOffset);
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

  private _killGrow(): void {
    if (this._grow) {
      this._grow.kill();
      this._grow = null;
    }
  }
}
