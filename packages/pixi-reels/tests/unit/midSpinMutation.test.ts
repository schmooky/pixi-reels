/**
 * Two things a mid-spin call CANNOT do, pinned so nobody builds on them.
 *
 * Both look plausible from the outside and are the natural first guess when
 * reaching for staged skip behaviour:
 *
 *   1. "shrink `setAnticipation()` mid-spin and the dropped reel falls out of
 *      its tease into STOP" - it does not. `_runReelPhases` reads the
 *      anticipation set ONCE, at the point the reel leaves SPIN, so a reel
 *      already inside `AnticipationPhase` is committed to it.
 *   2. "call `setSpeed()` mid-spin and the rest of the round runs on the new
 *      profile" - it does not. `spin()` captures the active `SpeedProfile`
 *      and hands that instance to every phase in the chain, which is exactly
 *      why the `skip()` boost is documented as landing on the NEXT spin.
 *
 * The supported ways to land reels mid-spin are `slamStop({ reels })` and
 * `setAnticipation(reels, { protect })`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const SLOW: SpeedProfile = {
  name: 'slow',
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
// Same timings, different name: switching to this mid-spin must change nothing
// about the in-flight round.
const SNAP: SpeedProfile = { ...SLOW, name: 'snap', anticipationDelay: 0, spinSpeed: 120 };

const GRID: ColumnTarget[] = Array.from({ length: 5 }, () => ({ visible: ['a', 'b', 'c'] }));

function makeHarness() {
  const h = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
  for (const p of [SLOW, SNAP]) h.reelSet.speed.addProfile(p.name, p);
  h.reelSet.setSpeed('slow');
  const pump = setInterval(() => h.ticker.tick(16), 16);
  const landed: number[] = [];
  h.reelSet.events.on('spin:reelLanded', (i) => { if (!landed.includes(i)) landed.push(i); });
  return { ...h, landed, stopPump: () => clearInterval(pump) };
}

describe('what a mid-spin call cannot do', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;

  afterEach(() => {
    if (harness) {
      harness.stopPump();
      harness.destroy();
      harness = null;
    }
  });

  it('shrinking the anticipation set does not release a reel already teasing', async () => {
    const h = (harness = makeHarness());
    const teasing: number[] = [];
    h.reelSet.events.on('anticipation:reel', ({ reelIndex }) => teasing.push(reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([3, 4]);
    h.reelSet.setResult(GRID);

    // Let both reels enter their tease.
    await new Promise((r) => setTimeout(r, 120));
    expect([...teasing].sort()).toEqual([3, 4]);

    // Drop reel 4 from the set. If this released it, reel 4 would land well
    // before the 600ms hold is up.
    h.reelSet.setAnticipation([3]);
    await new Promise((r) => setTimeout(r, 150));
    expect(h.landed).not.toContain(4);

    // It lands on its own schedule, having played the full tease.
    await p;
    expect(h.landed).toContain(4);
  });

  it('setSpeed mid-spin does not re-time the round in flight', async () => {
    const h = (harness = makeHarness());
    const teasing: number[] = [];
    h.reelSet.events.on('anticipation:reel', ({ reelIndex }) => teasing.push(reelIndex));

    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([3, 4]);
    h.reelSet.setResult(GRID);

    // 'snap' has anticipationDelay 0, so if the switch took effect in flight
    // the tease would be cancelled outright.
    h.reelSet.setSpeed('snap');
    await p;

    expect([...teasing].sort()).toEqual([3, 4]);
    // The profile IS now snap - it just applies from the next spin on.
    expect(h.reelSet.speed.activeName).toBe('snap');
  });

  it('slamStop({ reels }) DOES release a reel mid-tease', async () => {
    const h = (harness = makeHarness());
    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([3, 4]);
    h.reelSet.setResult(GRID);

    await new Promise((r) => setTimeout(r, 120));
    h.reelSet.slamStop({ reels: [4] });

    // Synchronous: the supported lever lands it immediately, mid-tease.
    expect(h.landed).toContain(4);
    expect(h.landed).not.toContain(3);
    await p;
  });
});
