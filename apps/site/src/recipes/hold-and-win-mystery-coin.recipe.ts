// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, Spine, coinWaves, PIXI, gsap, app
//
// Mystery value coins. Each coin lands as a blank gold disc — its amount is
// unknown. On lock, a strip of candidate values spins inside the coin face
// and decelerates onto the real number, then the amount paints in the gold
// font. The board never reads the value; it lives in `coin.data` and the
// reveal is pure game-layer choreography driven off `coin:locked`.

const COLS = 5, ROWS = 3, CELL = 72, GAP = 6;
const COIN = 'coin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

// -- assets (idempotent across recipe remounts) --
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

// fit the coin at its clean money-face (mini_x) pose
const scaleFor = {};
{
  const probe = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
  probe.state.setAnimation(0, 'mini_x', true);
  try { probe.update(0); } catch {}
  const b = probe.getLocalBounds();
  scaleFor[COIN] = (CELL - 6) / Math.max(1, b.width, b.height);
  probe.destroy();
}

// -- board: gold coins land settled, the value is revealed afterwards --
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => {
    r.register(COIN, GoldCoinSymbol, {
      spineMap: SPINE_MAP,
      idleAnimation: 'idle',
      scale: scaleFor[COIN],
      settleSize: SETTLE_SIZE,
    });
  })
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
const paintLabel = (cell, value) => {
  const p = abs(cell);
  const t = fitGold(goldText(fmt(value), 32), SETTLE_SIZE * 0.84, SETTLE_SIZE * 0.46);
  t.position.set(p.x, p.y);
  labels.addChild(t);
  labelAt.set(`${cell.col},${cell.row}`, t);
  return t;
};

// the candidate amounts that flash past during a reveal (gold font has only
// digits, comma and dot — every entry is a plain number)
const POOL = [1, 2, 5, 10, 15, 20, 25, 50, 75, 100, 200];

// -- the reveal: a true looping value reel inside the coin face. A small set
// of candidate amounts is recycled with a modulo wrap and scrolled like a
// 1-row reel; a single eased tween spins it several whole turns and
// decelerates onto the real value, which is row 0. --
async function revealValue(cell, finalValue) {
  const p = abs(cell);
  const ROW_H = SETTLE_SIZE * 0.52; // one value per window height
  const clip = new PIXI.Graphics()
    .rect(p.x - SETTLE_SIZE / 2, p.y - ROW_H / 2, SETTLE_SIZE, ROW_H)
    .fill(0xffffff);
  const strip = new PIXI.Container();
  strip.mask = clip;
  app.stage.addChild(clip);
  app.stage.addChild(strip);

  // K rows that we recycle; row 0 carries the real value, the rest are decoys
  const K = 8;
  const rows = Array.from({ length: K }, (_, i) => {
    const v = i === 0 ? finalValue : POOL[Math.floor(Math.random() * POOL.length)];
    const t = fitGold(goldText(fmt(v), 30), SETTLE_SIZE * 0.84, ROW_H * 0.82);
    strip.addChild(t);
    return t;
  });
  const TOTAL = K * ROW_H;
  // place every row within ±TOTAL/2 of centre, so a row leaving one edge of
  // the window reappears at the other — an endless strip from K labels
  const wrap = (v) => { const m = ((v % TOTAL) + TOTAL) % TOTAL; return m > TOTAL / 2 ? m - TOTAL : m; };
  const layout = (offset) => rows.forEach((t, i) => { t.x = p.x; t.y = p.y + wrap(i * ROW_H - offset); });
  layout(0);

  // spin TURNS whole revolutions; row 0 (the real value) is centred whenever
  // offset is a multiple of TOTAL, so the eased tween lands exactly on it
  const TURNS = 5;
  const state = { offset: 0 };
  await new Promise((res) => {
    gsap.to(state, {
      offset: TURNS * TOTAL,
      duration: 1.5,
      ease: 'expo.out', // fast blur of digits, long decelerate onto the value
      onUpdate: () => layout(state.offset),
      onComplete: res,
    });
  });

  strip.destroy({ children: true });
  clip.destroy();
  const t = paintLabel(cell, finalValue);
  gsap.fromTo(t.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.22, ease: 'back.out(2)' });
  void board.symbolAt(cell).playWin().catch(() => {}); // the lock flourish "dings"
}

// pendingFx gates the next respin until every reveal has settled
const pendingFx = [];
board.events.on('coin:locked', ({ coin }) => {
  hud.text = `revealing… · held ${board.lockedCoins.length}/${board.capacity}`;
  pendingFx.push(revealValue(coin.cell, coin.data.value));
});
board.events.on('coin:released', ({ coin }) => {
  const k = `${coin.cell.col},${coin.cell.row}`;
  labelAt.get(k)?.destroy();
  labelAt.delete(k);
});

// scripted arrivals — in a real game the server sends each round's hits and
// the per-coin value; here we roll a random value at land time so the reveal
// is genuine every run.
const randVal = () => POOL[Math.floor(Math.random() * POOL.length)];
const ROUNDS = [
  [{ col: 1, row: 1 }, { col: 3, row: 0 }],
  [{ col: 0, row: 2 }, { col: 4, row: 2 }],
  [{ col: 2, row: 1 }],
  [], [],
];

let total = 0;
return {
  cleanup: () => { for (const t of labelAt.values()) { try { gsap.killTweensOf(t.scale); t.destroy(); } catch {} } labelAt.clear(); try { hud.destroy(); labels.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    for (const t of labelAt.values()) { try { gsap.killTweensOf(t.scale); t.destroy(); } catch {} }
    labelAt.clear();
    pendingFx.length = 0;
    total = 0;
    board.reset();
    board.enter([]);
    hud.text = 'mystery coins incoming…';
    await sleep(300);

    for (const cells of ROUNDS) {
      const hits = cells.map((cell) => ({ cell, id: COIN, data: { value: randVal() } }));
      const result = await board.respin(hits);
      await Promise.all(pendingFx.splice(0)); // reveals finish before the next spin
      total = board.lockedCoins.reduce((a, c) => a + (c.data?.value ?? 0), 0);
      hud.text = `held ${board.lockedCoins.length}/${board.capacity} · total ${fmt(total)} · respins ${board.respinsLeft}`;
      await sleep(300);
      if (result.done) break;
    }
    hud.text = `feature over · TOTAL ${fmt(total)} · press spin to replay`;
  },
};
