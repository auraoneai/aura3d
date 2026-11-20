# Procedural sculpting kernel (`@aura3d/engine/sculpt`)

`@aura3d/engine/sculpt` (added in 5.5.6) builds meshes in TypeScript: curve and surface builders, implicit-SDF sculpting,
one-piece SDF limb chains, vertex painting and fairing, and assemblers that turn the result into `geometry.define` /
`geometry.multiMaterial` input. It is the kernel the showcase games use for their procedural characters, vehicles and props.

Every builder returns plain mesh data (`RawMesh`) or a custom geometry spec. Nothing runs per frame: build once at load and
cache the result with `memoizeGeometry`. Source: `packages/engine/src/sculpt/`, entry `packages/engine/src/public/sculpt.ts`.
Full declarations are in [`public-api.md`](public-api.md) under `@aura3d/engine/sculpt`.

Exports marked **5.6.0** are new in 5.6.0; the rest shipped in 5.5.6.

## Types

| Export | Description |
| --- | --- |
| `V2`, `V3`, `V4` | Read-only number tuples. `V4` is `[x, y, z, radius]` for spines and joints. |
| `RawMesh` | `positions`, `normals`, `uvs`, `indices`, optional linear-space RGBA `colors`, optional `analyticNormals` flag. |
| `MultiMatSlot` | `{ mesh, materialIndex }`: one part of a multi-material assembly. |
| `TransformOpts` | `{ pos?, rot?, scale? }` for `transformMesh` (Euler XYZ `rot` in radians). |
| `AuraGroupNode` | The group scene-node type returned by `assembleMultiMaterialNode`. |
| `SdfLimbCapsule`, `SdfMittenHand`, `SdfLimbChain` | Input shapes for SDF limb chains (capsules, mitten hands, joint `blend`, grid `cell`). |
| `SculptHairClump`, `SculptHairMassOptions` | Input shapes for `sculptHairMassMesh`. **5.6.0.** |

## Vector math, noise and curves

| Export | Description |
| --- | --- |
| `add3`, `sub3`, `scale3`, `dot3`, `cross3`, `norm3`, `lerp3` | Tuple vector math. |
| `hash01(seed)` | Deterministic integer hash in `[0, 1)`. |
| `fbm3(x, y, z, seed?)` | Deterministic 3-octave value fBm in `[0, 1]`. |
| `catmullRomSpline3(points, segmentsPerSpan?, closed?)` | Smooth 3D Catmull-Rom spline through `points`. |
| `bezierCurve2(p0, p1, p2, p3, segments?)` | 2D cubic Bezier for lathe profiles, fenders and eaves. |

## Mesh primitives

| Export | Description |
| --- | --- |
| `transformMesh(src, opts?)` | Rigid plus non-uniform transform with inverse-transpose normals and winding flip on negative scale. |
| `toFlatShaded(src)` | Splits shared vertices into per-triangle flat normals. |
| `bevelBoxMesh(wx, wy, wz, bevel?)` | Box centred at the origin with 45-degree bevels. |
| `latheMesh(profile, radialSegments?, flatShaded?)` | Surface of revolution around `+Y` from a `[radius, y][]` profile. |
| `tubeSweepMesh(spine, radialSegments?, flatShaded?)` | Tube along a `[x, y, z, radius][]` spine with parallel-transport frames and end caps. |
| `extrudePolygonMesh(ccwRing, height, bevel?, flatShaded?)` | Extrudes a convex or concave XY polygon across `Z`. |
| `loftSectionsMesh(sections, capEnds?, flatShaded?)` | Lofts equal-count cross-section rings into a hull. |
| `icosphereFacetMesh(radius, detail?, noiseAmp?, seed?)` | Faceted icosphere with optional `fbm3` displacement. |
| `icosphereSmoothMesh(radius, detail?, noiseAmp?, seed?, upwardNormalBias?)` | Smooth icosphere with optional upward normal bias for foliage. |
| `mergeRawMeshesToRaw(meshes)` | Concatenates `RawMesh` parts into one `RawMesh`. |

