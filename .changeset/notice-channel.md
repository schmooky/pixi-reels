---
'pixi-reels': minor
---

Add: one console channel for everything the library says. Every warning and error now carries a stable CODE you can grep for, looks the same in the console, and obeys one volume knob via the new `setLogLevel(level)` / `getLogLevel()` (`'silent' | 'error' | 'warn' | 'info'`, default `'info'`). Before this, ten call sites hand-rolled their own `[pixi-reels] ...` string - one had no prefix at all - and there was no way to quieten them in a production build.

In a browser each notice prints as a styled badge (`pixi-reels` pill, then the code, then the message); everywhere else it degrades to `[pixi-reels] warn(code) message`, because `%c` is a browser console feature and Node prints the directives literally. Notices keep going through `console.warn` / `console.error` / `console.info` rather than a single `console.log`, so devtools filtering, stack capture and the browser's own warn/error styling all keep working, and detail arguments are passed through untouched so an `Error` keeps its stack.

Fix: `slamStop()` called before `setResult()` now says so. There is nothing to land on in that window, so the reels stop wherever the strip happens to be - random buffer fill in standard mode, and the alpha-0 residue of the fall-out in cascade mode, i.e. an invisible board. Nothing reported it; the reels just sat there showing the wrong thing. It stays a warning rather than a throw because `slamStop()` is the unconditional exit the engine's own abort, timeout and error-recovery paths depend on, and those legitimately fire before a result - `skipSpin()` is the guarded entry point and still throws in this window.

The default level is `'info'` rather than `'warn'` on purpose: the mask-strategy auto-pick notices this replaced were unconditional, and anything lower would have silently deleted advice the engine used to give.
