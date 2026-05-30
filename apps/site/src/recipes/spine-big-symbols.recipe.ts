// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   loadGeneratedSpines, buildSpineMap, SharedRectMaskStrategy,
//                   PIXI, gsap, app, textures, blurTextures, SYMBOL_IDS,
//                   pickWeighted
//
// Big symbols rendered with Spine. a 2x2 wild placed at an anchor cell;
// the engine paints OCCUPIED across the rest of the block. Same mechanic
// as the CardSymbol big-symbols recipe, but each cell is a Spine skeleton
// with idle/landing/win/destroy animations baked in.
//
// Reuses the wild skeleton for the 2x2 BIGWILD. Spine scales the whole
// rig to whatever cell box the engine hands it without losing crispness.

await loadGeneratedSpines();

const REELS = 5;
const ROWS = 4;
// 140 = the spines' authored frame size. render 1:1 so the frame strokes
// stay crisp and the wild's overflowing 200 px W reads at its intended size.
const SIZE = 140;
const GAP = 4;

const SPINE_MAP = {
  '9':      'low_a',
  '10':     'low_k',
  J:        'low_q',
  Q:        'low_j',
  K:        'mid_1',
  A:        'high_1',
  wild:     'wild',
  bigWild:  'wild',
};
const IDS = Object.keys(SPINE_MAP);
const CARDS = IDS.filter((id) => id !== 'wild' && id !== 'bigWild');

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .maskStrategy(new SharedRectMaskStrategy())
  .symbols((registry) => {
    const spineMap = buildSpineMap(SPINE_MAP);
    for (const id of IDS) {
      registry.register(id, SpineReelSymbol, {
        spineMap,
        autoPlayLanding: true,
        // bigWild occupies a 2x2 block. render the spine at 2x scale
        // so the rig fills the block instead of sitting tiny in the
        // top-left cell with empty space around it.
        scale: id === 'bigWild' ? 2 : 1,
      });
    }
  })
  .weights(Object.fromEntries(CARDS.map((id, i) => [id, 12 - i])))
  // wild fills cells from the random pool; bigWild is anchor-only. placed
  // by the server, never by random fill, so weight 0 is mandatory.
  //
  // High zIndex on both wilds: their icon attachment is 200 px (vs the
  // 140 px frame), so the chunky W deliberately bleeds past the frame
  // border. Without the bump, the right-hand neighbour's frame would
  // paint OVER the overflow. 999 / 1000 puts wilds above every other
  // registered symbol (which default low) without colliding with the
  // engine's internal big-symbol convention (~500).
  .symbolData({
    wild:    { weight: 3, zIndex: 999 },
    bigWild: { weight: 0, zIndex: 1000, size: { w: 2, h: 2 } },
  })
  // Big symbols make the default 56px landing bounce look broken.
  // the 2x2 wild overshoots into adjacent cells. Zero the bounce so
  // the anchor lands flush on grid.
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

// Sync idle across every spine symbol once the spin fully completes.
// Reels touch down staggered, so per-symbol idle would also start
// staggered (each symbol's onActivate kicks idle independently). After
// spin:complete + a short wait for landing one-shots to finish, restart
// idle on every visible symbol so the breathing loops are time-aligned.
const LANDING_MS = 350;
function syncIdle() {
  for (let r = 0; r < reelSet.reelCount; r++) {
    const reel = reelSet.getReel(r);
    for (let row = 0; row < reel.visibleRows; row++) {
      const sym = reel.getSymbolAt(row);
      if (sym instanceof SpineReelSymbol) sym.stopAnimation();
    }
  }
}
reelSet.events.on('spin:complete', () => {
  setTimeout(syncIdle, LANDING_MS);
});

let spinCount = 0;
return {
  reelSet,
  nextResult: () => {
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => CARDS[Math.floor(Math.random() * CARDS.length)]),
    );
    // Drop a 2x2 bigWild every other spin so the demo always shows it.
    if (spinCount++ % 2 === 0) {
      const col = Math.floor(Math.random() * (REELS - 1));
      const row = Math.floor(Math.random() * (ROWS - 1));
      grid[col][row] = 'bigWild';
    }
    return grid;
  },
};
