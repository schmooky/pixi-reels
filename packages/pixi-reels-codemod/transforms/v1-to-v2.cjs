/**
 * pixi-reels v1 -> v2 (ADR 016 section 5).
 *
 * A rename is only safe where the AST proves the site is pixi-reels. `row`,
 * `col`, `rowIndex`, `w`, `h`, `nudge` and the strings `'top'` / `'up'` /
 * `'down'` all mean something in other people's code, so this transform
 * splits its table three ways:
 *
 *   - **distinctive names** (`bufferAbove`, `visibleRows`, `spinSymbolHeight`,
 *     `rowStagger`) rename on any receiver. nothing else is called that;
 *   - **ambiguous names** (`row`, `col`, `rowIndex`, `size.w` / `size.h`,
 *     `offsetY`) need EVIDENCE in the same file: a receiver named after a
 *     pixi-reels value, a pixi-reels call around the site, a distinctive
 *     sibling key in the same object, or the value being destructured;
 *   - **string values** (`reelAnchor('top')`, `nudge(n, { direction: 'down' })`)
 *     need a pixi-reels receiver AND a plain string literal in the one
 *     position that carries them. never an `incoming` symbol id, never
 *     another argument, never an operand of a comparison.
 *
 * Where the evidence is not in the file the site is LEFT ALONE and recorded.
 * `bin/cli.js` prints the list with file:line at the end of the run so a
 * human can finish the job (set `PIXI_REELS_CODEMOD_REPORT` to collect the
 * entries as JSONL; running the transform through plain jscodeshift routes
 * them to `api.report` instead). Under-renaming with a report is recoverable.
 * Silently rewriting a consumer's grid callback, DOM property or tooltip is
 * not.
 */
const { appendFileSync } = require('node:fs');

/** Names distinctive enough to rename wherever they appear as a property or method. */
const SAFE = {
  // geometry
  visibleRows: 'visibleCells',
  visibleRowsPerReel: 'visibleCellsPerReel',
  reelPixelHeights: 'reelExtents',
  reelPixelHeight: 'reelExtent',
  bufferAbove: 'bufferStart',
  bufferBelow: 'bufferEnd',
  reelHeight: 'extent',
  // NOTE: `offsetY` is deliberately NOT here. See DOM_COLLIDING below.
  spinSymbolHeight: 'spinCellSize',
  minRows: 'minCells',
  maxRows: 'maxCells',
  // motion
  displace: 'advance',
  slotHeight: 'slotPitch',
  getRowY: 'getCellMain',
  // grid coordinates and payloads
  originalRow: 'originalCell',
  offsetRows: 'offsetCells',
  winnerRows: 'winnerCells',
  rowStagger: 'cellStagger',
  rowOrder: 'cellOrder',
  originRow: 'originCell',
  fromRow: 'fromCell',
  toRow: 'toCell',
  getAnchorRow: 'getAnchorCell',
  // offsets
  topWidthFactor: 'startFactor',
  bottomWidthFactor: 'endFactor',
};

/**
 * Coordinate fields that are ordinary words elsewhere. `{ rowIndex,
 * columnIndex }` is the react-window / ag-grid cell callback, `tr.rowIndex`
 * is a real `HTMLTableRowElement` property, and `{ row, col }` is every
 * table, chessboard and tile map ever written. Renamed only with evidence.
 */
const AMBIGUOUS = { row: 'cell', col: 'reel', rowIndex: 'cellIndex' };

/** The `symbolData().size` pair. Renamed only under a proven symbolData size. */
const SIZE = { w: 'reels', h: 'cells' };

/** Type names, renamed as plain identifiers. */
const TYPES = { OffsetXMode: 'CrossOffsetMode' };

/** String values, renamed only in the one argument position that carries them. */
const ANCHOR_VALUES = { top: 'start', bottom: 'end' };
const NUDGE_VALUES = { down: 'forward', up: 'reverse' };
const ORDER_VALUES = { bottomToTop: 'endFirst', topToBottom: 'startFirst' };

