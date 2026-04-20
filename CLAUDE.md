# CLAUDE.md — AI Agent Guide for pixi-reels

## Agent Behavioral Guidelines

**These apply to every AI agent working on this repo. No exceptions.**

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Project Identity

`pixi-reels` is an open-source, batteries-included slot machine reel engine for PixiJS v8. It provides a fluent builder API, typed events, default spin phases, speed modes, and win animation support.

**Monorepo layout:**
- `packages/pixi-reels/` — The npm-publishable library
- `examples/classic-spin/` — Standard 5x3 slot demo (sprite symbols)
- `examples/cascade-tumble/` — 6x5 cascade/tumble demo (sprite symbols)
- `examples/hold-and-win/` — Hold & Win respin demo (sprite symbols)
- `examples/sandbox/` — Live-editable playground (sprite symbols + HMR)
- `examples/shared/` — Shared example utilities (mock server, UI, BlurSpriteSymbol, atlas loader)
- `examples/assets/prototype-symbols/` — Open-licensed sprite atlas used by every example

## Quick Commands

```bash
# Install dependencies
pnpm install

# Build library
pnpm build

# Run tests
pnpm test

# Type check
pnpm --filter pixi-reels typecheck

# Run an example
pnpm --filter classic-spin dev       # port 5173
pnpm --filter cascade-tumble dev     # port 5174
pnpm --filter hold-and-win dev       # port 5175

# Build all examples as static sites
pnpm examples:build
```

## Architecture Overview

```
ReelSetBuilder (fluent API)
    │ builds
    ▼
ReelSet (Container) ── events: EventEmitter<ReelSetEvents>
    ├── SpinController ── orchestrates spin lifecycle
    │   └── per-reel: StartPhase → SpinPhase → [AnticipationPhase] → StopPhase
    ├── SpeedManager ── Normal / Turbo / SuperTurbo profiles
    ├── SymbolSpotlight ── win animations (dim + promote)
    ├── ReelViewport ── masked + unmasked + spotlight containers
    └── Reel[] ── one per column
        ├── ReelSymbol[] ── SpriteSymbol / AnimatedSpriteSymbol / SpineSymbol
        ├── ReelMotion ── Y displacement + wrapping
        └── StopSequencer ── target frame management
```

### Spin Lifecycle

```
spin() → START → SPIN → [ANTICIPATION] → STOP → IDLE
                   ▲                          │
              spin:start                 spin:reelLanded (per reel)
                                         spin:allLanded
                                         spin:complete
```

1. `reelSet.spin()` starts all reels with staggered delay
2. Server response arrives → `reelSet.setResult(symbols)`
3. Optionally: `reelSet.setAnticipation([3, 4])`
4. Reels stop in staggered order with bounce
5. `spin()` promise resolves with `SpinResult`

### Key Design Patterns

- **Builder** — `ReelSetBuilder` wires 10+ subsystems into one call
- **Strategy** — `SpinningMode` interface (Standard, Cascade, Immediate)
- **Template Method** — `ReelSymbol.activate/deactivate` lifecycle
- **Middleware** — `FrameBuilder` pipeline for frame preparation
- **Object Pool** — `ObjectPool<T>` for symbol recycling
- **Observer** — `EventEmitter<T>` for typed domain events
- **Factory** — `PhaseFactory` for spin phase creation

## Debug Mode — For AI Agents

PixiJS renders to canvas — AI agents cannot see it. Use the debug system instead:

```typescript
import { enableDebug, debugSnapshot, debugGrid } from 'pixi-reels';

enableDebug(reelSet); // Attaches to window.__PIXI_REELS_DEBUG

// In browser console (or via eval):
__PIXI_REELS_DEBUG.snapshot()  // Full JSON state — no PixiJS types, serializable
__PIXI_REELS_DEBUG.grid()      // ASCII table of visible symbols
__PIXI_REELS_DEBUG.log()       // console.log both of the above
__PIXI_REELS_DEBUG.trace()     // Log every domain event as it fires
```

Example output of `debugGrid()`:
```
┌────────┬────────┬────────┬────────┬────────┐
│ cherry │ lemon  │ bar    │ seven  │ cherry │
│ plum   │ cherry │ wild   │ lemon  │ orange │
│ orange │ bell   │ cherry │ plum   │ bell   │
└────────┴────────┴────────┴────────┴────────┘
```

Example `debugSnapshot()` fields:
```json
{
  "isSpinning": false,
  "currentSpeed": "normal",
  "spotlightActive": false,
  "reelCount": 5,
  "visibleRows": 3,
  "grid": [["cherry","plum","orange"], ...],
  "reels": [{ "index": 0, "speed": 0, "isStopping": false, "visibleSymbols": [...] }, ...]
}
```

**When debugging reel issues as an AI agent:**
1. Call `__PIXI_REELS_DEBUG.log()` via eval to understand current state
2. Call `__PIXI_REELS_DEBUG.trace()` to watch events fire in real time
3. Check `isSpinning`, `speed`, and per-reel `isStopping` to diagnose stuck spins
4. Compare `grid` output to expected server result

## File Map

