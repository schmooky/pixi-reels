import { Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSymbol } from 'pixi-reels';

/**
 * **Debug / prototyping symbol — NOT for production.**
 *
 * `CardSymbol` is a flat-rectangle-plus-centered-text `ReelSymbol` drawn
 * entirely with `PIXI.Graphics`. It exists to give recipes, demos, and
 * mechanic tests a no-asset, no-loader, infinitely-resizable visual that
 * always renders crisply at any cell size — perfect for showing how the
 * engine treats cell space across MultiWays reshapes, big-symbol blocks,
 * and pyramid layouts.
 *
 * In a real game, ship one of:
 *
 *   - `SpriteSymbol` — pre-rendered art at one resolution. Cheapest.
 *   - `AnimatedSpriteSymbol` — frame-by-frame win/idle animation.
 *   - `SpineSymbol` (via `pixi-reels/spine`) — vector skeletal animation
 *     that scales without quality loss. Best for MultiWays where cells
 *     resize across spins.
 *   - Or a custom `ReelSymbol` subclass for game-specific visuals.
 *
 * The reason this is in `examples/shared/` and not the library proper:
 * it's debug scaffolding, not library API. Copy it into your codebase if
 * you want to keep using it; remove it from your final bundle.
 *
 * ```ts
 * import { CardSymbol, CARD_DECK } from '../../shared/CardSymbol';
 *
 * builder.symbols((registry) => {
 *   for (const card of CARD_DECK) {
 *     registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
 *   }
 * });
 * ```
 */
export interface CardSymbolOptions {
  /** Hex fill color (e.g. `0xc0392b`). */
  color: number;
  /** Centered label text (e.g. `'A'`, `'10'`, `'WILD'`). */
  label: string;
  /** Text fill color. Defaults to white. */
  textColor?: number;
}

export class CardSymbol extends ReelSymbol {
  private _color: number;
  private _label: string;
  private _textColor: number;
  private _gfx: Graphics;
  private _text: Text;

  constructor(opts: CardSymbolOptions) {
    super();
    this._color = opts.color;
    this._label = opts.label;
    this._textColor = opts.textColor ?? 0xffffff;
    this._gfx = new Graphics();
    this._text = new Text({
      text: this._label,
      style: {
        // Roboto Condensed if installed (the site loads it via @fontsource);
        // falls through to a system condensed sans-serif on plain pages.
        fontFamily:
          '"Roboto Condensed", "Arial Narrow", "Helvetica Neue Condensed", "Liberation Sans Narrow", system-ui, sans-serif',
        fontSize: 32,
        fontWeight: '700',
        fill: this._textColor,
        align: 'center',
      },
    });
    this._text.anchor.set(0.5);
    this.view.addChild(this._gfx);
    this.view.addChild(this._text);
  }

  protected onActivate(_symbolId: string): void {
    // No-op — this symbol's visual identity is set at construction.
  }

  protected onDeactivate(): void {
    // No-op — leave _gfx/_text in their last state until next activate.
  }

  async playWin(): Promise<void> {
    return new Promise((resolve) => {
      // Animate only the glyph — the card body stays put. Useful for big
      // symbols (the rectangle is the cell footprint) and any setting
      // where movement of the cell border is distracting (cascade refills,
      // MultiWays adjust). The text is anchored at (0.5, 0.5) so its
      // scale tween pivots about the centre.
      gsap.killTweensOf(this._text);
      gsap.killTweensOf(this._text.scale);
      const originalFill = this._textColor;
      const tl = gsap.timeline({
        onComplete: () => {
          this._text.scale.set(1, 1);
          this._text.rotation = 0;
          this._text.style.fill = originalFill;
          resolve();
        },
      });
      tl.to(this._text.scale, { x: 1.4, y: 1.4, duration: 0.18, ease: 'back.out(2)' }, 0)
        .to(this._text, { rotation: -0.12, duration: 0.09, ease: 'sine.inOut' }, 0)
        .to(this._text, { rotation: 0.12, duration: 0.18, ease: 'sine.inOut' }, 0.09)
        .to(this._text, { rotation: 0, duration: 0.09, ease: 'sine.inOut' }, 0.27)
        .to(this._text.scale, { x: 1, y: 1, duration: 0.18, ease: 'power2.out' }, 0.32);
      // Glyph fill flashes warm gold mid-pulse — `Text.style.fill` isn't
      // a tweenable target on every Pixi version, so we set it discretely.
      gsap.delayedCall(0.06, () => (this._text.style.fill = 0xffe168));
      gsap.delayedCall(0.42, () => (this._text.style.fill = originalFill));
    });
  }

  stopAnimation(): void {
    gsap.killTweensOf(this._text);
    gsap.killTweensOf(this._text.scale);
    this._text.scale.set(1, 1);
    this._text.rotation = 0;
    this._text.style.fill = this._textColor;
    this._gfx.alpha = 1;
  }

  resize(width: number, height: number): void {
    this._gfx.clear();
    this._gfx.rect(0, 0, width, height).fill({ color: this._color });
    // Inner darker stroke so adjacent cells are visually separated even
    // when they share the same color.
    this._gfx.rect(1, 1, width - 2, height - 2).stroke({ color: 0x000000, width: 2, alpha: 0.25 });
    this._text.x = width / 2;
    this._text.y = height / 2;
    // Font size constrained by both height (~38%) and label width (so
    // multi-char labels like '10' or 'WILD' don't overflow narrow cells).
    // Smaller than half-cell to leave breathing room — looks less crowded.
    const labelLen = Math.max(1, this._label.length);
    const fitH = height * 0.38;
    // Roboto Condensed glyphs are narrower (~0.45 avg ratio) than serif fonts.
    const fitW = (width * 0.7) / (labelLen * 0.45);
    this._text.style.fontSize = Math.max(7, Math.floor(Math.min(fitH, fitW)));
  }
}

/**
 * Standard high-card deck for prototyping. Each card has its own color
 * so a full grid is visually unambiguous at a glance.
 */
export const CARD_DECK: ReadonlyArray<{ id: string; color: number; label: string }> = [
  { id: '7',  color: 0xc0392b, label: '7' },   // crimson
  { id: '8',  color: 0xe67e22, label: '8' },   // orange
  { id: '9',  color: 0xf1c40f, label: '9' },   // amber
  { id: '10', color: 0x27ae60, label: '10' },  // green
  { id: 'J',  color: 0x16a085, label: 'J' },   // teal
  { id: 'Q',  color: 0x2980b9, label: 'Q' },   // blue
  { id: 'K',  color: 0x8e44ad, label: 'K' },   // purple
  { id: 'A',  color: 0x2c3e50, label: 'A' },   // navy
];

/** A pale-yellow `WILD` card for sticky/expanding-wild prototypes. */
export const WILD_CARD = {
  id: 'wild',
  color: 0xfff3a0,
  label: 'WILD',
  textColor: 0x6b5400,
} as const;
