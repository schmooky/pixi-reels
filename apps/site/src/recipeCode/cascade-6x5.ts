export default `// --- Recipe: Cascade 6x5 ------------------------------------------------
// 6 reels, 5 rows, and CascadeMode's drop-in scroll style. On every land
// we detect any 3+ cluster of matching neighbours (up/down/left/right),
// blank the winners with a neutral tile, and brief-pause - the next spin
// naturally tumbles fresh symbols in.
// ------------------------------------------------------------------------

function buildReels() {
  const EMPTY = 'misc/frame_1';
  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3', 'round/round_4',
    'royal/royal_1', 'royal/royal_2', 'wild/wild_1', EMPTY,
  ];
  const weights: Record<string, number> = {
    'round/round_1': 20, 'round/round_2': 20, 'round/round_3': 18, 'round/round_4': 18,
    'royal/royal_1': 12, 'royal/royal_2': 12, 'wild/wild_1': 4,
  };

  const reelSet = new ReelSetBuilder()
    .reels(6).visibleSymbols(5)
    .symbolSize(72, 72)
    .symbolGap(3, 3)
    .symbols((r) => {
      for (const id of ids) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    })
    .weights(weights)
    .symbolData({ 'wild/wild_1': { zIndex: 5 }, [EMPTY]: { zIndex: 0 } })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .spinningMode(new CascadeMode())
    .ticker(app.ticker)
    .build();

  const nextResult = () =>
    Array.from({ length: 6 }, () =>
      Array.from({ length: 5 }, () => pickWeighted(weights)),
    );

  // 4-neighbour cluster flood-fill starting from each cell.
  const onLanded = async (result) => {
    const WILD = 'wild/wild_1';
    const grid = result.symbols.map((col) => col.slice());
    const visited = Array.from({ length: 6 }, () => Array(5).fill(false));
    const clusters: Array<Array<{ c: number; r: number }>> = [];
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 5; r++) {
        if (visited[c][r]) continue;
        const target = grid[c][r];
        if (!target || target === EMPTY || target === WILD) continue;
        const cluster: Array<{ c: number; r: number }> = [];
        const stack = [{ c, r }];
        while (stack.length) {
          const cell = stack.pop();
          if (!cell || visited[cell.c][cell.r]) continue;
          const v = grid[cell.c][cell.r];
          if (v !== target && v !== WILD) continue;
          visited[cell.c][cell.r] = true;
          cluster.push(cell);
          if (cell.c > 0) stack.push({ c: cell.c - 1, r: cell.r });
          if (cell.c < 5) stack.push({ c: cell.c + 1, r: cell.r });
          if (cell.r > 0) stack.push({ c: cell.c, r: cell.r - 1 });
          if (cell.r < 4) stack.push({ c: cell.c, r: cell.r + 1 });
        }
        if (cluster.length >= 3) clusters.push(cluster);
      }
    }
    if (clusters.length === 0) return;
    await new Promise((r) => setTimeout(r, 300));
    // Blank every winning cell.
    for (const cluster of clusters) {
      for (const cell of cluster) {
        const col = reelSet.reels[cell.c].getVisibleSymbols().slice();
        col[cell.r] = EMPTY;
        reelSet.reels[cell.c].placeSymbols(col);
      }
    }
  };

  return { reelSet, nextResult, onLanded, cancel: () => reelSet.skip() };
}
`;
