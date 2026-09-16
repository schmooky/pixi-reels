// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, ReelPhase, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// A STOP PHASE WRITTEN FROM SCRATCH, on `ReelPhase`. The instant stop.
//
// The reel never scrolls its frame in. It stops dead, the result is placed,
// slides the last tenth of a cell into place, lands and bounces - two beats
// with no spin-out between them. The legacy "instant spin" stop, and until the
// phase contract shipped it could not be written against the published
// typings: landing a reel meant four `@internal` calls behind a cast.
//
// The contract a stop phase needs, all of it public:
//   reel.forceSpeed(0)       - stop dead, drive included, without landing
//   reel.placeStrip(frame)   - the full strip, buffers included. `placeSymbols`
//                              is the visible-window form and drops a big
//                              symbol's tail parked in a buffer row
//   this.land()              - halt, snap, tell the symbols, lift unmask art,
//                              raise `spin:reelLanding`. The only way to land
//   this.bounce(opts?)       - the overshoot, carrying lifted views along.
//                              `{ done, cancel() }`; profile defaults
//   onSkip()                 - the slam pose: cancel, rest, land if not yet
//   onHurry()                - optional. A `requestHurry()` press asks for
//                              the landing sooner; here there is no wait to
//                              cut, so the default (`false`) is right
//
// Timing that belongs to the phase rides on the profile: `slideMs` below is
// not a `SpeedProfile` field, and `ReelPhase<Config, Profile>` is what lets
// `this._speed` read it in TypeScript. The manager hands every phase the
// profile instance the game registered, so the field is there at run time;
// the generic is what types it.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

class InstantStopPhase extends ReelPhase {
  name = 'stop';
  skippable = true;

  onEnter(config) {
    const reel = this.reel;
    const axis = reel.axis;
    this._landed = false;
    // Stop dead first: while the reel moves, the ticker would scroll the
    // placed frame straight back out of the window.
    reel.forceSpeed(0);
    reel.placeStrip(config.targetFrame);
    // Slide in from a tenth of a cell back, along the reel's own axis, then
    // land and bounce. Lifted unmask art would need carrying here the way
    // `bounce()` carries it; none is registered in this demo, so a bare tween
    // of the container is honest.
    this._rest = axis.getMain(reel.container);
    axis.setMain(reel.container, this._rest - axis.polarity * reel.symbolHeight * 0.1);
    this._slide = gsap.to(reel.container, {
      [axis.mainProp]: this._rest,
      duration: this._speed.slideMs / 1000,
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

  // The slam pose: wherever the phase was, leave the reel where a natural
  // finish would have - resting on its frame, landed.
  onSkip() {
    if (this._slide) { this._slide.kill(); this._slide = null; }
    if (this._bounce) { this._bounce.cancel(); this._bounce = null; }
    this.reel.axis.setMain(this.reel.container, this._rest);
    if (!this._landed) { this._landed = true; this.land(); }
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  // `slideMs` is the phase's own field on the profile.
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 160, minimumSpinTime: 700, slideMs: 140 })
  .phases((f) => f.register('stop', InstantStopPhase))
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const hud = new PIXI.Text({
  text: 'StopPhase replaced: stop dead, place, slide a tenth of a cell in, land, bounce.',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fontWeight: '600', fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
