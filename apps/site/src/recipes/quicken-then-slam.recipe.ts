// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, PhaseCardSymbol, PIXI, gsap, app
//
// ONE BUTTON, TWO PRESSES. Hurry first, cut second.
//
//   press 1  requestHurry({ speed: 'turbo' })  every reel spins its frame in
//            and bounces on the turbo profile - felt, and still a landing
//   press 2  requestSkip()                     whatever is still moving is
//            placed. The cut, for the player who really means it
//
// The engine keeps the two apart on purpose. A hurry is not a skip: it leaves
// `skipStage` at 0 and `wasSkipped` false, so the slam is still there for the
// next press. On the PhaseCardSymbol cards press 1 turns every reel violet
// (the stop, spinning in); press 2 turns whatever is still violet grey at
// once. Wait the bounce out instead and press 2 has nothing left to cut.

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
  text: 'spin, press once to hurry, press again to cut',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0xffcc44 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

// The one piece of state the button needs: has this round been hurried yet?
// Read off the engine's own event rather than counted locally, so a press
// that hurried nothing (round already down) does not arm the cut.
let hurried = false;
reelSet.events.on('spin:start', () => {
  hurried = false;
  hud.text = 'spin, press once to hurry, press again to cut';
});
reelSet.events.on('hurry:requested', ({ reels }) => {
  hurried = true;
  hud.text = `press 1: hurried [${reels.join(', ')}] on turbo - press again to cut`;
});
reelSet.events.on('skip:requested', ({ reels }) => {
  hud.text = `press 2: cut [${reels.join(', ')}] - placed, no spin-out`;
});
reelSet.events.on('spin:complete', ({ wasSkipped }) => {
  hud.text = `${hud.text.split(' - ')[0]} - round over, wasSkipped: ${wasSkipped}`;
});

return {
  reelSet,
  cleanup: () => {
    unwatch();
    try { hud.destroy(); } catch {}
  },
  onSkip: () => {
    if (hurried) reelSet.requestSkip();
    else reelSet.requestHurry({ speed: 'turbo' });
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
