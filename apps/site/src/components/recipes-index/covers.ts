/**
 * Hand-drawn covers for the /recipes/ index, one per umbrella page.
 *
 * Each cover is an inline SVG (viewBox 160 x 100, so 16:10) in the site's
 * language: ink background, a 5x3 board of flat muted symbols, and the lime
 * brand hue on the one thing the mechanic is about. No text as the main
 * element, no rounded corners on the board. `recipeCover(slug)` returns the
 * markup, or null for a slug with no drawing (the card then falls back to
 * the generated placeholder).
 */

const INK = '#111114';
const CELL = '#1c1c22';
const GHOST = '#3a3a44';
const LIME = 'hsl(76 100% 58%)';

// Muted versions of the atlas hues the landing reels spin (rose, amber,
// blue, violet, teal), so the one lime element has something to beat.
const ROSE = '#b4525c';
const AMBER = '#c4913f';
const BLUE = '#4f6fae';
const VIOLET = '#7a5ba3';
const TEAL = '#3e968d';

type Kind = 'circle' | 'square' | 'diamond' | 'tri';

interface Grid {
  cols: number;
  rows: number;
  cell: number;
  gap: number;
  ox: number;
  oy: number;
}

/** A board of `cols` x `rows` cells, centred in the 160 x 100 frame. */
function grid(cols = 5, rows = 3, cell = 22, gap = 4): Grid {
  const w = cols * cell + (cols - 1) * gap;
  const h = rows * cell + (rows - 1) * gap;
  return { cols, rows, cell, gap, ox: (160 - w) / 2, oy: (100 - h) / 2 };
}

function cx(g: Grid, c: number): number {
  return g.ox + c * (g.cell + g.gap);
}
function cy(g: Grid, r: number): number {
  return g.oy + r * (g.cell + g.gap);
}
function boardW(g: Grid): number {
  return g.cols * g.cell + (g.cols - 1) * g.gap;
}
function boardH(g: Grid): number {
  return g.rows * g.cell + (g.rows - 1) * g.gap;
}

function cellRect(g: Grid, c: number, r: number, attrs = `fill="${CELL}"`): string {
  return `<rect x="${cx(g, c)}" y="${cy(g, r)}" width="${g.cell}" height="${g.cell}" ${attrs}/>`;
}

/** Every cell of the board, empty. */
function cells(g: Grid, skip?: (c: number, r: number) => boolean): string {
  let out = '';
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (skip?.(c, r)) continue;
      out += cellRect(g, c, r);
    }
  }
  return out;
}

/** A flat symbol shape inset in a cell whose top-left is (x, y). */
function shape(kind: Kind, color: string, x: number, y: number, size: number, attrs = ''): string {
  const inset = Math.round(size * 0.23);
  const s = size - inset * 2;
  const mx = x + size / 2;
  const my = y + size / 2;
  switch (kind) {
    case 'circle':
      return `<circle cx="${mx}" cy="${my}" r="${s / 2}" fill="${color}" ${attrs}/>`;
    case 'square':
      return `<rect x="${x + inset}" y="${y + inset}" width="${s}" height="${s}" fill="${color}" ${attrs}/>`;
    case 'diamond':
      return `<polygon points="${mx},${y + inset - 1} ${x + size - inset + 1},${my} ${mx},${y + size - inset + 1} ${x + inset - 1},${my}" fill="${color}" ${attrs}/>`;
    case 'tri':
      return `<polygon points="${mx},${y + inset - 1} ${x + size - inset + 1},${y + size - inset} ${x + inset - 1},${y + size - inset}" fill="${color}" ${attrs}/>`;
  }
}

/** The fixed symbol layout every board shares, row-major, 5 x 3. */
const FILL: Array<[Kind, string]> = [
  ['circle', ROSE], ['square', BLUE], ['diamond', AMBER], ['circle', VIOLET], ['tri', TEAL],
  ['diamond', TEAL], ['circle', AMBER], ['square', ROSE], ['tri', BLUE], ['circle', VIOLET],
  ['square', VIOLET], ['tri', TEAL], ['circle', BLUE], ['diamond', ROSE], ['square', AMBER],
];

