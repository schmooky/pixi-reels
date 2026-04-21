// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const WILD = 'wild/wild_1';
const IDS = [...FILLER, WILD];
const COLS = 5, ROWS = 3, CELL = 90;

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(CELL, CELL).symbolGap(4, 4)
  .symbols(r => {
    for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
  })
  .weights({ 'round/round_1': 22, 'round/round_2': 22, 'royal/royal_1': 18, 'square/square_1': 18 })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();
reelSet.setSpeed('turbo');

// Overlay sprite that stays on the stage while the reel scrolls beneath it.
const wildTex = textures[WILD];
const ghost = new PIXI.Sprite(wildTex);
ghost.anchor.set(0.5);
ghost.scale.set(CELL / Math.max(wildTex.width, wildTex.height));
ghost.visible = false;
app.stage.addChild(ghost);

function filler() {
  return Array.from({ length: COLS }, () =>
    Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)])
  );
}

function ghostPos(reelIdx, row) {
  return reelSet.getReel(reelIdx).getSymbolAt(row).view.toGlobal({ x: CELL / 2, y: CELL / 2 });
}

const WALKER_ROW = 1;

return {
  reelSet,
  cleanup: () => { try { ghost.destroy(); } catch {} },
  onSpin: async () => {
    ghost.visible = false;

    // Spin 1 — wild arrives on reel 4.
    let walkerCol = 4;
    const grid1 = filler();
    grid1[walkerCol][WALKER_ROW] = WILD;
    let p = reelSet.spin();
    await new Promise(r => setTimeout(r, 120));
    reelSet.setResult(grid1);
    await p;
    const pos = ghostPos(walkerCol, WALKER_ROW);
    ghost.x = pos.x; ghost.y = pos.y;
    ghost.visible = true;
    await new Promise(r => setTimeout(r, 500));

    // Respins — ghost tweens left one column per spin.
    for (let target = 3; target >= 0; target--) {
      const grid = filler();
      grid[target][WALKER_ROW] = WILD;

      const from = ghostPos(walkerCol, WALKER_ROW);
      const to = ghostPos(target, WALKER_ROW);
      ghost.x = from.x; ghost.y = from.y;
      gsap.to(ghost, { x: to.x, y: to.y, duration: 0.4, ease: 'power2.inOut' });

      p = reelSet.spin();
      await new Promise(r => setTimeout(r, 100));
      reelSet.setResult(grid);
      await p;
      walkerCol = target;
      await new Promise(r => setTimeout(r, 400));
    }

    // Wild exits — fade out, then one final base spin.
    await new Promise(resolve => {
      gsap.to(ghost, { alpha: 0, duration: 0.3, onComplete: () => {
        ghost.visible = false; ghost.alpha = 1; resolve();
      }});
    });
    p = reelSet.spin();
    await new Promise(r => setTimeout(r, 100));
    reelSet.setResult(filler());
    await p;
  },
};