/**
 * Renames that collide with something ubiquitous outside this library.
 * `offsetY` is a property of every MouseEvent and PointerEvent, so a slot
 * game is full of `e.offsetY` that has nothing to do with a reel. Renaming
 * those to `mainOffset` breaks input handling silently, which is far worse
 * than leaving one `reel.offsetY` for a human to catch.
 */
const DOM_COLLIDING = { offsetY: 'mainOffset' };

/** camelCase / snake_case words of an identifier, lowercased. */
const wordsOf = (name) =>
  String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());

/** Nouns that name a pixi-reels value. A receiver called one of these is ours. */
const PIXI_NOUNS = new Set([
  'reel',
  'reels',
  'pin',
  'pins',
  'symbol',
  'symbols',
  'winner',
  'winners',
  'cascade',
  'tumble',
  'spotlight',
  'strip',
  'strips',
  'builder',
]);

/** Nouns that own a pixi-reels `size: { w, h }`. */
const SIZE_NOUNS = new Set(['symbol', 'footprint']);

/**
 * Keys distinctive enough that seeing one proves the object around it is a
 * pixi-reels payload. Used for sibling evidence (`{ reelIndex, rowIndex }`)
 * and for ancestor evidence (`symbolData: { ... }`).
 */
const PIXI_KEYS = new Set([
  ...Object.keys(SAFE),
  ...Object.values(SAFE),
  'reelIndex',
  'cellIndex',
  'symbolId',
  'symbolData',
  'initialFrame',
  'multiways',
  'winners',
  'reelSet',
]);

/** Calls whose arguments are pixi-reels payloads. */
const PIXI_METHODS = new Set([
  'setResult',
  'initialFrame',
  'pin',
  'unpin',
  'nudge',
  'setShape',
  'setAnticipation',
  'symbolData',
  'spotlight',
  'getSymbolFootprint',
  'multiways',
  'tumble',
  'reelAnchor',
  'bufferSymbols',
  'visibleCells',
  'visibleRows',
  'visibleCellsPerReel',
  'visibleRowsPerReel',
  'reelExtents',
  'reelPixelHeights',
]);

/** The method name of a callee, or null. */
const calleeName = (callee) => {
  if (!callee) return null;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier')
    return callee.property.name;
  if (callee.type === 'Identifier') return callee.name;
  return null;
};

/** The name that best identifies a receiver expression, or null. */
const receiverName = (obj) => {
  if (!obj) return null;
  if (obj.type === 'Identifier') return obj.name;
  if (obj.type === 'MemberExpression') {
    if (!obj.computed && obj.property.type === 'Identifier') return obj.property.name;
    return receiverName(obj.object); // `reelSet.reels[0].offsetY`
  }
  if (obj.type === 'CallExpression' || obj.type === 'NewExpression') return receiverName(obj.callee);
  if (obj.type === 'TSNonNullExpression' || obj.type === 'TSAsExpression') return receiverName(obj.expression);
  return null;
};

/** Every identifier name in a member chain, outermost last. */
const chainNames = (node, out = []) => {
  if (!node) return out;
  if (node.type === 'Identifier') out.push(node.name);
  else if (node.type === 'MemberExpression') {
    chainNames(node.object, out);
    if (!node.computed && node.property.type === 'Identifier') out.push(node.property.name);
  } else if (node.type === 'CallExpression' || node.type === 'NewExpression') chainNames(node.callee, out);
  return out;
};

const hasNoun = (name, nouns) => name != null && wordsOf(name).some((w) => nouns.has(w));

/**
 * Read a rename table. Never `map[name]` directly: `x.toString`,
 * `reel.hasOwnProperty(k)` and `y.constructor` would otherwise "find" an
 * `Object.prototype` member and get renamed to a function object.
 */
const lookup = (map, name) =>
  typeof name === 'string' && Object.prototype.hasOwnProperty.call(map, name) ? map[name] : undefined;

/** Does this member expression's object look like a Reel? */
const receiverLooksLikeReel = (obj) => /reel/i.test(receiverName(obj) ?? '');

