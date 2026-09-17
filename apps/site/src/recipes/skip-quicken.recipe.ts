// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// A PRESS THAT LANDS, NOT CUTS. `requestSkip({ mode: 'quicken' })`.
//
// Every slam places the frame and lands in the same tick. The landing beat
// still plays, but on symbols already parked, so a press reads as a cut - and
// on a teasing spin it hides the build-up. `mode: 'quicken'` frees the same
// reels a slam would (tease protection, stepwise, groups all apply) and asks
// each one for its landing instead: the tease ends, the stop delay is cut,
// the reel spins its frame in at full speed and bounces.
//
//   press 1 - reels 0-1 land through their stop, together. reels 2-4 tease
//   press 2 - reel 2's tease ends and it spins out. 3-4 keep teasing
//   press 3 - reel 3
//   press 4 - reel 4
//
// `speed: 'turbo'` lands every quickened reel on the turbo profile: its
// faster spin-out and its shorter bounce. The round's own profile otherwise.
//
// A slam still cuts: `requestSkip({ mode: 'slam' })` places whatever is still
// moving, quickened or not. Tapping the readout is that press, so the two
// can be compared on the same spin.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [2, 3, 4];
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
  // A long hold per reel, so there is room to press through it, and a slow
  // bounce, so a quickened landing is visibly a landing.
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1600, bounceDuration: 520 })
  // What a quickened reel lands on: the turbo spin-out and its short bounce.
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

// Tease outline: a thin dashed border on the reel's own bounds, blinking.
const glowLayer = new PIXI.Container();
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

// The numeric definition of "landed, not placed": the landing frame and the
// settle are a whole bounce apart on a quickened reel, and the same tick on a
// slammed one.
const landingAt = new Map();
reelSet.events.on('spin:reelLanding', (i) => landingAt.set(i, performance.now()));

let press = 0;
const idle = 'spin, then press to walk the board: quickened reels spin out and bounce';
hud.text = idle;
reelSet.events.on('spin:start', () => { press = 0; landingAt.clear(); hud.text = idle; });
// One event for both modes; `mode` says which press it was.
reelSet.events.on('skip:requested', ({ reels, mode }) => {
  press += 1;
  hud.text = mode === 'quicken'
    ? `press ${press}: quickened [${reels.join(', ')}] - landing through their stop`
    : `press ${press}: SLAMMED [${reels.join(', ')}] - placed, no spin-out`;
});
reelSet.events.on('spin:reelLanded', (i) => {
  const bounce = Math.round(performance.now() - (landingAt.get(i) ?? performance.now()));
  hud.text = `${hud.text.split('\n')[0]}\nreel ${i} settled ${bounce} ms after its landing frame`;
});

// The cut, for comparison: a slam on the same spin. Wired to the HUD click
// rather than the skip button, which is the quicken.
hud.eventMode = 'static';
hud.cursor = 'pointer';
hud.on('pointertap', () => reelSet.requestSkip({ mode: 'slam' }));

return {
  reelSet,
  cleanup: () => {
    for (const i of [...glows.keys()]) stopGlow(i);
    try { glowLayer.destroy({ children: true }); } catch {}
    try { hud.destroy(); } catch {}
  },
  // Every press goes through the same call. The engine decides which reels
  // this one frees, from `protect`; the mode decides how they land.
  onSkip: () => reelSet.requestSkip({ mode: 'quicken', speed: 'turbo' }),
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    reelSet.setAnticipation(TEASE, { stagger: 'sequential', protect: 'stepwise' });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
