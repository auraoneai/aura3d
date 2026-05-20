import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "fixtures" / "v9" / "assets" / "digital-twin-factory-blender"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "digital-twin-factory-blender.glb"
BLEND_OUT = OUT_DIR / "digital-twin-factory-blender.blend"


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


def loc_g3d(value):
    x, y, z = value
    return (x, z, y)


def scale_g3d(value):
    x, y, z = value
    return (x, z, y)


def bevel(obj, amount=0.025, segments=2):
    modifier = obj.modifiers.new("softened industrial edges", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = "EDGES"
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cube(name, loc, scale, material, bevel_width=0.015, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc_g3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale_g3d(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel_width:
        bevel(obj, bevel_width)
    return obj


def cylinder(name, loc, radius, depth, material, vertices=24, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc_g3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cone(name, loc, radius1, radius2, depth, material, vertices=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc_g3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def sphere(name, loc, radius, material, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, radius=radius, location=loc_g3d(loc))
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def capsule_like(name, loc, radius, height, material, vertices=24):
    cylinder(f"{name} body", loc, radius, height, material, vertices)
    sphere(f"{name} cap top", (loc[0], loc[1] + height * 0.5, loc[2]), radius, material, vertices)
    sphere(f"{name} cap bottom", (loc[0], loc[1] - height * 0.5, loc[2]), radius, material, vertices)


def curved_cable(name, points, material, bevel_depth=0.018):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, value in zip(spline.points, points):
        x, y, z = loc_g3d(value)
        point.co = (x, y, z, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def text_label(name, text, loc, size, material, rot=(math.radians(70), 0, 0)):
    bpy.ops.object.text_add(location=loc_g3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.006
    assign(obj, material)
    return obj


def arrow_marker(prefix, x, z, length, material, direction=1):
    stem_x = x - direction * length * 0.12
    cube(f"{prefix} flow arrow stem", (stem_x, 0.33, z), (length * 0.62, 0.025, 0.035), material, 0.004)
    cone(
        f"{prefix} flow arrow head",
        (x + direction * length * 0.26, 0.33, z),
        0.075,
        0.0,
        0.18,
        material,
        3,
        rot=(0, math.radians(90) * direction, 0)
    )


def operator_figure(prefix, loc, body_mat, hardhat_mat, visor_mat, facing=0.0):
    x, y, z = loc
    cube(f"{prefix} boots", (x, y + 0.05, z), (0.18, 0.1, 0.12), body_mat, 0.012, rot=(0, 0, facing))
    cube(f"{prefix} torso", (x, y + 0.32, z), (0.22, 0.38, 0.16), body_mat, 0.035, rot=(0, 0, facing))
    sphere(f"{prefix} helmet", (x, y + 0.62, z), 0.13, hardhat_mat, 18)
    cube(f"{prefix} visor tablet", (x + math.sin(facing) * 0.12, y + 0.42, z + math.cos(facing) * 0.16), (0.18, 0.12, 0.025), visor_mat, 0.006, rot=(0, 0, facing))
    cube(f"{prefix} left arm", (x - 0.16 * math.cos(facing), y + 0.36, z + 0.16 * math.sin(facing)), (0.055, 0.28, 0.055), body_mat, 0.016, rot=(0.28, 0, facing))
    cube(f"{prefix} right arm", (x + 0.16 * math.cos(facing), y + 0.36, z - 0.16 * math.sin(facing)), (0.055, 0.28, 0.055), body_mat, 0.016, rot=(-0.24, 0, facing))


def status_wall(prefix, x, z, panel_mat, frame_mat, text_mat, signal_mats):
    cube(f"{prefix} dashboard frame", (x, 1.34, z), (1.24, 0.82, 0.08), frame_mat, 0.018)
    cube(f"{prefix} dashboard glass", (x, 1.34, z + 0.045), (1.08, 0.66, 0.018), panel_mat, 0.004)
    text_label(f"{prefix} dashboard title", "SIM CELL", (x, 1.62, z + 0.072), 0.075, text_mat)
    for i in range(4):
        row_y = 1.46 - i * 0.13
        cube(f"{prefix} status row rail {i}", (x - 0.08, row_y, z + 0.066), (0.66, 0.026, 0.012), signal_mats[i % len(signal_mats)], 0.002)
        cube(f"{prefix} status row marker {i}", (x + 0.42, row_y, z + 0.068), (0.085, 0.045, 0.012), signal_mats[(i + 1) % len(signal_mats)], 0.002)


def floor_dashboard(prefix, x, z, w, d, title, panel_mat, frame_mat, text_mat, signal_mats):
    cube(f"{prefix} low overview panel", (x, 0.075, z), (w, 0.035, d), panel_mat, 0.014)
    cube(f"{prefix} overview top edge", (x, 0.105, z - d * 0.5), (w, 0.018, 0.035), frame_mat, 0.003)
    cube(f"{prefix} overview bottom edge", (x, 0.105, z + d * 0.5), (w, 0.018, 0.035), frame_mat, 0.003)
    cube(f"{prefix} overview left edge", (x - w * 0.5, 0.106, z), (0.035, 0.018, d), frame_mat, 0.003)
    cube(f"{prefix} overview right edge", (x + w * 0.5, 0.106, z), (0.035, 0.018, d), frame_mat, 0.003)
    text_label(f"{prefix} overview title", title, (x, 0.132, z - d * 0.31), 0.105, text_mat, rot=(math.radians(90), 0, 0))
    for i in range(3):
        row_z = z - d * 0.05 + i * d * 0.19
        cube(f"{prefix} overview status bar {i}", (x - w * 0.12, 0.128, row_z), (w * 0.46, 0.016, d * 0.045), signal_mats[i % len(signal_mats)], 0.002)
        cube(f"{prefix} overview status marker {i}", (x + w * 0.31, 0.13, row_z), (w * 0.08, 0.018, d * 0.07), signal_mats[(i + 1) % len(signal_mats)], 0.002)


def floor_zone(prefix, x, z, w, d, zone_mat, edge_mat, label_text, text_mat):
    cube(f"{prefix} translucent zone plate", (x, 0.035, z), (w, 0.018, d), zone_mat, 0.012)
    cube(f"{prefix} zone north edge", (x, 0.055, z - d * 0.5), (w, 0.022, 0.04), edge_mat, 0.004)
    cube(f"{prefix} zone south edge", (x, 0.055, z + d * 0.5), (w, 0.022, 0.04), edge_mat, 0.004)
    cube(f"{prefix} zone west edge", (x - w * 0.5, 0.056, z), (0.04, 0.022, d), edge_mat, 0.004)
    cube(f"{prefix} zone east edge", (x + w * 0.5, 0.056, z), (0.04, 0.022, d), edge_mat, 0.004)
    text_label(f"{prefix} floor zone label", label_text, (x, 0.078, z), 0.13, text_mat, rot=(math.radians(90), 0, 0))


def sensor_field(prefix, x, z, radius, field_mat, emitter_mat, frame_mat):
    cylinder(f"{prefix} sensor mast", (x, 0.54, z), 0.026, 0.92, frame_mat, 14)
    sphere(f"{prefix} sensor head", (x, 1.04, z), 0.062, emitter_mat, 16)
    for i, r in enumerate((radius * 0.3, radius * 0.52, radius * 0.78)):
        cylinder(f"{prefix} scan ring {i}", (x, 0.045 + i * 0.006, z), r, 0.006, field_mat, 48)


def route_strip(prefix, start, end, material, width=0.06, height=0.014):
    sx, sy, sz = start
    ex, ey, ez = end
    mid = ((sx + ex) * 0.5, (sy + ey) * 0.5, (sz + ez) * 0.5)
    dx = ex - sx
    dz = ez - sz
    length = max(0.001, math.hypot(dx, dz))
    angle = -math.atan2(dz, dx)
    cube(f"{prefix} route strip", mid, (length, height, width), material, 0.004, rot=(0, 0, angle))


def zone_header(prefix, x, z, title, panel_mat, frame_mat, text_mat):
    cube(f"{prefix} header left post", (x - 0.66, 0.64, z), (0.055, 1.05, 0.055), frame_mat, 0.008)
    cube(f"{prefix} header right post", (x + 0.66, 0.64, z), (0.055, 1.05, 0.055), frame_mat, 0.008)
    cube(f"{prefix} header beam", (x, 1.18, z), (1.46, 0.08, 0.06), frame_mat, 0.008)
    cube(f"{prefix} header status plate", (x, 1.31, z + 0.01), (1.16, 0.2, 0.035), panel_mat, 0.008)
    text_label(f"{prefix} header label", title, (x, 1.33, z + 0.045), 0.092, text_mat)


def operations_status_wall(prefix, x, z, panel_mat, frame_mat, text_mat, signal_mats):
    cube(f"{prefix} enterprise wall frame", (x, 1.02, z), (2.08, 1.22, 0.09), frame_mat, 0.02)
    cube(f"{prefix} enterprise wall glass", (x, 1.02, z + 0.048), (1.88, 1.0, 0.02), panel_mat, 0.006)
    text_label(f"{prefix} enterprise wall title", "FACTORY OPS", (x, 1.44, z + 0.078), 0.105, text_mat)
    for i in range(4):
        card_x = x - 0.66 + i * 0.44
        cube(f"{prefix} kpi card {i}", (card_x, 1.02, z + 0.068), (0.32, 0.48, 0.018), signal_mats[i % len(signal_mats)], 0.004)
        cube(f"{prefix} kpi card tick {i}", (card_x, 0.75 + (i % 3) * 0.065, z + 0.083), (0.22, 0.045, 0.012), text_mat, 0.002)
    for i in range(5):
        cube(f"{prefix} trend line {i}", (x - 0.62 + i * 0.31, 0.52 + math.sin(i) * 0.05, z + 0.078), (0.23, 0.028, 0.012), signal_mats[(i + 1) % len(signal_mats)], 0.002)


def batch_meshes_by_material():
    """Export-time draw-call batching: one mesh object per material where possible."""
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


def robot_arm(prefix, x, z, base_rot, steel, dark, signal):
    cylinder(f"{prefix} pedestal", (x, 0.04, z), 0.28, 0.46, dark, 32)
    cylinder(f"{prefix} turntable", (x, 0.32, z), 0.36, 0.16, steel, 32)
    cylinder(f"{prefix} shoulder joint", (x, 0.58, z), 0.18, 0.28, signal, 24, rot=(math.pi / 2, 0, base_rot))
    cube(f"{prefix} upper arm", (x + math.cos(base_rot) * 0.42, 0.88, z + math.sin(base_rot) * 0.42), (0.22, 0.82, 0.22), steel, 0.035, rot=(0.35, 0, -base_rot))
    sphere(f"{prefix} elbow joint", (x + math.cos(base_rot) * 0.72, 1.1, z + math.sin(base_rot) * 0.72), 0.17, signal)
    cube(f"{prefix} forearm", (x + math.cos(base_rot) * 0.98, 0.88, z + math.sin(base_rot) * 0.98), (0.18, 0.72, 0.18), dark, 0.03, rot=(-0.52, 0, -base_rot + 0.2))
    cube(f"{prefix} gripper bridge", (x + math.cos(base_rot) * 1.18, 0.56, z + math.sin(base_rot) * 1.18), (0.34, 0.08, 0.14), signal, 0.02, rot=(0, 0, -base_rot))
    cube(f"{prefix} gripper left", (x + math.cos(base_rot) * 1.28 - math.sin(base_rot) * 0.12, 0.46, z + math.sin(base_rot) * 1.28 + math.cos(base_rot) * 0.12), (0.06, 0.22, 0.08), dark, 0.012, rot=(0, 0, -base_rot))
    cube(f"{prefix} gripper right", (x + math.cos(base_rot) * 1.28 + math.sin(base_rot) * 0.12, 0.46, z + math.sin(base_rot) * 1.28 - math.cos(base_rot) * 0.12), (0.06, 0.22, 0.08), dark, 0.012, rot=(0, 0, -base_rot))


def gantry_robot(prefix, x, z, steel, dark, signal):
    cube(f"{prefix} left tower", (x - 0.76, 0.68, z), (0.1, 1.36, 0.13), dark, 0.016)
    cube(f"{prefix} right tower", (x + 0.76, 0.68, z), (0.1, 1.36, 0.13), dark, 0.016)
    cube(f"{prefix} cross beam", (x, 1.32, z), (1.72, 0.12, 0.14), steel, 0.016)
    cube(f"{prefix} servo carriage", (x + 0.22, 1.15, z), (0.34, 0.2, 0.18), signal, 0.022)
    cube(f"{prefix} vertical actuator", (x + 0.22, 0.88, z), (0.09, 0.42, 0.09), steel, 0.012)
    cube(f"{prefix} vacuum head", (x + 0.22, 0.63, z), (0.36, 0.06, 0.24), dark, 0.016)
    for i in range(4):
        cube(f"{prefix} suction cup {i}", (x + 0.06 + i * 0.1, 0.57, z), (0.05, 0.03, 0.05), dark, 0.007)


def inspection_arch(prefix, x, z, steel, dark, glass, signal):
    cube(f"{prefix} arch left upright", (x - 0.62, 0.82, z), (0.12, 1.64, 0.12), steel, 0.018)
    cube(f"{prefix} arch right upright", (x + 0.62, 0.82, z), (0.12, 1.64, 0.12), steel, 0.018)
    cube(f"{prefix} arch header", (x, 1.62, z), (1.36, 0.12, 0.14), steel, 0.018)
    cube(f"{prefix} camera block", (x, 1.42, z - 0.08), (0.28, 0.16, 0.08), dark, 0.014)
    cube(f"{prefix} scan curtain", (x, 0.86, z + 0.08), (1.12, 1.18, 0.035), glass, 0.006)
    cube(f"{prefix} status strip", (x, 1.74, z), (0.9, 0.045, 0.05), signal, 0.006)


def make_scene():
    clear_scene()

    floor = mat("matte graphite factory floor", (0.047, 0.052, 0.058, 1), roughness=0.7)
    wall = mat("deep industrial wall panels", (0.03, 0.04, 0.048, 1), metallic=0.12, roughness=0.58)
    concrete = mat("worn precast concrete shell", (0.38, 0.41, 0.40, 1), metallic=0.02, roughness=0.78)
    muted_panel = mat("muted operations panel blue", (0.12, 0.22, 0.28, 1), metallic=0.08, roughness=0.5)
    floor_line = mat("embedded safety lane paint", (0.95, 0.66, 0.18, 1), roughness=0.5)
    steel = mat("brushed robotics steel", (0.47, 0.5, 0.52, 1), metallic=0.72, roughness=0.24)
    dark = mat("dark anodized machine frame", (0.045, 0.055, 0.064, 1), metallic=0.5, roughness=0.32)
    rubber = mat("black conveyor rubber", (0.015, 0.017, 0.019, 1), roughness=0.82)
    crate = mat("matte encoded packages", (0.48, 0.34, 0.18, 1), roughness=0.82)
    plastic = mat("white robot shell", (0.82, 0.86, 0.88, 1), roughness=0.34)
    glass = mat("control room glass", (0.18, 0.62, 0.92, 0.14), metallic=0.02, roughness=0.06, alpha=0.14)
    cyan = mat("cyan sensor emissive", (0.06, 0.72, 1.0, 1), roughness=0.18, emission=(0.0, 0.42, 1.0, 1), strength=1.9)
    amber = mat("amber status emissive", (1.0, 0.56, 0.12, 1), roughness=0.24, emission=(1.0, 0.32, 0.02, 1), strength=1.8)
    green = mat("green running emissive", (0.12, 0.9, 0.48, 1), roughness=0.24, emission=(0.02, 0.7, 0.22, 1), strength=1.55)
    heat = mat("transparent process field overlay", (0.08, 0.55, 0.8, 0.11), roughness=0.1, alpha=0.11, emission=(0.02, 0.16, 0.24, 1), strength=0.18)
    safety = mat("transparent safety zone", (1.0, 0.45, 0.08, 0.1), roughness=0.2, alpha=0.1, emission=(0.24, 0.08, 0.02, 1), strength=0.16)
    label = mat("white status lettering", (0.86, 0.96, 1.0, 1), roughness=0.45, emission=(0.18, 0.5, 0.65, 1), strength=0.75)

    cube("single continuous factory floor slab", (0, -0.08, 0), (10.8, 0.12, 6.2), floor, 0.035)
    # This gallery route is captured from a cutaway/digital-twin camera.
    # Keep service architecture as sectional context only; the camera needs the
    # floor systems to read before shell, truss, or mezzanine detail.
    cube("rear cutaway factory equipment rail", (0, 0.32, -3.18), (10.9, 0.42, 0.16), wall, 0.02)
    cube("left cutaway factory curb", (-5.48, 0.25, -0.24), (0.16, 0.36, 5.74), wall, 0.012)
    cube("right cutaway factory curb", (5.48, 0.25, -0.24), (0.16, 0.36, 5.74), wall, 0.012)
    cube("front low safety curb", (0, 0.08, 3.04), (10.9, 0.12, 0.16), wall, 0.012)
    for i, x in enumerate((-4.55, -2.75, -0.95, 0.95, 2.75, 4.55)):
        cube(f"precast rear cutaway panel {i}", (x, 0.54, -3.06), (1.24, 0.42, 0.055), concrete, 0.012)
        cube(f"rear service readout tile {i}", (x, 0.82, -3.015), (0.54, 0.2, 0.022), glass if i % 2 else muted_panel, 0.004)
    for i, x in enumerate((-4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8)):
        cube(f"cutaway roof marker column {i}", (x, 1.02, -2.82), (0.07, 0.82, 0.08), dark, 0.012)
    for i, z in enumerate((-2.85, -1.75, -0.65, 0.45, 1.55, 2.55)):
        cube(f"left shell low depth rib {i}", (-5.37, 0.58, z), (0.07, 0.72, 0.08), concrete, 0.012)
        cube(f"right shell low depth rib {i}", (5.37, 0.58, z), (0.07, 0.72, 0.08), concrete, 0.012)
    cube("rear service mezzanine side deck", (0.7, 1.18, -2.76), (5.2, 0.07, 0.28), steel, 0.012)
    cube("rear service mezzanine low guard rail", (0.7, 1.3, -2.54), (4.8, 0.035, 0.035), dark, 0.005)
    for i in range(6):
        cube(f"mezzanine sparse rail post {i}", (-1.65 + i * 0.7, 1.24, -2.54), (0.028, 0.14, 0.028), dark, 0.004)
    for i, x in enumerate((-4.65, -3.85, 3.75, 4.55)):
        cube(f"rollup dock door {i}", (x, 0.58, -3.0), (0.58, 0.82, 0.045), muted_panel, 0.006)
        for j in range(4):
            cube(f"rollup dock door seam {i}-{j}", (x, 0.31 + j * 0.17, -2.968), (0.56, 0.012, 0.014), concrete, 0.001)
    cube("rear high bay reference beam", (0, 1.7, -3.08), (5.5, 0.055, 0.08), dark, 0.01)
    for i in range(9):
        cube(f"rear wall acoustic rib {i}", (-4.8 + i * 1.2, 0.58, -3.08), (0.1, 0.72, 0.06), dark, 0.01)
    for i in range(4):
        cube(f"rear high bay light marker {i}", (-3.3 + i * 2.2, 1.86, -2.86), (0.62, 0.035, 0.045), cyan if i % 2 else amber, 0.006)
    cube("rear service cable spine", (0, 1.86, -2.72), (4.9, 0.05, 0.08), dark, 0.01)
    for i, z in enumerate((-2.2, -0.65, 0.9, 2.28)):
        cube(f"left upper cutaway frame stub {i}", (-5.12, 1.34, z), (0.56, 0.045, 0.055), dark, 0.006)
        cube(f"right upper cutaway frame stub {i}", (5.12, 1.34, z), (0.56, 0.045, 0.055), dark, 0.006)
    for i in range(9):
        x = -4.65 + i * 1.16
        cube(f"floor expansion seam x {i:02d}", (x, -0.005, 0), (0.018, 0.014, 6.08), dark, 0)
    for i in range(6):
        z = -2.55 + i * 1.02
        cube(f"floor expansion seam z {i:02d}", (0, 0.0, z), (10.5, 0.014, 0.018), dark, 0)

    for z in (-2.58, 2.58):
        cube(f"safety lane long {z}", (0, 0.025, z), (10.2, 0.018, 0.065), floor_line, 0.006)
    for x in (-4.9, 4.9):
        cube(f"safety lane side {x}", (x, 0.026, 0), (0.065, 0.018, 5.2), floor_line, 0.006)

    floor_zone("receiving zone", -3.65, -1.9, 2.0, 1.05, safety, floor_line, "RECEIVE", label)
    floor_zone("assembly zone", -1.15, -0.18, 2.18, 1.22, heat, cyan, "CELL A", label)
    floor_zone("inspection zone", 1.2, 0.02, 2.18, 1.22, heat, green, "QA", label)
    floor_zone("packout zone", 3.62, 1.42, 1.9, 1.0, safety, amber, "PACK", label)
    zone_header("receiving enterprise", -3.65, -2.54, "INBOUND", amber, dark, label)
    zone_header("assembly enterprise", -1.15, -0.92, "ASSEMBLY", cyan, dark, label)
    zone_header("qa enterprise", 1.2, -0.62, "VISION QA", green, dark, label)
    zone_header("packout enterprise", 3.62, 0.78, "PACKOUT", amber, dark, label)
    route_strip("amr inbound to assembly", (-4.35, 0.066, -2.28), (-2.1, 0.066, -2.28), cyan, 0.07)
    route_strip("amr assembly cross aisle", (-2.1, 0.066, -2.28), (-2.1, 0.066, 1.92), green, 0.07)
    route_strip("amr qa transfer", (-2.1, 0.066, 1.92), (2.55, 0.066, 1.92), green, 0.07)
    route_strip("amr packout loop", (2.55, 0.066, 1.92), (4.45, 0.066, 0.72), amber, 0.07)
    for i, (x, z) in enumerate(((-4.35, -2.28), (-2.1, -2.28), (-2.1, 1.92), (0.35, 1.92), (2.55, 1.92), (4.45, 0.72))):
        sphere(f"amr waypoint puck {i}", (x, 0.105, z), 0.062, green if i % 2 else cyan, 16)
    floor_dashboard("central lane overview", -0.05, 2.34, 3.15, 0.58, "OPS BOARD", muted_panel, dark, label, (green, cyan, amber))
    floor_dashboard("right cell overview", 4.58, -0.66, 0.72, 2.55, "CELLS", muted_panel, dark, label, (cyan, green, amber))

    for lane, z in enumerate((-1.35, 0.0, 1.35)):
        cube(f"conveyor rubber belt {lane}", (-0.9, 0.1, z), (6.6, 0.12, 0.48), rubber, 0.025)
        cube(f"conveyor left rail {lane}", (-0.9, 0.26, z - 0.32), (6.8, 0.14, 0.07), steel, 0.015)
        cube(f"conveyor right rail {lane}", (-0.9, 0.26, z + 0.32), (6.8, 0.14, 0.07), steel, 0.015)
        cube(f"conveyor drive housing {lane}", (2.74, 0.32, z), (0.46, 0.36, 0.58), dark, 0.03)
        arrow_marker(f"conveyor lane {lane} upstream", -2.95, z, 0.58, green if lane == 1 else cyan, 1)
        arrow_marker(f"conveyor lane {lane} downstream", 0.42, z, 0.58, green if lane == 1 else amber, 1)
        text_label(f"conveyor lane {lane} label", f"LANE {lane + 1}", (-4.28, 0.36, z - 0.31), 0.065, label)
        for i in range(7):
            x = -3.72 + i * 0.92
            cylinder(f"conveyor roller {lane}-{i:02d}", (x, 0.18, z), 0.055, 0.62, steel, 18, rot=(math.pi / 2, 0, 0))
            if i in (2, 5):
                cube(f"tracked package {lane}-{i:02d}", (x + 0.1, 0.46, z), (0.34, 0.24, 0.24), crate, 0.018, rot=(0, 0.04 * i, 0))
                cube(f"tracked package barcode {lane}-{i:02d}", (x + 0.1, 0.59, z - 0.125), (0.2, 0.012, 0.015), label, 0.002, rot=(0, 0.04 * i, 0))

    for i, (x, z, a) in enumerate(((-3.6, -1.85, 0.6), (-2.1, 1.82, -0.2), (1.9, -1.72, 2.55), (3.35, 1.55, -2.4))):
        robot_arm(f"robot arm workcell {i}", x, z, a, steel, dark, cyan if i % 2 == 0 else amber)
        cube(f"robot workcell safety plate {i}", (x, 0.035, z), (1.55, 0.02, 1.25), safety, 0.02)
        cube(f"robot workcell numbered plinth {i}", (x - 0.58, 0.1, z - 0.52), (0.34, 0.1, 0.22), muted_panel, 0.012)
        text_label(f"robot workcell id {i}", f"C{i + 1}", (x - 0.58, 0.18, z - 0.52), 0.075, label)
        inspection_arch(f"machine vision portal {i}", x + math.cos(a) * 0.88, z + math.sin(a) * 0.88, steel, dark, glass, green if i % 2 else cyan)
        status_wall(
            f"workcell {i}",
            x + math.cos(a + math.pi * 0.5) * 0.72,
            z + math.sin(a + math.pi * 0.5) * 0.72,
            glass,
            dark,
            label,
            (green, cyan, amber)
        )

    for i, (x, z) in enumerate(((-2.82, -0.72), (2.55, 0.92))):
        gantry_robot(f"low transfer gantry {i}", x, z, steel, dark, amber if i == 1 else cyan)
        cube(f"low transfer gantry floor marker {i}", (x, 0.048, z), (1.58, 0.012, 0.14), muted_panel, 0.004)

    for i in range(7):
        x = -4.55 + i * 0.48
        cube(f"warehouse rack rear upright {i}", (x, 0.75, -2.9), (0.08, 1.55, 0.08), dark, 0.012)
        cube(f"warehouse rack rear load {i}", (x, 0.42, -2.76), (0.36, 0.28, 0.36), crate, 0.018)
        cube(f"warehouse rack upper load {i}", (x, 1.12, -2.76), (0.34, 0.3, 0.34), crate, 0.018)
    for h in (0.38, 1.08):
        cube(f"warehouse rack shelf {h}", (-3.1, h, -2.92), (3.28, 0.08, 0.18), steel, 0.012)

    for i, title in enumerate(("ROBOTS", "LANES", "QA", "PACK")):
        x = -3.85 + i * 2.45
        z = 2.78
        cube(f"front low ops console {i}", (x, 0.18, z), (0.82, 0.16, 0.28), dark, 0.016)
        cube(f"front low ops display {i}", (x, 0.31, z - 0.06), (0.62, 0.035, 0.18), cyan if i % 2 else green, 0.006)
        text_label(f"front low ops display label {i}", title, (x, 0.355, z - 0.06), 0.056, label, rot=(math.radians(78), 0, 0))
        if i == 1:
            operator_figure(f"line operator {i}", (x + 0.24, 0.08, z - 0.5), muted_panel, floor_line, cyan, facing=0.2)

    cube("elevated control room base", (3.65, 0.42, -2.5), (2.35, 0.85, 0.82), dark, 0.025)
    cube("elevated control room glass wall", (3.65, 0.92, -2.05), (2.18, 0.72, 0.045), glass, 0.012)
    cube("control room roof light bar", (3.65, 1.38, -2.0), (2.12, 0.06, 0.08), amber, 0.01)
    cube("control room rear solid wall", (3.65, 0.96, -2.91), (2.42, 1.04, 0.08), concrete, 0.012)
    cube("control room access stair stringer", (2.32, 0.54, -2.44), (0.18, 0.82, 0.12), steel, 0.01, rot=(0, 0, 0.42))
    for i in range(5):
        cube(f"control room stair tread {i}", (2.05 + i * 0.16, 0.18 + i * 0.13, -2.18), (0.38, 0.04, 0.16), steel, 0.006)
    for i, title in enumerate(("CELL A", "QA VISION", "AMR FLEET", "SORT RATE")):
        x = 2.74 + (i % 2) * 0.72
        y = 1.0 - (i // 2) * 0.28
        cube(f"control room dashboard panel {i}", (x, y, -2.015), (0.48, 0.2, 0.018), cyan if i % 2 else green, 0.004)
        text_label(f"control room label {i}", title, (x, y, -1.98), 0.075, label)
    operator_figure("control room operator", (4.38, 0.9, -2.22), muted_panel, floor_line, green, facing=-0.35)

    for i in range(4):
        x = -3.9 + i * 2.6
        z = -0.08 + math.sin(i) * 1.35
        cone(f"subtle sensor beam {i}", (x, 0.68, z), 0.18, 0.018, 0.42, glass, 28, rot=(math.pi / 2, 0, 0))
        sphere(f"sensor emitter {i}", (x, 0.68, z - 0.24), 0.052, cyan if i % 2 else amber, 16)
    for i, (x, z, r) in enumerate(((-4.45, -2.18, 0.5), (-0.78, -0.62, 0.58), (1.7, 0.74, 0.56))):
        sensor_field(f"fixed sensor field {i}", x, z, r, heat, cyan if i % 2 else green, dark)

    for i in range(4):
        x = -3.9 + (i % 2) * 5.2
        z = -2.05 + (i // 2) * 4.1
        cube(f"heatmap tile {i:02d}", (x, 0.045, z), (0.72, 0.016, 0.46), heat if i % 2 else safety, 0.006)

    for i in range(4):
        x = -3.7 + i * 2.15
        cube(f"autonomous mobile robot body {i}", (x, 0.2, 0.74 + math.sin(i) * 0.35), (0.54, 0.24, 0.38), plastic, 0.06)
        cylinder(f"mobile robot left wheel {i}", (x - 0.2, 0.09, 0.52 + math.sin(i) * 0.35), 0.085, 0.08, rubber, 18, rot=(math.pi / 2, 0, 0))
        cylinder(f"mobile robot right wheel {i}", (x + 0.2, 0.09, 0.52 + math.sin(i) * 0.35), 0.085, 0.08, rubber, 18, rot=(math.pi / 2, 0, 0))
        sphere(f"mobile robot lidar puck {i}", (x, 0.38, 0.74 + math.sin(i) * 0.35), 0.09, cyan, 18)
        cube(f"mobile robot route marker {i}", (x + 0.32, 0.045, 0.74 + math.sin(i) * 0.35), (0.42, 0.012, 0.06), green if i % 2 else muted_panel, 0.003)

    operations_status_wall("front enterprise operations", 0.05, 3.02, glass, dark, label, (green, cyan, amber))

    for i in range(4):
        x = -3.8 + i * 2.35
        curved_cable(
            f"rear wall service cable {i}",
            [(x, 1.86, -2.82), (x + 0.22, 1.74, -2.72), (x - 0.12, 1.64, -2.62), (x + 0.18, 1.54, -2.52)],
            dark,
            0.008
        )
    bpy.ops.object.light_add(type="AREA", location=(0, 5.6, 1.4))
    bpy.context.object.name = "large softbox factory lighting"
    bpy.context.object.data.energy = 700
    bpy.context.object.data.size = 7
    bpy.ops.object.light_add(type="POINT", location=(-3.6, 2.0, -2.0))
    bpy.context.object.name = "amber workcell beacon light"
    bpy.context.object.data.energy = 90
    bpy.context.object.data.color = (1.0, 0.52, 0.2)
    bpy.ops.object.camera_add(location=(5.55, 3.7, 5.25), rotation=(math.radians(64), 0, math.radians(42)))
    bpy.context.scene.camera = bpy.context.object
    bpy.context.object.data.lens = 36

    batch_meshes_by_material()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_apply=True)


make_scene()
