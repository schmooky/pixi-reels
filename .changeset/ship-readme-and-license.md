---
'pixi-reels': patch
---

Fix: the published tarball now actually contains `README.md` and `LICENSE`. Both were listed in `package.json`'s `files` but neither existed inside the package, and npm drops a `files` entry that matches nothing without warning -- so the npm page would have been blank and an MIT-licensed package would have shipped no licence text.
