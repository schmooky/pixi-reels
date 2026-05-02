import { anim, frames } from '../lib/dsl';

/**
 * 333ms (20 frames) reel-stop landing — soft, isotropic, no jiggle.
 *
 * Acts on the icon bone ONLY (frame/border stays perfectly still). The
 * old anisotropic squash-and-stretch (1.04 x 0.96 -> 1.18 x 0.78) read
 * as a wobble on a flat glyph; replaced with a single gentle scale dip
 * + ease-out settle. No translate, no anisotropy, no overshoot beyond
 * what the easing produces naturally.
 */
export const landing = anim('landing')
  // Hold root at baseline across the whole landing. Destroy ends at
  // root.scale 1.55; without these keys, a destroy -> landing handoff
  // would land at 1.55 scale and only get reset when idle takes over.
  // With these keys, the END of landing on EVERY animatable property
  // exactly matches the START of idle.
  .bone('root', (b) => b
    .scale(1.0)
    .scaleTo(1.0, frames(20))
    .rotate(0)
    .rotateTo(0, frames(20))
  )
  .bone('icon', (b) => b
    .translate(0, 0)
    .translateTo(0, 0, frames(20))
    .rotate(0)
    .rotateTo(0, frames(20))

    // Soft scale beat: 1.0 -> 0.94 (gentle dip) -> 1.0 (smooth settle).
    // Isotropic on x and y, no second bounce, no overshoot keyframe.
    .scale(1.0)
    .scaleTo(0.94, frames(5),  'easeOut')
    .scaleTo(1.0,  frames(15), 'easeInOut')
  )
  // Hold opaque white on both slots so any prior destroy alpha is overridden.
  .slot('frame', (s) => s
    .rgba('ffffffff')
    .rgbaTo('ffffffff', frames(20))
  )
  .slot('icon', (s) => s
    .rgba('ffffffff')
    .rgbaTo('ffffffff', frames(20))
  )
  .build();
