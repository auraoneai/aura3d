"""Build Pulse Tunnel high-fidelity V5 art candidates with Blender.

The three outputs are original CC0 route-local candidates.  They are isolated
under art-review until the root coordinator audits provenance, rendered probes,
and serialized manifest registration.  The models are rigid presentation only:
the route-local beat chart, collision, movement, score, shields, and reset stay
authoritative.

Unlike the rejected blockout passes, this kit is built around continuous lofted
surfaces, curved structural members, recessed mechanical detail, and a restrained
steel / ceramic / heat-copper material hierarchy.  No animation is authored or
claimed.
"""

from pathlib import Path
import math
import json
import struct
import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art-review" / "assets" / "high-fidelity-v5"
OUT.mkdir(parents=True, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, metallic, roughness, emission=None, strength=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return value


def assign(obj, mat, smooth=False):
    obj.data.materials.append(mat)
    if smooth and hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def bevel(obj, width=0.04, segments=3):
    modifier = obj.modifiers.new("precision rolled edge", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def box(name, location, scale, mat, rotation=(0, 0, 0), edge=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    if edge:
        bevel(obj, edge)
    return obj


def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=32, edge=0.025):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat, True)
    if edge:
        bevel(obj, edge)
    return obj


def sphere(name, location, scale, mat, segments=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, location=location
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return assign(obj, mat, True)


def torus(name, location, major, minor, mat, rotation=(math.pi / 2, 0, 0), major_segments=48):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=major_segments,
        minor_segments=12,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return assign(obj, mat, True)


def curve_tube(name, points, radius, mat, cyclic=False):
    """Build a deterministic articulated tube from fixed cylinder segments."""
    path = list(points)
    if cyclic:
        path.append(path[0])
    built = []
    for index, (start, end) in enumerate(zip(path, path[1:])):
        start_vector = Vector(start)
        end_vector = Vector(end)
        delta = end_vector - start_vector
        midpoint = (start_vector + end_vector) * 0.5
        rotation = delta.to_track_quat("Z", "Y").to_euler()
        built.append(cylinder(
            f"{name} segment {index}",
            midpoint,
            radius,
            delta.length,
            mat,
            rotation,
            24,
            0.0,
        ))
    for index, point in enumerate(path[1:-1]):
        built.append(sphere(f"{name} joint {index}", point, (radius, radius, radius), mat, 24, 12))
    return built


def prism(name, footprint, bottom_y, top_y, mat, edge=0.03):
    count = len(footprint)
    vertices = [(x, bottom_y, z) for x, z in footprint] + [(x, top_y, z) for x, z in footprint]
    faces = []
    faces.append(tuple(range(count - 1, -1, -1)))
    faces.append(tuple(range(count, count * 2)))
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, mat)
    if edge:
        bevel(obj, edge)
    return obj


def loft(name, sections, radial_segments, mat, cap=True, subdivision=1):
    """Build a +Z-axis elliptical loft; section=(z, x_radius, y_radius, y_offset)."""
    vertices = []
    for z, x_radius, y_radius, y_offset in sections:
        for index in range(radial_segments):
            angle = (index / radial_segments) * math.tau
            vertices.append((math.cos(angle) * x_radius, y_offset + math.sin(angle) * y_radius, z))
    faces = []
    rings = len(sections)
    for ring in range(rings - 1):
        for index in range(radial_segments):
            nxt = (index + 1) % radial_segments
            a = ring * radial_segments + index
            b = ring * radial_segments + nxt
            c = (ring + 1) * radial_segments + nxt
            d = (ring + 1) * radial_segments + index
            faces.append((a, b, c, d))
    if cap:
        faces.append(tuple(range(radial_segments - 1, -1, -1)))
        last = (rings - 1) * radial_segments
        faces.append(tuple(last + index for index in range(radial_segments)))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, mat, True)
    if subdivision:
        modifier = obj.modifiers.new("continuous compound curvature", "SUBSURF")
        modifier.subdivision_type = "CATMULL_CLARK"
        modifier.levels = subdivision
        modifier.render_levels = subdivision
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def export(filename):
    bpy.ops.object.select_all(action="SELECT")
    # Quantize authored mesh positions before export.  Blender's modifier and
    # primitive evaluators can otherwise differ by a few floating-point ulps
    # between headless runs even when topology and JSON are identical.
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for vertex in obj.data.vertices:
            vertex.co.x = round(vertex.co.x, 6)
            vertex.co.y = round(vertex.co.y, 6)
            vertex.co.z = round(vertex.co.z, 6)
        obj.data.update(calc_edges=True)
    # Author helpers use X horizontal / Y up / Z depth.  Rotate once so the
    # glTF exporter's Z-up -> Y-up conversion preserves that route contract.
    basis = Matrix.Rotation(math.pi / 2, 4, "X")
    for obj in bpy.context.scene.objects:
        obj.matrix_world = basis @ obj.matrix_world
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / filename),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
    )
    canonicalize_glb(OUT / filename)


