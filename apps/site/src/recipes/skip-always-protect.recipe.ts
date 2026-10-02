// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app,
//                   SilkGraphics, DebugPlaque, roundRectPath
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
const TOTAL_W = REELS * SIZE + (REELS - 1) * GAP;

// Tease outline: a thin dashed border on the reel's OWN bounds, blinking.
// Not a filled plate and not a glow bigger than the reel - both of those sat
// outside the column and read as decoration on top of the board rather than as
// "this reel is the one still going".
//
// SilkGraphics (pixi-silk) dashes a stroke in the shader, round caps on every
// dash. `roundRectPath` traces the outline as one path so the dashes run on
// round the corners; it is inset by half the line width to stay inside the
// reel's bounds.
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
  const W = 1.5;
  const g = new SilkGraphics();
  roundRectPath(g, i * (SIZE + GAP) + W / 2, W / 2, SIZE - W, TOTAL_H - W, 4)
    .stroke({ width: W, color: 0xfef08a, dash: [7, 5], cap: 'round' });
  glowLayer.addChild(g);
  // Hard on/off rather than a soft pulse - `steps(1)` is what makes it read as
  // a blink instead of a breathe.
  gsap.to(g, { alpha: 0.15, duration: 0.22, yoyo: true, repeat: -1, ease: 'steps(1)' });
  glows.set(i, g);
};

reelSet.events.on('anticipation:reel', ({ reelIndex }) => startGlow(reelIndex));
reelSet.events.on('anticipation:reelEnd', ({ reelIndex }) => stopGlow(reelIndex));

let taps = 0;
let landedByPress = false;
const idle = 'spin, then tap as much as you like';
// Grid-wide from the start, so the canvas is fitted to its final size.
const hud = new DebugPlaque({ text: idle, color: 0xffcc44, minWidth: TOTAL_W, maxWidth: TOTAL_W });
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

reelSet.events.on('spin:start', () => { taps = 0; landedByPress = false; hud.text = idle; });
reelSet.events.on('skip:requested', ({ reels }) => { landedByPress = reels.length > 0; });

return {
  reelSet,
  cleanup: () => {
    for (const i of [...glows.keys()]) stopGlow(i);
    try { glowLayer.destroy({ children: true }); } catch {}
    try { hud.destroy({ children: true }); } catch {}
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
