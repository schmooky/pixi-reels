// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, Spine, PIXI, gsap, app
//
// Last-cell anticipation. The board's `anticipateWhen(...)` predicate flips
// every still-spinning cell to a drawn-out tension profile when only one
// cell is left to fill — the "one more for the full-board jackpot" moment.
// The whole feature is one builder knob; the recipe only listens to events.

const COLS = 4, ROWS = 3, CELL = 76, GAP = 6;
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

// the source game's anticipation glow FX (sprite frames): a build-up `in`
// burst that hands off to a sustained `loop` while the last cell spins
const antSheet = await PIXI.Assets.load('/hw-sprites/anticipation.json');
const antFrames = (pre) => Object.entries(antSheet.textures).filter(([k]) => k.startsWith(pre)).sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t);
const ANT_IN = antFrames('in/'), ANT_LOOP = antFrames('loop/');

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

// The single knob: when capacity - locked === 1, the last spinning cell runs
// the 'tension' profile (the builder slows it by ~1.1s on top of the base).
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => r.register(COIN, GoldCoinSymbol, {
    spineMap: SPINE_MAP, idleAnimation: 'idle', scale: scaleFor[COIN], settleSize: SETTLE_SIZE,
  }))
  .weights({ [COIN]: 1, empty: 3 })
  .respins(4)
  .anticipateWhen(({ locked, capacity }) => capacity - locked === 1)
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
  text: 'press spin · fill the board for the jackpot',
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

// the real anticipation glow over the last cell: play `in` once, then hold on `loop`
let pulse = null;
const startPulse = (cell) => {
  stopPulse();
  const p = abs(cell);
  pulse = new PIXI.AnimatedSprite(ANT_IN.length ? ANT_IN : ANT_LOOP);
  pulse.anchor.set(0.5);
  pulse.position.set(p.x, p.y);
  pulse.width = pulse.height = CELL * 1.9; // the glow spills past the cell
  pulse.blendMode = 'add';                 // additive: reads as a glow, not a sticker
  pulse.animationSpeed = 0.5;
  pulse.loop = false;
  pulse.onComplete = () => { if (pulse && ANT_LOOP.length) { pulse.textures = ANT_LOOP; pulse.loop = true; pulse.play(); } };
  app.stage.addChild(pulse);
  pulse.play();
};
const stopPulse = () => { if (pulse) { try { pulse.destroy(); } catch {} pulse = null; } };

board.events.on('respin:start', ({ spinning }) => {
  if (board.capacity - board.lockedCoins.length === 1 && spinning.length === 1) {
    hud.text = '1 TO FILL — anticipation!';
    startPulse(spinning[0]);
  } else {
    hud.text = `respin · held ${board.lockedCoins.length}/${board.capacity}`;
  }
});
board.events.on('coin:locked', ({ coin }) => { paintLabel(coin.cell, coin.data?.value ?? 0); });
board.events.on('cell:landed', () => { stopPulse(); });

// Scripted fill: seed two, then land coins until a single empty cell remains,
// then land into it under anticipation. A real server decides each round.
const SEED = [
  { cell: { col: 0, row: 0 }, id: COIN, data: { value: 5 } },
  { cell: { col: 3, row: 2 }, id: COIN, data: { value: 10 } },
];
const FILL = [
  [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }],
  [{ col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }],
  [{ col: 0, row: 2 }, { col: 1, row: 2 }],
  [{ col: 2, row: 2 }], // the last cell — lands under anticipation
];
const val = () => [5, 10, 15, 25][Math.floor(Math.random() * 4)];

let busy = false;
return {
  cleanup: () => { stopPulse(); for (const t of labelAt.values()) { try { t.destroy(); } catch {} } labelAt.clear(); try { hud.destroy(); labels.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    for (const t of labelAt.values()) t.destroy();
    labelAt.clear();
    board.reset();
    board.enter(SEED);
    for (const coin of SEED) paintLabel(coin.cell, coin.data.value);
    await sleep(300);

    for (const cells of FILL) {
      const hits = cells.map((cell) => ({ cell, id: COIN, data: { value: val() } }));
      const result = await board.respin(hits);
      await sleep(350);
      if (result.done) break;
    }
    stopPulse();
    hud.text = board.isFull
      ? 'BOARD FULL — jackpot! · press spin to replay'
      : 'feature over · press spin to replay';
    busy = false;
  },
};
