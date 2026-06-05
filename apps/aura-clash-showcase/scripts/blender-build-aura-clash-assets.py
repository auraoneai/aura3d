import json
import math
import sys
from pathlib import Path

import bpy

repo_root = Path(sys.argv[-1]).resolve()
app_root = repo_root / "apps" / "aura-clash-showcase"
stage = app_root / "assets" / "quaternius-source" / "selected"
out_dir = app_root / "assets" / "source"
fighter_out = out_dir / "fighters"
arena_out = out_dir / "arenas"
scene_out = out_dir / "scenes"
for path in [fighter_out, arena_out, scene_out]:
    path.mkdir(parents=True, exist_ok=True)

fighter_defs = [
    {
        "id": "fighter-mara-volt",
        "assetKey": "fighterMaraVolt",
        "source": stage / "characters" / "base" / "Superhero_Female_FullBody.gltf",
        "output": fighter_out / "fighter-mara-volt.glb",
        "hair": stage / "characters" / "hair" / "Hair_Buns.gltf",
        "scale": (1.04, 1.04, 1.04),
        "tint": (0.00, 0.95, 0.72, 1.0),
        "accent": (0.10, 0.65, 1.0, 1.0),
        "action": "Melee_Hook",
        "actionFrame": 0.50
    },
    {
        "id": "fighter-rook-atlas",
        "assetKey": "fighterRookAtlas",
        "source": stage / "characters" / "base" / "Superhero_Male_FullBody.gltf",
        "output": fighter_out / "fighter-rook-atlas.glb",
        "hair": stage / "characters" / "hair" / "Hair_Buzzed.gltf",
        "scale": (1.22, 1.22, 1.22),
        "tint": (1.00, 0.68, 0.16, 1.0),
        "accent": (0.12, 0.25, 0.95, 1.0),
        "action": "Sword_Block",
        "actionFrame": 0.52
    },
    {
        "id": "fighter-nyx-vale",
        "assetKey": "fighterNyxVale",
        "source": stage / "characters" / "base" / "Superhero_Female_FullBody.gltf",
        "output": fighter_out / "fighter-nyx-vale.glb",
        "hair": stage / "characters" / "hair" / "Hair_Long.gltf",
        "scale": (0.98, 0.98, 1.06),
        "tint": (0.54, 0.18, 1.00, 1.0),
        "accent": (0.00, 0.86, 1.0, 1.0),
        "action": "NinjaJump_Start",
        "actionFrame": 0.42
    },
    {
        "id": "fighter-kade-ember",
        "assetKey": "fighterKadeEmber",
        "source": stage / "characters" / "base" / "Superhero_Male_FullBody.gltf",
        "output": fighter_out / "fighter-kade-ember.glb",
        "hair": stage / "characters" / "hair" / "Hair_SimpleParted.gltf",
        "scale": (1.08, 1.08, 1.08),
        "tint": (1.00, 0.22, 0.08, 1.0),
        "accent": (1.00, 0.82, 0.25, 1.0),
        "action": "Sword_Regular_A",
        "actionFrame": 0.48
    },
    {
        "id": "fighter-sable-iron",
        "assetKey": "fighterSableIron",
        "source": stage / "characters" / "base" / "Superhero_Female_FullBody.gltf",
        "output": fighter_out / "fighter-sable-iron.glb",
        "hair": stage / "characters" / "hair" / "Hair_BuzzedFemale.gltf",
        "scale": (1.05, 1.05, 1.05),
        "tint": (0.08, 0.12, 0.16, 1.0),
        "accent": (0.70, 0.90, 1.0, 1.0),
        "action": "Sword_Block",
        "actionFrame": 0.62
    },
    {
        "id": "fighter-jin-flux",
        "assetKey": "fighterJinFlux",
        "source": stage / "characters" / "base" / "Superhero_Male_FullBody.gltf",
        "output": fighter_out / "fighter-jin-flux.glb",
        "hair": stage / "characters" / "hair" / "Hair_SimpleParted.gltf",
        "scale": (1.02, 1.02, 1.08),
        "tint": (0.05, 0.30, 0.96, 1.0),
        "accent": (0.95, 0.72, 0.24, 1.0),
        "action": "NinjaJump_Start",
        "actionFrame": 0.50
    }
]

