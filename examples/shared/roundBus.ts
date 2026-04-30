import { EventEmitter } from 'pixi-reels';

/**
 * Demo-side event bus for "round" lifecycle events. Lives in the example
 * scaffolding, not the library — the library is engine-only and never
 * computes wins or owns a tickup. Demos emit on this bus from their own
 * spin handler; the WinBox widget subscribes.
 *
 * Why a bus and not a direct method call: keeps the WinBox decoupled from
 * the demo flow. A demo can fire `win:add` from a cascade loop, a respin,
 * a bonus reveal, and the WinBox just animates. Unit-testable too.
 */
export interface RoundEvents extends Record<string, unknown[]> {
  /** Reset the displayed total to zero (round started, no winner yet). */
  'round:reset': [];
  /** Set the running total to an absolute amount, easing from current. */
  'win:set': [amount: number];
  /** Add to the running total, easing from current to current+delta. */
  'win:add': [delta: number];
}

export const roundBus = new EventEmitter<RoundEvents>();
