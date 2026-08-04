import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const transform = require('../transforms/v1-to-v2.cjs');
const jscodeshift = require('jscodeshift');

const HERE = dirname(fileURLToPath(import.meta.url));

/** Run the transform, returning the output and the skipped-site report. */
const runWith = (source) => {
  const reports = [];
  const api = {
    jscodeshift: jscodeshift.withParser('tsx'),
    j: jscodeshift,
    stats: () => {},
    report: (msg) => reports.push(msg),
  };
  const out = transform({ path: 'test.tsx', source }, api);
  return { out: out ?? source, reports };
};
const run = (source) => runWith(source).out;

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

test('renames size w/h under a symbolData override', () => {
  const out = run("b.symbolData({ big: { size: { w: 2, h: 2 }, weight: 0 } });");
  assert.match(out, /size: \{ reels: 2, cells: 2 \}/);
});

test('renames size w/h on a symbol-ish receiver', () => {
  assert.match(run('f(symbolData.big.size.w, symbolData.big.size.h);'), /size\.reels, symbolData\.big\.size\.cells/);
  assert.match(run('const n = reelSet.getSymbolFootprint(0, 0).size.w;'), /\.size\.reels/);
});

test('leaves any other size w/h alone, and reports it', () => {
  // Every renderer, texture and layout box in a slot game has a `size`.
  // Rewriting those to `{ reels, cells }` breaks the game silently.
  const bare = runWith('const bg = { size: { w: 1920, h: 1080 } };');
  assert.match(bare.out, /size: \{ w: 1920, h: 1080 \}/);
  assert.equal(bare.reports.length, 1);
  assert.match(bare.reports[0], /^1:\d+ .*size/);

  const member = runWith('app.renderer.resize(bg.size.w, bg.size.h);');
  assert.match(member.out, /resize\(bg\.size\.w, bg\.size\.h\)/);
  assert.equal(member.reports.length, 2);

  assert.match(run('g(rect.w, rect.h);'), /g\(rect\.w, rect\.h\)/);
});

test('renames coordinate fields but not the callers own locals', () => {
  const out = run('console.log(pin.col, pin.row); for (const row of t) { for (const col of row) h(row, col); }');
  assert.match(out, /pin\.reel, pin\.cell/);
  assert.match(out, /for \(const row of t\)/);
  assert.match(out, /h\(row, col\)/);
});

test('renames a coordinate pair destructured from a pixi-reels value', () => {
  const out = run('for (const { row, col } of e.winners) mark(row, col);');
  assert.match(out, /\{ cell: row, reel: col \}/);
  assert.match(out, /mark\(row, col\)/);
});

test('leaves a foreign rowIndex alone, and reports it', () => {
  // `{ rowIndex, columnIndex, style }` is the react-window / ag-grid cell
  // callback. Renaming the key rebinds the parameter to `undefined`.
  const cb = runWith('const Cell = ({ rowIndex, columnIndex, style }) => data[rowIndex][columnIndex];');
  assert.match(cb.out, /\(\{ rowIndex, columnIndex, style \}\)/);
  assert.doesNotMatch(cb.out, /cellIndex/);
  assert.equal(cb.reports.length, 1);
  assert.match(cb.reports[0], /^1:\d+ .*rowIndex/);

  // `rowIndex` is a real HTMLTableRowElement property.
  const dom = runWith('const n = tr.rowIndex;');
  assert.match(dom.out, /tr\.rowIndex/);
  assert.equal(dom.reports.length, 1);
});

test('renames rowIndex next to a distinctive pixi-reels sibling key', () => {
  assert.match(run('const { reelIndex, rowIndex } = e.cell;'), /cellIndex: rowIndex/);
  assert.match(run('emit({ reelIndex: 0, rowIndex: 2 });'), /cellIndex: 2/);
});

test('expands shorthand rather than renaming the local binding', () => {
  const out = run('reelSet.pin({ col, row });');
  assert.match(out, /reel: col/);
  assert.match(out, /cell: row/);
});

test('renames string values only in the argument that carries them', () => {
  const out = run("builder.reelAnchor('top'); reelSet.nudge(1, { direction: 'down' }); log('top', 'down');");
  assert.match(out, /reelAnchor\('start'\)/);
  assert.match(out, /direction: 'forward'/);
  assert.match(out, /log\('top', 'down'\)/);
});

