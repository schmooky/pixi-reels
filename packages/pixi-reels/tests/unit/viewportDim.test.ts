/**
 * M7 — the single dim overlay is shared by the spotlight and cascade
 * destroySymbols({ dim }). Reference-counting keeps it up until the last
 * consumer releases it, so an overlapping pair can't hide it out from under
 * the other (flicker / lost dim in cascade+win sequences).
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

describe('ReelViewport dim ref-counting', () => {
  it('keeps the dim up until the last overlapping consumer releases it', () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const vp = h.reelSet.viewport;
      expect(vp.dimOverlay.visible).toBe(false);

      vp.showDim(0.5); // consumer A (e.g. spotlight)
      vp.showDim(0.35); // consumer B (e.g. cascade destroy) overlaps
      expect(vp.dimOverlay.visible).toBe(true);

      vp.hideDim(); // A finishes; B still active
      expect(vp.dimOverlay.visible).toBe(true);

      vp.hideDim(); // B finishes; now hidden
      expect(vp.dimOverlay.visible).toBe(false);
    } finally {
      h.destroy();
    }
  });

  it('floors the count at zero on an unbalanced hideDim', () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const vp = h.reelSet.viewport;
      vp.hideDim(); // stray hide — must not push the count negative
      vp.showDim(0.5);
      expect(vp.dimOverlay.visible).toBe(true);
      vp.hideDim();
      expect(vp.dimOverlay.visible).toBe(false);
    } finally {
      h.destroy();
    }
  });
});
