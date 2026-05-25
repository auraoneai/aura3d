import sys
from pathlib import Path

import bpy
from mathutils import Vector


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: blender --background --python inspect-gltf-blender.py -- <asset.glb|asset.gltf>")
    asset_path = Path(sys.argv[-1]).resolve()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=str(asset_path))

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    material_names: set[str] = set()
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            xs.append(world.x)
            ys.append(world.y)
            zs.append(world.z)
        for material in obj.data.materials:
            material_names.add(material.name if material else "None")

    print(f"asset: {asset_path}")
    print(f"objects: {len(bpy.context.scene.objects)}")
    print(f"meshes: {len(meshes)}")
    print(f"materials: {len(material_names)}")
    if xs:
        print(f"bounds: x={min(xs):.3f}..{max(xs):.3f} y={min(ys):.3f}..{max(ys):.3f} z={min(zs):.3f}..{max(zs):.3f}")
    print("largest meshes:")
    largest = sorted(meshes, key=lambda obj: obj.dimensions.length, reverse=True)[:80]
    for obj in largest:
        loc = tuple(round(v, 3) for v in obj.location)
        dims = tuple(round(v, 3) for v in obj.dimensions)
        mats = [material.name if material else "None" for material in obj.data.materials[:4]]
        print(f"- {obj.name} loc={loc} dims={dims} mats={mats}")


if __name__ == "__main__":
    main()
