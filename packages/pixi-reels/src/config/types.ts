import type { Container, Ticker } from 'pixi.js';
import type { TumbleConfig } from '../cascade/TumbleConfig.js';

/**
 * Options accepted by `reelSet.spin(options?)`. All fields are optional.
 * passing nothing reproduces the legacy "every reel spins" behaviour.
 */
export interface SpinOptions {
  /**
   * Phase chain selector for this spin.
   * `'cascade'` requires `.tumble(...)` on the builder.
   */
  mode?: 'standard' | 'cascade';

  /**
   * Reel indices to HOLD this spin. Held reels skip START / SPIN / STOP
   * entirely and stay on whatever symbols they're currently showing.
   * They count as already-landed for the `spin:allLanded` resolver. only
   * non-held reels actually animate.
   *
   * Use cases:
   *   - Hold & Win respins (most reels held, one or two reroll)
   *   - Sticky / expanding wilds during a feature spin
   *   - Bonus respin where the trigger column stays in place
   *
   * Notes:
   *   - `setResult(grid)` still expects a full `reelCount`-length grid;
   *     entries at held indices are ignored. Pass anything (including
   *     the held reels' current visible cells). the engine doesn't read
   *     held columns.
   *   - `setAnticipation([...])` silently filters held indices.
   *   - `setStopDelays([...])` entries at held indices are ignored.
   *   - The resolved `SpinResult.symbols` is the full visible grid AFTER
   *     the spin lands. held reels contribute their unchanged cells,
   *     non-held reels contribute their landed cells.
   *   - No `spin:reelLanded` / `spin:stopping` event fires for held reels.
   *   - Big-symbol blocks crossing held into non-held reels are not
   *     supported. the engine doesn't reposition or reshape held reels
   *     to accommodate them. Author results that keep big symbols inside
   *     a contiguous run of non-held reels.
   *   - Indices outside `[0, reelCount)` and duplicate entries are silently
   *     filtered.
   */
  holdReels?: number[];

  /**
   * Abort the spin from the outside. If this signal aborts before the reels
   * land, the `spin()` promise REJECTS — with `signal.reason` when it is an
   * `Error`, otherwise a generic abort error — and the reels are force-stopped
   * to a clean grid. Wire this to the same `AbortController` that cancels the
   * spin's server request so a failed or cancelled fetch can never leave the
   * reels spinning forever.
   */
  signal?: AbortSignal;

  /**
   * Watchdog ceiling, in milliseconds. If the reels have not landed within
   * `timeoutMs` of `spin()` starting (i.e. `setResult()` / `requestSkip()` /
   * `slamStop()` was never called), the `spin()` promise REJECTS and the reels
   * are force-stopped to a clean grid.
   *
   * Off by default — the engine imposes no timeout. Opt in for defence in depth
   * against an integration whose error path forgets to settle the spin. Values
   * `<= 0` are ignored.
   */
  timeoutMs?: number;
}

/**
 * Which reels a `slamStop()` call lands. Omit the argument entirely to land
 * every un-landed reel (the default hard slam).
 *
 * Exactly one of `reels` / `except` may be given. Out-of-range indices are
 * ignored; held and already-landed reels are never slammed.
 */
export interface SlamOptions {
  /** Land ONLY these reels. Every other reel keeps spinning through its phase chain. */
  reels?: number[];
  /** Land every un-landed reel EXCEPT these. The complement of `reels`. */
  except?: number[];
}

/**
 * What a skip press does to the reels it frees.
 *
 *   - `'slam'` (the default): place each freed reel on its result frame and
 *     land it in the same tick. The cut.
 *   - `'quicken'`: ask each freed reel for its landing sooner without changing
 *     what the landing looks like. A tease ends, a stop delay is cut, the
 *     spin-out and bounce still play. A phase that does not know how to be
 *     quickened runs its course, so the reel still lands.
 *
 * Which reels a press frees (tease protection, `'stepwise'`, reel groups) is
 * the same in both modes; only what freeing means differs.
 */
export type SkipMode = 'slam' | 'quicken';

/**
 * Options for `requestSkip()` / `skipSpin()`, and for `board.skip()`.
 */
export interface SkipOptions {
  /** See {@link SkipMode}. Defaults to the builder's `skipMode()`, `'slam'` unless set. */
  mode?: SkipMode;
  /**
   * Registered speed profile the freed reels finish on under `'quicken'`: its
   * `spinSpeed` is the spin-out, its `bounceDistance` / `bounceDuration` the
   * landing. Omit to keep the profile the spin started on. The common tuning
   * is a pressed reel that lands on the turbo bounce. Ignored by a slam.
   */
  speed?: string;
  /**
   * Anything the game wants a phase to see in `onSkip(ctx)`, and any listener
   * to see on `skip:requested` / `skip:completed` and `SpinResult.skipContext`:
   * which button, which player, a reason. Passed through untouched.
   */
  payload?: unknown;
}

