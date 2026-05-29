/**
 * C2 — spin() must never hang forever. An AbortSignal or a timeout watchdog
 * settles (rejects) the spin promise and force-stops the reels when the server
 * result never arrives, so a failed/cancelled fetch can't wedge the client.
 */
import { describe, it, expect, vi } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'c'];
const GRID = [
  ['a', 'b', 'c'],
  ['b', 'c', 'a'],
  ['c', 'a', 'b'],
];

describe('spin() watchdog / AbortSignal (C2)', () => {
  it('rejects with the caller error when the signal aborts before setResult', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS });
    try {
      const controller = new AbortController();
      const p = h.reelSet.spin({ signal: controller.signal });
      // Simulate a failed server request: abort instead of calling setResult().
      controller.abort(new Error('fetch failed'));
      await expect(p).rejects.toThrow('fetch failed');

      // The engine recovered to a coherent idle state — a fresh spin works.
      const result = await h.spinAndLand(GRID);
      expect(result.symbols).toHaveLength(3);
    } finally {
      h.destroy();
    }
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS });
    try {
      const controller = new AbortController();
      controller.abort();
      await expect(h.reelSet.spin({ signal: controller.signal })).rejects.toThrow(/abort/i);
      // Never started spinning, so a normal spin still works.
      const result = await h.spinAndLand(GRID);
      expect(result.symbols).toHaveLength(3);
    } finally {
      h.destroy();
    }
  });

  it('rejects when the timeout watchdog fires without a result', async () => {
    vi.useFakeTimers();
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS });
    try {
      const p = h.reelSet.spin({ timeoutMs: 5000 });
      const settled = expect(p).rejects.toThrow(/watchdog/);
      await vi.advanceTimersByTimeAsync(6000);
      await settled;
    } finally {
      vi.useRealTimers();
      h.destroy();
    }
  });

  it('clears the watchdog when the spin lands before the timeout', async () => {
    vi.useFakeTimers();
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: SYMBOLS });
    try {
      const p = h.reelSet.spin({ timeoutMs: 5000 });
      h.reelSet.setResult(GRID.map((visible) => ({ visible })));
      h.reelSet.slamStop();
      const result = await p;
      expect(result.symbols).toHaveLength(3);
      // Watchdog was cleared on landing — advancing past it must be harmless.
      await vi.advanceTimersByTimeAsync(10000);
    } finally {
      vi.useRealTimers();
      h.destroy();
    }
  });
});
