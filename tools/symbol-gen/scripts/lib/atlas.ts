import type { PackResult } from './pack';

/**
 * Writes a libGDX-format .atlas file.
 * Reference: https://en.esotericsoftware.com/spine-atlas-format
 */
export function writeAtlas(pageFile: string, pack: PackResult): string {
  const lines: string[] = [
    '',
    pageFile,
    `size: ${pack.pageW}, ${pack.pageH}`,
    'filter: Linear, Linear',
    'pma: false',
  ];

  for (const r of pack.regions) {
    lines.push(r.name);
    lines.push(`  bounds: ${r.x}, ${r.y}, ${r.w}, ${r.h}`);
  }

  return lines.join('\n') + '\n';
}
