# Q-01-5 — move the pending model-matrix/transform range into `compiler/sceneGraph.ts`

**Lane:** 01 (owns `packages/engine/src/agent-api/compiler/sceneGraph.ts` per CONTRACTS §3.2/§4.1)
**Requested by:** lane 15 (PRD-15 T3.8)
**Status:** OPEN
**Filed:** 2026-10-06

## What

CONTRACTS §3.2 sends the model matrix/transforms region of the old
`agent-api/index.ts` (originally :17637-18010) to `compiler/sceneGraph.ts`, which
is lane 01's file. PR 0b-1 did not carve that range, and lane 15 cannot edit
01-owned files — so the range stays in `index.ts` (by line in the `max-file-lines`
gate config) until 01 merges this move.

## Current residual (after the Phase 3 split)

Thirteen statements remain in `index.ts`, located now by symbol name:

| Statement | Kind |
|---|---|
| `transformNormals` | private fn |
| `createViewProjection` | export |
| `createModelMatrix` | export |
| `resolveModelFitScale` | private fn |
| `shouldNormalizeModelNode` | export |
| `animatedRotation` | private fn |
| `isModelTransformAnimationClip` | export |
| `isOrthographicCameraMode` | export |
| `identity4` | export |
| `colorToRgb` | export |
| `clamp01` | export |
| `normalize3` | export |
| `flattenSceneSnapshot` | export |

(The original range also contained `hasAuraTransform`, `composeAuraTransform`,
`applyAuraParentTransform`, `scaleToVec3` and the private math/color helpers
`multiply4`, `translation`, `scaling`, `rotationXYZ`, `isPositiveFinite`,
`primitiveSize`, `animatedPosition`, `mixRgb`, `scaleRgb`, `clampRgb`, `mix3`,
`flattenSceneNodes`, `normalizeQuaternion`, `slerpQuaternion`,
`rotationQuaternion`, `transformPositions`, `boundsFromPositions`, `mergeBounds`,
`resolveModelFitScale`-adjacent helpers. Those are already moved verbatim to
lane-15-owned `compiler/sceneMath.ts` because they are referenced by other
`compiler/` and `nodes/` leaves and cannot stay private in the barrel.)

## Requested change

Pure move (zero changed logic lines): cut the 13 statements above from
`packages/engine/src/agent-api/index.ts` into
`packages/engine/src/agent-api/compiler/sceneGraph.ts`, adding the imports the
moved text needs (`AuraSceneSnapshot`, `AuraModelNode`, `AuraPrimitiveNode`,
`AuraEffectNode`, `AuraLabelNode`, `AuraRuntimeNodeRegistry`, `AuraCameraMode`,
`AuraColor`, `AuraVec3` from `../nodes/types.js`; `GltfBounds` from
`./gltfRuntime.js`; `animatedPosition`, `primitiveSize`, `isPositiveFinite`,
`multiply4`, `translation`, `scaling`, `rotationXYZ`, `mixRgb`, `scaleRgb`,
`clampRgb`, `flattenSceneNodes`, `animatedRotation`, `orbitAnimatedAngle`-style
helpers from `./sceneMath.js` and `./actors.js` as needed), then add the public
names to `index.ts`'s re-export block
(`export { createViewProjection, createModelMatrix, shouldNormalizeModelNode,
isModelTransformAnimationClip, isOrthographicCameraMode, identity4, colorToRgb,
clamp01, normalize3, flattenSceneSnapshot } from "./compiler/sceneGraph.js";`).

`export` must also be added in `sceneGraph.ts` to the moved private helpers that
stay there (`transformNormals`, `resolveModelFitScale`, `animatedRotation`)
only if other modules reference them — today only the index-pending block does,
and it dissolves once this lands, so they can stay private.

`tsc --noEmit` must pass; the public "." union must keep all 785 names.

## Alternative lane 01 may prefer

If 01 would rather lane 15 perform this move (a second CCR-free delegation), say
so on this request and lane 15 will move the range into `compiler/sceneGraph.ts`
itself under the same verbatim rules.

## Contract served

§3.2 carve-out table (`compiler/sceneGraph.ts` → owner 01) and T3.8/T3.9: the
`max-file-lines` gate excludes this range by line until it lands.
