// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// PARTIAL SLAM. A skip press that lands SOME reels and lets the others keep
// playing. `slamStop({ except: [3, 4] })` places reels 0-2 on the result this
// instant and leaves 3 and 4 running their own phase chains to a natural stop.
//
// Before this existed, skip was all-or-nothing: every slam entry point
// force-completed every reel's phase, and the one per-reel lever
// (`setStopDelays`) could only re-order stops, never make a single reel land
// NOW while another kept spinning.
//
// `{ reels: [...] }` is the complement, when it is easier to name the reels
// that should land than the ones that should not.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const KEEP = [3, 4]; // the reels a press must NOT land
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  // A long stop stagger so there is plenty of spin left to cut into.
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 420 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

const hud = new PIXI.Text({
  text: 'spin, then tap again to slam reels 0-2 only',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fontWeight: '600', fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

// `skip:requested` now reports WHICH reels the slam lands and whether reels
// are still running after it. `partial: true` is a slam that did not end the
// round, so a UI can keep the button live.
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  hud.text = partial
    ? `slammed [${reels.join(', ')}] - reels ${KEEP.join(' and ')} still spinning`
    : `slammed [${reels.join(', ')}] - round over`;
});
reelSet.events.on('spin:start', () => { hud.text = 'tap again to slam reels 0-2 only'; });
reelSet.events.on('spin:complete', () => { hud.text = 'every reel landed. reels 3-4 stopped on their own'; });

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  // The demo runner calls this on a second tap while spinning. A bare
  // `slamStop()` would land all five; the options object is what makes it
  // per-reel. `skipStage` is untouched, because a partial slam is not the
  // round-ending press.
  onSkip: () => reelSet.slamStop({ except: KEEP }),
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
