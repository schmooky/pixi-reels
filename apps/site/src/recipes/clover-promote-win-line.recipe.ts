// @ts-nocheck
// Injected: ReelSetBuilder, RoundedRectMaskStrategy, CloverSymbol, loadHwClover,
//           CLOVER_FRUITS, CLOVER_CELL, CLOVER_CELL_RADIUS, CLOVER_SPEED, PIXI, gsap, app
//
// PROMOTE, WITHOUT THE SPOTLIGHT. `spotlight.show()` is a whole presentation:
// it dims, reparents the winners, plays their win animation and only resolves
// when that finishes. A game that wants ONLY the layering - these symbols
// above the mask and above their neighbours, while its own timeline runs -
// had to ask for the presentation and switch every part of it off.
//
// `reelSet.promote(positions)` is that layering on its own. It attaches the
// views to a render layer instead of reparenting them, so nothing moves and
// nothing has to be put back; the returned release drops them.
//
// Watch the TOP row: it swells past the top of the grid. Unpromoted, the
// viewport mask cuts every symbol at the grid edge and the next reel draws
// over the one before it. Promoted, the same tween is neither cut nor
// covered - and nothing moved to get there.

const COLS = 5, ROWS = 3;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const art = await loadHwClover();

// Nothing here is `unmask`: at rest every fruit is clipped to its own cell,
// which is what makes the promotion visible.
const reels = new ReelSetBuilder()
  .reels(COLS).visibleCells(ROWS)
  .symbolSize(CELL.width, CELL.height).symbolGap(COLUMN_GAP, ROW_GAP)
  .symbols((r) => { for (const id of CLOVER_FRUITS) r.register(id, CloverSymbol, { art, idleAfterLand: false }); })
  .maskStrategy(new RoundedRectMaskStrategy({ radius: CLOVER_CELL_RADIUS }))
  .speed('normal', CLOVER_SPEED)
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
reels.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 10);
app.stage.addChild(reels);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, reels.y + boardH + 24);
app.stage.addChild(hud);

const LINE = [0, 1, 2, 3, 4].map((reelIndex) => ({ reelIndex, cellIndex: 0 }));
const WIN = ['seven', 'seven', 'seven', 'seven', 'seven'];
const filler = () => CLOVER_FRUITS[Math.floor(Math.random() * CLOVER_FRUITS.length)];

/** Swell the top row past the grid edge, promoted for the length of the swell. */
async function showLine(promote) {
  // Promoting covers the INSTANCES at those cells. Held only for the beat, so
  // the next spin never inherits it.
  const drop = promote ? reels.promote(LINE) : null;
  const views = LINE.map((p) => reels.getReel(p.reelIndex).getSymbolAt(p.cellIndex).view);
  hud.text = promote
    ? 'promoted: the swell clears the grid edge and the reel beside it'
    : 'not promoted: the same tween, cut at the grid edge and covered by the next reel';
  try {
    await gsap.to(views.map((v) => v.scale), {
      x: 1.9, y: 1.9, duration: 0.55, ease: 'back.out(2)', stagger: 0.1,
      yoyo: true, repeat: 1, repeatDelay: 0.45,
    });
  } finally {
    for (const v of views) v.scale.set(1, 1);
    drop?.();
  }
}

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} reels.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    const settle = reels.spin();
    reels.setResult(WIN.map((id) => ({ visible: [id, filler(), filler()] })));
    await settle;
    await sleep(250);

    // Same tween twice, so the only difference on screen is the promotion.
    await showLine(false);
    await sleep(700);
    await showLine(true);

    hud.text = 'released - press spin to compare again';
    busy = false;
  },
};
