// @ts-nocheck
// Injected: HoldAndWinBuilder, AnimatedSpriteSymbol, BlurSpriteSymbol,
//           loadHoldAndWinSprites, PIXI, gsap, app
//
// Multiplier-strike coin. The board fills with value coins; on the strike
// press a multiplier coin lands, the strike FX (17-frame AnimatedSprite)
// fires over it, and every coin's value is multiplied by it — labels bump,
// total jumps. The multiplier lives in coin.data; the board is value-blind.

const COLS = 5, ROWS = 3, CELL = 76, GAP = 6;
const COIN = 'coin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const { symbols, blur, coin } = await loadHoldAndWinSprites();
// the strike FX + the gold value font (GoldDigits — same as the collector recipe)
const strikeSheet = await PIXI.Assets.load('/hw-sprites/multiplier-strike.json');
const strikeFrames = Object.entries(strikeSheet.textures).sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t);
await PIXI.Assets.load('/hw-spine/goldfont.fnt'); // face "GoldDigits"

// value labels use the gold coin font (GoldDigits); the ×N strike badge uses
// DiamondMult (the gold font has no 'x' glyph)
const valueText = (text, size, font = 'GoldDigits') => {
  const t = new PIXI.BitmapText({ text, style: { fontFamily: font, fontSize: size } });
  t.anchor.set(0.5);
  return t;
};

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
  .cellChrome((g, size) => {
    g.roundRect(0, 0, size, size, 10).fill({ color: 0x140f2e, alpha: 0.55 }).stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 });
  })
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
  const t = fit(valueText(fmt(value), 30), CELL * 0.82, CELL * 0.46);
  t.position.set(p.x, p.y); // centered on the coin face
  labels.addChild(t);
  labelAt.set(k, t);
  return t;
};
const totalOf = () => board.lockedCoins.filter((c) => !c.data?.mult).reduce((a, c) => a + (c.data?.value ?? 0), 0);

board.events.on('coin:locked', ({ coin }) => { if (!coin.data?.mult) paintLabel(coin.cell, coin.data?.value ?? 0); });

// fire the strike FX at a cell, return when it finishes
const flyers = new Set();
function strikeAt(cell, mult) {
  const p = abs(cell);
  const fx = new PIXI.AnimatedSprite(strikeFrames);
  fx.anchor.set(0.5);
  fx.position.set(p.x, p.y);
  fx.width = fx.height = CELL * 2.1; // the strike spills past the cell
  fx.loop = false;
  fx.animationSpeed = 0.5;
  app.stage.addChild(fx);
  flyers.add(fx);
  // the ×N badge rides in on the strike, in the multiplier font
  const badge = valueText(`${mult}x`, 40, 'DiamondMult');
  badge.position.set(p.x, p.y);
  badge.scale.set(0);
  app.stage.addChild(badge);
  flyers.add(badge);
  gsap.fromTo(badge.scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
  return new Promise((res) => {
    fx.onComplete = () => { try { fx.destroy(); } catch {} flyers.delete(fx); res(); };
    fx.play();
  }).then(() => { gsap.to(badge.scale, { x: 0, y: 0, duration: 0.2, delay: 0.3, ease: 'back.in(2)', onComplete: () => { try { badge.destroy(); } catch {} flyers.delete(badge); } }); });
}

const SEED = [
  { cell: { col: 0, row: 0 }, id: COIN, data: { value: 5 } },
  { cell: { col: 2, row: 1 }, id: COIN, data: { value: 10 } },
  { cell: { col: 4, row: 2 }, id: COIN, data: { value: 5 } },
  { cell: { col: 1, row: 2 }, id: COIN, data: { value: 20 } },
];
const MULT_CELL = { col: 3, row: 0 };
const MULT = 3;
const seedBoard = () => { board.enter(SEED); for (const c of SEED) paintLabel(c.cell, c.data.value); hud.text = `held 4 · total ${fmt(totalOf())} · press spin for the multiplier`; };
const reset = () => { for (const t of labelAt.values()) t.destroy(); labelAt.clear(); SEED.forEach((c, i) => (c.data.value = [5, 10, 5, 20][i])); board.reset(); seedBoard(); };
seedBoard();

let phase = 'ready';
return {
  cleanup: () => { for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy?.(); } catch {} } flyers.clear(); for (const t of labelAt.values()) { try { t.destroy(); } catch {} } board.destroy(); },
  onSpin: async () => {
    if (phase === 'running') return;
    if (phase === 'done') { reset(); phase = 'ready'; return; }
    phase = 'running';
    hud.text = 'multiplier coin landing…';
    await board.respin([{ cell: MULT_CELL, id: COIN, data: { mult: MULT } }]);
    await sleep(250);

    hud.text = `×${MULT} STRIKE!`;
    await strikeAt(MULT_CELL, MULT);
    // multiply every value coin and bump its label
    for (const c of board.lockedCoins) {
      if (c.data?.mult) continue;
      c.data.value *= MULT;
      const t = paintLabel(c.cell, c.data.value);
      gsap.fromTo(t.scale, { x: t.scale.x * 1.4, y: t.scale.y * 1.4 }, { x: t.scale.x, y: t.scale.y, duration: 0.25, ease: 'back.out(2)' });
      await sleep(70);
    }
    phase = 'done';
    hud.text = `×${MULT} applied · total ${fmt(totalOf())} · press spin to reset`;
  },
};