/**
 * What a phase receives in `onSkip(ctx)`: the mode of the press that reached
 * it, the profile it should finish on (a `'quicken'` that named one), and
 * whatever the game attached. See {@link SkipOptions}. The same press rides
 * on `skip:requested` / `skip:completed` (as `SkipInfo`, with the reels) and
 * ends up in `SpinResult.skipContext`.
 */
export interface SkipContext<TProfile extends SpeedProfile = SpeedProfile> {
  mode: SkipMode;
  speed?: TProfile;
  payload?: unknown;
}

/**
 * How the START of each anticipation reel's slow-down is spaced (offsets are
 * by tease-order, i.e. position within the anticipation set, not raw reel
 * index):
 *   - `0` (default) — every anticipation reel begins slowing together.
 *   - `number` — reel at tease-order `k` starts `k * value` ms after the first.
 *   - `number[]` — explicit per-tease-order offset in ms.
 *   - `'sequential'` — each reel waits until the previous anticipation reel
 *     has fully landed before it starts.
 */
export type AnticipationStagger = number | number[] | 'sequential';

/**
 * Progressive slow-down across the tease sequence. Values interpolate linearly
 * across tease-order (first anticipation reel → last), so each successive reel
 * decelerates deeper and/or holds longer than the one before it. This is what
 * turns a flat "everyone drops to 30%" tease into an escalating "each reel
 * crawls slower than the last" build-up.
 */
export interface AnticipationSlowdown {
  /** Speed multiplier (fraction of spin speed) the FIRST tease reel slows to. Default `0.3`. */
  from?: number;
  /** Speed multiplier the LAST tease reel slows to. Default = `from` (flat). Lower = slower/more tension. */
  to?: number;
  /** Hold-duration multiplier for the FIRST tease reel (scales `anticipationDelay`). Default `1`. */
  holdFrom?: number;
  /** Hold-duration multiplier for the LAST tease reel. Default = `holdFrom`. `>1` = later reels hold longer. */
  holdTo?: number;
}

/**
 * One leg of an {@link AnticipationCurve}: reach a speed, optionally sit there.
 *
 * Speeds are multiples of the active profile's `spinSpeed`, so `0.15` is a
 * crawl, `1` is normal, and `1.8` is a surge - the tease is not obliged to
 * slow down.
 */
export interface AnticipationSegment {
  /** Target speed as a multiple of `spinSpeed`. Must be >= 0. */
  speed: number;
  /** Milliseconds to get there from whatever the reel is doing now. */
  duration: number;
  /**
   * GSAP ease for the transition. Default `'power2.inOut'`.
   *
   * The default deliberately differs from the legacy `power2.out`. An ease-out
   * applied to a SPEED value means the deceleration is at its maximum on the
   * first frame and decays from there - acceleration steps from nothing to its
   * peak instantly, which is why the old tease reads as a setting change rather
   * than as the reel slowing down. An `inOut` ease ramps the acceleration in and
   * out, which is the S-shape a pedal produces.
   */
  ease?: string;
  /** Milliseconds to hold this speed once reached. Default `0`. */
  hold?: number;
}

/**
 * The shape of a tease, as a list of speed legs played in order.
 *
 * Pass a function to vary the curve per reel: `order` is the reel's place in
 * the anticipation set (`0` for the first tease reel) and `total` is how many
 * are teasing, so the last reel can crawl deeper or hold longer than the first
 * without hand-writing every reel's curve.
 *
 * @example
 * // Surge, then crawl. The classic modern tease.
 * curve: [
 *   { speed: 1.8,  duration: 220, ease: 'power2.in' },
 *   { speed: 0.12, duration: 700, ease: 'power3.inOut', hold: 400 },
 * ]
 *
 * @example
 * // Each successive reel crawls slower and holds longer.
 * curve: (order, total) => {
 *   const f = total > 1 ? order / (total - 1) : 0;
 *   return [{ speed: 0.4 - 0.3 * f, duration: 300, hold: 200 + 400 * f }];
 * }
 */
export type AnticipationCurve =
  | AnticipationSegment[]
  | ((order: number, total: number) => AnticipationSegment[]);

