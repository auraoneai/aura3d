import sys

import bpy
from mathutils import Matrix, Vector


source_path, output_path = sys.argv[sys.argv.index("--") + 1 :]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source_path)

players = [
    obj
    for obj in bpy.context.scene.objects
    if obj.type == "MESH" and obj.name.startswith("Merged_PolySphere2_8_")
]
if not players:
    raise RuntimeError("No Merged_PolySphere2_8 player meshes were imported")

world_points = [obj.matrix_world @ Vector(corner) for obj in players for corner in obj.bound_box]
minimum = Vector((min(point.x for point in world_points), min(point.y for point in world_points), min(point.z for point in world_points)))
maximum = Vector((max(point.x for point in world_points), max(point.y for point in world_points), max(point.z for point in world_points)))
center = (minimum + maximum) * 0.5
height = maximum.z - minimum.z
if height <= 0:
    raise RuntimeError("Player aggregate has no positive height")

normalize = Matrix.Scale(1.85 / height, 4) @ Matrix.Translation(Vector((-center.x, -center.y, -minimum.z)))
for obj in players:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.data.transform(normalize @ world)
    obj.matrix_world = Matrix.Identity(4)

bpy.ops.object.select_all(action="DESELECT")
for obj in players:
    obj.select_set(True)
bpy.context.view_layer.objects.active = players[0]

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_extras=True,
)

print(f"isolated {len(players)} player meshes; source height={height:.3f}; output={output_path}")
