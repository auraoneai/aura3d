import hashlib
import json
import re
import struct
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "fixtures" / "v8" / "assets" / "vehicles" / "car-concept.glb"
OUT_DIR = ROOT / "fixtures" / "v9" / "assets" / "product-configurator-car-batched"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "car-concept-batched.glb"
MANIFEST = OUT_DIR / "manifest.json"


PRESERVE_SEMANTIC_RE = re.compile(
    r"(Interior|Mechanical|Glass|Windshield|Window|Seat|Dash|Steering|Door|Wheel|Tire|Rim|Brake|Axle|Engine|Mirror|Light|Headlight|Taillight|Turnsignal)",
    re.IGNORECASE,
)
SAFE_BODY_BATCH_RE = re.compile(r"(Paint|Body|Panel|Hood|Roof|Underside|Floor)", re.IGNORECASE)


def rel(path):
    return str(path.relative_to(ROOT))


def file_info(path):
    if not path.exists():
        return {"path": rel(path), "exists": False}
    return {
        "path": rel(path),
        "exists": True,
        "byteSize": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def material_references_texture(value):
    if isinstance(value, dict):
        if isinstance(value.get("index"), int):
            return True
        return any(
            material_references_texture(child) if not key.lower().endswith("texture") else material_references_texture(child)
            for key, child in value.items()
        )
    if isinstance(value, list):
        return any(material_references_texture(child) for child in value)
    return False


def exported_glb_counts(path):
    if not path.exists():
        return {
            "materialCount": 0,
            "textureCount": 0,
            "imageCount": 0,
            "meshCount": 0,
            "nodeCount": 0,
            "textureBackedMaterialCount": 0,
        }
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise RuntimeError(f"{path} is not a GLB file")
    offset = 12
    gltf_json = None
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            gltf_json = json.loads(chunk.rstrip(b"\0").decode("utf-8"))
            break
    if gltf_json is None:
        raise RuntimeError(f"{path} has no JSON chunk")
    materials = gltf_json.get("materials", [])
    textures = gltf_json.get("textures", [])
    images = gltf_json.get("images", [])
    meshes = gltf_json.get("meshes", [])
    nodes = gltf_json.get("nodes", [])
    return {
        "materialCount": len(materials),
        "textureCount": len(textures),
        "imageCount": len(images),
        "meshCount": len(meshes),
        "nodeCount": len(nodes),
        "textureBackedMaterialCount": sum(1 for material in materials if material_references_texture(material)),
    }


def write_manifest(before_mesh_objects, after_mesh_objects):
    source_counts = exported_glb_counts(SOURCE)
    exported = exported_glb_counts(OUT)
    mesh_join_delta = max(0, before_mesh_objects - after_mesh_objects)
    manifest = {
        "id": "product-configurator-car-batched",
        "routeUse": "product-configurator",
        "routeLinkage": {
            "routeId": "product-configurator",
            "app": "apps/v9-advanced-examples-gallery",
            "catalogAssetId": "product-configurator-car-batched",
            "runtimeRole": "optimization experiment and support evidence only; not current source-of-truth hero",
        },
        "source": {
            "sourceScript": "tools/v9-advanced-gallery-assets/optimize-product-car-blender.py",
            "generator": "Blender Python GLB optimization script",
            "inputAssets": [rel(SOURCE)],
            "derivativeOfExternalAsset": True,
            "usesExternalTextures": True,
            "sourceAsset": file_info(SOURCE),
        },
        "outputs": {
            "glb": file_info(OUT),
            "manifest": {"path": rel(MANIFEST)},
        },
        "generator": "tools/v9-advanced-gallery-assets/optimize-product-car-blender.py",
        "asset": rel(OUT),
        "status": {
            "generated": True,
            "stub": False,
            "derivative": True,
            "textureBacked": exported["textureBackedMaterialCount"] > 0,
            "generatedNoTexture": False,
            "supportOnly": True,
            "acceptableAsFocalHero": False,
            "acceptedAsOriginalHeroReplacement": False,
            "visualReviewAccepted": False,
        },
        "intendedRole": "Optional derivative optimization of the original texture-backed car-concept GLB for draw-call experiments. The original fixture remains the Product Configurator source-of-truth hero.",
        "acceptanceBoundary": "This derivative cannot replace fixtures/v8/assets/vehicles/car-concept.glb as Product hero evidence unless material/texture/node/extension equivalence and current human visual review both pass.",
        "batching": {
            "strategy": "Join compatible non-semantic static meshes by material signature while preserving semantic interior, glass, wheel, tire, light, mirror, brake, axle, engine, and hardware meshes.",
            "beforeMeshObjects": before_mesh_objects,
            "afterMeshObjects": after_mesh_objects,
            "joinedMeshObjectDelta": mesh_join_delta,
            "preserveSemanticPattern": PRESERVE_SEMANTIC_RE.pattern,
            "safeBodyBatchPattern": SAFE_BODY_BATCH_RE.pattern,
        },
        "counts": {
            "sourceMaterials": source_counts["materialCount"],
            "sourceTextures": source_counts["textureCount"],
            "sourceImages": source_counts["imageCount"],
            "sourceMeshes": source_counts["meshCount"],
            "sourceNodes": source_counts["nodeCount"],
            "sourceTextureBackedMaterials": source_counts["textureBackedMaterialCount"],
            "exportedMaterials": exported["materialCount"],
            "exportedTextures": exported["textureCount"],
            "exportedImages": exported["imageCount"],
            "exportedMeshes": exported["meshCount"],
            "exportedNodes": exported["nodeCount"],
            "exportedTextureBackedMaterials": exported["textureBackedMaterialCount"],
        },
        "sourceGlb": source_counts,
        "exportedGlb": exported,
        "supportTruth": {
            "role": "support-only derivative",
            "reason": "Generated optimization derivative of the original car. It preserves texture-backed material evidence but changes mesh/node topology and is not accepted as the Product source hero.",
            "cannotReplace": [
                "fixtures/v8/assets/vehicles/car-concept.glb",
                "source GLB node/topology evidence",
                "accepted current-route visual-review screenshots",
                "complete imported material/variant/picking semantics",
            ],
        },
        "limitations": [
            "Derivative GLB produced through Blender import/export.",
            "Mesh and node topology differ from the source car-concept GLB.",
            "No configurator semantics are added by this derivative.",
            "No imported triangle/raycast picking proof.",
            "No Product acceptance without current screenshot review and equivalence diagnostics.",
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {MANIFEST}")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def material_key(obj):
    if obj.type != "MESH" or not obj.data.materials:
        return None
    material_names = tuple(material.name if material else "none" for material in obj.data.materials)
    return material_names


def parent_path(obj):
    names = []
    parent = obj.parent
    while parent is not None:
        names.append(parent.name)
        parent = parent.parent
    return tuple(reversed(names))


def batch_key(obj):
    key = material_key(obj)
    if key is None:
        return None
    semantic_label = f"{obj.name} {' '.join(key)}"
    if PRESERVE_SEMANTIC_RE.search(semantic_label):
        return None
    if not SAFE_BODY_BATCH_RE.search(semantic_label):
        return None
    return key, parent_path(obj)


def apply_mesh_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for modifier in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except RuntimeError:
            pass
    obj.select_set(False)


def batch_meshes_by_material_signature():
    groups = {}
    preserved = 0
    for obj in list(bpy.context.scene.objects):
        key = batch_key(obj)
        if key is None:
            if obj.type == "MESH":
                preserved += 1
            continue
        groups.setdefault(key, []).append(obj)

    batched = 0
    for index, ((materials, _parents), objects) in enumerate(groups.items()):
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            apply_mesh_modifiers(obj)
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        material_label = "-".join(materials[:2])[:64].replace(" ", "_")
        joined.name = f"batched-car-{index:02d}-{material_label}"
        batched += len(objects) - 1
    print(f"product-configurator-car-batched: preserved semantic meshes={preserved} joined meshes removed={batched}")


def main():
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    before = len([obj for obj in bpy.context.scene.objects if obj.type == "MESH"])
    batch_meshes_by_material_signature()
    after = len([obj for obj in bpy.context.scene.objects if obj.type == "MESH"])
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_apply=True)
    print(f"product-configurator-car-batched: meshObjects {before} -> {after} out={OUT}")
    write_manifest(before, after)


main()
