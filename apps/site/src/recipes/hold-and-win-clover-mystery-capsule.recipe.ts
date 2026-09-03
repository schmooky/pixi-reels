// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSpineSymbol, CloverSymbol, cloverGridBackground, loadHwCloverSpines, CLOVER_SPEED, cloverCellMask, CLOVER_CELL, PIXI, gsap, app
//
// The capsule: a sealed jackpot. It spins past like any other symbol and
// locks like a coin, then between waves the seal breaks - the four jackpot
// titles flick across its face and settle on the tier the server sent,
// the tier's plaque above the board lights, and the amount paints on. The
// symbol's own setBadge / setLabel do the whole reveal; nothing is added to
// the stage per cell.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
const SCALE = CELL.width / CLOVER_CELL.width; // the skeletons are authored at the 202x170 cell
const BET = 1;
const JACKPOTS = { mini: 20, minor: 50, major: 200, grand: 1000 };
const TIERS = ['mini', 'minor', 'major', 'grand'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwCloverSpines(); // atlas + skeletons, plus the sheets for titles and plaques
// The clover glow is drawn past the 202x170 cell: lift these above the cell mask
// at rest (unmask), or every edge of every clover is clipped.
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
class Clover extends CloverSpineSymbol {
  onActivate(id) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick([1, 2, 3, 5]) * BET)); }
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => {
    for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'empty']) r.register(id, Clover, { scale: SCALE });
    r.register('capsule', Clover, { scale: SCALE, font: 'CloverJackpot', labelOffset: 0.26, badgeOffset: -0.14 });
  })
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
  .symbolData(UNMASK)
  // a few px of bounce, not the tall-reel default: a clover cell should settle, not jump
  .speedProfile(CLOVER_SPEED)
  // rounded cells, cut on the frame's own radius
  .cellMask(cloverCellMask)
  .respins(3)
  .lockAnimation('landing')
  .ticker(app.ticker)
  .build();
const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 + 12);
// the game's framing: gradient panel + grid lines in the gaps, behind a chrome-less board
const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
app.stage.addChild(grid);
app.stage.addChild(board.container);

// -- jackpot plaques above the board, one per tier --
const plaques = {};
const rail = new PIXI.Container();
TIERS.forEach((tier, i) => {
  // the plaque is the coloured frame; the tier word is its own small title
  const p = new PIXI.Container();
  const frame = new PIXI.Sprite(art.plaques[tier]);
  const word = new PIXI.Sprite(art.titles[`${tier}_small`]);
  frame.anchor.set(0.5);
  word.anchor.set(0.5);
  p.addChild(frame, word);
  p.x = (i - 1.5) * 150;
  p.alpha = 0.45;
  rail.addChild(p);
  plaques[tier] = p;
});
rail.position.set(app.screen.width / 2, board.container.y - 40);
app.stage.addChild(rail);
const lightPlaque = (tier) => {
  for (const [t, p] of Object.entries(plaques)) gsap.to(p, { alpha: t === tier ? 1 : 0.35, duration: 0.2 });
  gsap.fromTo(plaques[tier].scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2)' });
};

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
app.stage.addChild(hud);

board.events.on('cell:landed', ({ cell, coin }) => {
  if (coin && coin.id === 'gold') board.symbolAt(cell).setLabel(fmt(coin.data.value));
});

// The reveal: cycle the titles fast, slow down, stop on the served tier.
async function reveal(coin) {
  const sym = board.symbolAt(coin.cell);
  const tier = coin.data.tier;
  hud.text = 'a capsule locked - breaking the seal';
  await sleep(300);
  let step = 70;
  for (let i = 0; i < 14; i++) {
    sym.setBadge(art.titles[TIERS[i % TIERS.length]]);
    await sleep(step);
    step += 12;
  }
  sym.setBadge(art.titles[tier]);
  lightPlaque(tier);
  await sym.playWin();
  sym.setLabel(fmt(coin.data.value));
  hud.text = `${tier.toUpperCase()} jackpot: ${fmt(coin.data.value)}`;
  await sleep(600);
}

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick([1, 2, 3, 5]) * BET } });
const capsule = (cell, tier) => ({ cell, id: 'capsule', data: { tier, value: JACKPOTS[tier] * BET } });
const SEED = [{ reel: 1, cell: 2 }, { reel: 3, cell: 0 }].map(gold);
const ROUNDS = [
  [gold({ reel: 0, cell: 0 }), capsule({ reel: 2, cell: 1 }, 'major')],
  [gold({ reel: 4, cell: 2 })],
  [capsule({ reel: 4, cell: 0 }, 'mini')],
  [], [], [],
];

let busy = false;
return {
  cleanup: () => { for (const p of Object.values(plaques)) gsap.killTweensOf(p); try { hud.destroy(); rail.destroy(); } catch {} grid.destroy({ children: true }); board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    for (const p of Object.values(plaques)) p.alpha = 0.45;
    board.enter(SEED);
    for (const c of SEED) { const sym = board.symbolAt(c.cell); sym.setLabel(fmt(c.data.value)); sym.playIdle(); }
    hud.text = 'a capsule locks like a coin; the seal breaks between waves';
    await sleep(400);
    for (const hits of ROUNDS) {
      const res = await board.respin(hits);
      for (const coin of res.hits) if (coin.id === 'capsule') await reveal(coin);
      await sleep(350);
      if (res.done) break;
    }
    await board.playWin();
    const total = board.lockedCoins.reduce((a, c) => a + c.data.value, 0);
    hud.text = `feature over · TOTAL ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
