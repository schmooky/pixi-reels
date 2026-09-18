import type { SkipContext } from '../../config/types.js';
import { ReelPhase } from './ReelPhase.js';
import { step } from './steps.js';
import type { PhaseStep, StepContext, StepsEditor } from './steps.js';
import type { SpinningMode } from '../modes/SpinningMode.js';

export interface StartPhaseConfig {
  /** Spinning mode to set on enter. */
  spinningMode: SpinningMode;
  /** Delay before this reel starts (for staggered start). */
  delay?: number;
}

/** What a game hands `StartPhase` through `f.register('start', StartPhase, options)`. */
export interface StartPhaseOptions {
  /**
   * Edit the built-in steps (`delay`, `launch`, `pull`, `accelerate`,
   * `announce`) before they run: insert one, replace one, drop one. Gets the
   * default list, returns the list to run. See `insertAfter` and friends.
   */
  steps?: StepsEditor<StartStepContext>;
}

export type StartStepContext = StepContext<StartPhaseConfig>;

/** The step-back pull, px/frame backwards and for how long. */
const PULL_SPEED = -2;
const PULL_MS = 50;

/**
 * Accelerates the reel from rest to full spin speed.
 *
 * Optionally performs a brief step-back (reel reverses a tiny amount) before
 * accelerating upward, giving the classic slot machine "pull" feel.
 *
 * Steps, in order: `delay` (the stagger, cut by a quicken), `launch`
 * (re-mask lifted symbols), `pull` (only on a profile that bounces),
 * `accelerate`, `announce` (`notifySpinStart`). Under the tween model the
 * pull and the acceleration are tweens of `reel.speed`; under the drive
 * model they name a `targetSpeed` and wait, letting the drive's bounds shape
 * the ramp.
 */
export class StartPhase extends ReelPhase<StartPhaseConfig> {
  readonly name = 'start';
  readonly skippable = true;
  override readonly quickenable = true;

  protected readonly _options: StartPhaseOptions;

  constructor(reel: ReelPhase<StartPhaseConfig>['reel'], speed: StartPhase['speed'], options: StartPhaseOptions = {}) {
    super(reel, speed);
    this._options = options;
  }

  /** The built-in list. A subclass overrides this to change the flow; a game edits it through `options.steps`. */
  defaultSteps(): PhaseStep<StartStepContext>[] {
    const reel = this._reel;
    const speed = this._speed;
    const steps: PhaseStep<StartStepContext>[] = [
      step('delay', (ctx) => ((ctx.config.delay ?? 0) > 0 ? ctx.wait(ctx.config.delay ?? 0) : undefined), { cut: true }),
      // Re-mask any lifted unmask symbols the instant this reel starts to
      // move. notifySpinStart only fires at accel-end, which would leave an
      // unmasked symbol floating above the mask for the whole ramp.
      step('launch', () => reel.beginMotion()),
    ];
    // Step-back: brief reverse to give a "pull" before launch. This tweens
    // reel.speed, not a position, so it needs no axis routing: the negative
    // speed is direction-relative and ReelMotion.advance multiplies travel by
    // axis.polarity, making it read as "backwards for this reel" in any
    // orientation/direction.
    if (speed.bounceDistance > 0) {
      steps.push(
        step('pull', (ctx) => {
          if (reel.hasDrive) {
            reel.targetSpeed = PULL_SPEED;
            return ctx.wait(PULL_MS);
          }
          return ctx.gsap.to(reel, { speed: PULL_SPEED, duration: PULL_MS / 1000, ease: 'power1.out' });
        }),
      );
    }
    steps.push(
      step('accelerate', (ctx) => {
        const duration = speed.accelerationDuration ?? 300;
        if (reel.hasDrive) {
          // Under the drive model the ramp shape belongs to the acceleration
          // bounds, not to an ease. The phase only names the destination and
          // gives the drive the same time budget the tween would have had.
          reel.targetSpeed = speed.spinSpeed;
          return ctx.wait(duration);
        }
        return ctx.gsap.to(reel, {
          speed: speed.spinSpeed,
          duration: duration / 1000,
          ease: speed.accelerationEase ?? 'power2.in',
        });
      }),
      step('announce', () => reel.notifySpinStart()),
    );
    return steps;
  }

  protected onEnter(config: StartPhaseConfig): void {
    this._reel.spinningMode = config.spinningMode;
    this._reel.haltDrive();
    const steps = this.defaultSteps();
    this.runSteps(this._options.steps ? this._options.steps(steps) : steps);
  }

  update(_deltaMs: number): void {
    this.tickSteps();
  }

  /**
   * Both modes end the same way: at full spin speed, with the spin announced.
   * The pose IS the natural end, so a `'quicken'` completes here as well.
   */
  protected onSkip(ctx: SkipContext = { mode: 'slam' }): void {
    this._reel.forceSpeed(this._speed.spinSpeed);
    // The accel step died before `announce` could run, but the reel keeps
    // spinning through StopPhase. symbols must still learn they're in a spin
    // (blur / static-spin presentations). Safe if it already fired: the hook
    // is idempotent.
    this._reel.notifySpinStart();
    if (ctx.mode === 'quicken') this._complete();
  }
}
