// @ts-nocheck
// Injected: HoldAndWinBuilder, PhaseCardSymbol, SpeedPresets, PIXI, gsap, app
//
// QUICKEN ON THE BOARD. `board.skip({ mode: 'quicken' })`.
//
// Every cell is its own 1x1 reel set, and the board folds its stagger into
// each cell's spin floor. A quicken asks every in-flight cell for its
// landing: the floor drops, so the whole wave lands together, and each cell
// still spins its symbol in and bounces. `board.skip()` with the default
// `'slam'` places them instead. `{ speed: 'turbo' }` lands the wave on the
// turbo profile; `HoldAndWinBuilder.skipMode('quicken')` would make it the
// board's default.
//
// `feature:skip` reports how many cells were in flight and the mode; after a
// quicken there is nothing for the game layer to cut short, and the landing
// flow (`cell:landed`, `coin:locked`, `respin:end`) is unchanged. The coins
// are PhaseCardSymbol, so a spinning cell is blue and a landing one violet;
// a placed one goes straight to grey.

const COIN = 'coin', CELL = 60, GAP = 6, COLS = 5, ROWS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => r.register(COIN, PhaseCardSymbol, { label: 'C' }))
  .weights({ [COIN]: 1, empty: 3 })
  .respins(3)
  .speeds({ normal: { ...SpeedPresets.NORMAL, minimumSpinTime: 700 }, turbo: SpeedPresets.TURBO })
  .initialSpeed('normal')
  // A slow diagonal wave, so a quicken has something to collapse.
  .stagger((reel, cell) => (reel + cell) * 160)
  .cellChrome((g, size) => g.roundRect(0, 0, size, size, 8).fill({ color: 0x140f2e, alpha: 0.55 }).stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 }))
  .ticker(app.ticker)
  .build();

// One watcher for every cell's reel.
const cells = [];
for (let reel = 0; reel < COLS; reel++) for (let cell = 0; cell < ROWS; cell++) cells.push({ reel, cell });
const unwatch = PhaseCardSymbol.watch(cells.flatMap((c) => board.reelAt(c).reels));

const boardW = COLS * CELL + (COLS - 1) * GAP, boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = 40;
app.stage.addChild(board.container);

const hud = new PIXI.Text({
  text: 'press spin, then tap again mid-wave to QUICKEN it',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);

// When the wave landed relative to the press: one number per quickened wave.
let pressedAt = 0;
let landedInWave = 0;
board.events.on('feature:skip', ({ inFlight, mode }) => {
  pressedAt = performance.now();
  landedInWave = 0;
  hud.text = `${mode}: ${inFlight} cells landing through their stop on turbo`;
});
board.events.on('cell:landed', () => {
  if (!pressedAt) return;
  landedInWave += 1;
  hud.text = `quicken: ${landedInWave} landed, last one ${Math.round(performance.now() - pressedAt)} ms after the press`;
});
board.events.on('respin:start', () => { pressedAt = 0; });

const SEED = [{ cell: { reel: 1, cell: 1 }, id: COIN, data: { value: 10 } }, { cell: { reel: 3, cell: 2 }, id: COIN, data: { value: 25 } }];
const ROUNDS = [[{ reel: 0, cell: 0 }, { reel: 4, cell: 1 }], [{ reel: 2, cell: 0 }], [{ reel: 1, cell: 2 }], []];

let running = false;
return {
  board,
  cleanup: () => {
    unwatch();
    try { hud.destroy(); } catch {}
    board.destroy();
  },
  onSkip: () => {
    if (!running) return;
    board.skip({ mode: 'quicken', speed: 'turbo' });
  },
  onSpin: async () => {
    if (running) return;
    running = true;
    board.reset();
    board.enter(SEED);
    hud.text = 'feature running: tap to quicken the wave';
    await sleep(300);
    for (const hits of ROUNDS) {
      const res = await board.respin(hits.map((cell) => ({ cell, id: COIN, data: { value: 10 } })));
      await sleep(500);
      if (res.done) break;
    }
    hud.text = 'feature over: press spin';
    running = false;
  },
};
