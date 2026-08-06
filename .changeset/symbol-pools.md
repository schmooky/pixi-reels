---
'pixi-reels': minor
---

Add: symbol pools. `builder.randomSymbols(pool, scope)` and the runtime `reelSet.randomSymbols` decide what the engine may draw for cells the game does not name. A pool is `{ weights?, exclude? }`; its scope is `{ reel?, slots?: 'spinning' | 'buffer' }`.

Until now `weights()` was one table for the whole set, and the only levers past it. `setExcludeSpinning` / `setExcludeBuffer` on `RandomSymbolProvider` were unreachable from a built set (the provider is deliberately not exported, and `Reel` keeps its reference private), so "keep this symbol out of the buffer cells" meant writing a `FrameMiddleware`. Two things games actually ask for now have a call:

```ts
// A coin may blur past mid-spin, but must never park half-visible
// above or below the grid.
reelSet.randomSymbols.set({ exclude: ['COIN'] }, { slots: 'buffer' });

// Reel 2 runs hot on wilds for the feature, then back to the base table.
reelSet.randomSymbols.set({ weights: { WILD: 40 } }, { reel: 2 });
reelSet.randomSymbols.set(null, { reel: 2 });
```

The two ends of the strip can be governed separately: `slots` takes `'bufferStart'` and `'bufferEnd'` as well as `'buffer'` (both) and `'spinning'` (everything). `bufferStart` is the side at the smaller main coordinate - above on a vertical set, left on a horizontal one - the same end `ColumnTarget.bufferStart` addresses, whichever way the reel travels.

```ts
// Nothing peeks in from above; the cell below the grid is left alone.
reelSet.randomSymbols.set({ exclude: ['COIN'] }, { slots: 'bufferStart' });
// ...on one reel only.
reelSet.randomSymbols.set({ exclude: ['COIN'] }, { reel: 2, slots: 'bufferEnd' });
```

Layers resolve base weights -> global spinning -> per-reel spinning -> global buffer -> per-reel buffer -> global side -> per-reel side. Weights override per symbol id, exclusions accumulate, and a narrower layer can never re-admit what a wider one banned. A weight of `0` bans a symbol as surely as `exclude` does, in a pool and in `weights()` alike. Pools govern the RANDOM draw only. an explicit `setResult` / `initialFrame` target is the game speaking and always wins. `weights(scope?)` reports the effective table, so a game can assert its own configuration in a test; ask for `'buffer'` to see what both sides inherit, or for a side to see exactly what it draws from.

Two failure modes now fail loud instead of quietly doing nothing: naming an unregistered symbol id in a pool throws (with the registered ids listed), and a pool that leaves some reachable scope with nothing to draw throws at the call that caused it, naming the scope, rather than mid-spin on whichever reel wraps first. The rejected pool is not installed. `setExcludeSpinning` / `setExcludeBuffer` keep working as sugar over the global spinning / buffer pools.

`Reel.placeStrip` now random-fills each empty slot from the pool that slot belongs to. it used to apply the buffer rules to visible cells too, which mattered the moment "buffer" stopped meaning "everything a skip places".