arena_pieces = [
    ("Floor_4x4", (0, 0, 0), (4.2, 4.2, 1), 0),
    ("Floor_4x4", (-4.2, 0, 0), (4.2, 4.2, 1), 0),
    ("Floor_4x4", (4.2, 0, 0), (4.2, 4.2, 1), 0),
    ("Roof_4x4", (0, -3.5, -0.08), (4.0, 2.0, 1), 0),
    ("Roof_2x2", (-5.5, -3.6, 0.05), (2.0, 2.0, 1), 0),
    ("Roof_2x2", (5.5, -3.6, 0.05), (2.0, 2.0, 1), 0),
    ("Sidewalk_Straight_3m", (-5.5, 2.2, 0.04), (1.4, 1.4, 1), 0),
    ("Sidewalk_Straight_3m", (5.5, 2.2, 0.04), (1.4, 1.4, 1), 0),
    ("Sidewalk_Corner_Flat_3m", (-7.0, 2.2, 0.04), (1.2, 1.2, 1), 0),
    ("Sidewalk_Corner_Flat_3m", (7.0, 2.2, 0.04), (1.2, 1.2, 1), math.pi / 2),
    ("Street_2Lane", (0, 4.2, -0.03), (2.6, 1.3, 1), 0),
    ("Street_4Lane", (0, 6.0, -0.04), (2.6, 1.2, 1), 0),
    ("Decal_Crosswalk", (-2.2, 3.2, 0.02), (1.4, 1.4, 1), 0),
    ("Decal_Stop", (2.4, 3.1, 0.02), (1.1, 1.1, 1), -0.2),
    ("Building_Large_2", (-8.5, 8.0, 0), (1.35, 1.35, 1.35), 0.06),
    ("Building_Large_2", (8.5, 8.4, 0), (1.25, 1.25, 1.25), -0.08),
    ("Building_Medium_2_001", (-4.6, 8.5, 0), (1.15, 1.15, 1.15), 0),
    ("Building_Medium_2_001", (4.8, 8.7, 0), (1.05, 1.05, 1.05), 0),
    ("Building_Small_1", (-1.2, 7.4, 0), (0.95, 0.95, 0.95), 0),
    ("Building_Small_1", (1.8, 7.5, 0), (0.90, 0.90, 0.90), 0),
    ("Metal_FullWindow", (-6.4, 7.2, 1.5), (1.0, 1.0, 1.0), 0),
    ("Metal_Window", (6.4, 7.2, 1.2), (1.0, 1.0, 1.0), 0),
    ("Brick_Window_CurvedDouble", (-3.0, 7.0, 1.4), (1.0, 1.0, 1.0), 0),
    ("Brick_Window_Square_Single", (3.0, 7.0, 1.2), (1.0, 1.0, 1.0), 0),
    ("Prop_ACUnit", (-3.5, -2.0, 0.1), (1.0, 1.0, 1.0), 0.3),
    ("Prop_ACUnit", (3.8, -2.2, 0.1), (1.0, 1.0, 1.0), -0.4),
    ("Prop_Bollard", (-6.5, 0.8, 0.05), (1.0, 1.0, 1.0), 0),
    ("Prop_Bollard", (-5.7, 0.8, 0.05), (1.0, 1.0, 1.0), 0),
    ("Prop_Bollard", (5.7, 0.8, 0.05), (1.0, 1.0, 1.0), 0),
    ("Prop_Bollard", (6.5, 0.8, 0.05), (1.0, 1.0, 1.0), 0),
    ("Prop_ManholeCover", (0, 2.2, 0.02), (1.0, 1.0, 1.0), 0),
    ("Prop_Planter_Single", (-7.2, -1.4, 0.1), (1.0, 1.0, 1.0), 0.2),
    ("Prop_Planter_Single", (7.2, -1.4, 0.1), (1.0, 1.0, 1.0), -0.2),
    ("Door_1", (-1.0, 6.8, 0.2), (1.0, 1.0, 1.0), 0),
    ("Door_2", (1.2, 6.8, 0.2), (1.0, 1.0, 1.0), 0),
]

