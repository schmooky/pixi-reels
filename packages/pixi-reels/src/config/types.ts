import type { Container, Ticker } from 'pixi.js';
import type { TumbleConfig } from '../cascade/TumbleConfig.js';

/**
 * Options accepted by `reelSet.spin(options?)`. All fields are optional.
 * passing nothing reproduces the legacy "every reel spins" behaviour.
 */
export interface SpinOptions {
  /**
   * Phase chain selector for this spin.
   * `'cascade'` requires `.tumble(...)` on the builder.
   */
  mode?: 'standard' | 'cascade';

  /**
   * Reel indices to HOLD this spin. Held reels skip START / SPIN / STOP
   * entirely and stay on whatever symbols they're currently showing.
   * They count as already-landed for the `spin:allLanded` resolver. only
   * non-held reels actually animate.
   *
   * Use cases:
   *   - Hold & Win respins (most reels held, one or two reroll)
   *   - Sticky / expanding wilds during a feature spin
   *   - Bonus respin where the trigger column stays in place
   *
   * Notes:
   *   - `setResult(grid)` still expects a full `reelCount`-length grid;
   *     entries at held indices are ignored. Pass anything (including
   *     the held reels' current visible rows). the engine doesn't read
   *     held columns.
   *   - `setAnticipation([...])` silently filters held indices.
   *   - `setStopDelays([...])` entries at held indices are ignored.
   *   - The resolved `SpinResult.symbols` is the full visible grid AFTER
   *     the spin lands. held reels contribute their unchanged rows,
   *     non-held reels contribute their landed rows.
   *   - No `spin:reelLanded` / `spin:stopping` event fires for held reels.
   *   - Big-symbol blocks crossing held into non-held reels are not
   *     supported. the engine doesn't reposition or reshape held reels
   *     to accommodate them. Author results that keep big symbols inside
   *     a contiguous run of non-held reels.
   *   - Indices outside `[0, reelCount)` and duplicate entries are silently
   *     filtered.
   */
  holdReels?: number[];
}

/** Timing and animation profile for a speed mode. */
export interface SpeedProfile {
  readonly name: string;
  /** Milliseconds between each reel starting to spin. */
  readonly spinDelay: number;
  /** Pixels per frame at full spin speed. */
  readonly spinSpeed: number;
  /** Milliseconds between each reel stopping. */
  readonly stopDelay: number;
  /** Milliseconds to hold anticipation phase. */
  readonly anticipationDelay: number;
  /** Pixels of overshoot when reel lands. */
  readonly bounceDistance: number;
  /** Milliseconds for bounce-back animation. */
  readonly bounceDuration: number;
  /** Optional GSAP ease string for acceleration. Default: 'power2.in'. */
  readonly accelerationEase?: string;
  /** Optional GSAP ease string for deceleration. Default: 'power2.out'. */
  readonly decelerationEase?: string;
  /** Milliseconds for acceleration phase. Default: 300. */
  readonly accelerationDuration?: number;
  /** Minimum spin time in ms before stop is allowed. Default: 500. */
  readonly minimumSpinTime?: number;
  /**
   * Optional per-speed tumble timing overrides. When the active speed
   * profile defines this, the cascade fall + drop-in phases merge these
   * fields over the base config registered via `.tumble(...)` at build
   * time. `setSpeed('turbo')` can shorten `fall.duration`,
   * `dropIn.duration`, per-row staggers, and the drop ease without the
   * caller maintaining a parallel `setTumble` API.
   *
   * Fields are deep-merged with `Partial` semantics: omitted fields fall
   * back to the base config. To suppress the cascade animation entirely
   * for a profile (the canonical "snap on turbo" pattern), set
   * `fall.duration: 0` and `dropIn.duration: 0`. both phases short-circuit
   * to their existing snap path.
   *
   * Phases capture the resolved config at `onEnter` time, so a `setSpeed`
   * call between two refills picks up the new timings on the next refill.
   * In-flight tweens keep their construction-time timings (mid-tween
   * mutation is not supported).
   */
  readonly tumble?: TumbleConfig;
}

