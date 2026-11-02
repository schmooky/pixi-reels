import { SilkGraphics } from 'pixi-silk';
import { DebugPlaque, type DebugPlaqueOptions } from 'pixi-reels/debug';

/**
 * The explanation layer of a recipe: the plaques and outlines a demo draws
 * to say what it is doing. They are not part of the mechanic, so a host can
 * switch them all off at once (Studio does, by default) and the recipe code
 * does not change: `readout.plaque(...)` still hands back a `DebugPlaque`
 * the recipe can position, retext and destroy, it just does not draw.
 *
 * Off means invisible, not absent: an invisible display object adds nothing
 * to a parent's local bounds, so a host that fits its camera to the content
 * sees the same frame it would without the plaques.
 */
let enabled = true;

/** Show or hide every readout built from now on. A host call, not a recipe one. */
export function setReadouts(on: boolean): void {
  enabled = on;
}

/** Whether readouts are drawn. */
export function readoutsEnabled(): boolean {
  return enabled;
}

export const readout = {
  /** Text on a plate. The same `DebugPlaque` the debug overlay draws with. */
  plaque(options: DebugPlaqueOptions = {}): DebugPlaque {
    const plaque = new DebugPlaque(options);
    if (!enabled) plaque.visible = false;
    return plaque;
  },
  /**
   * Lines, outlines, paylines and charts. `SilkGraphics` (pixi-silk) has the
   * `Graphics` drawing API with exact anti-aliased edges and shader dashes.
   */
  graphics(): SilkGraphics {
    const g = new SilkGraphics();
    if (!enabled) g.visible = false;
    return g;
  },
};
