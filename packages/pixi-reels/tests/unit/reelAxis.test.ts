import { describe, it, expect } from 'vitest';
import { reelAxis, VERTICAL_FORWARD } from '../../src/core/ReelAxis.js';
import type { Container } from 'pixi.js';

// A minimal stand-in for the Container fields the axis touches.
const view = (x = 0, y = 0) => ({ x, y }) as unknown as Container;

describe('ReelAxis', () => {
  it('VERTICAL_FORWARD is the v1 default', () => {
    expect(VERTICAL_FORWARD.orientation).toBe('vertical');
    expect(VERTICAL_FORWARD.direction).toBe('forward');
    expect(VERTICAL_FORWARD.mainProp).toBe('y');
    expect(VERTICAL_FORWARD.crossProp).toBe('x');
    expect(VERTICAL_FORWARD.polarity).toBe(1);
    expect(VERTICAL_FORWARD.feedEdge).toBe('start');
  });

  it('maps orientation to main/cross props', () => {
    const h = reelAxis('horizontal', 'forward');
    expect(h.mainProp).toBe('x');
    expect(h.crossProp).toBe('y');
  });

  it('derives polarity and feedEdge from direction', () => {
    const rev = reelAxis('vertical', 'reverse');
    expect(rev.polarity).toBe(-1);
    expect(rev.feedEdge).toBe('end');
  });

  it('reads, writes and advances the travel axis only', () => {
    const v = view(3, 5);
    const ax = reelAxis('vertical', 'forward');
    expect(ax.getMain(v)).toBe(5);
    expect(ax.getCross(v)).toBe(3);
    ax.addMain(v, 10);
    expect(v.y).toBe(15);
    expect(v.x).toBe(3);
    ax.setMain(v, 0);
    expect(v.y).toBe(0);
  });

  it('advances x for horizontal', () => {
    const v = view(3, 5);
    const ax = reelAxis('horizontal', 'forward');
    ax.addMain(v, 10);
    expect(v.x).toBe(13);
    expect(v.y).toBe(5);
  });

  it('projects screen space to/from the axis and round-trips', () => {
    const vAx = reelAxis('vertical', 'forward');
    expect(vAx.toLocal(80, 100)).toEqual({ cross: 80, main: 100 });
    expect(vAx.toScreen(80, 100)).toEqual({ x: 80, y: 100 });

    const hAx = reelAxis('horizontal', 'forward');
    expect(hAx.toLocal(80, 100)).toEqual({ cross: 100, main: 80 });
    expect(hAx.toScreen(100, 80)).toEqual({ x: 80, y: 100 });

    for (const ax of [vAx, hAx]) {
      const { cross, main } = ax.toLocal(120, 100);
      const { x, y } = ax.toScreen(cross, main);
      expect({ x, y }).toEqual({ x: 120, y: 100 });
    }
  });

  it('withDirection returns a sibling axis and is identity for the same direction', () => {
    const fwd = reelAxis('vertical', 'forward');
    const rev = fwd.withDirection('reverse');
    expect(rev.direction).toBe('reverse');
    expect(rev.orientation).toBe('vertical');
    expect(rev.polarity).toBe(-1);
    expect(fwd.withDirection('forward')).toBe(fwd);
  });
});
