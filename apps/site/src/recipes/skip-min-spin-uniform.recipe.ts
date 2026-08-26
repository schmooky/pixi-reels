// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// THE OTHER TWO SHAPES OF `setMinimumSpinTime`.
//
// A single number raises the floor on EVERY reel, and `null` clears the
// override and hands the floor back to the speed profile. Per-reel arrays get
// their own demo above; this one is about the lifecycle.
//
// Like `setStopDelays()`, the override PERSISTS across `spin()` and
// `refill()`. It is a setting, not a per-spin argument, so set it once at boot
// or when the player changes a preference - not inside every spin - and clear
// it deliberately with `null`. Spins here alternate between a 900ms uniform
// floor and the cleared state so the difference is visible back to back.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const FLOOR = 900;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  // Profile floor of 200ms, so the override is unmistakable when it applies.
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 0, minimumSpinTime: 200 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const hud = new PIXI.Text({
  text: 'press spin. alternate spins clear the override',
  style: { fontFamily: 'monospace', fontSize: 13, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

let spinNo = 0;
let t0 = 0;
let last = 0;
reelSet.events.on('spin:reelLanded', () => { last = Math.round(performance.now() - t0); });

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSpin: async () => {
    const cleared = spinNo++ % 2 === 1;
    // One call, both shapes. `null` is not "floor of 0", it is "use the
    // profile's own minimumSpinTime again".
    reelSet.setMinimumSpinTime(cleared ? null : FLOOR);

    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    t0 = performance.now();
    await new Promise((r) => setTimeout(r, 120));
    reelSet.setResult(grid);
    await p;

    hud.text = cleared
      ? `setMinimumSpinTime(null) -> profile floor 200ms, last reel at rest ${last}ms`
      : `setMinimumSpinTime(${FLOOR}) -> every reel held, last reel at rest ${last}ms`;
  },
};
