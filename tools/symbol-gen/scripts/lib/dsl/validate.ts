import type { AnimationIR } from './types';

/**
 * Brief-derived rules for slot symbols:
 *
 *   - idle / win / landing must share the same frame-0 pose:
 *       root.scale = (1, 1), root.translate = (0, 0)
 *       icon.scale = (1, 1), icon.translate = (0, 0), icon.rotate = 0
 *       frame.rgba = ffffffff, icon.rgba = ffffffff
 *   - if loop is true, the last keyframe of every property must equal the first
 *     (so playback wraps without a pop)
 *   - destroy must end with both frame.rgba and icon.rgba alpha = 00
 *
 * Default behavior: warn and continue. Pass { strict: true } to throw instead.
 */

export type ValidateOpts = { strict?: boolean };

const EPS = 1e-6;

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

function checkSetupReturn<T extends { time: number }>(
  issues: string[],
  animName: string,
  scope: string,
  track: string,
  keys: T[],
  eq: (a: T, b: T) => boolean,
): void {
  if (keys.length < 2) return;
  const first = firstKey(keys);
  const last = lastKey(keys);
  if (!first || !last || first === last) return;
  if (!eq(first, last)) {
    issues.push(`[${animName}] ${scope} ${track} must return to its frame-0 value at the end; got first=${JSON.stringify(first)} last=${JSON.stringify(last)}`);
  }
}

function lastKey<T extends { time: number }>(keys: T[]): T | undefined {
  if (keys.length === 0) return undefined;
  let best = keys[0]!;
  for (const k of keys) if (k.time > best.time) best = k;
  return best;
}

function firstKey<T extends { time: number }>(keys: T[]): T | undefined {
  if (keys.length === 0) return undefined;
  let best = keys[0]!;
  for (const k of keys) if (k.time < best.time) best = k;
  return best;
}

