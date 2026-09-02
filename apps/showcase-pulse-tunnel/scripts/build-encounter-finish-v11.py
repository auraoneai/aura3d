"""Build the Pulse Tunnel V11 encounter family.

This is one bounded, route-local art pass over the original CC0 Pulse family.
The three models are rigid presentation assets only: the route's chart, lane
movement, shields, collisions, score, reset, and audio-clock contract remain
authoritative.  The builder deliberately stays dependency-free and uses only
fixed Blender geometry plus tiny embedded panel textures generated here.  No
third-party or cross-showcase meshes are used.

V11 is intentionally a replacement family rather than another camera pass:
each role gets a connected authored silhouette, secondary mechanical layers,
and a coherent teal / pearl / heat-copper material language.  The files are
written into the normal source-model directory and must still pass the CLI
inspection, root-rendered probe, and route evidence gates before registration.
"""

from pathlib import Path
import hashlib
import math
import struct
import zlib
import importlib.util

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "models"
TEXTURES = OUT / "textures"
OUT.mkdir(parents=True, exist_ok=True)
TEXTURES.mkdir(parents=True, exist_ok=True)

# Reuse the established deterministic, scene-space bounds/export helpers.  The
# imported module does not execute its build functions (they are guarded by
# __main__) and its OUT is replaced before any export call.
HELPER_PATH = Path(__file__).with_name("build-high-fidelity-v5.py")
SPEC = importlib.util.spec_from_file_location("pulse_v11_helpers", HELPER_PATH)
HELPER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(HELPER)
HELPER.OUT = OUT

reset = HELPER.reset
material = HELPER.material
box = HELPER.box
cylinder = HELPER.cylinder
sphere = HELPER.sphere
torus = HELPER.torus
curve_tube = HELPER.curve_tube
prism = HELPER.prism
loft = HELPER.loft
export = HELPER.export


