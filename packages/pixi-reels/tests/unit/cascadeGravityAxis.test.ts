/**
 * Cascade geometry under every orientation x direction combination, plus the
 * explicit `tumble({ gravity })` override (ADR 016 section 3.6).
 *
 * The whole cascade suite used to run vertical/forward only -- 18 files call
 * `.tumble(`, none of them set an axis -- which is exactly how a reverse reel
 * shipped refilling through the edge it had just emptied. These assert the
 * ABSOLUTE direction of travel, not a relative law: a relative "reverse is
 * forward mirrored" check passes happily when both sides are broken the same
 * way, so every expectation below names the edge symbols must come from.
 */
import { describe, expect, it, vi } from 'vitest';
import { gsap as defaultGsap } from 'gsap';
import { createTestReelSet } from '../../src/testing/index.js';
import type { Direction, Orientation } from '../../src/core/ReelAxis.js';

interface Tween {
  prop: 'x' | 'y';
  from: number;
  to: number;
}

/**
 * A gsap stand-in that records every `.to()` endpoint pair, applies the final
 * value immediately, and completes synchronously. Recording BOTH ends is the
 * point: a drop-in that lands correctly can still have entered from the wrong
 * edge, and only `from` shows that.
 */
function recordingGsap(log: Tween[]): typeof defaultGsap {
  const makeTimeline = (vars?: { onComplete?: () => void }) => {
    const tl: Record<string, unknown> = {};
    tl.to = (target: Record<string, number>, v: Record<string, unknown>) => {
      const prop = 'y' in v ? 'y' : 'x' in v ? 'x' : null;
      if (prop) {
        log.push({ prop, from: target[prop], to: v[prop] as number });
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

const CELL_W = 120;
const CELL_H = 100;
/**
 * Cell pitch along the TRAVEL axis. Deliberately different per orientation:
 * a vertical strip advances by the symbol height, a horizontal one by the
 * width. A square symbol here would let a transposition pass unnoticed.
 */
const pitchFor = (o: Orientation): number => (o === 'vertical' ? CELL_H : CELL_W);

function makeSet(
  orientation: Orientation,
  direction: Direction,
  log: Tween[],
  gravity?: 'auto' | Direction,
) {
  return createTestReelSet({
    reels: 1,
    visibleCells: 3,
    symbolIds: ['a', 'b'],
    symbolSize: { width: CELL_W, height: CELL_H },
    orientation,
    direction,
    gsap: recordingGsap(log),
    tumble: {
      gravity,
      fall: { duration: 100, cellStagger: 0 },
      dropIn: { duration: 100, cellStagger: 0, distance: 'perHole' },
    },
    initialFrame: [{ visible: ['a', 'a', 'a'] }],
  });
}

/** Refill reel 0 clearing the given visible cell. */
async function refillClearing(
  set: ReturnType<typeof makeSet>,
  cell: number,
  grid: string[],
): Promise<void> {
  await set.reelSet.refill({
    winners: [{ reel: 0, cell }],
    grid: [{ visible: grid }],
  });
}

const COMBOS: Array<[Orientation, Direction, 'x' | 'y']> = [
  ['vertical', 'forward', 'y'],
  ['vertical', 'reverse', 'y'],
  ['horizontal', 'forward', 'x'],
  ['horizontal', 'reverse', 'x'],
];

describe('cascade gravity follows the reel axis', () => {
  for (const [orientation, direction, mainProp] of COMBOS) {
    const towardEnd = direction === 'forward';

    it(`${orientation}/${direction}: symbols fall toward the ${towardEnd ? 'end' : 'start'} edge`, async () => {
      const log: Tween[] = [];
      const h = makeSet(orientation, direction, log);
      log.length = 0;

      // spin() runs CascadeFallPhase: every visible symbol leaves the board.
      const spin = h.reelSet.spin();
      await Promise.resolve();

      expect(log.length, 'fall tweens recorded').toBeGreaterThan(0);
      for (const t of log) {
        expect(t.prop, 'fall runs on the travel axis').toBe(mainProp);
        // The absolute anchor: falling means the main coordinate moves the
        // way gravity points, never the other way.
        if (towardEnd) expect(t.to).toBeGreaterThan(t.from);
        else expect(t.to).toBeLessThan(t.from);
      }

      h.reelSet.setResult([{ visible: ['b', 'b', 'b'] }]);
      h.reelSet.slamStop();
      await spin;
      h.destroy();
    });

    it(`${orientation}/${direction}: a refill enters from the ${towardEnd ? 'start' : 'end'} edge`, async () => {
      const log: Tween[] = [];
      // Clear the cell gravity packs AWAY from, so exactly one new symbol
      // enters and the two survivors slide one cell.
      const clearedCell = towardEnd ? 0 : 2;
      const h = makeSet(orientation, direction, log);
      log.length = 0;

      await refillClearing(h, clearedCell, ['b', 'a', 'a']);

      const moves = log.filter((t) => t.from !== t.to);
      expect(moves.length, 'drop-in tweens recorded').toBeGreaterThan(0);
      for (const t of moves) {
        expect(t.prop, 'drop-in runs on the travel axis').toBe(mainProp);
        if (towardEnd) expect(t.to).toBeGreaterThan(t.from);
        else expect(t.to).toBeLessThan(t.from);
      }

      // The new symbol enters from OFF the grid on the entry side. Cells
      // occupy main 0..2*pitch, so the entry origin is -pitch (forward) or
      // +3*pitch (reverse).
      const pitch = pitchFor(orientation);
      const origins = moves.map((t) => t.from);
      if (towardEnd) expect(Math.min(...origins)).toBe(-pitch);
      else expect(Math.max(...origins)).toBe(3 * pitch);

      h.destroy();
    });
  }

  it("gravity: 'reverse' overrides a forward-travelling reel", async () => {
    // Gravity and travel are separable: the reel still spins forward, but the
    // board drains upward. Nothing else in the config changes.
    const log: Tween[] = [];
    const h = makeSet('vertical', 'forward', log, 'reverse');
    log.length = 0;

    await refillClearing(h, 2, ['b', 'a', 'a']);

    const moves = log.filter((t) => t.from !== t.to);
    expect(moves.length).toBeGreaterThan(0);
    for (const t of moves) expect(t.to).toBeLessThan(t.from);
    expect(Math.max(...moves.map((t) => t.from))).toBe(3 * CELL_H);

    h.destroy();
  });

  it("gravity: 'forward' overrides a reverse-travelling reel", async () => {
    const log: Tween[] = [];
    const h = makeSet('vertical', 'reverse', log, 'forward');
    log.length = 0;

    await refillClearing(h, 0, ['b', 'a', 'a']);

    const moves = log.filter((t) => t.from !== t.to);
    expect(moves.length).toBeGreaterThan(0);
    for (const t of moves) expect(t.to).toBeGreaterThan(t.from);
    expect(Math.min(...moves.map((t) => t.from))).toBe(-CELL_H);

    h.destroy();
  });

  it("defaults to 'auto', which is the reel's own direction", async () => {
    const auto: Tween[] = [];
    const explicit: Tween[] = [];
    const a = makeSet('vertical', 'reverse', auto);
    await refillClearing(a, 2, ['b', 'a', 'a']);
    a.destroy();
    const e = makeSet('vertical', 'reverse', explicit, 'reverse');
    await refillClearing(e, 2, ['b', 'a', 'a']);
    e.destroy();

    expect(auto).toEqual(explicit);
  });
});
