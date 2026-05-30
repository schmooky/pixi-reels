import { Graphics } from 'pixi.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { Reel } from '../core/Reel.js';

/**
 * Debug snapshot. plain JSON representation of the entire reel state.
 *
 * Designed for AI agents that cannot see the canvas.
 * Returns no PixiJS display objects, only serializable data.
 *
 * **Breaking note (since v0.3):** `visibleRows` is now `number[]` (one entry
 * per reel) so jagged shapes (pyramids, MultiWays) are representable. For
 * uniform slots every entry is the same value. Adapt downstream code that
 * deep-reads the snapshot.
 */
export interface DebugSnapshot {
  timestamp: number;
  isSpinning: boolean;
  currentSpeed: string;
  availableSpeeds: string[];
  spotlightActive: boolean;
  reelCount: number;
  visibleRows: number[];
  reels: DebugReelSnapshot[];
  grid: string[][];
}

export interface DebugReelSnapshot {
  index: number;
  speed: number;
  isStopping: boolean;
  allSymbols: { row: number; symbolId: string; y: number }[];
  visibleSymbols: string[];
}

/**
 * Take a plain-JSON snapshot of the entire reel set state.
 *
 * This is the primary debugging tool for AI agents. The output is
 * a serializable object with no circular references, no PixiJS types.
 *
 * ```ts
 * const state = debugSnapshot(reelSet);
 * console.log(JSON.stringify(state, null, 2));
 * ```
 */
export function debugSnapshot(reelSet: ReelSet): DebugSnapshot {
  const reels = reelSet.reels;
  const reelSnapshots: DebugReelSnapshot[] = reels.map((reel: Reel, i: number) => ({
    index: i,
    speed: reel.speed,
    isStopping: reel.isStopping,
    allSymbols: reel.symbols.map((s, row) => ({
      row,
      symbolId: s.symbolId,
      y: Math.round(s.view.y),
    })),
    visibleSymbols: reel.getVisibleSymbols(),
  }));

  // Build the visual grid (what a player would see). Uses the ReelSet
  // resolver so cross-reel OCCUPIED cells of a big-symbol block render as
  // the anchor's id, not as the OCCUPIED sentinel.
  const grid: string[][] = reelSet.getVisibleGrid();

  return {
    timestamp: Date.now(),
    isSpinning: reelSet.isSpinning,
    currentSpeed: reelSet.speed.activeName,
    availableSpeeds: reelSet.speed.profileNames,
    spotlightActive: reelSet.spotlight.isActive,
    reelCount: reels.length,
    visibleRows: reels.map((r) => r.visibleRows),
    reels: reelSnapshots,
    grid,
  };
}

/**
 * Pretty-print the grid as an ASCII table.
 *
 * ```
 * ┌────────┬────────┬────────┬────────┬────────┐
 * │ cherry │ lemon  │ bar    │ seven  │ cherry │
 * │ plum   │ cherry │ wild   │ lemon  │ orange │
 * │ orange │ bell   │ cherry │ plum   │ bell   │
 * └────────┴────────┴────────┴────────┴────────┘
 * ```
 */
export function debugGrid(reelSet: ReelSet): string {
  const snap = debugSnapshot(reelSet);
  const { grid, visibleRows } = snap;
  if (grid.length === 0) return '(empty grid)';

  const colWidth = 8;
  const maxRows = Math.max(...visibleRows);
  const pad = (s: string) => s.slice(0, colWidth).padEnd(colWidth);
  const empty = ' '.repeat(colWidth);

  const border = (left: string, mid: string, right: string) =>
    left + grid.map(() => '─'.repeat(colWidth)).join(mid) + right;

  const lines: string[] = [];
  lines.push(border('┌', '┬', '┐'));

  for (let row = 0; row < maxRows; row++) {
    const cells = grid.map((col, i) => (row < visibleRows[i] ? pad(col[row] ?? '?') : empty));
    lines.push('│' + cells.join('│') + '│');
  }

  lines.push(border('└', '┴', '┘'));
  return lines.join('\n');
}

/**
 * One captured frame from `startRecording()`. a `DebugSnapshot` plus the
 * tag the recording was started with and the spin event that triggered
 * the capture.
 */
export interface RecordedFrame {
  /** Recording tag at the time of capture. Useful for grouping multiple sessions. */
  tag: string;
  /** Reel-set event that triggered the capture (`spin:start`, `spin:allLanded`, etc). */
  trigger: string;
  /** Snapshot of `debugSnapshot(reelSet)` at the moment of capture. */
  snapshot: DebugSnapshot;
}

