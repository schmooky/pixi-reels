/**
 * H6 - driveGsapWithTicker() encapsulates the "pin GSAP to the Pixi ticker"
 * incantation so animations don't freeze in hidden tabs / iframes, and cleanly
 * restores GSAP's own ticker on dispose.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { driveGsapWithTicker } from '../../src/utils/gsapTicker.js';
import { DEFAULT_GSAP } from '../../src/utils/gsap.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

describe('driveGsapWithTicker', () => {
  const realGsap = DEFAULT_GSAP;

  it('moves GSAP onto the supplied ticker and restores it on dispose', () => {
    const updateRoot = vi.fn();
    const tickerAdd = vi.fn();
    const tickerRemove = vi.fn();
    const mockGsap = { updateRoot, ticker: { add: tickerAdd, remove: tickerRemove } };

    const ticker = new FakeTicker();
    // v2 takes the instance explicitly. gsap is per reel set now, so this
    // function cannot look up "the engine's" one.
    const dispose = driveGsapWithTicker(
      ticker as unknown as Parameters<typeof driveGsapWithTicker>[0],
      mockGsap as unknown as typeof realGsap,
    );

    // GSAP's own rAF driver detached; a driver attached to our ticker.
    expect(tickerRemove).toHaveBeenCalledWith(updateRoot);
    expect(ticker.listenerCount).toBe(1);

    // Ticking drives GSAP from the ticker clock (ms -> s).
    ticker.tick(16);
    expect(updateRoot).toHaveBeenCalledWith(ticker.lastTime / 1000);

    // Dispose detaches our driver and restores GSAP's own ticker.
    dispose();
    expect(ticker.listenerCount).toBe(0);
    expect(tickerAdd).toHaveBeenCalledWith(updateRoot);

    // Idempotent.
    expect(() => dispose()).not.toThrow();
  });
});
