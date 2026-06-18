// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, Spine, coinWaves, PIXI, gsap, app
//
// Count-up coins. Each coin's amount ticks up from 0.00 to its value as it
// settles, in a left-to-right wave, instead of snapping straight to the
// number. The count is a plain gsap tween over a `{ v }` object that
// rewrites the gold-font label every frame; the value itself lives in
// `coin.data`.

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
  text: 'press spin',
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

// tick a fresh label up from 0 to the coin's value, then settle it to a
// width-fitted final amount
function countUp(cell, value) {
  const k = `${cell.col},${cell.row}`;
  labelAt.get(k)?.destroy();
  const p = abs(cell);
  const t = goldText('0.00', 22);
  t.position.set(p.x, p.y);
  labels.addChild(t);
  labelAt.set(k, t);
  const counter = { v: 0 };
  return new Promise((res) => {
    gsap.to(counter, {
      v: value,
      duration: 0.7,
      ease: 'power1.out',
      onUpdate: () => { if (!t.destroyed) t.text = fmt(counter.v); },
      onComplete: () => {
        if (t.destroyed) { res(); return; }
        t.text = fmt(value);
        fitGold(t, SETTLE_SIZE * 0.84, SETTLE_SIZE * 0.46);
        gsap.fromTo(t.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.18, ease: 'power2.out' });
        res();
      },
    });
  });
}

const randVal = () => [2, 5, 10, 15, 25, 50, 100][Math.floor(Math.random() * 7)];
let busy = false;
return {
  cleanup: () => {
    for (const t of labelAt.values()) { try { gsap.killTweensOf(t.scale); t.destroy(); } catch {} }
    board.destroy();
  },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    for (const t of labelAt.values()) t.destroy();
    labelAt.clear();
    board.reset();

    // a fresh board of coins, values rolled per run
    const coins = [
      { col: 0, row: 0 }, { col: 2, row: 0 }, { col: 4, row: 0 },
      { col: 1, row: 1 }, { col: 3, row: 2 },
    ].map((cell) => ({ cell, id: COIN, data: { value: randVal() } }));
    board.enter(coins);
    hud.text = 'counting up…';

    // each coin counts up as its wave arrives — reading order, one per beat
    for (const wave of coinWaves(coins, 'sequence')) {
      await Promise.all(wave.map((coin) => countUp(coin.cell, coin.data.value)));
    }
    const total = coins.reduce((a, c) => a + c.data.value, 0);
    hud.text = `counted up · total ${fmt(total)} · press spin to re-roll`;
    busy = false;
  },
};
