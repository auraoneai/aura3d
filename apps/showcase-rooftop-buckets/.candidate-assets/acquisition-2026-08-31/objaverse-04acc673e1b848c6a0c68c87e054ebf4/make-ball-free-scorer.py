"""Build a ball-free, grounded scorer from the verified Daffa Haekal source.

The source contains a stylized number-24 basketball athlete and a completely
separate spherical ball mesh.  Rooftop Buckets already has one typed,
simulation-owned ball, so this deterministic adaptation removes only that
separate sphere, preserves the athlete's authored layup pose and materials,
and normalizes the retained figure to 1.90 metres with +Y up.
"""

from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "basketball-player.glb"
OUTPUT = HERE / "basketball-scorer-ball-free.glb"
SOURCE_SHA256 = "bdbaafa19a91665aa53754699cf2aac7f5bfa516e38bd4c644f26f80eaed0b69"


def world_points(obj: bpy.types.Object) -> list[Vector]:
    return [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]


def dimensions(points: list[Vector]) -> Vector:
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return maximum - minimum


def main() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))

    player_meshes = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name.startswith("Merged_PolySphere2_8_")
    ]
    if len(player_meshes) < 2:
        raise RuntimeError("Expected the athlete aggregate plus its separate source ball")

    # The embedded ball is the sole near-spherical mesh island in this source.
    # Use geometry, not a guessed display label, then assert its known source
    # object suffix so a changed upstream file fails closed.
    spherical = []
    for obj in player_meshes:
        size = dimensions(world_points(obj))
        ratio = min(size) / max(size)
        if ratio > 0.97:
            spherical.append((obj, size, ratio))
    if len(spherical) != 1:
        raise RuntimeError(f"Expected exactly one separate spherical ball mesh, found {len(spherical)}")
    ball, ball_size, ball_ratio = spherical[0]
    if "Merged_PolySphere2_86" not in ball.name:
        raise RuntimeError(f"Unexpected spherical source object: {ball.name}")
    print(
        "SCORER_REMOVED_BALL",
        {
            "name": ball.name,
            "size": [round(value, 6) for value in ball_size],
            "sphericity": round(ball_ratio, 6),
        },
    )
    bpy.data.objects.remove(ball, do_unlink=True)

    retained = [obj for obj in player_meshes if obj != ball]
    retained_points = [point for obj in retained for point in world_points(obj)]
    minimum = Vector(tuple(min(point[axis] for point in retained_points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in retained_points) for axis in range(3)))
    center = (minimum + maximum) * 0.5
    source_height = maximum.z - minimum.z
    if source_height <= 0:
        raise RuntimeError("Retained athlete has no positive source height")

    # Source Z is up. Export with Y-up after baking a grounded 1.90 m result.
    normalize = Matrix.Scale(1.90 / source_height, 4) @ Matrix.Translation(
        Vector((-center.x, -center.y, -minimum.z))
    )
    for obj in retained:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.data.transform(normalize @ world)
        obj.matrix_world = Matrix.Identity(4)

    anchor = retained[0]
    anchor["aura_attribution"] = "Basketball player by Daffa Haekal"
    anchor["aura_source_url"] = (
        "https://sketchfab.com/3d-models/"
        "basketball-player-04acc673e1b848c6a0c68c87e054ebf4"
    )
    anchor["aura_source_sha256"] = SOURCE_SHA256
    anchor["aura_license"] = "Creative Commons Attribution 4.0 International"
    anchor["aura_license_url"] = "http://creativecommons.org/licenses/by/4.0/"
    anchor["aura_adaptation"] = (
        "Removed the sole separate spherical source ball so the route-owned "
        "typed ballistic ball remains unique; preserved the authored number-24 "
        "layup pose and materials; normalized the athlete to 1.90 metres."
    )

    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or obj not in retained:
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in retained:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = anchor
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_extras=True,
    )
    print(
        "SCORER_OUTPUT",
        {
            "path": str(OUTPUT),
            "retained_meshes": len(retained),
            "height_m": 1.90,
        },
    )


if __name__ == "__main__":
    main()