/**
 * How far a tease runs, in symbol pitches.
 *
 * Takes the same function form as {@link AnticipationCurve}, and for the same
 * reason: the last reel of a sweep usually wants to run further than the first,
 * and one number cannot say that. `order` is the reel's place in the
 * anticipation set, `total` is how many are teasing.
 *
 * @example
 * // One more symbol of travel per reel across the sweep.
 * cells: (order) => 2 + order
 */
export type AnticipationCells = number | ((order: number, total: number) => number);

/**
 * How a tease resists a skip press. Skip granularity is otherwise all-or-nothing:
 * a slam force-completes every phase including `AnticipationPhase`, so a player
 * who presses skip never sees that the spin was teasing at all.
 *
 *   - `false` (default) — no protection. A skip press lands every reel, tease
 *     included. This is the pre-2.3 behaviour.
 *   - `'once'` (or `true`) — the first skip press of the round lands every
 *     NON-tease reel immediately and leaves the tease reels running, so the
 *     trigger symbols are on screen and the tease is visibly under way. The
 *     next press lands the tease too. Protection is spent after that first
 *     press, hence "once".
 *   - `'stepwise'` — the first press lands every non-tease reel, and each press
 *     after that releases the NEXT tease reel on its own, in tease order. The
 *     player keeps pressing to walk the tension forward one reel at a time
 *     instead of ending it in one go. The press that releases the last tease
 *     reel is the round-ending press and carries the round's side effect.
 *   - `'always'` — a skip press never ends a tease. Non-tease reels land
 *     immediately on every press; tease reels always play out in full.
 *
 * For any grouping other than these, drive it from game code with
 * `slamStop({ reels })`: `'always'` keeps a press from ending a tease, and
 * your own handler lands whichever group it wants per press.
 *
 * Protection applies to the player-facing entry points `skip()` and
 * `requestSkip()`. `slamStop()` stays an unconditional land-now (pass its
 * `reels` / `except` options for a deliberate partial slam).
 *
 * Protection is inert when the tease would not play anyway — an effective hold
 * of `0` ms, as in the Turbo / SuperTurbo profiles with no `duration` override.
 * There is no tease to protect there, so every press lands everything, and a
 * protected spin is indistinguishable from an ordinary one.
 */
export type AnticipationProtect = boolean | 'once' | 'stepwise' | 'always';

/** Full anticipation configuration. The object form of `setAnticipation`'s second argument. */
export interface AnticipationOptions {
  stagger?: AnticipationStagger;
  slowdown?: AnticipationSlowdown;
  /**
   * Guarantee the tease becomes visible before a skip press can end it. See
   * {@link AnticipationProtect}. Default `false`.
   */
  protect?: AnticipationProtect;
  /**
   * Explicit tease hold in ms, overriding the active speed profile's
   * `anticipationDelay`. Pass a positive value to keep the tease playing in
   * Turbo / SuperTurbo (whose profiles set `anticipationDelay: 0`, which would
   * otherwise skip anticipation entirely). When `slowdown.holdFrom/holdTo` are
   * also set, this is the base they scale.
   *
   * With a `curve`, this is the gate that decides whether the tease runs at all
   * (it must be > 0 in Turbo); the curve's own segment durations set the
   * length. With `cells` it is additionally the backstop on the FINAL leg - the
   * longest the tease will wait for the travel target once the curve has
   * played - so the tease can run for as long as the curve plus this value.
   */
  duration?: number;
  /**
   * Shape the tease as an explicit sequence of speed legs instead of the fixed
   * decelerate-then-hold. See {@link AnticipationCurve}. This is what makes a
   * surge-then-crawl tease expressible, and what replaces the ease-on-a-speed
   * feel with a ramped one.
   *
   * Mutually exclusive with `slowdown`, which is sugar for a two-leg curve;
   * passing both throws rather than silently picking one.
   */
  curve?: AnticipationCurve;
  /**
   * End the tease after the reel has travelled this many symbol pitches,
   * instead of after a fixed time. See {@link AnticipationCells}.
   *
   * `duration` is a time budget, so how far the reel actually moves during a
   * tease depends on the speed curve: two reels teasing at different speeds
   * pass a different number of symbols. Anchor to travel when the tease is cut
   * to symbols going past the window; anchor to time when it is cut to an audio
   * bed.
   *
   * The anchor applies to the **final leg** of a curve: earlier legs play in
   * full, and the last one holds until the target is met instead of for its
   * scripted `hold`. (Measuring from the start of the tease instead would let a
   * fast opening segment burn the whole budget and silently delete the legs
   * after it.)
   *
   * The reel must actually be moving: a final leg at speed `0` can never reach
   * the target, so `duration` runs as the backstop and a notice is emitted.
   */
  cells?: AnticipationCells;
}

