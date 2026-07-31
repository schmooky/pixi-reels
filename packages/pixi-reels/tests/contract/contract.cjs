const fc = require('fast-check');
const impl = process.env.IMPL || 'v1';
const { ReelMotion } = require('./ReelMotion.cjs');
const { AxisMotion } = require('./AxisMotion.cjs');
const POLARITY = process.env.POLARITY ? Number(process.env.POLARITY) : 1;
const PROP = process.env.PROP || 'y';
function build(symbols, h, gap, ba, vr, bb, cb) {
  if (impl === 'v1') return new ReelMotion(symbols, h, gap, ba, vr, bb, cb);
  return new AxisMotion(symbols, h, gap, ba, vr, bb, cb, { polarity: POLARITY, mainProp: PROP });
}
const AX = PROP;

const EPS = 1e-6;
const near = (a, b) => Math.abs(a - b) < EPS;

// --- harness -------------------------------------------------------------
function makeStrip(cfg) {
  const { symbolHeight, gapY, bufferAbove, visibleRows, bufferBelow } = cfg;
  const M = bufferAbove + visibleRows + bufferBelow;
  const symbols = Array.from({ length: M }, (_, i) => ({ id: i, view: { x: 0, y: 0 } }));
  const wraps = [];
  const motion = build(symbols, symbolHeight, gapY, bufferAbove, visibleRows, bufferBelow,
    (sym, idx, dir) => wraps.push({ id: sym.id, idx, dir }));
  motion.snapToGrid();
  return { motion, symbols, wraps, M, slotH: symbolHeight + gapY, cfg };
}

// Arbitrary reel geometries. Integers keep float noise out of the signal.
const geometry = fc.record({
  symbolHeight: fc.integer({ min: 20, max: 200 }),
  gapY: fc.integer({ min: 0, max: 20 }),
  bufferAbove: fc.integer({ min: 1, max: 3 }),
  visibleRows: fc.integer({ min: 1, max: 6 }),
  bufferBelow: fc.integer({ min: 1, max: 3 }),
});

// A travel sequence respecting StandardMode's half-symbol cap.
const cappedSteps = (h) =>
  fc.array(fc.double({ min: -h / 2, max: h / 2, noNaN: true }), { minLength: 1, maxLength: 60 });

// --- law predicates ------------------------------------------------------
function rigidity(s) {
  for (let i = 0; i + 1 < s.symbols.length; i++) {
    const d = s.symbols[i + 1].view[AX] - s.symbols[i].view[AX];
    if (!near(d, s.slotH)) return `gap symbols[${i}]->[${i + 1}] = ${d}, expected ${s.slotH}`;
  }
  return null;
}
function ordered(s) {
  for (let i = 0; i + 1 < s.symbols.length; i++) {
    if (s.symbols[i + 1].view[AX] <= s.symbols[i].view[AX]) return `not ascending at ${i}`;
  }
  return null;
}
function bounded(s) {
  const { bufferAbove, visibleRows, bufferBelow } = s.cfg;
  const maxY = (visibleRows + bufferBelow) * s.slotH;
  const minY = -(bufferAbove + 1) * s.slotH;
  for (const sym of s.symbols) {
    if (sym.view[AX] > maxY + EPS) return `symbol above maxY: ${sym.view[AX]} > ${maxY}`;
    if (sym.view[AX] < minY - EPS) return `symbol below minY: ${sym.view[AX]} < ${minY}`;
  }
  return null;
}

// --- laws ----------------------------------------------------------------
const laws = [];
const law = (id, name, prop) => laws.push({ id, name, prop });

law('L1', 'RIGIDITY — consecutive symbols stay exactly one slot apart, forever', () =>
  fc.property(geometry, (g) => fc.pre(true) ?? true, ) // placeholder replaced below
);
laws.length = 0;

law('L1', 'RIGIDITY — consecutive symbols stay exactly one slot apart', () =>
  fc.asyncProperty(geometry, fc.integer({ min: 1, max: 3 }), async (g, dirSeed) => {
    const s = makeStrip(g);
    const steps = 200, step = (g.symbolHeight / 2) * (dirSeed === 2 ? -1 : 1);
    for (let i = 0; i < steps; i++) {
      s.motion[impl==='v1'?'displace':'advance'](step);
      const err = rigidity(s);
      if (err) throw new Error(`after ${i + 1} steps: ${err}`);
    }
  }),
);