def canonicalize_glb(path):
    """Round float accessors and serialize GLB JSON in a stable order.

    Blender 5.2's headless evaluator can vary the final ulp of generated
    normals and bevel coordinates between otherwise identical runs.  Those
    changes are visually meaningless but break hash-bound provenance.  The
    candidate builder therefore quantizes all float accessors to 1e-5 and
    writes a canonical JSON chunk after export.
    """
    source = path.read_bytes()
    if source[:4] != b"glTF":
        raise ValueError(f"Expected GLB output at {path}")
    json_length, json_type = struct.unpack_from("<II", source, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("First GLB chunk is not JSON")
    json_start = 20
    document = json.loads(source[json_start:json_start + json_length].decode("utf8").rstrip(" \0"))
    bin_header = json_start + json_length
    bin_length, bin_type = struct.unpack_from("<II", source, bin_header)
    if bin_type != 0x004E4942:
        raise ValueError("Second GLB chunk is not BIN")
    binary = bytearray(source[bin_header + 8:bin_header + 8 + bin_length])
    component_counts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
    for accessor in document.get("accessors", []):
        if accessor.get("componentType") != 5126 or "bufferView" not in accessor:
            continue
        view = document["bufferViews"][accessor["bufferView"]]
        components = component_counts[accessor["type"]]
        element_size = components * 4
        stride = view.get("byteStride", element_size)
        base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        for element in range(accessor["count"]):
            offset = base + element * stride
            for component in range(components):
                value_offset = offset + component * 4
                value = struct.unpack_from("<f", binary, value_offset)[0]
                canonical = round(value, 5)
                if canonical == 0:
                    canonical = 0.0
                struct.pack_into("<f", binary, value_offset, canonical)

    def normalized(value):
        if isinstance(value, float):
            rounded = round(value, 6)
            return 0.0 if rounded == 0 else rounded
        if isinstance(value, list):
            return [normalized(entry) for entry in value]
        if isinstance(value, dict):
            return {key: normalized(entry) for key, entry in value.items()}
        return value

    json_bytes = json.dumps(normalized(document), sort_keys=True, separators=(",", ":")).encode("utf8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary)
    output = bytearray()
    output.extend(struct.pack("<4sII", b"glTF", 2, total_length))
    output.extend(struct.pack("<II", len(json_bytes), 0x4E4F534A))
    output.extend(json_bytes)
    output.extend(struct.pack("<II", len(binary), 0x004E4942))
    output.extend(binary)
    path.write_bytes(output)


def build_runner():
    reset()
    pearl = material("runner warm ceramic shell", (0.24, 0.34, 0.37), 0.68, 0.22)
    graphite = material("runner graphite underframe", (0.022, 0.038, 0.055), 0.82, 0.24)
    teal = material("runner oxidized teal armour", (0.025, 0.17, 0.19), 0.72, 0.25)
    copper = material("runner heat copper edges", (0.54, 0.17, 0.035), 0.84, 0.22)
    canopy = material("runner smoke cyan canopy", (0.02, 0.13, 0.17), 0.48, 0.13, (0.0, 0.23, 0.30), 1.4)
    drive = material("runner restrained cyan drive", (0.0, 0.12, 0.17), 0.32, 0.16, (0.0, 0.72, 0.92), 3.1)

    loft(
        "runner continuous lifting fuselage",
        [
            (-1.78, 0.035, 0.035, 0.27),
            (-1.64, 0.14, 0.10, 0.28),
            (-1.42, 0.30, 0.20, 0.29),
            (-1.02, 0.44, 0.28, 0.30),
            (-0.52, 0.53, 0.34, 0.31),
            (0.05, 0.56, 0.35, 0.31),
            (0.52, 0.51, 0.32, 0.30),
            (0.88, 0.43, 0.27, 0.29),
            (1.18, 0.34, 0.22, 0.28),
            (1.38, 0.23, 0.16, 0.27),
            (1.48, 0.12, 0.11, 0.27),
        ],
        24,
        pearl,
        subdivision=0,
    )
    loft(
        "runner continuous ventral keel",
        [
            (-1.38, 0.16, 0.08, 0.05),
            (-0.96, 0.25, 0.12, 0.03),
            (-0.56, 0.30, 0.14, 0.02),
            (0.12, 0.30, 0.15, 0.02),
            (0.58, 0.27, 0.14, 0.02),
            (1.04, 0.19, 0.10, 0.03),
            (1.32, 0.11, 0.07, 0.05),
        ],
        20,
        graphite,
        subdivision=0,
    )
    sphere("runner integrated canopy", (0, 0.62, -0.34), (0.34, 0.22, 0.66), canopy)
    box("runner canopy dorsal spine", (0, 0.63, 0.32), (0.07, 0.07, 0.58), copper, edge=0.035)

    for side in (-1, 1):
        wing = prism(
            f"runner continuous swept foil {side}",
            [
                (side * 0.20, -0.75),
                (side * 1.58, -0.10),
                (side * 1.48, 0.48),
                (side * 0.42, 0.76),
            ],
            0.18,
            0.34,
            teal,
            0.055,
        )
        wing.rotation_euler[2] = side * -0.025
        prism(
            f"runner copper foil edge {side}",
            [
                (side * 0.31, -0.71),
                (side * 1.61, -0.10),
                (side * 1.55, 0.01),
                (side * 0.34, -0.56),
            ],
            0.335,
            0.39,
            copper,
            0.025,
        )
        cylinder(
            f"runner recessed turbine nacelle {side}",
            (side * 0.76, 0.22, 0.84),
            0.23,
            0.82,
            graphite,
            (math.pi / 2, 0, 0),
            40,
            0.035,
        )
        torus(
            f"runner turbine heat ring {side}",
            (side * 0.76, 0.22, 1.26),
            0.17,
            0.035,
            copper,
        )
        cylinder(
            f"runner bounded drive aperture {side}",
            (side * 0.76, 0.22, 1.305),
            0.115,
            0.05,
            drive,
            (math.pi / 2, 0, 0),
            40,
            0.01,
        )
        prism(
            f"runner vertical stabilizer {side}",
            [
                (side * 0.35, 0.40),
                (side * 0.49, 1.28),
                (side * 0.65, 1.23),
                (side * 0.55, 0.32),
            ],
            0.34,
            0.82,
            graphite,
            0.035,
        )
    export("pulseRunnerCraftV5.candidate.glb")


def build_sentry():
    reset()
    graphite = material("sentry black nickel core", (0.025, 0.035, 0.052), 0.88, 0.21)
    slate = material("sentry blue steel armour", (0.075, 0.14, 0.20), 0.72, 0.27)
    ceramic = material("sentry bone ceramic threat plates", (0.50, 0.45, 0.34), 0.34, 0.33)
    copper = material("sentry furnace copper mechanics", (0.50, 0.13, 0.025), 0.88, 0.2)
    ember = material("sentry restrained ember core", (0.20, 0.015, 0.025), 0.3, 0.14, (0.88, 0.045, 0.02), 3.2)
    optic = material("sentry amber optics", (0.24, 0.08, 0.006), 0.3, 0.13, (1.0, 0.30, 0.015), 3.6)

    sphere("sentry continuous armored reactor body", (0, 1.38, 0), (0.82, 0.92, 0.60), graphite)
    sphere("sentry upper blue steel mantle", (0, 1.68, 0.02), (1.02, 0.47, 0.66), slate)
    prism(
        "sentry forward ceramic brow",
        [(-0.92, -0.52), (0.92, -0.52), (0.68, -0.83), (-0.68, -0.83)],
        1.60,
        2.03,
        ceramic,
        0.07,
    )
    torus("sentry reactor containment assembly", (0, 1.30, -0.63), 0.46, 0.085, copper)
    cylinder("sentry open reactor iris", (0, 1.30, -0.695), 0.34, 0.10, ember, (math.pi / 2, 0, 0), 48, 0.02)
    cylinder("sentry central amber eye", (0, 1.82, -0.69), 0.105, 0.10, optic, (math.pi / 2, 0, 0), 36, 0.015)
    torus("sentry eye gimbal", (0, 1.82, -0.64), 0.18, 0.035, copper)

    for side in (-1, 1):
        curve_tube(
            f"sentry articulated shoulder spar {side}",
            [
                (side * 0.48, 1.67, 0.08),
                (side * 1.08, 1.86, -0.02),
                (side * 1.65, 1.66, -0.16),
                (side * 2.02, 1.46, -0.28),
            ],
            0.105,
            copper,
        )
        sphere(f"sentry shoulder armour pod {side}", (side * 1.18, 1.73, -0.04), (0.58, 0.32, 0.48), slate)
        prism(
            f"sentry scimitar threat wing {side}",
            [
                (side * 0.84, -0.12),
                (side * 2.35, -0.40),
                (side * 1.91, 0.30),
                (side * 0.94, 0.48),
            ],
            1.51,
            1.82,
            ceramic,
            0.055,
        )
        cylinder(
            f"sentry rotary lance housing {side}",
            (side * 1.72, 1.34, -0.48),
            0.18,
            0.98,
            graphite,
            (0, math.pi / 2, 0),
            36,
            0.03,
        )
        cylinder(
            f"sentry amber lance muzzle {side}",
            (side * 2.23, 1.34, -0.48),
            0.11,
            0.07,
            optic,
            (0, math.pi / 2, 0),
            36,
            0.012,
        )
        curve_tube(
            f"sentry reverse-jointed lower strut {side}",
            [
                (side * 0.48, 1.05, 0.05),
                (side * 0.68, 0.65, 0.18),
                (side * 0.94, 0.36, -0.02),
                (side * 0.88, 0.12, -0.38),
            ],
            0.09,
            copper,
        )
        prism(
            f"sentry grounded stabilizer talon {side}",
            [
                (side * 0.66, -0.62),
                (side * 1.22, -0.82),
                (side * 1.08, 0.18),
                (side * 0.72, 0.14),
            ],
            0.04,
            0.22,
            graphite,
            0.045,
        )
    export("pulseTerminalSentryV5.candidate.glb")


def build_world():
    reset()
    deck = material("reactor bay titanium deck", (0.10, 0.14, 0.18), 0.7, 0.34)
    inset = material("reactor bay recessed black lane", (0.018, 0.032, 0.045), 0.84, 0.31)
    wall = material("reactor bay blue steel shell", (0.075, 0.14, 0.20), 0.72, 0.37)
    rib = material("reactor bay heat-copper structure", (0.24, 0.065, 0.018), 0.86, 0.29)
    pale = material("reactor bay ceramic service plates", (0.38, 0.42, 0.40), 0.34, 0.42)
    cyan = material("reactor bay bounded cyan cadence", (0.0, 0.14, 0.18), 0.3, 0.18, (0.0, 0.62, 0.78), 2.4)
    amber = material("reactor bay bounded amber terminal", (0.24, 0.07, 0.01), 0.34, 0.18, (0.95, 0.23, 0.01), 2.8)

    prism(
        "continuous chamfered reactor deck",
        [(-4.5, 2.2), (4.5, 2.2), (4.5, -9.5), (3.85, -10.25), (-3.85, -10.25), (-4.5, -9.5)],
        -0.34,
        -0.02,
        deck,
        0.12,
    )
    prism(
        "recessed exchange runway",
        [(-2.15, 1.9), (2.15, 1.9), (2.42, -8.8), (1.88, -9.45), (-1.88, -9.45), (-2.42, -8.8)],
        -0.03,
        0.035,
        inset,
        0.025,
    )
    for side in (-1, 1):
        box(f"continuous lower containment wall {side}", (side * 4.33, 0.78, -4.0), (0.24, 1.05, 6.1), wall, edge=0.09)
        curve_tube(
            f"longitudinal cyan service conduit {side}",
            [
                (side * 3.86, 0.30, 1.7),
                (side * 3.78, 0.40, -2.2),
                (side * 3.62, 0.52, -6.2),
                (side * 3.42, 0.68, -9.25),
            ],
            0.055,
            cyan,
        )
        for index, z in enumerate((-1.1, -2.8, -4.5, -6.2, -7.9, -9.45)):
            arch_points = []
            # One continuous quarter arch per side, meeting at the crown.
            for step in range(7):
                t = step / 6
                x = side * (4.0 * (1 - t))
                y = 0.35 + math.sin(t * math.pi / 2) * 3.25
                arch_points.append((x, y, z))
            curve_tube(f"forged arched load rib {index} {side}", arch_points, 0.078, rib)
            box(
                f"rib ceramic lockplate {index} {side}",
                (side * 3.74, 1.58, z),
                (0.17, 0.34, 0.20),
                pale,
                rotation=(0, 0, side * 0.16),
                edge=0.045,
            )
        box(f"raised service shoulder {side}", (side * 3.10, 0.11, -4.15), (0.62, 0.14, 5.7), wall, edge=0.08)

    # Repeating deck insets establish pace without becoming baked emitter bars.
    for index, z in enumerate((0.65, -0.55, -1.75, -2.95, -4.15, -5.35, -6.55, -7.75)):
        box(f"machined runway cadence plate {index}", (0, 0.058, z), (1.35, 0.022, 0.22), wall, edge=0.025)
        cylinder(
            f"runway cadence lens {index}",
            (0, 0.087, z),
            0.07,
            0.035,
            cyan if index < 5 else amber,
            (math.pi / 2, 0, 0),
            28,
            0.008,
        )

    # Terminal chamber: modeled bay, stepped dock, and mechanical iris.
    prism(
        "terminal raised command dock",
        [(-0.4, -7.35), (3.8, -7.35), (4.05, -10.0), (3.45, -10.55), (0.2, -10.55), (-0.55, -9.72)],
        0.02,
        0.32,
        wall,
        0.12,
    )
    box("terminal full-width shadow bulkhead", (0, 1.62, -10.52), (4.18, 1.82, 0.24), inset, edge=0.14)
    box("terminal continuous armored backwall", (1.72, 1.55, -10.15), (2.28, 1.55, 0.25), wall, edge=0.13)
    torus("terminal mechanical iris outer race", (1.72, 1.48, -9.86), 1.18, 0.15, rib)
    torus("terminal mechanical iris inner race", (1.72, 1.48, -9.82), 0.78, 0.065, amber)
    cylinder("terminal recessed threat well", (1.72, 1.48, -9.88), 0.64, 0.11, graphite := inset, (math.pi / 2, 0, 0), 48, 0.025)
    for index in range(8):
        angle = index * math.tau / 8
        x = 1.72 + math.cos(angle) * 0.93
        y = 1.48 + math.sin(angle) * 0.93
        box(
            f"terminal iris blade {index}",
            (x, y, -9.72),
            (0.26, 0.10, 0.08),
            pale,
            rotation=(0, angle * 0.08, angle),
            edge=0.035,
        )
    for side in (-1, 1):
        curve_tube(
            f"terminal overhead service arm {side}",
            [
                (1.72 + side * 2.05, 2.96, -9.58),
                (1.72 + side * 1.62, 3.32, -9.38),
                (1.72 + side * 0.72, 3.54, -9.25),
                (1.72, 3.58, -9.18),
            ],
            0.12,
            rib,
        )
    export("pulseReactorEncounterWorldV5.candidate.glb")


if __name__ == "__main__":
    build_runner()
    build_sentry()
    build_world()
    print("Built Pulse Tunnel high-fidelity V5 candidates in", OUT)
