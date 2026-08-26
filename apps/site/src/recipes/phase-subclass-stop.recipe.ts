// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, StopPhase, CardSymbol, CARD_DECK, PIXI, app
//
// SUBCLASS A BUILT-IN PHASE. The built-in phase classes are exported, so a
// small change to one is a subclass rather than a rewrite.
//
// Registering a phase has always been possible, but the only base class on
// offer was the abstract `ReelPhase`, so overriding one hook of `StopPhase`
// meant reimplementing the stop sequencer, the bounce and the skip pose from
// scratch. Now: extend, override the hook you care about, call `super`.
//
// Here `StopPhase` gains a per-reel landing flash. Everything else about the
// stop - target placement, bounce, the `onSkip` pose a slam uses - is
// inherited untouched.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

// Flash layer, drawn under the reels' own container so the pulse reads as a
// backlight behind the landing column.
const flashLayer = new PIXI.Container();
const flashes = [];
const flash = (i) => {
  const g = flashes[i];
  if (!g) return;
  gsap.killTweensOf(g);
  g.alpha = 0.55;
  gsap.to(g, { alpha: 0, duration: 0.45, ease: 'power2.out' });
};

class FlashStopPhase extends StopPhase {
  // The hook that runs when the reel begins stopping. `super.onEnter` starts
  // the real spin-out; without it the reel would never land.
  onEnter(config) {
    flash(this.reel.reelIndex);
    super.onEnter(config);
  }

  // Reached through `forceComplete()` on a slam. Keeping the flash here too
  // means a skipped reel gets the same beat as a natural landing, which is
  // the usual reason to override both.
  onSkip() {
    flash(this.reel.reelIndex);
    super.onSkip();
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 220 })
  // Register under the SAME key to replace the built-in. `'start'`, `'spin'`,
  // `'anticipation'` and `'stop'` are the four standard keys.
  .phases((f) => f.register('stop', FlashStopPhase))
  .ticker(app.ticker)
  .build();

reelSet.addChildAt(flashLayer, 0);
for (let i = 0; i < REELS; i++) {
  const g = new PIXI.Graphics()
    .rect(i * (SIZE + GAP) - 6, -6, SIZE + 12, TOTAL_H + 12)
    .fill({ color: 0xfef08a });
  g.alpha = 0;
  flashLayer.addChild(g);
  flashes.push(g);
}

const hud = new PIXI.Text({
  text: 'StopPhase subclassed: each reel backlights as it begins to stop',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => {
    for (const g of flashes) gsap.killTweensOf(g);
    try { flashLayer.destroy({ children: true }); } catch {}
    try { hud.destroy(); } catch {}
  },
  // Tap again mid-spin: the slam routes through the same subclass via
  // `onSkip`, so the flash fires on skipped reels too.
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
