import { Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSymbol } from 'pixi-reels';

/**
 * **Debug / prototyping symbol — NOT for production.**
 *
 * `CoinSymbol` is a circle-drawn-with-`PIXI.Graphics` `ReelSymbol`. Sibling of
 * `CardSymbol`. card is a flat rectangle, coin is a flat disc. Together they
 * cover the two visual primitives that recipes need to demonstrate slot
 * mechanics without shipping any texture assets.
 *
 * Coins exist as their own primitive because Hold & Win — and most of the
 * collect/multiplier/jackpot/mystery family of mechanics — read as round
 * tokens, not rectangular cards. Rendering them as cards in recipes muddles
 * the reader's mental model.
 *
 * Same pattern as CardSymbol: register with the builder, hand it
 * `{ rimColor, label }` (plus a few optional knobs), the rest is handled.
 * Presets at the bottom of this file cover the common variants (jackpot
 * tiers, feature coins, mystery, bonus trigger, money value, multiplier).
 *
 * ```ts
 * import { CoinSymbol, COIN_TIER, coinValue, coinMultiplier } from '../../shared/CoinSymbol';
 *
 * builder.symbols((registry) => {
 *   registry.register('grand', CoinSymbol, COIN_TIER.GRAND);
 *   registry.register('val_500', CoinSymbol, coinValue(500));
 *   registry.register('mult_5x', CoinSymbol, coinMultiplier(5));
 * });
 * ```
 */
export interface CoinSymbolOptions {
  /** Outer rim color — the coin's primary identity (red GRAND, blue COLLECT, ...). */
  rimColor: number;
  /** Inner disc color. Defaults to a darker shade of `rimColor` so the rim reads as a ring. */
  faceColor?: number;
  /** Centered label text. Omit for an unlabeled coin (e.g. mystery). */
  label?: string;
  /** Label fill color. Defaults to white. */
  textColor?: number;
}

const FONT_FAMILY =
  '"Roboto Condensed", "Arial Narrow", "Helvetica Neue Condensed", "Liberation Sans Narrow", system-ui, sans-serif';

export class CoinSymbol extends ReelSymbol {
  private _rim: number;
  private _face: number;
  private _label: string;
  private _textColor: number;
  private _gfx: Graphics;
  private _text: Text | null = null;

  constructor(opts: CoinSymbolOptions) {
    super();
    this._rim = opts.rimColor;
    this._face = opts.faceColor ?? darken(opts.rimColor, 0.55);
    this._label = opts.label ?? '';
    this._textColor = opts.textColor ?? 0xffffff;
    // Graphics is drawn at its LOCAL (0, 0) — see resize(). Positioning the
    // Graphics at (width/2, height/2) puts its origin at the cell center,
    // which is what `scale` tweens pivot around. If we drew at (cx, cy)
    // instead, scale would pivot at the top-left corner and the coin would
    // walk during the win pulse.
    this._gfx = new Graphics();
    this.view.addChild(this._gfx);
    if (this._label) {
      this._text = new Text({
        text: this._label,
        style: {
          fontFamily: FONT_FAMILY,
          fontSize: 16,
          fontWeight: '800',
          fill: this._textColor,
          align: 'center',
        },
      });
      this._text.anchor.set(0.5);
      this.view.addChild(this._text);
    }
  }

  protected onActivate(_symbolId: string): void {
    // Visual identity is set at construction; nothing to do per spin.
  }

  protected onDeactivate(): void {
    // Leave gfx/text in their last state until the next activate().
  }

  async playWin(): Promise<void> {
    return new Promise((resolve) => {
      gsap.killTweensOf(this._gfx.scale);
      if (this._text) {
        gsap.killTweensOf(this._text);
        gsap.killTweensOf(this._text.scale);
      }
      const tl = gsap.timeline({
        onComplete: () => {
          this._gfx.scale.set(1, 1);
          if (this._text) {
            this._text.scale.set(1, 1);
            this._text.style.fill = this._textColor;
          }
          resolve();
        },
      });
      // Whole coin pulses. text overshoots a touch more so the label "pops"
      // out of the face.
      tl.to(this._gfx.scale, { x: 1.18, y: 1.18, duration: 0.16, ease: 'back.out(2)' }, 0)
        .to(this._gfx.scale, { x: 1, y: 1, duration: 0.22, ease: 'power2.out' }, 0.2);
      if (this._text) {
        tl.to(this._text.scale, { x: 1.3, y: 1.3, duration: 0.16, ease: 'back.out(2)' }, 0)
          .to(this._text.scale, { x: 1, y: 1, duration: 0.22, ease: 'power2.out' }, 0.2);
        const originalFill = this._textColor;
        gsap.delayedCall(0.05, () => {
          if (this._text) this._text.style.fill = 0xffe168;
        });
        gsap.delayedCall(0.4, () => {
          if (this._text) this._text.style.fill = originalFill;
        });
      }
    });
  }

