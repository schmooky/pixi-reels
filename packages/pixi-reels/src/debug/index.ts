// The debug subpath. Everything here draws with `pixi-silk`, an optional peer
// dependency: importing `pixi-reels/debug` is what opts a build into it, and a
// build that never does pays nothing for it. The data-only helpers
// (`debugSnapshot`, `debugGrid`, the frame recorder, `enableDebug`) stay in the
// main entry, since the testing harness and a headless agent need them without
// a renderer.

export { debugOverlay, OVERLAY_LABEL } from './debugOverlay.js';
export type {
  DebugOverlayLayer,
  DebugOverlayOptions,
  DebugOverlayHandle,
  DebugOverlaySnapshot,
  DebugOverlayReelInfo,
} from './debugOverlay.js';

export { DebugPlaque, DEBUG_FONT } from './DebugPlaque.js';
export { WinLines } from './WinLines.js';
export type { WinLineStyle, WinLinesOptions } from './WinLines.js';
export { roundRectPath } from './roundRectPath.js';
export type { DebugPlaqueOptions, DebugPlaqueRow } from './DebugPlaque.js';

export { SpinMetrics } from './SpinMetrics.js';
export type {
  SpinMetricsOptions,
  SpinMetricsSnapshot,
  DebugMetricsTotals,
  DebugRound,
  DebugReelRound,
  DebugPhaseSpan,
  DebugSkipMark,
} from './SpinMetrics.js';
