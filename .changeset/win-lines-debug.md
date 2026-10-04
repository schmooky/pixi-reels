---
'pixi-reels': minor
---

Add: `WinLines` in `pixi-reels/debug`, paylines and payways drawn over a reel set with pixi-silk. `lines.line(cells)` draws one polyline through the cell centres; `lines.ways(perReel)` joins every winning cell to every winning cell on the next reel, a lattice whose paths are the ways, so a win of millions of ways is still a few dozen segments. Each call returns its own `SilkGraphics` for fading or pulsing; `clear()` removes them. It is `Disposable`: `destroy()` frees every line, and drawing after it throws. Cells are read at draw time, so a board that grew with `expand()` is drawn where it is now. The library still computes no wins: it draws the cells it is handed.

```ts
import { WinLines } from 'pixi-reels/debug';

const lines = new WinLines(reelSet);
lines.ways(win.perReel);       // [[0, 2], [1], [0, 1, 2]]: winning cells per reel
reelSet.events.on('spin:start', () => lines.clear());
```
