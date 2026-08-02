/**
 * Low finding - enableDebug() attached a single window.__PIXI_REELS_DEBUG, so
 * multiple reel sets clobbered each other. It now also registers each instance
 * under a per-instance key.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { enableDebug, debugSnapshot } from '../../src/debug/debug.js';

describe('enableDebug per-instance registry', () => {
  const g = globalThis as unknown as { window?: Record<string, unknown> };
  const hadWindow = 'window' in g;

  afterEach(() => {
    if (!hadWindow) delete g.window;
  });

  it('keeps multiple reel sets reachable instead of clobbering', () => {
    g.window = g.window ?? {};
    const a = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const b = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      enableDebug(a.reelSet, 'a');
      enableDebug(b.reelSet, 'b');

      const win = g.window as Record<string, any>;
      expect(win.__PIXI_REELS_DEBUG_INSTANCES.a.reelSet).toBe(a.reelSet);
      expect(win.__PIXI_REELS_DEBUG_INSTANCES.b.reelSet).toBe(b.reelSet);
      // Bare global points at the most recently enabled instance (back-compat).
      expect(win.__PIXI_REELS_DEBUG.reelSet).toBe(b.reelSet);
    } finally {
      a.destroy();
      b.destroy();
    }
  });
});

describe('debugSnapshot reports the travel axis', () => {
  // `allSymbols[].y` was hard-coded, so on a horizontal set - the one
  // orientation v2 exists to add - every symbol reported a constant 0 and the
  // snapshot carried no positional information at all.
  it('varies `main` along the strip in both orientations', () => {
    for (const orientation of ['vertical', 'horizontal'] as const) {
      const h = createTestReelSet({ orientation, reels: 2, visibleCells: 3 });
      try {
        const snap = debugSnapshot(h.reelSet);
        const mains = snap.reels[0].allSymbols.map((s) => s.main);
        expect(new Set(mains).size, `${orientation} main varies`).toBe(mains.length);
        expect(snap.reels[0].orientation).toBe(orientation);
        expect(snap.reels[0].direction).toBe('forward');
      } finally {
        h.destroy();
      }
    }
  });
});
