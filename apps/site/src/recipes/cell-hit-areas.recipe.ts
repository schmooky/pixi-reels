import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { SilkGraphics } from 'pixi-silk';
import { CARD_DECK, ReelSetBuilder, SpeedPresets, WILD_CARD, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { ownTap, pickWeighted, tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Tappable cells',
  topic: 'cells-and-banners',
  tags: ['paylines', 'hit-areas', 'overlays', 'wins', 'horizontal', 'orientation'],
  needs: ['generic-symbols'],
} as const satisfies RecipeMeta;

export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const A = '7', B = '8', C = '9';
  const SEVEN = 'A'; // letter-card stand-in. constant kept as SEVEN for readability
  const IDS = [A, B, C, SEVEN];
  const COLS = 5, ROWS = 3, SIZE = 90;

  const reelSet = new ReelSetBuilder()
    .reels(COLS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
    .symbols(r => {
      for (const sym of [...CARD_DECK, WILD_CARD]) {
        r.register(sym.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    .weights({ [A]: 10, [B]: 10, [C]: 10, [SEVEN]: 3 })
    .speed('normal', SpeedPresets.NORMAL)
    .ticker(app.ticker).build();

  // Overlay for hover / picked outlines. One SilkGraphics, redrawn on change.
  const overlayGfx = new SilkGraphics();
  reelSet.addChild(overlayGfx);

  const picked = new Set<string>();
  let hoverKey: string | null = null;

  const keyOf = (c: number, r: number) => c + ',' + r;
  const parseKey = (k: string) => k.split(',').map(Number);

  function redraw() {
    overlayGfx.clear();
    // Picked cells. solid orange.
    for (const k of picked) {
      const [reel, cell] = parseKey(k);
      const b = reelSet.getCellBounds(reel, cell);
      overlayGfx
        .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 10)
        .stroke({ color: 0xff6b35, width: 3, alpha: 1 });
    }
    // Hover cell. soft grey preview (only if not already picked).
    if (hoverKey && !picked.has(hoverKey)) {
      const [reel, cell] = parseKey(hoverKey);
      const b = reelSet.getCellBounds(reel, cell);
      overlayGfx
        .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 10)
        .stroke({ color: 0x666666, width: 2, alpha: 0.55 });
    }
  }

  // Pulse the winning outline when a pick happens.
  function pulse(reel: number, cell: number) {
    const b = reelSet.getCellBounds(reel, cell);
    const pulseGfx = new SilkGraphics();
    pulseGfx
      .roundRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6, 10)
      .stroke({ color: 0xff6b35, width: 3 });
    reelSet.addChild(pulseGfx);
    gsap.fromTo(pulseGfx, { alpha: 0.9 }, { alpha: 0, duration: 0.5 });
    gsap.fromTo(pulseGfx.scale, { x: 1, y: 1 }, {
      x: 1.15, y: 1.15, duration: 0.5,
      onComplete: () => pulseGfx.destroy(),
    });
    // Scale around the cell centre.
    pulseGfx.pivot.set(b.x + b.width / 2, b.y + b.height / 2);
    pulseGfx.position.set(b.x + b.width / 2, b.y + b.height / 2);
  }

  // Create one invisible hit-area Graphics per cell. eventMode + cursor give
  // the pointer-cursor feel; pointertap toggles the pick, pointerover/out
  // drive the hover preview.
  const hitAreas: PIXI.Graphics[] = [];
  for (let reel = 0; reel < COLS; reel++) {
    for (let cell = 0; cell < ROWS; cell++) {
      const b = reelSet.getCellBounds(reel, cell);
      const hit = new PIXI.Graphics();
      // Filled with alpha 0. invisible but still hit-testable.
      hit.rect(b.x, b.y, b.width, b.height).fill({ color: 0xffffff, alpha: 0 });
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      const k = keyOf(reel, cell);
      hit.on('pointerover', () => { hoverKey = k; redraw(); });
      hit.on('pointerout', () => { if (hoverKey === k) hoverKey = null; redraw(); });
      hit.on('pointertap', (e) => {
        ownTap(e);
        if (picked.has(k)) picked.delete(k);
        else { picked.add(k); pulse(reel, cell); }
        redraw();
      });
      reelSet.addChild(hit);
      hitAreas.push(hit);
    }
  }

  // Keep hit areas above the symbol layer so clicks always reach them.
  overlayGfx.zIndex = 9998;
  for (const h of hitAreas) h.zIndex = 9999;
  reelSet.sortableChildren = true;

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      // Normal spin; picks survive across spins.
      const p = reelSet.spin();
      await new Promise(r => setTimeout(r, 150));
      const grid = Array.from({ length: COLS }, () =>
        Array.from({ length: ROWS }, () => pickWeighted({ [A]: 10, [B]: 10, [C]: 10, [SEVEN]: 3 })));
      reelSet.setResult(grid.map((visible) => ({ visible })));
      await p;
    },
  });
  return {
    reelSet,
    cleanup: () => {
      for (const h of hitAreas) h.destroy();
      overlayGfx.destroy();
    },
  };
}
