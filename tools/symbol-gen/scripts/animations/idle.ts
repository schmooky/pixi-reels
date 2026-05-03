import { anim, frames } from '../lib/dsl';

/**
 * 2400ms idle — slow, subtle breathing on the icon. Frame and border
 * stay PERFECTLY stationary. Single slow cycle (no rotation, no second
 * harmonic) so it reads as "alive" without ever feeling jiggly.
 *
 * Loop is seamless: frame 0 == frame 144 on every property.
 */
export const idle = anim('idle', { loop: true })
  // Force scale 1 / rotation 0 on root. Destroy ends at root.scale 1.55
  // and icon.rotate 18deg on the icon bone; without these keys idle would
  // inherit those values and the symbol would stay oversized/tilted.
  .bone('root', (b) => b
    .scale(1.0)
    .scaleTo(1.0, frames(144))
    .rotate(0)
    .rotateTo(0, frames(144))
  )
  .bone('icon', (b) => b
    // Slow vertical float: -1.5 px lift then settle. ONE cycle over the
    // full loop — no second harmonic, no jiggle.
    .translate(0, 0)
    .translateTo(0, -1.5, frames(72), 'easeInOut')
    .translateTo(0,  0,   frames(72), 'easeInOut')

    // Subtle breathing scale: 1.0 -> 1.015 -> 1.0. Tiny enough you don't
    // see the cell change size; just enough to read as "alive".
    .scale(1.0)
    .scaleTo(1.015, frames(72), 'easeInOut')
    .scaleTo(1.0,   frames(72), 'easeInOut')

    // Reset rotation baseline (destroy ends at icon.rotate 18deg). No
    // active rotation in idle — that's where the jiggle was coming from.
    .rotate(0)
    .rotateTo(0, frames(144))
  )
  // Force opaque white on both slots. Without these keys, if idle plays
  // after destroy, Spine retains destroy's alpha-0 final pose and the
  // symbol stays invisible.
  .slot('frame', (s) => s
    .rgba('ffffffff')
    .rgbaTo('ffffffff', frames(90))
  )
  .slot('icon', (s) => s
    .rgba('ffffffff')
    .rgbaTo('ffffffff', frames(90))
  )
  .build();
