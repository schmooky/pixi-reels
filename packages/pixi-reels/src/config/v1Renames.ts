/**
 * The v1 -> v2 rename table (ADR 016 section 5), in one place.
 *
 * Two consumers read it: the builder's fail-loud guards below, and the
 * `pixi-reels-codemod` transform. Keeping one table is the only way the
 * codemod and the error messages cannot drift apart.
 *
 * Per CLAUDE.md's fail-loud rule there are **no deprecated aliases**. A v1
 * name either fails to compile or throws with the line below; it never
 * quietly means something subtly different.
 */

export const CODEMOD_HINT = 'run npx pixi-reels-codemod v1-to-v2';

/** Renamed `ReelSetBuilder` methods. The v1 name throws on call. */
export const V1_BUILDER_METHODS: Readonly<Record<string, string>> = {
  visibleRows: 'visibleCells',
  visibleRowsPerReel: 'visibleCellsPerReel',
  reelPixelHeights: 'reelExtents',
};

/** Renamed keys inside builder option objects, grouped by the option they belong to. */
export const V1_OPTION_KEYS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'bufferSymbols()': { above: 'start', below: 'end' },
  'multiways()': {
    minRows: 'minCells',
    maxRows: 'maxCells',
    reelPixelHeight: 'reelExtent',
  },
  'symbolData() size': { w: 'reels', h: 'cells' },
  'tumble() fall/dropIn': { rowStagger: 'cellStagger', rowOrder: 'cellOrder' },
  'offset() trapezoid': { topWidthFactor: 'startFactor', bottomWidthFactor: 'endFactor' },
  'initialFrame() / setResult() column': {
    bufferAbove: 'bufferStart',
    bufferBelow: 'bufferEnd',
  },
};

/** Renamed string-literal values, grouped by the option that carries them. */
export const V1_OPTION_VALUES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'reelAnchor()': { top: 'start', bottom: 'end' },
  'tumble() cellOrder': { bottomToTop: 'endFirst', topToBottom: 'startFirst' },
  'nudge() direction': { down: 'forward', up: 'reverse' },
};

/** Build the standard "X was renamed to Y" message for a single name. */
export function renamedMessage(context: string, v1: string, v2: string): string {
  return `${context}: '${v1}' was renamed to '${v2}' in v2; ${CODEMOD_HINT}.`;
}

/**
 * Throw if `value` carries any v1 key from `map`. `context` names the public
 * API surface so the message points at the caller's own call, not at engine
 * internals.
 */
export function assertNoV1Keys(
  value: unknown,
  map: Readonly<Record<string, string>>,
  context: string,
): void {
  if (!value || typeof value !== 'object') return;
  for (const [v1, v2] of Object.entries(map)) {
    if (v1 in (value as Record<string, unknown>)) {
      throw new Error(renamedMessage(context, v1, v2));
    }
  }
}

/** Throw if `value` is a v1 string-literal option value. */
export function assertNoV1Value(
  value: unknown,
  map: Readonly<Record<string, string>>,
  context: string,
): void {
  if (typeof value !== 'string') return;
  const v2 = map[value];
  if (v2 !== undefined) {
    throw new Error(renamedMessage(context, value, v2));
  }
}
