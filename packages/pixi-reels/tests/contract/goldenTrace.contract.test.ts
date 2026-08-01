/**
 * Golden-master position traces (ADR 018 section 10.1).
 *
 * The contract laws say the motion is self-consistent. These say it is the
 * SAME motion it was: a frame-by-frame record of every symbol's main-axis
 * position and array order across a scenario matrix, checked in as an inline
 * snapshot.
 *
 * Deliberately recorded from `ReelMotion` driven directly rather than from a
 * full spin. GSAP tweens (StopPhase's bounce, the cascade drop-in) are wall
 * -clock driven and would make the baseline flap; the strip physics are what
 * A4-A8 rewrote and what a future axis change would break.
 *
 * When one of these fails, that is a real behaviour change. Decide whether
 * it is intended, and if it is, say which contract law the OLD value
 * violated before you re-record.
 */
import { describe, it, expect } from 'vitest';
import { ReelMotion } from '../../src/core/ReelMotion.js';
import { reelAxis, type Orientation, type Direction } from '../../src/core/ReelAxis.js';
import type { ReelSymbol } from '../../src/symbols/ReelSymbol.js';
import type { Container } from 'pixi.js';

interface Scenario {
  name: string;
  cellSize: number;
  gap: number;
  bufferStart: number;
  visibleCells: number;
  bufferEnd: number;
  /** Travel deltas, in order. Signed: negative is StartPhase's step-back pull. */
  deltas: number[];
}

const SCENARIOS: Scenario[] = [
  {
    name: 'uniform 3-cell, steady forward travel',
    cellSize: 100, gap: 0, bufferStart: 1, visibleCells: 3, bufferEnd: 1,
    deltas: [40, 40, 40, 40, 40, 40, 40, 40],
  },
  {
    name: 'start-phase pull then release',
    cellSize: 100, gap: 8, bufferStart: 1, visibleCells: 3, bufferEnd: 1,
    deltas: [-12, -8, 20, 45, 45, 45],
  },
  {
    name: 'tall reel with gaps, several wraps',
    cellSize: 80, gap: 12, bufferStart: 2, visibleCells: 5, bufferEnd: 2,
    deltas: [46, 46, 46, 46, 46, 46, 46, 46, 46, 46],
  },
  {
    name: 'cascade full-cell steps',
    cellSize: 120, gap: 0, bufferStart: 1, visibleCells: 4, bufferEnd: 1,
    deltas: [120, 120, 120],
  },
  {
    name: 'single visible cell, minimum buffers',
    cellSize: 60, gap: 4, bufferStart: 1, visibleCells: 1, bufferEnd: 1,
    deltas: [30, 30, 30, 30, 30],
  },
];

function trace(
  s: Scenario,
  orientation: Orientation,
  direction: Direction,
  labels = true,
): string {
  const axis = reelAxis(orientation, direction);
  const total = s.bufferStart + s.visibleCells + s.bufferEnd;
  const symbols = Array.from({ length: total }, (_, i) => ({
    id: i,
    view: { x: 0, y: 0 } as Container,
  }));
  const motion = new ReelMotion(
    symbols as unknown as ReelSymbol[],
    s.cellSize,
    s.gap,
    s.bufferStart,
    s.visibleCells,
    s.bufferEnd,
    () => {},
    axis,
  );
  motion.snapToGrid();
  const lines: string[] = [];
  const frame = (): string =>
    symbols.map((x) => `${x.id}:${axis.getMain(x.view).toFixed(3)}`).join(' ');
  lines.push(labels ? `snap  ${frame()}` : frame());
  for (const d of s.deltas) {
    motion.advance(d);
    const label = `${d >= 0 ? '+' : ''}${d.toFixed(0).padStart(4)}  `;
    lines.push(labels ? label + frame() : frame());
  }
  return lines.join('\n');
}

