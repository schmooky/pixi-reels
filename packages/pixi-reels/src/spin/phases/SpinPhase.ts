import type { SkipContext } from '../../config/types.js';
import { ReelPhase } from './ReelPhase.js';

export interface SpinPhaseConfig {
  /** Minimum time to spin before allowing stop. Overrides speed profile if set. */
  minimumSpinTime?: number;
}

/**
 * Continuous spinning at constant speed.
 *
 * Runs until externally resolved (when setResult arrives). Tracks minimum
 * spin time via ticker accumulation so it behaves consistently when the tab
 * is hidden (no reliance on wall-clock performance.now()).
 */
export class SpinPhase extends ReelPhase<SpinPhaseConfig> {
  readonly name = 'spin';
  readonly skippable = false;
  override readonly quickenable = true;

  protected _elapsed = 0;
  protected _minTime = 0;
  protected _readyToStop = false;

  protected onEnter(config: SpinPhaseConfig): void {
    this._elapsed = 0;
    this._minTime = config.minimumSpinTime ?? this._speed.minimumSpinTime ?? 500;
    this._readyToStop = false;
  }

  update(deltaMs: number): void {
    this._elapsed += deltaMs;
    if (this._readyToStop && this._elapsed >= this._minTime) {
      this._complete();
    }
  }

  /** Signal that this phase should end (called by SpinController when result arrives). */
  resolve(): void {
    this._readyToStop = true;
    if (this._elapsed >= this._minTime) {
      this._complete();
    }
  }

  /**
   * Not skippable: a slam resolves the spin from the outside. A `'quicken'`
   * drops the floor, so the reel may stop the moment the result is in.
   */
  protected onSkip(ctx: SkipContext = { mode: 'slam' }): void {
    if (ctx.mode !== 'quicken') return;
    this._minTime = 0;
    if (this._readyToStop) this._complete();
  }
}
