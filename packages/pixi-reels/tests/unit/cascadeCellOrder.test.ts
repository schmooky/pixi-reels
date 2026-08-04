/**
 * `cellOrder` staggering, which is a GRAVITY concern, not an index one.
 *
 * A reel draining upward used to stagger from the bottom cell anyway -- the
 * one FURTHEST from the edge symbols were leaving by -- so the cell nearest
 * the drain waited for the whole column to clear ahead of it. The geometry
 * was right (`cascadeGravityAxis.test.ts` covers that); only the timing read
 * backwards, which is why nothing caught it.
 *
 * These assert the stagger OFFSET per cell, not just the tween endpoints.
 * The offset is `tl.to`'s third argument, so the recorder below keeps it --
 * the gravity-axis recorder drops it, and an ordering bug is invisible
 * without it.
 */
import { describe, expect, it, vi } from 'vitest';
import { gsap as defaultGsap } from 'gsap';
import { createTestReelSet } from '../../src/testing/index.js';
import { resolveCellOrder } from '../../src/cascade/TumbleConfig.js';
import type { Direction } from '../../src/core/ReelAxis.js';

const CELL = 100;
const STAGGER = 60;
/** One stagger step in seconds. what the phases hand gsap as a position. */
const STEP = STAGGER / 1000;

/**
 * gsap stand-in that records each tween's position on the timeline. Tweens
 * are registered in cell order (0..n-1), so the recorded array indexes by
 * cell and the VALUES say who goes first.
 */
function offsetRecordingGsap(offsets: number[]): typeof defaultGsap {
  const makeTimeline = (vars?: { onComplete?: () => void }) => {
    const tl: Record<string, unknown> = {};
    tl.to = (target: Record<string, number>, v: Record<string, unknown>, position?: number) => {
      const prop = 'y' in v ? 'y' : 'x' in v ? 'x' : null;
      if (prop) {
        offsets.push(position ?? 0);
        target[prop] = v[prop] as number;
      }
      return tl;
    };
    tl.call = (fn: () => void) => { fn(); return tl; };
    tl.kill = vi.fn();
    tl.progress = vi.fn();
    tl.eventCallback = () => tl;
    if (vars?.onComplete) queueMicrotask(vars.onComplete);
    return tl;
  };
  return {
    ...defaultGsap,
    timeline: makeTimeline,
    to: (t: Record<string, number>, v: Record<string, unknown>) =>
      (makeTimeline() as { to: (a: unknown, b: unknown) => unknown }).to(t, v),
    delayedCall: (_d: number, fn: () => void) => { fn(); return { kill: vi.fn() }; },
  } as unknown as typeof defaultGsap;
}

function makeSet(
  direction: Direction,
  offsets: number[],
  opts: { gravity?: 'auto' | Direction; cellOrder?: 'auto' | 'endFirst' | 'startFirst' } = {},
) {
  return createTestReelSet({
    reels: 1,
    visibleCells: 3,
    symbolIds: ['a', 'b'],
    symbolSize: { width: CELL, height: CELL },
    direction,
    gsap: offsetRecordingGsap(offsets),
    tumble: {
      gravity: opts.gravity,
      fall: { duration: 100, cellStagger: STAGGER, cellOrder: opts.cellOrder },
      dropIn: { duration: 100, cellStagger: STAGGER, cellOrder: opts.cellOrder, distance: 'perHole' },
    },
    initialFrame: [{ visible: ['a', 'a', 'a'] }],
  });
}

/** Run the fall phase (spin start) and return the per-cell stagger offsets. */
async function fallOffsets(
  direction: Direction,
  opts?: { gravity?: 'auto' | Direction; cellOrder?: 'auto' | 'endFirst' | 'startFirst' },
): Promise<number[]> {
  const offsets: number[] = [];
  const h = makeSet(direction, offsets, opts);
  offsets.length = 0;

  const spin = h.reelSet.spin();
  await Promise.resolve();
  const recorded = [...offsets];

  h.reelSet.setResult([{ visible: ['b', 'b', 'b'] }]);
  h.reelSet.slamStop();
  await spin;
  h.destroy();
  return recorded;
}