playable_pieces = [
    ("Floor_4x4", (0, -1.25, 0), (3.4, 2.4, 1), 0),
    ("Floor_4x4", (-3.6, -1.25, 0), (2.2, 2.4, 1), 0),
    ("Floor_4x4", (3.6, -1.25, 0), (2.2, 2.4, 1), 0),
    ("Roof_4x4", (0, -2.45, 0.06), (3.2, 1.4, 1), 0),
    ("Roof_2x2", (-4.8, -2.5, 0.08), (1.7, 1.4, 1), 0),
    ("Roof_2x2", (4.8, -2.5, 0.08), (1.7, 1.4, 1), 0),
    ("Street_2Lane", (0, 2.2, -0.035), (2.0, 0.95, 1), 0),
    ("Street_4Lane", (0, 3.55, -0.045), (1.85, 0.85, 1), 0),
    ("Decal_Crosswalk", (-1.85, 1.7, 0.03), (1.05, 1.05, 1), 0),
    ("Decal_Stop", (2.05, 1.65, 0.03), (0.82, 0.82, 1), -0.2),
    ("Building_Large_2", (-4.8, 6.1, 0), (0.08, 0.08, 0.08), 0.04),
    ("Building_Medium_2_001", (-1.45, 6.12, 0), (0.09, 0.09, 0.09), 0),
    ("Building_Small_1", (1.25, 5.95, 0), (0.10, 0.10, 0.10), 0),
    ("Building_Large_2", (4.75, 6.14, 0), (0.08, 0.08, 0.08), -0.06),
    ("Metal_FullWindow", (-3.35, 5.75, 0.42), (0.14, 0.14, 0.14), 0),
    ("Brick_Window_CurvedDouble", (3.25, 5.68, 0.42), (0.15, 0.15, 0.15), 0),
    ("Prop_ACUnit", (-3.5, -1.9, 0.12), (0.9, 0.9, 0.9), 0.35),
    ("Prop_ACUnit", (3.7, -1.92, 0.12), (0.9, 0.9, 0.9), -0.35),
    ("Prop_Bollard", (-5.4, 0.75, 0.05), (1.0, 1.0, 1.0), 0),
    ("Prop_Bollard", (-4.6, 0.75, 0.05), (1.0, 1.0, 1.0), 0),
    ("Prop_Bollard", (4.6, 0.75, 0.05), (1.0, 1.0, 1.0), 0),
    ("Prop_Bollard", (5.4, 0.75, 0.05), (1.0, 1.0, 1.0), 0),
    ("Prop_Planter_Single", (-5.7, -1.1, 0.12), (0.9, 0.9, 0.9), 0.2),
    ("Prop_Planter_Single", (5.7, -1.1, 0.12), (0.9, 0.9, 0.9), -0.2),
]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in [bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.textures, bpy.data.lights, bpy.data.cameras]:
        for item in list(collection):
            collection.remove(item)


def material_has_image_texture(mat):
    if not mat.use_nodes:
        return False
    return any(node.type == "TEX_IMAGE" and getattr(node, "image", None) for node in mat.node_tree.nodes)


def set_materials(tint, accent):
    for index, mat in enumerate(bpy.data.materials):
        name = mat.name.lower()
        if material_has_image_texture(mat):
            continue
        if "eye" in name:
            color = (0.03, 0.04, 0.05, 1.0)
        elif "hair" in name:
            color = accent
        elif "skin" in name or "face" in name:
            color = (0.92, 0.78, 0.62, 1.0)
        else:
            color = tint
        mat.diffuse_color = color
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    if "Base Color" in node.inputs:
                        node.inputs["Base Color"].default_value = color
                    if "Roughness" in node.inputs:
                        node.inputs["Roughness"].default_value = 0.58
                    if "Metallic" in node.inputs:
                        node.inputs["Metallic"].default_value = 0.06


def use_showcase_texture_variants():
    replacements = {
        "T_Superhero_Female_Dark_BaseColor": stage / "characters" / "base" / "T_Superhero_Female_Light_BaseColor.png",
        "T_Superhero_Male_Dark": stage / "characters" / "base" / "T_Superhero_Male_Light.png",
    }
    for image in bpy.data.images:
        source_name = Path(image.filepath).name or image.name
        for dark_name, light_path in replacements.items():
            if dark_name in source_name and light_path.exists() and light_path.stat().st_size > 0:
                image.filepath = str(light_path)
                image.name = light_path.stem
                try:
                    image.reload()
                except Exception as exc:
                    print(f"Warning: could not reload showcase texture {light_path.name}: {exc}")


def load_animation_actions():
    clear_scene()
    for src in [stage / "animations" / "UAL2_Standard.glb", stage / "animations" / "UAL1_Standard.glb"]:
        if src.exists():
            bpy.ops.import_scene.gltf(filepath=str(src))
    action_names = sorted(action.name for action in bpy.data.actions)
    print(f"Loaded {len(action_names)} Quaternius animation actions for pose baking")
    clear_scene()


def pose_armature(action_name, frame_ratio):
    action = bpy.data.actions.get(action_name)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not action or not armatures:
        print(f"Warning: unable to apply action {action_name}")
        return
    armature = armatures[0]
    armature.animation_data_create()
    armature.animation_data.action = action
    start, end = action.frame_range
    frame = int(start + (end - start) * frame_ratio)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def freeze_current_pose_to_mesh():
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.ops.object.mode_set.poll() else None
    bpy.context.view_layer.update()
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            if mod.type == "ARMATURE":
                try:
                    bpy.ops.object.modifier_apply(modifier=mod.name)
                except Exception as exc:
                    print(f"Warning: could not bake armature modifier on {obj.name}: {exc}")
    for obj in list(bpy.context.scene.objects):
        if obj.type == "ARMATURE":
            bpy.data.objects.remove(obj, do_unlink=True)


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_lights=True,
        export_cameras=True
    )


