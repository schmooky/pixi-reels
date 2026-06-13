import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CORE = '/Users/user/GitHub/pixi-reels/node_modules/.pnpm/@esotericsoftware+spine-core@4.2.110/node_modules/@esotericsoftware/spine-core/dist/index.js';
const { SkeletonJson, AtlasAttachmentLoader, TextureAtlas } = await import(pathToFileURL(CORE));

const SRC = '/tmp/res-unpack/res';
const DST = '/tmp/spine42';

// 3.7-side expected duration: max key time across every timeline.
function srcDuration(anim) {
  let max = 0;
  const scanKeys = (keys) => { for (const k of keys ?? []) max = Math.max(max, k.time ?? 0); };
  for (const tls of Object.values(anim.bones ?? {})) for (const keys of Object.values(tls)) scanKeys(keys);
  for (const tls of Object.values(anim.slots ?? {})) for (const keys of Object.values(tls)) scanKeys(keys);
  for (const slots of Object.values(anim.deform ?? {}))
    for (const atts of Object.values(slots)) for (const keys of Object.values(atts)) scanKeys(keys);
  scanKeys(anim.drawOrder); scanKeys(anim.events);
  return max;
}

// Attachment loader that tries several atlases (same dir first, then global).
class MultiAtlasLoader {
  constructor(loaders) { this.loaders = loaders; }
  _try(method, ...args) {
    let lastErr = null;
    for (const l of this.loaders) {
      try { return l[method](...args); } catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error('no atlases');
  }
  newRegionAttachment(...a) { return this._try('newRegionAttachment', ...a); }
  newMeshAttachment(...a) { return this._try('newMeshAttachment', ...a); }
  newBoundingBoxAttachment(...a) { return this.loaders[0].newBoundingBoxAttachment(...a); }
  newClippingAttachment(...a) { return this.loaders[0].newClippingAttachment(...a); }
  newPathAttachment(...a) { return this.loaders[0].newPathAttachment(...a); }
  newPointAttachment(...a) { return this.loaders[0].newPointAttachment(...a); }
}

const allAtlases = [];
const atlasByDir = new Map();
for (const dir of fs.readdirSync(SRC)) {
  const d = path.join(SRC, dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.atlas')) continue;
    try {
      const atlas = new TextureAtlas(fs.readFileSync(path.join(d, f), 'utf8'));
      const loader = new AtlasAttachmentLoader(atlas);
      allAtlases.push(loader);
      if (!atlasByDir.has(dir)) atlasByDir.set(dir, []);
      atlasByDir.get(dir).push(loader);
    } catch (e) {
      console.log(`ATLAS PARSE FAIL ${dir}/${f}: ${e.message}`);
    }
  }
}

let ok = 0, fail = 0;
const failures = [];
for (const dir of fs.readdirSync(DST)) {
  const d = path.join(DST, dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    const id = `${dir}/${f.slice(0, 10)}`;
    try {
      const converted = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      const source = JSON.parse(fs.readFileSync(path.join(SRC, dir, f), 'utf8'));
      const loaders = [...(atlasByDir.get(dir) ?? []), ...allAtlases];
      const sj = new SkeletonJson(new MultiAtlasLoader(loaders));
      const data = sj.readSkeletonData(converted);
      // structural equivalence
      const srcAnims = Object.keys(source.animations ?? {});
      if (data.bones.length !== (source.bones ?? []).length) throw new Error('bone count mismatch');
      if (data.slots.length !== (source.slots ?? []).length) throw new Error('slot count mismatch');
      if (data.animations.length !== srcAnims.length) throw new Error('animation count mismatch');
      for (const name of srcAnims) {
        const a = data.findAnimation(name);
        if (!a) throw new Error(`animation missing: ${name}`);
        const expect = srcDuration(source.animations[name]);
        if (Math.abs(a.duration - expect) > 1e-4) {
          throw new Error(`duration ${name}: got ${a.duration.toFixed(4)} want ${expect.toFixed(4)}`);
        }
      }
      ok++;
    } catch (e) {
      fail++;
      failures.push(`${id}: ${e.message}`);
    }
  }
}
console.log(`OK: ${ok}  FAIL: ${fail}`);
for (const f of failures.slice(0, 15)) console.log('  ' + f);
