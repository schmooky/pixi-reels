---
'pixi-reels': minor
---

Add: speed-scoped tumble overrides + AbortSignal on cascade symbol events.

`SpeedProfile` now accepts an optional `tumble?: TumbleConfig` field. When the active speed profile defines one, the cascade fall + drop-in phases merge its fields over the base config registered via `.tumble(...)` — so `setSpeed('turbo')` can shorten `fall.duration`, `dropIn.duration`, and per-row staggers, not just the per-reel `stopDelay`. Profiles without a `tumble` field behave identically to before.

```ts
.tumble({ fall: { duration: 300 }, dropIn: { duration: 600, rowStagger: 60 } })
.speed('default', SPEED_DEFAULT)
.speed('turbo', {
  ...SPEED_TURBO,
  tumble: {
    fall: { duration: 120 },
    dropIn: { duration: 220, rowStagger: 20 },
  },
})
.speed('snap', { ...SPEED_TURBO, tumble: { fall: { duration: 0 }, dropIn: { duration: 0 } } })
```

`cascade:fall:symbol`, `cascade:dropIn:symbol`, and `cascade:gravity:symbol` now carry a `signal: AbortSignal` field. The signal aborts when the phase is skipped / slammed; listeners that schedule parallel tweens (squish, bounce, badge animations) can register a one-shot cleanup so a slam-stop kills their work alongside the library's own timeline. The signal stays un-aborted on natural completion — only explicit skips trigger it.

```ts
events.on('cascade:dropIn:symbol', ({ view, duration, signal }) => {
  const t = gsap.to(view.scale, { x: 1.15, y: 0.78, duration: duration / 1000 });
  signal.addEventListener('abort', () => { t.kill(); view.scale.set(1, 1); }, { once: true });
});
```

Fix: `SpineReelSymbol` now calls `Skeleton.setupPose()` instead of `setToSetupPose()` on pool recycle. Spine renamed this method as a breaking change inside the `@esotericsoftware/spine-pixi-v8@4.3.0` minor bump; with the previous call site the library would `TypeError` the moment any Spine symbol was deactivated on the current peer dep.
