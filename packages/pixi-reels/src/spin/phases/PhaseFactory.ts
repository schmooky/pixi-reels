import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import { ReelPhase } from './ReelPhase.js';
import { StartPhase } from './StartPhase.js';
import { SpinPhase } from './SpinPhase.js';
import { StopPhase } from './StopPhase.js';
import { AnticipationPhase } from './AnticipationPhase.js';

type PhaseConstructor<T extends ReelPhase<any> = ReelPhase<any>> =
  new (reel: Reel, speed: SpeedProfile) => T;

type PhaseCreatorFn<T extends ReelPhase<any> = ReelPhase<any>> =
  (reel: Reel, speed: SpeedProfile) => T;

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

  /** Register or override a phase type by constructor. */
  register<T extends ReelPhase<any>>(name: string, PhaseClass: PhaseConstructor<T>): void {
    this._registry.set(name, (r, s) => new PhaseClass(r, s));
  }

  /**
   * Register or override a phase type by factory function.
   * Use this when the phase needs extra args at construction time.
   *
   * @example
   * factory.registerFactory('stop', (reel, speed) => new DropStopPhase(reel, speed, dropConfig));
   */
  registerFactory<T extends ReelPhase<any>>(
    name: string,
    factory: PhaseCreatorFn<T>,
  ): void {
    this._registry.set(name, factory);
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
    return creator(reel, speed) as T;
  }

  has(name: string): boolean {
    return this._registry.has(name);
  }
}