## Compound sub-assemblies

| Export | Description |
| --- | --- |
| `wheelAssemblySlots(opts)` | Tire, rim, spokes and optional brake rotor as `MultiMatSlot[]`, axle along `X`. |
| `latticeTrussMesh(opts)` | Four-chord steel truss with X-braced bays. |
| `archwayVoussoirSlots(opts)` | Masonry arch of alternating voussoirs and a keystone. |
| `layeredCanopyMesh(opts)` | Multi-puff broadleaf canopy with upward-biased normals. |
| `coniferBoughTierMesh(opts)` | Stacked drooping conifer tiers. |
| `stratifiedCliffMesh(opts)` | Terraced `fbm3`-faceted cliff, meant for `material.strata(...)`. |
| `articulatedFolkSlots(opts)` | Articulated townsperson figure (coat, head, hair or hat, arms, legs, shoes, optional bag). |

## Colour, fairing and normals

| Export | Description |
| --- | --- |
| `srgbToLinearChannel(c01)` | sRGB channel to linear light. |
| `srgbHexToLinearRgba(hex, alpha?)` | `#rgb`, `#rrggbb` or `#rrggbbaa` to linear `[r, g, b, a]`. |
| `paintMeshColors(src, colorOrSampler, multiplyExisting?)` | Paints per-vertex colours from a colour or a `(pos, norm, uv, vertexIndex)` sampler. |
| `bakeMeshCavityAO(src, strength?)` | Bakes crevice and ground-hemisphere occlusion into vertex colours. |
| `subdivideSmoothMesh(src, iterations?, smoothWeight?)` | Position-welded Loop-style subdivision (`iterations` clamped to `1..3`). |
| `recomputeSmoothWeldedNormals(src)` | Smooth area-weighted normals across welded positions. |
| `taubinSmoothMesh(src, iterations?, lambda?, mu?)` | Volume-preserving Taubin fairing. |
| `smoothVertexColors(mesh, passes?)` | Averages vertex colours with their one-ring neighbours to soften paint seams. |

## Organic and SDF sculpting

| Export | Description |
| --- | --- |
| `sculptHumanoidLimbMesh(joints, radialSegments?, muscleBulge?)` | Limb swept along a Catmull-Rom spine with muscle contour and domed caps. |
| `sculptAnatomicalLimbMesh(stations, opts?)` | Lofted limb with separate lateral (`rx`) and front-back (`rz`) sections. |
| `emptyMesh()` | A valid empty `RawMesh`. |
| `deformMesh(src, mapper)` | Moves vertices with `(pos, norm, vertexIndex) => newPos` and recomputes welded normals. |
| `sminPoly(a, b, k)`, `smaxPoly(a, b, k)` | Polynomial (`C^1`) smooth minimum and maximum for SDF blends. |
| `sminCubic(a, b, k)`, `smaxCubic(a, b, k)` | Cubic (`C^2`) smooth minimum and maximum, softer than the polynomial pair; fall back to `Math.min` / `Math.max` when `k <= 1e-5`. **5.6.0.** |
| `sdfEllipsoid(p, center, radii)` | Approximate signed distance to an axis-aligned ellipsoid. |
| `sdfTaperedCapsule(p, a, b, ra, rb)` | Signed distance to a capsule tapering from radius `ra` to `rb`. |
| `sculptOrganicSdfMesh(opts)` | Extracts a watertight mesh from `evaluate(x, y, z)` (negative inside) inside `boundsMin`..`boundsMax` with dual surface nets, Taubin fairing and analytic normals. |
| `sculptCurvedHairLockMesh(opts)` | Curved tapered hair lock along `root -> mid -> tip`. |
| `sculptHairMassMesh(options)` | One-piece hair mass: scalp shell clipped at a sloped hairline (optional undercut), smooth-unioned clumps and lock grooves. **5.6.0.** |
| `sculptDrapedGarmentMesh(stations, opts?)` | Lofted garment with cloth folds and fairing. |
| `sculptStylizedHeadMesh(radius, opts?)` | Stylized head with jaw taper, cheekbones, brow ridge and nose bridge (`+Z` forward). |
| `sculptStreamlinedHullMesh(length, width, height, opts?)` | Superellipse hull along `Z` for vehicles, pods and boats. |

