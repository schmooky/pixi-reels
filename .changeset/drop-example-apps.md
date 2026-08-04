---
'pixi-reels': major
---

Remove: the `examples/` directory. The standalone demo apps now live in a separate repo.

Nothing in the published package changes -- `examples/` was never part of the tarball. This matters only if you cloned the repo to run a demo. Runnable demos live on the docs site under `/recipes`, about 130 of them, each with its source alongside; `pnpm site:dev` serves the whole set.

Keeping two parallel demo surfaces in one repo meant every API change had to be made twice, and the example half kept losing: two of the six apps were still passing `string[][]` to `runCascade`'s `nextGrid`, which throws on the first cascade, and nothing caught it because `vite build` only transpiles.

What survived the move, for anyone following a path from an older doc:

- `examples/shared/` symbol classes and asset loaders are now `apps/site/src/runtime/`
- `CheatEngine` and `SeededRng` are the private `@pixi-reels/cheats` package (still outside the library, per ADR 009)
- the prototype sprite atlas is `apps/site/public/prototype-symbols/`
- `examples/orientation-matrix` is `tests/e2e/fixtures/orientation-matrix`, unchanged in what it proves: browser coverage of all four orientation x direction combinations
