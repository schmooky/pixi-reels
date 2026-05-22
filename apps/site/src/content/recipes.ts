export type RecipeGroup =
  | 'starters'
  | 'pyramid'       // static per-reel shape
  | 'multiways'     // per-spin row variation
  | 'big-symbols'   // N×M block symbols
  | 'wilds'         // sticky/expanding/walking/multiplier wilds
  | 'features'      // bonus reveals, multipliers, coins, transforms
  | 'cascade'       // cascade physics + tumbling
  | 'wins'          // payline & cell-highlight presentation
  | 'tension'       // anticipation, near-miss, skip, respin
  | 'cell-coords'   // cell bounds, hit areas, overlays
  | 'symbol-formats' // texture atlas, animated, AI-generated
  | 'runtime';      // mode swaps, feature middleware

export interface RecipeMeta {
  slug: string;
  group: RecipeGroup;
  title: string;
  oneLiner: string;
  steps: string[];
  apis: string[];
  tags: string[];
}

/** Display order + label for each group on the /recipes/ index page. */
export const RECIPE_GROUPS: Array<{ id: RecipeGroup; label: string; description: string }> = [
  {
    id: 'starters',
    label: 'Starter templates',
    description: 'Copy-paste foundations to clone for a new slot.',
  },
  {
    id: 'pyramid',
    label: 'Per-reel geometry (pyramid layouts)',
    description: 'Static jagged shapes — non-uniform row counts fixed at build time.',
  },
  {
    id: 'multiways',
    label: 'MultiWays',
    description: 'Per-spin row variation — each reel can land on a different row count between minRows and maxRows.',
  },
  {
    id: 'big-symbols',
    label: 'Big symbols (N×M blocks)',
    description: 'Single symbol that occupies an N×M block of cells — 2×2 bonuses, 3×3 giants, 1×3 bars.',
  },
  {
    id: 'wilds',
    label: 'Wilds & sticky cells',
    description: 'Sticky, expanding, walking, multiplier wilds — all powered by the pin primitive.',
  },
  {
    id: 'features',
    label: 'Features, bonuses & transforms',
    description: 'Mystery reveals, value coins, collectors, symbol upgrades.',
  },
  {
    id: 'cascade',
    label: 'Cascade & tumbling',
    description: 'Drop physics, anticipation drops, removing winners.',
  },
  {
    id: 'wins',
    label: 'Wins & paylines',
    description: 'Highlight winning cells; draw your own paylines from events.',
  },
  {
    id: 'tension',
    label: 'Anticipation, skip & respin',
    description: 'Slow a reel, slam-stop, near-miss, single-reel respin.',
  },
  {
    id: 'cell-coords',
    label: 'Cell coordinates & hit areas',
    description: 'Pixel rects per cell; pointer-aligned overlays.',
  },
  {
    id: 'symbol-formats',
    label: 'Symbol authoring',
    description: 'Texture atlases, animated sprite sequences, AI-generated art.',
  },
  {
    id: 'runtime',
    label: 'Runtime & feature modes',
    description: 'Mid-spin mode swaps, frame middleware.',
  },
];

/**
 * Every recipe card on /recipes/ comes from this list. The `group` field
 * controls which section the card renders under on the index page.
 */
