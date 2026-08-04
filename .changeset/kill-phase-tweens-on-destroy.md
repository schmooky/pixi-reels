---
'pixi-reels': patch
---

Fix: `reelSet.destroy()` left every in-flight spin-phase tween running. `SpinController.destroy()` dropped its active-phase map without skipping the phases first, and `onSkip()` is the only thing that kills the gsap timelines they own (start ramp, anticipation, stop bounce, cascade fall/drop-in). Those timelines outlived the set and kept writing reel speed and symbol view positions to display objects `destroy()` had already freed. It bites hardest in the setup the docs recommend — gsap driven off a PixiJS ticker — because the orphaned tweens do not stop when the set's own app goes away: any other live ticker keeps advancing the shared root timeline. Destroying a reel set mid-spin now force-completes its active phases first, and bumps the spin generation so no already-awaiting phase chain starts a fresh phase on the way down.