def build_fighter(defn):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(defn["source"]))
    import_hair_mesh(defn)
    remove_helper_meshes()
    for obj in bpy.context.scene.objects:
        obj.scale = defn["scale"]
        obj.rotation_euler[2] = math.radians(180)
    use_showcase_texture_variants()
    stylize_character_materials(defn)
    pose_armature(defn["action"], defn["actionFrame"])
    freeze_current_pose_to_mesh()
    align_hair_to_head(defn)
    bpy.ops.object.light_add(type="AREA", location=(0, -3.5, 4.0))
    bpy.context.object.name = "AuraClash_KeyLight"
    bpy.context.object.data.energy = 450
    bpy.context.object.data.size = 5
    bpy.ops.object.camera_add(location=(0, -5.5, 2.2), rotation=(math.radians(68), 0, 0))
    bpy.context.scene.camera = bpy.context.object
    export_glb(defn["output"])


def imported_objects_before():
    return set(bpy.context.scene.objects)


def remove_helper_meshes():
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and (obj.name.startswith("Icosphere") or len(obj.material_slots) == 0):
            bpy.data.objects.remove(obj, do_unlink=True)


def import_hair_mesh(defn):
    hair_path = defn.get("hair")
    if not hair_path or not hair_path.exists():
        return []
    before = imported_objects_before()
    bpy.ops.import_scene.gltf(filepath=str(hair_path))
    objs = [obj for obj in bpy.context.scene.objects if obj not in before]
    for obj in objs:
        obj.name = f"{defn['assetKey']}_Hair_{obj.name}"
    return objs


def world_bounds(obj):
    coords = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    if not coords:
        return None
    return {
        "min": (min(v.x for v in coords), min(v.y for v in coords), min(v.z for v in coords)),
        "max": (max(v.x for v in coords), max(v.y for v in coords), max(v.z for v in coords)),
        "center": (
            sum(v.x for v in coords) / len(coords),
            sum(v.y for v in coords) / len(coords),
            sum(v.z for v in coords) / len(coords)
        )
    }


def align_hair_to_head(defn):
    hair_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and defn["assetKey"] in obj.name and "hair" in obj.name.lower()]
    body_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and "superhero" in obj.name.lower()]
    if not hair_objects or not body_objects:
        return
    body_bounds = [world_bounds(obj) for obj in body_objects]
    body_bounds = [bounds for bounds in body_bounds if bounds]
    if not body_bounds:
        return
    top_z = max(bounds["max"][2] for bounds in body_bounds)
    head_points = []
    for obj in body_objects:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            if point.z > top_z - 0.24:
                head_points.append(point)
    if not head_points:
        return
    head_x = sum(point.x for point in head_points) / len(head_points)
    head_y = sum(point.y for point in head_points) / len(head_points)
    for hair in hair_objects:
        bounds = world_bounds(hair)
        if not bounds:
            continue
        hair_x, hair_y, _ = bounds["center"]
        hair_min_z = bounds["min"][2]
        delta = (head_x - hair_x, head_y - hair_y, (top_z - 0.16) - hair_min_z)
        hair.location.x += delta[0]
        hair.location.y += delta[1]
        hair.location.z += delta[2]


def import_piece(piece, loc, scale, rz):
    src = stage / "arena" / "neon-downtown" / "gltf" / f"{piece}.gltf"
    before = imported_objects_before()
    bpy.ops.import_scene.gltf(filepath=str(src))
    objs = [obj for obj in bpy.context.scene.objects if obj not in before]
    for obj in objs:
        obj.location.x += loc[0]
        obj.location.y += loc[1]
        obj.location.z += loc[2]
        obj.scale.x *= scale[0]
        obj.scale.y *= scale[1]
        obj.scale.z *= scale[2]
        obj.rotation_euler[2] += rz
        obj.name = f"{piece}_{obj.name}"
    return objs


