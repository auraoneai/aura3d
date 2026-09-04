"""Create the route shooter while leaving the route-owned ball as the sole ball.

The verified CC-BY source pose and packed textures are preserved. The only
content removal is the complete independently named BASKETBALL2 hierarchy.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "basketball-player.glb"
OUTPUT = HERE / "basketball-shooter-ball-free.glb"


def flatten_and_normalize(mesh_objects: list[bpy.types.Object]) -> None:
    for obj in mesh_objects:
        world = obj.matrix_world.copy()
        for vertex in obj.data.vertices:
            vertex.co = world @ vertex.co
        obj.parent = None
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Identity(4)

    points = [vertex.co for obj in mesh_objects for vertex in obj.data.vertices]
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (minimum + maximum) * 0.5
    height = maximum.z - minimum.z
    scale = 1.95 / height
    turn = Matrix.Rotation(math.pi, 4, "Z")

    for obj in mesh_objects:
        for vertex in obj.data.vertices:
            centered = vertex.co - Vector((center.x, center.y, minimum.z))
            vertex.co = (turn @ centered) * scale

    points = [vertex.co for obj in mesh_objects for vertex in obj.data.vertices]
    final_min = [min(point[axis] for point in points) for axis in range(3)]
    final_max = [max(point[axis] for point in points) for axis in range(3)]
    print(
        "SHOOTER_BOUNDS",
        {
            "min": [round(value, 6) for value in final_min],
            "max": [round(value, 6) for value in final_max],
            "size": [round(final_max[i] - final_min[i], 6) for i in range(3)],
        },
    )


def main() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))

    removed = []
    for obj in list(bpy.data.objects):
        if obj.name.startswith("BASKETBALL2"):
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    if not removed:
        raise RuntimeError("Expected complete BASKETBALL2 source hierarchy")
    print("SHOOTER_REMOVED_BALL_OBJECTS", len(removed))

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    body = bpy.data.objects.get("H_DDS_MidRes__Body_Mid_0")
    if body is None or body not in mesh_objects:
        raise RuntimeError("Expected retained source body mesh")
    flatten_and_normalize(mesh_objects)

    body["aura_attribution"] = "Basketball player by 3DDomino"
    body["aura_source_url"] = (
        "https://sketchfab.com/3d-models/"
        "basketball-player-9a1be0ed25f94e9998adee1df3a2d218"
    )
    body["aura_source_sha256"] = (
        "f67f19f62254c825103cf55472a273a470d6bf69164a0cddcbc4e369e92d7523"
    )
    body["aura_license"] = "Creative Commons Attribution 4.0 International"
    body["aura_license_url"] = "http://creativecommons.org/licenses/by/4.0/"
    body["aura_adaptation"] = (
        "Complete BASKETBALL2 hierarchy removed so the route-owned ballistic "
        "basketball remains the sole ball; source pose and textures preserved."
    )

    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_extras=True,
    )
    print("SHOOTER_OUTPUT", OUTPUT)


if __name__ == "__main__":
    main()
