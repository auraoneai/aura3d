#!/usr/bin/env python3
"""Build the original CC0 Gravity Post courier-skiff candidate.

Copyright 2026 Aura3D contributors. Dedicated to the public domain under CC0
1.0: https://creativecommons.org/publicdomain/zero/1.0/

The asset is +Y-up after glTF export and +Z-forward. It is an art candidate:
this script writes only route-local candidate/probe files and never edits the
shared manifest or public asset directory.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector


APP_DIR = Path(__file__).resolve().parent.parent
OUT_DIR = APP_DIR / "assets" / "candidates"
OUT_PATH = OUT_DIR / "gravityPostCourierSkiff.candidate.glb"
PREVIEW_PATH = OUT_DIR / "gravityPostCourierSkiff.preview.png"
GROUPS: dict[str, list[bpy.types.Object]] = {}


def image_material(name: str, color: tuple[float, float, float, float], metallic: float,
                   roughness: float, stripe: tuple[float, float, float, float] | None = None,
                   emission: tuple[float, float, float] | None = None,
                   strength: float = 0.0) -> bpy.types.Material:
    """Create a glTF-safe authored paint material with a tiny packed texture.

    A flat base color was the largest visual weakness in the previous skiff:
    every panel collapsed into one undifferentiated color at gameplay distance.
    The deterministic two-tone image is intentionally small and packed into the
    GLB, so the route has real material evidence without a runtime URL or a
    network dependency.  Blender's primitive UVs carry the pattern across the
    beveled panel pieces.
    """
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.diffuse_color = color
    value.metallic = metallic
    value.roughness = roughness
    nodes = value.node_tree.nodes
    links = value.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        return value
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (*emission, 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = strength
    texture = bpy.data.images.new(name + " packed paint", width=32, height=32, alpha=False)
    accent = stripe or color
    pixels: list[float] = []
    for y in range(32):
        for x in range(32):
            # Fine diagonal micro-stripes break up broad surfaces while keeping
            # the working courier's navy/cyan/amber language coherent.
            use_accent = ((x + y * 2) // 4) % 2 == 1
            source = accent if use_accent else color
            pixels.extend(source[:3])
            pixels.append(1.0)
    texture.pixels = pixels
    texture.pack()
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.name = name + " packed texture"
    image_node.image = texture
    image_node.interpolation = "Linear"
    texcoord = nodes.new("ShaderNodeTexCoord")
    links.new(texcoord.outputs["UV"], image_node.inputs["Vector"])
    links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
    return value


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name: str, color: tuple[float, float, float, float], metallic: float,
        roughness: float, emission: tuple[float, float, float] | None = None,
        strength: float = 0.0) -> bpy.types.Material:
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.diffuse_color = color
    value.metallic = metallic
    value.roughness = roughness
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission:
            key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
            bsdf.inputs[key].default_value = (*emission, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = strength
    return value


def finish(obj: bpy.types.Object, material: bpy.types.Material, name: str,
           bevel: float = 0.018) -> bpy.types.Object:
    obj.name = name
    obj.data.materials.append(material)
    if bevel:
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new("machined edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj["aura3d_art_role"] = "primary courier vehicle"
    obj["aura3d_non_colliding"] = True
    # Keep the tiny UV islands from primitive panels intact for the packed
    # material textures.  Custom wedge surfaces remain valid flat-color faces.
    if obj.type == "MESH" and len(obj.data.uv_layers) == 0:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.03)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    GROUPS.setdefault(material.name, []).append(obj)
    return obj


def box(name: str, location: tuple[float, float, float],
        dimensions: tuple[float, float, float], material: bpy.types.Material,
        rotation: tuple[float, float, float] = (0, 0, 0),
        bevel: float = 0.018) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, material, name, min(bevel, min(dimensions) * 0.15))


def cylinder(name: str, location: tuple[float, float, float], radius: float,
             depth: float, material: bpy.types.Material,
             rotation: tuple[float, float, float] = (0, 0, 0),
             vertices: int = 24) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius,
                                       depth=depth, location=location,
                                       rotation=rotation)
    return finish(bpy.context.object, material, name, 0.012)


def torus(name: str, location: tuple[float, float, float], major: float,
          minor: float, material: bpy.types.Material,
          rotation: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=24,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    return finish(bpy.context.object, material, name, min(minor * 0.35, 0.008))


def wedge(name: str, location: tuple[float, float, float],
          dimensions: tuple[float, float, float], material: bpy.types.Material,
          forward: bool = True) -> bpy.types.Object:
    x, y, z = (value / 2 for value in dimensions)
    sign = 1 if forward else -1
    verts = [
        (-x, -y, -z), (x, -y, -z), (-x, y, -z), (x, y, -z),
        (-x * 0.62, -y, sign * z), (x * 0.62, -y, sign * z),
        (-x * 0.62, y, sign * z), (x * 0.62, y, sign * z),
    ]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
             (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return finish(obj, material, name, 0.025)


def build() -> None:
    reset()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Real packed two-tone paint maps keep the route's broad panels from
    # collapsing into single flat color patches.  Every texture is generated
    # deterministically and embedded in the candidate GLB by image_material.
    graphite = image_material("GPCS graphite armored hull", (0.035, 0.065, 0.085, 1), 0.72, 0.27,
                             (0.075, 0.13, 0.16, 1))
    navy = image_material("GPCS postal navy", (0.025, 0.16, 0.22, 1), 0.5, 0.31,
                          (0.04, 0.25, 0.31, 1))
    alloy = image_material("GPCS brushed alloy", (0.43, 0.58, 0.64, 1), 0.8, 0.2,
                           (0.22, 0.36, 0.42, 1))
    canopy = image_material("GPCS cyan canopy", (0.025, 0.38, 0.47, 1), 0.24, 0.12,
                            (0.02, 0.23, 0.3, 1), (0.02, 0.38, 0.48), 0.65)
    parcel = image_material("GPCS parcel amber", (0.82, 0.22, 0.025, 1), 0.36, 0.36,
                            (0.48, 0.09, 0.012, 1), (0.55, 0.07, 0.005), 0.18)
    parcel_light = image_material("GPCS parcel cream", (0.9, 0.62, 0.17, 1), 0.22, 0.42,
                                  (0.64, 0.3, 0.045, 1))
    cyan = image_material("GPCS cyan running light", (0.01, 0.26, 0.34, 1), 0.18, 0.2,
                          (0.02, 0.12, 0.17, 1), (0.0, 0.9, 1.0), 4.0)
    amber = mat("GPCS amber drive light", (0.34, 0.06, 0.005, 1), 0.2, 0.24,
                (1.0, 0.22, 0.015), 4.5)
    rubber = image_material("GPCS landing skid", (0.015, 0.022, 0.027, 1), 0.1, 0.68,
                            (0.035, 0.045, 0.05, 1))
    white = image_material("GPCS postal identity", (0.78, 0.91, 0.93, 1), 0.34, 0.32,
                           (0.36, 0.58, 0.63, 1), (0.2, 0.55, 0.62), 0.25)

    # Low, forward-weighted hull — clearly a working courier skiff, not a
    # capital ship. +Z is the declared travel direction.
    wedge("courier armored nose", (0, 0.42, 0.56), (1.26, 0.36, 1.18), navy)
    box("courier central chassis", (0, 0.34, -0.22), (1.34, 0.34, 1.08), graphite)
    box("courier belly pan", (0, 0.2, 0), (1.18, 0.13, 1.92), alloy)
    # Layered shoulder and keel plates make the hull read as a purpose-built
    # courier rather than a cube with a payload box.  Their bevels catch the
    # route's cool key and warm rim at the same scale as the parcel hardware.
    for side in (-1, 1):
        wedge(f"courier shoulder fairing {side}", (side * 0.62, 0.42, 0.08),
              (0.26, 0.3, 1.38), navy, forward=True)
        box(f"courier side armor inset {side}", (side * 0.7, 0.34, -0.08),
            (0.055, 0.2, 0.78), alloy, bevel=0.012)
        box(f"courier route stripe {side}", (side * 0.73, 0.49, 0.33),
            (0.025, 0.075, 0.74), cyan, bevel=0.006)
    box("courier lower keel blade", (0, 0.12, 0.18), (0.5, 0.08, 1.34), graphite, bevel=0.014)
    wedge("courier cyan canopy", (0, 0.66, 0.47), (0.76, 0.31, 0.64), canopy)
    box("canopy center mullion", (0, 0.72, 0.47), (0.035, 0.33, 0.66), graphite, bevel=0.006)
    for side in (-1, 1):
        box(f"canopy side frame {side}", (side * 0.31, 0.68, 0.47), (0.055, 0.08, 0.58), alloy, bevel=0.008)
    box("courier canopy visor", (0, 0.83, 0.64), (0.5, 0.045, 0.16), canopy, bevel=0.01)

    # Swept side wings and luminous hover emitters establish a recognisable
    # delivery-skiff silhouette at the route's small review scale.  The prior
    # candidate read as a short slab with four wheel-like pods; these tapered
    # outriggers widen the craft, expose a clear nose-to-tail axis, and keep the
    # working-vehicle language grounded in the same CC0 material family. They
    # are render-only geometry: route-local pod state still owns all motion and
    # the Rapier body remains the sole gameplay collider.
    for side in (-1, 1):
        wedge(
            f"courier swept hover wing {side}",
            (side * 0.92, 0.3, 0.06),
            (0.5, 0.16, 1.18),
            navy,
            forward=False,
        )
        box(
            f"courier wing root brace {side}",
            (side * 0.78, 0.26, -0.05),
            (0.12, 0.18, 0.72),
            alloy,
            bevel=0.012,
        )
        box(
            f"courier wing route light {side}",
            (side * 1.12, 0.34, 0.28),
            (0.035, 0.045, 0.58),
            cyan,
            bevel=0.006,
        )
        cylinder(
            f"courier hover emitter {side}",
            (side * 1.1, 0.18, -0.34),
            0.13,
            0.12,
            cyan,
            rotation=(0, math.pi / 2, 0),
            vertices=20,
        )

    # A shallow dorsal dispatch fin turns the parcel module into part of the
    # craft's load-bearing architecture instead of an isolated orange cube.
    wedge("courier dorsal dispatch fin", (0, 0.66, -0.13), (0.52, 0.42, 0.38), parcel_light, forward=False)
    box("courier dispatch fin spine", (0, 0.88, -0.1), (0.08, 0.06, 0.44), amber, bevel=0.008)

    # A large, unmistakable detachable parcel module occupies the rear third.
    # Its corner guards, straps and illuminated latch remain readable from the
    # route's high oblique camera.
    box("detachable express parcel", (0, 0.62, -0.58), (0.92, 0.62, 0.75), parcel, bevel=0.055)
    for x in (-0.43, 0.43):
        box(f"parcel vertical corner guard {x}", (x, 0.62, -0.58),
            (0.07, 0.68, 0.79), alloy, bevel=0.01)
    for z in (-0.84, -0.32):
        box(f"parcel horizontal guard {z}", (0, 0.62, z),
            (0.96, 0.08, 0.08), parcel_light, bevel=0.012)
    for side in (-1, 1):
        box(f"parcel side route chevron {side}", (side * 0.475, 0.62, -0.58),
            (0.025, 0.36, 0.26), parcel_light, rotation=(0, side * 0.45, 0), bevel=0.006)
    box("parcel lower shock cradle", (0, 0.27, -0.58), (1.02, 0.09, 0.84), graphite, bevel=0.018)
    box("parcel illuminated latch", (0, 0.64, -0.975), (0.3, 0.18, 0.035), amber, bevel=0.008)
    # Raised envelope glyph: rectangular letter plus diagonal fold lines.
    box("postal envelope badge", (0, 0.95, -0.58), (0.46, 0.025, 0.3), white, bevel=0.016)
    for side in (-1, 1):
        box(f"postal envelope fold {side}", (side * 0.105, 0.968, -0.58),
            (0.028, 0.02, 0.31), parcel, rotation=(0, side * 0.58, 0), bevel=0.004)

    # Four grounded skid / drive pods establish deck contact in an action
    # frame; bright hubs and low shadowable feet avoid the floating-toy read.
    for x in (-0.68, 0.68):
        for z in (-0.55, 0.5):
            box(f"drive arm {x} {z}", (x * 0.82, 0.26, z), (0.3, 0.12, 0.18), alloy)
            box(f"drive arm outer brace {x} {z}", (x * 0.92, 0.16, z), (0.12, 0.1, 0.36), graphite, bevel=0.01)
            cylinder(f"contact drive pod {x} {z}", (x, 0.2, z), 0.2, 0.19,
                     rubber, rotation=(0, math.pi / 2, 0))
            cylinder(f"drive hub {x} {z}", (x + (0.101 if x > 0 else -0.101), 0.2, z),
                     0.11, 0.025, cyan if z > 0 else amber,
                     rotation=(0, math.pi / 2, 0), vertices=20)
            box(f"ground contact pad {x} {z}", (x, 0.055, z), (0.31, 0.07, 0.24), rubber)
            torus(f"drive pod rim {x} {z}", (x + (0.101 if x > 0 else -0.101), 0.2, z), 0.135, 0.018,
                  alloy, rotation=(0, math.pi / 2, 0))

    # Direction and propulsion: twin aft nozzles plus long illuminated postal
    # rails make the nose/engine relationship legible even at thumbnail scale.
    for x in (-0.43, 0.43):
        cylinder(f"aft thruster nozzle {x}", (x, 0.34, -1.03), 0.16, 0.18,
                 graphite, rotation=(math.pi / 2, 0, 0))
        cylinder(f"aft thruster core {x}", (x, 0.34, -1.13), 0.09, 0.035,
                 amber, rotation=(math.pi / 2, 0, 0), vertices=20)
        box(f"postal running rail {x}", (x, 0.53, 0.08), (0.045, 0.045, 1.65), cyan, bevel=0.008)
    box("front dispatch lightbar", (0, 0.45, 1.08), (0.7, 0.06, 0.05), cyan, bevel=0.01)
    box("front dispatch bumper", (0, 0.3, 1.1), (0.82, 0.16, 0.08), alloy, bevel=0.018)
    for side in (-1, 1):
        cylinder(f"front nav lens {side}", (side * 0.33, 0.44, 1.11), 0.045, 0.028,
                 cyan if side > 0 else amber, rotation=(math.pi / 2, 0, 0), vertices=16)
    box("parcel route number plate", (0, 0.53, -1.01), (0.42, 0.18, 0.025), white, bevel=0.008)

    # Bake every authored placement before material merging. Blender joins into
    # the active object's local frame; baking first prevents repeated material
    # groups from inheriting an arbitrary component origin.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Merge by material into a production-appropriate small draw footprint.
    for material_name, objects in list(GROUPS.items()):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = material_name

    # Calls above are authored directly in Aura coordinates (X right, Y up,
    # +Z forward). Rotate that assembly into Blender's Z-up space before its
    # glTF exporter performs the inverse axis conversion.
    bpy.ops.object.select_all(action="SELECT")
    for obj in bpy.context.selected_objects:
        obj.rotation_euler.rotate_axis("X", math.pi / 2)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT_PATH), export_format="GLB",
                              use_selection=True, export_apply=True,
                              export_materials="EXPORT")

    # A reproducible Blender workbench-style presentation; release proof still
    # requires the repository's root createAuraApp probe after registration.
    bpy.ops.object.camera_add(location=(3.5, -4.1, 2.7))
    camera = bpy.context.object
    direction = Vector((0, 0, 0.45)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58
    bpy.context.scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=(2.6, -3.2, 4.0))
    bpy.context.object.data.energy = 1100
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 4.0
    bpy.ops.object.light_add(type="AREA", location=(-3.0, -1.0, 2.0))
    bpy.context.object.data.energy = 700
    bpy.context.object.data.color = (0.2, 0.65, 1.0)
    bpy.context.object.data.size = 3.0
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)
    scene.world = bpy.data.worlds.new("courier preview world")
    scene.world.color = (0.004, 0.008, 0.014)
    bpy.ops.render.render(write_still=True)


def canonicalize(path: Path) -> None:
    payload = bytearray(path.read_bytes())
    json_length, json_type = struct.unpack_from("<II", payload, 12)
    if payload[:4] != b"glTF" or json_type != 0x4E4F534A:
        raise RuntimeError("unexpected GLB layout")
    json_start = 20
    document = json.loads(bytes(payload[json_start:json_start + json_length]).decode("utf-8"))
    bin_header = json_start + json_length
    _, bin_type = struct.unpack_from("<II", payload, bin_header)
    if bin_type != 0x004E4942:
        raise RuntimeError("GLB has no binary chunk")
    bin_start = bin_header + 8
    counts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
    views = document.get("bufferViews", [])
    for accessor in document.get("accessors", []):
        if accessor.get("componentType") != 5126 or "bufferView" not in accessor or accessor.get("sparse"):
            continue
        view = views[accessor["bufferView"]]
        components = counts[accessor["type"]]
        stride = view.get("byteStride", components * 4)
        base = bin_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        for element in range(accessor["count"]):
            for component in range(components):
                offset = base + element * stride + component * 4
                value = struct.unpack_from("<f", payload, offset)[0]
                struct.pack_into("<f", payload, offset, 0.0 if abs(value) < 0.0000005 else round(value, 6))
    path.write_bytes(payload)


if __name__ == "__main__":
    build()
    canonicalize(OUT_PATH)
    print(OUT_PATH)