export function validate(anim: AnimationIR, opts: ValidateOpts = {}): string[] {
  const issues: string[] = [];

  // ── frame-0 base pose for shared-pose animations ────────────────
  if (anim.name === 'idle' || anim.name === 'win' || anim.name === 'landing') {
    // root bone (whole-tile transform)
    const root = anim.bones.get('root');
    if (root) {
      const sk0 = firstKey(root.scale);
      if (sk0 && (!approx(sk0.time, 0) || !approx(sk0.x, 1) || !approx(sk0.y, 1))) {
        issues.push(`[${anim.name}] root.scale frame-0 must be (1, 1) if present; got t=${sk0.time.toFixed(3)} (${sk0.x}, ${sk0.y})`);
      }
      const tk0 = firstKey(root.translate);
      if (tk0 && (!approx(tk0.time, 0) || !approx(tk0.x, 0) || !approx(tk0.y, 0))) {
        issues.push(`[${anim.name}] root.translate frame-0 must be (0, 0) if present; got t=${tk0.time.toFixed(3)} (${tk0.x}, ${tk0.y})`);
      }
    }

    // icon bone (glyph-only transform, used by idle)
    const icon = anim.bones.get('icon');
    if (icon) {
      const sk0 = firstKey(icon.scale);
      if (sk0 && (!approx(sk0.time, 0) || !approx(sk0.x, 1) || !approx(sk0.y, 1))) {
        issues.push(`[${anim.name}] icon.scale frame-0 must be (1, 1) if present; got t=${sk0.time.toFixed(3)} (${sk0.x}, ${sk0.y})`);
      }
      const tk0 = firstKey(icon.translate);
      if (tk0 && (!approx(tk0.time, 0) || !approx(tk0.x, 0) || !approx(tk0.y, 0))) {
        issues.push(`[${anim.name}] icon.translate frame-0 must be (0, 0) if present; got t=${tk0.time.toFixed(3)} (${tk0.x}, ${tk0.y})`);
      }
      const rk0 = firstKey(icon.rotate);
      if (rk0 && (!approx(rk0.time, 0) || !approx(rk0.angle, 0))) {
        issues.push(`[${anim.name}] icon.rotate frame-0 must be 0 if present; got t=${rk0.time.toFixed(3)} ${rk0.angle}`);
      }
    }

    // slot rgba: both frame and icon should start at white if keyed
    for (const slotName of ['frame', 'icon'] as const) {
      const slot = anim.slots.get(slotName);
      if (!slot) continue;
      const ck0 = firstKey(slot.rgba);
      if (ck0 && (!approx(ck0.time, 0) || ck0.color.toLowerCase() !== 'ffffffff')) {
        issues.push(`[${anim.name}] ${slotName}.rgba frame-0 must be 'ffffffff' if present; got t=${ck0.time.toFixed(3)} '${ck0.color}'`);
      }
    }

    // ── end-of-animation == start-of-animation (setup pose) ──────
    // The user-stated rule for non-destroy anims: every property's
    // last keyframe must equal its first. This is stricter than the
    // loop-seam check (which only fires for `loop: true`) so it also
    // catches one-shot landing/win that drift from setup at the end.
    for (const [boneName, bone] of anim.bones) {
      checkSetupReturn(issues, anim.name, `bone '${boneName}'`, 'scale', bone.scale, (a, b) => approx(a.x, b.x) && approx(a.y, b.y));
      checkSetupReturn(issues, anim.name, `bone '${boneName}'`, 'translate', bone.translate, (a, b) => approx(a.x, b.x) && approx(a.y, b.y));
      checkSetupReturn(issues, anim.name, `bone '${boneName}'`, 'rotate', bone.rotate, (a, b) => approx(a.angle, b.angle));
    }
    for (const [slotName, slot] of anim.slots) {
      checkSetupReturn(issues, anim.name, `slot '${slotName}'`, 'rgba', slot.rgba, (a, b) => a.color.toLowerCase() === b.color.toLowerCase());
    }
  }

  // ── loop seam: first key == last key on every property ──────────
  if (anim.loop) {
    for (const [boneName, bone] of anim.bones) {
      const checkPair = (track: string, first: any, last: any, eq: (a: any, b: any) => boolean) => {
        if (!first || !last || first === last) return;
        if (!eq(first, last)) {
          issues.push(`[${anim.name}] loop seam mismatch on bone '${boneName}' ${track}: first=${JSON.stringify(first)} last=${JSON.stringify(last)}`);
        }
      };
      checkPair('scale', firstKey(bone.scale), lastKey(bone.scale),
        (a, b) => approx(a.x, b.x) && approx(a.y, b.y));
      checkPair('translate', firstKey(bone.translate), lastKey(bone.translate),
        (a, b) => approx(a.x, b.x) && approx(a.y, b.y));
      checkPair('rotate', firstKey(bone.rotate), lastKey(bone.rotate),
        (a, b) => approx(a.angle, b.angle));
    }
    for (const [slotName, slot] of anim.slots) {
      const fr = firstKey(slot.rgba);
      const lr = lastKey(slot.rgba);
      if (fr && lr && fr !== lr && fr.color.toLowerCase() !== lr.color.toLowerCase()) {
        issues.push(`[${anim.name}] loop seam mismatch on slot '${slotName}' rgba: first='${fr.color}' last='${lr.color}'`);
      }
    }
  }

  // ── destroy ends transparent (both frame and icon) ──────────────
  if (anim.name === 'destroy') {
    for (const slotName of ['frame', 'icon'] as const) {
      const slot = anim.slots.get(slotName);
      const last = slot ? lastKey(slot.rgba) : undefined;
      if (!last) {
        issues.push(`[destroy] missing ${slotName}.rgba timeline; final frame must be fully transparent`);
        continue;
      }
      const alpha = last.color.slice(-2).toLowerCase();
      if (alpha !== '00') {
        issues.push(`[destroy] last ${slotName}.rgba must end with alpha '00'; got '${last.color}' (alpha '${alpha}')`);
      }
    }
  }

  // ── report ──────────────────────────────────────────────────────
  if (issues.length > 0) {
    if (opts.strict) {
      throw new Error('Animation validation failed:\n  ' + issues.join('\n  '));
    } else {
      for (const m of issues) console.warn('warn: ' + m);
    }
  }

  return issues;
}
