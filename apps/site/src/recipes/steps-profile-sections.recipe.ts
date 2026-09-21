// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, StopPhase, PhaseCardSymbol,
//                   step, insertBefore, insertAfter, PIXI, gsap, app
//
// A STEP YOU ADDED, TUNED FROM THE SPEED PROFILE.
//
// `steps-fx-per-profile` puts a step's numbers on the profile as flat fields
// (`breathMs`, `landGlow`). That works and it is global: every phase sees
// them, and nothing says which phase they belong to. A profile section says
// it. Both steps below are inserted into `StopPhase`, and everything that
// shapes them lives under `stop`, keyed by the step's own name:
//
//   stop: {
//     steps: { breath: { duration }, impact: { lift, duration, ease } },
//     whenAnticipated: { bounceDistance, steps: { impact: { ... } } },
//   }
//
// A step reads its own entry as `ctx.step`, in segment order — one object in
// the profile arrives as one entry. Nothing here branches on the speed name.
//
// `whenAnticipated` is the half no flat field can express: the engine merges
// it over the rest of the section for a reel that ran a tease TO ITS END, so
// reels 3 and 4 land on a deeper bounce and a heavier impact, and the same
// step draws them amber instead of blue off `ctx.anticipated`. A press that
// cuts a tease short puts that reel back on the regular landing.
//
// In TypeScript the two step names are declared once, next to the profile:
//
//   declare module 'pixi-reels' {
//     interface StopSteps {
//       breath: { duration?: number };
//       impact: { lift: number; duration?: number; ease?: string };
//     }
//   }
//
// …and `stop.steps` is then checked and autocompleted like any built-in's.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const TEASING = [3, 4];
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const PROFILES = {
  normal: {
    ...SpeedPresets.NORMAL,
    stopDelay: 200,
    anticipationDelay: 700,
    stop: {
      steps: {
        breath: { duration: 140 },
        impact: { lift: 8, duration: 420, ease: 'elastic.out(1, 0.35)' },
      },
      whenAnticipated: {
        bounceDistance: 30,
        steps: { impact: { lift: 24, duration: 900, ease: 'elastic.out(1, 0.22)' } },
      },
    },
  },
  turbo: {
    ...SpeedPresets.TURBO,
    stopDelay: 60,
    anticipationDelay: 300,
    stop: {
      steps: {
        breath: { duration: 0 },
        impact: { lift: 4, duration: 180, ease: 'power3.out' },
      },
      whenAnticipated: {
        bounceDistance: 14,
        steps: { impact: { lift: 11, duration: 340, ease: 'power2.out' } },
      },
    },
  },
};

let reelSet;
const fxLayer = new PIXI.Container();

// A beat, not an effect: it returns its wait, so the spin-out holds for it.
// `cut: true` means a quicken press skips it, in flight or upcoming.
const breath = (ctx) => {
  const ms = ctx.step[0]?.duration ?? 0;
  return ms > 0 ? ctx.wait(ms) : undefined;
};

// An effect, not a beat: it returns nothing, so the bounce starts on the same
// frame and this plays alongside it.
const impact = (ctx) => {
  const cfg = ctx.step[0] ?? {};
  const lift = cfg.lift ?? 0;
  if (lift <= 0) return;
  const seconds = (cfg.duration ?? 400) / 1000;

  gsap.killTweensOf(reelSet.pivot);
  gsap.fromTo(
    reelSet.pivot,
    { y: -lift },
    { y: 0, duration: seconds, ease: cfg.ease ?? 'elastic.out(1, 0.3)' },
  );

  // Amber for a reel that teased, blue for one that did not. `ctx.anticipated`
  // is the same fact `whenAnticipated` resolved on, so the colour and the
  // numbers can never disagree.
  const puff = new PIXI.Graphics()
    .ellipse(0, 0, SIZE * 0.5, 10 + lift * 0.4)
    .fill({ color: ctx.anticipated ? 0xf59e0b : 0x60a5fa });
  puff.position.set(ctx.reel.reelIndex * (SIZE + GAP) + SIZE / 2, TOTAL_H + 4);
  puff.alpha = 0.85;
  puff.scale.set(0.4, 0.5);
  fxLayer.addChild(puff);
  gsap.to(puff, { alpha: 0, duration: seconds, ease: 'power2.out' });
  gsap.to(puff.scale, {
    x: 1 + lift * 0.05,
    y: 1,
    duration: seconds,
    ease: 'power2.out',
    onComplete: () => {
      try { puff.destroy(); } catch {}
    },
  });
};

reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', PROFILES.normal)
  .speed('turbo', PROFILES.turbo)
  .phases((f) => f.register('stop', StopPhase, {
    steps: (steps) => insertAfter(
      insertBefore(steps, 'spinOut', step('breath', breath, { cut: true })),
      'land',
      step('impact', impact),
    ),
  }))
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
reelSet.addChild(fxLayer);

let current = 'normal';
const label = () => {
  const s = PROFILES[current].stop;
  const plain = s.steps.impact;
  const teased = s.whenAnticipated.steps.impact;
  return (
    `speed ${current} - breath ${s.steps.breath.duration} ms, ` +
    `impact lift ${plain.lift} px, on a teased reel ${teased.lift} px. tap to switch`
  );
};
const hud = new PIXI.Text({
  text: label(),
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
hud.eventMode = 'static';
hud.cursor = 'pointer';
hud.on('pointertap', () => reelSet.setSpeed(current === 'normal' ? 'turbo' : 'normal'));
reelSet.events.on('speed:changed', (profile) => {
  current = profile.name;
  hud.text = label();
});
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => {
    unwatch();
    gsap.killTweensOf(reelSet.pivot);
    try { fxLayer.destroy({ children: true }); } catch {}
    try { hud.destroy(); } catch {}
  },
  // A quicken that reaches a reel mid-tease cuts it, and that reel lands on
  // the section's own half: no `whenAnticipated`, blue puff, small lift.
  onSkip: () => reelSet.requestSkip({ mode: 'quicken' }),
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    reelSet.setAnticipation(TEASING, { stagger: 'sequential' });
    await p;
  },
};
