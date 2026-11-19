"""Articulate Idol's textured Ember Courier shell on the original clip skeleton.

Usage: python3 tools/idol/articulate-ember-courier.py normalized.glb character.glb
Requires numpy and scipy. Coordinates below are in the generated rig's bind space.
"""
import json
import struct
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.spatial import ConvexHull

source, dest = map(Path, sys.argv[1:])
raw = source.read_bytes()
json_size = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20:20 + json_size])
binary = bytearray(raw[28 + json_size:])
primitive = doc["meshes"][0]["primitives"][0]
types = {5126: "<f4", 5123: "<u2", 5125: "<u4"}
sizes = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read(index):
    accessor = doc["accessors"][index]
    view = doc["bufferViews"][accessor["bufferView"]]
    dtype = np.dtype(types[accessor["componentType"]])
    width = sizes[accessor["type"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return np.ndarray((accessor["count"], width), dtype, binary, offset,
                      (view.get("byteStride", width * dtype.itemsize), dtype.itemsize)).copy()


def append(values, shape, component, bounds=False):
    array = np.ascontiguousarray(values, dtype=types[component])
    binary.extend(bytes(-len(binary) % 4))
    view = {"buffer": 0, "byteOffset": len(binary), "byteLength": array.nbytes}
    binary.extend(array.tobytes())
    accessor = {"bufferView": len(doc["bufferViews"]), "type": shape,
                "count": len(array), "componentType": component}
    if bounds:
        accessor.update(min=array.min(0).tolist(), max=array.max(0).tolist())
    doc["bufferViews"].append(view)
    doc["accessors"].append(accessor)
    return len(doc["accessors"]) - 1


# BSP leaves use Idol joint indices. The cuts pass through neck, waist, hips,
# shoulders, elbows, wrists, knees and ankles in the source T-pose.
left_leg = (1, -.422, 22, (1, -.196, 21, 20))
right_leg = (1, -.416, 26, (1, -.196, 25, 24))
legs = (2, 0., left_leg, right_leg)
left_arm = (2, -.405, 9, (2, -.258, 8, 7))
right_arm = (2, .246, 14, (2, .402, 15, 16))
upper = (2, -.122, left_arm, (2, .122, (1, .355, 3, 5), right_arm))
tree = (1, .052, legs, (1, .16, 0, upper))
faces = defaultdict(list)
sections = defaultdict(list)


def divide(poly, branch, planes=()):
    if isinstance(branch, int):
        for i in range(1, len(poly) - 1):
            faces[branch].append([poly[0], poly[i], poly[i + 1]])
        for axis, level, direction in planes:
            sections[branch, axis, level, direction].extend(
                v[:3] for v in poly if abs(v[axis] - level) < 1e-7)
        return
    axis, level, low, high = branch
    dist = [v[axis] - level for v in poly]
    if max(dist) <= 0:
        divide(poly, low, planes)
        return
    if min(dist) >= 0:
        divide(poly, high, planes)
        return
    halves = [[], []]
    for i, v in enumerate(poly):
        prev = poly[i - 1]
        if dist[i - 1] * dist[i] < 0:
            intersection = prev + (v - prev) * (dist[i - 1] / (dist[i - 1] - dist[i]))
            for half in halves:
                half.append(intersection)
        if dist[i] <= 0:
            halves[0].append(v)
        if dist[i] >= 0:
            halves[1].append(v)
    for half, child, direction in zip(halves, (low, high), (1, -1)):
        if len(half) >= 3:
            divide(half, child, planes + ((axis, level, direction),))


attrs = primitive["attributes"]
verts = np.column_stack([read(attrs[k]) for k in ("POSITION", "NORMAL", "TEXCOORD_0", "TANGENT")]).astype(float)
for tri in read(primitive["indices"]).reshape(-1, 3):
    divide(verts[tri], tree)

# Raised graphite inserts close each shell and overlap the neighbouring piece
# through its range of motion. The source PBR UVs remain on the outer shell.
seal_material = len(doc["materials"])
doc["materials"].append({"name": "Articulated graphite joint seals", "doubleSided": True,
                         "pbrMetallicRoughness": {"baseColorFactor": [.065, .075, .084, 1],
                                                 "metallicFactor": .22, "roughnessFactor": .6}})
caps = defaultdict(list)
for (joint, axis, level, direction), samples in sections.items():
    pts = np.unique(np.round(samples, 7), axis=0)
    if len(pts) < 3:
        continue
    uv = np.delete(pts, axis, axis=1)
    if np.linalg.matrix_rank(uv - uv.mean(0)) < 2:
        continue
    ring = pts[ConvexHull(uv).vertices]
    middle = ring.mean(0)
    radius = np.linalg.norm(ring - middle, axis=1).mean()
    tip = middle.copy()
    tip[axis] += direction * min(.024, radius * .55)
    for a, b in zip(ring, np.roll(ring, -1, axis=0)):
        normal = np.cross(b - a, tip - a)
        if normal[axis] * direction < 0:
            a, b, normal = b, a, -normal
        normal /= max(1e-12, np.linalg.norm(normal))
        caps[joint].append([np.r_[v, normal, 0., 0., 1., 0., 0., 1.] for v in (a, b, tip)])


def part(collection, material):
    rows = []
    for joint, triangles in collection.items():
        for triangle in triangles:
            rows.extend([np.r_[v, joint] for v in triangle])
    data, inverse = np.unique(np.asarray(rows).astype("float32"), axis=0, return_inverse=True)
    normal = data[:, 3:6]
    normal /= np.maximum(1e-12, np.linalg.norm(normal, axis=1, keepdims=True))
    tangent = data[:, 8:12].copy()
    tangent[:, :3] /= np.maximum(1e-12, np.linalg.norm(tangent[:, :3], axis=1, keepdims=True))
    tangent[:, 3] = np.where(tangent[:, 3] < 0, -1, 1)
    j = np.zeros((len(data), 4)); j[:, 0] = data[:, -1]
    w = np.zeros((len(data), 4)); w[:, 0] = 1
    return {"attributes": {"POSITION": append(data[:, :3], "VEC3", 5126, True),
                           "NORMAL": append(normal, "VEC3", 5126),
                           "TEXCOORD_0": append(data[:, 6:8], "VEC2", 5126),
                           "TANGENT": append(tangent, "VEC4", 5126),
                           "JOINTS_0": append(j, "VEC4", 5123),
                           "WEIGHTS_0": append(w, "VEC4", 5126)},
            "indices": append(inverse.flatten(), "SCALAR", 5123 if len(data) < 65536 else 5125),
            "material": material}


doc["meshes"][0]["primitives"] = [part(faces, primitive.get("material", 0)), part(caps, seal_material)]
binary.extend(bytes(-len(binary) % 4))
doc["buffers"][0]["byteLength"] = len(binary)
header = json.dumps(doc, separators=(",", ":")).encode()
header += b" " * (-len(header) % 4)
dest.write_bytes(struct.pack("<4sIIII", b"glTF", 2, 28 + len(header) + len(binary),
                             len(header), 0x4e4f534a) + header +
                 struct.pack("<II", len(binary), 0x004e4942) + binary)
