/**
 * movePin — state + visual + event integration tests.
 *
 * GSAP drives the flight animation in real time. Tests use `duration: 1`
 * (one millisecond) so the promise resolves fast enough for vitest's
 * default timeout. State changes (pin map update, vacated cell backfill)
 * are synchronous and happen before the tween starts.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet, captureEvents } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'c', 'wild', 'filler'];

function makeHarness() {
  return createTestReelSet({
    reels: 5,
    visibleRows: 3,
    symbolIds: SYMBOLS,
  });
}

describe('movePin — state', () => {
  it('atomically moves the pin from source to destination', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild', { turns: 3 });
      expect(h.reelSet.getPin(2, 1)).toBeDefined();
      expect(h.reelSet.getPin(1, 1)).toBeUndefined();

      await h.reelSet.movePin({ col: 2, row: 1 }, { col: 1, row: 1 }, {
        duration: 1,
        backfill: 'filler',
      });

      expect(h.reelSet.getPin(2, 1)).toBeUndefined();
      const moved = h.reelSet.getPin(1, 1);
      expect(moved).toBeDefined();
      expect(moved?.symbolId).toBe('wild');
      expect(moved?.turns).toBe(3);
      expect(moved?.col).toBe(1);
      expect(moved?.row).toBe(1);
    } finally {
      h.destroy();
    }
  });

  it('preserves payload across the move', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild', {
        turns: 'permanent',
        payload: { multiplier: 3, tier: 'gold' },
      });
      await h.reelSet.movePin({ col: 2, row: 1 }, { col: 3, row: 2 }, {
        duration: 1,
        backfill: 'filler',
      });
      const pin = h.reelSet.getPin(3, 2);
      expect(pin?.payload).toEqual({ multiplier: 3, tier: 'gold' });
      expect(pin?.turns).toBe('permanent');
    } finally {
      h.destroy();
    }
  });

  it('backfills the vacated cell with the provided filler', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild');
      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('wild');

      await h.reelSet.movePin({ col: 2, row: 1 }, { col: 1, row: 1 }, {
        duration: 1,
        backfill: 'filler',
      });

      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('filler');
    } finally {
      h.destroy();
    }
  });

  it('applies the pin visually at the destination', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild');
      await h.reelSet.movePin({ col: 2, row: 1 }, { col: 1, row: 0 }, {
        duration: 1,
        backfill: 'filler',
      });
      expect(h.reelSet.reels[1].getVisibleSymbols()[0]).toBe('wild');
    } finally {
      h.destroy();
    }
  });
});

describe('movePin — errors', () => {
  it('throws when no pin exists at source', async () => {
    const h = makeHarness();
    try {
      await expect(
        h.reelSet.movePin({ col: 0, row: 0 }, { col: 1, row: 0 }, { duration: 1 }),
      ).rejects.toThrow(/no pin/);
    } finally {
      h.destroy();
    }
  });

  it('throws when destination col is out of range', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(0, 0, 'wild');
      await expect(
        h.reelSet.movePin({ col: 0, row: 0 }, { col: 5, row: 0 }, { duration: 1 }),
      ).rejects.toThrow(/out of range/);
    } finally {
      h.destroy();
    }
  });

  it('throws when destination row is out of range', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(0, 0, 'wild');
      await expect(
        h.reelSet.movePin({ col: 0, row: 0 }, { col: 0, row: 3 }, { duration: 1 }),
      ).rejects.toThrow(/out of range/);
    } finally {
      h.destroy();
    }
  });

  it('throws when destination already has a pin', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(0, 0, 'wild');
      h.reelSet.pin(1, 0, 'wild');
      await expect(
        h.reelSet.movePin({ col: 0, row: 0 }, { col: 1, row: 0 }, { duration: 1 }),
      ).rejects.toThrow(/already exists/);
    } finally {
      h.destroy();
    }
  });
});

describe('movePin — self-move', () => {
  it('is a no-op when from === to (state unchanged, event still fires)', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild', { turns: 2 });
      const events = captureEvents(h.reelSet, ['pin:moved', 'pin:expired']);

      await h.reelSet.movePin({ col: 2, row: 1 }, { col: 2, row: 1 }, { duration: 1 });

      // Pin is still there, turns unchanged
      expect(h.reelSet.getPin(2, 1)?.turns).toBe(2);
      // pin:moved fired once, pin:expired did NOT fire
      const moved = events.filter((e) => e.event === 'pin:moved');
      const expired = events.filter((e) => e.event === 'pin:expired');
      expect(moved.length).toBe(1);
      expect(expired.length).toBe(0);
    } finally {
      h.destroy();
    }
  });
});

describe('movePin — events', () => {
  it('fires pin:moved with the new pin and the old coordinates', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild', { turns: 3 });
      const events = captureEvents(h.reelSet, ['pin:moved']);

      await h.reelSet.movePin({ col: 2, row: 1 }, { col: 1, row: 1 }, {
        duration: 1,
        backfill: 'filler',
      });

      expect(events.length).toBe(1);
      const [pin, from] = events[0].args as [unknown, unknown];
      expect(pin).toMatchObject({
        col: 1,
        row: 1,
        symbolId: 'wild',
        turns: 3,
      });
      expect(from).toEqual({ col: 2, row: 1 });
    } finally {
      h.destroy();
    }
  });
});

describe('movePin — chained moves', () => {
  it('supports walking across multiple columns via repeated calls', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(4, 1, 'wild', { turns: 'permanent' });

      // Walk left
      await h.reelSet.movePin({ col: 4, row: 1 }, { col: 3, row: 1 }, {
        duration: 1,
        backfill: 'filler',
      });
      await h.reelSet.movePin({ col: 3, row: 1 }, { col: 2, row: 1 }, {
        duration: 1,
        backfill: 'filler',
      });
      await h.reelSet.movePin({ col: 2, row: 1 }, { col: 1, row: 1 }, {
        duration: 1,
        backfill: 'filler',
      });

      expect(h.reelSet.pins.size).toBe(1);
      expect(h.reelSet.getPin(1, 1)).toBeDefined();
      expect(h.reelSet.reels[1].getVisibleSymbols()[1]).toBe('wild');
      expect(h.reelSet.reels[4].getVisibleSymbols()[1]).toBe('filler');
    } finally {
      h.destroy();
    }
  });
});
