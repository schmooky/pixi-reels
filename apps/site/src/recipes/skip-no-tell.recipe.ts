// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// NO SKIP TELL. The reason to protect a tease rather than slow the skip down.
//
// Spins alternate: even spins have no scatters, odd spins have two and a
// protected tease on reels 2-4. Both auto-press skip at the same moment and
// the panel times how long the LAST NON-TEASE REEL takes to come to rest.
//
// The numbers stay equal, because on both spins the press lands reels 0-2 the
// same way. The tease changes what happens AFTER, on reels 3-4, not how fast
// the press answers.
//
// The alternative - keeping the tease skippable and raising `minimumSpinTime`
// so a teasing spin cannot land instantly - leaks the outcome through the
// response time itself. The player learns a feature is coming before a single
// reel has landed, from how the button felt.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [2, 3, 4];
const LAST_FREE = 1; // last reel that never teases, so it lands on the press
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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 900 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

let spinNo = 0;
let pressAt = 0;
let scattersThisSpin = false;
const times = { plain: null, tease: null };

const hud = new PIXI.Text({
  text: 'press spin. every spin auto-skips at the same moment',
  style: { fontFamily: 'monospace', fontSize: 13, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

const render = () => {
  const f = (v) => (v === null ? '  -' : `${String(Math.round(v)).padStart(3)}ms`);
  hud.text =
    `press -> reel ${LAST_FREE} at rest\n` +
    `  no scatters : ${f(times.plain)}\n` +
    `  2 scatters  : ${f(times.tease)}   (tease still running on ${TEASE.join(',')})`;
};
render();

// The last reel that is never part of the tease. what the player's eye reads
// as "the press answered".
reelSet.events.on('spin:reelLanded', (i) => {
  if (i !== LAST_FREE || !pressAt) return;
  const dt = performance.now() - pressAt;
  if (scattersThisSpin) times.tease = dt; else times.plain = dt;
  render();
});

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    scattersThisSpin = spinNo++ % 2 === 1;
    pressAt = 0;

    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    if (scattersThisSpin) {
      grid[0].visible[1] = SCAT;
      grid[1].visible[1] = SCAT;
    }

    const p = reelSet.spin();
    // setAnticipation BEFORE setResult: a press queued in the pre-result
    // window fires the instant the result lands, and can only protect a tease
    // that is already registered.
    if (scattersThisSpin) {
      reelSet.setAnticipation(TEASE, { stagger: 300, protect: 'once' });
    }
    await new Promise((r) => setTimeout(r, 300));
    reelSet.setResult(grid);

    // Same press, same moment, both kinds of spin.
    await new Promise((r) => setTimeout(r, 200));
    pressAt = performance.now();
    reelSet.skipSpin();

    await p;
  },
};
