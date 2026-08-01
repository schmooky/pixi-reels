/**
 * pixi-reels v1 -> v2 (ADR 016 section 5).
 *
 * Deliberately conservative about WHERE it renames. `row`, `col`, `w` and `h`
 * are ordinary words in anyone's codebase, so this transform only touches
 * them in positions that can only be pixi-reels API:
 *
 *   - member expressions on a value, e.g. `pin.row` -> `pin.cell`
 *   - object-literal keys, e.g. `{ col, row }` -> `{ reel, cell }`
 *   - method names in call expressions, e.g. `.visibleRows(3)`
 *   - string arguments to the specific methods that renamed their values
 *
 * It never renames a bare local variable, an import binding, or a property
 * on something it has no reason to believe is a reel set. That means the
 * output may still need a read-through on heavily destructured code -- which
 * is the right trade against silently rewriting `for (const row of table)`.
 *
 * The `{ w, h }` pair is only rewritten under a `size:` key, since `w`/`h`
 * are far too common to touch anywhere else.
 */

/** Names that renamed 1:1 wherever they appear as a property or method. */
const SAFE = {
  // geometry
  visibleRows: 'visibleCells',
  visibleRowsPerReel: 'visibleCellsPerReel',
  reelPixelHeights: 'reelExtents',
  reelPixelHeight: 'reelExtent',
  bufferAbove: 'bufferStart',
  bufferBelow: 'bufferEnd',
  reelHeight: 'extent',
  offsetY: 'mainOffset',
  spinSymbolHeight: 'spinCellSize',
  minRows: 'minCells',
  maxRows: 'maxCells',
  // motion
  displace: 'advance',
  slotHeight: 'slotPitch',
  getRowY: 'getCellMain',
  // grid coordinates and payloads
  rowIndex: 'cellIndex',
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

/** Coordinate-pair fields. Renamed as properties and object keys only. */
const COORD = { row: 'cell', col: 'reel' };

/** Type names, renamed as plain identifiers. */
const TYPES = { OffsetXMode: 'CrossOffsetMode' };

/** String values, renamed only inside the call that owns them. */
const VALUE_RENAMES = [
  { methods: ['reelAnchor'], values: { top: 'start', bottom: 'end' } },
  { methods: ['nudge'], values: { down: 'forward', up: 'reverse' } },
];

const ORDER_VALUES = { bottomToTop: 'endFirst', topToBottom: 'startFirst' };

module.exports = function transform(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = false;

  const rename = (node, map) => {
    const to = map[node.name];
    if (to === undefined) return false;
    node.name = to;
    changed = true;
    return true;
  };

  // `a.visibleRows`, `a.row`, `a?.bufferAbove`
  root.find(j.MemberExpression).forEach((path) => {
    const prop = path.node.property;
    if (path.node.computed || prop.type !== 'Identifier') return;
    // `x.size.w` / `x.size.h` -- only under a `.size` object, since `w` and
    // `h` are far too common to rename anywhere else.
    const obj = path.node.object;
    if (
      obj.type === 'MemberExpression' &&
      !obj.computed &&
      obj.property.type === 'Identifier' &&
      obj.property.name === 'size' &&
      (prop.name === 'w' || prop.name === 'h')
    ) {
      prop.name = prop.name === 'w' ? 'reels' : 'cells';
      changed = true;
      return;
    }
    if (!rename(prop, SAFE)) rename(prop, COORD);
  });

  // `{ visibleRows: 3 }`, `{ col, row }`, and shorthand values
  root.find(j.ObjectProperty).forEach((path) => {
    const { key, value, shorthand, computed } = path.node;
    if (computed || key.type !== 'Identifier') return;
    const before = key.name;
    if (!rename(key, SAFE) && !rename(key, COORD)) return;
    // `{ row }` must become `{ cell: row }`, not `{ cell }` -- the local
    // binding is the caller's and we do not rename locals.
    if (shorthand && value.type === 'Identifier' && value.name === before) {
      path.node.shorthand = false;
    }
  });
  root.find(j.ObjectTypeProperty).forEach((path) => {
    const key = path.node.key;
    if (key && key.type === 'Identifier') {
      if (!rename(key, SAFE)) rename(key, COORD);
    }
  });
  // TS interface / type-literal members
  root.find(j.TSPropertySignature).forEach((path) => {
    const key = path.node.key;
    if (key && key.type === 'Identifier' && !path.node.computed) {
      if (!rename(key, SAFE)) rename(key, COORD);
    }
  });

  // `size: { w, h }` -> `size: { reels, cells }`
  root
    .find(j.ObjectProperty, { key: { type: 'Identifier', name: 'size' } })
    .forEach((path) => {
      const v = path.node.value;
      if (!v || v.type !== 'ObjectExpression') return;
      v.properties.forEach((p) => {
        if (p.type !== 'ObjectProperty' && p.type !== 'Property') return;
        if (p.computed || !p.key || p.key.type !== 'Identifier') return;
        const before = p.key.name;
        if (before !== 'w' && before !== 'h') return;
        p.key.name = before === 'w' ? 'reels' : 'cells';
        if (p.shorthand && p.value.type === 'Identifier' && p.value.name === before) {
          p.shorthand = false;
        }
        changed = true;
      });
    });

  // Type identifiers
  root.find(j.Identifier).forEach((path) => {
    const parent = path.parent.node;
    // Skip anything already handled as a property / key.
    if (parent.type === 'MemberExpression' && parent.property === path.node) return;
    if (
      (parent.type === 'ObjectProperty' || parent.type === 'Property') &&
      parent.key === path.node
    ) {
      return;
    }
    rename(path.node, TYPES);
  });

  // String values that renamed only inside a specific call.
  root.find(j.CallExpression).forEach((path) => {
    const callee = path.node.callee;
    const name =
      callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
        ? callee.property.name
        : callee.type === 'Identifier'
          ? callee.name
          : null;
    if (!name) return;
    // `bufferSymbols({ above, below })` -- `above`/`below` are only ours
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
          if (p.node.shorthand && p.node.value.type === 'Identifier' && p.node.value.name === before) {
            p.node.shorthand = false;
          }
          changed = true;
        });
    }
    for (const { methods, values } of VALUE_RENAMES) {
      if (!methods.includes(name)) continue;
      j(path)
        .find(j.StringLiteral)
        .forEach((s) => {
          const to = values[s.node.value];
          if (to !== undefined) {
            s.node.value = to;
            changed = true;
          }
        });
    }
  });

  // `cellOrder: 'bottomToTop'` -- keyed on the (already renamed) property.
  root
    .find(j.ObjectProperty, { key: { type: 'Identifier', name: 'cellOrder' } })
    .forEach((path) => {
      const v = path.node.value;
      if (v && v.type === 'StringLiteral' && ORDER_VALUES[v.value] !== undefined) {
        v.value = ORDER_VALUES[v.value];
        changed = true;
      }
    });

  return changed ? root.toSource({ quote: 'single' }) : null;
};

module.exports.parser = 'tsx';
