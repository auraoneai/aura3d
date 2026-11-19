"""Generate Relay R6. Run with Python 3 and NumPy; all dimensions are metres."""

import hashlib
import json
import math
from pathlib import Path
import struct
from collections import defaultdict

import numpy as np

DEST = Path(__file__).resolve().parents[2] / "marketing/public/models/relay-workcell"
TAU = math.tau
# Material parameters are in linear RGB, glTF metallic-roughness convention.
PBR = [
    ("Ceramic ivory powder coat", [0.83, 0.78, 0.66], 0.23, 0.30),
    ("Signal orange cast enclosure", [0.93, 0.145, 0.023], 0.25, 0.29),
    ("Graphite anodized alloy", [0.051, 0.059, 0.065], 0.66, 0.34),
    ("Machined stainless steel", [0.59, 0.62, 0.64], 0.84, 0.24),
    ("EPDM loom and gaskets", [0.013, 0.017, 0.022], 0.06, 0.62),
    ("Laser etched charcoal", [0.022, 0.030, 0.037], 0.23, 0.41),
    ("Blue optical window", [0.008, 0.37, 0.82], 0.24, 0.18),
]
IVORY, ORANGE, ALLOY, STEEL, BLACK, INK, BLUE = range(len(PBR))
# Parent, local origin, revolute/prismatic direction.
CHAIN = {
    "Base": (None, [0, 0, 0], None),
    "J1": ("Base", [0, 0.12, 0], "Y"),
    "J2": ("J1", [0, 0.19, 0], "Z"),
    "J3": ("J2", [0, 0.55, 0], "Z"),
    "J4": ("J3", [0, 0.42, 0], "Y"),
    "J5": ("J4", [0, 0.09, 0], "Z"),
    "J6": ("J5", [0, 0.08, 0], "Y"),
    "JawL": ("J6", [0.022, 0.07, 0], "+X"),
    "JawR": ("J6", [-0.022, 0.07, 0], "-X"),
    "TCP": ("J6", [0, 0.15, 0], None),
}


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


