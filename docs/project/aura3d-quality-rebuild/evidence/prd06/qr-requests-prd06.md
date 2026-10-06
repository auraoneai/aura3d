# PRD-06 queued requests (CCR / qr-request)

`gh` is unauthenticated on lane VMs, so these are committed here as ready-to-file
issue bodies. Labels suggested: `qr-request`, `ccr`, `to:prdNN` per target lane.
None block PRD-06 progress; lane-local fallbacks are in place for each.

## Q-01-CCR-06-6 — contracts: deform.ts PR 0a surface should carry real C-18 shapes

`packages/rendering/src/contracts/deform.ts` (opened under PR 0a, owner 01)
declares different C-18 shapes than CONTRACTS.md :1172-1210
(`SkinningPaletteBinding`, `SkinningPaletteTextureCacheLike`,
`MorphTargetTextureResult`, `buildMorphTargetTexture`, `DEFORM_CHUNKS` tuple,
`deformFeatureId`, `vertex:deform` hook). PRD-06 keeps a lane-owned
`deformResources` ContractSlot in `lanes/prd06.ts` providing the real shapes;
please sync the contract module so lanes that consume `contracts/deform` get the
real surface.

## Q-15-2 / Q-11-3 — sub-image upload parity on LeanWebGL2 / WebGPU

`Texture.update(data, region?)` + revision-based `texSubImage*` dispatch landed
for the WebGL2 texture registry only (`webgl2/TextureUpload.ts`). LeanWebGL2 and
WebGPU still re-upload whole textures every revision bump. Request parity so the
0-textures/frame palette path holds on those backends too.

## Q-15-4 — engine should install resolved QR flags via setRendererQrFlags

`resolveQrFlags` in `lanes/prd06.ts` honors the installed `rendererQrFlags`
(`FrameGraph.ts:28-38`), but nothing in the engine app path calls
`setRendererQrFlags`. Until it does, `prd06QrFlags()` resolves
`qualityRebuild.flags` → `?a3d-qr=` → `A3D_QR`/`VITE_A3D_QR` → per-flag
`A3D_QR_*` itself.

## tests/unit/contracts/harness.ts — conformance() cannot take provided slots

`conformance(slot, suite)` passes `slot.provided` — a boolean — as the real
impl, so any slot that has had `.provide()` called fails trivially. PRD-06 impl
tests (`tests/unit/contracts/impl/prd06-deform.test.ts`) call `slot.get(flags)`
directly instead. Owner: 01.

## Q-05-1 — wire inspectAnimationClips fields into inspectGltfAnimations

PRD-06 T0.7 landed the pure extractor `inspectAnimationClips(json, bin)` in
`packages/aura3d-cli/src/commands/prd06/inspectAnimationClips.ts` (lane-owned)
plus the standalone C-39 command `aura3d animation inspect-clips <glb>`.
`AuraCliAnimationClipInspection` in `asset-inspection-types.ts` (owner 05) now
carries optional `duration`, `hasRootMotionCandidate`, `frameRate`, but
`inspectGltfAnimations`/`asset-manifest.ts` do not populate them — request that
lane 05 call `inspectAnimationClips` (or re-implement the accessor math) so the
manifest surfaces real durations instead of `durationSource: "defaulted"`.

## Q-13-1 — wire fighterClipMap into the fighting-game template

PRD-06 T0.9a shipped `tests/qr/prd06/fixtures/fighting-clipmap/fighterClipMap.ts`
(`Record<FighterAssetKey, Record<FighterClip, {clip, standIn?}>>`) and the
`validateClipMap`/`validateFighterClipMap` validator in
`packages/engine/src/agent-api/GameCharacterAnimation.ts` (exported via the
lane barrel). The `apps/aura-clash-showcase` clip map and the
`packages/create-aura3d` `fighters.ts` template still resolve clips ad hoc —
request lane 13 adopt `validateClipMap` + the fixture map shape so stand-in
warnings (`FIGHTER_CLIP_STAND_IN`) and missing-clip errors
(`FIGHTER_CLIP_MISSING`) are uniform.

## tests/browser/example-dev-server.ts — deep contracts/* subpath unresolved

`packageEntryPoints` only maps exact `@aura3d/rendering/contracts` — deep
subpaths (`@aura3d/rendering/contracts/deform`, `.../deform-shapes`) miss and
throw. Lane harnesses work around it with strict-JSON importmaps inside the
harness HTML (`tests/qr/prd06/browser/*-harness.html`). Owner: 15.
