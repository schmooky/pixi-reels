import { createEngine, type Engine } from '@schmooky/zvuk';
import {
  attachBoardSounds,
  attachReelSounds,
  zvukPort,
  type BoardCues,
  type HoldAndWinBoard,
  type ReelCues,
  type ReelSet,
  type ReelSoundsHandle,
} from 'pixi-reels';

/**
 * `@pixi-reels/kit/sound`: one zvuk engine for every demo on a page, the
 * sound set the recipes play, and the default cue tables they snap onto a
 * reel set or a board.
 *
 * Nothing touches the AudioContext until the first pointer press anywhere
 * on the page (browsers refuse audio before a gesture), and the files load
 * right after it. A round started before then plays nothing for its first
 * beat, which is the right trade: no autoplay, no blocked-context warning.
 *
 * The files are served from `baseUrl` (default `/sfx/`): spin, reel-stop.1
 * to .3, anticipation, skip, win, pop, each as `.webm` and `.m4a`. Point
 * `configureSounds` at your own folder, or at your own takes.
 */
export type SoundBus = 'reels' | 'anticipation' | 'wins' | 'ui';

let baseUrl = '/sfx/';
let engine: Engine<SoundBus> | null = null;
let loading: Promise<void> | null = null;
let muted = false;

/** Where the sound files live. Call before the first round; a later call is an error. */
export function configureSounds(options: { baseUrl: string }): void {
  if (engine) throw new Error('configureSounds must run before the first sound plays: the engine is already up.');
  baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;
}

const ladder = (name: string) => [`${baseUrl}${name}.webm`, `${baseUrl}${name}.m4a`];

/**
 * The engine, created on first use. Buses mirror what a slot mix needs:
 * the reels, the tease, the wins and the UI each on their own fader, under
 * a master with headroom and a limiter.
 */
export function getAudio(): Engine<SoundBus> {
  if (engine) return engine;
  engine = createEngine<SoundBus>({
    buses: {
      reels: { level: 0.9, concurrency: { max: 6, steal: 'oldest' } },
      anticipation: { level: 0.8 },
      wins: { level: 1 },
      ui: { level: 0.7 },
    },
    master: { headroom: -3, limiter: { threshold: -1 } },
  });
  applyMuted();
  // The first press anywhere is the gesture that lets audio start.
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', () => { void readyAudio().catch(() => {}); }, { once: true, capture: true });
  }
  return engine;
}

/** Unlock from a gesture and load the sound set once. Safe to call often. */
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

const onCascade = (full: number, quiet: number) => ({ mode }: { mode?: string }) => (mode === 'cascade' ? quiet : full);

/**
 * The cues a reel set gets unless the recipe brings its own. The spin is one
 * kick on `spin:start`, not a bed: a loop under every spin of a demo page
 * wears thin fast, and the reel stops carry the rhythm. The thud waits for
 * the bottom of the landing bounce (half its duration), the frame the reel
 * visibly hits, not the frame it snaps on. A tumble keeps both, quieter:
 * its symbols fall out and drop in one by one, and the pop on the destroyed
 * winners is its beat.
 */
export const DEFAULT_CUES: ReelCues = {
  spin: { play: 'spin', volume: onCascade(0.7, 0.35), pitch: ({ speed }) => (speed === 'normal' ? 1 : 1.12) },
  reelStop: {
    play: 'reel-stop',
    volume: ({ mode }) => ({ base: mode === 'cascade' ? 0.4 : 0.9, jitter: 0.08 }),
    pitch: { jitter: 0.04 },
    delay: ({ profile, mode }) => (mode === 'cascade' ? 0 : (profile?.bounceDuration ?? 0) / 2000),
  },
  anticipation: { loop: 'anticipation', fadeIn: 0.12, fadeOut: 0.25, pitch: ({ order }) => 1 + 0.08 * (order ?? 0) },
  skip: { play: 'skip' },
  win: { play: 'win', volume: 0.8 },
  cascadeDestroy: { play: 'pop', volume: { base: 0.8, jitter: 0.1 }, pitch: { jitter: 0.08 } },
};

/** The cues a Hold & Win board gets: a kick per respin, a thud per cell, a pop per lock. */
export const DEFAULT_BOARD_CUES: BoardCues = {
  respinStart: { play: 'spin', volume: 0.5 },
  cellLanded: { play: 'reel-stop', volume: ({ hit }) => ({ base: hit ? 0.7 : 0.4, jitter: 0.08 }), pitch: { jitter: 0.05 } },
  coinLocked: { play: 'pop', volume: 0.7, pitch: { base: 1.1, jitter: 0.06 } },
  boardFull: { play: 'win' },
  featureEnd: { play: 'win', volume: 0.8 },
};

/**
 * Snap the cues onto a reel set. Returns the handle; destroy it with the set.
 * A cue that fires before the first gesture is dropped by the port with one
 * warning rather than thrown.
 */
export function reelSounds(reelSet: ReelSet, cues: ReelCues = DEFAULT_CUES): ReelSoundsHandle {
  return attachReelSounds(reelSet, zvukPort(getAudio(), { warn: () => {} }), cues);
}

/** The same for a Hold & Win board. */
export function boardSounds(board: HoldAndWinBoard, cues: BoardCues = DEFAULT_BOARD_CUES): ReelSoundsHandle {
  return attachBoardSounds(board, zvukPort(getAudio(), { warn: () => {} }), cues);
}

/** Mute or unmute every bus. The engine keeps running, so cues stay in time. */
export function setSoundsMuted(on: boolean): void {
  muted = on;
  applyMuted();
}

export function soundsMuted(): boolean {
  return muted;
}

function applyMuted(): void {
  if (!engine) return;
  for (const b of ['reels', 'anticipation', 'wins', 'ui'] as SoundBus[]) engine.bus(b).muted = muted;
}
