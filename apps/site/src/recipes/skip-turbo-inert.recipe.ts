// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// PROTECTION IS INERT WHEN THERE IS NO TEASE.
//
// Turbo and SuperTurbo set `anticipationDelay: 0`, so anticipation does not
// play on those profiles at all. Protecting a tease that never happens would
// stall the reels for nothing AND put back the response-time tell the feature
// exists to remove - so with an effective hold of `0` ms, `protect` does
// nothing and every press lands everything.
//
// Spins here alternate on the SAME turbo profile, with the same `protect`:
//   even - no `duration` override -> hold is 0 -> one press ends the spin
//   odd  - `duration: 900`        -> the tease plays -> protection engages
//
// So the rule is not "turbo disables protection", it is "no hold, no tease,
// nothing to protect". Pass `duration` when you want the tease in turbo too.

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
  // SuperTurbo timings under the default profile name. only one profile is
  // registered here, and the builder's `initialSpeed` is `'normal'`, so
  // registering it as `'turbo'` alone would fail validation at `build()`.
  .speed('normal', { ...SpeedPresets.SUPER_TURBO, name: 'normal', minimumSpinTime: 1200 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const hud = new PIXI.Text({
  text: 'spin, then tap. alternate spins add a duration override',
  style: { fontFamily: 'monospace', fontSize: 13, fill: 0xffcc44 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

let spinNo = 0;
let overridden = false;
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  hud.text = overridden
    ? `duration: 900 -> tease plays, press landed [${reels.join(', ')}]${partial ? ' only' : ''}`
    : `hold 0ms -> no tease to protect, press landed [${reels.join(', ')}]`;
});

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    overridden = spinNo++ % 2 === 1;
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    // Same call, same protect. only `duration` differs.
    reelSet.setAnticipation(TEASE, overridden
      ? { stagger: 200, protect: 'once', duration: 900 }
      : { stagger: 200, protect: 'once' });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
