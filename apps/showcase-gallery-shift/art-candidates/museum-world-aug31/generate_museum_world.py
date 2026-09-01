#!/usr/bin/env python3
"""Generate an original CC0 cutaway museum world for Gallery Shift.

The asset follows the active Floor 1 footprint in ``src/floor.ts``.  It is an
art candidate only: this script does not register the GLB, modify the route, or
change collision/gameplay.  Geometry is joined by material before export so the
authored detail remains inexpensive for a top-down browser game.

Run with:
  blender --background --python generate_museum_world.py
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
BLEND_PATH = HERE / "galleryShiftMuseumWorldCandidate.blend"
GLB_PATH = HERE / "galleryShiftMuseumWorldCandidate.glb"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission is not None:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def apply_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    obj.data.materials.append(mat)
    obj["aura_material_group"] = mat.name


def loc_a3d(value: tuple[float, float, float]) -> tuple[float, float, float]:
    """Convert Aura's +Y-up coordinates to Blender's +Z-up coordinates."""
    x, y, z = value
    # Blender's glTF exporter maps its +Y axis to glTF -Z while converting
    # +Z-up to +Y-up, hence the deliberate sign flip for route Z.
    return (x, -z, y)


def scale_a3d(value: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = value
    return (x, z, y)


def cube(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    mat: bpy.types.Material,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc_a3d(location))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale_a3d(dimensions)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, mat)
    if bevel > 0.0:
        modifier = obj.modifiers.new(name="architectural edge", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    vertices: int = 24,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc_a3d(location))
    obj = bpy.context.object
    obj.name = name
    apply_material(obj, mat)
    if bevel > 0.0:
        modifier = obj.modifiers.new(name="softened profile", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def uv_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    segments: int = 20,
    rings: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc_a3d(location))
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale_a3d(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, mat)
    return obj


def torus(
    name: str,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    mat: bpy.types.Material,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    major_segments: int = 32,
    minor_segments: int = 8,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=loc_a3d(location),
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    apply_material(obj, mat)
    return obj


def join_material_groups() -> None:
    """Collapse all visible meshes with the same single material to one node."""
    groups: dict[str, list[bpy.types.Object]] = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        groups.setdefault(obj.data.materials[0].name, []).append(obj)

    for mat_name, objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"Museum_{mat_name.replace(' ', '_')}"
        joined["aura_authored_role"] = "gallery-shift-world"
        joined["aura_draw_group"] = mat_name


def add_wall(
    name: str,
    x: float,
    z: float,
    half_x: float,
    half_z: float,
    wall_mat: bpy.types.Material,
    cap_mat: bpy.types.Material,
    height: float = 1.02,
) -> None:
    # Waist-high cutaway walls preserve every authored room boundary while
    # keeping actors and circulation lanes legible in the oblique review shot.
    cube(name, (x, height * 0.5, z), (half_x * 2.0, height, half_z * 2.0), wall_mat, 0.055)
    cube(f"{name} dark stone cap", (x, height + 0.035, z), (half_x * 2.0 + 0.04, 0.07, half_z * 2.0 + 0.04), cap_mat, 0.025)


def build_world() -> None:
    clear_scene()

    # Fourteen PBR groups become fourteen GLB primitives/draw groups.
    # The cutaway walls must remain legible from the route's oblique review
    # camera. The earlier near-black values collapsed their broad faces into
    # featureless occluders in the safe renderer, so the limestone now carries
    # a restrained cool bounce and the caps separate as blue graphite.
    stone = material(
        "Limestone Walls",
        (0.50, 0.57, 0.62, 1),
        0.67,
        emission=(0.10, 0.16, 0.20, 1),
        emission_strength=0.28,
    )
    dark_stone = material(
        "Graphite Wall Caps",
        (0.085, 0.12, 0.16, 1),
        0.54,
        0.12,
        emission=(0.025, 0.055, 0.08, 1),
        emission_strength=0.18,
    )
    floor_base = material("Shadow Gap Floor", (0.018, 0.026, 0.032, 1), 0.88)
    foyer = material("Foyer Terrazzo", (0.30, 0.35, 0.37, 1), 0.62)
    rotunda = material("Rotunda Ivory Marble", (0.58, 0.58, 0.52, 1), 0.43)
    archive = material("Archive Smoked Oak", (0.16, 0.082, 0.045, 1), 0.56)
    treasury = material("Treasury Garnet Carpet", (0.31, 0.028, 0.045, 1), 0.86)
    vault = material("Vault Blue Slate", (0.055, 0.13, 0.17, 1), 0.68)
    brass = material("Aged Brass Wayfinding", (0.48, 0.28, 0.075, 1), 0.32, 0.78)
    walnut = material("Walnut Furniture", (0.13, 0.052, 0.028, 1), 0.48)
    plinth = material("Travertine Plinths", (0.56, 0.48, 0.36, 1), 0.66)
    bronze = material("Museum Bronze", (0.27, 0.10, 0.035, 1), 0.30, 0.86)
    jade = material(
        "Exit Jade Light",
        (0.025, 0.34, 0.27, 1),
        0.25,
        0.42,
        emission=(0.04, 0.92, 0.65, 1),
        emission_strength=2.3,
    )
    artwork = material("Cobalt Artwork", (0.035, 0.12, 0.42, 1), 0.42, 0.25)

    # Recessed base and individually authored floor plates. Small negative
    # gutters prevent the footprint from collapsing into one monolithic slab.
    cube("recessed museum foundation", (0, -0.11, 0), (20.8, 0.22, 14.8), floor_base, 0.06)
    floor_specs = [
        ("south foyer terrazzo", 0, 4.65, 9.50, 3.30, foyer),
        ("central rotunda marble", 0, 0.10, 9.40, 5.90, rotunda),
        ("north vault slate", 0, -5.45, 6.00, 2.30, vault),
        ("archive gallery oak", -7.50, -2.85, 4.60, 3.90, archive),
        ("archive conservation oak", -7.50, 4.05, 4.60, 4.90, archive),
        ("treasury vault carpet", 7.50, -4.15, 4.60, 3.10, treasury),
        ("treasury exhibition carpet", 7.50, 2.75, 4.60, 7.70, treasury),
    ]
    for name, x, z, sx, sz, mat in floor_specs:
        cube(name, (x, 0.035, z), (sx, 0.07, sz), mat, 0.025)

    # Graphic floor inlays are modeled geometry, not UI or painted route
    # guides. They supply room identity and circulation rhythm.
    cylinder("rotunda brass medallion", (0, 0.085, 0.10), 2.32, 0.035, brass, 48)
    cylinder("rotunda marble inner disc", (0, 0.108, 0.10), 1.86, 0.042, rotunda, 48)
    torus("rotunda bronze orbit", (0, 0.145, 0.10), 1.22, 0.055, bronze, major_segments=40)
    for x in (-3.45, -1.15, 1.15, 3.45):
        cube(f"foyer brass seam {x:+.2f}", (x, 0.095, 4.65), (0.055, 0.03, 3.04), brass, 0.01)
    for z in (-5.02, -3.28, 0.22, 2.00, 4.05):
        cube(f"wing brass threshold {z:+.2f}", (7.50, 0.098, z), (3.95, 0.035, 0.055), brass, 0.01)
        cube(f"archive parquet seam {z:+.2f}", (-7.50, 0.098, z), (3.95, 0.035, 0.04), brass, 0.008)

    # Exact Floor 1 partition segments from src/floor.ts plus a complete
    # perimeter. Their gaps remain the real route's playable door openings.
    wall_specs = [
        ("north perimeter", 0, -7.2, 10.4, 0.20),
        ("south perimeter", 0, 7.2, 10.4, 0.20),
        ("west perimeter", -10.2, 0, 0.20, 7.4),
        ("east perimeter", 10.2, 0, 0.20, 7.4),
        ("service alcove west", -1.8, -5.2, 1.0, 0.20),
        ("service alcove east", 1.8, -5.2, 1.0, 0.20),
        ("archive entry north", -5.0, -3.45, 0.20, 1.55),
        ("archive entry south", -5.0, 1.25, 0.20, 1.95),
        ("treasury entry north", 5.0, -2.45, 0.20, 2.55),
        ("treasury entry south", 5.0, 2.35, 0.20, 0.85),
        ("archive cross west", -9.05, 1.4, 0.95, 0.20),
        ("archive cross east", -5.95, 1.4, 0.95, 0.20),
        ("treasury cross west", 5.95, -1.3, 0.95, 0.20),
        ("treasury cross east", 9.05, -1.3, 0.95, 0.20),
    ]
    for name, x, z, half_x, half_z in wall_specs:
        add_wall(name, x, z, half_x, half_z, stone, dark_stone)

    # Brass portals sit on the exact passable thresholds. At this cutaway
    # height the lintels read as discrete doors without masking the rooms.
    door_specs = [
        ("archive rotunda portal", -5.0, -1.3, False),
        ("archive cross portal", -7.5, 1.4, True),
        ("treasury rotunda portal", 5.0, 0.8, False),
        ("treasury cross portal", 7.5, -1.3, True),
    ]
    for name, x, z, horizontal in door_specs:
        if horizontal:
            cube(f"{name} left jamb", (x - 0.72, 0.56, z), (0.12, 1.12, 0.18), brass, 0.025)
            cube(f"{name} right jamb", (x + 0.72, 0.56, z), (0.12, 1.12, 0.18), brass, 0.025)
            cube(f"{name} lintel", (x, 1.08, z), (1.56, 0.12, 0.18), brass, 0.025)
            cube(f"{name} sill", (x, 0.11, z), (1.35, 0.035, 0.22), brass, 0.01)
        else:
            cube(f"{name} left jamb", (x, 0.56, z - 0.72), (0.18, 1.12, 0.12), brass, 0.025)
            cube(f"{name} right jamb", (x, 0.56, z + 0.72), (0.18, 1.12, 0.12), brass, 0.025)
            cube(f"{name} lintel", (x, 1.08, z), (0.18, 0.12, 1.56), brass, 0.025)
            cube(f"{name} sill", (x, 0.11, z), (0.22, 0.035, 1.35), brass, 0.01)

    # Two objective pedestals occupy the real p1/p2 coordinates. Their stepped
    # silhouettes and distinct artifacts are intentionally continuous and
    # sculptural, not placeholder cubes.
    for side, x in (("archive", -6.5), ("treasury", 6.5)):
        z = -4.2
        cylinder(f"{side} objective plinth base", (x, 0.13, z), 0.64, 0.26, plinth, 20, 0.035)
        cylinder(f"{side} objective plinth stem", (x, 0.49, z), 0.42, 0.50, plinth, 16, 0.025)
        cylinder(f"{side} objective plinth crown", (x, 0.79, z), 0.56, 0.12, brass, 20, 0.02)

    # Archive: a continuous bronze spiral relic. Treasury: a faceted jade
    # vessel. Both are unmistakable top-down focal shapes but remain world art.
    torus("archive spiral relic outer", (-6.5, 1.08, -4.2), 0.31, 0.095, bronze, rotation=(math.pi / 2, 0, 0), major_segments=28)
    torus("archive spiral relic inner", (-6.5, 1.08, -4.2), 0.16, 0.07, bronze, rotation=(math.pi / 2, 0, 0), major_segments=24)
    uv_sphere("treasury jade vessel body", (6.5, 1.06, -4.2), (0.34, 0.43, 0.34), jade, 16, 10)
    torus("treasury jade vessel collar", (6.5, 1.36, -4.2), 0.22, 0.055, brass, major_segments=20)

    # Perimeter furniture keeps the plan inhabited without clustering the
    # navigable center. Every bench sits against a wall and clear of patrols.
    for index, (x, z, sx, sz) in enumerate([
        (-8.55, -5.82, 1.20, 0.38), (-8.55, 5.85, 1.20, 0.38),
        (8.55, -5.82, 1.20, 0.38), (8.55, 5.85, 1.20, 0.38),
        (-3.25, 5.82, 1.15, 0.38), (3.25, 5.82, 1.15, 0.38),
    ]):
        cube(f"walnut bench seat {index}", (x, 0.34, z), (sx, 0.16, sz), walnut, 0.055)
        cube(f"walnut bench foot a {index}", (x - sx * 0.33, 0.17, z), (0.11, 0.27, sz * 0.72), brass, 0.025)
        cube(f"walnut bench foot b {index}", (x + sx * 0.33, 0.17, z), (0.11, 0.27, sz * 0.72), brass, 0.025)

    # Wall-hugging cases and paintings establish exhibit cadence. Glass is
    # deliberately opaque-tinted in this candidate because alpha sorting would
    # add ambiguity to an overhead stealth view.
    for index, (x, z, along_x) in enumerate([
        (-9.72, -3.7, False), (-9.72, 3.9, False),
        (9.72, -3.7, False), (9.72, 3.9, False),
        (-2.8, -6.82, True), (2.8, -6.82, True),
    ]):
        if along_x:
            cube(f"cobalt wall artwork {index}", (x, 0.84, z), (1.24, 0.78, 0.08), artwork, 0.025)
            cube(f"brass artwork frame {index}", (x, 0.84, z + 0.055), (1.38, 0.92, 0.055), brass, 0.025)
            cube(f"cobalt artwork face {index}", (x, 0.84, z + 0.09), (1.16, 0.70, 0.035), artwork, 0.01)
        else:
            cube(f"cobalt wall artwork {index}", (x, 0.84, z), (0.08, 0.78, 1.24), artwork, 0.025)
            cube(f"brass artwork frame {index}", (x + 0.055, 0.84, z), (0.055, 0.92, 1.38), brass, 0.025)
            cube(f"cobalt artwork face {index}", (x + 0.09, 0.84, z), (0.035, 0.70, 1.16), artwork, 0.01)

    # North service exit: a luminous layered destination visible immediately
    # from the route camera. It occupies the real x=0,z=-6.3 exit region and
    # leaves the center approach unobstructed.
    cube("exit dark backing", (0, 0.90, -7.00), (2.18, 1.80, 0.18), dark_stone, 0.07)
    cube("exit jade left pier", (-0.92, 0.90, -6.87), (0.18, 1.80, 0.22), jade, 0.045)
    cube("exit jade right pier", (0.92, 0.90, -6.87), (0.18, 1.80, 0.22), jade, 0.045)
    cube("exit jade lintel", (0, 1.72, -6.87), (2.02, 0.18, 0.22), jade, 0.045)
    cube("exit brass threshold", (0, 0.12, -6.30), (1.72, 0.06, 0.38), brass, 0.02)
    for x in (-0.52, 0.0, 0.52):
        cube(f"exit runway light {x:+.2f}", (x, 0.11, -5.78), (0.16, 0.045, 0.28), jade, 0.025)

    # Four architectural corner pylons add elevation and anchor the open-roof
    # composition without creating any ceiling or overhead occluder.
    for index, (x, z) in enumerate(((-4.45, -4.75), (4.45, -4.75), (-4.45, 4.75), (4.45, 4.75))):
        cylinder(f"cutaway stone pylon {index}", (x, 0.72, z), 0.25, 1.44, stone, 12, 0.035)
        cylinder(f"cutaway brass pylon cap {index}", (x, 1.47, z), 0.34, 0.10, brass, 12, 0.02)

    # Explicit metadata survives in the .blend and communicates design intent.
    world = bpy.context.scene
    world["license"] = "CC0-1.0"
    world["author"] = "Aura3D original synthesis"
    world["route"] = "showcase-gallery-shift"
    world["candidate"] = "museum-world-aug31"
    world["open_roof"] = True
    world["floor_footprint_m"] = [20.8, 14.8]
    world["note"] = "Art-only candidate; no collision, camera, gameplay, manifest, or runtime integration."

    join_material_groups()

    # Smooth only the intentionally sculptural surfaces; hard architecture
    # retains authored bevel normals and crisp top-down boundaries.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.name in {"Museum_Museum_Bronze", "Museum_Exit_Jade_Light"}:
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_yup=True,
    )

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    polygons = sum(len(obj.data.polygons) for obj in meshes)
    print(f"WROTE {GLB_PATH}")
    print(f"WROTE {BLEND_PATH}")
    print(f"MESH_NODES {len(meshes)}")
    print(f"POLYGONS {polygons}")
    print(f"MATERIALS {len(bpy.data.materials)}")


if __name__ == "__main__":
    build_world()
