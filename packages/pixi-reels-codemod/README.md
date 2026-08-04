# pixi-reels-codemod

Rewrites [`pixi-reels`](https://github.com/schmooky/pixi-reels) v1 API names to v2.

Not published to npm yet, so run it from a clone of this repo:

```bash
pnpm install
node packages/pixi-reels-codemod/bin/cli.js v1-to-v2 /path/to/your/src
```

Preview without writing:

```bash
node packages/pixi-reels-codemod/bin/cli.js v1-to-v2 /path/to/your/src --dry --print
```

Commit first. It edits in place.

## What it changes

The full rename table is ADR 016 section 5. In short: rows became **cells**,
above/below became **start/end**, and `(col, row)` coordinates became
`(reel, cell)` -- because in v2 a reel's strip can run horizontally, and
"row" stops meaning anything.

It rewrites, in code:

- builder methods: `visibleRows`, `visibleRowsPerReel`, `reelPixelHeights`
- properties and object keys: `bufferAbove`/`bufferBelow`, `reelHeight`,
  `offsetY`, `spinSymbolHeight`, `slotHeight`, `getRowY`, `displace`,
  `rowIndex`, `originalRow`, `offsetRows`, `winnerRows`, `rowStagger`,
  `rowOrder`, `originRow`, `fromRow`, `toRow`, `minRows`, `maxRows`,
  `reelPixelHeight`, `topWidthFactor`, `bottomWidthFactor`, `getAnchorRow`
- coordinate fields `.col` / `.row` -> `.reel` / `.cell`
- `size: { w, h }` -> `size: { reels, cells }`, and `x.size.w` / `x.size.h`
- `bufferSymbols({ above, below })` -> `({ start, end })`
- the `OffsetXMode` type -> `CrossOffsetMode`
- string values: `reelAnchor('top'|'bottom')`, `nudge({ direction: 'up'|'down' })`,
  `cellOrder: 'bottomToTop'|'topToBottom'`

## What it deliberately does NOT change

**Anything it cannot prove is pixi-reels.** `row`, `col`, `rowIndex`, `w`,
`h`, `offsetY` and `nudge` are ordinary words: `{ rowIndex, columnIndex }` is
a react-window cell callback, `tr.rowIndex` is a DOM property, `e.offsetY` is
on every mouse event, and every UI kit has a `nudge()`. Those names are only
renamed where the file itself supplies evidence -- a receiver named after a
pixi-reels value (`pin.row`, `reel.offsetY`), a pixi-reels call around the
site (`reelSet.pin({ col, row })`), a distinctive sibling key
(`{ reelIndex, rowIndex }`), or the value being destructured
(`for (const { row, col } of e.winners)`). `size: { w, h }` needs a
`symbolData` owner, and `reelAnchor()` / `nudge()` string values need a
pixi-reels receiver and a plain string literal, so `incoming: ['up', 'down']`
symbol ids and `cfg.anchor === 'top'` comparisons are left alone.

Everything skipped is listed with `file:line:column` at the end of the run.
Work through that list by hand -- an under-rename is a type error or a loud
throw, a wrong rename is a silent bug in your app.

A `for (const row of table)` in your code stays exactly as written. Code like

```ts
const b = reelSet.getCellBounds(col, row);
```

keeps working after the codemod, because those are positional arguments
holding your own values -- only the parameter names changed in the library.
Rename them yourself if you want the v2 vocabulary throughout.

**Comments.** It is an AST transform, so prose is untouched. Grep your
comments for `row`, `bufferAbove` and friends afterwards.

## Verifying

Run your typechecker. Anything the codemod missed on the API surface is a
type error, and anything reaching the engine with a v1 key throws at the
call site with a message naming the v2 replacement -- v2 ships no silent
aliases (ADR 016 section 10.8).

## License

MIT
