// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, anticipationForScatters,
//                   CardSymbol, CARD_DECK, PIXI, app
//
// A DIFFERENT CURVE PER REEL, BY TEASE ORDER.
//
// `slowdown` escalates by interpolating two numbers across the tease sequence.
// A curve cannot be interpolated that way - two curves of different lengths
// have no meaningful midpoint - so `curve` takes a FUNCTION instead:
//
//     curve: (order, total) => AnticipationSegment[]
//
// `order` is the reel's place in the anticipation set, NOT its reel index. So
// `setAnticipation([4, 2, 3], ...)` hands `order: 0` to reel 4. That is the
// same ordering `slowdown` interpolates over and `protect: 'stepwise'`
// releases in, so all three agree.
//
// Here each successive reel surges a little harder, crawls a little slower and
// holds a little longer - the escalating build-up, but with the whole shape
// under control rather than two endpoints.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 78, GAP = 4;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
    r.register(SCAT, CardSymbol, { color: 0xffcc44, label: 'F', textColor: 0x3a2600 });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 900, stopDelay: 110 })
  .ticker(app.ticker)
  .build();

const H = ROWS * SIZE + (ROWS - 1) * GAP;
const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

const lines = [];
reelSet.events.on('anticipation:reel', ({ reelIndex, order, total }) => {
  lines.push(`reel ${reelIndex} = tease order ${order}/${total - 1}`);
  hud.text = lines.join('   ');
});

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[0] = SCAT;

    lines.length = 0;
    hud.text = 'teasing...';

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 400));
    reelSet.setResult(grid);

    // Which reels tease comes straight off the result grid.
    const reels = anticipationForScatters(grid, { symbol: SCAT, trigger: 2 });
    reelSet.setAnticipation(reels, {
      stagger: 'sequential',
      curve: (order, total) => {
        // 0 for the first tease reel, 1 for the last.
        const f = total > 1 ? order / (total - 1) : 0;
        return [
          { speed: 1.4 + 0.8 * f, duration: 200, ease: 'power2.in' },
          {
            speed: 0.3 - 0.24 * f,
            duration: 420 + 260 * f,
            ease: 'power3.inOut',
            hold: 160 + 420 * f,
          },
        ];
      },
    });
    await p;
    hud.text = `${lines.join('   ')}  -  landed`;
  },
};
