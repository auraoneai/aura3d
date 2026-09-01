"""Build Pulse Tunnel combat-finish V4 candidates with Blender.

Original route-local work authored for Aura3D. License: CC0-1.0.

The outputs are isolated art candidates under art-review/assets and are not
release assets until the root manifest owner audits and registers their exact
hashes. They contain no animation or collision data. Pulse Tunnel's existing
chart, lane, shield, scoring, fail, reset, and clock systems remain authoritative.
"""

from pathlib import Path
import math
import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art-review" / "assets" / "combat-finish-v4"
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
        emission_input = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[emission_input].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return value


def finish(obj, material, bevel=0.04, smooth=False):
    obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new("precision edge bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def box(name, location, scale, material, bevel=0.04, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, material, bevel)


def cylinder(name, location, radius, depth, material, vertices=20, rotation=(0, 0, 0), bevel=0.025):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, material, bevel)


def torus(name, location, major, minor, material, rotation=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=32,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def wedge(name, location, width_back, width_front, length, height, material, bevel=0.03):
    """Create a centered, tapered +Y-height / -Z-forward hull prism."""
    back_z = length * 0.5
    front_z = -length * 0.5
    bottom = 0
    top = height
    vertices = [
        (-width_back, bottom, back_z), (width_back, bottom, back_z),
        (width_front, bottom, front_z), (-width_front, bottom, front_z),
        (-width_back, top, back_z), (width_back, top, back_z),
        (width_front, top, front_z), (-width_front, top, front_z),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2),
        (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return finish(obj, material, bevel)


def export(filename):
    bpy.ops.object.select_all(action="SELECT")
    basis = Matrix.Rotation(math.pi / 2, 4, "X")
    for obj in bpy.context.scene.objects:
        obj.matrix_world = basis @ obj.matrix_world
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / filename),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
    )


def build_runner():
    reset()
    graphite = mat("runner graphite alloy", (0.035, 0.085, 0.12), 0.78, 0.29)
    teal = mat("runner deep teal armour", (0.045, 0.27, 0.34), 0.62, 0.32)
    pale = mat("runner cool ceramic panels", (0.34, 0.52, 0.59), 0.38, 0.41)
    bronze = mat("runner heat bronze trim", (0.48, 0.20, 0.07), 0.74, 0.28)
    canopy = mat("runner smoked canopy", (0.015, 0.13, 0.19), 0.48, 0.18, (0.0, 0.32, 0.48), 0.34)
    drive = mat("runner bounded cyan drive", (0.01, 0.22, 0.28), 0.28, 0.2, (0.0, 0.62, 0.78), 1.15)

    wedge("runner continuous tapered fuselage", (0, 0.18, -0.08), 0.46, 0.18, 2.42, 0.42, graphite, 0.055)
    wedge("runner dorsal armour shell", (0, 0.46, -0.23), 0.34, 0.12, 1.62, 0.24, pale, 0.065)
    wedge("runner ventral keel", (0, 0.05, 0.12), 0.26, 0.08, 2.05, 0.18, teal, 0.045)
    wedge("runner pointed bronze prow", (0, 0.28, -1.3), 0.2, 0.025, 0.72, 0.19, bronze, 0.035)
    box("runner canopy spine", (0, 0.69, -0.23), (0.25, 0.13, 0.46), canopy, 0.08, (0.03, 0, 0))
    box("runner rear dorsal brake", (0, 0.54, 0.79), (0.34, 0.075, 0.29), bronze, 0.035)

    for side in (-1, 1):
        box(
            f"runner swept continuous wing {side}",
            (side * 0.77, 0.27, 0.05),
            (0.76, 0.085, 0.63),
            teal,
            0.055,
            (0, side * -0.2, side * 0.065),
        )
        wedge(
            f"runner wing tip armour {side}",
            (side * 1.25, 0.29, 0.04),
            0.2,
            0.08,
            1.05,
            0.17,
            pale,
            0.04,
        ).rotation_euler[2] = side * 0.08
        box(
            f"runner bronze leading edge {side}",
            (side * 0.81, 0.35, -0.32),
            (0.63, 0.035, 0.08),
            bronze,
            0.022,
            (0, side * -0.2, side * 0.065),
        )
        cylinder(
            f"runner recessed drive housing {side}",
            (side * 0.64, 0.25, 0.88),
            0.19,
            0.64,
            graphite,
            24,
            (math.pi / 2, 0, 0),
            0.035,
        )
        cylinder(
            f"runner bounded exhaust aperture {side}",
            (side * 0.64, 0.25, 1.22),
            0.125,
            0.055,
            drive,
            24,
            (math.pi / 2, 0, 0),
            0.012,
        )
        box(f"runner stabilizer fin {side}", (side * 0.38, 0.67, 0.72), (0.06, 0.28, 0.38), graphite, 0.03, (side * -0.16, 0, side * -0.05))
    export("pulseRunnerCraftV4.candidate.glb")


