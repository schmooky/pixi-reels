// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, StartPhase, PhaseCardSymbol,
//                   step, insertAfter, replaceStep, PIXI, gsap, app
//
// A WIND-UP LAUNCH. Replace `pull` on StartPhase, insert `hold` after it.
//
// The built-in `pull` is a twitch: speed -2 for 50 ms, two pixels of
// backwards travel before the reel accelerates. A machine with weight drags
// back most of a cell, hangs for a beat, then goes. Two edits:
//
//   replaceStep(steps, 'pull', ...)           a longer, harder pull
//   insertAfter(steps, 'pull', step('hold'))  the beat at the top of it
//
// Both steps cover both motion models the way the built-in does: under the
// drive, name a target speed and wait; under the tween, tween `reel.speed`.
// The `accelerate` step that follows is untouched. It ramps from wherever
// the reel is, so the launch reads as one motion. Tap the readout to switch
// the wind-up off and compare against the stock twitch.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const WINDUP = { speed: -7, ms: 140 };
const STOCK = { speed: -2, ms: 50 };
const HOLD_MS = 90;
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

let windup = true;

const pull = (ctx) => {
  const reel = ctx.reel;
  const { speed, ms } = windup ? WINDUP : STOCK;
  if (reel.hasDrive) {
    reel.targetSpeed = speed;
    return ctx.wait(ms);
  }
  return ctx.gsap.to(reel, { speed, duration: ms / 1000, ease: 'power2.out' });
};

// The beat at the top of the pull: come to rest, hang, then `accelerate`
// takes it from 0. Instant when the wind-up is off.
const hold = (ctx) => {
  if (!windup) return;
  const reel = ctx.reel;
  if (reel.hasDrive) {
    reel.targetSpeed = 0;
    return ctx.wait(HOLD_MS);
  }
  return ctx.gsap.to(reel, { speed: 0, duration: HOLD_MS / 1000, ease: 'power1.out' });
};

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, spinDelay: 70, accelerationDuration: 360 })
  .phases((f) => f.register('start', StartPhase, {
    steps: (steps) => insertAfter(
      replaceStep(steps, 'pull', step('pull', pull)),
      'pull',
      step('hold', hold, { cut: true }),
    ),
  }))
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

const label = () => (windup
  ? `wind-up ON: pull ${WINDUP.speed} px/frame for ${WINDUP.ms} ms, hold ${HOLD_MS} ms, launch. tap to switch`
  : `wind-up OFF: stock pull ${STOCK.speed} px/frame for ${STOCK.ms} ms, no hold. tap to switch`);
const hud = new PIXI.Text({
  text: label(),
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
hud.eventMode = 'static';
hud.cursor = 'pointer';
hud.on('pointertap', () => {
  windup = !windup;
  hud.text = label();
});
reelSet.addChild(hud);

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
