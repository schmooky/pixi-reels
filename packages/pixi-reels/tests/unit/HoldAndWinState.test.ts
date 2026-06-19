import { describe, it, expect } from 'vitest';
import { HoldAndWinState } from '../../src/board/HoldAndWinState.js';
import type { HwCell, HwEffect } from '../../src/board/HwTypes.js';

// A 2×2 board → capacity 4. Cell order is irrelevant to the reducer.
const CELLS: HwCell[] = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: 1, row: 1 },
];
const make = (respins = 3) => new HoldAndWinState<{ value: number }>(CELLS, respins);
const types = (fx: HwEffect[]) => fx.map((e) => e.type);

describe('HoldAndWinState', () => {
  it('starts idle and empty', () => {
    const s = make();
    expect(s.phase).toBe('idle');
    expect(s.respinsLeft).toBe(0);
    expect(s.capacity).toBe(4);
    expect(s.isFull).toBe(false);
    expect(s.lockedCoins()).toHaveLength(0);
    expect(s.freeCells()).toHaveLength(4);
  });

  describe('enter', () => {
    it('seeds the ledger, arms the counter, goes active', () => {
      const s = make(3);
      const fx = s.enter([{ cell: { col: 0, row: 0 }, id: 'coin', data: { value: 5 } }]);
      expect(types(fx)).toEqual(['respins:changed', 'feature:enter']);
      expect(fx[0].payload).toMatchObject({ value: 3, reason: 'seed' });
      expect(s.phase).toBe('active');
      expect(s.respinsLeft).toBe(3);
      expect(s.lockedCoins()).toHaveLength(1);
      expect(s.freeCells()).toHaveLength(3);
      expect(s.isLocked({ col: 0, row: 0 })).toBe(true);
    });

    it('throws when entering while active', () => {
      const s = make();
      s.enter([]);
      expect(() => s.enter([])).toThrow(/while a feature is active/);
    });

    it('throws on a duplicate seed cell', () => {
      const s = make();
      expect(() =>
        s.enter([
          { cell: { col: 0, row: 0 }, id: 'coin' },
          { cell: { col: 0, row: 0 }, id: 'coin' },
        ]),
      ).toThrow(/twice/);
    });

    it('throws on an out-of-grid seed', () => {
      const s = make();
      expect(() => s.enter([{ cell: { col: 9, row: 9 }, id: 'coin' }])).toThrow(/outside the grid/);
    });

    it('freezes the stored cell so the ledger key can not be corrupted', () => {
      const s = make();
      s.enter([{ cell: { col: 0, row: 0 }, id: 'coin', data: { value: 5 } }]);
      const coin = s.lockedCoins()[0];
      expect(() => {
        (coin.cell as { col: number }).col = 5;
      }).toThrow();
      // data stays mutable — the supported way to carry live value
      coin.data!.value = 50;
      expect(s.lockedCoins()[0].data!.value).toBe(50);
    });
  });

  describe('respin wave', () => {
    it('begins a wave from active: spins free cells, bumps the round', () => {
      const s = make();
      s.enter([{ cell: { col: 0, row: 0 }, id: 'coin' }]);
      const { round, spinning, hitByKey } = s.beginWave([{ cell: { col: 1, row: 0 }, id: 'coin' }]);
      expect(round).toBe(1);
      expect(spinning).toHaveLength(3);
      expect(hitByKey.has('1,0')).toBe(true);
      expect(s.phase).toBe('spinning');
    });

    it('throws on respin before enter and while already spinning', () => {
      const s = make();
      expect(() => s.beginWave([])).toThrow(/before enter/);
      s.enter([]);
      s.beginWave([]);
      expect(() => s.beginWave([])).toThrow(/in flight/);
    });

    it('throws when a hit targets a locked cell', () => {
      const s = make();
      s.enter([{ cell: { col: 0, row: 0 }, id: 'coin' }]);
      expect(() => s.beginWave([{ cell: { col: 0, row: 0 }, id: 'coin' }])).toThrow(/locked cell/);
    });

    it('lands a hit (cell:landed + coin:locked) and a miss (cell:landed only)', () => {
      const s = make();
      s.enter([]);
      s.beginWave([{ cell: { col: 0, row: 0 }, id: 'coin', data: { value: 5 } }]);
      const hit = s.land({ col: 0, row: 0 }, { cell: { col: 0, row: 0 }, id: 'coin', data: { value: 5 } });
      expect(types(hit)).toEqual(['cell:landed', 'coin:locked']);
      expect(hit[1].payload).toMatchObject({ locked: 1, capacity: 4 });
      const miss = s.land({ col: 1, row: 0 }, null);
      expect(types(miss)).toEqual(['cell:landed']);
      expect(miss[0].payload).toMatchObject({ coin: null });
    });

    it('resets the counter when a wave lands a coin', () => {
      const s = make(3);
      s.enter([]);
      s.beginWave([{ cell: { col: 0, row: 0 }, id: 'coin' }]);
      s.land({ col: 0, row: 0 }, { cell: { col: 0, row: 0 }, id: 'coin' });
      s.land({ col: 1, row: 0 }, null);
      const { effects } = s.endWave();
      expect(types(effects)).toEqual(['respins:changed', 'respin:end']);
      expect(effects[0].payload).toMatchObject({ value: 3, reason: 'hit-reset' });
      expect(s.phase).toBe('active');
    });

    it('decrements on a dry wave and ends the feature at zero', () => {
      const s = make(1);
      s.enter([]);
      s.beginWave([]);
      s.land({ col: 0, row: 0 }, null);
      const { effects } = s.endWave();
      expect(types(effects)).toEqual(['respins:changed', 'respin:end', 'feature:end']);
      expect(effects[0].payload).toMatchObject({ value: 0, reason: 'miss' });
      expect(s.phase).toBe('idle');
    });

    it('fires board:full and feature:end when the last cell locks', () => {
      const s = make(3);
      // seed 3 of 4, then land the 4th
      s.enter([
        { cell: { col: 0, row: 0 }, id: 'coin' },
        { cell: { col: 1, row: 0 }, id: 'coin' },
        { cell: { col: 0, row: 1 }, id: 'coin' },
      ]);
      s.beginWave([{ cell: { col: 1, row: 1 }, id: 'coin' }]);
      s.land({ col: 1, row: 1 }, { cell: { col: 1, row: 1 }, id: 'coin' });
      const { effects } = s.endWave();
      expect(types(effects)).toEqual(['respins:changed', 'respin:end', 'board:full', 'feature:end']);
      expect(effects[3].payload).toMatchObject({ full: true });
      expect(s.isFull).toBe(true);
      expect(s.phase).toBe('idle');
    });
  });

  describe('release', () => {
    it('removes locked coins and reports the remaining count', () => {
      const s = make();
      s.enter([
        { cell: { col: 0, row: 0 }, id: 'coin' },
        { cell: { col: 1, row: 0 }, id: 'coin' },
      ]);
      const { effects, released } = s.release([{ col: 0, row: 0 }]);
      expect(released).toHaveLength(1);
      expect(types(effects)).toEqual(['coin:released']);
      expect(effects[0].payload).toMatchObject({ remaining: 1 });
      expect(s.isLocked({ col: 0, row: 0 })).toBe(false);
    });

    it('ignores a free cell', () => {
      const s = make();
      s.enter([]);
      const { effects, released } = s.release([{ col: 0, row: 0 }]);
      expect(released).toHaveLength(0);
      expect(effects).toHaveLength(0);
    });
  });

  describe('setSymbolAt (swap)', () => {
    it('rewrites a locked coin in place', () => {
      const s = make();
      s.enter([{ cell: { col: 0, row: 0 }, id: 'coin', data: { value: 5 } }]);
      s.swap({ col: 0, row: 0 }, 'major', { value: 100 });
      expect(s.coinAt({ col: 0, row: 0 })).toMatchObject({ id: 'major', data: { value: 100 } });
    });

    it('keeps prior data when none is passed', () => {
      const s = make();
      s.enter([{ cell: { col: 0, row: 0 }, id: 'coin', data: { value: 5 } }]);
      s.swap({ col: 0, row: 0 }, 'major', undefined);
      expect(s.coinAt({ col: 0, row: 0 })).toMatchObject({ id: 'major', data: { value: 5 } });
    });

    it('throws on a non-locked cell', () => {
      const s = make();
      s.enter([]);
      expect(() => s.swap({ col: 0, row: 0 }, 'major', undefined)).toThrow(/non-locked/);
    });
  });

  describe('reset', () => {
    it('clears to idle and fires feature:reset (never coin:released)', () => {
      const s = make(3);
      s.enter([
        { cell: { col: 0, row: 0 }, id: 'coin' },
        { cell: { col: 1, row: 0 }, id: 'coin' },
      ]);
      const fx = s.reset();
      expect(types(fx)).toEqual(['feature:reset']);
      expect(fx[0].payload).toMatchObject({ clearedCoins: 2 });
      expect(s.phase).toBe('idle');
      expect(s.respinsLeft).toBe(0);
      expect(s.lockedCoins()).toHaveLength(0);
    });
  });
});
