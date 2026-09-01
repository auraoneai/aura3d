"""Build Pulse Tunnel's original CC0 encounter kit with Blender.

The kit is static presentation only. Route-local chart, lane, collision, score,
failure, and reset systems remain authoritative. No animation or skin metadata
is authored because these rigid models do not contain either feature.
"""

from pathlib import Path
import math
import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "models"
OUT.mkdir(parents=True, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, metallic=0.0, roughness=0.5, emission=None, strength=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1)
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1)
            bsdf.inputs["Emission Strength"].default_value = strength
        else:
            bsdf.inputs["Emission"].default_value = (*emission, 1)
            bsdf.inputs["Emission Strength"].default_value = strength
    return value


def finish(obj, material, bevel=0.06):
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("machined edge bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def box(name, location, scale, material, bevel=0.06, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, material, bevel)


def cylinder(name, location, radius, depth, material, vertices=16, rotation=(0, 0, 0), bevel=0.04):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, material, bevel)


def torus(name, location, major, minor, material, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=6, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def join_material_groups(exempt=()):
    exempt = set(exempt)
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.name in exempt:
            continue
        material = obj.data.materials[0].name if obj.data.materials else "none"
        groups.setdefault(material, []).append(obj)
    for material, objects in groups.items():
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = "pulse " + material


def export(name):
    bpy.ops.object.select_all(action="SELECT")
    # Authoring helpers use the route's +Y-up coordinates. Blender is +Z-up,
    # while its glTF exporter converts +Z-up back to glTF +Y-up. Rotate the
    # complete scene once here so exported bounds and node placement exactly
    # match the route coordinate contract (X horizontal, Y height, Z depth).
    basis = Matrix.Rotation(math.pi / 2, 4, "X")
    for obj in bpy.context.scene.objects:
        obj.matrix_world = basis @ obj.matrix_world
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / name),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
    )


def build_world():
    reset()
    deck = mat("reactor deck gunmetal", (0.085, 0.13, 0.20), 0.72, 0.31)
    wall = mat("containment wall blue steel", (0.075, 0.18, 0.28), 0.68, 0.34)
    rib = mat("aged copper rib", (0.42, 0.19, 0.075), 0.82, 0.28)
    cyan = mat("cyan conduit", (0.015, 0.28, 0.40), 0.38, 0.24, (0.01, 0.75, 1.0), 5.5)
    rose = mat("rose containment field", (0.34, 0.025, 0.12), 0.34, 0.27, (1.0, 0.03, 0.24), 5.2)
    amber = mat("amber reactor warning", (0.38, 0.18, 0.02), 0.45, 0.25, (1.0, 0.34, 0.025), 4.8)

    box("continuous reactor deck", (0, -0.24, -3.5), (4.7, 0.22, 7.3), deck, 0.12)
    box("recessed exchange lane", (0, 0.0, -3.25), (2.25, 0.06, 6.75), wall, 0.025)
    for side in (-1, 1):
        box(f"{side} connected lower sidewall", (side * 4.35, 0.82, -3.5), (0.28, 1.02, 7.2), wall, 0.1)
        box(f"{side} upper containment shoulder", (side * 4.06, 2.35, -3.7), (0.24, 0.42, 7.0), wall, 0.08, (0, 0, side * 0.28))
        box(f"{side} longitudinal cyan conduit", (side * 3.72, 0.43, -3.5), (0.055, 0.055, 6.9), cyan, 0.02)
    for i, z in enumerate((1.7, -0.2, -2.1, -4.0, -5.9, -7.8)):
        for side in (-1, 1):
            box(f"rib {i} {side}", (side * 3.72, 1.72, z), (0.16, 1.55, 0.20), rib, 0.07, (0, 0, side * -0.25))
            box(f"roof brace {i} {side}", (side * 2.0, 3.2, z), (1.85, 0.14, 0.20), rib, 0.06, (0, side * 0.03, side * -0.18))
        box(f"roof spine {i}", (0, 3.54, z), (0.32, 0.12, 0.20), cyan, 0.04)

    # Raised terminal bay and recognizable gameplay-space anchors.
    box("terminal bay plinth", (1.82, 0.13, -7.28), (2.1, 0.32, 1.72), deck, 0.14)
    box("terminal bay backstop", (1.82, 1.72, -8.72), (2.25, 1.72, 0.24), wall, 0.12)
    torus("boss fire anchor", (1.82, 1.32, -8.42), 1.18, 0.13, amber)
    cylinder("boss fire anchor core", (1.82, 1.32, -8.38), 0.34, 0.16, rose, 20, (math.pi / 2, 0, 0), 0.03)
    box("player impact anchor", (-1.38, 0.72, -0.72), (0.74, 0.56, 0.055), cyan, 0.04, (0, -0.18, 0.05))
    for side in (-1, 1):
        box(f"terminal pincer {side}", (1.82 + side * 1.62, 2.45, -7.72), (1.05, 0.16, 0.34), rib, 0.06, (0, side * 0.18, side * -0.38))
    join_material_groups(exempt=("boss fire anchor", "boss fire anchor core", "player impact anchor"))
    export("pulseReactorEncounterWorld.glb")


