/**
 * The motion contract (ADR 018), as executable Vitest laws.
 *
 * This replaces the standalone `contract.cjs` / `cross.cjs` harness. Those
 * needed an esbuild step to reach `ReelMotion.ts`; Vitest reads the TS
 * directly, so the laws now run against the SHIPPING implementation in CI
 * rather than a hand-maintained reference copy.
 *
 * `runMotionContract(factory, axis)` registers one `it` per law. Pass any
 * implementation with the `ContractMotion` shape - the point of a contract
 * suite is that a custom motion layer can be held to the same fourteen laws.
 *
 * Two laws changed shape when A11 dropped the wrap callback's dead
 * `arrayIndex` / `direction` arguments. L10 and L14 used to read those
 * arguments; they now observe where the wrapped symbol actually IS in the
 * array, which is a stronger statement and the one that matters: a wrap must
 * move the symbol to the array end its travel implies.
 */
import { it, expect } from 'vitest';
import fc from 'fast-check';
import type { Container } from 'pixi.js';
import type { ReelAxis } from '../../src/core/ReelAxis.js';

const EPS = 1e-6;
const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

/** A stand-in for `ReelSymbol`: the contract only ever reads `view.x` / `view.y`. */
export interface ContractSymbol {
  id: number;
  view: Container;
}

export interface ContractGeometry {
  cellSize: number;
  gap: number;
  bufferStart: number;
  visibleCells: number;
  bufferEnd: number;
}

/** The slice of `ReelMotion` the contract exercises. */
export interface ContractMotion {
  advance(delta: number): void;
  snapToGrid(): void;
  getCellMain(index: number): number;
  readonly slotPitch: number;
}

export type MotionFactory = (
  symbols: ContractSymbol[],
  geo: ContractGeometry,
  onWrapped: (symbol: ContractSymbol) => void,
  axis: ReelAxis,
) => ContractMotion;

interface Strip {
  motion: ContractMotion;
  symbols: ContractSymbol[];
  /** One entry per wrap: the array index the symbol landed at. */
  wrapIndices: number[];
  total: number;
  slotPitch: number;
  geo: ContractGeometry;
  main: (s: ContractSymbol) => number;
}

/** Integer geometries keep float noise out of the signal. */
const geometry = fc.record({
  cellSize: fc.integer({ min: 20, max: 200 }),
  gap: fc.integer({ min: 0, max: 20 }),
  bufferStart: fc.integer({ min: 1, max: 3 }),
  visibleCells: fc.integer({ min: 1, max: 6 }),
  bufferEnd: fc.integer({ min: 1, max: 3 }),
});

function makeStrip(factory: MotionFactory, axis: ReelAxis, geo: ContractGeometry): Strip {
  const total = geo.bufferStart + geo.visibleCells + geo.bufferEnd;
  const symbols: ContractSymbol[] = Array.from({ length: total }, (_, i) => ({
    id: i,
    view: { x: 0, y: 0 } as Container,
  }));
  const wrapIndices: number[] = [];
  const motion = factory(
    symbols,
    geo,
    (symbol) => wrapIndices.push(symbols.indexOf(symbol)),
    axis,
  );
  motion.snapToGrid();
  wrapIndices.length = 0;
  return {
    motion,
    symbols,
    wrapIndices,
    total,
    slotPitch: geo.cellSize + geo.gap,
    geo,
    main: (s) => axis.getMain(s.view),
  };
}

/** Positions of every symbol, keyed by identity, as a comparable string. */
const fingerprint = (s: Strip, digits = 6): string =>
  s.symbols.map((x) => `${x.id}@${s.main(x).toFixed(digits)}`).join('|');

function assertRigid(s: Strip, context: string): void {
  for (let i = 0; i + 1 < s.symbols.length; i++) {
    const d = s.main(s.symbols[i + 1]) - s.main(s.symbols[i]);
    if (!near(d, s.slotPitch)) {
      throw new Error(`${context}: gap [${i}]->[${i + 1}] = ${d}, expected ${s.slotPitch}`);
    }
  }
}

function assertOrdered(s: Strip, context: string): void {
  for (let i = 0; i + 1 < s.symbols.length; i++) {
    if (s.main(s.symbols[i + 1]) <= s.main(s.symbols[i])) {
      throw new Error(`${context}: array not ascending along the main axis at ${i}`);
    }
  }
}

function assertBounded(s: Strip, context: string): void {
  const maxMain = (s.geo.visibleCells + s.geo.bufferEnd) * s.slotPitch;
  const minMain = -(s.geo.bufferStart + 1) * s.slotPitch;
  for (const sym of s.symbols) {
    const m = s.main(sym);
    if (m > maxMain + EPS) throw new Error(`${context}: ${m} past maxMain ${maxMain}`);
    if (m < minMain - EPS) throw new Error(`${context}: ${m} past minMain ${minMain}`);
  }
}

