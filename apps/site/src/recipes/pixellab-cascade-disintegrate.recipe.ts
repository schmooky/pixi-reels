// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, AnimatedSpriteSymbol, DropRecipes,
//           WinPresenter, loadPixellabSymbols, PIXI, gsap, app, pickWeighted,
//           runCascade.
//
// Cascade demo built on top of the pixellab-generated symbols. Each
// symbol ships two animation sequences: an idle/win `frame_NN.png` and
// a cascade-vanish `disintegrate_NN.png`. On a cluster hit, we play the
// disintegrate frames over each winning cell, then let runCascade drop
// replacements from above.

const IDS = ['cherry', 'seven', 'bell', 'diamond', 'bar'];
const COLS = 6, ROWS = 5, SIZE = 76;

const { frames, disintegrateFrames } = await loadPixellabSymbols(IDS);

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => {
    for (const id of IDS) {
      r.register(id, AnimatedSpriteSymbol, {
        frames,
        animationSpeed: 0.35,
        anchor: { x: 0.5, y: 0.5 },
      });
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120 })
  .cascade(DropRecipes.stiffDrop)
  .ticker(app.ticker).build();

// Overlay layer above the reel viewport — each disintegrate animation
// lives here for its ~600 ms life.
const fxLayer = new PIXI.Container();
reelSet.addChild(fxLayer);

/**
 * Play one symbol's disintegrate sequence over the given cell.
 *  - spawns an AnimatedSprite in the fx layer at the cell centre
 *  - fades the original cell's symbol view out simultaneously
 *  - resolves when the sequence finishes + sprite is disposed
 *
 * Uses PIXI.AnimatedSprite directly rather than a ReelSymbol so the
 * overlay doesn't collide with the reel's own symbol lifecycle.
 */
function playDisintegrate(cell, durationMs) {
  const reel = reelSet.getReel(cell.reelIndex);
  const cellSymbol = reel.getSymbolAt(cell.rowIndex);
  const seq = disintegrateFrames[cellSymbol.symbolId];
  if (!seq || seq.length === 0) {
    // No disintegrate sequence for this id — fall back to a plain fade.
    return new Promise(resolve => {
      gsap.to(cellSymbol.view, { alpha: 0, duration: durationMs / 1000, onComplete: resolve });
    });
  }
  const b = reelSet.getCellBounds(cell.reelIndex, cell.rowIndex);
  const sprite = new PIXI.AnimatedSprite(seq);
  sprite.anchor.set(0.5, 0.5);
  sprite.width = b.width;
  sprite.height = b.height;
  sprite.x = b.x + b.width / 2;
  sprite.y = b.y + b.height / 2;
  // Play the whole sequence across durationMs. PixiJS ticks AnimatedSprite
  // by `animationSpeed * ticker.deltaTime`; at 60 fps, 1.0 ~= one frame
  // per tick. Tune so total play time ~= durationMs.
  sprite.animationSpeed = (seq.length / (durationMs / 1000)) / 60;
  sprite.loop = false;
  fxLayer.addChild(sprite);

  // Hide the original cell while the overlay plays — avoids double-render.
  cellSymbol.view.alpha = 0;

  // The AI-generated sequence doesn't reliably end on "nothing" — most
  // prompts leave a muted / greyed silhouette on the final frame. We
  // fade the overlay's alpha to 0 over the second half of the sequence
  // so the visible end state is genuinely empty regardless of the art.
  // The crumble / shatter motion still reads clearly in the first half
  // at full alpha.
  gsap.to(sprite, {
    alpha: 0,
    duration: (durationMs * 0.55) / 1000,
    delay: (durationMs * 0.45) / 1000,
    ease: 'power2.in',
  });

  return new Promise(resolve => {
    sprite.onComplete = () => {
      sprite.destroy();
      resolve();
    };
    sprite.gotoAndPlay(0);
  });
}

