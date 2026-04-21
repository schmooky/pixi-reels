// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//                   app, textures, blurTextures, SYMBOL_IDS, pickWeighted
//
// Positional multiplier cells (Gonzo's Quest / Irish Riches style).
//
// Specific grid positions carry a multiplier value. When any winning
// symbol lands on one of these cells, the win passing through that cell
// gets boosted. The cell's symbol is still whatever the strip rolled —
// the multiplier is metadata on the pin.
//
// Trick: we pin the cell with symbolId MIRROR_ANY — a sentinel meaning
// "don't override the rolled symbol". We read the rolled symbol at
// spin:allLanded, re-pin it with the multiplier payload preserved so the
// badge display stays correct. (A cleaner CellDecorator primitive would
// avoid this mirror dance, but it isn't required.)

const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
const COLS = 5, ROWS = 3, SIZE = 90;

// Define fixed multiplier positions for this demo. In a real game, these
// could come from the server with each spin.
const MULTIPLIER_CELLS = [
  { col: 1, row: 1, mult: 2 },
  { col: 3, row: 0, mult: 3 },
  { col: 2, row: 2, mult: 5 },
];

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleSymbols(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const id of FILLER) {
      r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    }
  })
  .weights({
    'round/round_1': 30,
    'round/round_2': 30,
    'royal/royal_1': 20,
    'square/square_1': 20,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── Multiplier badges (fixed positions, always visible) ──────────────────
const badgeLayer = new PIXI.Container();
reelSet.addChild(badgeLayer);

for (const cell of MULTIPLIER_CELLS) {
  const ring = new PIXI.Graphics();
  ring
    .rect(
      cell.col * (SIZE + 4) + 2,
      cell.row * (SIZE + 4) + 2,
      SIZE - 4,
      SIZE - 4,
    )
    .stroke({ width: 3, color: 0x9b59b6, alpha: 0.95 });
  badgeLayer.addChild(ring);

  const badge = new PIXI.Text({
    text: `×${cell.mult}`,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 22,
      fontWeight: '900',
      fill: 0xfef08a,
      stroke: { color: 0x6b21a8, width: 4 },
    },
  });
  badge.anchor.set(0.5);
  badge.x = cell.col * (SIZE + 4) + SIZE - 18;
  badge.y = cell.row * (SIZE + 4) + 18;
  badgeLayer.addChild(badge);
}

// ── Cell metadata via pin payload ────────────────────────────────────────
// After landing, re-pin each multiplier cell with the rolled symbol and a
// payload containing the multiplier. Use turns: 'eval' so the pin exists
// only for this spin's evaluation, and clears at next spin:start.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (const cell of MULTIPLIER_CELLS) {
    const rolled = symbols[cell.col][cell.row];
    reelSet.pin(cell.col, cell.row, rolled, {
      turns: 'eval',
      payload: { multiplier: cell.mult, positionMultiplier: true },
    });
  }
  // At this point, game code can iterate reelSet.pins and apply the
  // multiplier to any win passing through a positionMultiplier cell.
});

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    ),
  cleanup: () => { try { badgeLayer.destroy({ children: true }); } catch {} },
};
