import { BlurFilter, Container, Rectangle, Sprite, type Texture } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';

/**
 * The slice of a PixiJS renderer the cache needs. `Renderer` (WebGL or
 * WebGPU) satisfies it structurally; tests can pass a stub.
 */
export interface SnapshotRenderer {
  generateTexture(options: {
    target: Container;
    frame?: Rectangle;
    resolution?: number;
    antialias?: boolean;
  }): Texture;
}

/** Tuning for the baked motion-blur variant of a snapshot. */
export interface MotionBlurOptions {
  /**
   * Smear axis — the reel's travel direction. `StaticSpinSymbol` defaults
   * this to the owning set's orientation (`'y'` vertical, `'x'` horizontal),
   * so it is only worth setting to override that, or when calling the cache
   * directly. The other axis is never blurred.
   */
  axis?: 'y' | 'x';
  /**
   * Blur strength in pixels along the axis. Default: 20% of the cell's
   * span on that axis (`cellHeight * 0.2` for `'y'`, `cellWidth * 0.2`
   * for `'x'`).
   */
  strength?: number;
  /** BlurFilter quality (number of passes). Default: 4. */
  quality?: number;
  /**
   * Extra transparent pixels added on both sides of the cell along the
   * axis so the smear isn't clipped at the texture edge.
   * Default: `ceil(strength)`.
   */
  padding?: number;
}

export interface SpinTextureCacheOptions {
  /** The renderer used to generate snapshot textures (`app.renderer`). */
  renderer: SnapshotRenderer;
  /** Resolution for generated textures. Default: the renderer's default. */
  resolution?: number;
  /** Default motion-blur tuning for `captureBlurred`. */
  blur?: MotionBlurOptions;
}

/**
 * The captures of one symbolId, one texture per size. A plain map keyed by
 * {@link sizeKey}; insertion order doubles as "most recently captured last",
 * which is what a size-less lookup returns.
 */
type Captures = Map<string, Texture>;

/**
 * Key of one capture: the cell size, plus the smear axis for a blurred one.
 * Sizes are rounded to a thousandth of a pixel. The engine derives one cell
 * size along two float paths (the builder's per-reel box, the spin cell), and
 * the two can differ in the last bit: `111.65` and `111.65000000000002` are one
 * cell, and must be one capture, or a prewarmed texture is missed mid-spin.
 */
function sizeKey(width: number, height: number, axis?: 'y' | 'x'): string {
  const size = `${roundPx(width)}x${roundPx(height)}`;
  return axis ? `${size}:${axis}` : size;
}

