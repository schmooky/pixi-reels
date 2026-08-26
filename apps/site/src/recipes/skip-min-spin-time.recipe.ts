// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// PER-REEL SPIN FLOOR. No slam here at all - this is the other half of skip
// granularity, the part that decides how early a reel is ALLOWED to stop.
//
// `minimumSpinTime` lives on the speed profile, so it is one value shared by
// every reel: the floor no reel can land under. `setStopDelays()` is per-reel
// but only re-orders stops on top of that floor, so the two levers used to
// miss each other - instant was only ever global, and per-reel could not go
// below the floor.
//
// `setMinimumSpinTime([...])` overrides it per reel. Here reels 0-2 may land
// the moment the result arrives while 3 and 4 are held for a full second,
// with no anticipation phase and no slam involved.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const FLOORS = [0, 0, 0, 1000, 1000];
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 0, minimumSpinTime: 0 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

// The face loads async from Google Fonts, and PIXI.Text bakes its metrics
// at construction. Without this the first paint measures the fallback and
// only corrects itself on the next label update.
await document.fonts.load('9px "Fira Code"');

// Per-reel floor labels, so it is clear which number holds which column.
const labels = [];
for (let i = 0; i < REELS; i++) {
  const t = new PIXI.Text({
    text: `${FLOORS[i]}ms\nfloor`,
    style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 9, fill: FLOORS[i] > 0 ? 0xfef08a : 0x6b7280 },
  });
  t.anchor.set(0.5, 0);
  t.style.align = 'center';
  t.position.set(i * (SIZE + GAP) + SIZE / 2, TOTAL_H + 8);
  reelSet.addChild(t);
  labels.push(t);
}

// A floor governs NATURAL landings only: a slam ignores `minimumSpinTime`
// by design, so a mid-spin tap lands every reel together and flattens the
// staircase. Say so rather than printing five near-identical times that read
// as the override having failed.
let slammed = false;
reelSet.events.on('spin:start', () => { slammed = false; });
reelSet.events.on('skip:requested', () => { slammed = true; });

// floor -> when the reel actually came to rest. The gap between columns is
// the floor doing its work; the shared baseline is accel + stop-out + bounce,
// which every reel pays either way.
// Seeded, not 0: a landing that somehow fires before `onSpin` set it would
// otherwise print time-since-page-load as the reel's landing time.
let t0 = performance.now();
reelSet.events.on('spin:reelLanded', (i) => {
  labels[i].text = slammed
    ? `${FLOORS[i]}ms\n-> slam`
    : `${FLOORS[i]}ms\n-> ${Math.round(performance.now() - t0)}ms`;
});

return {
  reelSet,
  cleanup: () => { for (const t of labels) { try { t.destroy(); } catch {} } },
  onSpin: async () => {
    // Persists across spin() and refill() until cleared with null, exactly
    // like setStopDelays(). Set once at boot in a real game.
    reelSet.setMinimumSpinTime(FLOORS);

    for (let i = 0; i < REELS; i++) {
      labels[i].text = `${FLOORS[i]}ms\nfloor`;
      labels[i].style.fill = FLOORS[i] > 0 ? 0xfef08a : 0x6b7280;
    }

    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    t0 = performance.now();
    // The result arrives early on purpose: reels 0-2 take it immediately,
    // 3 and 4 cannot act on it until their own floor has elapsed.
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setResult(grid);
    await p;
  },
};
