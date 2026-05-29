---
"pixi-reels": major
---

Enable `stripInternal` in tsconfig: methods marked `@internal` are removed from the published `.d.ts` (`Reel.reshape`, `Reel.setStopFrame`, `Reel.setCrossReelResolver`, `Reel.getAnchorRow`, `Reel.notifySpinStart`, `Reel.notifySpinEnd`, `Reel.notifyLanded`, `Reel.snapToGrid`). The runtime methods still exist; only the type declarations are removed.
