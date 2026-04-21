// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Feature mode entry via runtime frame middleware.
//
// Two pipelines active across alternating 3-spin blocks:
//   BASE mode:    stock FrameBuilder pipeline, no extras
//   FEATURE mode: `feature-wild-injector` middleware present — every
//                 visible cell has a 40% chance to be rewritten to WILD
//                 at frame-build time
//
// A large banner above the grid shows the current mode and the spin
// counter, making the mode change and its payoff obvious at a glance.

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const WILD = 'wild/wild_1';
const COLS = 5, ROWS = 3, SIZE = 90;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of [...FILLER, WILD]) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 25,
    'round/round_2': 25,
    'royal/royal_1': 20,
    'square/square_1': 20,
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
    for (let i = ctx.bufferAbove; i < ctx.bufferAbove + ctx.visibleRows; i++) {
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

// ── Mode banner — big, obvious, unmissable ──────────────────────────────
const bannerHeight = 42;
const banner = new PIXI.Container();
reelSet.addChild(banner);
banner.y = -bannerHeight - 10;

const bannerBg = new PIXI.Graphics();
banner.addChild(bannerBg);

const bannerText = new PIXI.Text({
  text: '',
  style: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 22,
    fontWeight: '900',
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 4 },
    letterSpacing: 2,
  },
});
bannerText.anchor.set(0.5);
bannerText.y = bannerHeight / 2;
banner.addChild(bannerText);

const subText = new PIXI.Text({
  text: '',
  style: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    fontWeight: '600',
    fill: 0xfef08a,
  },
});
subText.anchor.set(0.5);
subText.y = bannerHeight + 14;
banner.addChild(subText);

function redrawBanner(spinsUntilSwitch) {
  const width = COLS * (SIZE + 4) - 4;
  bannerBg.clear();

  if (inFeature) {
    bannerBg
      .roundRect(0, 0, width, bannerHeight, 10)
      .fill({ color: 0x9b59b6 })
      .stroke({ width: 3, color: 0xfef08a });
    bannerText.text = 'FEATURE MODE';
    bannerText.style.fill = 0xfef08a;
    subText.text = `More wilds for the next ${spinsUntilSwitch} spin(s)`;
  } else {
    bannerBg
      .roundRect(0, 0, width, bannerHeight, 10)
      .fill({ color: 0x1e293b })
      .stroke({ width: 2, color: 0x94a3b8 });
    bannerText.text = 'BASE MODE';
    bannerText.style.fill = 0xe5e7eb;
    subText.text = `Feature opens in ${spinsUntilSwitch} spin(s)`;
  }

  bannerText.x = width / 2;
  subText.x = width / 2;
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
    // rewrites ~40% of cells to WILD — the player instantly sees the payoff
    // of being in the feature.
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () =>
        FILLER[Math.floor(Math.random() * FILLER.length)],
      ),
    );
    reelSet.setResult(grid);
    await promise;
    spinCount++;

    const nextSpinsUntilSwitch = 3 - (spinCount % 3);
    redrawBanner(nextSpinsUntilSwitch);
  },
  cleanup: () => {
    try { banner.destroy({ children: true }); } catch {}
  },
};
