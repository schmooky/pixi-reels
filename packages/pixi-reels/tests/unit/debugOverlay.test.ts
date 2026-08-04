/**
 * C3 debugOverlay - the static visual debug layers (mask / cells / buffers /
 * bounds / blocks / pins / hud). These assertions run fully headless on
 * HeadlessSymbol: the overlay never measures Text or requires a renderer.
 */
import { describe, it, expect } from 'vitest';
import type { Ticker } from 'pixi.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { debugOverlay } from '../../src/debug/debugOverlay.js';

const OVERLAY_LABEL = 'pixi-reels:debugOverlay';

describe('debugOverlay', () => {
  it('adds a child container to the reel set and removes it on destroy', () => {
    const harness = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const { reelSet } = harness;
    try {
      const before = reelSet.children.length;

      const overlay = debugOverlay(reelSet, { layers: ['cells', 'bounds'] });

      // One new child, the overlay root, sitting above the viewport.
      expect(reelSet.children.length).toBe(before + 1);
      expect(reelSet.children.some((c) => c.label === OVERLAY_LABEL)).toBe(true);
      expect(overlay.isDestroyed).toBe(false);

      overlay.destroy();

      expect(overlay.isDestroyed).toBe(true);
      expect(reelSet.children.length).toBe(before);
      expect(reelSet.children.some((c) => c.label === OVERLAY_LABEL)).toBe(false);
    } finally {
      harness.destroy();
    }
  });

  it('redraws through the ticker when live, and stops after destroy', () => {
    const harness = createTestReelSet({ reels: 4, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const { reelSet, ticker } = harness;
    try {
      const overlay = debugOverlay(reelSet, {
        layers: ['bounds', 'pins', 'hud'],
        live: true,
        ticker: ticker as unknown as Ticker,
      });

      // A live tick redraws without throwing (bounds via getBounds, hud text).
      expect(() => harness.advance(16)).not.toThrow();

      // Switching layers is safe and keeps a single overlay child.
      overlay.setLayers(['mask', 'cells']);
      expect(reelSet.children.filter((c) => c.label === OVERLAY_LABEL).length).toBe(1);

      overlay.destroy();

      // Post-destroy ticks are no-ops (the TickerRef removed the callback).
      expect(() => harness.advance(16)).not.toThrow();
      expect(overlay.isDestroyed).toBe(true);
    } finally {
      harness.destroy();
    }
  });

  it('is idempotent on double destroy', () => {
    const harness = createTestReelSet({ reels: 2, visibleCells: 2, symbolIds: ['a', 'b'] });
    try {
      const overlay = debugOverlay(harness.reelSet, { layers: 'all' });
      overlay.destroy();
      expect(() => overlay.destroy()).not.toThrow();
      expect(overlay.isDestroyed).toBe(true);
    } finally {
      harness.destroy();
    }
  });
});
