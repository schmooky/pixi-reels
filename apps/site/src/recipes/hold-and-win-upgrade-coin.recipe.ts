// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, Spine, PIXI, gsap, app
//
// Value upgrade in place. The board opens holding three 5.00 coins. Each
// press bumps every held coin up the value ladder (5 → 10 → 25 → 50 → 100)
// with a flip-and-pop flourish — the coin never re-spins and the cell never
// moves. The new tier lives in `coin.data`; the board is untouched, the
// label is just repainted from the data.

const COLS = 5, ROWS = 3, CELL = 72, GAP = 6;
const COIN = 'coin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const ASSETS = {
  'hw-atlas': '/hw-spine/skeletons.atlas',
  'hw-goldfont': '/hw-spine/goldfont.fnt',
  'hw-jackpot': '/hw-spine/jackpot.json',
};
for (const [alias, src] of Object.entries(ASSETS)) {
  if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} }
}
await PIXI.Assets.load(Object.keys(ASSETS));

const goldText = (text, size) => {
  const t = new PIXI.BitmapText({ text, style: { fontFamily: 'GoldDigits', fontSize: size, letterSpacing: -1 } });
  t.anchor.set(0.5);
  return t;
};

const SETTLE_SIZE = CELL - 10;
const SPINE_MAP = { [COIN]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' } };

const scaleFor = {};
{
  const probe = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
  probe.state.setAnimation(0, 'mini_x', true);
  try { probe.update(0); } catch {}
  const b = probe.getLocalBounds();
  scaleFor[COIN] = (CELL - 6) / Math.max(1, b.width, b.height);
  probe.destroy();
}

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => r.register(COIN, GoldCoinSymbol, {
    spineMap: SPINE_MAP, idleAnimation: 'idle', scale: scaleFor[COIN], settleSize: SETTLE_SIZE,
  }))
  .weights({ [COIN]: 1, empty: 3 })
  .respins(3)
  .cellChrome((g, size) => {
    g.roundRect(0, 0, size, size, 10)
      .fill({ color: 0xfaf6ef, alpha: 0.6 })
      .stroke({ color: 0xe5dccf, width: 1, alpha: 0.8 });
  })
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 6;
app.stage.addChild(board.container);

const hud = new PIXI.Text({
  text: 'press spin to upgrade every coin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);

const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => {
  const c = board.cellCenter(cell);
  return { x: board.container.x + c.x, y: board.container.y + c.y };
};
const fitGold = (t, maxW, maxH) => {
  if (t.width > 0 && t.height > 0) {
    const k = Math.min(maxW / t.width, maxH / t.height);
    t.style.fontSize = Math.max(8, Math.floor(t.style.fontSize * k));
  }
  return t;
};
const paintLabel = (cell, value) => {
  const k = `${cell.col},${cell.row}`;
  labelAt.get(k)?.destroy();
  const p = abs(cell);
  const t = fitGold(goldText(fmt(value), 32), SETTLE_SIZE * 0.84, SETTLE_SIZE * 0.46);
  t.position.set(p.x, p.y);
  labels.addChild(t);
  labelAt.set(k, t);
  return t;
};

// the value ladder — each press promotes a coin to the next rung
const LADDER = [5, 10, 25, 50, 100];
const nextTier = (v) => LADDER[Math.min(LADDER.length - 1, LADDER.indexOf(v) + 1)];
const totalOf = () => board.lockedCoins.reduce((a, c) => a + (c.data?.value ?? 0), 0);

const SEED = [
  { cell: { col: 0, row: 1 }, id: COIN, data: { value: 5 } },
  { cell: { col: 2, row: 0 }, id: COIN, data: { value: 5 } },
  { cell: { col: 3, row: 2 }, id: COIN, data: { value: 5 } },
];
const seedBoard = () => {
  SEED.forEach((c) => { c.data.value = 5; });
  board.enter(SEED);
  for (const coin of SEED) paintLabel(coin.cell, coin.data.value);
  hud.text = `held 3 · total ${fmt(totalOf())} · press spin to upgrade`;
};
seedBoard();

// upgrade one coin in place: bump data, flip the coin, repaint the label
async function upgradeCoin(coin) {
  const before = coin.data.value;
  const after = nextTier(before);
  if (after === before) return false;
  coin.data.value = after;                                  // game state owns the value
  // the skeleton's own one-turn flourish reads as the coin flipping over
  void board.symbolAt(coin.cell).playWin?.().catch?.(() => {});
  const k = `${coin.cell.col},${coin.cell.row}`;
  const old = labelAt.get(k);
  if (old) await new Promise((res) => gsap.to(old.scale, { x: 0, y: 1.2, duration: 0.14, ease: 'power2.in', onComplete: res }));
  const t = paintLabel(coin.cell, after);                   // repaint from data
  t.scale.set(0, 1.2);
  await new Promise((res) => gsap.to(t.scale, { x: 1, y: 1, duration: 0.22, ease: 'back.out(2.2)', onComplete: res }));
  return true;
}

let busy = false;
return {
  cleanup: () => { for (const t of labelAt.values()) { try { gsap.killTweensOf(t.scale); t.destroy(); } catch {} } labelAt.clear(); try { hud.destroy(); labels.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    const maxed = board.lockedCoins.every((c) => c.data.value === LADDER[LADDER.length - 1]);
    if (maxed) {
      for (const t of labelAt.values()) { try { gsap.killTweensOf(t.scale); t.destroy(); } catch {} }
      labelAt.clear();
      board.reset();
      seedBoard();
      busy = false;
      return;
    }
    hud.text = 'upgrading…';
    // promote each held coin one rung, left-to-right
    const ordered = [...board.lockedCoins].sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col);
    for (const coin of ordered) { await upgradeCoin(coin); await sleep(90); }
    const top = board.lockedCoins.every((c) => c.data.value === LADDER[LADDER.length - 1]);
    hud.text = top
      ? `maxed · total ${fmt(totalOf())} · press spin to reset`
      : `upgraded · total ${fmt(totalOf())} · press spin again`;
    busy = false;
  },
};