law('L2', 'ORDER — array stays sorted ascending by y (down and up)', () =>
  fc.asyncProperty(geometry, fc.boolean(), async (g, up) => {
    const s = makeStrip(g);
    const step = (g.symbolHeight / 2) * (up ? -1 : 1);
    for (let i = 0; i < 200; i++) {
      s.motion[impl==='v1'?'displace':'advance'](step);
      const err = ordered(s);
      if (err) throw new Error(`after ${i + 1} steps (${up ? 'up' : 'down'}): ${err}`);
    }
  }),
);

law('L3', 'ZERO — displace(0) is a no-op', () =>
  fc.asyncProperty(geometry, async (g) => {
    const s = makeStrip(g);
    const before = s.symbols.map((x) => x.view[AX]);
    const orderBefore = s.symbols.map((x) => x.id).join(',');
    s.motion[impl==='v1'?'displace':'advance'](0);
    if (s.symbols.map((x) => x.view[AX]).join(',') !== before.join(',')) throw new Error('positions moved');
    if (s.symbols.map((x) => x.id).join(',') !== orderBefore) throw new Error('order changed');
    if (s.wraps.length !== 0) throw new Error('wrap fired on zero displacement');
  }),
);

law('L4', 'INVERSE — displace(d) then displace(-d) restores the exact configuration', () =>
  fc.asyncProperty(geometry, fc.double({ min: 0.01, max: 1, noNaN: true }), async (g, frac) => {
    const s = makeStrip(g);
    const d = (g.symbolHeight / 2) * frac;
    const posBefore = s.symbols.map((x) => `${x.id}@${x.view[AX].toFixed(6)}`).sort().join('|');
    s.motion[impl==='v1'?'displace':'advance'](d);
    s.motion[impl==='v1'?'displace':'advance'](-d);
    const posAfter = s.symbols.map((x) => `${x.id}@${x.view[AX].toFixed(6)}`).sort().join('|');
    if (posBefore !== posAfter) throw new Error(`d=${d}\n  before ${posBefore}\n  after  ${posAfter}`);
  }),
);

law('L5', 'ADDITIVITY — displace(a);displace(b) equals displace(a+b) when all within cap', () =>
  fc.asyncProperty(geometry, fc.double({ min: 0.01, max: 0.49, noNaN: true }),
    fc.double({ min: 0.01, max: 0.49, noNaN: true }), async (g, fa, fb) => {
      const a = g.symbolHeight * fa, b = g.symbolHeight * fb;
      const s1 = makeStrip(g); s1.motion[impl==='v1'?'displace':'advance'](a); s1.motion[impl==='v1'?'displace':'advance'](b);
      const s2 = makeStrip(g); s2.motion[impl==='v1'?'displace':'advance'](a + b);
      const k = (s) => s.symbols.map((x) => `${x.id}@${x.view[AX].toFixed(4)}`).join('|');
      if (k(s1) !== k(s2)) throw new Error(`a=${a} b=${b}\n  split  ${k(s1)}\n  single ${k(s2)}`);
    }),
);

law('L6', 'SNAP — after snapToGrid, symbols[i].y === getRowY(i)', () =>
  fc.asyncProperty(geometry, fc.array(fc.double({ min: -50, max: 50, noNaN: true }), { maxLength: 20 }),
    async (g, steps) => {
      const s = makeStrip(g);
      for (const d of steps) s.motion[impl==='v1'?'displace':'advance'](Math.max(-g.symbolHeight / 2, Math.min(g.symbolHeight / 2, d)));
      s.motion.snapToGrid();
      for (let i = 0; i < s.symbols.length; i++) {
        const expect = impl==='v1' ? s.motion.getRowY(i) : s.motion.getCellMain(i - g.bufferAbove);
        if (!near(s.symbols[i].view[AX], expect))
          throw new Error(`i=${i}: main=${s.symbols[i].view[AX]} expected=${expect}`);
      }
    }),
);