def write_png(path: Path, width: int, height: int, pixel):
    """Write a deterministic RGBA PNG using only the Python standard library."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)  # filter byte
        for x in range(width):
            rows.extend(bytes(pixel(x, y)))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    payload = bytearray(b"\x89PNG\r\n\x1a\n")
    payload.extend(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)))
    payload.extend(chunk(b"IDAT", zlib.compress(bytes(rows), level=9)))
    payload.extend(chunk(b"IEND", b""))
    path.write_bytes(payload)


def panel_texture(path: Path, palette: tuple[tuple[int, int, int], ...], cell: int = 16):
    """Generate a small fixed panel texture with seams, wear, and accents."""
    def pixel(x: int, y: int):
        cx, cy = x % cell, y % cell
        index = (x // cell + (y // cell) * 3) % len(palette)
        base = palette[index]
        seam = cx in (0, 1) or cy in (0, 1)
        accent = (x * 11 + y * 7) % 61 == 0
        if seam:
            return (min(255, base[0] + 24), min(255, base[1] + 24), min(255, base[2] + 24), 255)
        if accent:
            return (min(255, base[0] + 45), min(255, base[1] + 45), min(255, base[2] + 45), 255)
        grain = ((x * 17 + y * 23) % 9) - 4
        return tuple(max(0, min(255, channel + grain)) for channel in base) + (255,)

    write_png(path, 128, 128, pixel)


def textured_material(name, color, metallic, roughness, filename, palette, emission=None, strength=0.0):
    """Create a PBR material with a packed, deterministic panel image."""
    path = TEXTURES / filename
    panel_texture(path, palette)
    value = material(name, color, metallic, roughness, emission, strength)
    image = bpy.data.images.load(str(path), check_existing=False)
    image.pack()
    nodes = value.node_tree.nodes
    links = value.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.name = f"{name} panel texture"
    image_node.image = image
    image_node.interpolation = "Closest"
    links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
    return value


def apply_planar_uv(obj, scale=0.34):
    """Give custom loft/prism meshes stable planar UVs for packed textures."""
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    layer = mesh.uv_layers.active.data
    for loop in mesh.loops:
        vertex = mesh.vertices[loop.vertex_index].co
        layer[loop.index].uv = ((vertex.x * scale) % 1.0, (vertex.z * scale + vertex.y * 0.08) % 1.0)
    return obj


def textured_loft(*args, **kwargs):
    obj = loft(*args, **kwargs)
    return apply_planar_uv(obj)


def textured_prism(*args, **kwargs):
    obj = prism(*args, **kwargs)
    return apply_planar_uv(obj)


def add_panel_rivets(prefix, points, mat, radius=0.035):
    for index, point in enumerate(points):
        sphere(f"{prefix} rivet {index + 1}", point, (radius, radius, radius), mat, 16, 8)


def build_runner():
    reset()
    shell = textured_material(
        "V11 runner pearl panel shell", (0.32, 0.58, 0.64), 0.72, 0.22,
        "runner-shell.png", ((41, 102, 115), (52, 128, 137), (73, 151, 157)),
    )
    under = textured_material(
        "V11 runner graphite underframe", (0.018, 0.035, 0.055), 0.88, 0.2,
        "runner-underframe.png", ((8, 24, 34), (13, 36, 47), (17, 45, 53)),
    )
    pearl = material("V11 runner ceramic edge", (0.72, 0.86, 0.87), 0.62, 0.24)
    copper = material("V11 runner heat copper trim", (0.70, 0.24, 0.045), 0.86, 0.21)
    cyan = material("V11 runner phase emissive", (0.0, 0.31, 0.38), 0.26, 0.13, (0.0, 0.78, 0.98), 3.6)
    glass = material("V11 runner smoked canopy", (0.02, 0.15, 0.19), 0.56, 0.09, (0.0, 0.28, 0.36), 1.8)

    textured_loft(
        "V11 runner continuous arrowhead fuselage",
        [
            (-1.96, 0.035, 0.035, 0.30), (-1.82, 0.15, 0.10, 0.32),
            (-1.56, 0.31, 0.19, 0.34), (-1.12, 0.48, 0.27, 0.35),
            (-0.58, 0.60, 0.34, 0.37), (0.08, 0.64, 0.37, 0.38),
            (0.65, 0.57, 0.33, 0.36), (1.08, 0.46, 0.27, 0.34),
            (1.40, 0.33, 0.20, 0.32), (1.58, 0.16, 0.11, 0.30),
        ],
        32, shell, subdivision=0,
    )
    textured_loft(
        "V11 runner ventral armored keel",
        [(-1.56, 0.15, 0.08, 0.09), (-1.08, 0.28, 0.13, 0.065),
         (-0.38, 0.34, 0.16, 0.055), (0.40, 0.33, 0.16, 0.055),
         (0.98, 0.25, 0.12, 0.075), (1.34, 0.13, 0.07, 0.10)],
        24, under, subdivision=0,
    )

    # The canopy and its frame are raised enough to read as a vehicle cockpit,
    # not a flat disc, while the lower black keel keeps the silhouette grounded.
    sphere("V11 runner integrated cockpit canopy", (0, 0.73, -0.38), (0.40, 0.25, 0.72), glass, 48, 24)
    box("V11 runner canopy forward frame", (0, 0.82, -0.77), (0.25, 0.045, 0.24), pearl, edge=0.018)
    box("V11 runner canopy dorsal spine", (0, 0.88, 0.14), (0.075, 0.07, 0.62), copper, edge=0.025)
    box("V11 runner nose light bar", (0, 0.44, -1.72), (0.20, 0.045, 0.06), cyan, edge=0.012)

    for side in (-1, 1):
        textured_prism(
            f"V11 runner swept delta wing {side}",
            [(side * 0.18, -0.92), (side * 1.58, -0.28), (side * 2.08, 0.56),
             (side * 1.62, 0.88), (side * 0.44, 0.58)],
            0.20, 0.39, shell, 0.065,
        )
        textured_prism(
            f"V11 runner ceramic leading edge {side}",
            [(side * 0.33, -0.85), (side * 1.72, -0.26), (side * 2.13, 0.52),
             (side * 1.96, 0.62), (side * 1.44, -0.12)],
            0.40, 0.47, pearl, 0.025,
        )
        textured_prism(
            f"V11 runner copper wing cap {side}",
            [(side * 1.55, 0.16), (side * 2.08, 0.56), (side * 1.94, 0.66),
             (side * 1.46, 0.37)],
            0.47, 0.52, copper, 0.018,
        )
        cylinder(f"V11 runner recessed turbine nacelle {side}", (side * 0.90, 0.31, 0.94), 0.31, 0.86, under, (math.pi / 2, 0, 0), 48, 0.035)
        torus(f"V11 runner turbine copper race {side}", (side * 0.90, 0.31, 1.39), 0.23, 0.045, copper, rotation=(0, 0, 0), major_segments=56)
        torus(f"V11 runner turbine cyan aperture {side}", (side * 0.90, 0.31, 1.43), 0.16, 0.035, cyan, rotation=(0, 0, 0), major_segments=48)
        cylinder(f"V11 runner turbine phase pupil {side}", (side * 0.90, 0.31, 1.45), 0.105, 0.045, cyan, (math.pi / 2, 0, 0), 40, 0.01)
        textured_prism(
            f"V11 runner dorsal stabilizer {side}",
            [(side * 0.36, 0.44), (side * 0.54, 1.34), (side * 0.75, 1.26),
             (side * 0.58, 0.38)],
            0.37, 0.84, under, 0.035,
        )
        for panel_index, z in enumerate((-0.64, -0.18, 0.30)):
            box(f"V11 runner wing service panel {side} {panel_index}", (side * (0.76 + panel_index * 0.28), 0.44, z), (0.22, 0.025, 0.055), copper if panel_index == 1 else pearl, edge=0.012)

    torus("V11 runner forward shield collar", (0, 0.70, -1.14), 0.31, 0.055, cyan, rotation=(0, 0, 0), major_segments=56)
    add_panel_rivets("V11 runner", [(-0.34, 0.54, -0.82), (0.34, 0.54, -0.82), (-0.42, 0.34, 0.02), (0.42, 0.34, 0.02)], pearl, 0.028)
    export("pulseRunnerCraft.glb")


def build_sentry():
    reset()
    shell = textured_material(
        "V11 sentry gunmetal panel shell", (0.075, 0.19, 0.26), 0.82, 0.22,
        "sentry-shell.png", ((12, 40, 56), (17, 56, 72), (22, 68, 82)),
    )
    dark = textured_material(
        "V11 sentry obsidian skeleton", (0.012, 0.024, 0.037), 0.92, 0.17,
        "sentry-underframe.png", ((6, 13, 22), (9, 21, 31), (12, 27, 37)),
    )
    ceramic = material("V11 sentry ivory armor plates", (0.72, 0.67, 0.51), 0.34, 0.30)
    copper = material("V11 sentry exposed heat mechanics", (0.62, 0.19, 0.035), 0.88, 0.19)
    ember = material("V11 sentry furnace threat", (0.26, 0.008, 0.018), 0.25, 0.10, (1.0, 0.028, 0.008), 4.8)
    cyan = material("V11 sentry cyan optics", (0.0, 0.19, 0.26), 0.24, 0.12, (0.0, 0.76, 0.96), 3.5)

    # Layered torso: a broad shell over a dark spine, with a separate ceramic
    # brow and recessed reactor aperture for an immediate face/read direction.
    sphere("V11 sentry armored reactor thorax", (0, 1.62, 0.02), (0.88, 1.16, 0.59), shell, 48, 24)
    textured_prism("V11 sentry lower reliquary", [(-0.62, -0.24), (0.62, -0.24), (0.50, -0.86), (0, -1.18), (-0.50, -0.86)], 0.20, 1.35, dark, 0.08)
    textured_prism("V11 sentry forward ceramic brow", [(-0.96, -0.53), (0.96, -0.53), (0.70, -0.91), (-0.70, -0.91)], 1.70, 2.18, ceramic, 0.07)
    box("V11 sentry brow inset", (0, 1.91, -0.98), (0.54, 0.11, 0.07), dark, edge=0.018)
    box("V11 sentry throat guard", (0, 1.14, -0.66), (0.40, 0.23, 0.07), ceramic, edge=0.025)
    torus("V11 sentry reactor copper race", (0, 1.40, -0.67), 0.53, 0.095, copper, rotation=(0, 0, 0), major_segments=64)
    torus("V11 sentry reactor outer threat ring", (0, 1.40, -0.70), 0.44, 0.055, ember, rotation=(0, 0, 0), major_segments=56)
    cylinder("V11 sentry recessed furnace iris", (0, 1.40, -0.73), 0.32, 0.13, ember, (math.pi / 2, 0, 0), 56, 0.02)
    cylinder("V11 sentry central cyan optic", (0, 1.88, -1.00), 0.11, 0.11, cyan, (math.pi / 2, 0, 0), 40, 0.014)
    torus("V11 sentry eye gimbal", (0, 1.88, -0.94), 0.20, 0.038, ceramic, rotation=(0, 0, 0), major_segments=48)

    for side in (-1, 1):
        # Articulated shoulder spar and layered shoulder armor create a clear
        # silhouette even when the smaller secondary details are rasterized.
        curve_tube(
            f"V11 sentry articulated shoulder spar {side}",
            [(side * 0.52, 1.82, 0.06), (side * 1.06, 2.06, -0.02),
             (side * 1.68, 1.88, -0.18), (side * 2.10, 1.58, -0.34)],
            0.13, copper,
        )
        sphere(f"V11 sentry shoulder armor pod {side}", (side * 1.18, 1.87, -0.03), (0.64, 0.40, 0.52), shell, 40, 20)
        textured_prism(f"V11 sentry ivory threat wing {side}", [(side * 0.82, -0.16), (side * 2.42, -0.47), (side * 2.02, 0.38), (side * 0.95, 0.56)], 1.74, 2.08, ceramic, 0.065)
        box(f"V11 sentry shoulder service plate {side}", (side * 1.28, 2.08, -0.27), (0.26, 0.06, 0.29), ceramic, rotation=(0, side * 0.15, side * 0.12), edge=0.025)
        cylinder(f"V11 sentry rotary cannon housing {side}", (side * 1.76, 1.54, -0.58), 0.22, 1.06, dark, (0, math.pi / 2, 0), 48, 0.035)
        cylinder(f"V11 sentry cannon ceramic shroud {side}", (side * 2.24, 1.54, -0.58), 0.16, 0.28, ceramic, (0, math.pi / 2, 0), 40, 0.025)
        torus(f"V11 sentry cannon ember muzzle ring {side}", (side * 2.42, 1.54, -0.58), 0.13, 0.035, ember, rotation=(0, math.pi / 2, 0), major_segments=48)
        cylinder(f"V11 sentry cannon optic muzzle {side}", (side * 2.47, 1.54, -0.58), 0.065, 0.08, ember, (0, math.pi / 2, 0), 32, 0.01)
        curve_tube(
            f"V11 sentry reverse joint leg {side}",
            [(side * 0.50, 1.12, 0.06), (side * 0.72, 0.69, 0.18),
             (side * 1.04, 0.36, -0.03), (side * 0.90, 0.11, -0.48)],
            0.105, copper,
        )
        textured_prism(f"V11 sentry grounded talon {side}", [(side * 0.60, -0.69), (side * 1.30, -0.88), (side * 1.18, 0.18), (side * 0.66, 0.19)], 0.03, 0.25, dark, 0.05)
        box(f"V11 sentry foot ceramic toe {side}", (side * 0.98, 0.17, -0.92), (0.25, 0.10, 0.22), ceramic, edge=0.04)
        torus(f"V11 sentry shoulder optic ring {side}", (side * 1.26, 1.91, -0.57), 0.15, 0.035, cyan, rotation=(0, 0, 0), major_segments=40)
        for index in range(3):
            box(f"V11 sentry forearm heat vent {side} {index}", (side * (1.25 + index * 0.17), 1.42, -0.66), (0.07, 0.025, 0.15), copper if index == 1 else ceramic, edge=0.012)

    torus("V11 sentry crown load ring", (0, 2.46, -0.02), 1.18, 0.12, ceramic, rotation=(0, 0, 0), major_segments=64)
    torus("V11 sentry crown threat ring", (0, 2.46, -0.08), 0.92, 0.065, ember, rotation=(0, 0, 0), major_segments=56)
    box("V11 sentry crown antenna mast", (0, 2.84, 0.02), (0.13, 0.34, 0.13), shell, edge=0.035)
    sphere("V11 sentry crown warning beacon", (0, 3.21, -0.01), (0.17, 0.17, 0.17), ember, 28, 14)
    for side in (-1, 1):
        box(f"V11 sentry crown fin {side}", (side * 0.62, 2.88, 0.02), (0.10, 0.32, 0.28), copper, rotation=(0, side * 0.20, side * 0.08), edge=0.025)
    add_panel_rivets("V11 sentry", [(-0.54, 2.18, -0.73), (0.54, 2.18, -0.73), (-0.62, 1.10, -0.62), (0.62, 1.10, -0.62)], ceramic, 0.035)
    export("pulseTerminalSentry.glb")


def build_world():
    reset()
    deck = textured_material(
        "V11 reactor machined deck", (0.11, 0.18, 0.24), 0.74, 0.31,
        "reactor-deck.png", ((28, 54, 69), (35, 67, 82), (45, 78, 91)),
    )
    lane = textured_material(
        "V11 reactor recessed exchange lane", (0.018, 0.034, 0.052), 0.88, 0.28,
        "reactor-lane.png", ((8, 18, 28), (10, 25, 37), (14, 32, 45)),
    )
    wall = textured_material(
        "V11 reactor containment wall", (0.07, 0.19, 0.26), 0.72, 0.34,
        "reactor-wall.png", ((16, 46, 60), (20, 58, 72), (25, 68, 82)),
    )
    rib = material("V11 reactor heat-copper ribs", (0.44, 0.14, 0.035), 0.88, 0.24)
    pale = material("V11 reactor service ceramic", (0.58, 0.63, 0.60), 0.34, 0.38)
    cyan = material("V11 reactor cyan power bus", (0.0, 0.18, 0.24), 0.30, 0.13, (0.0, 0.76, 0.98), 3.0)
    amber = material("V11 reactor amber hazard bus", (0.38, 0.12, 0.018), 0.42, 0.18, (0.98, 0.24, 0.015), 2.7)
    rose = material("V11 reactor breach warning", (0.30, 0.015, 0.045), 0.26, 0.13, (0.94, 0.02, 0.15), 3.2)

    # Long chamfered deck and inset lane establish continuous scale.  The
    # repeated plates/rails then provide readable near-to-far rhythm instead of
    # one unbroken primitive slab.
    textured_prism("V11 continuous chamfered reactor deck", [(-4.85, 2.65), (4.85, 2.65), (4.82, -10.8), (4.10, -12.15), (-4.10, -12.15), (-4.82, -10.8)], -0.42, -0.06, deck, 0.14)
    textured_prism("V11 recessed exchange runway", [(-2.18, 2.38), (2.18, 2.38), (2.30, -10.4), (1.72, -11.50), (-1.72, -11.50), (-2.30, -10.4)], -0.05, 0.035, lane, 0.035)
    for index, z in enumerate((1.72, 0.36, -1.0, -2.36, -3.72, -5.08, -6.44, -7.80, -9.16, -10.52)):
        width = 1.48 - index * 0.035
        textured_prism(f"V11 runway inset plate {index}", [(-width, z - 0.37), (width, z - 0.37), (width * 1.04, z + 0.37), (-width * 1.04, z + 0.37)], 0.035, 0.082, deck, 0.024)
        for side in (-1, 1):
            box(f"V11 runway panel edge {index} {side}", (side * (width - 0.08), 0.105, z), (0.028, 0.026, 0.31), amber if index > 6 else cyan, edge=0.01)
        box(f"V11 runway center seam {index}", (0, 0.11, z), (0.026, 0.02, 0.30), cyan, edge=0.009)

    for side in (-1, 1):
        box(f"V11 lower containment wall {side}", (side * 4.48, 0.83, -4.55), (0.30, 1.20, 7.50), wall, edge=0.11)
        box(f"V11 upper containment shoulder {side}", (side * 4.13, 2.57, -4.75), (0.24, 0.48, 7.30), wall, rotation=(0, 0, side * 0.22), edge=0.08)
        curve_tube(f"V11 longitudinal cyan service artery {side}", [(side * 3.88, 0.42, 2.10), (side * 3.78, 0.54, -1.5), (side * 3.55, 0.72, -5.4), (side * 3.22, 0.93, -10.65)], 0.075, cyan)
        curve_tube(f"V11 longitudinal copper hazard rail {side}", [(side * 3.43, 0.25, 1.86), (side * 3.39, 0.36, -2.4), (side * 3.18, 0.55, -6.8), (side * 2.95, 0.74, -10.65)], 0.045, amber)
        for index, z in enumerate((1.30, -0.38, -2.06, -3.74, -5.42, -7.10, -8.78, -10.46)):
            for x_offset, y, height, mat_value in ((3.80, 1.68, 1.50, rib), (3.56, 2.62, 0.42, pale)):
                box(f"V11 side service upright {side} {index} {x_offset}", (side * x_offset, y, z), (0.12, height, 0.16), mat_value, rotation=(0, 0, side * 0.20), edge=0.045)

    # Forged arches and roof spines create visible occlusion/depth in the whole
    # tunnel, while their repeated spacing retains the rhythm-runner language.
    for index, z in enumerate((1.15, -0.65, -2.45, -4.25, -6.05, -7.85, -9.65, -11.05)):
        points = []
        for step in range(9):
            t = step / 8
            x = -4.10 + 8.20 * t
            y = 0.48 + math.sin(t * math.pi) * 3.05
            points.append((x, y, z))
        curve_tube(f"V11 forged reactor arch {index}", points, 0.13, rib)
        box(f"V11 arch crown service block {index}", (0, 3.58, z), (0.36, 0.13, 0.22), pale, edge=0.04)
        box(f"V11 arch crown cyan signal {index}", (0, 3.78, z), (0.72, 0.035, 0.035), cyan if index < 5 else amber, edge=0.012)

    # Back chamber / terminal bay: an inset, layered iris gives the sentry a
    # genuine architectural destination rather than a flat background card.
    textured_prism("V11 terminal raised command dock", [(-0.65, -8.92), (4.10, -8.92), (4.25, -11.30), (3.48, -12.0), (0.0, -12.0), (-0.76, -10.95)], 0.0, 0.34, wall, 0.14)
    box("V11 terminal full shadow bulkhead", (0.92, 1.74, -11.82), (3.94, 1.96, 0.30), lane, edge=0.15)
    box("V11 terminal layered armored backwall", (1.80, 1.68, -11.34), (2.38, 1.70, 0.25), wall, edge=0.14)
    torus("V11 terminal outer mechanical iris", (1.80, 1.74, -11.02), 1.54, 0.18, pale, rotation=(0, 0, 0), major_segments=72)
    torus("V11 terminal amber lock iris", (1.80, 1.74, -10.94), 1.17, 0.085, amber, rotation=(0, 0, 0), major_segments=64)
    torus("V11 terminal rose breach iris", (1.80, 1.74, -10.88), 0.84, 0.065, rose, rotation=(0, 0, 0), major_segments=56)
    cylinder("V11 terminal recessed reactor well", (1.80, 1.74, -11.14), 0.68, 0.15, lane, (math.pi / 2, 0, 0), 64, 0.025)
    cylinder("V11 terminal reactor core", (1.80, 1.74, -11.23), 0.27, 0.08, rose, (math.pi / 2, 0, 0), 48, 0.012)
    for index in range(12):
        angle = index * math.tau / 12
        x = 1.80 + math.cos(angle) * 1.24
        y = 1.74 + math.sin(angle) * 1.24
        box(f"V11 terminal iris blade {index}", (x, y, -10.80), (0.28, 0.08, 0.10), pale if index % 3 else rib, rotation=(0, angle * 0.04, angle), edge=0.03)
    for side in (-1, 1):
        curve_tube(f"V11 terminal overhead articulated arm {side}", [(1.80 + side * 2.35, 3.04, -10.72), (1.80 + side * 1.94, 3.48, -10.47), (1.80 + side * 0.86, 3.68, -10.28), (1.80, 3.73, -10.18)], 0.13, rib)
        box(f"V11 terminal amber docking marker {side}", (1.80 + side * 2.20, 0.42, -10.54), (0.08, 0.06, 0.46), amber, edge=0.018)
    # Small overhead service cabinets and alternating lights close the upper
    # frame without obscuring the runway or the actor silhouettes.
    for index, z in enumerate((0.60, -2.10, -4.80, -7.50, -10.20)):
        box(f"V11 overhead service cabinet {index}", (0, 3.12, z), (0.68, 0.18, 0.28), deck, edge=0.05)
        box(f"V11 overhead service lamp {index}", (0, 2.88, z), (0.38, 0.035, 0.035), cyan if index % 2 == 0 else amber, edge=0.012)

    export("pulseReactorEncounterWorld.glb")


def audit():
    for filename in ("pulseRunnerCraft.glb", "pulseTerminalSentry.glb", "pulseReactorEncounterWorld.glb"):
        path = OUT / filename
        print(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.stat().st_size:10d}  {path.relative_to(ROOT)}")
    for texture in sorted(TEXTURES.glob("V11-*.png")):
        print(f"texture {hashlib.sha256(texture.read_bytes()).hexdigest()}  {texture.stat().st_size:10d}  {texture.relative_to(ROOT)}")


if __name__ == "__main__":
    build_runner()
    build_sentry()
    build_world()
    audit()
    print("Built Pulse Tunnel V11 encounter family in", OUT)
