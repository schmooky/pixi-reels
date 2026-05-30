/**
 * Studios and providers shipping production work with pixi-reels.
 *
 * Add entries here, then drop the matching logo SVG into
 * `apps/site/public/partners/<slug>.svg`. The Partners component on the
 * landing page picks them up automatically; ordering in this file is the
 * display order.
 *
 * Logo guidelines:
 *   - SVG preferred (any aspect ratio. the component caps height at ~60px
 *     and lets the width flow, so logos work without resizing).
 *   - Single-color or two-color is ideal so the logo reads at small sizes.
 *   - Keep the source viewBox; the component uses CSS to size, not the
 *     intrinsic width / height attributes.
 */
export interface Partner {
  /** Display name. */
  name: string;
  /** Public path under `apps/site/public/`. Always SVG. */
  logo: string;
  /** Studio / provider website. Optional. */
  url?: string;
  /** One-line description shown on hover and in screen-reader copy. */
  blurb?: string;
}

export const PARTNERS: Partner[] = [
  {
    name: 'pixmove',
    logo: '/partners/pixmove.svg',
    blurb: 'Slot game studio shipping pixi-reels-powered titles.',
  },
];
