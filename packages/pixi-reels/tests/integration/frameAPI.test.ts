/**
 * reelSet.frame — runtime middleware exposure tests.
 *
 * The internal machinery (FrameBuilder.use/remove) has always existed;
 * these tests verify the ReelSet-level API correctly delegates and that
 * middleware added at runtime takes effect on the very next spin.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import type { FrameMiddleware } from '../../src/frame/FrameBuilder.js';

const SYMBOLS = ['a', 'b', 'c', 'wild'];

function makeHarness() {
  return createTestReelSet({
    reels: 3,
    visibleRows: 3,
    symbolIds: SYMBOLS,
  });
}

/** A middleware that forces the middle row to be `forcedId` on every reel. */
function forceMiddleRowMiddleware(forcedId: string): FrameMiddleware {
  return {
    name: 'force-middle-row',
    priority: 20, // after target-placement (10) so it wins
    process(ctx, next) {
      const middleIdx = ctx.bufferAbove + Math.floor(ctx.visibleRows / 2);
      if (middleIdx < ctx.symbols.length) {
        ctx.symbols[middleIdx] = forcedId;
      }
      next();
    },
  };
}

describe('reelSet.frame — exposure', () => {
  it('starts with the two built-in middleware (random-fill, target-placement)', () => {
    const h = makeHarness();
    try {
      const names = h.reelSet.frame.middleware.map((m) => m.name);
      expect(names).toContain('random-fill');
      expect(names).toContain('target-placement');
    } finally {
      h.destroy();
    }
  });

  it('use() adds middleware; remove() drops it', () => {
    const h = makeHarness();
    try {
      const mw = forceMiddleRowMiddleware('wild');
      const before = h.reelSet.frame.middleware.length;
      h.reelSet.frame.use(mw);
      expect(h.reelSet.frame.middleware.length).toBe(before + 1);
      h.reelSet.frame.remove('force-middle-row');
      expect(h.reelSet.frame.middleware.length).toBe(before);
    } finally {
      h.destroy();
    }
  });
});

// Helper: reach the internal FrameBuilder to exercise the middleware chain.
// `reelSet.frame` delegates to it — if our delegation is correct, middleware
// added via the facade should show up here.
function frameBuilderOf(reelSet: unknown): {
  build(
    reelIndex: number,
    visibleRows: number,
    bufferAbove: number,
    bufferBelow: number,
    targetSymbols?: string[],
  ): string[];
} {
  return (reelSet as { _frameBuilder: {
    build: (
      r: number,
      v: number,
      ba: number,
      bb: number,
      t?: string[],
    ) => string[];
  } })._frameBuilder;
}

describe('reelSet.frame — middleware takes effect on frame build', () => {
  it('added middleware is included in the next build() call', () => {
    const h = makeHarness();
    try {
      const fb = frameBuilderOf(h.reelSet);
      const targets = ['a', 'b', 'c'];

      // Baseline — middleware NOT added; middle row is 'b' (from targets)
      const baseline = fb.build(0, 3, 1, 1, targets);
      expect(baseline[1 + 1]).toBe('b'); // bufferAbove(1) + row(1) = index 2

      // Add middleware, rebuild — middle row becomes 'wild'
      h.reelSet.frame.use(forceMiddleRowMiddleware('wild'));
      const withMiddleware = fb.build(0, 3, 1, 1, targets);
      expect(withMiddleware[1 + 1]).toBe('wild');
    } finally {
      h.destroy();
    }
  });

  it('removed middleware stops being applied to subsequent builds', () => {
    const h = makeHarness();
    try {
      const fb = frameBuilderOf(h.reelSet);
      const targets = ['a', 'b', 'c'];

      h.reelSet.frame.use(forceMiddleRowMiddleware('wild'));
      expect(fb.build(0, 3, 1, 1, targets)[2]).toBe('wild');

      h.reelSet.frame.remove('force-middle-row');
      expect(fb.build(0, 3, 1, 1, targets)[2]).toBe('b');
    } finally {
      h.destroy();
    }
  });
});

describe('reelSet.frame — no regression when unused', () => {
  it('reads of .middleware do not mutate state', () => {
    const h = makeHarness();
    try {
      const before = [...h.reelSet.frame.middleware];
      void h.reelSet.frame.middleware;
      void h.reelSet.frame.middleware;
      const after = [...h.reelSet.frame.middleware];
      expect(after).toEqual(before);
    } finally {
      h.destroy();
    }
  });
});
