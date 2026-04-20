# ADR 006: AI-Friendly Debug Mode

## Status: Accepted

## Context

PixiJS renders to a WebGL/WebGPU canvas — AI agents cannot "see" the scene graph. When debugging reel issues, an AI needs to inspect symbol positions, spin state, and grid contents without visual rendering.

## Decision

Provide three debug utilities:
1. `debugSnapshot(reelSet)` — returns plain JSON with full state (no PixiJS types, no circular refs)
2. `debugGrid(reelSet)` — returns an ASCII table of the visible grid
3. `enableDebug(reelSet)` — attaches `window.__PIXI_REELS_DEBUG` with `.snapshot()`, `.grid()`, `.log()`, `.trace()` methods

The snapshot includes: isSpinning, speed, per-reel symbol positions, visible grid, spotlight state.

## Consequences

- **Positive**: AI agents can `eval('__PIXI_REELS_DEBUG.log()')` in browser console to understand state.
- **Positive**: No PixiJS knowledge needed to interpret the output.
- **Positive**: `.trace()` logs every domain event as it fires.
- **Negative**: Debug mode adds a small overhead. Only enable in development.
