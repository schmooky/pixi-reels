/**
 * M6 — StopPhase.onSkip() must place the FULL target frame (buffers included),
 * not just the visible window. Slicing to the visible rows dropped
 * buffer-above/below targets (e.g. a big symbol's tail parked above), so a
 * direct skip() landed the wrong frame. The buffer symbols here have weight 0,
 * so they are never random-filled — before the fix they'd be replaced by random
 * symbols, after the fix they survive.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { StopPhase } from '../../src/spin/phases/StopPhase.js';
import { SpeedPresets } from '../../src/config/SpeedPresets.js';

describe('StopPhase.onSkip', () => {
  it('places buffer-above and buffer-below targets on a direct skip', async () => {
    const h = createTestReelSet({
      reels: 3,
      visibleRows: 3,
      symbolIds: ['V0', 'V1', 'V2', 'ABV', 'BLW'],
      weights: { V0: 10, V1: 10, V2: 10, ABV: 0, BLW: 0 },
      bufferSymbols: 1,
    });
    try {
      const reel = h.reelSet.reels[0];
      // Flat top-to-bottom strip: [bufferAbove, v0, v1, v2, bufferBelow].
      const targetFrame = ['ABV', 'V0', 'V1', 'V2', 'BLW'];

      const phase = new StopPhase(reel, SpeedPresets.NORMAL);
      const done = phase.run({ targetFrame, delay: 0 });
      phase.skip();
      await done;

      // Visible window lands correctly...
      expect(reel.symbols.slice(1, 4).map((s) => s.symbolId)).toEqual(['V0', 'V1', 'V2']);
      // ...and so do the buffers (dropped → random-filled before the fix).
      expect(reel.symbols[0].symbolId).toBe('ABV');
      expect(reel.symbols[4].symbolId).toBe('BLW');
    } finally {
      h.destroy();
    }
  });
});
