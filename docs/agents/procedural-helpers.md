# Procedural helpers (`@aura3d/engine/procedural`, 5.1 additive)

Build meshes from code with no GLB and no Meshy credit. Every builder is deterministic (same inputs, same bytes), returns a plain custom geometry spec with positions, normals, UVs and tight bounds, and plugs into `geometry.custom(spec, { material })`.

```ts
import { geometry, material } from "@aura3d/engine";
import { latheGeometry, path2d } from "@aura3d/engine/procedural";
```

Claim label: these helpers are unit-tested for geometry invariants (see Tests) and each has a real-GPU recipe frame. That proves they draw a readable frame; it is not a quality score and not a parity claim against any other engine.

## Audit: what existed before 5.1, and what is new

| Toolbox item (three.js habit) | Exists before | Public path | Status in 5.1 |
|---|---|---|---|
| Box, sphere, plane, cylinder, capsule, torus, cone, circle, ring, torusKnot, polyhedron, roundedBox | yes | `primitives.*` | unchanged |
| LatheGeometry (fixed options) | yes, parameter form only | `primitives.lathe({ params })` | new `latheGeometry`: analytic crease-aware normals, poles, UVs, `path2d` profiles |
| ExtrudeGeometry from 2D shapes with bevel | yes | `primitives.extrude` / `primitives.shape` | unchanged (use it for bevelled outlines) |
| Tube / sweep along a curve | partial: `primitives.tube`, `world.spline` + `world.extrude` (terrain road ribbons) | `primitives.tube`, `world.*` | new `sweepGeometry`: any profile, variable radius, twist, closed loops, caps, RMF frames |
| CatmullRom / Bezier curves | internal only (camera rails, world.spline) | none for meshes | new `catmullRomCurve`, `cubicBezierCurve`, `polylineCurve`, `sampleCurve` |
| ParametricGeometry | no | none | new `parametricSurface` (pole-safe normals, wrap flags) |
| Noise (simplex / perlin / fbm) | 1D `perlin1` (feel) and a value-noise heightfield inside `world.terrain` | not public for meshes | new seeded `createSimplexNoise2D/3D`, `createFbm2D/3D` (ridged option), `seededRandom` |
| Terrain mesh helper | recipe by hand, `world.terrain` (runtime terrain, not a mesh spec) | `world.terrain`, recipe `terrain-water-fog` | new `heightfieldGeometry` (normals from the function, colours, watertight slab) |
| 2D shape / path API | `primitives.shape` takes raw point lists | none | new `path2d()` (line, quad, cubic, arc) |
| Custom geometry from typed arrays | yes | `geometry.define`, `geometry.custom`, `geometry.dynamic` | unchanged; helpers return the same spec |
| Merge helpers | `geometry.merge` (same attributes, no transforms), `instances.*` | `geometry.merge`, `instances.*` | new `composeGeometry` (transform + colour per part, mirror-safe winding) |
| Smooth normals / welding / crease | yes | `geometry.computeNormals`, `computeAuraCreasedNormals`, `weldAuraGeometry` (`/geometry-tools`) | unchanged |
| Text to mesh | yes | `text3D` | unchanged |
| Marching cubes, tube painter, fracture, outline | yes | `@aura3d/addons` | unchanged |
| Procedural humanoid | yes | `prefabs` / `character.primitiveHumanoid`, recipe `procedural-humanoid` | unchanged |
| Subdivision surfaces | no | none | still missing (use `tessellateAuraMesh` from `/geometry-tools` for uniform splits) |
| Mesh boolean CSG | no | none | still missing; use `composeGeometry` of overlapping solids, or `heightfieldGeometry({ base })` slabs |

## New exports (all additive, subpath `@aura3d/engine/procedural`)

Values: `seededRandom`, `createSimplexNoise2D`, `createSimplexNoise3D`, `createFbm2D`, `createFbm3D`, `Path2D`, `path2d`, `polylineCurve`, `catmullRomCurve`, `cubicBezierCurve`, `sampleCurve`, `latheGeometry`, `sweepGeometry`, `parametricSurface`, `heightfieldGeometry`, `composeGeometry`.
Types: `Noise2D`, `Noise3D`, `FbmOptions`, `Path2DPointsOptions`, `ProceduralCurve3`, `CurveSamples`, `LatheOptions`, `SweepOptions`, `ParametricSurfaceOptions`, `HeightfieldOptions`, `ComposePart`, `ProceduralVec2`, `ProceduralVec3`, `ProceduralColor`, `ProceduralGeometry`.

The root `@aura3d/engine` export count is untouched. The subpath is listed in `aura.exports.json` and the export-budget allowlist.

## Recipes (each is a typechecked `main.ts` plus a real-GPU `frame.png`)

| Helper | Recipe |
|---|---|
| noise + `seededRandom` | `recipes-src/procedural-noise/` |
| `latheGeometry` + `path2d` | `recipes-src/procedural-lathe/` |
| `sweepGeometry` + curves | `recipes-src/procedural-sweep/` |
| `parametricSurface` | `recipes-src/procedural-parametric/` |
| `heightfieldGeometry` | `recipes-src/procedural-heightfield/` |
| hero: lighthouse (helpers only) | `recipes-src/procedural-lighthouse/` |
| hero: medieval cart (helpers only) | `recipes-src/procedural-cart/` |

