---
"pixi-reels": major
---

1.0.0: drop legacy backwards compatibility, hide internal exports, ship a typed cascade API, split testing into a subpath, document the public surface.

Breaking changes:

- Remove `ReelSetBuilder.visibleSymbols()`. Use `.visibleRows()`.
- Remove the legacy `string[][]` form from `setResult` and `initialFrame`. Use `ColumnTarget[]`.
- Remove negative-index slot mutation on result grids. Use `ColumnTarget.bufferAbove` and `bufferBelow`.
- Hide the following exports from the package entry: `OCCUPIED_SENTINEL`, `ReelSetInternalConfig`, `ResolvedReelGridConfig`, `OffsetCalculator`, `RandomSymbolProvider`, `SymbolFactory`, `StopSequencer`, `ReelMotion`.
- Hide `SpinController`, `SpinControllerHooks`, and the built-in phase classes (`StartPhase`, `SpinPhase`, `StopPhase`, `AnticipationPhase`, `AdjustPhase`, `CascadeFallPhase`, `CascadePlacePhase`, `CascadeDropInPhase`) from the package entry. They are internal wiring. consumers register custom phases by extending `ReelPhase` and calling `builder.phases(f => f.register(...))`. Phase Config TYPES (`StartPhaseConfig`, etc.) remain exported.
- Rename internal-leaking methods on `Reel` and `ReelSet` to drop their leading underscore: `getAnchorRow`, `peekTargetShape`, `clearTargetShape`.
- Enable `stripInternal` in tsconfig. methods marked `@internal` in JSDoc are removed from the published `.d.ts`. Affects `Reel.reshape`, `Reel.setStopFrame`, `Reel.setCrossReelResolver`, `Reel.getAnchorRow`, `Reel.notifySpinStart`, `Reel.notifySpinEnd`, `Reel.notifyLanded`, and `Reel.snapToGrid`. The runtime methods still exist; only the type declarations are removed.
- Rename `ReelSet.skip()` to `ReelSet.skipSpin()` for symmetry with `skipNudge()`.
- Remove the unused `symbol:recycled` event from `ReelEvents`.
- Replace the inline-options-object signature of `ReelSet.refill()` with a typed `RefillOptions` interface and a `RefillResult` return type that mirrors `RunCascadeResult`. Adds `signal: AbortSignal` for mid-refill cancellation. The result now exposes `winnersRefilled`, `finalGrid`, `wasSkipped`, and `duration` instead of the previous `SpinResult` shape (which was misnamed for a refill).
- Remove the `direction` option from `DestroySymbolsOptions` and from `ReelSymbol.playDestroy()`. The default destroy animation is now a pure "poof". a tiny anticipation pop (~60 ms) then a fast scale-to-0 + alpha-to-0 implode (~140 ms), ~200 ms total. No rotation. Subclasses that override `playDestroy` should drop the `direction` parameter from their signature; SpineReelSymbol was already ignoring it.
- Move the headless testing harness to a dedicated subpath: `import { createTestReelSet, FakeTicker, HeadlessSymbol, spinAndLand, captureEvents, expectGrid, countSymbol } from 'pixi-reels/testing'`. The harness is no longer re-exported from `pixi-reels` so production bundles never pull it in.

Fixes:

- Throw on concurrent `spin()`, `setResult()`, `pin()`, or `setShape()` calls while `nudge()` is in flight, instead of leaving the behavior undefined.

Docs:

- Rewrite the buffer-indexing guide and the affected API reference pages around the `ColumnTarget[]` form.
- Tighten recipe copy. Verify each recipe's listed APIs against its source.
- Regenerate llms.txt for 1.0.0.
- Rewrite the migration page so every pre-1.0 pattern appears in greppable code blocks (no more "pattern omitted" placeholders).
- Rename `/guides/spine-pins/` to `/guides/pins/`. The pin primitive works with any `ReelSymbol` subclass, not just Spine. The site emits a 301 from the old URL.
- Add a TypeDoc-generated reference at `/api/*` with full text search (pagefind). Hand-written narrative pages at `/docs/api-*` stay as curated guides. A CI gate (`pnpm api:check-sync`) fails any PR that ships a new public export without at least one prose mention in `/docs/` or `/guides/`.
- Update README, AGENTS.md, SECURITY.md, BEST_PRACTICES.md to canonicalize `pixi-reels.schmooky.dev` (the actual docs host).
- Convert every architecture diagram from hand-coded SVG to themed mermaid, removing stale `skip()` references and dropping ~1500 lines of inline markup along the way.
- Add `og:image:alt`, `twitter:image:alt`, and dark-mode `theme-color` to the SEO meta. Add `/api/*` routes to the sitemap.
- Replace the static `/og-default.svg` social card with a set of section-specific PNGs under `/og/` (default, guides, recipes, api, architecture). The 1200x630 PNGs are rendered from polished SVG sources at build time via `pnpm og:render` (uses Astro's transitive `sharp`). Recipe, Architecture, and Docs layouts auto-pick the right image; per-page `frontmatter.image` overrides still win. Removes the stale `V0.3.1` stamp from the old card.
- Re-baseline the bundle-size guard for 1.0. main entry is now 4.49 KB gzipped (down from 20.79 KB) thanks to the hidden `SpinController` + built-in phase classes + moved testing harness. The "~35 kB gzipped" claim in the README is replaced with "under 5 kB gzipped" for the main entry.
- Update the glossary to retire `SpinController` as an exported class, document `CellPin`, `RefillOptions` / `RefillResult`, `RunCascadeOptions` / `RunCascadeResult`, and note the `pixi-reels/testing` subpath for the headless harness.
- Add a "Studios shipping with pixi-reels" section on the landing page (`Partners.astro` + `content/partners.ts`). Starts with pixmove; new studios drop their logo SVG into `apps/site/public/partners/` and add a row to the registry. The "Add your studio" CTA links to a structured GitHub issue template (`.github/ISSUE_TEMPLATE/partner.yml`) that collects name, URL, blurb, logo, and a rights confirmation.
- Add a `partner` label (orange) for partner-listing issues; wire the template to apply it alongside `area/site` and `needs-triage`.
- Sweep the last `pixi-reels.dev` stragglers from `.github/FUNDING.yml` and `.github/ISSUE_TEMPLATE/bug_report.yml`.

CI:

- Add `@esotericsoftware/spine-pixi-v8` as a direct dep on `examples/classic-spin` and `examples/sandbox`. rolldown 1.x can't tolerate the lazy `import('@esotericsoftware/spine-pixi-v8')` inside `SpineSymbol` when the peer isn't installed at the example's workspace; declaring it lets the static analyzer resolve the path even though the runtime still treats it as optional. This is the tactical fix; relocating `SpineSymbol` to the `pixi-reels/spine` subpath is a follow-up.
- Add a `pnpm build` step to the CI workflow that builds the library and every example app. Would have caught the spine-pixi-v8 resolution failure on its first push.
- Remove the orphan `examples/flexiways/` directory (untracked locally, no source).
