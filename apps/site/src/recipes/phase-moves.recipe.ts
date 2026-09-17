// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, PhaseCardSymbol, defaultMoves, PIXI, gsap, app
//
// MOVES: REPLACE A BEAT, KEEP THE PHASE. `builder.moves()`.
//
// The gsap beats the built-in phases play are hard-wired no longer. A move is
// one beat - the step-back pull and the acceleration of `StartPhase`, the
// bounce of `StopPhase`, the slow-down of the legacy tease - handed the reel,
// the profile, the numbers the default would use and an AbortSignal. It
// returns a gsap tween or timeline (killed on a slam), a promise (told to
// stop through the signal), or nothing.
//
// Three shapes here:
//   start.pull: null       the beat removed. No backwards twitch before launch
//   start.accelerate       wrapped: the default ramp, then a flash on the HUD
//   stop.bounce            replaced: one elastic settle instead of two legs.
//                          `ctx.followLifted` keeps lifted unmask art riding
//                          along, the same bookkeeping the default does
//
// A custom stop phase calling `this.bounce()` plays the replaced bounce too.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

let flash = () => {};

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 260, bounceDistance: 26, bounceDuration: 900 })
  .moves({
    start: {
      pull: null,
      accelerate: (ctx) => {
        flash(`reel ${ctx.reel.reelIndex + 1}: accelerating to ${ctx.targetSpeed} px/frame over ${ctx.duration} ms`);
        return defaultMoves.start.accelerate(ctx);
      },
    },
    stop: {
      bounce: (ctx) => gsap.fromTo(
        ctx.reel.container,
        { [ctx.reel.axis.mainProp]: ctx.base + ctx.distance },
        {
          [ctx.reel.axis.mainProp]: ctx.base,
          duration: ctx.duration / 1000,
          ease: 'elastic.out(1, 0.35)',
          onUpdate: ctx.followLifted,
        },
      ),
    },
  })
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

const hud = new PIXI.Text({
  text: 'spin: no pull on launch, an elastic settle on landing',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);
const lines = [];
flash = (line) => {
  lines.push(line);
  hud.text = lines.slice(-2).join('\n');
};
reelSet.events.on('spin:start', () => { lines.length = 0; });
reelSet.events.on('spin:complete', () => {
  hud.text = 'landed on the elastic bounce - spin again, or press mid-spin to slam';
});

return {
  reelSet,
  cleanup: () => {
    unwatch();
    try { hud.destroy(); } catch {}
  },
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
