#!/usr/bin/env python3
"""Convert Spine 3.7.94 skeleton JSON to 4.2 format.

Covers exactly the feature subset used by the res.zip skeletons:
- skins dict -> array
- bone timelines rotate (angle->value) / translate / scale / shear
- slot timelines color->rgba, attachment
- deform -> animations.attachments.{skin}.{slot}.{attachment}.deform
- drawOrder / events copied
- transform constraint mix renames (rotateMix->mixRotate, translateMix->mixX,
  shearMix->mixShearY); path constraints copy as-is (no mix fields present)
- bezier curves: 3.7 normalized [cx1,cy1,cx2,cy2] -> 4.2 absolute,
  duplicated per component
"""
import json, sys, os, glob, shutil

STATS = {"skeletons": 0, "curves": 0, "timelines": 0}


def conv_curve(prev_key, next_key, comps_prev, comps_next):
    """3.7 normalized bezier on prev_key -> 4.2 absolute per-component array.

    comps_prev/comps_next: list of component values at prev/next key.
    Returns value for 4.2 "curve" field, or None for linear.
    """
    c = prev_key.get("curve")
    if c is None:
        return None
    if c == "stepped":
        return "stepped"
    if not isinstance(c, list) or len(c) != 4:
        raise ValueError(f"unexpected curve: {c!r}")
    cx1, cy1, cx2, cy2 = c
    t1, t2 = prev_key.get("time", 0), next_key.get("time", 0)
    out = []
    for v1, v2 in zip(comps_prev, comps_next):
        out += [
            t1 + cx1 * (t2 - t1),
            v1 + cy1 * (v2 - v1),
            t1 + cx2 * (t2 - t1),
            v1 + cy2 * (v2 - v1),
        ]
    STATS["curves"] += 1
    return out


def conv_keys(keys, fields, defaults, rename=None):
    """Generic timeline key conversion with per-component curve math."""
    STATS["timelines"] += 1
    out = []
    for i, k in enumerate(keys):
        nk = {}
        if "time" in k:
            nk["time"] = k["time"]
        comps = [k.get(f, d) for f, d in zip(fields, defaults)]
        for f, v, d in zip(fields, comps, defaults):
            tf = rename.get(f, f) if rename else f
            if k.get(f, None) is not None or v != d:
                if f in k or v != d:
                    nk[tf] = v
        if i + 1 < len(keys):
            nxt = keys[i + 1]
            comps_next = [nxt.get(f, d) for f, d in zip(fields, defaults)]
            cv = conv_curve(k, nxt, comps, comps_next)
            if cv is not None:
                nk["curve"] = cv
        out.append(nk)
    return out


def hex_rgba(color):
    color = color.ljust(8, "f")
    return [int(color[i : i + 2], 16) / 255 for i in (0, 2, 4, 6)]


def conv_color_keys(keys):
    STATS["timelines"] += 1
    out = []
    for i, k in enumerate(keys):
        nk = {"time": k.get("time", 0), "color": k["color"]}
        if "time" not in k:
            nk.pop("time")
            nk = {"color": k["color"]}
        if i + 1 < len(keys):
            cv = conv_curve(k, keys[i + 1], hex_rgba(k["color"]), hex_rgba(keys[i + 1]["color"]))
            if cv is not None:
                nk["curve"] = cv
        out.append(nk)
    return out


def conv_deform_keys(keys):
    STATS["timelines"] += 1
    out = []
    for i, k in enumerate(keys):
        nk = {f: k[f] for f in ("time", "offset", "vertices") if f in k}
        if i + 1 < len(keys):
            cv = conv_curve(k, keys[i + 1], [0], [1])
            if cv is not None:
                nk["curve"] = cv
        out.append(nk)
    return out


