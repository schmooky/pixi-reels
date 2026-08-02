// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, StaticSpinSymbol,
//           SpinTextureCache, prewarmSpinTextures, loadSpineSet,
//           PIXI, gsap, app, pickWeighted

// Turbo hybrid: same strip-spin opener + 'low1' -> 'mid1' chain, tuned
// for speed. The strip-spin runs the TURBO profile on cached snapshot
// textures (StaticSpinSymbol. no skeleton ticks while spinning); the
// cascade runs a shorter dropIn and a faster explode. SpeedPresets
// controls the strip phases, .tumble() + timeScale the cascade.

const cascade = await loadSpineSet("cascade");

const IDS = [...cascade.symbolIds];
const REELS = 5, ROWS = 5;
// Cells match the authored 88x101.6 symbol plate.
const SCALE = 0.62;
const CELL_W = cascade.set.cellSize.width * SCALE;
const CELL_H = cascade.set.cellSize.height * SCALE;
const HIT_COLS = [0, 1, 2];                     // left three columns
const HIT_ROW = 1;                              // upper-middle cell
const TRIGGER1 = 'low1';
const TRIGGER2 = 'mid1';

function randSymbolNotIn(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; }
  while (exclude.has(s));
  return s;
}

// Faster than the normal-speed canvas: destruction done in ~0.4 s.
const EXPLODE_TIME_SCALE = 3.2; // 1.27 s clip -> ~24 frames

class TimedExplodeSymbol extends SpineReelSymbol {
  async playOut() {
    const entry = this.playOnTrack(0, 'explode', false);
    if (!entry) return;
    entry.timeScale = EXPLODE_TIME_SCALE;
    await new Promise((resolve) => { entry.listener = { complete: () => resolve() }; });
  }
}

// Static-spin setup: one scratch symbol bakes a static + blurred
// texture per id; the reels spin on those textures and the skeletons
// come back at land.
const cache = new SpinTextureCache({ renderer: app.renderer });
const createInner = () =>
  new TimedExplodeSymbol({
    spineMap: cascade.spineMap,
    scale: SCALE,
    outAnimation: 'explode',
  });

prewarmSpinTextures({
  cache, ids: [...cascade.symbolIds], createSymbol: createInner,
  width: CELL_W, height: CELL_H,
});

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(0, 0)
  .symbols((r) => {
    for (const id of cascade.symbolIds) {
      r.register(id, StaticSpinSymbol, { createInner, cache, blurRampMs: 120 });
    }
  })
  // The high symbol's head overflows its cell (the plate itself is
  // tile-sized). unmask renders it above the reel mask instead of
  // clipping it.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('turbo', { ...SpeedPresets.TURBO, stopDelay: 60, bounceDistance: 0, bounceDuration: 0 })
  .initialSpeed('turbo')
  .tumble({
    fall:   { duration: 0, ease: 'none', cellStagger: 0 },              // not used. refill skips fall
    dropIn: { duration: 233, ease: 'power2.in', cellStagger: 0, distance: 'perHole' },  // 14f
  })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => {
        if (HIT_COLS.includes(c)) {
          if (r === 0)        return TRIGGER2;  // 'mid1' on top. future cascade-2 cluster
          if (r === HIT_ROW)  return TRIGGER1;  // 'low1' in middle. current cluster
        }
        return randSymbolNotIn(new Set([TRIGGER1, TRIGGER2]));
      }),
    );

    const dropAtHitRow = (reel, fillTop) => {
      const next = [...reel];
      for (let r = HIT_ROW; r > 0; r--) next[r] = next[r - 1];
      next[0] = fillTop;
      return next;
    };

    // Round 1: turbo strip-spin on cached blur textures.
    const p = reelSet.spin({ mode: 'standard' });
    await new Promise((r) => setTimeout(r, 80));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await p;
    await new Promise((r) => setTimeout(r, 150));

    // Tightened chain: shorter destroy pause, faster drop-in.
    reelSet.setDropOrder('all');
    let trigger = TRIGGER1;
    await reelSet.runCascade({
      detectWinners: (grid) => HIT_COLS
        .map((c) => grid[c][HIT_ROW] === trigger ? { reel: c, cell: HIT_ROW } : null)
        .filter(Boolean),
      nextGrid: (prev, winners) => {
        const fill = randSymbolNotIn(new Set([TRIGGER1, TRIGGER2]));
        const out = prev.map((reel, c) =>
          winners.some((w) => w.reel === c)
            ? dropAtHitRow(reel, fill)
            : [...reel],
        );
        trigger = trigger === TRIGGER1 ? TRIGGER2 : '__none__';
        return out.map((visible) => ({ visible }));
      },
      pauseAfterDestroyMs: 83,
    });
  },
};
