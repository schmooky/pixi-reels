import { compile, validate } from '../lib/dsl';
import { idle } from './idle';
import { win } from './win';
import { landing } from './landing';
import { destroy } from './destroy';

const ALL = [idle, win, landing, destroy];

/**
 * Validates all animations (warn-by-default) and returns them
 * compiled to Spine JSON, keyed by animation name.
 */
export function getCompiledAnimations(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of ALL) {
    validate(a); // warn-only by default; pass { strict: true } to throw
    out[a.name] = compile(a);
  }
  return out;
}
