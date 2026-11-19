"""Apply the documented tire contact transform and debrand this specific source GLB."""

import io
import json
import struct
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image


def read_glb(path):
    data = Path(path).read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20 : 20 + length]), data[28 + length :]


def accessor(document, data, index):
    acc = document["accessors"][index]
    view = document["bufferViews"][acc["bufferView"]]
    count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[acc["type"]]
    dtype = np.dtype({5126: "<f4", 5123: "<u2", 5125: "<u4"}[acc["componentType"]])
    return np.ndarray(
        (acc["count"], count),
        dtype,
        buffer=data,
        offset=view.get("byteOffset", 0) + acc.get("byteOffset", 0),
        strides=(view.get("byteStride", count * dtype.itemsize), dtype.itemsize),
    )


def edit_masks(image_size, positions, uv, faces):
    height, width = image_size
    vertices = positions[faces]
    rear = (
        (vertices[:, :, 2].min(1) < -2.19)
        & (vertices[:, :, 0].min(1) < 0.20)
        & (vertices[:, :, 0].max(1) > -0.20)
        & (vertices[:, :, 1].min(1) < 0.94)
        & (vertices[:, :, 1].max(1) > 0.54)
    )
    masks = [np.zeros((height, width), np.uint8) for _ in range(2)]
    for face in faces[rear]:
        triangle = uv[face] * [width, height]
        start = np.maximum(0, np.floor(triangle.min(0)).astype(int) - 1)
        stop = np.minimum([width, height], np.ceil(triangle.max(0)).astype(int) + 2)
        if np.any(start >= stop):
            continue
        x, y = np.meshgrid(
            np.arange(start[0], stop[0]) + 0.5, np.arange(start[1], stop[1]) + 0.5
        )
        a, b, c = triangle
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-8:
            continue
        u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det
        v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det
        w = 1 - u - v
        interior = (u >= -0.001) & (v >= -0.001) & (w >= -0.001)
        xyz = (
            u[:, :, None] * positions[face[0]]
            + v[:, :, None] * positions[face[1]]
            + w[:, :, None] * positions[face[2]]
        )
        px, py, pz = xyz.transpose(2, 0, 1)
        plate = (abs(px) < 0.185) & (py > 0.565) & (py < 0.70)
        badge = (abs(px + 0.035) < 0.123) & (py > 0.875) & (py < 0.92)
        for mask, region in zip(masks, [plate, badge]):
            image_section = mask[start[1] : stop[1], start[0] : stop[0]]
            image_section[region & interior & (pz < -2.19)] = 255
    return [cv2.dilate(mask, np.ones((3, 3), np.uint8)) > 0 for mask in masks]


def curate(input_path, output_path):
    document, binary = read_glb(input_path)
    root = document["scenes"][document.get("scene", 0)]
    # Least-squares leveling of the four tire envelope minima, preserving the 4.72 m length.
    root_index = len(document["nodes"])
    document["nodes"].append(
        {
            "name": "Vesper tire contact plane",
            "children": root["nodes"],
            "rotation": [
                0.0002135107511562258,
                0.0,
                0.000040900847774241784,
                0.9999999763701396,
            ],
            "scale": [0.9999995741665834] * 3,
            "translation": [
                0.00007786572435286576,
                -0.0006531353065125162,
                -0.0001958069168570553,
            ],
        }
    )
    root["nodes"] = [root_index]
    material = document["materials"][0]
    pbr = material["pbrMetallicRoughness"]
    base = document["textures"][pbr["baseColorTexture"]["index"]]["source"]
    normal = document["textures"][material["normalTexture"]["index"]]["source"]
    primitive = document["meshes"][0]["primitives"][0]
    attributes = primitive["attributes"]
    positions = accessor(document, binary, attributes["POSITION"])
    uv = accessor(document, binary, attributes["TEXCOORD_0"])
    faces = accessor(document, binary, primitive["indices"]).reshape(-1, 3)
    replacements = {}
    for index, image in enumerate(document["images"]):
        view_index = image["bufferView"]
        view = document["bufferViews"][view_index]
        start = view.get("byteOffset", 0)
        pixels = np.array(
            Image.open(io.BytesIO(binary[start : start + view["byteLength"]])).convert(
                "RGB"
            )
        )
        plate, badge = edit_masks(pixels.shape[:2], positions, uv, faces)
        if index == base:
            pixels[plate] = [26, 26, 29]
            pixels[badge] = [78, 19, 33]
        else:
            pixels[plate | badge] = (
                [128, 128, 255] if index == normal else [255, 145, 8]
            )
        result = io.BytesIO()
        Image.fromarray(pixels).save(result, "JPEG", quality=94)
        replacements[view_index] = result.getvalue()
        image["mimeType"] = "image/jpeg"
    packed = bytearray()
    for index, view in enumerate(document["bufferViews"]):
        offset = view.get("byteOffset", 0)
        chunk = replacements.get(index, binary[offset : offset + view["byteLength"]])
        packed.extend(b"\0" * (-len(packed) % 4))
        view.update(byteOffset=len(packed), byteLength=len(chunk))
        packed.extend(chunk)
    packed.extend(b"\0" * (-len(packed) % 4))
    document["buffers"][0]["byteLength"] = len(packed)
    material["extensions"]["KHR_materials_specular"]["specularColorFactor"] = [
        1.0,
        1.0,
        1.0,
    ]
    header = json.dumps(document, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    Path(output_path).write_bytes(
        b"glTF"
        + struct.pack("<II", 2, 28 + len(header) + len(packed))
        + struct.pack("<I", len(header))
        + b"JSON"
        + header
        + struct.pack("<I", len(packed))
        + b"BIN\0"
        + packed
    )


if __name__ == "__main__":
    curate(*sys.argv[1:])
