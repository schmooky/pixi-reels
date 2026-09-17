// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, ReelPhase, PhaseCardSymbol,
//                   step, insertBefore, PIXI, gsap, app
//
// A CUSTOM PHASE ON THE STEP RUNNER. Same door the built-ins use.
//
// A phase is still a class with `onEnter` / `update` / `onSkip`. This one
// lets `runSteps()` do the sequencing: five named steps, one of them a wait
// marked `cut`. That buys three things without a line of extra code:
//
//   - a quicken skips the `hold` step and plays the rest. No `onSkip` branch
//   - a slam cancels whatever step is in flight before `onSkip` runs
//   - the game can edit the list, exactly as it edits `StopPhase`'s:
//     `f.register('stop', HoldStopPhase, { steps })`. Here it inserts a
//     `tick` step before the slide
//
// The flow: stop dead, place the frame a tenth of a cell short, hold there
// (the dramatic beat), slide in, land, bounce. Violet on the cards is the
// whole phase; press while violet and the hold is cut.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const HOLD_MS = 800;
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

let note = () => {};

class HoldStopPhase extends ReelPhase {
  name = 'stop';
  skippable = true;
  // "A quicken may reach my onSkip." It has nothing to do there, the runner
  // cuts `hold` for it, but the flag is what opts the phase in.
  quickenable = true;

  constructor(reel, speed, options = {}) {
    super(reel, speed);
    this._options = options;
  }

  // The list the game edits. Names are the public part.
  defaultSteps() {
    return [
      step('place', (ctx) => {
        const reel = ctx.reel;
        reel.forceSpeed(0);
        reel.placeStrip(ctx.config.targetFrame);
        this._rest = reel.axis.getMain(ctx.container);
        this._landed = false;
        reel.axis.setMain(ctx.container, this._rest - reel.axis.polarity * reel.symbolHeight * 0.1);
      }),
      // The wait a press may cut. `ctx.wait` resolves early when it is.
      step('hold', (ctx) => ctx.wait(HOLD_MS), { cut: true }),
      step('slide', (ctx) => {
        note(`reel ${ctx.reel.reelIndex + 1}: ${ctx.quickened ? 'hold CUT' : 'hold played'}, sliding in`);
        return ctx.gsap.to(ctx.container, {
          [ctx.main]: this._rest,
          duration: ctx.profile.slideMs / 1000,
          ease: 'power2.out',
        });
      }),
      step('land', (ctx) => {
        ctx.phase.land();
        this._landed = true;
      }),
      step('bounce', (ctx) => ctx.phase.bounce()),
    ];
  }

  onEnter() {
    const steps = this.defaultSteps();
    this.runSteps(this._options.steps ? this._options.steps(steps) : steps);
  }

  // Feeds `ctx.until()` and the runner; nothing else per frame.
  update() {
    this.tickSteps();
  }

  // Slam pose only. The base has already cancelled the step in flight and
  // aborted its signal, and a quicken never gets here for this phase's sake.
  onSkip(ctx) {
    if (ctx.mode === 'quicken') return;
    this.reel.axis.setMain(this.reel.container, this._rest ?? 0);
    if (!this._landed) { this._landed = true; this.land(); }
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 200, minimumSpinTime: 600, slideMs: 160 })
  // The game's edit of a phase it did not write: a tick before the slide.
  .phases((f) => f.register('stop', HoldStopPhase, {
    steps: (steps) => insertBefore(steps, 'slide', step('tick', (ctx) => {
      note(`reel ${ctx.reel.reelIndex + 1}: tick (inserted by the game)`);
    })),
  }))
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

const hud = new PIXI.Text({
  text: 'spin, then press while the cards are violet: the hold step is cut',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);
const lines = [];
note = (line) => {
  lines.push(line);
  hud.text = lines.slice(-2).join('\n');
};
reelSet.events.on('spin:start', () => {
  lines.length = 0;
  hud.text = 'spin, then press while the cards are violet: the hold step is cut';
});

// The other press, for comparison: tap the readout to slam.
hud.eventMode = 'static';
hud.cursor = 'pointer';
hud.on('pointertap', () => reelSet.requestSkip({ mode: 'slam' }));

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
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
