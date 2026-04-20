# ADR 004: Disposable Pattern + TickerRef for Memory Safety

## Status: Accepted

## Context

The original library had the #1 memory leak pattern: `ticker.add(callback)` without ever calling `ticker.remove()`. Reel instances subscribed to the ticker but had no `destroy()` method. States created GSAP tweens and Promises that could dangle if interrupted.

## Decision

1. Every class that allocates resources implements `Disposable` (`destroy()` + `isDestroyed`).
2. `TickerRef` wraps all ticker subscriptions. When `destroy()` is called, ALL callbacks are auto-removed.
3. No class may call `ticker.add()` directly — must use `TickerRef`.

## Consequences

- **Positive**: Zero possibility of dangling ticker callbacks.
- **Positive**: `ReelSet.destroy()` cascades cleanup through all subsystems.
- **Positive**: `isDestroyed` flag prevents use-after-destroy.
