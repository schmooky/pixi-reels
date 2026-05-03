import { anim, frames } from '../lib/dsl';

/**
 * 900ms (54 frames) win. Acts on the icon bone ONLY — the frame/border
 * stays perfectly still so multi-cell wins read as "the character lit up",
 * not "the whole tile bounced".
 *
 * Motion: setup -> anticipation dip -> punch -> settle -> hold at setup.
 * Five keys per property. Begins AND ends at setup pose so a pool reuse
 * or a back-to-back idle handoff inherits clean values.
 *
 * Root bone is pinned at setup throughout — defends against destroy's
 * lingering root.scale=1.55 / root.rotate ever leaking into a fresh win
 * if the pool reuse path is bypassed (rare, but cheap to guard against).
 */
export const win = anim('win')
  .bone('root', (b) => b
    .scale(1.0)
    .scaleTo(1.0, frames(54))
    .rotate(0)
    .rotateTo(0, frames(54))
  )
  .bone('icon', (b) => b
    .scale(1.0)
    .scaleTo(0.94, frames(4),  'easeOut')   // anticipation dip
    .scaleTo(1.22, frames(8),  'easeOut')   // punch
    .scaleTo(1.0,  frames(12), 'easeInOut') // settle
    .scaleTo(1.0,  frames(30))              // hold at setup

    .translate(0, 0)
    .translateTo(0, 0, frames(54))

    .rotate(0)
    .rotateTo(-6, frames(4),  'easeOut')
    .rotateTo( 8, frames(8),  'easeOut')
    .rotateTo( 0, frames(12), 'easeInOut')
    .rotateTo( 0, frames(30))               // hold at setup
  )
  .slot('frame', (s) => s
    .rgba('ffffffff')
    .rgbaTo('ffffffff', frames(54))
  )
  .slot('icon', (s) => s
    .rgba('ffffffff')
    .rgbaTo('ffffffff', frames(54))
  )
  .build();
