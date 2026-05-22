// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// Classic UK fruit-machine nudge demo. After every spin lands, the engine
// fires two nudges in sequence:
//   1. Reel 1 down by 1 — a wild slides in from the top.
//   2. Reel 3 up by 1   — a wild slides in from the bottom.
// One press shows both directions in one beat.

const SYMBOLS = [...CARD_DECK, WILD_CARD];

const FILLER = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const col3 = () => [filler(), filler(), filler()];

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleSymbols(3)
  .symbolSize(90, 90)
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
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// Log every nudge to the recipe console — useful for observing the
// `nudge:start` / `nudge:complete` pair.
reelSet.events.on('nudge:start', (info) => {
  console.log('[nudge:start]', info);
});
reelSet.events.on('nudge:complete', (info) => {
  console.log('[nudge:complete]', info);
});

return {
  reelSet,
  onSpin: async () => {
    // Land on a flat near-miss — no wilds visible anywhere.
    const p = reelSet.spin();
    await new Promise((resolve) => setTimeout(resolve, 220));
    reelSet.setResult([col3(), col3(), col3(), col3(), col3()].map((visible) => ({ visible })));
    await p;

    // Give the eye a beat to register the landed board.
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 1. Nudge reel 1 DOWN by 1 — `wild` enters from the top.
    await reelSet.nudge(1, {
      distance: 1,
      direction: 'down',
      incoming: ['wild'],
      duration: 420,
    });

    // 2. Nudge reel 3 UP by 1 — `wild` enters from the bottom.
    await reelSet.nudge(3, {
      distance: 1,
      direction: 'up',
      incoming: ['wild'],
      duration: 420,
    });
  },
};
