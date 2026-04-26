# Spine recipe — Megaways- and big-symbol-ready skeletons

Pixi-reels resizes Spine symbols on every cell-size change. For Megaways slots that means every reshape; for big symbols that means landing on an `N×M` block; even for non-uniform pyramids it means each reel may have its own cell height. This recipe captures what your skeleton needs to provide so the engine can scale it cleanly across all those cases.

If you're building a 1×1 symbol for a fixed-shape slot, only sections "Skeleton geometry" and "Required animations" matter. The rest is about how to behave under reshape.

## Skeleton geometry

- **Root bone at origin `(0, 0)`**, representing the **center of the cell**. The library positions `spine.position` to `(cellW/2, cellH/2)` and applies a uniform scale around that origin.
- Art is positioned around root such that the natural bounding box is centered. Off-center authoring is allowed; the lib will scale uniformly around the skeleton origin and any offset bakes in.
- **Uniform scale only.** The lib calls `skeleton.scale.set(s)` with a single number. Non-uniform scale applied internally by the skeleton (e.g. squash-and-stretch animations) is fine; non-uniform scale applied externally is not.
- **Root bone MUST NOT move during `idle`.** Motion belongs to child bones. Root drift breaks cell alignment.

## Required animations

| Name | Type | Description |
|---|---|---|
| `idle` | loop | Default state. Plays whenever the symbol is visible and not winning/landing. Seamless loop — root returns to origin on the loop boundary. |
| `win` | loop or one-shot | Called by `playWin()`. Loops if the animation is set as looping in the skeleton; otherwise plays once and holds the last frame. |

## Optional animations

| Name | Type | Trigger | Notes |
|---|---|---|---|
| `land` | one-shot | After AdjustPhase + StopPhase bounce | Keep under ~400 ms. End at the idle baseline or `idle` will snap. |
| `intro` | one-shot | First visible entry into the reel window | Played by the consumer via a custom symbol subclass; the lib does not trigger by default. |
| `win_end` | one-shot | Called by `stopAnimation()` | If absent, the lib hard-cuts the `win` track to `idle`. Recommend a 100–200 ms transition. |
| `expand` | one-shot | Expanding wild (`1×1` → `1×N`) | Visual tween only; the size change is lib-driven via `resize()`. |
| `big_idle` | loop | Big-symbol variant | The lib selects this instead of `idle` when `SymbolData.size.w * size.h > 1`, if your subclass dispatches on size. |

## Texture and atlas

- Use a single `.atlas` + `.webp` page per symbol, OR a shared atlas across all symbols (preferred for drawcall reduction). The vite config already serves textures from `examples/assets/`.
- Author at the **largest** size the symbol will render at:
  - Non-Megaways 1×1: ~300 px tall.
  - Megaways with `minRows=2, reelPixelHeight=600`: ~300 px tall (same as the maxRows case at 7 rows).
  - Big symbol 2×2: ~600 px tall.
- Down-scaling looks fine. Up-scaling past authoring size looks bad.

## `resize()` for maintainers and subclass authors

```ts
resize(w: number, h: number): void {
  this._cellWidth = w;
  this._cellHeight = h;
  this.spine.position.set(w / 2, h / 2);
  const scale = Math.min(w / this._naturalW, h / this._naturalH);
  this.spine.scale.set(scale);
}
```

- Capture `this._naturalW/H` from `skeleton.getBounds()` on construction.
- `Math.min` preserves aspect. If the cell aspect ratio differs from the skeleton aspect ratio, the symbol letterboxes within the cell.
- Called on every swap AND every AdjustPhase reshape. **Be idempotent** — calling `resize(x, x)` twice must yield the same result.
- Called on big-symbol landing with `(w*cellW, h*cellH)`.

## Update driver

- The pixi-spine `Spine` instance is updated by `app.ticker` via `TickerRef`. Don't install a second update loop. Don't call `skeleton.updateWorldTransform` manually inside animations.
- Examples already do `gsap.ticker.remove(gsap.updateRoot)` and drive GSAP from `app.ticker` so animations don't freeze in hidden tabs. Don't add a second GSAP driver.

## Skins

Use Spine skins for palette/variant swaps. The lib does not set skins by default — set in a custom `SpineSymbol` subclass via `skeleton.setSkin(name)` inside `onActivate`.

## Failure modes (how to spot a broken skeleton)

| Symptom | Likely cause |
|---|---|
| Symbol drifts out of cell during idle | Root bone animated in `idle`. Remove root motion. |
| Distortion at small Megaways sizes | Non-uniform scale inside the skeleton, OR aspect mismatch with the cell. |
| Blurry at 2×2 / 2-row Megaways | Texture authored too small. Re-export atlas at 2×. |
| Flicker on reshape | `resize()` not idempotent, or constructor-only positioning not re-applied in `resize()`. |
| Win animation cut off | `win` length exceeds the WinPresenter dim duration. Shorten `win` or lengthen dim. |
| Double-update feel (too fast) | A second ticker is installed somewhere. Remove it. |

## Anti-patterns (definite breakage)

- Animating root position in `idle` or `win_end`.
- Non-uniform external scale (different X/Y).
- Hardcoded pixel offsets in animations (offsets should be relative to the skeleton's natural size).
- Multiple skeletons per symbol — composite via slots/skins, or build a custom `ReelSymbol` subclass.
- Adding a second ticker inside the skeleton.
- Using specific bone names from outside the subclass.
