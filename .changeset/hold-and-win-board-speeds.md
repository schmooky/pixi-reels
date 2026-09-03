---
"pixi-reels": minor
---

Add: named speed profiles for the whole Hold & Win board. `HoldAndWinBuilder.speeds({ normal, turbo, superTurbo })` registers each profile into every cell's SpeedManager (`speedProfile(p)` is now `speeds({ normal: p })`), `initialSpeed(name)` picks the one active at build, `board.setSpeed(name)` switches every cell at once and fires `speed:changed`, `board.addSpeed(name, profile)` registers another after build, and `board.speed` / `board.speedNames` read them back. As on a single reel set, a cell already in flight finishes on the profile it started with; the next wave (or `skip()`) shows the new one. The `stagger` callback now receives the active speed name as its third argument.
