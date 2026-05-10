# Audio recipe — wire `@schmooky/zvuk` to reel events

Pixi-reels emits all the events you need for sound: `spin:start`, per-reel `phase:enter` / `landed`, `spin:reelLanded`, `spin:allLanded`, `win:group`, `win:symbol`, `win:end`, `spotlight:start/end`, `speed:changed`. None of them touch audio — that's a consumer concern. This recipe shows the smallest end-to-end wiring with [`@schmooky/zvuk`](https://zvuk.schmooky.dev) and a CC0 [Kenney interface](https://kenney.nl/assets/interface-sounds) click, scoped to the reel-stop event. Extending to wins, anticipation, or music is a matter of subscribing to more events — see the table at the bottom.

The full code lives in `examples/shared/audio/`. This page walks through the same wiring so you can drop it into your own game without copying the whole shared dir.

## 1. Install zvuk

```bash
pnpm add @schmooky/zvuk
```

## 2. Encode your sounds — WebM/Opus + M4A/AAC

zvuk's `loadSound` accepts an array of URLs and picks the first one the browser can decode. Ship two formats: `.webm` (Opus, ~3 KB for a thud) for evergreen browsers and `.m4a` (AAC, ~5 KB) for older iOS Safari.

zvuk ships a `transcode` CLI that runs the standard ffmpeg ladder for both formats in one call — no shell script needed:

```bash
npx zvuk transcode "*.ogg" --out public/audio --bitrate 96k --formats webm,m4a
```

Output filenames preserve the source name (`chip-lay-1.ogg` → `public/audio/chip-lay-1.{webm,m4a}`).

## 3. Build the engine — once, at app start

`createEngine` does **not** touch the AudioContext. It's safe to call before any user gesture, and it's the right time to declare your buses.

```ts
import { createEngine } from '@schmooky/zvuk';

export const engine = createEngine({
  buses: {
    music: { level: 0.8 },
    sfx:   { level: 1.0 },
    ui:    { level: 0.7 },
  },
  master: { headroom: -3 }, // dB; leave room for the limiter
});
```

Three buses cover almost every casino game: `sfx` for reel/win one-shots, `music` for the loop, `ui` for clicks. Routing them separately means one `engine.bus('music').fadeTo(0.2, 200)` ducks the music under a big-win cue without touching anything else.

## 4. Unlock on the first user gesture

Browsers refuse to start an AudioContext until the user clicks (or types, or taps). Hang the unlock off the spin button — the first spin doubles as the unlock gesture, no separate "tap to enable sound" splash needed.

```ts
let unlocked = false;

spinButton.addEventListener('click', async () => {
  if (!unlocked) {
    await engine.unlock();
    await loadKenneyBank(engine); // step 5
    unlocked = true;
  }
  reelSet.spin();
});
```

If your game has a settings screen with a volume slider, that's also a good unlock site — the slider's `input` event is a gesture.

## 5. Load a sound bank

```ts
import { loadKenneyBank } from './audio/loadKenneyBank.js';

await loadKenneyBank(engine); // loads thud-1, thud-2 onto the sfx bus
```

Or roll your own — one line per sound:

```ts
await engine.loadSound(
  'reel-stop',
  ['/audio/click_002.webm', '/audio/click_002.m4a'],
  { bus: 'sfx' },
);
```

## 6. Wire reel landings to thuds

The shared module is ~30 lines — read [`examples/shared/audio/reelAudio.ts`](../../examples/shared/audio/reelAudio.ts) for the full source. The core is one event subscription:

```ts
import { createReelAudio } from './audio/reelAudio.js';

const audio = createReelAudio(reelSet, engine);
// ...later, on teardown
audio.destroy();
```

Under the hood:

```ts
reelSet.events.on('spin:reelLanded', () => {
  engine.sound('reel-stop').play({
    pitch:  { jitter: 0.04 }, // +/- 4% playback rate
    volume: { jitter: 0.05 }, // +/- 5% gain
  });
});
```

Why pitch jitter: a 5-reel cabinet fires `spin:reelLanded` five times in the stagger pattern the spin controller chose. Without jitter, all five clicks are the same sample — the brain notices and the cabinet sounds digital. With +/-4% jitter you get a subtly varied click per reel.

## 7. Extending — what other events to subscribe to

Same pattern, more `engine.sound(...).play(...)` calls. The events you'll most likely want next:

| Event | When | Suggested sound |
|---|---|---|
| `spin:start` | Reels begin to move | Lever pull / `dice-shake-1.ogg` |
| `phase:enter('anticipation')` (per-reel) | Anticipation reel begins to slow | Low rumble / `lowDown.ogg` |
| `spin:allLanded` | Last reel landed, before win check | Brief pause cue or silence |
| `win:start` | WinPresenter begins a win sequence | Jingle / `jingles_HIT00.ogg` |
| `win:group` | A specific line/cluster is highlighted | Per-line escalating pitch |
| `win:symbol` | A single cell animates | `glass_001.ogg` tick — keep tiny, fires per-cell |
| `win:end` | All wins shown | `engine.bus('music').fadeTo(0.8, 400)` to restore music |
| `speed:changed` | Player toggled turbo | UI click / `click_001.ogg` |
| `spotlight:start` | Win-line dim begins | Optional reverb tail / music duck |

For sustained sounds (a spinning loop, big-win music), use `play({ loop: true })` and hold onto the returned `Voice` so you can `.fade({ to: 0, ms: 200 })` it later. For per-cell win ticks, use a `Sprite` (one buffer, many regions) instead of N separate sounds — see zvuk's [Sprite docs](https://zvuk.schmooky.dev/api/Sprite/).

## Asset licensing

The click shipped under `apps/site/public/audio/` is CC0 from [Kenney interface-sounds](https://kenney.nl/assets/interface-sounds). No attribution required; an attribution line is courteous. Mapping back to source files is in `apps/site/public/audio/README.md`.