/**
 * The flat timing fields every speed profile has carried since v1.
 *
 * This is the whole of a profile's own shape; {@link SpeedProfile} adds the
 * optional per-phase sections on top of it.
 */
export interface SpeedProfileBase {
  readonly name: string;
  /** Milliseconds between each reel starting to spin. */
  readonly spinDelay: number;
  /** Pixels per frame at full spin speed. */
  readonly spinSpeed: number;
  /** Milliseconds between each reel stopping. */
  readonly stopDelay: number;
  /** Milliseconds to hold anticipation phase. */
  readonly anticipationDelay: number;
  /** Pixels of overshoot when reel lands. */
  readonly bounceDistance: number;
  /** Milliseconds for bounce-back animation. */
  readonly bounceDuration: number;
  /**
   * Optional GSAP ease for each leg of the landing bounce. Default
   * `'power1.out'`. The third of the bounce's three numbers, beside
   * `bounceDistance` and `bounceDuration`; `bounce({ ease })` still wins over
   * it, as every {@link BounceOptions} field wins over the profile's.
   */
  readonly bounceEase?: string;
  /** Optional GSAP ease string for acceleration. Default: 'power2.in'. */
  readonly accelerationEase?: string;
  /**
   * @deprecated Does nothing, and never did: no phase reads it. It names a
   * deceleration phase the engine does not have — a stop is a spin-out plus a
   * bounce. If you set it meaning the landing's ease, that is
   * {@link SpeedProfileBase.bounceEase}, which `phase.bounce()` does read.
   * Removed in the next major.
   */
  readonly decelerationEase?: string;
  /** Milliseconds for acceleration phase. Default: 300. */
  readonly accelerationDuration?: number;
  /** Minimum spin time in ms before stop is allowed. Default: 500. */
  readonly minimumSpinTime?: number;
  /**
   * Optional per-speed tumble timing overrides. When the active speed
   * profile defines this, the cascade fall + drop-in phases merge these
   * fields over the base config registered via `.tumble(...)` at build
   * time. `setSpeed('turbo')` can shorten `fall.duration`,
   * `dropIn.duration`, per-cell staggers, and the drop ease without the
   * caller maintaining a parallel `setTumble` API.
   *
   * Fields are deep-merged with `Partial` semantics: omitted fields fall
   * back to the base config. To suppress the cascade animation entirely
   * for a profile (the canonical "snap on turbo" pattern), set
   * `fall.duration: 0` and `dropIn.duration: 0`. both phases short-circuit
   * to their existing snap path.
   *
   * Phases capture the resolved config at `onEnter` time, so a `setSpeed`
   * call between two refills picks up the new timings on the next refill.
   * In-flight tweens keep their construction-time timings (mid-tween
   * mutation is not supported).
   */
  readonly tumble?: TumbleConfig;
}

/**
 * The flat timing fields a phase section may restate for itself.
 *
 * Every field keeps the name and the meaning it has at the top level of a
 * profile, so a step reads `spinSpeed` the same way whether the game set it
 * profile-wide or only for that phase. `name` and `tumble` describe the
 * profile as a whole and cannot be sectioned.
 */
export type PhaseTiming = Partial<Omit<SpeedProfileBase, 'name' | 'tumble'>>;

/**
 * Overrides for one named step of a phase. A step reads whichever of these
 * its own work uses; the built-in steps read `ease` and `duration`.
 */
export interface StepTiming {
  /** GSAP ease for whatever this step tweens. */
  readonly ease?: string;
  /** Milliseconds this step takes. For a step that only waits, the wait itself. */
  readonly duration?: number;
}

/**
 * A section's contents, without the anticipated variant. Split out so
 * {@link PhaseSection} can reuse it for `whenAnticipated` without letting
 * that variant carry a variant of its own.
 */
export type PhaseSectionBody<TSteps, TExtra = unknown> = PhaseTiming &
  TExtra & {
    /**
     * Per-step overrides, keyed by the step's name. A list is for a step
     * written to run several segments in a row (a two-stage acceleration);
     * the built-in steps read the first entry only.
     */
    readonly steps?: { readonly [K in keyof TSteps]?: TSteps[K] | readonly TSteps[K][] };
  };

/**
 * One phase's slice of a speed profile: the flat fields it wants different
 * from the profile's own, the config of its named steps, and the variant to
 * merge on top when the reel teased earlier in the spin.
 *
 * @typeParam TSteps - The phase's step names mapped to each step's config.
 * @typeParam TExtra - Extra fields this phase reads that are not profile timings.
 */
