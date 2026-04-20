# ADR 005: Symbol Plugin Architecture

## Status: Accepted

## Context

The original library only supported Spine symbols via `SpineReelSymbol`. Many slot games use simple sprites or animated spritesheets. Forcing Spine as a peer dependency is unnecessary.

## Decision

Abstract `ReelSymbol` base class with Template Method pattern for lifecycle hooks. Three built-in implementations:
- `SpriteSymbol` — texture swap, GSAP pulse win animation
- `AnimatedSpriteSymbol` — frame array swap, sequence playback
- `SpineSymbol` — optional peer dep, skeleton/skin management

`SymbolRegistry` maps symbolIds to constructors. `SymbolFactory` wraps registry + ObjectPool for recycling.

## Consequences

- **Positive**: Spine is optional — not required if using sprites only.
- **Positive**: Adding a new symbol type = extend ReelSymbol + register.
- **Positive**: ObjectPool reuses symbol instances across spins.
