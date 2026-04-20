import { describe, it, expect, vi } from 'vitest';
import { FakeTicker } from '../../../src/testing/FakeTicker.js';

describe('FakeTicker', () => {
  it('fires callbacks when tick() is called', () => {
    const ticker = new FakeTicker();
    const fn = vi.fn();
    ticker.add(fn);
    ticker.tick(16);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exposes deltaMS to callbacks', () => {
    const ticker = new FakeTicker();
    let observed = -1;
    ticker.add((t) => { observed = t.deltaMS; });
    ticker.tick(33);
    expect(observed).toBe(33);
  });

  it('remove() stops callbacks from firing', () => {
    const ticker = new FakeTicker();
    const fn = vi.fn();
    ticker.add(fn);
    ticker.remove(fn);
    ticker.tick(16);
    expect(fn).not.toHaveBeenCalled();
  });

  it('addOnce() fires only once', () => {
    const ticker = new FakeTicker();
    const fn = vi.fn();
    ticker.addOnce(fn);
    ticker.tick(16);
    ticker.tick(16);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('tickFor() advances time in step-sized increments', () => {
    const ticker = new FakeTicker();
    const fn = vi.fn();
    ticker.add(fn);
    ticker.tickFor(100, 16);
    // 100 / 16 = 6.25 → 7 calls (6 * 16 + 1 * 4)
    expect(fn).toHaveBeenCalledTimes(7);
  });

  it('accumulates elapsedMS across ticks', () => {
    const ticker = new FakeTicker();
    ticker.tick(16);
    ticker.tick(16);
    ticker.tick(16);
    expect(ticker.elapsedMS).toBe(48);
  });

  it('destroy() clears all callbacks', () => {
    const ticker = new FakeTicker();
    ticker.add(vi.fn());
    ticker.add(vi.fn());
    expect(ticker.listenerCount).toBe(2);
    ticker.destroy();
    expect(ticker.listenerCount).toBe(0);
  });

  it('is safe against listeners that remove themselves mid-tick', () => {
    const ticker = new FakeTicker();
    const fn1 = vi.fn(() => ticker.remove(fn2));
    const fn2 = vi.fn();
    ticker.add(fn1);
    ticker.add(fn2);
    ticker.tick(16);
    expect(fn1).toHaveBeenCalledTimes(1);
    // snapshot semantics: fn2 still fires this tick
    expect(fn2).toHaveBeenCalledTimes(1);
    ticker.tick(16);
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});
