"""Build V10 modeled combat projectiles from the selected Quaternius CC0 family."""

from pathlib import Path
import hashlib
import importlib.util
import bpy


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art-review" / "external-source" / "quaternius" / "essentials"
OUT = ROOT / "art-review" / "assets" / "quaternius-v10"
OUT.mkdir(parents=True, exist_ok=True)

helper_path = Path(__file__).with_name("build-high-fidelity-v5.py")
spec = importlib.util.spec_from_file_location("pulse_v5_helpers", helper_path)
helper = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(helper)


def build(source_name: str, output_name: str) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / source_name), import_pack_images=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / output_name),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_image_format="AUTO",
        export_materials="EXPORT",
    )
    helper.canonicalize_glb(OUT / output_name)


if __name__ == "__main__":
    build("Prop_Grenade.gltf", "pulseQuaterniusLanceV10.candidate.glb")
    build("Prop_Mine.gltf", "pulseQuaterniusCutterV10.candidate.glb")
    for path in sorted(OUT.glob("*.glb")):
        print(hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_size, path.name)
