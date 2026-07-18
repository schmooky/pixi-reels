// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   loadMultiwaysSpines, buildMultiwaysSpineMap,
//                   multiwaysSkinName, MULTIWAYS_SYMBOL_IDS,
//                   MULTIWAYS_AUTHORED_REEL_H, MULTIWAYS_AUTHORED_CELL_W,
//                   PIXI, gsap, app

// PURE-TUMBLE MultiWays. no strip motion anywhere. Every play: the old
// board FALLS OUT, a fresh board (with a fresh per-reel shape) RAINS IN,
// then ways wins explode and cascade-refill until the chain dies. The
// all-tumble school on a per-spin-variable board.
//
// The tumble pipeline and the multiways pipeline compose without any
// special casing: `spin()` (default cascade mode. no { mode: 'standard' }
// override) runs fall-out → AdjustPhase (commits the `setShape` rolled
// for this play, stretching each reel's cells to reelPixelHeight / rows)
// → drop-in. The refill chain afterwards is the same
// `runCascade({ detectWinners, nextGrid })` every cascade recipe uses.

const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 360;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS;
const GAP = 4;

await loadMultiwaysSpines();

const SPINE_SCALE = REEL_PIXEL_HEIGHT / MULTIWAYS_AUTHORED_REEL_H;
const CELL_W = MULTIWAYS_AUTHORED_CELL_W * SPINE_SCALE;
const IDS = [...MULTIWAYS_SYMBOL_IDS];
const MIN_WAYS_REELS = 3;
const MAX_CASCADES = 4;

function randSymbol() {
  return IDS[Math.floor(Math.random() * IDS.length)];
}

function randomShape() {
  return Array.from({ length: REELS }, () =>
    MIN_ROWS + Math.floor(Math.random() * (MAX_ROWS - MIN_ROWS + 1)),
  );
}

function buildGridWithGuaranteedWin(shape) {
  const grid = shape.map((rows) =>
    Array.from({ length: rows }, () => randSymbol()),
  );
  if (Math.random() < 0.7) {
    const target = randSymbol();
    for (let c = 0; c < MIN_WAYS_REELS; c++) {
      const len = grid[c].length;
      const positions = new Set([0]);
      const extraCount = len >= 4 ? 2 : len >= 3 ? 1 : 0;
      while (positions.size < 1 + extraCount) {
        positions.add(Math.floor(Math.random() * len));
      }
      for (const row of positions) grid[c][row] = target;
    }
  }
  return grid;
}

function findAllWaysWins(grid) {
  const wins = [];
  for (const id of IDS) {
    let reelCount = 0;
    for (let c = 0; c < grid.length; c++) {
      if (grid[c].includes(id)) reelCount++;
      else break;
    }
    if (reelCount >= MIN_WAYS_REELS) wins.push({ id, reelCount });
  }
  return wins;
}

function collectAllWinners(grid, wins) {
  const winners = [];
  for (const win of wins) {
    for (let c = 0; c < win.reelCount; c++) {
      for (let row = 0; row < grid[c].length; row++) {
        if (grid[c][row] === win.id) winners.push({ reel: c, row });
      }
    }
  }
  return winners;
}

function applyCascade(grid, winners) {
  const winnersByReel = new Map();
  for (const w of winners) {
    if (!winnersByReel.has(w.reel)) winnersByReel.set(w.reel, new Set());
    winnersByReel.get(w.reel).add(w.row);
  }
  return grid.map((col, c) => {
    const winRows = winnersByReel.get(c);
    if (!winRows || winRows.size === 0) return [...col];
    const survivors = col.filter((_, row) => !winRows.has(row));
    const newCount = col.length - survivors.length;
    const newSymbols = Array.from({ length: newCount }, () => randSymbol());
    return [...newSymbols, ...survivors];
  });
}

