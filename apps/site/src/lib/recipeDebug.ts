/**
 * The debug side of a mounted recipe: the events every bus on the stage
 * fires, a metrics recorder per reel set, and the overlay drawn on each set
 * when asked. Studio owns the one place this is shown; the docs pages hand
 * a demo over to Studio instead of drawing a downscaled copy beside it.
 */
import * as PIXI from 'pixi.js';
import type { Application } from 'pixi.js';
import { onNotice, ReelSet } from 'pixi-reels';
import { debugOverlay, SpinMetrics, type DebugOverlayHandle, type DebugOverlayLayer } from 'pixi-reels/debug';
import type { RecipeEventBus } from '@pixi-reels/kit';
import type { EventEntry } from '../components/EventsPanel';
import { ROW_LIMIT } from '../components/EventsPanel';

/**
 * The overlay's layers in the groups the debug bar toggles. Everything at once
 * buries the reels, so each group answers one question: `info` is what the
 * engine is doing and how long it took, `grid` is where the cells are, `motion`
 * is which way the strips travel and where they wrap, `bounds` is what each
 * symbol actually covers.
 */
export const LAYER_GROUPS = {
  info: ['hud', 'metrics', 'timeline'],
  grid: ['mask', 'cells', 'blocks', 'pins'],
  motion: ['axis', 'feed', 'buffers', 'thresholds'],
  bounds: ['bounds'],
} as const satisfies Record<string, readonly DebugOverlayLayer[]>;
export type LayerGroup = keyof typeof LAYER_GROUPS;
export const DEFAULT_GROUPS: readonly LayerGroup[] = ['info', 'grid'];

export function layersFor(groups: readonly LayerGroup[]): DebugOverlayLayer[] {
  return groups.flatMap((g) => [...LAYER_GROUPS[g]]);
}

/**
 * Every `ReelSet` currently on the stage, `primary` first.
 *
 * A recipe returns at most ONE set (the rest it parents itself, usually under
 * a `stage` composition root), so an overlay driven off the returned one
 * would leave a banner strip or a second grid bare. Walking the display tree
 * finds them whatever the recipe did with them.
 */
export function collectReelSets(stage: PIXI.Container, primary: ReelSet | null): ReelSet[] {
  const found: ReelSet[] = primary ? [primary] : [];
  const walk = (node: PIXI.Container): void => {
    if (node instanceof ReelSet) {
      if (!found.includes(node)) found.push(node);
      // A set's own children are reels and viewports; sets never nest.
      return;
    }
    for (const child of node.children) walk(child as PIXI.Container);
  };
  walk(stage);
  return found;
}

export interface RecipeDebugTarget {
  app: Application;
  reelSet: ReelSet | null;
  board?: RecipeEventBus | null;
}

/**
 * Where a set's overlay should draw so the recipe cannot clip it. A recipe
 * that puts its board in a camera window or a frame (a mask on an ancestor)
 * would cut off the panels under the reels; the overlay then draws into the
 * recipe's root, the top of the set's branch under the stage, and follows the
 * set from there. Without such a mask it stays on the set.
 */
function unclippedHost(stage: PIXI.Container, rs: ReelSet): PIXI.Container | undefined {
  let clipped = false;
  let top: PIXI.Container = rs;
  for (let c = rs.parent; c && c !== stage; c = c.parent) {
    if (c.mask) clipped = true;
    top = c;
  }
  return clipped ? top : undefined;
}

export interface RecipeDebugHandle {
  /** The recorded events, oldest first, capped at the panel's row limit. */
  readonly entries: readonly EventEntry[];
  /** The sets the overlay would draw on. */
  readonly sets: readonly ReelSet[];
  /** Draw the overlay with these layer groups, or redraw it with new ones. */
  showOverlay(groups: readonly LayerGroup[]): void;
  hideOverlay(): void;
  clearEvents(): void;
  /** Stop recording, drop the overlay and the metrics. The sets are not touched. */
  detach(): void;
}

/**
 * Record every bus in the demo and keep a metrics recorder per set from the
 * moment the recipe mounts, so the timeline shows the spin that made you
 * reach for the debug button. `onChange` fires at most once per animation
 * frame with new rows, so a burst of `symbol:created` is one re-render.
 */
