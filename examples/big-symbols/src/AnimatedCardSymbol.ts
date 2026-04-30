import { Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSymbol } from 'pixi-reels';

/**
 * A card-shaped symbol whose **win animation only animates the glyph**, not
 * the card. Used by the big-symbols demo to make the character pop without
 * the surrounding rectangle bouncing — the body of the card stays still so
 * 1x1 and 2x2 cards both read as "the same card, character lit up".
 *
 * Scales cleanly to any cell size (good for big-symbol blocks) because
 * `resize(width, height)` reflows the rectangle and reflows the glyph
 * font-size. Anchors at top-left like SpriteSymbol; the glyph centers on
 * the card's local center.
 */
export interface AnimatedCardSymbolOptions {
  color: number;
  label: string;
  textColor?: number;
  /** Whether this card should pulse a "BIG" pip in the corner. Default false. */
  big?: boolean;
}

export class AnimatedCardSymbol extends ReelSymbol {
  private _color: number;
  private _label: string;
  private _textColor: number;
  private _big: boolean;
  private _bg: Graphics;
  private _glyph: Text;
  private _bigPip: Text | null = null;

  constructor(opts: AnimatedCardSymbolOptions) {
    super();
    this._color = opts.color;
    this._label = opts.label;
    this._textColor = opts.textColor ?? 0xffffff;
    this._big = !!opts.big;

    this._bg = new Graphics();
    this._glyph = new Text({
      text: this._label,
      style: {
        fontFamily:
          '"Roboto Condensed","Arial Narrow","Helvetica Neue Condensed",system-ui,sans-serif',
        fontSize: 48,
        fontWeight: '900',
        fill: this._textColor,
        align: 'center',
      },
    });
    this._glyph.anchor.set(0.5);

    this.view.addChild(this._bg);
    this.view.addChild(this._glyph);

    if (this._big) {
      this._bigPip = new Text({
        text: 'BIG',
        style: {
          fontFamily: '"Roboto Condensed","Arial Narrow",system-ui,sans-serif',
          fontSize: 14,
          fontWeight: '700',
          fill: 0xffffff,
          letterSpacing: 1,
        },
      });
      this._bigPip.anchor.set(0, 0);
      this.view.addChild(this._bigPip);
    }
  }

  protected onActivate(_symbolId: string): void {
    this._glyph.scale.set(1, 1);
    this._glyph.rotation = 0;
    this._glyph.alpha = 1;
    this._glyph.style.fill = this._textColor;
  }

  protected onDeactivate(): void {
    // No-op — visual identity is fixed at construction.
  }

  async playWin(): Promise<void> {
    return new Promise((resolve) => {
      const original = this._textColor;
      // A 2x2 big symbol gets `playWin` called 4x — once per covered cell
      // by `WinPresenter`. Kill any in-flight tween so the new one starts
      // clean instead of overlapping into a visual stutter.
      gsap.killTweensOf(this._glyph);
      gsap.killTweensOf(this._glyph.scale);
      const tl = gsap.timeline({
        onComplete: () => {
          this._glyph.scale.set(1, 1);
          this._glyph.rotation = 0;
          this._glyph.style.fill = original;
          resolve();
        },
      });
      tl.to(this._glyph.scale, { x: 1.45, y: 1.45, duration: 0.18, ease: 'back.out(2)' }, 0)
        .to(this._glyph, { rotation: -0.12, duration: 0.09, ease: 'sine.inOut' }, 0)
        .to(this._glyph, { rotation: 0.12, duration: 0.18, ease: 'sine.inOut' }, 0.09)
        .to(this._glyph, { rotation: 0, duration: 0.09, ease: 'sine.inOut' }, 0.27)
        .to(this._glyph.scale, { x: 1, y: 1, duration: 0.18, ease: 'power2.out' }, 0.32);

      // Glyph fill flashes warm gold mid-pulse (set, not tween — Text.style.fill
      // is not a tweenable target on every Pixi version).
      gsap.delayedCall(0.06, () => (this._glyph.style.fill = 0xffe168));
      gsap.delayedCall(0.42, () => (this._glyph.style.fill = original));
    });
  }

  stopAnimation(): void {
    gsap.killTweensOf(this._glyph);
    gsap.killTweensOf(this._glyph.scale);
    this._glyph.scale.set(1, 1);
    this._glyph.rotation = 0;
    this._glyph.alpha = 1;
    this._glyph.style.fill = this._textColor;
  }

  resize(width: number, height: number): void {
    this._bg.clear();
    // Card body with subtle inner highlight.
    this._bg.roundRect(0, 0, width, height, Math.min(width, height) * 0.06).fill({ color: this._color });
    this._bg.roundRect(2, 2, width - 4, height - 4, Math.min(width, height) * 0.05)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.18 });

    // Glyph — fits inside ~60% of the smallest dimension, scales linearly
    // with cell size so a 2x2 BIG card reads as the same card, just larger.
    this._glyph.x = width / 2;
    this._glyph.y = height / 2;
    const labelLen = Math.max(1, this._label.length);
    const fitH = height * 0.52;
    const fitW = (width * 0.78) / (labelLen * 0.5);
    this._glyph.style.fontSize = Math.max(10, Math.floor(Math.min(fitH, fitW)));

    if (this._bigPip) {
      this._bigPip.x = Math.floor(width * 0.06);
      this._bigPip.y = Math.floor(height * 0.04);
      this._bigPip.style.fontSize = Math.max(10, Math.floor(height * 0.06));
    }
  }
}

export const CARD_DECK: ReadonlyArray<{ id: string; color: number; label: string }> = [
  { id: '9', color: 0xc44569, label: '9' },
  { id: '10', color: 0xe17055, label: '10' },
  { id: 'J', color: 0xfdcb6e, label: 'J' },
  { id: 'Q', color: 0x55efc4, label: 'Q' },
  { id: 'K', color: 0x74b9ff, label: 'K' },
  { id: 'A', color: 0xa29bfe, label: 'A' },
];

export const REGULAR_WILD = { id: 'wild', color: 0xfff3a0, label: 'W', textColor: 0x6b5400 };
export const BIG_WILD = { id: 'bigWild', color: 0xfff3a0, label: 'W', textColor: 0x6b5400, big: true };
