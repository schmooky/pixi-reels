// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, WILD_CARD,
//                   PIXI, app, EmptySymbol

// EMPTY SYMBOL pattern.
//
// `EmptySymbol` is a {@link ReelSymbol} subclass that renders nothing
// and never animates. Register it against an id (here `'empty'`) to
// reserve a slot in the grid that produces NO visual output.
//
// Why this is useful (and why hold-and-win mechanics need it):
//   - Hold & Win bonuses spawn 1×1 "coin" pins on a grid that's
//     otherwise blank between respins. Real symbols would compete for
//     the player's attention with the pinned coins; an empty symbol
//     gets out of the way.
//   - Weighting an EMPTY id heavily (and a real symbol lightly) makes
//     valuable symbols feel rare and exciting — every coin landing on
//     an otherwise-blank board reads as a hit.
//   - Random fill still needs SOME id to put in each cell. EmptySymbol
//     is that id when "no symbol" is the desired visual.
//
// What this recipe runs:
//   - 3 reels, 3 visible rows. Symbol set is `{ coin, empty }`.
//   - Weights `{ coin: 1, empty: 6 }` — most cells land blank; coins
//     scatter sparsely (~1 in 7 by weight).
//   - Hit Spin to spin all three reels. Coins land in a sea of nothing.

const COIN = 'coin';
const EMPTY = 'empty';

const REELS = 3;
const ROWS = 3;
const CELL = 88;
const GAP = 6;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleSymbols(ROWS)
  .symbolSize(CELL, CELL)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    // Real symbol: a wild-card-styled "coin".
    registry.register(COIN, CardSymbol, {
      color: WILD_CARD.color,
      label: WILD_CARD.label,
      textColor: WILD_CARD.textColor,
    });
    // The empty cell: rendered as absolutely nothing.
    registry.register(EMPTY, EmptySymbol, {});
  })
  // Coins are rare; the strip is mostly blank.
  .weights({ [COIN]: 1, [EMPTY]: 6 })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

return { reelSet };
