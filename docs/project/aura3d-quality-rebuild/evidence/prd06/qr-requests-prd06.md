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

## tests/browser/example-dev-server.ts — deep contracts/* subpath unresolved

`packageEntryPoints` only maps exact `@aura3d/rendering/contracts` — deep
subpaths (`@aura3d/rendering/contracts/deform`, `.../deform-shapes`) miss and
throw. Lane harnesses work around it with strict-JSON importmaps inside the
harness HTML (`tests/qr/prd06/browser/*-harness.html`). Owner: 15.
