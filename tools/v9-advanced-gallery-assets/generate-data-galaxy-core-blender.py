import hashlib
import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "fixtures" / "v9" / "assets" / "data-galaxy-core-blender"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT = OUT_DIR / "data-galaxy-core-blender.glb"
MANIFEST = OUT_DIR / "manifest.json"
README = OUT_DIR / "README.md"


def rel(path):
    return str(path.relative_to(ROOT))


def file_info(path):
    if not path.exists():
        return {
            "path": rel(path),
            "exists": False,
        }
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "path": rel(path),
        "exists": True,
        "byteSize": path.stat().st_size,
        "sha256": digest.hexdigest(),
    }


def count_texture_images():
    images = set()
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                images.add(node.image.name)
    return len(images)


def count_texture_backed_materials(materials):
    total = 0
    for material in materials:
        if not material.use_nodes:
            continue
        has_texture = any(node.type == "TEX_IMAGE" for node in material.node_tree.nodes)
        if has_texture:
            total += 1
    return total


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
        raise ValueError(f"{path} is not a GLB file")
    offset = 12
    gltf = None
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(chunk.rstrip(b"\x00").decode("utf-8"))
            break
    if gltf is None:
        raise ValueError(f"{path} does not contain a GLB JSON chunk")
    materials = gltf.get("materials", [])
    texture_backed_materials = sum(1 for material in materials if material_references_texture(material))
    return {
        "materialCount": len(materials),
        "textureCount": len(gltf.get("textures", [])),
        "imageCount": len(gltf.get("images", [])),
        "meshCount": len(gltf.get("meshes", [])),
        "nodeCount": len(gltf.get("nodes", [])),
        "textureBackedMaterialCount": texture_backed_materials,
    }


def material_references_texture(value):
    if isinstance(value, dict):
        if isinstance(value.get("index"), int):
            return True
        return any(material_references_texture(child) for child in value.values())
    if isinstance(value, list):
        return any(material_references_texture(child) for child in value)
    return False


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
    material.blend_method = "BLEND" if alpha < 1.0 else "OPAQUE"
    material.use_screen_refraction = False
    material.show_transparent_back = False
    material["authored_alpha"] = alpha
    return material


def data_texture(name, base, accent, width=64, height=64):
    image = bpy.data.images.new(name, width=width, height=height, alpha=True)
    pixels = []
    for y in range(height):
        for x in range(width):
            grid = 1.0 if x % 16 == 0 or y % 16 == 0 else 0.0
            diagonal = 1.0 if (x + y) % 23 < 2 else 0.0
            packet = 1.0 if ((x * 17 + y * 31) % 97) < 5 else 0.0
            t = max(grid * 0.75, diagonal * 0.55, packet)
            pulse = 0.12 + 0.18 * math.sin((x * 0.37) + (y * 0.21))
            pixels.extend((
                min(1.0, base[0] * (0.72 + pulse) + accent[0] * t),
                min(1.0, base[1] * (0.72 + pulse) + accent[1] * t),
                min(1.0, base[2] * (0.72 + pulse) + accent[2] * t),
                1.0,
            ))
    image.pixels.foreach_set(pixels)
    image.pack()
    image["v9_generated_texture_role"] = "embedded route-native data glyph texture"
    return image


def attach_base_color_texture(material, image):
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        return material
    tex = nodes.new(type="ShaderNodeTexImage")
    tex.name = f"{image.name} sampler"
    tex.image = image
    material.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    material["v9_texture_backed"] = True
    return material


def assign(obj, material):
    obj.data.materials.append(material)
    return obj


def loc_g3d(value):
    x, y, z = value
    return (x, z, y)


def scale_g3d(value):
    x, y, z = value
    return (x, z, y)


