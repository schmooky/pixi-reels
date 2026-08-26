// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// A TEASE NO PRESS CAN END. `protect: 'always'`.
//
// The first press lands every reel outside the tease, exactly like `'once'`.
// Every press after that is a deliberate no-op: the tease reels play out in
// full, however many times the player taps.
//
// Use it when the tease IS the reward beat and cutting it costs more than the
// impatience does - a jackpot reveal, a final-reel bonus land, the last spin
// of a free-spins round. Note that `slamStop()` still lands everything: the
// engine reserves an unconditional exit for the game's own code (an abort, a
// timeout, a disconnect), it only refuses the PLAYER's press.

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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1400 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

// Tease highlight, drawn with Graphics. No atlas fetch: the glow is pure
// decoration here and the demo is about skip semantics, so a missing sprite
// sheet must not be able to take the whole recipe down with it.
const glowLayer = new PIXI.Container();
reelSet.addChildAt(glowLayer, 0);
const glows = new Map();
const stopGlow = (i) => {
  const g = glows.get(i);
  if (!g) return;
  gsap.killTweensOf(g);
  try { g.destroy(); } catch {}
  glows.delete(i);
};
const startGlow = (i) => {
  stopGlow(i);
  const g = new PIXI.Graphics()
    .roundRect(i * (SIZE + GAP) - 6, -6, SIZE + 12, TOTAL_H + 12, 8)
    .fill({ color: 0xfef08a });
  g.alpha = 0.14;
  glowLayer.addChild(g);
  // Slow breathing pulse for as long as the reel is teasing.
  gsap.to(g, { alpha: 0.42, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  glows.set(i, g);
};

reelSet.events.on('anticipation:reel', ({ reelIndex }) => startGlow(reelIndex));
reelSet.events.on('anticipation:reelEnd', ({ reelIndex }) => stopGlow(reelIndex));

const hud = new PIXI.Text({
  text: '',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0xffcc44 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

let taps = 0;
let landedByPress = false;
const idle = 'spin, then tap as much as you like';
hud.text = idle;

reelSet.events.on('spin:start', () => { taps = 0; landedByPress = false; hud.text = idle; });
reelSet.events.on('skip:requested', ({ reels }) => { landedByPress = reels.length > 0; });

return {
  reelSet,
  cleanup: () => {
    for (const i of [...glows.keys()]) stopGlow(i);
    try { glowLayer.destroy({ children: true }); } catch {}
    try { hud.destroy(); } catch {}
  },
  onSkip: () => {
    taps += 1;
    landedByPress = false;
    try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); }
    // A press that landed nothing emits no skip events at all. that is how
    // `'always'` refuses one, rather than by throwing.
    hud.text = landedByPress
      ? `tap ${taps}: landed the reels around the tease`
      : `tap ${taps}: ignored - reels ${TEASE.join(' and ')} finish on their own`;
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    reelSet.setAnticipation(TEASE, { stagger: 'sequential', protect: 'always' });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