// Cluster detection: pick the symbol id with the largest count on the
// board. If that count >= 4, return every cell of that id as the cluster.
// Simple enough to be obviously correct; a real game would use connected-
// component flood-fill or a payline eval.
function findLargestCluster(grid) {
  const counts = new Map();
  for (let c = 0; c < grid.length; c++) {
    for (let r = 0; r < grid[c].length; r++) {
      const id = grid[c][r];
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  let bestId = null; let bestCount = 0;
  for (const [id, n] of counts) {
    if (n > bestCount) { bestId = id; bestCount = n; }
  }
  if (!bestId || bestCount < 4) return { id: null, cells: [] };
  const cells = [];
  for (let c = 0; c < grid.length; c++) {
    for (let r = 0; r < grid[c].length; r++) {
      if (grid[c][r] === bestId) cells.push({ reel: c, row: r });
    }
  }
  return { id: bestId, cells };
}

/**
 * Produce the next stage: remove `winners` from `prev`, let remaining
 * cells fall, fill empty top slots with random picks.
 */
function tumbleStage(prev, winners) {
  const winSet = new Set(winners.map(w => `${w.reel},${w.row}`));
  return prev.map((col, c) => {
    const survivors = col.filter((_id, r) => !winSet.has(`${c},${r}`));
    const fresh = [];
    while (fresh.length + survivors.length < col.length) {
      fresh.push(IDS[Math.floor(Math.random() * IDS.length)]);
    }
    return [...fresh, ...survivors];
  });
}

const presenter = new WinPresenter(reelSet, { cycles: 1, cycleGap: 0 });
reelSet.events.on('spin:start', () => presenter.abort());

return {
  reelSet,
  onSpin: async () => {
    // Seed a guaranteed cluster on the first board so the demo always
    // shows off the disintegration at least once.
    let stage = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => IDS[Math.floor(Math.random() * IDS.length)])
    );
    const SEED = 'seven';
    const seedCells = [
      { c: 1, r: 2 }, { c: 2, r: 2 }, { c: 3, r: 2 }, { c: 4, r: 2 },
      { c: 2, r: 3 }, { c: 3, r: 3 },
    ];
    for (const { c, r } of seedCells) stage[c][r] = SEED;

    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setDropOrder('ltr');
    reelSet.setResult(stage);
    await p;
    await new Promise(r => setTimeout(r, 260));

    // Cascade loop — up to 4 stages. Each iteration:
    //   1. find the biggest cluster
    //   2. if >= 4 cells, disintegrate them + tumble
    //   3. if no cluster, stop
    const stages = [stage];
    let guard = 0;
    while (guard++ < 4) {
      const { cells } = findLargestCluster(stage);
      if (cells.length === 0) break;
      stage = tumbleStage(stage, cells);
      stages.push(stage);
    }

    if (stages.length <= 1) return;   // no wins

    // Fire WinPresenter so win:* events still flow for anyone listening.
    // We drive the vanish ourselves via onWinnersVanish below.
    await runCascade(reelSet, stages, {
      vanishDuration: 0,
      pauseBetween: 100,
      dropDuration: 380,
      onWinnersVanish: async (_rs, winners, stageIndex) => {
        if (winners.length === 0) return;
        // Fire win:* so external UI (sound, counters) can subscribe too.
        const cells = winners.map(w => ({ reelIndex: w.reel, rowIndex: w.row }));
        const presentationPromise = presenter.show([{ id: stageIndex, cells, value: winners.length * 25 }]);
        // And play the disintegrate frames per cell. Both run in parallel —
        // whichever finishes first just waits for the other.
        const disintegrateMs = 520;
        const pops = winners.map(w =>
          playDisintegrate({ reelIndex: w.reel, rowIndex: w.row }, disintegrateMs)
        );
        await Promise.all([presentationPromise, ...pops]);
      },
    });
  },
  cleanup: () => {
    presenter.destroy();
    fxLayer.destroy({ children: true });
  },
};
