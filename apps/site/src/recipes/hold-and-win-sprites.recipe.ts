// @ts-nocheck
// Injected: HoldAndWinBuilder, BlurSpriteSymbol, AnimatedSpriteSymbol,
//           loadHoldAndWinSprites, PIXI, gsap, app
//
// Sprite Hold & Win starter. The same board mechanic as the Spine coin
// recipes, but every symbol is a plain TexturePacker sprite (Supercharged
// Diamonds 3 art): number symbols blur as they spin (BlurSpriteSymbol) and
// the money coin is a 30-frame flip (AnimatedSpriteSymbol). No skeleton
// runtime — this is the sprite path a studio ships most often.

const COLS = 5, ROWS = 4, CELL = 74, GAP = 6;
const COIN = 'coin';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

// symbols (base + motion-blur), the 30-frame coin, and the DiamondDigits font
const { symbols, blur, coin } = await loadHoldAndWinSprites();

const valueText = (text, size) => {
  const t = new PIXI.BitmapText({ text, style: { fontFamily: 'DiamondDigits', fontSize: size } });
  t.anchor.set(0.5);
  return t;
};

// Auto-blur on spin: the engine calls these hooks on every visible symbol as
// the reel changes phase, so the blur swap needs no per-cell event wiring.
class BlurCell extends BlurSpriteSymbol {
  onReelSpinStart() { this.setBlurred(true); }
  onReelSpinEnd() { this.setBlurred(false); }
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
  // base-game flavour flashes past; coins are server-placed and land
  .weights({ ...Object.fromEntries(BASE_IDS.map((id) => [id, 2])), [COIN]: 2, empty: 7 })
  .respins(3)
  .cellChrome((g, size) => {
    g.roundRect(0, 0, size, size, 10)
      .fill({ color: 0x140f2e, alpha: 0.55 })
      .stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 });
  })
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 4;
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
const fit = (t, maxW, maxH) => {
  if (t.width > 0 && t.height > 0) t.scale.set(Math.min(maxW / t.width, maxH / t.height, 1));
  return t;
};
const paintLabel = (cell, value) => {
  const k = `${cell.col},${cell.row}`;
  labelAt.get(k)?.destroy();
  const p = abs(cell);
  const t = fit(valueText(fmt(value), 30), CELL * 0.82, CELL * 0.4);
  t.position.set(p.x, p.y); // centered on the coin face
  labels.addChild(t);
  labelAt.set(k, t);
  return t;
};

const totalOf = () => board.lockedCoins.reduce((a, c) => a + (c.data?.value ?? 0), 0);
board.events.on('coin:locked', ({ coin }) => {
  paintLabel(coin.cell, coin.data?.value ?? 0);
  hud.text = `held ${board.lockedCoins.length}/${board.capacity} · total ${fmt(totalOf())} · respins ${board.respinsLeft}`;
});
board.events.on('coin:released', ({ coin }) => {
  const k = `${coin.cell.col},${coin.cell.row}`;
  labelAt.get(k)?.destroy();
  labelAt.delete(k);
});

const val = () => [2, 5, 10, 15, 20, 25, 50, 100][Math.floor(Math.random() * 8)];
const SEED = [
  { cell: { col: 1, row: 1 }, id: COIN, data: { value: 10 } },
  { cell: { col: 3, row: 2 }, id: COIN, data: { value: 25 } },
];
const ROUNDS = [
  [{ col: 0, row: 0 }, { col: 4, row: 3 }],
  [{ col: 2, row: 1 }],
  [], [],
];

let busy = false;
return {
  cleanup: () => { for (const t of labelAt.values()) { try { t.destroy(); } catch {} } board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    for (const t of labelAt.values()) t.destroy();
    labelAt.clear();
    board.reset();
    board.enter(SEED);
    for (const c of SEED) paintLabel(c.cell, c.data.value);
    hud.text = `held ${board.lockedCoins.length}/${board.capacity} · respins ${board.respinsLeft}`;
    await sleep(400);

    for (const cells of ROUNDS) {
      const hits = cells.map((cell) => ({ cell, id: COIN, data: { value: val() } }));
      const result = await board.respin(hits);
      await sleep(450);
      if (result.done) break;
    }
    hud.text = `feature over · TOTAL ${fmt(totalOf())} · press spin to replay`;
    busy = false;
  },
};
