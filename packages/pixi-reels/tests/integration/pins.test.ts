/**
 * CellPin primitive integration tests.
 *
 * Covers the full lifecycle through a real ReelSet + SpinController pipeline.
 * Each test exercises one aspect of pin behaviour: overlay, countdown, eval
 * lifetime, permanence, events, and coexistence with a clean (no-pin) path.
 */
import { describe, it, expect } from 'vitest';
import { createTestReelSet, captureEvents } from '../../src/testing/index.js';

const SYMBOLS = ['a', 'b', 'c', 'wild', 'coin', 'mystery'];

function makeHarness() {
  return createTestReelSet({
    reels: 5,
    visibleRows: 3,
    symbolIds: SYMBOLS,
  });
}

describe('CellPin — no-pin baseline (regression)', () => {
  it('setResult behaves identically when no pins are set', async () => {
    const h = makeHarness();
    try {
      const target = [
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ];
      await h.spinAndLand(target);
      for (let r = 0; r < 5; r++) {
        expect(h.reelSet.reels[r].getVisibleSymbols()).toEqual(['a', 'b', 'c']);
      }
      expect(h.reelSet.pins.size).toBe(0);
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — overlay onto setResult', () => {
  it('forces the pinned symbol to land at (col, row)', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild', { turns: 'permanent' });

      // Server says 'b' at (2,1); pin overrides to 'wild'.
      const target = [
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ];
      await h.spinAndLand(target);

      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('wild');
      // Other cells on that reel are unchanged
      expect(h.reelSet.reels[2].getVisibleSymbols()[0]).toBe('a');
      expect(h.reelSet.reels[2].getVisibleSymbols()[2]).toBe('c');
    } finally {
      h.destroy();
    }
  });

  it('does not mutate the input symbols array', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(0, 0, 'wild');
      const target = [
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ];
      const snapshot = JSON.parse(JSON.stringify(target));
      await h.spinAndLand(target);
      expect(target).toEqual(snapshot); // caller's array untouched
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — turns countdown', () => {
  it('decrements after each completed spin and expires at 0', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild', { turns: 3 });

      const target = [
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ];

      // Spin 1 — wild lands, turns: 3 → 2
      await h.spinAndLand(target);
      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('wild');
      expect(h.reelSet.getPin(2, 1)?.turns).toBe(2);

      // Spin 2 — wild lands, turns: 2 → 1
      await h.spinAndLand(target);
      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('wild');
      expect(h.reelSet.getPin(2, 1)?.turns).toBe(1);

      // Spin 3 — wild lands, turns: 1 → 0 → expired
      await h.spinAndLand(target);
      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('wild');
      expect(h.reelSet.getPin(2, 1)).toBeUndefined();

      // Spin 4 — no pin, server's 'b' lands
      await h.spinAndLand(target);
      expect(h.reelSet.reels[2].getVisibleSymbols()[1]).toBe('b');
    } finally {
      h.destroy();
    }
  });
});