export function attachRecipeDebug(target: RecipeDebugTarget, onChange: () => void): RecipeDebugHandle {
  const { app } = target;
  const entries: EventEntry[] = [];
  const metrics = new Map<ReelSet, SpinMetrics>();
  const unsubscribe: Array<() => void> = [];
  let overlays: DebugOverlayHandle[] = [];
  let spinOrigin: number | null = null;
  let nextId = 0;
  let dirty = false;
  let frame: number | null = null;

  const record = (source: string) => (event: string, ...args: unknown[]): void => {
    const now = performance.now();
    if (event === 'spin:start') {
      // A board starts its cells within the same burst: keep one origin.
      if (spinOrigin === null || now - spinOrigin > 100) spinOrigin = now;
    }
    entries.push({ id: ++nextId, t: now, rel: spinOrigin === null ? null : now - spinOrigin, source, name: event, args });
    if (entries.length > ROW_LIMIT) entries.splice(0, entries.length - ROW_LIMIT);
    dirty = true;
    if (frame === null) {
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!dirty) return;
        dirty = false;
        onChange();
      });
    }
  };
  const listen = (bus: RecipeEventBus, source: string): void => {
    const fn = record(source);
    bus.onAny(fn);
    unsubscribe.push(() => bus.offAny(fn));
  };

  const sets = collectReelSets(app.stage, target.reelSet);
  for (const rs of sets) metrics.set(rs, new SpinMetrics(rs, { ticker: app.ticker }));
  sets.forEach((rs, k) => {
    const setLabel = sets.length === 1 ? 'set' : `set${k}`;
    listen(rs.events as unknown as RecipeEventBus, setLabel);
    // A growing set (`addReels`, `expand`) adds reels after mount: follow
    // them, and let go of each one's bus when it is removed.
    const reelOff: Array<() => void> = [];
    const listenReel = (i: number): void => {
      const bus = rs.reels[i].events as unknown as RecipeEventBus;
      const fn = record(sets.length === 1 ? `reel ${i}` : `${setLabel}/r${i}`);
      bus.onAny(fn);
      reelOff[i] = () => bus.offAny(fn);
    };
    rs.reels.forEach((_, i) => listenReel(i));
    const onAdded = ({ from, count }: { from: number; count: number }): void => {
      for (let i = from; i < from + count; i++) listenReel(i);
    };
    const onRemoved = ({ from }: { from: number }): void => {
      for (const off of reelOff.splice(from)) off();
    };
    rs.events.on('reels:added', onAdded);
    rs.events.on('reels:removed', onRemoved);
    unsubscribe.push(() => {
      rs.events.off('reels:added', onAdded);
      rs.events.off('reels:removed', onRemoved);
      for (const off of reelOff) off();
    });
  });
  if (target.board) listen(target.board, 'board');
  unsubscribe.push(onNotice((n) => record('notice')(n.code, { kind: n.kind, message: n.message, detail: n.detail })));

  const hideOverlay = (): void => {
    for (const o of overlays) {
      try { o.destroy(); } catch { /* the set may be gone already */ }
    }
    overlays = [];
  };

  return {
    entries,
    sets,
    showOverlay(groups) {
      if (overlays.length) {
        for (const o of overlays) o.setLayers(layersFor(groups));
        return;
      }
      // `live` drives the bounds / blocks / pins / info layers off the
      // recipe's own app.ticker, so they track a spin instead of freezing on
      // the frame the overlay happened to be built in.
      overlays = sets.map((rs) =>
        debugOverlay(rs, {
          layers: layersFor(groups),
          live: true,
          ticker: app.ticker,
          metrics: metrics.get(rs),
          host: unclippedHost(app.stage, rs),
        }),
      );
    },
    hideOverlay,
    clearEvents() {
      entries.length = 0;
      onChange();
    },
    detach() {
      for (const off of unsubscribe) {
        try { off(); } catch { /* ignore */ }
      }
      unsubscribe.length = 0;
      if (frame !== null) cancelAnimationFrame(frame);
      // Before the sets: the overlay is a child of the ReelSet and holds a
      // TickerRef on app.ticker.
      hideOverlay();
      for (const m of metrics.values()) m.destroy();
      metrics.clear();
    },
  };
}
