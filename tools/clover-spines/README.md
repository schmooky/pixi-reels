# Clover Spine skeletons

`build.py` authors the Spine 4.2 skeletons behind the clover Hold & Win recipes
from the packed clover sheets in `apps/site/public/hw-clover/` (the reel art and
the glows, flares and glints of the game's effects atlas). It writes one atlas
over both sheets and one skeleton per symbol, with `idle` / `landing` / `win` /
`blur` animations that `SpineReelSymbol` drives without any per-symbol code.

```bash
python3 tools/clover-spines/build.py
node tools/spine-3.8-to-4.2/validate42.mjs apps/site/public/hw-clover/spine/*.json
```

The source game's own skeletons did not survive the capture that produced the
sheets, so these are authored here rather than converted; the sheets are packed
outside this repo from that capture.