/**
 * Register the fourteen laws for one implementation on one axis.
 *
 * `numRuns` is per law. 200 keeps the whole four-combination sweep well
 * under a second while still shrinking real counterexamples.
 */
export function runMotionContract(
  factory: MotionFactory,
  axis: ReelAxis,
  numRuns = 200,
): void {
  const build = (geo: ContractGeometry): Strip => makeStrip(factory, axis, geo);
  const check = (prop: fc.IProperty<unknown> | fc.IAsyncProperty<unknown>): void => {
    fc.assert(prop as fc.IProperty<unknown>, { numRuns });
  };

  it('L1 RIGIDITY - consecutive symbols stay exactly one slot apart', () => {
    check(
      fc.property(geometry, fc.boolean(), (geo, back) => {
        const s = build(geo);
        const step = (geo.cellSize / 2) * (back ? -1 : 1);
        for (let i = 0; i < 200; i++) {
          s.motion.advance(step);
          assertRigid(s, `after ${i + 1} steps`);
        }
      }),
    );
  });

  it('L2 ORDER - the array stays sorted ascending along the main axis', () => {
    check(
      fc.property(geometry, fc.boolean(), (geo, back) => {
        const s = build(geo);
        const step = (geo.cellSize / 2) * (back ? -1 : 1);
        for (let i = 0; i < 200; i++) {
          s.motion.advance(step);
          assertOrdered(s, `after ${i + 1} steps`);
        }
      }),
    );
  });

  it('L3 ZERO - advance(0) moves nothing and fires no wrap', () => {
    check(
      fc.property(geometry, (geo) => {
        const s = build(geo);
        const before = fingerprint(s);
        const orderBefore = s.symbols.map((x) => x.id).join(',');
        s.motion.advance(0);
        expect(fingerprint(s)).toBe(before);
        expect(s.symbols.map((x) => x.id).join(',')).toBe(orderBefore);
        expect(s.wrapIndices).toHaveLength(0);
      }),
    );
  });

  it('L4 INVERSE - advance(d) then advance(-d) restores the configuration', () => {
    check(
      fc.property(geometry, fc.double({ min: 0.01, max: 1, noNaN: true }), (geo, frac) => {
        const s = build(geo);
        const d = (geo.cellSize / 2) * frac;
        const before = fingerprint(s);
        s.motion.advance(d);
        s.motion.advance(-d);
        expect(fingerprint(s)).toBe(before);
      }),
    );
  });

  it('L5 ADDITIVITY - advance(a);advance(b) equals advance(a+b) within the cap', () => {
    check(
      fc.property(
        geometry,
        fc.double({ min: 0.01, max: 0.49, noNaN: true }),
        fc.double({ min: 0.01, max: 0.49, noNaN: true }),
        (geo, fa, fb) => {
          const a = geo.cellSize * fa;
          const b = geo.cellSize * fb;
          const split = build(geo);
          split.motion.advance(a);
          split.motion.advance(b);
          const single = build(geo);
          single.motion.advance(a + b);
          expect(fingerprint(split, 4)).toBe(fingerprint(single, 4));
        },
      ),
    );
  });

  it('L6 SNAP - after snapToGrid, symbols[i] sits at getCellMain(i)', () => {
    check(
      fc.property(
        geometry,
        fc.array(fc.double({ min: -50, max: 50, noNaN: true }), { maxLength: 20 }),
        (geo, steps) => {
          const s = build(geo);
          const cap = geo.cellSize / 2;
          for (const d of steps) s.motion.advance(Math.max(-cap, Math.min(cap, d)));
          s.motion.snapToGrid();
          for (let i = 0; i < s.symbols.length; i++) {
            expect(near(s.main(s.symbols[i]), s.motion.getCellMain(i))).toBe(true);
          }
        },
      ),
    );
  });

  it('L7 PERIODICITY - travelling the whole strip returns every symbol home', () => {
    check(
      fc.property(geometry, fc.boolean(), (geo, back) => {
        const s = build(geo);
        const sign = back ? -1 : 1;
        const start = new Map(s.symbols.map((x) => [x.id, s.main(x)]));
        const total = s.total * s.slotPitch;
        const n = Math.ceil(total / (geo.cellSize / 2));
        for (let i = 0; i < n; i++) s.motion.advance((total / n) * sign);
        for (const sym of s.symbols) {
          expect(near(s.main(sym), start.get(sym.id) as number)).toBe(true);
        }
      }),
    );
  });

  it('L8 WRAP COUNT - one wrap per slot of travel, no skips', () => {
    check(
      fc.property(geometry, fc.boolean(), (geo, back) => {
        const s = build(geo);
        const slots = 10;
        const total = slots * s.slotPitch;
        const n = Math.ceil(total / (geo.cellSize / 2));
        for (let i = 0; i < n; i++) s.motion.advance((total / n) * (back ? -1 : 1));
        expect(Math.abs(s.wrapIndices.length - slots)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('L9 BOUNDEDNESS - no symbol drifts outside the strip window', () => {
    check(
      fc.property(geometry, fc.boolean(), (geo, back) => {
        const s = build(geo);
        const step = (geo.cellSize / 2) * (back ? -1 : 1);
        for (let i = 0; i < 200; i++) {
          s.motion.advance(step);
          assertBounded(s, `after ${i + 1} steps`);
        }
      }),
    );
  });

  it('L10 WRAP LANDING - a wrapped symbol is at an array end when the callback fires', () => {
    check(
      fc.property(geometry, fc.boolean(), (geo, back) => {
        const s = build(geo);
        const step = (geo.cellSize / 2) * (back ? -1 : 1);
        for (let i = 0; i < 100; i++) s.motion.advance(step);
        expect(s.wrapIndices.length).toBeGreaterThan(0);
        for (const idx of s.wrapIndices) {
          expect(idx === 0 || idx === s.total - 1).toBe(true);
        }
      }),
    );
  });

  it('L11 CASCADE CLAMP - a full-cell step keeps the strip rigid, ordered and bounded', () => {
    check(
      fc.property(geometry, (geo) => {
        const s = build(geo);
        for (let i = 0; i < 50; i++) {
          s.motion.advance(geo.cellSize);
          const context = `after ${i + 1} full-cell steps`;
          assertBounded(s, context);
          assertRigid(s, context);
          assertOrdered(s, context);
        }
      }),
    );
  });

  it('L14 FEED EDGE - forward travel always feeds the start edge, reverse the end', () => {
    check(
      fc.property(
        geometry,
        fc.array(fc.double({ min: 0.25, max: 1, noNaN: true }), { minLength: 40, maxLength: 60 }),
        (geo, fracs) => {
          const s = build(geo);
          for (const f of fracs) s.motion.advance(f * s.slotPitch);
          expect(s.wrapIndices.length).toBeGreaterThan(0);
          // A positive `advance` is forward travel FOR THIS REEL, so which
          // array end receives the symbol is the axis's feed edge, not a
          // function of the sign the caller passed.
          const wanted = axis.feedEdge === 'start' ? 0 : s.total - 1;
          for (const idx of s.wrapIndices) expect(idx).toBe(wanted);
        },
      ),
    );
  });
}

/**
 * L12 / L13 - the cross-axis laws. They compare two axes against each other,
 * so they take the factory once and build both sides themselves.
 */
export function runCrossAxisContract(
  factory: MotionFactory,
  axes: {
    verticalForward: ReelAxis;
    horizontalForward: ReelAxis;
    verticalReverse: ReelAxis;
  },
  numRuns = 200,
): void {
  const steps = fc.array(fc.double({ min: -90, max: 90, noNaN: true }), {
    minLength: 1,
    maxLength: 40,
  });

  const trace = (
    geo: ContractGeometry,
    axis: ReelAxis,
    deltas: number[],
  ): { frames: string[]; wraps: number[] } => {
    const s = makeStrip(factory, axis, geo);
    const frames: string[] = [];
    for (const d of deltas) {
      s.motion.advance(d);
      frames.push(fingerprint(s));
    }
    return { frames, wraps: s.wrapIndices };
  };

  it('L12 ISOMORPHISM - a horizontal trace is the vertical trace on the other axis', () => {
    fc.assert(
      fc.property(geometry, steps, (geo, deltas) => {
        const v = trace(geo, axes.verticalForward, deltas);
        const h = trace(geo, axes.horizontalForward, deltas);
        expect(h.frames).toEqual(v.frames);
        expect(h.wraps).toEqual(v.wraps);
      }),
      { numRuns },
    );
  });

  it('L13 MIRROR - reverse(d) is exactly forward(-d), polarity applied once', () => {
    fc.assert(
      fc.property(geometry, steps, (geo, deltas) => {
        const fwd = trace(geo, axes.verticalForward, deltas.map((d) => -d));
        const rev = trace(geo, axes.verticalReverse, deltas);
        expect(rev.frames).toEqual(fwd.frames);
        expect(rev.wraps).toEqual(fwd.wraps);
      }),
      { numRuns },
    );
  });
}
