// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadSpineSet,
//           PIXI, gsap, app

// Cascades on a drum.
//
// This is the case the warp exists for. The bend lives on the RENDERED reel,
// not baked into each cell, so everything the tumble moves rides the curve for
// free: symbols exploding out, survivors sliding down, fresh ones dropping in
// from above the window. Nothing in the cascade code knows the reel is curved.
//
// On `curveMode('symbol')` each cell carries its own projection, so a falling
// symbol is re-projected every frame as it passes - correct, but the FALL
// itself is still a straight line down the flat grid. Here the fall follows
// the drum.
//
// Note what is NOT used: the flat `cascade-6x5-spine` recipe puts
// `unmask: true` on the high symbol so its head can overflow the mask. Under
// the warp that would backfire - a lifted symbol is outside the reel's texture
// and draws FLAT over a curved board. `curveBleed` is the warp's answer:
// the overflow stays inside the texture and bends with everything else.
//
// The bezel is not decoration here, it is REQUIRED. A drum whose middle cell
// is drawn 1:1 falls short of the window at both ends, and on a tumble board
// that band is a problem twice over:
//
//   - at the top it shows the BUFFER cell, which is the refill queue. It does
//     not slide when survivors fall, so it sits frozen while the grid drops
//     past it - the thing that reads most obviously as broken.
//   - at the bottom there is nothing to show at all. A pure tumble sets
//     `bufferSymbols({ end: 0 })`, so the strip simply ends and the band is a
//     hole onto the background.
//
// Framing it is the fix, and it is what a real cabinet does anyway.

const cascade = await loadSpineSet('cascade');

const IDS = [...cascade.symbolIds];
const REELS = 6;
const ROWS = 4;
const SCALE = 0.68;
const CELL_W = cascade.set.cellSize.width * SCALE;
const CELL_H = cascade.set.cellSize.height * SCALE;
const CLUSTER = 'low1';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];

function randSymbol(exclude) {
  let s;
  do {
    s = IDS[Math.floor(Math.random() * IDS.length)];
  } while (s === exclude);
  return s;
}

// The authored `explode` clip runs 1.27s, too long for this cascade's timing.
const EXPLODE_TIME_SCALE = 2.4;

class TimedExplodeSymbol extends SpineReelSymbol {
  async playOut() {
    const entry = this.playOnTrack(0, 'explode', false);
    if (!entry) return;
    entry.timeScale = EXPLODE_TIME_SCALE;
    await new Promise((resolve) => {
      entry.listener = { complete: () => resolve() };
    });
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(ROWS)
  .symbolSize(CELL_W, CELL_H)
  .symbolGap(0, 0)
  // Pure tumble: no strip scrolling, so no below-window buffer at all.
  .bufferSymbols({ start: 1, end: 0 })
  .curve(0.4)
  .curveFocus('set-lean')
  .curveMode('warp')
  .curveBleed(30) // the high symbol's head overflows its plate
  .renderer(app.renderer)
  .symbols((r) => {
    const spineMap = cascade.spineMap;
    for (const id of cascade.symbolIds) {
      r.register(id, TimedExplodeSymbol, { spineMap, scale: SCALE, outAnimation: 'explode' });
    }
  })
  // zIndex only. `unmask` would lift it out of the reel texture and it would
  // stop being warped - see the note at the top.
  .symbolData({ high: { zIndex: 10 } })
  .speed('normal', {
    ...SpeedPresets.NORMAL,
    stopDelay: 150,
    bounceDistance: 0,
    bounceDuration: 0,
  })
  .tumble({
    fall: { duration: 283, ease: 'power3.in', cellStagger: 67 },
    dropIn: { duration: 450, ease: 'power2.in', cellStagger: 67, distance: 'perHole' },
  })
  .ticker(app.ticker)
  .build();

// --- bezel -------------------------------------------------------------
// Measured, not guessed: `curve.mapMain(0)` is exactly where the drum's top
// edge lands, so the frame covers precisely the band that falls short.
const bw = reelSet.viewport.maskWidth;
const bh = reelSet.viewport.maskHeight;
const lip = Math.ceil(Math.max(...reelSet.reels.map((r) => (r.curve ? r.curve.mapMain(0) : 0)))) + 2;
const bezel = new PIXI.Graphics();
bezel.rect(0, 0, bw, lip).rect(0, bh - lip, bw, lip).fill({ color: 0x0a0910 });
bezel
  .moveTo(0, lip)
  .lineTo(bw, lip)
  .moveTo(0, bh - lip)
  .lineTo(bw, bh - lip)
  .stroke({ color: 0x2f2a44, width: 2 });
reelSet.addChild(bezel);

return {
  reelSet,
  onSpin: async () => {
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT_ROW && HIT_COLS.includes(c) ? CLUSTER : randSymbol(CLUSTER),
      ),
    );

    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 200));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;
    await new Promise((r) => setTimeout(r, 300));

    reelSet.setDropOrder('all');
    let detected = false;
    await reelSet.runCascade({
      detectWinners: () => {
        if (detected) return [];
        detected = true;
        return HIT_COLS.map((c) => ({ reel: c, cell: HIT_ROW }));
      },
      nextGrid: (prev, winners) => {
        const next = prev.map((reel) => [...reel]);
        for (const w of winners) {
          for (let r = w.cell; r > 0; r--) next[w.reel][r] = next[w.reel][r - 1];
          next[w.reel][0] = randSymbol(CLUSTER);
        }
        return next.map((visible) => ({ visible }));
      },
      pauseAfterDestroyMs: 250,
    });
  },
};
