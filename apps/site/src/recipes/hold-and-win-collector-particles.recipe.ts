// @ts-nocheck
// Injected: HoldAndWinBuilder, AnimatedSpriteSymbol, BlurSpriteSymbol,
//           loadHoldAndWinSprites, bezierFly, coinWaves, PIXI, gsap, app
//
// Collector cell with particle streams. The board opens holding value coins;
// a collector lands, and each coin's value flies into it on a bezier arc
// trailed by a stream of neon particles, ticking the collector total up.
// Pure game-layer choreography over the board's cellCenter() + events.

const COLS = 5, ROWS = 3, CELL = 76, GAP = 6;
const COIN = 'coin', COLLECTOR = 'collect';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const { symbols, blur, coin } = await loadHoldAndWinSprites();
const partSheet = await PIXI.Assets.load('/hw-sprites/particles.json');
const neonTex = partSheet.textures['neon_long_particle'];

const valueText = (text, size) => { const t = new PIXI.BitmapText({ text, style: { fontFamily: 'DiamondDigits', fontSize: size } }); t.anchor.set(0.5); return t; };

class BlurCell extends BlurSpriteSymbol {
  onReelSpinStart() { this.setBlurred(true); }
  onReelLanded() { this.setBlurred(false); }
}

const BASE_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', 'wild'];
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => {
    for (const id of BASE_IDS) r.register(id, BlurCell, { textures: symbols, blurTextures: blur });
    r.register(COIN, AnimatedSpriteSymbol, { frames: { [COIN]: coin }, animationSpeed: 0.6, anchor: { x: 0.5, y: 0.5 } });
    r.register(COLLECTOR, BlurCell, { textures: symbols, blurTextures: blur }); // the 'collect' symbol art
  })
  .weights({ ...Object.fromEntries(BASE_IDS.map((id) => [id, 2])), [COIN]: 2, [COLLECTOR]: 0, empty: 7 })
  .respins(3)
  .cellChrome((g, size) => { g.roundRect(0, 0, size, size, 10).fill({ color: 0x140f2e, alpha: 0.55 }).stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 }); })
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 4;
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);

const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => { const c = board.cellCenter(cell); return { x: board.container.x + c.x, y: board.container.y + c.y }; };
const fit = (t, maxW, maxH) => { if (t.width > 0 && t.height > 0) t.scale.set(Math.min(maxW / t.width, maxH / t.height, 1)); return t; };
const paintLabel = (cell, value) => {
  const k = `${cell.col},${cell.row}`;
  labelAt.get(k)?.destroy();
  const p = abs(cell);
  const t = fit(valueText(fmt(value), 30), CELL * 0.82, CELL * 0.4);
  t.position.set(p.x, p.y);
  labels.addChild(t);
  labelAt.set(k, t);
  return t;
};

const SEED = [
  { cell: { col: 0, row: 0 }, id: COIN, data: { value: 10 } },
  { cell: { col: 4, row: 0 }, id: COIN, data: { value: 5 } },
  { cell: { col: 1, row: 2 }, id: COIN, data: { value: 25 } },
  { cell: { col: 3, row: 2 }, id: COIN, data: { value: 15 } },
];
const COLLECTOR_CELL = { col: 2, row: 1 };
const seedBoard = () => { board.enter(SEED); for (const c of SEED) paintLabel(c.cell, c.data.value); hud.text = 'press spin · the collector lands and sweeps'; };
seedBoard();

// a stream of neon particles along the same arc as the flying value
const flyers = new Set();
function emitStream(from, to, n) {
  for (let i = 0; i < n; i++) {
    const s = new PIXI.Sprite(neonTex);
    s.anchor.set(0.5);
    s.scale.set(0.35 + Math.random() * 0.25);
    s.alpha = 0.9;
    s.position.set(from.x, from.y);
    app.stage.addChild(s);
    flyers.add(s);
    const jx = (Math.random() - 0.5) * 30, jy = (Math.random() - 0.5) * 30;
    bezierFly(s, { x: from.x + jx, y: from.y + jy }, to, { lean: 'up', curvature: 0.3 + Math.random() * 0.2, duration: 0.45 + Math.random() * 0.2, delay: i * 0.04, arriveScale: 0.2 })
      .then(() => { if (s.destroyed) { flyers.delete(s); return; } gsap.to(s, { alpha: 0, duration: 0.15, onComplete: () => { try { s.destroy(); } catch {} flyers.delete(s); } }); });
  }
}

let total = 0, sumText = null;
async function collect() {
  const target = abs(COLLECTOR_CELL);
  sumText = valueText('0.00', 28);
  sumText.position.set(target.x, target.y);
  labels.addChild(sumText);
  for (const wave of coinWaves(board.lockedCoins.filter((c) => c.id === COIN), 'sequence')) {
    await Promise.all(wave.map((c) => {
      const from = abs(c.cell);
      const clone = fit(valueText(fmt(c.data.value), 30), CELL * 0.82, CELL * 0.4);
      clone.position.set(from.x, from.y);
      app.stage.addChild(clone);
      flyers.add(clone);
      labelAt.get(`${c.cell.col},${c.cell.row}`)?.destroy();
      labelAt.delete(`${c.cell.col},${c.cell.row}`);
      board.release([c.cell]);
      emitStream(from, target, 8);
      return bezierFly(clone, from, target, { lean: 'up', curvature: 0.35, arriveScale: 0.3, duration: 0.55 }).then(() => {
        try { clone.destroy(); } catch {} flyers.delete(clone);
        total += c.data.value;
        sumText.text = fmt(total);
        fit(sumText, CELL * 0.82, CELL * 0.4);
        gsap.fromTo(sumText.scale, { x: sumText.scale.x * 1.4, y: sumText.scale.y * 1.4 }, { x: sumText.scale.x, y: sumText.scale.y, duration: 0.22, ease: 'power2.out' });
      });
    }));
    await sleep(120);
  }
  void board.symbolAt(COLLECTOR_CELL).playWin?.(); // react once, after the sweep — restarting it per-arrival never lets the win play through
  await sleep(400);
}

let phase = 'ready';
return {
  cleanup: () => { for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy(); } catch {} } flyers.clear(); for (const t of labelAt.values()) { try { t.destroy(); } catch {} } board.destroy(); },
  onSpin: async () => {
    if (phase === 'running') return;
    if (phase === 'done') { for (const t of labelAt.values()) t.destroy(); labelAt.clear(); if (sumText) { try { sumText.destroy(); } catch {} sumText = null; } total = 0; SEED.forEach((c, i) => (c.data.value = [10, 5, 25, 15][i])); board.reset(); seedBoard(); phase = 'ready'; return; }
    phase = 'running';
    hud.text = 'collector landing…';
    await board.respin([{ cell: COLLECTOR_CELL, id: COLLECTOR, data: { collector: true } }]);
    await sleep(300);
    hud.text = 'collecting…';
    await collect();
    phase = 'done';
    hud.text = `collected ${fmt(total)} · press spin to reset`;
  },
};