def make_emissive_material(name, color, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for node in nodes:
        if node.type == "BSDF_PRINCIPLED":
            if "Base Color" in node.inputs:
                node.inputs["Base Color"].default_value = color
            if "Emission Color" in node.inputs:
                node.inputs["Emission Color"].default_value = color
            if "Emission Strength" in node.inputs:
                node.inputs["Emission Strength"].default_value = strength
    mat.diffuse_color = color
    return mat


def make_surface_material(name, color, roughness=0.48, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            if "Base Color" in node.inputs:
                node.inputs["Base Color"].default_value = color
            if "Roughness" in node.inputs:
                node.inputs["Roughness"].default_value = roughness
            if "Metallic" in node.inputs:
                node.inputs["Metallic"].default_value = metallic
    mat.diffuse_color = color
    return mat


def assign_principled_color(mat, color, roughness=0.55, metallic=0.02, emission_strength=0.0):
    mat.diffuse_color = color
    if mat.use_nodes:
        for node in list(mat.node_tree.nodes):
            if node.type == "TEX_IMAGE":
                mat.node_tree.nodes.remove(node)
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                if "Base Color" in node.inputs:
                    node.inputs["Base Color"].default_value = color
                if "Roughness" in node.inputs:
                    node.inputs["Roughness"].default_value = roughness
                if "Metallic" in node.inputs:
                    node.inputs["Metallic"].default_value = metallic
                if "Emission Color" in node.inputs:
                    node.inputs["Emission Color"].default_value = color
                if "Emission Strength" in node.inputs:
                    node.inputs["Emission Strength"].default_value = emission_strength


def stylize_city_materials():
    for mat in bpy.data.materials:
        name = mat.name.lower()
        if not name.startswith("mi_"):
            continue
        if "glass" in name or "fakeinterior" in name:
            assign_principled_color(mat, (0.03, 0.22, 0.25, 1.0), 0.28, 0.05, 0.18)
        elif "asphalt" in name or "street" in name:
            assign_principled_color(mat, (0.015, 0.04, 0.035, 1.0), 0.68, 0.02)
        elif "floor" in name or "roof" in name:
            assign_principled_color(mat, (0.035, 0.13, 0.105, 1.0), 0.5, 0.03)
        elif "redbrick" in name or "interiorwall" in name:
            assign_principled_color(mat, (0.055, 0.09, 0.085, 1.0), 0.62, 0.0)
        elif "trim" in name or "metal" in name:
            assign_principled_color(mat, (0.11, 0.18, 0.17, 1.0), 0.42, 0.16)
        elif "concrete" in name:
            assign_principled_color(mat, (0.08, 0.12, 0.115, 1.0), 0.7, 0.0)
        elif "ornament" in name or "dirt" in name:
            assign_principled_color(mat, (0.07, 0.10, 0.09, 1.0), 0.72, 0.0)


def make_character_material(name, color, roughness=0.54, metallic=0.02):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            if "Base Color" in node.inputs:
                node.inputs["Base Color"].default_value = color
            if "Roughness" in node.inputs:
                node.inputs["Roughness"].default_value = roughness
            if "Metallic" in node.inputs:
                node.inputs["Metallic"].default_value = metallic
            if "Emission Color" in node.inputs:
                node.inputs["Emission Color"].default_value = (color[0] * 0.35, color[1] * 0.35, color[2] * 0.35, 1.0)
            if "Emission Strength" in node.inputs:
                node.inputs["Emission Strength"].default_value = 0.05
    mat.diffuse_color = color
    return mat


def stylize_character_materials(defn):
    tint = defn["tint"]
    accent = defn["accent"]
    skin = make_character_material(f"{defn['assetKey']}_Skin", (0.98, 0.74, 0.54, 1.0), 0.46, 0.0)
    suit = make_character_material(f"{defn['assetKey']}_Suit", tint, 0.52, 0.08)
    accent_mat = make_character_material(f"{defn['assetKey']}_Accent", accent, 0.42, 0.12)
    boot = make_character_material(f"{defn['assetKey']}_Boots", (0.015, 0.018, 0.026, 1.0), 0.62, 0.05)
    eye = make_character_material(f"{defn['assetKey']}_Eyes", (0.02, 0.028, 0.035, 1.0), 0.35, 0.0)

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        material_names = " ".join(slot.material.name.lower() for slot in obj.material_slots if slot.material)
        object_name = obj.name.lower()

        if "eye" in object_name or "eye" in material_names:
            obj.data.materials.clear()
            obj.data.materials.append(eye)
            for polygon in obj.data.polygons:
                polygon.material_index = 0
            continue

        if "hair" in object_name or "eyebrow" in object_name or "hair" in material_names:
            obj.data.materials.clear()
            obj.data.materials.append(accent_mat)
            for polygon in obj.data.polygons:
                polygon.material_index = 0
            continue

        if "superhero" in object_name or "superhero" in material_names:
            obj.data.materials.clear()
            obj.data.materials.append(skin)
            obj.data.materials.append(suit)
            obj.data.materials.append(accent_mat)
            obj.data.materials.append(boot)
            for polygon in obj.data.polygons:
                center = sum((obj.data.vertices[index].co for index in polygon.vertices), obj.data.vertices[polygon.vertices[0]].co.copy() * 0)
                center /= len(polygon.vertices)
                abs_x = abs(center.x)
                if center.z > 1.47 and abs_x < 0.34:
                    polygon.material_index = 0
                elif center.z > 0.76 and abs_x > 0.58:
                    polygon.material_index = 0
                elif center.z < 0.16:
                    polygon.material_index = 3
                elif center.z > 0.78 and abs_x < 0.18:
                    polygon.material_index = 2
                else:
                    polygon.material_index = 1


def add_neon_sign(text, loc, scale, color):
    mat = make_emissive_material(f"Neon_{text}", color, 4.0)
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(78), 0, 0))
    obj = bpy.context.object
    obj.name = f"AuraClash_Sign_{text}"
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = scale
    obj.data.extrude = 0.02
    obj.data.materials.append(mat)
    return obj


