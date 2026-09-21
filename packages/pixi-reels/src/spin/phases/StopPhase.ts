import type { Reel } from '../../core/Reel.js';
import type { SkipContext, SpeedProfile } from '../../config/types.js';
import { ReelPhase } from './ReelPhase.js';
import { step } from './steps.js';
import type { PhaseStep, StepContext, StepsEditor } from './steps.js';

export interface StopPhaseConfig {
  /** Target symbols for this reel (full frame including buffers, top-to-bottom). */
  targetFrame: string[];
  /** Delay before this reel starts stopping (for staggered stop). */
  delay?: number;
  /**
   * Keep the reel's CURRENT speed into the spin-out instead of restoring full
   * spin speed. Set by the controller when this stop follows an anticipation
   * tease, so the reel crawls its target into place at the slow anticipation
   * speed and stops exactly there. rather than snapping back to full speed and
   * doing a fast spin-out. A small floor is applied so a `slowdown.to: 0`
   * curve can't stall the reel.
   */
  preserveSpeed?: boolean;
}

/** What a game hands `StopPhase` through `f.register('stop', StopPhase, options)`. */
export interface StopPhaseOptions<TProfile extends SpeedProfile = SpeedProfile> {
  /**
   * Edit the built-in steps (`delay`, `spinOut`, `land`, `bounce`) before
   * they run: insert one, replace one, drop one. Gets the default list,
   * returns the list to run. See `insertAfter` and friends.
   */
  steps?: StepsEditor<StopStepContext<TProfile>>;
}

export type StopStepContext<TProfile extends SpeedProfile = SpeedProfile> = StepContext<StopPhaseConfig, TProfile>;

/**
 * Stops the reel on the target frame.
 *
 * Steps, in order:
 * 1. `delay`: wait the staggered delay. Cut by a quicken.
 * 2. `spinOut`: keep spinning at full speed with `isStopping` flagged. The
 *    target frame is loaded into the StopSequencer; each wrap event at the
 *    top of the reel pulls the next frame symbol. so targets arrive in the
 *    visible area naturally, carrying the full momentum of the spin. Ends
 *    when the sequencer is exhausted.
 * 3. `land`: snap to grid, tell the symbols, raise the landing.
 * 4. `bounce`: overshoot by `bounceDistance` and settle back over
 *    `bounceDuration`.
 */
export class StopPhase<TProfile extends SpeedProfile = SpeedProfile> extends ReelPhase<StopPhaseConfig, TProfile> {
  readonly name = 'stop';
  readonly skippable = true;
  override readonly quickenable = true;

  protected readonly _options: StopPhaseOptions<TProfile>;
  protected _stage: 'delay' | 'spinning' | 'landed' | 'done' = 'delay';
  protected _baseY = 0;

  constructor(reel: Reel, speed: TProfile, options: StopPhaseOptions<TProfile> = {}) {
    super(reel, speed);
    this._options = options;
  }

  /** The built-in list. A subclass overrides this to change the flow; a game edits it through `options.steps`. */
  defaultSteps(): PhaseStep<StopStepContext<TProfile>>[] {
    return [
      step<StopStepContext<TProfile>>(
        'delay',
        (ctx) => {
          const wait = ctx.step.at(0)?.duration ?? ctx.config.delay ?? 0;
          return wait > 0 ? ctx.wait(wait) : undefined;
        },
        { cut: true },
      ),
      step('spinOut', (ctx) => {
        this._beginSpinOut();
        // Sequencer consumes one symbol per wrap via Reel._onSymbolWrapped.
        // When it's empty, the target frame is fully placed. time to land.
        return ctx.until(() => !this._reel.stopSequencer.hasRemaining);
      }),
      step('land', () => {
        this.land();
        this._stage = 'landed';
      }),
      step('bounce', (ctx) => {
        const timing = ctx.step.at(0);
        return this.bounce({ ease: timing?.ease, duration: timing?.duration });
      }),
    ];
  }

  protected onEnter(config: StopPhaseConfig): void {
    this._stage = 'delay';
    this._baseY = this._reel.axis.getMain(this._reel.container);
    const steps = this.defaultSteps();
    this.runSteps(this._options.steps ? this._options.steps(steps) : steps);
  }

  protected _beginSpinOut(): void {
    const config = this._config;
    if (!config) return;
    const reel = this._reel;
    const speed = this.timing;

    reel.setStopFrame(config.targetFrame);
    reel.isStopping = true;
    // Under the drive model the reel RAMPS to the spin-out speed inside its
    // acceleration bounds; forcing it would put back exactly the discontinuity
    // the drive exists to remove. Under the tween model there is no ramp to
    // respect and the assignment is immediate, as it always was.
    const setSpeed = reel.hasDrive
      ? (v: number) => {
          reel.targetSpeed = v;
        }
      : (v: number) => reel.forceSpeed(v);

    if (config.preserveSpeed) {
      // Following an anticipation tease: keep the current (slow) speed so the
      // reel crawls its target frame into place and stops exactly there,
      // rather than re-accelerating to full speed. Floor it so a near-zero
      // anticipation speed can't stall the spin-out forever, and cap it at full
      // spin speed so a curve that ended on a SURGE segment cannot leak an
      // above-normal speed into the landing.
      setSpeed(Math.min(Math.max(reel.speed, speed.spinSpeed * 0.08), speed.spinSpeed));
      // A surge has to come DOWN before the frame lands, and a drive would take
      // its own sweet time about it. The cap is a correctness rule, not a feel
      // choice, so it applies to the live speed immediately either way.
      if (reel.hasDrive && reel.speed > speed.spinSpeed) reel.speed = speed.spinSpeed;
    } else {
      // Restore full spin speed. anticipation or other phases may have lowered
      // it. The full momentum carries through the final frame placement.
      setSpeed(speed.spinSpeed);
    }

    this._stage = 'spinning';
  }

  update(_deltaMs: number): void {
    this.tickSteps();
  }

  /**
   * Slam: rest on the frame, landed. Quicken: nothing to do here, the runner
   * skips the `delay` step and the spin-out starts at once; a profile the
   * press named has been swapped in and shapes the spin-out and the bounce
   * still to come.
   */
  protected onSkip(ctx: SkipContext = { mode: 'slam' }): void {
    if (ctx.mode === 'quicken') return;
    const reel = this._reel;
    reel.haltDrive();
    reel.isStopping = false;

    if (this._stage !== 'done' && this._config) {
      // Place the FULL target frame, not just the visible window — slicing to
      // [bufferStart, bufferStart+visible] dropped buffer-above/below targets
      // (e.g. a big symbol's tail parked in bufferStart), so a direct skip()
      // landed the wrong frame. targetFrame is already a flat top-to-bottom
      // strip, which is exactly what placeStrip consumes.
      reel.placeStrip(this._config.targetFrame);
    }
    // Rest the container BEFORE snapping. `snapToGrid` re-bakes the container's
    // current main coordinate into any lifted unmask view, so skipping mid-bounce
    // used to bake the overshoot position and then move the container out from
    // under it, leaving the view off by however far the bounce had travelled.
    reel.axis.setMain(reel.container, this._baseY);
    reel.snapToGrid();
    this._stage = 'done';
  }
}