def build_sentry():
    reset()
    graphite = mat("sentinel graphite armour", (0.045, 0.07, 0.105), 0.8, 0.28)
    maroon = mat("sentinel oxblood armour", (0.25, 0.035, 0.07), 0.62, 0.31)
    slate = mat("sentinel blue slate plates", (0.11, 0.2, 0.29), 0.58, 0.36)
    bronze = mat("sentinel furnace bronze", (0.46, 0.17, 0.045), 0.8, 0.25)
    rose = mat("sentinel bounded reactor rose", (0.24, 0.015, 0.055), 0.32, 0.22, (0.72, 0.015, 0.12), 1.2)
    amber = mat("sentinel bounded amber optics", (0.28, 0.12, 0.015), 0.32, 0.2, (0.8, 0.32, 0.025), 1.0)

    box("sentinel continuous armoured core", (0, 1.22, 0), (0.78, 0.72, 0.44), graphite, 0.14)
    wedge("sentinel forward breastplate", (0, 1.12, -0.47), 0.6, 0.4, 0.3, 0.72, maroon, 0.08)
    box("sentinel crown armour", (0, 1.9, -0.03), (0.58, 0.18, 0.42), slate, 0.08)
    box("sentinel lower reactor keel", (0, 0.5, 0.05), (0.4, 0.42, 0.35), graphite, 0.09)
    torus("sentinel reactor containment ring", (0, 1.2, -0.62), 0.38, 0.075, bronze)
    cylinder("sentinel reactor iris", (0, 1.2, -0.67), 0.24, 0.08, rose, 28, (math.pi / 2, 0, 0), 0.025)
    cylinder("sentinel central optic", (0, 1.73, -0.48), 0.11, 0.08, amber, 20, (math.pi / 2, 0, 0), 0.02)

    for side in (-1, 1):
        box(
            f"sentinel swept shoulder armour {side}",
            (side * 1.05, 1.45, 0.03),
            (0.84, 0.18, 0.42),
            slate,
            0.075,
            (0, side * 0.18, side * 0.18),
        )
        wedge(
            f"sentinel blade wing {side}",
            (side * 1.7, 1.42, 0.02),
            0.32,
            0.1,
            1.35,
            0.19,
            maroon,
            0.045,
        ).rotation_euler[2] = side * 0.16
        cylinder(
            f"sentinel rotary cannon {side}",
            (side * 1.36, 1.22, -0.38),
            0.14,
            0.74,
            bronze,
            20,
            (0, math.pi / 2, side * 0.06),
            0.025,
        )
        cylinder(
            f"sentinel cannon aperture {side}",
            (side * 1.76, 1.22, -0.38),
            0.09,
            0.06,
            amber,
            20,
            (0, math.pi / 2, side * 0.06),
            0.01,
        )
        box(f"sentinel lower stabilizer {side}", (side * 0.52, 0.45, 0.05), (0.13, 0.5, 0.28), maroon, 0.055, (side * -0.12, 0, side * -0.16))
        box(f"sentinel ventral blade {side}", (side * 0.68, 0.17, 0.03), (0.28, 0.08, 0.48), graphite, 0.04, (0, side * 0.16, side * 0.08))
    export("pulseTerminalSentryV4.candidate.glb")


def build_world():
    reset()
    deck = mat("V4 reactor deck graphite", (0.09, 0.14, 0.21), 0.66, 0.38)
    inset = mat("V4 exchange lane inset", (0.035, 0.075, 0.12), 0.72, 0.34)
    wall = mat("V4 containment blue steel", (0.085, 0.18, 0.27), 0.62, 0.4)
    rib = mat("V4 oxidized bronze ribs", (0.33, 0.14, 0.055), 0.74, 0.34)
    cyan = mat("V4 bounded cyan cadence", (0.015, 0.23, 0.3), 0.34, 0.25, (0.0, 0.55, 0.72), 0.9)
    amber = mat("V4 bounded amber terminal", (0.31, 0.13, 0.02), 0.38, 0.26, (0.76, 0.28, 0.025), 0.95)

    box("V4 continuous reactor deck", (0, -0.25, -3.0), (4.65, 0.22, 7.4), deck, 0.12)
    box("V4 recessed exchange lane", (0, -0.01, -2.85), (2.65, 0.07, 6.8), inset, 0.03)
    box("V4 runner launch apron", (-1.45, 0.08, 0.15), (1.85, 0.13, 1.75), wall, 0.075, (0, -0.05, 0))
    box("V4 raised sentinel dock", (1.95, 0.1, -5.65), (2.25, 0.28, 1.45), wall, 0.12)
    box("V4 terminal backstop", (2.0, 1.52, -6.85), (2.45, 1.55, 0.22), inset, 0.1)
    box("V4 terminal crown", (2.0, 3.0, -6.75), (2.15, 0.18, 0.42), rib, 0.08)

    for side in (-1, 1):
        box(f"V4 connected sidewall {side}", (side * 4.25, 0.75, -3.0), (0.3, 0.9, 7.2), wall, 0.1)
        box(f"V4 upper containment shoulder {side}", (side * 3.92, 2.25, -3.1), (0.27, 0.44, 6.9), wall, 0.085, (0, 0, side * 0.22))
        box(f"V4 continuous lane conduit {side}", (side * 3.55, 0.34, -3.0), (0.045, 0.045, 6.85), cyan, 0.018)

    for index, z in enumerate((1.45, -0.85, -3.15, -5.45)):
        for side in (-1, 1):
            box(f"V4 load rib {index} {side}", (side * 3.75, 1.6, z), (0.17, 1.42, 0.24), rib, 0.065, (0, 0, side * -0.18))
            box(f"V4 crown brace {index} {side}", (side * 1.9, 3.03, z), (1.72, 0.13, 0.24), rib, 0.055, (0, side * 0.02, side * -0.14))
        box(f"V4 roof cadence practical {index}", (0, 3.32, z), (0.34, 0.07, 0.18), cyan if index < 3 else amber, 0.03)

    for index in range(6):
        box(
            f"V4 deck cadence inset {index}",
            (0, 0.075, 0.4 - index * 1.05),
            (0.48, 0.025, 0.035),
            cyan if index < 4 else amber,
            0.01,
        )

    box("V4 sentinel amber identity bar", (1.95, 2.38, -6.58), (0.62, 0.045, 0.035), amber, 0.015)
    export("pulseReactorEncounterWorldV4.candidate.glb")


build_runner()
build_sentry()
build_world()
print("Built Pulse Tunnel combat-finish V4 candidates in", OUT)
