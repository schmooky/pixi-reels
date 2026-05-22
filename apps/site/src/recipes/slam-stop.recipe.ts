// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted

const A = '7', B = '8', C = '9';
const SEVEN = 'A'; // premium card stand-in for the original royal "seven"
const IDS = [A, B, C, SEVEN];

const GRID = [
  [SEVEN, A, B],
  [C, SEVEN, A],
  [B, C, SEVEN],
  [A, SEVEN, B],
  [C, A, SEVEN],
];

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleRows(3)
  .symbolSize(90, 90)
  .symbolGap(4, 4)
  .symbols(r => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    // requestSkip queues until setResult arrives. call it from a player tap
    // anywhere in the round and the engine will land as soon as it has a
    // target, no race-window to manage in your UI code.
    setTimeout(() => reelSet.requestSkip(), 560);
    // Server response arrives a moment later. requestSkip is already armed.
    setTimeout(() => reelSet.setResult(GRID.map((visible) => ({ visible }))), 800);
    await p;
  },
};
