// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, PhaseCardSymbol, PHASE_CARD_COLORS, PIXI, app,
//                   DebugPlaque
//
// SEE THE PHASE. `PhaseCardSymbol`.
//
// A CardSymbol that is grey at rest and takes the colour of the phase its
// reel is running, so a spin can be read straight off the board:
//
//   sky     start         accelerating from rest
//   blue    spin          full speed, waiting for the result
//   amber   anticipation  the tease (reels 4-5 here)
//   violet  stop          spinning the frame in, then the bounce
//   green   landed        one beat on the result, then grey
//
// The card does not know its reel. `PhaseCardSymbol.watch(reelSet.reels)`
// paints every card from each reel's own `phase:enter`, `landed` and
// `symbol:created` events, so a custom phase registered under its own key
// gets a colour too (`other`, or one you add through `colors`). Skip presses
// show why the symbol exists: a slam goes amber-or-blue straight to green,
// a quicken (see Skip & slam) shows the violet stop in between.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [3, 4];
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  // Slow enough that every colour is on screen long enough to read.
  .speed('normal', { ...SpeedPresets.NORMAL, accelerationDuration: 600, stopDelay: 350, anticipationDelay: 1400, bounceDuration: 500 })
  .ticker(app.ticker)
  .build();

// One call, every reel. Returns the release.
const unwatch = PhaseCardSymbol.watch(reelSet.reels);

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const TOTAL_W = REELS * SIZE + (REELS - 1) * GAP;

// Legend: a swatch per phase, in lifecycle order, read left to right. Three
// plaques of two rows each, so it stays two rows tall under the board.
const legend = new PIXI.Container();
const ORDER = ['rest', 'start', 'spin', 'anticipation', 'stop', 'landed'];
const COL_GAP = 6;
const COL_W = (TOTAL_W - COL_GAP * 2) / 3;
for (let col = 0; col < 3; col++) {
  const plaque = new DebugPlaque({
    rows: [ORDER[col], ORDER[col + 3]].map((phase) => ({ text: phase, swatch: PHASE_CARD_COLORS[phase] })),
    fontSize: 10,
    minWidth: COL_W,
  });
  plaque.position.set(col * (COL_W + COL_GAP), TOTAL_H + 10);
  legend.addChild(plaque);
}
reelSet.addChild(legend);

return {
  reelSet,
  cleanup: () => {
    unwatch();
    try { legend.destroy({ children: true }); } catch {}
  },
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    reelSet.setAnticipation(TEASE, { stagger: 'sequential' });
    await new Promise((r) => setTimeout(r, 400));
    reelSet.setResult(grid);
    await p;
  },
};
