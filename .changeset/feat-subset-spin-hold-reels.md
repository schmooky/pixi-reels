---
"pixi-reels": minor
---

Add: `reelSet.spin({ holdReels: [...] })` for subset spinning.

Held reels skip START / SPIN / STOP entirely and stay on whatever symbols they're currently showing — no more "fragment the board into one ReelSet per column" workaround for Hold & Win, sticky / expanding wilds, or trigger-column bonus respins. Held reels count as already-landed for the `spin:allLanded` resolver, so only the non-held reels actually animate.

```ts
// Hold reels 0 and 4; only reels 1, 2, 3 reroll.
const spin = reelSet.spin({ holdReels: [0, 4] });
reelSet.setResult(serverGrid); // entries at 0/4 are ignored
await spin;
```

Behaviour:
- `setResult(grid)` still expects a full `reelCount`-length grid; held entries are ignored.
- `setAnticipation([...])` silently filters held indices.
- `setStopDelays([...])` entries at held indices are ignored.
- No `spin:reelLanded` / `spin:stopping` event fires for held reels; `spin:allLanded` fires once every non-held reel lands.
- Out-of-range / duplicate / non-integer entries in `holdReels` are silently filtered.
- Big-symbol blocks crossing the held / non-held boundary are not supported — author results so big symbols stay inside a contiguous run of non-held reels.

Exports `SpinOptions` from the package root.
