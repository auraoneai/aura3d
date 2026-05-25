import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "fixtures" / "v9" / "assets" / "khronos-showcase" / "sponza-packed" / "sponza-packed.glb"
OUT_DIR = ROOT / "fixtures" / "v9" / "assets" / "khronos-showcase" / "sponza-cathedral-crop"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "sponza-cathedral-crop.glb"
BLEND_OUT = OUT_DIR / "sponza-cathedral-crop.blend"


def clear_scene() -> None:
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


def cube(name, loc, scale, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc_g3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale_g3d(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def beam_mesh(name, points, material):
    verts = [loc_g3d(point) for point in points]
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def crop_sponza_mesh(obj) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    bm.faces.ensure_lookup_table()

    # The official Sponza mesh is a single draw mesh. Keep the interior courtyard,
    # textured columns, drapes, and lower roof ribs, but remove far exterior/roof
    # faces that made the route screenshot read as a roof block instead of an
    # atmospheric interior.
    for face in bm.faces:
        center = obj.matrix_world @ face.calc_center_median()
        keep = (
            -7.4 <= center.x <= 7.2
            and -3.9 <= center.y <= 5.3
            and -0.85 <= center.z <= 7.25
        )
        # Deliberately make this a cutaway asset: side/exterior walls were
        # dominating the browser screenshot, so discard most boundary faces and
        # preserve only central courtyard architecture, drapes, floors, arches,
        # and columns.
        if center.z > 2.0 and (abs(center.x) > 6.45 or center.y < -3.35 or center.y > 4.65):
            keep = False
        face.select = not keep
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.material_slot_remove_unused()
    obj.name = "curated Khronos Sponza interior crop"
    obj.data.name = "curated Khronos Sponza interior crop mesh"


def add_atmosphere() -> None:
    cyan = mat("G3D soft aperture light shaft material", (0.58, 0.82, 0.96, 0.09), roughness=0.14, emission=(0.045, 0.18, 0.3, 1), strength=0.34, alpha=0.09)
    amber = mat("G3D warm lantern accents", (1.0, 0.58, 0.18, 1), roughness=0.24, emission=(1.0, 0.35, 0.06, 1), strength=2.5)
    fog = mat("G3D layered low interior haze", (0.56, 0.7, 0.78, 0.075), roughness=0.28, emission=(0.035, 0.08, 0.1, 1), strength=0.09, alpha=0.075)
    dark = mat("G3D foreground dark plinth silhouettes", (0.025, 0.03, 0.034, 1), metallic=0.25, roughness=0.55)

    for i, z in enumerate([4.8, 3.5, 2.2, 0.9, -0.4, -1.7, -3.0, -4.3]):
        cube(f"curated low fog volume card {i:02d}", (0, 0.18 + (i % 3) * 0.045, z), (13.2 - i * 0.48, 0.11, 0.035), fog)
    for i, (sx, sz, fx, fz) in enumerate([
        (-4.8, -5.4, -1.0, 1.6),
        (-2.3, -5.7, -0.3, 0.0),
        (0.2, -5.9, 0.6, -1.2),
        (3.0, -5.6, 1.3, 1.0),
        (5.1, -5.2, 2.0, 2.2),
    ]):
        beam_mesh(
            f"curated Sponza cathedral light shaft {i:02d}",
            [
                (sx - 0.12, 5.3, sz),
                (sx + 0.12, 5.3, sz),
                (fx + 0.42, 0.32, fz),
                (fx - 0.42, 0.32, fz),
            ],
            cyan,
        )
    for i, (x, z) in enumerate([(-5.8, 2.9), (5.7, 1.4), (-4.4, -1.6), (4.3, -3.3), (-1.8, -4.7), (2.1, -4.5)]):
        cube(f"curated warm floor lantern {i:02d}", (x, 0.42, z), (0.22, 0.34, 0.22), amber)
        cube(f"curated lantern dark base {i:02d}", (x, 0.12, z), (0.32, 0.16, 0.32), dark)

    bpy.ops.object.light_add(type="AREA", location=(0, -5.8, 5.2))
    bpy.context.object.name = "large cold apse light"
    bpy.context.object.data.energy = 950
    bpy.context.object.data.size = 7.0
    bpy.ops.object.light_add(type="POINT", location=(0, 0.5, 1.4))
    bpy.context.object.name = "warm interior floor bounce"
    bpy.context.object.data.energy = 180
    bpy.context.object.data.color = (1.0, 0.72, 0.42)
    bpy.ops.object.camera_add(location=(7.4, 8.1, 3.0), rotation=(math.radians(63), 0, math.radians(139)))
    bpy.context.object.name = "curated Sponza gallery camera"
    bpy.context.object.data.lens = 32
    bpy.context.scene.camera = bpy.context.object


def main() -> None:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No meshes imported from {SOURCE}")
    crop_sponza_mesh(meshes[0])
    add_atmosphere()
    for _ in range(3):
        bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_apply=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
