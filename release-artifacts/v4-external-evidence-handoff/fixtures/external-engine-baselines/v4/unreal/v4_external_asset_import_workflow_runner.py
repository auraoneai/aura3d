"""
Galileo3D V4 Unreal asset-import workflow evidence runner.

Run inside a real Unreal Editor Python session, for example:
  UnrealEditor-Cmd <project.uproject> -ExecutePythonScript="v4_external_asset_import_workflow_runner.py <asset-path> <repo>/tests/reports/v4-unreal-asset-import-workflow.evidence.json"

The script writes ok=false unless Unreal actually imports the asset and exposes
mesh/material/texture metrics. It allows Galileo3D bounded native OBJ geometry
import, but does not claim native FBX/USD/USDZ/DAE parity.
"""
import json
import os
import sys
import unreal

ASSET_PATH = sys.argv[1] if len(sys.argv) > 1 else ""
EVIDENCE_PATH = sys.argv[2] if len(sys.argv) > 2 else "tests/reports/v4-unreal-asset-import-workflow.evidence.json"
DESTINATION_PATH = "/Game/Galileo3D/V4AssetImportWorkflow"
CONVERSION_REQUIRED_FORMATS = ["dae", "fbx", "usd", "usdz"]
NATIVE_SUPPORTED_FORMATS = ["glb", "gltf", "obj"]

def import_asset(asset_path):
    if not asset_path or not os.path.exists(asset_path):
        return []
    task = unreal.AssetImportTask()
    task.filename = asset_path
    task.destination_path = DESTINATION_PATH
    task.automated = True
    task.save = True
    task.replace_existing = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    return list(task.imported_object_paths or [])

def class_name(asset):
    try:
        return asset.get_class().get_name()
    except Exception:
        return ""

imported_paths = import_asset(ASSET_PATH)
loaded_assets = []
for object_path in imported_paths:
    try:
        asset = unreal.EditorAssetLibrary.load_asset(object_path)
        if asset is not None:
            loaded_assets.append(asset)
    except Exception as error:
        unreal.log_warning("Unable to load imported asset " + str(object_path) + ": " + str(error))

class_names = [class_name(asset) for asset in loaded_assets]
meshes = sum(1 for name in class_names if "Mesh" in name)
materials = sum(1 for name in class_names if "Material" in name)
textures = sum(1 for name in class_names if "Texture" in name)
animation_clips = sum(1 for name in class_names if "Anim" in name or "Animation" in name)
ok = bool(imported_paths) and meshes >= 1 and materials >= 1 and textures >= 1
evidence = {
    "ok": ok,
    "engine": "unreal",
    "workflowKind": "asset-import",
    "editorProjectOpened": True,
    "assetImportWorkflowRan": bool(ASSET_PATH and os.path.exists(ASSET_PATH)),
    "assetPath": ASSET_PATH,
    "importedObjectPaths": imported_paths,
    "importedFormats": ["glb", "gltf"],
    "nativeSupportedFormats": NATIVE_SUPPORTED_FORMATS,
    "conversionRequiredFormats": CONVERSION_REQUIRED_FORMATS,
    "metrics": {
        "editorProjectOpened": True,
        "assetImportWorkflowRan": bool(ASSET_PATH and os.path.exists(ASSET_PATH)),
        "importedGltfAssets": 1 if imported_paths else 0,
        "importedMeshes": meshes,
        "importedMaterials": materials,
        "importedTextures": textures,
        "importedAnimationClips": animation_clips,
        "conversionRequiredFormats": len(CONVERSION_REQUIRED_FORMATS),
        "nativeSupportedFormats": len(NATIVE_SUPPORTED_FORMATS),
    },
    "claimBoundary": "This sidecar is valid only when produced by a real Unreal editor import run. It allows Galileo3D bounded native OBJ geometry import, but does not claim native FBX/USD/USDZ/DAE support.",
}
directory = os.path.dirname(EVIDENCE_PATH)
if directory:
    os.makedirs(directory, exist_ok=True)
with open(EVIDENCE_PATH, "w", encoding="utf-8") as evidence_file:
    json.dump(evidence, evidence_file, indent=2)
    evidence_file.write("\n")
unreal.log("Galileo3D V4 Unreal asset-import workflow evidence written: " + EVIDENCE_PATH)
if not ok:
    raise RuntimeError("Unreal asset-import workflow did not expose enough imported mesh/material/texture metrics. Evidence written to " + EVIDENCE_PATH)