/**
 * Default upper bound on `_recordedFrames` length. When the buffer fills,
 * the oldest entries are dropped (rolling window). Override per session
 * via `startRecording(reelSet, tag, { maxFrames })`. A long-running debug
 * session in a browser would otherwise grow the array forever.
 */
const DEFAULT_MAX_FRAMES = 1000;

/** All captured frames across all recording sessions in this process. */
const _recordedFrames: RecordedFrame[] = [];

/** Effective per-process cap. Updated when a session starts with a higher value. */
let _maxFrames = DEFAULT_MAX_FRAMES;

/**
 * Per-recording-session state: which events to listen on and how to
 * detach them later. Keyed by the `ReelSet` so two reel sets in the
 * same page can each record independently.
 */
const _recorders = new WeakMap<ReelSet, () => void>();

/** Options for {@link startRecording}. */
export interface StartRecordingOptions {
  /**
   * Maximum number of frames retained across the whole process. When the
   * buffer is full the oldest frames are dropped. Default 1000.
   */
  maxFrames?: number;
}

/**
 * Start recording the reel-set's frame state at every key spin event
 * (`spin:start`, `spin:reelLanded`, `spin:allLanded`, `spin:complete`).
 * Each event captures a `DebugSnapshot` and pushes it onto a process-
 * wide rolling log readable via {@link getFrames}.
 *
 * The `tag` is freeform. use it to label multiple recording sessions
 * so you can filter `getFrames(tag)` later. Call {@link stopRecording}
 * to detach the listeners (also fires automatically when the reel set
 * emits `'destroyed'`).
 *
 * Designed for AI agents and debug harnesses. Calling `startRecording`
 * twice on the same `reelSet` replaces the prior recording (the previous
 * tag's listeners are removed before the new ones attach).
 *
 * ```ts
 * import { startRecording, stopRecording, getFrames } from 'pixi-reels';
 *
 * startRecording(reelSet, 'spin-1');
 * await reelSet.spin();
 * stopRecording(reelSet);
 * const frames = getFrames('spin-1'); // every snapshot tagged 'spin-1'
 * ```
 */
export function startRecording(
  reelSet: ReelSet,
  tag = 'default',
  options: StartRecordingOptions = {},
): void {
  // Detach any prior recorder on this reel set first.
  stopRecording(reelSet);

  if (options.maxFrames !== undefined && options.maxFrames > 0) {
    _maxFrames = options.maxFrames;
  }

  const capture = (trigger: string): void => {
    _recordedFrames.push({ tag, trigger, snapshot: debugSnapshot(reelSet) });
    // Rolling window: drop oldest when over cap.
    if (_recordedFrames.length > _maxFrames) {
      _recordedFrames.splice(0, _recordedFrames.length - _maxFrames);
    }
  };

  const onStart = () => capture('spin:start');
  const onReelLanded = () => capture('spin:reelLanded');
  const onAllLanded = () => capture('spin:allLanded');
  const onComplete = () => capture('spin:complete');
  // Auto-detach when the reel set is destroyed. otherwise listeners hang
  // off a dead emitter and the WeakMap entry can't drop until GC.
  const onDestroyed = () => stopRecording(reelSet);

  reelSet.events.on('spin:start', onStart);
  reelSet.events.on('spin:reelLanded', onReelLanded);
  reelSet.events.on('spin:allLanded', onAllLanded);
  reelSet.events.on('spin:complete', onComplete);
  reelSet.events.on('destroyed', onDestroyed);

  _recorders.set(reelSet, () => {
    reelSet.events.off('spin:start', onStart);
    reelSet.events.off('spin:reelLanded', onReelLanded);
    reelSet.events.off('spin:allLanded', onAllLanded);
    reelSet.events.off('spin:complete', onComplete);
    reelSet.events.off('destroyed', onDestroyed);
  });
}

/** Detach the recorder previously installed by {@link startRecording}. No-op if none. */
export function stopRecording(reelSet: ReelSet): void {
  const detach = _recorders.get(reelSet);
  if (detach) {
    detach();
    _recorders.delete(reelSet);
  }
}

/**
 * All recorded frames in capture order. When `tag` is provided, only
 * frames tagged with it are returned. Frames are not cleared between
 * recording sessions. call {@link clearFrames} to reset.
 */
export function getFrames(tag?: string): readonly RecordedFrame[] {
  if (tag === undefined) return _recordedFrames.slice();
  return _recordedFrames.filter((f) => f.tag === tag);
}

/** Empty the global recording log. */
export function clearFrames(): void {
  _recordedFrames.length = 0;
}

