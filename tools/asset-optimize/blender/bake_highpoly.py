"""PRD-05 §6.5 item 3 — high→low bake (Blender LTS headless, Cycles).

    blender --background --python bake_highpoly.py -- <high.glb> <low.glb> <out.glb>

Bakes from the generated high-poly onto the remeshed low-poly:

  - base colour  → <out>_basecolor.png        (DIFFUSE, colour only)
  - normal       → <out>_normal.png           (MikkTSpace, OpenGL +Y — Blender's
                                              default bake space + glTF's +Y convention)
  - AO           → <out>_orm.png              R channel
  - roughness/metal → <out>_orm.png           G/B channels

ORM is packed in-script via a simple image readback (RGB pixels recombined);
cage extrusion = bounds × 0.01 (§6.5) → `extrusion` on the bake call.
"""

import os
import sys

import bpy

BAKE_RES = 2048


def parse_args():
    argv = sys.argv
    idx = argv.index("--") if "--" in argv else len(argv)
    return argv[idx + 1], argv[idx + 2], argv[idx + 3]


def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.context.scene.objects if o not in before and o.type == "MESH"]


def new_image(name, alpha=False):
    img = bpy.data.images.new(name, width=BAKE_RES, height=BAKE_RES, alpha=alpha, float_buffer=False)
    return img


def add_bake_target(mat, img):
    """Create (or reuse) a disconnected image node that marks the bake target."""
    nodes = mat.node_tree.nodes
    node = nodes.get("__bake_target__")
    if node is None:
        node = nodes.new("ShaderNodeTexImage")
        node.name = "__bake_target__"
        node.image = img
    node.image = img
    nodes.active = node


def bake(kind, *, margin=16, extrusion=0.01):
    bpy.ops.object.bake(
        type=kind,
        use_selected_to_active=True,
        cage_extrusion=extrusion,
        margin=margin,
        use_clear=True,
        normal_space="TANGENT",
    )


def cage_extrusion_for(obj):
    """§6.5: cage extrusion = bounds × 0.01."""
    mx = max(obj.dimensions.x, obj.dimensions.y, obj.dimensions.z)
    return max(0.001, mx * 0.01)


def pack_orm(ao_path, rough_path, metal_path, out_path):
    """Combine AO→R, roughness→G, metallic→B into one ORM PNG."""
    ao = bpy.data.images.load(ao_path)
    rough = bpy.data.images.load(rough_path)
    metal = bpy.data.images.load(metal_path)
    orm = bpy.data.images.new(os.path.basename(out_path), width=BAKE_RES, height=BAKE_RES, alpha=False)
    n = BAKE_RES * BAKE_RES * 4
    ao_px, rg_px, mt_px = ao.pixels[:], rough.pixels[:], metal.pixels[:]
    out = [1.0] * n
    for i in range(0, n, 4):
        out[i] = ao_px[i]        # R = AO
        out[i + 1] = rg_px[i]    # G = roughness
        out[i + 2] = mt_px[i]    # B = metallic
        out[i + 3] = 1.0
    orm.pixels.foreach_set(out)
    orm.filepath_raw = out_path
    orm.file_format = "PNG"
    orm.save()


def main():
    high_path, low_path, out_path = parse_args()
    out_dir = os.path.dirname(out_path)
    stem = os.path.splitext(os.path.basename(out_path))[0]

    clean_scene()
    high_objs = import_glb(high_path)
    low_objs = import_glb(low_path)
    if not high_objs or not low_objs:
        raise RuntimeError("bake_highpoly: need ≥1 mesh in both files")

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 64
    bpy.context.scene.render.bake.use_pass_direct = False
    bpy.context.scene.render.bake.use_pass_indirect = False
    bpy.context.scene.render.bake.use_pass_color = True

    targets = {
        "basecolor": os.path.join(out_dir, f"{stem}_basecolor.png"),
        "normal": os.path.join(out_dir, f"{stem}_normal.png"),
        "ao": os.path.join(out_dir, f"{stem}_ao.png"),
        "rough": os.path.join(out_dir, f"{stem}_rough.png"),
        "metal": os.path.join(out_dir, f"{stem}_metal.png"),
    }
    images = {k: new_image(f"{stem}_{k}") for k in targets}

    bpy.ops.object.select_all(action="DESELECT")
    for o in high_objs:
        o.select_set(True)

    for low in low_objs:
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        if not low.data.materials:
            low.data.materials.append(bpy.data.materials.new(name=f"{low.name}_baked"))
        mat = low.data.materials[0]
        mat.use_nodes = True
        cage = cage_extrusion_for(low)

        for key, img in images.items():
            add_bake_target(mat, img)
            kind = {
                "basecolor": "DIFFUSE",
                "normal": "NORMAL",
                "ao": "AO",
                "rough": "ROUGHNESS",
                "metal": "METAL",
            }[key]
            bake(kind, margin=16, extrusion=cage)
            img.filepath_raw = targets[key]
            img.file_format = "PNG"
            img.save()

        low.select_set(False)

    orm_path = os.path.join(out_dir, f"{stem}_orm.png")
    pack_orm(targets["ao"], targets["rough"], targets["metal"], orm_path)

    # Assign baked maps on the low-poly Principled BSDF so the exported GLB is
    # self-contained (base colour + normal + ORM occlusion/rough/metal).
    for low in low_objs:
        mat = low.data.materials[0]
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue

        def img_node(path, non_color=False):
            n = nodes.new("ShaderNodeTexImage")
            n.image = bpy.data.images.load(path)
            if non_color:
                n.image.colorspace_settings.name = "Non-Color"
            return n, n.outputs["Color"]

        bc, bc_out = img_node(targets["basecolor"])
        links.new(bc_out, bsdf.inputs["Base Color"])

        orm_n, orm_out = img_node(orm_path, non_color=True)
        sep = nodes.new("ShaderNodeSeparateColor")
        links.new(orm_out, sep.inputs["Color"])
        links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

        nm_img, _ = img_node(targets["normal"], non_color=True)
        nm = nodes.new("ShaderNodeNormalMap")
        links.new(nm_img.outputs["Color"], nm.inputs["Color"])
        links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

    # Bake only the low-poly scene into the export.
    for o in high_objs:
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
