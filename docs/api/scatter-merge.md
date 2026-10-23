# Scatter planning and static merge

Two root utilities extracted from the Crayon game ports, where every game hand-rolled them: a deterministic placement planner and a static-mesh baker. Both are pure TypeScript (no scene graph, no GPU), exported from `@aura3d/engine`.

```ts
import { scatterAlongPath, scatterInArea, splitScatterByDistance, scatterTransforms, createScatterRandom, mergeStatic, mergeStaticByKey, instances } from "@aura3d/engine";
```

## Scatter

### `scatterAlongPath(options): AuraScatterPoint[]`

Places props along a road, rail, river or corridor.

| Option | Meaning |
| --- | --- |
| `path(s, lateral)` | World position at arc length `s` and signed lateral offset. Required. |
| `start`, `end` | Arc-length range. |
| `step: [min, max]` | Spacing between rows, drawn per row. |
| `lateral: [min, max]` | Distance from the path; `side` (`"both"` default, `"left"`, `"right"`) mirrors it. |
| `kinds` | Number of variants; each placement gets `kind` in `[0, kinds)`. |
| `scale`, `scaleDepth`, `yaw`, `yOffset` | Ranges drawn per placement (`yaw` also accepts a fixed number). |
| `skipChance`, `alongJitter` | Thin the rows and jitter them along the path. |
| `baseHeight(row, position)` | Height that `yOffset` is added to (default: the path position's Y). |
| `exclude` | Circle or box zones (XZ) that stay empty. |
| `minDistance` | Minimum XZ spacing, enforced with a spatial hash. |
| `heightRange`, `ground` + `maxSlope` | Height and slope filters. |
| `accept(point)`, `maxCount` | Final custom filter and a cap. |
| `seed` or `random` | Seed for the built-in 32-bit LCG, or a shared stream for chunked worlds. |

### `scatterInArea(options): AuraScatterPoint[]`

Same filters and per-placement ranges, over `area: { kind: "rect" | "disc", ... }`, until `count` placements are accepted or `count * attemptsPerPoint` attempts (default 12) are spent, so an unsatisfiable filter returns fewer points instead of hanging. `ground(x, z)` supplies the base height.

### Determinism contract

The draw order per placement is fixed: skip chance, lateral, along jitter, kind, yOffset, scale, scaleDepth, yaw; then one `step` draw per row (`scatterInArea`: position, kind, yOffset, scale, scaleDepth, yaw). Filters run after the draws, so adding an exclusion zone or a spacing rule never moves the placements that survive. The same seed gives the same layout on every machine. `tests/unit/scatter/scatter.test.ts` pins this by reproducing the Cloud Runner mesa layout (seed 555) from the original port algorithm.

### Radius LOD and instancing

```ts
const points = scatterAlongPath({ seed: 7, start: 0, end: 2000, path, step: [20, 40], lateral: [12, 90], kinds: 2, scale: [0.8, 1.3] });
const [near, mid, far] = splitScatterByDistance(points, [camera.x, camera.z], [180, 420]);
instances.model(assets.pineHigh, { transforms: scatterTransforms(near, { kind: 0 }) });
instances.model(assets.pineLow, { transforms: scatterTransforms(mid) });
instances.cone({ transforms: scatterTransforms(far), material: material.standard({ color: "#2f6b3a" }) });
```

`splitScatterByDistance(points, origin, radii)` returns `radii.length + 1` bands, closest first. `scatterTransforms(points, { kind?, baseScale? })` produces `instances.*` transforms (yaw about Y; `depthScale` multiplies Z). An empty list is valid everywhere: `instances.*` skips an empty node with the `INSTANCES_EMPTY` diagnostic instead of throwing.

## Static merge

### `mergeStatic(parts, options?): AuraCustomGeometrySpec | undefined`

Bakes every part's transform into one geometry, so a village of houses, lamps and rocks that share one material is a single draw.

```ts
const village = mergeStatic([
  { geometry: houseGeometry, position: [0, 0, 0], rotation: [0, 0.4, 0] },
  { geometry: houseGeometry, position: [12, 0, 4], scale: 1.2, color: "#e8c9a0" },
  { geometry: lampGeometry, position: [6, 0, 2] }
]);
if (village) scene.add(primitives.custom(village, { material: stoneMaterial }));
```

- Rotation is Euler XYZ in radians composed as `R = Rz * Ry * Rx` applied after scale, identical to instance transforms, so a baked part lands where an instance would.
- Normals use the inverse-transpose, so non-uniform scale keeps them unit length and perpendicular; a mirrored (negative-determinant) scale flips triangle winding.
- `color` tints vertex colours (`colorMode: "multiply"`, default) or overwrites them (`"replace"`). If any part has colours or a tint, every part gets colours (white where missing) so the merged geometry keeps them. UVs and normals survive only when every part has them, the same rule as `geometry.merge`. Custom vertex attributes must match across parts.
- An empty part list returns `undefined` (nothing to draw) instead of throwing.

### `mergeStaticByKey(parts, options?): Map<key, AuraCustomGeometrySpec>`

Groups parts by `key` (usually a material name) and merges each group: one geometry, hence one draw call, per key.

## Relationship to existing API

`geometry.merge` concatenates geometries without transforms. `planScatterInstances` (from `@aura3d/rendering`) plans GPU-instanced terrain scatter with wind and a frame budget. The utilities here are the authoring-time layer in front of `instances.*`; they do not replace either.