def convert(doc):
    STATS["skeletons"] += 1
    out = dict(doc)  # shallow; replace the parts we transform
    sk = dict(doc.get("skeleton", {}))
    sk["spine"] = "4.2.110"
    out["skeleton"] = sk

    # Skins: dict -> array, default first.
    skins = doc.get("skins", {})
    arr = []
    for name in sorted(skins.keys(), key=lambda n: (n != "default", n)):
        arr.append({"name": name, "attachments": skins[name]})
    out["skins"] = arr

    # Transform constraints: mix renames.
    if "transform" in doc:
        tcs = []
        for tc in doc["transform"]:
            tc = dict(tc)
            if "rotateMix" in tc:
                tc["mixRotate"] = tc.pop("rotateMix")
            if "translateMix" in tc:
                tc["mixX"] = tc.pop("translateMix")
            if "scaleMix" in tc:
                tc["mixScaleX"] = tc.pop("scaleMix")
            if "shearMix" in tc:
                tc["mixShearY"] = tc.pop("shearMix")
            tcs.append(tc)
        out["transform"] = tcs

    # Animations.
    anims = {}
    for aname, a in doc.get("animations", {}).items():
        na = {}
        if "slots" in a:
            ns = {}
            for slot, tls in a["slots"].items():
                nt = {}
                for tname, keys in tls.items():
                    if tname == "attachment":
                        STATS["timelines"] += 1
                        nt["attachment"] = keys
                    elif tname == "color":
                        nt["rgba"] = conv_color_keys(keys)
                    else:
                        raise ValueError(f"slot timeline {tname}")
                ns[slot] = nt
            na["slots"] = ns
        if "bones" in a:
            nb = {}
            for bone, tls in a["bones"].items():
                nt = {}
                for tname, keys in tls.items():
                    if tname == "rotate":
                        nt["rotate"] = conv_keys(keys, ["angle"], [0], rename={"angle": "value"})
                    elif tname in ("translate", "shear"):
                        nt[tname] = conv_keys(keys, ["x", "y"], [0, 0])
                    elif tname == "scale":
                        nt["scale"] = conv_keys(keys, ["x", "y"], [1, 1])
                    else:
                        raise ValueError(f"bone timeline {tname}")
                nb[bone] = nt
            na["bones"] = nb
        if "deform" in a:
            natt = {}
            for skin, slots in a["deform"].items():
                nslots = {}
                for slot, atts in slots.items():
                    natts = {}
                    for att, keys in atts.items():
                        natts[att] = {"deform": conv_deform_keys(keys)}
                    nslots[slot] = natts
                natt[skin] = nslots
            na["attachments"] = natt
        if "drawOrder" in a:
            STATS["timelines"] += 1
            na["drawOrder"] = a["drawOrder"]
        if "events" in a:
            STATS["timelines"] += 1
            na["events"] = a["events"]
        unknown = set(a.keys()) - {"slots", "bones", "deform", "drawOrder", "events"}
        if unknown:
            raise ValueError(f"animation sections {unknown}")
        anims[aname] = na
    if anims:
        out["animations"] = anims
    return out


def main():
    src_root, dst_root = sys.argv[1], sys.argv[2]
    fails = []
    for f in glob.glob(os.path.join(src_root, "*", "*.json")):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        rel = os.path.relpath(f, src_root)
        dst = os.path.join(dst_root, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if "skeleton" not in d or "bones" not in d:
            continue  # texture-atlas json etc. are not copied
        if not d["skeleton"].get("spine", "").startswith("3.7"):
            fails.append((rel, "unexpected version"))
            continue
        try:
            json.dump(convert(d), open(dst, "w"), separators=(",", ":"))
        except Exception as e:
            fails.append((rel, str(e)))
    # Copy atlases + texture pages alongside.
    for ext in ("*.atlas", "*.png", "*.jpg"):
        for f in glob.glob(os.path.join(src_root, "*", ext)):
            rel = os.path.relpath(f, src_root)
            dst = os.path.join(dst_root, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(f, dst)
    print("STATS:", STATS)
    if fails:
        print("FAILS:")
        for r, e in fails:
            print(" ", r, "->", e)
    else:
        print("no conversion failures")


main()
