/**
 * Ensure each FAQ / FAQ-group YAML carries an explicit `id:` matching its
 * filename. Keystatic's slugField stores the slug "name" in the body; without
 * it the editor shows a blank ID and rewrites `id: ''` on save. Idempotent.
 *
 * Run from apps/site:  node scripts/fixup-faq-ids.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';

const SITE = resolve(import.meta.dirname, '..');

for (const sub of ['faq', 'faq-groups']) {
  const dir = resolve(SITE, 'src/content', sub);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const id = file.replace(/\.yaml$/, '');
    const path = resolve(dir, file);
    const data = parse(readFileSync(path, 'utf8')) ?? {};
    if (data.id === id) continue;
    // Rebuild with id first for a stable, readable key order.
    const { id: _drop, ...rest } = data;
    writeFileSync(path, stringify({ id, ...rest }));
  }
}
console.log('FAQ ids normalised.');
