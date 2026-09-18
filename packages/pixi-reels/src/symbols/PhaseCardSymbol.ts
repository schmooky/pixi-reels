import type { gsap } from 'gsap';
import type { EventEmitter } from '../events/EventEmitter.js';
import type { ReelEvents } from '../events/ReelEvents.js';
import { CardSymbol } from './CardSymbol.js';
import type { ReelSymbol } from './ReelSymbol.js';

/**
 * Fill per phase for {@link PhaseCardSymbol}. Keys are the names phases
 * register under (`'start'`, `'spin'`, `'anticipation'`, `'stop'`, the
 * cascade and MultiWays keys, and any custom key), plus `rest` (at rest,
 * the default) and `landed` (the beat between landing and rest). A phase
 * with no entry draws `other`.
 */
export const PHASE_CARD_COLORS: Readonly<Record<string, number>> = {
  rest: 0x4b5563,
  start: 0x38bdf8,
  spin: 0x2563eb,
  anticipation: 0xf59e0b,
  stop: 0x8b5cf6,
  landed: 0x22c55e,
  adjust: 0xec4899,
  'cascade:fall': 0x0ea5e9,
  'cascade:place': 0x14b8a6,
  'cascade:dropIn': 0x06b6d4,
  other: 0x9ca3af,
};

export interface PhaseCardSymbolOptions {
  /** Centered label text (e.g. `'A'`, `'10'`). */
  label: string;
  /** Text fill color. Defaults to white. */
  textColor?: number;
  /** Fills to override or add; unlisted phases keep {@link PHASE_CARD_COLORS}. */
  colors?: Partial<Record<string, number>>;
  /** How long the `landed` fill shows before the card rests, in ms. `0` rests at once. Default 350. */
  landedMs?: number;
}

/**
 * The slice of a `Reel` that {@link PhaseCardSymbol.watch} reads. Every
 * entry of `ReelSet.reels` satisfies it.
 */
export interface PhaseWatchedReel {
  readonly symbols: readonly ReelSymbol[];
  readonly events: EventEmitter<ReelEvents>;
}

/** The `landed` beat, in ms, when the options do not say. */
const DEFAULT_LANDED_MS = 350;

/**
 * **Debug / prototyping symbol - NOT for production.**
 *
 * A {@link CardSymbol} that is grey at rest and takes the colour of whatever
 * phase its reel is running, so a spin can be read off the board: sky while
 * the reel accelerates, blue at full speed, amber through a tease, violet
 * while the stop spins the frame in, a green beat on landing, then grey
 * again. A slam shows as amber or blue going straight to green; a quicken
 * shows the violet in between.
 *
 * The card does not know its reel. Point a watcher at the reels once and it
 * paints every card on them from the reel's own `phase:enter`, `landed` and
 * `symbol:created` events, custom phases included:
 *
 * ```ts
 * import { PhaseCardSymbol } from 'pixi-reels';
 *
 * builder.symbols((r) => r.register('A', PhaseCardSymbol, { label: 'A' }));
 * const stop = PhaseCardSymbol.watch(reelSet.reels);
 * // ...later, before reelSet.destroy():
 * stop();
 * ```
 *
 * `setPhase()` is public, so anything else that knows the phase can drive a
 * card directly.
 */
export class PhaseCardSymbol extends CardSymbol {
  private readonly _colors: Record<string, number>;
  private readonly _landedMs: number;
  private _phase = 'rest';
  private _width = 0;
  private _height = 0;
  private _restCall: gsap.core.Tween | null = null;

  constructor(opts: PhaseCardSymbolOptions) {
    const colors: Record<string, number> = { ...PHASE_CARD_COLORS };
    for (const [phase, color] of Object.entries(opts.colors ?? {})) {
      if (color !== undefined) colors[phase] = color;
    }
    super({ color: colors.rest, label: opts.label, textColor: opts.textColor });
    this._colors = colors;
    this._landedMs = opts.landedMs ?? DEFAULT_LANDED_MS;
  }

  /** The phase the card currently shows: a phase name, `'landed'` or `'rest'`. */
  get phase(): string {
    return this._phase;
  }

  /**
   * Show `phase`. A phase with no colour of its own draws `other`. `'landed'`
   * shows its beat and then rests on its own; anything set in the meantime
   * cancels that.
   */
  setPhase(phase: string): void {
    this._cancelRest();
    this._phase = phase;
    this._color = this._colors[phase] ?? this._colors.other;
    if (this._width > 0) this.resize(this._width, this._height);
    if (phase === 'landed') {
      if (this._landedMs <= 0) {
        this.setPhase('rest');
        return;
      }
      this._restCall = this.gsap.delayedCall(this._landedMs / 1000, () => {
        this._restCall = null;
        this.setPhase('rest');
      });
    }
  }

  override resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    super.resize(width, height);
  }

  /**
   * Paint every {@link PhaseCardSymbol} on `reels` from the reels' own
   * events, for as long as the returned function has not been called. Other
   * symbol classes on the same reels are left alone. A card that arrives
   * mid-phase (a pool swap as the strip wraps) is painted on arrival.
   */
  static watch(reels: Iterable<PhaseWatchedReel>): () => void {
    const stops: Array<() => void> = [];
    for (const reel of reels) {
      // What a card created from now on should show. `rest` after a landing:
      // the landed beat is for the cards that landed, not for a swap-in.
      let current = 'rest';
      const paint = (symbol: ReelSymbol, phase: string): void => {
        if (symbol instanceof PhaseCardSymbol) symbol.setPhase(phase);
      };
      const paintAll = (phase: string): void => {
        for (const symbol of reel.symbols) paint(symbol, phase);
      };
      const onEnter = (name: string): void => {
        current = name;
        paintAll(name);
      };
      const onLanded = (): void => {
        current = 'rest';
        paintAll('landed');
      };
      const onCreated = (_id: string, stripIndex: number): void => {
        const symbol = reel.symbols[stripIndex];
        if (symbol) paint(symbol, current);
      };
      reel.events.on('phase:enter', onEnter);
      reel.events.on('landed', onLanded);
      reel.events.on('symbol:created', onCreated);
      stops.push(() => {
        reel.events.off('phase:enter', onEnter);
        reel.events.off('landed', onLanded);
        reel.events.off('symbol:created', onCreated);
      });
    }
    return () => {
      for (const stop of stops) stop();
      stops.length = 0;
    };
  }

  protected override onDeactivate(): void {
    // A pooled card must not carry a phase into whichever cell takes it next.
    this._cancelRest();
    this._phase = 'rest';
    this._color = this._colors.rest;
    super.onDeactivate();
  }

  protected override onDestroy(): void {
    this._cancelRest();
    super.onDestroy();
  }

  private _cancelRest(): void {
    if (this._restCall) {
      this._restCall.kill();
      this._restCall = null;
    }
  }
}
