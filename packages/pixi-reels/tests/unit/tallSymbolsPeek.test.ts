/**
 * A tall block through an anticipation tease and a peeking landing.
 *
 * The teased reel keeps drawing tall blocks while it crawls, the result
 * lands the block with its head on the last visible cell and its body in
 * bufferEnd, and the game then brings it up: a reverse nudge (the column
 * moves) or `setColumn` (the block grows over the cells above it).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { OCCUPIED_SENTINEL } from '../../src/core/Reel.js';
import type { Reel } from '../../src/core/Reel.js';
import { createTestReelSet } from '../../src/testing/index.js';
import type { SpeedProfile } from '../../src/config/types.js';

const TALL = 3;
const CELL = 100;

const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 600,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

/**
 * The anticipation phase runs on gsap's own clock (a timeline and a
 * delayedCall), so these tests pump the FakeTicker on real time instead of
 * stepping it, as the anticipation suites do.
 */
function makeHarness() {
  const h = createTestReelSet({
    reels: 2,
    visibleCells: 3,
    symbolIds: ['a', 'b', 'tall'],
    weights: { a: 1, b: 1 },
    symbolData: { tall: { weight: 40, size: { reels: 1, cells: TALL } } },
    // `start` hides a block's covered cells while its anchor is off the
    // strip; `end` holds the body of a block that lands peeking.
    bufferSymbols: { start: TALL, end: TALL - 1 },
    symbolSize: { width: CELL, height: CELL },
  });
  h.reelSet.speed.addProfile(FAST.name, FAST);
  h.reelSet.setSpeed(FAST.name);
  const pump = setInterval(() => h.ticker.tick(16), 16);
  return { ...h, stopPump: () => clearInterval(pump) };
}

const ids = (reel: Reel) => reel.symbols.map((s) => s.symbolId);
const heightOf = (reel: Reel, strip: number) => (reel.symbols[strip] as unknown as { height: number }).height;

/** Spin, tease reel 0, land the block peeking from the bottom of reel 0. */
async function landPeeking(h: ReturnType<typeof makeHarness>) {
  const reel = h.reelSet.reels[0];
  let teased = false;
  let tallWhileTeased = false;
  h.reelSet.events.on('anticipation:reel', () => {
    teased = true;
  });
  const watch = setInterval(() => {
    if (teased && h.reelSet.isSpinning && ids(reel).includes('tall')) tallWhileTeased = true;
  }, 8);
  const spin = h.reelSet.spin();
  await new Promise((r) => setTimeout(r, 200));
  h.reelSet.setResult([{ visible: ['a', 'b', 'tall'] }, { visible: ['b', 'a', 'b'] }]);
  h.reelSet.setAnticipation([0]);
  await spin;
  clearInterval(watch);
  expect(teased).toBe(true);
  return { reel, tallWhileTeased };
}

describe('a tall block through an anticipation tease, landing peeking from the bottom', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.stopPump();
    harness?.destroy();
    harness = null;
  });

  it('keeps streaming blocks during the tease and lands the block head-up, body in bufferEnd', async () => {
    const h = (harness = makeHarness());
    {
      const { reel, tallWhileTeased } = await landPeeking(h);
      expect(tallWhileTeased).toBe(true);
      expect(h.reelSet.getVisibleGrid()).toEqual([
        ['a', 'b', 'tall'],
        ['b', 'a', 'b'],
      ]);
      // Strip: 3 start slots, a, b, tall, then the block's two covered cells.
      const strip = ids(reel);
      expect(strip.slice(TALL)).toEqual(['a', 'b', 'tall', OCCUPIED_SENTINEL, OCCUPIED_SENTINEL]);
      expect(strip.slice(0, TALL)).not.toContain(OCCUPIED_SENTINEL);
      expect(heightOf(reel, TALL + 2)).toBe(CELL * TALL);
      // The block's rectangle is the whole block; the mask clips its body.
      const bounds = h.reelSet.getBlockBounds(0, 2);
      expect(bounds.height).toBe(CELL * TALL);
      expect(bounds.y).toBe(CELL * 2);
    }
  });

  it('a reverse nudge brings the block up into full view', async () => {
    const h = (harness = makeHarness());
    {
      const { reel } = await landPeeking(h);
      await h.reelSet.nudge(0, { distance: 2, direction: 'reverse', incoming: ['a', 'b'] });
      expect(h.reelSet.getVisibleGrid()[0]).toEqual(['tall', 'tall', 'tall']);
      expect(h.reelSet.getSymbolFootprint(0, 2)).toEqual({
        anchor: { reel: 0, cell: 0 },
        size: { reels: 1, cells: TALL },
      });
      expect(h.reelSet.getBlockBounds(0, 0).height).toBe(CELL * TALL);
      expect(ids(reel).slice(TALL, TALL + 3)).toEqual(['tall', OCCUPIED_SENTINEL, OCCUPIED_SENTINEL]);
      // The two cells nudged in sit above the block, and bufferEnd is refilled.
      expect(ids(reel).slice(TALL + 3)).not.toContain(OCCUPIED_SENTINEL);
      expect(ids(reel).slice(TALL + 3)).not.toContain('tall');
    }
  });

  it('setColumn expands the block up over the cells above it', async () => {
    const h = (harness = makeHarness());
    {
      const { reel } = await landPeeking(h);
      h.reelSet.setColumn(0, { visible: ['tall', 'a', 'b'], bufferEnd: ['a', 'b'] });
      expect(h.reelSet.getVisibleGrid()[0]).toEqual(['tall', 'tall', 'tall']);
      expect(h.reelSet.getSymbolFootprint(0, 2)).toEqual({
        anchor: { reel: 0, cell: 0 },
        size: { reels: 1, cells: TALL },
      });
      expect(heightOf(reel, TALL)).toBe(CELL * TALL);
      expect(ids(reel).slice(TALL)).toEqual(['tall', OCCUPIED_SENTINEL, OCCUPIED_SENTINEL, 'a', 'b']);
      // The next spin runs clean from here.
      const spin = h.reelSet.spin();
      await new Promise((r) => setTimeout(r, 200));
      h.reelSet.setResult([{ visible: ['b', 'a', 'b'] }, { visible: ['a', 'b', 'a'] }]);
      await spin;
      expect(h.reelSet.getVisibleGrid()[0]).toEqual(['b', 'a', 'b']);
      expect(ids(reel)).not.toContain(OCCUPIED_SENTINEL);
    }
  });
});
