// @ts-nocheck
// Injected: HoldAndWinBuilder, AnimatedSpriteSymbol, BlurSpriteSymbol,
//           loadHoldAndWinSprites, app, DebugPlaque
//
// The lifecycle, made visible. A small board runs a full feature while every
// `board.events` beat prints to a live log on the right - feature:enter, respin:start,
// cell:landed, coin:locked, respins:changed, respin:end, board:full / feature:end.
// This is the companion to the Hold & Win guide: watch the state machine instead
// of imagining it. The board is a plain HoldAndWinBuilder board; nothing here
// touches its internals - it only listens.

const COLS = 4, ROWS = 3, CELL = 60, GAP = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { symbols, blur, coin } = await loadHoldAndWinSprites();
const BASE = ['1', '2', '3', '4', '5', '6', '7', '8'];

class BlurCell extends BlurSpriteSymbol {
  onReelSpinStart() { this.setBlurred(true); }
  onReelLanded() { this.setBlurred(false); }
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => {
    for (const id of BASE) r.register(id, BlurCell, { textures: symbols, blurTextures: blur });
    r.register('coin', AnimatedSpriteSymbol, { frames: { coin }, animationSpeed: 0.6, anchor: { x: 0.5, y: 0.5 } });
  })
  .weights({ ...Object.fromEntries(BASE.map((id) => [id, 2])), coin: 2, empty: 7 })
  .respins(3)
  .cellChrome((g, s) => {
    g.roundRect(0, 0, s, s, 8).fill({ color: 0x140f2e, alpha: 0.55 }).stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 });
  })
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = 26;
board.container.y = (app.screen.height - boardH) / 2;
app.stage.addChild(board.container);

// ── the live event log ────────────────────────────────────────────────
// One plaque, one colored row per event, newest at the bottom. The runner
// fits the stage once, at setup, so the log starts at its final size: MAX
// rows reserved, and wide enough for the longest line (feature:end after ten
// or more rounds, 40 characters).
const COLORS = {
  'feature:enter': 0x8be9fd, 'respin:start': 0x9c8f78, 'cell:landed': 0x726a8c,
  'coin:locked': 0x50fa7b, 'respins:changed': 0xf1fa8c, 'respin:end': 0x9c8f78,
  'board:full': 0xffb86c, 'feature:end': 0xff79c6, 'coin:released': 0xbd93f9,
  'feature:reset': 0x6272a4, 'feature:skip': 0xff5555,
};
const MAX = 16;
const log = new DebugPlaque({ title: 'board.events →', accent: 0xb9aee8, fontSize: 12, rows: [' '.repeat(40)], reserveRows: MAX });
log.update({ minWidth: log.plateWidth }); // a 40-character row, measured once
log.position.set(board.container.x + boardW + 30, 14);
app.stage.addChild(log);
const lines = [];
const render = () => log.setRows(lines);
render();
function push(evt, detail) {
  lines.push({ text: `${evt}  ${detail}`, color: COLORS[evt] ?? 0xcccccc });
  if (lines.length > MAX) lines.shift();
  render();
}
const cc = (c) => `(${c.reel},${c.cell})`;

board.events.on('feature:enter', ({ seed, respins }) => push('feature:enter', `${seed.length} seed · respins ${respins}`));
board.events.on('respin:start', ({ round, spinning }) => push('respin:start', `round ${round} · ${spinning.length} spinning`));
board.events.on('cell:landed', ({ cell, coin }) => push('cell:landed', `${cc(cell)} ${coin ? 'COIN' : '—'}`));
board.events.on('coin:locked', ({ locked, capacity }) => push('coin:locked', `${locked}/${capacity}`));
board.events.on('respins:changed', ({ value, reason }) => push('respins:changed', `${value} (${reason})`));
board.events.on('respin:end', ({ round, hits, respinsLeft }) => push('respin:end', `round ${round} · +${hits.length} · ${respinsLeft} left`));
board.events.on('board:full', () => push('board:full', 'every cell locked'));
board.events.on('feature:end', ({ rounds, full }) => push('feature:end', `${rounds} rounds · ${full ? 'BOARD FULL' : 'no respins left'}`));
board.events.on('coin:released', ({ remaining }) => push('coin:released', `${remaining} left`));
board.events.on('feature:reset', ({ clearedCoins }) => push('feature:reset', `cleared ${clearedCoins}`));
board.events.on('feature:skip', ({ inFlight }) => push('feature:skip', `${inFlight} slammed`));

const hud = new DebugPlaque({ text: 'press spin to run a feature', fontSize: 12, anchor: { x: 0, y: 1 }, minWidth: boardW });
hud.position.set(board.container.x, app.screen.height - 6);
app.stage.addChild(hud);

// Mock server: each free cell has a ~28% chance of landing a coin this wave.
function pickHits() {
  const hits = [];
  for (const cell of board.freeCells) {
    if (Math.random() < 0.28) hits.push({ cell, id: 'coin', data: { value: [1, 2, 5, 10][Math.floor(Math.random() * 4)] } });
  }
  return hits;
}

let running = false;
return {
  board,
  cleanup: () => { lines.length = 0; try { log.destroy({ children: true }); hud.destroy({ children: true }); } catch {} board.destroy(); },
  onSpin: async () => {
    if (running) return;
    running = true;
    lines.length = 0; render();
    board.reset(); // → feature:reset, the first line of every run
    await sleep(150);
    board.enter([{ cell: { reel: 0, cell: 0 }, id: 'coin', data: { value: 5 } }]);
    hud.text = 'running the respin loop…';
    while (true) {
      await sleep(440);
      const res = await board.respin(pickHits()); // the board animates the wave
      if (res.done) break; // full, or out of respins
    }
    hud.text = 'feature:end reached — press spin to run again';
    running = false;
  },
};
