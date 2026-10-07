# PRD-10 Phase 5 evidence — kits, spline, extrude, placement, room, street, content bake

Branch `qr/prd10-kits`, stacked on `qr/prd10-water` (PR #189). All surfaces remain behind `A3D_QR_WORLD` (+ `_TERRAIN` for `conformToTerrain` grid edits).

## T5.1 kits — `agent-api/world/kits.ts`

- `world.defineKit(def)` validates license string, unique piece ids, footprint `<= gridSize`, light→socket references; returns `AuraKit { id, pieces, piece(id), cellKey, place(placements, opts), fill(shape, opts) }`.
- `place()` resolves `cell`/`position`/`rotationSteps`/`level`/`snapTo{target,socket}` into world transforms; levels stack at `levelHeight` (default 4 m); `snapTo` aligns the piece's socket to the parent's via 180° flip + socket-offset correction.
- Emission honours §7.1.7: ONE `scatter` node per unique asset id with explicit `placements` (mat3x4, same row-major layout as `packScatterPlacement`), plus `kind:"light"` nodes for piece practicals. No `group()`, no `createProductionInstanceTransforms`.
- `fill(shape,{seed,density,rotationSteps,exclude})` iterates `gridSize` cells inside the `AuraWorldShape` (circle / polygon ray-cast; spline-kind shapes fall back to bounds-less "contains" only for circle/polygon), weight-random piece choice via `scatterRng(seed)`, determinism asserted by checksum in tests.
- `world.kits` exports four kit definitions (`city`, `interior`, `trackside`, `space`) — 24 pieces total referencing `world/kits/<kit>/<piece>.glb`, licence CC0-1.0, author "Aura3D content bake".

## T5.2 spline — `agent-api/world/spline.ts`

- `worldSpline(points,{closed,tension,up,bankDeg})` → `{length, pointAt, tangentAt, frameAt, closestT}`.
- Centripetal Catmull-Rom (d0/d1/d2 knot spacing per segment, `closed` wraps control points); 16 samples/span arc-length table drives `pointAt`/`tangentAt` by arc-length parameter.
- Rotation-minimizing frames via parallel transport along the dense sample chain (verified: up stays +y on a straight path; orthonormal to 1e-4).
- `bankDeg` stations lerp smoothly around the loop and apply as a roll about the tangent — fixes a found bug where a single-element array was returned in degrees instead of radians.
- `closestT` = brute-force nearest sample + golden-section refinement within the neighbouring arc window.

## T5.3 extrude — `worldExtrude` in `spline.ts`

- Named profiles `EXTRUDE_PROFILES`: `road-2-lane` (±3.7 m + skirt), `road-4-lane` (±7.4 m), `race-track` (edge rails), `curb`, `rail`, `tunnel-round` (12-gon), `tunnel-box`, `fence`, `marking-line`; arrays of `[x,y]` pairs also accepted.
- Metre UVs: `u = profile.x · uScale`, `v = arcLen / vMetersPerTile` — attached post-`toJSON` because `defineAuraCustomGeometry` rebuilds the spec and drops non-contract fields.
- Adaptive station split when `dot(tangentA, tangentB) < cos(0.05 rad)`, cap 3 subdivisions per segment.
- `conformToTerrain` edits the terrain CPU height grid before upload: per texel → `closestT` → distance → linear falloff `w` → `heights[i] = cur(1-w) + splineY·w`; bumps `TerrainRecord.gridVersion`.
- Runtime: `TerrainRuntime.drawTerrains` compares `gpuState.gridVersion` to the record and disposes/re-uploads height/splat/instance buffers when stale.

## T5.4 placement — `agent-api/world/placement.ts`

- `worldPlaceAlong(spline, item, {spacing, offset, side, alignToTangent, jitter, seed, start, end, ground, scale})` — arc-length stepping, right/left offsets, optional full-basis alignment to the spline frame, terrain grounding via nearest-texel sample.
- `worldPlaceGrid(item, {origin, count, spacing, jitter, seed, ground, rotationY})`.
- `worldPlacePoisson(items, {shape, minDistance, seed, ground, exclude, weights})` — Bridson sampling on the shape bounds, cell `r/√2` grid, K=30; exclusion honoured; weighted choice across multiple items.
- All emit ONE `scatter` node per unique asset (asset `id` ?? `url` key) + `scatterChecksum`. Kit pieces carry their practical lights through: socket offsets are yaw-rotated and emitted as `AuraLightNode`s (fixes: street lamps actually illuminate).
- Function items emit one positioned node per instance.

## T5.5 room + street — `agent-api/world/{room,street}.ts`

- `world.room({size, kit, walls, floor, ceiling, openings, dressing, biome, origin})`: perimeter walls built as box spans split around `openings` (opening entries emit a lintel box above the doorway — fixes lintel spans being drawn as full walls); optional door kit pieces for tall openings; floor = `floor-tile` `kit.fill` (or material slab); seeded dressing fill on an inset polygon; ceiling lamps emit real point lights at socket positions.
- `world.street({path|spline, lanes, sidewalkWidth, kit, buildings, props, markings, wet, conformToTerrain, materials})`: road profile extrude (+ `conformToTerrain`), curb-and-sidewalk custom profile on both sides at `±(roadHalf + sidewalkWidth)`, `marking-line` emissive centreline (+ lane pair for 4-lane), building kit pieces placed every 12 m facing the street (`rotationSteps` based on street side), `placeAlong` street-lamp spacing 30 m with practicals + planters; `wet` warns once (not yet wired to water film).
- Both builders produce only contract-legal node kinds (primitive/scatter/light).

## T5.6 cityBlock — **out of lane, qr-request #204**

`tools/qr-ownership/check.mjs` resolves `packages/engine/src/agent-api/nodes/prefabs/cityBlock.ts` to **owner 15**, so the lane-10 rebuild cannot land here. Filed qr-request issue #204 with the intended implementation handed over; flag-off behaviour is unchanged regardless of reassignment.

## T5.7 assets + bake tool — `tools/world-content-bake/`, `packages/engine/assets/world/`

- Deterministic bakes (all seeds fixed, no Math.random): 24 kit GLBs (minimal binary glTF 2.0 writer; box/cylinder/merge recipes per piece), `water/water-normal-0-512.rgba` (gradient-wave dirs + tiling value-noise ripple, derivative-encoded), `water/foam-512.png` (wrapped Worley F2−F1 + speckle), `water/caustics-4x4-256.png` (4×4 Voronoi-ridge frame atlas), `noise/macro-variation-512.rgba`, `noise/blue-noise-64.rgba` (high-pass).
- `manifest.json` updated in place: 30 entries with `sha256:` hash, licence CC0, `generated` provenance stamp. Repo convention conflict filed earlier as qr-request #177 (assets/world → owner 15 in QR_OWNERSHIP.json despite §6.6).
- Bake was **run** here (`npx tsx tools/world-content-bake`); output is deterministic (sha256-pinned), so the repo copy and a re-bake verify identically — asserted by the manifest test.

## Gates

- `npx tsc -p tsconfig.build.json --noEmit` — clean.
- `npx eslint` on all touched paths — clean.
- `npx vitest run tests/unit/contracts/impl/` — 7 files / 98 tests pass; `prd10-kits.test.ts` adds 26 tests (spline arc-length/endpoints/orthonormal frames/banking/closestT/degenerate, extrude UVs/conformToTerrain+gridVersion/profile rejection, kit validation/cell math/rotationSteps/snapTo/lights/fill determinism+exclude/CC0 kits, placeAlong spacing+alignToTangent, placeGrid checksum, placePoisson minDist+exclude+determinism, room wall spans+lintel+floors+lights, street road/sidewalks/markings/buildings/props/4-lane, bake manifest sha256/GLB header).
- Ownership check: all new/edited code paths → owner 10; `assets/world/**` flagged owner 15 (qr-request #177), `cityBlock.ts` owner 15 (qr-request #204).

## NOT RUN

- Browser specs / macos-14 captures (no GPU locally) — lane CI job.
- `world.street` visual scene coverage (prd10 scene adaptation) — G-PANEL phase.
- `wet: true` water-film coupling — deferred, warns instead of silently no-op.
