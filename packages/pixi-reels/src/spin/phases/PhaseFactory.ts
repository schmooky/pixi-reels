import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import { ReelPhase } from './ReelPhase.js';
import { StartPhase } from './StartPhase.js';
import { SpinPhase } from './SpinPhase.js';
import { StopPhase } from './StopPhase.js';
import { AnticipationPhase } from './AnticipationPhase.js';

type PhaseConstructor<T extends ReelPhase<any> = ReelPhase<any>> =
  new (reel: Reel, speed: SpeedProfile) => T;

/**
 * Factory for creating reel phase instances.
 *
 * Ships with all four default phases pre-registered.
 * Users can override any phase by registering a custom constructor.
 */
export class PhaseFactory {
  private _registry = new Map<string, PhaseConstructor>();

  constructor() {
    // Register defaults
    this._registry.set('start', StartPhase);
    this._registry.set('spin', SpinPhase);
    this._registry.set('stop', StopPhase);
    this._registry.set('anticipation', AnticipationPhase);
  }

  /** Register or override a phase type. */
  register<T extends ReelPhase<any>>(name: string, PhaseClass: PhaseConstructor<T>): void {
    this._registry.set(name, PhaseClass);
  }

  /** Create a phase instance for a reel. */
  create<T extends ReelPhase<any> = ReelPhase<any>>(
    name: string,
    reel: Reel,
    speed: SpeedProfile,
  ): T {
    const PhaseClass = this._registry.get(name);
    if (!PhaseClass) {
      throw new Error(
        `Phase '${name}' not registered. Available: ${[...this._registry.keys()].join(', ')}`,
      );
    }
    return new PhaseClass(reel, speed) as T;
  }

  has(name: string): boolean {
    return this._registry.has(name);
  }
}
