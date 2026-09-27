// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, DebugPlaque

// PARALLEL nudges. every reel's tween fires at the same frame via
// `Promise.all([...])`. Reads as one synchronised beat; the whole cell
// of wilds drops into place together. Total time = duration (regardless
// of how many reels you're nudging).

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const FILLER = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const col3 = () => [filler(), filler(), filler()];

const NUDGE_COLS = [1, 2, 3];
const NUDGE_DURATION = 480;

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleCells(3)
  .symbolSize(72, 72)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of SYMBOLS) {
      r.register(sym.id, CardSymbol, {
        color: sym.color,
        label: sym.label,
        textColor: sym.textColor,
      });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

// Every nudge event under the reels: the reels that fired each one this
// spin, in order. Here each row fills in one beat: all three reels fire the
// same event in the same frame.
const W = reelSet.viewport.maskWidth;
const H = reelSet.viewport.maskHeight;
const fired = { start: [], complete: [] };
const hud = new DebugPlaque({ minWidth: W, maxWidth: W });
const render = () => {
  const reels = (list) => (list.length ? `reel=${list.join(',')}` : '-');
  hud.text = `nudge:start    ${reels(fired.start)}\nnudge:complete ${reels(fired.complete)}`;
};
render();
hud.position.set(0, H + 10);
reelSet.addChild(hud);

reelSet.events.on('spin:start', () => {
  fired.start = [];
  fired.complete = [];
  render();
});
reelSet.events.on('nudge:start', (info) => {
  fired.start.push(info.reelIndex);
  render();
});
reelSet.events.on('nudge:complete', (info) => {
  fired.complete.push(info.reelIndex);
  render();
});

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise((resolve) => setTimeout(resolve, 220));
    reelSet.setResult([col3(), col3(), col3(), col3(), col3()].map((visible) => ({ visible })));
    await p;

    // Let the eye settle on the landed board before the nudges begin.
    await new Promise((resolve) => setTimeout(resolve, 400));

    // PARALLEL. every call fires synchronously; `Promise.all` only waits
    // for the slowest one to finish. Total wall time = NUDGE_DURATION.
    await Promise.all(
      NUDGE_COLS.map((reel) =>
        reelSet.nudge(reel, {
          distance: 1,
          direction: 'forward',
          incoming: ['wild'],
          duration: NUDGE_DURATION,
        }),
      ),
    );
  },
};
