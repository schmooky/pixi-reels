import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';

/**
 * Abstract base for reel spin phases.
 *
 * Each phase represents one stage of the spin lifecycle:
 * START → SPIN → ANTICIPATION → STOP.
 *
 * Phases are entered and exited by SpinController, and can be skipped
 * if marked as skippable and the user triggers skip/slam-stop.
 *
 * @typeParam TConfig - Phase-specific configuration type.
 */
export abstract class ReelPhase<TConfig = void> {
  abstract readonly name: string;
  abstract readonly skippable: boolean;

  protected _reel: Reel;
  protected _speed: SpeedProfile;
  protected _resolve: (() => void) | null = null;
  protected _isActive = false;

  constructor(reel: Reel, speed: SpeedProfile) {
    this._reel = reel;
    this._speed = speed;
  }

  get reel(): Reel {
    return this._reel;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /** Enter the phase. Returns a promise that resolves when the phase is complete. */
  async run(config: TConfig): Promise<void> {
    this._isActive = true;
    this._reel.events.emit('phase:enter', this.name);

    return new Promise<void>((resolve) => {
      this._resolve = () => {
        this._isActive = false;
        this._reel.events.emit('phase:exit', this.name);
        resolve();
      };
      this.onEnter(config);
    });
  }

  /** Skip the phase immediately (if skippable). */
  skip(): void {
    if (!this.skippable || !this._isActive) return;
    this.onSkip();
    this._complete();
  }

  /** Force-complete the phase regardless of skippable flag. */
  forceComplete(): void {
    if (!this._isActive) return;
    this.onSkip();
    this._complete();
  }

  /** Called each frame while the phase is active. */
  abstract update(deltaMs: number): void;

  /** Subclass: set up the phase (start tweens, set speed, etc). */
  protected abstract onEnter(config: TConfig): void;

  /** Subclass: clean up when skipped or force-completed. */
  protected abstract onSkip(): void;

  /** Call when the phase naturally completes. */
  protected _complete(): void {
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve();
    }
  }
}
