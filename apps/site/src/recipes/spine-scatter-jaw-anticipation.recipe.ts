// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   anticipationForScatters, loadThunderkickSpines,
//                   buildThunderkickSpineMap, app, pickWeighted
//
// Scatter near-win with the rig's own tease clips. The scatter skeleton
// ships `firstReelScatterNearWin` (the jaw snap for the LEFTMOST scatter),
// `nearWinStart`/`nearWinLoop` (held excitement while the tease runs),
// `lastReelScatterNearWin` (the RIGHTMOST jaw pose on the deciding land)
// and `bonusGameWon` for the payoff. Spins alternate hit / miss.

await loadThunderkickSpines();

const SPINE_SCALE = 0.6;
const CELL_W = 175 * SPINE_SCALE;
const CELL_H = 203 * SPINE_SCALE;

const spineMap = buildThunderkickSpineMap();

const weights = {
  low1: 16, low2: 16, low3: 14, low4: 14, low5: 12,
  mid1: 9, mid2: 8, mid3: 7, mid4: 6,
  high: 4, wild: 3,
};

const ROWS_PER_REEL = [3, 4, 4, 4, 4, 3];
const LAST = ROWS_PER_REEL.length - 1;

const cache = new SpinTextureCache({ renderer: app.renderer });
const createInner = () =>
  new SpineReelSymbol({
    spineMap,
    scale: SPINE_SCALE,
    landingAnimation: 'land',
    autoPlayLanding: true,
  });

prewarmSpinTextures({
  cache,
  ids: [...Object.keys(weights), 'scatter'],
  createSymbol: createInner,
  width: CELL_W,
  height: CELL_H,
});

const reelSet = new ReelSetBuilder()
  .reels(6)
  .visibleCellsPerReel(ROWS_PER_REEL)
  .reelAnchor('center')
  .symbolSize(CELL_W, CELL_H)
  .symbolGap(0, 0)
  .symbols((r) => {
    for (const id of [...Object.keys(weights), 'scatter']) {
      r.register(id, StaticSpinSymbol, { createInner, cache, blurRampMs: 160 });
    }
  })
  .weights(weights)
  // Scatter art (jaw!) and the wild overflow their 175x203 tile - keep them
  // painted above neighbouring cells.
  .symbolData({ scatter: { zIndex: 10 }, wild: { zIndex: 5 } })
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 500 })
  .speed('turbo', { ...SpeedPresets.TURBO, anticipationDelay: 250 })
  .ticker(app.ticker)
  .build();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The live SpineReelSymbol behind a landed cell, or null while spinning. */
function spineAt(reel, row) {
  const sym = reelSet.getReel(reel).getSymbolAt(row);
  const inner = sym instanceof StaticSpinSymbol ? sym.inner : sym;
  return inner instanceof SpineReelSymbol ? inner : null;
}

let scatterCells = []; // [{ reel, row }] for the current spin, left to right
let armReel = -1;      // reel whose landing starts the tease (2nd scatter)
let won = false;

// Per-reel zIndex only sorts within one reel's container, and the reel to
// the right draws on top - so a landed scatter's jaw overflow gets clipped
// by its right neighbour AND by the reel mask. Promote landed scatters
// into viewport.spotlightContainer (the same above-mask layer the win
// spotlight uses): above every reel, outside the mask. Restored on the
// next spin:start before the reels move again.
const promoted = [];
let spinGen = 0; // bumped on spin:start so stale timers can't promote mid-spin
function promoteScatter(reel, row) {
  const sym = reelSet.getReel(reel).getSymbolAt(row);
  if (!sym) return;
  const view = sym.view;
  const layer = reelSet.viewport.spotlightContainer;
  if (view.parent === layer) return;
  const globalPos = view.getGlobalPosition();
  promoted.push({ view, parent: view.parent, x: view.x, y: view.y });
  layer.addChild(view);
  const local = layer.toLocal(globalPos);
  view.position.set(local.x, local.y);
}

reelSet.events.on('spin:reelLanded', async (reelIndex) => {
  const landedScatters = scatterCells.filter((c) => c.reel === reelIndex);
  if (landedScatters.length > 0) {
    // Let the stop bounce settle, then lift the jaw above mask + neighbours.
    const gen = spinGen;
    sleep(380).then(() => {
      if (gen !== spinGen) return; // a new spin superseded this land
      for (const c of landedScatters) promoteScatter(c.reel, c.row);
    });
  }

  if (reelIndex === armReel) {
    // Let the `land` one-shots finish, then arm the near-win show:
    // the LEFTMOST scatter snaps its jaw, every landed scatter holds
    // the excited loop while the remaining reels tease.
    await sleep(380);
    for (const [i, c] of scatterCells.entries()) {
      if (c.reel > reelIndex) continue;
      const spine = spineAt(c.reel, c.row);
      if (!spine?.spine) continue;
      spine.playOnTrack(0, i === 0 ? 'firstReelScatterNearWin' : 'nearWinStart');
      spine.spine.state.addAnimation(0, 'nearWinLoop', true, 0);
    }
    return;
  }

  if (reelIndex === LAST && won) {
    const lastCell = scatterCells[scatterCells.length - 1];
    const lastSpine = spineAt(lastCell.reel, lastCell.row);
    // The rightmost jaw pose on the deciding land, then the payoff on all.
    lastSpine?.playOnTrack(0, 'lastReelScatterNearWin');
    await sleep(380);
    for (const c of scatterCells) {
      const spine = spineAt(c.reel, c.row);
      if (!spine?.spine) continue;
      spine.playOnTrack(0, 'bonusGameWon');
      spine.spine.state.addAnimation(0, 'bonusGameWonLoop', true, 0);
    }
  }
});

reelSet.events.on('spin:start', () => {
  spinGen++;
  // Hand every promoted view back to its reel before the strip moves.
  for (const p of promoted) {
    p.parent.addChild(p.view);
    p.view.position.set(p.x, p.y);
  }
  promoted.length = 0;
});

reelSet.events.on('spin:complete', async () => {
  if (won || scatterCells.length === 0) return;
  // Near-win missed: hold the disappointment a beat, then back to idle.
  await sleep(700);
  for (const c of scatterCells) {
    spineAt(c.reel, c.row)?.stopAnimation();
  }
});

let spinCount = 0;

return {
  reelSet,
  onSpin: async () => {
    // Odd spins hit (3rd scatter on the rightmost reel), even spins miss.
    won = spinCount % 2 === 0;
    spinCount++;

    const grid = ROWS_PER_REEL.map((cells) =>
      Array.from({ length: cells }, () => pickWeighted(weights)),
    );
    const place = (reel) => {
      const row = Math.floor(Math.random() * grid[reel].length);
      grid[reel][row] = 'scatter';
      return { reel, row };
    };
    scatterCells = [place(0), place(2)];
    if (won) scatterCells.push(place(LAST));
    armReel = scatterCells[1].reel;

    const columns = grid.map((visible) => ({ visible }));
    const tease = anticipationForScatters(columns, {
      symbol: 'scatter',
      trigger: 2,
      mode: 'all-remaining',
    });

    const p = reelSet.spin();
    await sleep(220);
    reelSet.setResult(columns);
    reelSet.setAnticipation(tease, {
      stagger: 'sequential',
      slowdown: { from: 0.5, to: 0.12 },
    });
    await p;
  },
};