/** Is this a call on a pixi-reels object, or a link in a pixi-reels builder chain? */
const calleeIsPixi = (callee) => {
  if (!callee || callee.type !== 'MemberExpression') return false;
  // A fluent chain proves itself: `b.visibleCells(3).reelAnchor('top')`.
  let o = callee.object;
  while (o && o.type === 'CallExpression') {
    const inner = o.callee;
    if (inner && inner.type === 'MemberExpression') {
      if (PIXI_METHODS.has(calleeName(inner))) return true;
      o = inner.object;
    } else {
      break;
    }
  }
  return hasNoun(receiverName(callee.object), PIXI_NOUNS);
};

/** The sibling members of an object literal, object pattern or type literal. */
const siblingsOf = (node) => {
  if (!node) return null;
  for (const field of ['properties', 'members', 'body']) {
    if (Array.isArray(node[field])) return node[field];
  }
  return null;
};

const keyNameOf = (node) =>
  node && node.key && node.key.type === 'Identifier' && !node.computed ? node.key.name : null;

module.exports = function transform(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = false;
  const skipped = [];

  /** Record a v1 name we found but could not prove was ours. */
  const skip = (node, why) => {
    const at = node && node.loc && node.loc.start ? node.loc.start : { line: 0, column: 0 };
    skipped.push({ file: file.path, line: at.line, column: at.column + 1, why });
  };

  /** A distinctive sibling key in the same object / interface. */
  const siblingEvidence = (path) => {
    const siblings = siblingsOf(path.parent && path.parent.node);
    if (!siblings) return false;
    return siblings.some((p) => p !== path.node && PIXI_KEYS.has(keyNameOf(p)));
  };

  /**
   * Something above this site that proves it is pixi-reels: a pixi-reels
   * call it is an argument to, a pixi-reels key it sits under, the value it
   * is destructured from, or the thing a for-of iterates.
   */
  const ancestorEvidence = (path) => {
    let child = path.node;
    for (let p = path.parent; p; p = p.parent) {
      const n = p.node;
      if (n.type === 'CallExpression' && Array.isArray(n.arguments) && n.arguments.includes(child)) {
        if (PIXI_METHODS.has(calleeName(n.callee))) return true;
        if (calleeIsPixi(n.callee)) return true;
      }
      if ((n.type === 'ObjectProperty' || n.type === 'Property') && PIXI_KEYS.has(keyNameOf(n))) return true;
      if (n.type === 'VariableDeclarator' && n.id === child && hasNoun(receiverName(n.init), PIXI_NOUNS))
        return true;
      if (
        (n.type === 'ForOfStatement' || n.type === 'ForInStatement') &&
        n.left === child &&
        hasNoun(receiverName(n.right), PIXI_NOUNS)
      )
        return true;
      child = n;
    }
    return false;
  };

  const contextEvidence = (path) => siblingEvidence(path) || ancestorEvidence(path);

  /** Only a `symbolData()` override (or a symbol-ish owner) carries `size: { w, h }`. */
  const sizeEvidence = (path) => {
    for (let p = path.parent; p; p = p.parent) {
      const n = p.node;
      if (n.type === 'CallExpression' && calleeName(n.callee) === 'symbolData') return true;
      if (n.type === 'ObjectProperty' || n.type === 'Property') {
        const key = keyNameOf(n);
        if (key === 'symbolData' || hasNoun(key, SIZE_NOUNS)) return true;
      }
    }
    return false;
  };

  /** First v1 string literal inside `node`, or null. */
  const firstV1String = (node, values) => {
    if (!node) return null;
    let found = null;
    j(node)
      .find(j.StringLiteral)
      .forEach((s) => {
        if (found === null && lookup(values, s.node.value) !== undefined) found = s.node;
      });
    return found;
  };

  const unshorthand = (node, before) => {
    if (node.shorthand && node.value && node.value.type === 'Identifier' && node.value.name === before) {
      node.shorthand = false;
    }
  };

  // `a.visibleRows`, `a.row`, `a?.bufferAbove`, `a.size.w`
  root.find(j.MemberExpression).forEach((path) => {
    const prop = path.node.property;
    if (path.node.computed || prop.type !== 'Identifier') return;
    const obj = path.node.object;

    // `x.size.w` / `x.size.h`. Only under a `.size` whose owner is a symbol
    // or a footprint: `bg.size.w` is a background, not a symbol data block.
    const size = lookup(SIZE, prop.name);
    if (
      size !== undefined &&
      obj.type === 'MemberExpression' &&
      !obj.computed &&
      obj.property.type === 'Identifier' &&
      obj.property.name === 'size'
    ) {
      if (chainNames(obj).some((n) => hasNoun(n, SIZE_NOUNS))) {
        prop.name = size;
        changed = true;
      } else {
        skip(prop, `'size.${prop.name}' on a receiver that is not provably a pixi-reels symbolData size`);
      }
      return;
    }

    // Only rewrite a DOM-colliding name when the receiver looks like a reel.
    const dom = lookup(DOM_COLLIDING, prop.name);
    if (dom !== undefined) {
      if (receiverLooksLikeReel(obj)) {
        prop.name = dom;
        changed = true;
      } else {
        skip(prop, `'${prop.name}' on a receiver that is not provably a reel (every MouseEvent has one)`);
      }
      return;
    }

    const safe = lookup(SAFE, prop.name);
    if (safe !== undefined) {
      prop.name = safe;
      changed = true;
      return;
    }

    const coord = lookup(AMBIGUOUS, prop.name);
    if (coord !== undefined) {
      if (hasNoun(receiverName(obj), PIXI_NOUNS)) {
        prop.name = coord;
        changed = true;
      } else {
        skip(prop, `'${prop.name}' on a receiver that is not provably pixi-reels`);
      }
    }
  });

  // `{ visibleRows: 3 }`, `{ col, row }`, destructuring patterns, shorthand
  root.find(j.ObjectProperty).forEach((path) => {
    const key = path.node.key;
    if (path.node.computed || !key || key.type !== 'Identifier') return;
    const before = key.name;
    const safe = lookup(SAFE, before);
    if (safe !== undefined) {
      key.name = safe;
      // `{ row }` must become `{ cell: row }`, not `{ cell }`. the local
      // binding is the caller's and we do not rename locals.
      unshorthand(path.node, before);
      changed = true;
      return;
    }
    const coord = lookup(AMBIGUOUS, before);
    if (coord === undefined) return;
    if (!contextEvidence(path)) {
      const where = path.parent && path.parent.node.type === 'ObjectPattern' ? 'destructured' : 'a key';
      skip(key, `'${before}' ${where} on an object that is not provably pixi-reels`);
      return;
    }
    key.name = coord;
    unshorthand(path.node, before);
    changed = true;
  });

  // Flow object types and TS interface / type-literal members
  for (const kind of [j.ObjectTypeProperty, j.TSPropertySignature]) {
    root.find(kind).forEach((path) => {
      const key = path.node.key;
      if (path.node.computed || !key || key.type !== 'Identifier') return;
      const safe = lookup(SAFE, key.name);
      if (safe !== undefined) {
        key.name = safe;
        changed = true;
        return;
      }
      const coord = lookup(AMBIGUOUS, key.name);
      if (coord === undefined) return;
      if (!contextEvidence(path)) {
        skip(key, `'${key.name}' declared on a type that is not provably pixi-reels`);
        return;
      }
      key.name = coord;
      changed = true;
    });
  }

  // `symbolData({ big: { size: { w, h } } })` -> `size: { reels, cells }`
  root.find(j.ObjectProperty, { key: { type: 'Identifier', name: 'size' } }).forEach((path) => {
    const v = path.node.value;
    if (!v || v.type !== 'ObjectExpression') return;
    const pairs = v.properties.filter(
      (p) => (p.type === 'ObjectProperty' || p.type === 'Property') && lookup(SIZE, keyNameOf(p)) !== undefined,
    );
    if (pairs.length === 0) return;
    if (!sizeEvidence(path)) {
      skip(path.node.key, "`size: { w, h }` on an object that is not provably a pixi-reels symbolData size");
      return;
    }
    pairs.forEach((p) => {
      const before = p.key.name;
      p.key.name = lookup(SIZE, before);
      unshorthand(p, before);
      changed = true;
    });
  });

  // Type identifiers
  root.find(j.Identifier).forEach((path) => {
    const parent = path.parent.node;
    // Skip anything already handled as a property / key.
    if (parent.type === 'MemberExpression' && parent.property === path.node) return;
    if ((parent.type === 'ObjectProperty' || parent.type === 'Property') && parent.key === path.node) return;
    const to = lookup(TYPES, path.node.name);
    if (to !== undefined) {
      path.node.name = to;
      changed = true;
    }
  });

  // String values that renamed, only in the argument position that carries them.
  root.find(j.CallExpression).forEach((path) => {
    const callee = path.node.callee;
    const name = calleeName(callee);
    if (!name) return;
    const args = path.node.arguments;

    // `bufferSymbols({ above, below })`. `above`/`below` are only ours
    // inside this one call.
    if (name === 'bufferSymbols') {
      j(path)
        .find(j.ObjectProperty)
        .forEach((p) => {
          const k = p.node.key;
          if (p.node.computed || !k || k.type !== 'Identifier') return;
          const to = k.name === 'above' ? 'start' : k.name === 'below' ? 'end' : null;
          if (to === null) return;
          const before = k.name;
          k.name = to;
          unshorthand(p.node, before);
          changed = true;
        });
      return;
    }

    // `builder.reelAnchor('top')`. Only a plain string literal in argument 0,
    // so `reelAnchor(cfg.anchor === 'top' ? 'top' : 'bottom')` keeps both its
    // comparison operand and its branches.
    if (name === 'reelAnchor') {
      const arg = args[0];
      if (!arg) return;
      const anchor = arg.type === 'StringLiteral' ? lookup(ANCHOR_VALUES, arg.value) : undefined;
      if (calleeIsPixi(callee) && anchor !== undefined) {
        arg.value = anchor;
        changed = true;
        return;
      }
      const stray = firstV1String(arg, ANCHOR_VALUES);
      if (stray) {
        skip(
          stray,
          `reelAnchor('${stray.value}') is not a plain literal on a pixi-reels builder; left as is`,
        );
      }
      return;
    }

    // `reelSet.nudge(2, { direction: 'down', incoming: ['up', 'down'] })`.
    // Only the `direction` value. `incoming` holds symbol ids, and every UI
    // kit has a `nudge()` of its own.
    if (name === 'nudge') {
      const opts = args.find((a) => a && a.type === 'ObjectExpression');
      const dir = opts
        ? opts.properties.find(
            (p) => (p.type === 'ObjectProperty' || p.type === 'Property') && keyNameOf(p) === 'direction',
          )
        : null;
      const to =
        dir && dir.value.type === 'StringLiteral' ? lookup(NUDGE_VALUES, dir.value.value) : undefined;
      if (calleeIsPixi(callee) && to !== undefined) {
        dir.value.value = to;
        changed = true;
        return;
      }
      const stray =
        args.find((a) => a && a.type === 'StringLiteral' && lookup(NUDGE_VALUES, a.value) !== undefined) ??
        (dir ? firstV1String(dir.value, NUDGE_VALUES) : null);
      if (stray) {
        skip(
          stray,
          `nudge(... '${stray.value}' ...) is not a direction on a pixi-reels reel set; left as is`,
        );
      }
    }
  });

  // `cellOrder: 'bottomToTop'`. keyed on the (already renamed) property.
  root.find(j.ObjectProperty, { key: { type: 'Identifier', name: 'cellOrder' } }).forEach((path) => {
    const v = path.node.value;
    const to = v && v.type === 'StringLiteral' ? lookup(ORDER_VALUES, v.value) : undefined;
    if (to !== undefined) {
      v.value = to;
      changed = true;
    }
  });

  if (skipped.length > 0) {
    const sink = process.env.PIXI_REELS_CODEMOD_REPORT;
    if (sink) {
      appendFileSync(sink, skipped.map((s) => JSON.stringify(s)).join('\n') + '\n');
    } else if (typeof api.report === 'function') {
      for (const s of skipped) api.report(`${s.line}:${s.column} ${s.why}`);
    }
  }

  return changed ? root.toSource({ quote: 'single' }) : null;
};

module.exports.parser = 'tsx';
