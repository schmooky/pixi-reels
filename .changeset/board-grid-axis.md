---
'pixi-reels': minor
---

Add: `BoardGrid` and `HoldAndWinBuilder` take a travel axis, so a board's cells can fill sideways or upward.

ADR 016 section 7 listed sideways Hold & Win cells as unlocked by the axis work, but `BoardGrid` built every cell with a bare `ReelSetBuilder` and neither it nor `HoldAndWinBuilder` exposed an orientation, so a coin always scrolled in from above.

```ts
new HoldAndWinBuilder().grid(5, 3).axis('horizontal', 'reverse')
```

Cells are 1x1 reel sets, so this picks the edge a symbol scrolls in from. It does not touch the board layout: `cols` and `rows` stay board dimensions, and `BoardGrid`/`HoldAndWinBoard` keep that vocabulary deliberately. Defaults to vertical / forward, unchanged.
