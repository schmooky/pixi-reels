export interface RecipeMeta {
  slug: string;
  title: string;
  oneLiner: string;
  steps: string[];
  apis: string[];
  tags: string[];
}

/**
 * Every recipe card on /recipes/ comes from this list. Entries are grouped
 * loosely by intent: starter templates first (`starter` tag), then mechanic
 * recipes (wilds, reveals), then UX / system recipes (anticipation, skip).
 */
export const RECIPES: RecipeMeta[] = [
  // ── Starter templates (merged in from /templates/) ─────────────────
  {
    slug: 'classic-5x3',
    title: 'Classic 5×3 starter',
    oneLiner: 'The foundation of 95% of slot games — copy-paste starting point for line-pays.',
    steps: [
      'Build a 5-reel × 3-row ReelSet with your sprite atlas',
      'Handle spin + call spotlight.cycle on wins',
      'Ship',
    ],
    apis: ['ReelSetBuilder', 'SpriteSymbol', 'SymbolSpotlight.cycle'],
    tags: ['starter', '5x3', 'line-pays'],
  },
  {
    slug: 'cascade-6x5',
    title: 'Cascade 6×5 tumble',
    oneLiner: 'Modern tumble mechanic with an ever-growing multiplier — Megaways-adjacent.',
    steps: [
      'Build a 6×5 ReelSet with .cascade() for drop-in mechanics',
      'Spin, detect cluster/line wins, spotlight them',
      'Tumble (remove winners, fall, refill) and repeat',
      'Each tumble increments the win multiplier',
    ],
    apis: ['ReelSetBuilder.cascade', 'DropRecipes', 'ReelSet.setDropOrder', 'ReelSet.setResult'],
    tags: ['starter', 'cascade', '6x5'],
  },
  {
    slug: 'cascade-anticipation',
    title: 'Cascade drop anticipation',
    oneLiner: 'All columns fall empty at once — then one hole stays open until the payoff symbol drops in.',
    steps: [
      'Spin — all columns fall out simultaneously, grid empties',
      'Most columns refill immediately; the payoff column stays empty',
      'Call setDropOrder([0, 0, 0, 0, 2500, 0]) — delay is drop-in only, not the fall',
    ],
    apis: ['ReelSet.setDropOrder', 'ReelSet.setResult', 'DropRecipes'],
    tags: ['cascade', 'anticipation', 'tension'],
  },
  {
    slug: 'hold-and-win',
    title: 'Hold & Win respin',
    oneLiner: 'Coins lock on land, respin until the grid fills — the "coin" formula every studio is shipping.',
    steps: [
      'Maintain a held Map of already-landed coin positions',
      'Each respin, build a grid that keeps held cells and lands 0..N new ones',
      'On every new coin, reset the respin counter to max',
      'When the grid is fully held — grand jackpot',
    ],
    apis: ['ReelSet.spin', 'ReelSet.setResult', 'Reel.getVisibleSymbols'],
    tags: ['starter', 'hold-and-win', 'respin'],
  },

  // ── Mechanic recipes ───────────────────────────────────────────────
  {
    slug: 'walking-wild',
    title: 'Walking wild',
    oneLiner: 'Sticky wild that advances one column every respin, pays on the way across.',
    steps: [
      'Track the wild\'s (reel, row) position in game state between spins',
      'Every respin, build a result grid that places the wild at the new column',
      'After each landing, shift the stored column left by 1',
      'When column < 0, clear the wild and return to normal spins',
    ],
    apis: ['ReelSet.setResult', 'ReelSet.spin', 'spin:complete event'],
    tags: ['wild', 'respin', 'positional'],
  },
  {
    slug: 'sticky-wild',
    title: 'Sticky wild',
    oneLiner: 'Wilds land during free spins, lock in place, board fills up toward an inevitable jackpot.',
    steps: [
      'Track each landed wild\'s (reel, row) in a Set',
      'Every free-spin, build a result grid that re-injects every stuck wild',
      'Clear the Set when the round ends',
    ],
    apis: ['ReelSet.setResult', 'spin:reelLanded event'],
    tags: ['wild', 'respin', 'free-spins'],
  },
  {
    slug: 'symbol-transform',
    title: 'Symbol transform',
    oneLiner: 'A symbol morphs into a different (usually higher) one mid-round — winning lows upgrade to meds.',
    steps: [
      'Detect the transform trigger (a win, a cascade level, an RNG roll)',
      'Tween the old symbol out (scale / fade / disintegrate)',
      'Swap the symbol via reel.placeSymbols with the new identity',
      'Tween the new symbol in',
    ],
    apis: ['Reel.placeSymbols', 'Reel.getSymbolAt', 'ReelSymbol.view'],
    tags: ['transform', 'animation', 'upgrade'],
  },
  {
    slug: 'mystery-reveal',
    title: 'Mystery reveal',
    oneLiner: 'All "?" cells reveal the SAME random symbol on land — the Money Train mystery-symbol drama.',
    steps: [
      'Use a `mystery` symbol id in the result grid like any other symbol',
      'On spin:allLanded, pick ONE reveal symbol (shared across all mystery cells)',
      'Play a reveal animation on each cell, swapping to the chosen symbol',
      'Evaluate wins AFTER the reveal with the post-reveal grid',
    ],
    apis: ['spin:allLanded event', 'Reel.placeSymbols', 'Reel.getSymbolAt'],
    tags: ['mystery', 'reveal', 'animation'],
  },

  // ── UX & system recipes ────────────────────────────────────────────
  {
    slug: 'remove-symbol',
    title: 'Remove symbol in a cascade',
    oneLiner: 'Fade and shrink a cell out before the next stage lands.',
    steps: [
      'Identify winning cells (array of {reel, row})',
      'Animate alpha 1 → 0 and scale 1 → 0.4',
      'Spin to next stage via setResult()',
    ],
    apis: ['runCascade', 'diffCells', 'ReelSet.setResult', 'Reel.getSymbolAt'],
    tags: ['cascade', 'animation'],
  },
  {
    slug: 'anticipate-a-reel',
    title: 'Anticipate a reel',
    oneLiner: 'Slow a specific reel to build tension before it lands.',
    steps: [
      'During spin, detect interesting partial state',
      'Call reelSet.setAnticipation([...reelIndices])',
      'Then call setResult() — the marked reels enter ANTICIPATION before STOP',
    ],
    apis: ['ReelSet.setAnticipation', 'spin:stopping event', 'AnticipationPhase'],
    tags: ['anticipation', 'tension'],
  },
  {
    slug: 'single-reel-respin',
    title: 'Single-reel respin',
    oneLiner: 'Hold every other reel and respin just one — the classic "nudge" mechanic.',
    steps: [
      'After the main spin lands, pick which reel the player wants to respin',
      'Freeze the other reels by re-feeding their current visible symbols via setResult()',
      'Let the chosen reel spin again with a fresh result',
      'A full-column (stacked) symbol naturally locks the whole reel — same code path',
    ],
    apis: ['ReelSet.spin', 'ReelSet.setResult', 'Reel.getVisibleSymbols'],
    tags: ['respin', 'hold'],
  },
  {
    slug: 'animate-paylines',
    title: 'Animate paylines',
    oneLiner: 'Cycle through multiple winning lines with the built-in spotlight.',
    steps: [
      'After spin, compute your win lines',
      'Call reelSet.spotlight.cycle({ lines, perLine, dim })',
      'Listen to spotlight:end to re-enable the spin button',
    ],
    apis: ['SymbolSpotlight.cycle', 'spotlight:start / :end events'],
    tags: ['wins', 'spotlight'],
  },
  {
    slug: 'slam-stop',
    title: 'Slam-stop',
    oneLiner: 'Let the player smash the button to land the reels now.',
    steps: [
      'On spin click: if isSpinning, call reelSet.skip() — otherwise spin()',
      'Optionally setResult() before skip so the forced landing is on target',
      'Inspect result.wasSkipped on the returned promise',
    ],
    apis: ['ReelSet.skip', 'ReelSet.isSpinning', 'SpinResult.wasSkipped'],
    tags: ['skip', 'UX'],
  },
  {
    slug: 'near-miss',
    title: 'Fake a near-miss',
    oneLiner: 'Place N-1 scatters plus anticipation on the reel that "almost" landed one.',
    steps: [
      'Build a result grid with only count - 1 scatters, none on nearReel',
      'Call setAnticipation([nearReel]) before setResult()',
      'Let the player feel the hold on the last reel',
    ],
    apis: ['ReelSet.setAnticipation', 'forceNearMiss cheat'],
    tags: ['anticipation', 'engagement'],
  },
  {
    slug: 'texture-atlas-symbols',
    title: 'Texture atlas symbols',
    oneLiner: 'Load sprite symbols from a TexturePacker atlas — one atlas file, 80+ frames.',
    steps: [
      'Load the TexturePacker JSON with PIXI.Assets.load() — PixiJS understands the format natively',
      'The returned Spritesheet exposes sheet.textures[frameId] for every frame',
      'Pass the base + blur texture maps to SpriteSymbol or BlurSpriteSymbol',
    ],
    apis: ['PIXI.Assets.load', 'Spritesheet.textures', 'SpriteSymbol', 'BlurSpriteSymbol'],
    tags: ['sprites', 'atlas', 'texturepacker'],
  },
];
