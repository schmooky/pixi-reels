// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, PhaseCardSymbol, PHASE_CARD_COLORS, PIXI, app
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

// Legend: a swatch per phase, in lifecycle order, two rows so the long
// names do not run into each other.
const legend = new PIXI.Container();
const ORDER = ['rest', 'start', 'spin', 'anticipation', 'stop', 'landed'];
ORDER.forEach((phase, i) => {
  const x = (i % 3) * 130, y = TOTAL_H + 10 + Math.floor(i / 3) * 16;
  const swatch = new PIXI.Graphics().roundRect(x, y, 10, 10, 2).fill({ color: PHASE_CARD_COLORS[phase] });
  const label = new PIXI.Text({
    text: phase,
    style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 10, fill: 0x9c8f78 },
  });
  label.position.set(x + 14, y - 2);
  legend.addChild(swatch, label);
});
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
