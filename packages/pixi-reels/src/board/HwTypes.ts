/**
 * Public types for the Hold & Win board. Kept in one leaf module so the
 * reducer ({@link HoldAndWinState}), the driver ({@link HoldAndWinBoard}) and
 * the builder can share them without import cycles.
 */

/** Grid coordinate of a board cell. */
export interface HwCell {
  col: number;
  row: number;
}

/**
 * A coin somewhere on the board. `id` selects the registered symbol art;
 * `data` is an opaque game-layer payload the board never interprets.
 *
 * **Ownership contract:** `cell` and `id` belong to the board — treat them as
 * read-only; the board keys its ledger by cell and mutating them is undefined.
 * `data` is yours: mutate its contents freely (a doubler does `coin.data.value
 * *= 2`), that is the intended way to carry live game state on a locked coin.
 */
export interface HwCoin<TData = unknown> {
  readonly cell: HwCell;
  readonly id: string;
  data?: TData;
}

/** Why the respin counter changed — disambiguates a `respins:changed` event. */
export type HwRespinReason = 'seed' | 'hit-reset' | 'miss';

/** Resolution of one {@link HoldAndWinBoard.respin} wave. */
export interface HwRespinResult<TData = unknown> {
  round: number;
  hits: HwCoin<TData>[];
  respinsLeft: number;
  full: boolean;
  /** True when the feature is over (counter exhausted or board full). */
  done: boolean;
}

export type HoldAndWinBoardEvents<TData = unknown> = {
  'feature:enter': [{ seed: HwCoin<TData>[]; respins: number }];
  'respin:start': [{ round: number; respinsLeft: number; spinning: HwCell[] }];
  /** Fires per cell, in landing (stagger) order. `coin` is null on a miss. */
  'cell:landed': [{ cell: HwCell; coin: HwCoin<TData> | null }];
  'coin:locked': [{ coin: HwCoin<TData>; locked: number; capacity: number }];
  /** Fired by `release()` — the collect / fly-away moment. */
  'coin:released': [{ coin: HwCoin<TData>; remaining: number }];
  'respins:changed': [{ value: number; reason: HwRespinReason }];
  'respin:end': [{ round: number; hits: HwCoin<TData>[]; respinsLeft: number }];
  'board:full': [{ coins: HwCoin<TData>[] }];
  /** Fired by `skip()` so the game layer can cut its own flights / collect short. */
  'feature:skip': [{ inFlight: number }];
  /**
   * Fired by `reset()` — a hard clear back to idle. Distinct from `coin:released`
   * (which means "collect this coin"); listeners that maintain derived state
   * from events (HUD totals, meters) clear it here without triggering collect.
   */
  'feature:reset': [{ clearedCoins: number }];
  'feature:end': [{ coins: HwCoin<TData>[]; rounds: number; full: boolean }];
};

/**
 * One state-change the reducer ({@link HoldAndWinState}) decided, ready for the
 * driver to emit. A tagged pair of `{ type, payload }` for every board event the
 * reducer owns — the driver replays them onto its emitter and keys visual side
 * effects (e.g. `playWin()` on `coin:locked`) off the type. `respin:start` and
 * `feature:skip` are driver-owned (they describe in-flight reels, not ledger
 * state) and are not produced here.
 */
export type HwEffect<TData = unknown> = {
  [K in keyof HoldAndWinBoardEvents<TData>]: {
    type: K;
    payload: HoldAndWinBoardEvents<TData>[K][0];
  };
}[keyof HoldAndWinBoardEvents<TData>];

export interface HwCellSizeOptions {
  gap?: number;
}

/** `col,row` string key for the board's cell-indexed maps. */
export const cellKey = (c: HwCell): string => `${c.col},${c.row}`;
