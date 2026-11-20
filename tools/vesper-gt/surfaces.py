"""Material partition for the original Vesper GT UV atlas, in its normalized metre space."""

import hashlib
import io
import json
import struct
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def image_for(document, binary, texture):
    image = document["images"][document["textures"][texture]["source"]]
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return np.asarray(
        Image.open(io.BytesIO(binary[start : start + view["byteLength"]])).convert(
            "RGB"
        )
    )


def material_regions(positions, uv, faces, color):
    """Vote across the face interior. Keep mixed edge pixels in the shared albedo atlas."""
    uv_faces = uv[faces]
    samples = []
    for weights in [
        (1 / 3, 1 / 3, 1 / 3),
        (0.75, 0.125, 0.125),
        (0.125, 0.75, 0.125),
        (0.125, 0.125, 0.75),
    ]:
        sample = sum(uv_faces[:, i] * weight for i, weight in enumerate(weights))
        ij = np.clip(
            sample * [color.shape[1], color.shape[0]],
            0,
            [color.shape[1] - 1, color.shape[0] - 1],
        ).astype(int)
        samples.append(color[ij[:, 1], ij[:, 0]])
    r, g, b = np.median(samples, axis=0).T
    x, y, z = positions[faces].mean(axis=1).T
    wheel_z = np.where(z > 0, 1.373, -1.428)
    radius = np.hypot(z - wheel_z, y - np.where(z > 0, 0.421, 0.428))
    in_wheel = (abs(x) > 0.63) & (radius < 0.443)
    red = (r > g * 1.35 + 3) & (r > b * 1.15 + 3)
    # Physical regions take precedence over the red cast that can occur on dark metal or tires.
    labels = np.full(len(faces), "trim", dtype="<U12")
    labels[red & (y > 0.17)] = "paint"
    labels[in_wheel & ((~red) | (radius < 0.395))] = "rubber"
    labels[in_wheel & (radius < 0.349) & (abs(x) > 0.83)] = "alloy"
    neutral = (np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])) < 13
    in_canopy = (z > -1.79) & (z < 0.65) & (abs(x) < 0.79) & (y > 0.925 + 0.025 * z)
    # The lower windshield sweeps farther forward at centre. A horizontal cutoff at z=.65
    # leaves the atlas and its trim lobe visible in a row of triangles along the cowl.
    lower_windscreen = (
        (z > 0.43) & (z < 0.865 - 0.40 * x * x) & (abs(x) < 0.74) & (y > 0.849)
    )
    labels[(in_canopy | lower_windscreen) & neutral & (g > 4)] = "glass"
    # Amber and ruby glass are restricted to the physically measured lamp bands.
    head = (z > 1.70) & (abs(x) > 0.17) & (y > 0.47) & (y < 0.66)
    labels[head & (g > b * 1.45 + 2) & (r > g * 1.13) & (r > 80)] = "headlamp"
    tail = (z < -1.89) & (y > 0.80) & (y < 0.902)
    labels[tail & (r > 4.2 * g) & (r > 1.95 * b) & (r > 32)] = "taillamp"
    return labels


def material(name, metallic, roughness, *, normal=None, coat=None, emissive=None):
    out = {
        "name": name,
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0},
            "metallicFactor": metallic,
            "roughnessFactor": roughness,
        },
        "doubleSided": True,
    }
    if normal is not None:
        out["normalTexture"] = {"index": 1, "scale": normal}
    if coat is not None:
        out["extensions"] = {
            "KHR_materials_clearcoat": {
                "clearcoatFactor": coat[0],
                "clearcoatRoughnessFactor": coat[1],
            }
        }
    if emissive is not None:
        out["emissiveTexture"] = {"index": 0}
        out["emissiveFactor"] = emissive
    return out


