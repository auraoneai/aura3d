import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
WATER_DIR = ROOT / "fixtures" / "v9" / "assets" / "water-cinematic-marina-blender"
OCEAN_DIR = ROOT / "fixtures" / "v9" / "assets" / "ocean-observatory-cinematic-blender"
WATER_OUT = WATER_DIR / "water-cinematic-marina-blender.glb"
OCEAN_OUT = OCEAN_DIR / "ocean-observatory-cinematic-blender.glb"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def mat(name, color, metallic=0.0, roughness=0.55, emission=None, strength=0.0, alpha=1.0, transmission=0.0, ior=1.333):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        set_bsdf_input(bsdf, "Base Color", color)
        set_bsdf_input(bsdf, "Metallic", metallic)
        set_bsdf_input(bsdf, "Roughness", roughness)
        set_bsdf_input(bsdf, "Alpha", alpha)
        set_bsdf_input(bsdf, "Transmission Weight", transmission)
        set_bsdf_input(bsdf, "IOR", ior)
        if emission:
            set_bsdf_input(bsdf, "Emission Color", emission)
            set_bsdf_input(bsdf, "Emission Strength", strength)
    material.blend_method = "BLEND" if alpha < 1 else "OPAQUE"
    material.use_screen_refraction = alpha < 1
    return material


