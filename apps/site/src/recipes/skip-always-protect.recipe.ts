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

// Tease outline: a thin dashed border on the reel's OWN bounds, blinking.
// Not a filled plate and not a glow bigger than the reel - both of those sat
// outside the column and read as decoration on top of the board rather than as
// "this reel is the one still going".
//
// PixiJS has no dashed stroke, so the dashes are drawn as segments along each
// edge, inset by half the line width to keep the stroke inside the bounds.
const glowLayer = new PIXI.Container();
// ON TOP, not at index 0. A backlight can sit behind the reels because it is
// bigger than them and bleeds out at the edges; an outline drawn on the exact
// bounds would be covered by the opaque symbols themselves.
reelSet.addChild(glowLayer);
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
  const DASH = 7, GAP_ = 5, W = 1.5, inset = W / 2;
  const l = i * (SIZE + GAP) + inset, t = inset;
  const r = i * (SIZE + GAP) + SIZE - inset, b = TOTAL_H - inset;
  const g = new PIXI.Graphics();
  for (const [x1, y1, x2, y2] of [[l, t, r, t], [r, t, r, b], [r, b, l, b], [l, b, l, t]]) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    for (let d = 0; d < len; d += DASH + GAP_) {
      const e = Math.min(d + DASH, len);
      g.moveTo(x1 + ux * d, y1 + uy * d).lineTo(x1 + ux * e, y1 + uy * e);
    }
  }
  g.stroke({ width: W, color: 0xfef08a });
  glowLayer.addChild(g);
  // Hard on/off rather than a soft pulse - `steps(1)` is what makes it read as
  // a blink instead of a breathe.
  gsap.to(g, { alpha: 0.15, duration: 0.22, yoyo: true, repeat: -1, ease: 'steps(1)' });
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