function roundPx(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Per-symbolId cache of "spin textures". flat snapshots a reel shows
 * instead of the live symbol (Spine skeleton, animated sprite, ...) while
 * it spins.
 *
 * Two flavors per symbolId:
 *
 *   - **static**. the symbol rendered once into a RenderTexture at cell size.
 *   - **blurred**. the static snapshot smeared vertically through a one-time
 *     BlurFilter pass into a taller, padded RenderTexture. At spin time it's
 *     an ordinary sprite texture: zero filters per frame.
 *
 * Textures come from two sources, user-provided always winning:
 *
 *   - `setStatic(id, tex)` / `setBlurred(id, tex)`. hand-authored art from
 *     your atlas. Never destroyed by the cache.
 *   - `captureStatic` / `captureBlurred`. generated on demand from a live
 *     symbol view. Owned by the cache and destroyed on `invalidate` /
 *     `clear` / `destroy`.
 *
 * Captures are keyed by symbolId AND the cell size they were taken at (plus
 * the smear axis, for blurred ones). A capture at a new size adds a texture;
 * it never replaces one, because another reel may be drawing it right now.
 * That is the MultiWays case: every reel sizes the same id differently, so
 * one id legitimately lives at several sizes at once. Memory is bounded by
 * the distinct cell sizes the set ever shows (a 2..7-cell MultiWays reel
 * has six), and `clear()` drops them all when the layout changes for good.
 * Share ONE cache across all reels/symbols of a reel set. that's the point.
 */
export class SpinTextureCache implements Disposable {
  private _renderer: SnapshotRenderer;
  private _resolution: number | undefined;
  private _blurDefaults: MotionBlurOptions;
  /** User-provided textures, per symbolId. Never destroyed by the cache. */
  private _providedStatic = new Map<string, Texture>();
  private _providedBlurred = new Map<string, Texture>();
  /** Cache-generated textures, per symbolId and size. Destroyed on invalidate. */
  private _static = new Map<string, Captures>();
  private _blurred = new Map<string, Captures>();
  private _isDestroyed = false;

  constructor(options: SpinTextureCacheOptions) {
    this._renderer = options.renderer;
    this._resolution = options.resolution;
    this._blurDefaults = options.blur ?? {};
  }

  // -- User-provided textures ----------------------------------------------

  /** Provide a hand-authored static spin texture. Wins over captures. */
  setStatic(symbolId: string, texture: Texture): void {
    this._providedStatic.set(symbolId, texture);
  }

  /** Provide a hand-authored motion-blur texture. Wins over captures. */
  setBlurred(symbolId: string, texture: Texture): void {
    this._providedBlurred.set(symbolId, texture);
  }

  // -- Lookups ---------------------------------------------------------------

  /**
   * The static texture for `symbolId`: the user-provided one if set, else
   * the capture at `width`x`height`. Without a size, the most recent capture
   * at any size. `null` when there is none.
   */
  getStatic(symbolId: string, width?: number, height?: number): Texture | null {
    return this._providedStatic.get(symbolId) ?? lookup(this._static, symbolId, width, height);
  }

  /**
   * The blurred texture for `symbolId`: the user-provided one if set, else
   * the capture at `width`x`height` along `axis` (default `'y'`). Without a
   * size, the most recent capture at any size. `null` when there is none.
   */
  getBlurred(symbolId: string, width?: number, height?: number, axis: 'y' | 'x' = 'y'): Texture | null {
    return (
      this._providedBlurred.get(symbolId) ??
      lookup(this._blurred, symbolId, width, height, axis)
    );
  }

  /** True if `symbolId` has a static texture at any size. */
  hasStatic(symbolId: string): boolean {
    return this._providedStatic.has(symbolId) || (this._static.get(symbolId)?.size ?? 0) > 0;
  }

  /** True if `symbolId` has a blurred texture at any size. */
  hasBlurred(symbolId: string): boolean {
    return this._providedBlurred.has(symbolId) || (this._blurred.get(symbolId)?.size ?? 0) > 0;
  }

  // -- Capture ---------------------------------------------------------------

  /**
   * Snapshot `source` (a symbol's `view`, already activated and resized to
   * the cell) into a `width`x`height` texture and cache it under `symbolId`.
   * Returns the cached texture if one already exists at this size; a
   * user-provided texture always short-circuits. Captures at other sizes
   * are kept: they may be on screen on another reel.
   */
  captureStatic(symbolId: string, source: Container, width: number, height: number): Texture {
    const existing = this.getStatic(symbolId, width, height);
    if (existing) return existing;
    const texture = this._renderer.generateTexture({
      target: source,
      frame: new Rectangle(0, 0, width, height),
      resolution: this._resolution,
      antialias: true,
    });
    store(this._static, symbolId, sizeKey(width, height), texture);
    return texture;
  }

  /**
   * Bake a motion-blurred variant of the static snapshot for `symbolId`
   * (which must exist. call `captureStatic` or `setStatic` first) and
   * cache it. The smear runs along `blur.axis` — the reel's travel
   * direction (`'y'` default when called directly; `StaticSpinSymbol`
   * derives it from the set's orientation) — and the
   * result is `2 * padding` larger than the cell on that axis only. Draw
   * it center-anchored at the cell center and the smear extends evenly
   * past the cell on both sides. Blurs the user-provided static texture, or
   * the capture taken at this same size: a capture at another size is never
   * stretched into this one, which would bake (and cache) a distorted blur.
   */
  captureBlurred(
    symbolId: string,
    width: number,
    height: number,
    blur?: MotionBlurOptions,
  ): Texture {
    const axis = blur?.axis ?? this._blurDefaults.axis ?? 'y';
    const existing = this.getBlurred(symbolId, width, height, axis);
    if (existing) return existing;
    const staticTex = this.getStatic(symbolId, width, height);
    if (!staticTex) {
      throw new Error(
        `SpinTextureCache.captureBlurred('${symbolId}'): no static texture to blur at ` +
          `${width}x${height}. Call captureStatic() for this symbolId at this size, or setStatic(), first.`,
      );
    }

    const strength =
      blur?.strength ?? this._blurDefaults.strength ?? (axis === 'y' ? height : width) * 0.2;
    const quality = blur?.quality ?? this._blurDefaults.quality ?? 4;
    const padding = blur?.padding ?? this._blurDefaults.padding ?? Math.ceil(strength);

    const wrap = new Container();
    const sprite = new Sprite(staticTex);
    // Fit the source into the cell box in case it's a user-provided static
    // texture with different dimensions.
    sprite.width = width;
    sprite.height = height;
    if (axis === 'y') {
      sprite.y = padding;
      sprite.filters = [new BlurFilter({ strengthX: 0, strengthY: strength, quality })];
    } else {
      sprite.x = padding;
      sprite.filters = [new BlurFilter({ strengthX: strength, strengthY: 0, quality })];
    }
    wrap.addChild(sprite);

    const texture = this._renderer.generateTexture({
      target: wrap,
      frame: new Rectangle(
        0,
        0,
        width + (axis === 'x' ? padding * 2 : 0),
        height + (axis === 'y' ? padding * 2 : 0),
      ),
      resolution: this._resolution,
      antialias: true,
    });
    // Destroy the scratch scene but not the cached static texture.
    wrap.destroy({ children: true });

    store(this._blurred, symbolId, sizeKey(width, height, axis), texture);
    return texture;
  }

  // -- Invalidation ------------------------------------------------------------

  /**
   * Drop both textures for one symbolId, at every size. Cache-generated ones
   * are destroyed, so only call this when nothing is drawing them.
   */
  invalidate(symbolId: string): void {
    this._providedStatic.delete(symbolId);
    this._providedBlurred.delete(symbolId);
    drop(this._static, symbolId);
    drop(this._blurred, symbolId);
  }

  /** Drop everything. Call when the cell size changes (responsive relayout). */
  clear(): void {
    const ids = new Set([
      ...this._static.keys(),
      ...this._blurred.keys(),
      ...this._providedStatic.keys(),
      ...this._providedBlurred.keys(),
    ]);
    for (const id of ids) this.invalidate(id);
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this.clear();
    this._isDestroyed = true;
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }
}

function lookup(
  map: Map<string, Captures>,
  symbolId: string,
  width: number | undefined,
  height: number | undefined,
  axis?: 'y' | 'x',
): Texture | null {
  const captures = map.get(symbolId);
  if (!captures) return null;
  if (width !== undefined && height !== undefined) {
    return captures.get(sizeKey(width, height, axis)) ?? null;
  }
  let last: Texture | null = null;
  for (const texture of captures.values()) last = texture;
  return last;
}

function store(map: Map<string, Captures>, symbolId: string, key: string, texture: Texture): void {
  let captures = map.get(symbolId);
  if (!captures) {
    captures = new Map();
    map.set(symbolId, captures);
  }
  captures.set(key, texture);
}

function drop(map: Map<string, Captures>, symbolId: string): void {
  const captures = map.get(symbolId);
  if (!captures) return;
  for (const texture of captures.values()) texture.destroy(true);
  map.delete(symbolId);
}

export interface PrewarmSpinTexturesOptions {
  /** The shared cache to fill. */
  cache: SpinTextureCache;
  /** Every symbolId to bake. */
  ids: string[];
  /**
   * Factory for a scratch symbol used as the render source. Typically the
   * same factory you registered (e.g. `() => new SpineReelSymbol(opts)`).
   * It is activated per id, snapshotted, and destroyed at the end.
   */
  createSymbol: () => ReelSymbol;
  /** Cell width the reels will use. */
  width: number;
  /** Cell height the reels will use. */
  height: number;
  /** Also bake the motion-blur variants. Default: true. */
  blurred?: boolean;
  /** Motion-blur tuning override (defaults to the cache's). */
  blur?: MotionBlurOptions;
}

/**
 * Bake spin textures for every symbolId up front (at load or between
 * rounds) so the first spin never pays a capture hitch. Ids that already
 * have a user-provided or captured texture are skipped by the cache.
 *
 * ```ts
 * prewarmSpinTextures({
 *   cache,
 *   ids: ['cherry', 'lemon', 'seven'],
 *   createSymbol: () => new SpineReelSymbol(spineOpts),
 *   width: 150,
 *   height: 150,
 * });
 * ```
 */
export function prewarmSpinTextures(options: PrewarmSpinTexturesOptions): void {
  const { cache, ids, width, height } = options;
  const blurred = options.blurred ?? true;
  const symbol = options.createSymbol();
  try {
    for (const id of ids) {
      if (symbol.symbolId !== id) symbol.activate(id);
      symbol.resize(width, height);
      cache.captureStatic(id, symbol.view, width, height);
      if (blurred) cache.captureBlurred(id, width, height, options.blur);
    }
  } finally {
    symbol.destroy();
  }
}
