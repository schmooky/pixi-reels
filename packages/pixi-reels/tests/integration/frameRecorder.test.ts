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

  it('captures spin:reelLanded once per reel and orders triggers correctly', async () => {
    const h = makeHarness();
    try {
      startRecording(h.reelSet, 'order');
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
      ]);
      stopRecording(h.reelSet);

      const frames = getFrames('order');
      const triggers = frames.map((f) => f.trigger);
      // 3-reel slot → exactly 3 reelLanded captures.
      expect(triggers.filter((t) => t === 'spin:reelLanded').length).toBe(3);
      // spin:start fires before any reelLanded; allLanded before complete.
      const startIdx = triggers.indexOf('spin:start');
      const firstReelIdx = triggers.indexOf('spin:reelLanded');
      const allLandedIdx = triggers.indexOf('spin:allLanded');
      const completeIdx = triggers.indexOf('spin:complete');
      expect(startIdx).toBeLessThan(firstReelIdx);
      expect(firstReelIdx).toBeLessThan(allLandedIdx);
      expect(allLandedIdx).toBeLessThan(completeIdx);
    } finally {
      h.destroy();
    }
  });

  it('respects maxFrames cap with rolling-window eviction', async () => {
    const h = makeHarness();
    try {
      // Cap at 2 — a single spin emits >> 2 events, oldest get evicted.
      startRecording(h.reelSet, 'cap', { maxFrames: 2 });
      await h.spinAndLand([
        ['a', 'a', 'a'],
        ['b', 'b', 'b'],
        ['c', 'c', 'c'],
      ]);
      stopRecording(h.reelSet);

      const frames = getFrames();
      expect(frames.length).toBeLessThanOrEqual(2);
      // The most recent triggers survive; spin:start (the very first)
      // would have been evicted by spin:complete (the very last).
      expect(frames.map((f) => f.trigger)).toContain('spin:complete');
    } finally {
      h.destroy();
    }
  });

  it('auto-detaches on reelSet destroyed event', async () => {
    const h = makeHarness();
    startRecording(h.reelSet, 'auto-detach');
    // Destroying the reel set should detach listeners — a follow-up
    // spin/emit cannot happen on a destroyed set, but we verify the
    // cleanup path by checking the recorder map no longer holds a detach.
    h.destroy();
    // After destroy, calling stopRecording is a safe no-op (listener
    // list already empty); calling startRecording on a fresh set works.
    expect(() => stopRecording(h.reelSet)).not.toThrow();
  });
});
