"""Build an isolated Pulse audition from one coherent Quaternius CC0 family."""

from pathlib import Path
import importlib.util
import math
import bpy


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art-review" / "external-source" / "quaternius"
OUT = ROOT / "art-review" / "assets" / "quaternius-v9"
OUT.mkdir(parents=True, exist_ok=True)

helper_path = Path(__file__).with_name("build-high-fidelity-v5.py")
spec = importlib.util.spec_from_file_location("pulse_v5_helpers", helper_path)
helper = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(helper)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_gltf(path, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path), import_pack_images=True)
    imported = set(bpy.context.scene.objects) - before
    roots = [obj for obj in imported if obj.parent not in imported]
    for root in roots:
        root.location.x += location[0]
        root.location.y += location[1]
        root.location.z += location[2]
        root.rotation_euler.rotate_axis("X", rotation[0])
        root.rotation_euler.rotate_axis("Y", rotation[1])
        root.rotation_euler.rotate_axis("Z", rotation[2])
        root.scale.x *= scale[0]
        root.scale.y *= scale[1]
        root.scale.z *= scale[2]
    return imported


def export(filename):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / filename),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_image_format="AUTO",
        export_materials="EXPORT",
    )
    helper.canonicalize_glb(OUT / filename)


def build_runner():
    reset()
    import_gltf(SOURCE / "essentials" / "Enemy_EyeDrone.gltf")
    export("pulseQuaterniusEyeRunnerV9.candidate.glb")


def build_warden():
    reset()
    import_gltf(SOURCE / "megakit" / "Alien_Scolitex.gltf")
    export("pulseQuaterniusScolitexWardenV9.candidate.glb")


def build_world():
    reset()
    kit = SOURCE / "megakit"
    # Six textured floor modules establish a continuous exchange runway.
    for row, z in enumerate((2.0, -2.0, -6.0, -10.0)):
        for side, x in enumerate((-2.0, 2.0)):
            import_gltf(kit / "Platform_DarkPlates.gltf", (x, 0, z))
    # Real textured wall modules frame the whole lane, not repeated bare ribs.
    for z in (1.8, -2.0, -5.8, -9.6):
        import_gltf(kit / "WallAstra_Straight.gltf", (-4.0, 0, z), (0, math.pi / 2, 0))
        import_gltf(kit / "WallAstra_Straight.gltf", (4.0, 0, z), (0, -math.pi / 2, 0))
    for z in (-1.1, -5.0, -8.9):
        import_gltf(kit / "Column_Pipes.gltf", (-3.45, 0, z))
        import_gltf(kit / "Column_Pipes.gltf", (3.45, 0, z), (0, math.pi, 0))
    import_gltf(kit / "Door_Frame_A.gltf", (0, 0, -11.4), (0, math.pi, 0), (1.65, 1.65, 1.65))
    export("pulseQuaterniusReactorArenaV9.candidate.glb")


if __name__ == "__main__":
    build_runner()
    build_warden()
    build_world()
    for path in sorted(OUT.glob("*.glb")):
        import hashlib
        print(hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_size, path.name)