describe('golden traces: vertical / forward (the v1 baseline)', () => {
  it('uniform 3-cell, steady forward travel', () => {
    expect(trace(SCENARIOS[0], 'vertical', 'forward')).toMatchInlineSnapshot(`
      "snap  0:-100.000 1:0.000 2:100.000 3:200.000 4:300.000
      +  40  0:-60.000 1:40.000 2:140.000 3:240.000 4:340.000
      +  40  0:-20.000 1:80.000 2:180.000 3:280.000 4:380.000
      +  40  4:-80.000 0:20.000 1:120.000 2:220.000 3:320.000
      +  40  4:-40.000 0:60.000 1:160.000 2:260.000 3:360.000
      +  40  3:-100.000 4:0.000 0:100.000 1:200.000 2:300.000
      +  40  3:-60.000 4:40.000 0:140.000 1:240.000 2:340.000
      +  40  3:-20.000 4:80.000 0:180.000 1:280.000 2:380.000
      +  40  2:-80.000 3:20.000 4:120.000 0:220.000 1:320.000"
    `);
  });
  it('start-phase pull then release', () => {
    expect(trace(SCENARIOS[1], 'vertical', 'forward')).toMatchInlineSnapshot(`
      "snap  0:-108.000 1:0.000 2:108.000 3:216.000 4:324.000
       -12  1:-12.000 2:96.000 3:204.000 4:312.000 0:420.000
        -8  1:-20.000 2:88.000 3:196.000 4:304.000 0:412.000
      +  20  0:-108.000 1:0.000 2:108.000 3:216.000 4:324.000
      +  45  0:-63.000 1:45.000 2:153.000 3:261.000 4:369.000
      +  45  0:-18.000 1:90.000 2:198.000 3:306.000 4:414.000
      +  45  4:-81.000 0:27.000 1:135.000 2:243.000 3:351.000"
    `);
  });
  it('tall reel with gaps, several wraps', () => {
    expect(trace(SCENARIOS[2], 'vertical', 'forward')).toMatchInlineSnapshot(`
      "snap  0:-184.000 1:-92.000 2:0.000 3:92.000 4:184.000 5:276.000 6:368.000 7:460.000 8:552.000
      +  46  0:-138.000 1:-46.000 2:46.000 3:138.000 4:230.000 5:322.000 6:414.000 7:506.000 8:598.000
      +  46  8:-184.000 0:-92.000 1:0.000 2:92.000 3:184.000 4:276.000 5:368.000 6:460.000 7:552.000
      +  46  8:-138.000 0:-46.000 1:46.000 2:138.000 3:230.000 4:322.000 5:414.000 6:506.000 7:598.000
      +  46  7:-184.000 8:-92.000 0:0.000 1:92.000 2:184.000 3:276.000 4:368.000 5:460.000 6:552.000
      +  46  7:-138.000 8:-46.000 0:46.000 1:138.000 2:230.000 3:322.000 4:414.000 5:506.000 6:598.000
      +  46  6:-184.000 7:-92.000 8:0.000 0:92.000 1:184.000 2:276.000 3:368.000 4:460.000 5:552.000
      +  46  6:-138.000 7:-46.000 8:46.000 0:138.000 1:230.000 2:322.000 3:414.000 4:506.000 5:598.000
      +  46  5:-184.000 6:-92.000 7:0.000 8:92.000 0:184.000 1:276.000 2:368.000 3:460.000 4:552.000
      +  46  5:-138.000 6:-46.000 7:46.000 8:138.000 0:230.000 1:322.000 2:414.000 3:506.000 4:598.000
      +  46  4:-184.000 5:-92.000 6:0.000 7:92.000 8:184.000 0:276.000 1:368.000 2:460.000 3:552.000"
    `);
  });
  it('cascade full-cell steps', () => {
    expect(trace(SCENARIOS[3], 'vertical', 'forward')).toMatchInlineSnapshot(`
      "snap  0:-120.000 1:0.000 2:120.000 3:240.000 4:360.000 5:480.000
      + 120  5:-120.000 0:0.000 1:120.000 2:240.000 3:360.000 4:480.000
      + 120  4:-120.000 5:0.000 0:120.000 1:240.000 2:360.000 3:480.000
      + 120  3:-120.000 4:0.000 5:120.000 0:240.000 1:360.000 2:480.000"
    `);
  });
  it('single visible cell, minimum buffers', () => {
    expect(trace(SCENARIOS[4], 'vertical', 'forward')).toMatchInlineSnapshot(`
      "snap  0:-64.000 1:0.000 2:64.000
      +  30  0:-34.000 1:30.000 2:94.000
      +  30  0:-4.000 1:60.000 2:124.000
      +  30  2:-38.000 0:26.000 1:90.000
      +  30  2:-8.000 0:56.000 1:120.000
      +  30  1:-42.000 2:22.000 0:86.000"
    `);
  });
});

/**
 * The other three combinations are pinned RELATIVE to the baseline rather
 * than snapshotted separately. That is the stronger statement: a snapshot
 * only says "unchanged since I recorded it", while these say "still the same
 * motion as vertical/forward, projected".
 */
describe('golden traces: the other three combinations derive from the baseline', () => {
  it.each(SCENARIOS.map((s) => [s.name, s] as const))(
    '%s: horizontal/forward is identical on the other axis',
    (_name, s) => {
      expect(trace(s, 'horizontal', 'forward')).toBe(trace(s, 'vertical', 'forward'));
    },
  );

  it.each(SCENARIOS.map((s) => [s.name, s] as const))(
    '%s: reverse is the baseline with every delta negated',
    (_name, s) => {
      // The delta labels differ by construction (negated), so compare
      // positions only.
      const mirrored: Scenario = { ...s, deltas: s.deltas.map((d) => -d) };
      expect(trace(s, 'vertical', 'reverse', false)).toBe(
        trace(mirrored, 'vertical', 'forward', false),
      );
      expect(trace(s, 'horizontal', 'reverse', false)).toBe(
        trace(mirrored, 'horizontal', 'forward', false),
      );
    },
  );
});
