// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpriteSymbol, DropRecipes,
//           WinPresenter, PIXI, gsap, app, textures, pickWeighted, runCascade.

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

// One presenter. Clusters and paylines are the same shape here — just a
// set of cells. The presenter never draws lines, so there's nothing to
// turn off for clusters.
const presenter = new WinPresenter(reelSet, {
  dimLosers: { alpha: 0.35 },
  cycleGap: 0,
  cycles: 1,
  // Scale-out pop, anchored at cell centre.
  symbolAnim: async (symbol) => {
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

reelSet.events.on('spin:start', () => presenter.abort());

return {
  reelSet,
  onSpin: async () => {
    const HIT_ROW = 2;
    const HIT_COLS = [0, 1, 2];

    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT_ROW && HIT_COLS.includes(c) ? CLUSTER : randSymbol(CLUSTER)
      )
    );
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

    // Drive the cascade. Replace the default fade with WinPresenter —
    // same API as paylines, just cells.
    await runCascade(reelSet, [stage0, stage1], {
      winners: () => HIT_COLS.map(c => ({ reel: c, row: HIT_ROW })),
      vanishDuration: 0,
      pauseBetween: 80,
      dropDuration: 420,
      onWinnersVanish: async (_rs, winners, stageIndex) => {
        if (winners.length === 0) return;
        await presenter.show([{
          id: stageIndex,
          cells: winners.map(w => ({ reelIndex: w.reel, rowIndex: w.row })),
          value: winners.length * 10,
        }]);
      },
    });
  },
  cleanup: () => presenter.destroy(),
};
