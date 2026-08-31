// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// MYSTERY REVEAL: OUT, SWAP, IN.
//
// `setSymbolAt` already swaps a symbol's identity, but it swaps it INSTANTLY.
// So a reveal - the mystery tiles dissolve, what is underneath changes, the
// prize arrives - meant hand-rolling the same five things every time:
//
//   1. the out / swap / in ordering,
//   2. a per-cell stagger on each side of it,
//   3. a zIndex bump, or an entrance that overshoots its cell gets clipped by
//      the neighbour drawn after it,
//   4. re-hiding after the swap. `setSymbolAt` re-activates the view, and
//      activation resets alpha to 1 - so the new art POPS for a frame before
//      its entrance has started,
//   5. abort handling, so a player skipping the presentation still ends up
//      looking at the symbols the server actually sent.
//
// `swapSymbols` is those five things. The three beats are separately skippable,
// because the middle one is the only one the engine has to own: art that plays
// its own Spine `out` track passes `skipOut: true` and keeps the rest.
//
// `playIn` / `playOut` are the per-symbol hooks underneath, on the same
// contract as `playDestroy` - delay, signal, resolve when done, and abort
// meaning "snap to the end" rather than "fail". Override them on your own
// ReelSymbol for art-appropriate entrances and exits. They stay separate from
// `playDestroy`, which is tuned as the cascade's "this cell was a winner and is
// being consumed" poof; a reveal is a different beat and borrowing that one
// reads wrong.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const MYST = 'MYST';
const PRIZES = ['WILD', 'GOLD'];
const REELS = 5, ROWS = 3, SIZE = 78, GAP = 4;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
    r.register(MYST, CardSymbol, { color: 0x2b2440, label: '?', textColor: 0xb388ff });
    r.register('WILD', CardSymbol, { color: 0xb388ff, label: 'W', textColor: 0x241a33 });
    r.register('GOLD', CardSymbol, { color: 0xffcc44, label: 'G', textColor: 0x3a2600 });
  })
  .ticker(app.ticker)
  .build();

const H = ROWS * SIZE + (ROWS - 1) * GAP;

const hud = new PIXI.Text({
  text: 'press spin - the ? tiles land, then reveal',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

// Which reel carries the mystery tiles this round. Rotated so the demo does not
// always play out in the same column.
let mysteryReel = 1;

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    for (let cell = 0; cell < ROWS; cell++) grid[mysteryReel].visible[cell] = MYST;

    hud.text = `reel ${mysteryReel + 1} is mystery`;
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 300));
    reelSet.setResult(grid);
    await p;

    // Let the board settle before the reveal starts, so the two beats read as
    // separate events rather than as one long stop.
    await new Promise((r) => setTimeout(r, 260));

    const prize = PRIZES[Math.floor(Math.random() * PRIZES.length)];
    const cells = Array.from({ length: ROWS }, (_, cell) => ({
      reel: mysteryReel,
      cell,
      id: prize,
    }));

    hud.text = `revealing ${prize}...`;
    await reelSet.swapSymbols(cells, {
      // Peel the tiles away top to bottom...
      outDelay: (_, i) => i * 0.06,
      // ...hold the empty column for a beat. This is where the reveal sound
      // goes, and `onSwapped` is the hook for anything that has to wait on a
      // real animation rather than a guessed number of milliseconds.
      holdMs: 200,
      // ...then bring the prize in, same order.
      inDelay: (_, i) => i * 0.09,
    });

    hud.text = `reel ${mysteryReel + 1}: ? -> ${prize}`;
    mysteryReel = (mysteryReel + 1) % REELS;
  },
};