/**
 * Run a refill that replaces the whole column (every cell is a mover, so
 * every cell gets a stagger slot) and return the per-cell offsets.
 */
async function dropOffsets(
  direction: Direction,
  opts?: { gravity?: 'auto' | Direction; cellOrder?: 'auto' | 'endFirst' | 'startFirst' },
): Promise<number[]> {
  const offsets: number[] = [];
  const h = makeSet(direction, offsets, opts);
  offsets.length = 0;

  await h.reelSet.refill({
    winners: [{ reel: 0, cell: 0 }, { reel: 0, cell: 1 }, { reel: 0, cell: 2 }],
    grid: [{ visible: ['b', 'b', 'b'] }],
  });
  const recorded = [...offsets];
  h.destroy();
  return recorded;
}

describe('resolveCellOrder', () => {
  it("'auto' picks the gravity-exit end", () => {
    expect(resolveCellOrder('auto', 'forward')).toBe('endFirst');
    expect(resolveCellOrder('auto', 'reverse')).toBe('startFirst');
  });

  it('explicit values are geometric and ignore gravity', () => {
    expect(resolveCellOrder('endFirst', 'forward')).toBe('endFirst');
    expect(resolveCellOrder('endFirst', 'reverse')).toBe('endFirst');
    expect(resolveCellOrder('startFirst', 'forward')).toBe('startFirst');
    expect(resolveCellOrder('startFirst', 'reverse')).toBe('startFirst');
  });
});

describe('cascade cell stagger follows gravity', () => {
  // Offsets index by cell (0 = top). Value 0 means "starts first".
  const BOTTOM_FIRST = [2 * STEP, STEP, 0];
  const TOP_FIRST = [0, STEP, 2 * STEP];

  it('forward reel: the bottom cell falls first', async () => {
    expect(await fallOffsets('forward')).toEqual(BOTTOM_FIRST);
  });

  it('forward reel: the bottom cell lands first', async () => {
    expect(await dropOffsets('forward')).toEqual(BOTTOM_FIRST);
  });

  it('reverse reel drains upward, so the TOP cell falls first', async () => {
    expect(await fallOffsets('reverse')).toEqual(TOP_FIRST);
  });

  it('reverse reel drains upward, so the TOP cell lands first', async () => {
    expect(await dropOffsets('reverse')).toEqual(TOP_FIRST);
  });

  it("gravity: 'forward' on a reverse reel keeps the bottom cell first", async () => {
    // The recipe case: travel and settling deliberately disagree. Settling
    // wins, because that is the edge the column is draining by.
    expect(await fallOffsets('reverse', { gravity: 'forward' })).toEqual(BOTTOM_FIRST);
    expect(await dropOffsets('reverse', { gravity: 'forward' })).toEqual(BOTTOM_FIRST);
  });

  it("gravity: 'reverse' on a forward reel puts the top cell first", async () => {
    expect(await fallOffsets('forward', { gravity: 'reverse' })).toEqual(TOP_FIRST);
    expect(await dropOffsets('forward', { gravity: 'reverse' })).toEqual(TOP_FIRST);
  });
});

describe('explicit cellOrder pins a geometric end', () => {
  const BOTTOM_FIRST = [2 * STEP, STEP, 0];
  const TOP_FIRST = [0, STEP, 2 * STEP];

  it("'endFirst' stays the bottom cell even when the reel drains upward", async () => {
    expect(await fallOffsets('reverse', { cellOrder: 'endFirst' })).toEqual(BOTTOM_FIRST);
    expect(await dropOffsets('reverse', { cellOrder: 'endFirst' })).toEqual(BOTTOM_FIRST);
  });

  it("'startFirst' stays the top cell on an ordinary downward reel", async () => {
    expect(await fallOffsets('forward', { cellOrder: 'startFirst' })).toEqual(TOP_FIRST);
    expect(await dropOffsets('forward', { cellOrder: 'startFirst' })).toEqual(TOP_FIRST);
  });
});
