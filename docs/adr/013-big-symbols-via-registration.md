# ADR 013: Big symbols via registration, not result data

## Status: Accepted

## Context

A "big symbol" — a 2×2 bonus frame, a 3×3 giant — occupies multiple grid cells but represents a single icon. Two ways to express that on the wire:

1. **Encode size in the result grid.** E.g. `result[col][row]` is `{ id: 'bonus', size: { w: 2, h: 2 } }`, or invent a sentinel id like `'bonus@2x2'`.
2. **Register size as symbol metadata.** Server still sends `string[][]`. The engine knows from `SymbolData.size` that `'bonus'` is 2×2 and paints OCCUPIED across the block.

Option 1 changes the public `setResult` shape and forces every server integration to learn a new wire format. Option 2 is opaque to the server — all servers send the same `string[][]` they already do — and the visual layout falls out of registration.

## Decision

Big symbols are declared at registration via `SymbolData.size = { w, h }` (defaulting to `{1, 1}`). The public `setResult(symbols: string[][])` shape is unchanged. The server places the symbol id at the **anchor cell** (top-left of the block) only; the engine paints OCCUPIED sentinels across the rest of the block before per-reel `FrameBuilder` runs.

`OCCUPIED_SENTINEL` is an internal constant — never crosses the public API. `Reel.getVisibleSymbols()` resolves intra-reel OCCUPIED to the anchor's id; cross-reel OCCUPIED is resolved via `ReelSet.getVisibleGrid()` and `getSymbolFootprint()`. So a 2×2 bonus reads as four `'bonus'` cells from any consumer-facing API.

The cross-reel coordinator runs in `SpinController` before per-reel `FrameBuilder.build()`. It validates block fit (throws on overflow with a named message) and rewrites the result grid in place. `FrameBuilder` stays per-reel and context-free — the original layering is preserved.

Big symbols and MultiWays are mutually exclusive at build time. `.multiways(...)` + a `size > 1×1` registration throws.

## Consequences

- Servers don't change. Existing payouts, RNG, and evaluation paths keep using `string[][]`.
- Consumers can keep using `reel.getVisibleSymbols()` or `reelSet.getVisibleGrid()` without knowing about block sizes — both surfaces report the anchor's id at every covered cell.
- `getSymbolFootprint(col, row)` is the canonical way to ask "what block does this cell belong to?" — used by win presenters that need to highlight a whole `N×M` block.
- The OCCUPIED stub is an internal placeholder (`OccupiedStub`, an invisible `ReelSymbol`). Not pooled through `SymbolFactory`, allocated lazily per occupied cell, disposed with the reel.
- Pin overlays + big symbols: pinning a non-anchor cell is invalid. Pinning the anchor pins the whole block visually because the anchor's view spans the block.

## Alternatives considered

- **Encode size in result data.** Every server integration learns a new shape; CLAUDE.md and the `setResult` typedoc grow new edge cases. Rejected.
- **Pool the OCCUPIED stub through SymbolFactory.** Adds a special-case symbol id everyone has to know about. Rejected (discussion #58, section 19.3) — singleton-ish stubs allocated by `Reel` are simpler.
- **Big symbols on MultiWays.** "What's a 2×2 on a 2-row reel?" is a game-design question the engine can't answer cleanly. Defer to v2 if a customer ever asks.
