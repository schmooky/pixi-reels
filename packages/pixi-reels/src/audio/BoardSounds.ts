import type { HoldAndWinBoard } from '../board/HoldAndWinBoard.js';
import type { HoldAndWinBoardEvents } from '../board/HwTypes.js';
import { CuePlayer } from './cues.js';
import type { Cue, CueContext, LoopCue, OneShotCue, ReelAudioPort, ReelSoundsHandle } from './cues.js';

/**
 * Board sounds: the same cue table, snapped onto a Hold & Win board.
 *
 * ```ts
 * const sounds = attachBoardSounds(board, zvukPort(engine), {
 *   respinStart: { play: 'spin', volume: 0.5 },
 *   cellLanded: { play: 'reel-stop', volume: ({ hit }) => (hit ? 0.7 : 0.4) },
 *   coinLocked: { play: 'pop' },
 *   featureEnd: { play: 'win' },
 * });
 * ```
 */

/** A cue on any board event: a one-shot, or a loop that runs until `until` fires. */
export type BoardEventCue =
  | OneShotCue
  | (LoopCue & { until: keyof HoldAndWinBoardEvents });

export interface BoardCues {
  /** The feature opening (`feature:enter`). */
  featureEnter?: Cue;
  /** A respin's cells starting to spin (`respin:start`). A loop runs until `respin:end`. */
  respinStart?: Cue;
  /**
   * A cell landing (`cell:landed`): `ctx.reelIndex` / `ctx.cell` is the cell,
   * `ctx.hit` says whether a coin landed.
   */
  cellLanded?: Cue;
  /** A coin locking in (`coin:locked`). */
  coinLocked?: Cue;
  /** Every cell taken (`board:full`). */
  boardFull?: Cue;
  /** The feature ending (`feature:end`). */
  featureEnd?: Cue;
  /** Any other board event by name. */
  on?: Partial<Record<keyof HoldAndWinBoardEvents, BoardEventCue>>;
}

/**
 * Snap a table of cues onto a Hold & Win board. Every cue sees the board's
 * active speed name. Returns a handle whose `destroy()` detaches every
 * listener and stops every loop; call it when the board goes.
 */
export function attachBoardSounds<TData = unknown>(
  board: HoldAndWinBoard<TData>,
  port: ReelAudioPort,
  cues: BoardCues,
): ReelSoundsHandle {
  const events = board.events;
  const player = new CuePlayer(port);
  const offs: Array<() => void> = [];

  const ctxFor = (extra?: Partial<CueContext>): CueContext => ({ ...extra, speed: board.speed });

  const on = <K extends keyof HoldAndWinBoardEvents<TData>>(
    name: K,
    fn: (...args: HoldAndWinBoardEvents<TData>[K]) => void,
  ): void => {
    events.on(name, fn);
    offs.push(() => events.off(name, fn));
  };

  if (cues.featureEnter) {
    const cue = cues.featureEnter;
    on('feature:enter', () => player.fire(cue, 'featureEnter', ctxFor()));
  }
  if (cues.respinStart) {
    const cue = cues.respinStart;
    on('respin:start', () => player.fire(cue, 'respin', ctxFor()));
    on('respin:end', () => player.endLoop(cue, 'respin'));
  }
  if (cues.cellLanded) {
    const cue = cues.cellLanded;
    on('cell:landed', ({ cell, coin }) =>
      player.fire(cue, `cell:${cell.reel}:${cell.cell}`, ctxFor({ reelIndex: cell.reel, cell: cell.cell, hit: coin !== null })));
  }
  if (cues.coinLocked) {
    const cue = cues.coinLocked;
    on('coin:locked', ({ coin }) =>
      player.fire(cue, `lock:${coin.cell.reel}:${coin.cell.cell}`, ctxFor({ reelIndex: coin.cell.reel, cell: coin.cell.cell, hit: true })));
  }
  if (cues.boardFull) {
    const cue = cues.boardFull;
    on('board:full', () => player.fire(cue, 'boardFull', ctxFor()));
  }
  if (cues.featureEnd) {
    const cue = cues.featureEnd;
    on('feature:end', () => player.fire(cue, 'featureEnd', ctxFor()));
  }
  for (const [name, cue] of Object.entries(cues.on ?? {}) as Array<[keyof HoldAndWinBoardEvents, BoardEventCue]>) {
    const key = `on:${String(name)}`;
    on(name, () => player.fire(cue, key, ctxFor()));
    if ('until' in cue) on(cue.until, () => player.endLoop(cue, key));
  }

  return {
    stopAll: (opts) => player.stopAll(opts),
    get isDestroyed() {
      return player.isDestroyed;
    },
    destroy() {
      if (player.isDestroyed) return;
      player.destroy();
      for (const off of offs) off();
      offs.length = 0;
    },
  };
}
