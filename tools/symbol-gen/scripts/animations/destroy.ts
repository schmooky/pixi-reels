import { anim, frames } from '../lib/dsl';

/**
 * 350ms (21 frames) destroy. Both frame and icon must end fully transparent.
 *
 * Motion design intent: snappy "pop" rather than a gentle balloon.
 *   - frames 0-3:   tiny anticipation squish (commits to the burst)
 *   - frames 3-15:  scale up to 1.35 with easeOut, plus a small tilt
 *   - frames 15-21: continue scaling, but now alpha rapidly drives to 0
 *
 * Alpha holds at full for the first ~6 frames so the punch is visible,
 * then accelerates out. Tilt direction is asymmetric for character.
 */
export const destroy = anim('destroy')
  .bone('root', (b) => b
    .scale(1.0)
    .scaleTo(0.92, frames(3),  'easeIn')           // anticipation squish
    .scaleTo(1.35, frames(12), 'easeOut')          // burst
    .scaleTo(1.55, frames(6),  'easeIn')           // continue expanding while fading
  )
  .bone('icon', (b) => b
    .rotate(0)
    .rotateTo(-4, frames(3),  'easeIn')            // wind into anticipation
    .rotateTo(12, frames(12), 'easeOut')           // tilt during burst
    .rotateTo(18, frames(6))                       // keep tilting while fading
  )
  .slot('frame', (s) => s
    .rgba('ffffffff')
    .rgbaTo('ffffffff', frames(8))                  // hold full alpha during punch
    .rgbaTo('ffffff00', frames(13), 'easeIn')       // accelerate to transparent
  )
  .slot('icon', (s) => s
    .rgba('ffffffff')
    .rgbaTo('ffffffff', frames(6))                  // icon fades a touch earlier
    .rgbaTo('ffffff00', frames(15), 'easeIn')
  )
  .build();
