// @ts-nocheck
// Injected: HoldAndWinBuilder, AnimatedSpriteSymbol, BlurSpriteSymbol,
//           loadHoldAndWinSprites, PIXI, gsap, app
//
// Bonus cells. A few cells are marked as bonus cells from the start. When a
// coin lands ON one, the cell flashes active and doubles that coin's value.
// Positional special cells are pure game state — the board only reports
// where each coin landed (coin:locked + cell), the rest is your rule.

const COLS = 5, ROWS = 3, CELL = 76, GAP = 6;
const COIN = 'coin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const ck = (c) => `${c.col},${c.row}`;

const { symbols, blur, coin } = await loadHoldAndWinSprites();
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
  })
  .weights({ ...Object.fromEntries(BASE_IDS.map((id) => [id, 2])), [COIN]: 2, empty: 7 })
  .respins(3)
  .cellChrome((g, size) => { g.roundRect(0, 0, size, size, 10).fill({ color: 0x140f2e, alpha: 0.55 }).stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 }); })
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 4;
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin · coins on a bonus cell double', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);

const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => { const c = board.cellCenter(cell); return { x: board.container.x + c.x, y: board.container.y + c.y }; };
const fit = (t, maxW, maxH) => { if (t.width > 0 && t.height > 0) t.scale.set(Math.min(maxW / t.width, maxH / t.height, 1)); return t; };
const paintLabel = (cell, value) => {
  labelAt.get(ck(cell))?.destroy();
  const p = abs(cell);
  const t = fit(valueText(fmt(value), 30), CELL * 0.82, CELL * 0.4);
  t.position.set(p.x, p.y);
  labels.addChild(t);
  labelAt.set(ck(cell), t);
  return t;
};

// --- the bonus cells: a glowing marker over each, riding the board ---
const BONUS = [{ col: 1, row: 0 }, { col: 3, row: 1 }, { col: 2, row: 2 }];
const bonusSet = new Set(BONUS.map(ck));
const markers = new Map();
const fadingMarkers = new Set(); // markers mid fade-out, tracked so a reset can still kill them
function placeMarkers() {
  for (const cell of BONUS) {
    const c = board.cellCenter(cell);
    const s = new PIXI.Sprite(symbols['bonus_cell']);
    s.anchor.set(0.5);
    s.position.set(c.x, c.y);
    s.scale.set(Math.min((CELL - 4) / s.texture.width, (CELL - 4) / s.texture.height));
    board.container.addChild(s); // above chrome; hidden the moment a coin lands here
    markers.set(ck(cell), s);
    gsap.to(s, { alpha: 0.55, duration: 0.7, ease: 'sine.inOut', repeat: -1, yoyo: true });
  }
}
function clearMarkers() {
  for (const s of markers.values()) { gsap.killTweensOf(s); gsap.killTweensOf(s.scale); try { s.destroy(); } catch {} }
  markers.clear();
  for (const s of fadingMarkers) { gsap.killTweensOf(s); gsap.killTweensOf(s.scale); try { s.destroy(); } catch {} }
  fadingMarkers.clear();
}

board.events.on('coin:locked', ({ coin }) => {
  const onBonus = bonusSet.has(ck(coin.cell));
  if (onBonus) {
    coin.data.value *= 2; // game rule: bonus cell doubles
    const m = markers.get(ck(coin.cell));
    if (m) {
      m.texture = symbols['bonus_cell_active'];
      markers.delete(ck(coin.cell));
      fadingMarkers.add(m); // tracked: a reset within the 0.45s fade can still kill it
      gsap.to(m, { alpha: 0, duration: 0.45, ease: 'power2.in', onComplete: () => { try { m.destroy(); } catch {} fadingMarkers.delete(m); } });
      gsap.fromTo(m.scale, { x: m.scale.x, y: m.scale.y }, { x: m.scale.x * 1.5, y: m.scale.y * 1.5, duration: 0.45, ease: 'power2.out' });
    }
  }
  const t = paintLabel(coin.cell, coin.data.value);
  if (onBonus) gsap.fromTo(t.scale, { x: t.scale.x * 1.5, y: t.scale.y * 1.5 }, { x: t.scale.x, y: t.scale.y, duration: 0.3, ease: 'back.out(2)' });
});

const val = () => [2, 5, 10, 15, 25][Math.floor(Math.random() * 5)];
// scripted so coins land both on and off the bonus cells
const ROUNDS = [
  [{ col: 1, row: 0 }, { col: 0, row: 2 }], // (1,0) is a bonus cell -> doubles
  [{ col: 3, row: 1 }, { col: 4, row: 0 }], // (3,1) is a bonus cell -> doubles
  [{ col: 2, row: 2 }],                     // (2,2) is a bonus cell -> doubles
  [],
];

let busy = false;
const reset = () => { clearMarkers(); for (const t of labelAt.values()) { try { gsap.killTweensOf(t.scale); t.destroy(); } catch {} } labelAt.clear(); board.reset(); placeMarkers(); };
placeMarkers();

return {
  cleanup: () => { clearMarkers(); for (const t of labelAt.values()) { try { gsap.killTweensOf(t.scale); t.destroy(); } catch {} } labelAt.clear(); try { hud.destroy(); labels.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    reset();
    board.enter([]);
    await sleep(350);
    for (const cells of ROUNDS) {
      const hits = cells.map((cell) => ({ cell, id: COIN, data: { value: val() } }));
      const result = await board.respin(hits);
      await sleep(450);
      if (result.done) break;
    }
    const total = board.lockedCoins.reduce((a, c) => a + (c.data?.value ?? 0), 0);
    hud.text = `feature over · TOTAL ${fmt(total)} · press spin to replay`;
    busy = false;
  },
};
