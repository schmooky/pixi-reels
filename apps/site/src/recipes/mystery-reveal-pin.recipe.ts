// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   SpineReelSymbol, Spine, PIXI, gsap, app, pickWeighted
//
// Mystery symbol (reveal-to-same-class) using CellPin with `turns: 'eval'`.
//
// When mystery coins land, we pick one random non-mystery class and pin
// it at each mystery cell with `turns: 'eval'`. The pins are cleared
// automatically at the next spin:start. no manual cleanup.
//
// Visual: filler is rectangular playing cards; mystery is the game's purple
// plasma orb (a Spine skeleton) with no label. the "what is it?" reads from
// shape alone — the player only learns the value through the reveal.

const FILLER = ['7', '8', '10', 'Q'];
const MYSTERY = 'mystery';
const REVEAL_CANDIDATES = FILLER; // mystery can reveal to any filler
const COLS = 5, ROWS = 3, SIZE = 90;

// the mystery orb is the production Spine "collector" skeleton (purple orb)
const ASSETS = { 'hw-atlas': '/hw-spine/skeletons.atlas', 'hw-collector': '/hw-spine/collector.json' };
for (const [alias, src] of Object.entries(ASSETS)) {
  if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} }
}
await PIXI.Assets.load(Object.keys(ASSETS));
const SPINE_MAP = { [MYSTERY]: { skeleton: 'hw-collector', atlas: 'hw-atlas' } };
const probe = Spine.from({ skeleton: 'hw-collector', atlas: 'hw-atlas' });
if (probe.skeleton.data.findAnimation('idle_counter')) probe.state.setAnimation(0, 'idle_counter', true);
try { probe.update(0); } catch {}
const pb = probe.getLocalBounds();
const MYSTERY_SCALE = (SIZE - 6) / Math.max(1, pb.width, pb.height);
probe.destroy();

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
    r.register(MYSTERY, SpineReelSymbol, { spineMap: SPINE_MAP, idleAnimation: 'idle_counter', scale: MYSTERY_SCALE });
  })
  .weights({
    '7': 22,
    '8': 22,
    '10': 18,
    Q: 18,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── Mystery reveal on land ───────────────────────────────────────────────
// After reels land, if any cell is a mystery symbol, pick ONE random
// filler class and pin it at every mystery cell with eval lifetime.
// The pins override the visible symbols; the next spin clears them.
//
// Animation flow:
//   1. shake each mystery coin horizontally for ~280ms (anticipation)
//   2. scale it down to 0 over 180ms (mystery vanishes)
//   3. pin the reveal symbol. engine swaps the symbol identity at rest
//   4. scale the new symbol UP from 0 with a back.out overshoot
//
// Without these tweens the reveal would be an instant swap on land.
// player wouldn't even register that the mystery had to be opened.

async function revealCell(col, row, revealId) {
  const reel = reelSet.reels[col];
  const oldSym = reel.getSymbolAt(row);
  // Pivot to the cell center so the scale-down looks like the symbol
  // collapses on itself instead of pinning to the top-left corner.
  const px = oldSym.view.pivot.x, py = oldSym.view.pivot.y;
  const ox = oldSym.view.x, oy = oldSym.view.y;
  oldSym.view.pivot.set(SIZE / 2, SIZE / 2);
  oldSym.view.x = ox + SIZE / 2;
  oldSym.view.y = oy + SIZE / 2;

  // Shake. small horizontal jiggle, four oscillations.
  await new Promise((resolve) => {
    gsap.to(oldSym.view, {
      x: oldSym.view.x + 6,
      duration: 0.07,
      repeat: 4,
      yoyo: true,
      ease: 'sine.inOut',
      onComplete: resolve,
    });
  });

  // Scale-down. mystery vanishes.
  await new Promise((resolve) => {
    gsap.to(oldSym.view.scale, {
      x: 0, y: 0,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: resolve,
    });
  });

  // Restore pivot/position before swapping (the new symbol arrives with
  // default top-left anchor, so we hand its view back at the original
  // top-left coordinates).
  oldSym.view.pivot.set(px, py);
  oldSym.view.x = ox;
  oldSym.view.y = oy;
  oldSym.view.scale.set(1);

  // Swap identity via pin. same as before, just wrapped in animation.
  reelSet.pin(col, row, revealId, { turns: 'eval' });

  // The pin call replaced the symbol at this cell; grab the new one
  // and animate it IN. Same pivot trick so the bounce reads as
  // expanding-from-the-center.
  const newSym = reel.getSymbolAt(row);
  newSym.view.pivot.set(SIZE / 2, SIZE / 2);
  newSym.view.x = ox + SIZE / 2;
  newSym.view.y = oy + SIZE / 2;
  newSym.view.scale.set(0);
  await new Promise((resolve) => {
    gsap.to(newSym.view.scale, {
      x: 1, y: 1,
      duration: 0.32,
      ease: 'back.out(1.8)',
      onComplete: resolve,
    });
  });
  newSym.view.pivot.set(px, py);
  newSym.view.x = ox;
  newSym.view.y = oy;
}

reelSet.events.on('spin:allLanded', async ({ symbols }) => {
  const mysteryCells = [];
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      if (symbols[c][r] === MYSTERY) mysteryCells.push({ col: c, row: r });
    }
  }
  if (mysteryCells.length === 0) return;

  const reveal = REVEAL_CANDIDATES[Math.floor(Math.random() * REVEAL_CANDIDATES.length)];
  // Reveal all mystery cells in parallel so the whole row pops together.
  await Promise.all(mysteryCells.map((cell) => revealCell(cell.col, cell.row, reveal)));
});

// Scripted: every third spin, a few mystery cells land in a row.
const scripts = [
  { mysteries: [] },
  { mysteries: [] },
  { mysteries: [{ c: 0, r: 1 }, { c: 2, r: 1 }, { c: 4, r: 1 }] },
];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const script = scripts[spinCount % scripts.length];
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    for (const m of script.mysteries) grid[m.c][m.r] = MYSTERY;
    spinCount++;
    return grid;
  },
};
