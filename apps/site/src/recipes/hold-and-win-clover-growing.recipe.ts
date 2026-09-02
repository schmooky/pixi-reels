// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, loadHwClover, PIXI, gsap, app
//
// A board that grows. It is built 5x5, but the top and bottom rows start
// dormant - `inactive(cells, 'sealed')` draws them as the purple sealed tile
// and keeps them out of the feature: they never spin and do not count toward
// the full board. Locking enough clovers opens a row with `board.activate()`,
// and the next respin spins it with the rest.

const COLS = 5, ROWS = 5;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 6, ROW_GAP = 0;
const BET = 1;
const OPEN_TOP_AT = 5, OPEN_BOTTOM_AT = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwClover();
const STRIP_VALUES = [1, 1, 1.5, 2, 2.5, 3, 5, 7, 10];
class Clover extends CloverSymbol {
  onActivate(id) {
    super.onActivate(id);
    if (id === 'gold') this.setLabel(fmt(pick(STRIP_VALUES) * BET));
  }
}

const row = (r) => Array.from({ length: COLS }, (_, reel) => ({ reel, cell: r }));
const TOP = row(0), BOTTOM = row(ROWS - 1);

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => { for (const id of ['gold', 'empty', 'sealed']) r.register(id, Clover, { art }); })
  .weights({ gold: 2, empty: 6, sealed: 0 })
  // dormant rows wear the sealed tile until activate() wakes them
  .inactive([...TOP, ...BOTTOM], 'sealed')
  .respins(3)
  .lockAnimation('landing')
  .cellChrome((g, w, h) => g.rect(0, 0, w, h).fill({ color: 0x0b1a4a }).stroke({ color: 0x3f6bd8, width: 1, alpha: 0.8 }))
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 10);
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: `press spin · rows open at ${OPEN_TOP_AT} and ${OPEN_BOTTOM_AT} clovers`, style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 10);
app.stage.addChild(hud);

board.events.on('cell:landed', ({ cell, coin }) => {
  if (coin) board.symbolAt(cell).setLabel(fmt(coin.data.value));
});
board.events.on('cells:activated', ({ cells, capacity }) => {
  hud.text = `row opened · board is now ${capacity} cells`;
  // the woken cells show the empty tile now; fade them in from the sealed look
  for (const cell of cells) {
    const s = board.symbolAt(cell).sprite;
    gsap.fromTo(s, { alpha: 0.2 }, { alpha: 1, duration: 0.5, ease: 'power2.out' });
  }
});

// Between waves: open a row once enough clovers are held. Never inside an
// event listener - activate() is refused while a wave is in flight.
let topOpen = false, bottomOpen = false;
function maybeGrow() {
  const held = board.lockedCoins.length;
  if (!topOpen && held >= OPEN_TOP_AT) { topOpen = true; board.activate(TOP); return true; }
  if (!bottomOpen && held >= OPEN_BOTTOM_AT) { bottomOpen = true; board.activate(BOTTOM); return true; }
  return false;
}

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick(STRIP_VALUES) * BET } });
const SEED = [{ reel: 0, cell: 2 }, { reel: 2, cell: 1 }, { reel: 4, cell: 3 }].map(gold);
const ROUNDS = [
  [{ reel: 1, cell: 3 }, { reel: 3, cell: 2 }],        // 5 held -> top row opens
  [{ reel: 2, cell: 0 }, { reel: 4, cell: 0 }],        // the new row takes coins
  [{ reel: 0, cell: 1 }],                              // 8 held -> bottom row opens
  [{ reel: 3, cell: 4 }, { reel: 1, cell: 4 }],
  [], [], [],
];

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    topOpen = false; bottomOpen = false;
    board.reset(); // sealed rows come back
    board.enter(SEED);
    for (const c of SEED) board.symbolAt(c.cell).setLabel(fmt(c.data.value));
    hud.text = `${SEED.length}/${board.capacity} held on the ${board.capacity}-cell board`;
    await sleep(400);
    for (const cells of ROUNDS) {
      const res = await board.respin(cells.map(gold));
      await sleep(350);
      if (res.done) break;
      if (maybeGrow()) await sleep(600);
    }
    await board.playWin();
    const total = board.lockedCoins.reduce((a, c) => a + c.data.value, 0);
    hud.text = `feature over · ${board.lockedCoins.length}/${board.capacity} · TOTAL ${fmt(total)}`;
    busy = false;
  },
};
