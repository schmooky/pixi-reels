/**
 * Load converted 4.2 JSON skeletons with the real spine-core 4.2 runtime and
 * play every animation through, so a bad timeline fails here rather than in a
 * browser. Attachments get no texture region (the JSON reader tolerates that),
 * which is all a data-shape check needs.
 *
 *   node tools/spine-3.8-to-4.2/validate42.mjs out/*.json
 *
 * Resolves spine-core out of this repo's pnpm store; run from the repo root.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const store = join(process.cwd(), 'node_modules', '.pnpm');
const dir = readdirSync(store).find((d) => d.startsWith('@esotericsoftware+spine-core@'));
if (!dir) throw new Error('spine-core not found under node_modules/.pnpm - run pnpm install first');
const core = await import(
  pathToFileURL(join(store, dir, 'node_modules', '@esotericsoftware', 'spine-core', 'dist', 'index.js')).href
);
const {
  AnimationState, AnimationStateData, BoundingBoxAttachment, ClippingAttachment, MeshAttachment,
  PathAttachment, Physics, PointAttachment, RegionAttachment, Skeleton, SkeletonJson,
} = core;

const loader = {
  newRegionAttachment: (_skin, name, path) => new RegionAttachment(name, path),
  newMeshAttachment: (_skin, name, path) => new MeshAttachment(name, path),
  newBoundingBoxAttachment: (_skin, name) => new BoundingBoxAttachment(name),
  newPathAttachment: (_skin, name) => new PathAttachment(name),
  newPointAttachment: (_skin, name) => new PointAttachment(name),
  newClippingAttachment: (_skin, name) => new ClippingAttachment(name),
};

let failed = 0;
for (const file of process.argv.slice(2)) {
  try {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    const data = new SkeletonJson(loader).readSkeletonData(json);
    const skeleton = new Skeleton(data);
    const state = new AnimationState(new AnimationStateData(data));
    let frames = 0;
    for (const anim of data.animations) {
      for (const skin of data.skins) {
        skeleton.setSkin(skin);
        skeleton.setToSetupPose();
        state.setAnimation(0, anim.name, false);
        const step = Math.max(anim.duration / 24, 1 / 60);
        for (let t = 0; t <= anim.duration + step; t += step) {
          state.update(step);
          state.apply(skeleton);
          skeleton.update(step);
          skeleton.updateWorldTransform(Physics.update);
          frames += 1;
        }
      }
    }
    console.log(`ok   ${file}: ${data.bones.length} bones, ${data.skins.length} skins, ${data.animations.length} animations, ${frames} frames applied`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${file}: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err}`);
  }
}
process.exit(failed ? 1 : 0);