test('renames reelAnchor on a fluent builder chain', () => {
  assert.match(run("b.visibleRows(3).reelAnchor('bottom');"), /reelAnchor\('end'\)/);
});

test('never rewrites nudge incoming symbol ids', () => {
  const out = run("reelSet.nudge(2, { direction: 'down', incoming: ['up', 'down', 'wild'] });");
  assert.match(out, /direction: 'forward'/);
  assert.match(out, /incoming: \['up', 'down', 'wild'\]/);
});

test('leaves a foreign nudge alone, and reports it', () => {
  // Every UI kit has a `nudge()`. Renaming its arguments is not our business.
  const r = runWith("tooltip.nudge('up'); panel.nudge('down', 4);");
  assert.match(r.out, /tooltip\.nudge\('up'\)/);
  assert.match(r.out, /panel\.nudge\('down', 4\)/);
  assert.equal(r.reports.length, 2);
});

test('never rewrites an operand of a comparison', () => {
  const r = runWith("builder.reelAnchor(cfg.anchor === 'top' ? 'top' : 'bottom');");
  assert.match(r.out, /cfg\.anchor === 'top' \? 'top' : 'bottom'/);
  assert.equal(r.reports.length, 1);
  assert.match(r.reports[0], /reelAnchor/);
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

test('renames a type member only with evidence', () => {
  const withEvidence = run('interface Hit { reelIndex: number; row: number }');
  assert.match(withEvidence, /cell: number/);

  const foreign = runWith('interface TableCell { row: number; col: number }');
  assert.match(foreign.out, /row: number; col: number/);
  assert.equal(foreign.reports.length, 2);
});

test('returns null for a file with nothing to change', () => {
  const source = 'const a = 1;\n';
  assert.equal(transform({ path: 't.ts', source }, { jscodeshift: jscodeshift.withParser('tsx'), stats: () => {}, report: () => {} }), null);
});

test('leaves a DOM event offsetY alone', () => {
  // `offsetY` is on every MouseEvent. Renaming it to `mainOffset` silently
  // breaks a consumer's input handling, which is worse than missing one.
  const out = run('canvas.addEventListener("pointermove", (e) => { track(e.offsetY, e.offsetX); });');
  assert.match(out, /e\.offsetY/);
  assert.doesNotMatch(out, /mainOffset/);
});

test('still renames offsetY on a reel', () => {
  assert.match(run('const y = reel.offsetY;'), /reel\.mainOffset/);
  assert.match(run('const y = this._reel.offsetY;'), /_reel\.mainOffset/);
  assert.match(run('const y = reelSet.reels[0].offsetY;'), /\.mainOffset/);
});

test('never matches an Object.prototype member against a rename table', () => {
  // `map[name]` finds `hasOwnProperty` / `toString` / `constructor` on every
  // object literal, so a table lookup used to rename `reel.hasOwnProperty(k)`
  // to a printed function body.
  const src =
    'const s = reel.toString(); const o = reel.hasOwnProperty("a"); const c = reel.constructor; f({ toString: 1 });';
  const { out, reports } = runWith(src);
  assert.equal(out, src);
  assert.equal(reports.length, 0);
});

test('reports every skipped site with a line number', () => {
  const { reports } = runWith('const a = tr.rowIndex;\nconst b = { size: { w: 1, h: 2 } };\n');
  assert.equal(reports.length, 2);
  assert.match(reports[0], /^1:\d+ /);
  assert.match(reports[1], /^2:\d+ /);
});

test('cli runs jscodeshift and prints the skipped-site report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixi-reels-codemod-'));
  try {
    writeFileSync(join(dir, 'a.ts'), 'const y = reel.offsetY;\nconst n = tr.rowIndex;\n');
    const res = spawnSync(process.execPath, [join(HERE, '..', 'bin', 'cli.js'), 'v1-to-v2', dir], {
      encoding: 'utf8',
    });
    assert.equal(res.error, undefined);
    assert.equal(res.status, 0, res.stderr);
    assert.match(readFileSync(join(dir, 'a.ts'), 'utf8'), /reel\.mainOffset/);
    assert.match(readFileSync(join(dir, 'a.ts'), 'utf8'), /tr\.rowIndex/);
    assert.match(res.stdout, /a\.ts:2:\d+/);
    assert.match(res.stdout, /rowIndex/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli rejects an unknown transform', () => {
  const res = spawnSync(process.execPath, [join(HERE, '..', 'bin', 'cli.js'), 'v9-to-v10'], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /unknown transform/);
});
