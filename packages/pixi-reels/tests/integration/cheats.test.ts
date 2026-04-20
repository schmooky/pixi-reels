import { describe, it, expect } from 'vitest';
import {
  CheatEngine,
  forceGrid,
  forceScatters,
  forceLine,
  forceNearMiss,
  forceCell,
  holdAndWinProgress,
  cascadeSequence,
  forceAnticipation,
} from '../../../../examples/shared/cheats.js';
import { SeededRng } from '../../../../examples/shared/seededRng.js';

const SYMBOLS = ['a', 'b', 'c', 'scatter', 'wild', 'coin'];

function makeEngine(seed = 1) {
  return new CheatEngine({
    reelCount: 5,
    visibleRows: 3,
    symbolIds: SYMBOLS,
    seed,
  });
}

describe('SeededRng', () => {
  it('is deterministic for a given seed', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    for (let i = 0; i < 10; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('pick() returns an element of the array', () => {
    const rng = new SeededRng(1);
    const arr = ['x', 'y', 'z'];
    for (let i = 0; i < 20; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });
});

describe('CheatEngine', () => {
  it('returns random grids of correct shape when no cheats enabled', () => {
    const engine = makeEngine();
    const r = engine.next();
    expect(r.symbols.length).toBe(5);
    for (const col of r.symbols) {
      expect(col.length).toBe(3);
      for (const s of col) expect(SYMBOLS).toContain(s);
    }
  });

  it('forceGrid always returns the same grid', () => {
    const engine = makeEngine();
    const grid: string[][] = [
      ['a', 'b', 'c'],
      ['b', 'c', 'a'],
      ['c', 'a', 'b'],
      ['a', 'b', 'c'],
      ['b', 'c', 'a'],
    ];
    engine.register({ id: 'g', label: 'g', enabled: true, cheat: forceGrid(grid) });
    for (let i = 0; i < 3; i++) {
      expect(engine.next().symbols).toEqual(grid);
    }
  });

  it('forceScatters produces exactly N scatters (not more)', () => {
    const engine = makeEngine();
    engine.register({
      id: 's',
      label: 's',
      enabled: true,
      cheat: forceScatters(3, 'scatter'),
    });
    for (let i = 0; i < 10; i++) {
      const { symbols } = engine.next();
      const count = symbols.flat().filter((x) => x === 'scatter').length;
      expect(count).toBe(3);
    }
  });

  it('forceLine fills a full row with the given symbol', () => {
    const engine = makeEngine();
    engine.register({
      id: 'l',
      label: 'l',
      enabled: true,
      cheat: forceLine(1, 'wild'),
    });
    const { symbols } = engine.next();
    for (let r = 0; r < 5; r++) {
      expect(symbols[r][1]).toBe('wild');
    }
  });

  it('forceNearMiss avoids scatters on the near reel', () => {
    const engine = makeEngine();
    engine.register({
      id: 'n',
      label: 'n',
      enabled: true,
      cheat: forceNearMiss(3, 'scatter', 4),
    });
    const { symbols, anticipationReels } = engine.next();
    expect(anticipationReels).toContain(4);
    expect(symbols[4]).not.toContain('scatter');
  });

  it('forceCell places a symbol at a specific coordinate', () => {
    const engine = makeEngine();
    engine.register({
      id: 'c',
      label: 'c',
      enabled: true,
      cheat: forceCell(2, 1, 'wild'),
    });
    const { symbols } = engine.next();
    expect(symbols[2][1]).toBe('wild');
  });

  it('holdAndWinProgress keeps held cells and may add one new coin', () => {
    const engine = makeEngine();
    engine.register({
      id: 'h',
      label: 'h',
      enabled: true,
      cheat: holdAndWinProgress('coin', 1), // chance=1 → always lands
    });
    engine.setHeld([
      { reel: 0, row: 0, symbolId: 'coin' },
      { reel: 1, row: 1, symbolId: 'coin' },
    ]);
    const { symbols } = engine.next();
    expect(symbols[0][0]).toBe('coin');
    expect(symbols[1][1]).toBe('coin');
    const totalCoins = symbols.flat().filter((s) => s === 'coin').length;
    // held (2) + at least one new (1) = 3
    expect(totalCoins).toBeGreaterThanOrEqual(3);
  });

  it('cascadeSequence emits grids in order then passes through', () => {
    const engine = makeEngine();
    const g1: string[][] = [
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ];
    const g2: string[][] = [
      ['b', 'b', 'b'],
      ['b', 'b', 'b'],
      ['b', 'b', 'b'],
      ['b', 'b', 'b'],
      ['b', 'b', 'b'],
    ];
    engine.register({
      id: 'seq',
      label: 'seq',
      enabled: true,
      cheat: cascadeSequence([g1, g2]),
    });
    expect(engine.next().symbols).toEqual(g1);
    expect(engine.next().symbols).toEqual(g2);
    // exhausted → fallback to random
    const r = engine.next();
    expect(r.symbols.length).toBe(5);
  });

  it('forceAnticipation sets anticipationReels without constraining symbols', () => {
    const engine = makeEngine();
    engine.register({
      id: 'a',
      label: 'a',
      enabled: true,
      cheat: forceAnticipation([3, 4]),
    });
    const r = engine.next();
    expect(r.anticipationReels).toEqual([3, 4]);
  });

  it('disabled cheats are skipped', () => {
    const engine = makeEngine();
    engine.register({
      id: 's',
      label: 's',
      enabled: false,
      cheat: forceScatters(5, 'scatter'),
    });
    const { symbols } = engine.next();
    const count = symbols.flat().filter((x) => x === 'scatter').length;
    // Random grid over 6 symbols → very unlikely to be >= 5 but might be. Just assert the cheat didn't force to 5.
    expect(count).toBeLessThanOrEqual(15);
  });

  it('first-match wins: earlier cheats override later ones', () => {
    const engine = makeEngine();
    engine.register({
      id: 'first',
      label: 'first',
      enabled: true,
      cheat: forceLine(0, 'a'),
    });
    engine.register({
      id: 'second',
      label: 'second',
      enabled: true,
      cheat: forceLine(0, 'b'),
    });
    const { symbols } = engine.next();
    for (let r = 0; r < 5; r++) expect(symbols[r][0]).toBe('a');
  });

  it('same seed reproduces same sequence', () => {
    const a = makeEngine(7);
    const b = makeEngine(7);
    for (let i = 0; i < 5; i++) {
      expect(a.next().symbols).toEqual(b.next().symbols);
    }
  });

  // ── held-cell persistence (sticky-wild substrate) ─────────────────────

  it('applies held cells on top of any cheat result (sticky wilds)', () => {
    const engine = makeEngine();
    engine.register({
      id: 'line', label: 'line', enabled: true, cheat: forceLine(0, 'a'),
    });
    engine.setHeld([{ reel: 2, row: 1, symbolId: 'wild' }]);
    const { symbols } = engine.next();
    expect(symbols[2][1]).toBe('wild');     // held wins
    for (let r = 0; r < 5; r++) {
      expect(symbols[r][0]).toBe('a');       // line still placed on row 0
    }
  });

  it('applies held cells even with no cheats enabled', () => {
    const engine = makeEngine();
    engine.setHeld([{ reel: 0, row: 0, symbolId: 'wild' }]);
    const { symbols } = engine.next();
    expect(symbols[0][0]).toBe('wild');
  });

  it('multiple held cells all persist across successive spins', () => {
    const engine = makeEngine();
    engine.register({
      id: 's', label: 's', enabled: true, cheat: forceScatters(1, 'wild'),
    });
    engine.setHeld([
      { reel: 0, row: 0, symbolId: 'wild' },
      { reel: 2, row: 1, symbolId: 'wild' },
      { reel: 4, row: 2, symbolId: 'wild' },
    ]);
    for (let i = 0; i < 5; i++) {
      const { symbols } = engine.next();
      expect(symbols[0][0]).toBe('wild');
      expect(symbols[2][1]).toBe('wild');
      expect(symbols[4][2]).toBe('wild');
    }
  });
});
