// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, anticipationForScatters, app, pickWeighted

// Anticipation on a horizontal set. The tease is written exactly as it is on a
// vertical one - `anticipationForScatters` scans reel 0, 1, 2, 3 and hands the
// trailing reels to `setAnticipation` - because reel INDEX is orientation
// -neutral. What moves is where those reels sit on screen.
//
// On a horizontal set reels march down Y, so "the last two reels tease" reads
// as the bottom two rows crawling sideways while the top two have already
// landed. Nothing in the tension code branches on orientation.

const A = '7', B = '8', C = '9';
const S = 'scatter';
const SCATTER_SYM = { id: S, color: 0xff6b35, label: 'SCAT', textColor: 0xffffff };

const REELS = 4; // strips, stacked down the screen
const CELLS = 5; // cells along each strip

// Two scatters land on reels 0 and 1 (the top two rows), so the trigger is met
// there and reels 2 and 3 - the bottom two rows - are the tease set.
const GRID = [
  [A, B, S, C, A],
  [B, S, A, C, B],
  [C, A, B, A, C],
  [A, C, C, B, A],
];

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(84, 64) // screen space: the strip advances by the 84px width
  .symbolGap(6, 6)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD, SCATTER_SYM]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights({ [A]: 10, [B]: 10, [C]: 10, [S]: 2 })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

// A long hold so the sideways crawl on the bottom rows is easy to watch.
reelSet.speed.addProfile('demo', { ...SpeedPresets.NORMAL, anticipationDelay: 1600 });
reelSet.setSpeed('demo');

return {
  reelSet,
  onSpin: async () => {
    const grid = GRID.map((visible) => ({ visible }));
    // Same call, same argument order, same result on either axis.
    const tease = anticipationForScatters(grid, { symbol: S, trigger: 2 });

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setAnticipation(tease, { stagger: 'sequential', slowdown: { from: 0.35, to: 0.12 } });
    reelSet.setResult(grid);
    await p;
  },
};
