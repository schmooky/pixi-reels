// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app, pickWeighted, SilkGraphics, DebugPlaque

// Ask the reel which way it goes instead of remembering.
//
// `reel.axis` is the projection between screen space and the reel's own
// travel/cross axes:
//
//   orientation  'vertical' | 'horizontal'   (set-level)
//   direction    'forward' | 'reverse'       (this reel)
//   polarity     +1 forward, -1 reverse
//   mainProp     'x' | 'y'  - the property the strip travels on
//   crossProp    'x' | 'y'  - the property reels march on
//   feedEdge     'start' | 'end' - DERIVED from polarity, never set twice
//
// The arrows below are drawn with zero branches: `axis.toScreen(0, polarity)`
// projects one step of travel back into a screen vector, so the same three
// lines draw a downward arrow on a vertical forward reel and a leftward one on
// this set's reverse rows.

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const weights = { '7': 20, '8': 18, '9': 16, '10': 12, J: 10, Q: 8, K: 6, A: 5, wild: 3 };

const REELS = 3;
const CELLS = 4;

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(88, 66)
  .symbolGap(6, 6)
  .directionPerReel(['forward', 'reverse', 'forward'])
  .symbols((r) => {
    for (const sym of SYMBOLS) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights(weights)
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

const gfx = new SilkGraphics();
reelSet.addChild(gfx);

const labels = [];
const ARM = 16;   // arrow half-length
const HEAD = 7;

for (let i = 0; i < REELS; i++) {
  const axis = reelSet.getReel(i).axis;
  // Unit step of travel, projected back to screen. No orientation branch.
  const step = axis.toScreen(0, axis.polarity);

  const last = reelSet.getCellBounds(i, CELLS - 1);
  const cx = last.x + last.width + 24;
  const cy = last.y + last.height / 2;

  // Shaft up to the head's base, then the head as one filled triangle: step
  // rotated a quarter turn each way, so it follows any axis.
  gfx.line(cx - step.x * ARM, cy - step.y * ARM, cx + step.x * (ARM - HEAD), cy + step.y * (ARM - HEAD))
    .stroke({ color: 0xff6b35, width: 3, cap: 'round' });
  gfx.triangle(
    cx + step.x * ARM, cy + step.y * ARM,
    cx + step.x * (ARM - HEAD) - step.y * HEAD, cy + step.y * (ARM - HEAD) + step.x * HEAD,
    cx + step.x * (ARM - HEAD) + step.y * HEAD, cy + step.y * (ARM - HEAD) - step.x * HEAD,
    1,
  ).fill(0xff6b35);

  const text = new DebugPlaque({
    text:
      `r${i} ${axis.orientation} / ${axis.direction}\n` +
      `main=${axis.mainProp} cross=${axis.crossProp} feed=${axis.feedEdge}`,
    accent: 0xff6b35,
    anchor: { x: 0, y: 0.5 },
  });
  text.position.set(cx + ARM + 12, cy);
  reelSet.addChild(text);
  labels.push(text);
}

return {
  reelSet,
  nextResult: () =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => pickWeighted(weights)),
    ),
  cleanup: () => {
    for (const t of labels) t.destroy({ children: true });
    gfx.destroy();
  },
};
