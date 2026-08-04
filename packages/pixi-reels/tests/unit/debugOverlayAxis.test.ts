/**
 * A11b: the axis / feed / thresholds layers, and the axis-aware hud.
 *
 * These exist because the subject of the whole v2 refactor -- which way a
 * strip travels -- is invisible in a canvas, and CLAUDE.md says the reviewers
 * include agents that cannot see one. So the overlay has to be assertable
 * from a test, not just look right: each layer's Graphics is labelled, and
 * these tests read the drawn geometry's bounds back.
 */
import { describe, it, expect } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { debugOverlay, OVERLAY_LABEL } from '../../src/debug/debugOverlay.js';
import type { DebugOverlayLayer } from '../../src/debug/debugOverlay.js';
import type { ReelSet } from '../../src/core/ReelSet.js';

const W = 120;
const H = 80;

function overlayRoot(reelSet: ReelSet): Container {
  const root = reelSet.children.find((c) => c.label === OVERLAY_LABEL);
  if (!root) throw new Error('overlay root not found');
  return root as Container;
}

function layerGraphics(reelSet: ReelSet, layer: DebugOverlayLayer): Graphics {
  const g = overlayRoot(reelSet).children.find(
    (c) => c.label === `${OVERLAY_LABEL}:${layer}`,
  );
  if (!g) throw new Error(`layer '${layer}' drew nothing`);
  return g as Graphics;
}

function hudLines(reelSet: ReelSet): string[] {
  return overlayRoot(reelSet)
    .children.filter((c): c is Text => c instanceof Text && c.visible)
    .map((t) => t.text)
    .filter((t) => t.startsWith('r'));
}

const build = (orientation: 'vertical' | 'horizontal', direction: 'forward' | 'reverse') =>
  createTestReelSet({
    reels: 3,
    visibleCells: 4,
    symbolIds: ['a', 'b'],
    orientation,
    direction,
    symbolSize: orientation === 'vertical' ? { width: W, height: H } : { width: H, height: W },
  });

describe('axis layer', () => {
  it('draws along Y on a vertical set and along X on a horizontal one', () => {
    const v = build('vertical', 'forward');
    const h = build('horizontal', 'forward');
    try {
      debugOverlay(v.reelSet, { layers: ['axis'] });
      debugOverlay(h.reelSet, { layers: ['axis'] });

      // A single reel's arrow runs the length of its strip. Across the whole
      // set the layer's bounding box is therefore long on the MAIN axis and
      // only as wide as the reel marching on the cross axis... but with 3
      // reels the cross span can rival the main span, so compare each set
      // against the other rather than against itself.
      const vb = layerGraphics(v.reelSet, 'axis').getBounds();
      const hb = layerGraphics(h.reelSet, 'axis').getBounds();
      expect(vb.height).toBeGreaterThan(vb.width / 2);
      expect(hb.width).toBeGreaterThan(hb.height / 2);
      // The transposition is exact: the two boxes swap dimensions.
      expect(hb.width).toBeCloseTo(vb.height, 3);
      expect(hb.height).toBeCloseTo(vb.width, 3);
    } finally {
      v.destroy();
      h.destroy();
    }
  });

  it('points the opposite way on a reverse reel', () => {
    const f = build('vertical', 'forward');
    const r = build('vertical', 'reverse');
    try {
      const fo = debugOverlay(f.reelSet, { layers: ['axis'] });
      const ro = debugOverlay(r.reelSet, { layers: ['axis'] });
      // A mirrored arrow has IDENTICAL bounds, so the bounding box cannot
      // see direction at all -- which is exactly why describe() exists. The
      // signed span is the assertion that matters.
      const fb = layerGraphics(f.reelSet, 'axis').getBounds();
      const rb = layerGraphics(r.reelSet, 'axis').getBounds();
      expect(rb.width).toBeCloseTo(fb.width, 3);
      expect(rb.height).toBeCloseTo(fb.height, 3);

      const span = (o: ReturnType<typeof debugOverlay>) => {
        const a = o.describe().reels[0].axisArrow;
        return a.toMain - a.fromMain;
      };
      expect(span(fo)).toBeGreaterThan(0);
      expect(span(ro)).toBeLessThan(0);
      expect(span(ro)).toBeCloseTo(-span(fo), 6);
    } finally {
      f.destroy();
      r.destroy();
    }
  });
});

