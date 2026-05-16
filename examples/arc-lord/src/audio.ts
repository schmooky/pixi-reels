import { createEngine, type Engine } from '@schmooky/zvuk';

/**
 * Zvuk engine wrapper for Arc Lord. One named bus per audio category so
 * we can duck the music against the sfx without dipping the click SFX.
 *
 * `unlock()` MUST be called from a user gesture (iOS Safari). We do it
 * on the first SPIN click — calling it earlier is harmless but doesn't
 * count toward the gesture quota.
 */

const DEFAULT_SFX_BASE = '/arc-lord/sound/';

/** Every loaded sound alias. Adding a new one? Update the table + load(). */
export const SOUNDS = {
  // Spin lifecycle
  clickSpin: 'click_spin',
  reelSpin:  'reel_spin',
  reelStop:  'reel_stop',
  // Win destruction + presenter
  destroy:   'destroy_highlight',
  lowWin:    'low_win_0',
  winStart:  'win_start',
  winEnd:    'win_end_bet_low',
  winCount:  'win_count',
  // Multiplier
  multiActivate: 'multiplier_activate',
  // Ambient
  ambient: 'ambient_sound',
} as const;

export type SoundName = keyof typeof SOUNDS;

let _engine: Engine | null = null;

export function audio(): Engine {
  if (!_engine) {
    _engine = createEngine({
      buses: {
        music: { level: 0.55 },
        sfx:   { level: 1.0 },
      },
      master: { headroom: -3 },
    });
  }
  return _engine;
}

const _loadedFor = new Map<string, Promise<void>>();

export function loadAllSounds(basePath: string = DEFAULT_SFX_BASE): Promise<void> {
  const cached = _loadedFor.get(basePath);
  if (cached) return cached;
  const engine = audio();
  const work = (async () => {
    await engine.loadSound(SOUNDS.ambient, `${basePath}${SOUNDS.ambient}.webm`, { bus: 'music' });
    const sfxList: SoundName[] = [
      'clickSpin', 'reelSpin', 'reelStop', 'destroy',
      'lowWin', 'winStart', 'winEnd', 'winCount', 'multiActivate',
    ];
    for (const name of sfxList) {
      await engine.loadSound(SOUNDS[name], `${basePath}${SOUNDS[name]}.webm`, { bus: 'sfx' });
    }
  })();
  _loadedFor.set(basePath, work);
  return work;
}

/** Play a one-shot SFX with a tiny pitch/volume jitter so repeats don't
 *  sound machine-stamped. Safe to call before unlock() — zvuk queues. */
export function sfx(name: SoundName, opts?: { volume?: number }): void {
  const engine = audio();
  const voice = engine.sound(SOUNDS[name]).play({
    volume: { value: opts?.volume ?? 1, jitter: 0.06 },
    rate:   { value: 1, jitter: 0.02 },
  });
  void voice; // fire and forget
}

let _ambientVoice: ReturnType<ReturnType<Engine['sound']>['play']> | null = null;

export function startAmbient(): void {
  if (_ambientVoice) return;
  const engine = audio();
  _ambientVoice = engine.sound(SOUNDS.ambient).play({ loop: true, volume: { value: 0.6 } });
}

/** Looped reel-spin sound for the empty-wait gap between fall and dropIn. */
let _spinLoop: ReturnType<ReturnType<Engine['sound']>['play']> | null = null;

export function startReelSpinLoop(): void {
  if (_spinLoop) return;
  const engine = audio();
  _spinLoop = engine.sound(SOUNDS.reelSpin).play({
    loop: true,
    volume: { value: 0.6 },
  });
}

export function stopReelSpinLoop(): void {
  if (!_spinLoop) return;
  _spinLoop.fade({ to: 0, duration: 0.18 });
  _spinLoop = null;
}
