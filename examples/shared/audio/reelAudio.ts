import type { Engine } from '@schmooky/zvuk';
import type { Disposable, ReelSet } from 'pixi-reels';
import { STOP_IDS } from './loadKenneyBank.js';

export interface ReelAudioOptions {
  /**
   * Sound ids to randomly pick from on each reel landing. Must already be
   * registered on the engine (e.g. via `loadKenneyBank`). Default: the
   * Kenney bank.
   */
  stopIds?: readonly string[];
  /**
   * Pitch jitter as a fraction of playback rate (0..1). `0.04` = each play
   * uses a random rate within +/-4%, so 5 reels landing in a stagger don't
   * sound like the same sample 5 times. Default `0.04`.
   */
  pitchJitter?: number;
  /** Volume jitter (0..1). Default `0.05`. */
  volumeJitter?: number;
}

/**
 * Play a Kenney sound on every reel landing.
 *
 * Subscribes to `spin:reelLanded` on the given ReelSet — fired once per reel
 * as it stops, so a 5-reel cabinet produces 5 plays in the stagger pattern
 * the spin controller chose. Each play picks a random sample id (when more
 * than one is registered) and applies pitch + volume jitter so the sequence
 * sounds like a real machine, not a looped sample.
 *
 * The engine and bank must already be set up. Bring your own gesture-unlock
 * — see the recipe at /recipes/audio-with-zvuk/.
 *
 * @example
 * ```ts
 * const engine = createEngine({ buses: { sfx: { level: 1 } } });
 * await engine.unlock();
 * await loadKenneyBank(engine);
 * const audio = createReelAudio(reelSet, engine);
 * // ...later
 * audio.destroy();
 * ```
 */
export function createReelAudio(
  reelSet: ReelSet,
  engine: Engine,
  options: ReelAudioOptions = {},
): Disposable {
  const ids = options.stopIds ?? STOP_IDS;
  if (ids.length === 0) {
    throw new Error('createReelAudio: stopIds must contain at least one id');
  }
  const pitchJitter = options.pitchJitter ?? 0.04;
  const volumeJitter = options.volumeJitter ?? 0.05;

  let destroyed = false;

  const onLanded = () => {
    const id = ids[Math.floor(Math.random() * ids.length)];
    engine.sound(id).play({
      pitch: { jitter: pitchJitter },
      volume: { jitter: volumeJitter },
    });
  };

  reelSet.events.on('spin:reelLanded', onLanded);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      reelSet.events.off('spin:reelLanded', onLanded);
    },
    get isDestroyed() {
      return destroyed;
    },
  };
}