## SDF limb chains

| Export | Description |
| --- | --- |
| `sculptSdfLimbChainMesh(chain)` | Sculpts capsules and mitten hands as one smooth surface with no gap at joints. |
| `limbChainTagger(chain)` | Returns `(p) => tag`, the nearest sub-part for painting or splitting. |
| `splitMeshByTag(mesh, tagAt)` | Splits a mesh into per-tag sub-meshes by triangle centroid, keeping shared normals. |
| `sculptPaintedLimbChain(chain, hexByTag, seamPasses?)` | Sculpts a chain and vertex-paints each tag with softened seams. |

## Assembly into scene geometry

| Export | Description |
| --- | --- |
| `memoizeGeometry(key, build)` | Page-level cache (at most 512 entries) so procedural models are built once. |
| `computePositionsBounds(positions)` | `{ min, max }` of a `Float32Array` of positions, or `undefined` when empty. |
| `mergeRawMeshes(meshes)` | Merges `RawMesh` parts into one indexed `AuraCustomGeometrySpec` with precomputed bounds. |
| `buildGroupedGeometrySpec(slots)` | Packs `MultiMatSlot[]` into a grouped spec for `geometry.multiMaterial`. |
| `assembleMultiMaterialNode(name, slots, materials, options?)` | Builds a complete `geometry.multiMaterial` group node with optional `id`, `tags`, transform, shadows and visibility. |

## Example

```ts
import { camera, createAuraApp, geometry, looks, material, scene } from "@aura3d/engine";
import { latheMesh, memoizeGeometry, mergeRawMeshes, taubinSmoothMesh } from "@aura3d/engine/sculpt";

// mergeRawMeshes returns an AuraCustomGeometrySpec with bounds, ready for geometry.custom.
const vase = memoizeGeometry("vase", () =>
  mergeRawMeshes([taubinSmoothMesh(latheMesh([[0.2, 0], [0.45, 0.4], [0.18, 1.1], [0.26, 1.3]], 32))])
);

const app = createAuraApp("#app", {
  scene: scene().add(looks.preset("product-studio"))
    .add(geometry.custom(vase, { name: "vase", material: material.pbr({ color: "#c58b5a", roughness: 0.5 }) }))
    .camera(camera.auto({ fill: 0.8 })),
  ...looks.appOptions("product-studio")
});
void app.ready();
```

## Craft bar for procedural hero models

A procedural model built only from boxes reads as a placeholder. Use the curved and compound builders and several materials:

- **Vehicles and drones:** `loftSectionsMesh` hulls, a separate glass canopy (`material.studioGlass`) and `wheelAssemblySlots` wheels, not stacked `bevelBoxMesh` bricks with flat cylinder wheels.
- **Masts, gantries and stands:** `latticeTrussMesh` and `archwayVoussoirSlots`, not solid box slabs.
- **Trees:** a `tubeSweepMesh` trunk with `layeredCanopyMesh` or `coniferBoughTierMesh`, not a cylinder topped with a sphere or cone.
- **Cliffs:** `stratifiedCliffMesh` with `material.strata(...)`.

The showcase games in this repository enforce this in `tests/unit/procedural-kernel/procedural-craft-gate.test.ts`: every `art/proceduralModels.ts` calls at least 2 curved or compound builders, makes at least 4 `material.*` calls with at least 3 distinct presets, assembles through `assembleMultiMaterialNode`, `geometry.multiMaterial` or `buildGroupedGeometrySpec`, and never imports `three`.

## Boundaries

The kernel produces geometry data only. It does not rig, animate or texture meshes, and it makes no claim about visual parity
with scanned or hand-modelled assets. See [claims-and-boundaries](../agents/claims-and-boundaries.md).
