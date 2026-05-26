import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "fixtures" / "v9" / "assets" / "reactor-command-center-blender"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "reactor-command-center-blender.glb"
BLEND_OUT = OUT_DIR / "reactor-command-center-blender.blend"


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
        if alpha < 1:
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.18
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.45
    material.blend_method = "BLEND" if alpha < 1 else "OPAQUE"
    material.use_screen_refraction = alpha < 1
    material.show_transparent_back = alpha < 1
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


def yaw(angle):
    return (0, 0, angle)


def bevel(obj, amount=0.025, segments=2):
    modifier = obj.modifiers.new("production bevels", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = "EDGES"
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


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


def cylinder(name, loc, radius, depth, material, vertices=48, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cone(name, loc, radius1, radius2, depth, material, vertices=48, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=loc_a3d(loc),
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def sphere(name, loc, radius, material, segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=24, radius=radius, location=loc_a3d(loc))
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def torus(name, loc, major, minor, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=96,
        minor_segments=12,
        location=loc_a3d(loc),
        major_radius=major,
        minor_radius=minor,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


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


def aim_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def make_scene():
    clear_scene()

    floor = mat("satin graphite floor", (0.065, 0.074, 0.083, 1), metallic=0.3, roughness=0.48)
    floor_edge = mat("recessed smoke glass floor panel", (0.034, 0.043, 0.052, 1), metallic=0.28, roughness=0.55)
    wall = mat("dark reactor wall alloy", (0.046, 0.057, 0.067, 1), metallic=0.5, roughness=0.5)
    rail = mat("brushed titanium rails", (0.48, 0.55, 0.58, 1), metallic=0.8, roughness=0.25)
    black = mat("black anodized machinery", (0.025, 0.03, 0.036, 1), metallic=0.62, roughness=0.5)
    graphite = mat("matte graphite containment frame", (0.06, 0.068, 0.075, 1), metallic=0.48, roughness=0.56)
    glass = mat("transparent reactor energy shell", (0.05, 0.48, 0.58, 0.2), roughness=0.34, alpha=0.2, emission=(0.0, 0.2, 0.26, 1), strength=0.42)
    guard_glass = mat("low contrast command glass", (0.055, 0.24, 0.29, 0.1), roughness=0.48, alpha=0.1, emission=(0.0, 0.08, 0.1, 1), strength=0.1)
    amber_glass = mat("amber transparent holo glass", (0.72, 0.34, 0.08, 0.16), roughness=0.42, alpha=0.16, emission=(0.34, 0.1, 0.02, 1), strength=0.28)
    dim_panel = mat("soft blue diagnostic panel", (0.22, 0.36, 0.43, 1), roughness=0.52, emission=(0.03, 0.16, 0.21, 1), strength=0.26)
    cyan = mat("cyan reactor emissive", (0.02, 0.46, 0.58, 1), roughness=0.42, emission=(0.0, 0.38, 0.5, 1), strength=0.78)
    amber = mat("amber reactor emissive", (0.68, 0.3, 0.07, 1), roughness=0.42, emission=(0.52, 0.15, 0.02, 1), strength=0.44)
    violet = mat("violet power conduit emissive", (0.2, 0.16, 0.36, 1), roughness=0.48, emission=(0.12, 0.04, 0.28, 1), strength=0.32)
    core = mat("contained reactor focal glow", (0.32, 0.78, 0.84, 1), roughness=0.34, emission=(0.08, 0.48, 0.55, 1), strength=1.18)
    etched_dark = mat("etched black panel grooves", (0.012, 0.016, 0.02, 1), metallic=0.42, roughness=0.62)
    etched_light = mat("calibrated pale groove highlights", (0.62, 0.76, 0.78, 1), metallic=0.34, roughness=0.48, emission=(0.06, 0.16, 0.18, 1), strength=0.08)

    # Large, quiet masses establish the read before small emissive diagnostics are added.
    cube("sunken command floor slab", (0, -0.3, 0.06), (8.45, 0.18, 6.75), floor, 0.065)
    cube("recessed central reactor pit", (0, -0.18, 0.02), (3.55, 0.035, 2.62), floor_edge, 0.038)
    cube("foreground observation deck", (0, -0.13, 2.55), (5.95, 0.09, 0.62), floor_edge, 0.05)
    cube("foreground shadow apron", (0, -0.055, 2.21), (5.1, 0.045, 0.08), black, 0.018)
    cube("foreground low titanium rail", (0, 0.16, 2.28), (4.75, 0.055, 0.055), rail, 0.018)
    for side in (-1, 1):
        cube(f"foreground side command console {side}", (side * 2.82, 0.02, 2.22), (0.88, 0.24, 0.46), graphite, 0.035, rot=yaw(side * math.radians(10)))
        cube(f"foreground side cyan readout slit {side}", (side * 2.58, 0.18, 2.05), (0.028, 0.18, 0.018), cyan, 0.004, rot=yaw(side * math.radians(10)))
        cube(f"foreground low command glass side {side}", (side * 2.24, 0.26, 2.32), (0.58, 0.2, 0.018), guard_glass, 0.005, rot=yaw(side * math.radians(7)))
        cube(f"foreground guard rail cap {side}", (side * 2.24, 0.4, 2.28), (0.6, 0.026, 0.026), rail, 0.008, rot=yaw(side * math.radians(7)))

    for side in (-1, 1):
        cube(f"side raised operations deck {side}", (side * 2.82, -0.16, 0.52), (1.32, 0.045, 2.18), floor_edge, 0.032)
        cube(f"side console bank {side}", (side * 2.98, 0.12, -0.88), (1.18, 0.2, 0.44), graphite, 0.028)
        cube(f"side console dark face {side}", (side * 2.98, 0.28, -0.66), (0.94, 0.055, 0.035), black, 0.01)
        for i in range(10):
            z = -0.38 + i * 0.18
            cube(f"side deck fine service groove {side} {i:02d}", (side * 2.82, -0.126, z), (1.06, 0.01, 0.012), etched_dark, 0.002)
        for i in range(3):
            x = side * (2.55 + i * 0.28)
            cube(f"disciplined low console readout {side} {i}", (x, 0.35, -0.52), (0.16, 0.08, 0.018), cyan if i != 1 else dim_panel, 0.005)
        cube(f"side amber priority key {side}", (side * 2.86, 0.37, -1.08), (0.2, 0.024, 0.018), amber, 0.004)

    cube("rear command wall lower mass", (0, 0.45, -3.45), (7.85, 0.9, 0.2), wall, 0.042)
    cube("rear command wall upper mass", (0, 1.58, -3.5), (7.25, 1.16, 0.18), wall, 0.038)
    cube("central dark reactor silhouette backplate", (0, 0.96, -3.22), (2.28, 1.98, 0.16), black, 0.035)
    cube("rear low shadow apron", (0, 0.78, -3.16), (6.6, 0.11, 0.18), black, 0.02)
    cube("rear luminous horizon slot", (0, 1.98, -3.08), (3.35, 0.044, 0.026), cyan, 0.006)
    cube("rear amber grade confirmation slot", (1.12, 1.72, -3.06), (1.12, 0.032, 0.022), amber, 0.005)
    for x in (-3.35, -2.65, 2.65, 3.35):
        cube(f"rear vertical structural rib {x:.1f}", (x, 1.28, -3.12), (0.06, 1.45, 0.08), graphite, 0.012)
    for i in range(17):
        x = -3.2 + i * 0.4
        cube(f"rear wall vertical panel groove {i:02d}", (x, 1.22, -2.985), (0.016, 1.28, 0.012), etched_dark, 0.002)
    for i in range(13):
        y = 0.76 + i * 0.1
        cube(f"rear wall horizontal panel groove {i:02d}", (0, y, -2.975), (5.9, 0.01, 0.012), etched_dark, 0.002)

    # Paired side panels read as raw/pass-stack evidence without pretending to be a live split-screen.
    for side, panel_material, title_material in [(-1, dim_panel, rail), (1, glass, cyan)]:
        x = side * 2.48
        cube(f"{'raw' if side < 0 else 'graded'} pass comparison glass", (x, 1.23, -3.04), (0.98, 0.7, 0.024), panel_material, 0.006)
        cube(f"{'raw' if side < 0 else 'graded'} pass comparison top rule", (x, 1.63, -3.01), (0.78, 0.024, 0.014), title_material, 0.004)
        for i in range(3):
            y = 1.38 - i * 0.16
            width = 0.46 + i * 0.1
            material = dim_panel if side < 0 else cyan if i != 1 else amber
            cube(f"{'raw' if side < 0 else 'graded'} post stack bar {i}", (x - 0.12 + i * 0.08, y, -2.98), (width, 0.035, 0.014), material, 0.003)
        for i in range(5):
            y = 0.94 + i * 0.1
            cube(f"{'raw' if side < 0 else 'graded'} post stack calibration tick {i}", (x + 0.34, y, -2.965), (0.18, 0.01, 0.01), etched_light if side > 0 else etched_dark, 0.001)
    cube("post stack separator spine", (0, 1.24, -2.96), (0.045, 0.88, 0.022), violet, 0.004)

    cube("overhead quiet service truss", (0, 2.72, -0.8), (5.8, 0.13, 0.22), rail, 0.028)
    cube("overhead cyan processing spine", (0, 2.52, -0.48), (0.036, 0.036, 1.95), cyan, 0.008)
    for i in range(11):
        x = -2.75 + i * 0.55
        cube(f"overhead cable tray shadow tooth {i:02d}", (x, 2.55, -0.82), (0.04, 0.15, 0.25), black, 0.008)
        cube(f"overhead cable tray pale leading edge {i:02d}", (x + 0.08, 2.66, -0.7), (0.16, 0.01, 0.012), etched_light, 0.001)

    cylinder("reactor dais lower dark plinth", (0, -0.21, 0), 1.58, 0.14, black, 96)
    cylinder("reactor dais graphite collar", (0, -0.11, 0), 1.34, 0.08, graphite, 96)
    cylinder("reactor dais restrained luminous rim", (0, -0.035, 0), 1.18, 0.04, cyan, 96)
    cylinder("reactor dais titanium service cap", (0, 0.035, 0), 0.9, 0.14, rail, 96)
    cone("faceted reactor throat liner", (0, 0.14, 0), 0.72, 0.44, 0.34, graphite, 16)
    for i in range(32):
        a = i * math.pi * 2 / 32
        radius = 1.36 if i % 2 else 1.48
        material = etched_light if i % 4 == 0 else etched_dark
        cube(
            f"reactor collar calibrated tick {i:02d}",
            (math.cos(a) * radius, -0.008, math.sin(a) * radius),
            (0.15 if i % 2 else 0.22, 0.009, 0.011),
            material,
            0.001,
            rot=yaw(-a),
        )
    for i in range(20):
        a = i * math.pi * 2 / 20 + math.radians(4)
        cube(
            f"reactor plinth radial service groove {i:02d}",
            (math.cos(a) * 0.98, 0.052, math.sin(a) * 0.98),
            (0.12, 0.008, 0.01),
            etched_dark,
            0.001,
            rot=yaw(-a),
        )
    cylinder("reactor contained energy column", (0, 0.92, 0), 0.135, 1.46, core, 80)
    sphere("reactor transparent energy envelope", (0, 0.9, 0), 0.46, glass, 64)
    sphere("reactor contained focal core", (0, 0.9, 0), 0.2, core, 64)
    for y, major, minor, material in [
        (0.33, 1.06, 0.018, cyan),
        (0.92, 0.87, 0.017, violet),
        (1.43, 0.68, 0.014, cyan),
    ]:
        torus(f"clean magnetic containment ring {y:.2f}", (0, y, 0), major, minor, material, rot=(math.radians(90), 0, 0))
    torus("floor restrained reactor service halo", (0, -0.045, 0), 1.52, 0.014, cyan)
    torus("single vertical reactor meridian", (0, 0.9, 0), 0.66, 0.01, glass, rot=(0, math.radians(90), 0))
    for i, a in enumerate((math.radians(35), math.radians(145), math.radians(215), math.radians(325))):
        cube(f"primary containment upright {i:02d}", (math.cos(a) * 1.18, 0.82, math.sin(a) * 1.05), (0.1, 1.52, 0.085), graphite, 0.018, rot=yaw(-a))
        cube(f"containment upright cyan datum {i:02d}", (math.cos(a) * 1.1, 1.34, math.sin(a) * 0.98), (0.02, 0.36, 0.018), cyan, 0.004, rot=yaw(-a))
    for i, a in enumerate((math.radians(205), math.radians(245), math.radians(292), math.radians(334), math.radians(24), math.radians(70))):
        material = cyan if i in (0, 2, 5) else amber if i == 3 else violet
        cube(
            f"disciplined orbiting power vane {i:02d}",
            (math.cos(a) * 1.52, 0.66 + math.sin(i * 0.7) * 0.1, math.sin(a) * 1.46),
            (0.038, 0.26, 0.024),
            material,
            0.007,
            rot=(0.1, 0.18, -a),
        )

    for major, material in [(1.78, rail), (2.24, dim_panel)]:
        torus(f"quiet floor depth inlay {major:.2f}", (0, -0.11, 0), major, 0.007, material)
    for side in (-1, 1):
        cube(f"clean floor lead line inner {side}", (side * 0.9, -0.09, 1.32), (0.026, 0.014, 1.7), cyan, 0.004, rot=yaw(side * math.radians(12)))
        cube(f"clean floor lead line outer {side}", (side * 1.72, -0.105, 1.58), (0.022, 0.012, 1.34), rail, 0.004, rot=yaw(side * math.radians(16)))
    for i in range(5):
        x = -2.4 + i * 1.2
        cube(f"large floor service plate {i:02d}", (x, -0.098, 0.96), (0.76, 0.018, 0.64), floor, 0.014)
        if i in (1, 3):
            cube(f"floor service plate cyan datum {i:02d}", (x, -0.08, 1.26), (0.36, 0.012, 0.018), cyan, 0.003)
        for groove in range(4):
            z = 0.76 + groove * 0.13
            cube(f"floor service plate etched groove {i:02d}-{groove:02d}", (x, -0.073, z), (0.58, 0.008, 0.008), etched_dark, 0.001)

    for row, z in enumerate((1.62, 1.8, 1.98, 2.16, 2.34)):
        for col in range(21):
            x = -3.45 + col * 0.34
            material = etched_light if (col + row) % 3 == 0 else etched_dark
            cube(f"foreground observation grate slat {row:02d}-{col:02d}", (x, -0.064, z), (0.24, 0.009, 0.01), material, 0.001)
    for col, x in enumerate((-3.05, -2.65, -2.25, -1.85, -1.45, 1.45, 1.85, 2.25, 2.65, 3.05)):
        cube(f"foreground deck vertical grate datum {col:02d}", (x, -0.061, 2.02), (0.01, 0.009, 0.82), etched_dark, 0.001)

    for row, z in enumerate((-0.9, -0.68, -0.46, -0.24, -0.02, 0.2, 0.42, 0.64)):
        for col in range(9):
            x = -1.88 + col * 0.47
            cube(f"central pit service grate {row:02d}-{col:02d}", (x, -0.066, z), (0.28, 0.008, 0.009), etched_dark if (row + col) % 2 else etched_light, 0.001)
    for col, x in enumerate((-1.7, -1.22, -0.74, -0.26, 0.26, 0.74, 1.22, 1.7)):
        cube(f"central pit vertical grate rail {col:02d}", (x, -0.063, -0.14), (0.009, 0.008, 1.58), etched_dark, 0.001)

    for row in range(2):
        for col in range(4):
            x = -1.28 + col * 0.85
            y = 1.02 + row * 0.32
            if abs(x) < 0.3:
                continue
            material = cyan if (col + row) % 3 == 0 else dim_panel if col % 2 else amber
            cube(f"rear disciplined telemetry tile {row:02d}-{col:02d}", (x, y, -2.98), (0.28, 0.088, 0.012), material, 0.003)
    for side in (-1, 1):
        for i in range(2):
            z = -2.05 + i * 0.82
            cube(
                f"side angled restrained holo pane {side} {i:02d}",
                (side * 3.45, 1.0 + i * 0.08, z),
                (0.026, 0.44, 0.44),
                guard_glass if i == 0 else amber_glass,
                0.006,
                rot=yaw(side * math.radians(16)),
            )
            cube(
                f"side pane cyan top edge {side} {i:02d}",
                (side * 3.42, 1.25 + i * 0.08, z),
                (0.02, 0.02, 0.42),
                cyan,
                0.004,
                rot=yaw(side * math.radians(16)),
            )

    for i, a in enumerate((math.radians(210), math.radians(245), math.radians(300), math.radians(335), math.radians(30), math.radians(70))):
        sphere(
            f"sparse reactor calibration mote {i:02d}",
            (math.cos(a) * (1.7 + (i % 2) * 0.32), 0.62 + (i % 3) * 0.28, math.sin(a) * (1.58 + (i % 2) * 0.24)),
            0.018,
            cyan if i % 3 else amber,
            16,
        )

    bpy.ops.object.light_add(type="AREA", location=(0, -2.6, 4.2))
    bpy.context.object.name = "cool overhead reactor area light"
    bpy.context.object.data.energy = 720
    bpy.context.object.data.size = 5.8
    bpy.ops.object.light_add(type="POINT", location=(0, 0, 1.25))
    bpy.context.object.name = "cyan plasma point light"
    bpy.context.object.data.energy = 320
    bpy.context.object.data.color = (0.2, 0.95, 1.0)
    bpy.ops.object.light_add(type="POINT", location=(0, -1.1, 2.0))
    bpy.context.object.name = "contained reactor heart light"
    bpy.context.object.data.energy = 90
    bpy.context.object.data.color = (0.28, 0.82, 0.9)
    bpy.ops.object.light_add(type="AREA", location=(-3.8, -3.25, 2.3))
    bpy.context.object.name = "soft rear wall grazing light"
    bpy.context.object.data.energy = 140
    bpy.context.object.data.size = 4.4
    bpy.context.object.data.color = (0.55, 0.8, 1.0)
    bpy.ops.object.camera_add(location=(4.35, 4.95, 2.85))
    aim_at(bpy.context.object, loc_a3d((0, 0.82, -0.08)))
    bpy.context.object.data.lens = 38
    bpy.context.object.data.dof.use_dof = False
    bpy.context.scene.camera = bpy.context.object

    batch_meshes_by_material()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_apply=True)


make_scene()