export type PhaseSection<
  TSteps = Record<string, StepTiming>,
  TExtra = unknown,
> = PhaseSectionBody<TSteps, TExtra> & {
  /**
   * Merged over the rest of this section when the reel ran an anticipation
   * tease earlier in the same spin. Does not nest a variant of its own.
   */
  readonly whenAnticipated?: PhaseSectionBody<TSteps, TExtra>;
};

/**
 * Every phase that may carry a section on a speed profile, mapped to that
 * section's shape. The built-ins are listed here; a game declares its own
 * custom phases by merging into this interface, which is what gives a
 * custom section a real type instead of an opaque object:
 *
 * @example
 * declare module 'pixi-reels' {
 *   interface PhaseProfiles {
 *     'bigwin:flash': PhaseSection<{ pulse: StepTiming }, { flashes: number }>;
 *   }
 * }
 *
 * // Checked, and autocompleted, like any built-in section:
 * reelSet.speed.addProfile('cinematic', {
 *   ...SpeedPresets.NORMAL,
 *   'bigwin:flash': { flashes: 3, steps: { pulse: { duration: 120 } } },
 * });
 */
export interface PhaseProfiles {
  start: PhaseSection<{
    delay: StepTiming;
    launch: StepTiming;
    pull: StepTiming;
    accelerate: StepTiming;
    announce: StepTiming;
  }>;
  spin: PhaseSection<Record<never, StepTiming>>;
  anticipation: PhaseSection<{ tease: StepTiming }>;
  stop: PhaseSection<{
    delay: StepTiming;
    spinOut: StepTiming;
    land: StepTiming;
    bounce: StepTiming;
  }>;
  adjust: PhaseSection<Record<never, StepTiming>>;
  'cascade:fall': PhaseSection<Record<never, StepTiming>>;
  'cascade:place': PhaseSection<Record<never, StepTiming>>;
  'cascade:dropIn': PhaseSection<Record<never, StepTiming>>;
}

/** One optional section per entry in {@link PhaseProfiles}. */
export type PhaseSections = { readonly [K in keyof PhaseProfiles]?: PhaseProfiles[K] };

/**
 * Timing and animation profile for a speed mode.
 *
 * The flat fields ({@link SpeedProfileBase}) are the profile's contract and
 * have not moved: a phase that always read `profile.spinSpeed` still does.
 * On top of them a profile may carry one optional section per phase, which
 * restates any of those fields for that phase alone, configures the phase's
 * named steps, and can vary itself for a reel that teased:
 *
 * @example
 * const normal = {
 *   name: 'normal',
 *   spinDelay: 0,
 *   spinSpeed: 200,
 *   stopDelay: 140,
 *   anticipationDelay: 450,
 *   bounceDistance: 80,
 *   bounceDuration: 600,
 *   stop: {
 *     bounceDistance: 40,
 *     steps: { bounce: { ease: 'power1.out' } },
 *     whenAnticipated: { steps: { bounce: { ease: 'sine.out' } } },
 *   },
 * } satisfies SpeedProfile;
 */
export type SpeedProfile = SpeedProfileBase & PhaseSections;

/** Per-symbol configuration data. */
export interface SymbolData {
  /** Relative weight for random generation (higher = more frequent). */
  weight: number;
  /** Display layering order. Higher = in front. */
  zIndex?: number;
  /**
   * If true, the engine parents this symbol's view to
   * `viewport.unmaskedContainer` instead of the reel's masked container.
   * the symbol renders above the reel mask, useful for oversized win
   * animations (expanding wilds, splash frames) that should not be
   * clipped at the cell boundary.
   *
   * **At-rest presentation:** unmask lifts a symbol above the mask ONLY
   * while its reel is stopped. On `notifyLanded` each visible-cell instance
   * is re-parented into `viewport.unmaskedContainer` (X = `reel.container.x`,
   * Y = `reel.container.y + reelLocalY` so it lines up with its grid cell);
   * the instant the reel starts moving again it is pulled back into the
   * masked reel container. So while spinning, an unmasked id is masked like
   * everything else. nothing scrolls above the grid, and buffer cells are
   * never lifted. If you need a symbol to stay above the mask *while the
   * reel moves*, use a cell pin instead.
   *
   * **Works on jagged/pyramid layouts:** a reel with non-zero `mainOffset`
   * is handled. `Reel._syncUnmaskedViewOffsets()` re-bakes `container.y`
   * into lifted views after every absolute `motion.snapToGrid()` (which
   * writes bare reel-local Y); `advance()` is incremental and preserves
   * the offset. Because lifted views exist only at rest, the frequent
   * mid-spin snaps never touch them.
   *
   * **Mask-strategy auto-pick:** when any registered symbol sets
   * `unmask: true` and `symbolGap.x > 0`, the builder switches the
   * default `RectMaskStrategy` to `SharedRectMaskStrategy` so that
   * neighboring (masked) symbols don't get clipped at the column gap
   * next to the unmasked overlay. Passing `.maskStrategy(...)`
   * explicitly always wins. For symbols that need to overlap across
   * reel boundaries while unmasked, prefer `SharedRectMaskStrategy`.
   */
  unmask?: boolean;
  /**
   * Footprint in cells. Default `{ reels: 1, cells: 1 }`. When `reels * cells > 1` this
   * symbol is a "big symbol". at landing it occupies a `reels × cells` block of
   * cells anchored at the (reel, cell) where its id appears in the result.
   * Big-symbol registration is rejected on MultiWays slots.
   */
  size?: { reels: number; cells: number };
}

