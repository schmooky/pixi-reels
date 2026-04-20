# ADR 001: Builder Pattern for ReelSet Construction

## Status: Accepted

## Context

The original `@g-slots/reels` library required manually instantiating and wiring 10+ objects (ReelsConfig, ObjectPool, SymbolNameGenerator, SymbolFactory, FrameHandler, FramePreparer, ReelsContainer, Reel[], ReelsStateManager, ReelsManager) in a specific order. Both production games had 60-100 line factory functions to do this.

## Decision

Use a fluent builder pattern (`ReelSetBuilder`) that encapsulates all internal wiring. The builder validates configuration at build-time and throws descriptive errors for missing or invalid configuration.

## Consequences

- **Positive**: Setup reduced from ~100 lines to ~10 lines. Impossible to forget wiring steps.
- **Positive**: Build-time validation catches configuration errors early.
- **Negative**: Internal objects are not directly accessible (by design — use `ReelSet` API instead).
- **Trade-off**: Advanced users who need lower-level access can still construct `Reel`, `ReelViewport`, etc. directly.
