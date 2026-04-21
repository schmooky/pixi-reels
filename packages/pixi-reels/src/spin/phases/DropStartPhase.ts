import { ReelPhase } from './ReelPhase.js';
import type { SpinningMode } from '../modes/SpinningMode.js';

export interface DropStartPhaseConfig {
  spinningMode: SpinningMode;
  delay?: number;
}

/**
 * No-op start phase for cascade drop-in mechanics.
 *
 * The reel never accelerates — it stays at speed 0 throughout the wait.
 * Notifies symbols that the spin has started, then immediately completes
 * so the state machine advances to SpinPhase (stationary wait for result).
 */
export class DropStartPhase extends ReelPhase<DropStartPhaseConfig> {
  readonly name = 'start';
  readonly skippable = true;

  protected onEnter(config: DropStartPhaseConfig): void {
    this._reel.spinningMode = config.spinningMode;
    this._reel.speed = 0;
    this._reel.notifySpinStart();
    this._complete();
  }

  update(_deltaMs: number): void {}

  protected onSkip(): void {}
}