function fillAt(c: number, r: number): [Kind, string] {
  return FILL[((r * 5 + c) % FILL.length + FILL.length) % FILL.length];
}

function symbolAt(g: Grid, c: number, r: number, dx = 0, dy = 0, attrs = ''): string {
  const [kind, color] = fillAt(c, r);
  return shape(kind, color, cx(g, c) + dx, cy(g, r) + dy, g.cell, attrs);
}

/** Every symbol of the board. */
function symbols(g: Grid, skip?: (c: number, r: number) => boolean): string {
  let out = '';
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (skip?.(c, r)) continue;
      out += symbolAt(g, c, r);
    }
  }
  return out;
}

/** A column still spinning: vertical streaks instead of symbols. */
function streaks(g: Grid, c: number, color = GHOST): string {
  const x = cx(g, c) + g.cell / 2 - 4;
  const top = g.oy;
  const h = boardH(g);
  return (
    `<rect x="${x}" y="${top + 2}" width="8" height="${h * 0.42}" fill="${color}" opacity="0.5"/>` +
    `<rect x="${x}" y="${top + h * 0.5}" width="8" height="${h * 0.22}" fill="${color}" opacity="0.8"/>` +
    `<rect x="${x}" y="${top + h * 0.78}" width="8" height="${h * 0.2}" fill="${color}" opacity="0.4"/>`
  );
}

function frame(body: string, defs = ''): string {
  return (
    `<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" class="h-full w-full">` +
    (defs ? `<defs>${defs}</defs>` : '') +
    `<rect width="160" height="100" fill="${INK}"/>${body}</svg>`
  );
}

