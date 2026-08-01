---
'pixi-reels': patch
---

Internal: the motion contract (ADR 018) now runs in CI against the shipping engine, in all four orientation x direction combinations, and the `createTestReelSet` default symbol size is non-square (120x100) so a test can tell width from height.

No API change. Listed as a patch because `createTestReelSet`'s default geometry is observable to anyone writing tests against `pixi-reels/testing`: pass `symbolSize` explicitly if you were relying on 100x100.
