#!/usr/bin/env python3
"""Build Rooftop Buckets' release-candidate athlete and venue assets.

The previous Rooftop Buckets pass used route-authored box/cylinder mannequins.
This producer starts from a license-clean, textured, skinned ``Man Player``
GLB and authors basketball-specific clips on its real 102-joint skeleton.  It
also emits the court/venue asset with a physical court slab, outside-bounds
bleachers, railings, banners, flood bars, and spectator seating.  The hoop,
backboard, ball, and all gameplay regions remain route-owned and are not baked
into the venue asset.

This is route-local art production; registration and rendered probes are kept
in the normal Aura3D CLI/evidence pipeline.  No route gameplay or ballistics
are authored here.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Matrix


APP_DIR = Path(__file__).resolve().parent.parent
OUT_DIR = APP_DIR / "assets" / "models"
SOURCE = APP_DIR / ".candidate-assets" / "acquisition-2026-08-31" / "objaverse-4c7133dbb06e4136891d59231372d818" / "man-player.glb"


def clear() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.materials,
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.actions,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for item in list(collection):
            collection.remove(item)


def imported_source() -> bpy.types.Object:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one source armature, found {len(armatures)}")
    armature = armatures[0]
    # The downloaded scene contains an authoring cube, an icosphere proxy,
    # camera, and light.  They are not part of the player and must not leak
    # into the release asset.
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"} or obj.name in {"Cube", "Icosphere"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    # The Sketchfab FBX wrapper carries a 0.01 import scale. Blender bakes
    # that scale into mesh data on export while retaining the wrapper, which
    # would make the release GLB another 100x too small. Bake the factor into
    # the source geometry and skeleton, then clear the wrapper scale so the
    # exported skin and its clips retain the source's metre-scale 1.8 m bounds
    # and do not need a route-side scale hack.
    wrapper = bpy.data.objects.get("player.fbx")
    if wrapper is not None:
        wrapper.scale = (1.0, 1.0, 1.0)
    bake_scale = Matrix.Scale(0.01, 4)
    armature.data.transform(bake_scale)
    for mesh in [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]:
        mesh.data.transform(bake_scale)
    armature.scale = (1.0, 1.0, 1.0)
    return armature


def multiply_tint(source: bpy.types.Material, name: str, tint: tuple[float, float, float, float]) -> bpy.types.Material:
    """Duplicate a textured material while retaining its texture/normal chain.

    The source shirt and shorts use image textures on the Principled Base Color
    input.  Inserting a multiply node keeps folds, seams, and texture detail,
    while making the two route athletes unmistakably different teams.
    """

    mat = source.copy()
    mat.name = name
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return mat
    base = bsdf.inputs.get("Base Color")
    if base is None:
        return mat
    links = list(base.links)
    if links:
        source_socket = links[0].from_socket
        for link in links:
            tree.links.remove(link)
        mix = tree.nodes.new("ShaderNodeMixRGB")
        mix.name = "Rooftop team tint"
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 1.0
        mix.inputs[1].default_value = (1.0, 1.0, 1.0, 1.0)
        mix.inputs[2].default_value = tint
        tree.links.new(source_socket, mix.inputs[1])
        tree.links.new(mix.outputs[0], base)
    else:
        base.default_value = tint
    return mat


def replace_materials(armature: bpy.types.Object, role: str) -> None:
    shooter = role == "shooter"
    shirt_tint = (0.08, 0.62, 0.74, 1.0) if shooter else (0.72, 0.075, 0.10, 1.0)
    shorts_tint = (0.08, 0.12, 0.18, 1.0) if shooter else (0.18, 0.025, 0.035, 1.0)
    boot_tint = (0.76, 0.89, 0.92, 1.0) if shooter else (0.12, 0.14, 0.18, 1.0)
    team_prefix = "Rooftop teal" if shooter else "Rooftop crimson"
    for mesh in [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]:
        slots = list(mesh.material_slots)
        for slot in slots:
            material = slot.material
            if material is None:
                continue
            if material.name == "T_shirt":
                slot.material = multiply_tint(material, f"{team_prefix} jersey", shirt_tint)
            elif material.name == "Classic_Shorts":
                slot.material = multiply_tint(material, f"{team_prefix} shorts", shorts_tint)
            elif material.name == "Boots":
                slot.material = multiply_tint(material, f"{team_prefix} court shoes", boot_tint)


def bone(armature: bpy.types.Object, name: str) -> bpy.types.PoseBone | None:
    return armature.pose.bones.get(name)


def set_bone_rotation(armature: bpy.types.Object, name: str, value: tuple[float, float, float]) -> None:
    target = bone(armature, name)
    if target is None:
        return
    target.rotation_mode = "XYZ"
    target.rotation_euler = value


def clear_pose(armature: bpy.types.Object) -> None:
    for target in armature.pose.bones:
        target.rotation_mode = "XYZ"
        target.rotation_euler = (0.0, 0.0, 0.0)
        target.scale = (1.0, 1.0, 1.0)


def authored_clip(armature: bpy.types.Object, name: str, poses: list[tuple[int, dict[str, tuple[float, float, float]]]]) -> bpy.types.Action:
    action = bpy.data.actions.new(name)
    action.frame_start = 1
    action.frame_end = 24
    armature.animation_data_create()
    armature.animation_data.action = action
    # Key every bone at the first frame so no source action or imported pose
    # can leak into the release clip.  Subsequent frames key the named
    # basketball pose, yielding a genuine skinned deformation rather than a
    # route-level scale/rotation imitation.
    clear_pose(armature)
    bpy.context.scene.frame_set(1)
    for target in armature.pose.bones:
        target.keyframe_insert(data_path="rotation_euler", frame=1, group=target.name)
    for frame, pose in poses:
        clear_pose(armature)
        for bone_name, rotation in pose.items():
            set_bone_rotation(armature, bone_name, rotation)
        bpy.context.scene.frame_set(frame)
        for target in armature.pose.bones:
            target.keyframe_insert(data_path="rotation_euler", frame=frame, group=target.name)
    return action


def clips_for(role: str) -> list[tuple[str, list[tuple[int, dict[str, tuple[float, float, float]]]]]]:
    # Bone names come from the downloaded CC-BY source's inspected 102-joint
    # skeleton.  Rotations are deliberately moderate; the route's ballistic
    # solver remains the sole owner of translation and contact truth.
    pelvis = "CC_Base_Pelvis_03"
    waist = "CC_Base_Waist_033"
    spine = "CC_Base_Spine01_034"
    l_thigh, r_thigh = "CC_Base_L_Thigh_04", "CC_Base_R_Thigh_018"
    l_calf, r_calf = "CC_Base_L_Calf_05", "CC_Base_R_Calf_021"
    l_upper, r_upper = "CC_Base_L_Upperarm_050", "CC_Base_R_Upperarm_074"
    l_fore, r_fore = "CC_Base_L_Forearm_051", "CC_Base_R_Forearm_077"
    l_hand, r_hand = "CC_Base_L_Hand_055", "CC_Base_R_Hand_081"
    if role == "shooter":
        return [
            ("Ready", [(1, {})]),
            (
                "Load",
                [
                    (8, {pelvis: (0.15, 0.0, 0.0), waist: (0.10, 0.0, 0.0), spine: (0.18, 0.0, 0.0), l_thigh: (-0.22, 0.0, -0.05), r_thigh: (-0.28, 0.0, 0.05), l_calf: (0.34, 0.0, 0.0), r_calf: (0.42, 0.0, 0.0), l_upper: (0.18, 0.0, -0.68), r_upper: (0.20, 0.0, 0.78), l_fore: (-0.30, 0.0, -0.24), r_fore: (-0.35, 0.0, 0.25)}),
                    (16, {pelvis: (0.10, 0.0, 0.0), waist: (0.06, 0.0, 0.0), spine: (0.12, 0.0, 0.0), l_thigh: (-0.16, 0.0, -0.03), r_thigh: (-0.20, 0.0, 0.03), l_calf: (0.26, 0.0, 0.0), r_calf: (0.32, 0.0, 0.0), l_upper: (0.05, 0.0, -0.52), r_upper: (0.05, 0.0, 0.58), l_fore: (-0.24, 0.0, -0.18), r_fore: (-0.28, 0.0, 0.20)}),
                ],
            ),
            (
                "Release",
                [
                    (8, {pelvis: (-0.08, 0.0, 0.0), waist: (-0.06, 0.0, 0.0), spine: (-0.16, 0.0, 0.0), l_thigh: (0.08, 0.0, -0.04), r_thigh: (0.12, 0.0, 0.04), l_calf: (-0.14, 0.0, 0.0), r_calf: (-0.16, 0.0, 0.0), l_upper: (-1.05, 0.0, -0.55), r_upper: (-1.38, 0.0, 1.05), l_fore: (-0.35, 0.0, -0.20), r_fore: (-0.62, 0.0, 0.22), l_hand: (-0.12, 0.0, -0.06), r_hand: (-0.20, 0.0, 0.08)}),
                    (16, {pelvis: (-0.04, 0.0, 0.0), waist: (-0.04, 0.0, 0.0), spine: (-0.11, 0.0, 0.0), l_thigh: (0.06, 0.0, -0.03), r_thigh: (0.10, 0.0, 0.03), l_calf: (-0.10, 0.0, 0.0), r_calf: (-0.12, 0.0, 0.0), l_upper: (-1.28, 0.0, -0.48), r_upper: (-1.62, 0.0, 1.12), l_fore: (-0.40, 0.0, -0.18), r_fore: (-0.70, 0.0, 0.18), l_hand: (-0.18, 0.0, -0.04), r_hand: (-0.24, 0.0, 0.06)}),
                ],
            ),
            (
                "FollowThrough",
                [
                    (8, {pelvis: (-0.04, 0.0, 0.0), waist: (-0.05, 0.0, 0.0), spine: (-0.12, 0.0, 0.0), l_upper: (-1.18, 0.0, -0.56), r_upper: (-1.58, 0.0, 1.18), l_fore: (-0.62, 0.0, -0.14), r_fore: (-0.82, 0.0, 0.12), l_hand: (-0.20, 0.0, -0.04), r_hand: (-0.30, 0.0, 0.06), l_thigh: (0.04, 0.0, -0.03), r_thigh: (0.12, 0.0, 0.04)}),
                    (16, {pelvis: (0.02, 0.0, 0.0), waist: (-0.02, 0.0, 0.0), spine: (-0.08, 0.0, 0.0), l_upper: (-0.92, 0.0, -0.70), r_upper: (-1.72, 0.0, 1.24), l_fore: (-0.40, 0.0, -0.18), r_fore: (-0.90, 0.0, 0.10), l_hand: (-0.16, 0.0, -0.04), r_hand: (-0.34, 0.0, 0.04), l_thigh: (0.02, 0.0, -0.02), r_thigh: (0.08, 0.0, 0.02)}),
                ],
            ),
        ]
    return [
        ("Plant", [(1, {}), (16, {pelvis: (0.08, 0.0, 0.0), waist: (0.04, 0.0, 0.0), spine: (0.06, 0.0, 0.0), l_thigh: (-0.12, 0.0, -0.30), r_thigh: (-0.12, 0.0, 0.30), l_calf: (0.18, 0.0, 0.0), r_calf: (0.18, 0.0, 0.0), l_upper: (-0.08, 0.0, -0.45), r_upper: (-0.08, 0.0, 0.45)})]),
        (
            "Telegraph",
            [
                (8, {pelvis: (0.20, 0.0, 0.0), waist: (0.12, 0.0, 0.0), spine: (0.18, 0.0, 0.0), l_thigh: (-0.34, 0.0, -0.34), r_thigh: (-0.34, 0.0, 0.34), l_calf: (0.48, 0.0, 0.0), r_calf: (0.48, 0.0, 0.0), l_upper: (-0.12, 0.0, -0.92), r_upper: (-0.12, 0.0, 0.92), l_fore: (-0.18, 0.0, -0.22), r_fore: (-0.18, 0.0, 0.22)}),
                (16, {pelvis: (0.12, 0.0, 0.0), waist: (0.08, 0.0, 0.0), spine: (0.12, 0.0, 0.0), l_thigh: (-0.24, 0.0, -0.30), r_thigh: (-0.24, 0.0, 0.30), l_calf: (0.34, 0.0, 0.0), r_calf: (0.34, 0.0, 0.0), l_upper: (-0.10, 0.0, -0.74), r_upper: (-0.10, 0.0, 0.74), l_fore: (-0.12, 0.0, -0.18), r_fore: (-0.12, 0.0, 0.18)}),
            ],
        ),
        (
            "Jump",
            [
                (8, {pelvis: (-0.04, 0.0, 0.0), waist: (-0.04, 0.0, 0.0), spine: (-0.08, 0.0, 0.0), l_thigh: (0.22, 0.0, -0.22), r_thigh: (0.22, 0.0, 0.22), l_calf: (-0.38, 0.0, 0.0), r_calf: (-0.38, 0.0, 0.0), l_upper: (-1.18, 0.0, -0.72), r_upper: (-1.18, 0.0, 0.72), l_fore: (-0.42, 0.0, -0.18), r_fore: (-0.42, 0.0, 0.18), l_hand: (-0.16, 0.0, -0.04), r_hand: (-0.16, 0.0, 0.04)}),
                (16, {pelvis: (-0.08, 0.0, 0.0), waist: (-0.06, 0.0, 0.0), spine: (-0.10, 0.0, 0.0), l_thigh: (0.30, 0.0, -0.28), r_thigh: (0.30, 0.0, 0.28), l_calf: (-0.46, 0.0, 0.0), r_calf: (-0.46, 0.0, 0.0), l_upper: (-1.34, 0.0, -0.86), r_upper: (-1.34, 0.0, 0.86), l_fore: (-0.52, 0.0, -0.16), r_fore: (-0.52, 0.0, 0.16), l_hand: (-0.20, 0.0, -0.04), r_hand: (-0.20, 0.0, 0.04)}),
            ],
        ),
        (
            "Contest",
            [
                (8, {pelvis: (-0.06, 0.0, 0.0), waist: (-0.04, 0.0, 0.0), spine: (-0.08, 0.0, 0.0), l_thigh: (0.20, 0.0, -0.24), r_thigh: (0.24, 0.0, 0.24), l_calf: (-0.34, 0.0, 0.0), r_calf: (-0.40, 0.0, 0.0), l_upper: (-1.48, 0.0, -0.90), r_upper: (-1.42, 0.0, 0.90), l_fore: (-0.60, 0.0, -0.10), r_fore: (-0.56, 0.0, 0.10), l_hand: (-0.22, 0.0, -0.04), r_hand: (-0.22, 0.0, 0.04)}),
                (16, {pelvis: (-0.02, 0.0, 0.0), waist: (-0.02, 0.0, 0.0), spine: (-0.06, 0.0, 0.0), l_thigh: (0.14, 0.0, -0.18), r_thigh: (0.18, 0.0, 0.18), l_calf: (-0.26, 0.0, 0.0), r_calf: (-0.32, 0.0, 0.0), l_upper: (-1.34, 0.0, -0.74), r_upper: (-1.30, 0.0, 0.74), l_fore: (-0.46, 0.0, -0.08), r_fore: (-0.44, 0.0, 0.08), l_hand: (-0.18, 0.0, -0.02), r_hand: (-0.18, 0.0, 0.02)}),
            ],
        ),
    ]


def attach_nla_clips(armature: bpy.types.Object, role: str) -> list[str]:
    armature.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    names: list[str] = []
    for name, poses in clips_for(role):
        action = authored_clip(armature, name, poses)
        track = armature.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.frame_end = 24
        names.append(name)
    armature.animation_data.action = None
    return names


def add_orientation_metadata(path: Path, *, clips: list[str], role: str, source: str) -> None:
    raw = path.read_bytes()
    magic, version, _length = struct.unpack_from("<4sII", raw, 0)
    json_length, json_kind = struct.unpack_from("<I4s", raw, 12)
    if magic != b"glTF" or version != 2 or json_kind != b"JSON":
        raise RuntimeError(f"unexpected GLB header for {path}")
    gltf = json.loads(raw[20 : 20 + json_length].decode("utf8"))
    gltf.setdefault("asset", {}).setdefault("extras", {})["aura3d"] = {
        "orientation": {"forwardAxis": "+Z", "upAxis": "+Y"},
        "sourceModel": source,
        "role": role,
        "authoredClips": clips,
        "artFamily": "rooftop-buckets-production-v3",
    }
    encoded = json.dumps(gltf, separators=(",", ":")).encode("utf8")
    encoded += b" " * ((4 - len(encoded) % 4) % 4)
    tail = raw[20 + json_length :]
    output = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + len(tail))
    output += struct.pack("<I4s", len(encoded), b"JSON") + encoded + tail
    path.write_bytes(output)


def export_glb(path: Path, *, animations: bool, export_yup: bool = True) -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        # Keep the source's Y-up athlete/venue convention.  The route's
        # orientation contract is +Y up / +Z forward; using Blender's Y-up
        # conversion here avoids exporting the player on its side.
        export_yup=export_yup,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=animations,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_force_sampling=True,
    )


def build_athlete(role: str, filename: str) -> None:
    clear()
    armature = imported_source()
    replace_materials(armature, role)
    clips = attach_nla_clips(armature, role)
    output = OUT_DIR / filename
    export_glb(output, animations=True)
    add_orientation_metadata(output, clips=clips, role=role, source="Sketchfab 4c7133dbb06e4136891d59231372d818 / Man Player (CC-BY-4.0)")
    print(f"wrote {output} ({role}, clips={','.join(clips)})")


def mat(name: str, color: tuple[float, float, float, float], metallic: float = 0.0, roughness: float = 0.5, emission: tuple[float, float, float, float] | None = None) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    assert bsdf is not None
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = 0.65
    return material


def finish(obj: bpy.types.Object, material: bpy.types.Material, bevel: float = 0.0) -> bpy.types.Object:
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("soft venue edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def cube(name: str, location: tuple[float, float, float], scale: tuple[float, float, float], material: bpy.types.Material, bevel: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, material, bevel)


def cylinder(name: str, location: tuple[float, float, float], radius: float, depth: float, material: bpy.types.Material, vertices: int = 20) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, material, radius * 0.12)


def venue() -> None:
    clear()
    court = mat("rooftop court sealed concrete", (0.075, 0.105, 0.15, 1), 0.08, 0.58)
    court_edge = mat("rooftop court edge", (0.025, 0.04, 0.06, 1), 0.16, 0.48)
    bleacher = mat("bleacher painted steel", (0.20, 0.09, 0.27, 1), 0.34, 0.38)
    seat = mat("bleacher seat violet", (0.33, 0.12, 0.40, 1), 0.12, 0.44)
    rail = mat("venue rail", (0.04, 0.22, 0.28, 1), 0.66, 0.26)
    amber = mat("venue amber practical", (0.96, 0.22, 0.04, 1), 0.28, 0.28, (0.93, 0.09, 0.01, 1))
    cyan = mat("venue cyan practical", (0.04, 0.48, 0.58, 1), 0.28, 0.3, (0.02, 0.30, 0.70, 1))
    crowd_a = mat("crowd warm jacket", (0.74, 0.19, 0.10, 1), 0.02, 0.62)
    crowd_b = mat("crowd teal jacket", (0.04, 0.42, 0.50, 1), 0.04, 0.56)
    crowd_skin = mat("crowd skin", (0.42, 0.19, 0.10, 1), 0.0, 0.68)

    # Preserve the exact 16 x 14 court footprint consumed by COURT_SPOTS.  All
    # venue additions begin outside z=-2 so hoop/backboard/ball regions remain
    # untouched and collision ownership stays in the route integrator.
    cube("court slab", (0, -0.34, 4), (8.0, 0.34, 7.0), court, 0.10)
    cube("court perimeter fascia", (0, -0.05, 4), (8.16, 0.10, 7.16), court_edge, 0.06)

    # Rear grandstand with stepped tiers, under-seat fascia, handrails, and
    # alternating seat colors.  This reads as an authored streetball venue in
    # the same frame as the live hoop, unlike the old empty rooftop slab.
    for row in range(4):
        y = 0.24 + row * 0.34
        z = -2.45 - row * 0.22
        depth = 0.88 - row * 0.10
        cube(f"rear bleacher tier {row + 1}", (0, y, z), (6.9 - row * 0.25, 0.15, depth), bleacher, 0.05)
        for x_index in range(-6, 7):
            x = x_index * 0.95
            cube(f"rear seat {row + 1}-{x_index}", (x, y + 0.18, z - 0.06), (0.33, 0.07, 0.27), seat if (x_index + row) % 2 else bleacher, 0.025)
            # A compact spectator silhouette is set dressing, not a gameplay
            # character.  The repeated head/torso pair gives the stands human
            # scale while remaining far outside all collision regions.
            crowd_material = crowd_a if (x_index + row) % 3 else crowd_b
            cube(f"crowd torso {row + 1}-{x_index}", (x, y + 0.39, z - 0.04), (0.18, 0.22, 0.10), crowd_material, 0.04)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=(x, y + 0.75, z - 0.04))
            finish(bpy.context.object, crowd_skin)
            bpy.context.object.scale = (0.15, 0.15, 0.15)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if row < 3:
            cylinder(f"rear guard post {row + 1}", (-6.9 + row * 0.25, y + 0.48, z + 0.72), 0.035, 0.95, rail, 12)
            cylinder(f"rear guard post {row + 1} right", (6.9 - row * 0.25, y + 0.48, z + 0.72), 0.035, 0.95, rail, 12)
            cube(f"rear guard rail {row + 1}", (0, y + 0.90, z + 0.72), (6.9 - row * 0.25, 0.035, 0.035), rail, 0.012)

    # Side stands provide depth under the sideline camera and frame the action
    # without occluding the player, hoop, or live trajectory.
    for side in (-1, 1):
        x = side * 8.85
        for row in range(3):
            y = 0.24 + row * 0.36
            z = 3.0 + row * 0.15
            cube(f"side bleacher {side} {row + 1}", (x, y, z), (0.78, 0.15, 3.65 - row * 0.22), bleacher, 0.05)
            cube(f"side seat trim {side} {row + 1}", (x - side * 0.35, y + 0.18, z), (0.16, 0.07, 3.35 - row * 0.18), seat, 0.02)
        cylinder(f"side rail post {side}", (x - side * 0.72, 1.60, 3.0), 0.035, 2.9, rail, 12)
        cube(f"side handrail {side}", (x - side * 0.72, 3.02, 3.0), (0.035, 0.035, 3.75), rail, 0.012)

    # Lighting and visual identity elements: all are venue geometry and remain
    # outside the active court's gameplay bounds.
    for side in (-1, 1):
        x = side * 7.6
        cylinder(f"venue light mast {side}", (x, 3.8, -2.35), 0.08, 7.4, rail, 16)
        cube(f"venue flood bar {side}", (x, 7.35, -2.35), (0.70, 0.12, 0.22), amber, 0.04)
        cube(f"venue cyan kicker {side}", (x - side * 0.12, 1.2, -2.18), (0.08, 0.72, 0.025), cyan, 0.015)
    for x in (-5.6, -2.8, 0, 2.8, 5.6):
        cube(f"rear sponsor banner {x}", (x, 2.80, -3.32), (0.82, 0.46, 0.035), amber if x == 0 else cyan, 0.025)
        cube(f"rear sponsor bar {x}", (x, 2.18, -3.30), (0.82, 0.035, 0.035), rail, 0.01)

    output = OUT_DIR / "rooftopCourt.glb"
    # Venue coordinates are authored directly in the route's +Y-up scene
    # convention (Y height, Z depth).  Blender's ``export_yup`` conversion is
    # for Z-up authoring and would swap these axes, turning the court slab into
    # a vertical wall that occludes the entire game camera.  Keep the authored
    # route axes intact for this world GLB; athlete exports retain the source
    # conversion above because their imported Sketchfab hierarchy carries its
    # own Blender wrapper.
    export_glb(output, animations=False, export_yup=False)
    add_orientation_metadata(output, clips=[], role="world", source="Aura3D Rooftop Buckets venue authoring")
    print(f"wrote {output} (venue bleachers + crowd dressing)")


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build_athlete("shooter", "rooftopLayupScorer.glb")
    build_athlete("defender", "rooftopDefender.glb")
    venue()
