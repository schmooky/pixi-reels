import { SPINE_VERSION } from '../symbols.config';

/**
 * Builds a Spine 4.x skeleton JSON for one symbol.
 *
 * Two slots, two bones:
 *   - root bone: parent transform. Destroy animates this so the entire
 *     tile (frame + icon) bursts as one.
 *   - icon bone: child of root. Idle/landing/win animate this so only the
 *     glyph drifts, squashes, or punches — the frame stays perfectly still.
 *
 *   - frame slot: bound to root, holds the {name}_frame region (border + fill)
 *   - icon slot:  bound to icon, holds the {name}_icon region (glyph only)
 *
 * The frame attachment uses {size}x{size}; the icon attachment uses
 * {iconSize}x{iconSize} so it can deliberately overflow the frame.
 */
export function buildSkeleton(
  name: string,
  size: number,
  animations: Record<string, unknown>,
  iconSize: number = size,
) {
  const frameRegion = `${name}_frame`;
  const iconRegion = `${name}_icon`;

  return {
    skeleton: {
      hash: name,
      spine: SPINE_VERSION,
      x: -size / 2,
      y: -size / 2,
      width: size,
      height: size,
      images: './',
      audio: '',
    },
    bones: [
      { name: 'root' },
      { name: 'icon', parent: 'root' },
    ],
    slots: [
      { name: 'frame', bone: 'root', attachment: frameRegion },
      { name: 'icon',  bone: 'icon', attachment: iconRegion  },
    ],
    skins: [
      {
        name: 'default',
        attachments: {
          frame: {
            [frameRegion]: { width: size, height: size },
          },
          icon: {
            // iconSize may exceed `size` so the glyph bleeds past the
            // frame border (premium-symbol read for chunky wilds).
            [iconRegion]: { width: iconSize, height: iconSize },
          },
        },
      },
    ],
    animations,
  };
}
