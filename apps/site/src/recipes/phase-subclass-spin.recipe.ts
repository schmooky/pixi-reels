// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpinPhase, CardSymbol, CARD_DECK, PIXI, app
//
// SUBCLASS `SpinPhase`. Per-reel spin floor, decided by the phase itself.
//
// `SpinPhaseConfig.minimumSpinTime` has always documented an override of the
// profile's shared floor - and until the phase classes were exported there was
// no way to reach it, because registering through `PhaseFactory` meant writing
// a spin phase from scratch rather than subclassing one.
//
// `reelSet.setMinimumSpinTime([...])` is the ready-made version of this. Reach
// for the subclass when the floor is DERIVED rather than configured: read it
// off the reel, off game state at the moment the phase enters, off whatever
// the feature currently is. Here it comes from the reel index.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

// The rule the phase applies: each reel spins 250ms longer than the one left
// of it. A staircase no single profile value can express.
const floorFor = (reelIndex) => reelIndex * 250;

class StaircaseSpinPhase extends SpinPhase {
  onEnter(config) {
    // Merge, don't replace: the controller may already be passing a floor
    // (that is what `setMinimumSpinTime` does) and clobbering the whole
    // config would drop anything added to it later.
    super.onEnter({ ...config, minimumSpinTime: floorFor(this.reel.reelIndex) });
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, spinDelay: 0, stopDelay: 0, minimumSpinTime: 0 })
  .phases((f) => f.register('spin', StaircaseSpinPhase))
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const labels = [];
for (let i = 0; i < REELS; i++) {
  const t = new PIXI.Text({
    text: `floor ${floorFor(i)}ms`,
    style: { fontFamily: 'monospace', fontSize: 11, fill: i === 0 ? 0x6b7280 : 0xfef08a },
  });
  t.anchor.set(0.5, 0);
  t.position.set(i * (SIZE + GAP) + SIZE / 2, TOTAL_H + 8);
  reelSet.addChild(t);
  labels.push(t);
}

let t0 = 0;
reelSet.events.on('spin:reelLanded', (i) => {
  labels[i].text = `${floorFor(i)} -> ${Math.round(performance.now() - t0)}ms`;
});

return {
  reelSet,
  cleanup: () => { for (const t of labels) { try { t.destroy(); } catch {} } },
  onSpin: async () => {
    for (let i = 0; i < REELS; i++) labels[i].text = `floor ${floorFor(i)}ms`;
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    t0 = performance.now();
    // Result arrives early: reel 0 can act on it at once, each reel to its
    // right is held a further 250ms by the phase's own floor.
    await new Promise((r) => setTimeout(r, 100));
    reelSet.setResult(grid);
    await p;
  },
};
