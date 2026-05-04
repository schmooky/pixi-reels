// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, app,
//           createEngine, loadKenneyBank, createReelAudio.

const REELS = 5;
const ROWS = 3;
const SIZE = 100;
const GAP = 6;

// Stiff landing — a 2px / 80ms bounce is barely perceptible, but snappy
// enough that the click lines up with the visual stop instead of trailing
// the default 56px / 600ms overshoot.
const STIFF_NORMAL = {
  ...SpeedPresets.NORMAL,
  name: 'normal',
  bounceDistance: 2,
  bounceDuration: 80,
};

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, { color: card.color, label: card.label });
    }
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .speed('normal', STIFF_NORMAL)
  .ticker(app.ticker)
  .build();

// createEngine does NOT touch the AudioContext. Safe to call before any
// user gesture; the unlock happens on the first spin click below.
const engine = createEngine({
  buses: { sfx: { level: 1.0 } },
});

// One subscription wires every reel landing to a thud with pitch + volume
// jitter. Returned disposer is called from cleanup() when the recipe
// component unmounts.
const audio = createReelAudio(reelSet, engine);
let unlocked = false;

return {
  reelSet,
  onSpin: async () => {
    if (!unlocked) {
      // First spin click is the gesture browsers require to start the
      // AudioContext. After unlock we can load and play sounds freely.
      await engine.unlock();
      await loadKenneyBank(engine);
      unlocked = true;
    }

    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)].id),
    );

    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(grid);
    await p;
  },
  cleanup: () => {
    audio.destroy();
    engine.close();
  },
};
