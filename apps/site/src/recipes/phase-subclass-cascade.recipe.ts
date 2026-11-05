import { CARD_DECK, CascadeDropInPhase, ReelSetBuilder, resolveTumbleConfig, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import type { CascadeDropInPhaseConfig, TumbleConfig } from 'pixi-reels';
import { readout, tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Phases that take constructor arguments',
  topic: 'skip',
  tags: ['skip', 'slam', 'anticipation', 'tease', 'phases', 'timing', 'groups'],
  needs: ['generic-symbols'],
} as const satisfies RecipeMeta;

// SUBCLASSING A PHASE THAT TAKES CONSTRUCTOR ARGUMENTS.
//
// The four standard phases are built with `(reel, speed)`, so
// `register(key, Class)` is enough. The three cascade phases and MultiWays'
// `AdjustPhase` carry build-time config as EXTRA constructor arguments, so a
// subclass of one needs `registerFactory` and has to forward them.
//
// `resolveTumbleConfig(config)` fills a partial `.tumble(...)` config out to
// the shape those constructors expect - the same call `.tumble()` makes
// internally. Hand-writing the fields instead is how a subclass quietly drifts
// from the set's real tumble settings.
//
// Note where `.phases(...)` sits: BEFORE `.tumble(...)`. Configurators are
// deferred to `build()` and applied after the built-in registrations, so chain
// position does not decide the winner. (It used to: `.phases()` ran at call
// time and `.tumble()` registered its defaults later, inside `build()`, which
// silently discarded any `'cascade:*'` override.)
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const IDS = ['9', '10', 'J', 'Q', 'K'];
  const REELS = 5, ROWS = 3, SIZE = 76, GAP = 4;
  const TUMBLE: TumbleConfig = {
    fall: { duration: 300, ease: 'power3.in', cellStagger: 60 },
    dropIn: { duration: 500, ease: 'power2.out', cellStagger: 60, distance: 'perHole' },
  };
  const RESOLVED = resolveTumbleConfig(TUMBLE);
  const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
  function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

  let drops = 0;
  const bumpDrops = () => { drops += 1; };

  class CountingDropInPhase extends CascadeDropInPhase {
    onEnter(config: CascadeDropInPhaseConfig) {
      bumpDrops();
      super.onEnter(config);
    }
  }

  const reelSet = new ReelSetBuilder()
    .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
    .symbols((r) => {
      for (const c of CARDS) {
        r.register(c.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    // Registered BEFORE .tumble() on purpose - it still wins.
    .phases((f) =>
      f.registerFactory(
        'cascade:dropIn',
        (reel, speed) => new CountingDropInPhase(reel, speed, RESOLVED.dropIn, RESOLVED.gravity),
      ),
    )
    .tumble(TUMBLE)
    .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120 })
    .ticker(app.ticker)
    .build();

  const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
  const TOTAL_W = REELS * SIZE + (REELS - 1) * GAP;
  // Grid-wide from the start. The prompt and the result both wrap to two rows
  // at this width, so the plate is already the size the count needs.
  const hud = readout.plaque({
    text: 'press spin: the drop-in phase is the subclass, one per reel',
    minWidth: TOTAL_W,
    maxWidth: TOTAL_W,
  });
  hud.position.set(0, TOTAL_H + 10);
  reelSet.addChild(hud);

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      drops = 0;
      const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
      const p = reelSet.spin();
      await new Promise((r) => setTimeout(r, 250));
      reelSet.setResult(grid);
      await p;
      hud.text = `CountingDropInPhase constructed ${drops}x - once per reel, ` +
        'from a registration made before .tumble()';
    },
  });
  return {
    reelSet,
    cleanup: () => { try { hud.destroy({ children: true }); } catch {} },
  };
}
