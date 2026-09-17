// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, StopPhase, StartPhase, PhaseCardSymbol,
//                   step, insertAfter, replaceStep, removeStep, PIXI, gsap, app
//
// EDIT A BUILT-IN PHASE'S STEPS. `f.register('stop', StopPhase, { steps })`.
//
// A built-in phase runs a named list of steps in order. `StopPhase` runs
// `delay, spinOut, land, bounce`; `StartPhase` runs `delay, launch, pull,
// accelerate, announce`. Re-register the same class under the same key with
// `options.steps` and the phase hands you that list before it runs: insert a
// step, replace one, drop one. No subclass, no knowledge of the phase's
// insides beyond the names.
//
// A step is `step(name, (ctx) => result)`. `ctx` has the reel, the profile,
// the config, gsap, `container`, `main` (the travel-axis property), the phase,
// a `signal`, and `wait(ms)` / `until(pred)`. The result is a tween or
// timeline (killed on a slam), a promise, a cancellable such as what
// `ctx.phase.bounce()` returns, or nothing.
//
// Three edits here:
//   stop:  a flash step after `land`, an elastic bounce in place of the
//          built-in one (through `phase.bounce`, which keeps lifted art riding
//          along)
//   start: no `pull`, so the reel never twitches backwards on launch

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const plates = [];
const flash = (reelIndex) => {
  const g = plates[reelIndex];
  if (!g) return;
  gsap.killTweensOf(g);
  g.alpha = 0.55;
  return gsap.to(g, { alpha: 0, duration: 0.35, ease: 'power2.out' });
};

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 260, bounceDistance: 26, bounceDuration: 900 })
  .phases((f) => {
    f.register('stop', StopPhase, {
      steps: (steps) => replaceStep(
        insertAfter(steps, 'land', step('flash', (ctx) => flash(ctx.reel.reelIndex))),
        'bounce',
        step('bounce', (ctx) => ctx.phase.bounce({
          animation: (b) => b.gsap.fromTo(
            b.container,
            { [b.main]: b.base + b.distance },
            { [b.main]: b.base, duration: b.seconds, ease: 'elastic.out(1, 0.35)' },
          ),
        })),
      ),
    });
    f.register('start', StartPhase, {
      steps: (steps) => removeStep(steps, 'pull'),
    });
  })
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

// One backlight plate per reel, drawn under the symbols, lit by the `flash` step.
const plateLayer = new PIXI.Container();
reelSet.addChildAt(plateLayer, 0);
for (let i = 0; i < REELS; i++) {
  const g = new PIXI.Graphics().rect(i * (SIZE + GAP) - 6, -6, SIZE + 12, TOTAL_H + 12).fill({ color: 0xfef08a });
  g.alpha = 0;
  plateLayer.addChild(g);
  plates.push(g);
}

const hud = new PIXI.Text({
  text: 'spin: no pull on launch, a flash after land, an elastic settle',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => {
    unwatch();
    for (const g of plates) gsap.killTweensOf(g);
    try { plateLayer.destroy({ children: true }); } catch {}
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
