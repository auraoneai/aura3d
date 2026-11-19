"""Author a jointed, metre-scale armillary instrument and export its editable GLB."""

import argparse
import json
import math
import struct
from pathlib import Path
from collections import defaultdict
import numpy as np
from scipy.spatial.transform import Rotation
from PIL import Image
from io import BytesIO
from hashlib import sha256

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, required=True, help="Destination GLB")
parser.add_argument(
    "--pedestal",
    type=Path,
    default=Path(__file__).with_name("pedestal.glb"),
    help="Textured enamel pedestal source GLB",
)
args = parser.parse_args()
out = args.output
out.parent.mkdir(parents=True, exist_ok=True)
tau = math.tau


def unit(v):
    v = np.asarray(v, dtype=float)
    return v / max(np.linalg.norm(v), 1e-8)


def mat(name, color, metal, rough, emission=None):
    m = {
        "name": name,
        "pbrMetallicRoughness": {
            "baseColorFactor": [*color, 1],
            "metallicFactor": metal,
            "roughnessFactor": rough,
        },
    }
    if emission:
        m["emissiveFactor"] = emission
    materials.append(m)
    return len(materials) - 1


materials = []
brass = mat("Brushed champagne brass", (0.76, 0.46, 0.16), 0.77, 0.36)
gold = mat("Diamond turned edges", (0.99, 0.72, 0.38), 0.82, 0.21)
darkgold = mat("Oil rubbed bronze", (0.235, 0.115, 0.04), 0.72, 0.32)
ceramic = mat("Midnight blue enamel", (0.023, 0.049, 0.077), 0.42, 0.22)
gunmetal = mat("Blackened steel", (0.036, 0.053, 0.063), 0.69, 0.35)
silver = mat("Polished nickel", (0.65, 0.75, 0.77), 0.83, 0.23)
ink = mat("Recessed calibration marks", (0.034, 0.031, 0.026), 0.21, 0.56)
mint = mat("Sea glass enamel", (0.09, 0.67, 0.56), 0.38, 0.21, [0.008, 0.07, 0.045])
core = [
    mat("Prism / " + name, rgb, 0.42, rough, em)
    for name, rgb, rough, em in [
        ("petrol", (0.008, 0.13, 0.155), 0.17, [0.005, 0.045, 0.047]),
        ("malachite", (0.012, 0.4, 0.38), 0.13, [0.006, 0.10, 0.085]),
        ("peacock", (0.014, 0.31, 0.47), 0.14, [0.005, 0.078, 0.11]),
        ("aquamarine", (0.09, 0.74, 0.65), 0.18, [0.014, 0.19, 0.15]),
        ("pale cut", (0.39, 0.92, 0.77), 0.15, [0.06, 0.26, 0.18]),
    ]
]


class Part:
    def __init__(self, name, at=(0, 0, 0), angles=(0, 0, 0)):
        self.name = name
        self.at = at
        self.quat = Rotation.from_euler("xyz", angles, degrees=True).as_quat().tolist()
        self.batches = defaultdict(lambda: [[], [], [], []])

    def patch(self, m, p, n, uv, indices):
        dest = self.batches[m]
        ofs = len(dest[0])
        dest[0].extend(p)
        dest[1].extend(n)
        dest[2].extend(uv)
        dest[3].extend(i + ofs for i in indices)

    def tri(self, m, a, b, c):
        n = unit(np.cross(np.subtract(b, a), np.subtract(c, a)))
        self.patch(m, [a, b, c], [n] * 3, [(0, 0), (1, 0), (0, 1)], [0, 1, 2])

    def box(self, m, center, half, basis=None):
        B = np.eye(3) if basis is None else basis
        corners = [
            np.array(center) + B @ np.array([x * half[0], y * half[1], z * half[2]])
            for x, y, z in [
                (-1, -1, -1),
                (1, -1, -1),
                (1, 1, -1),
                (-1, 1, -1),
                (-1, -1, 1),
                (1, -1, 1),
                (1, 1, 1),
                (-1, 1, 1),
            ]
        ]
        for a, b, c, d in [
            (0, 3, 2, 1),
            (4, 5, 6, 7),
            (0, 1, 5, 4),
            (3, 7, 6, 2),
            (0, 4, 7, 3),
            (1, 2, 6, 5),
        ]:
            n = unit(np.cross(corners[b] - corners[a], corners[c] - corners[a]))
            self.patch(
                m,
                [corners[j] for j in [a, b, c, d]],
                [n] * 4,
                [(0, 0), (1, 0), (1, 1), (0, 1)],
                [0, 1, 2, 0, 2, 3],
            )

    def lathe(
        self, profile, center=(0, 0, 0), axis=(0, 0, 1), count=128, start=0, end=tau
    ):
        w = unit(axis)
        u = unit(np.cross((0, 1, 0) if abs(w[1]) < 0.95 else (0, 0, -1), w))
        v = np.cross(w, u)
        center = np.array(center)
        angles = np.linspace(start, end, count + 1)
        rad = np.array([math.cos(a) * u + math.sin(a) * v for a in angles])
        for (r0, z0, material), (r1, z1, _) in zip(profile, profile[1:]):
            slope = unit([z1 - z0, r0 - r1])
            normals = rad * slope[0] + w * slope[1]
            p = []
            n = []
            uv = []
            idx = []
            for i in range(count + 1):
                p.extend([center + rad[i] * r0 + w * z0, center + rad[i] * r1 + w * z1])
                n.extend([normals[i]] * 2)
                uv.extend([(i / count, 0), (i / count, 1)])
                if i < count:
                    j = 2 * i
                    idx.extend([j, j + 2, j + 3, j, j + 3, j + 1])
            self.patch(material, p, n, uv, idx)


