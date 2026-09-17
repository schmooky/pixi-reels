// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, StopPhase, PhaseCardSymbol,
//                   step, insertBefore, PIXI, gsap, app
//
// ONE REEL, ONE EXTRA BEAT. A step that only acts on the last reel.
//
// Every reel runs the same list, so a per-reel beat is a step that returns
// nothing on the reels it does not concern. `insertBefore(steps, 'spinOut',
// step('suspense', ...))` waits 700 ms on reel 5 and is instant on 1-4.
//
// While it waits, the reel's backlight pulses, and the step owns the pulse
// both ways out: `ctx.wait` resolves early when the step is cut, and
// `ctx.signal` fires when it is cancelled. One `stop` handles the natural
// end, a quicken (the step is `cut`) and a slam. A press that comes before
// reel 5 reaches the hang skips the step outright: its stop is created
// already quickened, and a `cut` step never starts.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const LAST = REELS - 1;
const SUSPENSE_MS = 700;
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

let plate;
let outcome = null;

const suspense = (ctx) => {
  if (ctx.reel.reelIndex !== LAST) return;
  const started = performance.now();
  const pulse = gsap.fromTo(plate, { alpha: 0.1 }, {
    alpha: 0.5, duration: 0.22, yoyo: true, repeat: -1, ease: 'sine.inOut',
  });
  const stop = () => {
    pulse.kill();
    plate.alpha = 0;
    outcome = ctx.signal.aborted
      ? `hang cut after ${Math.round(performance.now() - started)} of ${SUSPENSE_MS} ms`
      : `hang played, ${SUSPENSE_MS} ms`;
  };
  ctx.signal.addEventListener('abort', stop, { once: true });
  return ctx.wait(SUSPENSE_MS).then(() => { if (!ctx.signal.aborted) stop(); });
};

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, spinDelay: 40, minimumSpinTime: 300, stopDelay: 160 })
  .phases((f) => f.register('stop', StopPhase, {
    steps: (steps) => insertBefore(steps, 'spinOut', step('suspense', suspense, { cut: true })),
  }))
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);

// The last reel's backlight, under the symbols.
plate = new PIXI.Graphics().rect(LAST * (SIZE + GAP) - 6, -6, SIZE + 12, TOTAL_H + 12).fill({ color: 0xfef08a });
plate.alpha = 0;
reelSet.addChildAt(plate, 0);

const IDLE = 'spin: reels 1-4 stop on the stagger, reel 5 hangs 700 ms first. press to cut the hang';
const hud = new PIXI.Text({
  text: IDLE,
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78, wordWrap: true, wordWrapWidth: REELS * (SIZE + GAP) },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);
reelSet.events.on('spin:start', () => {
  outcome = null;
  hud.text = IDLE;
});
reelSet.events.on('spin:reelLanded', (reelIndex) => {
  if (reelIndex !== LAST) return;
  hud.text = `reel ${LAST + 1}: ${outcome ?? 'hang skipped, the press came before it'}`;
});

return {
  reelSet,
  cleanup: () => {
    unwatch();
    gsap.killTweensOf(plate);
    try { plate.destroy(); } catch {}
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
