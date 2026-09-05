# Geometry, instancing, LOD, culling, and text

Aura3D 2.0 exposes a bounded geometry and scene-scaling surface through the
`createAuraApp` root safe API. The canonical proof is:

```sh
pnpm renderer:geometry-instancing-lod-text
```

That command rebuilds the packages, runs the focused root and rendering unit
tests, renders the root-only browser scene, renders the same real 1,600-object
WebGL2 scene with frustum culling on and off, and requires a fresh aggregate
receipt at `tests/reports/geometry-instancing-lod-text/report.json`.

## Root-safe instancing

`instances.box`, `instances.sphere`, `instances.plane`,
`instances.cylinder`, `instances.capsule`, and `instances.torus` create one
root scene node with a typed transform list and optional matching color list:

```ts
import { createAuraApp, instances, material, scene } from "@aura3d/engine";

const transforms = Array.from({ length: 80 }, (_, index) => ({
  position: [(index % 10) * 0.6, 0, Math.floor(index / 10) * 0.6] as const,
  scale: 0.7
}));

createAuraApp("#app", {
  scene: scene().add(instances.box({
    transforms,
    material: material.pbr({ color: "#34d8ff", roughness: 0.35 })
  }))
});
```

The browser gate submits 80 lit boxes through the production runtime. It
requires a positive `nativeInstancedSubmissions` count and no more than two
recorded draws, replaces the scene with updated transforms, requires more than
500 changed pixels, and disposes every created app. The recorded run submitted
native instancing before and after the update and changed 2,544 pixels.

The one-draw-capable path uses the renderer's `InstancedPBRMaterial`. Advanced
PBR extension declarations that this shader cannot represent are not silently
dropped: they retain the full material and correctness-preserving expanded
draws. Therefore “root-safe instancing” is supported, while “every material
combination is one draw” is not claimed.

## Camera-distance LOD

`distanceLod` selects ordered levels by camera distance. `maxDistance` values
must increase; the last level may omit a maximum. `hysteresis` creates a
symmetric hold band around each boundary so camera noise cannot flap between
levels:

```ts
import { distanceLod, material } from "@aura3d/engine";

const subject = distanceLod({
  hysteresis: 0.5,
  levels: [
    { name: "near", maxDistance: 5, primitive: "sphere",
      material: material.pbr({ color: "#38d9ff" }) },
    { name: "far", primitive: "box",
      material: material.pbr({ color: "#ff8e3c" }) }
  ]
});
```

The root browser proof renders the same LOD subject from 4.2 and 9 world units
and requires different center pixels plus more than 1,000 changed pixels. The
focused unit proof verifies hold and switch behavior on both sides of a
distance boundary.

## Mesh text versus world labels

`text3D` creates indexed triangle geometry with real extrusion depth and
normals. It participates in the same model transform, depth test, PBR material,
and direct lighting path as other root custom geometry:

```ts
import { material, text3D } from "@aura3d/engine";

const title = text3D("AURA3D", {
  size: 0.72,
  depth: 0.22,
  position: [-2.2, 0.15, 0],
  rotation: [-0.12, 0.18, 0],
  material: material.pbr({ color: "#f7c84b", metallic: 0.35, roughness: 0.28 })
});
```

This is deliberately a small built-in extruded bitmap-glyph mesh system, not a
general font stack. It supports uppercase A-Z, digits 0-9, space, dash, and
period. It does not claim font loading, Unicode shaping, arbitrary typefaces,
kerning, SDF/MSDF, curved text, or typographic parity with troika-three-text.
Unsupported characters are reported in node metadata.

`labels.billboard`, `labels.anchor`, and `labels.axisTick` remain
world-anchored DOM UI. They retain accessible text, crisp scaling, collision
avoidance, and their documented occlusion policy. They are not called 3D text,
do not satisfy mesh-text evidence, and are not lit by scene materials. The two
surfaces solve different problems; neither is an implementation substitute for
the other. Usage: [`docs/rendering/world-labels-and-text.md`](./world-labels-and-text.md).

## Custom indexed geometry

`geometry.define` validates a finite indexed-triangle description and
`geometry.custom` mounts it through the root production renderer:

```ts
import { geometry, material } from "@aura3d/engine";

const pyramid = geometry.define({
  positions: [[0, 1, 0], [-1, -1, 1], [1, -1, 1], [0, -1, -1]],
  indices: [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]
});

const node = geometry.custom(pyramid, {
  material: material.pbr({ color: "#61e1b7", roughness: 0.3 })
});
```

Positions and indices are required. Normals are optional and are generated
from the indexed triangles when absent. Optional explicit bounds participate
in renderer culling; otherwise bounds are computed from positions. This is a
geometry-buffer escape hatch, not a custom-shader or direct-device escape
hatch. Lower-level renderer access is separately governed by WS-3.10.

## Large-scene culling boundary

The browser proof builds 1,600 independent scene renderables. In the recorded
run, the CPU camera-frustum strategy retained 192, rejected 1,408, and reduced
draws from 1,600 to 192. The same bounds were built into a 511-node static BVH;
its frustum query visited 135 nodes and performed 282 leaf tests while returning
the same 192 visible objects. Recorded wall-clock frame cost was 7.1 ms with
culling and 18.9 ms without it on that machine. These timings are directional,
not a portable performance guarantee.

Aura3D does not currently implement GPU occlusion queries, hierarchical-Z
occlusion culling, portal culling, or a software occluder rasterizer. Ordinary
depth testing prevents farther fragments from replacing nearer pixels, but it
does not reject hidden objects before submission and is not described as
object-level occlusion culling. The current strategy is therefore accurately
named CPU frustum culling plus a public static-bounds BVH broad phase.

## Evidence

- Root instancing, LOD, mesh text, custom geometry, update, and disposal:
  `tests/reports/geometry-instancing-lod-text/root-browser.json`.
- Large-scene frustum/BVH measurement and explicit occlusion boundary:
  `tests/reports/geometry-instancing-lod-text/large-scene-culling.json`.
- Fresh aggregate gate:
  `tests/reports/geometry-instancing-lod-text/report.json`.

Screenshots prove only their visible scene. Runtime claims such as native
instance submission and culling counts come from the corresponding diagnostics
assertions, not from screenshots alone.

## Superiority (K1 · 2026-09-04)

- WIN (directional, same-machine): 4096 instanced quads in one
  `drawArraysInstanced` — median **1.20 ms** over 25 iterations with GPU
  completion on every iteration
  (`tests/reports/muse3jsparity/perf.json`, `instance4k`). K1 specs
  10/10 green 2026-09-04.
- LOSS: P2 instanced-GLB **pixel proof is OPEN** (builder + mount + warnings
  are unit-proven only); the 1.20 ms number is a workload-class cost, not an
  end-to-end frame claim
  (`tests/reports/muse3jsparity/library-parity-superiority.json`
  `openItems`).
