"""PRD-05 §6.5 — QuadriFlow remesh for generated assets (Blender LTS headless).

Runs inside Blender:

    blender --background --python remesh_quadriflow.py -- <in.glb> <out.glb> [--target-faces N]

Steps (§6.5 items 1, 2, 4):
  1. Import the generated GLB, join its meshes.
  2. `object.quadriflow_remesh(target_faces=...)` to the profile target.
  3. UVs: try transferring the provider UVs onto the remeshed topology via a
     data-transfer modifier against a hidden copy of the source; fall back to
     Smart UV project (4 px margin per 1024 = 0.00390625 island_margin) when
     the source has no UVs or the transfer leaves them empty.
  4. Export the remeshed mesh as GLB (normals: export smooth shading;
     QuadriFlow output is manifold so doubleSided is cleared by the TS side).
"""

import sys

import bpy


def parse_args():
    argv = sys.argv
    idx = argv.index("--") if "--" in argv else len(argv)
    args = argv[idx + 1:]
    in_path, out_path = args[0], args[1]
    target = 25000
    if "--target-faces" in args:
        target = int(args[args.index("--target-faces") + 1])
    return in_path, out_path, target


def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def join_meshes(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def has_uv_layer(obj):
    return len(obj.data.uv_layers) > 0


def transfer_uvs(source_obj, target_obj):
    """Data-transfer UV loops from source onto the remeshed target."""
    mod = target_obj.modifiers.new(name="uv_xfer", type="DATA_TRANSFER")
    mod.object = source_obj
    mod.use_loop_data = True
    mod.data_types_loops = {"UV"}
    mod.loop_mapping = "POLYINTERP_NEAREST"
    bpy.context.view_layer.objects.active = target_obj
    bpy.ops.object.datalayout_transfer(modifier="uv_xfer")
    bpy.ops.object.modifier_apply(modifier="uv_xfer")


def smart_uv(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # 4 px margin per 1024 (§6.5 item 2): island_margin is normalized → 4/1024.
    bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=4.0 / 1024.0, area_weight=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def main():
    in_path, out_path, target = parse_args()
    clean_scene()
    objs = import_glb(in_path)
    if not objs:
        raise RuntimeError(f"no meshes in {in_path}")
    src = join_meshes(objs)

    # Keep a hidden duplicate for UV transfer.
    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.duplicate()
    source_copy = bpy.context.view_layer.objects.active
    source_copy.hide_render = True
    source_copy.hide_viewport = True

    bpy.context.view_layer.objects.active = src
    src.select_set(True)
    bpy.ops.object.quadriflow_remesh(
        use_target_faces=True,
        target_faces=target,
        preserve_sharp=True,
        preserve_boundary=True,
        adaptive_scale=0.0,
        use_mesh_symmetry=False,
    )

    # §6.5 item 2 — provider UVs via transfer when the source had them.
    if has_uv_layer(source_copy):
        try:
            transfer_uvs(source_copy, src)
        except RuntimeError:
            pass
    if not has_uv_layer(src):
        smart_uv(src)

    # Delete the transfer copy + anything hidden before export.
    for o in list(bpy.context.scene.objects):
        if o.hide_viewport or o.hide_render:
            bpy.data.objects.remove(o, do_unlink=True)

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_skins=True,
        export_morph=True,
    )


main()
