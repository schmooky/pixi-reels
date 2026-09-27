// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app,
//                   SilkGraphics, DebugPlaque, roundRectPath
//
// PROTECTED TEASE. Same long sequential anticipation as "Skip the tease", but
// the player can no longer skip past it without seeing it.
//
// `protect: 'once'` splits one skip press into two:
//   press 1 - reels 0 and 1 slam onto the two scatters immediately, reels
//             2-4 keep teasing. The player now KNOWS a feature is live and
//             can choose to watch it.
//   press 2 - the tease ends too, exactly like an unprotected skip.
//
// Without it, a press before the tease starts force-completes AnticipationPhase
// on every reel and the whole build-up is invisible. That is also where the
// information leak lives: if a scatterless skip lands instantly but a teasing
// one settles slower, response time alone tells the player what is coming.

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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1200 })
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

// Read-out of what each press actually did. `skip:requested` now reports which
// reels the slam lands and whether reels are still running after it.
// Grid-wide and two rows tall from the start, so the canvas is fitted to its
// final size.
const idle = 'press spin, then keep pressing\npress 1 lands the scatters, press 2 ends the tease';
const label = new DebugPlaque({ text: idle, color: 0xffcc44, minWidth: TOTAL_W, maxWidth: TOTAL_W });
label.position.set(0, TOTAL_H + 10);
reelSet.addChild(label);

reelSet.events.on('skip:requested', ({ reels, partial }) => {
  label.text = partial
    ? `press 1 - landed [${reels.join(', ')}], tease protected.\npress again to end it`
    : `press 2 - landed [${reels.join(', ')}], tease over`;
});
reelSet.events.on('spin:start', () => { label.text = idle; });
reelSet.events.on('spin:complete', () => { for (const i of [...glows.keys()]) stopGlow(i); });

return {
  reelSet,
  cleanup: () => {
    for (const i of [...glows.keys()]) stopGlow(i);
    try { glowLayer.destroy({ children: true }); } catch {}
    try { label.destroy({ children: true }); } catch {}
  },
  // One handler, two outcomes. The engine decides which, from `protect`.
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    const grid = [
      { visible: [rv(), SCAT, rv()] },
      { visible: [rv(), SCAT, rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
    ];

    const p = reelSet.spin();
    // setAnticipation BEFORE setResult, so a press queued in the pre-result
    // window (requestSkip) already knows there is a tease to protect.
    reelSet.setAnticipation(TEASE, {
      stagger: 'sequential',
      slowdown: { from: 0.4, to: 0.06, holdTo: 1.5 },
      protect: 'once',
    });
    await new Promise((r) => setTimeout(r, 200));
    reelSet.setResult(grid);
    await p;
  },
};