describe('describe() - the text half', () => {
  it('is plain JSON, one entry per reel', () => {
    const h = build('horizontal', 'reverse');
    try {
      const o = debugOverlay(h.reelSet, { layers: 'all' });
      const snap = o.describe();
      expect(() => JSON.stringify(snap)).not.toThrow();
      expect(snap.reels).toHaveLength(3);
      expect(snap.layers).toContain('axis');
      expect(snap.reels[0]).toMatchObject({
        reel: 0,
        orientation: 'horizontal',
        direction: 'reverse',
        feedEdge: 'end',
        visibleCells: 4,
        phase: 'idle',
      });
    } finally {
      h.destroy();
    }
  });

  it('brackets the strip: thresholds sit outside the arrow and the feed marker', () => {
    const v = build('vertical', 'forward');
    try {
      const info = debugOverlay(v.reelSet, { layers: 'all' }).describe().reels[0];
      expect(info.thresholds.start).toBeLessThan(info.feedMain);
      expect(info.thresholds.start).toBeLessThan(info.axisArrow.fromMain);
      expect(info.thresholds.end).toBeGreaterThan(info.axisArrow.toMain);
    } finally {
      v.destroy();
    }
  });

  it('feeds the opposite edge under reverse travel', () => {
    const f = build('vertical', 'forward');
    const r = build('vertical', 'reverse');
    try {
      const fi = debugOverlay(f.reelSet, { layers: 'all' }).describe().reels[0];
      const ri = debugOverlay(r.reelSet, { layers: 'all' }).describe().reels[0];
      expect(fi.feedEdge).toBe('start');
      expect(ri.feedEdge).toBe('end');
      expect(fi.feedMain).toBeLessThan(0);
      expect(ri.feedMain).toBeGreaterThan(0);
    } finally {
      f.destroy();
      r.destroy();
    }
  });
});

describe('feed layer', () => {
  it('marks the start edge on a forward reel and the end edge on a reverse one', () => {
    const f = build('vertical', 'forward');
    const r = build('vertical', 'reverse');
    try {
      debugOverlay(f.reelSet, { layers: ['feed'] });
      debugOverlay(r.reelSet, { layers: ['feed'] });
      const fb = layerGraphics(f.reelSet, 'feed').getBounds();
      const rb = layerGraphics(r.reelSet, 'feed').getBounds();
      // Forward feeds before cell 0 (negative main); reverse feeds past the
      // last visible cell. So the reverse marker sits strictly further down.
      expect(fb.y).toBeLessThan(0);
      expect(rb.y).toBeGreaterThan(fb.y);
    } finally {
      f.destroy();
      r.destroy();
    }
  });

  it('marks a horizontal reel on X, not Y', () => {
    const h = build('horizontal', 'forward');
    try {
      debugOverlay(h.reelSet, { layers: ['feed'] });
      const b = layerGraphics(h.reelSet, 'feed').getBounds();
      // The feed bar spans the reel's cross extent and is thin on main, so
      // on a horizontal set it is TALL and narrow.
      expect(b.height).toBeGreaterThan(b.width);
      expect(b.x).toBeLessThan(0);
    } finally {
      h.destroy();
    }
  });
});

describe('thresholds layer', () => {
  it('brackets the strip beyond every buffer cell', () => {
    const v = build('vertical', 'forward');
    try {
      debugOverlay(v.reelSet, { layers: ['thresholds', 'buffers'] });
      const t = layerGraphics(v.reelSet, 'thresholds').getBounds();
      const buf = layerGraphics(v.reelSet, 'buffers').getBounds();
      // A wrap fires one slot past the outermost buffer cell, so the
      // threshold lines must sit strictly outside the buffer rects.
      expect(t.y).toBeLessThan(buf.y);
      expect(t.y + t.height).toBeGreaterThan(buf.y + buf.height);
    } finally {
      v.destroy();
    }
  });

  it('runs on the other axis for a horizontal set', () => {
    const v = build('vertical', 'forward');
    const h = build('horizontal', 'forward');
    try {
      debugOverlay(v.reelSet, { layers: ['thresholds'] });
      debugOverlay(h.reelSet, { layers: ['thresholds'] });
      const vb = layerGraphics(v.reelSet, 'thresholds').getBounds();
      const hb = layerGraphics(h.reelSet, 'thresholds').getBounds();
      expect(hb.width).toBeCloseTo(vb.height, 3);
      expect(hb.height).toBeCloseTo(vb.width, 3);
    } finally {
      v.destroy();
      h.destroy();
    }
  });
});