describe("CellPin — 'eval' lifetime", () => {
  it("applies during the current spin, clears at next spin:start", async () => {
    const h = makeHarness();
    try {
      const target = [
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ];

      // Spin 1 — normal landing
      await h.spinAndLand(target);
      expect(h.reelSet.reels[0].getVisibleSymbols()[0]).toBe('a');

      // Place eval pin AFTER the spin (simulates expanding wild reveal)
      h.reelSet.pin(0, 0, 'wild', { turns: 'eval' });
      expect(h.reelSet.reels[0].getVisibleSymbols()[0]).toBe('wild');
      expect(h.reelSet.pins.size).toBe(1);

      // Spin 2 — eval pin is cleared on spin:start
      await h.spinAndLand(target);
      expect(h.reelSet.pins.size).toBe(0);
      expect(h.reelSet.reels[0].getVisibleSymbols()[0]).toBe('a');
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — permanent lifetime', () => {
  it('persists indefinitely until unpin()', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(3, 2, 'coin', {
        turns: 'permanent',
        payload: { value: 50 },
      });

      const target = [
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ];

      for (let i = 0; i < 5; i++) {
        await h.spinAndLand(target);
        expect(h.reelSet.reels[3].getVisibleSymbols()[2]).toBe('coin');
      }

      expect(h.reelSet.getPin(3, 2)?.turns).toBe('permanent');
      expect(h.reelSet.getPin(3, 2)?.payload).toEqual({ value: 50 });

      h.reelSet.unpin(3, 2);
      expect(h.reelSet.getPin(3, 2)).toBeUndefined();

      await h.spinAndLand(target);
      expect(h.reelSet.reels[3].getVisibleSymbols()[2]).toBe('c');
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — payload', () => {
  it('carries arbitrary data that survives spins and is readable', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(1, 0, 'wild', {
        turns: 5,
        payload: { multiplier: 3, tier: 'gold' },
      });

      const target = [
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ];

      await h.spinAndLand(target);
      const pin = h.reelSet.getPin(1, 0);
      expect(pin?.payload).toEqual({ multiplier: 3, tier: 'gold' });
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — idle application', () => {
  it('applies the pin visually when the reel is not spinning', async () => {
    const h = makeHarness();
    try {
      // Reel starts idle with some initial symbols
      const initialSymbols = h.reelSet.reels[0].getVisibleSymbols();

      h.reelSet.pin(0, 1, 'wild');

      // Cell should update immediately
      expect(h.reelSet.reels[0].getVisibleSymbols()[1]).toBe('wild');
      // Other cells unchanged
      expect(h.reelSet.reels[0].getVisibleSymbols()[0]).toBe(initialSymbols[0]);
      expect(h.reelSet.reels[0].getVisibleSymbols()[2]).toBe(initialSymbols[2]);
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — events', () => {
  it('fires pin:placed when pinned', () => {
    const h = makeHarness();
    try {
      const events = captureEvents(h.reelSet, ['pin:placed']);
      h.reelSet.pin(2, 1, 'wild', { turns: 3 });
      expect(events.length).toBe(1);
      expect(events[0].event).toBe('pin:placed');
      expect(events[0].args[0]).toMatchObject({
        col: 2,
        row: 1,
        symbolId: 'wild',
        turns: 3,
      });
    } finally {
      h.destroy();
    }
  });

  it('fires pin:expired with reason "turns" when countdown hits 0', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild', { turns: 1 });
      const events = captureEvents(h.reelSet, ['pin:expired']);

      const target = [
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ];
      await h.spinAndLand(target);

      expect(events.length).toBe(1);
      expect(events[0].args[1]).toBe('turns');
    } finally {
      h.destroy();
    }
  });

  it('fires pin:expired with reason "explicit" on unpin()', () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(0, 0, 'wild');
      const events = captureEvents(h.reelSet, ['pin:expired']);
      h.reelSet.unpin(0, 0);
      expect(events.length).toBe(1);
      expect(events[0].args[1]).toBe('explicit');
    } finally {
      h.destroy();
    }
  });

  it('fires pin:expired with reason "eval" when a new spin starts', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(0, 0, 'wild', { turns: 'eval' });
      const events = captureEvents(h.reelSet, ['pin:expired']);

      const target = [
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ];
      await h.spinAndLand(target);

      // On spin:start, eval pin was cleared
      expect(events.length).toBeGreaterThanOrEqual(1);
      const reasons = events.map((e) => e.args[1]);
      expect(reasons).toContain('eval');
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — bounds and errors', () => {
  it('throws when col is out of range', () => {
    const h = makeHarness();
    try {
      expect(() => h.reelSet.pin(-1, 0, 'wild')).toThrow();
      expect(() => h.reelSet.pin(5, 0, 'wild')).toThrow();
    } finally {
      h.destroy();
    }
  });

  it('throws when row is out of range', () => {
    const h = makeHarness();
    try {
      expect(() => h.reelSet.pin(0, -1, 'wild')).toThrow();
      expect(() => h.reelSet.pin(0, 3, 'wild')).toThrow();
    } finally {
      h.destroy();
    }
  });

  it('unpin is a no-op when no pin exists', () => {
    const h = makeHarness();
    try {
      expect(() => h.reelSet.unpin(0, 0)).not.toThrow();
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — multiple pins coexist', () => {
  it('applies many pins across reels and rows simultaneously', async () => {
    const h = makeHarness();
    try {
      // Pin a diagonal plus a couple variants. All use `turns: 'permanent'`
      // or numeric turns — `eval` is specifically for post-landing placement
      // and would be cleared at spin:start, so not included here.
      h.reelSet.pin(0, 0, 'wild');
      h.reelSet.pin(1, 1, 'wild');
      h.reelSet.pin(2, 2, 'wild');
      h.reelSet.pin(3, 1, 'coin', { payload: { value: 10 } });
      h.reelSet.pin(4, 0, 'mystery', { turns: 2 });

      const target = [
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ];
      await h.spinAndLand(target);

      expect(h.reelSet.reels[0].getVisibleSymbols()[0]).toBe('wild');
      expect(h.reelSet.reels[1].getVisibleSymbols()[1]).toBe('wild');
      expect(h.reelSet.reels[2].getVisibleSymbols()[2]).toBe('wild');
      expect(h.reelSet.reels[3].getVisibleSymbols()[1]).toBe('coin');
      expect(h.reelSet.reels[4].getVisibleSymbols()[0]).toBe('mystery');
      expect(h.reelSet.pins.size).toBe(5);
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — pin replaces existing pin at same cell', () => {
  it('overwrites the previous pin silently', () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(0, 0, 'wild', { turns: 3 });
      h.reelSet.pin(0, 0, 'coin', { turns: 'permanent', payload: { value: 99 } });

      expect(h.reelSet.pins.size).toBe(1);
      const pin = h.reelSet.getPin(0, 0);
      expect(pin?.symbolId).toBe('coin');
      expect(pin?.turns).toBe('permanent');
      expect(pin?.payload).toEqual({ value: 99 });
    } finally {
      h.destroy();
    }
  });
});

describe('CellPin — visual overlay during spin motion', () => {
  /**
   * During a spin, the reel strip scrolls through random symbols. A pinned
   * cell's underlying symbol cycles like any other; without an engine
   * overlay the player sees the pinned symbol leave the cell and only
   * reappear when the reel lands. The overlay keeps the pinned symbol
   * visible throughout the motion phase.
   */
  it('creates an overlay when a spin starts and a pin exists', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(2, 1, 'wild', { turns: 3 });
      const overlays = (h.reelSet as unknown as {
        _pinOverlays: Map<string, unknown>;
      })._pinOverlays;
      expect(overlays.size).toBe(0); // no spin yet

      // Start a spin manually so spin:start fires
      const promise = h.reelSet.spin();
      expect(overlays.size).toBe(1);
      expect(overlays.has('2:1')).toBe(true);

      h.reelSet.setResult([
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ]);
      h.reelSet.skip();
      await promise;

      // Overlay destroyed after landing
      expect(overlays.size).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('creates overlays for all active pins on spin:start', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(0, 0, 'wild');
      h.reelSet.pin(2, 1, 'wild');
      h.reelSet.pin(4, 2, 'wild');
      const overlays = (h.reelSet as unknown as {
        _pinOverlays: Map<string, unknown>;
      })._pinOverlays;

      const promise = h.reelSet.spin();
      expect(overlays.size).toBe(3);

      h.reelSet.setResult([
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ]);
      h.reelSet.skip();
      await promise;

      expect(overlays.size).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('pin() during spin creates an overlay immediately', async () => {
    const h = makeHarness();
    try {
      const overlays = (h.reelSet as unknown as {
        _pinOverlays: Map<string, unknown>;
      })._pinOverlays;

      const promise = h.reelSet.spin();
      expect(overlays.size).toBe(0);

      h.reelSet.pin(1, 1, 'wild');
      expect(overlays.size).toBe(1); // overlay created mid-spin

      h.reelSet.setResult([
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ]);
      h.reelSet.skip();
      await promise;

      expect(overlays.size).toBe(0);
    } finally {
      h.destroy();
    }
  });

  it('unpin() during spin destroys the overlay immediately', async () => {
    const h = makeHarness();
    try {
      h.reelSet.pin(1, 1, 'wild');
      const overlays = (h.reelSet as unknown as {
        _pinOverlays: Map<string, unknown>;
      })._pinOverlays;

      const promise = h.reelSet.spin();
      expect(overlays.size).toBe(1);

      h.reelSet.unpin(1, 1);
      expect(overlays.size).toBe(0);

      h.reelSet.setResult([
        ['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'],
        ['a', 'b', 'c'], ['a', 'b', 'c'],
      ]);
      h.reelSet.skip();
      await promise;
    } finally {
      h.destroy();
    }
  });
});
