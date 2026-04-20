import { Spine, type TrackEntry } from '@esotericsoftware/spine-pixi-v8';
import { ReelSymbol } from '../symbols/ReelSymbol.js';

/**
 * Per-symbol overrides so a skeleton with unusual animation names still works.
 *
 * Example: Bonanza's `low_1` has a typo (`ide` instead of `idle`) —
 * `{ low1: { idle: 'ide' } }` fixes it without touching the asset.
 */
export type SymbolAnimOverrides = Record<
  string,
  Partial<Record<'idle' | 'landing' | 'win' | 'out' | 'blur', string>>
>;

export interface SpineReelSymbolOptions {
  /** Map of symbolId -> { skeletonAlias, atlasAlias } */
  spineMap: Record<string, { skeleton: string; atlas: string }>;
  /** Default idle animation name. Default: 'idle'. */
  idleAnimation?: string;
  /** Default win animation name. Default: 'win'. */
  winAnimation?: string;
  /** Default landing (one-shot) animation name. Default: 'landing'. */
  landingAnimation?: string;
  /**
   * Default "exit" animation name — used as the cascade pop / disintegrate.
   * If the skeleton doesn't have it, callers should fall back to an alpha tween.
   * Default: 'disintegration'.
   */
  outAnimation?: string;
  /** Default "blur" (fast spin) animation name. Default: 'blur'. */
  blurAnimation?: string;
  /** Per-symbol overrides (see SymbolAnimOverrides). */
  animations?: SymbolAnimOverrides;
  /** Scale for spine instances. Default: 1. */
  scale?: number;
  /**
   * If true, automatically plays the `blur` animation when the owning reel
   * enters the spin phase, and reverts to idle when it lands. Requires the
   * skeleton to have a `blur` animation (or the overridden name). Default: false.
   */
  autoPlayBlur?: boolean;
  /**
   * If true, automatically plays the `landing` animation concurrently with
   * the stop-phase bounce. Requires the skeleton to have a `landing`
   * animation (or the overridden name). Default: false.
   */
  autoPlayLanding?: boolean;
}

/**
 * ReelSymbol implementation using Spine 2D skeletons.
 *
 * Caches one Spine instance per symbolId for instant swapping, plays idle on
 * activate, and exposes the canonical set of one-shot animations (`landing`,
 * `win`, `out`, reactions). Modeled on the Bonanza / Hold & Win slot-game
 * conventions — drop in any skeleton that follows the same vocabulary.
 *
 * Import from the `pixi-reels/spine` subpath so non-Spine consumers can
 * tree-shake this module and `@esotericsoftware/spine-pixi-v8` out of their
 * production bundle:
 *
 * ```ts
 * import { SpineReelSymbol } from 'pixi-reels/spine';
 * ```
 */
export class SpineReelSymbol extends ReelSymbol {
  private _spines = new Map<string, Spine>();
  private _currentSpine: Spine | null = null;
  private _spineMap: Record<string, { skeleton: string; atlas: string }>;
  private _defaultAnims: { idle: string; win: string; landing: string; out: string; blur: string };
  private _overrides: SymbolAnimOverrides;
  private _scale: number;
  private _autoPlayBlur: boolean;
  private _autoPlayLanding: boolean;
  private _oneShotResolve: (() => void) | null = null;
  private _cellWidth = 0;
  private _cellHeight = 0;

  constructor(options: SpineReelSymbolOptions) {
    super();
    this._spineMap = options.spineMap;
    this._defaultAnims = {
      idle: options.idleAnimation ?? 'idle',
      win: options.winAnimation ?? 'win',
      landing: options.landingAnimation ?? 'landing',
      out: options.outAnimation ?? 'disintegration',
      blur: options.blurAnimation ?? 'blur',
    };
    this._overrides = options.animations ?? {};
    this._scale = options.scale ?? 1;
    this._autoPlayBlur = options.autoPlayBlur ?? false;
    this._autoPlayLanding = options.autoPlayLanding ?? false;
  }

  override onReelSpinStart(): void {
    if (this._autoPlayBlur) this.playBlur();
  }

  override onReelSpinEnd(): void {
    if (this._autoPlayBlur) this.stopAnimation();
  }

  override onReelLanded(): void {
    if (this._autoPlayLanding) {
      void this.playLanding();
    }
  }

  /** Resolve an animation name for the current symbol, respecting overrides. */
  private _animNameFor(role: 'idle' | 'landing' | 'win' | 'out' | 'blur'): string {
    const override = this._overrides[this.symbolId]?.[role];
    return override ?? this._defaultAnims[role];
  }