/** A lime arrow: a shaft with a two-stroke head, pointing +x or -x. */
function arrow(x0: number, x1: number, y: number): string {
  const d = x1 > x0 ? 1 : -1;
  return (
    `<path d="M${x0} ${y}H${x1}M${x1 - 4 * d} ${y - 4}L${x1} ${y}L${x1 - 4 * d} ${y + 4}" ` +
    `fill="none" stroke="${LIME}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

const COVERS: Record<string, () => string> = {
  // A plain 5x3 board, framed and waiting for spin().
  starters() {
    const g = grid();
    const pad = 4;
    return frame(
      `<rect x="${g.ox - pad}" y="${g.oy - pad}" width="${boardW(g) + pad * 2}" height="${boardH(g) + pad * 2}" fill="none" stroke="${LIME}" stroke-width="1.5"/>` +
        cells(g) +
        symbols(g),
    );
  },

  // Lime coins locked in their cells; the empty cells spin again.
  'hold-and-win'() {
    const g = grid();
    const coins = new Set(['0,0', '1,1', '2,0', '2,2', '3,1', '4,0', '4,2']);
    let out = cells(g);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (!coins.has(`${c},${r}`)) continue;
        const x = cx(g, c);
        const y = cy(g, r);
        out += cellRect(g, c, r, `fill="none" stroke="${LIME}" stroke-width="1.5"`);
        out += `<circle cx="${x + 11}" cy="${y + 11}" r="6" fill="${LIME}"/>`;
        out += `<circle cx="${x + 11}" cy="${y + 11}" r="2.5" fill="${INK}"/>`;
      }
    }
    return frame(out);
  },

  // A 2x2 big symbol sitting inside the 5x3 grid.
  'big-symbols'() {
    const g = grid();
    const inBlock = (c: number, r: number) => c >= 1 && c <= 2 && r <= 1;
    const x = cx(g, 1);
    const y = cy(g, 0);
    const s = g.cell * 2 + g.gap;
    return frame(
      cells(g, inBlock) +
        symbols(g, inBlock) +
        `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${LIME}"/>` +
        `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * 0.27}" fill="${INK}"/>`,
    );
  },

  // One column with a hole; the lime tile is mid-fall into it.
  cascade() {
    const g = grid();
    const hole = (c: number, r: number) => c === 2 && r < 2;
    const x = cx(g, 2) + 5;
    const y = cy(g, 0) + g.cell / 2;
    return frame(
      cells(g) +
        symbols(g, hole) +
        `<rect x="${x + 5}" y="${y - 16}" width="2" height="6" fill="${LIME}" opacity="0.25"/>` +
        `<rect x="${x + 5}" y="${y - 8}" width="2" height="6" fill="${LIME}" opacity="0.5"/>` +
        `<rect x="${x}" y="${y}" width="12" height="12" fill="${LIME}"/>`,
    );
  },

  // A wild in the centre cell, pinned in place with a lime tack.
  'wilds-and-pins'() {
    const g = grid();
    const isWild = (c: number, r: number) => c === 2 && r === 1;
    const x = cx(g, 2);
    const y = cy(g, 1);
    return frame(
      cells(g, isWild) +
        symbols(g, isWild) +
        `<rect x="${x}" y="${y}" width="${g.cell}" height="${g.cell}" fill="#2a2a33"/>` +
        `<path d="M${x + 5} ${y + 6}L${x + 8.5} ${y + 16}L${x + 11} ${y + 9}L${x + 13.5} ${y + 16}L${x + 17} ${y + 6}" fill="none" stroke="#e4e4e7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M${x + 19} ${y + 3}L${x + 14.5} ${y + 7.5}" stroke="${LIME}" stroke-width="1.5" stroke-linecap="round"/>` +
        `<circle cx="${x + 19.5}" cy="${y + 2.5}" r="3" fill="${LIME}"/>`,
    );
  },

  // Column four nudged half a cell down; its symbols turn lime.
  nudge() {
    const g = grid();
    const col = 3;
    const isCol = (c: number) => c === col;
    const half = g.cell / 2;
    const x = cx(g, col);
    let nudged = '';
    for (let r = -1; r < g.rows; r++) {
      const [kind] = fillAt(col, r);
      nudged += shape(kind, LIME, x, cy(g, r) + half, g.cell);
    }
    const clip = `<clipPath id="cover-nudge-clip"><rect x="${x}" y="${g.oy}" width="${g.cell}" height="${boardH(g)}"/></clipPath>`;
    return frame(
      cells(g) +
        symbols(g, isCol) +
        `<g clip-path="url(#cover-nudge-clip)">${nudged}</g>` +
        `<path d="M${x + 7} ${g.oy + boardH(g) + 4}L${x + 11} ${g.oy + boardH(g) + 8}L${x + 15} ${g.oy + boardH(g) + 4}" fill="none" stroke="${LIME}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
      clip,
    );
  },

  // Four reels landed, the last still a blur under a lime glow.
  anticipation() {
    const g = grid();
    const last = (c: number) => c === g.cols - 1;
    const x = cx(g, 4) - 2;
    const y = g.oy - 2;
    const w = g.cell + 4;
    const h = boardH(g) + 4;
    const glow = `<filter id="cover-anticipation-glow" x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>`;
    return frame(
      cells(g) +
        symbols(g, last) +
        streaks(g, 4) +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${LIME}" stroke-width="3" opacity="0.8" filter="url(#cover-anticipation-glow)"/>` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${LIME}" stroke-width="1.5"/>`,
      glow,
    );
  },

  // Four symbol kinds side by side: sprite, sprite sheet, Spine bones, blur.
  symbols() {
    const g = grid(4, 1, 30, 6);
    const y = g.oy;
    const x1 = cx(g, 1);
    const x2 = cx(g, 2);
    const x3 = cx(g, 3);
    let out = cells(g);
    out += shape('circle', ROSE, cx(g, 0), y, g.cell);
    // Sprite sheet: a square with film perforations down both edges.
    out += shape('square', AMBER, x1, y, g.cell);
    for (let i = 0; i < 3; i++) {
      out += `<rect x="${x1 + 8}" y="${y + 9 + i * 5}" width="2" height="2.5" fill="${INK}"/>`;
      out += `<rect x="${x1 + 20}" y="${y + 9 + i * 5}" width="2" height="2.5" fill="${INK}"/>`;
    }
    // Spine: a bone chain with lime joints.
    out +=
      `<path d="M${x2 + 8} ${y + 22}L${x2 + 14} ${y + 10}L${x2 + 23} ${y + 19}" fill="none" stroke="${LIME}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="${x2 + 8}" cy="${y + 22}" r="2.6" fill="${LIME}"/>` +
      `<circle cx="${x2 + 14}" cy="${y + 10}" r="2.6" fill="${LIME}"/>` +
      `<circle cx="${x2 + 23}" cy="${y + 19}" r="2.6" fill="${LIME}"/>`;
    // Motion blur: the same shape stretched along the travel axis.
    out +=
      `<rect x="${x3 + 11}" y="${y + 3}" width="8" height="24" fill="${VIOLET}" opacity="0.35"/>` +
      `<rect x="${x3 + 11}" y="${y + 11}" width="8" height="8" fill="${VIOLET}"/>`;
    return frame(out);
  },

  // A lime banner strip laid across the middle row.
  'cells-and-banners'() {
    const g = grid();
    const y = cy(g, 1) - 2;
    const h = g.cell + 4;
    const x = g.ox - 4;
    const w = boardW(g) + 8;
    let out = cells(g) + symbols(g) + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${LIME}"/>`;
    for (let i = 0; i < 3; i++) {
      out += shape('diamond', INK, x + 20 + i * 42, y + 2, g.cell);
    }
    return frame(out);
  },

  // Rows as reels: each one travels sideways, not all the same way.
  'orientation-and-direction'() {
    const g = grid();
    const shift = [6, -6, 6];
    const clip = `<clipPath id="cover-orientation-clip"><rect x="${g.ox}" y="${g.oy}" width="${boardW(g)}" height="${boardH(g)}"/></clipPath>`;
    let out = cells(g) + `<g clip-path="url(#cover-orientation-clip)">`;
    for (let r = 0; r < g.rows; r++) {
      for (let c = -1; c <= g.cols; c++) out += symbolAt(g, c, r, shift[r], 0);
    }
    out += '</g>';
    const right = g.ox + boardW(g);
    out += arrow(right + 4, right + 15, cy(g, 0) + g.cell / 2);
    out += arrow(g.ox - 4, g.ox - 15, cy(g, 1) + g.cell / 2);
    out += arrow(right + 4, right + 15, cy(g, 2) + g.cell / 2);
    return frame(out, clip);
  },

  // Five reels landed; a sixth is being added at the right edge.
  'infinity-reels'() {
    const g = grid(6, 3, 20, 4);
    const isNew = (c: number) => c === 5;
    const x = cx(g, 5);
    let out = cells(g, isNew) + symbols(g, isNew);
    for (let r = 0; r < g.rows; r++) {
      out += cellRect(g, 5, r, `fill="none" stroke="${LIME}" stroke-width="1.5" stroke-dasharray="3 2"`);
    }
    const my = cy(g, 1) + g.cell / 2;
    out += `<path d="M${x + 10} ${my - 5}V${my + 5}M${x + 5} ${my}H${x + 15}" stroke="${LIME}" stroke-width="2" stroke-linecap="round"/>`;
    return frame(out);
  },

  // One winning cell splits into three, each with its own smaller symbol.
  'split-symbols'() {
    const g = grid();
    const isSplit = (c: number, r: number) => c === 2 && r === 1;
    const x = cx(g, 2);
    const y = cy(g, 1);
    let out = cells(g, isSplit) + symbols(g, isSplit);
    for (let i = 0; i < 3; i++) {
      const sy = y + i * 8;
      out += `<rect x="${x}" y="${sy}" width="${g.cell}" height="6" fill="${CELL}" stroke="${LIME}" stroke-width="1"/>`;
      out += `<circle cx="${x + 11}" cy="${sy + 3}" r="2" fill="${LIME}"/>`;
    }
    return frame(out);
  },

  // The board clipped to a shape: symbols inside the mask stay, the rest fades.
  masks() {
    const g = grid();
    const pts = '80,6 152,50 80,94 8,50';
    const clip = `<clipPath id="cover-masks-clip"><polygon points="${pts}"/></clipPath>`;
    return frame(
      cells(g) +
        `<g opacity="0.18">${symbols(g)}</g>` +
        `<g clip-path="url(#cover-masks-clip)">${symbols(g)}</g>` +
        `<polygon points="${pts}" fill="none" stroke="${LIME}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
      clip,
    );
  },

  // Cells keystoned onto a drum: the top and bottom rows become trapezoids.
  'reel-curvature'() {
    const g = grid();
    let out = '';
    for (let c = 0; c < g.cols; c++) {
      const x = cx(g, c);
      const [k0, c0] = fillAt(c, 0);
      const [k1, c1] = fillAt(c, 1);
      const [k2, c2] = fillAt(c, 2);
      const y0 = cy(g, 0);
      const y2 = cy(g, 2);
      out += `<polygon points="${x + 3},${y0} ${x + 19},${y0} ${x + 22},${y0 + 22} ${x},${y0 + 22}" fill="${CELL}"/>`;
      out += cellRect(g, c, 1);
      out += `<polygon points="${x},${y2} ${x + 22},${y2} ${x + 19},${y2 + 22} ${x + 3},${y2 + 22}" fill="${CELL}"/>`;
      out += shape(k0, c0, x + 2, y0 + 2, g.cell - 4);
      out += shape(k1, c1, x, cy(g, 1), g.cell);
      out += shape(k2, c2, x + 2, y2 + 2, g.cell - 4);
    }
    const bottom = g.oy + boardH(g);
    out += `<path d="M${g.ox - 3} ${bottom + 9}Q80 ${bottom - 3} ${g.ox + boardW(g) + 3} ${bottom + 9}" fill="none" stroke="${LIME}" stroke-width="1.5" stroke-linecap="round"/>`;
    return frame(out);
  },

  // Two reels down, three still spinning, the slam cutting them short.
  skip() {
    const g = grid();
    const spinning = (c: number) => c >= 2;
    const mx = cx(g, 3) + g.cell / 2;
    const my = g.oy + boardH(g) / 2;
    return frame(
      cells(g) +
        symbols(g, spinning) +
        streaks(g, 2) +
        streaks(g, 3) +
        streaks(g, 4) +
        `<path d="M${mx - 9} ${my - 11}L${mx} ${my}L${mx - 9} ${my + 11}M${mx + 2} ${my - 11}L${mx + 11} ${my}L${mx + 2} ${my + 11}" fill="none" stroke="${LIME}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  },

  // The last reel lands with a kick: a dust burst at its foot.
  feel() {
    const g = grid();
    const last = (c: number) => c === 4;
    const x = cx(g, 4) + g.cell / 2;
    const y = g.oy + boardH(g);
    let out = cells(g) + symbols(g, last);
    for (let r = 0; r < g.rows; r++) out += symbolAt(g, 4, r, 0, -2);
    const burst = [
      [-10, 3, -16, 6],
      [10, 3, 16, 6],
      [-13, -1, -19, -1],
      [13, -1, 19, -1],
      [-7, 6, -9, 11],
      [7, 6, 9, 11],
    ];
    for (const [ax, ay, bx, by] of burst) {
      out += `<path d="M${x + ax} ${y + ay}L${x + bx} ${y + by}" stroke="${LIME}" stroke-width="2" stroke-linecap="round"/>`;
    }
    return frame(out);
  },
};

/** The slugs that have a hand-drawn cover. */
export function hasRecipeCover(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(COVERS, slug);
}

/** Inline SVG markup for the slug's cover, or null when there is none. */
export function recipeCover(slug: string): string | null {
  return hasRecipeCover(slug) ? COVERS[slug]() : null;
}
