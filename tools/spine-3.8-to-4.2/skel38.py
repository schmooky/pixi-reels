#!/usr/bin/env python3
"""Read a Spine 3.8 binary skeleton (.skel) into the 3.8 JSON data model.

The output dict has exactly the shape Spine's own 3.8 JSON export has, so the
same 3.8 -> 4.2 conversion (convert.py) serves both inputs. Mirrors
SkeletonBinary.ts from spine-runtimes 3.8 field for field.

Usage: python3 skel38.py in.skel out.json
"""
import json
import struct
import sys

TRANSFORM_MODES = ["normal", "onlyTranslation", "noRotationOrReflection", "noScale", "noScaleOrReflection"]
BLEND_MODES = ["normal", "additive", "multiply", "screen"]
POSITION_MODES = ["fixed", "percent"]
SPACING_MODES = ["length", "fixed", "percent"]
ROTATE_MODES = ["tangent", "chain", "chainScale"]
ATTACHMENT_TYPES = ["region", "boundingbox", "mesh", "linkedmesh", "path", "point", "clipping"]

CURVE_LINEAR, CURVE_STEPPED, CURVE_BEZIER = 0, 1, 2


class Reader:
    def __init__(self, data: bytes):
        self.b = data
        self.i = 0
        self.strings = []

    def byte(self) -> int:
        v = self.b[self.i]
        self.i += 1
        return v

    def sbyte(self) -> int:
        v = struct.unpack_from(">b", self.b, self.i)[0]
        self.i += 1
        return v

    def boolean(self) -> bool:
        return self.byte() != 0

    def int32(self) -> int:
        v = struct.unpack_from(">i", self.b, self.i)[0]
        self.i += 4
        return v

    def short(self) -> int:
        v = struct.unpack_from(">h", self.b, self.i)[0]
        self.i += 2
        return v

    def float(self) -> float:
        v = struct.unpack_from(">f", self.b, self.i)[0]
        self.i += 4
        return v

    def varint(self, optimize_positive: bool = True) -> int:
        b = self.byte()
        result = b & 0x7F
        shift = 7
        while b & 0x80 and shift < 35:
            b = self.byte()
            result |= (b & 0x7F) << shift
            shift += 7
        result &= 0xFFFFFFFF
        if not optimize_positive:
            result = (result >> 1) ^ -(result & 1)
        elif result >= 0x80000000:
            result -= 0x100000000
        return result

    def string(self):
        n = self.varint()
        if n == 0:
            return None
        if n == 1:
            return ""
        n -= 1
        s = self.b[self.i : self.i + n].decode("utf-8")
        self.i += n
        return s

    def string_ref(self):
        idx = self.varint()
        return None if idx == 0 else self.strings[idx - 1]

    def floats(self, n):
        vals = list(struct.unpack_from(">%df" % n, self.b, self.i))
        self.i += 4 * n
        return vals

    def shorts(self):
        n = self.varint()
        vals = list(struct.unpack_from(">%dh" % n, self.b, self.i))
        self.i += 2 * n
        return vals


def rgba8888(v: int) -> str:
    return "%08x" % (v & 0xFFFFFFFF)


def rgb888(v: int) -> str:
    return "%06x" % (v & 0xFFFFFF)


def read_vertices(r: Reader, vertex_count: int):
    """Returns (vertices, weighted). Weighted vertices are the JSON layout:
    [boneCount, boneIndex, x, y, weight, ...] per vertex."""
    n = vertex_count << 1
    if not r.boolean():
        return r.floats(n), False
    out = []
    for _ in range(vertex_count):
        bone_count = r.varint()
        out.append(bone_count)
        for _ in range(bone_count):
            out.append(r.varint())
            out.extend(r.floats(3))
    return out, True


def read_curve(r: Reader, frame: dict):
    t = r.byte()
    if t == CURVE_STEPPED:
        frame["curve"] = "stepped"
    elif t == CURVE_BEZIER:
        cx1, cy1, cx2, cy2 = r.floats(4)
        frame["curve"] = cx1
        frame["c2"] = cy1
        frame["c3"] = cx2
        frame["c4"] = cy2
    elif t != CURVE_LINEAR:
        raise ValueError("bad curve type %d at %d" % (t, r.i))


