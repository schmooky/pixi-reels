/**
 * While `nudge()` is in flight, the other public verbs that touch reel
 * state must refuse rather than race the in-flight tween. This file
 * exercises the guard one method at a time.
 */
import { describe, expect, it } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

function buildHarness() {
  return createTestReelSet({
    reels: 3,
    visibleRows: 3,
    symbolIds: ['a', 'b', 'c', 'wild'],
  });
}

function buildMultiwaysHarness() {
  return createTestReelSet({
    reels: 3,
    multiways: { minRows: 2, maxRows: 5, reelPixelHeight: 500 },
    symbolIds: ['a', 'b', 'wild'],
  });
}

describe('nudge reentrancy guards', () => {
  it('spin() rejects while nudge() is in flight', async () => {
    const h = buildHarness();
    try {
      const nudging = h.reelSet.nudge(0, {
        distance: 1,
        direction: 'down',
        incoming: ['wild'],
      });
      await expect(h.reelSet.spin()).rejects.toThrow(
        /cannot be called while nudge\(\) is in flight/,
      );
      h.reelSet.skipNudge(0);
      await nudging;
    } finally {
      h.destroy();
    }
  });

  it('setResult() throws while nudge() is in flight', async () => {
    const h = buildHarness();
    try {
      const nudging = h.reelSet.nudge(0, {
        distance: 1,
        direction: 'down',
        incoming: ['wild'],
      });
      expect(() =>
        h.reelSet.setResult([
          { visible: ['a', 'b', 'c'] },
          { visible: ['a', 'b', 'c'] },
          { visible: ['a', 'b', 'c'] },
        ]),
      ).toThrow(/cannot be called while nudge\(\) is in flight/);
      h.reelSet.skipNudge(0);
      await nudging;
    } finally {
      h.destroy();
    }
  });

  it('pin() throws while nudge() is in flight', async () => {
    const h = buildHarness();
    try {
      const nudging = h.reelSet.nudge(0, {
        distance: 1,
        direction: 'down',
        incoming: ['wild'],
      });
      expect(() => h.reelSet.pin(1, 1, 'wild', { turns: 'permanent' })).toThrow(
        /cannot be called while nudge\(\) is in flight/,
      );
      h.reelSet.skipNudge(0);
      await nudging;
    } finally {
      h.destroy();
    }
  });

  it('setShape() throws while nudge() is in flight', async () => {
    const h = buildMultiwaysHarness();
    try {
      const nudging = h.reelSet.nudge(0, {
        distance: 1,
        direction: 'down',
        incoming: ['wild'],
      });
      expect(() => h.reelSet.setShape([3, 3, 3])).toThrow(
        /cannot be called while nudge\(\) is in flight/,
      );
      h.reelSet.skipNudge(0);
      await nudging;
    } finally {
      h.destroy();
    }
  });
});
