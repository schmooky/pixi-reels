# Spine 3.8 -> 4.2 converter

Turns Spine 3.8 skeleton exports - binary `.skel` or JSON - into Spine 4.2
JSON that `@esotericsoftware/spine-pixi-v8` loads as-is. Atlases and textures
need no change; only the skeleton data format moved.

```bash
# any mix of .skel and .json inputs, one 4.2 .json per input
python3 tools/spine-3.8-to-4.2/convert.py path/to/*.skel -o out/

# prove the output loads and every animation plays on the 4.2 runtime
node tools/spine-3.8-to-4.2/validate42.mjs out/*.json
```

`skel38.py` is the binary reader: it mirrors `SkeletonBinary.ts` from
spine-runtimes 3.8 and produces the exact 3.8 JSON data model, so it is also a
`.skel` -> `.json` tool on its own (`python3 skel38.py in.skel out.json`).
`convert.py` does the 3.8 -> 4.2 mapping listed in its docstring; the binary
path keeps full float precision, which is more than the JSON export carries.

Checked against the spine-runtimes 3.8 example rigs (spineboy, raptor,
goblins, coin, vine): the reader reproduces Spine's own JSON export field for
field, and every converted rig loads and plays through on spine-core 4.2.
Those example assets are Esoteric's and are not committed here.

`../spine-3.7-to-4.2/` is the older, JSON-only sibling for 3.7 exports.
