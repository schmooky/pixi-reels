// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, ReelPhase, CardSymbol, CARD_DECK, PIXI, app
//
// A PHASE WRITTEN FROM SCRATCH, on `ReelPhase`.
//
// Subclassing a built-in is the cheap path. Extend `ReelPhase` when you want
// the whole behaviour, not a tweak to it - here a linear ramp with no
// step-back pull, replacing `StartPhase` under its own key.
//
// A custom NAME buys nothing on its own: the controller only ever asks the
// factory for the keys in the lifecycle (`'start'`, `'spin'`, `'anticipation'`,
// `'stop'`, plus the cascade and MultiWays keys). Registering `'myPhase'`
// leaves it orphaned - nothing constructs it. Own a phase by taking its key.
//
// The contract in four lines:
//   name / skippable  - readonly fields, no default
//   onEnter(config)   - set the reel up. nothing starts until you do
//   update(deltaMs)   - every frame while active, ticker-driven
//   onSkip()          - the slam pose: leave the reel where a natural finish
//                       would have left it
// and call `this._complete()` exactly once, or the reel never advances.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const RAMP_MS = 700;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

class LinearStartPhase extends ReelPhase {
  name = 'start';
  skippable = true;

  onEnter(config) {
    this._elapsed = 0;
    this._waited = 0;
    this._delay = config.delay ?? 0;
    this._launched = false;
    this.reel.spinningMode = config.spinningMode;
    this.reel.speed = 0;
  }

  update(deltaMs) {
    // The stagger, hand-rolled: no GSAP, no timers, just the frame delta.
    if (this._waited < this._delay) {
      this._waited += deltaMs;
      return;
    }
    if (!this._launched) {
      this._launched = true;
      // Re-masks any lifted unmask symbol the instant the reel moves. Skipping
      // it leaves such a symbol floating above the mask for the whole ramp.
      this.reel.beginMotion();
    }
    this._elapsed += deltaMs;
    const t = Math.min(1, this._elapsed / RAMP_MS);
    this.reel.speed = this._speed.spinSpeed * t;
    if (t >= 1) {
      this.reel.notifySpinStart();
      this._complete();
    }
  }

  onSkip() {
    // Land where the phase would have ended: at full speed, with symbols told
    // they are in a spin (blur / static-spin presentations key off this).
    this.reel.speed = this._speed.spinSpeed;
    this.reel.notifySpinStart();
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, spinDelay: 120, minimumSpinTime: 900 })
  .phases((f) => f.register('start', LinearStartPhase))
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const hud = new PIXI.Text({
  text: 'StartPhase replaced: a flat 700ms ramp, no step-back pull',
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
