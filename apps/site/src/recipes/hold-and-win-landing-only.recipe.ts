// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, loadHwClover, CLOVER_CELL, PIXI, gsap, app
//
// Landing only. By default the board plays a coin's win animation the moment
// it locks; most productions want just a land beat there and one celebration
// once the board is decided. `lockAnimation('landing')` makes every lock play
// `playLanding()` (a settle) and nothing else; the game calls
// `board.playWin()` itself when the feature ends.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const art = await loadHwClover();
// The clover glow is drawn past the 202x170 cell: lift these above the cell mask
// at rest (unmask), or every edge of every clover is clipped.
const UNMASK = Object.fromEntries(['gold'].map((id) => [id, { unmask: true }]));

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: 6, rowGap: 0 })
  .symbols((r) => {
    for (const id of ['gold', 'cherry', 'orange', 'grapes', 'empty']) r.register(id, CloverSymbol, { art });
  })
  .weights({ gold: 2, cherry: 2, orange: 2, grapes: 2, empty: 5 })
  .symbolData(UNMASK)
  .respins(3)
  // 'win' (default) | 'landing' | 'none'
  .lockAnimation('landing')
  .cellChrome((g, w, h) => {
    g.rect(0, 0, w, h).fill({ color: 0x0b1a4a, alpha: 0.9 }).stroke({ color: 0x3f6bd8, width: 1, alpha: 0.8 });
  })
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL.width + 4 * 6;
const boardH = ROWS * CELL.height;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 8);
app.stage.addChild(board.container);

const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 10);
app.stage.addChild(hud);

let landed = 0;
board.events.on('cell:landed', ({ cell, coin }) => {
  if (!coin) return;
  landed += 1;
  board.symbolAt(cell).setLabel(fmt(coin.data.value));
  hud.text = `coin ${landed} landed · settle only, no win`;
});

const VALUES = [1, 2, 2.5, 3, 5, 7];
const pick = () => VALUES[Math.floor(Math.random() * VALUES.length)];
const SEED = [
  { cell: { reel: 1, cell: 1 }, id: 'gold', data: { value: 3 } },
  { cell: { reel: 3, cell: 2 }, id: 'gold', data: { value: 1 } },
];
const ROUNDS = [[{ reel: 0, cell: 0 }, { reel: 4, cell: 0 }], [{ reel: 2, cell: 1 }], [{ reel: 4, cell: 2 }], [], [], []];

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    landed = 0;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) board.symbolAt(c.cell).setLabel(fmt(c.data.value));
    await sleep(350);
    for (const cells of ROUNDS) {
      const result = await board.respin(cells.map((cell) => ({ cell, id: 'gold', data: { value: pick() } })));
      await sleep(350);
      if (result.done) break;
    }
    // The one explicit celebration: every locked coin pulses together.
    hud.text = 'feature over · board.playWin() on every locked coin';
    await board.playWin();
    const total = board.lockedCoins.reduce((a, c) => a + c.data.value, 0);
    hud.text = `TOTAL ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
