import { describe, it, expect, vi } from 'vitest';
import { FrameBuilder, type FrameMiddleware } from '../../src/frame/FrameBuilder.js';
import { RandomSymbolProvider } from '../../src/frame/RandomSymbolProvider.js';

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

  it('remove middleware works', () => {
    const builder = createBuilder();
    const fn = vi.fn();
    builder.use({ name: 'test', priority: 50, process: (ctx, next) => { fn(); next(); } });
    builder.remove('test');
    builder.build(0, 3, 1, 1);
    expect(fn).not.toHaveBeenCalled();
  });
});
