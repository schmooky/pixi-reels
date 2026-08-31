// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// TEASE FOR N SYMBOLS, NOT FOR N MILLISECONDS.
//
// `duration` is a time budget, so how far a reel actually MOVES during a tease
// depends on the speed curve. Two reels teasing at different speeds pass a
// different number of symbols, and the crawl-in length going into the stop
// varies with them. If the tease is choreographed around symbols going past the
// window - "three more symbols and then it lands" - time is the wrong anchor.
//
// `cells: n` ends the tease once the reel has travelled n symbol pitches,
// whatever that takes. It reads a monotonic odometer (`reel.travelledCells`)
// that is never reset by the snap at the end of a spin, so it measures real
// travel rather than an estimate.
//
// `duration` stays as the BACKSTOP. A reel that comes to rest can never reach a
// travel target, and a tease that never ends is a hung spin - so the scripted
// time is the ceiling, not the length.
//
// The readout prints the cells actually covered per tease. It lands on the
// requested count regardless of which speed the curve picked.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 78, GAP = 4;
const TEASE = [2, 3, 4];
const CELLS = 4;
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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 600, stopDelay: 110 })
  .ticker(app.ticker)
  .build();

const H = ROWS * SIZE + (ROWS - 1) * GAP;
const hud = new PIXI.Text({
  text: `press spin - each tease runs exactly ${CELLS} symbols`,
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

// Measure on the REEL's own phase boundaries. The set-level
// `anticipation:reelEnd` fires at LANDING, which would fold the whole spin-out
// into the reading.
const marks = new Map();
const covered = new Map();
for (const i of TEASE) {
  reelSet.reels[i].events.on('phase:enter', (name) => {
    const cells = reelSet.reels[i].travelledCells;
    if (name === 'anticipation') marks.set(i, cells);
    if (name === 'stop' && marks.has(i)) covered.set(i, cells - marks.get(i));
  });
}

// Different speeds per reel on purpose: the covered count should NOT vary with
// them, which is the whole point of a travel anchor.
const SPEEDS = { 2: 0.55, 3: 0.3, 4: 0.14 };

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;
    marks.clear();
    covered.clear();

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 400));
    reelSet.setResult(grid);
    reelSet.setAnticipation(TEASE, {
      stagger: 200,
      // Generous ceiling so the CELLS target is what actually ends each tease.
      duration: 4000,
      curve: (order) => [{ speed: SPEEDS[TEASE[order]], duration: 220, ease: 'power2.inOut' }],
      cells: CELLS,
    });
    await p;

    hud.text = TEASE
      .map((i) => `reel ${i} @${SPEEDS[i]}x -> ${(covered.get(i) ?? 0).toFixed(2)} cells`)
      .join('   ');
  },
};