def geometry_proof(document, binary, accessor):
    primitives = document["meshes"][0]["primitives"]
    attributes = primitives[0]["attributes"]
    assert all(pr["attributes"] == attributes for pr in primitives)
    triangles = np.concatenate(
        [accessor(document, binary, pr["indices"]).reshape(-1, 3) for pr in primitives]
    )
    order = np.lexsort((triangles[:, 2], triangles[:, 1], triangles[:, 0]))

    def digest(data):
        return hashlib.sha256(data).hexdigest()

    return {
        "attributes": {
            key: digest(accessor(document, binary, index).tobytes())
            for key, index in sorted(attributes.items())
        },
        "orientedTriangleMultiset": digest(triangles[order].astype("<u4").tobytes()),
        "sceneTransforms": digest(
            json.dumps(
                [document["scenes"], document["nodes"]],
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
        ),
    }


def finish(baseline, lossless_source, destination, read_glb, accessor):
    if (
        hashlib.sha256(Path(baseline).read_bytes()).hexdigest()
        != "ce819dccaacd73f991bdc535bf135883ae643e81bc1e03ff2f3cc83d0fa78747"
    ):
        raise ValueError(
            "Material curation requires the original selected Hunyuan geometry and debranded atlas"
        )
    doc, data = read_glb(baseline)
    src, src_data = read_glb(lossless_source)
    prim = doc["meshes"][0]["primitives"][0]
    pos = accessor(doc, data, prim["attributes"]["POSITION"])
    uv = accessor(doc, data, prim["attributes"]["TEXCOORD_0"])
    faces = accessor(doc, data, prim["indices"]).reshape(-1, 3)
    before = geometry_proof(doc, data, accessor)
    color = image_for(doc, data, 0)
    labels = material_regions(pos, uv, faces, color)
    surfaces = {
        "paint": material(
            "Oxblood | satin dielectric paint", 0, 0.52, coat=(0.075, 0.47)
        ),
        "alloy": material(
            "Wheel alloy | brushed graphite aluminum", 0.76, 0.52, normal=0.09
        ),
        "rubber": material("Tire | vulcanized rubber", 0, 0.84, normal=0.22),
        "glass": material("Canopy | smoked laminated glass", 0, 0.30),
        "trim": material("Trim | graphite composite", 0.055, 0.67),
        "headlamp": material(
            "Headlamp | amber LED lens", 0, 0.20, emissive=[1, 0.72, 0.36]
        ),
        "taillamp": material(
            "Taillamp | ruby lens", 0, 0.22, emissive=[0.48, 0.04, 0.025]
        ),
    }
    # The bright studio environment requires a restrained dielectric base lobe beneath the lacquer.
    surfaces["paint"]["extensions"]["KHR_materials_specular"] = {
        "specularFactor": 0.095
    }
    surfaces["paint"]["pbrMetallicRoughness"]["baseColorFactor"] = [0.59, 0.39, 0.41, 1]
    glazing = surfaces["glass"]["pbrMetallicRoughness"]
    glazing.pop("baseColorTexture")
    glazing["baseColorFactor"] = [0.0030, 0.0042, 0.0052, 1]
    surfaces["glass"]["extensions"] = {
        "KHR_materials_specular": {"specularFactor": 0.095}
    }
    for name, factor in [("alloy", 0.32), ("rubber", 0.17), ("trim", 0.115)]:
        surfaces[name]["extensions"] = {
            "KHR_materials_specular": {"specularFactor": factor}
        }

    # The generated atlas contains photographed white streaks on spokes, tire shoulders,
    # sill blades and the splitter. Reconstruct a bounded graphite substrate from luminance.
    # Keep low-frequency variation to distinguish brake recesses from the spoke faces.
    rgb = color.astype(np.float32)
    r, g, b = rgb.transpose(2, 0, 1)
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    graphite = np.interp(
        luminance, [0, 12, 36, 75, 135, 200, 255], [6, 8, 15, 32, 48, 58, 65]
    )
    metal = np.stack([graphite * 0.94, graphite * 0.98, graphite], axis=2)
    pigment = np.clip((r - np.maximum(g, b) - 5) / 24, 0, 1)
    paint = np.stack(
        [
            np.clip(73 + 0.14 * (r - 83), 58, 87),
            np.clip(14 + 0.10 * (g - 25), 9, 22),
            np.clip(23 + 0.11 * (b - 36), 14, 31),
        ],
        axis=2,
    )
    graded = np.rint(
        metal * (1 - pigment[:, :, None]) + paint * pigment[:, :, None]
    ).astype(np.uint8)
    # Keep high-intensity optics on their own texture so an amber LED never bakes into a rim.
    # Only their padded UV islands need shipping. The black exterior compresses losslessly.
    optics_mask = np.zeros(color.shape[:2], dtype=np.uint8)
    shape = np.asarray([color.shape[1], color.shape[0]])
    for triangle in faces[(labels == "headlamp") | (labels == "taillamp")]:
        pixels = np.rint(uv[triangle] * shape).astype(np.int32)
        cv2.fillConvexPoly(optics_mask, pixels, 255)
    optics_mask = cv2.dilate(optics_mask, np.ones((25, 25), np.uint8))
    optics = np.where(optics_mask[:, :, None] > 0, color, 0)
    for name in ["headlamp", "taillamp"]:
        surfaces[name]["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 2}
        surfaces[name]["emissiveTexture"] = {"index": 2}
    # Use the optimizer's lossless normal source for tires and alloys only. Filter high-frequency
    # reconstruction noise and renormalize before encoding at full resolution without JPEG.
    normal_idx = src["materials"][0]["normalTexture"]["index"]
    normal_img = src["images"][src["textures"][normal_idx]["source"]]
    if normal_img["mimeType"] != "image/png":
        raise ValueError("Expected lossless PNG normals before the legacy slim step")
    normal = image_for(src, src_data, normal_idx).astype(np.float32) / 127.5 - 1
    normal = cv2.GaussianBlur(normal, (0, 0), 1.6)
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    normal = np.rint((normal + 1) * 127.5).clip(0, 255).astype(np.uint8)

    views, packed = [], bytearray()

    def add(blob, **fields):
        packed.extend(b"\0" * (-len(packed) % 4))
        views.append(
            dict(buffer=0, byteOffset=len(packed), byteLength=len(blob), **fields)
        )
        packed.extend(blob)
        return len(views) - 1

    def png(pixels):
        stream = io.BytesIO()
        Image.fromarray(pixels).save(stream, "PNG", compress_level=6)
        return stream.getvalue()

    # Preserve the interleaved source vertex buffer byte for byte; draw groups share the same accessors.
    vertex_views = {
        doc["accessors"][a]["bufferView"] for a in prim["attributes"].values()
    }
    for old in sorted(vertex_views):
        view = doc["bufferViews"][old]
        start = view.get("byteOffset", 0)
        number = add(
            data[start : start + view["byteLength"]],
            **{k: view[k] for k in ["byteStride", "target"] if k in view},
        )
        for index in prim["attributes"].values():
            doc["accessors"][index]["bufferView"] = number
    doc["images"] = [
        {"name": name, "mimeType": "image/png", "bufferView": add(png(pixels))}
        for name, pixels in [
            ("Vesper surface color", graded),
            ("Tire and alloy detail normals", normal),
            ("Original amber and ruby optics", optics),
        ]
    ]
    doc["textures"] = [{"source": i, "sampler": 0} for i in range(3)]
    doc["materials"] = list(surfaces.values())
    doc["extensionsUsed"] = ["KHR_materials_clearcoat", "KHR_materials_specular"]
    groups = []
    for i, key in enumerate(surfaces):
        indices = faces[labels == key].astype("<u4").ravel()
        if not len(indices):
            raise ValueError(f"Empty surface region: {key}")
        view = add(indices.tobytes(), target=34963)
        index_info = {
            "bufferView": view,
            "componentType": 5125,
            "count": len(indices),
            "type": "SCALAR",
        }
        if i == 0:
            index = prim["indices"]
            doc["accessors"][index] = index_info
        else:
            index = len(doc["accessors"])
            doc["accessors"].append(index_info)
        groups.append({**prim, "indices": index, "material": i})
    doc["meshes"][0]["primitives"] = groups
    doc["bufferViews"] = views
    packed.extend(b"\0" * (-len(packed) % 4))
    doc["buffers"][0]["byteLength"] = len(packed)
    if before != geometry_proof(doc, packed, accessor):
        raise ValueError(
            "Vertex attributes, oriented topology or node transforms changed"
        )
    header = json.dumps(doc, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    Path(destination).write_bytes(
        b"glTF"
        + struct.pack("<II", 2, 28 + len(header) + len(packed))
        + struct.pack("<I", len(header))
        + b"JSON"
        + header
        + struct.pack("<I", len(packed))
        + b"BIN\0"
        + packed
    )
    print(
        json.dumps(
            {
                "geometry": before,
                "surfaceTriangles": {
                    key: int(np.sum(labels == key)) for key in surfaces
                },
            }
        )
    )
