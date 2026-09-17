// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, StartPhase, StopPhase, PhaseCardSymbol,
//                   step, replaceStep, PIXI, gsap, app
//
// STAGGER CURVES. Replace the `delay` step on both built-in phases.
//
// The controller hands every reel a flat stagger, `spinDelay * index` to
// start and `stopDelay * index` to stop, and the `delay` step is the one
// place that number is spent. So a curve is one `replaceStep` per phase, and
// the profile keeps owning the unit:
//
//   start: a ripple out from the middle reel, one `spinDelay` per ring
//   stop:  gaps that grow (t to the 1.5). Reels 1-2 fall fast, reel 5 hangs.
//          Same budget as the flat stagger, `stopDelay * (reels - 1)`
//
// Both replacements keep `{ cut: true }`: they are waits, and a quicken press
// cuts them exactly as it cuts the flat ones. The second HUD line is
// measured, not scheduled: each landing relative to the first reel down.
//
// One interaction to know: a reel's stop cannot begin before its own
// `minimumSpinTime`, counted from ITS start. With a ripple start the outer
// reels start last, so a result that arrives early would floor them and
// reel 2 would land before reel 1. The demo hands the result over at 900 ms,
// after every floor, so the landings follow the stop curve alone. Expect the
// measured line to wander by up to one cell of spin-out per reel: the
// spin-out lands on a wrap, and each reel is at its own point in the cell.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const MID = (REELS - 1) / 2;
const PROFILE = { ...SpeedPresets.NORMAL, spinDelay: 90, stopDelay: 240, minimumSpinTime: 500 };
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const startDelay = (ctx) => Math.abs(ctx.reel.reelIndex - MID) * ctx.profile.spinDelay;
const stopDelay = (ctx) => {
  const t = ctx.reel.reelIndex / (REELS - 1);
  return ctx.profile.stopDelay * (REELS - 1) * Math.pow(t, 1.5);
};
// A 0 ms wait returns nothing, so the next step chains on the same frame.
// The built-in `delay` does the same.
const waitFor = (ctx, ms) => (ms > 0 ? ctx.wait(ms) : undefined);

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', PROFILE)
  .phases((f) => {
    f.register('start', StartPhase, {
      steps: (steps) => replaceStep(steps, 'delay',
        step('delay', (ctx) => waitFor(ctx, startDelay(ctx)), { cut: true })),
    });
    f.register('stop', StopPhase, {
      steps: (steps) => replaceStep(steps, 'delay',
        step('delay', (ctx) => waitFor(ctx, stopDelay(ctx)), { cut: true })),
    });
  })
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

// The schedule, from the same functions the steps run.
const schedule = (fn) => Array.from({ length: REELS }, (_, i) =>
  Math.round(fn({ reel: { reelIndex: i }, profile: PROFILE }))).join(' ');
const SCHEDULE = `start ${schedule(startDelay)} ms, stop ${schedule(stopDelay)} ms`;

const hud = new PIXI.Text({
  text: SCHEDULE,
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

let first = 0;
const landed = [];
reelSet.events.on('spin:start', () => {
  first = 0;
  landed.length = 0;
  hud.text = SCHEDULE;
});
reelSet.events.on('spin:reelLanded', (reelIndex) => {
  const now = performance.now();
  if (!first) first = now;
  landed[reelIndex] = Math.round(now - first);
  hud.text = `${SCHEDULE}\nlanded at +${landed.map((ms) => ms ?? '?').join(' +')} ms`;
});

return {
  reelSet,
  cleanup: () => {
    unwatch();
    try { hud.destroy(); } catch {}
  },
  onSkip: () => reelSet.requestSkip({ mode: 'quicken' }),
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    // After the last reel's minimumSpinTime floor, so only the curve shows.
    await new Promise((r) => setTimeout(r, 900));
    reelSet.setResult(grid);
    await p;
  },
};