/** Per-symbol configuration data. */
export interface SymbolData {
  /** Relative weight for random generation (higher = more frequent). */
  weight: number;
  /** Display layering order. Higher = in front. */
  zIndex?: number;
  /**
   * If true, the engine parents this symbol's view to
   * `viewport.unmaskedContainer` instead of the reel's masked container.
   * the symbol renders above the reel mask, useful for oversized win
   * animations (expanding wilds, splash frames) that should not be
   * clipped at the cell boundary.
   *
   * **Coordinate space:** when unmasked, the engine sets the view's X to
   * `reel.container.x` and adds `reel.container.y` to the view's Y so
   * the at-rest position matches the reel's grid cell.
   *
   * **Motion limitation:** `ReelMotion` writes `view.y` in reel-local
   * coordinates. While the reel is spinning, an unmasked symbol on the
   * strip will appear shifted vertically by the reel's offset (the
   * `reel.container.y` translation is only applied on activate, not on
   * every motion frame). Treat `unmask: true` as a *landed-state* flag.
   * it is correct at rest and during static frames, but not designed to
   * stay visually accurate while the reel is spinning. If you need a
   * mid-spin "stays visible above mask" overlay, use a cell pin instead.
   *
   * **Pyramid layouts not supported:** when any reel has a non-zero
   * `offsetY` (pyramid / trapezoid offsets), `motion.snapToGrid()` and
   * `motion.displace()` will write reel-local Y to the unmasked view.
   * shifting the rendered position by `reel.container.y`. The builder
   * throws at config time if both conditions are present. Use cell pins
   * for above-mask overlays on pyramid slots.
   *
   * **Mask-strategy auto-pick:** when any registered symbol sets
   * `unmask: true` and `symbolGap.x > 0`, the builder switches the
   * default `RectMaskStrategy` to `SharedRectMaskStrategy` so that
   * neighboring (masked) symbols don't get clipped at the column gap
   * next to the unmasked overlay. Passing `.maskStrategy(...)`
   * explicitly always wins. For symbols that need to overlap across
   * reel boundaries while unmasked, prefer `SharedRectMaskStrategy`.
   */
  unmask?: boolean;
  /**
   * Footprint in cells. Default `{ w: 1, h: 1 }`. When `w * h > 1` this
   * symbol is a "big symbol". at landing it occupies an `w × h` block of
   * cells anchored at the (col, row) where its id appears in the result.
   * Big-symbol registration is rejected on MultiWays slots.
   */
  size?: { w: number; h: number };
}

/** How to vertically align reels of differing pixel heights. */
export type ReelAnchor = 'top' | 'center' | 'bottom';

/**
 * MultiWays configuration knobs. Set via `builder.multiways({ ... })`.
 * mutually exclusive with big-symbol registration.
 */
export interface MultiWaysConfig {
  /** Minimum visible rows the server can request. Inclusive. */
  minRows: number;
  /** Maximum visible rows the server can request. Inclusive. */
  maxRows: number;
  /**
   * Pixel height of every reel box. Cell height per reel becomes
   * `reelPixelHeight / visibleRows[i]` after each reshape.
   */
  reelPixelHeight: number;
}

/** Configuration for the reel grid layout. */
export interface ReelGridConfig {
  /** Number of reel columns. */
  reelCount: number;
  /**
   * Default visible rows when all reels are uniform. Ignored if
   * `visibleRowsPerReel` is set.
   */
  visibleRows: number;
  /**
   * Per-reel row counts (static shape). Length MUST equal `reelCount`.
   * Example: `[3, 5, 5, 5, 3]` for a pyramid layout. Mutually exclusive
   * with the scalar `visibleRows` field at the builder level.
   */
  visibleRowsPerReel?: number[];
  /** Symbol width in pixels. */
  symbolWidth: number;
  /** Symbol height in pixels. Used as the SPIN-time uniform cell height. */
  symbolHeight: number;
  /**
   * Per-reel pixel-box heights. Length MUST equal `reelCount` when set.
   * For MultiWays: every entry is the same fixed reel height. For static
   * pyramids: defaults to `visibleRowsPerReel[i] * symbolHeight`.
   */
  reelPixelHeights?: number[];
  /**
   * How short reels align vertically inside the tallest reel's height.
   * Default: 'center'.
   */
  reelAnchor?: ReelAnchor;
  /** Gap between symbols. Default: { x: 0, y: 0 }. */
  symbolGap?: { x: number; y: number };
  /** Number of buffer symbols above and below the visible area. Default: 1. */
  bufferSymbols?: number;
  /**
   * MultiWays configuration. Set by `builder.multiways(...)`. When present:
   *   - `setShape(rowsPerReel)` becomes callable mid-spin
   *   - AdjustPhase is inserted between SPIN and STOP
   *   - big-symbol registration throws at build time
   */
  multiways?: MultiWaysConfig;
}

