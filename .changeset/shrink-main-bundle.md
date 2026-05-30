---
"pixi-reels": patch
---

Perf: the main entry is now under 5 KB gzipped (down from ~20.8 KB) after hiding `SpinController` + the built-in phase classes and moving the testing harness to the `pixi-reels/testing` subpath.
