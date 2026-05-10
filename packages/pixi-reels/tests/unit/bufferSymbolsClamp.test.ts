/**
 * Unit tests for `ReelSetBuilder.bufferSymbols(count)` clamp behaviour.
 *
 * Contract: passing `0`, a negative number, `NaN`, or `Infinity` is
 * clamped to the minimum of 1 (the motion layer needs at least one
 * buffer row above and below the visible window for wrap detection).
 * The builder warns once per process via `console.warn` and does not
 * throw, so existing user code that accidentally passed `0` keeps
 * running rather than crashing at build time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ReelSetBuilder.bufferSymbols clamp', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Re-import so the module-level `_bufferWarnedThisProcess` flag is
    // freshly false for each test. Vitest module-cache reset via vi.resetModules.
    vi.resetModules();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('accepts a positive integer unchanged', async () => {
    const { ReelSetBuilder } = await import('../../src/core/ReelSetBuilder.js');
    const b = new ReelSetBuilder();
    b.bufferSymbols(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((b as any)._bufferSymbols).toBe(3);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('clamps 0 to 1 and warns once', async () => {
    const { ReelSetBuilder } = await import('../../src/core/ReelSetBuilder.js');
    const b = new ReelSetBuilder();
    b.bufferSymbols(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((b as any)._bufferSymbols).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/clamping to 1/);
  });

  it('clamps a negative count to 1', async () => {
    const { ReelSetBuilder } = await import('../../src/core/ReelSetBuilder.js');
    const b = new ReelSetBuilder();
    b.bufferSymbols(-2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((b as any)._bufferSymbols).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('clamps NaN to 1', async () => {
    const { ReelSetBuilder } = await import('../../src/core/ReelSetBuilder.js');
    const b = new ReelSetBuilder();
    b.bufferSymbols(Number.NaN);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((b as any)._bufferSymbols).toBe(1);
  });

  it('warns only once per process across multiple builders', async () => {
    const { ReelSetBuilder } = await import('../../src/core/ReelSetBuilder.js');
    new ReelSetBuilder().bufferSymbols(0);
    new ReelSetBuilder().bufferSymbols(0);
    new ReelSetBuilder().bufferSymbols(-1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the builder for chaining', async () => {
    const { ReelSetBuilder } = await import('../../src/core/ReelSetBuilder.js');
    const b = new ReelSetBuilder();
    expect(b.bufferSymbols(0)).toBe(b);
    expect(b.bufferSymbols(2)).toBe(b);
  });
});