def spindle(part, m, center, axis, radius, length):
    h = length * 0.5
    part.lathe(
        [
            (0, -h, m),
            (0.90 * radius, -h, m),
            (radius, -0.87 * h, m),
            (radius, 0.87 * h, m),
            (0.90 * radius, h, m),
            (0, h, m),
        ],
        center,
        axis,
        count=32,
    )


def ring(part, r, width, depth, ticks):
    lo = r - width / 2
    hi = r + width / 2
    z = depth / 2
    b = 0.009
    part.lathe(
        [
            (lo, -z + b, gold),
            (lo + b, -z, brass),
            (hi - b, -z, gold),
            (hi, -z + b, darkgold),
            (hi, z - b, gold),
            (hi - b, z, brass),
            (lo + b, z, gold),
            (lo, z - b, darkgold),
            (lo, -z + b, gold),
        ]
    )
    for i in range(ticks):
        a = tau * i / ticks
        radial = np.array([math.cos(a), math.sin(a), 0])
        tang = np.array([-math.sin(a), math.cos(a), 0])
        basis = np.stack([radial, tang, [0, 0, 1]], axis=1)
        major = i % 5 == 0
        length = width * (0.51 if major else 0.24)
        for direction in [-1, 1]:
            center = (hi - b - length / 2) * radial + np.array(
                [0, 0, direction * (z + 0.0002)]
            )
            part.box(
                ink, center, (length / 2, 0.005 if major else 0.0022, 0.0006), basis
            )
        if i % (ticks // 4) == 0:
            part.box(
                mint,
                (lo + width * 0.22) * radial + [0, 0, z + 0.001],
                (0.007, 0.031, 0.002),
                basis,
            )
    for sign in (-1, 1):
        spindle(
            part, darkgold, (sign * (r + 0.012), 0, 0), (1, 0, 0), depth * 1.04, 0.13
        )
        spindle(part, gold, (sign * (r + 0.072), 0, 0), (1, 0, 0), depth * 0.86, 0.044)
        spindle(
            part, silver, (sign * (r + 0.095), 0, 0), (1, 0, 0), depth * 0.49, 0.015
        )


base = Part("AzimuthPedestal")
base.lathe(
    [
        (0, 0, gunmetal),
        (0.68, 0, gunmetal),
        (0.76, 0.025, gold),
        (0.775, 0.041, ceramic),
        (0.775, 0.071, brass),
        (0.765, 0.080, darkgold),
        (0.74, 0.090, gunmetal),
        (0.60, 0.105, gunmetal),
        (0.49, 0.113, ceramic),
        (0.18, 0.325, gunmetal),
        (0.25, 0.347, brass),
        (0.327, 0.355, gold),
        (0.327, 0.378, gunmetal),
        (0.293, 0.39, brass),
        (0.29, 0.411, gold),
        (0.265, 0.429, brass),
        (0.225, 0.445, gunmetal),
        (0.18, 0.455, gunmetal),
        (0, 0.455, gunmetal),
    ],
    axis=(0, 1, 0),
)
for i in range(120):
    a = tau * i / 120
    radial = np.array([math.cos(a), 0, math.sin(a)])
    tan = np.array([-math.sin(a), 0, math.cos(a)])
    basis = np.stack((radial, [0, 1, 0], tan), axis=1)
    base.box(
        gold if i % 5 == 0 else silver,
        radial * 0.775 + [0, 0.055, 0],
        (0.004, 0.008 if i % 5 == 0 else 0.004, 0.003),
        basis,
    )
# Open fork joins the body to a pair of adjustable horizontal bearings.
fork = Part("MeridianFork", (0, 1.4, 0))
fork.lathe(
    [
        (1.06, -0.075, gold),
        (1.075, -0.095, ceramic),
        (1.15, -0.095, gold),
        (1.17, -0.075, ceramic),
        (1.17, 0.075, gold),
        (1.15, 0.095, ceramic),
        (1.075, 0.095, gold),
        (1.06, 0.075, ceramic),
        (1.06, -0.075, ceramic),
    ],
    count=96,
    start=math.pi,
    end=tau,
)
for sign in (-1, 1):
    spindle(fork, ceramic, (sign * 1.115, 0, 0), (1, 0, 0), 0.145, 0.215)
    spindle(fork, gold, (sign * 1.22, 0, 0), (1, 0, 0), 0.12, 0.045)
    spindle(fork, gunmetal, (sign * 1.25, 0, 0), (1, 0, 0), 0.079, 0.032)
outer = Part("GimbalOuter", (0, 1.4, 0), (19, -21, 7))
ring(outer, 1.035, 0.105, 0.058, 100)
middle = Part("GimbalMiddle", (0, 1.4, 0), (-15, 43, -24))
ring(middle, 0.882, 0.098, 0.057, 90)
inner = Part("GimbalInner", (0, 1.4, 0), (54, -26, 36))
ring(inner, 0.724, 0.073, 0.052, 80)
jewel = Part("PrismCore", (0, 1.4, 0), (0, 13, -10))


# Kite facets in alternating offset courses produce strong individual reflections.
def facetpoints(radius, y, rotation):
    return [
        np.array(
            [
                radius * math.cos(tau * i / 8 + rotation),
                y,
                radius * math.sin(tau * i / 8 + rotation),
            ]
        )
        for i in range(8)
    ]


low = facetpoints(0.25, -0.325, math.pi / 8)
waist = facetpoints(0.425, -0.068, 0)
shoulder = facetpoints(0.375, 0.235, math.pi / 8)
crown = facetpoints(0.178, 0.405, 0)
for i in range(8):
    j = (i + 1) % 8
    jewel.tri(core[(i * 2 + 2) % 5], (0, -0.60, 0), low[i], low[j])
    for h, (a, b) in enumerate([(low, waist), (waist, shoulder), (shoulder, crown)]):
        jewel.tri(core[(i + h * 2) % 5], a[i], b[i], b[j])
        jewel.tri(core[(i * 3 + h + 1) % 5], a[i], b[j], a[j])
    jewel.tri(core[(i + 3) % 5], crown[i], (0, 0.57, 0), crown[j])
for s in [-1, 1]:
    spindle(jewel, gold, (0, s * 0.573, 0), (0, 1, 0), 0.034, 0.08)
    spindle(jewel, darkgold, (0, s * 0.635, 0), (0, 1, 0), 0.017, 0.067)
parts = [base, fork, outer, middle, inner, jewel]
data = bytearray()
views = []
access = []
meshes = []
nodes = []


def buffer(rgb, target, ctype, kind, minimum=False):
    while len(data) % 4:
        data.append(0)
    arr = np.asarray(rgb, dtype="<f4" if ctype == 5126 else "<u2")
    off = len(data)
    data.extend(arr.tobytes())
    views.append(
        {"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes, "target": target}
    )
    item = {
        "bufferView": len(views) - 1,
        "componentType": ctype,
        "count": len(arr),
        "type": kind,
    }
    if minimum:
        item.update(min=arr.min(axis=0).tolist(), max=arr.max(axis=0).tolist())
    access.append(item)
    return len(access) - 1


for part in parts:
    prim = []
    for m, (p, n, uv, inds) in part.batches.items():
        prim.append(
            {
                "attributes": {
                    "POSITION": buffer(
                        np.asarray(p) * 0.984, 34962, 5126, "VEC3", True
                    ),
                    "NORMAL": buffer(n, 34962, 5126, "VEC3"),
                    "TEXCOORD_0": buffer(uv, 34962, 5126, "VEC2"),
                },
                "indices": buffer(inds, 34963, 5123, "SCALAR"),
                "material": m,
            }
        )
    meshes.append({"name": part.name, "primitives": prim})
    nodes.append(
        {
            "name": part.name,
            "mesh": len(meshes) - 1,
            "translation": list(part.at),
            "rotation": part.quat,
        }
    )
gltf = {
    "asset": {
        "version": "2.0",
        "generator": "AuraOne / Prism Observatory parametric instrument",
    },
    "scene": 0,
    "scenes": [{"name": "Prism Observatory", "nodes": list(range(len(parts)))}],
    "nodes": nodes,
    "meshes": meshes,
    "materials": materials,
    "buffers": [{"byteLength": len(data)}],
    "bufferViews": views,
    "accessors": access,
}
# High-frequency concentric tooling grain encoded in glTF metallic-roughness channels.
rng = np.random.default_rng(832219)
roughness = np.clip(
    rng.normal(226, 5, (256, 1)) + rng.normal(0, 2, (256, 256)), 0, 255
).astype(np.uint8)
pixels = np.full((256, 256, 3), 255, dtype=np.uint8)
pixels[:, :, 1] = roughness
image = BytesIO()
Image.fromarray(pixels).save(image, format="PNG", optimize=True)
png = image.getvalue()
while len(data) % 4:
    data.append(0)
views.append({"buffer": 0, "byteOffset": len(data), "byteLength": len(png)})
data.extend(png)
gltf["images"] = [
    {
        "name": "Turned brass roughness",
        "mimeType": "image/png",
        "bufferView": len(views) - 1,
    }
]
gltf["textures"] = [{"name": "Brushed metallic-roughness", "source": 0}]
materials[brass]["pbrMetallicRoughness"]["metallicRoughnessTexture"] = {"index": 0}
gltf["asset"]["extras"] = {
    "aura3d": {"orientation": {"forwardAxis": "+z", "upAxis": "+y"}, "units": "meters"}
}
# Preserve the reconstructed enamel pedestal's surface, metallic response, and relief.
# Its generated gimbals, core and pedestal were a single connected textured mesh.
# Fit the editable pre-cropped enamel band between the two collar flanges.
source_path = args.pedestal
source_raw = source_path.read_bytes()
source_len = struct.unpack_from("<I", source_raw, 12)[0]
sg = json.loads(source_raw[20 : 20 + source_len])
sbin = source_raw[28 + source_len :]
sm = sg["meshes"][0]["primitives"][0]


def read_source(index):
    a = sg["accessors"][index]
    v = sg["bufferViews"][a["bufferView"]]
    t = np.dtype({5123: "<u2", 5125: "<u4", 5126: "<f4"}[a["componentType"]])
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    return np.ndarray(
        (a["count"], n),
        dtype=t,
        buffer=sbin,
        offset=v.get("byteOffset", 0) + a.get("byteOffset", 0),
        strides=(v.get("byteStride", t.itemsize * n), t.itemsize),
    )


sp = read_source(sm["attributes"]["POSITION"])
sidx = read_source(sm["indices"]).reshape(-1, 3)
selected, ind = np.unique(sidx, return_inverse=True)
scale = np.array([1.30, 0.78, 1.30])
sp = (sp[selected] - [0, 0.15, 0.035]) * scale + [0, 0.082, 0]
sn = read_source(sm["attributes"]["NORMAL"])[selected] / scale
sn /= np.linalg.norm(sn, axis=1, keepdims=True)
suv = read_source(sm["attributes"]["TEXCOORD_0"])[selected]
img_offset = len(gltf["images"])
for i, img in enumerate(sg["images"]):
    v = sg["bufferViews"][img["bufferView"]]
    begin = v.get("byteOffset", 0)
    payload = sbin[begin : begin + v["byteLength"]]
    while len(data) % 4:
        data.append(0)
    views.append({"buffer": 0, "byteOffset": len(data), "byteLength": len(payload)})
    data.extend(payload)
    gltf["images"].append(
        {
            "name": [
                "Observatory enamel color",
                "Observatory enamel relief",
                "Observatory enamel metallic-roughness",
            ][i],
            "bufferView": len(views) - 1,
            "mimeType": "image/jpeg",
        }
    )
for tex in sg["textures"]:
    gltf["textures"].append({"source": img_offset + tex["source"]})
smat = sg["materials"][0]
smat["name"] = "Hand-finished midnight enamel pedestal"
for ref in [
    smat["pbrMetallicRoughness"]["baseColorTexture"],
    smat["pbrMetallicRoughness"]["metallicRoughnessTexture"],
    smat["normalTexture"],
]:
    ref["index"] += img_offset
materials.append(smat)
meshes[0]["primitives"].append(
    {
        "attributes": {
            "POSITION": buffer(sp, 34962, 5126, "VEC3", True),
            "NORMAL": buffer(sn, 34962, 5126, "VEC3"),
            "TEXCOORD_0": buffer(suv, 34962, 5126, "VEC2"),
        },
        "indices": buffer(ind.reshape(-1), 34963, 5123, "SCALAR"),
        "material": len(materials) - 1,
    }
)
print("Fal pedestal retains", len(sidx), "triangles", len(selected), "vertices")

gltf["buffers"][0]["byteLength"] = len(data)
raw = json.dumps(gltf, separators=(",", ":")).encode()
raw += b" " * (-len(raw) % 4)
data += bytes(-len(data) % 4)
out.write_bytes(
    struct.pack("<III", 0x46546C67, 2, 28 + len(raw) + len(data))
    + struct.pack("<II", len(raw), 0x4E4F534A)
    + raw
    + struct.pack("<II", len(data), 0x004E4942)
    + data
)
print(out, out.stat().st_size, sha256(out.read_bytes()).hexdigest())
