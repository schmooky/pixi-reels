import { FontLibrary } from 'skia-canvas';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FONTS } from '../symbols.config';

export function registerFonts(): void {
  const missing: string[] = [];
  const obj: Record<string, string[]> = {};

  for (const [alias, files] of Object.entries(FONTS)) {
    const resolved = files.map((f) => resolve(f));
    const found = resolved.filter((p) => existsSync(p));
    const lost = resolved.filter((p) => !existsSync(p));
    if (lost.length) missing.push(...lost);
    if (found.length) obj[alias] = found;
  }

  if (missing.length) {
    console.error('Missing font files:\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  FontLibrary.use(obj);

  for (const alias of Object.keys(obj)) {
    if (!FontLibrary.has(alias)) {
      console.error(`Font alias not registered: ${alias}`);
      process.exit(1);
    }
  }

  const summary = Object.entries(obj)
    .map(([alias, files]) => `  ${alias} (${files.length} file${files.length > 1 ? 's' : ''})`)
    .join('\n');
  console.log('Registered fonts:\n' + summary);
}
