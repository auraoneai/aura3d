import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "fixtures" / "v9" / "assets" / "fog-cathedral-blender"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "fog-cathedral-blender.glb"
BLEND_OUT = OUT_DIR / "fog-cathedral-blender.blend"


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
    material.use_screen_refraction = alpha < 1
    return material


def assign(obj, material):
    obj.data.materials.append(material)
    return obj


def loc_a3d(value):
    x, y, z = value
    return (x, z, y)


def scale_a3d(value):
    x, y, z = value
    return (x, z, y)


def bevel(obj, amount=0.025, segments=2):
    modifier = obj.modifiers.new("soft architectural bevels", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = "EDGES"
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def look_at(obj, target):
    ox, oy, oz = obj.location
    tx, ty, tz = target
    direction = (tx - ox, ty - oy, tz - oz)
    obj.rotation_euler = direction_to_track_quat(direction, "-Z", "Y").to_euler()


def direction_to_track_quat(direction, track, up):
    from mathutils import Vector

    return Vector(direction).to_track_quat(track, up)


def cube(name, loc, scale, material, bevel_width=0.02, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale_a3d(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel_width:
        bevel(obj, bevel_width)
    return obj


def lancet_window(prefix, x, z, height, width, glass_material, glow_material, stone_material):
    cube(f"{prefix} glass lower", (x, 1.0, z), (width, height * 0.44, 0.045), glass_material, 0.012)
    cylinder(
        f"{prefix} glass arched crown",
        (x, 1.0 + height * 0.24, z),
        width * 0.5,
        0.052,
        glass_material,
        vertices=32,
        rot=(math.pi / 2, 0, 0),
    )
    cube(f"{prefix} glowing mullion vertical", (x, 1.02, z - 0.035), (0.035, height * 0.72, 0.035), glow_material, 0.004)
    cube(f"{prefix} glowing sill", (x, 0.58, z - 0.045), (width * 1.18, 0.035, 0.04), glow_material, 0.004)
    cube(f"{prefix} left reveal", (x - width * 0.65, 1.04, z + 0.02), (0.14, height * 0.82, 0.16), stone_material, 0.018)
    cube(f"{prefix} right reveal", (x + width * 0.65, 1.04, z + 0.02), (0.14, height * 0.82, 0.16), stone_material, 0.018)


def cylinder(name, loc, radius, depth, material, vertices=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def sphere(name, loc, radius, material, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, radius=radius, location=loc_a3d(loc))
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cone(name, loc, radius1, radius2, depth, material, vertices=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def align_local_z_between(obj, start, end):
    from mathutils import Vector

    start_vec = Vector(loc_a3d(start))
    end_vec = Vector(loc_a3d(end))
    direction = end_vec - start_vec
    if direction.length > 0.001:
        obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def rounded_shaft_proxy(name, start, end, radius, shaft_material, glow_material):
    mid = (
        (start[0] + end[0]) * 0.5,
        (start[1] + end[1]) * 0.5,
        (start[2] + end[2]) * 0.5,
    )
    length = math.sqrt(
        (start[0] - end[0]) ** 2
        + (start[1] - end[1]) ** 2
        + (start[2] - end[2]) ** 2
    )
    proxy = cone(f"{name} rounded translucent proxy volume", mid, radius * 1.55, radius * 0.42, length, shaft_material, vertices=36)
    align_local_z_between(proxy, start, end)
    sphere(f"{name} aperture bloom cap", start, radius * 0.58, glow_material, 16)
    sphere(f"{name} floor haze fade", end, radius * 0.92, shaft_material, 16)
    return proxy


def torus(name, loc, major_radius, minor_radius, material, rot=(0, 0, 0), major_segments=72, minor_segments=10):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=major_segments,
        minor_segments=minor_segments,
        major_radius=major_radius,
        minor_radius=minor_radius,
        location=loc_a3d(loc),
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def hex_panel(name, loc, radius, depth, material, rot=(0, 0, 0)):
    return cylinder(name, loc, radius, depth, material, vertices=6, rot=rot)


def batch_meshes_by_material():
    """Export-time draw-call batching: one mesh object per material where possible."""
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        key = obj.data.materials[0].name
        groups.setdefault(key, []).append(obj)

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


def arch(prefix, z, width, height, stone, glass, glow):
    for side in (-1, 1):
        x = side * width * 0.5
        cylinder(f"{prefix} side column {side}", (x, 0.78, z), 0.18, 1.56, stone, 32)
        cylinder(f"{prefix} inner column {side}", (x * 0.82, 0.88, z - 0.08), 0.11, 1.72, stone, 24)
        cube(f"{prefix} base plinth {side}", (x, -0.03, z), (0.54, 0.18, 0.54), stone, 0.035)
    for i in range(11):
        t = i / 10
        a = math.pi * (1 - t)
        x = math.cos(a) * width * 0.5
        y = 1.54 + math.sin(a) * height * 0.42
        cube(f"{prefix} arch voussoir {i:02d}", (x, y, z), (0.34, 0.24, 0.32), stone, 0.025, rot=(0, 0, -a))
    cube(f"{prefix} stained glass lower", (0, 0.95, z - 0.04), (width * 0.62, 0.72, 0.035), glass, 0.01)
    cube(f"{prefix} stained glass upper", (0, 1.58, z - 0.05), (width * 0.42, 0.58, 0.035), glass, 0.01)
    cube(f"{prefix} emissive tracer sill", (0, 0.45, z - 0.08), (width * 0.7, 0.035, 0.045), glow, 0.008)


def ribbed_vault(prefix, z, stone, glow):
    cube(f"{prefix} high central spine rib", (0, 2.7, z), (0.12, 0.12, 1.28), stone, 0.018)
    for side in (-1, 1):
        for i, x in enumerate([1.0, 1.8, 2.6]):
            cube(
                f"{prefix} diagonal rib {side} {i}",
                (side * x, 2.52 + i * 0.06, z),
                (0.085, 0.085, 1.45),
                glow if i == 0 else stone,
                0.012,
                rot=(0, 0, side * 0.38),
            )


def sentinel(prefix, x, z, facing, dark, bronze, cyan, amber):
    cube(f"{prefix} basalt plinth", (x, 0.02, z), (0.62, 0.18, 0.52), dark, 0.03, rot=(0, facing, 0))
    cylinder(f"{prefix} lower robe column", (x, 0.5, z), 0.22, 0.92, dark, 36)
    cone(f"{prefix} angular shoulder mantle", (x, 1.02, z), 0.36, 0.2, 0.34, bronze, 4, rot=(0, facing + math.pi / 4, 0))
    sphere(f"{prefix} sealed helmet", (x, 1.28, z), 0.18, dark, 24)
    cube(f"{prefix} face slit glow", (x + math.sin(facing) * 0.16, 1.3, z + math.cos(facing) * 0.16), (0.2, 0.028, 0.035), cyan, 0.002, rot=(0, facing, 0))
    cylinder(f"{prefix} processional staff", (x + math.sin(facing) * 0.36, 0.88, z + math.cos(facing) * 0.36), 0.028, 1.58, bronze, 18)
    sphere(f"{prefix} staff ember", (x + math.sin(facing) * 0.36, 1.72, z + math.cos(facing) * 0.36), 0.085, amber, 18)


def control_reliquary(prefix, loc, bronze, dark, cyan, glass, amber):
    x, y, z = loc
    cube(f"{prefix} floating machine altar base", (x, y, z), (0.78, 0.16, 0.5), bronze, 0.035)
    cube(f"{prefix} black glass instrument face", (x, y + 0.16, z - 0.03), (0.64, 0.22, 0.035), dark, 0.015)
    for i in range(4):
        cube(f"{prefix} telemetry slit {i}", (x - 0.24 + i * 0.16, y + 0.18, z - 0.055), (0.085, 0.015, 0.012), cyan if i % 2 else amber, 0.001)
    sphere(f"{prefix} glass orb sensor", (x, y + 0.44, z), 0.18, glass, 24)
    torus(f"{prefix} sensor halo", (x, y + 0.44, z), 0.26, 0.012, cyan, rot=(math.pi / 2, 0, 0), major_segments=48, minor_segments=8)


def make_scene():
    clear_scene()

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 64
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.world.color = (0.015, 0.018, 0.024)

    floor = mat("wet charcoal stone floor", (0.045, 0.05, 0.052, 1), roughness=0.68)
    stone = mat("smoke dark basalt masonry", (0.135, 0.145, 0.145, 1), metallic=0.04, roughness=0.7)
    stone_cool = mat("cool blue grey carved stone", (0.19, 0.215, 0.225, 1), metallic=0.02, roughness=0.74)
    stone_warm = mat("warm worn limestone highlights", (0.34, 0.31, 0.25, 1), metallic=0.02, roughness=0.66)
    floor_mid = mat("varied wet slate floor tiles", (0.16, 0.18, 0.18, 1), metallic=0.02, roughness=0.6)
    floor_pale = mat("pale worn aisle stone inlays", (0.48, 0.47, 0.42, 1), metallic=0.02, roughness=0.58)
    dark = mat("blackened machine steel", (0.035, 0.04, 0.045, 1), metallic=0.48, roughness=0.34)
    bronze = mat("aged bronze edge detail", (0.36, 0.25, 0.14, 1), metallic=0.65, roughness=0.38)
    glass = mat("moonlit stained glass planes", (0.24, 0.72, 1.0, 0.42), roughness=0.12, alpha=0.42, emission=(0.04, 0.34, 0.55, 1), strength=0.9)
    ruby_glass = mat("ruby stained glass chips", (0.95, 0.12, 0.2, 0.56), roughness=0.12, alpha=0.56, emission=(0.8, 0.04, 0.08, 1), strength=1.35)
    emerald_glass = mat("emerald stained glass chips", (0.12, 0.9, 0.48, 0.5), roughness=0.14, alpha=0.5, emission=(0.04, 0.65, 0.22, 1), strength=1.05)
    violet_glass = mat("violet stained glass chips", (0.48, 0.24, 1.0, 0.46), roughness=0.16, alpha=0.46, emission=(0.22, 0.06, 0.75, 1), strength=0.95)
    amber = mat("small amber altar glow", (1.0, 0.54, 0.18, 1), roughness=0.24, emission=(1.0, 0.36, 0.08, 1), strength=2.6)
    cyan = mat("blue white emissive tracery", (0.68, 0.94, 1.0, 1), roughness=0.18, emission=(0.18, 0.7, 1.0, 1), strength=2.4)
    fog = mat("painted translucent fog layers", (0.55, 0.78, 0.92, 0.075), roughness=0.1, alpha=0.075, emission=(0.08, 0.22, 0.32, 1), strength=0.24)
    dense_fog = mat("milky low floor fog", (0.64, 0.78, 0.86, 0.13), roughness=0.18, alpha=0.13, emission=(0.05, 0.16, 0.2, 1), strength=0.11)
    shaft = mat("rounded translucent shaft proxy volumes", (0.66, 0.86, 1.0, 0.12), roughness=0.06, alpha=0.12, emission=(0.16, 0.44, 0.7, 1), strength=0.46)

    cube("long wet nave floor", (0, -0.14, -0.9), (8.2, 0.14, 12.4), floor, 0.06)
    cube("dark central aisle reflecting window light", (0, -0.045, -0.9), (1.65, 0.055, 11.3), dark, 0.02)
    for lane in range(7):
        x = -2.4 + lane * 0.8
        cube(f"long varied slate aisle seam {lane:02d}", (x, 0.022, -0.9), (0.032, 0.026, 10.6), floor_mid if lane % 2 else stone_cool, 0.001)
    for row in range(26):
        z = 3.65 - row * 0.36
        material = floor_pale if row % 5 == 0 else floor_mid if row % 2 else bronze
        cube(f"cross nave floor grout line {row:02d}", (0, 0.026, z), (5.8 - min(row, 16) * 0.08, 0.022, 0.026), material, 0.001)
    for row in range(11):
        for lane in range(5):
            if (row + lane) % 3 == 1:
                x = -1.18 + lane * 0.59
                z = 2.7 - row * 0.58
                cube(f"subtle reflective floor tile {row:02d} {lane:02d}", (x, 0.04, z), (0.32, 0.014, 0.2), floor_pale if lane % 2 else stone_warm, 0.004)
    for z in [3.8, 2.3, 0.8, -0.7, -2.2, -3.7, -5.2]:
        cube(f"thin bronze threshold catching fog {z}", (0, 0.015, z), (1.44, 0.024, 0.045), bronze, 0.004)
    for z in [3.2, 1.2, -0.8, -2.8, -4.8]:
        cube(f"low rolling fog bank {z}", (0, 0.14, z), (6.8, 0.34, 0.62), dense_fog, 0.0)

    for z in [3.0, 0.6, -1.8, -4.2]:
        arch(f"left shadowed nave arch {z}", z, 2.25, 1.88, stone, glass, cyan)
        arch(f"right shadowed nave arch {z}", z, 2.25, 1.88, stone, glass, cyan)
        for obj in bpy.context.scene.objects:
            if obj.name.startswith(f"left shadowed nave arch {z}"):
                obj.location.x -= 3.05
            elif obj.name.startswith(f"right shadowed nave arch {z}"):
                obj.location.x += 3.05
        ribbed_vault(f"ribbed vault bay {z}", z, stone, cyan)

    for z in [2.15, 0.75, -0.65, -2.05]:
        for side in (-1, 1):
            x = side * 1.72
            cylinder(f"inner nave clustered column {side} {z}", (x, 0.74, z), 0.14, 1.78, stone_cool, 32)
            cylinder(f"inner nave dark column core {side} {z}", (x + side * 0.08, 0.78, z - 0.08), 0.07, 1.66, dark, 24)
            cube(f"inner nave carved base {side} {z}", (x, -0.05, z), (0.42, 0.16, 0.42), stone_warm, 0.028)
            cube(f"inner nave carved capital {side} {z}", (x, 1.66, z), (0.5, 0.16, 0.46), stone_warm, 0.024)
        cube(f"thin cross vault rib {z}", (0, 2.14, z - 0.08), (3.25, 0.055, 0.055), stone_warm, 0.006, rot=(0, 0, 0.08 * math.sin(z)))
        cube(f"cyan under-vault tracer {z}", (0, 2.04, z - 0.12), (2.62, 0.028, 0.032), cyan, 0.002, rot=(0, 0, -0.06 * math.cos(z)))

    cube("left distant apse masonry field", (-2.76, 1.05, -6.45), (1.38, 2.38, 0.16), stone, 0.035)
    cube("right distant apse masonry field", (2.76, 1.05, -6.45), (1.38, 2.38, 0.16), stone, 0.035)
    cube("upper broken apse frieze", (0, 2.28, -6.45), (4.85, 0.38, 0.16), stone_cool, 0.03)
    cube("lower stepped apse plinth", (0, 0.08, -6.4), (6.1, 0.26, 0.28), stone_warm, 0.035)
    for i, x in enumerate([-3.22, -2.1, -1.05, 1.05, 2.1, 3.22]):
        cylinder(f"apse relief pilaster {i:02d}", (x, 1.12, -6.31), 0.09, 2.12, stone_cool if i % 2 else stone_warm, 24)
        cube(f"apse relief capital block {i:02d}", (x, 2.16, -6.31), (0.28, 0.12, 0.16), bronze if i % 3 == 0 else stone_warm, 0.012)
    arch("central luminous apse arch", -6.34, 3.75, 2.25, stone, glass, cyan)
    for i, x in enumerate([-1.15, 0, 1.15]):
        lancet_window(f"apse high lancet {i}", x, -6.54, 2.55 if x == 0 else 2.25, 0.72, glass, cyan, stone)
        for chip in range(9):
            cx = x - 0.24 + (chip % 3) * 0.24
            cy = 1.0 + (chip // 3) * 0.32 + (0.06 if chip % 2 else 0)
            material = [glass, ruby_glass, emerald_glass, violet_glass, cyan][(chip + i) % 5]
            cube(f"mosaic lancet glass chip {i} {chip:02d}", (cx, cy, -6.595), (0.12, 0.18, 0.018), material, 0.002)
    cylinder("round rose window glow", (0, 2.18, -6.6), 0.68, 0.055, glass, 48, rot=(math.pi / 2, 0, 0))
    for i in range(12):
        a = i * math.pi * 2 / 12
        cube(
            f"rose window radial tracer {i:02d}",
            (math.cos(a) * 0.28, 2.18 + math.sin(a) * 0.28, -6.64),
            (0.035, 0.56, 0.035),
            cyan,
            0.003,
            rot=(0, 0, a),
        )
    for ring in range(2):
        for i in range(18):
            a = i * math.pi * 2 / 18 + ring * 0.12
            radius = 0.22 + ring * 0.24
            material = [ruby_glass, emerald_glass, glass, violet_glass, amber][(i + ring) % 5]
            cube(
                f"rose window colored petal {ring} {i:02d}",
                (math.cos(a) * radius, 2.18 + math.sin(a) * radius, -6.66),
                (0.07, 0.13, 0.016),
                material,
                0.001,
                rot=(0, 0, a),
            )

    sphere("soft amber altar core in the fog", (0, 0.92, -5.35), 0.28, amber, 32)
    torus("thin rotating relic ring outer", (0, 0.92, -5.35), 0.72, 0.018, cyan, rot=(math.pi / 2, 0, 0), major_segments=96, minor_segments=8)
    torus("thin rotating relic ring inner", (0, 0.92, -5.35), 0.47, 0.014, amber, rot=(math.pi / 2, 0.45, 0), major_segments=72, minor_segments=8)
    for i in range(10):
        a = i * math.pi * 2 / 16
        cube(f"small altar halo vane {i:02d}", (math.cos(a) * 0.58, 0.92 + math.sin(i) * 0.04, -5.35 + math.sin(a) * 0.58), (0.045, 0.34, 0.03), cyan if i % 2 else bronze, 0.006, rot=(0, a, 0.2))

    for i, (x, z, facing) in enumerate([
        (-1.65, -4.35, 0.2),
        (1.65, -4.15, -0.2),
        (-2.85, -1.15, 0.34),
        (2.85, -1.35, -0.34),
        (-2.65, 1.55, 0.18),
        (2.65, 1.35, -0.18),
    ]):
        sentinel(f"processional sentry {i:02d}", x, z, facing, dark, bronze, cyan, amber)

    for i, loc in enumerate([
        (-1.0, 0.18, -5.15),
        (1.0, 0.18, -5.25),
        (-2.7, 0.24, 0.2),
        (2.7, 0.24, -0.45),
    ]):
        control_reliquary(f"lit reliquary console {i:02d}", loc, bronze, dark, cyan, glass, amber)

    for i, x in enumerate([-3.45, -2.15, 2.15, 3.45]):
        cylinder(f"foreground silhouette column {i}", (x, 0.9, 4.0), 0.17, 1.8, dark, 32)
        cube(f"foreground capital silhouette {i}", (x, 1.82, 4.0), (0.62, 0.18, 0.42), dark, 0.025)
    cube("thin foreground bronze rail through fog", (0, 0.92, 4.05), (7.2, 0.06, 0.08), bronze, 0.012)

    for i, (x, z) in enumerate([(-2.35, 2.0), (2.1, 0.8), (-2.15, -1.2), (2.2, -2.8), (-1.3, -4.15)]):
        cylinder(f"half hidden floor lantern stem {i:02d}", (x, 0.18, z), 0.026, 0.34, bronze, 16)
        sphere(f"diffuse lantern glow behind fog {i:02d}", (x, 0.43, z), 0.12, amber if i % 2 else cyan, 18)

    for lane in (-1, 1):
        for i in range(16):
            z = 3.1 - i * 0.52
            y = 0.08 + (i % 4) * 0.012
            cube(
                f"wet floor specular inlay {lane} {i:02d}",
                (lane * (0.62 + (i % 3) * 0.18), y, z),
                (0.32, 0.018, 0.045),
                cyan if i % 5 == 0 else bronze,
                0.002,
                rot=(0, 0.0, lane * 0.08),
            )

    for i in range(70):
        x = -3.2 + (i * 37 % 64) / 64 * 6.4
        z = 3.4 - (i * 53 % 118) / 118 * 9.2
        y = 0.52 + (i * 29 % 70) / 70 * 1.6
        radius = 0.012 + (i % 5) * 0.0025
        sphere(f"suspended dust sparkle {i:02d}", (x, y, z), radius, cyan if i % 3 else amber, 10)

    for i in range(18):
        x = -3.45 if i % 2 == 0 else 3.45
        z = 2.85 - i * 0.44
        y = 2.12 + math.sin(i * 1.7) * 0.16
        cube(f"ceiling cable silhouette {i:02d}", (x, y, z), (0.035, 0.035, 1.1 + (i % 4) * 0.18), dark, 0.006, rot=(0, 0, 0.18 * (-1 if i % 2 else 1)))

    for i in range(13):
        z = 3.7 - i * 0.78
        width = 4.8 - i * 0.1
        cube(f"layered blue low nave haze {i:02d}", (0, 0.48 + (i % 3) * 0.08, z), (width, 0.28, 0.026), fog, 0.0, rot=(0.03 * (i % 2), 0, 0.02 * math.sin(i)))

    shaft_sets = [
        (-2.0, -6.58, -2.7, -1.4, 2.45, 0.22),
        (0.0, -6.6, -0.55, 1.0, 2.66, 0.28),
        (1.9, -6.58, 2.65, -0.9, 2.35, 0.2),
        (-3.2, 0.8, -1.0, 3.25, 2.25, 0.18),
        (3.2, -1.5, 0.55, 3.0, 2.2, 0.18),
    ]
    for i, (source_x, source_z, floor_x, floor_z, top_y, half_width) in enumerate(shaft_sets):
        rounded_shaft_proxy(
            f"authored aperture shaft {i:02d}",
            (source_x, top_y, source_z),
            (floor_x, 0.38, floor_z),
            half_width,
            shaft,
            cyan,
        )

    bpy.ops.object.light_add(type="AREA", location=(0, -6.65, 2.8))
    cool_light = bpy.context.object
    cool_light.name = "large blue window light"
    cool_light.data.energy = 820
    cool_light.data.size = 4.8
    bpy.ops.object.light_add(type="POINT", location=(0, -5.35, 0.95))
    altar_light = bpy.context.object
    altar_light.name = "warm altar light diffused by fog"
    altar_light.data.energy = 155
    altar_light.data.color = (1.0, 0.55, 0.2)
    bpy.ops.object.light_add(type="AREA", location=(-3.0, 0.8, 2.4))
    side_light = bpy.context.object
    side_light.name = "side shaft fill light"
    side_light.data.energy = 180
    side_light.data.size = 3.0
    side_light.data.color = (0.42, 0.76, 1.0)

    bpy.ops.object.camera_add(location=(0.85, 5.35, 1.42))
    camera = bpy.context.object
    camera.name = "gallery camera - fog cathedral default"
    look_at(camera, (0, -4.8, 1.08))
    camera.data.lens = 31
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 6.1
    camera.data.dof.aperture_fstop = 5.6
    bpy.context.scene.camera = camera

    batch_meshes_by_material()
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))


make_scene()
