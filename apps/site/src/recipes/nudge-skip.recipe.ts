// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// SKIP NUDGE pattern.
//
// The handler runs a deliberately slow 1500ms-per-reel sequential nudge.
// While it's mid-tween the spin button morphs into a skip button — one
// tap calls `reelSet.skipNudge()` which fast-forwards the active tween
// to its landed state. The `nudge()` promise still resolves normally,
// so the consumer's success path (win re-detect, spotlight, whatever)
// runs unchanged — only the animation got cut short.

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const FILLER = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const col3 = () => [filler(), filler(), filler()];

const NUDGE_COLS = [1, 2, 3];
const NUDGE_DURATION = 1500;

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleSymbols(3)
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

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise((resolve) => setTimeout(resolve, 220));
    reelSet.setResult([col3(), col3(), col3(), col3(), col3()].map((visible) => ({ visible })));
    await p;
    await new Promise((resolve) => setTimeout(resolve, 320));

    // Sequential nudges, each 1.5s long. Tap the canvas button during
    // any of them to fast-forward — the loop's `await` resolves
    // immediately at that tween's landed state and the loop continues
    // with the next reel.
    for (const col of NUDGE_COLS) {
      await reelSet.nudge(col, {
        distance: 1,
        direction: 'down',
        incoming: ['wild'],
        duration: NUDGE_DURATION,
      });
    }
  },
  // No `onSkip` override needed — the RecipeRunner's built-in fallback
  // detects an in-flight nudge and calls `reelSet.skipNudge()` for us.
  // The recipe deliberately leaves the default behaviour in place so
  // readers can copy the minimal pattern.
};
