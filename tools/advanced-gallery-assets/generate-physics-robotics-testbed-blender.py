import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "fixtures" / "v9" / "assets" / "physics-robotics-testbed-blender"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "physics-robotics-testbed-blender.glb"


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


def bevel(obj, amount=0.02, segments=2):
    modifier = obj.modifiers.new("authored soft bevels", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = "EDGES"
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cube(name, loc, scale, material, bevel_width=0.018, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale_a3d(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel_width:
        bevel(obj, bevel_width)
    return obj


def cylinder(name, loc, radius, depth, material, vertices=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=loc_a3d(loc),
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def sphere(name, loc, radius, material, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=max(8, segments // 2),
        radius=radius,
        location=loc_a3d(loc),
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def batch_meshes_by_material():
    """Export-time draw-call batching for authored static fixture geometry."""
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


def capsule(name, loc, radius, length, material, rot=(0, 0, 0)):
    cylinder(f"{name} barrel", loc, radius, length, material, 32, rot=rot)
    axis_x = math.cos(rot[2])
    axis_z = -math.sin(rot[2])
    sphere(f"{name} rounded end a", (loc[0] - axis_x * length * 0.5, loc[1], loc[2] - axis_z * length * 0.5), radius, material, 24)
    sphere(f"{name} rounded end b", (loc[0] + axis_x * length * 0.5, loc[1], loc[2] + axis_z * length * 0.5), radius, material, 24)


def cone(name, loc, radius1, radius2, depth, material, vertices=40, rot=(0, 0, 0)):
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


def ramp(name, x, z, width, height, depth, material, angle=0):
    verts = [
        (-width / 2, 0, -depth / 2),
        (width / 2, 0, -depth / 2),
        (-width / 2, 0, depth / 2),
        (width / 2, 0, depth / 2),
        (-width / 2, height, depth / 2),
        (width / 2, height, depth / 2),
    ]
    faces = [(0, 1, 3, 2), (2, 3, 5, 4), (0, 2, 4), (1, 5, 3), (0, 4, 5, 1)]
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata([(vx, vz, vy) for vx, vy, vz in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc_a3d((x, 0.02, z))
    obj.rotation_euler[1] = angle
    assign(obj, material)
    bevel(obj, 0.012)
    return obj


def text_label(name, body, loc, size, material, rot=(math.radians(72), 0, 0)):
    bpy.ops.object.text_add(location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.004
    assign(obj, material)
    return obj


def lane_arrow(prefix, x, z, material):
    cube(f"{prefix} lane flow stem", (x - 0.14, 0.39, z), (0.42, 0.028, 0.045), material, 0.004)
    cone(
        f"{prefix} lane flow head",
        (x + 0.12, 0.39, z),
        0.08,
        0.0,
        0.18,
        material,
        vertices=3,
        rot=(0, math.radians(90), 0),
    )


def compact_reset_strip(prefix, x, z, mats, label_mat):
    cyan, amber, dark = mats
    cube(f"{prefix} reset rail base", (x, 0.09, z), (1.86, 0.05, 0.24), dark, 0.008)
    text_label(f"{prefix} reset rail label", "SEEDED RESET", (x - 0.52, 0.15, z - 0.04), 0.055, label_mat)
    for i in range(8):
        height = 0.05 + (i % 5) * 0.025
        cube(f"{prefix} deterministic hash bar {i}", (x - 0.46 + i * 0.14, 0.15 + height * 0.5, z + 0.07), (0.075, height, 0.055), cyan if i % 2 else amber, 0.004)


def robot_pusher(prefix, base, heading, mats):
    x, z = base
    steel, dark, shell, cyan, amber, rubber = mats
    dx = math.cos(heading)
    dz = math.sin(heading)
    sx = -math.sin(heading)
    sz = math.cos(heading)
    cylinder(f"{prefix} floor pedestal", (x, 0.18, z), 0.28, 0.36, dark, 40)
    cylinder(f"{prefix} indexed turntable", (x, 0.42, z), 0.34, 0.12, steel, 48)
    sphere(f"{prefix} shoulder encoder hub", (x, 0.58, z), 0.18, cyan, 32)
    cube(f"{prefix} vertical lift column", (x + dx * 0.18, 0.86, z + dz * 0.18), (0.22, 0.74, 0.22), shell, 0.035, rot=(0.18, 0, -heading))
    sphere(f"{prefix} elbow torque joint", (x + dx * 0.42, 1.22, z + dz * 0.42), 0.16, steel, 32)
    cube(f"{prefix} horizontal pusher boom", (x + dx * 0.78, 1.08, z + dz * 0.78), (0.76, 0.16, 0.16), steel, 0.026, rot=(0, 0, -heading))
    cube(f"{prefix} compliant pusher paddle", (x + dx * 1.22, 0.96, z + dz * 1.22), (0.12, 0.52, 0.62), rubber, 0.022, rot=(0, 0, -heading))
    cube(f"{prefix} wrist force-torque sensor", (x + dx * 1.05, 1.0, z + dz * 1.05), (0.16, 0.18, 0.24), amber, 0.012, rot=(0, 0, -heading))
    for side in (-1, 1):
        cube(
            f"{prefix} cable drag chain {side}",
            (x + dx * 0.44 + sx * side * 0.15, 1.0, z + dz * 0.44 + sz * side * 0.15),
            (0.06, 0.08, 0.74),
            dark,
            0.008,
            rot=(0, 0, -heading),
        )


def robot_gripper(prefix, base, heading, mats):
    x, z = base
    steel, dark, shell, cyan, amber, rubber = mats
    dx = math.cos(heading)
    dz = math.sin(heading)
    sx = -math.sin(heading)
    sz = math.cos(heading)
    cylinder(f"{prefix} bolted base", (x, 0.16, z), 0.31, 0.32, dark, 48)
    cylinder(f"{prefix} azimuth bearing", (x, 0.38, z), 0.36, 0.12, steel, 48)
    cylinder(f"{prefix} shoulder actuator", (x, 0.64, z), 0.18, 0.34, cyan, 32, rot=(math.pi / 2, 0, heading))
    cube(f"{prefix} upper arm casting", (x + dx * 0.34, 0.94, z + dz * 0.34), (0.22, 0.78, 0.2), shell, 0.035, rot=(0.34, 0, -heading))
    sphere(f"{prefix} elbow bearing", (x + dx * 0.66, 1.16, z + dz * 0.66), 0.16, steel, 32)
    cube(f"{prefix} forearm carbon link", (x + dx * 0.98, 0.94, z + dz * 0.98), (0.18, 0.7, 0.18), dark, 0.025, rot=(-0.42, 0, -heading + 0.1))
    cube(f"{prefix} gripper palm with camera", (x + dx * 1.25, 0.66, z + dz * 1.25), (0.34, 0.12, 0.18), steel, 0.018, rot=(0, 0, -heading))
    sphere(f"{prefix} eye-in-hand depth camera", (x + dx * 1.34, 0.75, z + dz * 1.34), 0.065, cyan, 18)
    for side in (-1, 1):
        cube(
            f"{prefix} gripper finger {side}",
            (x + dx * 1.42 + sx * side * 0.13, 0.52, z + dz * 1.42 + sz * side * 0.13),
            (0.055, 0.34, 0.09),
            rubber,
            0.012,
            rot=(0, 0, -heading + side * 0.08),
        )
    cube(f"{prefix} amber collision status", (x - sx * 0.22, 0.78, z - sz * 0.22), (0.06, 0.22, 0.06), amber, 0.008)


def make_scene():
    clear_scene()

    floor = mat("sealed graphite laboratory floor", (0.07, 0.078, 0.085, 1), metallic=0.18, roughness=0.58)
    floor_dark = mat("inset floor expansion seams", (0.018, 0.02, 0.023, 1), metallic=0.15, roughness=0.7)
    safety_yellow = mat("safety yellow paint", (1.0, 0.72, 0.12, 1), roughness=0.52)
    safety_red = mat("red emergency stop markings", (0.86, 0.08, 0.04, 1), roughness=0.47)
    steel = mat("brushed steel machine frame", (0.48, 0.52, 0.55, 1), metallic=0.75, roughness=0.23)
    dark = mat("black anodized aluminum", (0.025, 0.03, 0.035, 1), metallic=0.62, roughness=0.34)
    rubber = mat("matte black conveyor rubber", (0.006, 0.007, 0.008, 1), roughness=0.86)
    crate_mat = mat("worn brown test crates", (0.58, 0.4, 0.22, 1), roughness=0.78)
    crate_edge = mat("dark crate edge bands", (0.25, 0.16, 0.09, 1), roughness=0.73)
    shell = mat("white powder coated robot shells", (0.82, 0.86, 0.86, 1), roughness=0.35)
    blue = mat("blue rigid-body targets", (0.12, 0.38, 0.95, 1), roughness=0.42)
    orange = mat("orange dynamic capsules", (1.0, 0.42, 0.08, 1), roughness=0.45)
    green = mat("green success target zones", (0.08, 0.86, 0.35, 1), roughness=0.42, emission=(0.02, 0.44, 0.12, 1), strength=0.8)
    cyan = mat("cyan optical sensor glow", (0.12, 0.85, 1.0, 1), roughness=0.22, emission=(0.02, 0.58, 1.0, 1), strength=2.4)
    amber = mat("amber warning diagnostics", (1.0, 0.54, 0.1, 1), roughness=0.3, emission=(1.0, 0.33, 0.02, 1), strength=2.1)
    panel = mat("glass telemetry panel", (0.12, 0.72, 0.95, 0.36), roughness=0.1, alpha=0.36, emission=(0.02, 0.3, 0.55, 1), strength=0.65)
    clear_zone = mat("transparent physics trigger volumes", (0.1, 0.9, 0.55, 0.18), roughness=0.12, alpha=0.18, emission=(0.02, 0.45, 0.22, 1), strength=0.35)
    red_zone = mat("transparent safety stop volumes", (1.0, 0.18, 0.06, 0.2), roughness=0.18, alpha=0.2, emission=(0.55, 0.04, 0.01, 1), strength=0.45)
    proxy_blue = mat("transparent blue primitive proxy collider shells", (0.08, 0.45, 1.0, 0.14), roughness=0.18, alpha=0.14, emission=(0.02, 0.18, 0.75, 1), strength=0.24)
    proxy_magenta = mat("transparent magenta kinematic proxy shells", (1.0, 0.12, 0.58, 0.16), roughness=0.18, alpha=0.16, emission=(0.62, 0.02, 0.32, 1), strength=0.28)
    white = mat("white printed labels", (0.9, 0.94, 0.96, 1), roughness=0.5, emission=(0.45, 0.55, 0.6, 1), strength=0.25)

    cube("single robotics physics testbed floor slab", (0, -0.09, 0), (11.8, 0.14, 7.2), floor, 0.04)
    for i in range(15):
        cube(f"floor longitudinal service seam {i:02d}", (-5.55 + i * 0.8, 0.002, 0), (0.018, 0.018, 7.05), floor_dark, 0)
    for i in range(10):
        cube(f"floor cross service seam {i:02d}", (0, 0.004, -3.3 + i * 0.74), (11.55, 0.018, 0.018), floor_dark, 0)

    for z in (-3.0, 3.0):
        cube(f"outer safety lane stripe z {z}", (0, 0.03, z), (11.2, 0.018, 0.07), safety_yellow, 0.005)
    for x in (-5.35, 5.35):
        cube(f"outer safety lane stripe x {x}", (x, 0.032, 0), (0.07, 0.018, 6.05), safety_yellow, 0.005)
    for i in range(18):
        cube(f"black yellow diagonal caution dash {i:02d}", (-5.0 + i * 0.58, 0.04, -2.66), (0.34, 0.016, 0.055), dark if i % 2 else safety_yellow, 0.003, rot=(0, 0, math.radians(24)))
        cube(f"rear black yellow diagonal caution dash {i:02d}", (-5.0 + i * 0.58, 0.04, 2.66), (0.34, 0.016, 0.055), dark if i % 2 else safety_yellow, 0.003, rot=(0, 0, math.radians(-24)))

    for lane, z in enumerate((-1.35, 0.0, 1.35)):
        cube(f"instrumented conveyor belt {lane}", (-1.05, 0.13, z), (7.1, 0.13, 0.5), rubber, 0.028)
        cube(f"runtime conveyor primitive box proxy lane {lane}", (1.2, 0.305, z), (7.1, 0.022, 0.5), proxy_blue, 0.006)
        cube(f"conveyor steel spine {lane}", (-1.05, 0.08, z), (7.3, 0.12, 0.72), dark, 0.02)
        cube(f"conveyor left sensor rail {lane}", (-1.05, 0.34, z - 0.36), (7.4, 0.15, 0.06), steel, 0.016)
        cube(f"conveyor right sensor rail {lane}", (-1.05, 0.34, z + 0.36), (7.4, 0.15, 0.06), steel, 0.016)
        for arrow in range(4):
            lane_arrow(f"conveyor {lane} flow {arrow}", -3.6 + arrow * 1.45, z, green if lane == 1 else cyan)
        for i in range(15):
            x = -4.55 + i * 0.5
            cylinder(f"visible conveyor roller {lane}-{i:02d}", (x, 0.22, z), 0.052, 0.7, steel, 24, rot=(math.pi / 2, 0, 0))
            if i in (2, 5, 9, 12):
                cube(f"moving test crate lane {lane}-{i:02d}", (x + 0.08, 0.5, z), (0.34, 0.3, 0.3), crate_mat, 0.018, rot=(0, 0.025 * i, 0))
                cube(f"crate fiducial stripe lane {lane}-{i:02d}", (x + 0.08, 0.665, z), (0.22, 0.014, 0.045), white, 0.002, rot=(0, 0.025 * i, 0))
        for i in range(6):
            x = -4.15 + i * 1.24
            sphere(f"photoeye emitter lane {lane}-{i:02d}", (x, 0.48, z - 0.43), 0.045, cyan, 16)
            sphere(f"photoeye receiver lane {lane}-{i:02d}", (x, 0.48, z + 0.43), 0.045, amber if i % 2 else cyan, 16)

    for i, (x, z, angle) in enumerate(((-4.55, -0.62, 0), (-3.1, 0.62, 0.18), (-1.7, -0.55, -0.08), (-0.55, 0.56, 0.12))):
        for level in range(3 if i < 2 else 2):
            cube(f"stacked crate column {i} level {level}", (x, 0.37 + level * 0.34, z), (0.48, 0.3, 0.42), crate_mat, 0.018, rot=(0, angle + level * 0.05, 0))
            cube(f"stacked crate dark edge band {i} level {level}", (x, 0.54 + level * 0.34, z), (0.5, 0.035, 0.44), crate_edge, 0.006, rot=(0, angle + level * 0.05, 0))

    for i, (x, z, w, h, d, a) in enumerate(((1.25, -1.28, 1.15, 0.54, 1.35, 0.0), (2.72, 0.2, 1.0, 0.42, 1.12, 0.18), (3.95, 1.42, 1.25, 0.62, 1.45, -0.16))):
        ramp(f"calibrated friction ramp {i}", x, z, w, h, d, steel if i != 1 else dark, a)
        cube(f"ramp side guard left {i}", (x - w * 0.43, 0.36, z + d * 0.08), (0.055, 0.48, d * 0.82), safety_yellow, 0.008, rot=(0, 0, a))
        cube(f"ramp side guard right {i}", (x + w * 0.43, 0.36, z + d * 0.08), (0.055, 0.48, d * 0.82), safety_yellow, 0.008, rot=(0, 0, a))

    for tray, (x, z, material, label) in enumerate(((2.55, -2.08, blue, "BALL"), (4.36, -0.55, orange, "CAPSULE"))):
        cube(f"{label.lower()} sorting tray base {tray}", (x, 0.18, z), (1.35, 0.16, 0.82), dark, 0.02)
        cube(f"{label.lower()} tray rear wall {tray}", (x, 0.42, z + 0.43), (1.38, 0.45, 0.06), steel, 0.014)
        cube(f"{label.lower()} tray left wall {tray}", (x - 0.7, 0.37, z), (0.06, 0.36, 0.82), steel, 0.014)
        cube(f"{label.lower()} tray right wall {tray}", (x + 0.7, 0.37, z), (0.06, 0.36, 0.82), steel, 0.014)
        text_label(f"{label.lower()} tray printed label", label, (x, 0.285, z - 0.22), 0.13, white)
    for i in range(12):
        sphere(f"loose dynamic ball {i:02d}", (2.08 + (i % 4) * 0.27, 0.42 + (i // 4) * 0.16, -2.24 + (i % 3) * 0.2), 0.105, blue, 24)
    for i in range(8):
        capsule(f"loose capsule rigid body {i:02d}", (4.02 + (i % 4) * 0.25, 0.44 + (i // 4) * 0.17, -0.72 + (i % 2) * 0.24), 0.075, 0.32, orange, rot=(math.pi / 2, 0, 0.2 * i))

    for bin_id, z in enumerate((-1.42, -0.04, 1.34)):
        cube(f"runtime scored bin floor proxy {bin_id}", (3.65, 0.075, z), (0.86, 0.024, 1.16), proxy_blue, 0.006)
        cube(f"runtime scored bin back proxy {bin_id}", (3.65, 0.52, z + 0.58), (0.84, 0.82, 0.038), proxy_blue, 0.006)
        cube(f"runtime scored bin left proxy {bin_id}", (3.25, 0.52, z), (0.04, 0.82, 1.12), proxy_blue, 0.006)
        cube(f"runtime scored bin right proxy {bin_id}", (4.05, 0.52, z), (0.04, 0.82, 1.12), proxy_blue, 0.006)
        text_label(f"bin {bin_id} proxy collider label", "BOX PROXY", (4.38, 0.34, z - 0.34), 0.038, white)
        cube(f"bin {bin_id} live load meter rail", (4.34, 0.38, z + 0.24), (0.055, 0.58, 0.08), dark, 0.006)
        for tick in range(4):
            cube(f"bin {bin_id} load meter tick {tick}", (4.34, 0.18 + tick * 0.11, z + 0.24), (0.09, 0.018, 0.1), green if tick <= bin_id + 1 else cyan, 0.002)
        for load in range(5):
            lx = 3.42 + (load % 3) * 0.18
            lz = z - 0.2 + (load // 3) * 0.24
            if (load + bin_id) % 2:
                cube(f"scored reset cube body hint {bin_id}-{load}", (lx, 0.39 + (load // 3) * 0.15, lz), (0.16, 0.16, 0.16), crate_mat, 0.01, rot=(0, 0.12 * load, 0))
            else:
                sphere(f"scored reset sphere body hint {bin_id}-{load}", (lx, 0.4 + (load // 3) * 0.15, lz), 0.085, blue if bin_id != 1 else orange, 18)

    robot_pusher("gantry pusher robot a", (-2.8, -2.1), math.radians(28), (steel, dark, shell, cyan, amber, rubber))
    robot_gripper("six axis gripper robot b", (0.95, 2.08), math.radians(-132), (steel, dark, shell, cyan, amber, rubber))
    robot_pusher("compact rejection pusher c", (4.25, 2.05), math.radians(-156), (steel, dark, shell, amber, cyan, rubber))

    for i, (x, z) in enumerate(((-2.8, -2.1), (0.95, 2.08), (4.25, 2.05))):
        cube(f"transparent robot reachable volume {i}", (x, 0.68, z), (1.78, 1.2, 1.38), clear_zone, 0.018)
        cube(f"red emergency stop exclusion box {i}", (x, 0.08, z), (1.92, 0.035, 1.52), red_zone, 0.012)
        for j in range(4):
            sx = -0.8 if j < 2 else 0.8
            sz = -0.64 if j % 2 == 0 else 0.64
            cylinder(f"workcell guard post {i}-{j}", (x + sx, 0.52, z + sz), 0.035, 1.02, safety_yellow, 18)
        cube(f"front guard rail workcell {i}", (x, 0.9, z - 0.64), (1.65, 0.06, 0.045), safety_yellow, 0.008)
        cube(f"rear guard rail workcell {i}", (x, 0.9, z + 0.64), (1.65, 0.06, 0.045), safety_yellow, 0.008)

    cube("runtime kinematic pusher collider shell", (2.58, 0.42, 1.35), (0.42, 0.28, 0.92), proxy_magenta, 0.01)
    cube("pusher sweep contact lane", (2.58, 0.065, 1.35), (1.82, 0.018, 0.94), clear_zone, 0.006)
    text_label("kinematic pusher truth label", "KINEMATIC PUSHER", (2.72, 0.7, 1.04), 0.058, white)
    text_label("primitive collider truth label", "primitive proxy overlay", (-2.25, 0.11, -2.92), 0.06, white)
    compact_reset_strip("runtime deterministic", 0.85, -2.92, (cyan, amber, dark), white)
    for i in range(5):
        cube(f"pusher contact impulse stem {i}", (2.04 + i * 0.22, 0.5, 0.96 + (i % 2) * 0.18), (0.26, 0.025, 0.04), amber, 0.004)
        cone(f"pusher contact impulse head {i}", (2.23 + i * 0.22, 0.5, 0.96 + (i % 2) * 0.18), 0.06, 0.0, 0.14, amber, 3, rot=(0, math.radians(90), 0))

    for i, (x, z, name) in enumerate(((-4.65, 2.25, "PICK"), (-0.25, -2.35, "SORT"), (3.0, 2.48, "DROP"), (4.82, -2.15, "REJECT"))):
        cube(f"{name.lower()} target zone plate", (x, 0.055, z), (1.08, 0.022, 0.72), green if i != 3 else red_zone, 0.012)
        text_label(f"{name.lower()} target zone label", name, (x, 0.085, z), 0.14, white)
        for corner in range(4):
            cx = x + (-0.48 if corner < 2 else 0.48)
            cz = z + (-0.31 if corner % 2 == 0 else 0.31)
            cube(f"{name.lower()} fiducial corner marker {corner}", (cx, 0.075, cz), (0.12, 0.014, 0.12), white if corner % 2 else dark, 0.002)

    for i in range(8):
        x = -5.05 + i * 1.34
        cube(f"overhead debug rail segment {i:02d}", (x, 2.45, 0), (0.86, 0.08, 0.08), steel, 0.012)
        cylinder(f"debug rail hanging lidar pod {i:02d}", (x, 2.12, -0.18 + math.sin(i) * 0.25), 0.095, 0.18, dark, 24)
        cone(f"transparent lidar frustum {i:02d}", (x, 1.58, -0.18 + math.sin(i) * 0.25), 0.44, 0.035, 0.82, panel, 40, rot=(math.pi, 0, 0))
    cube("overhead calibration rail spine", (0, 2.53, 0), (10.6, 0.05, 0.05), cyan, 0.006)

    for i in range(5):
        x = -4.65 + i * 2.15
        cube(f"metrics console base {i}", (x, 0.36, 3.42), (1.02, 0.28, 0.3), dark, 0.018)
        cube(f"metrics glass panel {i}", (x, 0.82, 3.24), (0.82, 0.48, 0.035), panel, 0.008)
        text_label(f"metrics panel title {i}", ["FPS", "SOLVER", "CONTACTS", "LATENCY", "QUEUE"][i], (x, 0.98, 3.205), 0.07, white, rot=(math.radians(78), 0, 0))
        for bar in range(4):
            cube(
                f"metrics panel {i} bar {bar}",
                (x - 0.27 + bar * 0.18, 0.7 + bar * 0.05, 3.2),
                (0.08, 0.12 + 0.07 * ((bar + i) % 3), 0.02),
                green if bar % 2 else cyan,
                0.003,
            )
        sphere(f"metrics status beacon {i}", (x + 0.46, 0.56, 3.28), 0.055, amber if i == 3 else green, 16)

    for i in range(6):
        cube(f"bin sorting cell base {i}", (-5.0, 0.18, -2.28 + i * 0.78), (0.72, 0.14, 0.54), dark, 0.02)
        cube(f"bin sorting cell rear wall {i}", (-5.0, 0.45, -2.01 + i * 0.78), (0.74, 0.48, 0.05), steel, 0.012)
        cube(f"bin sorting cell left wall {i}", (-5.38, 0.38, -2.28 + i * 0.78), (0.05, 0.36, 0.54), steel, 0.012)
        cube(f"bin sorting cell right wall {i}", (-4.62, 0.38, -2.28 + i * 0.78), (0.05, 0.36, 0.54), steel, 0.012)
        sphere(f"bin contents sample ball {i}", (-5.08 + (i % 2) * 0.18, 0.42, -2.28 + i * 0.78), 0.075, blue if i % 2 else orange, 18)

    for i in range(7):
        cube(f"floor contact normal vector stem {i}", (-1.2 + i * 0.55, 0.22, -2.72 + (i % 2) * 0.2), (0.03, 0.34, 0.03), cyan, 0.004)
        cone(f"floor contact normal vector arrow {i}", (-1.2 + i * 0.55, 0.42, -2.72 + (i % 2) * 0.2), 0.065, 0.0, 0.16, cyan, 18)
    for i in range(9):
        cube(f"solver contact patch marker {i}", (-0.8 + i * 0.42, 0.072, -2.98), (0.18, 0.014, 0.08), amber if i % 2 else cyan, 0.002)

    bpy.ops.object.light_add(type="AREA", location=(0, 5.6, 2.0))
    bpy.context.object.name = "wide robotics lab softbox"
    bpy.context.object.data.energy = 820
    bpy.context.object.data.size = 7.5
    bpy.ops.object.light_add(type="AREA", location=(-4.0, 3.0, -2.2))
    bpy.context.object.name = "left workcell inspection light"
    bpy.context.object.data.energy = 180
    bpy.context.object.data.size = 2.2
    bpy.ops.object.light_add(type="POINT", location=(1.8, 1.8, 1.5))
    bpy.context.object.name = "cyan sensor bounce light"
    bpy.context.object.data.energy = 85
    bpy.context.object.data.color = (0.28, 0.82, 1.0)
    bpy.ops.object.camera_add(location=(5.9, 3.45, 5.4), rotation=(math.radians(59), 0, math.radians(43)))
    bpy.context.object.name = "physics robotics testbed camera"
    bpy.context.scene.camera = bpy.context.object

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    batch_meshes_by_material()
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        export_apply=True,
        export_cameras=True,
        export_lights=True,
    )


make_scene()
