#!/usr/bin/env python3
"""Build Turbo Drift's original CC0 circuit-environment candidate.

Copyright 2026 Aura3D contributors. Dedicated to the public domain under CC0
1.0: https://creativecommons.org/publicdomain/zero/1.0/

This art-only candidate follows the exact 56-point, 3.6-unit Formula circuit
centreline already certified by ``build-formula-circuit.mjs``. It owns no
collision, lap, camera, input, or vehicle state. The existing typed Formula
circuit remains the topology and contact authority; this GLB contributes
renderer-owned road wear, skid language, barriers, horizontal tyre walls,
grandstands, pit architecture, marshal lighting, and vegetation depth.

Blender is Z-up. glTF export maps Blender (X, Y, Z) to Aura (X, Z, -Y), so
``at(x, road_z, height)`` performs that mapping explicitly.
"""

from __future__ import annotations

import json
import math
import random
import struct
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
OUT_DIR = APP_DIR / "assets" / "candidates"
OUT_PATH = OUT_DIR / "turboCircuitEnvironmentV2.candidate.glb"

CONTROL = [
    (-13.0, 1.0), (-13.0, -8.0), (-12.5, -9.1), (-11.0, -9.8),
    (-8.0, -10.0), (-2.0, -10.0), (5.0, -9.0), (11.0, -5.0),
    (12.0, 1.0), (9.0, 6.0), (4.0, 7.5), (-3.0, 7.5),
    (-9.0, 7.0), (-13.0, 5.0), (-13.0, 1.0),
]
LINE: list[tuple[float, float]] = []
for start, end in zip(CONTROL[:-1], CONTROL[1:]):
    for step in range(4):
        blend = step / 4.0
        LINE.append((
            start[0] + (end[0] - start[0]) * blend,
            start[1] + (end[1] - start[1]) * blend,
        ))

ROAD_WIDTH = 3.6
KERB_WIDTH = 0.42
RUNOFF_WIDTH = 2.65
OBJECTS_BY_MATERIAL: dict[str, list[bpy.types.Object]] = {}