  protected onActivate(symbolId: string): void {
    if (this._currentSpine) this._currentSpine.visible = false;

    let spine = this._spines.get(symbolId);
    if (!spine) {
      const cfg = this._spineMap[symbolId];
      if (!cfg) return;
      spine = Spine.from({ skeleton: cfg.skeleton, atlas: cfg.atlas });
      spine.scale.set(this._scale);
      this.view.addChild(spine);
      this._spines.set(symbolId, spine);
    }

    this._positionSpine(spine);
    spine.visible = true;
    this._currentSpine = spine;

    // Clear any lingering one-shot resolve from a prior pool use
    this._oneShotResolve = null;

    const idleName = this._animNameFor('idle');
    if (spine.skeleton.data.findAnimation(idleName)) {
      spine.state.setAnimation(0, idleName, true);
    }
  }

  protected onDeactivate(): void {
    if (this._currentSpine) {
      this._currentSpine.state.clearTracks();
      this._currentSpine.state.removeListener(this._currentListener);
      // Reset the skeleton to its setup pose, otherwise a symbol that ends on
      // an invisible "out" frame (e.g. after `playOut()` / disintegrate) is
      // still invisible when the pool reassigns it on the next spin.
      this._currentSpine.skeleton.setToSetupPose();
      this._currentSpine.visible = false;
      this._currentSpine = null;
    }
    if (this._oneShotResolve) {
      const fn = this._oneShotResolve;
      this._oneShotResolve = null;
      fn();
    }
  }

  // -- Canonical one-shot animations ---------------------------------------

  /** Play the win animation on track 0. Returns when it completes. */
  async playWin(): Promise<void> {
    return this._playOneShot(this._animNameFor('win'), 0, true);
  }

  /**
   * Play the landing animation (one-shot). Call this when the reel settles —
   * typically inside a `spin:reelLanded` listener.
   */
  async playLanding(): Promise<void> {
    return this._playOneShot(this._animNameFor('landing'), 0, true);
  }

  /**
   * Play the exit / disintegrate animation. Returns a promise that resolves
   * when it completes. Use in cascades instead of the default alpha fade.
   */
  async playOut(): Promise<void> {
    return this._playOneShot(this._animNameFor('out'), 0, false);
  }

  /**
   * Swap the primary track to the blur animation for the SPIN phase. Reverts
   * to idle automatically on `stopAnimation()` or next activate.
   */
  playBlur(): void {
    if (!this._currentSpine) return;
    const name = this._animNameFor('blur');
    if (!this._currentSpine.skeleton.data.findAnimation(name)) return;
    this._currentSpine.state.setAnimation(0, name, true);
  }

  /** Play an arbitrary animation on a given track. Non-blocking. */
  playOnTrack(track: number, animName: string, loop = false): TrackEntry | null {
    if (!this._currentSpine) return null;
    if (!this._currentSpine.skeleton.data.findAnimation(animName)) return null;
    return this._currentSpine.state.setAnimation(track, animName, loop);
  }

  stopAnimation(): void {
    if (!this._currentSpine) return;
    this._currentSpine.state.removeListener(this._currentListener);
    const idleName = this._animNameFor('idle');
    if (this._currentSpine.skeleton.data.findAnimation(idleName)) {
      this._currentSpine.state.setAnimation(0, idleName, true);
    }
    if (this._oneShotResolve) {
      const fn = this._oneShotResolve;
      this._oneShotResolve = null;
      fn();
    }
  }

  /** Access the underlying Spine — for advanced needs (reactions, events). */
  get spine(): Spine | null {
    return this._currentSpine;
  }

  // -- Internals -----------------------------------------------------------

  private _currentListener: {
    complete?: (entry: TrackEntry) => void;
  } = {};

  private async _playOneShot(
    animName: string,
    track: number,
    returnToIdle: boolean,
  ): Promise<void> {
    if (!this._currentSpine) return;
    const spine = this._currentSpine;
    if (!spine.skeleton.data.findAnimation(animName)) return;

    return new Promise<void>((resolve) => {
      this._oneShotResolve = resolve;
      const entry = spine.state.setAnimation(track, animName, false);
      const listener = {
        complete: (done: TrackEntry) => {
          if (done !== entry) return;
          spine.state.removeListener(this._currentListener);
          if (returnToIdle) {
            const idleName = this._animNameFor('idle');
            if (spine.skeleton.data.findAnimation(idleName)) {
              spine.state.setAnimation(track, idleName, true);
            }
          }
          if (this._oneShotResolve) {
            const fn = this._oneShotResolve;
            this._oneShotResolve = null;
            fn();
          }
        },
      };
      this._currentListener = listener;
      spine.state.addListener(listener);
    });
  }

  resize(width: number, height: number): void {
    this._cellWidth = width;
    this._cellHeight = height;
    for (const [, spine] of this._spines) this._positionSpine(spine);
  }

  private _positionSpine(spine: Spine): void {
    spine.x = this._cellWidth / 2;
    spine.y = this._cellHeight / 2;
  }

  protected override onDestroy(): void {
    for (const [, spine] of this._spines) {
      spine.state.clearListeners();
      spine.destroy();
    }
    this._spines.clear();
  }
}
