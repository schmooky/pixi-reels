# Audio assets

Reel-stop click, served at `/audio/*` for the [`@schmooky/zvuk`](https://zvuk.schmooky.dev) recipe at [`/recipes/audio-with-zvuk/`](https://pixi-reels.schmooky.dev/recipes/audio-with-zvuk/).

| File | Source | License |
|---|---|---|
| `click_002.{webm,m4a}` | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) — `click_002.ogg` | CC0 |

The sound ships in two formats: `.webm` (Opus, ~1 KB) for evergreen browsers and `.m4a` (AAC, ~1.5 KB) for older iOS Safari. zvuk's `loadSound(id, [a, b])` picks the first playable URL.

## Adding more sounds

Drop the source `.ogg` (or `.wav`) into a working dir and run zvuk's transcode CLI — it produces the WebM/Opus + M4A/AAC pair in one shot:

```bash
npx zvuk transcode "*.ogg" --out apps/site/public/audio --bitrate 96k --formats webm,m4a
```

Output filenames preserve the source name (`click_002.ogg` → `click_002.{webm,m4a}`). After transcoding, register the new id in [`examples/shared/audio/loadKenneyBank.ts`](../../../../examples/shared/audio/loadKenneyBank.ts).
