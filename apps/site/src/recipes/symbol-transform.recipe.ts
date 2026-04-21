// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const LOW = ['round/round_1', 'round/round_2', 'round/round_3'];
const HIGH = ['royal/royal_1', 'royal/royal_2'];
const IDS = [...LOW, ...HIGH];
const COLS = 5, ROWS = 3, CELL = 90;

// Predictable grid — always has low-pays to upgrade.
const GRID = [
  ['round/round_1', 'round/round_2', 'round/round_1'],
  ['round/round_2', 'round/round_3', 'royal/royal_1'],
  ['round/round_3', 'round/round_1', 'round/round_2'],
  ['royal/royal_2', 'round/round_2', 'round/round_3'],
  ['round/round_1', 'round/round_3', 'round/round_2'],
];

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(CELL, CELL).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

// Bind a view's pivot to its cell center so transforms animate from the middle.
function bindCenter(view) {
  const ox = view.pivot.x, oy = view.pivot.y, px = view.x, py = view.y;
  view.pivot.set(CELL / 2, CELL / 2);
  view.x = px + (CELL / 2 - ox);
  view.y = py + (CELL / 2 - oy);
  return () => { view.pivot.set(ox, oy); view.x = px; view.y = py; };
}

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(GRID);
    const result = await p;
    await new Promise(r => setTimeout(r, 250));

    // Pick a random low-pay cell and upgrade it to a high-pay.
    const candidates = [];
    for (let r = 0; r < COLS; r++) {
      for (let row = 0; row < ROWS; row++) {
        if (LOW.includes(result.symbols[r][row])) candidates.push({ r, row });
      }
    }
    if (!candidates.length) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const upgradeId = HIGH[Math.floor(Math.random() * HIGH.length)];
    const reel = reelSet.getReel(pick.r);

    // Scale-out old symbol from center.
    const oldSym = reel.getSymbolAt(pick.row);
    const restoreOld = bindCenter(oldSym.view);
    await new Promise(resolve => {
      gsap.to(oldSym.view, { alpha: 0, duration: 0.3, ease: 'power2.in', onComplete: resolve });
      gsap.to(oldSym.view.scale, { x: 0.4, y: 0.4, duration: 0.3, ease: 'power2.in' });
    });
    restoreOld();

    // Swap identity.
    const visible = reel.getVisibleSymbols();
    visible[pick.row] = upgradeId;
    reel.placeSymbols(visible);

    // Scale-in new symbol from center.
    const next = reel.getSymbolAt(pick.row);
    next.view.alpha = 0;
    next.view.scale.set(0.4);
    const restoreNext = bindCenter(next.view);
    await new Promise(resolve => {
      gsap.to(next.view, { alpha: 1, duration: 0.35, ease: 'back.out(1.8)', onComplete: resolve });
      gsap.to(next.view.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(1.8)' });
    });
    restoreNext();
  },
};
