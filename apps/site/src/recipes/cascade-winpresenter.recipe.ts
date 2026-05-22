// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, WILD_CARD,
//           WinPresenter, PIXI, gsap, app, pickWeighted.

// Cascade win presentation via `WinPresenter` instead of the default
// `destroySymbols` implode. The orchestrator is still `reelSet.runCascade`;
// `onCascade` is where we hand control to the presenter for a per-cascade
// scale-pop, then the library refills as usual.

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 6, ROWS = 4, SIZE = 72;
const CLUSTER = '10';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleRows(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => {
    for (const sym of CARD_DECK) {
      if (IDS.includes(sym.id)) {
        r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
      }
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .tumble({
    fall:   { duration: 280, ease: 'power3.in',  rowStagger: 60 },
    dropIn: { duration: 450, ease: 'power3.out', rowStagger: 60, distance: 'perHole' },
  })
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
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT_ROW && HIT_COLS.includes(c) ? CLUSTER : randSymbol(CLUSTER)
      )
    );

    // Moment A — initial drop, left-to-right reveal.
    reelSet.setDropOrder('ltr');
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 200));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await p;
    await new Promise(r => setTimeout(r, 300));

    // Moment B — runCascade owns the loop. `onCascade` swaps the default
    // implode for a WinPresenter scale-pop. The library calls
    // `destroySymbols` AFTER `onCascade` resolves — using `destroyOptions:
    // { zIndex: null }` keeps that fade-to-zero invisible (the presenter
    // already faded them visually).
    reelSet.setDropOrder('all');
    let presented = false;
    await reelSet.runCascade({
      detectWinners: (grid) => {
        if (presented) return [];
        return HIT_COLS.map(c => grid[c][HIT_ROW] === CLUSTER ? { reel: c, row: HIT_ROW } : null).filter(Boolean);
      },
      nextGrid: (prev, winners) => {
        const next = prev.map(col => [...col]);
        for (const w of winners) {
          for (let r = w.row; r > 0; r--) next[w.reel][r] = next[w.reel][r - 1];
          next[w.reel][0] = randSymbol(CLUSTER);
        }
        presented = true;
        return next;
      },
      onCascade: async ({ chain, winners }) => {
        if (winners.length === 0) return;
        await presenter.show([{
          id: chain,
          cells: winners.map(w => ({ reelIndex: w.reel, rowIndex: w.row })),
          value: winners.length * 10,
        }]);
      },
      // Suppress the implode tween entirely — the presenter already drove
      // the visual feedback. Skipping the zIndex lift keeps the destroy
      // alpha:0 step instant and invisible.
      destroyOptions: { zIndex: null },
      pauseAfterDestroyMs: 80,
    });
  },
  cleanup: () => presenter.destroy(),
};
