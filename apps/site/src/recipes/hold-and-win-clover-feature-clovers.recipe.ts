// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, loadHwClover, PIXI, gsap, app
//
// Feature clovers carry no money of their own; each one acts on the gold
// clovers around it when it locks. The board only knows "a coin locked" -
// the game layer reads coin.id and does the mechanic between waves:
//   MULTI    doubles every held amount (a pink x2 on its face)
//   MYSTERY  turns into a gold clover with a revealed amount (setSymbolAt)
//   COLLECT  sums every held amount and shows the total on its face
// The feature ids have weight 0: they only ever land where the server says.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 6, ROW_GAP = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const VALUES = [1, 1.5, 2, 2.5, 3, 5];

const art = await loadHwClover();
// The clover glow is drawn past the 202x170 cell: lift these above the cell mask
// at rest (unmask), or every edge of every clover is clipped.
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery'].map((id) => [id, { unmask: true }]));
class Clover extends CloverSymbol {
  onActivate(id) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick(VALUES))); }
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => {
    for (const id of ['gold', 'mystery', 'empty']) r.register(id, Clover, { art });
    r.register('multi', Clover, { art, font: 'CloverMult', labelOffset: 0.02 });
    r.register('collect', Clover, { art, font: 'CloverJackpot', labelOffset: 0.02 });
  })
  .weights({ gold: 2, empty: 6, multi: 0, mystery: 0, collect: 0 })
  .symbolData(UNMASK)
  .respins(3)
  .lockAnimation('landing')
  .cellChrome((g, w, h) => g.rect(0, 0, w, h).fill({ color: 0x0b1a4a }).stroke({ color: 0x3f6bd8, width: 1, alpha: 0.8 }))
  .ticker(app.ticker)
  .build();
const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 10);
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 10);
app.stage.addChild(hud);

const paint = (coin) => { if (coin.id === 'gold') board.symbolAt(coin.cell).setLabel(fmt(coin.data.value)); };
board.events.on('cell:landed', ({ coin }) => { if (coin) paint(coin); });

const golds = () => board.lockedCoins.filter((c) => c.id === 'gold');
const pulse = (cell) => board.symbolAt(cell).playWin();

// Each feature clover resolves BETWEEN waves, once the awaited respin() is
// back - setSymbolAt and value rewrites are refused while cells are in flight.
async function resolve(coin) {
  const sym = board.symbolAt(coin.cell);
  if (coin.id === 'multi') {
    sym.setLabel('x2');
    await sym.playWin();
    for (const g of golds()) { g.data.value *= 2; paint(g); void pulse(g.cell); }
    hud.text = 'MULTI: every held amount doubled';
  } else if (coin.id === 'mystery') {
    await sym.playWin();
    const value = pick([5, 7, 10]);
    board.setSymbolAt(coin.cell, 'gold', { value }).setLabel(fmt(value));
    hud.text = `MYSTERY revealed ${fmt(value)}`;
  } else if (coin.id === 'collect') {
    const sum = golds().reduce((a, g) => a + g.data.value, 0);
    for (const g of golds()) void pulse(g.cell);
    await sleep(250);
    sym.setLabel(fmt(sum));
    await sym.playWin();
    hud.text = `COLLECT gathered ${fmt(sum)}`;
  }
  await sleep(500);
}

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick(VALUES) } });
const SEED = [{ reel: 0, cell: 1 }, { reel: 4, cell: 0 }].map(gold);
const ROUNDS = [
  [gold({ reel: 2, cell: 2 }), { cell: { reel: 1, cell: 0 }, id: 'multi', data: { value: 0 } }],
  [{ cell: { reel: 3, cell: 1 }, id: 'mystery', data: { value: 0 } }],
  [gold({ reel: 2, cell: 0 })],
  [{ cell: { reel: 4, cell: 2 }, id: 'collect', data: { value: 0 } }],
  [], [], [],
];

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) paint(c);
    hud.text = 'gold locks with money; feature clovers act on it';
    await sleep(400);
    for (const hits of ROUNDS) {
      const res = await board.respin(hits);
      for (const coin of res.hits) if (coin.id !== 'gold') await resolve(coin);
      await sleep(350);
      if (res.done) break;
    }
    await board.playWin(golds().map((g) => g.cell));
    const total = golds().reduce((a, g) => a + g.data.value, 0);
    hud.text = `feature over · gold total ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
