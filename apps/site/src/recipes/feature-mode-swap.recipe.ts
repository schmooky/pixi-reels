// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, gsap, app, pickWeighted, DebugPlaque
//
// Feature mode entry via runtime frame middleware.
//
// Two pipelines active across alternating 3-spin blocks:
//   BASE mode:    stock FrameBuilder pipeline, no extras
//   FEATURE mode: `feature-wild-injector` middleware present. every
//                 visible cell has a 40% chance to be rewritten to WILD
//                 at frame-build time
//
// A large banner above the grid shows the current mode and the spin
// counter, making the mode change and its payoff obvious at a glance.

const FILLER = ['7', '8', '10', 'Q'];
const WILD = WILD_CARD.id;
const COLS = 5, ROWS = 3, SIZE = 90;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleCells(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights({
    '7': 25,
    '8': 25,
    '10': 20,
    'Q': 20,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── The feature-mode middleware ──────────────────────────────────────────
// Priority 20 runs after target-placement (10), so it gets the final
// target grid and rewrites some cells in-place. 40% wild-injection rate
// makes the payoff unmistakable.
const featureWildInjector = {
  name: 'feature-wild-injector',
  priority: 20,
  process(ctx, next) {
    for (let i = ctx.bufferStart; i < ctx.bufferStart + ctx.visibleCells; i++) {
      if (ctx.symbols[i] !== WILD && Math.random() < 0.4) {
        ctx.symbols[i] = WILD;
      }
    }
    next();
  },
};

let inFeature = false;

function enterFeature() {
  if (inFeature) return;
  inFeature = true;
  reelSet.frame.use(featureWildInjector);
}

function exitFeature() {
  if (!inFeature) return;
  inFeature = false;
  reelSet.frame.remove('feature-wild-injector');
}

// ── Mode banner ──────────────────────────────
// One plaque, grid-wide: the title names the mode, the row under it counts
// the spins, and the accent (title and frame) follows the mode. The tight
// vertical padding keeps it 42px tall, so the grid keeps most of the frame.
const banner = new DebugPlaque({
  title: 'BASE MODE',
  text: 'Feature opens in 3 spin(s)',
  accent: 0x94a3b8,
  color: 0xfef08a,
  fontSize: 13,
  padding: [10, 2],
  align: 'center',
  minWidth: COLS * (SIZE + 4) - 4,
});
banner.y = -banner.plateHeight - 10;
reelSet.addChild(banner);

function redrawBanner(spinsUntilSwitch) {
  if (inFeature) {
    banner.update({
      title: 'FEATURE MODE',
      text: `More wilds for the next ${spinsUntilSwitch} spin(s)`,
      accent: 0xfef08a,
    });
  } else {
    banner.update({
      title: 'BASE MODE',
      text: `Feature opens in ${spinsUntilSwitch} spin(s)`,
      accent: 0x94a3b8,
    });
  }
}

// Cycle: 3 base spins, then 3 feature spins, then repeat
let spinCount = 0;
redrawBanner(3);

return {
  reelSet,
  onSpin: async () => {
    const phase = Math.floor(spinCount / 3) % 2;
    const shouldBeInFeature = phase === 1;
    if (shouldBeInFeature && !inFeature) enterFeature();
    else if (!shouldBeInFeature && inFeature) exitFeature();

    const spinsUntilSwitch = 3 - (spinCount % 3);
    redrawBanner(spinsUntilSwitch);

    const promise = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));

    // Server provides a boring, no-wild base result every time. In BASE mode
    // the grid stays boring. In FEATURE mode the wild-injector middleware
    // rewrites ~40% of cells to WILD. the player sees the payoff
    // of being in the feature.
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () =>
        FILLER[Math.floor(Math.random() * FILLER.length)],
      ),
    );
    reelSet.setResult(grid.map((visible) => ({ visible })));
    await promise;
    spinCount++;

    const nextSpinsUntilSwitch = 3 - (spinCount % 3);
    redrawBanner(nextSpinsUntilSwitch);
  },
  cleanup: () => {
    try { banner.destroy({ children: true }); } catch {}
  },
};