def add_fight_fx_ring(name, loc, radius, color, tilt=math.radians(90)):
    mat = make_emissive_material(name, color, 3.6)
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.035, location=loc, rotation=(tilt, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def add_motion_slab(name, loc, scale, rot, color):
    mat = make_emissive_material(name, color, 2.2)
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def add_stage_backplate():
    mat = make_surface_material("AuraClash_Backplate_Glass", (0.02, 0.18, 0.15, 0.48), 0.32, 0.05)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 5.35, 1.65), rotation=(0, 0, 0))
    obj = bpy.context.object
    obj.name = "AuraClash_Cinematic_Backplate"
    obj.dimensions = (10.5, 0.08, 3.4)
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def build_arena():
    clear_scene()
    for piece in arena_pieces:
        import_piece(*piece)
    stylize_city_materials()

    floor_mat = make_emissive_material("AuraClash_Emerald_Rim", (0.0, 0.95, 0.58, 1.0), 1.4)
    for x in [-5.5, -2.75, 0, 2.75, 5.5]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -2.95, 0.08))
        rail = bpy.context.object
        rail.name = "AuraClash_Emerald_FloorRail"
        rail.dimensions = (2.0, 0.035, 0.035)
        rail.data.materials.append(floor_mat)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    add_neon_sign("AURA CLASH", (0, 6.45, 3.7), 0.62, (0.0, 1.0, 0.68, 1.0))
    add_neon_sign("NEON ROOFTOP", (-4.8, 5.9, 2.9), 0.32, (0.1, 0.75, 1.0, 1.0))
    add_neon_sign("FIGHT READY", (4.8, 5.9, 2.9), 0.32, (1.0, 0.68, 0.18, 1.0))

    bpy.ops.object.light_add(type="AREA", location=(0, -3.5, 7.0))
    bpy.context.object.name = "AuraClash_Arena_KeyLight"
    bpy.context.object.data.energy = 800
    bpy.context.object.data.size = 8
    bpy.ops.object.light_add(type="POINT", location=(-5.5, -1.0, 2.0))
    bpy.context.object.name = "AuraClash_Cyan_RimLight"
    bpy.context.object.data.color = (0.0, 0.8, 1.0)
    bpy.context.object.data.energy = 350
    bpy.ops.object.light_add(type="POINT", location=(5.5, -1.0, 2.0))
    bpy.context.object.name = "AuraClash_Amber_RimLight"
    bpy.context.object.data.color = (1.0, 0.55, 0.12)
    bpy.context.object.data.energy = 280
    bpy.ops.object.camera_add(location=(0, -9.5, 4.0), rotation=(math.radians(64), 0, 0))
    bpy.context.scene.camera = bpy.context.object
    export_glb(arena_out / "arena-neon-downtown.glb")


def import_glb_instance(src, loc, scale, rz):
    before = imported_objects_before()
    bpy.ops.import_scene.gltf(filepath=str(src))
    objs = [obj for obj in bpy.context.scene.objects if obj not in before]
    for obj in objs:
        obj.location.x += loc[0]
        obj.location.y += loc[1]
        obj.location.z += loc[2]
        obj.scale.x *= scale[0]
        obj.scale.y *= scale[1]
        obj.scale.z *= scale[2]
        obj.rotation_euler[2] += rz
    return objs