/**
 * Enable debug mode: attaches debug utilities to `window.__PIXI_REELS_DEBUG`.
 *
 * After calling this, an AI agent can run in the browser console:
 * ```js
 * __PIXI_REELS_DEBUG.snapshot()  // full state JSON
 * __PIXI_REELS_DEBUG.grid()      // ASCII grid
 * __PIXI_REELS_DEBUG.log()       // console.log the grid
 * __PIXI_REELS_DEBUG.startRecording('myTag')
 * __PIXI_REELS_DEBUG.stopRecording()
 * __PIXI_REELS_DEBUG.getFrames('myTag')
 * ```
 *
 * For a single reel set, leave `key` unset. With multiple reel sets, pass a
 * distinct `key` per call so they don't clobber each other on `window`: each is
 * reachable at `__PIXI_REELS_DEBUG_INSTANCES[key]`, and `__PIXI_REELS_DEBUG`
 * always points at the most recently enabled one for convenience.
 *
 * This attaches to `window` and logs — call it only in dev/QA builds, never in
 * a production bundle (the snapshot exposes internal state and is not
 * semver-protected, so do not wire monitoring/telemetry to it).
 */
export function enableDebug(reelSet: ReelSet, key?: string): void {
  if (typeof window === 'undefined') return;

  let maskOverlay: Graphics | null = null;

  const debug = {
    reelSet,
    snapshot: () => debugSnapshot(reelSet),
    grid: () => debugGrid(reelSet),
    log: () => {
      const snap = debugSnapshot(reelSet);
      console.log(`[pixi-reels debug] spinning=${snap.isSpinning} speed=${snap.currentSpeed}`);
      console.log(debugGrid(reelSet));
      return snap;
    },
    /** Log every event as it happens */
    trace: () => {
      const events = [
        'spin:start', 'spin:allStarted', 'spin:stopping',
        'spin:reelLanded', 'spin:allLanded', 'spin:complete',
        'skip:requested', 'skip:completed', 'speed:changed',
        'spotlight:start', 'spotlight:end',
        'shape:changed', 'adjust:start', 'adjust:complete',
        'pin:placed', 'pin:moved', 'pin:expired', 'pin:migrated',
        'destroyed',
      ] as const;
      for (const event of events) {
        reelSet.events.on(event as any, (...args: any[]) => {
          console.log(`[pixi-reels] ${event}`, ...args);
        });
      }
      console.log('[pixi-reels debug] tracing enabled for all events');
    },
    /** Start a frame-state recording session on this reel set. */
    startRecording: (tag = 'default', options?: StartRecordingOptions) =>
      startRecording(reelSet, tag, options),
    /** Stop a recording session. paired with `startRecording`. */
    stopRecording: () => stopRecording(reelSet),
    /** Pull recorded frames; pass `tag` to filter to one session. */
    getFrames: (tag?: string) => getFrames(tag),
    /** Empty the global recording log. */
    clearFrames: () => clearFrames(),
    /**
     * Toggle a debug overlay on the unmasked container that visualizes the
     * mask shape and per-reel boxes. Useful for spotting pyramid peek and
     * confirming MultiWays box geometry.
     */
    showMask: (enabled: boolean) => {
      if (enabled) {
        if (maskOverlay) return;
        const g = new Graphics();
        g.rect(0, 0, reelSet.viewport.maskWidth, reelSet.viewport.maskHeight)
          .fill({ color: 0xff0000, alpha: 0.15 });
        for (const rect of reelSet.viewport.maskRects) {
          g.rect(rect.x, rect.y, rect.width, rect.height)
            .stroke({ color: 0x00ff00, width: 2 });
        }
        reelSet.viewport.unmaskedContainer.addChild(g);
        maskOverlay = g;
      } else if (maskOverlay) {
        reelSet.viewport.unmaskedContainer.removeChild(maskOverlay);
        maskOverlay.destroy();
        maskOverlay = null;
      }
    },
  };

  const w = window as unknown as {
    __PIXI_REELS_DEBUG?: typeof debug;
    __PIXI_REELS_DEBUG_INSTANCES?: Record<string, typeof debug>;
  };
  // Per-instance registry so multiple reel sets don't overwrite one another.
  const registry = (w.__PIXI_REELS_DEBUG_INSTANCES ??= {});
  const resolvedKey = key ?? `reelset_${Object.keys(registry).length}`;
  registry[resolvedKey] = debug;
  // Back-compat: the bare global points at the most recently enabled instance.
  w.__PIXI_REELS_DEBUG = debug;
  console.log(
    `[pixi-reels] Debug mode enabled (key "${resolvedKey}"). ` +
      `Use __PIXI_REELS_DEBUG.log() or __PIXI_REELS_DEBUG_INSTANCES["${resolvedKey}"].`,
  );
}
