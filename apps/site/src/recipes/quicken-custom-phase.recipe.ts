// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, ReelPhase, PhaseCardSymbol, PIXI, gsap, app
//
// A CUSTOM PHASE THAT CAN BE QUICKENED. `onSkip(ctx)` and `ctx.mode`.
//
// The instant stop from "A stop phase written from scratch", plus a
// deliberate pause: the reel stops dead on its frame a tenth of a cell short
// and HOLDS there for 900 ms before sliding the rest of the way in, landing
// and bouncing. A dramatic beat, and a wait a press should be able to cut.
//
// Every phase hears a press through `onSkip(ctx)`. `ctx.mode` says what the
// press wants: under `'slam'` the hook is the slam pose (rest on the frame,
// landed; the base completes the phase after). Under `'quicken'` the hook
// cuts a wait and leaves the landing alone - here it kills the hold and
// slides in at once. Ignore the mode and the phase simply runs its course:
// the reel still lands, the press just shortens nothing. `ctx.payload` is
// whatever the game put on the press.
//
// The hold is violet on the PhaseCardSymbol cards (it is part of the stop);
// press while it is violet and the slide starts at once.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const HOLD_MS = 900;
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

let note = () => {};

class HeldInstantStopPhase extends ReelPhase {
  name = 'stop';
  skippable = true;

  onEnter(config) {
    const reel = this.reel;
    const axis = reel.axis;
    this._landed = false;
    reel.forceSpeed(0);
    reel.placeStrip(config.targetFrame);
    this._rest = axis.getMain(reel.container);
    axis.setMain(reel.container, this._rest - axis.polarity * reel.symbolHeight * 0.1);
    this._holdStarted = performance.now();
    this._hold = gsap.delayedCall(HOLD_MS / 1000, () => {
      this._hold = null;
      this._slideIn();
    });
  }

  _slideIn() {
    const reel = this.reel;
    this._slide = gsap.to(reel.container, {
      [reel.axis.mainProp]: this._rest,
      duration: this.speed.slideMs / 1000,
      ease: 'power2.out',
      onComplete: () => {
        this._slide = null;
        this._landed = true;
        this.land();
        this._bounce = this.bounce();
        this._bounce.done.then(() => this._complete());
      },
    });
  }

  update() {}

  // The one hook, two branches.
  onSkip(ctx) {
    if (ctx.mode === 'quicken') {
      // Cut the hold, keep the landing exactly as it would have been. A
      // press during the slide or the bounce has nothing left to cut.
      if (this._hold) {
        this._hold.kill();
        this._hold = null;
        note(`reel ${this.reel.reelIndex + 1}: hold cut after ${Math.round(performance.now() - this._holdStarted)} of ${HOLD_MS} ms`);
        this._slideIn();
      }
      return;
    }
    // The slam pose: wherever the phase was, rest the reel on its frame,
    // landed. The base completes the phase after this.
    if (this._hold) { this._hold.kill(); this._hold = null; }
    if (this._slide) { this._slide.kill(); this._slide = null; }
    if (this._bounce) { this._bounce.cancel(); this._bounce = null; }
    this.reel.axis.setMain(this.reel.container, this._rest);
    if (!this._landed) { this._landed = true; this.land(); }
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 200, minimumSpinTime: 600, slideMs: 160 })
  .phases((f) => f.register('stop', HeldInstantStopPhase))
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

const hud = new PIXI.Text({
  text: 'spin, then press while the cards are violet: the 900 ms hold is cut',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);
const lines = [];
note = (line) => {
  lines.push(line);
  hud.text = lines.slice(-3).join('\n');
};
reelSet.events.on('spin:start', () => {
  lines.length = 0;
  hud.text = 'spin, then press while the cards are violet: the 900 ms hold is cut';
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
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
