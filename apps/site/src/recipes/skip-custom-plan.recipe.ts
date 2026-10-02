// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app,
//                   SilkGraphics, DebugPlaque, roundRectPath
//
// YOUR OWN RELEASE PLAN. `protect: 'always'` + `slamStop({ reels })`.
//
// The built-in modes cover the two common shapes: `'once'` ends the tease on
// the second press, `'stepwise'` walks it one reel per press. Anything else -
// release in pairs, outside-in, the highest-paying reel last - is a plan that
// belongs in game code, and the engine already has the lever for it.
//
// `'always'` is what makes it safe: it guarantees no player press can end a
// tease behind your back, so the queue below is the ONLY thing that releases
// tease reels. Without it, a press would race your plan.
//
// Here the three teasing reels come down in two beats instead of three.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [2, 3, 4];
const PLAN = [[4, 3], [2]]; // outside in, then the one nearest the scatters
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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1600 })
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

let queue = [];
let press = 0;
const idle = 'spin, then tap: rest of board -> reels 4+3 -> reel 2';
// Grid-wide from the start, so the canvas is fitted to its final size.
const hud = new DebugPlaque({ text: idle, color: 0xffcc44, minWidth: TOTAL_W, maxWidth: TOTAL_W });
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

reelSet.events.on('spin:start', () => {
  queue = PLAN.map((g) => [...g]);
  press = 0;
  hud.text = idle;
});
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  hud.text = `press ${press}: landed [${reels.join(', ')}]${partial ? '' : ' - round over'}`;
});

return {
  reelSet,
  cleanup: () => {
    for (const i of [...glows.keys()]) stopGlow(i);
    try { glowLayer.destroy({ children: true }); } catch {}
    try { hud.destroy({ children: true }); } catch {}
  },
  onSkip: () => {
    press += 1;
    if (press === 1) {
      // Press 1 is the engine's own group: everything outside the tease.
      // `'always'` stops it reaching any further.
      try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); }
      return;
    }
    const group = queue.shift();
    if (group) reelSet.slamStop({ reels: group });
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    reelSet.setAnticipation(TEASE, { stagger: 250, protect: 'always' });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
