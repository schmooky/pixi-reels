// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// PARALLEL nudges — every reel's tween fires at the same frame via
// `Promise.all([...])`. Reads as one synchronised beat; the whole row
// of wilds drops into place together. Total time = duration (regardless
// of how many reels you're nudging).

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const FILLER = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const col3 = () => [filler(), filler(), filler()];

const NUDGE_COLS = [1, 2, 3];
const NUDGE_DURATION = 480;

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleRows(3)
  .symbolSize(72, 72)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of SYMBOLS) {
      r.register(sym.id, CardSymbol, {
        color: sym.color,
        label: sym.label,
        textColor: sym.textColor,
      });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

reelSet.events.on('nudge:start', (info) => {
  console.log(`[par] nudge:start reel=${info.reelIndex}`);
});
reelSet.events.on('nudge:complete', (info) => {
  console.log(`[par] nudge:complete reel=${info.reelIndex}`);
});

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise((resolve) => setTimeout(resolve, 220));
    reelSet.setResult([col3(), col3(), col3(), col3(), col3()].map((visible) => ({ visible })));
    await p;

    // Let the eye settle on the landed board before the nudges begin.
    await new Promise((resolve) => setTimeout(resolve, 400));

    // PARALLEL — every call fires synchronously; `Promise.all` only waits
    // for the slowest one to finish. Total wall time = NUDGE_DURATION.
    await Promise.all(
      NUDGE_COLS.map((col) =>
        reelSet.nudge(col, {
          distance: 1,
          direction: 'down',
          incoming: ['wild'],
          duration: NUDGE_DURATION,
        }),
      ),
    );
  },
};
