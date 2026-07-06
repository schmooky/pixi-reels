---
'pixi-reels': minor
---

Modernize the package publish layer for correct dual ESM/CJS type resolution and finer-grained tree-shaking.

- Emit one file per source module (`preserveModules`) so a downstream bundler pulls only the modules reachable from what it imports, instead of shaking a single concatenated chunk. Runtime entry paths are unchanged.
- Reorder `exports` so `types` resolves first in every condition and add a real CommonJS declaration (`.d.cts`) for the `require` condition. Fixes the `node16` "masquerading as ESM" / fallback-condition problems flagged by `@arethetypeswrong/cli`.
- Add `typesVersions` mappings so the `spine` and `testing` subpaths resolve types under the legacy `node10` resolver, and expose `./package.json` in `exports`.
- Turn on `isolatedDeclarations` for the library so every exported symbol carries an explicit, locally-inferable type.
- Declare `engines.node: >=20.19`.
- CI now gates on `publint --strict` + `attw --pack`, and the bundle-size check enforces the full gzipped ESM footprint (previously informational).

No runtime API changes. existing imports resolve to the same modules.
