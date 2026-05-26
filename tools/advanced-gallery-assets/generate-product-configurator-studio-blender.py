import hashlib
import json
import math
import struct
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "fixtures" / "v9" / "assets" / "product-configurator-studio-blender"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "product-configurator-studio-blender.glb"
MANIFEST = OUT_DIR / "manifest.json"


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


def material_uses_emission(material):
    if not material.use_nodes:
        return False
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return False
    strength = bsdf.inputs.get("Emission Strength")
    return bool(strength and strength.default_value > 0)


def material_is_transparent(material):
    return material.blend_method != "OPAQUE"


def write_manifest():
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    light_objects = [obj for obj in bpy.data.objects if obj.type == "LIGHT"]
    camera_objects = [obj for obj in bpy.data.objects if obj.type == "CAMERA"]
    exported = exported_glb_counts(OUT)
    transparent_materials = sorted(material.name for material in bpy.data.materials if material_is_transparent(material))
    emissive_materials = sorted(material.name for material in bpy.data.materials if material_uses_emission(material))
    manifest = {
        "id": "product-configurator-studio-blender",
        "routeUse": "product-configurator",
        "routeLinkage": {
            "routeId": "product-configurator",
            "app": "apps/v9-advanced-examples-gallery",
            "catalogAssetId": "product-configurator-studio-blender",
            "runtimeRole": "support scenery, hotspot markers, swatch stations, and stage/context only",
        },
        "source": {
            "sourceScript": "tools/v9-advanced-gallery-assets/generate-product-configurator-studio-blender.py",
            "generator": "Blender Python procedural mesh generator",
            "inputAssets": [],
            "derivativeOfExternalAsset": False,
            "usesExternalTextures": False,
        },
        "outputs": {
            "glb": file_info(OUT),
            "manifest": {"path": rel(MANIFEST)},
        },
        "generator": "tools/v9-advanced-gallery-assets/generate-product-configurator-studio-blender.py",
        "asset": rel(OUT),
        "status": {
            "generated": True,
            "stub": False,
            "derivative": False,
            "textureBacked": False,
            "generatedNoTexture": True,
            "supportOnly": True,
            "acceptableAsFocalHero": False,
            "acceptedAsPremiumTextureBackedHero": False,
            "visualReviewAccepted": False,
        },
        "intendedRole": "Route-scoped support fixture for Product Configurator: studio context, hotspots, swatches, nameplates, exploded-view guides, and softbox props.",
        "acceptanceBoundary": "This generated/no-texture GLB is support-only. It must not replace the original texture-backed Product hero assets or be used as premium material/PBR evidence unless current screenshots, runtime diagnostics, and human review explicitly accept that limitation.",
        "counts": {
            "meshObjects": len(mesh_objects),
            "drawItems": len(mesh_objects),
            "lightObjects": len(light_objects),
            "cameraObjects": len(camera_objects),
            "materials": len(bpy.data.materials),
            "textureImages": 0,
            "textureBackedMaterials": 0,
            "exportedMaterials": exported["materialCount"],
            "exportedTextures": exported["textureCount"],
            "exportedImages": exported["imageCount"],
            "exportedMeshes": exported["meshCount"],
            "exportedNodes": exported["nodeCount"],
            "exportedTextureBackedMaterials": exported["textureBackedMaterialCount"],
            "transparentMaterials": len(transparent_materials),
            "emissiveMaterials": len(emissive_materials),
        },
        "exportedGlb": exported,
        "materials": {
            "materialCount": len(bpy.data.materials),
            "textureCount": 0,
            "textureBackedMaterialCount": 0,
            "transparentMaterialNames": transparent_materials,
            "emissiveMaterialNames": emissive_materials,
        },
        "supportTruth": {
            "role": "support-only",
            "reason": "Generated procedural support fixture with zero exported texture-backed material evidence.",
            "cannotReplace": [
                "fixtures/threejs-parity/assets/vehicles/car-concept.glb",
                "fixtures/threejs-parity/assets/product/chronograph-watch.glb",
                "fixtures/threejs-parity/assets/product/materials-variants-shoe.glb",
                "fixtures/threejs-parity/assets/product/sunglasses-khronos.glb",
                "texture-backed imported Product material evidence",
                "accepted current-route visual-review screenshots",
            ],
        },
        "limitations": [
            "Generated procedural GLB support fixture only.",
            "Zero texture-backed material evidence in this generated output.",
            "No imported KHR_materials_variants product graph.",
            "No real GLB triangle/raycast product picking.",
            "No true scene-space refraction or physical area-light/contact-shadow proof.",
            "Runtime route composition and original imported assets determine Product acceptance.",
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {MANIFEST}")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def mat(name, color, metallic=0.0, roughness=0.55, emission=None, strength=0.0, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Alpha"].default_value = alpha
        if emission:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        material.blend_method = "BLEND"
        material.show_transparent_back = False
        material.use_screen_refraction = False
        material.alpha_threshold = 0.02
    else:
        material.blend_method = "OPAQUE"
    material["v9_fixture_role"] = "product_configurator_studio_material"
    return material


def assign(obj, material):
    obj.data.materials.append(material)
    return obj


def loc_a3d(value):
    x, y, z = value
    return (x, z, y)


def scale_a3d(value):
    x, y, z = value
    return (x, z, y)


def bevel(obj, amount=0.025, segments=2):
    modifier = obj.modifiers.new("authored softened production edges", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = "EDGES"
    obj.modifiers.new("weighted studio normals", "WEIGHTED_NORMAL")
    return obj


def cube(name, loc, scale, material, bevel_width=0.02, rot=(0, 0, 0), extras=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale_a3d(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel_width:
        bevel(obj, bevel_width)
    if extras:
        for key, value in extras.items():
            obj[key] = value
    return obj


def cylinder(name, loc, radius, depth, material, vertices=48, rot=(0, 0, 0), extras=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted studio normals", "WEIGHTED_NORMAL")
    if extras:
        for key, value in extras.items():
            obj[key] = value
    return obj


def sphere(name, loc, radius, material, segments=32, extras=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=16, radius=radius, location=loc_a3d(loc))
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted studio normals", "WEIGHTED_NORMAL")
    if extras:
        for key, value in extras.items():
            obj[key] = value
    return obj


def torus(name, loc, major, minor, material, rot=(0, 0, 0), extras=None):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=72,
        minor_segments=12,
        major_radius=major,
        minor_radius=minor,
        location=loc_a3d(loc),
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted studio normals", "WEIGHTED_NORMAL")
    if extras:
        for key, value in extras.items():
            obj[key] = value
    return obj


def cone(name, loc, radius1, radius2, depth, material, vertices=36, rot=(0, 0, 0), extras=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted studio normals", "WEIGHTED_NORMAL")
    if extras:
        for key, value in extras.items():
            obj[key] = value
    return obj


def cyclorama(material):
    width = 9.6
    depth = 5.2
    height = 3.4
    radius = 1.25
    cols = 18
    verts = []
    faces = []
    for x_i in range(cols + 1):
        x = -width / 2 + width * x_i / cols
        verts.append((x, -depth / 2, 0.0))
        verts.append((x, -depth / 2 + radius, 0.0))
        for i in range(9):
            t = i / 8
            a = t * math.pi / 2
            y = -depth / 2 + radius - math.cos(a) * radius
            z = math.sin(a) * radius
            verts.append((x, y, z))
        verts.append((x, -depth / 2 + radius, height))
    stride = 12
    for x_i in range(cols):
        base = x_i * stride
        next_base = (x_i + 1) * stride
        for row in range(stride - 1):
            faces.append((base + row, next_base + row, next_base + row + 1, base + row + 1))
    mesh = bpy.data.meshes.new("single piece sweep cyclorama mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("seamless matte cyclorama backdrop", mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    obj.modifiers.new("weighted studio normals", "WEIGHTED_NORMAL")
    obj["v9_fixture_role"] = "studio_backdrop"
    return obj


def add_hotspot(index, label, loc, accent, glass):
    hotspot_extras = {
        "v9_hotspot": label,
        "v9_fixture_role": "configurator_hotspot_marker",
        "v9_configurator_binding": "authored GLB marker; route projects imported marker model matrices for screen-space picking"
    }
    marker = sphere(
        f"hotspot marker {index:02d} {label}",
        loc,
        0.075,
        accent,
        24,
        hotspot_extras,
    )
    torus(
        f"hotspot pulse ring {index:02d} {label}",
        loc,
        0.14,
        0.008,
        glass,
        rot=(math.radians(90), 0, 0),
        extras={**hotspot_extras, "v9_fixture_role": "configurator_hotspot_ring"},
    )
    cube(
        f"hotspot leader line {index:02d} {label}",
        (loc[0] * 0.88, loc[1] - 0.18, loc[2] * 0.88),
        (0.012, 0.38, 0.012),
        glass,
        0.004,
        extras={**hotspot_extras, "v9_fixture_role": "configurator_hotspot_leader"},
    )
    return marker


def add_visible_softbox(prefix, x, y, z, yaw, white, dark, glow):
    cube(f"{prefix} vertical rig stand", (x, y * 0.5, z), (0.055, y, 0.055), dark, 0.012)
    cube(f"{prefix} boom arm", (x * 0.72, y, z), (abs(x) * 0.58, 0.045, 0.045), dark, 0.01, rot=(0, 0, yaw))
    cube(f"{prefix} softbox luminous face", (x * 0.52, y - 0.05, z), (0.9, 0.055, 0.52), glow, 0.025, rot=(0, yaw, 0))
    cube(f"{prefix} softbox black shell", (x * 0.52, y - 0.075, z), (1.02, 0.045, 0.62), dark, 0.025, rot=(0, yaw, 0))
    cube(f"{prefix} diffuser grid left", (x * 0.52 - 0.22, y - 0.025, z), (0.018, 0.03, 0.48), white, 0.003, rot=(0, yaw, 0))
    cube(f"{prefix} diffuser grid right", (x * 0.52 + 0.22, y - 0.025, z), (0.018, 0.03, 0.48), white, 0.003, rot=(0, yaw, 0))


def text_label(name, body, loc, material, size=0.08, rot=(0, 0, 0), extras=None):
    bpy.ops.object.text_add(location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.002
    obj.data.resolution_u = 2
    assign(obj, material)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    obj.modifiers.new("weighted studio normals", "WEIGHTED_NORMAL")
    if extras:
        for key, value in extras.items():
            obj[key] = value
    return obj


def add_component_nameplate(index, label, loc, target, width, mats):
    plate_extras = {"v9_fixture_role": "configurator_component_label", "v9_component_label": label}
    cube(f"named component plate {index:02d} {label}", loc, (width, 0.018, 0.16), mats["plinth_trim"], 0.008, extras=plate_extras)
    text_label(
        f"named component text {index:02d} {label}",
        label.upper(),
        (loc[0], loc[1] + 0.018, loc[2] - 0.006),
        mats["label"],
        0.065,
        extras=plate_extras,
    )
    x0, y0, z0 = loc
    x1, y1, z1 = target
    leader_y = max(y0, min(y1, y0 + 0.24))
    if abs(x1 - x0) > 0.04:
        cube(
            f"named component leader x {index:02d} {label}",
            ((x0 + x1) * 0.5, leader_y, z0),
            (abs(x1 - x0), 0.01, 0.012),
            mats["holo"],
            0.002,
            extras=plate_extras,
        )
    if abs(z1 - z0) > 0.04:
        cube(
            f"named component leader z {index:02d} {label}",
            (x1, leader_y, (z0 + z1) * 0.5),
            (0.012, 0.01, abs(z1 - z0)),
            mats["holo"],
            0.002,
            extras=plate_extras,
        )


def add_material_swatch_station(index, label, part, loc, target, material, mats):
    extras = {
        "v9_fixture_role": "configurator_material_swatch_station",
        "v9_material_swatch": label,
        "v9_target_part": part,
        "v9_configurator_binding": "authored station; route Finish control mutates material uniforms; no KHR_materials_variants in this fixture"
    }
    x, y, z = loc
    cube(f"material swatch station {index:02d} {label} base", (x, y, z), (0.34, 0.045, 0.26), mats["plinth_trim"], 0.014, extras=extras)
    cylinder(f"material swatch station {index:02d} {label} puck", (x, y + 0.07, z), 0.105, 0.05, material, 44, extras=extras)
    torus(
        f"material swatch station {index:02d} {label} selection ring",
        (x, y + 0.102, z),
        0.127,
        0.006,
        mats["accent"] if index % 2 else mats["amber"],
        rot=(math.radians(90), 0, 0),
        extras=extras,
    )
    text_label(
        f"material swatch station {index:02d} {label} label",
        label.upper(),
        (x, y + 0.044, z + 0.19),
        mats["label"],
        0.035,
        extras={**extras, "v9_fixture_role": "material_swatch_label"},
    )
    tx, ty, tz = target
    leader_y = max(y + 0.12, ty - 0.08)
    if abs(tx - x) > 0.04:
        cube(
            f"material swatch station {index:02d} {label} target leader x",
            ((x + tx) * 0.5, leader_y, z),
            (abs(tx - x), 0.018, 0.012),
            mats["holo"],
            0.003,
            extras={**extras, "v9_fixture_role": "configurator_swatch_target_leader"},
        )
    if abs(tz - z) > 0.04:
        cube(
            f"material swatch station {index:02d} {label} target leader z",
            (tx, leader_y, (z + tz) * 0.5),
            (0.012, 0.018, abs(tz - z)),
            mats["holo"],
            0.003,
            extras={**extras, "v9_fixture_role": "configurator_swatch_target_leader"},
        )


def add_hotspot_target(index, label, loc, target, mats):
    extras = {
        "v9_fixture_role": "configurator_hotspot_target",
        "v9_hotspot": label,
        "v9_target_part": label,
        "v9_configurator_binding": "authored target; route projects imported marker model matrices for screen-space picking"
    }
    x, y, z = loc
    torus(
        f"hotspot target ring {index:02d} {label}",
        loc,
        0.17,
        0.007,
        mats["accent"] if index % 2 else mats["amber"],
        rot=(math.radians(90), 0, 0),
        extras=extras,
    )
    cube(f"hotspot target crosshair x {index:02d} {label}", (x, y, z), (0.28, 0.01, 0.012), mats["holo"], 0.002, extras=extras)
    cube(f"hotspot target crosshair z {index:02d} {label}", (x, y, z), (0.012, 0.01, 0.28), mats["holo"], 0.002, extras=extras)
    tx, ty, tz = target
    cube(
        f"hotspot target leader {index:02d} {label}",
        ((x + tx) * 0.5, max(y, ty), (z + tz) * 0.5),
        (max(0.04, abs(tx - x)), 0.012, 0.012),
        mats["holo"],
        0.003,
        extras=extras,
    )


def add_separation_marker(index, label, loc, scale, mats, accent_key="accent"):
    extras = {
        "v9_fixture_role": "configurator_exploded_separation_marker",
        "v9_exploded_part": label,
        "v9_explode_ready": "authored named marker for route explode diagnostics"
    }
    x, y, z = loc
    sx, sy, sz = scale
    cube(f"explode separation rail {index:02d} {label}", loc, scale, mats["holo"], 0.003, extras=extras)
    cube(f"explode separation start tick {index:02d} {label}", (x - sx * 0.5, y, z), (0.012, sy * 2.0, 0.16), mats[accent_key], 0.003, extras=extras)
    cube(f"explode separation end tick {index:02d} {label}", (x + sx * 0.5, y, z), (0.012, sy * 2.0, 0.16), mats[accent_key], 0.003, extras=extras)
    text_label(
        f"explode separation label {index:02d} {label}",
        label.upper(),
        (x, y + 0.032, z + sz * 0.5 + 0.06),
        mats["label"],
        0.038,
        extras=extras,
    )


def add_product_surface_detail(mats, product_extras):
    dark = mats["plinth_trim"]
    light = mats["label"]
    accent = mats["accent"]
    amber = mats["amber"]
    copper = mats["copper"]
    black = mats["black"]

    for i in range(40):
        a = i * math.pi * 2 / 40
        r = 0.422
        tick_len = 0.068 if i % 5 == 0 else 0.04
        cube(
            f"front lens engraved calibration tick {i:02d}",
            (math.cos(a) * r, 1.22 + math.sin(a) * r, 1.075),
            (tick_len, 0.008, 0.01),
            accent if i % 10 == 0 else dark,
            0.001,
            rot=(0, 0, a),
            extras={**product_extras, "v9_fixture_role": "configurator_lens_calibration_detail"},
        )

    for i in range(20):
        a = i * math.pi * 2 / 20
        r = 0.276
        cube(
            f"front retaining ring micro screw slot {i:02d}",
            (math.cos(a) * r, 1.22 + math.sin(a) * r, 0.815),
            (0.048, 0.007, 0.012),
            black if i % 2 else copper,
            0.001,
            rot=(0, 0, a),
            extras={**product_extras, "v9_fixture_role": "configurator_fastener_detail"},
        )

    for i, x in enumerate((-0.31, -0.21, -0.11, 0.0, 0.11, 0.21, 0.31)):
        cube(
            f"front chassis vertical machined groove {i:02d}",
            (x, 1.22, 0.555),
            (0.006, 0.66 - abs(x) * 0.48, 0.012),
            dark,
            0.001,
            extras={**product_extras, "v9_fixture_role": "configurator_chassis_machining_detail"},
        )
    for i, y in enumerate((0.92, 1.02, 1.12, 1.32, 1.42, 1.52)):
        cube(
            f"front chassis horizontal machined groove {i:02d}",
            (0, y, 0.562),
            (0.66 - abs(y - 1.22) * 0.58, 0.006, 0.012),
            dark,
            0.001,
            extras={**product_extras, "v9_fixture_role": "configurator_chassis_machining_detail"},
        )

    for i in range(18):
        x = -0.32 + (i % 6) * 0.13
        z = -1.035 + (i // 6) * 0.075
        length = 0.1 + (i % 3) * 0.045
        cube(
            f"main logic board etched copper trace {i:02d}",
            (x, 1.274 + (i % 2) * 0.008, z),
            (length, 0.007, 0.008),
            copper if i % 4 else accent,
            0.001,
            rot=(0, 0, math.radians(8 if i % 2 else -6)),
            extras={**product_extras, "v9_fixture_role": "configurator_pcb_trace_detail"},
        )
    for i in range(12):
        cube(
            f"rear oled micro pixel bar {i:02d}",
            (0.37 + (i % 4) * 0.07, 1.16 + (i // 4) * 0.055, -1.147),
            (0.044, 0.009, 0.006),
            [mats["screen"], accent, amber][i % 3],
            0.001,
            extras={**product_extras, "v9_fixture_role": "configurator_display_pixel_detail"},
        )

    for side, x in (("left", -0.985), ("right", 0.985)):
        for i in range(12):
            cube(
                f"{side} grip fine raised tread {i:02d}",
                (x, 0.78 + i * 0.07, 0.315),
                (0.026, 0.018, 0.29),
                black if i % 2 else dark,
                0.004,
                extras={**product_extras, "v9_fixture_role": "configurator_grip_texture_detail"},
            )

    for i in range(16):
        a = i * math.pi * 2 / 16
        cube(
            f"mode selector knurled crown notch {i:02d}",
            (-0.22 + math.cos(a) * 0.15, 1.94 + math.sin(a) * 0.15, 0.103),
            (0.032, 0.006, 0.014),
            light if i % 4 == 0 else black,
            0.001,
            rot=(0, 0, a),
            extras={**product_extras, "v9_fixture_role": "configurator_control_knurl_detail"},
        )


def add_turntable_detail(mats):
    for i in range(64):
        a = i * math.pi * 2 / 64
        radius = 1.12 if i % 2 else 1.0
        material = mats["accent"] if i % 16 == 0 else mats["amber"] if i % 8 == 0 else mats["plinth_trim"]
        cube(
            f"turntable engraved radial tick {i:02d}",
            (math.cos(a) * radius, 0.625, math.sin(a) * radius),
            (0.058 if i % 8 else 0.095, 0.008, 0.012),
            material,
            0.001,
            rot=(0, -a, 0),
            extras={"v9_fixture_role": "configurator_turntable_detail"},
        )


def add_rear_measurement_grid(mats):
    extras = {
        "v9_fixture_role": "configurator_non_occluding_measurement_grid",
        "v9_configurator_binding": "authored background detail; does not drive runtime controls"
    }
    for i in range(18):
        y = 0.84 + i * 0.072
        material = mats["accent"] if i % 6 == 0 else mats["floor_dark"]
        cube(
            f"rear technical measurement horizontal line {i:02d}",
            (0, y, -1.505),
            (3.18, 0.006, 0.008),
            material,
            0.001,
            extras=extras,
        )
    for i in range(17):
        x = -1.52 + i * 0.19
        material = mats["amber"] if i % 8 == 0 else mats["floor_dark"]
        cube(
            f"rear technical measurement vertical line {i:02d}",
            (x, 1.42, -1.498),
            (0.006, 1.16, 0.008),
            material,
            0.001,
            extras=extras,
        )
    for i in range(28):
        x = -1.58 + i * 0.118
        cube(
            f"rear technical ruler tick {i:02d}",
            (x, 1.96, -1.486),
            (0.012, 0.055 if i % 4 == 0 else 0.03, 0.01),
            mats["label"] if i % 4 == 0 else mats["accent"],
            0.001,
            extras=extras,
        )
    for side, x in (("left", -2.03), ("right", 2.03)):
        for i in range(16):
            cube(
                f"{side} glass panel precision tick {i:02d}",
                (x, 0.84 + i * 0.07, -0.64 + (i % 4) * 0.18),
                (0.034, 0.006, 0.18 if i % 4 == 0 else 0.1),
                mats["accent"] if i % 3 else mats["amber"],
                0.001,
                extras=extras,
            )


def make_product_parts(mats):
    carbon = mats["carbon"]
    aluminum = mats["aluminum"]
    champagne = mats["champagne"]
    glass = mats["glass"]
    rubber = mats["rubber"]
    copper = mats["copper"]
    pcb = mats["pcb"]
    cobalt = mats["cobalt"]
    black = mats["black"]
    amber = mats["amber"]

    product_extras = {"v9_fixture_role": "exploded_product_part", "v9_product_configurator": "true"}

    cylinder("machined silver main chassis shell", (0, 1.22, 0.02), 0.43, 0.52, aluminum, 96, rot=(math.pi / 2, 0, 0), extras=product_extras)
    cylinder("recessed carbon optical core", (0, 1.22, 0.18), 0.34, 0.58, carbon, 96, rot=(math.pi / 2, 0, 0), extras=product_extras)
    torus("brushed aluminum front chassis bevel", (0, 1.22, 0.52), 0.43, 0.024, aluminum, rot=(math.pi / 2, 0, 0), extras=product_extras)
    torus("black knurled lens control ring", (0, 1.22, 0.66), 0.37, 0.04, black, rot=(math.pi / 2, 0, 0), extras=product_extras)
    torus("polished champagne retaining ring", (0, 1.22, 0.79), 0.315, 0.018, champagne, rot=(math.pi / 2, 0, 0), extras=product_extras)
    cylinder("exploded front sapphire lens glass", (0, 1.22, 0.86), 0.31, 0.045, glass, 96, rot=(math.pi / 2, 0, 0), extras=product_extras)
    cylinder("floating inner optical element", (0, 1.22, 1.03), 0.23, 0.04, glass, 80, rot=(math.pi / 2, 0, 0), extras=product_extras)
    cylinder("small rear optical coating glass", (0, 1.22, 1.16), 0.16, 0.028, mats["accent_glass"], 64, rot=(math.pi / 2, 0, 0), extras=product_extras)
    cylinder("exploded cobalt sensor ceramic plate", (0, 1.22, -0.55), 0.31, 0.05, cobalt, 64, rot=(math.pi / 2, 0, 0), extras=product_extras)
    cylinder("rear blue sensor glass insert", (0, 1.22, -0.61), 0.22, 0.02, glass, 64, rot=(math.pi / 2, 0, 0), extras=product_extras)

    cube("left machined aluminum side spine", (-0.54, 1.22, 0.02), (0.11, 0.82, 0.42), aluminum, 0.04, extras=product_extras)
    cube("right machined aluminum side spine", (0.54, 1.22, 0.02), (0.11, 0.82, 0.42), aluminum, 0.04, extras=product_extras)
    cube("upper champagne structural bridge", (0, 1.62, 0.04), (0.84, 0.11, 0.36), champagne, 0.035, extras=product_extras)
    cube("lower copper thermal bridge", (0, 0.81, 0.0), (0.78, 0.09, 0.34), copper, 0.03, extras=product_extras)
    cube("exploded bottom graphite heat sink", (-0.16, 0.47, 0.18), (0.84, 0.07, 0.45), black, 0.02, extras=product_extras)
    cube("exploded removable battery sled", (0.22, 0.64, -0.28), (0.66, 0.14, 0.34), champagne, 0.03, extras=product_extras)
    cube("battery sled black isolation pad", (0.22, 0.72, -0.28), (0.52, 0.018, 0.24), rubber, 0.01, extras=product_extras)
    for i, x in enumerate((0.02, 0.18, 0.34)):
        cube(f"battery sled copper terminal {i:02d}", (x, 0.735, -0.11), (0.08, 0.012, 0.045), copper, 0.004, extras=product_extras)

    cube("exploded emerald main logic board", (-0.08, 1.22, -0.92), (0.58, 0.032, 0.36), pcb, 0.012, extras=product_extras)
    for i, (x, z, material) in enumerate(
        (
            (-0.31, -0.87, mats["gold"]),
            (-0.17, -0.99, copper),
            (0.02, -0.86, aluminum),
            (0.18, -1.0, cobalt),
            (0.31, -0.9, mats["gold"]),
        )
    ):
        cube(f"logic board raised component {i:02d}", (x, 1.25, z), (0.09, 0.028, 0.07), material, 0.006, extras=product_extras)
    for i, x in enumerate((-0.35, -0.23, -0.11, 0.01, 0.13, 0.25, 0.37)):
        cube(f"logic board gold edge contact {i:02d}", (x, 1.252, -0.72), (0.055, 0.01, 0.085), mats["gold"], 0.003, extras=product_extras)

    cube("exploded transparent rear oled status glass", (0.48, 1.22, -1.12), (0.34, 0.18, 0.018), mats["holo"], 0.01, extras=product_extras)
    for i, y in enumerate((1.28, 1.22, 1.16)):
        cube(f"rear oled live status line {i:02d}", (0.48, y, -1.134), (0.22 - i * 0.035, 0.012, 0.006), mats["screen"], 0.002, extras=product_extras)

    cube("exploded left ribbed rubber grip shell", (-0.78, 1.18, 0.08), (0.18, 0.72, 0.34), rubber, 0.045, extras=product_extras)
    cube("exploded right ribbed rubber grip shell", (0.78, 1.18, 0.08), (0.18, 0.72, 0.34), rubber, 0.045, extras=product_extras)
    cube("thin top command bridge", (0, 1.86, 0.06), (0.64, 0.1, 0.32), aluminum, 0.03, extras=product_extras)
    cylinder("black knurled mode selector dial", (-0.22, 1.94, 0.06), 0.13, 0.06, black, 48, extras=product_extras)
    cylinder("amber illuminated shutter crown", (0.25, 1.95, 0.07), 0.095, 0.055, amber, 40, extras=product_extras)
    cube("thin amber top status slit", (0.03, 1.925, 0.235), (0.22, 0.012, 0.018), amber, 0.004, extras=product_extras)

    for i, (x, y, z) in enumerate(((-0.34, 1.56, -0.58), (0.34, 1.56, -0.58), (-0.38, 0.9, -0.58), (0.38, 0.9, -0.58))):
        cylinder(f"exploded black alignment screw {i:02d}", (x, y, z), 0.03, 0.18, black, 24, rot=(math.pi / 2, 0, 0), extras=product_extras)

    for i in range(12):
        a = i * math.pi * 2 / 12
        sphere(
            f"lens aperture screw highlight {i:02d}",
            (math.cos(a) * 0.265, 1.22 + math.sin(a) * 0.265, 0.84),
            0.015,
            mats["gold"] if i % 2 else black,
            16,
            product_extras,
        )

    # Small authored product details make the imported GLB read as a configured
    # product rather than a plain primitive stack at the gallery camera distance.
    cylinder("premium black aperture well", (0, 1.22, 0.9), 0.22, 0.022, black, 80, rot=(math.pi / 2, 0, 0), extras=product_extras)
    torus("thin cyan lens coating reflection", (0.025, 1.23, 1.04), 0.17, 0.005, mats["accent"], rot=(math.pi / 2, 0, 0), extras=product_extras)
    for i, a in enumerate((math.radians(45), math.radians(135), math.radians(225), math.radians(315))):
        x = math.cos(a) * 0.38
        y = 1.22 + math.sin(a) * 0.38
        cylinder(f"front exploded lens alignment pin {i:02d}", (x, y, 0.86), 0.011, 0.54, mats["accent"], 12, rot=(math.pi / 2, 0, 0), extras=product_extras)
    for i, x in enumerate((-0.28, 0.28)):
        cylinder(f"rear sensor standoff rail {i:02d}", (x, 1.04, -0.76), 0.013, 0.44, mats["holo"], 12, rot=(math.pi / 2, 0, 0), extras=product_extras)
        cylinder(f"upper rear sensor standoff rail {i:02d}", (x, 1.4, -0.76), 0.013, 0.44, mats["holo"], 12, rot=(math.pi / 2, 0, 0), extras=product_extras)

    for side, x in (("left", -0.88), ("right", 0.88)):
        for i in range(5):
            cube(
                f"{side} grip raised rubber rib {i:02d}",
                (x, 0.88 + i * 0.12, 0.28),
                (0.035, 0.045, 0.28),
                black,
                0.012,
                extras=product_extras,
            )
        for i, y in enumerate((0.84, 1.52)):
            cylinder(
                f"{side} grip exposed fastener {i:02d}",
                (x, y, 0.27),
                0.028,
                0.016,
                mats["gold"],
                24,
                rot=(math.pi / 2, 0, 0),
                extras=product_extras,
            )

    add_product_surface_detail(mats, product_extras)


def make_scene():
    clear_scene()

    mats = {
        "floor": mat("cool gray porcelain floor panels", (0.28, 0.3, 0.31, 1), roughness=0.5),
        "floor_dark": mat("recessed graphite floor seams", (0.025, 0.028, 0.032, 1), metallic=0.2, roughness=0.44),
        "backdrop": mat("warm gray seamless studio cyclorama", (0.74, 0.75, 0.72, 1), roughness=0.64),
        "plinth": mat("satin stone hero plinth", (0.68, 0.69, 0.66, 1), roughness=0.38),
        "plinth_trim": mat("brushed black plinth trim", (0.035, 0.038, 0.04, 1), metallic=0.55, roughness=0.27),
        "carbon": mat("deep satin carbon fiber product shell", (0.028, 0.034, 0.038, 1), metallic=0.42, roughness=0.24),
        "aluminum": mat("bead blasted silver aluminum", (0.72, 0.76, 0.76, 1), metallic=0.9, roughness=0.2),
        "champagne": mat("champagne anodized variant", (0.92, 0.7, 0.43, 1), metallic=0.76, roughness=0.23),
        "copper": mat("copper thermal module", (0.9, 0.43, 0.18, 1), metallic=0.82, roughness=0.24),
        "gold": mat("polished gold electrical contacts", (1.0, 0.73, 0.22, 1), metallic=0.85, roughness=0.2),
        "rubber": mat("matte charcoal ribbed grip rubber", (0.01, 0.012, 0.014, 1), roughness=0.82),
        "black": mat("black anodized control hardware", (0.012, 0.015, 0.018, 1), metallic=0.64, roughness=0.25),
        "glass": mat("smoked sapphire transparent glass", (0.07, 0.22, 0.28, 0.34), roughness=0.22, alpha=0.34, emission=(0.0, 0.035, 0.055, 1), strength=0.04),
        "accent_glass": mat("clear cyan coated optical glass", (0.055, 0.34, 0.44, 0.3), roughness=0.24, alpha=0.3, emission=(0.0, 0.06, 0.09, 1), strength=0.07),
        "screen": mat("active oled configurator display", (0.025, 0.12, 0.16, 1), roughness=0.18, emission=(0.02, 0.52, 0.78, 1), strength=1.25),
        "pcb": mat("exposed emerald circuit board", (0.02, 0.3, 0.17, 1), roughness=0.42),
        "cobalt": mat("cobalt sensor ceramic", (0.06, 0.18, 0.38, 1), metallic=0.25, roughness=0.24),
        "accent": mat("cyan hotspot emissive", (0.06, 0.86, 1.0, 1), roughness=0.18, emission=(0.0, 0.64, 1.0, 1), strength=3.2),
        "amber": mat("amber selection state emissive", (1.0, 0.55, 0.12, 1), roughness=0.18, emission=(1.0, 0.33, 0.04, 1), strength=2.8),
        "softbox": mat("warm dim studio diffuser", (0.72, 0.78, 0.78, 1), roughness=0.46, emission=(0.34, 0.48, 0.5, 1), strength=0.62),
        "rig": mat("matte black studio rigging", (0.018, 0.019, 0.02, 1), metallic=0.4, roughness=0.35),
        "holo": mat("transparent configurator ui glass", (0.045, 0.26, 0.34, 0.14), roughness=0.32, alpha=0.14, emission=(0.0, 0.055, 0.075, 1), strength=0.1),
        "label": mat("soft white etched component labels", (0.86, 0.95, 1.0, 1), roughness=0.22, emission=(0.52, 0.82, 1.0, 1), strength=1.35),
        "wall": mat("warm satin rear studio wall", (0.62, 0.63, 0.61, 1), roughness=0.54),
        "wall_shadow": mat("charcoal acoustic side baffle", (0.055, 0.058, 0.062, 1), metallic=0.12, roughness=0.5),
        "walnut": mat("dark walnut material tray", (0.25, 0.14, 0.075, 1), roughness=0.4),
    }

    bpy.context.scene["v9_fixture"] = "product-configurator-studio-blender"
    bpy.context.scene["v9_gallery_target"] = "advanced gallery product configurator"

    # Keep the studio shell segmented and low-profile. A full cyclorama sweep
    # dominated A3D camera bounds and made the product read as a tiny prop.
    cube("single slab studio floor", (0, -0.055, 0.24), (6.2, 0.1, 4.45), mats["floor"], 0.025)
    # Keep rear detail below the sightline. A previous full-height feature wall
    # landed between the gallery camera and product and blocked the entire hero.
    cube("low graphite rear equipment plinth", (0, 0.22, -1.76), (4.75, 0.2, 0.16), mats["floor_dark"], 0.012)
    for i, x in enumerate((-1.8, -0.9, 0.0, 0.9, 1.8)):
        cube(f"short satin rear calibration tile {i:02d}", (x, 0.58, -1.78), (0.42, 0.28, 0.035), mats["wall"], 0.008)
        cube(f"cyan rear tile readout {i:02d}", (x, 0.64, -1.735), (0.28, 0.04, 0.012), mats["holo"], 0.003)
    cube("left low charcoal studio baffle", (-2.42, 0.74, -1.56), (0.1, 0.9, 0.42), mats["wall_shadow"], 0.014, rot=(0, math.radians(-8), 0))
    cube("right low charcoal studio baffle", (2.42, 0.74, -1.56), (0.1, 0.9, 0.42), mats["wall_shadow"], 0.014, rot=(0, math.radians(8), 0))
    cube("thin cyan rear accent shelf", (0, 0.92, -1.72), (1.65, 0.03, 0.026), mats["holo"], 0.005)
    for i in range(4):
        x = -1.35 + i * 0.9
        cube(f"low rear indirect cove {i:02d}", (x, 0.34, -1.42), (0.5, 0.08, 0.06), mats["holo"], 0.01)
    add_rear_measurement_grid(mats)
    for i in range(9):
        x = -4.0 + i
        cube(f"floor panel vertical reveal {i:02d}", (x, 0.012, 0.7), (0.018, 0.018, 6.62), mats["floor_dark"], 0)
    for i in range(6):
        z = -1.85 + i * 0.78
        cube(f"floor panel horizontal reveal {i:02d}", (0, 0.014, z), (7.05, 0.018, 0.018), mats["floor_dark"], 0)
    for i in range(16):
        x = -4.25 + (i % 8) * 1.22
        z = -2.1 + (i // 8) * 1.25
        cube(f"subtle floor reflection tile {i:02d}", (x, 0.022, z), (0.58, 0.008, 0.38), mats["holo"] if i % 5 == 0 else mats["floor"], 0.012)

    cylinder("round rotating hero plinth lower tier", (0, 0.13, 0), 1.32, 0.26, mats["plinth"], 96)
    cylinder("round rotating hero plinth black reveal", (0, 0.32, 0), 1.42, 0.08, mats["plinth_trim"], 96)
    cylinder("round rotating hero plinth upper tier", (0, 0.47, 0), 1.08, 0.22, mats["plinth"], 96)
    torus("thin cyan turntable position ring", (0, 0.95, 0), 0.92, 0.012, mats["accent"], rot=(math.radians(90), 0, 0))
    for i in range(32):
        a = i * math.pi * 2 / 32
        cube(
            f"turntable tick mark {i:02d}",
            (math.cos(a) * 1.17, 0.63, math.sin(a) * 1.17),
            (0.018, 0.018, 0.1 if i % 4 == 0 else 0.055),
            mats["accent"] if i % 4 == 0 else mats["plinth_trim"],
            0.003,
            rot=(0, -a, 0),
        )
    add_turntable_detail(mats)
    cube("front dark walnut material sample tray", (-0.18, 0.55, 1.24), (1.72, 0.08, 0.28), mats["walnut"], 0.025)
    swatches = (
        ("CARBON", -0.78, mats["carbon"]),
        ("ALLOY", -0.42, mats["aluminum"]),
        ("CHAMP", -0.06, mats["champagne"]),
        ("COPPER", 0.3, mats["copper"]),
        ("GLASS", 0.66, mats["glass"]),
    )
    for i, (_, x, material) in enumerate(swatches):
        cylinder(f"front premium material puck {i:02d}", (x, 0.64, 1.24), 0.12, 0.05, material, 40)
    for label, x, _ in swatches:
        text_label(
            f"front material swatch label {label.lower()}",
            label,
            (x, 0.602, 1.435),
            mats["label"],
            0.042,
            extras={"v9_fixture_role": "material_swatch_label", "v9_material_swatch": label},
        )
    add_material_swatch_station(1, "alloy", "chassis shell", (-1.46, 0.68, 1.04), (-0.54, 1.22, 0.02), mats["aluminum"], mats)
    add_material_swatch_station(2, "carbon", "optical core", (-0.58, 0.7, 1.08), (0, 1.22, 0.18), mats["carbon"], mats)
    add_material_swatch_station(3, "rubber", "ribbed grip", (0.58, 0.7, 1.08), (0.78, 1.18, 0.08), mats["rubber"], mats)
    add_material_swatch_station(4, "glass", "sapphire lens", (1.46, 0.68, 1.04), (0, 1.22, 0.86), mats["glass"], mats)

    make_product_parts(mats)

    add_hotspot(1, "lens-material", (0.55, 1.55, 1.1), mats["accent"], mats["holo"])
    add_hotspot(2, "body-finish", (-0.95, 1.45, 0.14), mats["amber"], mats["holo"])
    add_hotspot(3, "sensor-module", (-0.45, 1.55, -0.98), mats["accent"], mats["holo"])
    add_hotspot(4, "battery-sled", (0.54, 0.76, -0.48), mats["amber"], mats["holo"])
    add_hotspot(5, "control-dial", (-0.62, 2.16, -0.18), mats["accent"], mats["holo"])
    add_hotspot_target(1, "lens-material", (0.0, 1.22, 1.08), (0.0, 1.22, 0.86), mats)
    add_hotspot_target(2, "body-finish", (-0.78, 1.18, 0.34), (-0.54, 1.22, 0.02), mats)
    add_hotspot_target(3, "sensor-module", (-0.05, 1.22, -0.72), (0.0, 1.22, -0.58), mats)
    add_hotspot_target(4, "battery-sled", (0.3, 0.78, -0.46), (0.22, 0.64, -0.28), mats)
    add_hotspot_target(5, "control-dial", (-0.22, 1.95, 0.28), (-0.22, 1.94, 0.06), mats)

    add_component_nameplate(1, "lens", (1.34, 0.98, 1.08), (0.12, 1.22, 0.88), 0.44, mats)
    add_component_nameplate(2, "sensor", (-1.36, 1.02, -0.98), (0, 1.22, -0.58), 0.48, mats)
    add_component_nameplate(3, "battery", (1.22, 0.7, -0.76), (0.22, 0.64, -0.28), 0.5, mats)
    add_component_nameplate(4, "ribbed grip", (-1.42, 0.84, 0.56), (-0.78, 1.18, 0.08), 0.58, mats)
    add_component_nameplate(5, "oled", (1.44, 1.0, -1.14), (0.48, 1.22, -1.12), 0.4, mats)
    add_separation_marker(1, "lens module", (0.06, 1.04, 1.04), (0.72, 0.014, 0.02), mats, "accent")
    add_separation_marker(2, "sensor stack", (-0.06, 1.04, -0.7), (0.68, 0.014, 0.02), mats, "accent")
    add_separation_marker(3, "battery sled", (0.46, 0.72, -0.32), (0.54, 0.014, 0.02), mats, "amber")
    add_separation_marker(4, "grip shells", (0.0, 0.98, 0.5), (1.52, 0.014, 0.02), mats, "amber")

    for i, z in enumerate((-1.05, -0.48, 0.09, 0.66)):
        cube(f"floating material swatch rail {i:02d}", (-2.05, 0.94 + i * 0.07, z), (0.08, 0.28, 0.34), mats["plinth_trim"], 0.012)
        sphere(f"variant swatch carbon {i:02d}", (-2.05, 1.17 + i * 0.07, z - 0.11), 0.072, mats["carbon"], 24)
        sphere(f"variant swatch silver {i:02d}", (-2.05, 1.17 + i * 0.07, z + 0.02), 0.072, mats["aluminum"], 24)
        sphere(f"variant swatch champagne {i:02d}", (-2.05, 1.17 + i * 0.07, z + 0.15), 0.072, mats["champagne"], 24)

    cube("transparent configurator spec panel left", (-2.18, 1.48, -0.1), (0.04, 0.98, 1.22), mats["holo"], 0.016)
    cube("transparent exploded order panel right", (2.18, 1.34, -0.05), (0.04, 0.78, 1.08), mats["holo"], 0.016)
    for side, x, y_center, z_center, height, depth in (("left", -2.18, 1.48, -0.1, 0.98, 1.22), ("right", 2.18, 1.34, -0.05, 0.78, 1.08)):
        cube(f"{side} configurator glass panel top black frame", (x, y_center + height * 0.5, z_center), (0.06, 0.028, depth), mats["plinth_trim"], 0.005)
        cube(f"{side} configurator glass panel bottom black frame", (x, y_center - height * 0.5, z_center), (0.06, 0.028, depth), mats["plinth_trim"], 0.005)
        cube(f"{side} configurator glass panel front black frame", (x, y_center, z_center + depth * 0.5), (0.06, height, 0.024), mats["plinth_trim"], 0.005)
        cube(f"{side} configurator glass panel rear black frame", (x, y_center, z_center - depth * 0.5), (0.06, height, 0.024), mats["plinth_trim"], 0.005)
    for i in range(7):
        cube(f"left panel ui row {i:02d}", (-2.79, 2.12 - i * 0.16, -0.68 + (i % 2) * 0.18), (0.026, 0.026, 0.74 - i * 0.045), mats["accent"] if i % 2 else mats["screen"], 0.004)
    for i in range(6):
        cube(f"right panel exploded depth bar {i:02d}", (2.79, 1.86 - i * 0.13, -0.52 + i * 0.18), (0.026, 0.024, 0.28 + i * 0.05), mats["amber"] if i % 2 else mats["accent"], 0.004)

    for i, x in enumerate((-3.7, -2.9, 2.9, 3.7)):
        cube(f"floor mounted cyan inspection trough {i:02d}", (x, 0.045, 2.35), (0.52, 0.04, 0.08), mats["holo"], 0.012)
        cube(f"floor mounted trough housing {i:02d}", (x, 0.02, 2.35), (0.64, 0.04, 0.15), mats["rig"], 0.012)

    add_visible_softbox("camera left key light rig", -3.05, 2.12, 0.45, math.radians(-14), mats["floor"], mats["rig"], mats["softbox"])
    add_visible_softbox("camera right rim light rig", 3.05, 2.0, -0.6, math.radians(16), mats["floor"], mats["rig"], mats["softbox"])
    cube("overhead rectangular softbox frame", (0, 2.35, 0.18), (1.85, 0.06, 0.84), mats["rig"], 0.018)
    cube("overhead rectangular softbox luminous diffuser", (0, 2.31, 0.18), (1.64, 0.035, 0.66), mats["softbox"], 0.012)
    for x in (-1.1, 1.1):
        cube(f"overhead suspension cable {x}", (x * 0.72, 2.34, 0.18), (0.022, 0.2, 0.022), mats["rig"], 0.004)

    for i in range(12):
        a = -0.55 + i * 0.1
        cube(
            f"exploded view ghost guide rail {i:02d}",
            (math.sin(a) * 1.64, 1.08 + i * 0.065, -0.72 + i * 0.17),
            (0.016, 0.016, 0.48),
            mats["holo"],
            0.003,
            rot=(0, -a, 0),
        )

    bpy.ops.object.light_add(type="AREA", location=(0, 2.4, 4.3))
    bpy.context.object.name = "large front studio beauty softbox"
    bpy.context.object.data.energy = 680
    bpy.context.object.data.size = 4.8
    bpy.ops.object.light_add(type="AREA", location=(-3.4, -0.3, 2.6))
    bpy.context.object.name = "left sculpting strip softbox"
    bpy.context.object.data.energy = 330
    bpy.context.object.data.size = 2.2
    bpy.context.object.data.color = (0.82, 0.95, 1.0)
    bpy.ops.object.light_add(type="POINT", location=(0.0, 0.55, 1.3))
    bpy.context.object.name = "cyan plinth accent point light"
    bpy.context.object.data.energy = 80
    bpy.context.object.data.color = (0.1, 0.72, 1.0)

    bpy.ops.object.camera_add(location=(4.35, 2.45, 4.45), rotation=(math.radians(60), 0, math.radians(42)))
    camera = bpy.context.object
    camera.name = "product configurator hero camera"
    camera.data.lens = 35
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 5.5
    camera.data.dof.aperture_fstop = 5.6
    bpy.context.scene.camera = camera

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.world.color = (0.78, 0.78, 0.76)

    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        export_apply=True,
        export_extras=True,
        export_cameras=True,
        export_lights=True,
    )

    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    print(f"wrote {OUT}")
    print(f"objects={len(bpy.data.objects)} mesh_objects={len(mesh_objects)} materials={len(bpy.data.materials)}")
    write_manifest()


make_scene()
