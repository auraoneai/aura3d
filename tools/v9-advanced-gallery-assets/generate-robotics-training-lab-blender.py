import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "fixtures" / "v9" / "assets" / "robotics-training-lab-blender"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "robotics-training-lab-blender.glb"
BLEND_OUT = OUT_DIR / "robotics-training-lab-blender.blend"


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


def loc_g3d(value):
    x, y, z = value
    return (x, z, y)


def scale_g3d(value):
    x, y, z = value
    return (x, z, y)


def assign(obj, material):
    obj.data.materials.append(material)
    return obj


def bevel(obj, amount=0.015, segments=2):
    modifier = obj.modifiers.new("softened demo edges", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = "EDGES"
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")


def cube(name, loc, scale, material, bevel_width=0.012, rot=(0, 0, 0)):
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


def text_label(name, text, loc, size, material, rot=(math.radians(75), 0, 0)):
    bpy.ops.object.text_add(location=loc_g3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.004
    assign(obj, material)
    return obj


def workcell_frame(name, x, z, steel, amber, cyan):
    cube(f"{name} recessed task-zone base plate", (x, 0.025, z), (1.22, 0.035, 1.08), steel, 0.01)
    for px in (-0.55, 0.55):
        for pz in (-0.48, 0.48):
            cube(f"{name} low corner guard post {px} {pz}", (x + px, 0.27, z + pz), (0.045, 0.42, 0.045), steel, 0.006)
            cylinder(f"{name} flush anchor bolt {px} {pz}", (x + px * 0.86, 0.075, z + pz * 0.84), 0.024, 0.012, amber, 18)
    cube(f"{name} rear low status rail", (x, 0.48, z - 0.5), (1.08, 0.045, 0.04), amber, 0.004)
    cube(f"{name} front floor bumper", (x, 0.14, z + 0.5), (1.08, 0.035, 0.035), cyan, 0.004)
    for px in (-0.55, 0.55):
        cube(f"{name} side floor guide {px}", (x + px, 0.16, z), (0.035, 0.035, 0.84), cyan, 0.004)


def task_zone_detail(name, x, z, cyan, amber, caution, dark):
    for slot in range(5):
        offset = -0.36 + slot * 0.18
        cube(f"{name} front toe alignment marker {slot}", (x + offset, 0.112, z + 0.39), (0.09, 0.012, 0.026), caution, 0.002)
        cube(f"{name} rear sensor datum {slot}", (x + offset, 0.114, z - 0.39), (0.07, 0.014, 0.022), cyan if slot % 2 else amber, 0.002)
    for side in (-1, 1):
        cube(f"{name} low rubber cable trough {side}", (x + side * 0.42, 0.096, z - 0.06), (0.026, 0.012, 0.28), dark, 0.003)
        for step in range(3):
            cube(f"{name} side calibration dash {side}-{step}", (x + side * 0.36, 0.124, z - 0.22 + step * 0.22), (0.12, 0.012, 0.026), cyan, 0.002)
    for nest in range(3):
        cube(f"{name} tool nest pocket {nest}", (x - 0.28 + nest * 0.28, 0.13, z + 0.02), (0.11, 0.018, 0.09), dark, 0.003)
        cylinder(f"{name} tracked foot contact puck {nest}", (x - 0.28 + nest * 0.28, 0.152, z + 0.02), 0.032, 0.01, cyan if nest == 1 else amber, 18)


def robot_arm_station(name, x, z, steel, cyan, amber, dark):
    cylinder(f"{name} robot pedestal", (x, 0.22, z), 0.16, 0.38, steel, 28)
    cylinder(f"{name} robot shoulder pivot", (x, 0.48, z), 0.11, 0.18, amber, 28)
    cube(f"{name} upper training arm", (x + 0.28, 0.72, z), (0.56, 0.09, 0.09), steel, 0.012, rot=(0, 0, math.radians(12)))
    cylinder(f"{name} elbow tracking puck", (x + 0.56, 0.86, z), 0.08, 0.08, cyan, 24)
    cube(f"{name} forearm training link", (x + 0.78, 0.7, z + 0.16), (0.46, 0.075, 0.075), steel, 0.01, rot=(0, 0, math.radians(-18)))
    cube(f"{name} gripper jaw left", (x + 1.02, 0.61, z + 0.25), (0.08, 0.04, 0.22), dark, 0.005)
    cube(f"{name} gripper jaw right", (x + 1.02, 0.61, z + 0.03), (0.08, 0.04, 0.22), dark, 0.005)


def rear_status_wall(steel, wall, cyan, amber, green, white):
    # Keep the rear instrumentation as cutaway equipment. A full-height slab
    # sits in front of the route gallery camera and hides the animated
    # character, so the route needs segmented context instead of an occluder.
    cube("rear low instrumented equipment plinth", (0, 0.14, -1.56), (5.35, 0.16, 0.06), wall, 0.01)
    for i in range(6):
        x = -2.2 + i * 0.88
        cube(f"rear floating acoustic tile {i}", (x, 1.02 + (i % 2) * 0.18, -1.52), (0.54, 0.28, 0.045), wall, 0.01)
    for i, (x, label) in enumerate(((-2.05, "RUN"), (0, "DANCE"), (2.05, "HANDOFF"))):
        cube(f"rear compact clip-state tile {i}", (x, 1.82, -1.50), (0.62, 0.18, 0.035), steel, 0.008)
        text_label(f"rear compact clip-state label {i}", label, (x, 1.83, -1.462), 0.055, white, rot=(math.radians(90), 0, 0))
    for i, (x, label) in enumerate(((-1.18, "POSE GUIDE"), (1.18, "NO IK SOLVER"))):
        cube(f"rear honest animation limit tile {i}", (x, 1.55, -1.49), (0.92, 0.13, 0.03), steel, 0.006)
        text_label(f"rear honest animation limit label {i}", label, (x, 1.555, -1.458), 0.042, white, rot=(math.radians(90), 0, 0))
    for i in range(12):
        x = -1.02 + i * 0.185
        material = cyan if i in (1, 2, 7, 8) else amber if i in (4, 10) else green
        cube(f"rear timeline keyed segment {i}", (x, 1.22, -1.44), (0.13, 0.035, 0.03), material, 0.003)
    for row in range(3):
        for col in range(5):
            x = -2.24 + col * 1.12
            y = 0.72 + row * 0.22
            material = cyan if (row + col) % 3 == 0 else amber if (row + col) % 3 == 1 else green
            cube(f"rear diagnostics status chip {row}-{col}", (x, y, -1.47), (0.26, 0.07, 0.026), material, 0.004)
            cube(f"rear status chip backplate {row}-{col}", (x, y - 0.055, -1.50), (0.18, 0.018, 0.022), steel, 0.002)
    for col in range(7):
        x = -2.55 + col * 0.85
        cube(f"rear acoustic vertical rib {col}", (x, 1.0, -1.42), (0.035, 1.42, 0.035), steel, 0.004)


def side_workstation(name, x, z, side, steel, wall, cyan, amber, green, dark, white):
    cube(f"{name} side cutaway bench", (x, 0.24, z), (0.48, 0.42, 0.82), wall, 0.01, rot=(0, 0, math.radians(side * 2)))
    cube(f"{name} anti-fatigue standing mat", (x - side * 0.18, 0.065, z + 0.04), (0.32, 0.014, 0.54), dark, 0.004)
    for shelf in range(3):
        cube(f"{name} tool shelf {shelf}", (x, 0.48 + shelf * 0.22, z - 0.32), (0.42, 0.035, 0.055), steel, 0.004)
        cube(f"{name} tool cartridge {shelf}", (x - side * 0.08, 0.53 + shelf * 0.22, z - 0.32), (0.09, 0.055, 0.045), cyan if shelf % 2 else amber, 0.003)


def make_scene():
    clear_scene()
    bpy.context.preferences.filepaths.save_version = 0
    floor = mat("matte charcoal training floor", (0.055, 0.06, 0.066, 1), roughness=0.72)
    wall = mat("dark acoustic lab wall", (0.025, 0.034, 0.046, 1), roughness=0.64)
    steel = mat("brushed trainer rails", (0.45, 0.48, 0.5, 1), metallic=0.58, roughness=0.28)
    pad = mat("warm rubber task pads", (0.58, 0.36, 0.16, 1), roughness=0.82)
    caution = mat("caution yellow safety paint", (0.95, 0.74, 0.16, 1), roughness=0.5)
    green = mat("green diagnostic emissive", (0.1, 0.95, 0.38, 1), emission=(0.02, 0.78, 0.22, 1), strength=1.8)
    dark = mat("matte slate robot tooling", (0.16, 0.18, 0.18, 1), roughness=0.74)
    cyan = mat("cyan tracking emissive", (0.05, 0.72, 1.0, 1), emission=(0.0, 0.42, 1.0, 1), strength=2.4)
    amber = mat("amber training emissive", (1.0, 0.56, 0.12, 1), emission=(1.0, 0.32, 0.02, 1), strength=2.0)
    glass = mat("transparent motion volume", (0.18, 0.66, 0.94, 0.18), roughness=0.08, alpha=0.18)
    white = mat("diagnostic label white", (0.86, 0.96, 1.0, 1), emission=(0.14, 0.42, 0.6, 1), strength=0.6)

    cube("single authored robotics training floor", (0, -0.04, 0.16), (5.2, 0.08, 3.2), floor, 0.025)
    cube("rear low acoustic curb", (0, 0.08, -1.46), (5.25, 0.1, 0.12), wall, 0.012)
    cube("left low cutaway curb", (-2.64, 0.08, 0.16), (0.1, 0.1, 3.1), wall, 0.012)
    cube("right low cutaway curb", (2.64, 0.08, 0.16), (0.1, 0.1, 3.1), wall, 0.012)
    cube("overhead motion-capture rail front", (0, 2.72, 0.54), (5.0, 0.08, 0.1), steel, 0.012)
    cube("overhead motion-capture rail rear", (0, 2.72, -1.12), (5.0, 0.08, 0.1), steel, 0.012)
    rear_status_wall(steel, wall, cyan, amber, green, white)

    task_zones = ((-0.58, 0.04, "SOLDIER RUN"), (0.9, 0.16, "ROBOT DANCE"), (1.58, 0.96, "HANDOFF"))
    for i, (x, z, _label) in enumerate(task_zones):
        cube(f"authored stage plinth {i}", (x, 0.035, z), (1.05, 0.07, 0.88), steel, 0.018)
        cube(f"authored rubber task pad {i}", (x, 0.085, z), (0.86, 0.018, 0.68), pad, 0.006)
        task_zone_detail(f"authored task-zone grounding {i}", x, z, cyan, amber, caution, dark)
        for side in (-1, 1):
            cube(f"authored floor pose guide corner {i}-{side}", (x + side * 0.42, 0.112, z - 0.43), (0.12, 0.012, 0.032), glass, 0.002)
        cube(f"authored floor clip-state strip {i}", (x, 0.108, z - 0.34), (0.42, 0.012, 0.028), cyan if i == 1 else amber, 0.002)

    for i, (x, z) in enumerate(((-2.15, -0.74), (2.08, -0.78), (-2.05, 0.94), (2.22, 0.86))):
        robot_arm_station(f"authored calibration arm {i}", x, z, steel, cyan if i % 2 else green, amber, dark)

    for i in range(7):
        x = -2.25 + i * 0.75
        cube(f"rear low sensor puck {i}", (x, 0.18, -1.24), (0.18, 0.045, 0.08), steel, 0.004)
        cube(f"rear overhead status chip {i}", (x, 1.36, -1.31), (0.28, 0.07, 0.024), cyan if i % 2 else amber, 0.003)
        cylinder(f"mocap marker {i}", (x, 1.62 + math.sin(i) * 0.08, -0.95 + (i % 2) * 1.2), 0.045, 0.028, cyan if i % 2 else amber, 18)

    for i in range(10):
        x = -2.3 + i * 0.5
        cube(f"overhead light segment {i}", (x, 2.82, 0.54), (0.28, 0.035, 0.035), cyan if i % 2 else amber, 0.004)
        cube(f"rear wall acoustic tile {i}", (-2.25 + (i % 5) * 1.1, 0.48 + (i // 5) * 0.24, -1.38), (0.42, 0.06, 0.025), steel, 0.004)

    for lane in range(3):
        z = -0.9 + lane * 0.78
        for step in range(9):
            x = -2.0 + step * 0.5
            material = caution if (step + lane) % 2 == 0 else cyan
            cube(f"floor route stripe {lane}-{step}", (x, 0.012, z), (0.28, 0.012, 0.04), material, 0.002)
    for i in range(10):
        x = -1.35 + i * 0.3
        cube(f"rear floor timeline tick {i}", (x, 0.052, -1.16), (0.03, 0.026, 0.075), amber if i in (2, 6) else cyan, 0.003)
    cube("rear floor physical timeline rail", (0, 0.044, -1.16), (2.86, 0.022, 0.03), steel, 0.004)
    cube("rear floor scrubber parked playhead", (-0.18, 0.075, -1.16), (0.085, 0.052, 0.088), green, 0.004)
    for i, (x, _state) in enumerate(((-1.55, "IDLE"), (-1.28, "RUN"), (1.28, "INSPECT"), (1.55, "HANDOFF"))):
        cube(f"rear floor state token {i}", (x, 0.078, -1.04), (0.18, 0.044, 0.064), amber if i % 2 else cyan, 0.003)

    bpy.ops.object.light_add(type="AREA", location=(0, 4.0, 0.8))
    bpy.context.object.name = "large training-stage softbox"
    bpy.context.object.data.energy = 450
    bpy.context.object.data.size = 5
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_apply=True)


make_scene()
