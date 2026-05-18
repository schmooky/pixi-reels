---
"pixi-reels": patch
---

Fix: support `@esotericsoftware/spine-pixi-v8` 4.3, which renamed
`Skeleton.setToSetupPose()` → `setupPose()` and
`Skeleton.setSlotsToSetupPose()` → `setupPoseSlots()`. Peer dep range
narrowed to `^4.3.0`; consumers pinned to spine 4.2.x should stay on
the prior release. Also bumps `vite-plugin-dts` to v5 and `vitest` to
4.1.6 in dev tooling.
