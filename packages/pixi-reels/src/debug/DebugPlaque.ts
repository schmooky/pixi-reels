import { Container, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import type { Disposable } from '../utils/Disposable.js';

/** One line of a {@link DebugPlaque}. */
export interface DebugPlaqueRow {
  text: string;
  /** Text color for this row. Defaults to the plaque's `color`. */
  color?: number;
  /** A square before the text, for legends and phase keys. */
  swatch?: number;
  /**
   * A small bar after the text, filled `0..1` (clamped): a speed, a
   * progress, a count against its cap.
   */
  meter?: number;
  /** Meter fill. Defaults to the plaque's `accent`, else the row's color. */
  meterColor?: number;
}

export interface DebugPlaqueOptions {
  /** A heading row, drawn in the accent color. */
  title?: string;
  /** The body. A plain string is one row. */
  rows?: ReadonlyArray<string | DebugPlaqueRow>;
  /** Shorthand for `rows`: split on newlines. Ignored when `rows` is set. */
  text?: string;
  /** Title color and frame tint. */
  accent?: number;
  /** Font size in px. Default 11. */
  fontSize?: number;
  /** Default text color. */
  color?: number;
  /** Plate color. */
  fill?: number;
  /** Plate opacity, 0..1. Default 0.84. */
  fillAlpha?: number;
  /** Corner radius, or `'pill'` for fully round ends. Default `fontSize * 0.7`. */
  radius?: number | 'pill';
  /** Inner padding, one number or `[x, y]`. */
  padding?: number | readonly [number, number];
  /** Which point of the plate sits on `position`, `0..1` per axis. Default top-left. */
  anchor?: number | { x: number; y: number };
  /** Row alignment inside the plate. Default `'left'`. */
  align?: 'left' | 'center' | 'right';
  /** The plate is never narrower than this, so a column of plaques lines up. */
  minWidth?: number;
  /**
   * The plate is always at least this many rows tall. Reserve the most a
   * readout will ever show, so a host that fits its camera to the content
   * once is not outgrown by a longer message later.
   */
  reserveRows?: number;
  /**
   * The plate is never wider than this: longer rows wrap at word boundaries.
   * Exact, since every character advances the same.
   */
  maxWidth?: number;
  /** A soft drop shadow under the plate. Default `true`. */
  shadow?: boolean;
}

/** Split `text` into lines of at most `max` characters, at spaces where it can. */
function wrap(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    // A word longer than a line is cut, not left to run off the plate.
    let rest = word;
    while (rest.length > max) {
      lines.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/** The monospace stack every debug plaque draws with. */
export const DEBUG_FONT = "'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * Advance of one monospace character, as a fraction of the font size. Plates
 * are sized from the character count instead of `Text.width`: measuring needs
 * a canvas to rasterize against, which a headless test does not have, and a
 * plaque that re-measures its text every frame is a plaque nobody can afford
 * to update every frame. Every monospace face in {@link DEBUG_FONT} advances
 * 0.6 em, give or take a hundredth.
 */
const MONO_ADVANCE = 0.6;

const DEFAULT_COLOR = 0xe7e5e4;
const DEFAULT_FILL = 0x0b0e14;

interface ResolvedRow {
  text: string;
  color: number;
  swatch: number | null;
  meter: number | null;
  meterColor: number | null;
}

/**
 * A small readable card: rows of monospace text on a smooth rounded plate,
 * with optional swatches (legends) and meters (a speed, a progress). The
 * building block of every readout in `pixi-reels/debug`, and the one the
 * recipes on the docs site use for their own labels.
 *
 * The plate is a `SilkGraphics` from `pixi-silk`, so its edges stay exact at
 * any scale the reel set is fitted to. Text is ordinary Pixi `Text` on top.
 *
 * ```ts
 * const plaque = new DebugPlaque({
 *   title: 'reel 2',
 *   rows: ['phase  stop', { text: 'speed', meter: 0.4 }],
 *   accent: 0xf59e0b,
 *   anchor: { x: 0.5, y: 0 },
 * });
 * plaque.position.set(x, y);
 * reelSet.addChild(plaque);
 * plaque.update({ rows: ['phase  landed'] }); // cheap enough to call per frame
 * ```
 */
export class DebugPlaque extends Container implements Disposable {
  private _opts: DebugPlaqueOptions;
  private _gfx = new SilkGraphics({ label: 'DebugPlaque:plate' });
  private _title: Text | null = null;
  private _texts: Text[] = [];
  private _width = 0;
  private _height = 0;

  constructor(options: DebugPlaqueOptions = {}) {
    super();
    this.label = 'DebugPlaque';
    this.eventMode = 'none';
    this._opts = { ...options };
    this.addChild(this._gfx);
    this._layout();
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Destroy the plaque with its plate and text: it owns everything in it, so
   * a plain `destroy()` frees them too. Calling it again does nothing.
   */
  override destroy(options?: DestroyOptions): void {
    if (this.destroyed) return;
    super.destroy(typeof options === 'object' ? { ...options, children: true } : { children: true });
  }

  /** Width of the plate in local px, from the character count. */
  get plateWidth(): number {
    return this._width;
  }

  /** Height of the plate in local px. */
  get plateHeight(): number {
    return this._height;
  }

  /** Merge `options` into the current ones and lay the plaque out again. */
  update(options: DebugPlaqueOptions): this {
    Object.assign(this._opts, options);
    this._layout();
    return this;
  }

  /** Replace the body rows. The same as `update({ rows })`. */
  setRows(rows: ReadonlyArray<string | DebugPlaqueRow>): this {
    return this.update({ rows });
  }

  /**
   * The body as one string, rows joined by newlines. Assigning replaces the
   * rows, so a plaque drops in where a `Text` was: `plaque.text = 'held 3/15'`.
   */
  get text(): string {
    const o = this._opts;
    if (o.rows) return o.rows.map((r) => (typeof r === 'string' ? r : r.text)).join('\n');
    return o.text ?? '';
  }

  set text(value: string) {
    this._opts.rows = undefined;
    this._opts.text = value;
    this._layout();
  }

  private _rows(size: number, padX: number): ResolvedRow[] {
    const o = this._opts;
    const color = o.color ?? DEFAULT_COLOR;
    const source = o.rows ?? (o.text !== undefined ? o.text.split('\n') : []);
    const resolved = source.map((row): ResolvedRow => {
      if (typeof row === 'string') {
        return { text: row, color, swatch: null, meter: null, meterColor: null };
      }
      return {
        text: row.text,
        color: row.color ?? color,
        swatch: row.swatch ?? null,
        meter: row.meter ?? null,
        meterColor: row.meterColor ?? null,
      };
    });
    if (o.maxWidth === undefined) return resolved;
    const maxChars = Math.max(1, Math.floor((o.maxWidth - padX * 2) / (size * MONO_ADVANCE)));
    // A wrapped row keeps its color; its swatch and meter stay on the first line.
    return resolved.flatMap((row) =>
      wrap(row.text, maxChars).map((line, i) =>
        i === 0 ? { ...row, text: line } : { ...row, text: line, swatch: null, meter: null },
      ),
    );
  }

  private _layout(): void {
    // A late write (a recipe's async flow outliving its demo, say) lands on a
    // plaque whose plate geometry is gone. Like a destroyed Text, ignore it.
    if (this.destroyed) return;
    const o = this._opts;
    const size = o.fontSize ?? 11;
    const lineHeight = Math.round(size * 1.4);
    const advance = size * MONO_ADVANCE;
    const [padX, padY] =
      typeof o.padding === 'number'
        ? [o.padding, o.padding]
        : (o.padding ?? [Math.round(size * 0.75), Math.round(size * 0.45)]);
    const rows = this._rows(size, padX);
    const title = o.title ?? '';

    const swatchSize = Math.round(size * 0.75);
    const swatchCol = rows.some((r) => r.swatch !== null) ? swatchSize + Math.round(size * 0.5) : 0;
    const meterW = Math.round(size * 4);
    const meterH = Math.max(3, Math.round(size * 0.36));
    const meterCol = rows.some((r) => r.meter !== null) ? meterW + Math.round(size * 0.7) : 0;

    const textW = (s: string): number => s.length * advance;
    const bodyW = rows.reduce((w, r) => Math.max(w, swatchCol + textW(r.text) + meterCol), 0);
    const innerW = Math.max(bodyW, textW(title));
    const titleH = title ? lineHeight + Math.round(size * 0.15) : 0;
    const width = Math.ceil(
      Math.min(o.maxWidth ?? Infinity, Math.max(o.minWidth ?? 0, innerW + padX * 2)),
    );
    const height = Math.ceil(titleH + Math.max(rows.length, o.reserveRows ?? 0) * lineHeight + padY * 2);
    this._width = width;
    this._height = height;

    // Plate.
    const g = this._gfx;
    g.clear();
    const radius = o.radius === 'pill' ? height / 2 : (o.radius ?? size * 0.7);
    if (o.shadow ?? true) {
      g.roundRect(0, 1.5, width, height, radius, 0.6).fill({ color: 0x000000, alpha: 0.35, blur: 3 });
    }
    g.roundRect(0, 0, width, height, radius, 0.6)
      .fill({ color: o.fill ?? DEFAULT_FILL, alpha: o.fillAlpha ?? 0.84 })
      .stroke({
        color: o.accent ?? 0xffffff,
        alpha: o.accent === undefined ? 0.1 : 0.5,
        width: 1,
        alignment: 'inside',
      });

    // Title.
    const textY = (rowTop: number): number => rowTop + (lineHeight - size * 1.25) / 2;
    if (title) {
      this._title ??= this._makeText(true);
      this._title.visible = true;
      this._title.text = title;
      this._title.style.fill = o.accent ?? o.color ?? DEFAULT_COLOR;
      this._title.style.fontSize = size;
      this._title.x = this._alignX(textW(title), width, padX);
      this._title.y = textY(padY);
    } else if (this._title) {
      this._title.visible = false;
    }

    // Rows.
    const bodyTop = padY + titleH;
    rows.forEach((row, i) => {
      const t = (this._texts[i] ??= this._makeText(false));
      t.visible = true;
      t.text = row.text;
      t.style.fill = row.color;
      t.style.fontSize = size;
      const rowTop = bodyTop + i * lineHeight;
      const x = this._alignX(swatchCol + textW(row.text) + meterCol, width, padX);
      t.x = x + swatchCol;
      t.y = textY(rowTop);
      if (row.swatch !== null) {
        g.roundRect(x, rowTop + (lineHeight - swatchSize) / 2, swatchSize, swatchSize, swatchSize * 0.3)
          .fill(row.swatch);
      }
      if (row.meter !== null) {
        const mx = width - padX - meterW;
        const my = rowTop + (lineHeight - meterH) / 2;
        const fill = Math.min(1, Math.max(0, row.meter));
        g.pill(mx, my, meterW, meterH).fill({ color: 0xffffff, alpha: 0.14 });
        if (fill > 0) {
          g.pill(mx, my, Math.max(meterH, meterW * fill), meterH).fill(
            row.meterColor ?? o.accent ?? row.color,
          );
        }
      }
    });
    for (let i = rows.length; i < this._texts.length; i++) this._texts[i].visible = false;

    const anchor = o.anchor ?? 0;
    const ax = typeof anchor === 'number' ? anchor : anchor.x;
    const ay = typeof anchor === 'number' ? anchor : anchor.y;
    this.pivot.set(Math.round(width * ax), Math.round(height * ay));
    // The whole plate is the hit area, so a plaque that is also a button only
    // needs `eventMode = 'static'` and a listener. It is also the plaque's
    // bounds: the soft shadow reaches a few px past the plate, and a host
    // that fits its camera to the content should fit the plate, not the blur.
    this.hitArea = this._plateRect(this.hitArea, width, height);
    this.boundsArea = this._plateRect(this.boundsArea, width, height);
  }

  private _plateRect(current: unknown, width: number, height: number): Rectangle {
    if (current instanceof Rectangle) {
      current.width = width;
      current.height = height;
      return current;
    }
    return new Rectangle(0, 0, width, height);
  }

  private _alignX(contentW: number, width: number, padX: number): number {
    switch (this._opts.align) {
      case 'center':
        return Math.round((width - contentW) / 2);
      case 'right':
        return Math.round(width - padX - contentW);
      default:
        return padX;
    }
  }

  private _makeText(bold: boolean): Text {
    const t = new Text({
      text: '',
      style: {
        fontFamily: DEBUG_FONT,
        fontSize: this._opts.fontSize ?? 11,
        fontWeight: bold ? '600' : '400',
        fill: this._opts.color ?? DEFAULT_COLOR,
      },
    });
    this.addChild(t);
    return t;
  }
}
