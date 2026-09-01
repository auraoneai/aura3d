"""Build Pulse Tunnel V7: a high-contrast, camera-authored combat family."""

from pathlib import Path
import hashlib
import importlib.util
import math


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art-review" / "assets" / "combat-finish-v7"
TEXTURES = OUT / "textures"
OUT.mkdir(parents=True, exist_ok=True)
TEXTURES.mkdir(parents=True, exist_ok=True)

source = Path(__file__).with_name("build-texture-identity-v6.py")
spec = importlib.util.spec_from_file_location("pulse_v6_canonical", source)
v6 = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(v6)
v6.OUT = OUT
v6.TEXTURES = TEXTURES

reset = v6.reset
box = v6.box
cylinder = v6.cylinder
sphere = v6.sphere
torus = v6.torus
curve_tube = v6.curve_tube
prism = v6.prism
loft = v6.loft
material = v6.material
stable_export = v6.stable_export
png = v6.png


def make_textures():
    def runner(x, y):
        cell_x, cell_y = x % 32, y % 24
        border = cell_x in (0, 1, 30, 31) or cell_y in (0, 1, 22, 23)
        cyan_cut = (x + y) % 47 in (0, 1, 2)
        white_mark = 7 <= cell_x <= 10 and 6 <= cell_y <= 17
        if border:
            return (3, 12, 18, 255)
        if cyan_cut:
            return (0, 187, 211, 255)
        if white_mark:
            return (176, 213, 218, 255)
        grain = ((x * 19 + y * 31) % 15) - 7
        return (34 + grain, 54 + grain, 64 + grain, 255)

    def sentinel(x, y):
        cell_x, cell_y = x % 40, y % 32
        border = cell_x in (0, 1, 38, 39) or cell_y in (0, 1, 30, 31)
        chevron = abs(cell_x - 20) in (cell_y // 2, cell_y // 2 + 1)
        ivory = 8 <= cell_y <= 12 and 7 <= cell_x <= 33
        if border:
            return (16, 3, 5, 255)
        if chevron:
            return (246, 54, 35, 255)
        if ivory:
            return (190, 181, 147, 255)
        grain = ((x * 11 + y * 23) % 13) - 6
        return (61 + grain, 13 + grain // 3, 17 + grain // 3, 255)

    def deck(x, y):
        lane = x % 32 in (0, 1, 2, 29, 30, 31)
        cross = y % 48 in (0, 1, 2)
        hazard = (x + y * 2) % 67 in (0, 1)
        if lane:
            return (0, 135, 153, 255)
        if cross:
            return (7, 17, 24, 255)
        if hazard:
            return (146, 56, 34, 255)
        grain = ((x * 7 + y * 17) % 17) - 8
        return (45 + grain, 54 + grain, 60 + grain, 255)

    png(TEXTURES / "runner-panel.png", 128, 96, runner)
    png(TEXTURES / "sentinel-chevron.png", 120, 96, sentinel)
    png(TEXTURES / "reactor-deck.png", 128, 128, deck)


def build_runner():
    reset()
    shell = material("runner micro-panel black ceramic", (0.10, 0.17, 0.20), 0.58, 0.25, texture="runner-panel.png")
    dark = material("V7 runner obsidian keel", (0.008, 0.015, 0.024), 0.87, 0.23)
    silver = material("V7 runner silver bevel", (0.48, 0.56, 0.58), 0.90, 0.22)
    cyan = material("V7 runner phase emitter", (0.0, 0.18, 0.22), 0.28, 0.11, (0.0, 0.84, 1.0), 4.2)
    glass = material("V7 runner cyan canopy", (0.02, 0.22, 0.27), 0.22, 0.10, (0.0, 0.48, 0.62), 2.0)

    loft("V7 runner arrowhead hull",
         [(-2.05, 0.04, 0.04, 0.30), (-1.72, 0.24, 0.14, 0.31),
          (-1.10, 0.48, 0.28, 0.32), (-0.30, 0.58, 0.34, 0.33),
          (0.50, 0.50, 0.29, 0.30), (1.26, 0.30, 0.17, 0.25),
          (1.68, 0.09, 0.06, 0.20)], 28, shell, subdivision=0)
    loft("V7 runner luminous ventral blade",
         [(-1.55, 0.07, 0.05, 0.07), (-0.85, 0.22, 0.10, 0.06),
          (0.25, 0.21, 0.10, 0.06), (1.32, 0.05, 0.03, 0.07)], 20, cyan, subdivision=0)
    sphere("V7 runner raised phase canopy", (0, 0.67, -0.45), (0.42, 0.23, 0.64), glass, 36, 18)
    for side in (-1, 1):
        prism(f"V7 runner broad manta wing {side}",
              [(side * 0.20, -1.20), (side * 1.78, -0.48), (side * 2.12, 0.64),
               (side * 1.44, 1.30), (side * 0.47, 0.52)], 0.18, 0.40, shell, 0.065)
        prism(f"V7 runner bright leading edge {side}",
              [(side * 1.64, -0.54), (side * 2.15, 0.64), (side * 1.98, 0.73),
               (side * 1.50, -0.45)], 0.40, 0.46, silver, 0.02)
        # Face-on rings are legible from the route camera; V6's side-on pods are removed.
        cylinder(f"V7 runner recessed drive {side}", (side * 0.90, 0.25, 1.08), 0.30, 0.45, dark,
                 (0, 0, 0), 40, 0.035)
        torus(f"V7 runner face-on cyan drive ring {side}", (side * 0.90, 0.25, 1.33), 0.23, 0.05, cyan,
              rotation=(0, 0, 0), major_segments=48)
        cylinder(f"V7 runner cyan drive pupil {side}", (side * 0.90, 0.25, 1.37), 0.14, 0.05, cyan,
                 (0, 0, 0), 36, 0.01)
        box(f"V7 runner dorsal cadence fin {side}", (side * 0.48, 0.55, 0.23), (0.07, 0.26, 0.62), silver,
            rotation=(0, side * -0.10, side * -0.05), edge=0.035)
    torus("V7 runner shield coupler", (0, 0.66, -1.00), 0.28, 0.05, cyan,
          rotation=(0, 0, 0), major_segments=44)
    stable_export("pulsePhaseMantaV7.candidate.glb")


def build_sentinel():
    reset()
    shell = material("sentinel deterministic threat chevrons", (0.22, 0.04, 0.05), 0.63, 0.24, texture="sentinel-chevron.png")
    dark = material("V7 sentinel obsidian skeleton", (0.006, 0.009, 0.014), 0.91, 0.18)
    ivory = material("V7 sentinel ivory anatomy", (0.62, 0.58, 0.46), 0.30, 0.38)
    ember = material("V7 sentinel furnace eye", (0.28, 0.006, 0.008), 0.24, 0.10, (1.0, 0.025, 0.012), 5.0)
    cyan = material("V7 sentinel stolen phase cells", (0.0, 0.16, 0.19), 0.28, 0.12, (0.0, 0.70, 0.84), 3.1)

    # All primary anatomy is authored upright in +Y and face-on along -Z.
    sphere("V7 sentinel tall armored thorax", (0, 1.48, 0.02), (0.72, 1.10, 0.48), shell, 40, 20)
    prism("V7 sentinel pointed lower reliquary",
          [(-0.56, -0.15), (0.56, -0.15), (0.34, -0.68), (0, -1.18), (-0.34, -0.68)],
          0.26, 1.24, dark, 0.07)
    torus("V7 sentinel face-on ivory crown", (0, 2.12, -0.03), 1.13, 0.12, ivory,
          rotation=(0, 0, 0), major_segments=56)
    torus("V7 sentinel face-on broken halo", (0, 2.12, -0.08), 0.84, 0.05, ember,
          rotation=(0, 0, 0), major_segments=48)
    cylinder("V7 sentinel singular furnace eye", (0, 1.63, -0.55), 0.42, 0.12, ember,
             (0, 0, 0), 48, 0.02)
    torus("V7 sentinel eye aperture", (0, 1.63, -0.62), 0.52, 0.075, ivory,
          rotation=(0, 0, 0), major_segments=48)
    for side in (-1, 1):
        curve_tube(f"V7 sentinel raised execution arm {side}",
                   [(side * 0.44, 1.92, 0.08), (side * 1.18, 2.40, -0.02),
                    (side * 1.95, 2.54, -0.28), (side * 2.44, 2.16, -0.67)], 0.12, dark)
        prism(f"V7 sentinel broad ivory scythe {side}",
              [(side * 1.88, -0.50), (side * 2.76, -0.98), (side * 2.54, -0.14),
               (side * 2.08, 0.18)], 1.92, 2.28, ivory, 0.055)
        cylinder(f"V7 sentinel face-on lance eye {side}", (side * 2.30, 2.08, -0.72), 0.14, 0.13, ember,
                 (0, 0, 0), 32, 0.015)
        curve_tube(f"V7 sentinel hooked lower leg {side}",
                   [(side * 0.45, 1.18, 0.10), (side * 1.08, 0.76, 0.32),
                    (side * 1.48, 0.20, 0.05), (side * 1.72, 0.05, -0.58)], 0.10, dark)
        torus(f"V7 sentinel stolen cyan cell {side}", (side * 0.72, 1.08, -0.40), 0.21, 0.045, cyan,
              rotation=(0, 0, 0), major_segments=36)
    stable_export("pulseCathedralSentinelV7.candidate.glb")


def build_world():
    reset()
    deck = material("reactor deterministic deck plating", (0.12, 0.15, 0.17), 0.70, 0.30, texture="reactor-deck.png")
    black = material("V7 reactor black containment", (0.004, 0.008, 0.014), 0.90, 0.26)
    wall = material("V7 reactor blue-black armor", (0.02, 0.075, 0.10), 0.72, 0.31)
    silver = material("V7 reactor bright structural edge", (0.38, 0.45, 0.46), 0.86, 0.23)
    cyan = material("V7 reactor cyan bus", (0.0, 0.16, 0.19), 0.28, 0.11, (0.0, 0.70, 0.86), 3.3)
    red = material("V7 reactor red terminal", (0.24, 0.005, 0.008), 0.26, 0.10, (1.0, 0.018, 0.010), 4.4)

    prism("V7 continuous high-contrast runway",
          [(-4.7, 2.7), (4.7, 2.7), (4.55, -11.5), (3.7, -12.1), (-3.7, -12.1), (-4.55, -11.5)],
          -0.38, 0.0, deck, 0.11)
    prism("V7 recessed black combat lane",
          [(-1.90, 2.4), (1.90, 2.4), (2.12, -10.9), (1.62, -11.48), (-1.62, -11.48), (-2.12, -10.9)],
          0.01, 0.055, black, 0.02)
    for side in (-1, 1):
        box(f"V7 full height side shell {side}", (side * 4.55, 1.55, -4.55), (0.26, 1.95, 7.25), wall, edge=0.10)
        box(f"V7 overhead darkness panel {side}", (side * 2.35, 4.15, -4.7), (2.28, 0.15, 7.0), black,
            rotation=(0, 0, side * 0.13), edge=0.08)
        curve_tube(f"V7 long cyan service artery {side}",
                   [(side * 3.82, 0.42, 2.1), (side * 3.66, 0.50, -1.2),
                    (side * 3.34, 0.66, -5.4), (side * 2.92, 0.86, -9.8)], 0.075, cyan)
    for index, (z, cant) in enumerate(((-0.8, 0.0), (-4.6, 0.32), (-8.4, -0.25))):
        curve_tube(f"V7 asymmetric reactor arch {index}",
                   [(-4.15, 0.42, z), (-3.18, 2.05 + cant, z - 0.10),
                    (-1.35, 3.52 - cant, z + 0.08), (0.78, 3.82 + cant, z - 0.06),
                    (2.75, 2.70 - cant, z + 0.11), (4.15, 0.46, z)], 0.13, silver)
    for index, z in enumerate((1.0, -1.1, -3.45, -5.95, -8.55)):
        box(f"V7 wide cadence bridge {index}", (0, 0.085, z), (1.42 - index * 0.07, 0.028, 0.16),
            cyan if index < 3 else red, edge=0.025)
    box("V7 terminal full black backwall", (0, 1.82, -11.60), (4.28, 1.90, 0.30), black, edge=0.14)
    torus("V7 terminal face-on silver iris", (0.95, 1.78, -11.20), 1.50, 0.18, silver,
          rotation=(0, 0, 0), major_segments=64)
    torus("V7 terminal face-on red breach", (0.95, 1.78, -11.12), 1.12, 0.075, red,
          rotation=(0, 0, 0), major_segments=56)
    cylinder("V7 terminal face-on lightless well", (0.95, 1.78, -11.25), 0.92, 0.13, black,
             (0, 0, 0), 64, 0.025)
    stable_export("pulseBraidedReactorWorldV7.candidate.glb")


def audit():
    for path in sorted(OUT.rglob("*")):
        if path.is_file():
            print(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.stat().st_size:8d}  {path.relative_to(OUT)}")


if __name__ == "__main__":
    make_textures()
    build_runner()
    build_sentinel()
    build_world()
    audit()