def build_sentry():
    reset()
    armor = mat("sentry navy armour", (0.035, 0.09, 0.16), 0.78, 0.25)
    copper = mat("sentry copper mechanics", (0.50, 0.19, 0.045), 0.82, 0.23)
    ivory = mat("sentry ceramic threat plates", (0.64, 0.58, 0.44), 0.36, 0.3)
    rose = mat("sentry rose reactor", (0.28, 0.01, 0.08), 0.3, 0.2, (1.0, 0.02, 0.18), 6.0)
    cyan = mat("sentry cyan optics", (0.01, 0.20, 0.28), 0.24, 0.18, (0.0, 0.75, 1.0), 5.5)
    box("armoured reactor torso", (0, 1.16, 0), (0.67, 0.82, 0.48), armor, 0.15)
    box("faceted threat brow", (0, 1.82, -0.34), (0.82, 0.22, 0.23), ivory, 0.09)
    cylinder("reactor iris", (0, 1.18, -0.51), 0.36, 0.13, rose, 20, (math.pi / 2, 0, 0), 0.04)
    cylinder("optic core", (0, 1.18, -0.59), 0.14, 0.10, cyan, 16, (math.pi / 2, 0, 0), 0.025)
    for side in (-1, 1):
        box(f"swept blade wing {side}", (side * 0.98, 1.35, 0.03), (0.78, 0.16, 0.36), armor, 0.08, (0, side * 0.16, side * 0.25))
        box(f"copper wing actuator {side}", (side * 0.73, 1.3, -0.12), (0.28, 0.12, 0.17), copper, 0.05, (0, 0, side * 0.25))
        box(f"reverse knee strut {side}", (side * 0.42, 0.48, 0.05), (0.14, 0.55, 0.16), copper, 0.055, (side * -0.12, 0, side * -0.18))
        box(f"ground claw {side}", (side * 0.52, 0.09, -0.24), (0.34, 0.10, 0.48), ivory, 0.06)
        box(f"shoulder optic {side}", (side * 1.18, 1.46, -0.32), (0.17, 0.17, 0.13), cyan, 0.04)
    join_material_groups(exempt=("reactor iris", "optic core"))
    export("pulseTerminalSentry.glb")


def build_runner():
    reset()
    hull = mat("runner pearl hull", (0.46, 0.58, 0.65), 0.66, 0.24)
    dark = mat("runner graphite chassis", (0.025, 0.055, 0.085), 0.84, 0.25)
    copper = mat("runner copper trim", (0.54, 0.20, 0.04), 0.82, 0.22)
    cyan = mat("runner cyan drive", (0.0, 0.23, 0.34), 0.32, 0.18, (0.0, 0.82, 1.0), 6.2)
    box("runner central fuselage", (0, 0.36, 0), (0.48, 0.26, 1.0), hull, 0.13)
    box("runner graphite keel", (0, 0.19, 0.08), (0.30, 0.15, 1.18), dark, 0.09)
    box("runner nose wedge", (0, 0.34, -0.91), (0.31, 0.18, 0.44), copper, 0.09, (0.13, 0, 0))
    for side in (-1, 1):
        box(f"runner swept foil {side}", (side * 0.72, 0.28, 0.16), (0.72, 0.09, 0.66), hull, 0.07, (0, side * -0.16, side * 0.08))
        box(f"runner foil edge {side}", (side * 0.92, 0.27, 0.07), (0.48, 0.055, 0.60), copper, 0.035, (0, side * -0.18, side * 0.08))
        cylinder(f"runner drive pod {side}", (side * 0.58, 0.26, 0.78), 0.18, 0.55, dark, 14, (math.pi / 2, 0, 0), 0.04)
        cylinder(f"runner drive glow {side}", (side * 0.58, 0.26, 1.07), 0.12, 0.08, cyan, 14, (math.pi / 2, 0, 0), 0.02)
    box("runner canopy", (0, 0.58, -0.05), (0.27, 0.15, 0.42), cyan, 0.08)
    join_material_groups(exempt=("runner canopy",))
    export("pulseRunnerCraft.glb")


build_world()
build_sentry()
build_runner()
print("Built Pulse Tunnel encounter kit in", OUT)
