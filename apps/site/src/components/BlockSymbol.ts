import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { ReelSymbol } from 'pixi-reels';

/**
 * A zero-asset symbol: a rounded rectangle with a small label.
 *
 * Per-symbol color and glyph come from options. Perfect for demos where we
 * care about *outcomes* and *mechanics*, not art.
 *
 * Internals: the visual (graphics + label) lives in an `_inner` container
 * positioned at (w/2, h/2) with geometry drawn symmetrically around the
 * origin. Scaling `_inner` therefore scales around the visual center — not
 * the top-left of the outer `view`. Reel layout continues to position via
 * `view.y` / `view.x`, unchanged.
 */
export interface BlockSymbolOptions {
  colors: Record<string, number>;
  glyphs?: Record<string, string>;
  radius?: number;
}

export class BlockSymbol extends ReelSymbol {
  private _inner = new Container();
  private _g = new Graphics();
  private _label: Text;
  private _opts: BlockSymbolOptions;
  private _w = 120;
  private _h = 120;

  constructor(opts: BlockSymbolOptions) {
    super();
    this._opts = opts;
    this._inner.addChild(this._g);
    this._label = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 22,
        fontWeight: '700',
        fill: 0x0a0d14,
        letterSpacing: 1,
      }),
    });
    this._label.anchor.set(0.5);
    this._inner.addChild(this._label);
    this.view.addChild(this._inner);
  }

  protected onActivate(symbolId: string): void {
    const color = this._opts.colors[symbolId] ?? 0x4cc2ff;
    const glyph = this._opts.glyphs?.[symbolId] ?? symbolId.slice(0, 2).toUpperCase();
    this._draw(color);
    this._label.text = glyph;
    this._label.x = 0;
    this._label.y = 0;
    this._inner.alpha = 1;
    this._inner.scale.set(1);
  }

  protected onDeactivate(): void {
    this._g.clear();
    this._label.text = '';
    this._inner.scale.set(1);
  }

  async playWin(): Promise<void> {
    // Scale DOWN from 1 → 0.78 → 1, around the visual center.
    const target = this._inner;
    const min = 0.78;
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const s = 1 - (1 - min) * Math.sin(t * Math.PI);
      target.scale.set(s);
      await new Promise((r) => requestAnimationFrame(r));
    }
    target.scale.set(1);
  }

  stopAnimation(): void {
    this._inner.scale.set(1);
  }

  resize(width: number, height: number): void {
    this._w = width;
    this._h = height;
    // Inner container sits at the visual center of the cell — scaling happens around here.
    this._inner.position.set(width / 2, height / 2);
    this._label.x = 0;
    this._label.y = 0;
    if (this.symbolId) {
      const color = this._opts.colors[this.symbolId] ?? 0x4cc2ff;
      this._draw(color);
    }
  }

  /** Draw the rounded-rect symmetrically around the inner container's origin. */
  private _draw(color: number): void {
    const r = this._opts.radius ?? 12;
    const halfW = this._w / 2;
    const halfH = this._h / 2;
    this._g.clear()
      .roundRect(-halfW, -halfH, this._w, this._h, r)
      .fill({ color })
      .roundRect(-halfW, -halfH, this._w, this._h, r)
      .stroke({ color: 0x0a0d14, width: 2 });
  }
}
