import { Spine, type TrackEntry } from '@esotericsoftware/spine-pixi-v8';
import { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { ReelLandingContext } from '../config/types.js';

/**
 * Per-symbol overrides so a skeleton with unusual animation names still works.
 *
 * Example: Bonanza's `low_1` has a typo (`ide` instead of `idle`).
 * `{ low1: { idle: 'ide' } }` fixes it without touching the asset.
 */
export type SymbolAnimOverrides = Record<
  string,
  Partial<Record<'idle' | 'landing' | 'win' | 'out' | 'blur', string>>
>;

/** One spine source: a skeleton/atlas alias pair plus an optional skin. */
export interface SpineSymbolSource {
  skeleton: string;
  atlas: string;
  /**
   * Skin applied when the instance is created. Lets several symbolIds share
   * one multi-skin skeleton (e.g. a `lowSymbols` skeleton with skins
   * `low1`..`low5`) instead of shipping one skeleton per symbol.
   */
  skin?: string;
}

export interface SpineReelSymbolOptions {
  /** Map of symbolId -> spine source. */
  spineMap: Record<string, SpineSymbolSource>;
  /** Default idle animation name. Default: 'idle'. */
  idleAnimation?: string;
  /** Default win animation name. Default: 'win'. */
  winAnimation?: string;
  /** Default landing (one-shot) animation name. Default: 'landing'. */
  landingAnimation?: string;
  /**
   * Default "exit" animation name. used as the cascade pop / disintegrate.
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
   * What plays when the owning reel lands, concurrently with the stop-phase
   * bounce. Default: false (nothing).
   *
   * - `true`: the `landing` animation (or the overridden name), then idle.
   * - `false`: nothing.
   * - a function: asked per landing with the {@link ReelLandingContext} -
   *   which reel and cell this symbol landed in - and returns one of the
   *   above, or an animation NAME to play as the landing beat on this reel
   *   and cell instead. So a symbol can land on reels 1-3, skip its landing
   *   on the reel a takeover is about to run on, and play a different beat
   *   on the last one.
   *
   * Requires the skeleton to have the animation; a missing one is skipped.
   */
  autoPlayLanding?: boolean | ((ctx: ReelLandingContext) => LandingDecision);
}

/**
 * What a Spine symbol does on a landing: `true` for its configured landing
 * one-shot, `false` for nothing, or the name of another animation to play as
 * this landing's one-shot (then idle). See `autoPlayLanding`.
 */
export type LandingDecision = boolean | string;

/**
 * What a one-shot leaves on its track once it completes. See
 * {@link SpineReelSymbol.playOneShot}.
 *
 * - `'idle'`: the idle loop, the way `playWin()` and `playLanding()` end.
 * - `'hold'`: the last frame, the way `playOut()` ends, so a disintegrated
 *   symbol stays gone.
 * - `'clear'`: nothing. The track is emptied (mixed out over the state's
 *   `defaultMix`) and the tracks under it show through: the end for an
 *   overlay on track 1 and up.
 */
export type OneShotEnd = 'idle' | 'hold' | 'clear';

/** Options for {@link SpineReelSymbol.playOneShot}. */
export interface OneShotOptions {
  /** Track to play on. Default `0`, the track idle, win and landing use. */
  track?: number;
  /**
   * What the track shows once the animation completes. Default `'idle'` on
   * track 0 and `'clear'` on any other track, where idle does not live.
   */
  then?: OneShotEnd;
}

/**
 * ReelSymbol implementation using Spine 2D skeletons.
 *
 * Caches one Spine instance per symbolId for instant swapping, plays idle on
 * activate, and exposes the canonical set of one-shot animations (`landing`,
 * `win`, `out`, reactions). Modeled on the Bonanza / Hold & Win slot-game
 * conventions. drop in any skeleton that follows the same vocabulary.
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
  private _spineMap: Record<string, SpineSymbolSource>;
  private _defaultAnims: { idle: string; win: string; landing: string; out: string; blur: string };
  private _overrides: SymbolAnimOverrides;
  private _scale: number;
  private _autoPlayBlur: boolean;
  private _autoPlayLanding: boolean | ((ctx: ReelLandingContext) => LandingDecision);
  /** The one-shot in flight on each track: its track entry and its resolve. */
  private _oneShots = new Map<number, { entry: TrackEntry; resolve: () => void }>();
  /**
   * Overlay tracks (1 and up) a one-shot finished on with `then: 'hold'`,
   * still showing its last frame: `stopAnimation()` clears them. A record
   * goes as soon as anything else takes its track.
   */
  private _heldOverlays = new Map<number, TrackEntry>();
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

  override onReelLanded(ctx?: ReelLandingContext): void {
    const rule = this._autoPlayLanding;
    // A manual call without a context cannot be asked per reel; treat the
    // rule as its unconditional form.
    const decision: LandingDecision =
      typeof rule === 'function' ? (ctx ? rule(ctx) : true) : rule;
    if (decision === false) return;
    if (decision === true) {
      void this.playLanding();
      return;
    }
    void this.trackLanding(this.playOneShot(decision));
  }

  /** Resolve an animation name for the current symbol, respecting overrides. */
  private _animNameFor(role: 'idle' | 'landing' | 'win' | 'out' | 'blur'): string {
    const override = this._overrides[this.symbolId]?.[role];
    return override ?? this._defaultAnims[role];
  }

  protected onActivate(symbolId: string): void {
    // Settle any lingering one-shot from a prior pool use so the caller's
    // `await playWin()` doesn't dangle when the symbol is recycled
    // mid-animation. Before the swap: each one-shot detaches from its own spine.
    this._settleOneShots();
    // A hold belongs to the spine being parked, not the one about to show.
    this._heldOverlays.clear();
    if (this._currentSpine) this._park(this._currentSpine);

    let spine = this._spines.get(symbolId);
    if (!spine) {
      const cfg = this._spineMap[symbolId];
      if (!cfg) return;
      spine = this._createSpine(cfg);
      this._spines.set(symbolId, spine);
    }

    this._positionSpine(spine);
    spine.visible = true;
    // Only the spine on screen ticks. Every other cached instance would
    // otherwise keep running its state and world transform on the shared
    // ticker while hidden - hundreds of them on a Hold & Win board.
    spine.autoUpdate = true;
    this._currentSpine = spine;

    const idleName = this._animNameFor('idle');
    if (spine.skeleton.data.findAnimation(idleName)) {
      spine.state.setAnimation(0, idleName, true);
    }
    // Apply the pose NOW. a freshly created (or setup-pose-reset) skeleton
    // has no applied state until its next ticker update, so anything that
    // renders it synchronously after activation. a same-frame first paint,
    // or a SpinTextureCache snapshot capture. would see nothing.
    spine.update(0);
  }

  /** Instantiate a spine from a source config: scale, optional skin, attach. */
  private _createSpine(cfg: SpineSymbolSource): Spine {
    const spine = Spine.from({ skeleton: cfg.skeleton, atlas: cfg.atlas, autoUpdate: false });
    spine.scale.set(this._scale);
    if (cfg.skin) {
      spine.skeleton.setSkinByName(cfg.skin);
      spine.skeleton.setSlotsToSetupPose();
    }
    this.view.addChild(spine);
    return spine;
  }

  protected onDeactivate(): void {
    this._settleOneShots();
    this._heldOverlays.clear();
    if (this._currentSpine) {
      this._currentSpine.state.clearTracks();
      // Reset the skeleton to its setup pose, otherwise a symbol that ends on
      // an invisible "out" frame (e.g. after `playOut()` / disintegrate) is
      // still invisible when the pool reassigns it on the next spin.
      this._currentSpine.skeleton.setToSetupPose();
      this._park(this._currentSpine);
      this._currentSpine = null;
    }
  }

  /** Hide a cached instance and take it off the ticker until it is shown again. */
  private _park(spine: Spine): void {
    spine.visible = false;
    spine.autoUpdate = false;
  }

  // -- Canonical one-shot animations ---------------------------------------

  /** Play the win animation on track 0. Returns when it completes. */
  async playWin(): Promise<void> {
    return this.playOneShot(this._animNameFor('win'));
  }

  /**
   * Play the landing animation (one-shot). Call this when the reel settles.
   * typically inside a `spin:reelLanded` listener.
   */
  override async playLanding(): Promise<void> {
    return this.trackLanding(this.playOneShot(this._animNameFor('landing')));
  }

  /**
   * Play the exit / disintegrate animation. Returns a promise that resolves
   * when it completes. Use in cascades instead of the default alpha fade.
   */
  async playOut(): Promise<void> {
    return this.playOneShot(this._animNameFor('out'), { then: 'hold' });
  }

  /**
   * Play an animation once and resolve when it completes: the awaitable
   * form of `playOnTrack(track, name, false)`, and what `playWin()`,
   * `playLanding()` and `playOut()` are built on. `then` says what the track
   * shows afterwards (see {@link OneShotEnd}).
   *
   * Each track holds one one-shot at a time. The promise resolves when the
   * animation completes, or early when something else takes its track
   * first: another one-shot on that track, `playBlur()` or
   * `stopAnimation()`, a direct `setAnimation()` on the track, or the symbol
   * being recycled. One-shots on different tracks run side by side. A name
   * the skeleton does not have resolves at once and plays nothing.
   *
   * ```ts
   * await coin.playOneShot('collect');                   // track 0, then idle
   * await coin.playOneShot('react_u', { track: 1 });     // overlay, cleared after
   * await coin.playOneShot('explode', { then: 'hold' }); // stays on its last frame
   * ```
   */
  playOneShot(animation: string, options: OneShotOptions = {}): Promise<void> {
    const spine = this._currentSpine;
    if (!spine || !spine.skeleton.data.findAnimation(animation)) return Promise.resolve();
    const track = options.track ?? 0;
    const then = options.then ?? (track === 0 ? 'idle' : 'clear');

    // A new one-shot settles the previous one on THIS track only; without
    // that, back-to-back `playWin()` / `playOut()` calls would silently
    // abandon the first promise.
    this._settleOneShot(track);

    return new Promise<void>((resolve) => {
      const entry = spine.state.setAnimation(track, animation, false);
      // The entry's own listener, not one on the state: spine calls it for
      // this entry alone, and dropping it never edits the state's listener
      // list, which spine walks live while it dispatches. Removing a state
      // listener mid-dispatch made the game's next listener miss the event.
      entry.listener = {
        complete: () => {
          if (!this._settleOneShot(track, entry)) return;
          if (then === 'idle') {
            const idleName = this._animNameFor('idle');
            if (spine.skeleton.data.findAnimation(idleName)) {
              spine.state.setAnimation(track, idleName, true);
            }
          } else if (then === 'clear') {
            spine.state.setEmptyAnimation(track, spine.state.data.defaultMix);
          } else if (track !== 0) {
            this._holdOverlay(track, entry);
          }
        },
        // Something else took the track before the animation completed.
        interrupt: () => this._settleOneShot(track, entry),
        end: () => this._settleOneShot(track, entry),
      };
      this._oneShots.set(track, { entry, resolve });
    });
  }

  /**
   * Cascade-destruction override. If the skeleton has the configured
   * `out` (disintegration) animation, play it. Otherwise fall back to the
   * base class's GSAP scale-and-fade so a partial skeleton still cascades
   * cleanly. `opts.delay` is honored (seconds, mirrors the GSAP version)
   * so callers can stagger a winning cluster. `opts.signal` aborts
   * the (pre-delay or in-flight) animation early. the spine state is
   * snapped to the next track entry and the resolve fires immediately;
   * the view is left at `alpha: 0` for parity with the GSAP fallback so
   * the destroyed pose is consistent across symbol kinds.
   */
  override async playDestroy(opts?: { delay?: number; signal?: AbortSignal }): Promise<void> {
    const outName = this._animNameFor('out');
    const hasOut = !!this._currentSpine?.skeleton.data.findAnimation(outName);
    if (!hasOut) return super.playDestroy(opts);

    const signal = opts?.signal;
    if (signal?.aborted) {
      this.view.alpha = 0;
      return;
    }

    const delay = opts?.delay ?? 0;
    if (delay > 0) {
      // Honor abort during the pre-delay window. skip the disintegrate
      // entirely if the player slammed before it could start.
      const aborted = await new Promise<boolean>((resolve) => {
        const t = setTimeout(() => {
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve(false);
        }, delay * 1000);
        const onAbort = (): void => {
          clearTimeout(t);
          resolve(true);
        };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
      });
      if (aborted) {
        this.view.alpha = 0;
        return;
      }
    }

    // Race the play against abort. On abort, settle the one-shot promise
    // (which resolves the awaiter) and snap the view to the destroyed pose
    //. the underlying spine track ticks until the next track set, but
    // alpha=0 keeps it invisible.
    if (signal) {
      const onAbort = (): void => {
        this._settleOneShot(0);
        this.view.alpha = 0;
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        await this.playOut();
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
      return;
    }
    return this.playOut();
  }

  /**
   * Swap the primary track to the blur animation for the SPIN phase. Reverts
   * to idle automatically on `stopAnimation()` or next activate.
   *
   * If a one-shot promise (`playWin` / `playLanding` / `playOut`) is in
   * flight on the same track, settle it first so the caller's `await`
   * doesn't dangle when its track is hijacked.
   */
  playBlur(): void {
    if (!this._currentSpine) return;
    const name = this._animNameFor('blur');
    if (!this._currentSpine.skeleton.data.findAnimation(name)) return;
    // Idempotent: the reel re-notifies spin state on mid-spin symbol
    // installs; restarting the loop each time would snap it to frame 0.
    if (this._currentSpine.state.getCurrent(0)?.animation?.name === name) return;
    this._settleOneShot(0);
    this._currentSpine.state.setAnimation(0, name, true);
  }

  /**
   * Play an arbitrary animation on a given track. Non-blocking: returns the
   * track entry, for a loop or for setting the entry up yourself. To wait for
   * a one-shot and have the track go back to idle (or clear) after it, use
   * {@link SpineReelSymbol.playOneShot}.
   */
  playOnTrack(track: number, animName: string, loop = false): TrackEntry | null {
    if (!this._currentSpine) return null;
    if (!this._currentSpine.skeleton.data.findAnimation(animName)) return null;
    return this._currentSpine.state.setAnimation(track, animName, loop);
  }

  stopAnimation(): void {
    if (!this._currentSpine) return;
    const spine = this._currentSpine;
    // Every one-shot stops: a pending promise settles, and an overlay
    // one-shot on a higher track is cleared off the symbol, whether it is
    // still playing or already holding its last frame.
    for (const track of [...this._oneShots.keys()]) {
      this._settleOneShot(track);
      if (track !== 0) spine.state.setEmptyAnimation(track, 0);
    }
    for (const track of [...this._heldOverlays.keys()]) spine.state.setEmptyAnimation(track, 0);
    this._heldOverlays.clear();
    const idleName = this._animNameFor('idle');
    if (spine.skeleton.data.findAnimation(idleName)) {
      spine.state.setAnimation(0, idleName, true);
    }
  }

  /** Access the underlying Spine. for advanced needs (reactions, events). */
  get spine(): Spine | null {
    return this._currentSpine;
  }

  // -- Internals -----------------------------------------------------------

  /**
   * Settle the one-shot in flight on `track`, if any: drop its track entry's
   * listener and resolve its promise. Called before a new one-shot takes the
   * track, by `playBlur` (track 0), and from the one-shot's own completion
   * and interruption callbacks, which pass their `entry` so a late event of
   * an old one-shot cannot settle a newer one. `true` when it settled one.
   */
  private _settleOneShot(track: number, entry?: TrackEntry): boolean {
    const pending = this._oneShots.get(track);
    // From a listener: only its own one-shot, never a newer one on the track.
    if (!pending || (entry !== undefined && pending.entry !== entry)) return false;
    this._oneShots.delete(track);
    // Spine pools its track entries: a listener left on this one would fire
    // for whatever animation reuses it.
    pending.entry.listener = null;
    pending.resolve();
    return true;
  }

  /**
   * Remember an overlay one-shot that ended on its last frame, until
   * `stopAnimation()` clears it or anything else takes the track.
   */
  private _holdOverlay(track: number, entry: TrackEntry): void {
    this._heldOverlays.set(track, entry);
    const release = (): void => {
      if (this._heldOverlays.get(track) === entry) this._heldOverlays.delete(track);
      entry.listener = null;
    };
    entry.listener = { interrupt: release, end: release };
  }

  /**
   * Settle every one-shot in flight, on every track. Called when the symbol
   * is recycled (`onActivate` / `onDeactivate`), so no caller's `await`
   * outlives the animation it was waiting on.
   */
  private _settleOneShots(): void {
    for (const track of [...this._oneShots.keys()]) this._settleOneShot(track);
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
