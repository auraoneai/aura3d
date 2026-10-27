# Duneglide: procedural architecture, cliff subdivision, terrain vertex tints, and far-dune horizon (`p1-art-duneglide`)

Frames captured via remote ACR runner (`p1dune-c`, software WebGL2, 1280x720, `tests/browser/p1dune-review.spec.ts`); not real-GPU evidence.

## Summary of Changes

- **Replaced untextured box-instance wall slabs (`examples/silt-and-signal-port/architecture.ts`, `world.ts`):**
  - **Cliffs (`arch.cliff`):** Subdivided sandstone cliffs (`nx x ny x nz` up to `12 x 10 x 12` cells) with FBM vertex displacement (`terrain.ts` `fbm`), height-dependent moss/sand/sun-bleached strata colors, and recomputed smooth normals.
  - **Limestone walls, piers, and gatehouses (`arch.stone`):** Weathered limestone blocks with foundation plinths, projecting crown cornices, arch openings on wide bridge/aqueduct spans (`arch: true`), and recessed dark window slits on tall towers (`arch.dark`).
  - **Village houses (`arch.plaster`, `arch.roofs`, `arch.dark`):** 51 plaster houses across 5 warm palette hues with foundation plinths, hipped terracotta roofs with overhanging eaves, and recessed doorways and windows on all four facades.
  - **Terrain & horizon (`terrainColors`, `farDunes`):** Per-vertex terrain coloring blending damp silt, dry sand, grass, and sun-baked rock by height and slope, plus a 3-ring `farDunes` horizon skirt (`r = 1200..3000 m`) so the desert floor does not end in a flat brown disc.
  - **Hoverboard thrusters (`world.ts`):** Slimmer thruster cylinders (`[0.34, 1.1, 0.34]`).

## Frames Read (`p1dune-c`, 14 frames, 0 console/page errors)

- Static poses: `p-village.1280x720.jpg`, `p-aqueduct.1280x720.jpg`, `p-aqueduct-low.1280x720.jpg`, `p-canal.1280x720.jpg`, `p-gatehouse.1280x720.jpg`, `p-cliffs.1280x720.jpg`, `p-canyon-gate.1280x720.jpg`, `p-overview.1280x720.jpg`, `p-horizon.1280x720.jpg`.
- Flight progression (chapter 0, objectives 0-2): `ride-a.1280x720.jpg`, `ride-b.1280x720.jpg`, `ride-c.1280x720.jpg`, `ride-d.1280x720.jpg`, `ride-e.1280x720.jpg`.
- Compared against `evidence/silt-and-signal-port/screens/final/key-boost.1280x720.jpg`, the flat cream box slabs in the aqueduct and village are replaced by cornice-capped stone piers, archways, plaster houses with terracotta hipped roofs, and subdivided sandstone cliffs.

## Open

- Real GPU not checked.
- `evidence/silt-and-signal-port/screens/final/card.1x.jpg` / `card.2x.1440x900.jpg` not retaken in this pass.
