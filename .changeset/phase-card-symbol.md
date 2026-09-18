---
'pixi-reels': minor
---

Add: `PhaseCardSymbol` - a `CardSymbol` that is grey at rest and takes the colour of the phase its reel is running, so a spin can be read straight off the board: sky while the reel accelerates, blue at full speed, amber through a tease, violet while the stop spins the frame in, a green beat on landing, then grey again. Debug scaffolding with the same status as `CardSymbol`, not production art.

The card does not know its reel. `PhaseCardSymbol.watch(reelSet.reels)` paints every card on those reels from each reel's own `phase:enter`, `landed` and `symbol:created` events (a card swapped in mid-phase is painted on arrival, other symbol classes are left alone) and returns the release. Custom phases are painted by their key, `other` when `PHASE_CARD_COLORS` has no entry; `colors` overrides or extends the map per registration, `landedMs` sets the landed beat, and `setPhase()` is public for anything else that knows the phase.
