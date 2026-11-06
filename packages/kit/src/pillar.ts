import { Container, Sprite, type Texture } from 'pixi.js';
import { PILLAR_METRICS, type PillarPart, type PillarVariant } from './genericSymbols.js';

/**
 * The expanded wild: five slices in a column, as tall as the reel. The top
 * and bottom caps and the WILD word keep their shape; the two bands between
 * them stretch to whatever is left. Below a height the stacked-letters cut
 * cannot fit, the WILD-across cut takes over, so the pillar covers any reel
 * from two cells up.
 */
export class WildPillar extends Container {
  private readonly _pillars: Record<PillarVariant, Record<PillarPart, Texture>>;
  private readonly _parts: Record<'top' | 'band1' | 'wild' | 'band2' | 'bottom', Sprite>;
  private _variant: PillarVariant | null = null;
  /** The shortest pillar the current cut draws, in px. */
  minHeight = 0;

  constructor(pillars: Record<PillarVariant, Record<PillarPart, Texture>>) {
    super();
    this._pillars = pillars;
    const sprite = () => { const s = new Sprite(); s.anchor.set(0.5, 0); return s; };
    this._parts = { top: sprite(), band1: sprite(), wild: sprite(), band2: sprite(), bottom: sprite() };
    this.addChild(this._parts.top, this._parts.band1, this._parts.wild, this._parts.band2, this._parts.bottom);
  }

  /**
   * Lay the slices out for a box `width` wide and `height` tall, centred on
   * (0, 0). `full` is the height the pillar will end at, when it is still
   * growing there: the cut follows that, so the lettering never swaps
   * mid-growth.
   */
  layout(width: number, height: number, full = height): void {
    const bodyW = width * 0.84;
    const fit = (v: PillarVariant) => {
      const m = PILLAR_METRICS[v];
      const k = bodyW / m.body;
      return { v, k, w: m.width * k, min: (m.top + m.word + m.bottom) * k, m };
    };
    let cut = fit('b');
    if (cut.min > full * 0.98) cut = fit('a');
    if (this._variant !== cut.v) {
      this._variant = cut.v;
      const tex = this._pillars[cut.v];
      this._parts.top.texture = tex.top;
      this._parts.band1.texture = tex.band;
      this._parts.wild.texture = tex.wild;
      this._parts.band2.texture = tex.band;
      this._parts.bottom.texture = tex.bottom;
    }
    this.minHeight = cut.min;
    const top = cut.m.top * cut.k;
    const word = cut.m.word * cut.k;
    const bottom = cut.m.bottom * cut.k;
    const band = Math.max(0, (height - top - word - bottom) / 2);
    let y = -height / 2;
    for (const [part, h] of [['top', top], ['band1', band], ['wild', word], ['band2', band], ['bottom', bottom]] as const) {
      const s = this._parts[part];
      s.width = cut.w;
      s.height = h;
      s.y = y;
      y += h;
    }
  }
}
