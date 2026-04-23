// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpriteSymbol, DropRecipes,
//           WinPresenter, PIXI, gsap, app, textures, SYMBOL_IDS,
//           pickWeighted, runCascade.

const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3',
  'royal/royal_1', 'royal/royal_2', 'square/square_1',
];
const REELS = 6, ROWS = 4, SIZE = 72;
const CLUSTER = 'royal/royal_1';

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, SpriteSymbol, { textures }); })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .cascade(DropRecipes.stiffDrop)
  .ticker(app.ticker).build();

// One presenter — reused for every stage's pop. No line renderer, because
// clusters aren't lines; the default `symbol.playWin()` drives the symbol
// pulse, dim fades non-winners, and events fire for any external side
// effects (sound, popups).
const presenter = new WinPresenter(reelSet, {
  dimLosers: { alpha: 0.35 },
  cycleGap: 0,
  cycles: 1,
  // Custom animation: a scale-out + fade to mimic "pop before vanish".
  // Symbols' view is positioned at cell top-left, so pivot to the local
  // bounds centre before scaling, then restore.
  symbolAnim: async (symbol, _cell, _win) => {
    const view = symbol.view;
    const b = view.getLocalBounds();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const ox = view.pivot.x, oy = view.pivot.y, px = view.x, py = view.y;
    view.pivot.set(cx, cy);
    view.x = px + (cx - ox);
    view.y = py + (cy - oy);
    await new Promise(resolve => {
      gsap.to(view.scale, {
        x: 1.25, y: 1.25, duration: 0.18, ease: 'back.out(2)',
        onComplete: () => gsap.to(view.scale, {
          x: 1, y: 1, duration: 0.12, ease: 'power2.in',
          onComplete: () => { view.pivot.set(ox, oy); view.x = px; view.y = py; resolve(); },
        }),
      });
    });
  },
});

// If the user slam-spins mid-cascade, cancel any active pop presentation.
reelSet.events.on('spin:start', () => presenter.abort());

return {
  reelSet,
  onSpin: async () => {
    const HIT_ROW = 2;
    const HIT_COLS = [0, 1, 2];

    // Stage 0: cluster on row 2, cols 0–2.
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT_ROW && HIT_COLS.includes(c) ? CLUSTER : randSymbol(CLUSTER)
      )
    );

    // Stage 1: winners removed, survivors shift down, new top symbols.
    const stage1 = stage0.map((col, c) => {
      if (!HIT_COLS.includes(c)) return [...col];
      const next = [...col];
      for (let r = HIT_ROW; r > 0; r--) next[r] = next[r - 1];
      next[0] = randSymbol(CLUSTER);
      return next;
    });

    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 200));
    reelSet.setDropOrder('ltr');
    reelSet.setResult(stage0);
    await p;
    await new Promise(r => setTimeout(r, 300));

    // Drive the cascade. The magic is in onWinnersVanish: instead of the
    // default fade, we feed the winners to WinPresenter as a ClusterWin.
    // When `presenter.show()` resolves, runCascade moves on to the
    // tumble + drop.
    await runCascade(reelSet, [stage0, stage1], {
      winners: () => HIT_COLS.map(c => ({ reel: c, row: HIT_ROW })),
      vanishDuration: 0,  // we drive the pop ourselves; no default fade
      pauseBetween: 80,
      dropDuration: 420,
      onWinnersVanish: async (_reelSet, winners, stageIndex) => {
        if (winners.length === 0) return;
        await presenter.show([{
          clusterId: stageIndex,
          cells: winners.map(w => ({ reelIndex: w.reel, rowIndex: w.row })),
          value: winners.length * 10,
        }]);
      },
    });
  },
  cleanup: () => presenter.destroy(),
};
