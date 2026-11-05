import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { CARD_DECK, ReelSetBuilder, SpeedPresets, WILD_CARD, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { WinLines } from 'pixi-reels/debug';
import { evaluateWays } from '@pixi-reels/kit/ways';
import { pickWeighted, readout, tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'A big symbol widens its step',
  topic: 'infinity-reels',
  tags: ['expand', 'addReels', 'removeReels', 'addRows', 'multiways', 'ways', 'big-symbols', 'skip', 'win-lines'],
  height: 420,
} as const satisfies RecipeMeta;

// A big symbol arriving in an expansion: +2 for a big one. The steps add one
// reel each, but one of the new columns anchors a 2x2 wild. A one-reel step
// cannot land half a block, so `expand()` widens that step to two reels and
// the block arrives whole. Nothing to configure: the step plan reads the
// symbol's `size` from `symbolData`, and validates every block (it fits the
// strip, it does not run past the last new reel) before the first reel is
// added.
//
// `getVisibleGrid()` reports the block's id in all four cells it covers, so
// the ways math counts it as a wild on both reels.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const BASE = 5;
  const ROWS = 3;
  const CELL = 80;
  const GAP = 6;
  const WINDOW = 9;
  const PAY = 'K';
  const BIG = { id: 'bigwild', color: 0xffe066, label: 'WILD 2x2', textColor: 0x5a4300 };
  const set = await createAssets().genericSymbols();
  // The block wears a framed sticker; the deck's ids map onto the set.
  const { frames } = set;
  const textures = { ...set.textures, [BIG.id]: set.textures.W };
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const W = { '7': 14, '8': 14, '9': 12, '10': 12, J: 10, Q: 9, K: 8, A: 7, wild: 0, bigwild: 0 };

  const reelSet = new ReelSetBuilder()
    .reels(BASE)
    .visibleCells(ROWS)
    .symbolSize(CELL, CELL)
    .symbolGap(GAP, GAP)
    .symbols((r) => {
      for (const s of [...CARD_DECK, WILD_CARD, BIG]) {
        r.register(s.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    .weights(W)
    .symbolData({ [BIG.id]: { weight: 0, zIndex: 5, size: { reels: 2, cells: 2 } } })
    // A 2x2 anchor overshoots into its neighbours with a landing bounce.
    .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
    .speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
    .ticker(app.ticker)
    .build();

  // --- Camera window --------------------------------------------------------
  const PITCH = CELL + GAP;
  const VIEW_W = WINDOW * PITCH - GAP;
  const BOARD_H = ROWS * CELL + (ROWS - 1) * GAP;
  const READOUT_H = 64;
  const stage = new PIXI.Container();
  stage.addChild(new PIXI.Graphics().rect(0, 0, VIEW_W, BOARD_H + READOUT_H).fill({ color: 0, alpha: 0 }));
  const camera = new PIXI.Container();
  const windowMask = new PIXI.Graphics().rect(-4, -4, VIEW_W + 8, BOARD_H + 8).fill(0xffffff);
  camera.mask = windowMask;
  camera.addChild(reelSet);
  stage.addChild(camera, windowMask);
  // The board's size comes from the engine: `viewport.maskWidth` grows with
  // every reel `expand()` adds and shrinks back with `removeReels()`.
  const BUILT_W = reelSet.viewport.maskWidth;
  // Centred while the board fits the window, then scrolled so the newest
  // reel sits at the right edge.
  const cameraX = (width: number) => (width <= VIEW_W ? (VIEW_W - width) / 2 : VIEW_W - width);
  camera.x = cameraX(BUILT_W);
  const panTo = (width: number) =>
    new Promise<void>((resolve) => gsap.to(camera, { x: cameraX(width), duration: 0.35, ease: 'power2.out', onComplete: resolve }));

  const lines = new WinLines(reelSet, { width: 4 });
  const hud = readout.plaque({ rows: ['press spin', ''], minWidth: VIEW_W, maxWidth: VIEW_W, reserveRows: 2 });
  hud.position.set(0, BOARD_H + 12);
  stage.addChild(hud);

  function show(first: string) {
    const win = evaluateWays(reelSet.getVisibleGrid(), { wilds: ['wild', BIG.id] }).find((w) => w.symbol === PAY);
    lines.clear();
    if (win) lines.ways(win.perReel, { color: 0xff5c8a });
    hud.setRows([
      first,
      win ? { text: `${PAY} on ${win.reels} reels: ${win.ways} ways`, color: 0xff5c8a } : `no ${PAY} win`,
    ]);
  }

  const filler = () => Array.from({ length: ROWS }, () => pickWeighted(W));
  const withPay = () => {
    const cells = filler();
    cells[Math.floor(Math.random() * ROWS)] = PAY;
    return cells;
  };

  async function onSpin() {
    lines.clear();
    if (reelSet.viewport.maskWidth > BUILT_W) {
      await panTo(BUILT_W);
      reelSet.removeReels(); // back to the board the builder made
    }
    const spin = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setResult(Array.from({ length: BASE }, () => ({ visible: withPay() })));
    await spin;
    show('base: one reel per step from here');

    // Four new reels; the second column anchors the 2x2 wild, which covers the
    // second and third columns. The block's other three cells are filled by
    // the engine; whatever the server sends there is ignored.
    const row = Math.floor(Math.random() * (ROWS - 1));
    const block = withPay();
    block[row] = BIG.id;
    const columns = [withPay(), block, filler(), withPay()].map((visible) => ({ visible }));
    await reelSet.expand({
      columns,
      step: 1,
      onStepAdded: () => panTo(reelSet.viewport.maskWidth),
      onStepLanded: (step) =>
        show(
          step.count > 1
            ? `step ${step.index + 1} added ${step.count} reels: the 2x2 needs both`
            : `step ${step.index + 1} added 1 reel`,
        ),
    });
  }

  // A demo scrolled away mid-pan unmounts with the tween still running; kill it
  // so it does not tick on into a destroyed camera.
  app.stage.addChild(stage);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: onSpin,
  });
  return { reelSet, stage, cleanup: () => gsap.killTweensOf(camera) };
}
