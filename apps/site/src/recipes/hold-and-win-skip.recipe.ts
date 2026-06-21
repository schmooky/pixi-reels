// @ts-nocheck
// Injected: HoldAndWinBuilder, AnimatedSpriteSymbol, loadHoldAndWinSprites, bezierFly, coinWaves, PIXI, gsap, app
//
// One skip fast-forwards everything, then one event says "done".
//
// `board.skip()` slams every in-flight cell to its landed position and fires
// `feature:skip`; the game layer listens and cuts its own flights / collect
// short. The normal `feature:end` event still fires as the single "feature
// over" signal. Press Run, then tap the button again mid-feature to skip.

const COIN = 'coin', CELL = 70, GAP = 6, COLS = 5, ROWS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const { coin } = await loadHoldAndWinSprites();
const valueText = (text, size) => { const t = new PIXI.BitmapText({ text, style: { fontFamily: 'DiamondDigits', fontSize: size } }); t.anchor.set(0.5); return t; };

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => r.register(COIN, AnimatedSpriteSymbol, { frames: { [COIN]: coin }, animationSpeed: 0.6, anchor: { x: 0.5, y: 0.5 } }))
  .weights({ [COIN]: 1, empty: 3 })
  .respins(3)
  .cellChrome((g, size) => g.roundRect(0, 0, size, size, 10).fill({ color: 0x140f2e, alpha: 0.55 }).stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 }))
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP, boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = 96;
app.stage.addChild(board.container);

const meter = { x: app.screen.width / 2, y: 50 };
const meterText = valueText('0.00', 26);
meterText.position.set(meter.x, meter.y);
app.stage.addChild(meterText);

const hud = new PIXI.Text({ text: 'press spin · then tap again to SKIP', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);

const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => { const c = board.cellCenter(cell); return { x: board.container.x + c.x, y: board.container.y + c.y }; };
const fit = (t, w, h) => { if (t.width > 0) t.scale.set(Math.min(w / t.width, h / t.height, 1)); return t; };
const paintLabel = (cell, value) => { const k = `${cell.col},${cell.row}`; labelAt.get(k)?.destroy(); const p = abs(cell); const t = fit(valueText(fmt(value), 30), CELL * 0.82, CELL * 0.46); t.position.set(p.x, p.y); labels.addChild(t); labelAt.set(k, t); };
board.events.on('coin:locked', ({ coin }) => paintLabel(coin.cell, coin.data?.value ?? 0));

let skipping = false;
board.events.on('feature:skip', () => { hud.text = 'SKIP — fast-forwarding'; });   // board slammed the spins
board.events.on('feature:end', () => { /* the single "feature over" signal */ });

const gate = (ms) => (skipping ? Promise.resolve() : sleep(ms));
const val = () => [5, 10, 25, 50, 100][Math.floor(Math.random() * 5)];
const SEED = [{ cell: { col: 1, row: 1 }, id: COIN, data: { value: 10 } }, { cell: { col: 3, row: 2 }, id: COIN, data: { value: 25 } }];
const ROUNDS = [[{ col: 0, row: 0 }, { col: 4, row: 1 }], [{ col: 2, row: 0 }], [{ col: 1, row: 2 }], []];

const flyers = new Set();
let total = 0;
async function collect() {
  for (const wave of coinWaves(board.lockedCoins, 'by-col')) {
    for (const c of wave) {
      const add = () => { total += c.data?.value ?? 0; meterText.text = fmt(total); };
      if (skipping) { board.release([c.cell]); labelAt.get(`${c.cell.col},${c.cell.row}`)?.destroy(); add(); continue; }
      const from = abs(c.cell);
      const clone = fit(valueText(fmt(c.data.value), 30), CELL * 0.82, CELL * 0.46);
      clone.position.set(from.x, from.y);
      app.stage.addChild(clone); flyers.add(clone);
      labelAt.get(`${c.cell.col},${c.cell.row}`)?.destroy();
      board.release([c.cell]);
      bezierFly(clone, from, meter, { lean: 'up', arriveScale: 0.35, duration: 0.5 }).then(() => { try { clone.destroy(); } catch {} flyers.delete(clone); add(); });
    }
    await gate(120);
  }
  await gate(400);
}

let running = false;
return {
  cleanup: () => { for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy(); } catch {} } flyers.clear(); for (const t of labelAt.values()) { try { t.destroy(); } catch {} } labelAt.clear(); try { meterText.destroy(); hud.destroy(); labels.destroy({ children: false }); } catch {} board.destroy(); },
  // RecipeRunner calls onSkip when the button is tapped mid-feature
  onSkip: () => {
    if (!running || skipping) return;
    skipping = true;
    board.skip();                              // slam every in-flight spin + fire feature:skip
    for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy(); } catch {} } // cut flights short
    flyers.clear();
  },
  onSpin: async () => {
    if (running) return;
    running = true; skipping = false; total = 0; meterText.text = '0.00';
    for (const t of labelAt.values()) t.destroy(); labelAt.clear();
    board.reset(); board.enter(SEED);
    for (const c of SEED) paintLabel(c.cell, c.data.value);
    hud.text = 'feature running… (tap to skip)';
    await gate(400);
    for (const cells of ROUNDS) {
      const res = await board.respin(cells.map((cell) => ({ cell, id: COIN, data: { value: val() } })));
      await gate(450);
      if (res.done) break;
    }
    hud.text = skipping ? 'collecting (skipped)…' : 'collecting…';
    await collect();
    hud.text = `feature:end fired · TOTAL ${fmt(total)}${skipping ? ' (skipped)' : ''} · press spin`;
    running = false;
  },
};