def bevel(obj, amount=0.018, segments=2):
    modifier = obj.modifiers.new("authored softened edges", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = "EDGES"
    obj.modifiers.new("authored weighted normals", "WEIGHTED_NORMAL")
    return obj


def cube(name, loc, scale, material, bevel_width=0.016, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc_g3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale_g3d(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel_width:
        bevel(obj, bevel_width)
    return obj


def sphere(name, loc, radius, material, segments=48, ring_count=24):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=ring_count,
        radius=radius,
        location=loc_g3d(loc),
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("authored weighted normals", "WEIGHTED_NORMAL")
    return obj


def ico(name, loc, radius, material, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=loc_g3d(loc))
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("authored weighted normals", "WEIGHTED_NORMAL")
    return obj


def batch_meshes_by_material():
    """Export-time draw-call batching for static authored galaxy structures."""
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        material = obj.data.materials[0]
        authored_alpha = float(material.get("authored_alpha", 1.0))
        # G3D sorts transparent renderables per object. Joining distant glass
        # panels into one mesh creates a single unsortable alpha slab, which is
        # exactly the noisy scaffold artifact visible in the data-galaxy shots.
        if authored_alpha < 0.999 or material.blend_method == "BLEND":
            obj["g3d_transparency_sort_unit"] = "kept separate for renderer alpha sorting"
            continue
        groups.setdefault(material.name, []).append(obj)

    for material_name, objects in groups.items():
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            for modifier in list(obj.modifiers):
                try:
                    bpy.ops.object.modifier_apply(modifier=modifier.name)
                except RuntimeError:
                    pass
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        bpy.context.object.name = f"batched {material_name}"


def cylinder(name, loc, radius, depth, material, vertices=48, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=loc_g3d(loc),
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("authored weighted normals", "WEIGHTED_NORMAL")
    return obj


def torus(name, loc, major, minor, material, rot=(0, 0, 0), major_segments=160, minor_segments=10):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=major_segments,
        minor_segments=minor_segments,
        major_radius=major,
        minor_radius=minor,
        location=loc_g3d(loc),
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("authored weighted normals", "WEIGHTED_NORMAL")
    return obj


def cylinder_between(name, a, b, radius, material, vertices=12):
    av = Vector(loc_g3d(a))
    bv = Vector(loc_g3d(b))
    mid = (av + bv) * 0.5
    direction = bv - av
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=mid)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    assign(obj, material)
    obj.modifiers.new("authored weighted normals", "WEIGHTED_NORMAL")
    return obj


def ring_points(radius_x, radius_z, y, count, phase=0.0):
    points = []
    for i in range(count):
        a = phase + i * math.tau / count
        points.append((math.cos(a) * radius_x, y, math.sin(a) * radius_z))
    return points


def make_cluster_frame(prefix, center, radius, material, accent_material, node_material, phase=0.0):
    cx, cy, cz = center
    pts = []
    for i in range(6):
        a = phase + i * math.tau / 6
        pts.append((cx + math.cos(a) * radius, cy + math.sin(i * 0.7) * 0.1, cz + math.sin(a) * radius * 0.72))
    top = (cx, cy + radius * 0.62, cz)
    bottom = (cx, cy - radius * 0.42, cz)
    for i, point in enumerate(pts):
        sphere(f"{prefix} frame node {i:02d}", point, 0.046, node_material, 16, 8)
        cylinder_between(f"{prefix} hex rail {i:02d}", point, pts[(i + 1) % len(pts)], 0.010, material, 8)
        cylinder_between(f"{prefix} upper spoke {i:02d}", point, top, 0.007, accent_material, 8)
        cylinder_between(f"{prefix} lower spoke {i:02d}", point, bottom, 0.006, material, 8)
    sphere(f"{prefix} upper attractor node", top, 0.064, accent_material, 18, 9)
    sphere(f"{prefix} lower anchor node", bottom, 0.04, material, 14, 7)
    cube(f"{prefix} translucent analytics plate", (cx, cy + radius * 0.1, cz), (radius * 0.78, 0.012, radius * 0.32), accent_material, 0.004, rot=(0.13, -phase, 0.04))
    return top


def make_formation_control_glyphs(materials):
    """Four authored formation glyphs: galaxy, vortex, network, and wave."""
    rail = materials["rail"]
    graphite = materials["graphite"]
    cyan = materials["cyan"]
    blue = materials["blue"]
    violet = materials["violet"]
    amber = materials["amber"]
    white = materials["white"]
    glass_cyan = materials["glass_cyan"]
    glass_violet = materials["glass_violet"]
    glass_amber = materials["glass_amber"]

    stations = [
        ("galaxy", (-4.15, 0.16, -3.1), cyan, glass_cyan, 0.0),
        ("vortex", (4.15, 0.16, -3.1), violet, glass_violet, math.pi * 0.5),
        ("network", (-4.15, 0.16, 3.1), amber, glass_amber, math.pi),
        ("wave", (4.15, 0.16, 3.1), blue, glass_cyan, math.pi * 1.5),
    ]

    for name, origin, glow, glass, yaw in stations:
        ox, oy, oz = origin
        cube(f"{name} formation control plinth", origin, (0.84, 0.12, 0.62), graphite, 0.018, rot=(0, -yaw, 0))
        cube(f"{name} formation luminous selector slot", (ox, oy + 0.08, oz), (0.68, 0.025, 0.08), glow, 0.004, rot=(0, -yaw, 0))
        cube(f"{name} formation translucent readout pane", (ox, oy + 0.38, oz + 0.18), (0.62, 0.018, 0.32), glass, 0.006, rot=(0.35, -yaw, 0.04))
        cylinder(f"{name} formation local vertical bus", (ox, oy + 0.38, oz - 0.24), 0.012, 0.72, glow, 12)
        sphere(f"{name} formation selector node", (ox, oy + 0.78, oz - 0.24), 0.055, glow, 18, 9)

    # Galaxy glyph: nested tilted orbits and seed nodes.
    for i in range(6):
        radius = 0.18 + i * 0.055
        torus(
            f"galaxy formation miniature orbit {i:02d}",
            (-4.15, 0.58 + i * 0.025, -3.1),
            radius,
            0.004,
            [cyan, blue, violet][i % 3],
            rot=(math.radians(72 + i * 5), math.radians(i * 18), math.radians(18)),
            major_segments=72,
            minor_segments=5,
        )
    for i in range(18):
        a = i * math.tau / 18
        r = 0.16 + (i % 5) * 0.045
        sphere(f"galaxy formation seed {i:02d}", (-4.15 + math.cos(a) * r, 0.58 + math.sin(i) * 0.05, -3.1 + math.sin(a) * r * 0.72), 0.014, [cyan, white, blue][i % 3], 10, 5)

    # Vortex glyph: stacked narrowing rings with a descending amber anomaly trace.
    previous = None
    for i in range(9):
        y = 0.38 + i * 0.075
        radius = 0.34 - i * 0.026
        center = (4.15, y, -3.1)
        torus(
            f"vortex formation compression ring {i:02d}",
            center,
            radius,
            0.004,
            [violet, cyan, blue][i % 3],
            rot=(math.radians(86), math.radians(i * 16), 0),
            major_segments=64,
            minor_segments=5,
        )
        bead = (4.15 + math.cos(i * 0.92) * radius, y, -3.1 + math.sin(i * 0.92) * radius * 0.72)
        sphere(f"vortex formation falling bead {i:02d}", bead, 0.017, [violet, amber, white][i % 3], 10, 5)
        if previous:
            cylinder_between(f"vortex formation helical trace {i:02d}", previous, bead, 0.0045, glass_violet, 8)
        previous = bead

    # Network glyph: six nodes with explicit cross-links.
    network_nodes = []
    for i in range(6):
        a = i * math.tau / 6
        point = (-4.15 + math.cos(a) * 0.34, 0.58 + math.sin(i * 1.7) * 0.05, 3.1 + math.sin(a) * 0.24)
        network_nodes.append(point)
        sphere(f"network formation mini node {i:02d}", point, 0.027, [amber, cyan, white][i % 3], 14, 7)
    for i, point in enumerate(network_nodes):
        cylinder_between(f"network formation explicit edge {i:02d}", point, network_nodes[(i + 1) % len(network_nodes)], 0.005, glass_amber, 8)
        cylinder_between(f"network formation cross edge {i:02d}", point, network_nodes[(i + 3) % len(network_nodes)], 0.0035, rail if i % 2 else amber, 8)

    # Wave glyph: layered sampled wavefronts.
    for row in range(5):
        last = None
        for col in range(9):
            x = 4.15 - 0.36 + col * 0.09
            z = 3.1 - 0.22 + row * 0.1
            y = 0.52 + math.sin(col * 0.95 + row * 0.48) * 0.09
            point = (x, y, z)
            sphere(f"wave formation sample {row:02d} {col:02d}", point, 0.012 + row * 0.0015, [blue, cyan, white][(row + col) % 3], 8, 4)
            if last:
                cylinder_between(f"wave formation sampled ridge {row:02d} {col:02d}", last, point, 0.0035, [blue, glass_cyan][(row + col) % 2], 8)
            last = point


def make_connection_loom(materials, cluster_centers, cluster_tops):
    cyan = materials["cyan"]
    blue = materials["blue"]
    violet = materials["violet"]
    amber = materials["amber"]
    white = materials["white"]
    glass_cyan = materials["glass_cyan"]
    glass_violet = materials["glass_violet"]
    glass_amber = materials["glass_amber"]
    rail = materials["rail"]

    for band in range(3):
        radius = 1.55 + band * 0.42
        y = 0.28 + band * 0.22
        points = ring_points(radius, radius * 0.72, y, 12, phase=band * 0.19)
        for i, point in enumerate(points):
            material = [glass_cyan, glass_violet, glass_amber, rail][(i + band) % 4]
            cylinder_between(f"central connection loom band {band:02d} segment {i:02d}", point, points[(i + 1) % len(points)], 0.0045 + band * 0.0007, material, 8)
            if i % 3 == 0:
                sphere(f"central connection loom packet {band:02d} {i:02d}", point, 0.019 + band * 0.002, [cyan, violet, amber, white][(i + band) % 4], 10, 5)

    for i, center in enumerate(cluster_centers):
        top = cluster_tops[i]
        relay_angle = i * math.tau / len(cluster_centers) + 0.28
        relay = (math.cos(relay_angle) * 1.82, 1.05 + (i % 3) * 0.16, math.sin(relay_angle) * 1.28)
        sphere(f"semantic relay packet node {i:02d}", relay, 0.043, [cyan, blue, violet, amber, white, cyan][i], 16, 8)
        cylinder_between(f"semantic relay core ingress {i:02d}", (0, 1.02, 0), relay, 0.0065, [glass_cyan, glass_violet, glass_amber][i % 3], 8)
        cylinder_between(f"semantic relay cluster egress {i:02d}", relay, top, 0.006, [cyan, violet, amber][i % 3], 8)
        cylinder_between(f"semantic relay floor audit link {i:02d}", (center[0], 0.12, center[2]), relay, 0.0035, rail, 8)


def make_scene():
    clear_scene()

    cyan_grid_texture = data_texture("embedded cyan data-glyph atlas", (0.02, 0.18, 0.22), (0.0, 0.9, 1.0))
    violet_grid_texture = data_texture("embedded violet model-state atlas", (0.08, 0.04, 0.18), (0.62, 0.22, 1.0))
    amber_grid_texture = data_texture("embedded amber anomaly atlas", (0.18, 0.08, 0.02), (1.0, 0.48, 0.08))

    floor = mat("deep graphite observatory deck", (0.018, 0.023, 0.032, 1), metallic=0.4, roughness=0.32)
    rail = mat("brushed dark titanium", (0.28, 0.34, 0.38, 1), metallic=0.82, roughness=0.2)
    graphite = mat("black ceramic data housing", (0.006, 0.008, 0.012, 1), metallic=0.35, roughness=0.4)
    cyan = attach_base_color_texture(mat("cyan neural emission", (0.08, 0.72, 0.88, 1), roughness=0.28, emission=(0.0, 0.58, 0.82, 1), strength=1.6), cyan_grid_texture)
    blue = mat("deep blue inference emission", (0.08, 0.28, 0.82, 1), roughness=0.32, emission=(0.02, 0.16, 0.72, 1), strength=1.25)
    violet = attach_base_color_texture(mat("violet model-state emission", (0.48, 0.22, 0.92, 1), roughness=0.32, emission=(0.28, 0.08, 0.78, 1), strength=1.35), violet_grid_texture)
    amber = attach_base_color_texture(mat("amber anomaly emission", (0.86, 0.44, 0.12, 1), roughness=0.35, emission=(0.72, 0.22, 0.02, 1), strength=1.15), amber_grid_texture)
    white = mat("white hot data pin", (0.72, 0.88, 0.94, 1), roughness=0.26, emission=(0.38, 0.52, 0.62, 1), strength=0.9)
    glass_cyan = mat("translucent cyan vector glass", (0.06, 0.5, 0.62, 0.14), roughness=0.22, alpha=0.14, emission=(0.0, 0.24, 0.42, 1), strength=0.28)
    glass_violet = mat("translucent violet model glass", (0.32, 0.14, 0.62, 0.13), roughness=0.22, alpha=0.13, emission=(0.16, 0.04, 0.44, 1), strength=0.26)
    glass_amber = mat("translucent amber alert glass", (0.72, 0.32, 0.06, 0.12), roughness=0.24, alpha=0.12, emission=(0.46, 0.12, 0.0, 1), strength=0.24)
    materials = {
        "rail": rail,
        "graphite": graphite,
        "cyan": cyan,
        "blue": blue,
        "violet": violet,
        "amber": amber,
        "white": white,
        "glass_cyan": glass_cyan,
        "glass_violet": glass_violet,
        "glass_amber": glass_amber,
    }

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 96
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.world = bpy.data.worlds.new("dark data galaxy world")
    bpy.context.scene.world.color = (0.004, 0.006, 0.012)

    cube("authored data galaxy platform", (0, -0.22, 0), (10.2, 0.12, 8.2), floor, 0.045)
    for i, z in enumerate([0, 1.2, -1.2, 2.4, -2.4, 3.55, -3.55]):
        material = blue if i % 2 else cyan
        cube(f"floor latitude data trace {i:02d}", (0, -0.13, z), (9.4, 0.018, 0.024), material, 0.003)
    for i, x in enumerate([0, 1.15, -1.15, 2.3, -2.3, 3.45, -3.45, 4.55, -4.55]):
        material = violet if i % 3 == 0 else cyan
        cube(f"floor longitude data trace {i:02d}", (x, -0.125, 0), (0.026, 0.018, 7.5), material, 0.003)
    cube("positive x axis luminous spine", (4.75, -0.08, 0), (0.72, 0.035, 0.055), amber, 0.004)
    cube("positive z axis luminous spine", (0, -0.08, 3.75), (0.055, 0.035, 0.72), amber, 0.004)
    cylinder("vertical inference axis", (0, 1.55, 0), 0.028, 3.85, white, 18)

    sphere("central translucent data core shell", (0, 0.88, 0), 0.88, glass_cyan, 64, 32)
    ico("central faceted AI data core", (0, 0.88, 0), 0.56, cyan, 3)
    sphere("inner amber anomaly kernel", (0.12, 0.91, -0.08), 0.2, amber, 32, 16)
    for idx, (y, major, minor, material, tilt) in enumerate([
        (0.44, 1.38, 0.018, cyan, 90),
        (0.72, 1.78, 0.014, violet, 78),
        (1.04, 1.18, 0.016, blue, 102),
        (1.34, 2.08, 0.012, amber, 66),
        (1.66, 0.92, 0.014, cyan, 114),
    ]):
        torus(
            f"layered orbital data ring {idx:02d}",
            (0, y, 0),
            major,
            minor,
            material,
            rot=(math.radians(tilt), math.radians(idx * 14), math.radians(idx * 9)),
        )

    for i in range(24):
        a = i * math.tau / 24
        radius = 1.05 + (i % 7) * 0.18
        y = 0.36 + (i % 9) * 0.16
        material = [cyan, blue, violet, white, amber][i % 5]
        sphere(
            f"curated orbiting datum {i:02d}",
            (math.cos(a) * radius, y, math.sin(a * 1.11) * radius * 0.76),
            0.033 + (i % 3) * 0.009,
            material,
            16,
            8,
        )

    cluster_centers = [
        (-2.85, 0.82, -1.9),
        (-2.95, 1.02, 1.86),
        (2.78, 0.92, -1.72),
        (2.95, 1.12, 1.94),
    ]
    cluster_tops = []
    for i, center in enumerate(cluster_centers):
        accent = [glass_cyan, glass_violet, glass_amber][i % 3]
        node = [cyan, violet, amber, blue, white, cyan][i]
        top = make_cluster_frame(f"authored semantic cluster {i:02d}", center, 0.72 + (i % 2) * 0.16, rail, accent, node, phase=i * 0.41)
        cluster_tops.append(top)
        cylinder_between(f"primary connection corridor core to cluster {i:02d}", (0, 0.92, 0), center, 0.018, [cyan, violet, blue][i % 3])
        cylinder_between(f"secondary faint connection corridor {i:02d}", (0, 1.36, 0), top, 0.009, accent)

    make_formation_control_glyphs(materials)
    make_connection_loom(materials, cluster_centers, cluster_tops)

    for i, point in enumerate(ring_points(4.1, 3.1, 0.0, 8, phase=0.16)):
        px, _, pz = point
        height = 1.35 + (i % 4) * 0.22
        material = graphite if i % 2 else rail
        cube(f"outer attractor pylon body {i:02d}", (px, height * 0.42, pz), (0.12, height * 0.86, 0.12), material, 0.018, rot=(0, -math.atan2(pz, px), 0))
        cube(f"outer attractor pylon light slit {i:02d}", (px * 0.995, height * 0.63, pz * 0.995), (0.022, height * 0.36, 0.02), [cyan, violet, amber][i % 3], 0.003, rot=(0, -math.atan2(pz, px), 0))
        sphere(f"outer attractor cap node {i:02d}", (px, height + 0.12, pz), 0.052, [cyan, violet, amber, blue][i % 4], 16, 8)
        cylinder_between(f"pylon radial gravity beam {i:02d}", (px, height + 0.08, pz), (0, 1.12, 0), 0.0045, [glass_cyan, glass_violet, glass_amber][i % 3], 8)

    for i in range(10):
        a = i * math.tau / 10
        radius = 3.9 + (i % 4) * 0.18
        y = 1.7 + math.sin(i * 0.53) * 0.38
        panel = [glass_cyan, glass_violet, glass_amber][i % 3]
        cube(
            f"floating translucent analytics panel {i:02d}",
            (math.cos(a) * radius, y, math.sin(a) * radius * 0.72),
            (0.48, 0.018, 0.28 + (i % 3) * 0.06),
            panel,
            0.006,
            rot=(0.22, -a, 0.08),
        )
        for j in range(3):
            cube(
                f"panel micro bar {i:02d} {j:02d}",
                (math.cos(a) * (radius - 0.02), y + 0.04 * j - 0.04, math.sin(a) * radius * 0.72),
                (0.18 + j * 0.05, 0.011, 0.012),
                [cyan, blue, violet][j],
                0.002,
                rot=(0.22, -a, 0.08),
            )

    for i in range(5):
        radius = 2.55 + i * 0.45
        material = [glass_cyan, glass_violet, glass_amber, glass_cyan, glass_violet][i]
        torus(
            f"floor holographic density contour {i:02d}",
            (0, -0.04 + i * 0.015, 0),
            radius,
            0.006,
            material,
            rot=(math.radians(90), 0, 0),
            major_segments=180,
            minor_segments=6,
        )

    for i in range(32):
        a = i * 0.61
        r = 2.0 + (i % 12) * 0.22
        y = 0.28 + (i % 10) * 0.18
        material = [cyan, blue, violet, white, amber][(i * 2) % 5]
        sphere(f"authored galaxy signal bead {i:02d}", (math.cos(a) * r, y, math.sin(a * 0.91) * r * 0.82), 0.018 + (i % 4) * 0.006, material, 12, 6)

    for i in range(16):
        start = cluster_centers[i % len(cluster_centers)]
        end = cluster_centers[(i * 3 + 2) % len(cluster_centers)]
        y_offset = 0.25 + (i % 3) * 0.12
        cylinder_between(
            f"intercluster luminous transfer corridor {i:02d}",
            (start[0], start[1] + y_offset, start[2]),
            (end[0], end[1] + y_offset * 0.7, end[2]),
            0.006,
            [glass_cyan, glass_violet, glass_amber, cyan][i % 4],
            vertices=8,
        )

    bpy.ops.object.light_add(type="POINT", location=(0, -4.2, 5.2))
    bpy.context.object.name = "broad upper reflection point light"
    bpy.context.object.data.energy = 520
    bpy.context.object.data.shadow_soft_size = 6.5
    bpy.ops.object.light_add(type="POINT", location=(0, 0, 1.25))
    bpy.context.object.name = "central cyan core point light"
    bpy.context.object.data.energy = 420
    bpy.context.object.data.color = (0.35, 0.9, 1.0)
    bpy.ops.object.light_add(type="POINT", location=(-3.2, 2.0, -1.5))
    bpy.context.object.name = "violet cluster rim light"
    bpy.context.object.data.energy = 180
    bpy.context.object.data.color = (0.55, 0.28, 1.0)
    bpy.ops.object.light_add(type="POINT", location=(3.4, 1.6, 1.8))
    bpy.context.object.name = "amber anomaly rim light"
    bpy.context.object.data.energy = 150
    bpy.context.object.data.color = (1.0, 0.5, 0.14)

    bpy.ops.object.camera_add(location=(5.7, -6.6, 3.4), rotation=(math.radians(62), 0, math.radians(41)))
    bpy.context.object.name = "data galaxy authored preview camera"
    bpy.context.scene.camera = bpy.context.object

    bpy.context.scene["v9_gallery_target"] = "advanced gallery data-galaxy"
    bpy.context.scene["fixture_role"] = "generated texture-backed support fixture"
    bpy.context.scene["runtime_batching_contract"] = "Export joins static meshes by material; the TypeScript route owns dense point-buffer particles and batched line/point overlays."
    bpy.context.scene["limitations"] = "Static authored GLB fixture with embedded procedural data-glyph textures on key materials; it is support-only until visual review and material diagnostics prove otherwise. It does not provide native GPU particle compute, bloom, or runtime simulation."


def export():
    bpy.context.preferences.filepaths.save_version = 0
    batch_meshes_by_material()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_DIR / "data-galaxy-core-blender.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        export_lights=True,
        export_cameras=True,
        export_apply=True,
    )


def write_metadata():
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    light_objects = [obj for obj in bpy.context.scene.objects if obj.type == "LIGHT"]
    camera_objects = [obj for obj in bpy.context.scene.objects if obj.type == "CAMERA"]
    materials = list(bpy.data.materials)
    texture_count = count_texture_images()
    texture_backed_materials = count_texture_backed_materials(materials)
    exported_counts = exported_glb_counts(OUT)
    transparent = [material.name for material in materials if float(material.get("authored_alpha", 1.0)) < 1.0]
    emissive = []
    for material in materials:
        if not material.use_nodes:
            continue
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf and bsdf.inputs["Emission Strength"].default_value > 0:
            emissive.append(material.name)

    manifest = {
        "id": "data-galaxy-core-blender",
        "routeUse": "data-galaxy",
        "routeLinkage": {
            "routeId": "data-galaxy",
            "app": "apps/v9-advanced-examples-gallery",
            "catalogAssetId": "data-galaxy-core-blender",
            "runtimeRole": "support scenery and central-core context only",
        },
        "source": {
            "sourceScript": "tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py",
            "generator": "Blender Python procedural mesh generator",
            "inputAssets": [],
            "derivativeOfExternalAsset": False,
            "usesExternalTextures": False,
            "usesEmbeddedGeneratedTextures": True,
        },
        "outputs": {
            "glb": file_info(OUT),
            "blend": file_info(OUT_DIR / "data-galaxy-core-blender.blend"),
            "manifest": {
                "path": rel(MANIFEST),
            },
        },
        "generator": "tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py",
        "asset": "fixtures/v9/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb",
        "blend": "fixtures/v9/assets/data-galaxy-core-blender/data-galaxy-core-blender.blend",
        "status": {
            "generated": True,
            "stub": False,
            "derivative": False,
            "textureBacked": texture_backed_materials > 0,
            "generatedNoTexture": texture_count == 0 and texture_backed_materials == 0,
            "supportOnly": True,
            "acceptableAsFocalHero": False,
            "acceptedAsPremiumTextureBackedHero": False,
            "visualReviewAccepted": False,
        },
        "intendedRole": "Route-scoped support geometry for the Data Galaxy scene: central-core context, semantic clusters, controls, connection hints, and small emissive detail.",
        "acceptanceBoundary": "This generated GLB includes embedded generated data-glyph textures on key materials, but it is still support-only and must not be used as premium focal hero proof until current-route screenshots pass human visual review and runtime diagnostics support that scoped claim.",
        "authoredElements": [
            "material-joined static mesh batches",
            "central translucent data core",
            "layered orbital rings",
            "semantic cluster frames",
            "formation control glyphs",
            "central connection loom",
            "outer attractor pylons",
            "floating translucent analytics panels",
            "axes and floor grid",
            "connection corridors",
            "emissive signal beads"
        ],
        "counts": {
            "meshObjects": len(mesh_objects),
            "drawItems": len(mesh_objects),
            "lightObjects": len(light_objects),
            "cameraObjects": len(camera_objects),
            "materials": len(materials),
            "textureImages": texture_count,
            "textureBackedMaterials": texture_backed_materials,
            "exportedMaterials": exported_counts["materialCount"],
            "exportedTextures": exported_counts["textureCount"],
            "exportedImages": exported_counts["imageCount"],
            "exportedMeshes": exported_counts["meshCount"],
            "exportedNodes": exported_counts["nodeCount"],
            "exportedTextureBackedMaterials": exported_counts["textureBackedMaterialCount"],
            "transparentMaterials": len(transparent),
            "emissiveMaterials": len(emissive),
        },
        "exportedGlb": exported_counts,
        "materials": {
            "materialCount": len(materials),
            "textureCount": texture_count,
            "textureBackedMaterialCount": texture_backed_materials,
            "transparentMaterialNames": transparent,
            "emissiveMaterialNames": emissive,
        },
        "batching": {
            "staticMeshStrategy": "Opaque objects are joined by first material before GLB export; transparent objects remain separate render-sort units for G3D alpha correctness.",
            "runtimeParticleStrategy": "Dense particles are generated by the TypeScript route as point buffers; trail/link overlays are batched line geometry.",
            "nativeGpuComputeParticles": False,
        },
        "supportTruth": {
            "role": "support-only",
            "reason": "Generated procedural mesh fixture with embedded route-native data-glyph textures; still support-only until current screenshots and runtime diagnostics pass visual review.",
            "cannotReplace": [
                "accepted current-route visual-review screenshots",
                "native GPU-compute particle implementation",
            ],
            "routeExclusionsMayApply": [
                "The default Data Galaxy route may exclude platform/floor scaffold nodes from focal framing; that exclusion is route composition, not source-asset acceptance.",
            ],
        },
        "limitations": [
            "Static authored GLB fixture only.",
            "Generated support scenery with embedded procedural data-glyph textures on key materials; not accepted as premium focal hero proof.",
            "The fixture is route-scoped authored scenery, not a particle solver.",
            "Runtime particles, postprocess bloom, and any animation still depend on the gallery route.",
            "No native GPU-compute particle path is provided by this asset.",
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    README.write_text(
        "# Data Galaxy Core Blender Fixture\n\n"
        "Authored Blender fixture for the V9 advanced gallery `data-galaxy` route.\n\n"
        "Generated files:\n\n"
        "- `data-galaxy-core-blender.glb`\n"
        "- `data-galaxy-core-blender.blend`\n"
        "- `manifest.json`\n\n"
        "The fixture is intentionally route-scoped and contains a central AI data core, semantic cluster frames, formation control glyphs, a central connection loom, attractor pylons, layered rings, translucent analytics panels, axes/grid elements, connection corridors, and emissive detail.\n\n"
        "Support-only truth:\n\n"
        "- It is generated procedural Blender output with embedded generated data-glyph textures on key materials.\n"
        "- It is not accepted as premium focal hero proof and cannot replace accepted current-route visual review evidence.\n"
        "- It remains support-only until current-route screenshots pass human visual review and runtime material diagnostics support a stronger claim.\n"
        "- Runtime particle buffers, trail/link batching, bloom, animation, and GPU compute remain external to this authored fixture; it does not add native GPU-compute particles.\n\n"
        "Opaque static meshes are joined by material at export, while transparent panels remain separate render-sort units for G3D alpha correctness.\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest["counts"], indent=2))


if __name__ == "__main__":
    make_scene()
    export()
    write_metadata()
