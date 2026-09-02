#!/usr/bin/env python3
"""Convert Spine 3.8 skeletons (binary .skel or JSON) to Spine 4.2 JSON.

    python3 convert.py <in.skel|in.json>... -o <outdir>

Binary input is decoded by skel38.py into the 3.8 JSON data model first, so
both inputs go through one conversion. What changes between 3.8 and 4.2:

- bone `transform` -> `inherit`
- transform constraints: rotateMix/translateMix/scaleMix/shearMix ->
  mixRotate, mixX + mixY, mixScaleX + mixScaleY, mixShearY (setup and timelines)
- path constraints: rotateMix/translateMix -> mixRotate, mixX + mixY
- linked meshes: `deform` -> `timelines`
- slot timelines: color -> rgba, twoColor -> rgba2
- bone rotate frames: angle -> value; path position/spacing frames: -> value
- deform timelines move under animations.attachments.<skin>.<slot>.<attachment>.deform
- every bezier curve: 3.8's one normalised [cx1, cy1, cx2, cy2] per frame becomes
  4.2's absolute (time, value) handles, four numbers per animated component

Full float precision is kept (the binary carries more than the JSON export).
"""
import json
import os
import sys

import skel38

SPINE_VERSION = "4.2.43"


def hex_rgba(s):
    return [int(s[i : i + 2], 16) / 255.0 for i in range(0, 8, 2)]


def hex_rgb(s):
    return [int(s[i : i + 2], 16) / 255.0 for i in range(0, 6, 2)]


def curve_of(frame):
    """3.8 curve -> None (linear) | 'stepped' | (cx1, cy1, cx2, cy2) normalised."""
    c = frame.get("curve")
    if c is None:
        return None
    if c == "stepped":
        return "stepped"
    if isinstance(c, list):
        if len(c) != 4:
            raise ValueError("unexpected curve %r" % (c,))
        return tuple(c)
    return (c, frame.get("c2", 0), frame.get("c3", 1), frame.get("c4", 1))


def bezier(norm, t1, t2, v1s, v2s):
    """One 4.2 absolute curve array from a normalised bezier, per component."""
    cx1, cy1, cx2, cy2 = norm
    out = []
    for v1, v2 in zip(v1s, v2s):
        out += [t1 + cx1 * (t2 - t1), v1 + cy1 * (v2 - v1), t1 + cx2 * (t2 - t1), v1 + cy2 * (v2 - v1)]
    return out


def convert_frames(frames, comps, rename=None, drop=()):
    """Copy timeline frames, translating each frame's curve into 4.2 form.

    `comps(frame)` returns the list of animated component values for a frame,
    in 4.2 component order; `rename` maps 3.8 keys to 4.2 keys.
    """
    out = []
    for i, f in enumerate(frames):
        nf = {}
        for k, v in f.items():
            if k in ("curve", "c2", "c3", "c4") or k in drop:
                continue
            nf[(rename or {}).get(k, k)] = v
        c = curve_of(f)
        if c is not None and i + 1 < len(frames):
            if c == "stepped":
                nf["curve"] = "stepped"
            else:
                nxt = frames[i + 1]
                nf["curve"] = bezier(c, f.get("time", 0), nxt.get("time", 0), comps(f), comps(nxt))
        out.append(nf)
    return out


def convert_transform_mix(c):
    out = {}
    for k, v in c.items():
        if k == "rotateMix":
            out["mixRotate"] = v
        elif k == "translateMix":
            out["mixX"] = v
            out["mixY"] = v
        elif k == "scaleMix":
            out["mixScaleX"] = v
            out["mixScaleY"] = v
        elif k == "shearMix":
            out["mixShearY"] = v
        else:
            out[k] = v
    return out


def convert_path_mix(c):
    out = {}
    for k, v in c.items():
        if k == "rotateMix":
            out["mixRotate"] = v
        elif k == "translateMix":
            out["mixX"] = v
            out["mixY"] = v
        else:
            out[k] = v
    return out


