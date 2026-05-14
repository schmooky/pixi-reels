// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app
//
// Anticipation teaser — pair setAnticipation with a buffer-above prefill so
// a slow reel approaches a known high-value symbol. The user literally sees
// the bonus coming as the reel decelerates.

const A = 'A', B = 'B', C = 'C';
const COIN = 'coin';
const COIN_CARD = { id: COIN, color: 0xfacc15, label: 'BIG', textColor: 0x6b5400 };

const VALUES = [A, B, C];
function rv() { return VALUES[Math.floor(Math.random() * VALUES.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleSymbols(3)
  .symbolSize(80, 80)
  .symbolGap(4, 4)
  .bufferSymbols(1)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD, COIN_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  // Long anticipation delay so the teaser cell is clearly visible above
  // the decelerating reel.
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1600 })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    // Land result — reels 3 and 4 will anticipate.
    const result = [
      [rv(), rv(), rv()],
      [rv(), rv(), rv()],
      [rv(), rv(), rv()],
      [rv(), rv(), rv()],
      [rv(), rv(), rv()],
    ];
    // Prefill BIG on the buffer-above of the anticipated reels — when they
    // slow down for the anticipation phase, the coin is visible at the top
    // edge, "approaching" the visible area.
    result[3][-1] = COIN;
    result[4][-1] = COIN;

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setAnticipation([3, 4]);
    reelSet.setResult(result);
    await p;
  },
};