/** How to vertically align reels of differing pixel heights. */
export type ReelAnchor = 'start' | 'center' | 'end';

/**
 * Render order along an axis.
 *
 *   - `'ascending'` (default). the cell / reel at the LARGER coordinate
 *     draws on top: the bottom cell in front of the top one, the last reel
 *     in front of the first.
 *   - `'descending'`. the reverse.
 *
 * Deliberately geometric, not travel-relative: flipping a reel's direction
 * never changes which symbol overlaps which. Art lit from above keeps
 * reading correctly on a roll-up reel, and a per-spin reversal tease does
 * not re-stack the strip mid-game.
 */
export type Stacking = 'ascending' | 'descending';

/**
 * MultiWays configuration knobs. Set via `builder.multiways({ ... })`.
 * mutually exclusive with big-symbol registration.
 */
export interface MultiWaysConfig {
  /** Minimum visible cells the server can request. Inclusive. */
  minCells: number;
  /** Maximum visible cells the server can request. Inclusive. */
  maxCells: number;
  /**
   * Pixel height of every reel box. Cell height per reel becomes
   * `reelExtent / visibleCells[i]` after each reshape.
   */
  reelExtent: number;
}

/** Configuration for the reel grid layout. */
export interface ReelGridConfig {
  /** Number of reel columns. */
  reelCount: number;
  /**
   * Default visible cells when all reels are uniform. Ignored if
   * `visibleCellsPerReel` is set.
   */
  visibleCells: number;
  /**
   * Per-reel cell counts (static shape). Length MUST equal `reelCount`.
   * Example: `[3, 5, 5, 5, 3]` for a pyramid layout. Mutually exclusive
   * with the scalar `visibleCells` field at the builder level.
   */
  visibleCellsPerReel?: number[];
  /** Symbol width in pixels. */
  symbolWidth: number;
  /** Symbol height in pixels. Used as the SPIN-time uniform cell height. */
  symbolHeight: number;
  /**
   * Per-reel pixel-box heights. Length MUST equal `reelCount` when set.
   * For MultiWays: every entry is the same fixed reel height. For static
   * pyramids: defaults to `visibleCellsPerReel[i] * symbolHeight`.
   */
  reelExtents?: number[];
  /**
   * How short reels align vertically inside the tallest reel's height.
   * Default: 'center'.
   */
  reelAnchor?: ReelAnchor;
  /** Gap between symbols. Default: { x: 0, y: 0 }. */
  symbolGap?: { x: number; y: number };
  /** Number of buffer symbols above and below the visible area. Default: 1. */
  bufferSymbols?: number;
  /**
   * MultiWays configuration. Set by `builder.multiways(...)`. When present:
   *   - `setShape(cellsPerReel)` becomes callable mid-spin
   *   - AdjustPhase is inserted between SPIN and STOP
   *   - big-symbol registration throws at build time
   */
  multiways?: MultiWaysConfig;
}

/** Extra symbols above/below config per reel. */
export interface ReelExtraSymbols {
  symbolsAbove: number;
  symbolsBelow: number;
}

/** Offset modes for X-axis symbol positioning. */
export type CrossOffsetMode = 'none' | 'trapezoid';

/** Trapezoid perspective configuration. */
export interface TrapezoidConfig {
  mode: 'trapezoid';
  widthDifference: number;
  startFactor: number;
  endFactor: number;
}

