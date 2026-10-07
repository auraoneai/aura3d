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

Same seam carries the §970 option aliases: `renderer.morph: "gpu" | "cpu"` →
`A3D_QR_ANIMATION_GPU_MORPH`, `renderer.skinnedShadows` →
`A3D_QR_ANIMATION_SKINNED_SHADOWS`, `renderer.skinnedPbr: "unified" | "fork"`
(Q-01-2) — the fields exist on `A3DRendererOptions` (`nodes/types.ts:1030+`)
but no app path translates them into flag values. Lane 06 reads only the flag
side (`prd06FlagsOn`), so the aliases are inert until installation lands.

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

## Q-01-4 — forward path needs a per-item select/bindUniforms consumer at program-acquire

`contracts/program.ts`'s `ShaderFeature.select`/`bindUniforms` contract is only
honored on the depth path today: `Prd02DepthShaderLibrary` calls
`feature.select({item, pass:"depth", tier, flags})` per item
(`shadows/Prd02DepthShaderLibrary.ts:95-204`). The forward pass acquires
programs through the material's `programFeatures(ctx)` stamp and never calls
`feature.select(item, "forward", tier, flags)` — so a `vertex:deform`
contributor like `prd06.deform` gets compiled with the pre-select `true` stamp
(no `A3D_SKINNING`/`A3D_MORPH` defines), and nobody calls its `bindUniforms`.

PRD-06 works around it lane-locally: `forward/Deform.ts` (lane-owned carve)
checks `shader.reflection.uniforms.has("u_morphTexture")` and calls
`bindPrd06MorphTextureUniforms` directly — so a generated program that *did*
get the deform chunks bound correctly, and any program that didn't keeps the
legacy CPU morph path untouched. Request lane 01 add the real consumer:
per-item `select` at program-acquire (feeding `computeProgramKey`) plus
`bindUniforms` at draw, so forward and depth behave identically and the
morph-bucket program keys actually materialize.

## Q-01-5 — MultiDraw has no integer-uniform upload path

`webgl2/MultiDraw.ts:115-194` uploads only floats: `number` → `uniform1f`,
arrays → `uniformMatrix4fv`/`uniform4fv`/`uniform3fv`/`uniform2fv`. There is no
`uniform1i`/`uniformNi`v dispatch, and `ReadonlyMap<string, UniformValue>`
cannot express an int array (`Int32Array`/`Uint32Array` are `UniformValue`
members but never reach an `uniform*i` call). §8.2's `int`/`ivec4` morph
uniforms are therefore declared `float`/`vec4` in the prd06 chunks with
`int(x + 0.5)` casts in GLSL — documented in `shaders/deform/morph.glsl.ts`.
Request an `uniform1i`/`uniformNiv` path so the next consumer needing real
integer uniforms does not have to repeat the float-encoding workaround.
(Related: Q-01-3's `sampler2DArray`/`TEXTURE_2D_ARRAY` support already landed —
the only missing piece for §8.2 texture-array bindings is integer uploads.)

## Q-06-1 (inbound → lane 15) — drain takeClipApplyDegradations through ctx.degrade

PRD-15's Q-06-1 asks lane 06 to route `applyProductionActorAnimation` clip
failures through `ctx.degrade`. `SceneCompileContext` does not reach the
runtime render path, so T1.8 records them into a pending queue instead —
`takeClipApplyDegradations()` in `compiler/animation.ts` (same seam pattern as
`takeWorldEnvDegradations`). Request lane 15 drain it into `ctx.degrade` /
`CompiledScene.degradations` when the compile→runtime degrade plumbing lands.
Entries carry `{ code: "clip-apply-failed", nodeId?, message, cause? }`
(AuraDegradation minus `frame`).

## Q-01-6 — generated UBO `layout(binding = N)` is not valid WebGL2 GLSL

`resources/UniformBlock.ts` `uniformBlockGlsl(name, fields, binding)` emits
`layout(std140, binding = 0) uniform AuraFrame { … }` when a binding is passed.
The `binding` layout qualifier on a uniform block is **not valid in WebGL2**
(the WebGL2 spec removes it; blocks must be bound via `uniformBlockBinding`).
ANGLE's translator rejects it on every backend — verified on headless chromium
(SwiftShader) with

    ERROR: 0:17: 'binding' : invalid layout qualifier: not supported
    ERROR: 0:17: 'binding' : invalid layout qualifier: only valid when used with pixel local storage

so every generated program (`generateProgramImpl` splices the AuraFrame decl
into both stages) fails compile on a real browser — this bites the
`tests/qr/prd01` program-compile spec and any PRD-06 generated-program path.
Two options for lane 01: (a) emit `layout(std140)` without `binding` —
un-linked blocks default to binding point 0, which already matches
`bindUniformBuffer(…, 0)`; or (b) drop the qualifier AND call
`getUniformBlockIndex`/`uniformBlockBinding` at link time in `WebGL2Device`
for explicitness. Option (a) is a one-line emit change with no device work.
Until it lands, the T2.4 parity harness strips `binding = N` from generated
sources before `createShaderProgram` (documented in
`tests/qr/prd06/browser/skinned-pbr-parity-harness.ts`).

## Q-01-2 (restate) — `physicalFeatureSet` never stamps `features:{}`

`SkinnedLitMaterial`/`physicalFeatureSet` produces a `ProgramFeatures` record
with an empty `features` map, so even after Q-01-4's select consumer lands,
the generated PBR program for a skinned PBR item has no `prd06.deform` key to
select on. T2.4's unified path needs material features to carry the deform
stamp (`skin4`/`skin8`/morph bucket) — the parity spec verifies the deform
program against a static twin with the stamp applied manually.
