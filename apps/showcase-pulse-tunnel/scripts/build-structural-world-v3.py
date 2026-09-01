"""Build the route-local Pulse structural-world V3 art candidate.

This is an isolated CC0 candidate, not a registered release asset. The design
uses broad connected surfaces and a terminal proscenium instead of floating
roof bars. It intentionally contains no combatants and no collision metadata.
"""

from pathlib import Path
import math
import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art-review" / "assets"
OUT.mkdir(parents=True, exist_ok=True)


def mat(name, color, metallic=0.0, roughness=0.5, emission=None, strength=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1)
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return value


def finish(obj, material, bevel=0.06):
    obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new("structural edge bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def box(name, location, scale, material, rotation=(0, 0, 0), bevel=0.06):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, material, bevel)


def join_by_material(exempt=()):
    exempt = set(exempt)
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.name in exempt:
            continue
        key = obj.data.materials[0].name if obj.data.materials else "none"
        groups.setdefault(key, []).append(obj)
    for key, objects in groups.items():
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = f"V3 joined {key}"


bpy.ops.wm.read_factory_settings(use_empty=True)
deck = mat("V3 slate deck", (0.13, 0.20, 0.29), 0.58, 0.48)
steel = mat("V3 navy structural steel", (0.055, 0.105, 0.17), 0.64, 0.42)
panel = mat("V3 blue wall panels", (0.10, 0.22, 0.31), 0.46, 0.52)
copper = mat("V3 restrained copper", (0.31, 0.16, 0.065), 0.72, 0.35)
cyan = mat("V3 cyan guide", (0.02, 0.20, 0.26), 0.28, 0.34, (0.02, 0.48, 0.64), 1.7)
amber = mat("V3 amber guide", (0.28, 0.14, 0.025), 0.35, 0.34, (0.68, 0.28, 0.035), 1.55)

# Broad, connected ground planes.
box("V3 full foundation", (0, -0.34, -3.2), (5.2, 0.26, 7.6), steel, bevel=0.14)
box("V3 runner apron", (-1.15, -0.04, 0.95), (3.45, 0.16, 2.6), deck, bevel=0.13)
box("V3 exchange trench", (0.05, -0.18, -2.55), (2.65, 0.08, 2.0), panel, bevel=0.06)
box("V3 terminal dock", (1.15, 0.09, -5.75), (3.55, 0.28, 1.5), deck, bevel=0.15)

# Continuous side architecture: large panels with inset pilasters.
for side in (-1, 1):
    box(f"V3 lower sidewall {side}", (side * 4.55, 0.62, -3.0), (0.42, 0.9, 7.1), steel,
        rotation=(0, 0, side * 0.06), bevel=0.12)
    box(f"V3 upper shoulder {side}", (side * 4.25, 2.05, -3.35), (0.34, 0.62, 6.65), panel,
        rotation=(0, 0, side * 0.19), bevel=0.1)
    box(f"V3 deck edge guide {side}", (side * 3.28, 0.07, -2.8), (0.055, 0.045, 6.45), cyan if side < 0 else amber, bevel=0.018)
    for index, z in enumerate((1.6, -1.25, -4.1, -6.7)):
        box(f"V3 wall pilaster {side} {index}", (side * 4.0, 1.4, z), (0.23, 1.35, 0.34), copper,
            rotation=(0, side * 0.05, side * -0.12), bevel=0.07)
        box(f"V3 inset wall panel {side} {index}", (side * 4.38, 1.25, z - 0.55), (0.16, 0.62, 0.82), panel,
            rotation=(0, side * 0.03, side * 0.11), bevel=0.07)

# One far proscenium frames the terminal as a location, not a floating target.
box("V3 terminal backstop", (1.15, 2.0, -7.12), (3.5, 2.15, 0.32), steel, bevel=0.16)
for side in (-1, 1):
    box(f"V3 terminal portal upright {side}", (1.15 + side * 2.65, 2.0, -6.72), (0.34, 1.92, 0.38), copper,
        rotation=(0, 0, side * 0.08), bevel=0.1)
    box(f"V3 terminal cheek light {side}", (1.15 + side * 2.2, 1.25, -6.36), (0.06, 0.62, 0.08), amber,
        bevel=0.02)
box("V3 terminal portal crown", (1.15, 3.78, -6.72), (2.75, 0.28, 0.4), copper, bevel=0.1)
box("V3 terminal horizon light", (1.15, 3.31, -6.34), (1.55, 0.07, 0.08), amber, bevel=0.02)

# Low cadence inserts are embedded in the trench rather than floating overhead.
for index in range(7):
    box(f"V3 trench cadence {index}", (0.05, -0.075, -0.85 - index * 0.65),
        (0.58, 0.025, 0.045), cyan if index % 2 == 0 else amber, bevel=0.012)

join_by_material()
basis = Matrix.Rotation(math.pi / 2, 4, "X")
for obj in bpy.context.scene.objects:
    obj.matrix_world = basis @ obj.matrix_world
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=str(OUT / "pulseStructuralWorldV3.candidate.glb"),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_animations=False,
)
print("Built", OUT / "pulseStructuralWorldV3.candidate.glb")
