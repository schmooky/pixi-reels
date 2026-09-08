---
"pixi-reels": patch
---

Fix: `pixi-reels/spine` and `pixi-reels/testing` resolve their types under `moduleResolution: node` (node10) too. That resolver ignores `exports`, so those subpaths had no declarations at all and a game on it had to declare the module by hand; `typesVersions` now maps them. The `types` condition is also listed first in every `exports` entry, as TypeScript asks.