def canonicalize_glb_float_accessors(path: Path) -> None:
    """Round FLOAT accessors so independent Blender runs are byte stable."""
    payload = bytearray(path.read_bytes())
    json_length, json_type = struct.unpack_from("<II", payload, 12)
    if payload[:4] != b"glTF" or json_type != 0x4E4F534A:
        raise RuntimeError(f"Not a supported GLB: {path}")
    json_start = 20
    document = json.loads(bytes(payload[json_start:json_start + json_length]).decode("utf-8"))
    bin_header = json_start + json_length
    _, bin_type = struct.unpack_from("<II", payload, bin_header)
    if bin_type != 0x004E4942:
        raise RuntimeError("GLB BIN chunk missing")
    bin_start = bin_header + 8
    components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
    views = document.get("bufferViews", [])
    for accessor in document.get("accessors", []):
        if accessor.get("componentType") != 5126 or "bufferView" not in accessor or accessor.get("sparse"):
            continue
        view = views[accessor["bufferView"]]
        count = components[accessor["type"]]
        element_size = count * 4
        stride = view.get("byteStride", element_size)
        base = bin_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        for item in range(accessor["count"]):
            for component in range(count):
                offset = base + item * stride + component * 4
                value = struct.unpack_from("<f", payload, offset)[0]
                canonical = 0.0 if abs(value) < 0.0000005 else round(value, 6)
                struct.pack_into("<f", payload, offset, canonical)
    path.write_bytes(payload)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(
    name: str,
    color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    emissive: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = color
    result.metallic = metallic
    result.roughness = roughness
    result["aura3d_art_role"] = "renderer-owned circuit environment"
    bsdf = result.node_tree.nodes.get("Principled BSDF") if result.node_tree else None
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emissive is not None:
            emission_key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
            bsdf.inputs[emission_key].default_value = (*emissive, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return result


ASPHALT_WEAR = material("TDCE asphalt aggregate variation", (0.115, 0.13, 0.14, 1), 0.015, 0.91)
ASPHALT_PATCH = material("TDCE resurfaced asphalt patches", (0.055, 0.065, 0.075, 1), 0.02, 0.86)
RUBBER = material("TDCE worked-in tyre rubber", (0.018, 0.022, 0.025, 1), 0.01, 0.96)
KERB_RED = material("TDCE race red kerb faces", (0.72, 0.055, 0.035, 1), 0.03, 0.63)
KERB_CREAM = material("TDCE warm white kerb faces", (0.91, 0.84, 0.67, 1), 0.01, 0.71)
CONCRETE = material("TDCE barrier concrete", (0.43, 0.48, 0.48, 1), 0.12, 0.72)
STEEL = material("TDCE galvanized rail steel", (0.47, 0.57, 0.6, 1), 0.58, 0.38)
TYRE = material("TDCE horizontal tyre walls", (0.025, 0.031, 0.034, 1), 0.015, 0.94)
SAFETY_RED = material("TDCE safety red", (0.76, 0.09, 0.04, 1), 0.05, 0.58)
SAFETY_TEAL = material("TDCE race teal", (0.045, 0.45, 0.45, 1), 0.16, 0.5)
GRASS_DARK = material("TDCE deep verge", (0.075, 0.18, 0.105, 1), 0.0, 0.98)
GRASS_MID = material("TDCE sunlit verge", (0.19, 0.31, 0.145, 1), 0.0, 0.97)
TRUNK = material("TDCE tree bark", (0.24, 0.13, 0.075, 1), 0.0, 0.96)
PINE_DARK = material("TDCE pine shadow", (0.035, 0.16, 0.105, 1), 0.0, 0.94)
PINE_MID = material("TDCE pine sun", (0.075, 0.29, 0.17, 1), 0.0, 0.93)
AUTUMN = material("TDCE autumn foliage", (0.58, 0.25, 0.075, 1), 0.0, 0.94)
SEAT_DARK = material("TDCE grandstand graphite", (0.055, 0.08, 0.105, 1), 0.22, 0.65)
SEAT_BLUE = material("TDCE grandstand blue", (0.055, 0.25, 0.47, 1), 0.12, 0.62)
SEAT_CORAL = material("TDCE grandstand coral", (0.76, 0.18, 0.09, 1), 0.08, 0.64)
PIT_WALL = material("TDCE pit warm concrete", (0.56, 0.52, 0.43, 1), 0.05, 0.78)
PIT_GLASS = material("TDCE pit operations glass", (0.025, 0.14, 0.19, 1), 0.35, 0.29)
LIGHT_CYAN = material("TDCE cyan marshal lamps", (0.04, 0.34, 0.38, 1), 0.15, 0.32, (0.05, 0.95, 1.0), 3.2)
LIGHT_AMBER = material("TDCE amber marshal lamps", (0.55, 0.2, 0.025, 1), 0.1, 0.38, (1.0, 0.35, 0.04), 3.4)


def at(x: float, road_z: float, height: float) -> tuple[float, float, float]:
    return (x, -road_z, height)


def road_height(index: int, side: float = 0.0) -> float:
    phase = index / len(LINE) * math.tau
    return 0.04 + math.sin(phase * 2.0) * 0.055 + math.cos(phase * 3.0) * side * 0.035


def tangent(index: int) -> tuple[float, float, float]:
    before = LINE[(index - 1) % len(LINE)]
    after = LINE[(index + 1) % len(LINE)]
    dx, dz = after[0] - before[0], after[1] - before[1]
    length = math.hypot(dx, dz) or 1.0
    return dx / length, dz / length, math.atan2(dz, dx)


def offset(index: int, distance: float) -> tuple[float, float]:
    x, z = LINE[index]
    tx, tz, _ = tangent(index)
    return x - tz * distance, z + tx * distance


def track(obj: bpy.types.Object, mat: bpy.types.Material, name: str) -> bpy.types.Object:
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    obj["aura3d_non_colliding"] = True
    obj["aura3d_art_role"] = "renderer-owned circuit environment"
    OBJECTS_BY_MATERIAL.setdefault(mat.name, []).append(obj)
    return obj


def bevel(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    if width <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new(name="authored edge bevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    mat: bpy.types.Material,
    rotation_z: float = 0.0,
    edge: float = 0.02,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=(0, 0, rotation_z))
    obj = bpy.context.object
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, min(edge, min(dimensions) * 0.16), 2)
    return track(obj, mat, name)


def cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    rotation: tuple[float, float, float] = (0, 0, 0),
    vertices: int = 14,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    bevel(obj, min(0.018, radius * 0.1), 2)
    return track(obj, mat, name)


def torus(
    name: str,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    mat: bpy.types.Material,
    rotation: tuple[float, float, float],
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=16,
        minor_segments=6,
        location=location,
        rotation=rotation,
    )
    return track(bpy.context.object, mat, name)


def strip_mesh(
    name: str,
    samples: list[tuple[float, float, float, float]],
    width: float,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    """Make a flat road-following strip from x, z, height, yaw samples."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for x, z, height, yaw in samples:
        nx, nz = -math.sin(yaw), math.cos(yaw)
        vertices.extend([at(x + nx * width / 2, z + nz * width / 2, height), at(x - nx * width / 2, z - nz * width / 2, height)])
    for index in range(len(samples) - 1):
        base = index * 2
        faces.append((base, base + 2, base + 3, base + 1))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    return track(bpy.data.objects.new(name, mesh), mat, name)


def link(obj: bpy.types.Object) -> bpy.types.Object:
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)
    return obj


def road_sample(index: int, lateral: float = 0.0, height_add: float = 0.0) -> tuple[float, float, float, float]:
    x, z = offset(index, lateral)
    _, _, yaw = tangent(index)
    return x, z, road_height(index, lateral / max(ROAD_WIDTH / 2, 0.001)) + height_add, yaw


def conifer(name: str, x: float, z: float, height: float, warm: bool = False) -> None:
    cylinder(name + " trunk", at(x, z, height * 0.16), height * 0.055, height * 0.34, TRUNK, vertices=8)
    foliage = AUTUMN if warm else PINE_DARK
    for level, scale in ((0.17, 0.42), (0.38, 0.34), (0.59, 0.25)):
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=height * scale, radius2=0.025, depth=height * 0.48, location=at(x, z, height * level + height * 0.24))
        track(bpy.context.object, foliage if level != 0.38 else PINE_MID, name + f" crown {level}")


def make_surface_language() -> None:
    # Narrow aggregate bands stop the asphalt from reading as one featureless slab.
    for lateral, material_ref in ((-0.74, ASPHALT_WEAR), (0.72, ASPHALT_WEAR)):
        link(strip_mesh(
            f"continuous aggregate lane {lateral:+.2f}",
            [road_sample(index, lateral, 0.022) for index in range(len(LINE) + 1) for index in [index % len(LINE)]],
            0.34,
            material_ref,
        ))
    # Two genuinely narrow worked-in rubber traces through braking and exit zones.
    for start, stop in ((7, 20), (28, 41), (44, 55)):
        for lateral in (-0.34, 0.34):
            link(strip_mesh(
                f"worked-in rubber {start}-{stop} {lateral:+.2f}",
                [road_sample(index % len(LINE), lateral, 0.031) for index in range(start, stop + 1)],
                0.085,
                RUBBER,
            ))
    # Rectangular resurfacing patches have bevel and longitudinal alignment.
    for serial, index in enumerate((5, 16, 24, 37, 48)):
        x, z, height, yaw = road_sample(index, (-0.38 if serial % 2 else 0.4), 0.025)
        box(f"resurfacing patch {serial}", at(x, z, height), (1.28, 0.64, 0.018), ASPHALT_PATCH, rotation_z=-yaw, edge=0.025)


def make_kerb_blocks_and_rails() -> None:
    for index in range(0, len(LINE), 2):
        _, _, yaw = tangent(index)
        for side in (-1, 1):
            x, z = offset(index, side * (ROAD_WIDTH / 2 + KERB_WIDTH * 0.5))
            mat = KERB_RED if (index // 2 + (1 if side > 0 else 0)) % 2 == 0 else KERB_CREAM
            box(
                f"bevelled kerb block {index} {side}",
                at(x, z, road_height(index, side) + 0.035),
                (0.84, KERB_WIDTH * 0.82, 0.07),
                mat,
                rotation_z=-yaw,
                edge=0.028,
            )
    # Continuous low Armco at chosen exposed arcs. It is low enough to preserve
    # car visibility and uses horizontal rails instead of upright black slabs.
    for start, stop, side in ((2, 12, 1), (15, 25, -1), (30, 41, 1), (45, 54, -1)):
        for index in range(start, stop):
            next_index = (index + 1) % len(LINE)
            ax, az = offset(index, side * (ROAD_WIDTH / 2 + KERB_WIDTH + RUNOFF_WIDTH + 0.38))
            bx, bz = offset(next_index, side * (ROAD_WIDTH / 2 + KERB_WIDTH + RUNOFF_WIDTH + 0.38))
            length = math.hypot(bx - ax, bz - az)
            yaw = math.atan2(bz - az, bx - ax)
            mx, mz = (ax + bx) / 2, (az + bz) / 2
            for height in (0.32, 0.58):
                box(f"Armco rail {start}-{index}-{height}", at(mx, mz, height), (length + 0.08, 0.11, 0.12), STEEL, rotation_z=-yaw, edge=0.035)
            if index % 2 == 0:
                box(f"Armco post {start}-{index}", at(mx, mz, 0.3), (0.12, 0.14, 0.6), CONCRETE, rotation_z=-yaw, edge=0.018)


def make_horizontal_tyre_walls() -> None:
    # Each wheel is a real torus standing vertically with its axle along the
    # local barrier tangent. Rows are stacked and staggered like actual safety
    # walls, not the former upright solid disks.
    for zone, index, side in (("west hairpin", 8, 1), ("south bend", 19, -1), ("east sweeper", 31, 1), ("north bend", 45, -1)):
        x, z = offset(index, side * (ROAD_WIDTH / 2 + KERB_WIDTH + RUNOFF_WIDTH + 0.7))
        _, _, yaw = tangent(index)
        tangent_x, tangent_z = math.cos(yaw), math.sin(yaw)
        for row in range(2):
            for column in range(7 - row):
                along = (column - (6 - row) / 2) * 0.46 + row * 0.2
                tx, tz = x + tangent_x * along, z + tangent_z * along
                torus(
                    f"{zone} horizontal tyre r{row} c{column}",
                    at(tx, tz, 0.27 + row * 0.39),
                    0.18,
                    0.075,
                    TYRE,
                    rotation=(math.pi / 2, 0, -yaw),
                )
        # Red/cream end blocks give the dark rubber a readable edge.
        for end in (-1, 1):
            along = end * 1.75
            box(f"{zone} end block {end}", at(x + tangent_x * along, z + tangent_z * along, 0.37), (0.24, 0.52, 0.72), SAFETY_RED if end < 0 else KERB_CREAM, rotation_z=-yaw, edge=0.06)


def make_grandstand(name: str, index: int, side: int, rows: int = 5) -> None:
    x, z = offset(index, side * (ROAD_WIDTH / 2 + KERB_WIDTH + RUNOFF_WIDTH + 3.2))
    _, _, yaw = tangent(index)
    tangent_x, tangent_z = math.cos(yaw), math.sin(yaw)
    normal_x, normal_z = -math.sin(yaw) * side, math.cos(yaw) * side
    width = 5.8
    for row in range(rows):
        rx, rz = x + normal_x * row * 0.48, z + normal_z * row * 0.48
        box(f"{name} concrete tier {row}", at(rx, rz, 0.2 + row * 0.24), (width, 0.62, 0.38 + row * 0.08), CONCRETE, rotation_z=-yaw, edge=0.035)
        for seat in range(14):
            along = (seat - 6.5) * (width / 14)
            color = SEAT_BLUE if (seat + row) % 3 else SEAT_CORAL
            box(f"{name} seat {row}-{seat}", at(rx + tangent_x * along, rz + tangent_z * along, 0.47 + row * 0.26), (0.27, 0.23, 0.3), color, rotation_z=-yaw, edge=0.05)
    # Deep canopy, rear spine, and posts make the stand read as architecture.
    canopy_x, canopy_z = x + normal_x * 1.35, z + normal_z * 1.35
    box(f"{name} canopy", at(canopy_x, canopy_z, 2.45), (width + 0.5, 2.2, 0.16), SEAT_DARK, rotation_z=-yaw, edge=0.08)
    for along in (-2.6, 0, 2.6):
        box(f"{name} canopy post {along}", at(canopy_x + tangent_x * along, canopy_z + tangent_z * along, 1.25), (0.15, 0.15, 2.45), STEEL, rotation_z=-yaw, edge=0.02)


def make_pit_complex() -> None:
    # The long west straight has a coherent pit building: lower garages,
    # glazed timing floor, roof, pit wall, light panels, and a start gantry.
    building_x = -7.9
    for bay in range(6):
        z = 4.6 - bay * 1.72
        box(f"pit garage bay {bay}", at(building_x, z, 0.68), (2.2, 1.46, 1.35), PIT_WALL, edge=0.07)
        box(f"pit garage opening {bay}", at(building_x + 1.115, z, 0.64), (0.06, 1.06, 0.82), SEAT_DARK, edge=0.012)
        box(f"pit upper glazing {bay}", at(building_x, z, 1.62), (2.22, 1.38, 0.42), PIT_GLASS, edge=0.04)
        box(f"pit cyan bay lamp {bay}", at(building_x + 1.15, z, 1.16), (0.055, 0.58, 0.085), LIGHT_CYAN, edge=0.015)
    box("pit roof blade", at(building_x, 0.3, 2.02), (2.65, 11.8, 0.2), SEAT_DARK, edge=0.08)
    box("pit wall", at(-10.35, 0.3, 0.42), (0.28, 11.8, 0.78), CONCRETE, edge=0.05)
    for z in (-4.2, -1.0, 2.2, 5.4):
        box(f"pit wall red inset {z}", at(-10.52, z, 0.52), (0.06, 1.05, 0.24), SAFETY_RED, edge=0.015)
    # Start gantry crosses the actual 6.75-unit straight at x=-13.
    for x in (-15.5, -10.5):
        box(f"start gantry post {x}", at(x, -1.3, 1.45), (0.23, 0.23, 2.9), STEEL, edge=0.04)
    box("start gantry bridge", at(-13.0, -1.3, 2.74), (5.3, 0.28, 0.38), SEAT_DARK, edge=0.06)
    for x in (-14.3, -13.65, -13.0, -12.35, -11.7):
        cylinder(f"start lamp {x}", at(x, -1.48, 2.66), 0.11, 0.1, LIGHT_AMBER, rotation=(math.pi / 2, 0, 0), vertices=14)


def make_trees_and_banks() -> None:
    rng = random.Random(20260831)
    # Irregular grass banks frame the circuit without making a flat olive plane.
    for serial, (x, z, width, depth, height) in enumerate((
        (-17.2, -8.0, 4.2, 10.0, 1.1),
        (15.6, -4.0, 5.0, 12.0, 1.5),
        (11.8, 10.6, 12.0, 4.5, 1.25),
        (-8.2, 11.0, 14.0, 4.1, 1.05),
        (0.0, -14.2, 14.0, 4.0, 0.9),
    )):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=at(x, z, -0.05 + height * 0.25))
        obj = bpy.context.object
        obj.scale = (width / 2, depth / 2, height / 2)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        track(obj, GRASS_MID if serial % 2 else GRASS_DARK, f"sculpted verge bank {serial}")
    # Three depth rings. Every tree is outside the 6.2-unit road shoulder.
    for serial in range(44):
        angle = serial / 44 * math.tau + rng.uniform(-0.07, 0.07)
        rx = 18.2 + rng.uniform(-1.2, 2.0)
        rz = 14.4 + rng.uniform(-1.0, 1.9)
        x, z = math.cos(angle) * rx, math.sin(angle) * rz
        conifer(f"circuit tree {serial}", x, z, rng.uniform(1.8, 3.35), warm=serial % 9 == 0)
    # Infield island groves add parallax without reaching the road branches.
    for serial, (x, z) in enumerate(((-3.5, 0.2), (-1.6, 1.2), (2.0, 1.8), (4.1, 0.4), (1.0, -2.2))):
        conifer(f"infield tree {serial}", x, z, 1.55 + (serial % 3) * 0.28, warm=serial == 3)


def make_marshal_posts() -> None:
    for serial, (index, side) in enumerate(((10, -1), (23, 1), (34, -1), (48, 1))):
        x, z = offset(index, side * (ROAD_WIDTH / 2 + KERB_WIDTH + RUNOFF_WIDTH + 1.15))
        _, _, yaw = tangent(index)
        box(f"marshal post base {serial}", at(x, z, 0.42), (0.9, 0.7, 0.78), SAFETY_TEAL if serial % 2 else SAFETY_RED, rotation_z=-yaw, edge=0.07)
        box(f"marshal post roof {serial}", at(x, z, 0.92), (1.1, 0.92, 0.12), SEAT_DARK, rotation_z=-yaw, edge=0.05)
        lamp = LIGHT_CYAN if serial % 2 else LIGHT_AMBER
        box(f"marshal light {serial}", at(x, z, 1.06), (0.38, 0.12, 0.14), lamp, rotation_z=-yaw, edge=0.035)


def join_material_groups() -> None:
    # One mesh per material prevents hundreds of draw submissions while retaining
    # named materials and inspectable authored geometry.
    for material_name, objects in OBJECTS_BY_MATERIAL.items():
        live = [obj for obj in objects if obj.name in bpy.data.objects]
        if not live:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in live:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = live[0]
        bpy.ops.object.join()
        live[0].name = material_name
        live[0]["aura3d_non_colliding"] = True
        live[0]["aura3d_art_role"] = "renderer-owned circuit environment"


def export() -> None:
    # The script is executed in Blender background mode with a fresh process.
    # Materials are module-level authored constants, so resetting here would
    # invalidate their Blender RNA handles before geometry construction.
    make_surface_language()
    make_kerb_blocks_and_rails()
    make_horizontal_tyre_walls()
    make_grandstand("south grandstand", 20, -1)
    make_grandstand("north grandstand", 43, 1, rows=4)
    make_pit_complex()
    make_trees_and_banks()
    make_marshal_posts()
    join_material_groups()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_PATH),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_animations=False,
    )
    canonicalize_glb_float_accessors(OUT_PATH)
    print("TURBO_CIRCUIT_ENVIRONMENT_V2=" + json.dumps({
        "output": str(OUT_PATH),
        "bytes": OUT_PATH.stat().st_size,
        "centrelinePoints": len(LINE),
        "roadWidth": ROAD_WIDTH,
        "license": "CC0-1.0",
        "collisionAuthority": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    export()