def read_attachment(r: Reader, ctx: dict, skin_name: str, slot_index: int, attachment_name: str, nonessential: bool):
    name = r.string_ref()
    if name is None:
        name = attachment_name
    kind = ATTACHMENT_TYPES[r.byte()]
    a = {}
    if kind != "region":
        a["type"] = kind
    if name != attachment_name:
        a["name"] = name
    if kind == "region":
        path = r.string_ref()
        a["rotation"], a["x"], a["y"], a["scaleX"], a["scaleY"], a["width"], a["height"] = r.floats(7)
        a["color"] = rgba8888(r.int32())
        if path is not None and path != name:
            a["path"] = path
    elif kind == "boundingbox":
        vc = r.varint()
        a["vertexCount"] = vc
        a["vertices"], _ = read_vertices(r, vc)
        if nonessential:
            a["color"] = rgba8888(r.int32())
    elif kind == "mesh":
        path = r.string_ref()
        a["color"] = rgba8888(r.int32())
        vc = r.varint()
        a["uvs"] = r.floats(vc << 1)
        a["triangles"] = r.shorts()
        a["vertices"], _ = read_vertices(r, vc)
        a["hull"] = r.varint()
        if nonessential:
            a["edges"] = r.shorts()
            a["width"], a["height"] = r.floats(2)
        if path is not None and path != name:
            a["path"] = path
        ctx["meshes"][(skin_name, slot_index, name)] = a
    elif kind == "linkedmesh":
        path = r.string_ref()
        a["color"] = rgba8888(r.int32())
        skin = r.string_ref()
        a["parent"] = r.string_ref()
        a["deform"] = r.boolean()
        if nonessential:
            a["width"], a["height"] = r.floats(2)
        if skin is not None:
            a["skin"] = skin
        if path is not None and path != name:
            a["path"] = path
    elif kind == "path":
        a["closed"] = r.boolean()
        a["constantSpeed"] = r.boolean()
        vc = r.varint()
        a["vertexCount"] = vc
        a["vertices"], _ = read_vertices(r, vc)
        a["lengths"] = r.floats(vc // 3)
        if nonessential:
            a["color"] = rgba8888(r.int32())
    elif kind == "point":
        a["rotation"], a["x"], a["y"] = r.floats(3)
        if nonessential:
            a["color"] = rgba8888(r.int32())
    elif kind == "clipping":
        a["end"] = ctx["slots"][r.varint()]["name"]
        vc = r.varint()
        a["vertexCount"] = vc
        a["vertices"], _ = read_vertices(r, vc)
        if nonessential:
            a["color"] = rgba8888(r.int32())
    return a


def read_skin(r: Reader, ctx: dict, default: bool, nonessential: bool):
    skin = {}
    if default:
        slot_count = r.varint()
        if slot_count == 0:
            return None
        skin["name"] = "default"
    else:
        skin["name"] = r.string_ref()
        for key, table in (("bones", ctx["bones"]), ("ik", ctx["ik"]), ("transform", ctx["transform"]), ("path", ctx["path"])):
            n = r.varint()
            if n:
                skin[key] = [table[r.varint()]["name"] for _ in range(n)]
        slot_count = r.varint()
    attachments = {}
    for _ in range(slot_count):
        slot_index = r.varint()
        slot_name = ctx["slots"][slot_index]["name"]
        entries = {}
        for _ in range(r.varint()):
            att_name = r.string_ref()
            att = read_attachment(r, ctx, skin["name"], slot_index, att_name, nonessential)
            if att is not None:
                entries[att_name] = att
        attachments[slot_name] = entries
    skin["attachments"] = attachments
    return skin


def read_animation(r: Reader, ctx: dict, nonessential: bool) -> dict:
    anim = {}
    # slots
    slots = {}
    for _ in range(r.varint()):
        slot = ctx["slots"][r.varint()]["name"]
        timelines = {}
        for _ in range(r.varint()):
            t = r.byte()
            frame_count = r.varint()
            frames = []
            if t == 0:  # attachment
                for _ in range(frame_count):
                    f = {"time": r.float()}
                    f["name"] = r.string_ref()
                    frames.append(f)
                timelines["attachment"] = frames
            elif t == 1:  # color
                for fi in range(frame_count):
                    f = {"time": r.float(), "color": rgba8888(r.int32())}
                    if fi < frame_count - 1:
                        read_curve(r, f)
                    frames.append(f)
                timelines["color"] = frames
            elif t == 2:  # two color
                for fi in range(frame_count):
                    f = {"time": r.float(), "light": rgba8888(r.int32()), "dark": rgb888(r.int32())}
                    if fi < frame_count - 1:
                        read_curve(r, f)
                    frames.append(f)
                timelines["twoColor"] = frames
            else:
                raise ValueError("bad slot timeline %d" % t)
        slots[slot] = timelines
    if slots:
        anim["slots"] = slots
    # bones
    bones = {}
    for _ in range(r.varint()):
        bone = ctx["bones"][r.varint()]["name"]
        timelines = {}
        for _ in range(r.varint()):
            t = r.byte()
            frame_count = r.varint()
            frames = []
            if t == 0:
                for fi in range(frame_count):
                    f = {"time": r.float(), "angle": r.float()}
                    if fi < frame_count - 1:
                        read_curve(r, f)
                    frames.append(f)
                timelines["rotate"] = frames
            elif t in (1, 2, 3):
                for fi in range(frame_count):
                    f = {"time": r.float()}
                    f["x"], f["y"] = r.floats(2)
                    if fi < frame_count - 1:
                        read_curve(r, f)
                    frames.append(f)
                timelines[("translate", "scale", "shear")[t - 1]] = frames
            else:
                raise ValueError("bad bone timeline %d" % t)
        bones[bone] = timelines
    if bones:
        anim["bones"] = bones
    # ik
    ik = {}
    for _ in range(r.varint()):
        name = ctx["ik"][r.varint()]["name"]
        frame_count = r.varint()
        frames = []
        for fi in range(frame_count):
            f = {"time": r.float(), "mix": r.float(), "softness": r.float()}
            f["bendPositive"] = r.sbyte() > 0
            f["compress"] = r.boolean()
            f["stretch"] = r.boolean()
            if fi < frame_count - 1:
                read_curve(r, f)
            frames.append(f)
        ik[name] = frames
    if ik:
        anim["ik"] = ik
    # transform
    transform = {}
    for _ in range(r.varint()):
        name = ctx["transform"][r.varint()]["name"]
        frame_count = r.varint()
        frames = []
        for fi in range(frame_count):
            f = {"time": r.float()}
            f["rotateMix"], f["translateMix"], f["scaleMix"], f["shearMix"] = r.floats(4)
            if fi < frame_count - 1:
                read_curve(r, f)
            frames.append(f)
        transform[name] = frames
    if transform:
        anim["transform"] = transform
    # path
    path = {}
    for _ in range(r.varint()):
        name = ctx["path"][r.varint()]["name"]
        timelines = {}
        for _ in range(r.varint()):
            t = r.byte()
            frame_count = r.varint()
            frames = []
            if t in (0, 1):
                key = "position" if t == 0 else "spacing"
                for fi in range(frame_count):
                    f = {"time": r.float(), key: r.float()}
                    if fi < frame_count - 1:
                        read_curve(r, f)
                    frames.append(f)
                timelines[key] = frames
            elif t == 2:
                for fi in range(frame_count):
                    f = {"time": r.float()}
                    f["rotateMix"], f["translateMix"] = r.floats(2)
                    if fi < frame_count - 1:
                        read_curve(r, f)
                    frames.append(f)
                timelines["mix"] = frames
            else:
                raise ValueError("bad path timeline %d" % t)
        path[name] = timelines
    if path:
        anim["path"] = path
    # deform
    deform = {}
    for _ in range(r.varint()):
        skin = ctx["skins"][r.varint()]["name"]
        per_slot = {}
        for _ in range(r.varint()):
            slot = ctx["slots"][r.varint()]["name"]
            per_att = {}
            for _ in range(r.varint()):
                att_name = r.string_ref()
                frame_count = r.varint()
                frames = []
                for fi in range(frame_count):
                    f = {"time": r.float()}
                    end = r.varint()
                    if end != 0:
                        start = r.varint()
                        f["offset"] = start
                        f["vertices"] = r.floats(end)
                    if fi < frame_count - 1:
                        read_curve(r, f)
                    frames.append(f)
                per_att[att_name] = frames
            per_slot[slot] = per_att
        deform[skin] = per_slot
    if deform:
        anim["deform"] = deform
    # draw order
    n = r.varint()
    if n:
        frames = []
        for _ in range(n):
            f = {"time": r.float()}
            offsets = []
            for _ in range(r.varint()):
                offsets.append({"slot": ctx["slots"][r.varint()]["name"], "offset": r.varint()})
            if offsets:
                f["offsets"] = offsets
            frames.append(f)
        anim["drawOrder"] = frames
    # events
    n = r.varint()
    if n:
        frames = []
        for _ in range(n):
            f = {"time": r.float()}
            ev = ctx["events"][r.varint()]
            f["name"] = ev["name"]
            f["int"] = r.varint(False)
            f["float"] = r.float()
            if r.boolean():
                f["string"] = r.string()
            if ev.get("audio"):
                f["volume"], f["balance"] = r.floats(2)
            frames.append(f)
        anim["events"] = frames
    return anim


def read_skeleton(data: bytes) -> dict:
    r = Reader(data)
    out = {}
    sk = {"hash": r.string(), "spine": r.string()}
    sk["x"], sk["y"], sk["width"], sk["height"] = r.floats(4)
    nonessential = r.boolean()
    if nonessential:
        sk["fps"] = r.float()
        sk["images"] = r.string()
        sk["audio"] = r.string()
    out["skeleton"] = sk
    r.strings = [r.string() for _ in range(r.varint())]
    ctx = {"meshes": {}}
    # bones
    bones = []
    for i in range(r.varint()):
        b = {"name": r.string()}
        if i > 0:
            b["parent"] = bones[r.varint()]["name"]
        b["rotation"], b["x"], b["y"], b["scaleX"], b["scaleY"], b["shearX"], b["shearY"], b["length"] = r.floats(8)
        mode = TRANSFORM_MODES[r.varint()]
        if mode != "normal":
            b["transform"] = mode
        if r.boolean():
            b["skin"] = True
        if nonessential:
            b["color"] = rgba8888(r.int32())
        bones.append(b)
    ctx["bones"] = bones
    out["bones"] = bones
    # slots
    slots = []
    for _ in range(r.varint()):
        s = {"name": r.string(), "bone": bones[r.varint()]["name"]}
        s["color"] = rgba8888(r.int32())
        dark = r.int32()
        if dark != -1:
            s["dark"] = rgb888(dark)
        att = r.string_ref()
        if att is not None:
            s["attachment"] = att
        blend = BLEND_MODES[r.varint()]
        if blend != "normal":
            s["blend"] = blend
        slots.append(s)
    ctx["slots"] = slots
    out["slots"] = slots
    # ik
    ik = []
    for _ in range(r.varint()):
        c = {"name": r.string(), "order": r.varint()}
        if r.boolean():
            c["skin"] = True
        c["bones"] = [bones[r.varint()]["name"] for _ in range(r.varint())]
        c["target"] = bones[r.varint()]["name"]
        c["mix"] = r.float()
        c["softness"] = r.float()
        c["bendPositive"] = r.sbyte() > 0
        c["compress"] = r.boolean()
        c["stretch"] = r.boolean()
        c["uniform"] = r.boolean()
        ik.append(c)
    ctx["ik"] = ik
    if ik:
        out["ik"] = ik
    # transform
    transform = []
    for _ in range(r.varint()):
        c = {"name": r.string(), "order": r.varint()}
        if r.boolean():
            c["skin"] = True
        c["bones"] = [bones[r.varint()]["name"] for _ in range(r.varint())]
        c["target"] = bones[r.varint()]["name"]
        c["local"] = r.boolean()
        c["relative"] = r.boolean()
        c["rotation"], c["x"], c["y"], c["scaleX"], c["scaleY"], c["shearY"] = r.floats(6)
        c["rotateMix"], c["translateMix"], c["scaleMix"], c["shearMix"] = r.floats(4)
        transform.append(c)
    ctx["transform"] = transform
    if transform:
        out["transform"] = transform
    # path
    path = []
    for _ in range(r.varint()):
        c = {"name": r.string(), "order": r.varint()}
        if r.boolean():
            c["skin"] = True
        c["bones"] = [bones[r.varint()]["name"] for _ in range(r.varint())]
        c["target"] = slots[r.varint()]["name"]
        c["positionMode"] = POSITION_MODES[r.varint()]
        c["spacingMode"] = SPACING_MODES[r.varint()]
        c["rotateMode"] = ROTATE_MODES[r.varint()]
        c["rotation"], c["position"], c["spacing"], c["rotateMix"], c["translateMix"] = r.floats(5)
        path.append(c)
    ctx["path"] = path
    if path:
        out["path"] = path
    # skins
    skins = []
    ctx["skins"] = skins
    default = read_skin(r, ctx, True, nonessential)
    if default is not None:
        skins.append(default)
    for _ in range(r.varint()):
        skins.append(read_skin(r, ctx, False, nonessential))
    out["skins"] = skins
    # events
    events = []
    out_events = {}
    for _ in range(r.varint()):
        name = r.string_ref()
        e = {"name": name}
        e["int"] = r.varint(False)
        e["float"] = r.float()
        s = r.string()
        if s is not None:
            e["string"] = s
        audio = r.string()
        if audio is not None:
            e["audio"] = audio
            e["volume"], e["balance"] = r.floats(2)
        events.append(e)
        out_events[name] = {k: v for k, v in e.items() if k != "name"}
    ctx["events"] = events
    if out_events:
        out["events"] = out_events
    # animations
    animations = {}
    for _ in range(r.varint()):
        name = r.string()
        animations[name] = read_animation(r, ctx, nonessential)
    out["animations"] = animations
    if r.i != len(data):
        raise ValueError("trailing bytes: read %d of %d" % (r.i, len(data)))
    return out


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    data = read_skeleton(open(argv[1], "rb").read())
    json.dump(data, open(argv[2], "w"), indent=1)
    print("%s -> %s: %d bones, %d slots, %d skins, %d animations" % (
        argv[1], argv[2], len(data["bones"]), len(data["slots"]), len(data["skins"]), len(data["animations"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
