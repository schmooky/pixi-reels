// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app
//
// Peek symbol from buffer-above.
//
// Each reel has a "PEEK" symbol prefilled in the buffer-above slot — the
// one cell that lives just above the visible window. During the spin, that
// symbol scrolls through the visible area before the random spin symbols
// take over, giving the player a brief glimpse of what's "next".

const TEASE = 'tease';
const TEASE_CARD = { id: TEASE, color: 0xff8c42, label: 'PEEK', textColor: 0xffffff };

// Pull three visible cards from the real CARD_DECK so the spin lands on
// registered symbols every time.
const CARD_IDS = CARD_DECK.map((c) => c.id);
function rv() {
  return CARD_IDS[Math.floor(Math.random() * CARD_IDS.length)];
}

// ── initialFrame seeds the FIRST spin's buffer-above ────────────────────
// Set frame[col][-1] = TEASE on every reel — this is exactly the convention
// `setResult` honours (after this release): negative indices target buffer-
// above slots, indexed from -1 (closest to visible) to -bufferAbove (furthest).
const initialFrame = [
  ['7', '8', '9'],
  ['7', '8', '9'],
  ['7', '8', '9'],
];
for (const col of initialFrame) col[-1] = TEASE;

const reelSet = new ReelSetBuilder()
  .reels(3)
  .visibleSymbols(3)
  .symbolSize(90, 90)
  .symbolGap(4, 4)
  .bufferSymbols(1)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD, TEASE_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 900 })
  .ticker(app.ticker)
  .initialFrame(initialFrame)
  .build();

return {
  reelSet,
  onSpin: async () => {
    // Land on a random grid AND re-seed the buffer-above with TEASE so the
    // next spin shows the peek again. The negative-index slot survives the
    // whole pipeline (pins + big-symbol coordinator + skip path) end-to-end.
    const result = [
      [rv(), rv(), rv()],
      [rv(), rv(), rv()],
      [rv(), rv(), rv()],
    ];
    for (const col of result) col[-1] = TEASE;

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(result);
    await p;
  },
};