  stopAnimation(): void {
    gsap.killTweensOf(this._gfx.scale);
    this._gfx.scale.set(1, 1);
    if (this._text) {
      gsap.killTweensOf(this._text);
      gsap.killTweensOf(this._text.scale);
      this._text.scale.set(1, 1);
      this._text.style.fill = this._textColor;
    }
  }

  resize(width: number, height: number): void {
    drawCoin(this._gfx, width, height, { rimColor: this._rim, faceColor: this._face });
    if (this._text) {
      this._text.x = width / 2;
      this._text.y = height / 2;
      // Fit the label inside the inner disc. font height ~70% of the inner
      // radius; width capacity is the chord at center height (~85% of the
      // diameter is usable without the descenders kissing the rim). Roboto
      // Condensed glyph aspect ~0.45 used to estimate per-char width.
      const innerR = Math.min(width, height) * 0.4;
      const labelLen = Math.max(1, this._label.length);
      const fitH = innerR * 0.7;
      const fitW = (innerR * 1.7) / (labelLen * 0.45);
      this._text.style.fontSize = Math.max(7, Math.floor(Math.min(fitH, fitW)));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Shared draw helper. Lets overlay code (held-coin badges that live outside
// any reel) render a circle matching the in-reel CoinSymbol without
// instantiating a full ReelSymbol.

export interface CoinShapeOptions {
  rimColor: number;
  /** Inner disc color. Defaults to a darker shade of `rimColor`. */
  faceColor?: number;
}

export function drawCoin(g: Graphics, width: number, height: number, opts: CoinShapeOptions): void {
  g.clear();
  const outerR = Math.min(width, height) * 0.48;
  const innerR = outerR * 0.82;
  const face = opts.faceColor ?? darken(opts.rimColor, 0.55);
  // Filled rim, then a smaller filled inner disc on top. cheaper than a
  // ring-stroke + fill because Graphics' stroke is wider than 1px-aliased.
  g.circle(0, 0, outerR).fill({ color: opts.rimColor });
  g.circle(0, 0, innerR).fill({ color: face });
  // Hairline between rim and face so the boundary holds at small sizes.
  g.circle(0, 0, innerR).stroke({ color: 0x000000, width: 1, alpha: 0.22 });
  g.position.set(width / 2, height / 2);
}

function darken(color: number, factor: number): number {
  const f = Math.max(0, Math.min(1, factor));
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return ((Math.round(r * f) << 16) | (Math.round(g * f) << 8) | Math.round(b * f)) >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Presets. Cover the common Hold & Win / coin-mechanic vocabulary.

/** Jackpot tier coins. GRAND/MAJOR/MINOR/MINI is the near-universal H&W ladder. */
export const COIN_TIER = {
  GRAND: { rimColor: 0xc0392b, label: 'GRAND', textColor: 0xffffff },
  MAJOR: { rimColor: 0x8e44ad, label: 'MAJOR', textColor: 0xffffff },
  MINOR: { rimColor: 0x2980b9, label: 'MINOR', textColor: 0xffffff },
  MINI:  { rimColor: 0x27ae60, label: 'MINI',  textColor: 0xffffff },
} as const satisfies Record<string, CoinSymbolOptions>;

/**
 * Feature coins. modifiers that act on the rest of the board.
 *
 * BOOST raises every visible coin value, COLLECT sweeps them into one cell,
 * MULTI multiplies the board total. Game-layer behavior is up to the recipe.
 * the visuals are what live here.
 */
export const COIN_FEATURE = {
  BOOST:   { rimColor: 0xe74c3c, label: 'BOOST',   textColor: 0xffffff },
  COLLECT: { rimColor: 0x3498db, label: 'COLLECT', textColor: 0xffffff },
  MULTI:   { rimColor: 0xf39c12, label: 'MULTI',   textColor: 0xffffff },
} as const satisfies Record<string, CoinSymbolOptions>;

/** Mystery coin. purple rim, blank face. reveals to a value/feature on land. */
export const COIN_MYSTERY: CoinSymbolOptions = {
  rimColor: 0x8e44ad,
  // No label — that's the point.
};

/** Hold & Win trigger / bonus coin. gold rim, "BONUS" stamp. */
export const COIN_TRIGGER: CoinSymbolOptions = {
  rimColor: 0xb8860b,
  faceColor: 0xf5d066,
  label: 'BONUS',
  textColor: 0x3a2900,
};

/** Money-value coin. e.g. `coinValue(500)` renders a "500.00" gold token. */
export function coinValue(amount: number): CoinSymbolOptions {
  return {
    rimColor: 0xb8860b,
    faceColor: 0xf5d066,
    label: amount.toFixed(2),
    textColor: 0x3a2900,
  };
}

/** Multiplier coin. e.g. `coinMultiplier(5)` renders an "x5" gold token. */
export function coinMultiplier(multiplier: number): CoinSymbolOptions {
  return {
    rimColor: 0xb8860b,
    faceColor: 0xf5d066,
    label: `x${multiplier}`,
    textColor: 0x3a2900,
  };
}
