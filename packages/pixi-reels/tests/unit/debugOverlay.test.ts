/**
 * C3 debugOverlay - the static visual debug layers (mask / cells / buffers /
 * bounds / blocks / pins / hud). These assertions run fully headless on
 * HeadlessSymbol: the overlay never measures Text or requires a renderer.
 */
import { describe, it, expect } from 'vitest';
import { Text } from 'pixi.js';
import type { Container, Ticker } from 'pixi.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { debugOverlay } from '../../src/debug/debugOverlay.js';
import { SpinMetrics } from '../../src/debug/SpinMetrics.js';
import { DebugPlaque } from '../../src/debug/DebugPlaque.js';
import type { ReelSet } from '../../src/core/ReelSet.js';

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

const grid = (reels: number) => Array.from({ length: reels }, () => ({ visible: ['a', 'b', 'c'] }));

function panel(reelSet: ReelSet, layer: string): Container {
  const root = reelSet.children.find((c) => c.label === OVERLAY_LABEL) as Container;
  const found = root.children.find((c) => c.label === `${OVERLAY_LABEL}:${layer}`);
  if (!found) throw new Error(`no ${layer} panel`);
  return found as Container;
}

const panelTexts = (c: Container): string[] =>
  c.children.filter((t): t is Text => t instanceof Text && t.visible).map((t) => t.text);

describe('debugOverlay info panels', () => {
  it('puts metrics and timeline under the mask, side by side when it is wide', () => {
    const harness = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      debugOverlay(harness.reelSet, { layers: ['metrics', 'timeline'] });
      const vp = harness.reelSet.viewport;
      const metrics = panel(harness.reelSet, 'metrics') as DebugPlaque;
      const timeline = panel(harness.reelSet, 'timeline');
      expect(metrics.y).toBeGreaterThan(vp.y + vp.maskHeight);
      expect(timeline.y).toBe(metrics.y);
      expect(timeline.x).toBeGreaterThanOrEqual(metrics.x + metrics.plateWidth);
    } finally {
      harness.destroy();
    }
  });

  it('stacks the timeline under the metrics on a narrow set', () => {
    const harness = createTestReelSet({ reels: 2, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      debugOverlay(harness.reelSet, { layers: ['metrics', 'timeline'] });
      const metrics = panel(harness.reelSet, 'metrics') as DebugPlaque;
      const timeline = panel(harness.reelSet, 'timeline');
      expect(timeline.x).toBe(metrics.x);
      expect(timeline.y).toBeGreaterThanOrEqual(metrics.y + metrics.plateHeight);
    } finally {
      harness.destroy();
    }
  });

  it('follows the set events when not live', async () => {
    const harness = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const overlay = debugOverlay(harness.reelSet, { layers: ['metrics', 'timeline'] });
      const idle = panelTexts(panel(harness.reelSet, 'metrics'));
      expect(idle[0]).toMatch(/^ROUND - /);
      const idleHeight = (panel(harness.reelSet, 'metrics') as DebugPlaque).plateHeight;
      expect(overlay.describe().round).toBeNull();

      await harness.spinAndLand(grid(3));

      const rows = panelTexts(panel(harness.reelSet, 'metrics'));
      expect(rows[0]).toMatch(/^ROUND 1 /);
      // Same rows before and after the first spin: a host that fitted its
      // camera to the waiting plaque still has the whole panel on screen.
      expect(rows).toHaveLength(idle.length);
      expect((panel(harness.reelSet, 'metrics') as DebugPlaque).plateHeight).toBe(idleHeight);
      expect(rows.some((r) => r.startsWith('land   '))).toBe(true);
      expect(rows.some((r) => r.startsWith('skip   slam'))).toBe(true);
      // One lane label per reel on the timeline.
      const lanes = panelTexts(panel(harness.reelSet, 'timeline')).filter((t) => /^r\d$/.test(t));
      expect(lanes).toEqual(['r0', 'r1', 'r2']);
      const round = overlay.describe().round!;
      expect(round.index).toBe(1);
      expect(() => JSON.stringify(overlay.describe())).not.toThrow();
    } finally {
      harness.destroy();
    }
  });

  it('reads a recorder it was handed and leaves it running on destroy', async () => {
    const harness = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const metrics = new SpinMetrics(harness.reelSet);
    try {
      await harness.spinAndLand(grid(3));
      // Built AFTER the spin, it still shows it: the recorder saw it.
      const overlay = debugOverlay(harness.reelSet, { layers: ['metrics'], metrics });
      expect(overlay.metrics).toBe(metrics);
      expect(panelTexts(panel(harness.reelSet, 'metrics'))[0]).toMatch(/^ROUND 1 /);
      overlay.destroy();
      expect(metrics.isDestroyed).toBe(false);
    } finally {
      metrics.destroy();
      harness.destroy();
    }
  });

  it('destroys itself with the reel set, ticker callback included', () => {
    const harness = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const overlay = debugOverlay(harness.reelSet, {
      layers: 'all',
      live: true,
      ticker: harness.ticker as unknown as Ticker,
    });
    harness.reelSet.destroy();
    expect(overlay.isDestroyed).toBe(true);
    expect(overlay.metrics.isDestroyed).toBe(true);
    // A tick after the set is gone must not reach into dead reels.
    expect(() => harness.ticker.tickFor(32, 16)).not.toThrow();
    harness.ticker.destroy();
  });

  it('keeps the draw order when a layer is switched on later', () => {
    const harness = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const overlay = debugOverlay(harness.reelSet, { layers: ['hud'] });
      // `axis` is created after the hud, but must still draw under it.
      overlay.setLayers(['hud', 'axis']);
      expect(panel(harness.reelSet, 'axis').zIndex).toBeLessThan(panel(harness.reelSet, 'hud').zIndex);
    } finally {
      harness.destroy();
    }
  });

  it('hides a panel when its layer is switched off', () => {
    const harness = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const overlay = debugOverlay(harness.reelSet, { layers: 'all' });
      overlay.setLayers(['cells']);
      expect(panel(harness.reelSet, 'metrics').visible).toBe(false);
      expect(panel(harness.reelSet, 'timeline').visible).toBe(false);
      expect(panel(harness.reelSet, 'hud').visible).toBe(false);
      overlay.setLayers('all');
      expect(panel(harness.reelSet, 'timeline').visible).toBe(true);
    } finally {
      harness.destroy();
    }
  });
});
