#!/usr/bin/env python3
"""Author Spine 4.2 skeletons for the clover Hold & Win symbols.

Reads the docs site's packed clover sheets (`apps/site/public/hw-clover/`:
`symbols.json` for the crisp + blur frames, `spinefx.json` for the glows,
flares and glints) and writes, next to them:

    hw-clover/clovers.atlas          one Spine atlas over both sheets
    hw-clover/spine/<id>.json        one 4.2 skeleton per symbol id

Every skeleton is the symbol's own reel art on a `body` bone under `root`,
a soft radial glow behind it, its coloured electro cloud as a win burst,
and a flare, a starburst and a star in front - all from the game's effects
atlas - plus four animations the reel engine drives through `SpineReelSymbol`:

    idle      loop  - breathe, sway, glow pulse (the held-coin idle)
    landing   0.3s  - squash-settle with a flare pop, returns to idle
    win       0.6s  - two pulses, glow flash, electro burst, rays and star, returns to idle
    blur      loop  - the motion-blur frame while the reel moves

Usage: python3 tools/clover-spines/build.py [apps/site/public/hw-clover]
"""
import json
import os
import sys

SPINE_VERSION = "4.2.43"
IDS = ["gold", "collect", "multi", "mystery", "super", "capsule", "empty", "sealed"]
TILES = {"empty", "sealed"}
# the flash each feature clover throws on a win: its own coloured electro cloud; gold and the capsule flash the white clover
BURST = {"collect": "fx/under_collect", "multi": "fx/under_multi", "mystery": "fx/under_mystery", "super": "fx/under_super"}

# cubic-bezier presets as (x1, y1, x2, y2) on the unit square
EASE = {"inOut": (0.42, 0.0, 0.58, 1.0), "out": (0.0, 0.0, 0.58, 1.0), "in": (0.42, 0.0, 1.0, 1.0), "sine": (0.37, 0.0, 0.63, 1.0)}


def curve(t1, t2, v1s, v2s, ease):
    """4.2 absolute bezier handles, four numbers per animated component."""
    x1, y1, x2, y2 = EASE[ease]
    out = []
    for v1, v2 in zip(v1s, v2s):
        out += [t1 + x1 * (t2 - t1), v1 + y1 * (v2 - v1), t1 + x2 * (t2 - t1), v1 + y2 * (v2 - v1)]
    return out


def keys(frames, comps, ease="sine"):
    """frames: list of (time, dict of values). Adds eased curves between them."""
    out = []
    for i, (t, vals) in enumerate(frames):
        f = {"time": t, **vals}
        if i + 1 < len(frames):
            t2, vals2 = frames[i + 1]
            f["curve"] = curve(t, t2, [vals[c] for c in comps], [vals2[c] for c in comps], ease)
        out.append(f)
    return out


def scale_keys(frames, ease="sine"):
    return keys([(t, {"x": sx, "y": sy}) for t, sx, sy in frames], ["x", "y"], ease)


def rotate_keys(frames, ease="sine"):
    return keys([(t, {"value": v}) for t, v in frames], ["value"], ease)


def rgba(a):
    return "ffffff%02x" % max(0, min(255, round(a * 255)))


def alpha_keys(frames, ease="sine"):
    out = []
    for i, (t, a) in enumerate(frames):
        f = {"time": t, "color": rgba(a)}
        if i + 1 < len(frames):
            t2, a2 = frames[i + 1]
            f["curve"] = curve(t, t2, [1, 1, 1, a], [1, 1, 1, a2], ease)
        out.append(f)
    return out


def region(frames, key):
    f = frames[key]
    return f["sourceSize"]["w"], f["sourceSize"]["h"]


