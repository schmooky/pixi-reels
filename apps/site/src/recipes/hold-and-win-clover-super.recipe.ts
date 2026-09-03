// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, loadHwClover, PIXI, gsap, app
//
// The crystal SUPER clover and the jackpot rails. Four plaques sit beside the
// board the way the game frames its reels - MINI and MINOR on the left,
// MAJOR and GRAND on the right. When the SUPER clover locks it flares, wears
// the GRAND title, and setSymbolAt turns it into a gold clover worth the
// GRAND amount in place: the ledger is rewritten, no other cell moves.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 6, ROW_GAP = 0;
const BET = 1;
const GRAND = 1000 * BET;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwClover();
// The clover glow is drawn past the 202x170 cell: lift these above the cell mask
// at rest (unmask), or every edge of every clover is clipped.
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
class Clover extends CloverSymbol {
  onActivate(id) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick([1, 2, 3, 5]) * BET)); }
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
  .symbols((r) => {
    for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { art });
  })
  .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
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

// -- side rails: plaques turned on end, hugging the board like the source frame --
const rails = new PIXI.Container();
const plaques = {};
const rail = (tier, side, slot) => {
  const p = new PIXI.Container();
  const frame = new PIXI.Sprite(art.plaques[tier]);
  const word = new PIXI.Sprite(art.titles[`${tier}_small`]);
  frame.anchor.set(0.5);
  word.anchor.set(0.5);
  p.addChild(frame, word);
  p.rotation = side < 0 ? -Math.PI / 2 : Math.PI / 2;
  p.scale.set(0.9);
  p.x = board.container.x + (side < 0 ? -24 : boardW + 24);
  p.y = board.container.y + boardH * (slot === 0 ? 0.28 : 0.72);
  p.alpha = 0.55;
  rails.addChild(p);
  plaques[tier] = p;
};
rail('mini', -1, 1); rail('minor', -1, 0); rail('major', 1, 1); rail('grand', 1, 0);
app.stage.addChild(rails);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 10);
app.stage.addChild(hud);

board.events.on('cell:landed', ({ cell, coin }) => {
  if (coin && coin.id === 'gold') board.symbolAt(cell).setLabel(fmt(coin.data.value));
});

async function resolveSuper(coin) {
  const sym = board.symbolAt(coin.cell);
  hud.text = 'SUPER clover locked';
  // flare: a white-hot pulse on the crystal
  await new Promise((res) => gsap.timeline({ onComplete: res })
    .to(sym.sprite, { alpha: 0.35, duration: 0.09, yoyo: true, repeat: 5 }));
  sym.setBadge(art.titles.grand);
  gsap.to(plaques.grand, { alpha: 1, duration: 0.2 });
  gsap.fromTo(plaques.grand.scale, { x: 1.3, y: 1.3 }, { x: 0.9, y: 0.9, duration: 0.5, ease: 'back.out(2)' });
  await sym.playWin();
  await sleep(350);
  // in place: same cell, new identity, ledger rewritten
  board.setSymbolAt(coin.cell, 'gold', { value: GRAND }).setLabel(fmt(GRAND));
  hud.text = `GRAND ${fmt(GRAND)} sits on the board as a gold clover`;
  await sleep(500);
}

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick([1, 2, 3, 5]) * BET } });
const SEED = [{ reel: 0, cell: 0 }, { reel: 3, cell: 2 }].map(gold);
const ROUNDS = [
  [gold({ reel: 4, cell: 1 })],
  [{ cell: { reel: 2, cell: 1 }, id: 'super', data: { value: 0 } }],
  [gold({ reel: 1, cell: 2 })],
  [], [], [],
];

let busy = false;
return {
  cleanup: () => { for (const p of Object.values(plaques)) gsap.killTweensOf(p); try { hud.destroy(); rails.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    for (const p of Object.values(plaques)) { p.alpha = 0.55; p.scale.set(0.9); }
    board.enter(SEED);
    for (const c of SEED) board.symbolAt(c.cell).setLabel(fmt(c.data.value));
    hud.text = 'the SUPER clover lands where the server puts it';
    await sleep(400);
    for (const hits of ROUNDS) {
      const res = await board.respin(hits);
      for (const coin of res.hits) if (coin.id === 'super') await resolveSuper(coin);
      await sleep(350);
      if (res.done) break;
    }
    await board.playWin();
    const total = board.lockedCoins.reduce((a, c) => a + c.data.value, 0);
    hud.text = `feature over · TOTAL ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
