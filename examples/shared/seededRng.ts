/**
 * Mulberry32 — a tiny, fast, seed-predictable PRNG.
 *
 * Good enough for slot demos where "random but reproducible" is all that
 * matters. Not cryptographically secure.
 */
export class SeededRng {
  private _state: number;

  constructor(seed = 0xdeadbeef) {
    this._state = seed >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Picks one element of the array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Returns true with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Resets the internal state to `seed`. */
  reseed(seed: number): void {
    this._state = seed >>> 0;
  }
}
