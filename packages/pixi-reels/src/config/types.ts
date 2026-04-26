import type { Container, Ticker } from 'pixi.js';

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
}

/** Per-symbol configuration data. */
export interface SymbolData {
  /** Relative weight for random generation (higher = more frequent). */
  weight: number;
  /** Display layering order. Higher = in front. */
  zIndex?: number;
  /** If true, this symbol renders above the reel mask (for oversized animations). */
  unmask?: boolean;
  /**
   * Footprint in cells. Default `{ w: 1, h: 1 }`. When `w * h > 1` this
   * symbol is a "big symbol" — at landing it occupies an `w × h` block of
   * cells anchored at the (col, row) where its id appears in the result.
   * Big-symbol registration is rejected on Megaways slots.
   */
  size?: { w: number; h: number };
}

/** How to vertically align reels of differing pixel heights. */
export type ReelAnchor = 'top' | 'center' | 'bottom';

/**
 * Megaways configuration knobs. Set via `builder.megaways({ ... })` —
 * mutually exclusive with big-symbol registration.
 */
export interface MegawaysConfig {
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
   * For Megaways: every entry is the same fixed reel height. For static
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
   * Megaways configuration. Set by `builder.megaways(...)`. When present:
   *   - `setShape(rowsPerReel)` becomes callable mid-spin
   *   - AdjustPhase is inserted between SPIN and STOP
   *   - big-symbol registration throws at build time
   */
  megaways?: MegawaysConfig;
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
  /** Cell width — equals the configured symbol width. */
  width: number;
  /** Cell height — equals the configured symbol height. */
  height: number;
}

/**
 * A cell on the visible grid — `reelIndex` is the column, `rowIndex` the
 * row from the top. This is the canonical grid-cell shape used across
 * events (`win:symbol`, `spotlight:start`), `Spotlight.show`, and
 * `ClusterWin.cells`.
 *
 * Named `SymbolPosition` for back-compat with the original events module.
 */
export interface SymbolPosition {
  reelIndex: number;
  rowIndex: number;
}

/**
 * One "win" as the presenter sees it: an ordered set of cells to highlight.
 *
 * Use cases collapse onto this one shape — whether those cells came from a
 * classic payline ("row 1 across all 5 reels"), a cascade pop ("this cluster
 * vanished"), a scatter splash, or a bonus reveal.
 *
 * The presenter's job is to **animate these cells**. Anything beyond that —
 * drawing a polyline, a cluster outline, a number popup, a sound cue — is
 * user-land code reacting to the `win:*` events. pixi-reels never draws wins.
 *
 * Order of `cells` matters when `WinPresenter.stagger > 0` (e.g. a
 * left-to-right sweep): cell N starts animating `stagger` ms after cell N-1.
 * Pass the cells in the order you want the sweep to run.
 */
export interface Win {
  /** Cells to highlight. Order matters when `stagger > 0`. */
  cells: ReadonlyArray<SymbolPosition>;
  /** Optional payout — used for the default value-desc sort. */
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
 * Resolved grid view used internally — every defaulted field is filled in,
 * but per-reel-shape and Megaways extensions stay optional because they're
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
  megaways?: MegawaysConfig;
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