law('L7', 'PERIODICITY — travelling M whole slots returns every symbol to its start position', () =>
  fc.asyncProperty(geometry, fc.boolean(), async (g, up) => {
    const s = makeStrip(g);
    const sign = up ? -1 : 1;
    const start = new Map(s.symbols.map((x) => [x.id, x.view[AX]]));
    const total = s.M * s.slotH;
    const n = Math.ceil(total / (g.symbolHeight / 2));
    const step = (total / n) * sign;
    for (let i = 0; i < n; i++) s.motion[impl==='v1'?'displace':'advance'](step);
    for (const sym of s.symbols) {
      if (!near(sym.view[AX], start.get(sym.id)))
        throw new Error(`symbol ${sym.id}: ${sym.view[AX]} != ${start.get(sym.id)} (${up ? 'up' : 'down'})`);
    }
  }),
);

law('L8', 'WRAP COUNT — one wrap per slot of travel, no skips', () =>
  fc.asyncProperty(geometry, fc.boolean(), async (g, up) => {
    const s = makeStrip(g);
    const sign = up ? -1 : 1;
    const slots = 10;
    const total = slots * s.slotH;
    const n = Math.ceil(total / (g.symbolHeight / 2));
    const step = (total / n) * sign;
    for (let i = 0; i < n; i++) s.motion[impl==='v1'?'displace':'advance'](step);
    if (Math.abs(s.wraps.length - slots) > 1)
      throw new Error(`travelled ${slots} slots, saw ${s.wraps.length} wraps (${up ? 'up' : 'down'})`);
  }),
);

law('L9', 'BOUNDEDNESS — no symbol drifts outside [minY, maxY] under capped steps', () =>
  fc.asyncProperty(geometry, fc.boolean(), async (g, up) => {
    const s = makeStrip(g);
    const step = (g.symbolHeight / 2) * (up ? -1 : 1);
    for (let i = 0; i < 200; i++) {
      s.motion[impl==='v1'?'displace':'advance'](step);
      const err = bounded(s);
      if (err) throw new Error(`after ${i + 1} steps (${up ? 'up' : 'down'}): ${err}`);
    }
  }),
);

law('L10', 'WRAP INDEX — the arrayIndex passed to the callback is where the symbol actually is', () =>
  fc.asyncProperty(geometry, fc.boolean(), async (g, up) => {
    const s = makeStrip(g);
    const seen = [];
    const s2 = makeStrip(g);
    const m = build(s2.symbols, g.symbolHeight, g.gapY, g.bufferAbove, g.visibleRows, g.bufferBelow,
      (sym, idx) => { seen.push({ actual: s2.symbols.indexOf(sym), reported: idx }); });
    m.snapToGrid();
    const step = (g.symbolHeight / 2) * (up ? -1 : 1);
    for (let i = 0; i < 100; i++) m[impl==='v1'?'displace':'advance'](step);
    for (const w of seen) if (w.actual !== w.reported) throw new Error(`reported ${w.reported}, actually ${w.actual}`);
  }),
);

law('L11', 'CASCADE CLAMP — a full-symbol step (what CascadeMode allows) keeps the strip bounded', () =>
  fc.asyncProperty(geometry, async (g) => {
    const s = makeStrip(g);
    for (let i = 0; i < 50; i++) {
      s.motion[impl==='v1'?'displace':'advance'](g.symbolHeight); // CascadeMode's Math.min(raw, symbolHeight)
      const err = bounded(s) || rigidity(s) || ordered(s);
      if (err) throw new Error(`after ${i + 1} full-symbol steps: ${err}`);
    }
  }),
);

// --- run -----------------------------------------------------------------
(async () => {
  let pass = 0, fail = 0;
  for (const l of laws) {
    try {
      await fc.assert(l.prop(), { numRuns: 300, verbose: false });
      console.log(`PASS  ${l.id}  ${l.name}`);
      pass++;
    } catch (e) {
      const msg = String(e.message).split('\n').slice(0, 12).join('\n        ');
      console.log(`FAIL  ${l.id}  ${l.name}\n        ${msg}\n`);
      fail++;
    }
  }
  console.log(`\n[impl=${impl} polarity=${POLARITY} axis=${PROP}] ${pass} passed, ${fail} failed`);
})();
