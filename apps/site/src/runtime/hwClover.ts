import { Assets, BitmapText, Container, FillGradient, Graphics, Sprite, type Spritesheet, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSymbol, RoundedRectMaskStrategy, SpeedPresets, type MaskStrategy, type SpeedProfile } from 'pixi-reels';

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

/**
 * The spin feel for a clover cell. The engine's NORMAL preset lands with a
 * 56px, 600ms bounce - a fifth of a reel window, right for a tall reel and
 * far too much for an 85px cell, where the whole clover visibly overshoots.
 * A few pixels over a short beat reads as a settle instead.
 */
export const CLOVER_SPEED: SpeedProfile = {
  ...SpeedPresets.NORMAL,
  minimumSpinTime: 320,
  bounceDistance: 6,
  bounceDuration: 240,
};

/**
 * The three speeds a clover board offers, for `HoldAndWinBuilder.speeds()`:
 * the engine's NORMAL / TURBO / SUPER_TURBO, each with the cell-sized bounce
 * of {@link CLOVER_SPEED}. `board.setSpeed('turbo')` moves every cell at once.
 */
export const CLOVER_SPEEDS: Record<'normal' | 'turbo' | 'superTurbo', SpeedProfile> = {
  normal: CLOVER_SPEED,
  turbo: { ...SpeedPresets.TURBO, minimumSpinTime: 180, bounceDistance: 4, bounceDuration: 160 },
  superTurbo: { ...SpeedPresets.SUPER_TURBO, minimumSpinTime: 80, bounceDistance: 2, bounceDuration: 100 },
};

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
  /**
   * Loop the idle once the cell has landed, the way a held clover keeps
   * breathing until the feature clears it. Default true; pass false for
   * base-game ids that should sit still after a spin.
   */
  idleAfterLand?: boolean;
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
 * above the cell mask (`unmask: true`); while the reel moves everything is
 * clipped to the cell, which is fine for a blur frame streaking past but
 * would show a crisp clover as a rectangle during the stop approach. So the
 * blur frame stays on until the cell has actually landed: the crisp,
 * overflowing clover only ever appears once it is lifted above the mask.
 *
 * `playLanding()` is a short settle (the Hold & Win board calls it on lock
 * when built with `lockAnimation('landing')`); `playWin()` is the pulse the
 * board plays on lock by default, or on `board.playWin()`. Between and after
 * those, a landed clover loops `playIdle()` - the breathing a held coin does
 * until the feature clears it. A one-shot pauses the idle and resumes it;
 * `stopAnimation()`, `setDimmed(true)` and pooling stop it for good. This is
 * the same contract a Spine coin gets from its `idle` track for free.
 */
export class CloverSymbol extends ReelSymbol {
  private readonly _artSet: HwCloverArt;
  private readonly _font: string;
  private readonly _labelOffset: number;
  private readonly _badgeOffset: number;
  private readonly _idleAfterLand: boolean;
  /** Sprite, label and badge, centred on the cell. */
  private readonly _art: Container;
  private readonly _sprite: Sprite;
  private readonly _badge: Sprite;
  private _label: BitmapText | null = null;
  private _cellW = 0;
  private _cellH = 0;
  private _blurred = false;
  private _dimmed = false;
  private _tween: gsap.core.Timeline | gsap.core.Tween | null = null;
  private _idle: gsap.core.Timeline | null = null;

  constructor(options: CloverSymbolOptions) {
    super();
    this._artSet = options.art;
    this._font = options.font ?? 'CloverValue';
    this._labelOffset = options.labelOffset ?? 0.06;
    this._badgeOffset = options.badgeOffset ?? -0.12;
    this._idleAfterLand = options.idleAfterLand ?? true;
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
    this.setDimmed(false);
  }

  protected onDeactivate(): void {
    this._kill();
    this.stopIdle();
    this._blurred = false;
    this.setLabel(null);
    this.setBadge(null);
    this.setDimmed(false);
    this._sprite.scale.set(1);
    this._sprite.alpha = 1;
  }

  override onReelSpinStart(): void {
    this.stopIdle();
    this._setBlurred(true);
  }
  // Deliberately NOT crisp on onReelSpinEnd: the reel is still moving through
  // the stop approach then, clipped to the cell. The swap waits for the land,
  // which is also when the engine lifts an unmask symbol above the mask.
  override onReelLanded(): void {
    this._setBlurred(false);
    if (this._idleAfterLand && !this._isTile()) this.playIdle();
  }

  /**
   * Loop the held-coin idle: a slow breathe and sway on the art. Idempotent.
   * Started on land automatically (see `idleAfterLand`); call it yourself on
   * a coin the board placed without a spin (a seed from `enter()`).
   */
  playIdle(): void {
    if (this._idle || this._dimmed || this._cellW <= 0 || this._isTile()) return;
    const s = this.artScale;
    this._idle = gsap
      .timeline({ repeat: -1, yoyo: true, defaults: { ease: 'sine.inOut', duration: 1.1 } })
      .to(this._sprite.scale, { x: s * 1.035, y: s * 1.035 }, 0)
      .to(this._sprite, { rotation: 0.035 }, 0);
  }

  /** Stop the idle loop and settle the art. */
  stopIdle(): void {
    if (!this._idle) return;
    this._idle.kill();
    this._idle = null;
    this._sprite.scale.set(this.artScale);
    this._sprite.rotation = 0;
  }

