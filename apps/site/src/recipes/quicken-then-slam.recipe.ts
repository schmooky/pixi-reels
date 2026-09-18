// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, PhaseCardSymbol, PIXI, gsap, app
//
// ONE BUTTON, TWO PRESSES. Quicken first, slam second.
//
//   press 1  requestSkip({ mode: 'quicken', speed: 'turbo', payload })  every
//            reel spins its frame in and bounces on the turbo profile - felt,
//            and still a landing
//   press 2  requestSkip({ mode: 'slam', payload })   whatever is still moving
//            is placed. The cut, for the player who really means it
//
// The engine keeps the two apart on purpose. A quicken press treats the reels
// it already quickened as down and walks on; a slam press cuts them. Both are
// skips: `skipStage` advances, `wasSkipped` is true, `SpinResult.skipMode`
// says which press ended it. On the PhaseCardSymbol cards press 1 turns every
// reel violet (the stop, spinning in); press 2 turns whatever is still violet
// grey at once. Wait the bounce out instead and press 2 has nothing to cut.
//
// The press rides on the events whole: `skip:requested` is `{ reels, partial,
// mode, speed?, payload? }`, the same context every phase's `onSkip(ctx)`
// got. The HUD reads the press number off `payload` and the profile off
// `speed.name`, from the event, with no counter of its own.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  // A slow round, so there is time to press twice.
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 350, minimumSpinTime: 900 })
  // What press 1 lands on: turbo's spin-out and its 200 ms bounce.
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

const hud = new PIXI.Text({
  text: 'spin, press once to quicken, press again to slam',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0xffcc44 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

// The one piece of state the button needs: has this round been quickened
// yet? Read off the engine's own event rather than counted locally, so a
// press that freed nothing (round already down) does not arm the slam.
let quickened = false;
reelSet.events.on('spin:start', () => {
  quickened = false;
  hud.text = 'spin, press once to quicken, press again to slam';
});
reelSet.events.on('skip:requested', ({ reels, mode, speed, payload }) => {
  if (mode === 'quicken') {
    quickened = true;
    hud.text = `press ${payload.press}: quickened [${reels.join(', ')}] on ${speed.name} - press again to slam`;
  } else {
    hud.text = `press ${payload.press}: slammed [${reels.join(', ')}] - placed, no spin-out`;
  }
});
reelSet.events.on('spin:complete', ({ wasSkipped, skipMode, skipContext }) => {
  hud.text = `${hud.text.split(' - ')[0]} - over: skipMode ${skipMode}, payload.press ${skipContext?.payload?.press}, wasSkipped ${wasSkipped}`;
});

return {
  reelSet,
  cleanup: () => {
    unwatch();
    try { hud.destroy(); } catch {}
  },
  onSkip: () => {
    reelSet.requestSkip(quickened
      ? { mode: 'slam', payload: { press: 2 } }
      : { mode: 'quicken', speed: 'turbo', payload: { press: 1 } });
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