def skeleton(sid, sym_frames, fx_frames):
    body = f"normal/{sid}"
    blur = f"blur/{sid}"
    bw, bh = region(sym_frames, body)
    blw, blh = region(sym_frames, blur)
    tile = sid in TILES
    # a soft radial light under the clover; the coloured clouds are too flat to sit there all the time
    glow = "fx/glint"
    uw, uh = region(fx_frames, glow)
    glow_scale = max(bw / uw, bh / uh) * 1.35
    burst = BURST.get(sid, "fx/glow_white")
    xw, xh = region(fx_frames, burst)
    burst_scale = max(bw / xw, bh / xh) * 1.1
    fw, fh = region(fx_frames, "fx/flare")
    lw, lh = region(fx_frames, "fx/light_back")
    sw, sh = region(fx_frames, "fx/star")

    bones = [
        {"name": "root"},
        {"name": "glow", "parent": "root"},
        {"name": "burst", "parent": "root"},
        {"name": "body", "parent": "root"},
        {"name": "flare", "parent": "body", "scaleX": 0.5, "scaleY": 0.5},
        {"name": "rays", "parent": "body"},
        {"name": "star", "parent": "body"},
    ]
    slots = [{"name": "body", "bone": "body", "attachment": body}]
    attachments = {"body": {body: {"width": bw, "height": bh}, blur: {"width": blw, "height": blh}}}
    if not tile:
        slots = [
            {"name": "glow", "bone": "glow", "attachment": glow, "color": rgba(0.3), "blend": "additive"},
            {"name": "burst", "bone": "burst", "attachment": burst, "color": rgba(0.0), "blend": "additive"},
            {"name": "body", "bone": "body", "attachment": body},
            {"name": "flare", "bone": "flare", "attachment": "fx/flare", "color": rgba(0.0), "blend": "additive"},
            {"name": "rays", "bone": "rays", "attachment": "fx/light_back", "color": rgba(0.0), "blend": "additive"},
            {"name": "star", "bone": "star", "attachment": "fx/star", "color": rgba(0.0), "blend": "additive"},
        ]
        attachments["glow"] = {glow: {"width": uw, "height": uh, "scaleX": glow_scale, "scaleY": glow_scale}}
        attachments["burst"] = {burst: {"width": xw, "height": xh, "scaleX": burst_scale, "scaleY": burst_scale}}
        attachments["flare"] = {"fx/flare": {"width": fw, "height": fh}}
        attachments["rays"] = {"fx/light_back": {"width": lw, "height": lh, "scaleX": 1.6, "scaleY": 1.6}}
        attachments["star"] = {"fx/star": {"width": sw, "height": sh, "x": bw * 0.28, "y": bh * 0.22}}

    # every animation re-keys the crisp frame at 0 so leaving `blur` restores it
    crisp = {"body": {"attachment": [{"time": 0, "name": body}]}}
    animations = {
        "blur": {"slots": {"body": {"attachment": [{"time": 0, "name": blur}]}, **({"glow": {"rgba": [{"time": 0, "color": rgba(0)}]}} if not tile else {})}},
        "idle": {"slots": dict(crisp)},
    }
    if not tile:
        animations["idle"]["bones"] = {
            "body": {
                "scale": scale_keys([(0, 1, 1), (1.2, 1.035, 1.035), (2.4, 1, 1)]),
                "rotate": rotate_keys([(0, 0), (0.6, 2.0), (1.2, 0), (1.8, -2.0), (2.4, 0)]),
            }
        }
        animations["idle"]["slots"]["glow"] = {"rgba": alpha_keys([(0, 0.3), (1.2, 0.5), (2.4, 0.3)])}
        animations["landing"] = {
            "slots": {**crisp, "flare": {"rgba": alpha_keys([(0, 0), (0.08, 0.9), (0.3, 0)], "out")}},
            "bones": {
                "body": {"scale": scale_keys([(0, 1, 1), (0.09, 1.04, 0.94), (0.18, 0.99, 1.02), (0.3, 1, 1)], "out")},
                "flare": {"scale": scale_keys([(0, 0.5, 0.5), (0.3, 1.6, 1.6)], "out")},
            },
        }
        animations["win"] = {
            "slots": {
                **crisp,
                "glow": {"rgba": alpha_keys([(0, 0.3), (0.15, 0.9), (0.3, 0.45), (0.45, 0.9), (0.6, 0.3)])},
                "burst": {"rgba": alpha_keys([(0, 0), (0.1, 0.55), (0.3, 0), (0.36, 0.45), (0.6, 0)], "out")},
                "rays": {"rgba": alpha_keys([(0, 0), (0.12, 0.8), (0.6, 0)], "out")},
                "star": {"rgba": alpha_keys([(0, 0), (0.2, 1.0), (0.5, 0)], "out")},
            },
            "bones": {
                "body": {"scale": scale_keys([(0, 1, 1), (0.13, 1.14, 1.14), (0.26, 1, 1), (0.39, 1.14, 1.14), (0.6, 1, 1)])},
                "rays": {"rotate": rotate_keys([(0, 0), (0.6, 40)], "out"), "scale": scale_keys([(0, 0.7, 0.7), (0.6, 1.4, 1.4)], "out")},
                "star": {"rotate": rotate_keys([(0, -20), (0.6, 60)], "out"), "scale": scale_keys([(0, 0.2, 0.2), (0.2, 1.0, 1.0), (0.5, 0.3, 0.3)], "out")},
            },
        }
    else:
        # a tile never breathes or celebrates: idle, landing and win are the crisp frame, still
        animations["landing"] = {"slots": dict(crisp)}
        animations["win"] = {"slots": dict(crisp)}

    return {
        "skeleton": {"hash": f"clover-{sid}", "spine": SPINE_VERSION, "x": -bw * 0.65, "y": -bh * 0.65, "width": bw * 1.3, "height": bh * 1.3, "images": "./", "audio": ""},
        "bones": bones,
        "slots": slots,
        "skins": [{"name": "default", "attachments": attachments}],
        "animations": animations,
    }


def write_atlas(pages, path):
    lines = []
    for image, data in pages:
        lines += ["", image, f"size: {data['meta']['size']['w']}, {data['meta']['size']['h']}", "filter: Linear, Linear", "pma: false"]
        for name, f in data["frames"].items():
            fr, sss, ss = f["frame"], f["spriteSourceSize"], f["sourceSize"]
            lines.append(name)
            lines.append(f"  bounds: {fr['x']}, {fr['y']}, {fr['w']}, {fr['h']}")
            if f.get("trimmed"):
                # Spine measures the trim offset from the bottom-left of the original
                lines.append(f"  offsets: {sss['x']}, {ss['h'] - fr['h'] - sss['y']}, {ss['w']}, {ss['h']}")
    open(path, "w").write("\n".join(lines) + "\n")


def main(argv):
    base = argv[1] if len(argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "apps", "site", "public", "hw-clover")
    sym = json.load(open(os.path.join(base, "symbols.json")))
    fx = json.load(open(os.path.join(base, "spinefx.json")))
    write_atlas([(sym["meta"]["image"], sym), (fx["meta"]["image"], fx)], os.path.join(base, "clovers.atlas"))
    os.makedirs(os.path.join(base, "spine"), exist_ok=True)
    for sid in IDS:
        data = skeleton(sid, sym["frames"], fx["frames"])
        with open(os.path.join(base, "spine", f"{sid}.json"), "w") as f:
            json.dump(data, f, separators=(",", ":"))
    print(f"wrote clovers.atlas + {len(IDS)} skeletons to {os.path.relpath(base)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
