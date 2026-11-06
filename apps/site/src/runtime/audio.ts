import { readyAudio, setSoundsMuted } from '@pixi-reels/kit/sound';

/**
 * The site's sound toggle: one switch for every demo on the page, remembered
 * per browser. The engine, the sound set and the cue tables live in
 * `@pixi-reels/kit/sound`; a recipe snaps them on itself with
 * `reelSounds(reelSet)` or `boardSounds(board)`.
 */
const STORAGE_KEY = 'pixi-reels:sound';
const listeners = new Set<(on: boolean) => void>();

export { readyAudio };

/** Whether sound is on for this visitor. On by default. */
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
  setSoundsMuted(!on);
  for (const fn of listeners) fn(on);
}

export function onSoundEnabled(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Apply the remembered choice to the engine. Called once a page's first demo mounts. */
export function applySoundPreference(): void {
  setSoundsMuted(!soundEnabled());
}
