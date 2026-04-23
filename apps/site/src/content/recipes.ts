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
    title: 'Highlight winning cells',
    oneLiner: 'Sweep or flash the winning symbols with WinPresenter — just cells, no line drawing.',
    steps: [
      'Build WinPresenter. stagger = 0 flashes, > 0 sweeps left-to-right',
      'Pass each win as { cells, value? }',
      'Abort on spin:start',
    ],
    apis: ['WinPresenter', 'Win', 'win:* events'],
    tags: ['wins', 'presenter'],
  },
  {
    slug: 'paylines-custom-animation',
    title: 'Custom per-symbol animation',
    oneLiner: 'Replace playWin() with a GSAP timeline, styled per win.id.',
    steps: [
      'Pass symbolAnim as a callback or named animation',
      'Receive (symbol, cell, win) — return a Promise',
      'Style per win via win.id or win.kind',
    ],
    apis: ['WinPresenter.symbolAnim', 'WinSymbolAnim'],
    tags: ['wins', 'gsap'],
  },
  {
    slug: 'cascade-winpresenter',
    title: 'Cascade pops with WinPresenter',
    oneLiner: 'Same presenter, same Win shape — just cells vanishing from a cascade.',
    steps: [
      'Build a WinPresenter',
      'In runCascade\'s onWinnersVanish, await presenter.show([{ cells }])',
      'Tumble + drop continues once the pop resolves',
    ],
    apis: ['WinPresenter', 'runCascade.onWinnersVanish', 'win:group'],
    tags: ['wins', 'cascade'],
  },
  {
    slug: 'paylines-events-only',
    title: 'Draw paylines yourself from win:group',
    oneLiner: 'Core never draws lines. Subscribe to win:group + getCellBounds and render any overlay.',
    steps: [
      'Subscribe to win:group',
      'Use reelSet.getCellBounds to plot a polyline or outline',
      'Drop visuals into your own PIXI.Container',
    ],
    apis: ['ReelSet.getCellBounds', 'win:group', 'win:symbol'],
    tags: ['wins', 'events', 'overlays'],
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

  // ── CellPin primitive recipes ──────────────────────────────────────
  // These recipes all use reelSet.pin() — the engine's unified cell-persistence
  // primitive. Each shows a different configuration of one API.
  {
    slug: 'sticky-wild-pin',
    title: 'Sticky wild (CellPin)',
    oneLiner: 'Same sticky wild, built on the engine primitive — no ghost sprites, no manual grid injection.',
    steps: [
      'Listen for wilds landing via spin:allLanded',
      'Call reelSet.pin(col, row, "wild", { turns: N })',
      'The engine overlays the pin on setResult and decrements turns automatically',
    ],
    apis: ['ReelSet.pin', 'ReelSet.getPin', 'pin:expired event'],
    tags: ['wild', 'sticky', 'cell-pin'],
  },
  {
    slug: 'expanding-wild-pin',
    title: 'Expanding wild',
    oneLiner: 'Wild lands, entire column becomes wild for N spins — auto-expires when the turn counter runs out.',
    steps: [
      'On spin:allLanded, find every reel containing a wild',
      'Pin every row of that reel with { turns: N } — the column stays wild for N more spins',
      'The engine decrements turns after each spin:allLanded and expires pins at zero',
    ],
    apis: ['ReelSet.pin', 'CellPin.turns (number)'],
    tags: ['wild', 'expanding', 'sticky', 'cell-pin'],
  },
  {
    slug: 'book-expanding-pin',
    title: 'Book-style expanding symbol',
    oneLiner: 'One chosen symbol class expands to fill any reel it appears on — the Book-of slot formula.',
    steps: [
      'At feature start, choose a symbol class (the "expanding symbol")',
      'On each spin, pin every row of reels containing that symbol with { turns: "eval" }',
      'Evaluate wins with the expanded grid; pins auto-clear at next spin:start',
    ],
    apis: ['ReelSet.pin', 'CellPin.turns ("eval")'],
    tags: ['wild', 'book', 'expanding', 'cell-pin'],
  },
  {
    slug: 'multiplier-wild-pin',
    title: 'Multiplier wild',
    oneLiner: 'Each wild carries a per-instance multiplier in its pin payload — a ×N badge overlays the cell.',
    steps: [
      'Pin wilds on land with a payload containing the multiplier value',
      'Draw a ×N badge on each pinned cell via pin:placed event',
      'On wins, read pin.payload.multiplier to scale the payout',
    ],
    apis: ['ReelSet.pin', 'CellPin.payload', 'pin:placed event'],
    tags: ['wild', 'multiplier', 'payload', 'cell-pin'],
  },
  {
    slug: 'value-coin-pin',
    title: 'Value-carrying coin (Hold & Win)',
    oneLiner: 'Coin symbols carry their payout value in the pin payload; a running total updates as coins lock.',
    steps: [
      'On coin landing, pin with turns "permanent" and payload { value }',
      'Draw the value badge on each pinned cell',
      'Compute the running total by iterating reelSet.pins',
    ],
    apis: ['ReelSet.pin', 'ReelSet.unpin', 'ReelSet.pins', 'CellPin.payload'],
    tags: ['coin', 'hold-and-win', 'payload', 'cell-pin'],
  },
  {
    slug: 'collector-symbol-pin',
    title: 'Collector symbol',
    oneLiner: 'Collector absorbs adjacent coin pin payloads into its own total — pins coordinating across cells.',
    steps: [
      'Pin coins on land with { value } payloads',
      'When a collector lands, iterate neighbors, sum pin payloads, unpin coins',
      'Pin the collector with the absorbed total in its payload',
    ],
    apis: ['ReelSet.pin', 'ReelSet.unpin', 'ReelSet.getPin', 'CellPin.payload'],
    tags: ['coin', 'collector', 'payload', 'cell-pin'],
  },
  {
    slug: 'mystery-reveal-pin',
    title: 'Mystery reveal (CellPin)',
    oneLiner: 'Mystery symbols land, all reveal to the same random class via eval pins — auto-cleared at next spin.',
    steps: [
      'Server places "mystery" symbols at specific cells',
      'On spin:allLanded, pick one random class and pin all mystery cells with { turns: "eval" }',
      'Pins auto-clear on next spin:start',
    ],
    apis: ['ReelSet.pin', 'CellPin.turns ("eval")'],
    tags: ['mystery', 'reveal', 'cell-pin'],
  },
  {
    slug: 'sticky-win-respin-pin',
    title: 'Sticky-win respin',
    oneLiner: 'Winners lock for N respins while the rest of the grid spins independently — the Dead-or-Alive-II pattern.',
    steps: [
      'Detect winners on spin:allLanded',
      'Pin each winner with { turns: N } — N is the respin window',
      'Non-winners respin naturally; winners stay pinned and expire after N spins',
    ],
    apis: ['ReelSet.pin', 'CellPin.turns (number)', 'pin:expired event'],
    tags: ['respin', 'sticky', 'win', 'cell-pin'],
  },
  {
    slug: 'positional-multiplier-pin',
    title: 'Positional multiplier cells',
    oneLiner: 'Specific cells carry multipliers — any symbol that lands there boosts the win passing through.',
    steps: [
      'Mark fixed cells as multiplier positions (or receive them per-spin from server)',
      'Draw persistent ×N badges at those cells',
      'After landing, pin the rolled symbol with multiplier in payload (turns "eval")',
    ],
    apis: ['ReelSet.pin', 'CellPin.payload', 'CellPin.turns ("eval")'],
    tags: ['multiplier', 'positional', 'payload', 'cell-pin'],
  },

  // ── getCellBounds — coordinate utilities ──────────────────────────────
  {
    slug: 'cell-bounds',
    title: 'Cell bounds — overlays, paylines & hit areas',
    oneLiner: 'getCellBounds(col, row) returns the pixel rectangle of any visible cell — draw paylines, win outlines, or hit areas that align exactly with symbols.',
    steps: [
      'Call reelSet.getCellBounds(col, row) to get { x, y, width, height } in ReelSet-local coords',
      'Draw a PIXI.Graphics outline or line using those coordinates',
      'addChild the graphic to reelSet so it stays aligned with the board',
    ],
    apis: ['ReelSet.getCellBounds', 'CellBounds'],
    tags: ['utility', 'paylines', 'hit-areas', 'graphics'],
  },
  {
    slug: 'cell-hit-areas',
    title: 'Cell hit areas — click to pick, hover to preview',
    oneLiner: 'Attach pointer events to individual grid cells with getCellBounds — cursor turns to pointer on hover, click toggles a pick state.',
    steps: [
      'For each cell, call reelSet.getCellBounds(col, row)',
      'Build an invisible PIXI.Graphics rect with eventMode "static" + cursor "pointer"',
      'Wire pointerover / pointerout / pointertap to drive hover + pick state',
    ],
    apis: ['ReelSet.getCellBounds', 'PIXI.Graphics.eventMode', 'PIXI.Graphics.cursor'],
    tags: ['utility', 'hit-areas', 'interaction', 'cursor'],
  },
  {
    slug: 'cell-hit-areas-portrait',
    title: 'Portrait (non-square) cells + hit areas',
    oneLiner: 'Proof that getCellBounds makes no square-cell assumption — 70 × 105 portrait cells, fit-scaled sprites, pointer-accurate hit areas.',
    steps: [
      'Call .symbolSize(width, height) with any ratio — e.g. 70 × 105 for portrait',
      'Register symbols with BlurSpriteSymbol and fit true so art preserves aspect ratio',
      'Use getCellBounds(col, row) to build hit-area Graphics that match the tall rectangles',
    ],
    apis: ['ReelSet.getCellBounds', 'ReelSetBuilder.symbolSize', 'BlurSpriteSymbol fit option'],
    tags: ['utility', 'hit-areas', 'non-square', 'proportions'],
  },

  // ── movePin + frame exposure recipes ──────────────────────────────────
  {
    slug: 'walking-wild-pin',
    title: 'Walking wild (movePin)',
    oneLiner: 'Walking wild migrating one column left each spin — engine-native reelSet.movePin(), no ghost sprites.',
    steps: [
      "Pin new wilds on land with turns 'permanent'",
      'Before each spin, movePin() each existing pin one column left',
      'When a pin reaches column 0, unpin() — it has walked off the board',
    ],
    apis: ['ReelSet.pin', 'ReelSet.movePin', 'ReelSet.unpin', 'pin:moved event'],
    tags: ['wild', 'walking', 'movement', 'cell-pin'],
  },
  {
    slug: 'feature-mode-swap',
    title: 'Feature mode swap',
    oneLiner: 'Enter and exit a bonus mode at runtime by toggling a frame middleware — zero rebuild.',
    steps: [
      'Write a FrameMiddleware that rewrites frames for the bonus mode',
      'On feature entry, call reelSet.frame.use(middleware)',
      'On feature exit, call reelSet.frame.remove(name)',
    ],
    apis: ['ReelSet.frame.use', 'ReelSet.frame.remove', 'FrameMiddleware'],
    tags: ['mode', 'feature', 'middleware', 'frame'],
  },
];
