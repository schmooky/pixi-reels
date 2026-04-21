// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const LOWS = ['round/round_1', 'round/round_2', 'round/round_3'];
const HIGHS = ['royal/royal_1', 'royal/royal_2'];
const MYSTERY = 'feature/feature_1'; // stands in for a "?" tile
const IDS = [...LOWS, ...HIGHS, MYSTERY];
const COLS = 5, ROWS = 3, CELL = 90;

// Fixed grid with mystery cells scattered across the board.
const GRID = [
  [LOWS[0], MYSTERY, LOWS[1]],
  [LOWS[2], LOWS[0], LOWS[2]],
  [MYSTERY, LOWS[1], LOWS[0]],
  [LOWS[2], LOWS[0], MYSTERY],
  [LOWS[1], LOWS[2], LOWS[0]],
];

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(CELL, CELL).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

function bindCenter(view) {
  const ox = view.pivot.x, oy = view.pivot.y, px = view.x, py = view.y;
  view.pivot.set(CELL / 2, CELL / 2);
  view.x = px + (CELL / 2 - ox);
  view.y = py + (CELL / 2 - oy);
  return () => { view.pivot.set(ox, oy); view.x = px; view.y = py; };
}

function pickReveal() {
  const pool = [...LOWS, ...LOWS, ...HIGHS]; // lows weighted heavier
  return pool[Math.floor(Math.random() * pool.length)];
}

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(GRID);
    await p;
    await new Promise(r => setTimeout(r, 350));

    const reveal = pickReveal();

    await Promise.all(
      GRID.flatMap((col, r) =>
        col.map((sym, row) => {
          if (sym !== MYSTERY) return Promise.resolve();
          return (async () => {
            const reel = reelSet.getReel(r);
            const s = reel.getSymbolAt(row);
            // Shake.
            await new Promise(resolve => {
              gsap.to(s.view, {
                x: '+=6', duration: 0.05, yoyo: true, repeat: 5, ease: 'sine.inOut',
                onComplete: () => { s.view.x = 0; resolve(); },
              });
            });
            // Swap identity + pop in from center.
            const visible = reel.getVisibleSymbols();
            visible[row] = reveal;
            reel.placeSymbols(visible);
            const next = reel.getSymbolAt(row);
            next.view.scale.set(0);
            const restore = bindCenter(next.view);
            await new Promise(resolve => {
              gsap.to(next.view.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)', onComplete: resolve });
            });
            restore();
          })();
        })
      )
    );
  },
};
