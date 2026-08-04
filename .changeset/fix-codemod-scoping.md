---
'pixi-reels-codemod': minor
---

Fix: `v1-to-v2` only renames where the AST proves the site is pixi-reels. The header claimed that restraint already existed; in practice the transform rewrote `{ rowIndex, columnIndex }` in a react-window cell callback (rebinding the parameter to `undefined`), `tr.rowIndex` on a real `HTMLTableRowElement`, any `size: { w, h }` including a background's, every method named `nudge()` (tooltips and panels included), the symbol ids inside `nudge()`'s `incoming` array, and the `'top'` operand of `cfg.anchor === 'top'`.

Ambiguous names (`row`, `col`, `rowIndex`, `size.w` / `size.h`, `offsetY`) now need evidence in the same file: a receiver named after a pixi-reels value, a pixi-reels call around the site, a distinctive sibling key such as `reelIndex`, or the value being destructured. `size: { w, h }` needs a `symbolData` owner. `reelAnchor()` and `nudge()` values need a pixi-reels receiver and a plain string literal in the one argument that carries them, so comparison operands and `incoming` symbol ids are left alone. Distinctive names (`bufferAbove`, `visibleRows`, `rowStagger`) are unchanged and still rename on any receiver.

Sites that cannot be proven are left alone and listed with `file:line:column` at the end of the run, so an under-rename is a review list rather than a silent breakage.

Fix: rename tables are read with an own-property check. `map[name]` matched `Object.prototype` members, so `reel.hasOwnProperty(k)` was rewritten to a printed function body and `reel.toString()` / `reel.constructor` were rewritten to garbage.

Fix: `bin/cli.js` resolves jscodeshift through the module graph instead of a hardcoded `node_modules/.bin` path, which does not exist under the hoisted layout npm, yarn and `npx` produce, and it now reports a spawn error instead of exiting `1` in silence.
