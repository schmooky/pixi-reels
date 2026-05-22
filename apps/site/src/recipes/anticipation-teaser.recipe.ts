// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app
//
// Anticipation teaser. pair setAnticipation with a buffer-above prefill so
// a slow reel approaches a known high-value symbol. The user literally sees
// the bonus coming as the reel decelerates.

const COIN = 'coin';
const COIN_CARD = { id: COIN, color: 0xfacc15, label: 'BIG', textColor: 0x6b5400 };

const CARD_IDS = CARD_DECK.map((c) => c.id);
function rv() { return CARD_IDS[Math.floor(Math.random() * CARD_IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleRows(3)
  .symbolSize(80, 80)
  .symbolGap(4, 4)
  .bufferSymbols(1)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD, COIN_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// Long anticipation delay so the teaser cell is clearly visible above the
// decelerating reel. Same pattern as the base anticipate-a-reel recipe.
reelSet.speed.addProfile('demo', { ...SpeedPresets.NORMAL, anticipationDelay: 1800 });
reelSet.setSpeed('demo');

return {
  reelSet,
  onSpin: async () => {
    // Land result. reels 3 and 4 will anticipate.
    // Explicit ColumnTarget form: bufferAbove on reels 3 and 4 holds the BIG
    // coin, so when those reels decelerate for the anticipation phase it is
    // visible at the top edge, "approaching" the visible area.
    const result = [
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()], bufferAbove: [COIN] },
      { visible: [rv(), rv(), rv()], bufferAbove: [COIN] },
    ];

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setAnticipation([3, 4]);
    reelSet.setResult(result.map((visible) => ({ visible })));
    await p;
  },
};