describe('hud layer', () => {
  it('reports orientation, direction and feed edge per reel', () => {
    const h = build('horizontal', 'reverse');
    try {
      debugOverlay(h.reelSet, { layers: ['hud'] });
      const lines = hudLines(h.reelSet);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^r0 HR feed=end /);
      expect(lines[0]).toMatch(/cells=4$/);
    } finally {
      h.destroy();
    }
  });

  it('distinguishes all four travel combinations', () => {
    const seen = new Set<string>();
    for (const orientation of ['vertical', 'horizontal'] as const) {
      for (const direction of ['forward', 'reverse'] as const) {
        const harness = build(orientation, direction);
        try {
          debugOverlay(harness.reelSet, { layers: ['hud'] });
          seen.add(hudLines(harness.reelSet)[0].split(' ')[1]);
        } finally {
          harness.destroy();
        }
      }
    }
    expect([...seen].sort()).toEqual(['HF', 'HR', 'VF', 'VR']);
  });

  it('stacks its lines in one column instead of one per reel corner', () => {
    // The lines were anchored at each reel's own top-left, so they shared a y
    // and marched along x -- and since a line is ~230px against a ~100px cell,
    // every one overprinted its neighbours. Six reels is where it was worst.
    const harness = createTestReelSet({
      reels: 6,
      visibleCells: 3,
      symbolIds: ['a'],
      symbolSize: { width: W, height: H },
    });
    try {
      debugOverlay(harness.reelSet, { layers: ['hud'] });
      const texts = overlayRoot(harness.reelSet)
        .children.filter((c): c is Text => c instanceof Text && c.visible)
        .filter((t) => t.text.startsWith('r'));
      expect(texts).toHaveLength(6);

      // One column: every line shares an x, and y strictly increases.
      const xs = new Set(texts.map((t) => t.x));
      expect(xs.size).toBe(1);
      for (let i = 1; i < texts.length; i++) {
        expect(texts[i].y).toBeGreaterThan(texts[i - 1].y);
      }

      // Inside the mask box, so a host that framed its camera on the reel set
      // still has the whole column on screen. Off-camera is worse than busy.
      const vp = harness.reelSet.viewport;
      expect(texts[0].x).toBeGreaterThanOrEqual(vp.x);
      expect(texts[0].y).toBeGreaterThanOrEqual(vp.y);
      // Line height read off the lines themselves rather than imported: the
      // metric is internal, and the property under test is the layout.
      const lineHeight = texts[1].y - texts[0].y;
      const lastBottom = texts[texts.length - 1].y + lineHeight;
      expect(lastBottom).toBeLessThanOrEqual(vp.y + vp.maskHeight);
    } finally {
      harness.destroy();
    }
  });

  it('reports mixed per-reel directions independently', () => {
    const harness = createTestReelSet({
      reels: 3,
      visibleCells: 3,
      symbolIds: ['a'],
      directionPerReel: ['forward', 'reverse', 'forward'],
      symbolSize: { width: W, height: H },
    });
    try {
      debugOverlay(harness.reelSet, { layers: ['hud'] });
      const lines = hudLines(harness.reelSet);
      expect(lines[0]).toMatch(/^r0 VF feed=start/);
      expect(lines[1]).toMatch(/^r1 VR feed=end/);
      expect(lines[2]).toMatch(/^r2 VF feed=start/);
    } finally {
      harness.destroy();
    }
  });
});

describe("layers: 'all'", () => {
  it.each([
    ['vertical', 'forward'],
    ['vertical', 'reverse'],
    ['horizontal', 'forward'],
    ['horizontal', 'reverse'],
  ] as const)('draws every layer on %s / %s without throwing', (orientation, direction) => {
    const harness = build(orientation, direction);
    try {
      const overlay = debugOverlay(harness.reelSet, { layers: 'all' });
      expect(() => overlay.redraw()).not.toThrow();
      for (const layer of ['axis', 'feed', 'thresholds'] as const) {
        expect(() => layerGraphics(harness.reelSet, layer)).not.toThrow();
      }
      overlay.destroy();
    } finally {
      harness.destroy();
    }
  });
});
