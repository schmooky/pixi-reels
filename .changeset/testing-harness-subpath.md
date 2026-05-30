---
"pixi-reels": major
---

Move the headless testing harness to a dedicated subpath: `import { createTestReelSet, FakeTicker, HeadlessSymbol, spinAndLand, captureEvents, expectGrid, countSymbol } from 'pixi-reels/testing'`. It is no longer re-exported from `pixi-reels`, so production bundles never pull it in.
