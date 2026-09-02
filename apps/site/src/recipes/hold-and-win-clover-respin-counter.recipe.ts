// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, loadHwClover, PIXI, gsap, app
//
// The respin counter. Three lamps under the board: all lit when the feature
// arms, one goes dark per miss, every hit relights them all. It is driven by
// one event, `respins:changed`, whose `reason` says why the number moved -
// seed, hit-reset or miss - so the lamps can pop on a reset and dim on a miss
// without the game re-deriving any of it.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 6, ROW_GAP = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwClover();
class Clover extends CloverSymbol {
  onActivate(id) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick([1, 2, 3, 5]))); }
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => { for (const id of ['gold', 'empty']) r.register(id, Clover, { art }); })
  .weights({ gold: 2, empty: 6 })
  .respins(3)
  .lockAnimation('landing')
  .cellChrome((g, w, h) => g.rect(0, 0, w, h).fill({ color: 0x0b1a4a }).stroke({ color: 0x3f6bd8, width: 1, alpha: 0.8 }))
  .ticker(app.ticker)
  .build();
const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 24);
app.stage.addChild(board.container);

// -- the counter --
const counter = new PIXI.Container();
const lamps = [];
for (let i = 0; i < 3; i++) {
  const lamp = new PIXI.Container();
  const bg = new PIXI.Graphics();
  const digit = new PIXI.BitmapText({ text: String(i + 1), style: { fontFamily: 'CloverValue', fontSize: 24 } });
  digit.anchor.set(0.5);
  lamp.addChild(bg, digit);
  lamp.x = i * 60;
  counter.addChild(lamp);
  lamps.push({ lamp, bg, digit });
}
const paint = (left) => {
  lamps.forEach(({ bg, digit }, i) => {
    const lit = i < left;
    bg.clear().roundRect(-27, -15, 54, 30, 5).fill({ color: lit ? 0xf5b400 : 0x0b1a4a }).stroke({ color: lit ? 0xffe27a : 0x3f6bd8, width: 1 });
    digit.alpha = lit ? 1 : 0.4;
  });
};
counter.position.set(app.screen.width / 2 - 60, board.container.y + boardH + 26);
app.stage.addChild(counter);
paint(0);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, counter.y + 24);
app.stage.addChild(hud);

board.events.on('respins:changed', ({ value, reason }) => {
  paint(value);
  if (reason === 'seed') hud.text = `armed: ${value} respins`;
  else if (reason === 'hit-reset') {
    hud.text = `hit - counter back to ${value}`;
    for (const { lamp } of lamps) gsap.fromTo(lamp.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' });
  } else {
    hud.text = `miss - ${value} left`;
    const { lamp } = lamps[value];
    gsap.fromTo(lamp, { alpha: 0.2 }, { alpha: 1, duration: 0.4 });
  }
});
board.events.on('cell:landed', ({ cell, coin }) => { if (coin) board.symbolAt(cell).setLabel(fmt(coin.data.value)); });

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick([1, 2, 3, 5]) } });
const SEED = [{ reel: 1, cell: 1 }, { reel: 3, cell: 1 }].map(gold);
// two misses, a hit (relight), then three misses to the end
const ROUNDS = [[], [], [{ reel: 0, cell: 2 }], [], [], []];

let busy = false;
return {
  cleanup: () => { for (const { lamp } of lamps) gsap.killTweensOf(lamp); try { hud.destroy(); counter.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    board.enter(SEED);
    for (const c of SEED) board.symbolAt(c.cell).setLabel(fmt(c.data.value));
    await sleep(500);
    for (const cells of ROUNDS) {
      const res = await board.respin(cells.map(gold));
      await sleep(600);
      if (res.done) break;
    }
    hud.text = `counter ran out · ${board.lockedCoins.length} held · press spin to replay`;
    busy = false;
  },
};