def build_playable_scene():
    clear_scene()
    for piece in playable_pieces:
        import_piece(*piece)
    stylize_city_materials()
    add_stage_backplate()
    import_glb_instance(fighter_out / "fighter-mara-volt.glb", (-2.10, -1.42, 0.24), (4.25, 4.25, 4.25), math.radians(72))
    import_glb_instance(fighter_out / "fighter-rook-atlas.glb", (2.10, -1.36, 0.24), (3.85, 3.85, 3.85), math.radians(-72))

    aura_mat = make_emissive_material("AuraClash_Versus_Ring", (0.0, 1.0, 0.65, 1.0), 2.5)
    for x, name in [(-1.18, "Mara_Aura_Ring"), (1.22, "Rook_Aura_Ring")]:
        bpy.ops.mesh.primitive_torus_add(major_radius=1.25, minor_radius=0.035, location=(x, -1.2, 0.08))
        ring = bpy.context.object
        ring.name = name
        ring.data.materials.append(aura_mat)

    add_fight_fx_ring("AuraClash_Impact_Halo", (0, -1.48, 1.95), 1.85, (1.0, 0.96, 0.72, 1.0), math.radians(90))
    add_fight_fx_ring("AuraClash_Player_Air_Ring", (-1.2, -1.42, 2.65), 1.05, (0.0, 0.95, 0.78, 1.0), math.radians(77))
    add_fight_fx_ring("AuraClash_Rival_Guard_Ring", (1.24, -1.42, 2.25), 1.12, (1.0, 0.60, 0.14, 1.0), math.radians(104))
    add_motion_slab("AuraClash_Player_Slash_Trail", (-0.48, -1.52, 2.20), (2.2, 0.06, 0.20), (0, 0, math.radians(-17)), (0.0, 0.95, 1.0, 1.0))
    add_motion_slab("AuraClash_Rival_Impact_Trail", (0.56, -1.50, 2.02), (1.7, 0.06, 0.18), (0, 0, math.radians(20)), (1.0, 0.70, 0.16, 1.0))

    add_neon_sign("MARA VOLT", (-2.25, -2.22, 4.15), 0.38, (0.0, 0.95, 0.72, 1.0))
    add_neon_sign("ROOK ATLAS", (2.25, -2.22, 4.15), 0.38, (1.0, 0.66, 0.18, 1.0))
    add_neon_sign("AURA BURST", (0, 4.65, 2.72), 0.38, (0.0, 1.0, 0.68, 1.0))

    bpy.ops.object.light_add(type="AREA", location=(0, -4.25, 5.4))
    bpy.context.object.name = "AuraClash_Playable_KeyLight"
    bpy.context.object.data.energy = 1500
    bpy.context.object.data.size = 5.2
    bpy.ops.object.light_add(type="POINT", location=(-2.4, -2.4, 2.2))
    bpy.context.object.name = "AuraClash_Player_Rim"
    bpy.context.object.data.color = (0.0, 0.95, 0.75)
    bpy.context.object.data.energy = 620
    bpy.ops.object.light_add(type="POINT", location=(2.4, -2.4, 2.2))
    bpy.context.object.name = "AuraClash_Rival_Rim"
    bpy.context.object.data.color = (1.0, 0.58, 0.14)
    bpy.context.object.data.energy = 520
    bpy.ops.object.light_add(type="POINT", location=(0, -2.1, 1.8))
    bpy.context.object.name = "AuraClash_Impact_Core_Light"
    bpy.context.object.data.color = (0.35, 1.0, 0.76)
    bpy.context.object.data.energy = 380
    bpy.ops.object.camera_add(location=(0, -4.35, 2.05), rotation=(math.radians(66), 0, 0))
    bpy.context.object.name = "AuraClash_Playable_Camera"
    bpy.context.object.data.lens = 42
    bpy.context.scene.camera = bpy.context.object
    export_glb(scene_out / "aura-clash-playable-scene.glb")


