// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted

const A = '7', B = '8', C = '9';
const S = 'scatter'; // scatter — registered as a custom card below
const IDS = [A, B, C, S];

const SCATTER_SYM = { id: S, color: 0xff6b35, label: 'SCAT', textColor: 0xffffff };

// Two scatters on reels 0 and 2 — anticipation holds reels 3 and 4.
const GRID = [
  [S, A, B],
  [A, B, C],
  [B, S, A],
  [C, A, B],
  [B, C, A],
];

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleSymbols(3)
  .symbolSize(90, 90)
  .symbolGap(4, 4)
  .symbols(r => {
    for (const sym of [...CARD_DECK, WILD_CARD, SCATTER_SYM]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// Longer anticipationDelay so the "hold" on reels 3+4 is clearly visible.
reelSet.speed.addProfile('demo', { ...SpeedPresets.NORMAL, anticipationDelay: 1800 });
reelSet.setSpeed('demo');

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 220));
    reelSet.setAnticipation([3, 4]);
    reelSet.setResult(GRID.map((visible) => ({ visible })));
    await p;
  },
};