// Every symbol is authored once per ROW COUNT (skins `<id>/size<rows>`,
// rows 2..7). The stretched multiways cell height reveals the reel's
// row count (cellH = reelPixelHeight / rows), so resize() re-skins the
// skeleton to the matching variant. One uniform SPINE_SCALE fits every
// skin: each size ladder implies the same authored reel height (~617).
// The high skeleton ships ALL SIX size variants in its DEFAULT skin (the
// size skins are empty selectors), so a naive load renders six stacked
// gold frames/backplates. the production runtime hides inactive sizes in
// code. Mirror that with a per-frame hook (spine-pixi-v8 runs it after
// state.apply, before world transforms): null every per-size slot that
// doesn't match the reel's row count. Slot-name grammar, from the export:
// high<N>_*, glow_<N>_*, radialGradient_<N>, and the two _<N>-suffixed
// corner slots. particle_2_* is a particle TYPE, not a size. shared.
function highSlotSize(name) {
  let m = name.match(/^high(\d)_/);
  if (m) return +m[1];
  m = name.match(/^high_frame_corner_large_(?:btm|top)_(\d)$/);
  if (m) return +m[1];
  m = name.match(/^glow_(\d)_/);
  if (m) return +m[1];
  m = name.match(/^radialGradient_(\d)$/);
  if (m) return +m[1];
  return null;
}

class MultiwaysSymbol extends SpineReelSymbol {
  resize(width, height) {
    super.resize(width, height);
    const spine = this.spine;
    if (!spine || !height) return;
    const rows = Math.max(2, Math.min(7, Math.round(REEL_PIXEL_HEIGHT / height)));
    const skinName = multiwaysSkinName(this.symbolId, rows);
    if (spine.skeleton.skin?.name !== skinName) {
      spine.skeleton.setSkinByName(skinName);
      spine.skeleton.setSlotsToSetupPose();
    }
    if (this.symbolId === 'high') {
      spine.beforeUpdateWorldTransforms = (s) => {
        for (const slot of s.skeleton.slots) {
          const size = highSlotSize(slot.data.name);
          if (size !== null && size !== rows) slot.setAttachment(null);
        }
      };
    }
    spine.update(0); // apply skin + slot gate now, not on the next tick
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .multiways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
  .symbolSize(CELL_W, SYMBOL_SIZE)
  .symbolGap(GAP, 0)
  .symbols((r) => {
    // Namespaced animation vocabulary: general/* + wins/*. `high` has no
    // explode clip, so cascade destroys on it fall back to the engine's
    // GSAP implode automatically.
    const spineMap = buildMultiwaysSpineMap(MAX_ROWS);
    for (const id of IDS) {
      r.register(id, MultiwaysSymbol, {
        spineMap,
        scale: SPINE_SCALE,
        idleAnimation: 'general/idle',
        landingAnimation: 'general/land',
        outAnimation: 'general/explode',
        winAnimation: 'wins/win',
        autoPlayLanding: true,
      });
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    // The opening reveal IS a tumble: `fall` animates the old board out,
    // `dropIn` rains the new one in. The cascade refills reuse `dropIn`.
    fall:   { duration: 260, ease: 'sine.in',       rowStagger: 30 },
    dropIn: { duration: 380, ease: 'back.out(1.3)', rowStagger: 35, distance: 'perHole' },
  })
  .ticker(app.ticker)
  .build();

// Seed a jagged silhouette on load (same trick as the strip-spin canvas).
const initialShape = randomShape();
const initialGrid = initialShape.map((rows) =>
  Array.from({ length: rows }, () => randSymbol()),
);
{
  const p = reelSet.spin({ mode: 'standard' });
  reelSet.setShape(initialShape);
  reelSet.setResult(initialGrid.map((visible) => ({ visible })));
  reelSet.skipSpin();
  await p;
}

return {
  reelSet,
  onSpin: async () => {
    const shape = randomShape();
    const stage0 = buildGridWithGuaranteedWin(shape);

    // Round 1. tumble reveal: old board falls out (fall config), the
    // AdjustPhase commits the new shape mid-flight, and the new board
    // rains in left-to-right at the new per-reel cell heights.
    reelSet.setDropOrder('ltr');
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 80));
    reelSet.setShape(shape);
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await p;
    await new Promise((r) => setTimeout(r, 150));

    // Ways-win cascade chain. same orchestrator as every cascade recipe.
    let cascadeCount = 0;
    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      detectWinners: (grid) => {
        if (cascadeCount >= MAX_CASCADES) return [];
        const wins = findAllWaysWins(grid);
        if (wins.length === 0) return [];
        return collectAllWinners(grid, wins);
      },
      nextGrid: (prev, winners) => {
        cascadeCount += 1;
        return applyCascade(prev, [...winners]);
      },
      pauseAfterDestroyMs: 60,
    });
  },
};