export const RECIPES: RecipeMeta[] = [
  // ── Per-reel geometry / MultiWays / Big symbols ───────────────────
  {
    slug: 'pyramid-shape',
    group: 'pyramid',
    title: 'Per-reel shape (pyramid)',
    oneLiner: 'Non-uniform reel set — 3-5-5-5-3 pyramid, diamond, half-pyramid. Static shape set at build time.',
    steps: [
      'Pass an array to .visibleRowsPerReel([3, 5, 5, 5, 3]) instead of .visibleRows(n)',
      'Optionally set .reelAnchor("center" | "top" | "bottom") to control vertical alignment',
      'getCellBounds(col, row) reflects per-reel offsetY automatically',
    ],
    apis: ['ReelSetBuilder.visibleRowsPerReel', 'ReelSetBuilder.reelAnchor', 'Reel.offsetY'],
    tags: ['shape', 'pyramid', 'geometry', 'layout'],
  },
  {
    slug: 'spine-pyramid-shape',
    group: 'pyramid',
    title: 'Pyramid shape with Spine',
    oneLiner: 'Same 3-5-5-5-3 pyramid, every cell a Spine 2D skeleton. Crisp at every per-reel cell size, with idle/landing/win/destroy animations baked in.',
    steps: [
      '`await loadGeneratedSpines()` once before building',
      'Map symbol ids to skeleton names with `buildSpineMap({ id: "low_a", ... })`',
      'Register every id with `SpineReelSymbol` — same registration as a uniform layout',
    ],
    apis: ['SpineReelSymbol', 'loadGeneratedSpines', 'buildSpineMap', 'ReelSetBuilder.visibleRowsPerReel'],
    tags: ['shape', 'pyramid', 'spine', 'custom-symbol', 'animation'],
  },
  {
    slug: 'multiways',
    group: 'multiways',
    title: 'MultiWays',
    oneLiner: 'Per-spin row variation — each reel can land on a different row count between minRows and maxRows.',
    steps: [
      'Build with .multiways({ minRows, maxRows, reelPixelHeight })',
      'Each spin, call reelSet.setShape(rowsPerReel) BEFORE setResult()',
      'AdjustPhase reshapes reels (resize symbols + reshape motion) before STOP',
    ],
    apis: ['ReelSetBuilder.multiways', 'ReelSet.setShape', 'AdjustPhase'],
    tags: ['multiways', 'shape', 'reshape', 'geometry'],
  },
  {
    slug: 'spine-big-symbols',
    group: 'big-symbols',
    title: 'Big symbols with Spine',
    oneLiner: 'Same 2×2 anchor mechanic, every cell a Spine skeleton. The bigWild reuses the regular wild rig — Spine scales it to the larger block without losing crispness.',
    steps: [
      '`await loadGeneratedSpines()` once before building — boots the atlas + 10 skeleton JSONs',
      'Register every id with `SpineReelSymbol` and pass the same map to each registration',
      'Mark the big symbol with `size: { w: 2, h: 2 }` and `weight: 0` — anchor-only, never from random fill',
    ],
    apis: ['SpineReelSymbol', 'loadGeneratedSpines', 'buildSpineMap', 'ReelSetBuilder.symbolData'],
    tags: ['big-symbols', 'spine', 'custom-symbol', 'animation'],
  },
  {
    slug: 'big-symbols-mxn',
    group: 'big-symbols',
    title: 'MxN big symbols — every shape',
    oneLiner: 'Square 2×2, tall 1×3, giant 3×3, wide 2×4 — one focused interactive demo per shape, with the placement logic spelled out.',
    steps: [
      'Same registration API for every shape: { weight: 0, size: { w, h } }',
      'Anchor formula: col in [0, REELS - w], row in [0, ROWS - h]',
      'getSymbolFootprint + getBlockBounds resolve any cell to its anchor + pixel rect',
    ],
    apis: ['SymbolData.size', 'ReelSet.getSymbolFootprint', 'ReelSet.getBlockBounds'],
    tags: ['big-symbols', 'layout', 'sizing'],
  },
  {
    slug: 'get-block-bounds',
    group: 'big-symbols',
    title: 'getBlockBounds — outline a big symbol',
    oneLiner: 'Draw a single rectangle that hugs an entire N×M block, regardless of which cell you pass. Works for 1×1 (equivalent to getCellBounds) and 1×N expanding wilds.',
    steps: [
      'getBlockBounds(col, row) returns { x, y, width, height } in ReelSet-local pixels',
      "Pass any cell of a block — anchor or non-anchor — both return the same rect",
      'Use for win frames, cluster outlines, hit-area overlays',
    ],
    apis: ['ReelSet.getBlockBounds', 'ReelSet.getSymbolFootprint'],
    tags: ['big-symbols', 'overlay', 'cell-bounds'],
  },
  {
    slug: 'card-symbol-debug',
    group: 'starters',
    title: 'CardSymbol — debug / prototyping helper',
    oneLiner: 'No-asset PIXI.Graphics symbol class for recipes, mechanic tests, and prototypes. NOT for production — ship Sprite/Animated/Spine instead.',
    steps: [
      "Import CardSymbol, CARD_DECK from `examples/shared/CardSymbol.ts`",
      'Register one symbol id per card with its own color',
      'No textures, no atlases — geometry redrawn at every resize',
    ],
    apis: ['CardSymbol', 'CARD_DECK', 'WILD_CARD', 'PIXI.Graphics'],
    tags: ['debug', 'prototyping', 'custom-symbol', 'graphics'],
  },
  {
    slug: 'multiways-cascade',
    group: 'multiways',
    title: 'MultiWays cascade',
    oneLiner: 'Per-spin row variation on a strip-spin landing; cascade tumble pops winners and drops new symbols in from above. Shape-aware on every reel.',
    steps: [
      'Build with .multiways({minRows, maxRows, reelPixelHeight}) + .tumble({...}) for the refill phases',
      'Each round, call setShape(rowsPerReel) BEFORE setResult()',
      'reelSet.spin({ mode: \'standard\' }) — strip-spin lands the multiways grid (AdjustPhase reshapes during SPIN→STOP)',
      'reelSet.runCascade({ detectWinners, nextGrid }) tumbles winners and drops new symbols in from above',
    ],
    apis: ['ReelSetBuilder.multiways', 'ReelSetBuilder.tumble', 'ReelSet.setShape', 'ReelSet.runCascade'],
    tags: ['multiways', 'cascade', 'hybrid', 'recent'],
  },
  {
    slug: 'sticky-wild-multiways',
    group: 'multiways',
    title: 'Sticky wild on MultiWays',
    oneLiner: 'Pin survives every MultiWays reshape — clamps when shape shrinks, restores to originRow when it grows back.',
    steps: [
      'Pin wilds on spin:allLanded — originRow is frozen at placement',
      'Each spin, setShape(rowsPerReel) — AdjustPhase migrates pins via min(originRow, newRows-1)',
      'pin:migrated fires per affected pin with { fromRow, toRow, clamped, reelIndex }',
    ],
    apis: ['ReelSet.pin', 'CellPin.originRow', 'AdjustPhase', 'pin:migrated event'],
    tags: ['multiways', 'sticky', 'wild', 'cell-pin', 'pin-migration'],
  },

  // ── Starter templates (merged in from /templates/) ─────────────────
  {
    slug: 'classic-5x3',
    group: 'starters',
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
    group: 'starters',
    title: 'Cascade 6×5 tumble',
    oneLiner: 'Modern tumble mechanic with an ever-growing multiplier — MultiWays-adjacent.',
    steps: [
      'Build a 6×5 ReelSet with .tumble({ fall, dropIn }) for drop-in mechanics',
      'Spin, detect cluster/line wins, spotlight them',
      'Tumble (remove winners, then reelSet.refill({ winners, grid })) and repeat',
      'Each tumble increments the win multiplier',
    ],
    apis: ['ReelSetBuilder.tumble', 'ReelSet.refill', 'ReelSet.setDropOrder', 'ReelSet.setResult'],
    tags: ['starter', 'cascade', '6x5'],
  },
  {
    slug: 'tumble-feels',
    group: 'cascade',
    title: 'Tumble feels — every preset',
    oneLiner: 'Five interactive canvases — same spin + cascade-refill, only .tumble({ fall, dropIn }) changes. Click each to compare feels.',
    steps: [
      'Same builder + same scripted spin on every canvas',
      'Only the .tumble({ fall, dropIn }) shape differs between them',
      'Pick whichever reads right for your art / theme / pace',
    ],
    apis: ['ReelSetBuilder.tumble', 'ReelSet.refill', 'TumbleFallConfig', 'TumbleDropInConfig'],
    tags: ['cascade', 'tumble', 'presets', 'recent'],
  },
  {
    slug: 'refill-orders',
    group: 'cascade',
    title: 'Cascade refill orders',
    oneLiner: 'Four interactive canvases — same destruction, only the post-win refill ordering changes. Simultaneous, LTR wave, bottom-up, top-down.',
    steps: [
      'Initial reveal is identical (LTR wave) on every canvas',
      'Winners destruct the same way; the post-removal pause is fixed',
      'Only the refill drop-in order differs (setDropOrder + rowStagger + rowOrder)',
    ],
    apis: ['ReelSet.refill', 'ReelSet.setDropOrder', 'TumbleDropInConfig.rowStagger', 'TumbleDropInConfig.rowOrder'],
    tags: ['cascade', 'tumble', 'refill', 'presets', 'recent'],
  },
  {
    slug: 'tumble-anticipation',
    group: 'cascade',
    title: 'Cascade anticipation refill',
    oneLiner: 'Two-stage refill: survivors slide down first, then a global anticipation beat for multipliers / mascots, then new symbols drop in column by column.',
    steps: [
      'Initial reveal is a normal left-to-right wave',
      'Winners destruct, then survivors slide down (cascade:gravity:* events fire)',
      'Global gravityHoldMs window — plug anticipation visuals in here',
      'New symbols drop in from above, column by column (cascade:dropIn:* events)',
    ],
    apis: ['ReelSet.refill', 'RunCascadeOptions.refillMode', 'RunCascadeOptions.gravityHoldMs', 'RunCascadeOptions.onGravityComplete'],
    tags: ['cascade', 'tumble', 'refill', 'two-stage', 'anticipation', 'recent'],
  },
  {
    slug: 'fall-delays',
    group: 'cascade',
    title: 'Lead-in delay before the fall',
    oneLiner: 'Four interactive canvases — same spin, only the gap between SPIN click and the first frame of fall-out varies. From 0 ms (instant) to 700 ms (dramatic).',
    steps: [
      'Click SPIN — handler runs immediately',
      'Optionally await a lead-in pause (0 / 150 / 350 / 700 ms)',
      'Call reelSet.spin() — the fall begins',
    ],
    apis: ['ReelSet.spin', '(user-code: await wait(ms))'],
    tags: ['cascade', 'tumble', 'lead-in', 'pacing', 'recent'],
  },
  {
    slug: 'hold-and-win',
    group: 'starters',
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
    slug: 'symbol-transform',
    group: 'features',
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

  // ── UX & system recipes ────────────────────────────────────────────
  {
    slug: 'remove-symbol',
    group: 'cascade',
    title: 'Remove symbol in a cascade',
    oneLiner: 'Fade winners out, then drop the next-stage symbols in from above — no reel respin.',
    steps: [
      'Detect winning cells on the visible grid',
      'reelSet.destroySymbols(winners) fades them out',
      'reelSet.refill({ winners, grid }) slides survivors and drops new symbols from above',
    ],
    apis: ['ReelSet.destroySymbols', 'ReelSet.refill', 'ReelSet.runCascade'],
    tags: ['cascade', 'animation'],
  },
  {
    slug: 'anticipate-a-reel',
    group: 'tension',
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
    slug: 'peek-from-above',
    group: 'tension',
    title: 'Peek symbol from buffer-above',
    oneLiner: 'Pre-fill the buffer-above slot so a teaser symbol sits just out of frame, visible during scroll-in on the next spin.',
    steps: [
      'Seed initialFrame with a ColumnTarget that sets bufferAbove at build time',
      'On every spin, pass the same { visible, bufferAbove } shape to setResult so the teaser carries forward',
      'When the next spin starts, that symbol is the first to scroll into the visible area',
    ],
    apis: ['ReelSetBuilder.initialFrame', 'ReelSet.setResult', 'ColumnTarget'],
    tags: ['buffer', 'peek', 'tension', 'reveal'],
  },
  {
    slug: 'anticipation-teaser',
    group: 'tension',
    title: 'Anticipation teaser',
    oneLiner: 'Combine setAnticipation with a buffer-above prefill so a slow reel approaches a known high-value symbol — the player literally sees the bonus coming.',
    steps: [
      'Call setAnticipation([...reels]) to slow specific reels before they land',
      'Set result[col][-1] = HIGH_VALUE on those same reels to pin a symbol just above the visible area',
      'During anticipation deceleration, the symbol is visible at the top edge of the reel',
    ],
    apis: ['ReelSet.setAnticipation', 'ReelSet.setResult', 'AnticipationPhase'],
    tags: ['anticipation', 'tension', 'buffer', 'peek'],
  },
  {
    slug: 'paylines-custom-animation',
    group: 'wins',
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
    group: 'cascade',
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
    slug: 'spin-then-cascade',
    group: 'cascade',
    title: 'Spin first, cascade after',
    oneLiner: 'Open every play with a classic strip-spin, then cascade the respins — one ReelSet, the per-spin mode override does the switch.',
    steps: [
      'Build with a default mode AND .tumble(...) registered',
      'Round 1 — call spin() (default standard)',
      'Cascade respins — call spin({ mode: "cascade" }) per round',
    ],
    apis: ['ReelSetBuilder.tumble', 'reelSet.spin', 'SpinOptions.mode'],
    tags: ['hybrid', 'cascade', 'spin-mode', 'recent'],
  },
  {
    slug: 'paylines-events-only',
    group: 'wins',
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
    group: 'tension',
    title: 'Slam-stop',
    oneLiner: 'Let the player smash the button to land the reels now.',
    steps: [
      'On spin click: if isSpinning, call reelSet.skipSpin(). Otherwise reelSet.spin()',
      'First skipSpin() in a round lands the spin AND applies a side effect (speed boost in standard mode; auto-slam future refills in cascade). Subsequent presses also slam',
      'Use requestSkip() when result may not be in yet, or slamStop() for an unconditional land (tests, anti-cheat)',
      'Inspect result.wasSkipped on the returned promise',
    ],
    apis: ['ReelSet.skipSpin', 'ReelSet.requestSkip', 'ReelSet.slamStop', 'ReelSet.skipStage', 'ReelSet.isSpinning', 'SpinResult.wasSkipped'],
    tags: ['skip', 'UX'],
  },
  {
    slug: 'near-miss',
    group: 'tension',
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
    slug: 'nudge',
    group: 'tension',
    title: 'Nudge a reel',
    oneLiner: 'After landing, shift one reel down or up by N positions to reveal caller-supplied symbols — the classic UK fruit-machine nudge.',
    steps: [
      'Wait for the spin to land',
      'Call reelSet.nudge(col, { distance, direction, incoming }) — incoming is required, top-down order of the new visible positions',
      'Await the promise to read the new visible column for re-running win detection',
      'For multi-reel beats, wrap several nudge() calls in Promise.all([...])',
    ],
    apis: ['ReelSet.nudge', 'NudgeOptions', 'nudge:start', 'nudge:complete'],
    tags: ['nudge', 'fruit-machine', 'recent'],
  },
  {
    slug: 'nudge-spotlight',
    group: 'tension',
    title: 'Spotlight after a nudge',
    oneLiner: 'Land a near-miss, parallel-nudge three reels to complete a wild line, then run SymbolSpotlight on the new winners. The "rescue spin" beat in three primitives.',
    steps: [
      'Spin and land on a flat near-miss',
      'Promise.all three reelSet.nudge calls so the middle reels drop in `wild` together',
      'Build win cells from the nudged reels and call reelSet.spotlight.show(...)',
      'Await spotlight completion, then spotlight.hide()',
    ],
    apis: ['ReelSet.nudge', 'ReelSet.spotlight.show', 'ReelSet.spotlight.hide', 'nudge:complete'],
    tags: ['nudge', 'spotlight', 'wins', 'fruit-machine', 'recent'],
  },
  {
    slug: 'nudge-skip',
    group: 'tension',
    title: 'Skip an in-flight nudge',
    oneLiner: 'reelSet.skipNudge(col) fast-forwards a running nudge tween to its landed position. The original nudge() promise resolves normally — success path still runs.',
    steps: [
      'Run a long nudge so the player has time to react',
      'On the player\'s tap during the nudge, call reelSet.skipNudge(col)',
      'The tween jumps to its landed state, nudge() resolves on the next microtask',
      'Strip lands at the deterministic post-nudge position regardless',
    ],
    apis: ['ReelSet.skipNudge', 'Reel.isNudging'],
    tags: ['nudge', 'skip', 'ux', 'recent'],
  },
  {
    slug: 'nudge-abort',
    group: 'tension',
    title: 'Abort a nudge',
    oneLiner: 'Cancel a running nudge via NudgeOptions.signal. Strip still snaps to landed; nudge() rejects with AbortError; nudge:cancelled fires on the bus.',
    steps: [
      'Wire an AbortController into NudgeOptions.signal',
      'Trigger the abort while the tween is running',
      'Catch AbortError to take the cancellation path; non-abort errors re-throw',
      'nudge:cancelled fires on the reel-set bus carrying the reason',
    ],
    apis: ['NudgeOptions.signal', 'AbortController', 'nudge:cancelled'],
    tags: ['nudge', 'abort', 'cancellation', 'recent'],
  },
  {
    slug: 'nudge-stagger',
    group: 'tension',
    title: 'Staggered nudge — wave reveal',
    oneLiner: 'Promise.all + NudgeOptions.startDelay dispatches every reel\'s tween concurrently with a per-reel offset. Reads as a wave; faster than sequential, more theatrical than synchronised parallel.',
    steps: [
      'Promise.all over the target reels with startDelay: i * STAGGER_MS',
      'Total wall time = (cols.length - 1) * stagger + duration',
      'Validation throws still fire synchronously — only the mutation defers',
      'Cancel mid-wave with an AbortSignal; reels in startDelay bail before mutating',
    ],
    apis: ['ReelSet.nudge', 'NudgeOptions.startDelay'],
    tags: ['nudge', 'stagger', 'wave', 'recent'],
  },
  {
    slug: 'nudge-big-symbol',
    group: 'tension',
    title: 'Nudge through a big symbol',
    oneLiner: 'A 1xH block on the target reel is nudged through as a unit. Survival formula enforced; cross-reel (w>1) blocks throw.',
    steps: [
      'Land with a 1x2 wild at rows 0+1',
      'Nudge DOWN by 2 — block survives (anchor + h + distance < total), lands half-visible',
      'Nudge UP by 1 — block returns to full visibility',
      'Cross-reel blocks throw; in-flight wrap never splits anchor from stubs',
    ],
    apis: ['ReelSet.nudge', 'SymbolData.size'],
    tags: ['nudge', 'big-symbols', 'block', 'recent'],
  },
  {
    slug: 'texture-atlas-symbols',
    group: 'symbol-formats',
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
    group: 'wilds',
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
    group: 'wilds',
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
    slug: 'multiplier-wild-pin',
    group: 'wilds',
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
    group: 'features',
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
    group: 'features',
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
    group: 'features',
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
    group: 'wilds',
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
    group: 'features',
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
    group: 'cell-coords',
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
    group: 'cell-coords',
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

  // ── movePin + frame exposure recipes ──────────────────────────────────
  {
    slug: 'walking-wild-pin',
    group: 'wilds',
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
    group: 'runtime',
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
