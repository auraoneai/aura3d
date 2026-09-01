#!/usr/bin/env python3
"""Build the original CC0 Gravity Post freight-district candidate.

Copyright 2026 Aura3D contributors. Dedicated to the public domain under CC0
1.0: https://creativecommons.org/publicdomain/zero/1.0/

This is an art-only candidate generator. It writes one route-local GLB and
does not register the asset, edit a manifest, or alter gameplay/collision.
The district is authored in route-local space: +X runs from Rust Exchange to
Gale Terminal, Z is up in Blender, and the open courier channel is centered on
Y=0. Blender's glTF Y-up export maps this to the Aura3D +X/+Y/-Z convention.
"""

from __future__ import annotations

import math
import json
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
OUT_DIR = APP_DIR / "assets" / "candidates"
OUT_PATH = OUT_DIR / "gravityPostFreightDistrict.candidate.glb"

OBJECTS_BY_MATERIAL: dict[str, list[bpy.types.Object]] = {}


def canonicalize_glb_float_accessors(path: Path) -> None:
    """Round exported float accessors so repeated Blender runs hash identically.

    Blender's evaluated bevel normals can differ by signed zero or one ULP
    between background processes. Both render identically, but an asset
    pipeline needs byte-stable hashes. This rewrites only FLOAT accessor values
    in the GLB BIN chunk, preserving JSON, indices, layout, and chunk sizes.
    """
    payload = bytearray(path.read_bytes())
    if payload[:4] != b"glTF" or len(payload) < 20:
        raise RuntimeError(f"Not a GLB file: {path}")
    json_length, json_type = struct.unpack_from("<II", payload, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLB first chunk is not JSON")
    json_start = 20
    document = json.loads(bytes(payload[json_start:json_start + json_length]).decode("utf-8"))
    bin_header = json_start + json_length
    bin_length, bin_type = struct.unpack_from("<II", payload, bin_header)
    if bin_type != 0x004E4942:
        raise RuntimeError("GLB second chunk is not BIN")
    bin_start = bin_header + 8
    component_counts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
    views = document.get("bufferViews", [])
    for accessor in document.get("accessors", []):
        if accessor.get("componentType") != 5126 or "bufferView" not in accessor or accessor.get("sparse"):
            continue
        view = views[accessor["bufferView"]]
        components = component_counts[accessor["type"]]
        element_size = components * 4
        stride = view.get("byteStride", element_size)
        base = bin_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        for element in range(accessor["count"]):
            for component in range(components):
                offset = base + element * stride + component * 4
                value = struct.unpack_from("<f", payload, offset)[0]
                canonical = 0.0 if abs(value) < 0.0000005 else round(value, 6)
                struct.pack_into("<f", payload, offset, canonical)
    path.write_bytes(payload)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(
    name: str,
    color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    emissive: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color
    mat.metallic = metallic
    mat.roughness = roughness
    mat["aura3d_material_role"] = "freight-district-surface"
    bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = color
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if emissive is not None:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = (*emissive, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def track(obj: bpy.types.Object, mat: bpy.types.Material, name: str) -> bpy.types.Object:
    obj.name = name
    if len(obj.data.materials) == 0:
        obj.data.materials.append(mat)
    else:
        obj.data.materials[0] = mat
    obj["aura3d_non_colliding"] = True
    obj["aura3d_art_role"] = "renderer-owned freight-world"
    OBJECTS_BY_MATERIAL.setdefault(mat.name, []).append(obj)
    return obj


def bevel(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    if width <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new(name="machined edge bevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def box(
    name: str,
    loc: tuple[float, float, float],
    dims: tuple[float, float, float],
    mat: bpy.types.Material,
    edge: float = 0.012,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, min(edge, min(dims) * 0.18), 2)
    return track(obj, mat, name)


def cylinder(
    name: str,
    loc: tuple[float, float, float],
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    vertices: int = 16,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    edge: float = 0.008,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    bevel(obj, edge, 2)
    return track(obj, mat, name)


def torus(
    name: str,
    loc: tuple[float, float, float],
    major: float,
    minor: float,
    mat: bpy.types.Material,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=32,
        minor_segments=8,
        location=loc,
        rotation=rot,
    )
    return track(bpy.context.object, mat, name)


def beam_between(
    name: str,
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    width: float,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    start = Vector(a)
    end = Vector(b)
    delta = end - start
    midpoint = (start + end) * 0.5
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=midpoint)
    obj = bpy.context.object
    obj.dimensions = (width, width, delta.length)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(delta.normalized())
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, width * 0.12, 2)
    return track(obj, mat, name)


def extruded_footprint(
    name: str,
    points: list[tuple[float, float]],
    z_bottom: float,
    z_top: float,
    mat: bpy.types.Material,
    edge: float = 0.015,
) -> bpy.types.Object:
    count = len(points)
    verts = [(x, y, z_bottom) for x, y in points] + [(x, y, z_top) for x, y in points]
    faces: list[tuple[int, ...]] = []
    faces.append(tuple(range(count - 1, -1, -1)))
    faces.append(tuple(range(count, count * 2)))
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, edge, 2)
    return track(obj, mat, name)


def gable_hangar(
    name: str,
    center: tuple[float, float],
    length: float,
    width: float,
    wall_height: float,
    roof_height: float,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    cx, cy = center
    x0, x1 = cx - length / 2, cx + length / 2
    y0, y1 = cy - width / 2, cy + width / 2
    z0, zw, zr = 0.02, wall_height, wall_height + roof_height
    verts = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, zw), (x1, y0, zw), (x1, y1, zw), (x0, y1, zw),
        (x0, 0.5 * (y0 + y1), zr), (x1, 0.5 * (y0 + y1), zr),
    ]
    faces = [
        (0, 3, 2, 1), (0, 1, 5, 4), (3, 7, 6, 2),
        (0, 4, 8, 7, 3), (1, 2, 6, 9, 5),
        (4, 5, 9, 8), (8, 9, 6, 7),
    ]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, 0.018, 2)
    return track(obj, mat, name)


def build() -> None:
    reset_scene()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    deck = material("GPFD deck graphite", (0.055, 0.095, 0.125, 1.0), 0.62, 0.34)
    alloy = material("GPFD structural alloy", (0.42, 0.55, 0.61, 1.0), 0.78, 0.24)
    dark = material("GPFD machinery navy", (0.075, 0.14, 0.18, 1.0), 0.54, 0.38)
    rust = material("GPFD oxidized cargo cladding", (0.46, 0.19, 0.105, 1.0), 0.32, 0.5)
    cargo_blue = material("GPFD cargo blue", (0.08, 0.27, 0.35, 1.0), 0.34, 0.46)
    cargo_cream = material("GPFD cargo cream", (0.56, 0.49, 0.35, 1.0), 0.26, 0.54)
    glass = material("GPFD operations glass", (0.045, 0.22, 0.27, 1.0), 0.18, 0.16, (0.03, 0.38, 0.46), 0.36)
    cyan = material("GPFD cyan guidance", (0.01, 0.25, 0.3, 1.0), 0.18, 0.22, (0.0, 0.92, 1.0), 5.2)
    amber = material("GPFD amber hazard", (0.32, 0.095, 0.02, 1.0), 0.16, 0.28, (1.0, 0.27, 0.025), 4.6)

    # One connected, chamfered deck with broad outer service aprons and an
    # unobstructed central courier channel. The asymmetrical outline keeps the
    # district from reading as a flat rectangular blockout.
    extruded_footprint(
        "connected freight deck",
        [(-0.58, -1.2), (-0.18, -1.72), (1.86, -1.84), (3.15, -1.62), (3.62, -1.08),
         (3.72, -0.7), (3.72, 0.72), (3.5, 1.18), (2.62, 1.72), (0.02, 1.82), (-0.58, 1.22)],
        -0.28,
        -0.02,
        deck,
        0.035,
    )
    # Underslung structural keel, side rails, and three inlaid transit rails.
    box("underslung district spine", (1.55, 0.0, -0.32), (4.25, 0.62, 0.18), dark, 0.035)
    for side in (-1.0, 1.0):
        box(f"outer crash rail {side:+.0f}", (1.5, side * 1.47, 0.12), (3.65, 0.11, 0.24), alloy, 0.028)
        for x in (-0.05, 0.75, 1.55, 2.35, 3.15):
            box(f"rail stanchion {side:+.0f} {x:.2f}", (x, side * 1.47, 0.0), (0.09, 0.14, 0.38), alloy, 0.012)
    for lateral in (-0.56, 0.0, 0.56):
        box(f"recessed mag rail {lateral:+.2f}", (1.48, lateral, 0.015), (3.7, 0.055, 0.035), cyan if lateral else alloy, 0.006)
    for x in (-0.32, 0.2, 0.72, 1.24, 1.76, 2.28):
        box(f"deck transverse seam {x:.2f}", (x, 0.0, 0.005), (0.025, 1.32, 0.022), dark, 0.003)

    # Rust-side dispatch offices: a stepped, glazed operations building with
    # an actual awning and machinery roofline, not a stack of anonymous cubes.
    box("dispatch office lower volume", (0.0, 1.38, 0.31), (0.94, 0.62, 0.66), rust, 0.045)
    box("dispatch office upper bridge", (0.08, 1.38, 0.78), (0.64, 0.54, 0.32), dark, 0.04)
    box("dispatch office panoramic glass", (-0.12, 1.055, 0.76), (0.42, 0.035, 0.16), glass, 0.008)
    box("dispatch office cargo awning", (0.26, 0.96, 0.46), (0.72, 0.5, 0.075), alloy, 0.018, (0.06, 0.0, 0.0))
    cylinder("dispatch comms mast", (0.12, 1.42, 1.18), 0.035, 0.54, alloy, 12)
    torus("dispatch comms crown", (0.12, 1.42, 1.46), 0.13, 0.018, cyan, (math.pi / 2, 0.0, 0.0))

    # Opposite-side loading hangar with a readable gabled roof, deep door,
    # articulated lintel, and ventilation stack.
    gable_hangar("loading hangar shell", (0.78, -1.46), 1.36, 0.74, 0.52, 0.24, rust)
    box("loading hangar dark door", (0.16, -1.085, 0.3), (0.54, 0.035, 0.46), dark, 0.012)
    box("loading hangar door header", (0.16, -1.055, 0.57), (0.66, 0.075, 0.1), alloy, 0.016)
    for x in (0.02, 0.31):
        box(f"hangar door division {x:.2f}", (x, -1.045, 0.3), (0.028, 0.035, 0.42), amber, 0.004)
    cylinder("hangar ventilation stack", (1.12, -1.48, 0.93), 0.075, 0.46, dark, 16)
    cylinder("hangar stack rain cap", (1.12, -1.48, 1.18), 0.12, 0.045, alloy, 16)

    # A longitudinal container crane lives outside the flight channel. Its
    # tapered bracing, trolley, hook, and boom make the district immediately
    # identifiable as freight infrastructure without forming a camera canyon.
    for x in (1.15, 2.08):
        beam_between(f"crane outer leg {x:.2f}", (x, 1.35, 0.04), (x, 1.58, 1.16), 0.09, alloy)
        beam_between(f"crane inner leg {x:.2f}", (x, 0.95, 0.04), (x, 1.32, 1.16), 0.09, alloy)
        beam_between(f"crane cross brace {x:.2f}", (x, 1.02, 0.43), (x, 1.53, 0.9), 0.055, dark)
        beam_between(f"crane opposite brace {x:.2f}", (x, 1.53, 0.43), (x, 1.02, 0.9), 0.055, dark)
    box("crane longitudinal boom", (1.68, 1.44, 1.21), (1.52, 0.13, 0.13), alloy, 0.028)
    box("crane counterweight", (1.12, 1.44, 1.04), (0.26, 0.28, 0.24), cargo_cream, 0.025)
    box("crane trolley", (1.82, 1.42, 1.08), (0.24, 0.22, 0.18), dark, 0.024)
    cylinder("crane hook cable", (1.82, 1.42, 0.77), 0.012, 0.52, dark, 8)
    torus("crane cargo hook", (1.82, 1.42, 0.49), 0.075, 0.018, amber, (math.pi / 2, 0.0, 0.0))

    # Varied cargo units are grouped on outer loading aprons. Their positions,
    # sizes, and colors are intentionally irregular so they establish worksite
    # density without becoming the rejected repetitive-fixture canyon.
    cargo_units = [
        (0.8, 1.14, 0.16, 0.46, 0.34, 0.3, cargo_blue),
        (1.3, 1.13, 0.14, 0.5, 0.34, 0.26, cargo_cream),
        (1.55, -1.16, 0.17, 0.62, 0.38, 0.32, cargo_blue),
        (2.15, -1.28, 0.16, 0.48, 0.32, 0.29, cargo_cream),
        (2.42, 1.2, 0.2, 0.66, 0.38, 0.38, cargo_blue),
    ]
    for index, (x, y, z, dx, dy, dz, cargo_mat) in enumerate(cargo_units):
        box(f"cargo module {index + 1}", (x, y, z), (dx, dy, dz), cargo_mat, 0.022)
        for rib in (-0.32, 0.0, 0.32):
            box(f"cargo module {index + 1} rib {rib:+.2f}", (x + rib * dx, y - math.copysign(dy * 0.51, y), z), (0.025, 0.025, dz * 0.86), alloy, 0.004)

    # Liquid-freight tank farm and connected transfer pipes provide a second,
    # curved industrial vocabulary behind the hangar.
    for index, x in enumerate((1.52, 1.9, 2.28)):
        cylinder(f"cryogenic tank {index + 1}", (x, -1.55, 0.46), 0.17, 0.76, cargo_cream, 20)
        torus(f"tank band lower {index + 1}", (x, -1.55, 0.25), 0.174, 0.018, alloy)
        torus(f"tank band upper {index + 1}", (x, -1.55, 0.66), 0.174, 0.018, alloy)
        cylinder(f"tank valve {index + 1}", (x, -1.55, 0.87), 0.04, 0.12, amber, 12)
    box("tank transfer manifold", (1.9, -1.19, 0.14), (1.15, 0.07, 0.07), alloy, 0.015)
    for x in (1.52, 1.9, 2.28):
        cylinder(f"tank transfer riser {x:.2f}", (x, -1.25, 0.31), 0.028, 0.42, alloy, 12)

    # Gale Terminal: an asymmetrical operations tower and two purpose-built
    # swept docking jaws frame a bright open destination. This is not a copy or
    # repetition of gravityPostDockGate; it is original district architecture.
    box("terminal west headhouse", (3.14, 1.16, 0.58), (0.88, 0.78, 1.18), dark, 0.065)
    box("terminal west armor shell", (3.08, 1.17, 0.57), (0.62, 0.86, 0.78), rust, 0.045)
    box("terminal east headhouse", (3.18, -1.18, 0.43), (0.76, 0.72, 0.86), dark, 0.055)
    box("terminal east service canopy", (2.91, -1.05, 0.85), (0.72, 0.92, 0.1), alloy, 0.026, (0.0, -0.09, 0.0))
    beam_between("terminal port docking jaw", (2.64, 0.52, 0.06), (3.02, 1.12, 1.25), 0.13, alloy)
    beam_between("terminal starboard docking jaw", (2.64, -0.52, 0.06), (3.02, -1.12, 1.11), 0.13, alloy)
    beam_between("terminal port jaw cyan inset", (2.67, 0.49, 0.11), (3.0, 1.02, 1.16), 0.035, cyan)
    beam_between("terminal starboard jaw cyan inset", (2.67, -0.49, 0.11), (3.0, -1.02, 1.02), 0.035, cyan)
    torus("terminal destination pad ring", (2.75, 0.0, 0.025), 0.54, 0.035, cyan)
    torus("terminal inner lock ring", (2.75, 0.0, 0.032), 0.36, 0.018, alloy)
    for side in (-1.0, 1.0):
        box(f"terminal landing chevron {side:+.0f}", (2.45, side * 0.22, 0.035), (0.42, 0.055, 0.026), amber, 0.004, (0.0, side * 0.38, 0.0))

    # Operations tower, bridge, radar, and windows create a unique destination
    # skyline behind the pad while leaving the center visually open.
    extruded_footprint(
        "terminal control tower",
        [(3.27, 0.86), (3.53, 0.94), (3.62, 1.27), (3.46, 1.52), (3.16, 1.46), (3.08, 1.12)],
        0.0,
        1.62,
        alloy,
        0.04,
    )
    box("terminal control room", (3.34, 1.2, 1.66), (0.54, 0.62, 0.28), glass, 0.045)
    box("terminal control roof", (3.34, 1.2, 1.86), (0.68, 0.74, 0.12), dark, 0.035)
    cylinder("terminal radar mast", (3.34, 1.2, 2.14), 0.035, 0.48, alloy, 12)
    torus("terminal radar array", (3.34, 1.2, 2.4), 0.2, 0.026, cyan, (math.pi / 2, 0.0, 0.0))
    box("terminal elevated service bridge", (3.24, 0.28, 1.18), (0.46, 1.35, 0.16), dark, 0.026)
    for y in (-0.2, 0.08, 0.36, 0.64, 0.92):
        box(f"terminal bridge window {y:+.2f}", (3.005, y, 1.18), (0.03, 0.14, 0.075), glass, 0.004)

    # Small perimeter lamps and hazard markers lead toward—not compete with—
    # the destination. There are only four pairs, each integrated into rails.
    for index, x in enumerate((0.05, 0.82, 1.59, 2.36)):
        for side in (-1.0, 1.0):
            box(f"approach lamp post {index} {side:+.0f}", (x, side * 0.86, 0.16), (0.035, 0.035, 0.3), dark, 0.005)
            box(f"approach lamp head {index} {side:+.0f}", (x, side * 0.84, 0.32), (0.08, 0.07, 0.055), cyan if index > 1 else amber, 0.008)

    # Convert and merge strictly by material. The detailed authored district
    # therefore remains an estimated nine draw submissions rather than one per
    # fixture, container, pipe, or architectural part.
    merged: list[bpy.types.Object] = []
    for material_name, objects in OBJECTS_BY_MATERIAL.items():
        bpy.ops.object.select_all(action="DESELECT")
        mesh_objects: list[bpy.types.Object] = []
        for obj in objects:
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            if obj.type != "MESH":
                bpy.ops.object.convert(target="MESH")
            # Apply every authored rotation before joining. Leaving quaternion
            # transforms on beam objects allowed the exporter to emit signed
            # zero and one-ULP variations between otherwise identical runs.
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            mesh_objects.append(obj)
        bpy.context.view_layer.objects.active = mesh_objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = material_name.replace(" ", "_")
        for vertex in joined.data.vertices:
            vertex.co = tuple(0.0 if abs(component) < 0.0000005 else round(component, 6) for component in vertex.co)
        for polygon in joined.data.polygons:
            polygon.use_smooth = False
        joined.data.validate(clean_customdata=True)
        joined.data.update(calc_edges=True)
        joined["aura3d_merged_draw_group"] = material_name
        joined["aura3d_original_cc0"] = True
        merged.append(joined)

    root = bpy.data.objects.new("GravityPostFreightDistrict_ROOT", None)
    bpy.context.collection.objects.link(root)
    root["asset_name"] = "Gravity Post Freight District"
    root["license"] = "CC0-1.0"
    root["license_url"] = "https://creativecommons.org/publicdomain/zero/1.0/"
    root["author"] = "Aura3D contributors"
    root["asset_role"] = "original non-colliding freight-world candidate"
    root["route_local_forward_axis"] = "+X Rust Exchange to Gale Terminal"
    root["open_flight_channel"] = "Y +/- 0.72, gameplay/collision ownership excluded"
    for obj in merged:
        # Author the release world at a truthful gameplay-scale footprint. The
        # route fits this 3x-authored geometry back to the same Rust-to-Gale
        # endpoints, so this changes source bounds without changing the final
        # review composition or gameplay ownership.
        for vertex in obj.data.vertices:
            vertex.co *= 3.0
        obj.parent = root

    scene = bpy.context.scene
    scene["asset_license"] = "CC0-1.0"
    scene["asset_scope"] = "art-only candidate; no gameplay, collision, or manifest ownership"
    scene["generator"] = "apps/showcase-gravity-post/scripts/build-freight-district.py"
    scene["blender_version"] = bpy.app.version_string

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in merged:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=str(OUT_PATH),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_attributes=False,
    )
    canonicalize_glb_float_accessors(OUT_PATH)
    print(f"WROTE {OUT_PATH}")
    print(f"MERGED_MESHES {len(merged)}")
    print(f"MATERIALS {len(OBJECTS_BY_MATERIAL)}")
    print(f"BLENDER {bpy.app.version_string}")


if __name__ == "__main__":
    build()
