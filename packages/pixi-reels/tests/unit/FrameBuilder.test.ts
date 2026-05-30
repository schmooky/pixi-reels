import { describe, it, expect, vi } from 'vitest';
import { FrameBuilder, type FrameMiddleware } from '../../src/frame/FrameBuilder.js';
import { RandomSymbolProvider } from '../../src/frame/RandomSymbolProvider.js';
import { columnTargetToArray } from '../../src/frame/ColumnTarget.js';

describe('FrameBuilder', () => {
  function createBuilder() {
    const provider = new RandomSymbolProvider({
      a: { weight: 10 },
      b: { weight: 10 },
    });
    return new FrameBuilder(provider);
  }

  it('builds a frame with correct length', () => {
    const builder = createBuilder();
    const frame = builder.build(0, 3, 1, 1);
    expect(frame.length).toBe(5); // 1 buffer + 3 visible + 1 buffer
  });

  it('fills all positions with symbols', () => {
    const builder = createBuilder();
    const frame = builder.build(0, 3, 1, 1);
    for (const symbol of frame) {
      expect(['a', 'b']).toContain(symbol);
    }
  });

  it('places target symbols in visible area', () => {
    const builder = createBuilder();
    const frame = builder.build(0, 3, 1, 1, ['x', 'y', 'z']);
    // Buffer above (index 0) is random
    // Visible area: indices 1, 2, 3
    expect(frame[1]).toBe('x');
    expect(frame[2]).toBe('y');
    expect(frame[3]).toBe('z');
  });

  it('buildAll creates frames for all reels', () => {
    const builder = createBuilder();
    const frames = builder.buildAll(3, 3, 1, 1);
    expect(frames.length).toBe(3);
    for (const frame of frames) {
      expect(frame.length).toBe(5);
    }
  });

  it('custom middleware runs in priority order', () => {
    const builder = createBuilder();
    const order: number[] = [];

    builder.use({
      name: 'second',
      priority: 20,
      process(ctx, next) {
        order.push(20);
        next();
      },
    });

    builder.use({
      name: 'first',
      priority: 5,
      process(ctx, next) {
        order.push(5);
        next();
      },
    });

    builder.build(0, 3, 1, 1);
    // Built-in random-fill is priority 0, target-placement is 10
    // Custom: 5, 20
    // Order should be: 0 (random), 5 (custom), 10 (target), 20 (custom)
    expect(order).toEqual([5, 20]);
  });

  it('places target symbol in buffer-above slot 0', () => {
    const builder = createBuilder();
    const target = columnTargetToArray({ visible: ['x', 'y', 'z'], bufferAbove: ['bufAbove'] });
    const frame = builder.build(0, 3, 1, 1, target);
    expect(frame[0]).toBe('bufAbove');
    expect(frame[1]).toBe('x');
    expect(frame[2]).toBe('y');
    expect(frame[3]).toBe('z');
  });

  it('places target symbols in multiple buffer-above slots (bufferAbove = 2)', () => {
    const builder = createBuilder();
    const target = columnTargetToArray({
      visible: ['x', 'y', 'z'],
      bufferAbove: ['above1', 'above2'],
    });
    const frame = builder.build(0, 3, 2, 1, target);
    expect(frame[0]).toBe('above2');
    expect(frame[1]).toBe('above1');
    expect(frame[2]).toBe('x');
    expect(frame[3]).toBe('y');
    expect(frame[4]).toBe('z');
  });

  it('places target symbol in buffer-below slot via index >= visibleRows', () => {
    const builder = createBuilder();
    const target = ['x', 'y', 'z', 'bufBelow'];
    const frame = builder.build(0, 3, 1, 1, target);
    expect(frame[4]).toBe('bufBelow'); // buffer below
  });

  it('remove middleware works', () => {
    const builder = createBuilder();
    const fn = vi.fn();
    builder.use({ name: 'test', priority: 50, process: (ctx, next) => { fn(); next(); } });
    builder.remove('test');
    builder.build(0, 3, 1, 1);
    expect(fn).not.toHaveBeenCalled();
  });
});