Typecheck: `pnpm exec tsc -p docs/agents/recipes-src/tsconfig.json`. Render: the recipes `vite.config.ts` in that folder (real GPU on the remote runner; never local Playwright).

## Copy-ready examples

### Noise

```ts
import { createFbm2D, createSimplexNoise2D } from "@aura3d/engine/procedural";
const n = createSimplexNoise2D(7);           // [-1, 1], deterministic per seed
const hills = createFbm2D(7, { octaves: 5, frequency: 0.05 });
const crests = createFbm2D(7, { ridged: true });
const h = (x: number, z: number) => 3 + hills(x, z) * 2;
```

### Lathe from a 2D path

```ts
import { geometry, material } from "@aura3d/engine";
import { latheGeometry, path2d } from "@aura3d/engine/procedural";
const vase = latheGeometry({
  profile: path2d().moveTo(0, 0).lineTo(0.4, 0).cubicTo(1, 0.1, 1, 0.95, 0.55, 1.35).cubicTo(0.3, 1.65, 0.34, 1.85, 0.5, 2.2).lineTo(0, 2.1).points({ curveSegments: 20 }),
  segments: 64
});
const node = geometry.custom(vase, { name: "vase", material: material.pbr({ color: "#2f6f8f", roughness: 0.2 }) });
```

Profiles are `[radius, y]` ordered bottom to top; a profile that starts and ends on the axis (radius 0) is a watertight solid. `flip: true` accepts top-to-bottom order. Sharp turns (more than `creaseAngle`, default 0.9 rad) stay hard edges.

### Sweep along a spline

```ts
import { catmullRomCurve, sweepGeometry } from "@aura3d/engine/procedural";
const rope = sweepGeometry({ path: [[0, 0, 0], [2, 1, 0], [4, 0, 1]], steps: 48, radius: (t) => 0.2 * (1 - t) + 0.04 });
const ring = sweepGeometry({ path: catmullRomCurve([[2, 0, 0], [0, 0, 2], [-2, 0, 0], [0, 0, -2]], { closed: true }), steps: 72, radius: 0.1 });
// A box is a square profile along a straight 2-point path (steps: 1):
const plank = sweepGeometry({ path: [[-1, 0, 0], [1, 0, 0]], steps: 1, radius: 1, profile: [[-0.03, -0.1], [0.03, -0.1], [0.03, 0.1], [-0.03, 0.1]] });
```

Profiles are counter-clockwise polygons in the (normal, binormal) plane scaled by `radius`. Caps are flat fans from the profile centre (star-shaped profiles). Closed curves wrap the frame so the seam matches.

### Parametric surface plus noise

```ts
import { createFbm3D, parametricSurface } from "@aura3d/engine/procedural";
const noise = createFbm3D(3, { octaves: 4 });
const rock = parametricSurface({
  uSegments: 72, vSegments: 48, wrapU: true,
  fn: (u, v) => {
    const th = u * Math.PI * 2, ph = v * Math.PI;
    const d = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)] as const;
    const r = 1 + 0.3 * noise(d[0], d[1], d[2]);
    return [d[0] * r, d[1] * r, d[2] * r];
  }
});
```

The default facing is along `du x dv` (outward for the sphere above); pass `flip: true` to reverse.

### Heightfield terrain

```ts
import { createFbm2D, heightfieldGeometry } from "@aura3d/engine/procedural";
const f = createFbm2D(21, { octaves: 5, frequency: 0.045 });
const island = heightfieldGeometry({
  heightAt: (x, z) => 4 + f(x, z) * 2, size: 40, segments: 160, base: -6,
  colorAt: (_x, _z, h, slope) => (slope > 0.3 ? [0.4, 0.35, 0.3, 1] : h < 0.4 ? [0.76, 0.68, 0.46, 1] : [0.2, 0.4, 0.14, 1])
});
// Use a white material so the vertex colours show: material.pbr({ color: "#ffffff", roughness: 0.95 })
```

`base` (below every height) closes the mesh into a watertight slab; omit it for an open surface. Normals come from central differences of `heightAt`, so adjacent tiles with the same function share seamless normals.

### Compose parts into one draw call

```ts
import { composeGeometry } from "@aura3d/engine/procedural";
const set = composeGeometry([
  { geometry: vase, position: [0, 0, 0], color: [0.2, 0.4, 0.6, 1] },
  { geometry: vase, position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: 1.4, color: [0.8, 0.5, 0.2, 1] }
]);
```

Rotation is Euler `XYZ` radians. Mirrored (negative-determinant) parts keep outward winding. A part without `color` keeps its own vertex colours (so composed groups nest).

## Boundaries

- Normals under strong taper are corrected for the radius slope; extreme tapers to a point leave a degenerate ring.
- `sweepGeometry` caps are fans: non-star-shaped profiles need `caps: false` and manual caps.
- `composeGeometry` needs normals, UVs and indices on every part (all procedural builders provide them).
- Hero scenes use one white `material.pbr` per surface class with vertex colours; there is no texturing or UV atlas in these helpers.

## Tests

`tests/unit/procedural/procedural-helpers.test.ts` checks, per helper: determinism, bounds, vertex and triangle counts, unit-length normals, outward winding (positive signed volume, normals agree with faces), watertightness after position welding (no open or non-manifold edges), mirror handling and input validation. Run: `pnpm exec vitest run tests/unit/procedural`.
