import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import { ReelPhase } from './ReelPhase.js';
import type { PhaseCreateContext } from './ReelPhase.js';
import { StartPhase } from './StartPhase.js';
import { SpinPhase } from './SpinPhase.js';
import { StopPhase } from './StopPhase.js';
import { AnticipationPhase } from './AnticipationPhase.js';

// `ReelPhase<any, any>` rather than `ReelPhase<any, P>`: the phase's own
// profile parameter is invariant through its constructor, so tying the two
// would reject the default `ReelPhase<any>` for every plain registration.
export type PhaseConstructor<
  T extends ReelPhase<any, any> = ReelPhase<any>,
  P extends SpeedProfile = SpeedProfile,
  O = undefined,
> = new (reel: Reel, speed: P, options?: O) => T;

/**
 * The options a phase constructor takes as its third argument, read off the
 * class itself. Reading it from the class rather than declaring it as a
 * separate type parameter is what gives `register`'s `options` argument its
 * contextual type AND works for a phase generic over its profile
 * (`StopPhase<TProfile>`), which a plain parameter cannot do for both.
 */
export type PhaseOptionsOf<C> = C extends new (
  reel: never,
  speed: never,
  options?: infer O,
) => unknown
  ? O
  : never;

export type PhaseCreatorFn<
  T extends ReelPhase<any, any> = ReelPhase<any>,
  P extends SpeedProfile = SpeedProfile,
> = (reel: Reel, speed: P, context: PhaseCreateContext) => T;

/**
 * Factory for creating reel phase instances.
 *
 * Ships with all four default phases pre-registered.
 * Users can override any phase by registering a custom constructor or factory function.
 * Use registerFactory() when the phase needs extra construction-time config
 * (e.g. cascade drop settings baked in via closure).
 */
export class PhaseFactory {
  private _registry = new Map<string, PhaseCreatorFn>();

  constructor() {
    this._registry.set('start', (r, s) => new StartPhase(r, s));
    this._registry.set('spin', (r, s) => new SpinPhase(r, s));
    this._registry.set('stop', (r, s) => new StopPhase(r, s));
    this._registry.set('anticipation', (r, s) => new AnticipationPhase(r, s));
  }

  /** What `create` passes a factory that was called without one. */
  private static _defaultContext(name: string): PhaseCreateContext {
    return { phase: name, reelIndex: -1, anticipated: false, quickened: false };
  }

  /**
   * Register or override a phase type by constructor, with the `options` its
   * constructor takes as a third argument. Registering a built-in under its
   * own key with options is how a game reconfigures it without subclassing:
   *
   * @example
   * factory.register('stop', StopPhase, {
   *   steps: (steps) => insertAfter(steps, 'land', step('flash', (ctx) => flash(ctx.reel))),
   * });
   *
   * A phase declared against a wider profile (`ReelPhase<Config, MyProfile>`)
   * registers the same way: the manager hands every phase the profile
   * instance the game registered, so the extra fields are there at run time,
   * and narrowing to `P` here is what lets that declaration typecheck.
   */
  register<C extends PhaseConstructor<ReelPhase<any, any>, any, any>>(
    name: string,
    PhaseClass: C,
    options?: PhaseOptionsOf<C>,
  ): void {
    this._registry.set(name, (r, s) => new PhaseClass(r, s, options));
  }

  /**
   * Register or override a phase type by factory function.
   * Use this when the phase needs extra args at construction time.
   *
   * The third argument says which reel this is and what has already happened
   * to it, so a registration can pick a different phase per reel. `'stop'`
   * built one way for a reel that teased and another for one that did not:
   *
   * @example
   * factory.registerFactory('cascade:dropIn', (reel, speed) => new CascadeDropInPhase(reel, speed, dropConfig));
   *
   * @example
   * factory.registerFactory('anticipation', (reel, speed, ctx) =>
   *   ctx.reelIndex === 4 ? new CustomAnticipationPhase(reel, speed) : new AnticipationPhase(reel, speed));
   */
  registerFactory<P extends SpeedProfile, T extends ReelPhase<any, any>>(
    name: string,
    factory: PhaseCreatorFn<T, P>,
  ): void {
    this._registry.set(name, (r, s, ctx) => factory(r, s as P, ctx));
  }

  /**
   * Create a phase instance for a reel.
   *
   * `context` is what the phase and the registered factory learn about this
   * reel: its index, and whether it has already teased or been quickened. The
   * controller always passes it; a direct caller that omits it gets a context
   * that claims nothing (`reelIndex: -1`), and the phase then reads its
   * profile section without the `whenAnticipated` half.
   */
  create<T extends ReelPhase<any> = ReelPhase<any>>(
    name: string,
    reel: Reel,
    speed: SpeedProfile,
    context: PhaseCreateContext = PhaseFactory._defaultContext(name),
  ): T {
    const creator = this._registry.get(name);
    if (!creator) {
      throw new Error(
        `Phase '${name}' not registered. Available: ${[...this._registry.keys()].join(', ')}`,
      );
    }
    const phase = creator(reel, speed, context) as T;
    phase.attachContext(context);
    return phase;
  }

  has(name: string): boolean {
    return this._registry.has(name);
  }
}
