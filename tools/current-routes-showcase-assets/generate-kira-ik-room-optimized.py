from __future__ import annotations

from math import radians
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "fixtures/v8/assets/showcase/kira-ik-room.glb"
DESTINATION = ROOT / "fixtures/v8/assets/showcase/kira-ik-room-animated.glb"


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.armatures,
        bpy.data.actions,
    ):
        for item in list(block):
            block.remove(item)


def optimize_images(max_size: int = 2048) -> None:
    for image in bpy.data.images:
        if image.name in {"Render Result", "Viewer Node"}:
            continue
        width, height = image.size
        if width <= max_size and height <= max_size:
            continue
        aspect = width / max(1, height)
        if width >= height:
            new_width = max_size
            new_height = max(1, round(max_size / aspect))
        else:
            new_height = max_size
            new_width = max(1, round(max_size * aspect))
        image.scale(new_width, new_height)


def find_kira_armature() -> bpy.types.Object:
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE" and obj.name.startswith("Kira"):
            return obj
    raise RuntimeError("Kira armature was not found after GLB import.")


def set_pose(
    armature: bpy.types.Object,
    frame: int,
    *,
    spine: tuple[float, float, float],
    head: tuple[float, float, float],
    clavicle: tuple[float, float, float],
    upperarm: tuple[float, float, float],
    lowerarm: tuple[float, float, float],
    hand: tuple[float, float, float],
) -> None:
    bpy.context.scene.frame_set(frame)
    values = {
        "spine_03": spine,
        "head": head,
        "Clavicle_l": clavicle,
        "Upperarm_l": upperarm,
        "lowerarm_l": lowerarm,
        "hand_l": hand,
    }
    for name, euler in values.items():
        bone = armature.pose.bones.get(name)
        if bone is None:
            raise RuntimeError(f"Expected Kira pose bone {name!r} was not found.")
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = tuple(radians(value) for value in euler)
        bone.keyframe_insert(data_path="rotation_euler", frame=frame)
    armature.keyframe_insert(data_path="location", frame=frame)


def add_demo_animation(armature: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 96
    bpy.context.scene.render.fps = 24

    # A small authored loop: torso breathing, head attention, and a visible left-arm
    # reaching gesture. The source fixture has skin data but no clips, so this route
    # copy adds a real GLB animation clip without modifying the original asset.
    poses = [
        (1, (0, 0, 0), (0, 0, 0), (0, 0, 0), (4, 0, -8), (-10, 0, 0), (0, 0, 0)),
        (16, (2, -2, 1), (-3, 8, 1), (0, 0, -8), (-18, -8, -42), (-42, 2, 8), (0, 8, -10)),
        (32, (3, -4, 2), (-2, 12, 2), (0, 0, -12), (-32, -12, -66), (-58, 5, 14), (0, 18, -18)),
        (48, (0, 2, -1), (2, -7, -1), (0, 0, -6), (-12, 4, -34), (-36, -4, 4), (0, -10, 12)),
        (64, (-2, 3, -1), (3, -11, -2), (0, 0, -10), (-24, 10, -56), (-52, -8, 10), (0, -20, 20)),
        (80, (1, -1, 1), (-1, 5, 1), (0, 0, -7), (-14, -2, -36), (-38, 2, 6), (0, 8, -8)),
        (96, (0, 0, 0), (0, 0, 0), (0, 0, 0), (4, 0, -8), (-10, 0, 0), (0, 0, 0)),
    ]
    for frame, spine, head, clavicle, upperarm, lowerarm, hand in poses:
        set_pose(
            armature,
            frame,
            spine=spine,
            head=head,
            clavicle=clavicle,
            upperarm=upperarm,
            lowerarm=lowerarm,
            hand=hand,
        )

    if armature.animation_data and armature.animation_data.action:
        armature.animation_data.action.name = "Kira_Attention_Reach"


def configure_materials() -> None:
    for material in bpy.data.materials:
        if "Sphere" in material.name or material.name.lower() in {"white", "default"}:
            material.use_nodes = True
            bsdf = material.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Alpha"].default_value = 0.22
                bsdf.inputs["Metallic"].default_value = 0.0
                bsdf.inputs["Roughness"].default_value = 0.08
                bsdf.inputs["Base Color"].default_value = (0.15, 0.78, 1.0, 0.22)
            material.blend_method = "BLEND"
            material.use_screen_refraction = True


def main() -> None:
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    optimize_images()
    armature = find_kira_armature()
    add_demo_animation(armature)
    configure_materials()
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(DESTINATION),
        export_format="GLB",
        export_animations=True,
        export_frame_range=True,
        export_current_frame=False,
        export_draco_mesh_compression_enable=False,
        export_image_format="AUTO",
    )
    print(f"Exported {DESTINATION}")


if __name__ == "__main__":
    main()