### Core engine (`packages/pixi-reels/src/`)
| Directory | Purpose |
|-----------|---------|
| `core/` | ReelSet, ReelSetBuilder, Reel, ReelViewport, ReelMotion, StopSequencer |
| `config/` | Type definitions, SpeedPresets, default values |
| `symbols/` | ReelSymbol (abstract), SpriteSymbol, AnimatedSpriteSymbol, SpineSymbol, SymbolRegistry, SymbolFactory |
| `spin/` | SpinController |
| `spin/phases/` | ReelPhase (abstract), StartPhase, SpinPhase, StopPhase, AnticipationPhase, PhaseFactory |
| `spin/modes/` | SpinningMode (interface), StandardMode, CascadeMode, ImmediateMode |
| `speed/` | SpeedManager |
| `frame/` | FrameBuilder (middleware), RandomSymbolProvider, OffsetCalculator |
| `pool/` | ObjectPool\<T\> |
| `spotlight/` | SymbolSpotlight (win animations) |
| `events/` | EventEmitter\<T\>, ReelEvents (event type definitions) |
| `utils/` | Disposable (interface), TickerRef (safe ticker wrapper) |
| `debug/` | debugSnapshot, debugGrid, enableDebug |

### Examples (`examples/`)
| Directory | Purpose |
|-----------|---------|
| `shared/prototypeSpriteLoader.ts` | Loads the `prototype-symbols` TexturePacker atlas |
| `shared/BlurSpriteSymbol.ts` | Sprite symbol that swaps to a pre-rendered motion-blur texture during SPIN |
| `shared/mockServer.ts` | Fake spin results, cascade logic, win detection |
| `shared/ui.ts` | HTML overlay (spin button, speed toggle, win display) |
| `assets/prototype-symbols/` | 84-frame sprite atlas (base + motion-blur variants) |

### Dependency flow (no circular deps)
```
config/types → events/ → utils/
                  ↓
pool/ → symbols/ → frame/
                     ↓
           core/ (Reel, ReelMotion, ReelViewport)
                     ↓
              spin/ (phases, modes, SpinController)
                     ↓
              core/ReelSet → core/ReelSetBuilder
                     ↓
              spotlight/
```

## Conventions

- **No default exports** — always named exports
- **`.js` extension in imports** — required for ESM compatibility
- **No barrel re-exports in subdirectories** — only `src/index.ts` is the barrel
- **Disposable pattern** — every class that allocates resources implements `Disposable`
- **TickerRef** — never use `ticker.add()` directly; wrap in TickerRef for auto-cleanup
- **Anchor (0,0)** — SpriteSymbol uses top-left anchor; SpineSymbol centers via `resize()`
- **Events use colon namespacing** — `spin:start`, `speed:changed`, etc.
- **GSAP must sync with PixiJS** — examples call `gsap.ticker.remove(gsap.updateRoot)` and drive GSAP from `app.ticker` to work in hidden tabs/iframes
- **Spine assets** — atlas references `.webp` textures; `publicDir` in vite.config serves them from `examples/assets/`

## Testing

Tests are in `packages/pixi-reels/tests/` using Vitest. Run with `pnpm test`.

- **Unit tests** test individual modules (EventEmitter, ObjectPool, SpeedManager, etc.)
- **No PixiJS mocking needed** for pure logic tests (most modules are pure)
- **When adding a new module**, add a corresponding test file in `tests/unit/`
- **Always run `pnpm --filter pixi-reels typecheck` before considering a task done**

## Common Tasks

### Add a new symbol type
1. Create `packages/pixi-reels/src/symbols/MySymbol.ts` extending `ReelSymbol`
2. Implement `onActivate`, `onDeactivate`, `playWin`, `stopAnimation`, `resize`
3. `resize()` MUST store dimensions and reposition internals — it's called on every symbol swap
4. Export from `src/index.ts`
5. Register in builder: `builder.symbols(r => r.register('id', MySymbol, opts))`

### Add a new spin phase
1. Create `packages/pixi-reels/src/spin/phases/MyPhase.ts` extending `ReelPhase<MyConfig>`
2. Implement `onEnter`, `update`, `onSkip`
3. Call `this._complete()` when done
4. Register: `builder.phases(f => f.register('myPhase', MyPhase))`

### Add a new speed preset
1. Add to `packages/pixi-reels/src/config/SpeedPresets.ts`
2. Or at runtime: `reelSet.speed.addProfile('name', profile)`

### Add frame middleware
1. Implement `FrameMiddleware` interface (name, priority, process)
2. Register: `builder.frameMiddleware(new MyMiddleware())`

### Modify Spine symbol behavior
1. Edit `examples/shared/SpineReelSymbol.ts`
2. Key method: `onActivate()` creates/shows spine, `resize()` centers it in cell
3. `_positionSpine()` sets `spine.x = cellWidth/2, spine.y = cellHeight/2`
4. Every new spine created in `onActivate` gets positioned via stored `_cellWidth/_cellHeight`

## Known Gotchas

- **GSAP freezes in hidden tabs** — always sync GSAP ticker with PixiJS ticker in examples
- **Spine atlas requires texture pages** — `.webp` files must be served from the same directory as `.atlas`
- **Symbol resize is critical** — `Reel._replaceSymbol()` calls `resize()` on every swap; without it symbols scatter
- **Preview browser can't decode images** — the Claude Code preview environment has no image codecs; test Spine rendering in a real browser
- **ReelMotion wrapping** — symbols wrap when crossing `_maxY`/`_minY` boundaries; the callback triggers symbol identity swap via `_onSymbolWrapped`
