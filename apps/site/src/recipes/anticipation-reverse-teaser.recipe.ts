// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// The buffer teaser, on a reel that spins UP.
//
// Buffers are geometric: `bufferStart` is always the slot at the smaller main
// coordinate (above for vertical, left for horizontal) and `bufferEnd` the
// larger one. Direction never renames them. So the vertical teaser recipe's
// `bufferStart` - which parks the coin above the window on a forward reel -
// parks it on the side symbols have ALREADY left once the reel runs in reverse.
//
// The slot a reverse reel feeds through is the bottom one, so the approaching
// symbol goes in `bufferEnd`. You do not have to work that out per set: the
// engine derives it, and `reel.axis.feedEdge` reports 'start' on a forward reel
// and 'end' on a reverse one.

const COIN = 'coin';
const COIN_CARD = { id: COIN, color: 0xfacc15, label: 'BIG', textColor: 0x6b5400 };

const CARD_IDS = CARD_DECK.map((c) => c.id);
function rv() { return CARD_IDS[Math.floor(Math.random() * CARD_IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleCells(3)
  .symbolSize(80, 80)
  .symbolGap(4, 4)
  .direction('reverse')
  .bufferSymbols(1)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD, COIN_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

// feedEdge is derived from the axis polarity, never set twice. Reads 'end' here.
const FEED = reelSet.getReel(0).axis.feedEdge;

reelSet.speed.addProfile('demo', { ...SpeedPresets.NORMAL, anticipationDelay: 1800 });
reelSet.setSpeed('demo');

return {
  reelSet,
  onSpin: async () => {
    // Park the coin on whichever side this set feeds from, so the same code
    // teases correctly on a forward set too.
    const teaser = FEED === 'start' ? { bufferStart: [COIN] } : { bufferEnd: [COIN] };
    const result = [
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()], ...teaser },
      { visible: [rv(), rv(), rv()], ...teaser },
    ];

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setAnticipation([3, 4]);
    // Already ColumnTarget[]. do NOT re-wrap in { visible }, that drops the
    // buffer entry and the teaser silently disappears.
    reelSet.setResult(result);
    await p;
  },
};
