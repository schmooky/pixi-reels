// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Feature mode entry via runtime middleware.
//
// A game's base mode and bonus mode usually differ only in strip weighting:
// more wilds, more scatters, tighter/looser distribution. Instead of rebuilding
// the ReelSet on feature entry, we toggle a frame middleware that rewrites the
// frame after the strip rolls. Entry: `reelSet.frame.use(featureMiddleware)`.
// Exit: `reelSet.frame.remove(name)`. Zero rebuild.

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
// During the bonus feature, upgrade ~30% of cells with a specific filler
// symbol into wilds. Runs AFTER target-placement (priority 20) so it can see
// the final grid and only mutates the remaining non-target cells.
const featureMoreWildsMiddleware = {
  name: 'feature-more-wilds',
  priority: 20,
  process(ctx, next) {
    for (let i = ctx.bufferAbove; i < ctx.bufferAbove + ctx.visibleRows; i++) {
      if (ctx.symbols[i] === 'square/square_1' && Math.random() < 0.35) {
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
  reelSet.frame.use(featureMoreWildsMiddleware);
}

function exitFeature() {
  if (!inFeature) return;
  inFeature = false;
  reelSet.frame.remove('feature-more-wilds');
}

// Visual cue — a border overlay so we can see the mode change
const overlay = new PIXI.Graphics();
reelSet.addChild(overlay);

function redrawOverlay() {
  overlay.clear();
  if (inFeature) {
    overlay
      .rect(-4, -4, COLS * (SIZE + 4) + 4, ROWS * (SIZE + 4) + 4)
      .stroke({ width: 4, color: 0xffd43b, alpha: 0.9 });
  }
}

// Toggle feature every 3 spins: 3 base spins, then 3 feature spins, repeat.
let spinCount = 0;

return {
  reelSet,
  onSpin: async () => {
    // Toggle mode at cycle boundaries
    const phase = Math.floor(spinCount / 3) % 2;
    if (phase === 1 && !inFeature) {
      enterFeature();
      redrawOverlay();
    } else if (phase === 0 && inFeature) {
      exitFeature();
      redrawOverlay();
    }

    const promise = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));

    // Server never intentionally sends wilds in this demo — the feature
    // middleware is what injects them. That way the visual payoff of
    // "feature mode = more wilds" is obvious.
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () =>
        FILLER[Math.floor(Math.random() * FILLER.length)],
      ),
    );
    reelSet.setResult(grid);
    await promise;
    spinCount++;
  },
  cleanup: () => {
    try { overlay.destroy(); } catch {}
  },
};
