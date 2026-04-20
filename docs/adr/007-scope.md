# ADR 007: Scope — what pixi-reels is, and what it is not

## Status: Accepted (load-bearing)

## Context

"Slot machine library" can mean many things. Adopters repeatedly ask for features that aren't in scope, and contributors occasionally open PRs that slowly convert the library into a full gaming framework. We need a single source of truth for *what this library does and does not do*, so those requests can be redirected and those PRs can be declined without debate.

## Decision

`pixi-reels` is a **reel engine for PixiJS v8**. It owns the visual lifecycle of symbols moving on reels and the typed event stream that describes that lifecycle. It does *nothing else*.

### In scope — the library does these

| Concern | API surface |
|---|---|
| Reel construction + configuration | `ReelSetBuilder` |
| Spin lifecycle orchestration | `ReelSet.spin() / .setResult() / .setAnticipation() / .skip()` |
| Per-reel spin phases | `ReelPhase`, `StartPhase`, `SpinPhase`, `AnticipationPhase`, `StopPhase` + `PhaseFactory` |
| Symbol rendering contract | `ReelSymbol` (abstract) + `SpriteSymbol` / `AnimatedSpriteSymbol` / `SpineSymbol` / `HeadlessSymbol` |
| Symbol pooling + recycling | `SymbolFactory` + `ObjectPool<T>` |
| Speed profiles (timing + easing) | `SpeedManager` + `SpeedPresets` |
| Typed domain events | `reelSet.events`, `reel.events` (typed `EventEmitter<T>`) |
| Frame-preparation pipeline | `FrameBuilder` + `FrameMiddleware` |
| Win visual choreography | `SymbolSpotlight` (dim losers, promote winners, cycle lines) |
| Deterministic testing | `FakeTicker` + `HeadlessSymbol` + `createTestReelSet` + `spinAndLand` + `expectGrid` + `captureEvents` |
| Debug introspection | `debugSnapshot`, `debugGrid`, `enableDebug` |
| Spine integration (optional subpath) | `pixi-reels/spine` — `SpineReelSymbol` with `idle / landing / win / disintegration / reactions/react_*` vocabulary |

### Out of scope — the library does not do these

| Concern | Why out of scope | Where it should live |
|---|---|---|
| **Win detection** (line, cluster, scatter, ways) | Pay rules are game-specific and belong with the game server, not the reels. The library accepts an already-computed grid via `setResult()`. | Game code / server. A `detectLineWins` helper may ship as an example but never as library API. |
| **Paytable math** | Money math is regulated, localized, and product-specific. The library has no currency, no bet, no multiplier. | Game server. |
| **Multiplier / RTP logic** | Same as above — math. The library treats multipliers as cosmetic symbols if they land. | Game server. |
| **RNG / outcome selection** | The library does not decide outcomes. Outcomes arrive via `setResult(grid)`. | Game server, or the `CheatEngine` in `examples/shared` for demos. |
| **Audio** | Slot audio is heavily branded. Hooks are trivially wired from the typed event stream (`spin:reelLanded`, etc.). | Consumer's audio layer, listening on the event stream. |
| **Bonus round state machines** (Free Spins, Hold & Win, mini-games) | Bonus state is a game-level concern. The library supplies *the primitives* — `spin:complete`, `setResult`, symbol pooling — that a bonus controller is built from. | Game code; see `apps/site/src/components/demos/ScatterFsDemo.tsx` for a primitive example. |
| **UI / HUD** | No spin button, no balance readout, no bet selector, no FS counter. The library is a `PIXI.Container`. You place it in your scene. | Game code. |
| **i18n / localization** | No user-facing strings in the library. | Game code. |
| **Accessibility** (ARIA, screen readers, reduced motion) | The library runs inside a canvas; a11y is a concern of the surrounding DOM UI. Consumers can honour `prefers-reduced-motion` by swapping speed profiles. | Consumer's DOM UI + custom `SpeedProfile`. |
| **Asset loading + pipeline** | PixiJS `Assets` already does this. The library receives textures / Spine aliases already loaded. | Consumer, or `examples/shared/spineLoader.ts` as a reference. |
| **Analytics, wallet, session** | Nothing about the player. | Game code / platform. |
| **Licence / entitlement / regulatory hooks** | Not a regulated component. | Operator stack. |

### The rule of thumb

> If the feature would appear in a **slot game's design doc**, it probably belongs to the consumer. If it would appear in a **reel widget's changelog**, it probably belongs here.

## Consequences

### Positive

- Zero ambiguity when triaging feature requests. "Does it spin, stop, or show symbols?" — in scope. Anything else — declined, with a pointer to where it belongs.
- Bundle size stays small (published ESM index is under 11 kB gzipped). The Spine runtime, cheats, server mocks, and win detection all live outside the library and tree-shake out for consumers who don't use them.
- Downstream games can adopt pixi-reels without being forced into its opinions about money, audio, or bonus state.
- Tests never need to mock game logic that isn't there.

### Negative

- Adopters sometimes want a more "batteries-included" framework. The library points them at the examples + recipes, which are copy-pasteable but not library API. Some reimplement the same win-detection or bonus-state code. That's fine — the site documents the common shapes (see `/recipes/` and `/spine/`), so the re-implementation is never from scratch.
- A small category of utilities sits in `examples/shared/` (cheats, cascade loop, seeded RNG, mock server). These are intentionally **not** published — they are reference code, not API. See ADR 009.

## Enforcement

- This ADR is referenced from `AGENTS.md`. Any PR that introduces a feature from the "Out of scope" table must either amend this ADR (with a persuasive rationale) or be declined.
- The core library's `package.json` ships with peer deps only: `pixi.js` and `gsap`, plus optional `@esotericsoftware/spine-pixi-v8`. Any new runtime dep is a red flag.
