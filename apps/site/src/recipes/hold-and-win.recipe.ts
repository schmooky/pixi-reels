// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted,
//           EmptySymbol (blank ReelSymbol — renders nothing, used for miss cells)

const COIN = 'feature/feature_1';
const EMPTY = 'empty';
const COLS = 5, ROWS = 3, CELL = 60, GAP = 4;

// Build 15 independent 1×1 ReelSets — one per cell.
const colWidth = COLS * (CELL + GAP) - GAP;
const colHeight = ROWS * (CELL + GAP) - GAP;
const startX = (app.screen.width - colWidth) / 2;
const startY = (app.screen.height - colHeight) / 2;

const cells = [];
for (let col = 0; col < COLS; col++) {
  for (let row = 0; row < ROWS; row++) {
    const mini = new ReelSetBuilder()
      .reels(1).visibleSymbols(1)
      .symbolSize(CELL, CELL).symbolGap(0, 0)
      .symbols(r => {
        r.register(COIN, BlurSpriteSymbol, { textures, blurTextures });
        r.register(EMPTY, EmptySymbol, {});
      })
      // Mostly empty so coins flash past during the spin animation.
      .weights({ [COIN]: 1, [EMPTY]: 3 })
      .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 320 + (col + row) * 60 })
      .ticker(app.ticker)
      .build();
    mini.x = startX + col * (CELL + GAP);
    mini.y = startY + row * (CELL + GAP);
    app.stage.addChild(mini);
    cells.push({ col, row, reelSet: mini });
  }
}

// Scripted arrivals: 3 coins in round 1, 1 in round 2, 1 in round 3.
const rounds = [
  [{ col: 0, row: 2 }, { col: 2, row: 0 }, { col: 4, row: 1 }],
  [{ col: 1, row: 0 }],
  [{ col: 3, row: 2 }],
];

const heldKeys = new Set();
const overlays = [];

return {
  cleanup: () => {
    for (const o of overlays) try { o.destroy(); } catch {}
    for (const c of cells) try { c.reelSet.destroy(); } catch {}
  },
  onSpin: async () => {
    // Reset prior state.
    for (const o of overlays) try { o.destroy(); } catch {}
    overlays.length = 0;
    heldKeys.clear();
    for (const c of cells) c.reelSet.visible = true;

    for (const hits of rounds) {
      const spinPromises = [];
      const activeCells = [];
      for (const cell of cells) {
        const key = `${cell.col},${cell.row}`;
        if (heldKeys.has(key)) continue;
        activeCells.push(cell);
        spinPromises.push(cell.reelSet.spin());
      }

      await new Promise(r => setTimeout(r, 140));
      for (const cell of activeCells) {
        const isHit = hits.some(h => h.col === cell.col && h.row === cell.row);
        cell.reelSet.setResult([[isHit ? COIN : EMPTY]]);
      }
      await Promise.all(spinPromises);

      // Lock in hits with a coin overlay sprite; hide their mini reel.
      const coinTex = textures[COIN];
      for (const cell of activeCells) {
        const key = `${cell.col},${cell.row}`;
        if (!hits.some(h => h.col === cell.col && h.row === cell.row)) continue;
        const s = (CELL - 8) / Math.max(coinTex.width, coinTex.height);
        const overlay = new PIXI.Sprite(coinTex);
        overlay.anchor.set(0.5);
        overlay.x = cell.reelSet.x + CELL / 2;
        overlay.y = cell.reelSet.y + CELL / 2;
        overlay.alpha = 0;
        overlay.scale.set(s * 1.4);
        app.stage.addChild(overlay);
        overlays.push(overlay);
        heldKeys.add(key);
        gsap.to(overlay, { alpha: 1, duration: 0.22 });
        gsap.to(overlay.scale, { x: s, y: s, duration: 0.35, ease: 'back.out(2)' });
        cell.reelSet.visible = false;
      }

      await new Promise(r => setTimeout(r, 650));
    }
  },
};
