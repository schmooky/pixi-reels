import { createEngine, type Engine } from '@schmooky/zvuk';
import { attachReelSounds, zvukPort, type ReelCues, type ReelSet, type ReelSoundsHandle } from 'pixi-reels';

/**
 * One zvuk engine for every demo on the page, and the default cue table the
 * recipe runner snaps onto each recipe's reel set.
 *
 * Nothing here touches the AudioContext until the first pointer press
 * (browsers refuse audio before a gesture), and the files only load after
 * that. A demo built before then plays nothing for its first beat, which is
 * the right trade: no autoplay, no blocked-context warnings.
 *
 * Buses mirror what a slot mix needs: the reels, the tease, the wins and the
 * UI each on their own fader, under a master with headroom and a limiter.
 */
type Bus = 'reels' | 'anticipation' | 'wins' | 'ui';

const STORAGE_KEY = 'pixi-reels:sound';
const SFX = '/sfx/';
const ladder = (name: string) => [`${SFX}${name}.webm`, `${SFX}${name}.m4a`];

let engine: Engine<Bus> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<(on: boolean) => void>();

/** The engine, created on first use (no AudioContext before that). */
export function getAudio(): Engine<Bus> {
  if (engine) return engine;
  engine = createEngine<Bus>({
    buses: {
      reels: { level: 0.9, concurrency: { max: 6, steal: 'oldest' } },
      anticipation: { level: 0.8 },
      wins: { level: 1 },
      ui: { level: 0.7 },
    },
    master: { headroom: -3, limiter: { threshold: -1 } },
  });
  applyEnabled();
  return engine;
}

/** Unlock from a gesture and load the manifest once. Safe to call often. */
export function readyAudio(): Promise<void> {
  if (loading) return loading;
  const e = getAudio();
  loading = (async () => {
    await e.unlock();
    await Promise.all([
      e.loadSound('spin', ladder('spin'), { bus: 'reels' }),
      e.loadVariants('reel-stop', [ladder('reel-stop.1'), ladder('reel-stop.2'), ladder('reel-stop.3')], {
        bus: 'reels',
        strategy: 'shuffle-bag',
      }),
      e.loadSound('anticipation', ladder('anticipation'), { bus: 'anticipation' }),
      e.loadSound('skip', ladder('skip'), { bus: 'ui' }),
      e.loadSound('win', ladder('win'), { bus: 'wins' }),
      e.loadSound('pop', ladder('pop'), { bus: 'wins' }),
    ]);
  })();
  return loading;
}

/**
 * The cues every recipe gets unless it brings its own. The spin is one soft
 * whoosh on `spin:start`, not a bed: a loop under every spin of a demo page
 * wears thin fast, and the reel stops carry the rhythm.
 */
export const DEFAULT_CUES: ReelCues = {
  spin: { play: 'spin', volume: 0.7, pitch: ({ speed }) => (speed === 'normal' ? 1 : 1.12) },
  reelStop: { play: 'reel-stop', volume: { base: 0.9, jitter: 0.08 }, pitch: { jitter: 0.04 } },
  anticipation: { loop: 'anticipation', fadeIn: 0.12, fadeOut: 0.25, pitch: ({ order }) => 1 + 0.08 * (order ?? 0) },
  skip: { play: 'skip' },
  win: { play: 'win', volume: 0.8 },
  cascadeDestroy: { play: 'pop', volume: { base: 0.8, jitter: 0.1 }, pitch: { jitter: 0.08 } },
};

/**
 * Snap the cues onto a reel set. Returns the handle; destroy it with the set.
 * The engine is created now, so a cue that fires before the first gesture is
 * dropped by the port with one warning rather than thrown.
 */
export function reelSounds(reelSet: ReelSet, cues: ReelCues = DEFAULT_CUES): ReelSoundsHandle {
  const port = zvukPort(getAudio(), { warn: () => {} });
  return attachReelSounds(reelSet, port, cues);
}

/** Whether sound is on for this visitor. Remembered per browser; on by default. */
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: the choice lasts the page */
  }
  applyEnabled();
  for (const fn of listeners) fn(on);
}

export function onSoundEnabled(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyEnabled(): void {
  if (!engine) return;
  const muted = !soundEnabled();
  for (const b of ['reels', 'anticipation', 'wins', 'ui'] as Bus[]) engine.bus(b).muted = muted;
}
