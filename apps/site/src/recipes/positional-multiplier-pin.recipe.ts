// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   Spine, settleMoneyFace, PIXI, gsap, app, pickWeighted
//
// Positional multiplier cells (Gonzo's Quest / Irish Riches style).
//
// Specific grid positions carry a multiplier value. When any winning
// symbol lands on one of these cells, the win passing through that cell
// gets boosted. The cell's symbol is still whatever the strip rolled.
// the multiplier is metadata on the pin.
//
// Trick: we pin the cell with symbolId MIRROR_ANY. a sentinel meaning
// "don't override the rolled symbol". We read the rolled symbol at
// spin:allLanded, re-pin it with the multiplier payload preserved so the
// stamp display stays correct. (A cleaner CellDecorator primitive would
// avoid this mirror dance, but it isn't required.)
//
// Visual: a small Spine gold-coin chip is anchored to the top-right of each
// multiplier cell. The card lands behind it. The coin reads as a permanent
// "this cell is ×3" sticker.

const FILLER = ['7', '8', '10', 'Q'];
const COLS = 5, ROWS = 3, SIZE = 90;
const CHIP = 40; // multiplier-coin diameter

// the chip is the production Spine gold coin, posed on its money face
const ASSETS = { 'hw-atlas': '/hw-spine/skeletons.atlas', 'hw-jackpot': '/hw-spine/jackpot.json' };
for (const [alias, src] of Object.entries(ASSETS)) {
  if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} }
}
await PIXI.Assets.load(Object.keys(ASSETS));
await PIXI.Assets.load('/hw-sprites/hwfont-mult.fnt'); // the game's ×N multiplier bitmap font

// Define fixed multiplier positions for this demo. In a real game, these
// could come from the server with each spin.
const MULTIPLIER_CELLS = [
  { col: 1, row: 1, mult: 2 },
  { col: 3, row: 0, mult: 3 },
  { col: 2, row: 2, mult: 5 },
];

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights({
    '7': 30,
    '8': 30,
    '10': 20,
    Q: 20,
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── Multiplier coin chips (fixed positions, always visible) ──────────────
const badgeLayer = new PIXI.Container();
reelSet.addChild(badgeLayer);

const spineChips = [];
for (const cell of MULTIPLIER_CELLS) {
  // Anchored to the top-right corner of the cell with a small inset.
  const cx = cell.col * (SIZE + 4) + SIZE - CHIP / 2 - 6;
  const cy = cell.row * (SIZE + 4) + CHIP / 2 + 6;

  const coin = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
  settleMoneyFace(coin, CHIP, 'mini'); // pose + scale onto the gold money face
  try { coin.update(0); } catch {}
  const cb = coin.getLocalBounds();
  coin.x = cx - (cb.x + cb.width / 2) * coin.scale.x;
  coin.y = cy - (cb.y + cb.height / 2) * coin.scale.y;
  badgeLayer.addChild(coin);
  spineChips.push(coin);

  const label = new PIXI.BitmapText({ text: `${cell.mult}x`, style: { fontFamily: 'DiamondMult', fontSize: 32 } });
  label.anchor.set(0.5);
  if (label.width > 0) label.scale.set(Math.min((CHIP * 0.82) / label.width, (CHIP * 0.7) / label.height, 1));
  label.x = cx; // centered on the chip
  label.y = cy;
  badgeLayer.addChild(label);
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
