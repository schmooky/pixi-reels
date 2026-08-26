// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, AnticipationPhase, CardSymbol, CARD_DECK, PIXI, app
//
// SUBCLASS `AnticipationPhase`, and use `update()`.
//
// The tease gets a per-reel countdown drawn from inside the phase. Three hooks,
// each doing its job:
//
//   onEnter  - show the label, then `super` starts the real slow-down
//   update   - called every frame WHILE ACTIVE, with the frame delta. It is
//              ticker-driven accumulation, not wall clock, so it stays correct
//              in a backgrounded tab where `performance.now()` would not
//   onSkip   - the SLAM pose. Runs when a press force-completes the phase, so
//              anything onEnter put on screen has to come off here too
//
// Note the countdown reads its total from `this._speed.anticipationDelay`: a
// phase gets the active `SpeedProfile` handed to it, so a subclass never has
// to be told the timings the rest of the engine is already using.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [2, 3, 4];
const HOLD = 1500;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

// The phase writes here; the recipe owns the display objects.
const counters = new Map();

class CountdownAnticipationPhase extends AnticipationPhase {
  onEnter(config) {
    this._left = config.duration ?? this._speed.anticipationDelay;
    const c = counters.get(this.reel.reelIndex);
    if (c) { c.visible = true; c.text = `${(this._left / 1000).toFixed(1)}s`; }
    super.onEnter(config);
  }

  update(deltaMs) {
    super.update(deltaMs);
    this._left = Math.max(0, this._left - deltaMs);
    const c = counters.get(this.reel.reelIndex);
    if (c) c.text = `${(this._left / 1000).toFixed(1)}s`;
  }

  onSkip() {
    const c = counters.get(this.reel.reelIndex);
    if (c) c.visible = false;
    super.onSkip();
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
    r.register(SCAT, CardSymbol, { color: 0xffcc44, label: 'F', textColor: 0x3a2600 });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: HOLD })
  .phases((f) => f.register('anticipation', CountdownAnticipationPhase))
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
for (const i of TEASE) {
  const t = new PIXI.Text({
    text: '',
    style: { fontFamily: 'monospace', fontSize: 15, fontWeight: '700', fill: 0xfef08a },
  });
  t.anchor.set(0.5, 1);
  t.position.set(i * (SIZE + GAP) + SIZE / 2, -6);
  t.visible = false;
  reelSet.addChild(t);
  counters.set(i, t);
}
// The phase only hides a counter on a SKIP; a natural finish ends the tease
// through the normal path, so clear those here.
reelSet.events.on('anticipation:reelEnd', ({ reelIndex }) => {
  const c = counters.get(reelIndex);
  if (c) c.visible = false;
});

const hud = new PIXI.Text({
  text: 'each teasing reel counts its own hold down, from inside the phase',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => {
    for (const c of counters.values()) { try { c.destroy(); } catch {} }
    counters.clear();
    try { hud.destroy(); } catch {}
  },
  // Tap mid-tease: the slam routes through the subclass's `onSkip`, so the
  // counters come off with the tease rather than freezing on screen.
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    for (const c of counters.values()) c.visible = false;
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    reelSet.setAnticipation(TEASE, { stagger: 400 });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
