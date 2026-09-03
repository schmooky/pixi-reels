import { Assets, BitmapText, Container, Sprite, type Texture } from 'pixi.js';
import { SpineReelSymbol, type SpineReelSymbolOptions, type SpineSymbolSource } from 'pixi-reels/spine';
import { CLOVER_CELL, loadHwClover, type HwCloverArt } from './hwClover.ts';

/**
 * The clover Hold & Win symbols as Spine 4.2 skeletons, authored by
 * `tools/clover-spines/build.py` over the same packed sheets the sprite kit
 * draws from. One skeleton per id - `gold collect multi mystery super capsule
 * empty sealed` - each with `idle` (the held-coin breathe), `landing` (the
 * settle on lock), `win` (pulses, glow flash, glint sweep) and `blur` (the
 * motion-blur frame while the reel moves), so the reel engine drives every
 * beat through `SpineReelSymbol` with no per-symbol code.
 *
 * Served from `apps/site/public/hw-clover/` beside the sheets.
 */
export const CLOVER_SPINE_IDS = ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty', 'sealed'] as const;
export const CLOVER_ATLAS_ALIAS = 'hw-clover-atlas';
const skeletonAlias = (id: string): string => `hw-clover-spine-${id}`;

/** `spineMap` for every clover id, all on the one atlas. */
export const CLOVER_SPINE_MAP: Record<string, SpineSymbolSource> = Object.fromEntries(
  CLOVER_SPINE_IDS.map((id) => [id, { skeleton: skeletonAlias(id), atlas: CLOVER_ATLAS_ALIAS }]),
);

let loading: Promise<HwCloverArt> | null = null;

/**
 * Load the clover atlas and skeletons (idempotent), plus the sprite kit's
 * sheets and fonts, so titles, plaques and the value fonts stay available.
 */
export function loadHwCloverSpines(base = '/hw-clover/'): Promise<HwCloverArt> {
  if (!loading) {
    loading = (async () => {
      const art = await loadHwClover(base);
      const assets: Record<string, string> = { [CLOVER_ATLAS_ALIAS]: `${base}clovers.atlas` };
      for (const id of CLOVER_SPINE_IDS) assets[skeletonAlias(id)] = `${base}spine/${id}.json`;
      for (const [alias, src] of Object.entries(assets)) {
        if (!Assets.cache.has(alias)) Assets.add({ alias, src });
      }
      await Assets.load(Object.keys(assets));
      return art;
    })();
  }
  return loading;
}

export interface CloverSpineSymbolOptions extends Omit<SpineReelSymbolOptions, 'spineMap'> {
  /** Defaults to {@link CLOVER_SPINE_MAP}. */
  spineMap?: Record<string, SpineSymbolSource>;
  /** Bitmap font face for `setLabel`. Default `CloverValue`. */
  font?: string;
  /** Label position as a fraction of the cell height from the centre. Default 0.06. */
  labelOffset?: number;
  /** Badge position, same units. Default -0.12. */
  badgeOffset?: number;
}

/**
 * A clover on a Spine skeleton, with the same game-facing surface as the
 * sprite `CloverSymbol`: `setLabel`, `setBadge`, `setDimmed`, `playIdle` /
 * `stopIdle`. The idle IS the skeleton's idle track, so a landed clover
 * breathes until the cell is cleared and every one-shot (`landing`, `win`)
 * returns to it by itself; `blur` plays while the reel moves
 * (`autoPlayBlur` is on by default here).
 *
 * The art is authored at the 202x170 cell, so pass `scale: cell.width / 202`.
 */
export class CloverSpineSymbol extends SpineReelSymbol {
  private readonly _font: string;
  private readonly _labelOffset: number;
  private readonly _badgeOffset: number;
  private readonly _overlay: Container;
  private readonly _badge: Sprite;
  private _label: BitmapText | null = null;
  private _cellW = 0;
  private _cellH = 0;
  private _dimmed = false;
  private _idling = true;

  constructor(options: CloverSpineSymbolOptions) {
    super({ autoPlayBlur: true, ...options, spineMap: options.spineMap ?? CLOVER_SPINE_MAP });
    this._font = options.font ?? 'CloverValue';
    this._labelOffset = options.labelOffset ?? 0.06;
    this._badgeOffset = options.badgeOffset ?? -0.12;
    this._overlay = new Container();
    this._badge = new Sprite();
    this._badge.anchor.set(0.5);
    this._badge.visible = false;
    this._overlay.addChild(this._badge);
    this.view.addChild(this._overlay);
  }

  /** Uniform authored-space scale for the current cell - what the label and badge scale by. */
  get artScale(): number {
    return Math.min(this._cellW / CLOVER_CELL.width, this._cellH / CLOVER_CELL.height);
  }

  protected override onActivate(symbolId: string): void {
    super.onActivate(symbolId);
    // the overlay must stay above the skeleton the base class just attached
    this.view.addChild(this._overlay);
    this.setLabel(null);
    this.setBadge(null);
    this.setDimmed(false);
    this._idling = true;
  }

  protected override onDeactivate(): void {
    super.onDeactivate();
    this.setLabel(null);
    this.setBadge(null);
    this.setDimmed(false);
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
      this._overlay.addChild(this._label);
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

  /** The idle track, looping. Idempotent; the default state after any one-shot. */
  playIdle(): void {
    const spine = this.spine;
    if (!spine || this._dimmed) return;
    this._idling = true;
    const idle = this._idleName();
    const current = spine.state.getCurrent(0);
    if (current && current.animation?.name === idle && current.loop) {
      current.timeScale = 1;
      return;
    }
    spine.state.setAnimation(0, idle, true);
  }

  /** Freeze the idle on its first frame. */
  stopIdle(): void {
    const spine = this.spine;
    if (!spine) return;
    this._idling = false;
    const entry = spine.state.setAnimation(0, this._idleName(), true);
    entry.trackTime = 0;
    entry.timeScale = 0;
  }

  get isIdling(): boolean {
    return this._idling;
  }

  /** Grey the coin out - a collected value. Stops the idle; cleared on the next activation. */
  setDimmed(dimmed: boolean): void {
    this._dimmed = dimmed;
    const spine = this.spine;
    if (spine) {
      const c = dimmed ? 0.42 : 1;
      spine.skeleton.color.set(c, c + 0.02, c + 0.08, dimmed ? 0.85 : 1);
    }
    if (this._label) this._label.tint = dimmed ? 0x6c7080 : 0xffffff;
    if (dimmed) this.stopIdle();
  }

  get isDimmed(): boolean {
    return this._dimmed;
  }

  override resize(width: number, height: number): void {
    super.resize(width, height);
    this._cellW = width;
    this._cellH = height;
    this._overlay.position.set(width / 2, height / 2);
    this._layout();
  }

  private _idleName(): string {
    return 'idle';
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
}
