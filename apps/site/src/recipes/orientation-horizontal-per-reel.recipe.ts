// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted

// The two knobs compose. Orientation is set-level and fixed at build();
// direction is per reel and can differ on every one of them.
//
// Here the strips run sideways and alternate: rows 0 and 2 scroll right, rows
// 1 and 3 scroll left, so the board weaves. No branch anywhere - each reel gets
// its own axis, and every phase (start, spin, stop, bounce) is written against
// that axis rather than against a sign.
//
// One build-time rule: a big symbol spanning more than one reel cannot mix with
// mixed per-reel directions, because the block coordinator assumes every reel
// it covers feeds from the same edge. `build()` throws rather than shipping a
// symbol that tears in half mid-spin.

const SYMBOLS = [...CARD_DECK, WILD_CARD];

const weights = {
  '7': 20, '8': 20, '9': 20,
  '10': 14, J: 14,
  Q: 10, K: 6, A: 5,
  wild: 3,
};

const REELS = 4;
const CELLS = 5;

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(84, 64)
  .symbolGap(6, 6)
  .directionPerReel(['forward', 'reverse', 'forward', 'reverse'])
  .symbols((r) => {
    for (const sym of SYMBOLS) {
      r.register(sym.id, CardSymbol, {
        color: sym.color,
        label: sym.label,
        textColor: sym.textColor,
      });
    }
  })
  .weights(weights)
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => pickWeighted(weights)),
    ),
};
