import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "fixtures" / "threejs-parity" / "assets" / "marina-lake-blender"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "marina-lake-blender.glb"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def mat(name, color, metallic=0.0, roughness=0.55, emission=None, strength=0.0, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Alpha"].default_value = alpha
        if emission:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = strength
    material.blend_method = "BLEND" if alpha < 1 else "OPAQUE"
    return material


def assign(obj, material):
    obj.data.materials.append(material)
    return obj


def bevel(obj, amount=0.03, segments=2):
    modifier = obj.modifiers.new("soft bevel", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = "EDGES"
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cube(name, loc, scale, material, bevel_width=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel_width:
        bevel(obj, bevel_width)
    return obj


def cylinder(name, loc, radius, depth, material, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cone(name, loc, radius1, radius2, depth, material, vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def ico(name, loc, scale, material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    assign(obj, material)
    return obj


def torus(name, loc, major, minor, material):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=64,
        minor_segments=8,
        major_radius=major,
        minor_radius=minor,
        location=loc,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def batch_meshes_by_material():
    """Export-time draw-call batching for repeated static marina props."""
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        groups.setdefault(obj.data.materials[0].name, []).append(obj)

    for material_name, objects in groups.items():
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            for modifier in list(obj.modifiers):
                try:
                    bpy.ops.object.modifier_apply(modifier=modifier.name)
                except RuntimeError:
                    pass
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        bpy.context.object.name = f"batched {material_name}"


def water_mesh(material):
    verts = []
    faces = []
    cols = 72
    rows = 44
    width = 15.8
    depth = 10.8
    for z in range(rows):
        for x in range(cols):
            u = x / (cols - 1)
            v = z / (rows - 1)
            px = (u - 0.5) * width
            pz = (v - 0.5) * depth
            py = -0.12 + math.sin(px * 1.4 + pz * 0.7) * 0.018 + math.sin(px * 0.4 - pz * 1.8) * 0.014
            verts.append((px, py, pz))
    for z in range(rows - 1):
        for x in range(cols - 1):
            i = z * cols + x
            faces.append((i, i + 1, i + cols + 1, i + cols))
    mesh = bpy.data.meshes.new("authored animated water reference mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("authored marina water tessellation", mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    obj.modifiers.new("smooth water normals", "WEIGHTED_NORMAL")
    return obj


def make_scene():
    clear_scene()
    wood = mat("weathered cedar dock", (0.42, 0.28, 0.17, 1), roughness=0.62)
    metal = mat("brushed dock metal", (0.52, 0.56, 0.58, 1), metallic=0.55, roughness=0.32)
    lodge = mat("warm cedar lodges", (0.46, 0.25, 0.13, 1), roughness=0.5)
    roof = mat("dark standing seam roofs", (0.09, 0.11, 0.13, 1), metallic=0.15, roughness=0.38)
    window = mat("warm window light", (1.0, 0.62, 0.28, 1), roughness=0.2, emission=(1.0, 0.48, 0.12, 1), strength=2.2)
    rock = mat("wet shoreline rock", (0.34, 0.34, 0.31, 1), roughness=0.74)
    pine_trunk = mat("pine bark", (0.18, 0.11, 0.06, 1), roughness=0.8)
    pine_leaf = mat("dense alpine pine", (0.04, 0.2, 0.12, 1), roughness=0.75)
    boat = mat("ivory marina boat", (0.88, 0.9, 0.86, 1), roughness=0.34)
    sail = mat("warm canvas sail", (0.9, 0.83, 0.7, 1), roughness=0.72)
    lamp = mat("dock lantern glow", (1.0, 0.72, 0.34, 1), roughness=0.18, emission=(1.0, 0.47, 0.14, 1), strength=3.4)
    mountain = mat("soft dusk mountains", (0.08, 0.1, 0.14, 1), roughness=0.86)
    shoreline = mat("sand and gravel shoreline", (0.55, 0.45, 0.32, 1), roughness=0.8)
    water = mat("A3D procedural marina water reference surface", (0.025, 0.2, 0.3, 0.3), roughness=0.08, emission=(0.0, 0.03, 0.05, 1), strength=0.12, alpha=0.3)
    foam = mat("measured shoreline foam and wake strips", (0.84, 0.96, 1.0, 0.62), roughness=0.32, emission=(0.18, 0.36, 0.46, 1), strength=0.28, alpha=0.62)
    glint = mat("painted fresnel glint evidence", (0.74, 0.94, 1.0, 0.46), roughness=0.12, emission=(0.2, 0.5, 0.66, 1), strength=0.42, alpha=0.46)
    ripple = mat("visible ripple ring markers", (0.64, 0.9, 1.0, 0.5), roughness=0.2, emission=(0.14, 0.36, 0.46, 1), strength=0.32, alpha=0.5)

    water_mesh(water)
    cube("near shoreline shelf", (0, -0.34, 4.6), (12.4, 0.14, 1.2), shoreline, 0.05)
    cube("far shoreline shelf", (-0.4, -0.34, -5.3), (11.2, 0.14, 0.95), shoreline, 0.05)
    cube("lakeside boardwalk", (-0.9, -0.18, -3.02), (7.8, 0.1, 1.35), wood, 0.025)

    for i in range(18):
        x = -4.8 + i * 0.55
        cube(f"dock plank {i:02d}", (x, 0.03, -2.92), (0.42, 0.09, 1.52), wood, 0.025)
        cylinder(f"dock post {i:02d}", (x, 0.3, -2.12), 0.035, 0.66, metal, 18)
        if i % 2 == 0:
            cylinder(f"dock lantern stem {i:02d}", (x, 0.52, -3.78), 0.035, 0.62, lamp, 18)
            ico(f"dock lantern bulb {i:02d}", (x, 0.88, -3.78), (0.09, 0.09, 0.09), lamp)

    for i in range(6):
        x = -5.4 + i * 1.18
        h = 0.76 + (i % 3) * 0.22
        cube(f"cedar lodge body {i:02d}", (x, 0.26 + h * 0.5, -5.0), (0.78, h, 0.62), lodge, 0.04)
        cube(f"cedar lodge roof {i:02d}", (x, 0.34 + h, -5.0), (0.94, 0.16, 0.78), roof, 0.035)
        for w in range(3):
            cube(f"lit lodge window {i:02d}-{w}", (x - 0.23 + w * 0.23, 0.43 + h * 0.45, -4.66), (0.07, 0.12, 0.018), window, 0.008)

    for i in range(11):
        x = -7.2 + i * 1.45
        h = 1.1 + (math.sin(i * 1.7) + 1) * 0.8
        cube(f"distant mountain slab {i:02d}", (x, 0.15 + h * 0.5, -6.45), (1.4, h, 0.16), mountain, 0.02)

    for i in range(24):
        x = -7.7 + (i % 12) * 1.35
        z = -5.74 if i < 16 else 5.26
        cylinder(f"pine trunk {i:02d}", (x, 0.28, z), 0.045, 0.78, pine_trunk, 12)
        cone(f"pine lower canopy {i:02d}", (x, 0.82, z), 0.28, 0.04, 0.56, pine_leaf, 20)
        cone(f"pine upper canopy {i:02d}", (x, 1.16, z), 0.2, 0.02, 0.42, pine_leaf, 20)

    for i in range(32):
        x = -7.4 + (i % 16) * 0.98
        z = -5.95 if i < 22 else 5.75
        ico(f"shore rock {i:02d}", (x, -0.19, z), (0.18 + (i % 3) * 0.06, 0.11, 0.16 + (i % 5) * 0.035), rock)

    for i in range(22):
        x = -7.6 + i * 0.72
        cube(f"near shoreline foam evidence {i:02d}", (x, -0.045, 4.12 + math.sin(i * 0.7) * 0.18), (0.52 + (i % 4) * 0.12, 0.01, 0.035), foam, 0.0)
        if i < 17:
            cube(f"far shoreline foam evidence {i:02d}", (x + 0.1, -0.052, -4.72 + math.cos(i * 0.5) * 0.08), (0.4 + (i % 3) * 0.1, 0.01, 0.028), foam, 0.0)

    for i in range(58):
        x = -7.3 + (i % 19) * 0.78 + math.sin(i * 1.6) * 0.05
        z = -3.7 + (i // 19) * 2.35 + math.sin(i * 0.9) * 0.16
        cube(f"water fresnel glint reference {i:02d}", (x, -0.038, z), (0.18 + (i % 5) * 0.1, 0.008, 0.018), glint, 0.0)

    for i, (x, z) in enumerate([(2.1, -1.35), (-3.15, 1.7)]):
        for radius in (0.34, 0.58, 0.82):
            torus(f"ambient ripple ring reference {i}-{radius:.2f}", (x, -0.03, z), radius, 0.006, ripple)

    cube("marina boat hull", (2.05, 0.17, 1.42), (1.52, 0.22, 0.64), boat, 0.08)
    cube("marina boat cabin", (2.04, 0.43, 1.28), (0.72, 0.28, 0.38), boat, 0.04)
    cylinder("marina boat mast", (2.05, 0.96, 1.28), 0.03, 1.22, metal, 16)
    cube("marina sail", (2.35, 1.08, 1.12), (0.05, 0.74, 0.5), sail, 0.018)

    bpy.ops.object.light_add(type="AREA", location=(0, 4.5, -2.6))
    bpy.context.object.name = "large sunset area light"
    bpy.context.object.data.energy = 500
    bpy.context.object.data.size = 5

    bpy.ops.object.camera_add(location=(4.8, 2.5, 4.8), rotation=(math.radians(63), 0, math.radians(42)))
    bpy.context.scene.camera = bpy.context.object

    batch_meshes_by_material()
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_apply=True)


make_scene()
