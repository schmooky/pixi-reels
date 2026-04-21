// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const FILLER = ['round/round_1', 'round/round_2', 'round/round_3', 'royal/royal_1'];
const MARK = 'wild/wild_1';
const ALL = [...FILLER, MARK];
const COLS = 5, ROWS = 3, CELL = 80, GAP = 4;

// Build 5 independent per-column ReelSets.
const colWidth = COLS * (CELL + GAP) - GAP;
const colHeight = ROWS * (CELL + GAP) - GAP;
const startX = (app.screen.width - colWidth) / 2;
const startY = (app.screen.height - colHeight) / 2;

const columns = [];
for (let col = 0; col < COLS; col++) {
  const rs = new ReelSetBuilder()
    .reels(1).visibleSymbols(ROWS)
    .symbolSize(CELL, CELL).symbolGap(0, GAP)
    .symbols(r => {
      for (const id of ALL) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    })
    .weights({ [FILLER[0]]: 22, [FILLER[1]]: 22, [FILLER[2]]: 20, [FILLER[3]]: 18 })
    .speed('normal', SpeedPresets.NORMAL)
    // Stagger stop times left-to-right so the full-board spin reads as sequential.
    .speed('turbo', { ...SpeedPresets.TURBO, minimumSpinTime: 260 + col * 90 })
    .ticker(app.ticker)
    .build();
  rs.setSpeed('turbo');
  rs.x = startX + col * (CELL + GAP);
  rs.y = startY;
  app.stage.addChild(rs);
  columns.push(rs);
}

function randCol() {
  return Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]);
}

const RESPIN_COL = 2;

return {
  cleanup: () => { for (const c of columns) try { c.destroy(); } catch {} },
  onSpin: async () => {
    // 1. Full board spin — all columns in parallel, wild lands on col 0.
    const firstGrid = Array.from({ length: COLS }, () => randCol());
    firstGrid[0][1] = MARK;
    await Promise.all(columns.map((c, i) => {
      const sp = c.spin();
      c.setResult([firstGrid[i]]);
      return sp;
    }));
    await new Promise(r => setTimeout(r, 600));

    // 2. Respin only the middle column — held columns receive no .spin() call.
    const respinGrid = Array.from({ length: ROWS }, (_, i) =>
      i === 1 ? MARK : FILLER[Math.floor(Math.random() * FILLER.length)]
    );
    const p = columns[RESPIN_COL].spin();
    await new Promise(r => setTimeout(r, 140));
    columns[RESPIN_COL].setResult([respinGrid]);
    await p;
    await new Promise(r => setTimeout(r, 900));
  },
};
