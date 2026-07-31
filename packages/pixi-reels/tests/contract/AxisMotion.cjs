// Reference implementation of ADR 016 §3.2 motion.
//
// Two changes from the current ReelMotion, both forced by the contract:
//   1. Positions are DERIVED from array index every frame, never accumulated.
//      (This is what HorizontalReel._render already does: view.x = (k-1)*span + sign*_off.)
//   2. Rotation count is DERIVED from total travel, never incrementally mutated.
//      Incremental mutation is what lets float residue skip a wrap (contract L7).
//
// Consequence: rigidity, ordering and boundedness are true by construction, and
// there is no "at most one wrap per call" precondition — any step size is legal,
// so StandardMode's half-slot cap and CascadeMode's full-slot cap both stop being
// correctness-critical.
const EPS = 1e-9;

class AxisMotion {
  constructor(symbols, cellSize, gap, bufferStart, visibleCells, bufferEnd, onWrapped, opts = {}) {
    this._symbols = symbols;
    this._pitch = cellSize + gap;
    this._bufferStart = bufferStart;
    this._onWrapped = onWrapped;
    this._polarity = opts.polarity ?? 1;   // +1 forward, -1 reverse
    this._prop = opts.mainProp ?? 'y';     // 'y' vertical, 'x' horizontal
    this._travel = 0;                      // total signed travel since last snap
    this._rot = 0;                         // rotations already applied
    this._render();
  }

  get slotPitch() { return this._pitch; }
  getCellMain(cell) { return cell * this._pitch; }

  advance(travelDelta) {
    if (travelDelta === 0) return;
    this._travel += this._polarity * travelDelta;

    // Derive the rotation count rather than mutating it. Snapping q to a whole
    // number inside EPS is what makes an exact N-slot travel land on rotation N
    // instead of N-1 when float residue leaves it 1e-14 short.
    let q = this._travel / this._pitch;
    const r = Math.round(q);
    if (Math.abs(q - r) < EPS) q = r;
    const targetRot = Math.floor(q);

    while (this._rot < targetRot) { this._rot++; this._rotateToStart(); }
    while (this._rot > targetRot) { this._rot--; this._rotateToEnd(); }

    this._off = this._travel - targetRot * this._pitch;
    if (Math.abs(this._off) < EPS) this._off = 0;
    this._render();
  }

  snapToGrid() {
    this._travel = 0; this._rot = 0; this._off = 0;
    this._render();
  }

  _rotateToStart() {
    const s = this._symbols.pop();
    this._symbols.unshift(s);
    this._onWrapped(s, 0, 'toStart');
  }

  _rotateToEnd() {
    const s = this._symbols.shift();
    this._symbols.push(s);
    this._onWrapped(s, this._symbols.length - 1, 'toEnd');
  }

  _render() {
    const off = this._off ?? 0;
    for (let i = 0; i < this._symbols.length; i++) {
      this._symbols[i].view[this._prop] = (i - this._bufferStart) * this._pitch + off;
    }
  }
}
module.exports = { AxisMotion };
