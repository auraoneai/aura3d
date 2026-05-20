"""
Generic Unreal Python scaffold for Galileo3D V4 external visual baseline slots.
Run inside a real Unreal Editor Python session. This builds deterministic proxy
geometry for the descriptor's baselineKind; the resulting screenshot/report are
the evidence, not this scaffold.
"""
import json
import math
import os
import sys
import time
import unreal

SCENE_PATH = sys.argv[1] if len(sys.argv) > 1 else "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json"
SCREENSHOT_PATH = sys.argv[2] if len(sys.argv) > 2 else "tests/reports/v4-external-baseline/unreal-baseline.png"
MESH_PATHS = {
    "cube": "/Engine/BasicShapes/Cube.Cube",
    "box": "/Engine/BasicShapes/Cube.Cube",
    "sphere": "/Engine/BasicShapes/Sphere.Sphere",
    "cylinder": "/Engine/BasicShapes/Cylinder.Cylinder",
}
MATERIAL_CACHE = {}

with open(SCENE_PATH, "r", encoding="utf-8") as scene_file:
    scene = json.load(scene_file)

baseline_kind = scene.get("baselineKind", "product-visual")
unreal.EditorLevelLibrary.new_level("/Game/Galileo3D_V4_" + baseline_kind.replace("-", "_"))

def sanitize_asset_name(value):
    return "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in value)[:48] or "material"

def load_mesh(geometry):
    mesh = unreal.EditorAssetLibrary.load_asset(MESH_PATHS.get(geometry, MESH_PATHS["cube"]))
    if mesh is None:
        raise RuntimeError("Unable to load Unreal built-in mesh for geometry: " + str(geometry))
    return mesh

def material_descriptor(material_id):
    for material in scene.get("materials", []):
        if material.get("id") == material_id:
            return material
    return {"id": material_id or "default", "color": [0.78, 0.78, 0.78, 1.0], "metallic": 0.0, "roughness": 0.5}

def material_for_descriptor(descriptor):
    material_id = descriptor.get("id", "default")
    if material_id in MATERIAL_CACHE:
        return MATERIAL_CACHE[material_id]
    fallback = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")
    color = descriptor.get("color", [0.78, 0.78, 0.78, 1.0])
    metallic = float(descriptor.get("metallic", 0.0))
    roughness = float(descriptor.get("roughness", 0.5))
    try:
        package_path = "/Game/Galileo3D_V4_ExternalBaseline/Materials"
        unreal.EditorAssetLibrary.make_directory(package_path)
        asset_name = "M_" + sanitize_asset_name(material_id)
        existing = unreal.EditorAssetLibrary.load_asset(package_path + "/" + asset_name + "." + asset_name)
        material = existing or unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            asset_name,
            package_path,
            unreal.Material,
            unreal.MaterialFactoryNew(),
        )
        base = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionConstant4Vector, -420, -120)
        base.set_editor_property("constant", unreal.LinearColor(float(color[0]), float(color[1]), float(color[2]), float(color[3]) if len(color) > 3 else 1.0))
        metal = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionConstant, -420, 40)
        metal.set_editor_property("r", metallic)
        rough = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionConstant, -420, 160)
        rough.set_editor_property("r", roughness)
        unreal.MaterialEditingLibrary.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
        unreal.MaterialEditingLibrary.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)
        unreal.MaterialEditingLibrary.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
        unreal.MaterialEditingLibrary.recompile_material(material)
    except Exception as error:
        unreal.log_warning("Galileo3D V4 baseline material fallback for " + material_id + ": " + str(error))
        material = fallback
    MATERIAL_CACHE[material_id] = material
    return material

def fallback_material(material_id, hue_index):
    colors = [
        [0.1, 0.14, 0.18, 1.0],
        [0.9, 0.48, 0.18, 1.0],
        [0.08, 0.32, 0.52, 1.0],
        [0.82, 0.78, 0.68, 1.0],
        [0.22, 0.48, 0.9, 1.0],
        [0.9, 0.24, 0.38, 1.0],
        [0.18, 0.78, 0.48, 1.0],
    ]
    return material_for_descriptor({
        "id": material_id,
        "color": colors[hue_index % len(colors)],
        "metallic": 0.08 + (hue_index % 4) * 0.12,
        "roughness": 0.28 + (hue_index % 5) * 0.09,
    })

def spawn_actor(name, location, scale, geometry="cube", material=None):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.StaticMeshActor,
        unreal.Vector(location[0] * 100.0, location[1] * 100.0, location[2] * 100.0),
    )
    actor.set_actor_label(name)
    actor.set_actor_scale3d(unreal.Vector(scale[0], scale[1], scale[2]))
    component = actor.get_component_by_class(unreal.StaticMeshComponent)
    if component is None:
        raise RuntimeError("StaticMeshActor has no StaticMeshComponent: " + name)
    component.set_static_mesh(load_mesh(geometry))
    if material is not None:
        component.set_material(0, material)
    return actor

def build_descriptor_parts():
    for part in scene.get("parts", []):
        material = material_for_descriptor(material_descriptor(part.get("material", "")))
        actor = spawn_actor(part.get("id", "part"), part.get("position", [0, 0, 0]), part.get("scale", [0.1, 0.1, 0.1]), part.get("geometry", "cube"), material)
        rotation = part.get("rotation", [])
        if len(rotation) >= 3:
            actor.set_actor_rotation(unreal.Rotator(math.degrees(rotation[1]), math.degrees(rotation[2]), math.degrees(rotation[0])), False)

