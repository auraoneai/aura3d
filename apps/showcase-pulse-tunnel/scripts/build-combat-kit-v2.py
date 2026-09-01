"""Author Pulse Tunnel's original CC0 combat-kit V2 with Blender 5.2.

Everything produced by this generator is original work dedicated to CC0-1.0.
The two rigid GLBs are art candidates only: this script does not register them,
edit the Pulse runtime, or claim gameplay/collision authority.
"""

from pathlib import Path
import math
import json
import struct

import bpy
from mathutils import Matrix


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "models"
OUT.mkdir(parents=True, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene["license"] = "CC0-1.0"
    bpy.context.scene["authoring"] = "Original Aura3D Pulse Tunnel combat-kit V2"


def material(name, color, metallic=0.0, roughness=0.45, emission=None, strength=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return value


def finish(obj, value, bevel=0.0, smooth=False):
    obj.data.materials.append(value)
    obj["license"] = "CC0-1.0"
    if bevel > 0:
        modifier = obj.modifiers.new("controlled silhouette bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def prism(name, footprint, bottom, top, value, bevel=0.0):
    """Create a low horizontal prism from an authored X/Z silhouette."""
    vertices = [(x, bottom, z) for x, z in footprint] + [(x, top, z) for x, z in footprint]
    count = len(footprint)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, value, bevel)


def box(name, location, scale, value, bevel=0.05, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, value, bevel)


def cylinder(name, location, radius, depth, value, vertices=16, rotation=(0.0, 0.0, 0.0), bevel=0.025):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return finish(obj, value, bevel)


def cone(name, location, radius1, radius2, depth, value, vertices=12, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return finish(obj, value, 0.025)


def torus(name, location, major, minor, value, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=24,
        minor_segments=6,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return finish(obj, value)


def ellipsoid(name, location, scale, value, segments=20, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, value, smooth=True)


def fin(name, side, value):
    """A swept vertical tail plate, mirrored around the craft centerline."""
    x0 = side * 0.43
    x1 = side * 0.56
    vertices = [
        (x0, 0.47, 0.48), (x0, 0.49, 1.18), (x0, 1.02, 1.02),
        (x1, 0.47, 0.48), (x1, 0.49, 1.18), (x1, 1.02, 1.02),
    ]
    faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, value, 0.025)


def join_material_groups(prefix, exempt=()):
    exempt = set(exempt)
    groups = {}
    for obj in tuple(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.name in exempt:
            continue
        key = obj.data.materials[0].name if obj.data.materials else "unassigned"
        groups.setdefault(key, []).append(obj)
    for value, objects in groups.items():
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = f"{prefix} {value} assembly"
        objects[0]["license"] = "CC0-1.0"


def export(filename, forward_axis):
    bpy.ops.object.select_all(action="SELECT")
    # The helpers author in Aura's X-horizontal/Y-up/Z-depth convention.
    basis = Matrix.Rotation(math.pi / 2.0, 4, "X")
    for obj in bpy.context.scene.objects:
        obj.matrix_world = basis @ obj.matrix_world
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / filename),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_extras=True,
    )
    # Blender exports scene/object extras but not glTF asset extras. Add the
    # CLI-readable orientation and CC0 declaration without touching mesh data.
    path = OUT / filename
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise RuntimeError(f"Unexpected GLB header for {filename}")
    offset = 12
    chunks = []
    document = None
    while offset < len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8: offset + 8 + length]
        if chunk_type == 0x4E4F534A:
            document = json.loads(payload.decode("utf-8").rstrip(" \t\r\n\0"))
            document.setdefault("asset", {})["extras"] = {
                "license": "CC0-1.0",
                "aura3d": {
                    "orientation": {"forwardAxis": forward_axis, "upAxis": "+Y"},
                    "role": "unregistered Pulse Tunnel V2 art candidate",
                },
            }
            payload = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            payload += b" " * ((4 - len(payload) % 4) % 4)
        chunks.append((chunk_type, payload))
        offset += 8 + length
    if document is None:
        raise RuntimeError(f"No JSON chunk found in {filename}")
    body = b"".join(struct.pack("<II", len(payload), chunk_type) + payload for chunk_type, payload in chunks)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


def build_interceptor():
    reset()
    pearl = material("v2 interceptor pearl ceramic", (0.48, 0.64, 0.74), 0.58, 0.24)
    graphite = material("v2 interceptor graphite frame", (0.018, 0.045, 0.075), 0.84, 0.22)
    copper = material("v2 interceptor copper edge", (0.55, 0.19, 0.035), 0.82, 0.21)
    canopy = material("v2 interceptor cyan canopy", (0.015, 0.19, 0.26), 0.35, 0.14, (0.0, 0.85, 1.0), 5.4)
    drive = material("v2 interceptor drive core", (0.015, 0.28, 0.33), 0.28, 0.16, (0.05, 0.95, 1.0), 7.0)
    muzzle = material("v2 interceptor weapon anchor", (0.34, 0.10, 0.025), 0.55, 0.18, (1.0, 0.24, 0.035), 5.8)

    prism(
        "interceptor arrowhead fuselage",
        [(-0.54, -0.86), (0.0, -1.72), (0.54, -0.86), (0.58, 0.72), (0.0, 1.18), (-0.58, 0.72)],
        0.16, 0.60, pearl, 0.08,
    )
    prism(
        "interceptor ventral keel",
        [(-0.24, -1.04), (0.0, -1.55), (0.24, -1.04), (0.34, 1.20), (-0.34, 1.20)],
        0.02, 0.23, graphite, 0.055,
    )
    for side in (-1, 1):
        wing = [(0.34, -0.52), (1.62, -0.02), (1.42, 1.05), (0.46, 0.70)]
        prism(
            f"interceptor swept delta wing {side}",
            [(side * x, z) for x, z in wing],
            0.18, 0.36, pearl, 0.055,
        )
        edge = [(0.78, -0.25), (1.66, 0.02), (1.43, 0.28), (0.70, 0.08)]
        prism(
            f"interceptor copper leading edge {side}",
            [(side * x, z) for x, z in edge],
            0.34, 0.42, copper, 0.022,
        )
        cylinder(
            f"interceptor lance barrel {side}",
            (side * 1.04, 0.37, -0.62), 0.085, 1.24, graphite, 14,
        )
        torus(
            f"interceptor visible muzzle collar {side}",
            (side * 1.04, 0.37, -1.245), 0.105, 0.033, muzzle,
        )
        cylinder(
            f"interceptor drive nacelle {side}",
            (side * 0.56, 0.30, 0.83), 0.22, 0.74, graphite, 16,
        )
        torus(
            f"interceptor drive aperture {side}",
            (side * 0.56, 0.30, 1.215), 0.17, 0.055, drive,
        )
        ellipsoid(
            f"interceptor drive glow {side}",
            (side * 0.56, 0.30, 1.24), (0.115, 0.115, 0.055), drive, 16, 8,
        )
        fin(f"interceptor dorsal fin {side}", side, copper)

    ellipsoid("interceptor raised canopy", (0.0, 0.64, -0.18), (0.31, 0.22, 0.58), canopy)
    box("interceptor canopy spine", (0.0, 0.66, 0.42), (0.09, 0.08, 0.62), graphite, 0.035)
    join_material_groups(
        "interceptor",
        exempt=(
            "interceptor raised canopy",
            "interceptor visible muzzle collar -1",
            "interceptor visible muzzle collar 1",
            "interceptor drive aperture -1",
            "interceptor drive aperture 1",
            "interceptor drive glow -1",
            "interceptor drive glow 1",
        ),
    )
    export("pulseV2InterceptorCraft.glb", "-Z")


def build_dreadnought():
    reset()
    armor = material("v2 dreadnought cobalt armour", (0.035, 0.12, 0.22), 0.76, 0.24)
    black = material("v2 dreadnought black mechanics", (0.012, 0.025, 0.045), 0.88, 0.19)
    copper = material("v2 dreadnought copper structure", (0.48, 0.16, 0.03), 0.84, 0.22)
    ivory = material("v2 dreadnought threat ceramic", (0.69, 0.58, 0.38), 0.38, 0.27)
    rose = material("v2 dreadnought impact iris", (0.34, 0.01, 0.075), 0.28, 0.15, (1.0, 0.02, 0.16), 6.8)
    cyan = material("v2 dreadnought optic array", (0.0, 0.19, 0.26), 0.26, 0.15, (0.0, 0.78, 1.0), 5.5)
    amber = material("v2 dreadnought cannon anchor", (0.38, 0.08, 0.01), 0.48, 0.16, (1.0, 0.21, 0.025), 7.0)

    # Eight-sided vertical cores avoid a box-built character read while keeping
    # the terminal opponent at six primary material draws after grouping.
    cylinder(
        "dreadnought armoured reactor thorax", (0.0, 1.58, 0.0), 1.12, 2.36,
        armor, 8, (math.pi / 2.0, 0.0, 0.0), 0.075,
    )
    box("dreadnought forward breastplate", (0.0, 1.58, 0.72), (0.78, 0.72, 0.12), ivory, 0.11)
    prism(
        "dreadnought crown mantle",
        [(-0.92, -0.22), (-0.54, -0.74), (0.54, -0.74), (0.92, -0.22), (0.64, 0.52), (-0.64, 0.52)],
        2.35, 2.78, copper, 0.075,
    )
    for side in (-1, 1):
        mantle = [(0.55, -0.28), (2.46, -0.14), (2.78, 0.48), (1.84, 0.82), (0.72, 0.52)]
        prism(
            f"dreadnought swept command mantle {side}",
            [(side * x, z) for x, z in mantle],
            1.82, 2.30, armor, 0.075,
        )
        strake = [(1.22, 0.32), (2.66, 0.51), (2.32, 0.82), (1.28, 0.66)]
        prism(
            f"dreadnought ivory threat strake {side}",
            [(side * x, z) for x, z in strake],
            2.14, 2.38, ivory, 0.04,
        )
        cylinder(
            f"dreadnought cannon barrel {side}",
            (side * 1.58, 1.67, 0.60), 0.22, 1.54, black, 18,
        )
        torus(
            f"dreadnought cannon mouth {side}",
            (side * 1.58, 1.67, 1.39), 0.29, 0.09, amber,
        )
        cylinder(
            f"dreadnought cannon bore {side}",
            (side * 1.58, 1.67, 1.405), 0.135, 0.055, amber, 16,
        )
        ellipsoid(
            f"dreadnought shoulder optic {side}",
            (side * 1.98, 2.12, 0.68), (0.15, 0.15, 0.09), cyan, 16, 8,
        )
        cone(
            f"dreadnought hover talon {side}",
            (side * 0.64, 0.42, -0.05), 0.30, 0.16, 0.82, copper, 10,
            (math.pi / 2.0, 0.0, 0.0),
        )

    torus("dreadnought central impact iris", (0.0, 1.60, 0.89), 0.48, 0.12, rose)
    cylinder("dreadnought exposed reactor core", (0.0, 1.60, 0.91), 0.29, 0.075, rose, 20)
    prism(
        "dreadnought lower shield prow",
        [(-0.78, -0.18), (0.0, 0.76), (0.78, -0.18), (0.48, -0.62), (-0.48, -0.62)],
        0.43, 0.88, black, 0.065,
    )
    ellipsoid("dreadnought command optic", (0.0, 2.48, 0.43), (0.36, 0.14, 0.12), cyan, 18, 8)
    join_material_groups(
        "dreadnought",
        exempt=(
            "dreadnought central impact iris",
            "dreadnought exposed reactor core",
            "dreadnought command optic",
            "dreadnought cannon mouth -1",
            "dreadnought cannon mouth 1",
            "dreadnought cannon bore -1",
            "dreadnought cannon bore 1",
        ),
    )
    export("pulseV2TerminalDreadnought.glb", "+Z")


build_interceptor()
build_dreadnought()
print("Built original CC0 Pulse Tunnel combat-kit V2 in", OUT)
