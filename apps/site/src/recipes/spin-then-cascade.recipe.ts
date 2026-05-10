// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, SpriteSymbol,
//           DropRecipes, PIXI, gsap, app, textures, blurTextures, SYMBOL_IDS,
//           runCascade, pickWeighted

// Hybrid spin-then-cascade: the FIRST round of every play spins like a
// classic strip slot (top-to-bottom motion, START → SPIN → STOP). If the
// landing has winners, every subsequent re-evaluation is a cascade
// drop-in (winners pop, survivors fall, new symbols drop from above).
//
// The new `spin({ mode })` per-spin override does this in ONE ReelSet —
// no twin-instance gymnastics, no shared `setResult` plumbing. Build with
// `.cascade(...)` so the cascade phases are registered, then choose the
// mode at the call site:
//
//   await reelSet.spin();                  // builder default ('standard')
//   await reelSet.spin({ mode: 'cascade' }); // override for one round

const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3',
  'royal/royal_1', 'royal/royal_2', 'square/square_1',
];
const REELS = 5, ROWS = 3, SIZE = 80;

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols((r) => {
    for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120 })
  // .cascade() registers the dropStart/dropStop phases. Without it,
  // `spin({ mode: 'cascade' })` would throw — the engine refuses to enter
  // a phase chain that isn't wired.
  .cascade(DropRecipes.stiffDrop)
  .ticker(app.ticker)
  .build();

// Status banner so the running mode is unmistakable on screen.
const banner = new PIXI.Text({
  text: 'READY',
  style: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 16, fontWeight: '900',
    fill: 0xfef08a, stroke: { color: 0x000000, width: 3 },
    letterSpacing: 1,
  },
});
banner.anchor.set(0.5);
banner.x = (REELS * (SIZE + 4) - 4) / 2;
banner.y = -22;
reelSet.addChild(banner);

function setBanner(text, color = 0xfef08a) {
  banner.text = text;
  banner.style.fill = color;
}

return {
  reelSet,
  onSpin: async () => {
    // ── Round 1: classic strip-spin ─────────────────────────────────
    setBanner('STRIP SPIN');
    const initial = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => randSymbol(null)),
    );
    // Force a triggering cluster on row 1 cols 1-3 to keep the demo loud.
    const TRIGGER = 'royal/royal_1';
    const HIT_ROW = 1;
    const HIT_COLS = [1, 2, 3];
    for (const c of HIT_COLS) initial[c][HIT_ROW] = TRIGGER;

    const p = reelSet.spin(); // default mode = 'standard'
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setResult(initial);
    await p;

    // ── Cascade respins ─────────────────────────────────────────────
    setBanner('CASCADE x1', 0x9b59b6);

    // Stage after the cluster pops + survivors fall + new symbols drop.
    const afterPop = initial.map((col, c) => {
      if (!HIT_COLS.includes(c)) return [...col];
      const next = [...col];
      for (let r = HIT_ROW; r > 0; r--) next[r] = next[r - 1];
      next[0] = randSymbol(TRIGGER);
      return next;
    });

    // The cascade respin uses the `mode: 'cascade'` per-spin override.
    // Same ReelSet, same builder, just different motion + phases.
    const cp = reelSet.spin({ mode: 'cascade' });
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setDropOrder('ltr');
    reelSet.setResult(afterPop);
    await cp;

    setBanner('READY');
  },
  cleanup: () => {
    try { banner.destroy(); } catch { /* ignore */ }
  },
};