class Link:
    def __init__(self):
        self.batches = defaultdict(lambda: [[], [], []])

    def patch(self, material, points, normals, indices):
        p, n, i = self.batches[material]
        i.extend(np.asarray(indices).ravel() + len(p))
        p.extend(points)
        n.extend(normals)

    def strip(self, material, lo, hi, normals_lo, normals_hi):
        count = len(lo)
        idx = np.arange(count)
        nex = (idx + 1) % count
        triangles = np.stack(
            [idx, nex, nex + count, idx, nex + count, idx + count], axis=1
        )
        self.patch(
            material,
            np.vstack([lo, hi]),
            np.vstack([normals_lo, normals_hi]),
            triangles,
        )

    def rings(self, material, rings, sharp=False):
        """Rings wind CCW when viewed from the terminal end."""
        rings = np.array(rings)
        around = np.roll(rings, -1, axis=1) - np.roll(rings, 1, axis=1)
        along = np.gradient(rings, axis=0)
        normals = unit(np.cross(around, along))
        for k in range(len(rings) - 1):
            a, b = rings[k : k + 2]
            if sharp:
                na, nb = [unit(np.cross(side, b - a)) for side in around[k : k + 2]]
            else:
                na, nb = normals[k : k + 2]
            self.strip(material, a, b, na, nb)
        for end in [0, -1]:
            ring = rings[end] if end == -1 else rings[end][::-1]
            face = unit(
                np.cross(
                    ring[len(ring) // 3] - ring[0], ring[2 * len(ring) // 3] - ring[0]
                )
            )
            tris = [[0, i, i + 1] for i in range(1, len(ring) - 1)]
            self.patch(material, ring, np.tile(face, (len(ring), 1)), tris)

    def cast(self, material, rows, exponent=0.64, count=36):
        # Y stations control the taper, offset and corner radius of castings.
        t = np.arange(count) * TAU / count
        sx = np.sign(np.cos(t)) * abs(np.cos(t)) ** exponent
        sz = -np.sign(np.sin(t)) * abs(np.sin(t)) ** exponent
        self.rings(
            material,
            [
                np.stack([x + rx * sx, np.full(count, y), z + rz * sz], axis=1)
                for y, rx, rz, x, z in rows
            ],
        )

    def block(self, material, center, size, bevel=0.0018):
        x, y, z = center
        w, h, d = np.array(size) / 2
        b = min(bevel, w * 0.4, h * 0.4, d * 0.4)
        self.cast(
            material,
            [
                (y - h, w - b, d - b, x, z),
                (y - h + b, w, d, x, z),
                (y + h - b, w, d, x, z),
                (y + h, w - b, d - b, x, z),
            ],
            0.15,
            24,
        )

    def turn(self, material, center, axis, profile, count=40):
        w = unit(np.array(axis, dtype=float))
        u = unit(np.cross([0, 1, 0] if abs(w[1]) < 0.95 else [0, 0, 1], w))
        v = np.cross(w, u)
        t = np.arange(count) * TAU / count
        radial = np.outer(np.cos(t), u) + np.outer(np.sin(t), v)
        self.rings(
            material,
            [center + offset * w + radius * radial for offset, radius in profile],
            True,
        )

    def disk(self, material, center, axis, radius, height, count=40):
        bevel = min(height * 0.22, radius * 0.09)
        self.turn(
            material,
            center,
            axis,
            [
                (-height / 2, radius - bevel),
                (-height / 2 + bevel, radius),
                (height / 2 - bevel, radius),
                (height / 2, radius - bevel),
            ],
            count,
        )

    def wire(self, material, points, radius, count=8):
        p = np.asarray(points, dtype=float)
        tangents = unit(np.gradient(p, axis=0))
        guide = np.eye(3)[np.argmin(np.max(abs(tangents), axis=0))]
        u = unit(np.cross(guide, tangents))
        v = np.cross(tangents, u)
        t = np.arange(count) * TAU / count
        self.rings(
            material,
            p[:, None, :]
            + radius
            * (
                u[:, None, :] * np.cos(t)[None, :, None]
                + v[:, None, :] * np.sin(t)[None, :, None]
            ),
        )

    def cable(self, controls, radius, color=BLACK):
        a, b, c, d = np.asarray(controls)
        t = np.linspace(0, 1, 18)[:, None]
        self.wire(
            color,
            (1 - t) ** 3 * a
            + 3 * (1 - t) ** 2 * t * b
            + 3 * (1 - t) * t * t * c
            + t**3 * d,
            radius,
        )


X, Y, Z = np.eye(3)
parts = {name: Link() for name in CHAIN if name != "TCP"}


def socket(link, center, axis, radius):
    p, w = np.array(center), np.array(axis)
    link.disk(STEEL, p, w, radius, radius * 0.44, 12)
    link.disk(INK, p + w * radius * 0.221, w, radius * 0.52, radius * 0.06, 6)


def reduction(link, center, radius, depth):
    p = np.array(center)
    link.disk(ALLOY, p, Z, radius, depth)
    for side in [-1, 1]:
        w = Z * side
        face = p + w * depth / 2
        link.disk(STEEL, face, w, radius * 0.92, 0.004)
        link.disk(BLACK, face + w * 0.0027, w, radius * 0.86, 0.003)
        link.disk(IVORY, face + w * 0.005, w, radius * 0.72, 0.009)
        link.disk(ALLOY, face + w * 0.0098, w, radius * 0.40, 0.003)
        for a in np.arange(8) * TAU / 8 + TAU / 16:
            socket(
                link,
                face + w * 0.0025 + radius * 0.81 * (math.cos(a) * X + math.sin(a) * Y),
                w,
                radius * 0.051,
            )
        link.block(
            ORANGE,
            face + w * 0.0118 + Y * radius * 0.015,
            [radius * 0.42, radius * 0.075, 0.0016],
            0.0005,
        )


# Laser-marked single-line block alphabet, cut directly into the graphic face.
GLYPHS = {
    "R": [
        [
            (0, 0),
            (0, 1),
            (0.61, 1),
            (0.77, 0.82),
            (0.75, 0.62),
            (0.57, 0.50),
            (0, 0.50),
        ],
        [(0.42, 0.50), (0.79, 0)],
    ],
    "E": [[(0.76, 1), (0, 1), (0, 0), (0.76, 0)], [(0, 0.5), (0.62, 0.5)]],
    "L": [[(0, 1), (0, 0), (0.70, 0)]],
    "A": [[(0, 0), (0.36, 1), (0.48, 1), (0.84, 0)], [(0.15, 0.38), (0.69, 0.38)]],
    "Y": [[(0, 1), (0.37, 0.53), (0.76, 1)], [(0.37, 0.53), (0.37, 0)]],
    "6": [
        [
            (0.69, 1),
            (0.24, 1),
            (0, 0.75),
            (0, 0.17),
            (0.18, 0),
            (0.62, 0),
            (0.77, 0.18),
            (0.77, 0.44),
            (0.59, 0.58),
            (0, 0.58),
        ]
    ],
}


def lettering(link, text, origin, height):
    # Up the side of the machine: baseline follows +Y, ascenders point -X.
    origin = np.array(origin)
    for i, letter in enumerate(text):
        for stroke in GLYPHS[letter]:
            for a, b in zip(stroke, stroke[1:]):
                pts = [
                    origin + np.array([-v, (i * 1.13 + u), 0]) * height
                    for u, v in (a, b)
                ]
                link.wire(INK, pts, height * 0.043, 6)


def geometry():
    base = parts["Base"]
    base.cast(
        ALLOY,
        [
            (0.001, 0.155, 0.142, 0, 0),
            (0.006, 0.162, 0.149, 0, 0),
            (0.023, 0.162, 0.149, 0, 0),
            (0.030, 0.151, 0.139, 0, 0),
        ],
        0.34,
    )
    for x in [-0.124, 0.124]:
        for z in [-0.112, 0.112]:
            socket(base, [x, 0.030, z], Y, 0.0095)
    base.turn(
        IVORY,
        np.zeros(3),
        Y,
        [
            (0.026, 0.127),
            (0.031, 0.137),
            (0.044, 0.138),
            (0.082, 0.119),
            (0.094, 0.115),
            (0.100, 0.105),
        ],
    )
    base.disk(ALLOY, [0, 0.108, 0], Y, 0.109, 0.021)
    base.disk(STEEL, [0, 0.119, 0], Y, 0.103, 0.004)
    for i in range(30):
        a = i * TAU / 30
        base.disk(
            INK, [0.122 * math.cos(a), 0.079, 0.122 * math.sin(a)], Y, 0.002, 0.005, 8
        )

    turret = parts["J1"]
    turret.cast(
        ORANGE,
        [
            (-0.001, 0.101, 0.100, 0, 0),
            (0.009, 0.108, 0.104, 0, 0),
            (0.029, 0.110, 0.105, 0, 0),
            (0.062, 0.100, 0.097, 0.002, 0),
            (0.082, 0.088, 0.088, 0.006, 0),
        ],
    )
    # Forked turret leaves the shoulder barrel clear between the cheeks.
    for s in [-1, 1]:
        turret.cast(
            ORANGE,
            [
                (0.044, 0.085, 0.029, 0, s * 0.062),
                (0.062, 0.089, 0.031, 0, s * 0.064),
                (0.13, 0.067, 0.025, -0.005, s * 0.081),
                (0.191, 0.065, 0.023, 0, s * 0.085),
                (0.221, 0.054, 0.019, 0.001, s * 0.085),
                (0.244, 0.032, 0.016, 0, s * 0.084),
                (0.250, 0.013, 0.013, 0, s * 0.084),
            ],
            0.79,
        )
    turret.block(ALLOY, [0.095, 0.04, 0.018], [0.025, 0.044, 0.069], 0.005)
    for z in [0, 0.034]:
        turret.disk(STEEL, [0.111, 0.042, z], X, 0.013, 0.012, 12)
        turret.disk(BLACK, [0.118, 0.042, z], X, 0.009, 0.007, 16)

    upper = parts["J2"]
    reduction(upper, [0, 0, 0], 0.073, 0.218)
    # The upper casting runs outboard on the +Z side of the elbow.
    upper.cast(
        IVORY,
        [
            (0.006, 0.054, 0.050, 0, 0.010),
            (0.028, 0.079, 0.062, -0.006, 0.012),
            (0.069, 0.092, 0.064, -0.011, 0.014),
            (0.122, 0.087, 0.057, -0.018, 0.020),
            (0.195, 0.075, 0.048, -0.019, 0.028),
            (0.325, 0.054, 0.041, -0.013, 0.036),
            (0.405, 0.052, 0.037, -0.008, 0.040),
            (0.466, 0.067, 0.034, -0.003, 0.048),
            (0.522, 0.069, 0.030, 0, 0.062),
            (0.555, 0.064, 0.026, 0, 0.066),
            (0.590, 0.046, 0.022, 0, 0.066),
            (0.606, 0.019, 0.016, 0, 0.066),
        ],
        0.69,
    )
    upper.cast(
        ORANGE,
        [
            (0.078, 0.012, 0.036, 0.072, 0.015),
            (0.089, 0.020, 0.039, 0.071, 0.015),
            (0.138, 0.018, 0.037, 0.063, 0.019),
            (0.229, 0.010, 0.023, 0.046, 0.026),
            (0.261, 0.003, 0.014, 0.041, 0.029),
        ],
        0.67,
    )
    upper.block(IVORY, [-0.012, 0.269, 0.080], [0.072, 0.153, 0.012], 0.005)
    lettering(upper, "RELAY", [-0.0008, 0.206, 0.0863], 0.022)
    for y in [0.205, 0.331]:
        socket(upper, [-0.041, y, 0.0862], Z, 0.003)
    for offset in [-0.008, 0.008]:
        upper.cable(
            [
                [-0.079, 0.064, 0.001 + offset],
                [-0.157, 0.14, -0.023 + offset],
                [-0.054, 0.376, -0.018 + offset],
                [-0.056, 0.461, 0.026 + offset],
            ],
            0.0067,
        )
    for y, x, z in [
        (0.149, -0.101, -0.012),
        (0.286, -0.083, -0.003),
        (0.418, -0.060, 0.018),
    ]:
        upper.block(ALLOY, [x, y, z], [0.028, 0.014, 0.044], 0.003)

    fore = parts["J3"]
    reduction(fore, [0, 0, 0], 0.065, 0.177)
    fore.cast(
        ORANGE,
        [
            (-0.048, 0.027, 0.022, 0, -0.028),
            (-0.028, 0.055, 0.029, 0, -0.035),
            (0.016, 0.069, 0.037, 0, -0.038),
            (0.073, 0.070, 0.043, 0.004, -0.037),
            (0.135, 0.057, 0.045, 0.009, -0.032),
            (0.234, 0.045, 0.039, 0.008, -0.017),
            (0.329, 0.040, 0.037, 0.002, -0.005),
            (0.366, 0.043, 0.041, 0, -0.001),
            (0.386, 0.040, 0.040, 0, 0),
        ],
        0.69,
    )
    fore.cast(
        IVORY,
        [
            (0.081, 0.026, 0.006, -0.006, -0.079),
            (0.099, 0.042, 0.009, -0.004, -0.079),
            (0.160, 0.046, 0.009, 0.002, -0.072),
            (0.260, 0.035, 0.008, 0.004, -0.053),
            (0.328, 0.025, 0.007, 0, -0.043),
            (0.344, 0.015, 0.004, 0, -0.039),
        ],
        0.46,
    )
    # Shoulder-facing removable cover and its small slotted grille.
    fore.block(ALLOY, [0.010, 0.173, 0.012], [0.058, 0.081, 0.005], 0.002)
    for i in range(6):
        fore.block(
            BLACK, [0.010, 0.147 + i * 0.010, 0.015], [0.044, 0.0035, 0.002], 0.0005
        )
    for d in [-0.006, 0.006]:
        fore.cable(
            [
                [-0.047, 0.044, -0.024 + d],
                [-0.119, 0.10, -0.064 + d],
                [-0.049, 0.268, -0.040 + d],
                [-0.035, 0.335, -0.003 + d],
            ],
            0.0052,
        )
    fore.turn(
        ALLOY,
        np.zeros(3),
        Y,
        [
            (0.374, 0.038),
            (0.381, 0.046),
            (0.400, 0.046),
            (0.405, 0.043),
            (0.410, 0.043),
            (0.416, 0.039),
            (0.420, 0.039),
        ],
    )
    fore.disk(STEEL, [0, 0.404, 0], Y, 0.047, 0.003)
    for i in range(12):
        a = i * TAU / 12
        fore.disk(
            INK, [0.044 * math.cos(a), 0.39, 0.044 * math.sin(a)], Y, 0.003, 0.016, 8
        )

    wrist = parts["J4"]
    wrist.turn(
        IVORY,
        np.zeros(3),
        Y,
        [(0, 0.038), (0.005, 0.044), (0.020, 0.045), (0.034, 0.040)],
    )
    for s in [-1, 1]:
        wrist.cast(
            IVORY,
            [
                (0.018, 0.034, 0.014, 0, 0.023 * s),
                (0.035, 0.036, 0.014, 0, 0.025 * s),
                (0.084, 0.031, 0.011, 0, 0.031 * s),
                (0.101, 0.026, 0.010, 0, 0.031 * s),
                (0.112, 0.014, 0.008, 0, 0.031 * s),
            ],
            0.76,
        )
    tilt = parts["J5"]
    reduction(tilt, [0, 0, 0], 0.027, 0.093)
    tilt.cast(
        ORANGE,
        [
            (-0.007, 0.015, 0.013, 0, 0),
            (0.001, 0.025, 0.018, 0, 0),
            (0.038, 0.025, 0.023, 0, 0),
            (0.061, 0.029, 0.027, 0, 0),
            (0.068, 0.026, 0.026, 0, 0),
        ],
    )
    tilt.disk(ALLOY, [0, 0.072, 0], Y, 0.029, 0.014)
    tilt.disk(STEEL, [0, 0.079, 0], Y, 0.030, 0.0035)

    tool = parts["J6"]
    tool.disk(BLACK, [0, 0.005, 0], Y, 0.028, 0.009)
    tool.disk(STEEL, [0, 0.012, 0], Y, 0.032, 0.009)
    tool.block(ALLOY, [0, 0.038, 0], [0.104, 0.047, 0.055], 0.006)
    tool.block(STEEL, [0, 0.060, 0], [0.094, 0.009, 0.047], 0.002)
    tool.block(BLACK, [0, 0.065, 0], [0.086, 0.005, 0.032], 0.001)
    tool.block(ORANGE, [0.005, 0.039, 0.028], [0.053, 0.021, 0.003], 0.001)
    tool.block(BLUE, [0.034, 0.042, 0.029], [0.009, 0.006, 0.004], 0.0008)
    for x in [-0.042, 0.042]:
        socket(tool, [x, 0.039, 0.027], Z, 0.0032)
    for name, s in [("JawL", 1), ("JawR", -1)]:
        jaw = parts[name]
        jaw.block(ALLOY, [0, 0, 0], [0.029, 0.014, 0.032], 0.002)
        jaw.cast(
            STEEL,
            [
                (0.002, 0.010, 0.014, s * 0.002, 0),
                (0.010, 0.009, 0.014, s * 0.003, 0),
                (0.028, 0.008, 0.012, s * 0.007, 0),
                (0.044, 0.006, 0.010, s * 0.006, 0),
                (0.061, 0.006, 0.009, s * 0.003, 0),
                (0.079, 0.005, 0.009, s * 0.001, 0),
            ],
            0.24,
        )
        jaw.block(BLACK, [-s * 0.004, 0.068, 0], [0.005, 0.022, 0.021], 0.001)
        for i in range(5):
            jaw.block(
                ALLOY,
                [-s * 0.0063, 0.059 + 0.004 * i, 0],
                [0.001, 0.0014, 0.019],
                0.0002,
            )
        jaw.block(BLUE, [s * 0.009, 0.044, 0.001], [0.0028, 0.013, 0.011], 0.0008)
        socket(jaw, [s * 0.003, 0.014, 0.014], Z, 0.0025)


def export(path, names):
    data = bytearray()
    doc = dict(
        asset=dict(version="2.0", generator="Aura3D / Relay R6 procedural CAD"),
        scene=0,
        scenes=[dict(nodes=[0])],
        nodes=[],
        meshes=[],
        materials=[],
        bufferViews=[],
        accessors=[],
        buffers=[],
    )
    used_materials = sorted({m for n in names if n in parts for m in parts[n].batches})
    for i in used_materials:
        label, rgb, metal, rough = PBR[i]
        material = dict(
            name=label,
            pbrMetallicRoughness=dict(
                baseColorFactor=[*rgb, 1], metallicFactor=metal, roughnessFactor=rough
            ),
        )
        if i == BLUE:
            material["emissiveFactor"] = [0.003, 0.10, 0.30]
        doc["materials"].append(material)

    def accessor(values, dtype, kind, component, target):
        values = np.asarray(values, dtype=dtype)
        data.extend(b"\0" * (-len(data) % 4))
        doc["bufferViews"].append(
            dict(
                buffer=0, byteOffset=len(data), byteLength=values.nbytes, target=target
            )
        )
        data.extend(values.tobytes())
        entry = dict(
            bufferView=len(doc["bufferViews"]) - 1,
            componentType=component,
            count=len(values),
            type=kind,
        )
        if kind == "VEC3":
            entry.update(
                min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist()
            )
        doc["accessors"].append(entry)
        return len(doc["accessors"]) - 1

    for name in names:
        parent, offset, axis = CHAIN[name]
        node = dict(name=name, translation=offset if parent in names else [0, 0, 0])
        if axis:
            node["extras"] = dict(jointAxis=axis)
        children = [i for i, n in enumerate(names) if CHAIN[n][0] == name]
        if children:
            node["children"] = children
        if name in parts:
            prims = []
            for m, (pos, norm, indices) in parts[name].batches.items():
                # Weld coincident vertices only if their split normals agree.
                vertices = np.round(np.column_stack([pos, norm]), decimals=7).astype(
                    "<f4"
                )
                unique, remap = np.unique(vertices, axis=0, return_inverse=True)
                index = remap[indices].reshape(-1, 3)
                # Rounded rectangles and six-sided caps may contain collinear vertices.
                tri = unique[index, :3]
                area = np.linalg.norm(
                    np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1
                )
                index = index[area > 1e-14].ravel()
                assert len(unique) < 65536 and np.isfinite(unique).all()
                normals = unique[:, 3:]
                assert np.allclose(np.linalg.norm(normals, axis=1), 1, atol=1e-4)
                prims.append(
                    dict(
                        attributes=dict(
                            POSITION=accessor(
                                unique[:, :3], "<f4", "VEC3", 5126, 34962
                            ),
                            NORMAL=accessor(normals, "<f4", "VEC3", 5126, 34962),
                        ),
                        indices=accessor(index, "<u2", "SCALAR", 5123, 34963),
                        material=used_materials.index(m),
                    )
                )
            node["mesh"] = len(doc["meshes"])
            doc["meshes"].append(dict(name=name, primitives=prims))
        doc["nodes"].append(node)
    data.extend(b"\0" * (-len(data) % 4))
    doc["buffers"].append(dict(byteLength=len(data)))
    header = json.dumps(doc, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    raw = (
        struct.pack("<4sII", b"glTF", 2, 28 + len(header) + len(data))
        + struct.pack("<I4s", len(header), b"JSON")
        + header
        + struct.pack("<I4s", len(data), b"BIN\0")
        + data
    )
    path.write_bytes(raw)
    return hashlib.sha256(raw).hexdigest()


if __name__ == "__main__":
    geometry()
    DEST.mkdir(parents=True, exist_ok=True)
    hashes = {"robot.glb": export(DEST / "robot.glb", list(CHAIN))}
    for name in parts:
        slug = {"JawL": "jaw-l", "JawR": "jaw-r"}.get(name, name.lower()) + ".glb"
        hashes[slug] = export(DEST / slug, [name])
    provenance = dict(
        title="Relay R6 articulated workcell arm",
        author="Aura3D",
        source="Original procedural geometry and materials, authored for Relay Workcell",
        generator="tools/relay-workcell/build_robot.py",
        units="metres",
        up="+Y",
        zeroPose="All revolute joints zero; links extend along +Y",
        joints={k: dict(parent=p, origin=o, axis=a) for k, (p, o, a) in CHAIN.items()},
        sha256=hashes,
    )
    (DEST / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(hashes, indent=2))