def set_bsdf_input(bsdf, name, value):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value


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
    modifier = obj.modifiers.new("authored bevels", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = "EDGES"
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cube(name, loc, scale, material, bevel_width=0.02, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale_a3d(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel_width:
        bevel(obj, bevel_width)
    return obj


def cylinder(name, loc, radius, depth, material, vertices=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cone(name, loc, radius1, radius2, depth, material, vertices=28, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc_a3d(loc), rotation=rot)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def sphere(name, loc, radius, material, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, radius=radius, location=loc_a3d(loc))
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def ico(name, loc, scale, material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=loc_a3d(loc))
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale_a3d(scale)
    assign(obj, material)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def batch_meshes_by_material():
    """Export-time draw-call batching for static authored environment props."""
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        groups.setdefault(obj.data.materials[0].name, []).append(obj)

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


def torus(name, loc, major, minor, material, rot=(0, 0, 0)):
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
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def grid_mesh(name, width, depth, cols, rows, material, y=-0.08, wave=0.02):
    verts = []
    faces = []
    for z in range(rows):
        for x in range(cols):
            u = x / (cols - 1)
            v = z / (rows - 1)
            px = (u - 0.5) * width
            pz = (v - 0.5) * depth
            py = y + math.sin(px * 1.2 + pz * 0.7) * wave + math.sin(px * 0.37 - pz * 1.9) * wave * 0.65
            verts.append(loc_a3d((px, py, pz)))
    for z in range(rows - 1):
        for x in range(cols - 1):
            i = z * cols + x
            faces.append((i, i + 1, i + cols + 1, i + cols))
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    obj.modifiers.new("procedural layer normals", "WEIGHTED_NORMAL")
    return obj


def add_light(name, kind, loc, energy, color=(1, 1, 1), size=1.0):
    bpy.ops.object.light_add(type=kind, location=loc_a3d(loc))
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.color = color
    if hasattr(light.data, "size"):
        light.data.size = size
    return light


def add_camera(name, loc, rot_degrees):
    bpy.ops.object.camera_add(location=loc_a3d(loc), rotation=tuple(math.radians(v) for v in rot_degrees))
    camera = bpy.context.object
    camera.name = name
    camera.data.lens = 29
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 7.0
    camera.data.dof.aperture_fstop = 6.5
    bpy.context.scene.camera = camera
    return camera


def add_sailboat(prefix, loc, hull, deck, mast, canvas, accent, scale=1.0, yaw=0.0):
    x, y, z = loc
    cube(f"{prefix} hull beam", (x, y + 0.12 * scale, z), (1.38 * scale, 0.26 * scale, 0.42 * scale), hull, 0.07, rot=(0, 0, yaw))
    cube(f"{prefix} cabin deckhouse", (x - 0.05 * scale, y + 0.42 * scale, z - 0.05 * scale), (0.55 * scale, 0.28 * scale, 0.34 * scale), deck, 0.035, rot=(0, 0, yaw))
    cylinder(f"{prefix} mast", (x, y + 0.98 * scale, z), 0.025 * scale, 1.35 * scale, mast, 16)
    cube(f"{prefix} folded sail plane", (x + 0.24 * scale, y + 1.12 * scale, z - 0.02 * scale), (0.045 * scale, 0.78 * scale, 0.48 * scale), canvas, 0.008, rot=(0.0, 0.0, yaw))
    cube(f"{prefix} transom color stripe", (x, y + 0.22 * scale, z + 0.24 * scale), (1.0 * scale, 0.035 * scale, 0.025 * scale), accent, 0.004, rot=(0, 0, yaw))


def add_pine(prefix, x, z, trunk, leaf, h=1.0):
    cylinder(f"{prefix} trunk", (x, h * 0.26, z), 0.04 * h, 0.62 * h, trunk, 12)
    cone(f"{prefix} lower canopy", (x, h * 0.72, z), 0.26 * h, 0.04 * h, 0.54 * h, leaf, 20)
    cone(f"{prefix} upper canopy", (x, h * 1.06, z), 0.18 * h, 0.02 * h, 0.42 * h, leaf, 20)


def build_water_marina():
    clear_scene()
    WATER_DIR.mkdir(parents=True, exist_ok=True)

    water = mat("A3D procedural water receiver - marina basin", (0.025, 0.22, 0.34, 0.26), roughness=0.08, alpha=0.26, emission=(0.0, 0.045, 0.07, 1), strength=0.12, transmission=0.18)
    water_detail = mat("secondary crossing ripple normal reference", (0.12, 0.48, 0.62, 0.16), roughness=0.16, alpha=0.16, emission=(0.02, 0.12, 0.16, 1), strength=0.18, transmission=0.08)
    foam = mat("thin shoreline foam accents", (0.86, 0.96, 1.0, 0.62), roughness=0.36, alpha=0.62, emission=(0.25, 0.48, 0.55, 1), strength=0.22)
    glint = mat("painted fresnel water glint strips", (0.78, 0.96, 1.0, 0.5), roughness=0.12, alpha=0.5, emission=(0.26, 0.58, 0.72, 1), strength=0.34)
    ripple_ring = mat("authored ambient ripple source rings", (0.72, 0.94, 1.0, 0.42), roughness=0.2, alpha=0.42, emission=(0.2, 0.42, 0.52, 1), strength=0.26)
    wet_shadow = mat("wet reflected dock shadow shapes", (0.01, 0.04, 0.055, 0.34), roughness=0.5, alpha=0.34)
    dock = mat("wet cedar layered dock boards", (0.43, 0.28, 0.16, 1), roughness=0.64)
    dark_dock = mat("tar stained pier understructure", (0.12, 0.08, 0.055, 1), roughness=0.72)
    stone = mat("wet granite shoreline boulders", (0.28, 0.29, 0.28, 1), roughness=0.78)
    gravel = mat("mixed sand gravel shore shelf", (0.55, 0.46, 0.32, 1), roughness=0.84)
    grass = mat("coastal reed grass", (0.13, 0.29, 0.13, 1), roughness=0.78)
    trunk = mat("salt weathered pine bark", (0.18, 0.11, 0.065, 1), roughness=0.82)
    leaf = mat("deep green shore pines", (0.035, 0.18, 0.1, 1), roughness=0.76)
    metal = mat("galvanized marina hardware", (0.54, 0.58, 0.58, 1), metallic=0.65, roughness=0.28)
    hull = mat("ivory fiberglass hulls", (0.86, 0.88, 0.82, 1), roughness=0.34)
    red = mat("red harbor boat stripe", (0.72, 0.08, 0.055, 1), roughness=0.42)
    blue = mat("blue harbor boat stripe", (0.05, 0.18, 0.54, 1), roughness=0.42)
    canvas = mat("sun faded canvas sails", (0.88, 0.82, 0.68, 1), roughness=0.75)
    rope = mat("tan rope coils and fenders", (0.62, 0.48, 0.3, 1), roughness=0.9)
    lantern = mat("warm dock lantern glass", (1.0, 0.66, 0.28, 1), roughness=0.2, emission=(1.0, 0.42, 0.08, 1), strength=3.0)
    window = mat("occupied marina window glow", (1.0, 0.58, 0.24, 1), roughness=0.25, emission=(1.0, 0.38, 0.08, 1), strength=1.8)
    roof = mat("dark metal boathouse roofs", (0.07, 0.08, 0.085, 1), metallic=0.2, roughness=0.42)
    siding = mat("weathered boathouse siding", (0.46, 0.29, 0.17, 1), roughness=0.58)
    mountain = mat("layered blue distant shore", (0.08, 0.11, 0.15, 1), roughness=0.88)

    grid_mesh("A3D water procedural base tessellated marina surface", 16.5, 11.0, 96, 58, water, y=-0.18, wave=0.026)
    grid_mesh("A3D water secondary crossing ripple reference layer", 16.2, 10.6, 68, 42, water_detail, y=-0.145, wave=0.014)
    cube("near stepped gravel shore shelf", (0, -0.31, 4.9), (13.4, 0.16, 1.45), gravel, 0.055)
    cube("left rocky inlet shelf", (-6.55, -0.29, 0.2), (1.15, 0.18, 7.2), gravel, 0.05)
    cube("far tree lined shoreline shelf", (-0.4, -0.32, -5.35), (12.8, 0.16, 0.96), gravel, 0.05)
    cube("foreground boardwalk deck", (-1.1, 0.01, 3.55), (7.6, 0.13, 1.08), dock, 0.035)
    cube("midwater main pier spine", (-1.0, 0.0, -1.95), (8.7, 0.13, 1.0), dock, 0.035)
    cube("right finger pier", (3.05, 0.01, 0.65), (1.06, 0.12, 3.9), dock, 0.03)
    cube("left finger pier", (-3.8, 0.01, 0.25), (0.95, 0.12, 3.2), dock, 0.03)

    for i in range(34):
        x = -5.3 + (i % 17) * 0.62
        z = 3.55 if i < 17 else -1.95
        cube(f"individual cedar deck plank {i:02d}", (x, 0.1, z), (0.45, 0.055, 1.16 if i < 17 else 0.96), dock, 0.012)
    for i in range(18):
        x = -5.5 + i * 0.64
        for z in (-1.36, -2.55):
            cylinder(f"pier driven piling {i:02d} {z}", (x, -0.02, z), 0.045, 0.72, dark_dock, 18)
    for i in range(14):
        z = -1.0 + i * 0.42
        for x in (2.52, 3.58):
            cylinder(f"finger pier piling {i:02d} {x}", (x, -0.01, z), 0.043, 0.68, dark_dock, 18)

    for i in range(10):
        x = -5.4 + i * 1.17
        cube(f"dock rail segment {i:02d}", (x, 0.55, -2.62), (0.72, 0.06, 0.06), metal, 0.012)
        cylinder(f"lantern post {i:02d}", (x + 0.34, 0.54, -2.62), 0.028, 0.88, metal, 16)
        sphere(f"lantern warm bulb {i:02d}", (x + 0.34, 1.02, -2.62), 0.08, lantern, 18)
    for i in range(9):
        cube(f"floating foam crescent card {i:02d}", (-5.4 + i * 1.34, -0.06, 4.12 + math.sin(i) * 0.18), (0.72, 0.012, 0.035), foam, 0.0)
        cube(f"far shore foam highlight {i:02d}", (-5.1 + i * 1.2, -0.07, -4.86 + math.cos(i) * 0.08), (0.62, 0.012, 0.032), foam, 0.0)
    for i in range(18):
        x = -5.9 + i * 0.72
        z = -0.15 + math.sin(i * 0.8) * 1.85
        cube(f"marina reflected sky glint lane {i:02d}", (x, -0.045, z), (0.5 + (i % 4) * 0.08, 0.01, 0.025), glint, 0.0, rot=(0, 0, 0.12 + math.sin(i) * 0.1))
    for i, (x, z, radius) in enumerate([(2.1, -1.35, 0.34), (2.1, -1.35, 0.58), (-3.15, 1.7, 0.28), (-3.15, 1.7, 0.5)]):
        torus(f"visible ambient ripple source ring {i:02d}", (x, -0.035, z), radius, 0.006, ripple_ring)
    for i, (x, z) in enumerate([(0.7, 0.8), (-1.8, -0.4), (3.2, 2.35)]):
        for band in range(3):
            torus(f"interactive ripple expansion proof {i:02d}-{band}", (x, -0.032 + band * 0.002, z), 0.26 + band * 0.24, 0.0045, ripple_ring)
    for i in range(10):
        cube(f"soft dock reflection shadow patch {i:02d}", (-4.8 + i * 0.94, -0.052, -2.28 + math.sin(i) * 0.14), (0.46, 0.01, 0.12), wet_shadow, 0.0)

    for i in range(52):
        x = -7.25 + (i % 18) * 0.84
        z = 4.92 + math.sin(i * 1.4) * 0.32 if i < 28 else -5.22 + math.cos(i) * 0.18
        scale = 0.14 + (i % 5) * 0.035
        ico(f"shoreline wet boulder {i:02d}", (x, -0.16 + (i % 3) * 0.025, z), (scale * 1.3, scale * 0.65, scale), stone)
    for i in range(36):
        x = -7.4 + (i % 18) * 0.84
        z = 4.42 + math.sin(i * 0.9) * 0.22 if i < 20 else -4.76 + math.cos(i) * 0.12
        cone(f"shore reed clump {i:02d}", (x, 0.05, z), 0.055, 0.012, 0.42 + (i % 4) * 0.06, grass, 10)
    for i in range(24):
        x = -7.5 + (i % 12) * 1.35
        z = -5.85 if i < 16 else 5.55
        add_pine(f"background pine {i:02d}", x, z, trunk, leaf, h=0.9 + (i % 5) * 0.13)

    for i in range(5):
        x = -4.7 + i * 1.15
        h = 0.58 + (i % 3) * 0.16
        cube(f"stacked boathouse body {i:02d}", (x, 0.26 + h * 0.5, -5.05), (0.78, h, 0.58), siding, 0.035)
        cube(f"stacked boathouse roof {i:02d}", (x, 0.37 + h, -5.05), (0.94, 0.15, 0.72), roof, 0.028)
        for w in range(3):
            cube(f"boathouse lit window {i:02d}-{w}", (x - 0.24 + w * 0.24, 0.42 + h * 0.45, -4.69), (0.075, 0.12, 0.018), window, 0.004)

    for i in range(12):
        x = -7.3 + i * 1.28
        h = 0.9 + (math.sin(i * 1.1) + 1) * 0.72
        cube(f"distant wooded hill slab {i:02d}", (x, 0.05 + h * 0.5, -6.35), (1.18, h, 0.15), mountain, 0.018)

    add_sailboat("foreground moored sailboat", (1.65, 0.04, 1.55), hull, hull, metal, canvas, blue, scale=1.08)
    add_sailboat("left dinghy cluster", (-4.65, 0.02, 1.3), hull, hull, metal, canvas, red, scale=0.72)
    add_sailboat("midground utility boat", (4.62, 0.02, -1.1), hull, hull, metal, canvas, blue, scale=0.82)
    for i, (x, z) in enumerate([(-3.4, 2.3), (-2.9, 2.0), (2.75, -0.8), (3.4, -1.4), (1.1, 2.15), (4.0, 0.55)]):
        torus(f"coiled rope on dock {i:02d}", (x, 0.18, z), 0.11, 0.012, rope, rot=(math.radians(90), 0, 0))
    for i in range(11):
        sphere(f"hanging white dock fender {i:02d}", (-4.9 + i * 0.86, 0.18, -1.28 if i % 2 else -2.58), 0.075, hull, 16)

    add_light("large cool sky fill point over marina", "POINT", (0, 5.3, -2.2), 460, (0.72, 0.84, 1.0), 6.5)
    add_light("warm practical dock bulbs aggregate", "POINT", (-1.4, 1.3, -2.4), 120, (1.0, 0.55, 0.18), 1.0)
    add_light("low sunset shoreline rim point", "POINT", (-5.8, 2.2, 4.5), 260, (1.0, 0.58, 0.3), 4.0)
    add_camera("water cinematic marina camera", (5.3, 2.6, 5.4), (61, 0, 42))

    batch_meshes_by_material()
    bpy.ops.export_scene.gltf(
        filepath=str(WATER_OUT),
        export_format="GLB",
        export_apply=True,
        export_cameras=True,
        export_lights=True,
    )
    return len(bpy.data.objects), len(bpy.data.materials)


def add_observatory_module(prefix, x, z, deck, wall, glass, metal, cyan):
    cube(f"{prefix} pressure door block", (x, 0.42, z), (0.82, 0.82, 0.22), wall, 0.035)
    cube(f"{prefix} glass observation slot", (x, 0.62, z + 0.13), (0.48, 0.24, 0.032), glass, 0.006)
    cylinder(f"{prefix} vertical service pipe left", (x - 0.52, 0.54, z), 0.035, 0.96, metal, 18)
    cylinder(f"{prefix} vertical service pipe right", (x + 0.52, 0.54, z), 0.035, 0.96, metal, 18)
    cube(f"{prefix} deck pad", (x, 0.06, z + 0.42), (1.3, 0.12, 0.74), deck, 0.028)
    cube(f"{prefix} cyan status slit", (x, 0.96, z + 0.13), (0.58, 0.045, 0.026), cyan, 0.004)


def build_ocean_observatory():
    clear_scene()
    OCEAN_DIR.mkdir(parents=True, exist_ok=True)

    ocean = mat("A3D procedural ocean receiver - open water", (0.01, 0.12, 0.24, 0.34), roughness=0.1, alpha=0.34, emission=(0.0, 0.032, 0.06, 1), strength=0.16, transmission=0.12)
    ocean_detail = mat("secondary wind chop surface reference", (0.04, 0.24, 0.38, 0.18), roughness=0.18, alpha=0.18, emission=(0.0, 0.08, 0.14, 1), strength=0.16, transmission=0.08)
    whitewater = mat("wind torn ocean foam cards", (0.82, 0.94, 1.0, 0.58), roughness=0.34, alpha=0.58, emission=(0.18, 0.36, 0.48, 1), strength=0.28)
    ocean_glint = mat("low angle ocean fresnel glints", (0.72, 0.96, 1.0, 0.44), roughness=0.1, alpha=0.44, emission=(0.18, 0.5, 0.72, 1), strength=0.34)
    wet_reflection = mat("wet deck reflected cyan smears", (0.08, 0.58, 0.68, 0.36), roughness=0.18, alpha=0.36, emission=(0.02, 0.26, 0.34, 1), strength=0.28)
    deck = mat("salt dark composite deck panels", (0.055, 0.065, 0.072, 1), metallic=0.18, roughness=0.48)
    wall = mat("storm blue observatory cladding", (0.075, 0.105, 0.13, 1), metallic=0.45, roughness=0.34)
    metal = mat("brushed marine steel rails", (0.48, 0.55, 0.58, 1), metallic=0.78, roughness=0.25)
    glass = mat("thick cyan pressure glass", (0.12, 0.76, 0.96, 0.32), roughness=0.055, alpha=0.32, emission=(0.02, 0.24, 0.36, 1), strength=0.58, transmission=0.36)
    cyan = mat("cyan instrument emissive", (0.18, 0.9, 1.0, 1), roughness=0.22, emission=(0.02, 0.62, 0.95, 1), strength=2.4)
    amber = mat("amber deck warning lights", (1.0, 0.56, 0.14, 1), roughness=0.24, emission=(1.0, 0.32, 0.02, 1), strength=2.2)
    red = mat("red emergency beacon lenses", (1.0, 0.06, 0.035, 1), roughness=0.18, emission=(1.0, 0.02, 0.0, 1), strength=2.7)
    drone_shell = mat("white patrol drone shells", (0.86, 0.88, 0.84, 1), roughness=0.34, emission=(0.04, 0.06, 0.07, 1), strength=0.25)
    drone_glow = mat("drone cyan navigation lights", (0.2, 0.88, 1.0, 1), roughness=0.18, emission=(0.02, 0.62, 0.9, 1), strength=2.1)
    black = mat("black rubber cable bundles", (0.01, 0.012, 0.014, 1), roughness=0.58)
    concrete = mat("wave wet concrete caisson", (0.23, 0.245, 0.24, 1), roughness=0.72)
    rock = mat("dark basalt breakwater", (0.11, 0.115, 0.11, 1), roughness=0.82)

    grid_mesh("A3D ocean procedural base tessellated swell surface", 18.5, 12.4, 112, 68, ocean, y=-0.28, wave=0.052)
    grid_mesh("A3D ocean secondary wind chop reference layer", 18.1, 12.0, 82, 52, ocean_detail, y=-0.24, wave=0.028)
    cube("foreground angular concrete caisson", (0, -0.19, 3.5), (8.6, 0.36, 2.2), concrete, 0.055)
    cube("main observatory deck slab", (0, 0.03, 1.05), (7.4, 0.16, 3.35), deck, 0.04)
    cube("rear raised operations deck", (0, 0.22, -2.35), (6.4, 0.18, 1.9), deck, 0.04)
    cube("left cantilever lookout", (-4.45, 0.18, 0.1), (1.35, 0.14, 2.35), deck, 0.035)
    cube("right sensor balcony", (4.25, 0.2, -0.25), (1.25, 0.14, 2.1), deck, 0.035)

    for i in range(9):
        x = -3.2 + i * 0.8
        cube(f"front deck panel seam {i:02d}", (x, 0.13, 3.36), (0.035, 0.018, 1.86), metal, 0.002)
    for i in range(11):
        z = -3.1 + i * 0.45
        cube(f"cross deck drainage slot {i:02d}", (0, 0.135, z), (6.8, 0.016, 0.035), black, 0.002)

    cube("central glass observatory wedge", (0, 0.86, -1.05), (2.35, 1.05, 1.02), glass, 0.045)
    cube("central armored roof cap", (0, 1.48, -1.05), (2.65, 0.22, 1.18), wall, 0.035)
    cube("left equipment bunker", (-2.35, 0.62, -1.55), (1.5, 0.88, 0.85), wall, 0.035)
    cube("right equipment bunker", (2.3, 0.62, -1.55), (1.42, 0.86, 0.82), wall, 0.035)
    for i in range(7):
        x = -0.9 + i * 0.3
        cube(f"observatory laminated glass seam {i:02d}", (x, 0.88, -0.51), (0.018, 0.76, 0.028), metal, 0.002)
        cube(f"wet cyan reflection on deck {i:02d}", (x, 0.155, 0.58 + math.sin(i) * 0.18), (0.18, 0.012, 0.04), wet_reflection, 0.0)
    add_observatory_module("left aft module", -3.05, -2.75, deck, wall, glass, metal, cyan)
    add_observatory_module("right aft module", 3.05, -2.75, deck, wall, glass, metal, cyan)

    for i in range(30):
        x = -3.85 + (i % 10) * 0.85
        z = 2.42 if i < 10 else -3.26 if i < 20 else -0.62 + (i - 20) * 0.33
        y = 0.64
        cube(f"marine rail top segment {i:02d}", (x if i < 20 else -4.92, y, z), (0.52 if i < 20 else 0.055, 0.055, 0.055 if i < 20 else 0.28), metal, 0.01)
        cylinder(f"marine rail stanchion {i:02d}", (x if i < 20 else -4.92, 0.38, z), 0.026, 0.58, metal, 14)

    for i in range(14):
        x = -3.3 + i * 0.52
        cube(f"cyan deck guidance strip {i:02d}", (x, 0.155, 2.28), (0.3, 0.018, 0.035), cyan if i % 2 else amber, 0.003)
    for i in range(18):
        x = -4.0 + i * 0.47
        sphere(f"deck amber path light {i:02d}", (x, 0.25, 1.65 + math.sin(i) * 0.22), 0.045, amber if i % 3 else cyan, 14)

    cylinder("tall weather mast", (-2.85, 1.05, 0.55), 0.05, 2.05, metal, 20)
    cylinder("weather radar dish stem", (-2.85, 2.12, 0.55), 0.035, 0.44, metal, 16)
    sphere("weather radar dome", (-2.85, 2.42, 0.55), 0.24, glass, 24)
    cylinder("right lidar mast", (3.34, 1.02, 0.4), 0.045, 1.92, metal, 20)
    torus("spinning lidar ring", (3.34, 2.06, 0.4), 0.28, 0.018, cyan, rot=(math.radians(90), 0, 0))
    sphere("red aviation beacon", (0, 1.73, -1.05), 0.08, red, 18)

    for i in range(26):
        x = -3.8 + (i % 13) * 0.62
        z = -0.2 + math.sin(i * 0.7) * 1.85
        cube(f"rubber cable tray {i:02d}", (x, 0.19, z), (0.36, 0.035, 0.05), black, 0.008)
    for i in range(15):
        x = -3.5 + i * 0.5
        cylinder(f"compressed gas canister {i:02d}", (x, 0.38, -2.02 + (i % 3) * 0.18), 0.065, 0.48, metal if i % 2 else cyan, 18)

    for i in range(44):
        x = -8.5 + (i % 22) * 0.78
        z = 4.95 + math.sin(i) * 0.34 if i < 24 else -5.55 + math.cos(i * 0.8) * 0.24
        ico(f"basalt breakwater block {i:02d}", (x, -0.08 + (i % 3) * 0.025, z), (0.21 + (i % 4) * 0.04, 0.12, 0.18 + (i % 5) * 0.035), rock)
    for i in range(18):
        cube(f"whitecap foam streak {i:02d}", (-7.2 + i * 0.82, -0.09, 4.42 + math.sin(i * 1.4) * 0.18), (0.56, 0.012, 0.035), whitewater, 0.0)
        cube(f"mid ocean foam streak {i:02d}", (-7.4 + i * 0.86, -0.1, -4.2 + math.cos(i) * 0.2), (0.62, 0.012, 0.032), whitewater, 0.0)
    for i in range(24):
        x = -8.2 + i * 0.72
        z = -3.85 + math.sin(i * 0.46) * 2.6
        cube(f"open ocean reflected glint lane {i:02d}", (x, -0.115, z), (0.42 + (i % 5) * 0.08, 0.01, 0.026), ocean_glint, 0.0, rot=(0, 0, -0.06 + math.cos(i) * 0.12))
    for i in range(7):
        x = -5.2 + i * 1.7
        sphere(f"wave scale marker buoy {i:02d}", (x, 0.06 + math.sin(i) * 0.04, -3.35 + math.cos(i * 1.3) * 0.42), 0.07, amber if i % 2 else cyan, 14)
        cylinder(f"buoy dark waterline stem {i:02d}", (x, -0.11, -3.35 + math.cos(i * 1.3) * 0.42), 0.018, 0.26, black, 10)
    for i in range(5):
        x = -4.9 + i * 2.3
        z = -4.45 - i * 0.34
        cube(f"runtime patrol drone reference body {i:02d}", (x, 1.32 + math.sin(i) * 0.16, z), (0.36, 0.14, 0.22), drone_shell, 0.025)
        cube(f"runtime patrol drone reference left arm {i:02d}", (x - 0.34, 1.31 + math.sin(i) * 0.16, z), (0.28, 0.035, 0.035), drone_shell, 0.01)
        cube(f"runtime patrol drone reference right arm {i:02d}", (x + 0.34, 1.31 + math.sin(i) * 0.16, z), (0.28, 0.035, 0.035), drone_shell, 0.01)
        sphere(f"runtime patrol drone cyan nav {i:02d}", (x, 1.43 + math.sin(i) * 0.16, z + 0.12), 0.04, drone_glow, 12)
        cube(f"runtime patrol drone reflected path glint {i:02d}", (x - 0.25, 0.06, z + 0.28), (0.58, 0.01, 0.024), ocean_glint, 0.0)

    for i in range(8):
        x = -4.9 + i * 1.38
        h = 0.55 + (i % 3) * 0.18
        cube(f"distant offshore platform silhouette {i:02d}", (x, h * 0.5, -6.25), (0.72, h, 0.15), wall, 0.015)
        cylinder(f"distant platform antenna {i:02d}", (x + 0.22, h + 0.32, -6.25), 0.016, 0.58, metal, 10)
        sphere(f"distant platform beacon {i:02d}", (x + 0.22, h + 0.66, -6.25), 0.035, red if i % 2 else cyan, 10)

    add_light("cold overcast ocean point light", "POINT", (0, 5.4, -1.0), 540, (0.72, 0.86, 1.0), 7.0)
    add_light("cyan instrument spill light", "POINT", (0, 1.4, -0.7), 150, (0.18, 0.85, 1.0), 1.0)
    add_light("storm rim point from horizon", "POINT", (-4.8, 2.3, -5.4), 240, (0.34, 0.52, 0.78), 4.5)
    add_camera("ocean observatory cinematic camera", (5.6, 2.75, 5.25), (60, 0, 43))

    batch_meshes_by_material()
    bpy.ops.export_scene.gltf(
        filepath=str(OCEAN_OUT),
        export_format="GLB",
        export_apply=True,
        export_cameras=True,
        export_lights=True,
    )
    return len(bpy.data.objects), len(bpy.data.materials)


def main():
    water_counts = build_water_marina()
    ocean_counts = build_ocean_observatory()
    print(f"water-cinematic-marina-blender: objects={water_counts[0]} materials={water_counts[1]} out={WATER_OUT}")
    print(f"ocean-observatory-cinematic-blender: objects={ocean_counts[0]} materials={ocean_counts[1]} out={OCEAN_OUT}")


main()