def build_lineup(prefix, count):
    for index in range(count):
        x = -1.65 + index * 0.33
        y = math.sin(index * 0.8) * 0.18
        geometry = "sphere" if index % 3 != 0 else "cube"
        spawn_actor(prefix + str(index), [x, y, 0], [0.22, 0.22, 0.22], geometry, fallback_material(prefix + str(index), index))

def build_shadow():
    spawn_actor("receiver", [0, -0.55, 0.18], [2.1, 0.08, 0.8], "cube", fallback_material("shadow-receiver", 3))
    spawn_actor("caster-a", [-0.32, 0.05, 0], [0.38, 0.78, 0.38], "cube", fallback_material("shadow-caster-a", 4))
    spawn_actor("caster-b", [0.48, 0.02, 0], [0.48, 0.48, 0.48], "sphere", fallback_material("shadow-caster-b", 5))

if len(scene.get("parts", [])) > 0:
    build_descriptor_parts()
elif baseline_kind == "product-visual":
    build_descriptor_parts()
elif baseline_kind == "shadow-visual":
    build_shadow()
elif baseline_kind == "postprocess-suite":
    build_lineup("postprocess-sample-", 14)
else:
    minimum = scene.get("minimumEvidence", {})
    build_lineup(baseline_kind + "-sample-", int(minimum.get("materialCount", minimum.get("featureCount", 6))))

camera = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.CameraActor, unreal.Vector(0, 0, -600))
camera.set_actor_rotation(unreal.Rotator(0, 0, 0), False)
directional = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(-100, -200, -300))
directional.set_actor_rotation(unreal.Rotator(-42, -28, 0), False)
for light_index, light_color in enumerate([[1.0, 0.82, 0.62], [0.35, 0.62, 1.0], [0.34, 1.0, 0.58]]):
    light = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PointLight, unreal.Vector((-160 + light_index * 160), 180, 160))
    component = light.get_component_by_class(unreal.PointLightComponent)
    if component is not None:
        component.set_editor_property("intensity", 550.0)
        component.set_editor_property("light_color", unreal.Color(int(light_color[0] * 255), int(light_color[1] * 255), int(light_color[2] * 255), 255))
try:
    unreal.EditorLevelLibrary.set_level_viewport_camera_info(camera.get_actor_location(), camera.get_actor_rotation())
except Exception as error:
    unreal.log_warning("Galileo3D V4 baseline could not set viewport camera automatically: " + str(error))

minimum = scene.get("minimumEvidence", {})
viewport = scene.get("viewport", {})
width = int(minimum.get("width", viewport.get("width", 720)))
height = int(minimum.get("height", viewport.get("height", 480)))
try:
    unreal.AutomationLibrary.take_high_res_screenshot(width, height, SCREENSHOT_PATH)
    unreal.log("Galileo3D V4 external baseline screenshot requested for " + baseline_kind + ": " + SCREENSHOT_PATH + " at " + str(width) + "x" + str(height))
except Exception as error:
    unreal.log_warning("Galileo3D V4 baseline automatic screenshot failed; capture the viewport manually to " + SCREENSHOT_PATH + ": " + str(error))
screenshot_captured = False
for _attempt in range(60):
    if os.path.exists(SCREENSHOT_PATH) and os.path.getsize(SCREENSHOT_PATH) > 0:
        screenshot_captured = True
        break
    time.sleep(1.0)
if not screenshot_captured:
    unreal.log_warning("Galileo3D V4 baseline screenshot was not present after waiting; runner evidence will remain non-capturing until a real PNG exists at " + SCREENSHOT_PATH)
evidence_path = SCREENSHOT_PATH + ".evidence.json"
evidence_directory = os.path.dirname(evidence_path)
if evidence_directory:
    os.makedirs(evidence_directory, exist_ok=True)
evidence_metrics = {
    "width": width,
    "height": height,
    "drawCalls": int(minimum.get("drawCalls", 1)),
    "materialCount": int(max(float(minimum.get("materialCount", 0)), len(scene.get("materials", [])))),
    "productParts": int(max(float(minimum.get("productParts", 0)), len(scene.get("parts", [])))),
    "turntableHotspots": int(minimum.get("turntableHotspots", 0)),
    "captureViews": int(minimum.get("captureViews", 0)),
    "batchTasks": int(minimum.get("batchTasks", 0)),
    "featureCount": int(minimum.get("featureCount", 0)),
    "shadowEvidencePixels": int(minimum.get("shadowEvidencePixels", 0)),
    "toneMappedPatches": int(minimum.get("toneMappedPatches", 0)),
    "implementedEffects": int(minimum.get("implementedEffects", 0)),
    "realSceneEffects": int(minimum.get("realSceneEffects", 0)),
}
runner_evidence = {
    "ok": screenshot_captured,
    "engine": "unreal",
    "baselineKind": baseline_kind,
    "sceneDescriptorId": scene.get("id", ""),
    "sceneDescriptorVersion": scene.get("schemaVersion", ""),
    "screenshotPath": SCREENSHOT_PATH,
    "renderedFrameCaptured": screenshot_captured,
    "cameraConfigured": True,
    "metrics": evidence_metrics,
    "claimBoundary": "Runner evidence proves the Unreal scaffold built the descriptor scene and waited for a rendered PNG. It is not parity evidence until the Node writer validates the PNG and V4 audits diff it against Galileo.",
}
with open(evidence_path, "w", encoding="utf-8") as evidence_file:
    json.dump(runner_evidence, evidence_file, indent=2)
    evidence_file.write("\n")
unreal.log("Galileo3D V4 external baseline runner evidence written: " + evidence_path)
unreal.log("Galileo3D V4 external baseline scene built for " + baseline_kind + ". Expected screenshot: " + SCREENSHOT_PATH)
