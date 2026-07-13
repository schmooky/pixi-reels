import { Sprite } from 'pixi.js';
import type { gsap } from 'gsap';
import { getGsap } from '../utils/gsapRef.js';
import { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { MotionBlurOptions, SpinTextureCache } from './SpinTextureCache.js';

export interface StaticSpinSymbolOptions {
  /**
   * Factory for the wrapped "live" symbol. any ReelSymbol subclass
   * (SpineReelSymbol, AnimatedSpriteSymbol, a custom class). The wrapper
   * owns the instance: it activates it while the reel is at rest and
   * deactivates it while the reel spins.
   */
  createInner: () => ReelSymbol;
  /** Shared spin-texture cache. one per reel set. */
  cache: SpinTextureCache;
  /**
   * What to show while spinning. `'blurred'` (default) crossfades the
   * static snapshot into the baked motion-blur variant; `'static'` shows
   * the crisp snapshot only and never touches the blur pipeline.
   */
  spinTexture?: 'blurred' | 'static';
  /**
   * Crossfade duration (ms) from crisp snapshot to blurred snapshot at
   * spin start. matches the reel's acceleration ramp. `0` = instant.
   * Default: 120. Ignored when `spinTexture: 'static'`.
   */
  blurRampMs?: number;
  /**
   * Motion-blur tuning forwarded to `cache.captureBlurred`. On a
   * `HorizontalReel` pass `{ axis: 'x' }` so the smear follows the strip's
   * sideways travel (and snapshots fit the cell by height instead of width).
   */
  blur?: MotionBlurOptions;
}

/**
 * Wraps any `ReelSymbol` and swaps it for a cached snapshot texture while
 * the reel spins. "spin static, not Spine."
 *
 * At rest the inner symbol is live (idle loops, win animations, cascade
 * destruction all delegate to it). When the reel starts, the wrapper
 * snapshots the inner symbol through the shared {@link SpinTextureCache}
 * (or reuses a cached / user-provided texture), **deactivates** the inner
 * symbol so it costs nothing, and spins a plain Sprite instead. Symbols
 * that wrap in mid-spin only retarget that sprite's texture. no inner
 * symbol is ever created or ticked for them. On land the inner symbol is
 * reactivated on the final symbolId.
 *
 * With `spinTexture: 'blurred'` the sprite crossfades from the crisp
 * snapshot to a pre-baked motion-blur variant over `blurRampMs`, then
 * spins the blurred texture. The smear follows the reel's travel axis
 * (`blur.axis` — vertical by default, `'x'` for a `HorizontalReel`). No
 * filter runs during the spin; the blur is baked once per symbolId and
 * cached.
 *
 * Register it like any other symbol:
 *
 * ```ts
 * const cache = new SpinTextureCache({ renderer: app.renderer });
 * builder.symbols((r) => {
 *   for (const id of ids) {
 *     r.register(id, StaticSpinSymbol, {
 *       createInner: () => new SpineReelSymbol(spineOpts),
 *       cache,
 *     });
 *   }
 * });
 * ```
 *
 * Prefer calling {@link prewarmSpinTextures} at load time so the first
 * spin doesn't pay the one-time capture cost.
 */
export class StaticSpinSymbol extends ReelSymbol {
  private _inner: ReelSymbol;
  private _cache: SpinTextureCache;
  private _mode: 'blurred' | 'static';
  private _rampMs: number;
  private _blurOpts: MotionBlurOptions | undefined;

  private _staticSprite: Sprite;
  private _blurSprite: Sprite;
  private _spinning = false;
  private _cellW = 0;
  private _cellH = 0;
  private _rampTween: gsap.core.Tween | null = null;

  constructor(options: StaticSpinSymbolOptions) {
    super();
    this._inner = options.createInner();
    this._cache = options.cache;
    this._mode = options.spinTexture ?? 'blurred';
    this._rampMs = options.blurRampMs ?? 120;
    this._blurOpts = options.blur;

    this.view.addChild(this._inner.view);
    this._staticSprite = new Sprite();
    this._staticSprite.anchor.set(0.5, 0.5);
    this._staticSprite.visible = false;
    this._blurSprite = new Sprite();
    this._blurSprite.anchor.set(0.5, 0.5);
    this._blurSprite.visible = false;
    this.view.addChild(this._staticSprite, this._blurSprite);
  }

  /** The wrapped live symbol. for type-specific access (`inner as SpineReelSymbol`). */
  get inner(): ReelSymbol {
    return this._inner;
  }

  /** True while the wrapper is showing a snapshot instead of the live symbol. */
  get isShowingSnapshot(): boolean {
    return this._spinning;
  }

  protected onActivate(symbolId: string): void {
    if (this._spinning) {
      // Wrapped in mid-spin: never touch the inner symbol, just retarget
      // the snapshot sprite (instantly blurred. the ramp belongs to spin
      // start, not to cells joining a reel already at speed).
      this._showSnapshot(symbolId, { instant: true });
      return;
    }
    if (this._inner.symbolId !== symbolId) this._inner.activate(symbolId);
    this._hideSnapshot();
  }

  protected onDeactivate(): void {
    this._killRamp();
    this._spinning = false;
    this._staticSprite.visible = false;
    this._blurSprite.visible = false;
    if (this._inner.symbolId !== '') this._inner.deactivate();
  }

  override onReelSpinStart(joinedMidSpin = false): void {
    if (this._spinning) {
      // Idempotent: a repeat notification (same-id fast path during a
      // wrap) only refreshes the snapshot target.
      this._showSnapshot(this.symbolId, { instant: true });
      return;
    }
    this._spinning = true;
    // Capture while the inner symbol is still live so a cache miss can
    // snapshot it in place, then put the inner symbol to sleep for the
    // duration of the spin.
    this._showSnapshot(this.symbolId, { instant: joinedMidSpin || this._rampMs <= 0 });
    if (this._inner.symbolId !== '') this._inner.deactivate();
  }

  override onReelSpinEnd(): void {
    if (!this._spinning) return;
    this._spinning = false;
    this._killRamp();
    this._staticSprite.visible = false;
    this._blurSprite.visible = false;
    if (this._inner.symbolId !== this.symbolId) {
      this._inner.activate(this.symbolId);
      this._inner.resize(this._cellW, this._cellH);
    }
  }

  override onReelLanded(): void {
    if (!this._spinning) this._inner.onReelLanded();
  }

  async playWin(): Promise<void> {
    return this._inner.playWin();
  }

  stopAnimation(): void {
    if (this._inner.symbolId !== '') this._inner.stopAnimation();
  }

  override async playDestroy(opts?: { delay?: number; signal?: AbortSignal }): Promise<void> {
    // Landed symbols delegate so art-specific destruction (Spine `out`
    // tracks etc.) plays; a snapshot mid-spin falls back to the generic
    // implode on the wrapper view.
    if (!this._spinning && this._inner.symbolId !== '') return this._inner.playDestroy(opts);
    return super.playDestroy(opts);
  }

  resize(width: number, height: number): void {
    this._cellW = width;
    this._cellH = height;
    this._staticSprite.position.set(width / 2, height / 2);
    this._blurSprite.position.set(width / 2, height / 2);
    this._fitSprites();
    this._inner.resize(width, height);
  }

  protected override onDestroy(): void {
    this._killRamp();
    // Detach before destroying so the base class's view.destroy({children})
    // doesn't double-destroy the inner view.
    if (this._inner.view.parent === this.view) this.view.removeChild(this._inner.view);
    this._inner.destroy();
  }

  // -- Internals -------------------------------------------------------------

  /**
   * Point the snapshot sprites at `symbolId`'s cached textures, capturing
   * on miss. With `instant`, the end state is applied directly (blurred
   * fully visible); otherwise the crisp→blur crossfade ramp starts.
   */
  private _showSnapshot(symbolId: string, opts: { instant: boolean }): void {
    const staticTex = this._ensureStatic(symbolId);
    this._staticSprite.texture = staticTex;

    if (this._mode === 'blurred') {
      this._blurSprite.texture = this._cache.captureBlurred(
        symbolId,
        this._cellW,
        this._cellH,
        this._blurOpts,
      );
    }
    this._fitSprites();

    if (this._mode === 'static') {
      this._staticSprite.visible = true;
      this._staticSprite.alpha = 1;
      return;
    }

    if (opts.instant) {
      // Already ramping? Let the running crossfade finish on the new
      // textures instead of snapping mid-fade.
      if (this._rampTween) return;
      this._staticSprite.visible = false;
      this._blurSprite.visible = true;
      this._blurSprite.alpha = 1;
      return;
    }

    this._killRamp();
    this._staticSprite.visible = true;
    this._staticSprite.alpha = 1;
    this._blurSprite.visible = true;
    this._blurSprite.alpha = 0;
    this._rampTween = getGsap().to(this._blurSprite, {
      alpha: 1,
      duration: this._rampMs / 1000,
      ease: 'power1.in',
      onComplete: () => {
        this._rampTween = null;
        this._staticSprite.visible = false;
      },
    });
  }

  /**
   * Static texture for `symbolId`, capturing from the inner symbol on a
   * cache miss. If the inner symbol currently holds a different identity
   * (mid-spin wrap), it is briefly activated offscreen for the capture and
   * deactivated again. one-time cost per symbolId; avoid it entirely with
   * `prewarmSpinTextures`.
   */
  private _ensureStatic(symbolId: string) {
    const cached = this._cache.getStatic(symbolId);
    if (cached) return cached;

    const needsTempActivation = this._inner.symbolId !== symbolId;
    if (needsTempActivation) {
      this._inner.activate(symbolId);
      this._inner.resize(this._cellW, this._cellH);
    }
    const tex = this._cache.captureStatic(symbolId, this._inner.view, this._cellW, this._cellH);
    if (needsTempActivation && this._spinning) this._inner.deactivate();
    return tex;
  }

  private _hideSnapshot(): void {
    this._killRamp();
    this._staticSprite.visible = false;
    this._blurSprite.visible = false;
  }

  /**
   * Uniformly fit both sprites to the cell along the axis the blur does
   * NOT pad (keeps aspect; the padded axis then centers out evenly past
   * the cell). Vertical reels fit by width; horizontal (`blur.axis: 'x'`)
   * strips fit by height.
   */
  private _fitSprites(): void {
    if (this._cellW <= 0 || this._cellH <= 0) return;
    const fitByHeight = this._blurOpts?.axis === 'x';
    for (const sprite of [this._staticSprite, this._blurSprite]) {
      const tw = sprite.texture.width;
      const th = sprite.texture.height;
      if (tw <= 0 || th <= 0) continue;
      sprite.scale.set(fitByHeight ? this._cellH / th : this._cellW / tw);
    }
  }

  private _killRamp(): void {
    if (this._rampTween) {
      this._rampTween.kill();
      this._rampTween = null;
    }
  }
}
