// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const WILD = 'wild/wild_1';
const COLS = 5, ROWS = 3, SIZE = 90;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols(r => {
    for (const id of [...FILLER, WILD]) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({ 'round/round_1': 22, 'round/round_2': 22, 'royal/royal_1': 18, 'square/square_1': 18 })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── Sticky wild state ────────────────────────────────────────────────────────
const stuck = [];   // { reel, row }
const ghosts = [];  // PIXI.Sprite overlays

function clearGhosts() {
  for (const g of ghosts) try { g.destroy(); } catch {}
  ghosts.length = 0;
}

function addGhost(reelIdx, row) {
  const sym = reelSet.getReel(reelIdx).getSymbolAt(row);
  const pos = sym.view.toGlobal({ x: SIZE / 2, y: SIZE / 2 });
  const wildTex = textures[WILD];
  const ghost = new PIXI.Sprite(wildTex);
  ghost.anchor.set(0.5);
  const s = SIZE / Math.max(wildTex.width, wildTex.height);
  ghost.position.set(pos.x, pos.y);
  ghost.scale.set(0);
  ghost.alpha = 0;
  app.stage.addChild(ghost);
  ghosts.push(ghost);
  gsap.to(ghost.scale, { x: s, y: s, duration: 0.35, ease: 'back.out(2)' });
  gsap.to(ghost, { alpha: 1, duration: 0.25 });
}

// After each spin, detect newly landed wilds and pin them
reelSet.events.on('spin:complete', (result) => {
  for (let r = 0; r < result.symbols.length; r++) {
    for (let row = 0; row < result.symbols[r].length; row++) {
      if (result.symbols[r][row] === WILD && !stuck.some(w => w.reel === r && w.row === row)) {
        stuck.push({ reel: r, row });
        addGhost(r, row);
      }
    }
  }
});

// Scripted arrivals — cycles every 3 spins
const arrivals = [{ reel: 1, row: 1 }, { reel: 3, row: 0 }, { reel: 2, row: 2 }];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const idx = spinCount % arrivals.length;

    if (idx === 0) {
      clearGhosts();
      stuck.length = 0;
    }

    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)])
    );

    for (const s of stuck) grid[s.reel][s.row] = WILD;
    const next = arrivals[idx];
    grid[next.reel][next.row] = WILD;

    spinCount++;
    return grid;
  },
};
