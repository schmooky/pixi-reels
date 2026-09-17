import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import { ReelPhase } from './ReelPhase.js';
import { defaultMoves, resolveMoves } from './moves.js';
import type { PhaseMoves, ResolvedPhaseMoves } from './moves.js';
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
> = new (reel: Reel, speed: P) => T;

export type PhaseCreatorFn<
  T extends ReelPhase<any, any> = ReelPhase<any>,
  P extends SpeedProfile = SpeedProfile,
> = (reel: Reel, speed: P) => T;

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
  private _moves: ResolvedPhaseMoves = defaultMoves;

  constructor() {
    this._registry.set('start', (r, s) => new StartPhase(r, s));
    this._registry.set('spin', (r, s) => new SpinPhase(r, s));
    this._registry.set('stop', (r, s) => new StopPhase(r, s));
    this._registry.set('anticipation', (r, s) => new AnticipationPhase(r, s));
  }

  /**
   * Register or override a phase type by constructor.
   *
   * A phase declared against a wider profile (`ReelPhase<Config, MyProfile>`)
   * registers the same way: the manager hands every phase the profile
   * instance the game registered, so the extra fields are there at run time,
   * and narrowing to `P` here is what lets that declaration typecheck.
   */
  register<P extends SpeedProfile, T extends ReelPhase<any, any>>(
    name: string,
    PhaseClass: PhaseConstructor<T, P>,
  ): void {
    this._registry.set(name, (r, s) => new PhaseClass(r, s as P));
  }

  /**
   * Register or override a phase type by factory function.
   * Use this when the phase needs extra args at construction time.
   *
   * @example
   * factory.registerFactory('cascade:dropIn', (reel, speed) => new CascadeDropInPhase(reel, speed, dropConfig));
   */
  registerFactory<P extends SpeedProfile, T extends ReelPhase<any, any>>(
    name: string,
    factory: PhaseCreatorFn<T, P>,
  ): void {
    this._registry.set(name, (r, s) => factory(r, s as P));
  }

  /**
   * Replace the animated beats of the built-in phases. Resolved against
   * `defaultMoves` once, here; every phase this factory creates is handed
   * the result, custom subclasses included. See `builder.moves()`.
   */
  moves(overrides: PhaseMoves): void {
    this._moves = resolveMoves(overrides);
  }

  /** The beats phases created by this factory play. */
  get resolvedMoves(): ResolvedPhaseMoves {
    return this._moves;
  }

  /** Create a phase instance for a reel. */
  create<T extends ReelPhase<any> = ReelPhase<any>>(
    name: string,
    reel: Reel,
    speed: SpeedProfile,
  ): T {
    const creator = this._registry.get(name);
    if (!creator) {
      throw new Error(
        `Phase '${name}' not registered. Available: ${[...this._registry.keys()].join(', ')}`,
      );
    }
    const phase = creator(reel, speed);
    phase.bindMoves(this._moves);
    return phase as T;
  }

  has(name: string): boolean {
    return this._registry.has(name);
  }
}
