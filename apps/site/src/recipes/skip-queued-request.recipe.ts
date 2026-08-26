// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// PRESSING BEFORE THE SERVER ANSWERS. `requestSkip()`.
//
// `skipSpin()` THROWS before `setResult()` arrives, on purpose: there is
// nothing to land on yet, and slamming would put the reels on random buffer
// fill. `requestSkip()` queues the intent instead and fires it the instant the
// result lands.
//
// The result here is deliberately slow (1.4s) so the pre-result window is easy
// to hit. Tap during it and nothing appears to happen; the slam goes off the
// moment the grid arrives - and tease protection still applies to it, because
// `setAnticipation` was called BEFORE `setResult`. That ordering is the whole
// requirement: a press queued in this window can only protect a tease the
// engine already knows about.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [3, 4];
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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1200 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const hud = new PIXI.Text({
  text: '',
  style: { fontFamily: 'monospace', fontSize: 13, fill: 0xffcc44 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

const idle = 'spin, then tap IMMEDIATELY - before the result lands';
hud.text = idle;
reelSet.events.on('spin:start', () => { hud.text = idle; });
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  hud.text = `queued slam fired: landed [${reels.join(', ')}]${partial ? ' - tease protected' : ''}`;
});

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  // The canonical universal-button pattern: try the round-aware press, fall
  // back to the queue when it throws. One handler covers both windows.
  onSkip: () => {
    try {
      reelSet.skipSpin();
    } catch {
      reelSet.requestSkip();
      hud.text = 'too early to land - slam QUEUED until the result arrives';
    }
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    // BEFORE setResult, so a press queued in the window below sees the tease.
    reelSet.setAnticipation(TEASE, { stagger: 250, protect: 'once' });
    await new Promise((r) => setTimeout(r, 1400)); // slow "server"
    reelSet.setResult(grid);
    await p;
  },
};
