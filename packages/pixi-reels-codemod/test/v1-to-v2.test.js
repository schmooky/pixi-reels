import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const transform = require('../transforms/v1-to-v2.cjs');
const jscodeshift = require('jscodeshift');

const api = { jscodeshift: jscodeshift.withParser('tsx'), j: jscodeshift, stats: () => {}, report: () => {} };
const run = (source) => transform({ path: 'test.tsx', source }, api) ?? source;

test('renames builder methods', () => {
  const out = run('b.visibleRows(3).visibleRowsPerReel([3,5,3]).reelPixelHeights([1,2]);');
  assert.match(out, /visibleCells\(3\)/);
  assert.match(out, /visibleCellsPerReel/);
  assert.match(out, /reelExtents/);
});

test('renames column target buffer keys', () => {
  const out = run("s.setResult([{ visible: ['a'], bufferAbove: ['x'], bufferBelow: ['y'] }]);");
  assert.match(out, /bufferStart: \['x'\]/);
  assert.match(out, /bufferEnd: \['y'\]/);
});

test('renames bufferSymbols object keys only inside that call', () => {
  const out = run('b.bufferSymbols({ above: 1, below: 0 }); const o = { above: 9, below: 9 };');
  assert.match(out, /bufferSymbols\(\{ start: 1, end: 0 \}\)/);
  assert.match(out, /const o = \{ above: 9, below: 9 \}/);
});

test('renames size w/h as keys and as member access, nowhere else', () => {
  const out = run('const d = { size: { w: 2, h: 2 } }; f(x.size.w, x.size.h); g(rect.w, rect.h);');
  assert.match(out, /size: \{ reels: 2, cells: 2 \}/);
  assert.match(out, /f\(x\.size\.reels, x\.size\.cells\)/);
  assert.match(out, /g\(rect\.w, rect\.h\)/);
});

test('renames coordinate fields but not the callers own locals', () => {
  const out = run('console.log(pin.col, pin.row); for (const row of t) { for (const col of row) h(row, col); }');
  assert.match(out, /pin\.reel, pin\.cell/);
  assert.match(out, /for \(const row of t\)/);
  assert.match(out, /h\(row, col\)/);
});

test('expands shorthand rather than renaming the local binding', () => {
  const out = run('const c = { col, row };');
  assert.match(out, /reel: col/);
  assert.match(out, /cell: row/);
});

test('renames string values only inside the owning call', () => {
  const out = run("b.reelAnchor('top'); r.nudge(1, { direction: 'down' }); log('top', 'down');");
  assert.match(out, /reelAnchor\('start'\)/);
  assert.match(out, /direction: 'forward'/);
  assert.match(out, /log\('top', 'down'\)/);
});

test('renames cellOrder values after the key rename', () => {
  const out = run("b.tumble({ fall: { rowStagger: 40, rowOrder: 'bottomToTop' } });");
  assert.match(out, /cellStagger: 40/);
  assert.match(out, /cellOrder: 'endFirst'/);
});

test('renames the OffsetXMode type', () => {
  const out = run("import type { OffsetXMode } from 'pixi-reels'; const m: OffsetXMode = 'none';");
  assert.match(out, /CrossOffsetMode/);
  assert.doesNotMatch(out, /OffsetXMode/);
});

test('returns null for a file with nothing to change', () => {
  const source = 'const a = 1;\n';
  assert.equal(transform({ path: 't.ts', source }, api), null);
});
