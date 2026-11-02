import {
  insertBefore,
  PhaseCardSymbol,
  ReelPhase,
  ReelSetBuilder,
  SpeedPresets,
  step,
} from 'pixi-reels';
import { ownTap, readout, tapToSpin } from '@pixi-reels/kit';
import type { PhaseStep, Reel, SkipContext, SpeedProfile, StopPhaseConfig, StopPhaseOptions, StopStepContext } from 'pixi-reels';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Steps: edit a built-in without subclassing it',
  topic: 'docs/api-phases',
  tags: [],
} as const satisfies RecipeMeta;

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
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const IDS = ['9', '10', 'J', 'Q', 'K'];
  const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
  const HOLD_MS = 800;
  function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

  let note: (line: string) => void = () => {};

  type HoldProfile = SpeedProfile & { slideMs: number };

  class HoldStopPhase extends ReelPhase<StopPhaseConfig, HoldProfile> {
    name = 'stop';
    skippable = true;
    // "A quicken may reach my onSkip." It has nothing to do there, the runner
    // cuts `hold` for it, but the flag is what opts the phase in.
    quickenable = true;
    private _options: StopPhaseOptions<HoldProfile>;
    private _rest?: number;
    private _landed = false;

    constructor(reel: Reel, speed: HoldProfile, options: StopPhaseOptions<HoldProfile> = {}) {
      super(reel, speed);
      this._options = options;
    }

    // The list the game edits. Names are the public part.
    defaultSteps(): PhaseStep<StopStepContext<HoldProfile>>[] {
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
    onSkip(ctx: SkipContext<HoldProfile>) {
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
    .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 200, minimumSpinTime: 600, slideMs: 160 } as HoldProfile)
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
  const TOTAL_W = REELS * SIZE + (REELS - 1) * GAP;

  // Two rows reserved: the prompt wraps to two at the grid's width and the log
  // shows the last two notes, so the plate keeps the height the canvas was
  // fitted to.
  const hud = readout.plaque({
    text: 'spin, then press while the cards are violet: the hold step is cut',
    reserveRows: 2,
    minWidth: TOTAL_W,
    maxWidth: TOTAL_W,
  });
  hud.position.set(0, TOTAL_H + 10);
  reelSet.addChild(hud);
  const lines: string[] = [];
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
  hud.on('pointertap', (e) => { ownTap(e); reelSet.requestSkip({ mode: 'slam' }); });

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
      const p = reelSet.spin();
      await new Promise((r) => setTimeout(r, 250));
      reelSet.setResult(grid);
      await p;
    },
    skip: () => reelSet.requestSkip({ mode: 'quicken' }),
  });
  return {
    reelSet,
    cleanup: () => {
      unwatch();
      try { hud.destroy({ children: true }); } catch {}
    },
  };
}
