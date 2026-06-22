// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, HoldAndWinBuilder, BlurSpriteSymbol,
//           AnimatedSpriteSymbol, loadHoldAndWinSprites, PIXI, gsap, app
//
// Base game → Hold & Win → base game, one chain, one Spin button.
//
// A normal 5×3 reel set spins the diamonds symbol set. When 3 BONUS symbols
// land, the same press hides the base reels, reveals the Hold & Win board
// (every cell now its own 1×1 reel), plays the respin feature, and on
// `feature:end` swaps back to the base game. The board is a second display
// object on the same screen — `feature:enter` / `feature:end` are the seam.

const COLS = 5, ROWS = 3, CELL = 74, GAP = 6;
const COIN = 'coin', BONUS = 'bonus';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);

const { symbols, blur, coin } = await loadHoldAndWinSprites();
const valueText = (text, size) => { const t = new PIXI.BitmapText({ text, style: { fontFamily: 'DiamondDigits', fontSize: size } }); t.anchor.set(0.5); return t; };
class BlurCell extends BlurSpriteSymbol {
  onReelSpinStart() { this.setBlurred(true); }
  onReelLanded() { this.setBlurred(false); }
}

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
const ox = (app.screen.width - boardW) / 2;
const oy = (app.screen.height - boardH) / 2 - 6;

// -- the base game: a normal reel set (number symbols + a BONUS trigger) --
const BASE = ['1', '2', '3', '4', '5', '6', '7', '8', 'wild'];
const base = new ReelSetBuilder()
  .reels(COLS).visibleRows(ROWS)
  .symbolSize(CELL, CELL).symbolGap(GAP, GAP)
  .symbols((r) => { for (const id of [...BASE, BONUS]) r.register(id, BlurCell, { textures: symbols, blurTextures: blur }); })
  .weights({ ...Object.fromEntries(BASE.map((id) => [id, 3])), [BONUS]: 1 })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();
base.x = ox; base.y = oy;
app.stage.addChild(base);

// -- the Hold & Win board: hidden until the feature triggers --
const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => r.register(COIN, AnimatedSpriteSymbol, { frames: { [COIN]: coin }, animationSpeed: 0.6, anchor: { x: 0.5, y: 0.5 } }))
  .weights({ [COIN]: 1, empty: 3 })
  .respins(3)
  .cellChrome((g, size) => g.roundRect(0, 0, size, size, 10).fill({ color: 0x140f2e, alpha: 0.55 }).stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 }))
  .ticker(app.ticker)
  .build();
board.container.x = ox; board.container.y = oy;
board.container.visible = false;
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin · land 3 BONUS to trigger', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, oy + boardH + 12);
app.stage.addChild(hud);

const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => { const c = board.cellCenter(cell); return { x: board.container.x + c.x, y: board.container.y + c.y }; };
const fit = (t, w, h) => { if (t.width > 0) t.scale.set(Math.min(w / t.width, h / t.height, 1)); return t; };
const paintLabel = (cell, value) => {
  const k = `${cell.col},${cell.row}`; labelAt.get(k)?.destroy();
  const p = abs(cell); const t = fit(valueText(fmt(value), 30), CELL * 0.82, CELL * 0.46);
  t.position.set(p.x, p.y); labels.addChild(t); labelAt.set(k, t);
};
board.events.on('coin:locked', ({ coin }) => paintLabel(coin.cell, coin.data?.value ?? 0));

// -- the transition: hide base, run the feature, show base again --
board.events.on('feature:enter', () => { gsap.fromTo(board.container, { alpha: 0 }, { alpha: 1, duration: 0.3 }); });

const val = () => [5, 10, 25, 50, 100][Math.floor(Math.random() * 5)];
// scripted base-game results: a near-miss (2 BONUS), then a trigger (3 BONUS)
const BONUS_SPOTS = [
  [{ col: 1, row: 1 }, { col: 3, row: 0 }],                         // 2 → no trigger
  [{ col: 0, row: 1 }, { col: 2, row: 2 }, { col: 4, row: 0 }],     // 3 → TRIGGER
];
let spin = 0;

function baseGrid(bonusCells) {
  const grid = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => BASE[Math.floor(Math.random() * BASE.length)]));
  for (const c of bonusCells) grid[c.col][c.row] = BONUS;
  return grid;
}

async function runFeature(triggerCells) {
  base.visible = false;
  board.container.visible = true;
  for (const t of labelAt.values()) t.destroy();
  labelAt.clear();
  board.reset();
  // the BONUS positions carry into the feature as the first locked coins
  const seed = triggerCells.map((cell) => ({ cell, id: COIN, data: { value: val() } }));
  board.enter(seed);
  for (const c of seed) paintLabel(c.cell, c.data.value);
  hud.text = 'HOLD & WIN · each cell spins on its own';
  await sleep(500);
  for (const cells of [[{ col: 2, row: 0 }], [{ col: 0, row: 2 }, { col: 4, row: 2 }], [], []]) {
    const res = await board.respin(cells.map((cell) => ({ cell, id: COIN, data: { value: val() } })));
    await sleep(450);
    if (res.done) break;
  }
  const total = board.lockedCoins.reduce((a, c) => a + (c.data?.value ?? 0), 0);
  hud.text = `feature over · won ${fmt(total)} · back to base game`;
  await sleep(700);
  // feature:end already fired inside respin — swap the display back
  await new Promise((res) => gsap.to(board.container, { alpha: 0, duration: 0.3, onComplete: res }));
  board.container.visible = false;
  board.container.alpha = 1;
  base.visible = true;
  hud.text = 'press spin · land 3 BONUS to trigger';
}

let busy = false;
return {
  cleanup: () => { try { gsap.killTweensOf(board.container); } catch {} for (const t of labelAt.values()) { try { t.destroy(); } catch {} } labelAt.clear(); try { hud.destroy(); labels.destroy(); } catch {} board.destroy(); base.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    const bonusCells = BONUS_SPOTS[spin % BONUS_SPOTS.length];
    spin++;
    const p = base.spin();
    await sleep(150);
    base.setResult(baseGrid(bonusCells).map((visible) => ({ visible })));
    await p;
    if (bonusCells.length >= 3) {
      hud.text = '3 BONUS — entering Hold & Win!';
      await sleep(500);
      await runFeature(bonusCells);
    } else {
      hud.text = `${bonusCells.length} BONUS · need 3 · press spin`;
    }
    busy = false;
  },
};