/** No offset configuration. */
export interface NoOffsetConfig {
  mode: 'none';
}

export type OffsetConfig = TrapezoidConfig | NoOffsetConfig;

/**
 * One cell's projected footprint on a curved reel: the four corners of the
 * quad the symbol should render into, replacing its flat rectangle.
 *
 * Corners are SCREEN-space and LOCAL to the symbol view's own origin, in the
 * order PixiJS `PerspectiveMesh` wants them - clockwise from top-left - in
 * every orientation, because symbol art stays upright however the strip
 * travels. `width` / `height` describe the flat cell box the quad replaces, so
 * a symbol can work out its own scale without having to remember what
 * `resize()` said.
 *
 * Built by `ReelCurve.quadFor()`, consumed by `ReelSymbol.applyCellQuad()`.
 * It lives here rather than next to `ReelCurve` so `symbols/` can name it
 * without importing `core/` and inverting the dependency flow.
 */
export interface ReelCellQuad {
  /** Flat box's left edge, view-local. Non-zero when the symbol set an inset. */
  x: number;
  /** Flat box's top edge, view-local. */
  y: number;
  /** Flat box width in screen pixels. */
  width: number;
  /** Flat box height in screen pixels. */
  height: number;
  /** Top-left. */
  x0: number;
  y0: number;
  /** Top-right. */
  x1: number;
  y1: number;
  /** Bottom-right. */
  x2: number;
  y2: number;
  /** Bottom-left. */
  x3: number;
  y3: number;
}

/**
 * The part of its cell a symbol's art actually covers, as fractions of the flat
 * cell box in SCREEN space (`0,0` top-left to `1,1` bottom-right).
 *
 * Most slot art does not fill its cell: a trimmed atlas frame is typically a
 * small shape floating in a much larger transparent box. Projecting the whole
 * cell and stretching that art across it would blow the symbol up to the cell's
 * edges and give it the cell's keystone instead of its own. Reporting the inset
 * instead means the drum projects the rectangle the art is really in.
 *
 * Returned by `ReelSymbol.cellInset`; `null` means "my art fills the cell".
 */
