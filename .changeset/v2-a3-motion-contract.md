---
'pixi-reels': major
---

Internal: the motion contract (ADR 018) now runs in CI against the shipping engine, in all four orientation x direction combinations, and the `createTestReelSet` default symbol size is non-square (120x100) so a test can tell width from height.

No engine API change, but `createTestReelSet`'s default geometry is a breaking change to anyone writing tests against `pixi-reels/testing`: pass `symbolSize` explicitly if you were relying on 100x100. Filed as major so it lands under Breaking Changes in the changelog, where a reader whose geometry assertions just started failing will actually look.
