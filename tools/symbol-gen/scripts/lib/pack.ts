import { MaxRectsPacker } from 'maxrects-packer';

export type PackInput = { name: string; w: number; h: number };
export type PackedRegion = { name: string; x: number; y: number; w: number; h: number };
export type PackResult = { regions: PackedRegion[]; pageW: number; pageH: number };

const PADDING = 2;
const MAX_PAGE = 2048;

export function pack(items: PackInput[]): PackResult {
  const packer = new MaxRectsPacker(MAX_PAGE, MAX_PAGE, PADDING, {
    smart: true,
    pot: true,
    square: false,
    allowRotation: false,
  });

  for (const item of items) {
    packer.add(item.w, item.h, { name: item.name });
  }

  if (packer.bins.length !== 1) {
    throw new Error(
      `Symbols overflow a single ${MAX_PAGE}x${MAX_PAGE} page (${packer.bins.length} pages produced). ` +
        `Reduce symbol sizes or raise MAX_PAGE.`,
    );
  }

  const bin = packer.bins[0]!;
  const regions: PackedRegion[] = bin.rects.map((r) => ({
    name: (r.data as { name: string }).name,
    x: r.x,
    y: r.y,
    w: r.width,
    h: r.height,
  }));

  return { regions, pageW: bin.width, pageH: bin.height };
}