  get isIdling(): boolean {
    return this._idle !== null;
  }

  /**
   * Grey the coin out - a value that has been collected. Stops the idle; the
   * label stays, dimmed with it. Cleared on the next activation.
   */
  setDimmed(dimmed: boolean): void {
    this._dimmed = dimmed;
    if (dimmed) this.stopIdle();
    const tint = dimmed ? 0x6c7080 : 0xffffff;
    this._sprite.tint = tint;
    this._sprite.alpha = dimmed ? 0.8 : 1;
    if (this._label) this._label.tint = tint;
  }

  get isDimmed(): boolean {
    return this._dimmed;
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
      if (this._dimmed) this._label.tint = 0x6c7080;
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

  /** A settle: a slight squash and recover, about 260 ms. Subtle on purpose - a framed cell reads any real overshoot as a jump. */
  override async playLanding(): Promise<void> {
    this._kill();
    const resume = this.isIdling;
    this.stopIdle();
    const s = this.artScale;
    await new Promise<void>((resolve) => {
      this._tween = gsap
        .timeline({ onComplete: resolve })
        .to(this._sprite.scale, { x: s * 1.03, y: s * 0.95, duration: 0.09, ease: 'power2.out' })
        .to(this._sprite.scale, { x: s * 0.99, y: s * 1.02, duration: 0.09, ease: 'power1.inOut' })
        .to(this._sprite.scale, { x: s, y: s, duration: 0.08, ease: 'power1.out' });
    });
    this._tween = null;
    if (resume || this._idleAfterLand) this.playIdle();
  }

  /** A two-beat pulse, about 500 ms. */
  override async playWin(): Promise<void> {
    this._kill();
    const resume = this.isIdling;
    this.stopIdle();
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
    if (resume) this.playIdle();
  }

  stopAnimation(): void {
    this._kill();
    this.stopIdle();
    this._sprite.scale.set(this.artScale);
  }

  resize(width: number, height: number): void {
    this._cellW = width;
    this._cellH = height;
    this._art.position.set(width / 2, height / 2);
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

  /** The blank cell and the sealed cell are tiles, not coins: they never idle. */
  private _isTile(): boolean {
    return this.symbolId === 'empty' || this.symbolId === 'sealed';
  }

  private _kill(): void {
    if (this._tween) {
      this._tween.kill();
      this._tween = null;
    }
  }


}

/** Corner radius of a clover cell: its frame outline and its mask share it. */
export const CLOVER_CELL_RADIUS = 8;

/**
 * Mask factory for `HoldAndWinBuilder.cellMask`: every cell clipped to a
 * rounded rect, so the tile's corners are cut exactly where the frame drawn
 * by {@link cloverGridBackground} rounds off.
 */
export const cloverCellMask = (): MaskStrategy => new RoundedRectMaskStrategy({ radius: CLOVER_CELL_RADIUS });

export interface CloverGridOptions {
  /** Board origin on the stage (the board container's position). */
  x: number;
  y: number;
  cols: number;
  rows: number;
  cell: { width: number; height: number };
  columnGap: number;
  rowGap: number;
  /** Panel margin around the grid. Default: the larger gap, so the frame hugs the cells. */
  margin?: number;
}

/**
 * The game's framing, as plain `Graphics`: a navy-to-blue gradient panel
 * under the board, and for EVERY cell a rounded frame that traces the cell's
 * own rectangle exactly - the outline sits just outside the cell bounds, so
 * the gaps between cells carry two outlines with the panel showing between
 * them. Pair it with {@link cloverCellMask} so the tiles' corners are cut on
 * the same radius. Add it to the stage BEFORE the board, build the board
 * with no chrome, and destroy it with `{ children: true }` in cleanup.
 */
export function cloverGridBackground(opts: CloverGridOptions): Container {
  const { x, y, cols, rows, cell, columnGap, rowGap } = opts;
  const margin = opts.margin ?? Math.max(columnGap, rowGap);
  const w = cols * cell.width + (cols - 1) * columnGap;
  const h = rows * cell.height + (rows - 1) * rowGap;
  const bg = new Container();

  const panel = new Graphics();
  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 0x061236 },
      { offset: 0.5, color: 0x102f7a },
      { offset: 1, color: 0x061236 },
    ],
  });
  panel
    .roundRect(x - margin, y - margin, w + margin * 2, h + margin * 2, CLOVER_CELL_RADIUS + margin)
    .fill(gradient)
    .stroke({ color: 0x4f8cff, width: 2, alpha: 0.9 });
  bg.addChild(panel);

  // One frame per cell, on the cell's exact bounds: a dark fill the tile sits
  // on, a soft glow just outside the edge, a crisp line right on it.
  const frames = new Graphics();
  const r = CLOVER_CELL_RADIUS;
  for (let c = 0; c < cols; c++) {
    for (let rw = 0; rw < rows; rw++) {
      const cx = x + c * (cell.width + columnGap);
      const cy = y + rw * (cell.height + rowGap);
      frames.roundRect(cx - 3, cy - 3, cell.width + 6, cell.height + 6, r + 3).stroke({ color: 0x5fa0ff, width: 4, alpha: 0.28 });
      frames.roundRect(cx, cy, cell.width, cell.height, r).fill({ color: 0x0b1a4a }).stroke({ color: 0x5fa0ff, width: 1.5, alpha: 0.95 });
    }
  }
  bg.addChild(frames);
  return bg;
}
