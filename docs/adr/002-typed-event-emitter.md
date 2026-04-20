# ADR 002: Custom Typed Event Emitter

## Status: Accepted

## Context

The original library had zero events. Both production games used external global event emitters for reel sounds, UI updates, and anticipation. PixiJS Container has its own event system, but it's for pointer/interaction events — not domain events.

## Decision

Ship a lightweight (~60 line) `EventEmitter<TEvents>` class with zero dependencies. It uses TypeScript mapped types so that event names and callback parameter types are fully checked at compile time.

`ReelSet` exposes events via `reelSet.events.on(...)` rather than overriding Container's built-in `on/off/emit` to avoid type collisions.

## Consequences

- **Positive**: Event name typos are compile errors. Callback params are auto-inferred.
- **Positive**: "Batteries included" — no external event library needed.
- **Positive**: No collision with PixiJS's own event system on Container.
- **Negative**: Users access events via `.events.on()` instead of `.on()` directly.