def convert_animation(a):
    out = {}
    if "slots" in a:
        slots = {}
        for slot, tls in a["slots"].items():
            n = {}
            for kind, frames in tls.items():
                if kind == "attachment":
                    n["attachment"] = [dict(f) for f in frames]
                elif kind == "color":
                    n["rgba"] = convert_frames(frames, lambda f: hex_rgba(f["color"]))
                elif kind == "twoColor":
                    n["rgba2"] = convert_frames(frames, lambda f: hex_rgba(f["light"]) + hex_rgb(f["dark"]))
                else:
                    raise ValueError("unknown slot timeline %s" % kind)
            slots[slot] = n
        out["slots"] = slots
    if "bones" in a:
        bones = {}
        for bone, tls in a["bones"].items():
            n = {}
            for kind, frames in tls.items():
                if kind == "rotate":
                    n["rotate"] = convert_frames(frames, lambda f: [f.get("angle", 0)], rename={"angle": "value"})
                elif kind in ("translate", "shear"):
                    n[kind] = convert_frames(frames, lambda f: [f.get("x", 0), f.get("y", 0)])
                elif kind == "scale":
                    n[kind] = convert_frames(frames, lambda f: [f.get("x", 1), f.get("y", 1)])
                else:
                    raise ValueError("unknown bone timeline %s" % kind)
            bones[bone] = n
        out["bones"] = bones
    if "ik" in a:
        out["ik"] = {
            name: convert_frames(frames, lambda f: [f.get("mix", 1), f.get("softness", 0)])
            for name, frames in a["ik"].items()
        }
    if "transform" in a:
        tf = {}
        for name, frames in a["transform"].items():
            conv = convert_frames(
                frames,
                lambda f: [f.get("rotateMix", 1), f.get("translateMix", 1), f.get("translateMix", 1),
                           f.get("scaleMix", 1), f.get("scaleMix", 1), f.get("shearMix", 1)],
            )
            tf[name] = [convert_transform_mix(f) for f in conv]
        out["transform"] = tf
    if "path" in a:
        paths = {}
        for name, tls in a["path"].items():
            n = {}
            for kind, frames in tls.items():
                if kind in ("position", "spacing"):
                    n[kind] = convert_frames(frames, lambda f, k=kind: [f.get(k, 0)], rename={kind: "value"})
                elif kind == "mix":
                    conv = convert_frames(
                        frames, lambda f: [f.get("rotateMix", 1), f.get("translateMix", 1), f.get("translateMix", 1)]
                    )
                    n["mix"] = [convert_path_mix(f) for f in conv]
                else:
                    raise ValueError("unknown path timeline %s" % kind)
            paths[name] = n
        out["path"] = paths
    if "deform" in a:
        atts = {}
        for skin, slots in a["deform"].items():
            s = {}
            for slot, per_att in slots.items():
                m = {}
                for att, frames in per_att.items():
                    # A deform frame's curve eases the 0 -> 1 blend into the next
                    # frame's vertices, so its one component runs from 0 to 1.
                    fixed = []
                    for i, f in enumerate(frames):
                        nf = {k: v for k, v in f.items() if k not in ("curve", "c2", "c3", "c4")}
                        c = curve_of(f)
                        if c is not None and i + 1 < len(frames):
                            if c == "stepped":
                                nf["curve"] = "stepped"
                            else:
                                nf["curve"] = bezier(c, f.get("time", 0), frames[i + 1].get("time", 0), [0.0], [1.0])
                        fixed.append(nf)
                    m[att] = {"deform": fixed}
                s[slot] = m
            atts[skin] = s
        out["attachments"] = atts
    if "drawOrder" in a:
        out["drawOrder"] = a["drawOrder"]
    if "events" in a:
        out["events"] = a["events"]
    return out


def convert(d):
    out = {}
    sk = dict(d["skeleton"])
    sk["spine"] = SPINE_VERSION
    out["skeleton"] = sk
    bones = []
    for b in d.get("bones", []):
        nb = dict(b)
        if "transform" in nb:
            nb["inherit"] = nb.pop("transform")
        bones.append(nb)
    out["bones"] = bones
    out["slots"] = [dict(s) for s in d.get("slots", [])]
    if d.get("ik"):
        out["ik"] = [dict(c) for c in d["ik"]]
    if d.get("transform"):
        out["transform"] = [convert_transform_mix(c) for c in d["transform"]]
    if d.get("path"):
        out["path"] = [convert_path_mix(c) for c in d["path"]]
    skins = []
    for skin in d.get("skins", []):
        ns = {k: v for k, v in skin.items() if k != "attachments"}
        atts = {}
        for slot, per in skin.get("attachments", {}).items():
            m = {}
            for name, a in per.items():
                na = dict(a)
                if na.get("type") == "linkedmesh" and "deform" in na:
                    na["timelines"] = na.pop("deform")
                m[name] = na
            atts[slot] = m
        ns["attachments"] = atts
        skins.append(ns)
    out["skins"] = skins
    if d.get("events"):
        out["events"] = d["events"]
    out["animations"] = {name: convert_animation(a) for name, a in d.get("animations", {}).items()}
    return out


def load_any(path):
    raw = open(path, "rb").read()
    head = raw.lstrip()[:1]
    if head in (b"{",):
        return json.loads(raw.decode("utf-8"))
    return skel38.read_skeleton(raw)


def main(argv):
    if "-o" not in argv or len(argv) < 4:
        print(__doc__)
        return 2
    i = argv.index("-o")
    outdir = argv[i + 1]
    inputs = argv[1:i] + argv[i + 2 :]
    os.makedirs(outdir, exist_ok=True)
    for src in inputs:
        d = load_any(src)
        version = d.get("skeleton", {}).get("spine", "?")
        if not str(version).startswith("3.8"):
            print("%s: skeleton is %s, this converter reads 3.8 (converting anyway)" % (src, version))
        out = convert(d)
        base = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(outdir, base + ".json")
        json.dump(out, open(dst, "w"), separators=(",", ":"))
        print("%s -> %s (%d animations)" % (src, dst, len(out["animations"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