def build_duel_stage():
    clear_scene()
    duel_pieces = [
        ("Floor_4x4", (0, -1.15, 0), (2.35, 1.9, 1), 0),
        ("Floor_4x4", (-2.45, -1.15, 0), (1.45, 1.9, 1), 0),
        ("Floor_4x4", (2.45, -1.15, 0), (1.45, 1.9, 1), 0),
        ("Roof_4x4", (0, -2.3, 0.05), (2.55, 0.95, 1), 0),
        ("Roof_2x2", (-3.55, -2.34, 0.08), (1.15, 0.92, 1), 0),
        ("Roof_2x2", (3.55, -2.34, 0.08), (1.15, 0.92, 1), 0),
        ("Prop_ACUnit", (-2.95, -2.0, 0.12), (0.7, 0.7, 0.7), 0.35),
        ("Prop_ACUnit", (2.95, -2.0, 0.12), (0.7, 0.7, 0.7), -0.35),
        ("Prop_Bollard", (-3.85, 0.46, 0.05), (0.72, 0.72, 0.72), 0),
        ("Prop_Bollard", (-3.25, 0.46, 0.05), (0.72, 0.72, 0.72), 0),
        ("Prop_Bollard", (3.25, 0.46, 0.05), (0.72, 0.72, 0.72), 0),
        ("Prop_Bollard", (3.85, 0.46, 0.05), (0.72, 0.72, 0.72), 0),
        ("Building_Medium_2_001", (-3.15, 2.05, -0.05), (0.105, 0.105, 0.105), 0.02),
        ("Building_Large_2", (-1.05, 2.16, -0.05), (0.090, 0.090, 0.090), 0),
        ("Building_Small_1", (1.05, 2.02, -0.05), (0.105, 0.105, 0.105), 0),
        ("Building_Medium_2_001", (3.08, 2.08, -0.05), (0.098, 0.098, 0.098), -0.02),
        ("Metal_FullWindow", (-2.35, 1.92, 0.70), (0.16, 0.16, 0.16), 0),
        ("Brick_Window_CurvedDouble", (2.35, 1.90, 0.70), (0.16, 0.16, 0.16), 0),
    ]
    for piece in duel_pieces:
        import_piece(*piece)
    stylize_city_materials()

    back_mat = make_surface_material("AuraClash_DuelStage_Backplate", (0.015, 0.10, 0.09, 0.72), 0.36, 0.08)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 1.35, 1.25))
    back = bpy.context.object
    back.name = "AuraClash_DuelStage_Backplate"
    back.dimensions = (7.4, 0.05, 2.25)
    back.data.materials.append(back_mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    floor_grid = make_emissive_material("AuraClash_DuelStage_Grid", (0.0, 0.95, 0.62, 1.0), 1.25)
    for x in [-3.2, -1.6, 0, 1.6, 3.2]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -1.05, 0.065))
        rail = bpy.context.object
        rail.name = "AuraClash_DuelStage_FloorLine_Z"
        rail.dimensions = (0.025, 3.0, 0.025)
        rail.data.materials.append(floor_grid)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for y in [-2.25, -1.45, -0.65, 0.15]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y, 0.07))
        rail = bpy.context.object
        rail.name = "AuraClash_DuelStage_FloorLine_X"
        rail.dimensions = (6.8, 0.025, 0.025)
        rail.data.materials.append(floor_grid)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    add_neon_sign("AURA CLASH", (0, 1.28, 2.55), 0.42, (0.0, 1.0, 0.68, 1.0))
    add_neon_sign("LIVE AURA3D NODES", (0, 1.22, 2.18), 0.22, (0.28, 0.90, 1.0, 1.0))
    add_fight_fx_ring("AuraClash_DuelStage_Center_Ring", (0, -0.95, 0.08), 0.92, (0.0, 1.0, 0.68, 1.0), math.radians(90))

    bpy.ops.object.light_add(type="AREA", location=(0, -3.0, 4.2))
    bpy.context.object.name = "AuraClash_DuelStage_KeyLight"
    bpy.context.object.data.energy = 700
    bpy.context.object.data.size = 5.5
    export_glb(scene_out / "aura-clash-duel-stage.glb")

load_animation_actions()

for fighter in fighter_defs:
    build_fighter(fighter)

build_arena()
build_duel_stage()
build_playable_scene()

manifest = {
    "schema": "aura-clash.source-glbs/1.0",
    "builtAt": "2026-06-03",
    "outputs": [
        {"id": fighter["id"], "assetKey": fighter["assetKey"], "path": str(fighter["output"].relative_to(app_root))}
        for fighter in fighter_defs
    ] + [
        {"id": "arena-neon-downtown", "assetKey": "arenaNeonDowntown", "path": "assets/source/arenas/arena-neon-downtown.glb"},
        {"id": "aura-clash-duel-stage", "assetKey": "auraClashDuelStage", "path": "assets/source/scenes/aura-clash-duel-stage.glb"},
        {"id": "aura-clash-playable-scene", "assetKey": "auraClashPlayableScene", "path": "assets/source/scenes/aura-clash-playable-scene.glb"},
        {"id": "animation-library-1", "assetKey": "animationLibraryOne", "path": "assets/quaternius-source/selected/animations/UAL1_Standard.glb"},
        {"id": "animation-library-2", "assetKey": "animationLibraryTwo", "path": "assets/quaternius-source/selected/animations/UAL2_Standard.glb"}
    ],
    "notes": [
        "Fighter GLBs are V1 source candidates derived from Quaternius Universal Base Characters and color/scale variations.",
        "Arena GLB is a V1 source candidate composed from selected Downtown City MegaKit glTF pieces plus simple Aura Clash emissive signage/lights."
    ]
}
(app_root / "assets" / "source" / "aura-clash-source-glbs.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Built {len(fighter_defs)} fighter GLBs and 1 arena GLB into {out_dir.relative_to(repo_root)}")
