/**
 * Integration tests for the debug frame recorder
 * (`startRecording` / `stopRecording` / `getFrames` / `clearFrames`).
 *
 * Contract:
 *   - Each lifecycle event (`spin:start`, `spin:allLanded`, `spin:complete`)
 *     captures one snapshot per active recording.
 *   - Frames carry the tag the recording was started with.
 *   - `getFrames(tag)` filters by tag; no arg returns everything.
 *   - `stopRecording` detaches listeners — no further frames recorded.
 *   - Calling `startRecording` twice on the same reel set replaces the
 *     prior recording (no double-records).
 *   - `clearFrames` empties the global log.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import {
  startRecording,
  stopRecording,
  getFrames,
  clearFrames,
} from '../../src/debug/debug.js';

const SYMBOLS = ['a', 'b', 'c'];

function makeHarness() {
  return createTestReelSet({
    reels: 3,
    visibleRows: 3,
    symbolIds: SYMBOLS,
  });
}

describe('debug frame recorder', () => {
  beforeEach(() => {
    clearFrames();
  });

  it('captures frames at spin:start and spin:allLanded', async () => {
    const h = makeHarness();
    try {
      startRecording(h.reelSet, 'spin1');
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
      ]);
      stopRecording(h.reelSet);

      const frames = getFrames('spin1');
      expect(frames.length).toBeGreaterThanOrEqual(2);

      const triggers = frames.map((f) => f.trigger);
      expect(triggers).toContain('spin:start');
      expect(triggers).toContain('spin:allLanded');
    } finally {
      h.destroy();
    }
  });

  it('filters frames by tag', async () => {
    const h = makeHarness();
    try {
      startRecording(h.reelSet, 'one');
      await h.spinAndLand([['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a']]);
      stopRecording(h.reelSet);

      startRecording(h.reelSet, 'two');
      await h.spinAndLand([['b', 'b', 'b'], ['b', 'b', 'b'], ['b', 'b', 'b']]);
      stopRecording(h.reelSet);

      const all = getFrames();
      const one = getFrames('one');
      const two = getFrames('two');

      expect(one.length + two.length).toBe(all.length);
      expect(one.every((f) => f.tag === 'one')).toBe(true);
      expect(two.every((f) => f.tag === 'two')).toBe(true);
    } finally {
      h.destroy();
    }
  });

  it('stopRecording detaches listeners (no frames after stop)', async () => {
    const h = makeHarness();
    try {
      startRecording(h.reelSet, 'guard');
      stopRecording(h.reelSet);
      await h.spinAndLand([['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a']]);

      expect(getFrames('guard').length).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('starting recording twice on same reel set replaces the prior session', async () => {
    const h = makeHarness();
    try {
      startRecording(h.reelSet, 'first');
      startRecording(h.reelSet, 'second');
      await h.spinAndLand([['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a']]);
      stopRecording(h.reelSet);

      expect(getFrames('first').length).toBe(0);
      expect(getFrames('second').length).toBeGreaterThan(0);
    } finally {
      h.destroy();
    }
  });

  it('clearFrames empties the global log', async () => {
    const h = makeHarness();
    try {
      startRecording(h.reelSet, 'wipe');
      await h.spinAndLand([['a', 'a', 'a'], ['a', 'a', 'a'], ['a', 'a', 'a']]);
      stopRecording(h.reelSet);
      expect(getFrames().length).toBeGreaterThan(0);

      clearFrames();
      expect(getFrames().length).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('captured snapshots include the visible grid', async () => {
    const h = makeHarness();
    try {
      startRecording(h.reelSet, 'grid');
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
      ]);
      stopRecording(h.reelSet);

      const frames = getFrames('grid');
      const allLanded = frames.find((f) => f.trigger === 'spin:allLanded');
      expect(allLanded).toBeDefined();
      // Grid is reels-major: column 0 → ['a','a','a'], etc.
      expect(allLanded!.snapshot.grid[0]).toEqual(['a', 'a', 'a']);
      expect(allLanded!.snapshot.grid[2]).toEqual(['c', 'c', 'c']);
    } finally {
      h.destroy();
    }
  });
});