export interface ReelCellInset {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 2D matrix type (reel × cell). */
export type Matrix<T> = T[][];

/** 2D position. */
export interface Position {
  x: number;
  y: number;
}

/**
 * Axis-aligned bounding box of a single grid cell in ReelSet-local
 * coordinates. Returned by `reelSet.getCellBounds(reel, cell)`.
 *
 * Use this to draw paylines, hit areas, debug overlays, or any graphic
 * that needs to align precisely with a visible symbol cell.
 */
export interface CellBounds {
  /** Left edge of the cell in ReelSet-local pixels. */
  x: number;
  /** Top edge of the cell in ReelSet-local pixels. */
  y: number;
  /** Cell width. equals the configured symbol width. */
  width: number;
  /** Cell height. equals the configured symbol height. */
  height: number;
}

/** A cell on the visible grid. `reelIndex` is the column; `cellIndex` is the cell from the top. */
export interface SymbolPosition {
  reelIndex: number;
  cellIndex: number;
  /**
   * Which reel set the position belongs to, when a game composes more than
   * one (a banner reel above a main grid, a bonus board beside it). Omitted
   * means "the only set". The engine never reads it; it exists so a
   * stage-level presenter can tell two identical `(reelIndex, cellIndex)`
   * pairs apart without wrapping every position in another object.
   */
  setId?: string;
}

/**
 * One "win" as the presenter sees it: an ordered set of cells to highlight.
 *
 * Use cases collapse onto this one shape. whether those cells came from a
 * classic payline ("cell 1 across all 5 reels"), a cascade pop ("this cluster
 * vanished"), a scatter splash, or a bonus reveal.
 *
 * The presenter's job is to **animate these cells**. Anything beyond that.
 * drawing a polyline, a cluster outline, a number popup, a sound cue. is
 * user-land code reacting to the `win:*` events. pixi-reels never draws wins.
 *
 * Order of `cells` matters when `WinPresenter.stagger > 0` (e.g. a
 * left-to-right sweep): cell N starts animating `stagger` ms after cell N-1.
 * Pass the cells in the order you want the sweep to run.
 */
export interface Win {
  /** Cells to highlight. Order matters when `stagger > 0`. */
  cells: ReadonlyArray<SymbolPosition>;
  /** Optional payout. used for the default value-desc sort. */
  value?: number;
  /** Optional tag for routing events to different handlers. */
  kind?: string;
  /** Optional stable id so event consumers can key per-win state. */
  id?: number;
}

/** Mask configuration for the reel viewport. */
export interface MaskConfig {
  mask: Container;
  position: Position;
}

/**
 * Resolved grid view used internally. every defaulted field is filled in,
 * but per-reel-shape and MultiWays extensions stay optional because they're
 * genuinely opt-in.
 */
export interface ResolvedReelGridConfig {
  reelCount: number;
  visibleCells: number;
  symbolWidth: number;
  symbolHeight: number;
  symbolGap: { x: number; y: number };
  /** Buffer cells above the visible window (also the legacy symmetric count). */
  bufferSymbols: number;
  /**
   * Buffer cells below the visible window. Usually equals `bufferSymbols`;
   * `0` on tumble-only sets built with `bufferSymbols({ start, end: 0 })`.
   */
  bufferEnd: number;
  visibleCellsPerReel?: number[];
  reelExtents?: number[];
  reelAnchor: ReelAnchor;
  multiways?: MultiWaysConfig;
}

/** Full internal configuration assembled by the builder. */
export interface ReelSetInternalConfig {
  grid: ResolvedReelGridConfig;
  symbols: Record<string, SymbolData>;
  speeds: Map<string, SpeedProfile>;
  initialSpeed: string;
  offset: OffsetConfig;
  ticker: Ticker;
}

/**
 * What a symbol is told about where it landed. Handed to
 * `ReelSymbol.onReelLanded(ctx)` by the engine on every landing path, so a
 * symbol can decide what its landing beat is on THIS reel and cell - or that
 * it has none here - without the game reaching into the reel to find out.
 */
export interface ReelLandingContext {
  /** Index of the reel that landed. */
  reelIndex: number;
  /** Reels in the set. `1` for a Hold & Win cell (each cell is its own set). */
  reelCount: number;
  /** 0-based visible cell the symbol landed in (0 = the reel's first visible cell). */
  cell: number;
  /** Visible cells on this reel. Varies per reel on a pyramid / MultiWays set. */
  visibleCells: number;
  /** The id the symbol shows. */
  symbolId: string;
}

/**
 * Everything a {@link SymbolZIndexResolver} is asked about. Built by the reel
 * once per symbol per z-index refresh.
 */
export interface SymbolZIndexContext {
  symbolId: string;
  /** Resolved static metadata for this id (weight / zIndex / unmask / size). */
  symbolData: SymbolData;
  reelIndex: number;
  reelCount: number;
  /** Index in the reel's strip array - what the default formula uses. */
  arrayIndex: number;
  /**
   * 0-based visible cell, or `null` for a buffer slot. A big symbol reports
   * the cell its anchor sits in.
   */
  visibleCell: number | null;
  /** Visible cells on THIS reel (varies per reel on a pyramid / MultiWays set). */
  visibleCells: number;
  /**
   * `true` while the reel is fully at rest, i.e. `unmask` symbols are lifted
   * into the viewport's shared `unmaskedContainer`, where a z-index orders
   * them against every other lifted symbol in the set. `false` from the
   * first frame of motion to the landing.
   */
  atRest: boolean;
  /**
   * What the engine would have used without a resolver:
   * `symbolData.zIndex * 100 + cellStackingIndex`. Return it for ids the
   * resolver does not care about.
   */
  defaultZIndex: number;
}

/**
 * Replaces the engine's z-index formula for symbol views. See
 * `ReelSetBuilder.symbolZIndex`. Must be pure and cheap: it is called once
 * per symbol per refresh, and a refresh follows every wrap, snap, swap and
 * rest transition.
 */
export type SymbolZIndexResolver = (ctx: SymbolZIndexContext) => number;

/**
 * The z-index values the engine reserves, so a {@link SymbolZIndexResolver}
 * can be bounds-checked against the library instead of a copied literal.
 *
 * | Layer | zIndex |
 * |---|---|
 * | 1x1 symbol, default (`symbolData.zIndex` 1) | `1 * symbolLayer + arrayIndex` |
 * | Big-symbol anchor, recipe convention (`zIndex: 5`) | `5 * symbolLayer + arrayIndex` |
 * | Pin overlay (sticky / expanding wild during spin) | `pinOverlay` |
 *
 * A symbol that must draw above pin overlays is re-parented to
 * `viewport.spotlightContainer` instead - that is its own layer above them.
 */
export const Z_INDEX_BUDGET = {
  /** Multiplier on `symbolData.zIndex`; leaves room for per-cell stacking inside one layer. */
  symbolLayer: 100,
  /** Pin overlays. Keep every symbol z-index below this. */
  pinOverlay: 10000,
} as const;