/** Extra symbols above/below config per reel. */
export interface ReelExtraSymbols {
  symbolsAbove: number;
  symbolsBelow: number;
}

/** Offset modes for X-axis symbol positioning. */
export type OffsetXMode = 'none' | 'trapezoid';

/** Trapezoid perspective configuration. */
export interface TrapezoidConfig {
  mode: 'trapezoid';
  widthDifference: number;
  topWidthFactor: number;
  bottomWidthFactor: number;
}

/** No offset configuration. */
export interface NoOffsetConfig {
  mode: 'none';
}

export type OffsetConfig = TrapezoidConfig | NoOffsetConfig;

/** 2D matrix type (reel × row). */
export type Matrix<T> = T[][];

/** Simple 2D position. */
export interface Position {
  x: number;
  y: number;
}

/**
 * Axis-aligned bounding box of a single grid cell in ReelSet-local
 * coordinates. Returned by `reelSet.getCellBounds(col, row)`.
 *
 * Use this to draw paylines, hit areas, debug overlays, or any graphic
 * that needs to align precisely with a visible symbol cell.
 */
export interface CellBounds {
  /** Left edge of the cell in ReelSet-local pixels. */
  x: number;
  /** Top edge of the cell in ReelSet-local pixels. */
  y: number;
  /** Cell width. equals the configured symbol width. */
  width: number;
  /** Cell height. equals the configured symbol height. */
  height: number;
}

/** A cell on the visible grid. `reelIndex` is the column; `rowIndex` is the row from the top. */
export interface SymbolPosition {
  reelIndex: number;
  rowIndex: number;
}

/**
 * One "win" as the presenter sees it: an ordered set of cells to highlight.
 *
 * Use cases collapse onto this one shape. whether those cells came from a
 * classic payline ("row 1 across all 5 reels"), a cascade pop ("this cluster
 * vanished"), a scatter splash, or a bonus reveal.
 *
 * The presenter's job is to **animate these cells**. Anything beyond that.
 * drawing a polyline, a cluster outline, a number popup, a sound cue. is
 * user-land code reacting to the `win:*` events. pixi-reels never draws wins.
 *
 * Order of `cells` matters when `WinPresenter.stagger > 0` (e.g. a
 * left-to-right sweep): cell N starts animating `stagger` ms after cell N-1.
 * Pass the cells in the order you want the sweep to run.
 */
export interface Win {
  /** Cells to highlight. Order matters when `stagger > 0`. */
  cells: ReadonlyArray<SymbolPosition>;
  /** Optional payout. used for the default value-desc sort. */
  value?: number;
  /** Optional tag for routing events to different handlers. */
  kind?: string;
  /** Optional stable id so event consumers can key per-win state. */
  id?: number;
}

/** Mask configuration for the reel viewport. */
export interface MaskConfig {
  mask: Container;
  position: Position;
}

/**
 * Resolved grid view used internally. every defaulted field is filled in,
 * but per-reel-shape and MultiWays extensions stay optional because they're
 * genuinely opt-in.
 */
export interface ResolvedReelGridConfig {
  reelCount: number;
  visibleRows: number;
  symbolWidth: number;
  symbolHeight: number;
  symbolGap: { x: number; y: number };
  bufferSymbols: number;
  visibleRowsPerReel?: number[];
  reelPixelHeights?: number[];
  reelAnchor: ReelAnchor;
  multiways?: MultiWaysConfig;
}

/** Full internal configuration assembled by the builder. */
export interface ReelSetInternalConfig {
  grid: ResolvedReelGridConfig;
  symbols: Record<string, SymbolData>;
  speeds: Map<string, SpeedProfile>;
  initialSpeed: string;
  offset: OffsetConfig;
  ticker: Ticker;
}
