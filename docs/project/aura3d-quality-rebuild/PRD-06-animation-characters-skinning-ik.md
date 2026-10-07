# PRD 06: Animation, Characters, Skinning, IK

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`.
Evidence base: `research/09-animation-characters.md` (primary), `research/17-games-g*.md`, `research/18-completeness-critic.md` (C10, row "Animation controller freeze", Q6), `research/19-claim-verification.md` (C4, C16), `research/20-game-scorecards-code-pixelstats.md` (non-visual categories), `research/21-game-vision-judgment.md` (visual categories, authoritative), `research/22-benchmark-pass1-code-metrics.md`, `research/23-benchmark-vision-judgment.md` (authoritative benchmark visuals). All `research/` paths are relative to `docs/project/aura3d-quality-rebuild/`. Code line numbers were re-checked in this checkout unless marked "(per research/NN)". A staff review on 2026-10-05 re-verified E1-E5, E8-E15, E17, E19-E28, E30-E37 against the source and corrected E14, E21, E24, E27, the gallery-shift and rooftop sway references, the foot-planting line references and the ShaderLibrary fork ranges. It also added E38-E42. Line numbers drift, so every task names the function as well as the line, and the function name is authoritative.

Passing tests, 200-status routes, non-blank screenshots and "changed pixels" are not quality, and this PRD does not count them as quality. The gate is whether characters in the shipped games and in the same-scene benchmark look and move like they would in a competent modern three.js build. A vision model and a human reviewer judge that.

**Parallel execution (revision 2026-10-05).** This PRD runs as the PRD 06 lane under `CONTRACTS.md` (contracts-first). It never waits on another lane. It builds against the PR 0a stubs of every contract it consumes, provides C-18 (deformation resources) and C-19 (AnimationPlayback API) with their stubs kept working, writes only the files CONTRACTS §4.1 assigns to lane 06, and reaches files owned by other lanes only through registered extension points or non-blocking `qr-request` issues (§12.3). Every behaviour change is behind `A3D_QR_ANIMATION` (sub-flags `_POSE_MIXER`, `_GPU_MORPH`, `_SKINNED_SHADOWS`). Acceptance is split into **Standalone** (§17.0: provable by this lane alone with stubs; gates PRD 06 merges and the `standalone-accepted` flag state) and **Integrated** (§17.1, §17.4: evaluated only at CONTRACTS §7 checkpoints; never blocks). Where this document says "PRD NN" it names the owner of a contract or a file, never a prerequisite. Benchmark scene ids follow C-30 (`prd06-<slug>`); earlier draft ids `08b` and `p06-*` are renamed accordingly.

---

## 1. Problem statement

Aura3D characters read as "Atari / early-Nintendo" motion. They are rigid wholes that wobble, squash and slide. There is no weight shift, no contact, no secondary motion, and in shadow they keep a T-pose or bind pose. Six independent defects stack:

1. **The documented agent path freezes characters.** `AnimationController` + `clipRegistry: assets.x` + `bindRuntimeNode` sends a truthy empty pose to the node every frame. The production renderer then takes `applyRetargetedPose(emptyPose)` *instead of* playing the clip. Clip durations default to 1 s. This path is taught by the skill, used by the `fighting-game` template, and hit by `showcase-gallery-shift` (research/19 C16, both skeptics).
2. **Skinned and morphed meshes cast bind-pose shadows.** The only depth shader is position-only (research/19 C4, confirmed by both skeptics). Benchmark 08 Aura shadow is "effectively missing" (research/23 §08, Aura 3.5 vs three 5). Benchmark 15 shadow footprints are about half of three's and "don't match the animated silhouettes" (research/22 §15). In Aura Clash the fighters "cast no shadows" in the vision judgment (research/21 aura-clash, shadows 2/10).
3. **The root `node.play()` path is single-clip.** It has no crossfade, ignores `speed`, silently falls back to the first clip, and does not reset bones the new clip leaves unanimated (research/09 §3.4).
4. **There are five parallel animation stacks with toy blend semantics** (four GLB/clip evaluators plus the `@aura3d/animation` controller's own pose blender, E38). Weights are renormalised, additive has no reference pose, masks are substring 0/1 matches, there is no phase sync, and "inertialization" is only a weight curve (research/09 §3.1-3.3).
5. **Morph and palette paths are toy-grade.**
   - GPU morph is limited to 4 targets × 64 vertices and only on an unlit flat-colour shader. Every lit or skinned morph mesh rebuilds, uploads and disposes a Geometry every frame.
   - Rigs with more than 96 joints allocate a new RGBA32F texture per draw per frame.
   - TAA throws on skinned geometry (research/09 §1.3, §2; `TemporalHistory.ts:73-74`).
6. **Content compensates instead of the engine being fixed.**
   - Only 1 of 18 showcases (Aura Clash) drives a skinned rig with authored clips in visible pixels.
   - The rest use 4-triangle cards, 72-triangle block figures, static statues and rigid parts, animated with `Math.sin` on the root transform (research/09 §6).
   - The well-tested libraries (springs, two-bone and foot IK, retargeting, root motion, inertializer, state graphs) have 0-2 app consumers each.

Owner-visible outcome today:
- Gallery Shift "player is a blocky, Minecraft-style voxel figure … no gait difference between SPRINT and SNEAK" (research/21, animation_quality 3, character_presentation 2).
- Skyline Runner: "a paper-doll card hero in a 3D world. This is the worst single failure" (research/20, character_presentation 1).
- Rooftop Buckets: "static statues driven by root rotation, squash-scale and sin sway" (research/20, animation_quality 1.5).
- Mech Hangar: animation_quality 0.75 (research/20).

## 2. Evidence from current code (path:line)

| # | Defect | Evidence |
|---|---|---|
| E1 | Root renderer prefers any truthy pose over clip playback | `packages/engine/src/agent-api/index.ts:13871-13883` (`if (currentState.animationPose) entry.actor.applyRetargetedPose(...) else applyProductionActorAnimation(...)`). This sits inside `createProductionRuntimeRendererInput` (`:13842-14012`), which PR 0b-1 carves verbatim to `agent-api/compiler/renderInput.ts` (owner 15, CONTRACTS §3.2) |
| E2 | Node handle stores any pose, including `{bones:{}}` | `packages/engine/src/agent-api/index.ts:10982-10984` (`setAnimationPose`); carved by PR 0b-1 to `agent-api/app/actorAnimationHandle.ts` (owner 06) |
| E3 | Controller pushes `node.play` **and** `setAnimationPose(snapshot.pose)` whenever `applyPose !== false` | `packages/engine/src/agent-api/AnimationController.ts:1805-1840` (pose at `:1823-1825`) |
| E4 | Clips without a sampler return `fallbackPose ?? emptyPose` | `AnimationController.ts:1780-1796` (`:1793`); `emptyPose` `:3011-3017` |
| E5 | Embedded GLB clip names become `duration: 1, durationSource: "defaulted"` with no sampler | `AnimationController.ts:2646-2666` |
| E6 | Correct per-clip samples are already computed but only reach an `importedRuntime` nobody passes | `createRuntimeNodeClipSamples` `AnimationController.ts:2370-2384`; `applyImportedAnimationRuntime` gated at `:1831-1836` |
| E7 | When skeleton metadata exists, the fallback is `createIdentityPose`. That writes zero translation onto every bone and collapses the rig instead of freezing it | `AnimationController.ts:3019-3036` (research/19 C16 skeptic-1 counter-evidence) |
| E8 | Typed manifest carries clip names only (no duration, keys or sampler) | `packages/aura3d-cli/src/asset-manifest.ts:63-65` (`animationClips: asset.animations`); `AuraCliAnimationClipInspection` has no `duration` (`packages/aura3d-cli/src/asset-inspection-types.ts:12-19`) |
| E9 | Fighting-game template clips are `tracks: []` pose fallbacks, so every generated fighting game starts in bind pose | `packages/create-aura3d/templates/fighting-game/src/game/fighters.ts:57-79` |
| E9b | The template's default heroes cannot satisfy its own clip contract. `REQUIRED_FIGHTER_CLIPS` lists 9 states (`fighters.ts:37-47`). The player hero `showcaseWalkAnimatedGirl` has one clip, `"Take 001"`, and the rival `showcaseRunnerRobot` has `IDLE`/`WALK`/`RUN`/`ALL` (`templates/fighting-game/src/aura-assets.ts:7,20`). Deleting the `tracks: []` clips alone therefore cannot produce real attack clips | `fighters.ts:37-50`; `aura-assets.ts:1-22` |
| E10 | Character-controller template computes locomotion weights but plays one fixed clip. The hero asset has exactly one clip, `"Take 001"` | `templates/character-controller/src/main.ts:28,59,88`; `templates/character-controller/src/aura-assets.ts:12` |
| E11 | Root `node.play` replaces `node.animation`. No previous-clip state is kept | `index.ts:10970-10973` |
| E12 | Root clip path calls `playClip(oneClip, seconds)`: no crossfade | `index.ts:15070-15124` (`:15119` `entry.actor.playClip(...)`) |
| E13 | `speed` is ignored when computing clip time | `resolveAnimationSeconds` `index.ts:15461-15477`, `resolveProductionActorAnimationSeconds` `:15479-15490` (no `speed` term) |
| E14 | Clip-name resolution tries an exact normalised match, then synonym groups (`GLTF_CLIP_SYNONYM_GROUPS`), then bidirectional substring containment, and finally falls back to `available[0]` silently. The substring step can also pick a wrong clip silently, for example `"run"` matching `"RunJump"` | `packages/assets/src/GLTFAnimationRuntime.ts:110-136` (`:135`) |
| E15 | Blend renormalises weights (`t = w/(acc+w)`), so weight 0.3 alone renders at full strength. There is no rest-pose term | `GLTFAnimationRuntime.ts:2014-2036` (`blendBase`), `:2038-2048` |
| E16 | Additive multiplies the absolute sampled value on top, with no reference subtraction | `GLTFAnimationRuntime.ts:1990-2005`; `rg makeClipAdditive` → 0 (per research/09 §3.3) |
| E17 | Masks are substring `includes`, hard 0/1 | `GLTFAnimationRuntime.ts:158-163` |
| E18 | No rest-pose restore. Only sampled targets are written | `applySampledTargets` `GLTFAnimationRuntime.ts:1378-1420` |
| E19 | Joint lookup by node name, first match. New `Float32Array(joints*16)` per skin per frame | `GLTFAnimationRuntime.ts:1270,1275` |
| E20 | Depth/shadow material is `a_position` only. `drawCaster` ignores `skinning`, `morphTargets` and `instanceTransforms` | `packages/rendering/src/DepthPass.ts:15-27` (`DepthMaterial`), `:43` (static `shaderModules` WeakMap, rationale comment `:30-42`), `:59-86` (`drawCaster`); shader `ShaderLibraryCore.ts:784-806` (`registerLeanDepthShader`) |
| E21 | Joint counts above 96 get a new RGBA32F palette `Texture` per draw. The constructor clones the data again. The texture is never disposed, and `WebGL2Device` keeps every `Texture` in a strong `Map` and frees GL handles only for `texture.disposed` textures. Result: one leaked GL texture plus two Float32Arrays per >96-joint draw per frame. The same path also allocates a zero-filled `Float32Array(96*16)` for the still-declared uniform array, plus a new `Sampler`/`TextureBinding`, and scans the whole palette with `isFiniteArrayLike` on every draw | `ForwardPass.ts:1942-2006` (`createSkinningPaletteTexture` `:2014-2036`, called `:1984`; zero array `:1994`; finite scan `:1966`); `SkinningPaletteUploadManager.bind` `:428-452` does not cache it; `WebGL2Device.ts:274` (`Map<Texture, WebGLTexture>`), `:4106-4114` (`releaseDisposedTextureHandles`); `Texture.ts:85` (constructor calls `clonePixelData`, defined `:261`) |
| E22 | 96-joint uniform array = 384 vec4 slots, above the WebGL2 guaranteed minimum of 256 `MAX_VERTEX_UNIFORM_VECTORS` | `ShaderChunks.ts:13, 520-556` |
| E23 | GPU morph capped at 4 targets × 64 vertices. Everything else is CPU morph that creates, uploads and disposes a Geometry per draw | `ForwardPass.ts:119-120, 312-313, 343-349, 1852-1940` |
| E24 | There are **two** forked skinned-lit PBR copies: 4-influence `DEFAULT_SKINNED_LIT_SHADER_NAME` (`:564-1057`) and 8-influence `DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME` (`:1090-1587`). Each carries a procedural `sin(p*230)` wrinkle-noise stand-in, active only when `u_wrinkleStrength > 0` (driven from morph weights via `resolveWrinkleMapStrength`). There are also separate skinned-unlit 4/8 programs (`:536`, `:1058`) and a morph-unlit program (`:1588`) | `packages/rendering/src/ShaderLibrary.ts:564, 1090` (forks), `:782-786` and `:1312-1316` (wrinkle noise); `MorphTargetPlan.ts:69` |
| E25 | Temporal history throws for skinned and morph geometry | `packages/rendering/src/TemporalHistory.ts:73-74` (`TEMPORAL_UNSUPPORTED_GEOMETRY`) |
| E26 | Skinned culling bounds CPU-skin every vertex whenever the palette changes (every animated frame). The cache is keyed by `Geometry`, so two actors sharing one geometry evict each other every frame | `packages/rendering/src/Renderer.ts:2295-2305` |
| E27 | The WebGPU device has no data-texture palette path. It reads only `u_jointMatrices`, capped at `MAX_WEBGPU_SKINNING_JOINTS = 96`, and never references `u_jointPaletteTexture`. For rigs above 96 joints, ForwardPass binds a zero-filled `u_jointMatrices`, so on WebGPU those rigs most likely get an all-zero palette. This was not verified at runtime; T2.7 adds the test. The decision helper also defaults `maxDataTextureJoints` to 96 | `packages/rendering/src/WebGPUSkinningLimits.ts:14, 62-63`; `WebGPUDevice.ts:2249-2251, 2944-2948, 3447`; `ForwardPass.ts:1994, 456-459` |
| E28 | Aura Clash snaps attack, hurt and KO, holds a frozen outgoing pose for blends, and applies non-uniform root squash plus a `sin` idle sway on a realistic rig | `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:3071-3090, 3173-3211` |
| E29 | Spring chain used only as a rigid root lean | `apps/aura-clash-showcase/src/playable/animation/fighterSecondaryMotion.ts` (per research/09 §5: `:7-10,73-83`) |
| E30 | Rooftop skinned athletes are mounted only under `?debug=animation` and are `visible:false` even then | `apps/showcase-rooftop-buckets/src/main.ts:502-536` (research/18 C10) |
| E31 | Skyline hero is a 4-triangle card. Comments say "root runtime does not advance skinned mixers" | `apps/showcase-skyline-runner/src/main.ts:3416-3418, 3464-3466, 3616-3621` (per research/09 §4) |
| E32 | Gallery Shift binds controllers to thief and guard-2 without `applyPose:false` | `apps/showcase-gallery-shift/src/main.ts:1145-1177, 1996-1998` (research/19 C16 skeptic-2). The `sin(frameCount/34)` at `:1371` is a flashlight sweep on both guards, not body sway. It is a gameplay cue and stays |
| E33 | Two-bone IK returns joint **positions**, not rotations, and has no twist. CCD and FABRIK are absent | `packages/animation/src/IK.ts:26-61`; `rg -i 'ccd\|fabrik'` → 0 (per research/09 §5) |
| E34 | Default lip-sync example scales a mouth card | `packages/engine/src/agent-api/VisemeController.ts:121-122` |
| E35 | Skill teaches the freezing pattern | `packages/create-aura3d/skills/aura3d-character-animation/SKILL.md:51-74` |
| E36 | "Certification" is a changed-pixel count. The same doc says no hero rig is certified | `docs/rendering/skinning-and-morphs.md:37, 56-65` |
| E37 | `AuraAnimationSpec` has no crossfade, layer, mask, blendMode, sync or root-motion fields | `index.ts:1288-1304` |
| E38 | Fifth blend stack: `@aura3d/animation`'s own `AnimationController.blendStates` renormalises bone and morph weights by `totalWeight` and returns `emptyPose()` when nothing is weighted | `packages/animation/src/AnimationController.ts:662-700` (1,017 lines; exported from `packages/animation/src/index.ts:45`) |
| E39 | `Texture` cannot be updated in place or be a 2-D array. `dimension` is `"2d" \| "cube"`, `data` is `readonly` and cloned at construction, and there is no update/revision API. A persistent bone texture (R3) and a morph `sampler2DArray` (R5) both need device work first | `packages/rendering/src/Texture.ts:5` (`TextureDimension`), `:85` (clone in constructor), `:261` (`clonePixelData`); no `TEXTURE_2D_ARRAY`/`texImage3D` in `WebGL2Device.ts` |
| E40 | The skin-binding identity is rebuilt every frame: `refreshSkinningPalettes` assigns a new `{ jointCount, matrices }` object to `renderable.skinning`, so nothing downstream can key a cache on it | `GLTFAnimationRuntime.ts:1263-1293` (`:1286-1289`); spread into render items at `TypedGLBActor.ts:302` |
| E41 | The root-motion bridge already exists, but only for controller bindings that carry `animationBinding.rootMotion` | `index.ts:15086-15114` (`playRootMotionClips`) |
| E42 | The existing motion-quality tracker measures motion *existence* (`tracksApplied`, `poseDiversityScore`), not quality. §17.3 metrics must not be built on it | `packages/animation/src/MotionQuality.ts:1-40` |

Benchmark evidence (macos-14 ANGLE Metal, GH run 37289688772; harness verified fair in research/22):

- **08-skinned-character** (CesiumMan bind pose)
  - Aura shadow ROI mean luma is 117.2 against ground 116.6 (no shadow). three's is 96.7 against 118.2 (research/22 §08 skeptic).
  - Vision scores: Aura 3.5, three 5 (research/23).
  - Bind pose does not by itself hide the skinning-shadow bug here. The depth shader draws raw `a_position`, which for a skinned glTF is the unskinned mesh in skin space, not the posed or bound mesh. For CesiumMan the skin hierarchy carries the Z-up→Y-up root rotation, so the raw caster may lie flat or sit off the silhouette. Whether 08's missing shadow comes from that or from the shadow strength (lighting lane, C-11) has not been measured. T0.14 settles it by rendering the light-view depth of 08 with and without the `prd06.deform` depth feature in the lane harness. Research/22 also asks for an animated-pose variant (T0.15, scene `prd06-skinned-character-posed`).
- **15-animation-skinning** (Soldier and Fox Walk at t=1.25 s)
  - Body silhouette IoU 0.994. Skinning in the main pass is equivalent.
  - Shadow pixels: 12.8k in Aura vs 25.4k in three. Ground darkening: Aura about 9%, three about 50% (research/22 §15).
  - Vision scores: Aura 4.5, three 5.5 (research/23).
- **18-game-scene** (Soldier Idle)
  - "The character's shadow is a diffuse smear with no recognisable silhouette" (research/23, Aura 3.5, three 5).

Game frame-time evidence (`evidence/games/report.slim.json`, desktop 1920×1080 rAF fps):

| Game | fps |
|---|---|
| aura-clash | 11.1 |
| gallery-shift | 10.1 |
| rooftop-buckets | 7.6 |
| skyline-runner | 11.4 |
| mech-hangar | 9.3 |
| neon-swarm | 25.8 |

The animation subsystem is not the dominant cost in these numbers. The frame-time gap belongs to the GPU/tiers lane (C-27, C-28). This PRD must not make it worse (§13).

## 3. Root cause

1. **No single animation authority.** The five stacks are:
   - `@aura3d/animation` mixer (`packages/animation/src/AnimationMixer.ts`, 477 lines).
   - `@aura3d/animation` controller pose blender (`packages/animation/src/AnimationController.ts`, 1,017 lines, E38).
   - glTF runtime blend (`packages/assets/src/GLTFAnimationRuntime.ts`, 2,115 lines).
   - Engine controller pose blender (`packages/engine/src/agent-api/AnimationController.ts`, 3,368 lines).
   - Legacy rigid WebGL path (`index.ts:16330-16420`, per research/09).

   Each has its own blend math, time wrap and name resolution. The controller and the renderer communicate through two loosely typed channels (`animationPose` and `node.animation`), and the first one silently wins.
2. **The asset contract lies about animation.** The typed manifest exposes names and channel counts, but no durations or samplers (E8). The controller fabricates `duration: 1` instead of asking the loaded runtime, which knows the real durations.
3. **The shader system has no variant composition for vertex deformation, and the texture API cannot support persistent GPU deformation data.** Skinning is two forked materials (E24), morph-on-GPU exists only in an unlit shader (E23), and the depth pass has one hard-coded program (E20). Every consumer that is not ForwardPass+SkinnedLit (shadow, velocity, culling, WebGPU above 96 joints) silently sees bind pose or a wrong palette. `Texture` has no in-place update and no 2-D array dimension (E39), so the cheap fix (allocate per draw) was the only one available.
4. **Correctness gates measured motion existence, not motion quality.** The gates were changed pixels (E36), evidence fields such as `skinnedClipPlaybackProvenAtRoot: false`, and per-app proof objects. Agents hit the freeze, wrote procedural sway around it, and recorded the workaround as evidence (research/09 §7).
5. **Content was never required to be a real character.** No gate rejected 4-triangle cards or static statues standing in for heroes. The templates ship heroes with one clip (E10) or empty-track clips (E9).

## 4. Affected packages

Ownership per CONTRACTS §4.1 is given in brackets. "Seam" means this lane changes behaviour there only through a registered extension point; "request" means a non-blocking `qr-request` (§12.3).

- `@aura3d/rendering` [06]: `Texture.ts`, `Skinning*.ts` (`SkinningBounds.ts` today; new `SkinningPaletteTextureCache.ts`, `SkinningUniforms.ts`), `WebGPUSkinningLimits.ts`, `MorphTargetPlan.ts`, `resources/MorphTargetTexture.ts` (new), `shaders/deform/` (new), and the PR 0b carve-outs `forward/Deform.ts`, `webgl2/TextureUpload.ts`, `renderer/SkinnedBounds.ts`. Seams into files owned by others: `DepthPass.ts`/`ShadowPass.ts` [02] via C-11; generated programs [01] via C-02; `TemporalHistory.ts` [03] via C-14; `WebGPUDevice.ts`/`RenderDevice.ts` [11] via C-28 and request; frozen legacy `ShaderChunks.ts`/`ShaderLibrary.ts`/`ShaderLibraryCore.ts` [01] are not edited (§3.7); `SkinnedLitMaterial.ts` [04] by request.
- `@aura3d/assets` [06 for `GLTFAnimationRuntime.ts` only]: evaluator, palette, masks, root motion, foot planting.
- `@aura3d/animation` [06, all]: mixer, controller (`AnimationController.ts`, E38), clip and track sampling, blend trees, inertialization, IK, FootIk, SpringBones, HumanoidRetargeting, RootMotion, LocomotionKit, LocomotionController, new `pose/` (subpath `@aura3d/animation/pose`, reserved in PR 0a).
- `@aura3d/physics` [15 default]: `ArcadeCharacterController` (`packages/physics/src/ArcadeCharacterController.ts:36`) and `FightingCharacterController` (`FightingCharacterController.ts:19`) are read-only inputs to `characterAnimation`, with no behaviour change and no edit.
- `@aura3d/engine` [06 for `agent-api/{AnimationController,GameCharacterAnimation,VisemeController,FootPlanting,humanoid-walk-runtime}.ts`, `agent-api/app/actorAnimationHandle.ts`, `agent-api/compiler/animation.ts`, `production-runtime/actor/TypedGLBActorAnimation.ts`]. Seams: `index.ts` types [15] through the C-19 pre-declared fields and CCRs; node handle members through C-37; diagnostics through C-31; app options through C-38; `TypedGLBActor.ts` [04] through `registerTypedGLBActorExtension` (CONTRACTS §3.6); `RuntimeNodeHandle.ts` [15] by CCR; `game` namespace [09] by request.
- `@aura3d/cli` [06 for `animation-asset-validator.ts`, `asset-inspection-types.ts`, `src/commands/prd06/`]: clip-duration inspection and the hero validator. `index.ts`/`asset-manifest.ts` [05] by request (C-17 `animationClips` is pre-declared).
- `create-aura3d` [13]: templates `fighting-game`, `character-controller`, `mini-game`, `animation-studio`, `three-compat-character-viewer`, new `character-hero`; skill `aura3d-character-animation`. This lane delivers C-40 facts, codemod reports and the acceptance bar; PRD 13 writes the files.
- Apps [14]: `aura-clash-showcase`, `showcase-gallery-shift`, `showcase-rooftop-buckets`, `showcase-skyline-runner`, `showcase-neon-swarm`, `showcase-mech-hangar`, `world-war-x-showcase`; demos `animation-walk`, `skinning-blending`, `skinning-additive`, `skinning-ik`, `skinning-morph` [15 default `apps/`]. This lane changes their output only through flag-gated engine behaviour and delivers codemods and per-route specs.
- Tools [06]: `tools/quality-rebuild-capture/steps/burst.mjs` (C-33 plugin), `tools/codemods/animation-3.1.mjs`, `playwright.animation-matrix.config.ts`.

## 5. Affected files and directories

### 5.1 Owned by PRD 06: modify

```
packages/rendering/src/Texture.ts                       (update(data, region?) + revision; dimension "2d-array"; types pre-declared in PR 0a, C-18)
packages/rendering/src/MorphTargetPlan.ts               (texture plan becomes the only GPU plan)
packages/rendering/src/SkinningBounds.ts                (per-joint AABB cache)
packages/rendering/src/WebGPUSkinningLimits.ts          (decideSkinningPalettePath default)
packages/rendering/src/forward/Deform.ts                (PR 0b-2 verbatim carve of ForwardPass.ts:312-314, 343-349, 382-452, 1841-1853, 1855-2036: morph dispatch, CPU morph,
                                                         SkinningPaletteUploadManager, resolveRenderGeometry morph, applyGpuMorphUniforms, applySkinningUniforms, createSkinningPaletteTexture)
packages/rendering/src/webgl2/TextureUpload.ts          (PR 0b-2 carve of WebGL2Device.ts ~3859-3946, ~4106-4114, :274-275, :1390, :3898: texSubImage2D on revision; TEXTURE_2D_ARRAY)
packages/rendering/src/renderer/SkinnedBounds.ts        (PR 0b-2 carve of Renderer.ts:2295-2305 skinnedItemLocalBounds)
packages/assets/src/GLTFAnimationRuntime.ts
packages/animation/src/{AnimationMixer,AnimationController,AnimationTrack,Keyframe,AnimationAction,AnimationLayer,BlendTree,
  Inertialization,IK,FootIk,SpringBones,HumanoidRetargeting,HumanoidBoneInference,RootMotion,LocomotionKit,CrowdAnimation}.ts
packages/engine/src/agent-api/AnimationController.ts
packages/engine/src/agent-api/VisemeController.ts
packages/engine/src/agent-api/app/actorAnimationHandle.ts           (PR 0b-1 carve of index.ts:10970-10984: node.play, setAnimationPose)
packages/engine/src/agent-api/compiler/animation.ts                 (PR 0b-1 carve of index.ts:12552, 15070-15132, 15461-15490: ProductionRuntimeActorEntry
                                                                     animation fields, applyProductionActorAnimation, resolveAnimationSeconds)
packages/engine/src/production-runtime/actor/TypedGLBActorAnimation.ts (PR 0b-3 carve of TypedGLBActor.ts:205-248, 357-390; registers the actor extension)
packages/aura3d-cli/src/{asset-inspection-types,animation-asset-validator}.ts
docs/rendering/skinning-and-morphs.md
```

### 5.2 Owned by PRD 06: add

```
packages/rendering/src/SkinningPaletteTextureCache.ts   (C-18 SkinningPaletteTextureCacheLike real)
packages/rendering/src/SkinningUniforms.ts              (applySkinningUniforms shared by forward and the depth feature)
packages/rendering/src/resources/MorphTargetTexture.ts  (C-18 buildMorphTargetTexture real; R5 moves it to lane 06; file does not exist today)
packages/rendering/src/shaders/deform/{skinning,morph,deform,depthFeature,velocity}.glsl.ts  (+ .wgsl twins; C-02 chunks, C-11 depth feature)
packages/rendering/src/lanes/prd06.ts                   (slot.provide for C-18; registerShaderChunk/Feature, registerDepthVariantFeature, registerSkinnedBoundsProvider)
packages/animation/src/pose/                            (PoseBuffer, SkeletonBinding, CompiledClip, PoseMixer, BoneMask, makeClipAdditive, PoseInertializer,
                                                         TwoBoneIkRotations, LookAtConstraint, CcdIkConstraint, Retarget, retarget.worker, MotionMetrics, index.ts)
packages/animation/src/lanes/prd06.ts
packages/engine/src/agent-api/GameCharacterAnimation.ts (characterAnimation binding; exported from the lane barrel)
packages/engine/src/lanes/prd06.ts                      (registerNodeHandleExtension("animation"), registerDiagnosticsSection("animation"), C-19 provide)
packages/engine/src/agent-api/compiler/diagnosticOnly.prd06.ts
packages/aura3d-cli/src/commands/prd06/{index,inspectAnimationClips,validateHero}.ts  (C-39 registerCliCommand + registerCodemod("animation-3.1"))
tools/codemods/animation-3.1.mjs
tools/quality-rebuild-capture/steps/burst.mjs           (C-33 step plugin)
playwright.animation-matrix.config.ts
.github/workflows/qr-prd06-animation-browser.yml        (macos-14 Chromium/WebKit/Firefox matrix)
benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd06/   (lane scenes, C-30)
tests/qr/prd06/, tests/unit/contracts/impl/prd06-*      (lane tests; other new test files named below are lane-owned by the creator rule)
docs/project/aura3d-quality-rebuild/evidence/prd06/
```

### 5.3 Not edited by PRD 06 (seam or request)

| File (owner) | Earlier draft edit | Now |
|---|---|---|
| `agent-api/index.ts` types `:1288-1304`, `:10497-10520`, `createAuraApp` options (15) | add spec/handle/option fields | C-19/C-38 pre-declared fields (PR 0a); extra fields by CCR-06-1..4 |
| `agent-api/compiler/renderInput.ts` dispatch, ex-`index.ts:13871` (15) | change the pose guard | fixed upstream by rejecting empty poses in `actorAnimationHandle.ts` (T0.2); Q-15-1 routes the dispatch through `dispatchActorAnimation` from `compiler/animation.ts` |
| `agent-api/RuntimeNodeHandle.ts:63-90` (15) | add `clipSamples` | CCR-06-2; meanwhile structural extension type in `AnimationController.ts` |
| `ForwardPass.ts`, `WebGL2Device.ts`, `Renderer.ts` (01) | palette, texture upload, bounds | the 06-owned carve-outs listed in §5.1 |
| `ShaderChunks.ts`, `ShaderLibrary.ts`, `ShaderLibraryCore.ts` (01, frozen) | new skinning chunk, depth family, fork deletion | chunks in `shaders/deform/` via C-02/C-11; fork deletion at flag removal is Q-01-1 |
| `DepthPass.ts`, `ShadowPass.ts` (02) | depth variants | C-11 `registerDepthVariantFeature("prd06.deform")`, `registerSkinnedBoundsProvider` |
| `TemporalHistory.ts` (03) | stop throwing for skinned items | C-14 RenderItem previous-frame fields; Q-03-1 |
| `SkinnedLitMaterial.ts` (04) | alias to PBR | Q-04-1; the generator applies `prd06.deform` to any skinned item regardless of material class |
| `production-runtime/TypedGLBActor.ts` (04) | dispose, constraints, springs, warm-up | `registerTypedGLBActorExtension` from `actor/TypedGLBActorAnimation.ts` |
| `WebGPUDevice.ts`, `RenderDevice.ts`, `webgpu/` (11) | storage-buffer palette, `compileAsync` | WGSL twins in `shaders/deform/`; C-28 `compileAsync`; Q-11-1 |
| `LeanWebGL2Device.ts` (15) | texture revision upload | Q-15-2 |
| `packages/aura3d-cli/src/{index,asset-manifest}.ts` (05) | clip durations in inspection/typegen | `commands/prd06/inspectAnimationClips.ts` pure function; Q-05-1 |
| `packages/create-aura3d/**` (13) | templates, skill | C-40 facts F-06-*; Q-13-1..4 |
| `apps/showcase-*`, `apps/aura-clash-showcase/`, `world-war-x-showcase` (14) | route rewrites | Q-14-1..7; codemod reports |
| `benchmarks/quality-rebuild/shared/{scenes,assets}.ts`, `ci.sh` (12) | scene 08b | lane scenes in `scenes/prd06/` |
| `tools/quality-rebuild-capture/capture-games.mjs` (12), `games.json` (14) | burst step | C-33 `steps/burst.mjs`; Q-14-8 adds burst steps to `games.json` |
| `.github/workflows/browser-matrix.yml` (12), root `package.json` (15) | new job, codemod script | own `qr-prd06-animation-browser.yml`; C-39 codemod; root script via `root-manifest` request Q-15-3 |

Existing tests whose expectations change with §6.4 (`tests/unit/animation/*`, `tests/unit/agent-api/animation-mixer-root-e3.test.ts`, `tests/browser/threejs-parity-skinning-{blending,additive,ik}-parity.spec.ts`, `packages/assets/tests/assets.test.ts` animation cases) follow the CONTRACTS §4.1 creator rule: a test belongs to the owner of the first `packages/**` module it imports. Those whose first import is `@aura3d/animation` or `GLTFAnimationRuntime` are lane 06's. Any other one is changed by request to its owner, and the PRD 06 change ships its new expectation as a lane test in `tests/qr/prd06/` meanwhile. Because every semantic change is behind `A3D_QR_ANIMATION`, flag-off expectations stay valid and no existing test has to change for a PRD 06 merge.

## 6. Architecture proposal

### 6.1 Target data flow (one authority)

```
GLB load ─► SkeletonBinding (bone names, parent indices Int16Array, rest PoseBuffer, inverse binds)
         └► CompiledClip[] (flat Float32Array times/values per track, bone index not name, real duration)

per frame, per actor:
  PoseMixer.update(dt)             actions: time, effective weight, timescale, fade, warp, sync groups
  PoseMixer.evaluate(out)          rest pose ─► base layers (weighted, remaining weight = rest)
                                   ─► additive layers (delta vs reference pose)
                                   ─► per-bone mask weights (Float32Array per layer)
  Inertializer.apply(out, dt)      pose-space offset decay on transition (optional per transition)
  RootMotion.extract(out)          delta of root bone, zeroed in pose, emitted to controller
  Constraints (ordered):           two-bone IK (rotations) ─► foot IK/planting ─► look-at ─► CCD chains
  SpringBones.step(out, dt)        secondary motion writes local rotations
  Skeleton.computePalette(out)     world matrices → Float32Array palette (persistent, in place)
  Upload: one RGBA32F bone texture per skin, texSubImage2D in place; previous palette kept for velocity   (C-18, lane 06)
  Draw: forward  = legacy skinned shader via forward/Deform.ts today; generated program + "prd06.deform" feature when C-02 is real
        depth    = "prd06.deform" depth feature (C-11) once the lighting lane's DepthPass consumes registered features
        velocity = "prd06.deform" in pass "velocity" with the previous palette (C-14) once the post lane's velocity pass exists
```

The `AnimationController` in the engine becomes a **state/intent layer** over `PoseMixer`. It owns states, transitions, events and requested clips, and it never builds poses itself for GLB clips. `GLTFSceneAnimationRuntime` becomes the loader/binder that produces `SkeletonBinding` and `CompiledClip`, and its `applyClips` is re-implemented on `PoseMixer` (§10). `@aura3d/animation`'s `AnimationMixer` becomes a compatibility facade over `PoseMixer`. `@aura3d/animation`'s `AnimationController.blendStates` (E38) delegates to `PoseMixer` when its clips are `CompiledClip`s, and keeps its current blend only for sampler-function clips. All of this is selected by `A3D_QR_ANIMATION_POSE_MIXER` (alias `animation.mixer: "pose"`); with the sub-flag off the legacy blend math runs unchanged.

### 6.2 Controller → renderer contract (fixes E1-E7)

- Replace the dual channel (`animationPose` + `node.animation`) with **one typed message** per node per frame: `AuraActorAnimationFrame` (§7.1). It carries either `clipSamples` (GLB clips evaluated by the actor's PoseMixer) or `pose` (an externally computed pose, e.g. retargeted). It is never an empty pose.
- The dispatch at ex-`index.ts:13871` (now in `compiler/renderInput.ts`, owner 15) keeps its shape: "if `currentState.animationPose` then apply pose, else `applyProductionActorAnimation`". PRD 06 makes it correct without editing that file:
  - `setAnimationPose` (in 06-owned `app/actorAnimationHandle.ts`) never stores a pose with 0 bones and 0 morph targets, so the truthy-pose branch is taken only for real poses (T0.2);
  - `applyProductionActorAnimation` (06-owned `compiler/animation.ts`) handles `clipSamples` and the root `node.animation` path (T0.3, T1.9);
  - request Q-15-1 replaces the inline branch with one call to `dispatchActorAnimation(entry, state, …)` exported by `compiler/animation.ts`, so future dispatch logic lives in the lane's file. Until it lands, the two bullets above are sufficient.
- An empty pose is never stored. In strict mode it throws `ANIMATION_EMPTY_POSE`; otherwise it warns once per actor. Strict is `createAuraApp({ animation: { strict: true } })` (C-19 `AuraCreateAppAnimationOptions`, pre-declared by C-38) or, until CCR-06-1 gives this lane read access to app options, `SceneCompileContext.strict` (C-36, true under `A3D_QR_STRICT`). The engine has no `import.meta.env` convention, so strictness is never inferred from the build. Lane tests set strict explicitly.
- Controller clip durations come from the bound actor. On `bindRuntimeNode`, the controller calls `node.resolveAnimationClips()` (C-19), which returns `{name, duration}[]` from the loaded `CompiledClip`s, and replaces defaulted durations. Until the asset loads, the state is `pending` and nothing is pushed. Typegen durations (E8) are a convenience that arrives when the assets lane emits C-17 `animationClips` objects (Q-05-1); runtime resolution makes the fix independent of it.
- `createIdentityPose` is never used as a fallback for embedded clips (E7). It is used only for explicit `restPose: "identity"` requests.

### 6.3 Root `node.play` semantics (fixes E11-E14, E18)

- Each actor entry keeps a `PoseMixer` with a default base layer.
- `node.play(clip)` crossfades from the current action over `crossFade` seconds (default 0.2 s), honours `speed`, and loops per `loop`.
- An unknown clip name raises `ANIMATION_CLIP_NOT_FOUND`, with the available names listed in the warning. `fallback: "first"` restores the old behaviour explicitly.
- Rest-pose reset is default. The mixer starts each evaluation from `SkeletonBinding.restPose`, so bones that the new clip does not animate return to rest. `restPose` is the glTF **node** local TRS at load. It is not derived from inverse bind matrices. That is what three.js r185 `PropertyBinding` captures as the "original state", and it is what `PropertyMixer.apply` blends toward when the accumulated weight is below 1. three restores it fully when an action's bindings lose their last user (`AnimationMixer._takeBackBinding` → `restoreOriginalState`).

### 6.4 Blend semantics (fixes E15-E17)

- **Base layer.** `out = lerp(rest, Σ wᵢ·clipᵢ / Σwᵢ, min(1, Σwᵢ))`. For three.js parity the weighted average is computed **incrementally in action-activation order**, as three's `PropertyMixer.accumulate` does: `acc = mix(acc, vᵢ, wᵢ / (w₀+…+wᵢ))`, with quaternions through `Quaternion.slerpFlat`. Then rest is mixed in with `1 − Σw` when `Σw < 1`. A different order or nlerp gives a different result for three or more quaternion actions, which would break the 1e-4 parity bar. A single action at weight 0.3 renders 30% from rest. Fade-in from rest works.
- **Layers.** Ordered list: `{ blendMode: "override" | "additive", mask: BoneMask, weight }`.
  - Override: `out[b] = slerp(out[b], layer[b], weight·mask[b])`.
  - Additive rotation: `out[b] = slerp(out[b], out[b] * delta[b], weight·mask[b])`. This equals `out[b] * slerp(identity, delta[b], w)` and is what three's `PropertyMixer._slerpAdditive` does. `delta = reference⁻¹ * sample`, precomputed by `makeClipAdditive`.
  - Additive translation **and scale**: `out[b] += delta[b] * w`, with `delta = sample − reference`. three r185 `AnimationUtils.makeClipAdditive` subtracts scale too, and `_lerpAdditive` adds it, so multiplicative scale would break parity.
- **BoneMask.** One weight per bone in a `Float32Array`. It is built from hierarchy selectors (`{ bone: "Spine", descendants: true }`), humanoid slots via `HumanoidBoneInference` (`upper-body`, `lower-body`, `left-arm` ...), and an optional falloff (`Spine:0.3, Spine1:0.6, Spine2:1.0`). Substring matching stays only as a deprecated selector.
- **Sync groups.** Actions in one group share normalised phase. This is an Aura extension: three r185 has no phase sync, and `AnimationAction.syncWith` only copies `time` and `timeScale`. `crossFadeTo(…, { warp: true })` warps timescale linearly between the two clips' duration ratios, as three.js `crossFadeFrom(…, warp)` does. Together these fix foot fighting in idle/walk/run blends (`apps/skinning-blending/src/blendController.ts:33-39`, which wraps each clip's time independently).
- **Inertialization** (opt-in per transition, `transition: "inertialize"`). On transition, capture `offset = prevPose ⊖ newPose` and its velocity per bone, using the existing `createInertializer` / `inertializedQuat` / `inertializedVec3` math in `packages/animation/src/Inertialization.ts`. Then decay the offset with half-life h. Blending uses the new clip only (cost ≈ 1 clip evaluation).

### 6.5 GPU deformation as a registered feature (fixes E20-E26)

All deformation GLSL lives in lane-owned `packages/rendering/src/shaders/deform/` as C-02 `ShaderChunk`s (`a3d_prd06_skinning_common`, `a3d_prd06_morph_texture`, `a3d_prd06_deform`, the names frozen in C-18) and one C-02 `ShaderFeature` `prd06.deform` at hook `vertex:deform`. Its `select(input)` returns a key such as `skin8|morph16n` from `input.item.skinning`/`morphTargets` and `input.tier`, its `defines()` emit `A3D_SKINNING` (4|8), `A3D_MORPH` (target bucket), `A3D_MORPH_NORMALS`, `A3D_MORPH_TANGENTS`, and its `bindUniforms()` binds the bone texture, previous bone texture, morph array texture and active list. The same feature is registered for `passes: ["depth", "distance", "velocity"]` through C-11 `registerDepthVariantFeature`. Instancing and alpha-test variants in depth are the lighting lane's (C-11 `ShadowCasterVariantKey`); velocity output is the post lane's (C-14). The frozen legacy `ShaderChunks.ts`/`ShaderLibrary*.ts` are not edited (CONTRACTS §3.7).

What becomes visible when:
- **Today's renderer (stubs).** The forward path keeps the legacy skinned shaders. The 06-owned carve `forward/Deform.ts` changes only resource handling (bone-texture cache, morph CPU fallback buffer) behind `A3D_QR_ANIMATION`. No other pass sees the feature yet.
- **C-02 real (`A3D_QR_CORE=v2`).** The generator splices `prd06.deform` into every program whose item is skinned or morphed, whatever its material class. That is the unified skinned PBR (R6): characters use the same generated PBR body as the world. The legacy forks remain the flag-off path until flag removal (Q-01-1).
- **C-11 real.** `DepthPass` composes the registered depth feature, so casters deform (R2).
- **C-14 real.** The velocity pass composes it with `a3dDeformPrevious` (R7).

- **Bone texture.**
  - Prerequisite (E39), in 06-owned files: `Texture` gains `update(data: TexturePixelData, region?: { x, y, width, height, layer? })`, which bumps a `revision` counter without cloning. `webgl2/TextureUpload.ts` (06 carve) re-uploads with `texSubImage2D` (or `texSubImage3D` for arrays) only when `revision` changed since its last upload. Allocation happens once, with `texStorage2D`.
  - One persistent `Texture` per skin instance, RGBA32F, width 4×N rounded, updated in place (`SkinningPaletteTextureCache`, C-18).
  - A second texture holds the previous-frame palette, swapped by reference, not copied.
  - The uniform-array path disappears in generated programs (the `a3d_prd06_skinning_common` chunk has no `u_jointMatrices`). A 96-joint uniform array overflows the guaranteed vertex uniform budget (E22). The legacy shader keeps its uniform array as the flag-off path.
  - On WebGPU the palette is a `storage` buffer sized to the rig. PRD 06 writes the WGSL twin in `shaders/deform/skinning.wgsl.ts`; the binding in `WebGPUDevice.ts` (owner 11) is request Q-11-1. That removes the 96-joint uniform cap (E27).
- **Morph texture.**
  - Built once per geometry at load by `buildMorphTargetTexture` (C-18, `resources/MorphTargetTexture.ts`): a `sampler2DArray` (`Texture` `dimension: "2d-array"`, E39), one layer per target, texel index = vertexIndex × stride + attribute. This is the same layout three r185 uses for `morphTexture` (`DataArrayTexture`, one layer per target, addressed by `gl_VertexID`).
  - Per frame, only the active-target list is uploaded (§8.2 packing; up to 64 entries in uniforms; above that, a 1-D R32F texture). three r185 uploads every influence (`morphTargetInfluences[MORPHTARGETS_COUNT]`). The top-K active list is an Aura cost optimisation and changes output only when more than K targets are non-zero.
  - The CPU geometry rebuild in `resolveRenderGeometry` (in `forward/Deform.ts`) stays as the path for legacy programs and as the fallback when `MAX_TEXTURE_SIZE` or `MAX_ARRAY_TEXTURE_LAYERS` are exceeded. With `A3D_QR_ANIMATION` on it reuses one persistent dynamic buffer instead of allocating.
- **Culling bounds.** At load, compute per-joint local AABBs from the vertices each joint influences with weight above 0.01. Per frame, transform those 8-corner boxes by the palette and union them: O(joints) instead of O(vertices). This replaces `computeSkinnedGeometryBounds` per frame (E26) in the 06 carve `renderer/SkinnedBounds.ts`, and the same provider is registered for shadow-caster culling through C-11 `registerSkinnedBoundsProvider`. Morph bounds use a precomputed union of `base + Σ max(0, w)·targetAABB`.
- **Velocity.** PRD 06 fills the C-14 `RenderItem` fields `previousJointTexture` (C-18 `palette.previous`) and `previousMorphWeights` from `TypedGLBActorAnimation.ts`'s `collectRenderItems` extension, and provides `a3dDeformPrevious`. Accepting skinned items in `TemporalHistory` (E25) is the post lane's (C-14 real; Q-03-1).

### 6.6 Constraints, IK and secondary motion

- They run in pose space after the mixer and before palette build, ordered by the actor's `constraints` list.
- **Two-bone IK v2.**
  - Analytic solve on the actual bone chain. Outputs **local rotations** for root and mid, written into the PoseBuffer.
  - Pole vector: auto from knee/elbow plane, explicit vector, or bone target.
  - Twist distribution to an optional twist bone, soft-limit stretch (no stretch by default), and weight blend in quaternion space.
- **Foot IK.** Existing `FootIk.ts` + `GLTFAnimationRuntime` planting post-pass, moved onto the two-bone v2 rotations. Pelvis offset = min of the per-foot ground deltas, clamped to `maxPelvisDrop`. Foot rotation aligns to the ground normal, limited to 35°.
- **Look-at.** Distributed across spine, neck and head with per-bone weights and yaw/pitch limits. Eyes are optional. Target smoothing is a critically-damped spring (half-life 0.08 s).
- **CCD chain** for tails, tentacles and reach. Iterations ≤ 8, tolerance 1 mm, per-joint cone limits.
- **Spring bones.**
  - Existing `createSpringChain` / `SPRING_BONE_PRESETS` (`SpringBones.ts:77,247`), bound to actual skeleton bones.
  - Particles are initialised from bone world positions. After each step, local rotations are written so that each bone aims at its simulated child.
  - Colliders are capsules and spheres on bones. Fixed substep at 60 Hz with accumulator for determinism.
  - Root-transform squash/sway in games is removed (E28).

### 6.7 Retargeting and clip libraries

- `actor.animation.addClipsFrom(source, { mode: "humanoid" })` maps source to target with `HumanoidRetargeting.ts` once at load, and bakes retargeted tracks onto the target rig as `CompiledClip`s. Runtime cost is zero. A per-frame retarget like `retargetHumanoidPose` is used only for live mocap.
- This enables a shared, licensed locomotion and combat library, so a hero needs only a rig. Licensed library admission is the assets lane's (C-17, Q-05-2); the bake path is proven standalone on in-repo rigs (Soldier, CesiumMan, `auraClashPlayerRig`).
- Bake rules:
  - Hips translation is scaled by leg-length ratio.
  - Non-humanoid bones keep their rest pose.
  - Finger curls are optional.
  - Missing required humanoid bones fail with `RETARGET_MISSING_BONES` (list).

### 6.8 Root motion and character controller binding

- `play(clip, { rootMotion: { bone?: string, axes?: ("x"|"y"|"z"|"yaw")[], mode: "apply" | "extract-only" } })` (C-19 `AuraRootMotionSpec`; `bone` omitted = auto-detect hips/root; the optional `consumer` callback is CCR-06-3).
  - Each frame's root delta (world space, through `transformRootMotionDelta`, `RootMotion.ts:204`) is removed from the pose and emitted to a consumer.
  - The consumer is the character controller's `move()`. It falls back to node transform integration when no consumer exists (`mode: "apply"`); `"extract-only"` reports the delta without moving the node.
  - This generalises the existing `playRootMotionClips` path (ex-`index.ts:15086-15114`, carved into 06-owned `compiler/animation.ts`). Today it is reachable only from the controller binding and the `animation-walk` demo.
- `characterAnimation(controller, node, spec)` (06-owned `agent-api/GameCharacterAnimation.ts`, exported from `@aura3d/engine` through `lanes/prd06.ts`) binds a locomotion controller's speed, grounded, jump/fall/land, turn rate and actions to a 1-D (speed) or 2-D (velocity-local) blend tree in one sync group, with event-driven one-shots and foot IK. Exposing it as `game.characterAnimation` inside the game namespace (owner 09) is request Q-09-1; the lane-barrel export works from day 0.
  - Blend weights reach the mesh (fixes E10).
  - It replaces hand-written per-route state machines (research/16 row 18).
  - Per-actor time is `dt * app.time.scale * handle.timeScale` (C-23), so hit-stop from the camera/feel lane freezes the mixer without any call into this lane.

### 6.9 Character hero acceptance bar (template written by PRD 13)

The `character-hero` template and the upgraded `character-controller` template are PRD 13 files (CONTRACTS R20). PRD 06 owns the acceptance bar and proves it standalone in its own benchmark scene `prd06-character-hero` (`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd06/`), then hands PRD 13 the scene source, the clip map and C-40 facts (Q-13-3).
- One rigged, PBR-textured humanoid hero (≥ 15k triangles, ≥ 50 joints, ≥ 1 face morph set optional) with clips: idle, walk, run, sprint, jump-start, jump-loop, land, turn-L/R 90, interact, hit-react, plus one attack.
- Lighting, shadow, contact shadow and follow camera come from whatever C-10, C-11 and C-22 provide at run time: stubs (today's lights, legacy shadow, scripted camera) in standalone runs, real implementations at checkpoints.
- Foot IK on, look-at to the camera's interest point, spring bones on one accessory chain (hair, scarf or backpack strap).
- Asset. Standalone runs use the best rig already in the repo, read by path and never edited: `apps/aura-clash-showcase/public/aura-assets/auraClashPlayerRig.3318d671.glb` (only in-repo rig with a combat set), with locomotion clips baked onto it by T3.8 from `fixtures/threejs-parity/assets/character/soldier.glb` where it lacks them. Gates that need a clip neither source has are reported as `HERO_MISSING_CLIP` and deferred to integrated acceptance with a C-17-admitted hero from the assets lane (Q-05-2). Asset licensing for public templates is the assets lane's decision; the lane scene is not a public template.

### 6.10 Major recommendations: cost/benefit

"Visible" says when the visual benefit can first be seen: **S** = standalone on today's renderer with only `A3D_QR_ANIMATION`; **I(C-NN)** = only once the named contract is real (integrated checkpoint). Every fallback is also the flag-off path.

| Rec | Visual benefit | Visible | GPU cost | CPU cost | Memory | Bundle (gz) | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 Controller/root dispatch fix + real durations | Characters on the documented path animate at all (gallery-shift thief/guard, every fighting-game scaffold) | S | 0 | −(skips pose blend) | 0 | ≈ −1 KB (dead path removal later) | none | `A3D_QR_ANIMATION` off; `applyPose:true` alias for one release |
| R2 Skinned/morph depth variants | Shadows follow pose: grounding and silhouette in 08/15/18, aura-clash | I(C-11) on screen; S in the lane light-view harness | +1 skinning VS per caster per shadow view (≈ forward VS cost × views); 1 CSM cascade × 2 fighters is negligible | 0 | 0 (bone texture shared with forward) | +1.5 KB shader text | same VS cost; restrict skinned casters to hero on Low | `A3D_QR_ANIMATION_SKINNED_SHADOWS` off (feature not registered); Low tier: hero only skinned caster, others contact/blob shadow from C-11 |
| R3 Persistent bone texture, drop 96-uniform path | Fixes possible mobile link failure (E22) and per-frame alloc/leak (E21) | S (cache, leak); I(C-02) for uniform-array removal | −texture allocation; texelFetch ×4 per influence (+≈2% VS) | −(no allocs) | joints×64 B ×2 per skin (191 joints = 24 KB) | ≈ 0 | removes uniform-limit risk | none needed (RGBA32F + texelFetch is core WebGL2) |
| R4 One mixer with three.js weight semantics, additive, masks, sync, inertialization | No pops, correct fade from rest, layered upper-body over locomotion, no foot fighting | S | 0 | ≈ 0.02 ms per 65-bone actor per active clip with flat arrays + cached cursors (target, §13) | ≈ 40 B/key/channel compiled; 12-clip 65-joint rig ≈ 0.5-1.5 MB | +10 KB new, −15 KB after removing 3 stacks | CPU bound on Low: cap active actions per actor at 3 | `A3D_QR_ANIMATION_POSE_MIXER` off (alias `animation.mixer: "legacy"`) |
| R5 Texture morphs on lit/skinned PBR | Faces/visemes/correctives at any target count on shaded skin | I(C-02); S for GPU = CPU numerics in the lane harness | +1 `texelFetch` per active target per attribute per vertex | −(no per-frame geometry rebuild) | verts×targets×(pos+normal)×8 B (RGBA16F); 20k verts × 52 targets ≈ 16.6 MB | +2 KB | Low: cap active targets at 8 and normals off | `A3D_QR_ANIMATION_GPU_MORPH` off: CPU morph into a persistent dynamic VBO (also used when texture limits are exceeded) |
| R6 Unified skinned PBR | Characters get the same IBL, CSM, specular and tone path as the world; no procedural wrinkle-noise stand-in | I(C-02, plus C-09/C-11 for IBL/CSM) | ≈ 0 (same shader as static PBR + VS skinning) | 0 | −2 forked programs after flag removal (4- and 8-influence, E24) | −12 KB shader text at removal (estimate; measured with `tools/bundle-size`) | fewer programs to compile | `A3D_QR_CORE` off keeps the legacy forks |
| R7 Skinned velocity | TAA/motion blur work on characters instead of throwing | I(C-14) | +1 palette fetch set in velocity pass | +palette swap | +1 palette texture per skin | +1 KB | TAA usually off on Low | skinned items excluded from TAA history (today's behaviour, owned by the post lane) |
| R8 Joint-AABB culling bounds | 0 (correctness kept) | S | 0 | −O(verts) → O(joints) per animated skin (e.g. 35k verts → 65 boxes) | +joints×24 B | +0.5 KB | big CPU win on mobile | conservative bind AABB × 1.5 |
| R9 IK v2 + foot IK + look-at + CCD | Feet plant on slopes and stairs, heads track targets, reach looks intentional | S (ground from the C-26 stub or a test raycaster); I(C-26) on real terrain | 0 | ≈ 0.01 ms per two-bone solve; foot rig 2 raycasts per actor | small | +4 KB | raycasts against heightfield only on Low | weight 0 (pure clip) |
| R10 Spring bones bound to bones | Hair, tails and straps lag and settle; removes rigid look | S | 0 | ≈ 0.005 ms per particle substep | small | +1 KB (existing code) | Low: 1 chain per hero, 30 Hz substep | disabled → rest pose |
| R11 Retarget-bake library | Any humanoid gets a full clip vocabulary, so games stop using cards/statues | S | 0 | load-time bake ≈ 5-30 ms per clip set (worker) | compiled clips per rig | +3 KB | bake in worker; cache in IndexedDB | ship pre-baked clips in the asset (C-17 admission) |
| R12 Character controller binding + hero bar | Locomotion visibly matches speed (walk/run blend), jumps land, feet plant | S (lane scene); templates via PRD 13 | as R2/R5 | ≈ 0.05 ms per hero | asset ≈ 3-8 MB (KTX2 via C-16/C-17) | +2 KB | Low tier hero LOD (C-17 `lods`) | validator fails loudly without required clips |
| R13 Root motion on the root `play` path (§6.8) | Feet stop skating against the ground because travel comes from the clip | S | 0 | ≈ 0.005 ms per actor (one root-track delta) | 0 | +1 KB | none | `rootMotion: false` (in-place clip + controller velocity, today's behaviour) |
| R14 Bone sockets (`node.socket`) | VFX, weapons and props follow hands and feet instead of the root (C-19 consumer: VFX lane) | S | 0 | one mat4 multiply per socket per frame | 64 B per socket | +0.5 KB | none | C-19 stub: root world matrix, `valid: false` |
| R15 WebGPU storage-buffer palette | Rigs above 96 joints deform on WebGPU instead of getting a zero palette (E27) | I(C-29 + Q-11-1) | ≈ 0 (storage read vs uniform read) | −(no 96-cap packing) | joints×64 B | +1 KB WGSL | WebGPU-capable mobile only | WebGL2 backend |

## 7. APIs to add, change and remove (TypeScript)

### 7.1 Engine (`@aura3d/engine`, agent-api)

**Contract alignment.** The public animation surface is C-19, frozen in `packages/engine/src/contracts/animation.ts` (custodian 15) and pre-declared on the existing types in PR 0a. This section uses the C-19 shapes verbatim. The earlier draft's diverging shapes (a string-preset `AuraBoneMaskSpec`, a `translation`/`rotation` root-motion spec, `hasRootMotion`, typed `ik.twoBone()` helpers) are dropped or turned into the additive CCRs listed at the end of this section. Fields marked `// CCR-06-n` compile only after that CCR merges (one working day, CONTRACTS §6.4); until then the lane implements them in its own types and does not expose them.

```ts
// index.ts:1288-1304 (owner 15). These fields are pre-declared optional in PR 0a (C-19); PRD 06 wires them, it does not add them.
export interface AuraAnimationSpec {
  readonly clip?: string;
  readonly loop?: boolean;
  readonly restart?: boolean;
  readonly speed?: number;                       // honoured on skinned playback (time *= speed) when A3D_QR_ANIMATION is on
  readonly startTime?: number;
  readonly duration?: number;
  readonly captureTime?: number;
  /** Crossfade from the current base action. Default 0.2 s under defaults "3.1"; `false` snaps. */
  readonly crossFade?: number | false;
  readonly transition?: "crossfade" | "inertialize";
  readonly warp?: boolean;                       // timescale warp during crossfade (three.js crossFadeTo warp)
  readonly syncGroup?: string;                   // shared normalized phase (locomotion)
  readonly layer?: string;                       // default "base"
  readonly blendMode?: "override" | "additive";
  readonly additiveReference?: { readonly clip?: string; readonly time?: number }; // default: frame 0 of same clip
  readonly mask?: AuraBoneMaskSpec;
  readonly weight?: number;                      // layer weight, 0..1
  readonly rootMotion?: AuraRootMotionSpec | false;
  /** Clip-name miss policy. "error" (default under 3.1): throw in strict, else warn + no-op. "first": old behaviour. */
  readonly fallback?: "error" | "first";
  /** Reset unanimated bones to rest each evaluation. Default true under 3.1. */
  readonly restPoseReset?: boolean;
  // ... existing easing/orbit/joint/chain/rootBob/jointHierarchy fields unchanged (primitive/legacy path only)
}

// C-19 (pre-declared on AuraCreateAppOptions by C-38). Read by this lane through CCR-06-1; until then strict comes from
// SceneCompileContext.strict and the tier from C-27 SceneCompileContext.quality.tier.
export interface AuraCreateAppAnimationOptions {
  readonly strict?: boolean;                    // throw on empty poses, unknown clips, missing samplers
  readonly defaults?: "3.0" | "3.1";            // "3.0" = pre-rebuild root semantics; default "3.1" when A3D_QR_ANIMATION is on, "3.0" when off
  readonly mixer?: "pose" | "legacy";           // alias of A3D_QR_ANIMATION_POSE_MIXER
  readonly tier?: AuraQualityTier;              // override; default is the C-27 resolved tier
}
// AuraCreateAppRendererOptions (pre-declared by C-38): skinnedShadows?: boolean (alias A3D_QR_ANIMATION_SKINNED_SHADOWS),
//   morph?: "gpu" | "cpu" (alias A3D_QR_ANIMATION_GPU_MORPH), skinnedPbr?: "unified" | "fork" (unified needs A3D_QR_CORE=v2)

// C-19 verbatim
export interface AuraBoneMaskSpec { readonly include?: readonly string[]; readonly exclude?: readonly string[];
  readonly humanoid?: "upper-body" | "lower-body" | "head" | "arms";
  readonly descendants?: boolean;                       // CCR-06-2: include/exclude names select whole subtrees (default false)
  readonly weights?: Readonly<Record<string, number>>;  // CCR-06-2: per-bone falloff, e.g. { Spine: 0.3, Spine1: 0.6, Spine2: 1 }
}
export interface AuraRootMotionSpec { readonly bone?: string; readonly axes?: readonly ("x" | "y" | "z" | "yaw")[]; readonly mode: "apply" | "extract-only";
  readonly consumer?: (delta: { readonly translation: AuraVec3; readonly yaw: number }) => AuraVec3 | void;   // CCR-06-3
}
export interface AuraResolvedClipInfo { readonly name: string; readonly duration: number; readonly channelCount: number;
  readonly hasRootMotionCandidate: boolean;
  readonly loopClosureError?: number; }                 // CCR-06-3

// C-19 AuraActorAnimationApi, attached to model-node handles by registerNodeHandleExtension({ member: "animation", owner: "prd06",
// flag: "A3D_QR_ANIMATION" }) and flattened onto the handle (crossFadeTo, playLayer, ...). Implementation: app/actorAnimationHandle.ts.
export interface AuraActorAnimationApi {
  crossFadeTo(clip: string, seconds: number, options?: { transition?: "crossfade" | "inertialize"; warp?: boolean }): this;
  playLayer(layer: string, clip: string, options?: { weight?: number; fadeIn?: number; mask?: AuraBoneMaskSpec; blendMode?: "override" | "additive" }): this;
  stopLayer(layer: string, fadeOut?: number): this;
  resolveAnimationClips(): Promise<readonly AuraResolvedClipInfo[]>;               // real names + durations after load; [] for non-model nodes
  animationState(): AuraActorAnimationStateSnapshot | undefined;                    // C-19 snapshot; `bones?` sampling is CCR-06-4
  socket(bone: string): AuraBoneSocket;                                             // live bone world matrix, valid: true when real
  readonly ik: { add(spec: AuraConstraintSpec): () => void; clear(): void };          // spec: unknown in C-19 -> AuraConstraintSpec by CCR-06-4
  readonly springBones: { add(spec: SpringBoneChainSpec): () => void; clear(): void };
}
// Existing handle members keep their signatures: play(clip, options) (semantics per §6.3 under 3.1), setAnimationPose (rejects empty poses).
export type AuraConstraintSpec =                                                    // CCR-06-4 (concrete type replacing `unknown`)
  | ({ readonly kind: "two-bone" } & TwoBoneIkConstraintSpec & { readonly target: AuraVec3 | string /* node id */ | { readonly socket: string } })
  | ({ readonly kind: "foot-ik" } & FootIkConstraintSpec)
  | ({ readonly kind: "look-at" } & LookAtConstraintSpec & { readonly target: AuraVec3 | string | { readonly socket: string } })
  | ({ readonly kind: "ccd" } & CcdIkConstraintSpec & { readonly target: AuraVec3 | string | { readonly socket: string } });
// Weight and target changes: remove and re-add (constant time); a weight-fade helper is out of the contract and lives on the
// lane-exported characterAnimation binding.

/** Single controller → renderer message (replaces animationPose + node.animation dual channel). Lane-internal type in
 *  agent-api/AnimationController.ts and compiler/animation.ts; carried on the binding metadata (CCR-06-5 adds
 *  `clipSamples?` to AuraRuntimeNodeAnimationBindingMetadata in RuntimeNodeHandle.ts:63; until then an intersection type). */
export interface AuraActorAnimationFrame {
  readonly kind: "aura-actor-animation-frame";
  readonly controllerId?: string;
  readonly clipSamples?: readonly AuraActorClipSample[];   // evaluated by the actor PoseMixer
  readonly pose?: GLTFScenePose;                           // must contain >= 1 bone, else rejected
  readonly morphWeights?: Readonly<Record<string, number>>;
  readonly rootMotion?: AuraRootMotionSpec;
}
export interface AuraActorClipSample { readonly clipName: string; readonly time: number; readonly weight: number;
  readonly layer?: string; readonly blendMode?: "override" | "additive"; readonly mask?: AuraBoneMaskSpec;
  readonly syncGroup?: string; }

// AnimationController.ts (06)
export interface AuraAnimationRuntimeNodeBindingOptions<TClipId extends string> {
  // existing fields ...
  /** Default "clips" when A3D_QR_ANIMATION is on: controller sends clipSamples; renderer evaluates GLB clips. "pose" requires a sampler. */
  readonly drive?: "clips" | "pose";
  /** @deprecated replaced by drive; true == "pose" */
  readonly applyPose?: boolean;
}

// agent-api/GameCharacterAnimation.ts (06), exported from packages/engine/src/lanes/prd06.ts; game.characterAnimation alias is Q-09-1
export function characterAnimation(
  controller: ArcadeCharacterController | LocomotionController | FightingCharacterController,
  node: AuraRuntimeNodeHandle,
  spec: AuraCharacterAnimationSpec
): AuraCharacterAnimationBinding;
export interface AuraCharacterAnimationSpec {
  readonly locomotion: { readonly param: "speed" | "velocity2d"; readonly clips: readonly { readonly clip: string; readonly at: number | readonly [number, number] }[];
    readonly syncGroup?: string; readonly smoothing?: number };
  readonly airborne?: { readonly jumpStart?: string; readonly fall?: string; readonly land?: string; readonly landBlend?: number };
  readonly turnInPlace?: { readonly left?: string; readonly right?: string; readonly thresholdDeg?: number };
  readonly actions?: Readonly<Record<string, { readonly clip: string; readonly layer?: string; readonly mask?: AuraBoneMaskSpec;
    readonly transition?: "crossfade" | "inertialize"; readonly blendIn?: number; readonly blendOut?: number }>>;
  readonly footIk?: boolean | FootIkConstraintSpec;
  readonly lookAt?: false | LookAtConstraintSpec;
  readonly rootMotion?: false | AuraRootMotionSpec;
}
export interface AuraCharacterAnimationBinding { trigger(action: string): void; snapshot(): AuraCharacterAnimationSnapshot; dispose(): void; }
// diagnostics: registerDiagnosticsSection({ key: "animation", owner: "prd06", collect }) returns C-19 AuraAnimationDiagnostics (C-31)
```

CCRs filed by this lane on day 0 (CONTRACTS §6.4; all additive, approval by PRD 15 + one consumer; the lane never waits on them, it keeps the field internal until merge):

| CCR | Contract file | Change | Consumer co-signer |
|---|---|---|---|
| CCR-06-1 | `engine/contracts/app.ts` (C-38) | add `animation: AuraAppAnimationSurface` member (`{ readonly options: AuraCreateAppAnimationOptions; diagnostics(): AuraAnimationDiagnostics }`) so lane code reads `createAuraApp({ animation })` | 13 |
| CCR-06-2 | `engine/contracts/animation.ts` (C-19) | `AuraBoneMaskSpec.descendants?`, `.weights?`; humanoid union adds `"left-arm" \| "right-arm" \| "full-body"` | 09 |
| CCR-06-3 | same | `AuraRootMotionSpec.consumer?`; `AuraResolvedClipInfo.loopClosureError?` | 09 |
| CCR-06-4 | same | `ik.add(spec: unknown)` → `AuraConstraintSpec`; `AuraActorAnimationStateSnapshot.bones?: Readonly<Record<string, { rotation: readonly number[]; position: readonly number[] }>>` | 07 |
| CCR-06-5 | `engine/agent-api/RuntimeNodeHandle.ts` (15; pre-declared-field style) | `AuraRuntimeNodeAnimationBindingMetadata.clipSamples?: readonly AuraActorClipSample[]` | 15 |
| CCR-06-6 | `CONTRACTS.md` C-18 text | seam names `forward/Skinning.ts`/`forward/Morph.ts` → `forward/Deform.ts`, matching §3.3 and §4.1 | 01 |

### 7.2 Animation core (`@aura3d/animation`, new `src/pose/`)

```ts
export interface PoseBuffer {
  readonly boneCount: number;
  readonly translations: Float32Array; // 3 * boneCount
  readonly rotations: Float32Array;    // 4 * boneCount (xyzw)
  readonly scales: Float32Array;       // 3 * boneCount
  readonly morphWeights: Float32Array; // per morph target of the bound mesh set
}
export function createPoseBuffer(boneCount: number, morphCount?: number): PoseBuffer;
export function copyPose(src: PoseBuffer, dst: PoseBuffer): void;

export interface SkeletonBinding {
  readonly boneNames: readonly string[];
  readonly parentIndices: Int16Array;   // -1 for roots, topologically sorted
  readonly restPose: PoseBuffer;
  readonly inverseBindMatrices: Float32Array;
  readonly humanoid?: Readonly<Partial<Record<HumanoidBoneName, number>>>;
}
export function bindSkeleton(source: GLTFSkinSource): SkeletonBinding; // resolves joints by node index, not name

export interface CompiledTrack { readonly bone: number; readonly path: "t" | "r" | "s" | "w";
  readonly interpolation: "LINEAR" | "STEP" | "CUBICSPLINE"; readonly times: Float32Array; readonly values: Float32Array; }
export interface CompiledClip { readonly name: string; readonly duration: number; readonly tracks: readonly CompiledTrack[];
  readonly blendMode: "override" | "additive"; }
export function compileClip(clip: AnimationClip, skeleton: SkeletonBinding): CompiledClip;
export function makeClipAdditive(clip: CompiledClip, skeleton: SkeletonBinding,
  reference?: { readonly clip?: CompiledClip; readonly time?: number }): CompiledClip; // r: ref⁻¹·q; t and s: v − ref (three r185 parity)

export interface BoneMask { readonly weights: Float32Array; }
export function createBoneMask(skeleton: SkeletonBinding, spec: BoneMaskSpec): BoneMask;

export interface PoseMixerAction {
  play(): this; stop(): this; reset(): this;
  fadeIn(seconds: number): this; fadeOut(seconds: number): this;
  crossFadeTo(next: PoseMixerAction, seconds: number, options?: { readonly warp?: boolean; readonly inertialize?: boolean }): this;
  syncWith(other: PoseMixerAction): this;
  setEffectiveWeight(weight: number): this; getEffectiveWeight(): number;
  setEffectiveTimeScale(scale: number): this;
  time: number; loop: "repeat" | "once" | "pingpong"; clampWhenFinished: boolean;
  readonly clip: CompiledClip; readonly layer: string;
}
export interface PoseMixerLayerSpec { readonly name: string; readonly blendMode: "override" | "additive";
  readonly mask?: BoneMask; readonly weight?: number; }
export class PoseMixer {
  constructor(skeleton: SkeletonBinding, options?: { readonly layers?: readonly PoseMixerLayerSpec[]; readonly restPoseReset?: boolean });
  clipAction(clip: CompiledClip, layer?: string): PoseMixerAction;
  setLayerWeight(layer: string, weight: number, fadeSeconds?: number): void;
  update(dt: number): void;
  evaluate(out: PoseBuffer): PoseMixerEvaluation; // { activeActions, tracksApplied }
  readonly events: AnimationClipEventBus;          // reuses AnimationClipEvents.ts
}
export interface PoseInertializer { transition(current: PoseBuffer, currentVelocity?: PoseBuffer): void;
  apply(target: PoseBuffer, dt: number): void; readonly active: boolean; }
export function createPoseInertializer(skeleton: SkeletonBinding, halfLife?: number /* default 0.12 = DEFAULT_INERTIALIZATION_HALF_LIFE */): PoseInertializer;

export function createBlendTree1D(mixer: PoseMixer, entries: readonly { clip: CompiledClip; at: number }[], options?: { syncGroup?: string }): { setParameter(v: number): void };
export function createBlendTree2D(mixer: PoseMixer, entries: readonly { clip: CompiledClip; at: readonly [number, number] }[],
  options?: { mode: "freeform-directional" | "cartesian"; syncGroup?: string }): { setParameter(x: number, y: number): void };

// constraints (pose space; world transforms via SkeletonBinding + model matrix)
export interface TwoBoneIkConstraintSpec { readonly root: string; readonly mid: string; readonly tip: string;
  readonly pole?: "auto" | readonly [number, number, number] | { readonly bone: string };
  readonly twistBone?: string; readonly twistWeight?: number; readonly weight?: number; readonly allowStretch?: number; }
export interface FootIkConstraintSpec { readonly legs: readonly TwoBoneIkConstraintSpec[]; readonly ground: GroundRaycaster;
  readonly pelvis?: string; readonly maxPelvisDrop?: number; readonly maxFootTiltDeg?: number; readonly lockOnContact?: boolean; }
export interface LookAtConstraintSpec { readonly bones: readonly { readonly bone: string; readonly weight: number }[];
  readonly forwardAxis?: "+z" | "-z" | "+y"; readonly yawLimitDeg?: number; readonly pitchLimitDeg?: number;
  readonly eyes?: readonly string[]; readonly halfLife?: number; }
export interface CcdIkConstraintSpec { readonly chain: readonly string[]; readonly iterations?: number; readonly tolerance?: number;
  readonly coneLimitDeg?: Readonly<Record<string, number>>; }
export interface SpringBoneChainSpec { readonly bones: readonly string[]; readonly preset?: keyof typeof SPRING_BONE_PRESETS;
  readonly stiffness?: number; readonly damping?: number; readonly gravity?: number; readonly drag?: number;
  readonly radius?: number; readonly colliders?: readonly { readonly bone: string; readonly radius: number; readonly offset?: readonly [number, number, number]; readonly tail?: readonly [number, number, number] }[];
  readonly substepHz?: number; }
export function solveTwoBoneIkRotations(pose: PoseBuffer, skeleton: SkeletonBinding, modelMatrix: Float32Array,
  spec: TwoBoneIkConstraintSpec, target: readonly [number, number, number]): void; // writes local rotations

export function bakeRetargetedClips(source: { skeleton: SkeletonBinding; clips: readonly CompiledClip[] },
  target: SkeletonBinding, options?: { readonly map?: AuraHumanoidBoneMap; readonly hipsScale?: "leg-length" | number;
  readonly fingers?: boolean }): readonly CompiledClip[];
```

### 7.3 Assets / rendering

```ts
// GLTFAnimationRuntime.ts
export interface GLTFSceneAnimationClipBoneMask { /** @deprecated substring match; use BoneMaskSpec */ include?; exclude? }
export interface GLTFSceneAnimationRuntime {
  readonly skeletons: readonly SkeletonBinding[];
  readonly compiledClips: ReadonlyMap<string, CompiledClip>;
  readonly mixer: PoseMixer;                         // per runtime (actor)
  clipInfo(): readonly AuraResolvedClipInfo[];
  applyClips(samples: readonly GLTFSceneAnimationClipSample[]): GLTFSceneAnimationApplyResult; // re-implemented on PoseMixer
}
// resolveGLTFClipName(name, available, { fallback?: "error" | "first" }) — default "error" returns undefined

// rendering: C-18 (packages/rendering/src/contracts/deform.ts, frozen). PRD 06 implements these; signatures are the contract's.
export interface SkinningPaletteBinding {
  readonly jointCount: number;
  readonly matrices: Float32Array;
  readonly previousMatrices?: Float32Array;          // for the velocity pass (C-14)
  readonly paletteKey: object;                       // identity of the skin instance → persistent texture. Set to the
                                                     // GLTFAnimationRuntime skinning binding object (stable), never the per-frame skinning object (E40)
  readonly extraInfluences?: boolean;
}
export class SkinningPaletteTextureCache implements SkinningPaletteTextureCacheLike {   // replaces createSkinningPaletteTexture per draw
  acquire(device: RenderDevice, key: object, jointCount: number): { readonly current: Texture; readonly previous: Texture };
  upload(key: object, matrices: Float32Array): void;  // texture.update() in place; at most once per key per frame
  swap(key: object): void; release(key: object): void; diagnostics(): { readonly textures: number; readonly bytes: number; readonly createdThisFrame: number };
}
// C-18 result type; lane-internal detail type MorphTargetTextureLayout { stride: 1 | 2 | 3; width: number; attributes } is not part of the contract
export function buildMorphTargetTexture(geometry: Geometry, targets: readonly MorphTargetDelta[],
  limits: { readonly maxTextureSize: number; readonly maxArrayLayers: number }, format?: "rgba16f" | "rgba32f"): MorphTargetTextureResult;
// shaders/deform/depthFeature.ts — registered from packages/rendering/src/lanes/prd06.ts under A3D_QR_ANIMATION_SKINNED_SHADOWS
export const prd06DeformDepthFeature: DepthVariantFeature;   // C-11; id "prd06.deform", passes ["depth", "distance", "velocity"], hook "vertex:deform"
export const prd06DeformFeature: ShaderFeature;              // C-02; same id for pass "forward"
export const prd06SkinnedBounds: SkinnedBoundsProvider;      // C-11 registerSkinnedBoundsProvider; joint-AABB world bounds

// Texture.ts (06; types pre-declared in PR 0a by C-18, E39)
export type TextureDimension = "2d" | "cube" | "2d-array";
export interface TextureDescriptor { /* existing */ readonly layers?: number; /* required for "2d-array" */ }
export class Texture {
  readonly revision: number;                                   // bumped by update(); devices re-upload when it changes
  update(data: TexturePixelData, region?: { readonly x: number; readonly y: number; readonly width: number;
    readonly height: number; readonly layer?: number }): void; // no clone; caller keeps ownership of `data`
}
```

### 7.4 Remove or deprecate

Removals of code in other lanes' files happen only at `A3D_QR_ANIMATION` flag removal (CONTRACTS §5.4) and by request; until then the old code is the flag-off path.

| Item | Action | Release | Who |
|---|---|---|---|
| `emptyPose` as a sampler fallback for embedded clips (`AnimationController.ts:1793`) | not used when the flag is on; state is `pending` until clips resolve | P0 | 06 |
| `createIdentityPose` as implicit fallback (`:3019-3036`) | not used implicitly when the flag is on | P0 | 06 |
| `poseBakedFallback: true` with `tracks: []` in `fighting-game` | delete clips; bind real GLB clips | after Q-13-1 | 13 |
| `resolveGLTFClipName` → `available[0]` default | default to `undefined` + warning under 3.1; `fallback:"first"` opt-in | P1 | 06 |
| `MAX_UNIFORM_SKINNING_JOINTS` uniform path | absent from generated programs; legacy keeps it until flag removal | P1 / removal | 06 / 01 |
| `createSkinningPaletteTexture` per draw (`forward/Deform.ts`) | replaced by `SkinningPaletteTextureCache` | P0 | 06 |
| `MAX_GPU_MORPH_TARGETS/VERTICES` (`ForwardPass.ts:119-120`) uniform morph + `aura3d/morph-unlit` limits | not consulted by `prd06.deform`; constants kept as deprecated exports | P2 / removal | 06 / 01 |
| `DEFAULT_SKINNED_LIT_SHADER` and `DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER` forks, with their procedural wrinkle `sin(p*230)` | delete at removal of `A3D_QR_CORE` + `A3D_QR_ANIMATION` (Q-01-1) | removal | 01 |
| `SkinnedLitMaterial` class | thin PBR-backed subclass with uniform aliases (Q-04-1) | after Q-04-1 | 04 |
| `DEFAULT_SKINNED_UNLIT(_EIGHT_INFLUENCE)` and `aura3d/morph-unlit` programs | replaced by unlit generated programs + `prd06.deform`; deleted at removal (Q-01-1) | removal | 01 |
| `@aura3d/animation` `AnimationController.blendStates` renormalisation (`AnimationController.ts:662-700`) | delegate to `PoseMixer` for compiled clips | P1 | 06 |
| WebGPU 96-joint `u_jointMatrices` packing (`WebGPUDevice.ts:2249-2251`) | storage-buffer palette (Q-11-1) | after Q-11-1 | 11 |
| `AnimationMixer` blend math in `@aura3d/animation` (`AnimationMixer.ts:364-425`) | facade over `PoseMixer` | P1 | 06 |
| engine `AnimationController` internal pose blender for GLB clips | delegate to actor `PoseMixer` | P1 | 06 |
| substring bone masks | deprecated selector | P1 | 06 |
| `CrowdAnimation.ts` (25-line stub) | delete or mark experimental (no consumers) | P1 | 06 |
| `primitiveMouthVisemeExample` as the default lip-sync example | default becomes morph visemes; primitive kept as `fallback` | P4 | 06 |
| Aura Clash `fighterInertializedWeights` frozen-pose crossfade, root squash, `sin` idle sway | mixer inertialization and additive breathing clip (Q-14-1) | P5 | 14 |

## 8. Shader changes (GLSL ES 3.00; WGSL equivalents noted)

Every chunk below is a C-02 `ShaderChunk` (owner `prd06`) in `packages/rendering/src/shaders/deform/*.glsl.ts`, registered from `packages/rendering/src/lanes/prd06.ts`. The frozen legacy `ShaderChunks.ts` (`skinning_common` at `:516-573`), `ShaderLibrary.ts` and `ShaderLibraryCore.ts` are not edited (CONTRACTS §3.7). Standalone validation is ChunkHarness compilation on macos-14 plus the lane deform harness (§16); pixels on the production path appear when C-02 (generator), C-11 (depth) and C-14 (velocity) are real.

### 8.1 Skinning chunk (`a3d_prd06_skinning_common`, `shaders/deform/skinning.glsl.ts`)

It replaces the legacy uniform-array/data-texture dual mode with the bone texture only. The legacy `skinning_common` stays untouched as the flag-off path.

```glsl
#ifdef A3D_SKINNING
uniform highp sampler2D u_boneTexture;        // RGBA32F, 4 texels per mat4, persistent per skin
uniform int u_boneTextureWidth;               // multiple of 4
#ifdef A3D_VELOCITY
uniform highp sampler2D u_prevBoneTexture;
#endif
// Existing attribute names/locations kept (ShaderLibrary.ts:544-545, 8-influence fork :1102-1105).
layout(location = 5) in vec4 a_joints;        // float today; uvec4 once WebGL2Device supports vertexAttribIPointer
layout(location = 6) in vec4 a_weights;
#if A3D_SKINNING == 8
layout(location = 8) in vec4 a_joints1;       // existing JOINTS_1 location
layout(location = 9) in vec4 a_weights1;      // existing WEIGHTS_1 location
#endif
mat4 a3dBone(highp sampler2D tex, float jf) {
  int i = int(jf + 0.5) * 4; int y = i / u_boneTextureWidth; int x = i - y * u_boneTextureWidth;
  return mat4(texelFetch(tex, ivec2(x, y), 0), texelFetch(tex, ivec2(x + 1, y), 0),
              texelFetch(tex, ivec2(x + 2, y), 0), texelFetch(tex, ivec2(x + 3, y), 0));
}
mat4 a3dSkin(highp sampler2D tex) {
  mat4 m = a3dBone(tex, a_joints.x) * a_weights.x + a3dBone(tex, a_joints.y) * a_weights.y
         + a3dBone(tex, a_joints.z) * a_weights.z + a3dBone(tex, a_joints.w) * a_weights.w;
#if A3D_SKINNING == 8
  m += a3dBone(tex, a_joints1.x) * a_weights1.x + a3dBone(tex, a_joints1.y) * a_weights1.y
     + a3dBone(tex, a_joints1.z) * a_weights1.z + a3dBone(tex, a_joints1.w) * a_weights1.w;
#endif
  return m;
}
#endif
```

- Keep the existing zero-weight guard (`ShaderLibrary.ts:549-550`, in the skinned-unlit program: unskinned position when Σw ≤ 1e-4) inside `a3dDeform`, so unweighted vertices on skinned meshes do not collapse to the origin.
- `u_jointPaletteMode`, `u_jointMatrices[96]` and the float-index clamping (`a3dJointMatrix(float)`) are removed.
- Weights are renormalised at import when Σw is not 1 ± 1e-3 (glTF requires it, but exporters violate it). This is not done in the shader.
- Joint indices stay float attributes, because `rg vertexAttribIPointer packages/rendering/src` returns nothing today. `int(j + 0.5)` is exact for indices below 2^24. Integer attributes are an optional later cleanup and are not required.
- The bone-index bound check moves to import validation: indices must be below `jointCount`, else `SKINNING_JOINT_INDEX_OUT_OF_RANGE`. `texelFetch` out of range returns undefined values, so the shader must not rely on a clamp. Run the check once per geometry, cached the way `SkinningPaletteUploadManager.validatedGeometryJointCounts` (`ForwardPass.ts:444-449`) already caches its check.

### 8.2 Morph chunk (`a3d_prd06_morph_texture`, `shaders/deform/morph.glsl.ts`; layout from `MorphTargetPlan.ts` texture mode)

```glsl
#ifdef A3D_MORPH
uniform highp sampler2DArray u_morphTexture;   // layer = target, texel = vertexId * stride + attr
uniform int   u_morphStride;                   // 1 (pos) | 2 (pos,normal) | 3 (pos,normal,tangent)
uniform int   u_morphTexWidth;
uniform int   u_morphActiveCount;              // <= A3D_MORPH_MAX_ACTIVE (8 Low, 16 Med, 32 High, 64 Ultra); multiple of 4
// Packed 4 per vec4: a scalar uniform array costs one vec4 slot PER ELEMENT under GLSL ES 3.00 packing,
// so three 64-element scalar arrays would cost 192 of the 256 guaranteed vertex vectors. Packed: 48 at Ultra.
uniform ivec4 u_morphActiveIndex4[A3D_MORPH_MAX_ACTIVE / 4];
uniform vec4  u_morphActiveWeight4[A3D_MORPH_MAX_ACTIVE / 4];
#ifdef A3D_VELOCITY
uniform vec4  u_morphPrevWeight4[A3D_MORPH_MAX_ACTIVE / 4]; // same index list, previous-frame weights (0 if newly active)
#endif
vec4 a3dMorphFetch(int target, int attr) {
  int t = gl_VertexID * u_morphStride + attr; int y = t / u_morphTexWidth;
  return texelFetch(u_morphTexture, ivec3(t - y * u_morphTexWidth, y, target), 0);
}
void a3dApplyMorph(inout vec3 p, inout vec3 n, inout vec4 tg) {
  for (int k = 0; k < A3D_MORPH_MAX_ACTIVE; ++k) {
    if (k >= u_morphActiveCount) break;
    int tgt = u_morphActiveIndex4[k >> 2][k & 3]; float w = u_morphActiveWeight4[k >> 2][k & 3];
    p += a3dMorphFetch(tgt, 0).xyz * w;
    if (u_morphStride > 1) n += a3dMorphFetch(tgt, 1).xyz * w;
    if (u_morphStride > 2) tg.xyz += a3dMorphFetch(tgt, 2).xyz * w;
  }
}
#endif
```

- **Ordering in every vertex shader:** morph → skin → model, which matches glTF and three.js (`morphtarget_vertex` before `skinning_vertex`).
- **Active list.** On the CPU, select the top-K targets by |w| > 1e-4 and pad the list with weight-0 entries to a multiple of 4. If more than K are non-zero, the excess is dropped and counted in `morph.droppedTargets` diagnostics.
- **Vertex index.** `gl_VertexID` is the index value for indexed draws, and `first + i` for `drawArrays(first, …)`. Both equal the vertex's position in the bound vertex buffer, so no base-vertex uniform is needed. ForwardPass draws sub-ranges with `firstVertex`/`firstIndex` (`ForwardPass.ts:330-342`), not offset attribute pointers. If a later change offsets attribute pointers for sub-ranges, it must add `u_morphBaseVertex`.

### 8.3 Common deformation entry (`a3d_prd06_deform`, hook `vertex:deform`; used by forward, depth and velocity)

```glsl
void a3dDeform(out vec4 localPos, out vec3 localNormal, out vec4 localTangent) {
  vec3 p = a_position; vec3 n = a_normal; vec4 tg = a_tangent;
#ifdef A3D_MORPH
  a3dApplyMorph(p, n, tg);
#endif
#ifdef A3D_SKINNING
  mat4 s = a3dSkin(u_boneTexture);
  localPos = s * vec4(p, 1.0); localNormal = mat3(s) * n; localTangent = vec4(mat3(s) * tg.xyz, tg.w);
#else
  localPos = vec4(p, 1.0); localNormal = n; localTangent = tg;
#endif
}
```

The palette convention stays `inverse(meshWorld) * jointWorld * inverseBind` (`GLTFAnimationRuntime.ts:1263-1293`), so the deformed position is in mesh-local space and `u_modelMatrix` still applies. Normal transform keeps `u_normalMatrix` for non-uniform node scale. `a_normal`/`a_tangent` reads are wrapped in `#ifndef A3D_DEPTH_ONLY`, and the tangent read also in `#ifdef A3D_HAS_TANGENT`, so geometry without tangents and the depth variants compile without those attributes.

### 8.4 Depth feature (`prd06.deform` registered through C-11 `registerDepthVariantFeature`)

The depth program itself (`DepthPass.ts`, the C-11 variant composition, instancing and alpha-test bits) is the lighting lane's. PRD 06 contributes only the `vertex:deform` splice and its uniform binding. The program the lighting lane composes looks like:

```glsl
// vertex (composed by the C-11 DepthPass from registered features; shown for reference)
uniform mat4 u_lightViewProjection; uniform mat4 u_modelMatrix;
void main() { vec4 p; vec3 n; vec4 t; a3dDeform(p, n, t);       // hook "vertex:deform" -> a3d_prd06_deform
  /* "vertex:world" hooks of other lanes, e.g. instancing (C-11 key bit `instanced`) */
  gl_Position = u_lightViewProjection * (u_modelMatrix * p); }
```

- `A3D_DEPTH_ONLY` (set by the feature for passes `depth`/`distance`) makes `a3dDeform` skip normal and tangent work, so shadow VS cost is position + morph position + palette fetches only.
- `bindUniforms(value, item, set)` binds `u_boneTexture` from `SkinningPaletteTextureCache.acquire(…, item.skinning.paletteKey, …).current` (the same texture the forward pass used this frame, no second upload) and the morph array texture + active list.
- The feature's `select()` result feeds `ShadowCasterVariantKey.features["prd06.deform"]`, so the variant id is stable and the depth program cache keys on it (the static-cache rationale of `DepthPass.ts:30-43` stays the lighting lane's).
- Point-light faces and CSM cascades reuse the same variant with a different `u_lightViewProjection`.
- Expected live deform values per scene ≤ 6 (`skin4`, `skin8`, `skin4|morph8`, …), asserted by a lane unit test on `select()`.
- **Standalone proof without the lighting lane.** `tests/qr/prd06/browser/deform-light-view.spec.ts` (T0.14) builds a minimal depth `ShaderModule` from ChunkHarness + the registered chunks, draws a posed rig from a light camera into an R32F target with `WebGL2Device` directly, and compares the silhouette with a CPU-skinned reference. No `DepthPass` change is needed for this.

### 8.5 Velocity (`prd06.deform` in pass `velocity`, consumed by C-14)

The velocity program and MRT are the post lane's (C-14 `forward/Velocity.ts`). PRD 06 provides `a3dDeformPrevious` in `a3d_prd06_deform` and fills `RenderItem.previousJointTexture` / `previousMorphWeights`:

```glsl
out vec4 v_currClip; out vec4 v_prevClip;
void main() {
  vec4 p; vec3 n; vec4 t; a3dDeform(p, n, t);
  vec4 pp; a3dDeformPrevious(pp);    // C-18 signature; morph with u_morphPrevWeight4, skin with u_prevBoneTexture
  v_currClip = u_viewProjectionUnjittered * u_modelMatrix * p;
  v_prevClip = u_prevViewProjectionUnjittered * u_prevModelMatrix * pp;
  gl_Position = u_viewProjection * u_modelMatrix * p;
}
// fragment (C-14, post lane): o_velocity = (v_currClip.xy / v_currClip.w - v_prevClip.xy / v_prevClip.w) * 0.5;
```

### 8.6 PBR integration (generator, C-02)

- With `A3D_QR_CORE=v2`, the generator inserts `prd06.deform` at `vertex:deform` for any skinned or morphed item, whatever its material class. The generated PBR body (owner 01, lobes owner 04) then shades characters exactly like the world. Nothing in the material class needs to change for this; Q-04-1 only maps `SkinnedLitMaterial` options onto the PBR material so its uniforms are not orphaned.
- The legacy forks (`ShaderLibrary.ts:564-1057` 4-influence and `:1090-1587` 8-influence; E24), their single `u_shadowMapMatrix`, the stripe environment specular, the material-embedded filmic `a3dPbrEncodeOutput` and the `sin(p.x*230)` wrinkle noise (`ShaderLibrary.ts:782-786`, duplicate `:1312-1316`) are never reached on the generated path. They are deleted by the core lane at flag removal (Q-01-1).
- `u_wrinkleStrength` stays a hook. Real wrinkle normal maps are materials-lane scope (C-03).

### 8.7 WGSL twins (in `shaders/deform/*.wgsl.ts`, the C-02 `ShaderChunk.wgsl` field)

- `@group(1) @binding(0) var<storage, read> bones: array<mat4x4<f32>>;`, with `prevBones` alongside.
- Morph: `texture_2d_array<f32>` + `textureLoad(morphTex, vec2<i32>(x, y), target, 0)`, with an active list in a uniform struct `array<vec4<f32>, 16>` (index, weight packed).
- `@builtin(vertex_index)`, identical ordering.
- `WebGPUSkinningLimits.ts` (06): `MAX_WEBGPU_SKINNING_JOINTS` stops being the palette capacity, and the `decideSkinningPalettePath` default `maxDataTextureJoints` becomes `MAX_SKINNING_JOINTS` (1024, `ForwardPass.ts:115`; ForwardPass already passes it explicitly at `:456-459`), so a rig above 96 joints never routes to CPU or to a zero palette (E27).
- `WebGPUDevice.ts` (owner 11) stops packing `u_jointMatrices` into the 96-slot uniform struct (`:2249-2251`, `:3447`) and binds the storage buffer: request Q-11-1. Until it lands, WebGPU keeps today's behaviour, which the lane records as E27 evidence.

## 9. Rendering changes

1. **Depth.** Via the C-11 depth feature (§8.4). `ShadowPass`/`DepthPass` are not edited. The shared `SkinningPaletteTextureCache` guarantees depth binds the same bone texture as forward.
2. **Palette lifetime.**
   - The palette is uploaded at most once per skin per frame: the first `bind` of a `paletteKey` in a frame calls `texture.update()`, later binds in the same frame (depth, velocity) only bind. The frame id is the `DeviceCounters` frame (C-28 `resetFrameCounters`) when present, else a counter the cache advances in `swap()`, which the actor extension calls once per presented frame. No edit to `Renderer.ts` frame prep is needed.
   - `RenderItem.skinning.paletteKey` identifies the skin instance. It is the `GLTFAnimationRuntime` skinning-binding object, which lives as long as the actor's runtime and is unique per actor and skin. It is not the `renderable.skinning` object, which is replaced every frame (E40).
   - Textures are released on actor dispose by calling `Texture.dispose()` from the `dispose` hook of the `prd06.animation` TypedGLBActor extension (CONTRACTS §3.6). That is the only path `releaseDisposedTextureHandles` frees (E21). Diagnostics report `createdThisFrame`, which must be 0 after warm-up.
3. **Morph textures** are built at geometry upload, cached on a `WeakMap<Geometry, MorphTargetTextureResult>`, and disposed with the geometry. Per frame, only uniforms are updated.
4. **Culling.** `skinnedItemLocalBounds` (06 carve `renderer/SkinnedBounds.ts`, ex-`Renderer.ts:2295-2305`) uses joint AABBs. Shadow caster culling uses the same bounds through C-11 `registerSkinnedBoundsProvider`, so a crouching character's shadow box does not use bind bounds once the lighting lane's culling consumes it.
5. **Static batching** keeps excluding skinned and morph items (`Renderer.ts:2388-2397`, per research/19 C4); no change.
6. **Temporal.** PRD 06 fills the C-14 previous-frame `RenderItem` fields for skinned and morphed items. `TemporalHistory.ts:73-74` (post lane) stops throwing for them when C-14 is real (Q-03-1). Transparent items stay excluded.
7. **Shader warm-up.** On asset load, the `onLoad` hook of the `prd06.animation` TypedGLBActor extension precompiles forward + depth (+ velocity when TAA is on) programs for each skinned/morph item and keeps the actor's render items out of `collectRenderItems` until they are linked. It uses C-02 `ProgramCacheLike.precompile` when the generator is real and C-28 `RenderDevice.compileAsync` otherwise (stub: resolves after a synchronous compile; real `KHR_parallel_shader_compile` polling is the GPU/tiers lane's). This prevents the first-frame hitch that research/09 attributes to depth recompiles. No `RenderDevice.ts` edit is needed (the member is pre-declared by C-28).
8. **Diagnostics** (feeds PRD 12 evidence; not a quality claim). Registered as C-31 section `animation` (C-19 `AuraAnimationDiagnostics`):
   - `animation.actors[]`: active clip, tracksApplied, active actions, mixer ms, constraints ms, springs ms, palette bytes, morph active/dropped, cpu ms.
   - `animation.skinnedCasters`, `animation.morphCasters`: items for which `prd06.deform` was selected in a depth pass (0 while the C-11 stub ignores registered features; reported, never fabricated).

## 10. Migration plan

Every step below is behind `A3D_QR_ANIMATION` (and its sub-flags), so a PRD 06 merge never changes flag-off pixels (CONTRACTS §6.1). Adoption follows the flag states of CONTRACTS §5.3: lane tests and lane scenes from `dev`; PRD 14 routes and PRD 13 templates opt in from `standalone-accepted`; new apps get it by default from `integrated-accepted`.

1. **P0 is behaviour-fixing and has no API break.**
   - With the flag on, controller bindings default to `drive: "clips"`. Apps that relied on the freeze (none intentionally; research/19 C16 found only gallery-shift and fighting-game) start animating.
   - Re-baselining of gallery-shift, the fighting-game template, and benchmarks 08, 15 and 18 happens at checkpoints with the flag on (PRD 12 records; vision + human review). A blind update is not allowed.
2. **P1 changes root defaults** (crossfade 0.2 s, speed honoured, strict clip names, rest reset) under `defaults: "3.1"`, which is the default when the flag is on.
   - Codemod `animation-3.1`: implemented in `tools/codemods/animation-3.1.mjs` and registered through C-39 `registerCodemod` from `packages/aura3d-cli/src/commands/prd06/index.ts`, so it runs as `aura3d codemod animation-3.1 <glob> [--report|--write]` with no root-script dependency (a root `pnpm codemod:animation-3.1` alias is the non-blocking `root-manifest` request Q-15-3). It scans `apps/**`, `packages/create-aura3d/templates/**` and `examples/**` for `.animate({clip})`, `node.play(` and `resolveGLTFClipName` callers, and reports clip names that do not resolve **exactly** against the asset's `metadata.animations` in that app's `aura-assets.ts`. Example: `apps/world-war-x-showcase/src/WorldWarXApp.ts:1071` requests `"idle-ready"` with `speed: 0.44` (research/09 §3.4).
   - For each miss, `--write` emits the nearest real clip name, or `fallback: "first"`, with a `// TODO(animation-3.1)` marker. PRD 06 runs `--report` in its own CI and attaches the JSON to Q-13-2 and Q-14-6. PRDs 13 and 14 run `--write` on their files (CONTRACTS C-39 semantics).
   - Existing three.js parity specs whose expectations encode today's renormalised blend (`tests/browser/threejs-parity-skinning-{blending,additive,ik}-parity.spec.ts`, `tests/unit/agent-api/animation-mixer-root-e3.test.ts`, `tests/unit/animation/animation-controller.test.ts`) keep their flag-off expectations. Each gains a flag-on case (in the same file when lane 06 owns it per the creator rule, else in `tests/qr/prd06/`) in the same PR as T1.3/T1.11. Every flag-on expectation cites the three r185 value it matches.
3. **P1 stack collapse.**
   - `@aura3d/animation` `AnimationMixer` keeps its public signature as a facade. Its internal blend math is used only with `A3D_QR_ANIMATION_POSE_MIXER` off and is deleted at flag removal.
   - `@aura3d/animation` `AnimationController` keeps its public API, and `blendStates` delegates to `PoseMixer` for compiled clips (E38).
   - `GLTFSceneAnimationRuntime.applyClips` keeps its signature and is re-implemented on `PoseMixer`.
   - The engine controller keeps its public API, and its pose blend is used only for `drive: "pose"` clips that have samplers.
4. **P2 shader unification** happens through the generator (C-02 real) without touching material classes. Request Q-04-1 asks the materials lane to map `SkinnedLitMaterial` options onto its PBR material and to accept-and-ignore the uniform names declared in `SkinnedLitMaterial.ts:225-229` (`u_jointCount`, `u_jointMatrices`, `u_jointPaletteMode`, `u_jointPaletteTexture`, `u_jointPaletteTextureSize`) with a one-time deprecation warning. The bone texture is bound by the `prd06.deform` feature, not by material parameters.
5. **Templates and skills** are PRD 13's (R20). PRD 06 publishes C-40 facts `F-06-*` (Appendix B rows appended in the PR that verifies them) and the codemod report; PRD 13 updates `fighting-game`, `character-controller`, `character-hero`, `mini-game`, `animation-studio`, `three-compat-character-viewer` and the `aura3d-character-animation` skill (Q-13-1..4). Generated projects pin `@aura3d/engine`, so existing scaffolds are not silently changed.
6. **Games** are PRD 14's. They opt into `A3D_QR_ANIMATION` per route once it is `standalone-accepted`; PRD 06 provides per-game acceptance specs (§17.4) and the change lists in Q-14-1..7.

## 11. Backward compatibility

With `A3D_QR_ANIMATION` off (the default until the flag reaches `integrated-accepted`), every surface below behaves exactly as at `85aafcd0`; the flag-off sentinel identity check (CONTRACTS §6.1) enforces it. The table describes flag-on behaviour.

| Surface | Compatibility |
|---|---|
| `bindRuntimeNode({ applyPose })` | `applyPose:false` → `drive:"clips"` (same as new default). `applyPose:true` explicitly → `drive:"pose"`; it warns if any bound clip lacks a sampler. Removed in the next major release. |
| `node.play` without `crossFade` | **Behaviour change**: 0.2 s crossfade. Opt out with `crossFade:false`, or app-wide `createAuraApp({ animation: { defaults: "3.0" } })` for one minor release. |
| `speed` | **Behaviour change**: now applied. Apps that set `speed` and relied on it being ignored get different timing. The codemod lists them (world-war-x `.animate({speed:0.44})`). |
| Clip-name miss | Was the first clip, now a warning + no-op. `fallback:"first"` restores the old behaviour. |
| Weight < 1 on a single base action | Was full strength, now blends with rest. `A3D_QR_ANIMATION_POSE_MIXER` off (alias `animation.mixer: "legacy"`) keeps the old math. |
| Additive scale | Today's additive path (glTF runtime and `@aura3d/animation` mixer) multiplies absolute sampled values (E16). It is now a three-style subtractive delta. Clips authored against the old behaviour must be re-made additive with `makeClipAdditive`. |
| WebGPU rigs above 96 joints | Were most likely zero-palette (E27). They skin correctly once Q-11-1 lands, so WebGPU goldens change then. |
| `GLTFSceneAnimationClipBoneMask` substring | Still accepted, deprecated warning once per mask. |
| `SkinnedLitMaterial` | Same class. On the generated path (`A3D_QR_CORE=v2`) skinned items render with the PBR body; visual diffs are expected (gains IBL/CSM) and are scored at checkpoints. |
| Joint counts ≤ 96 | Same visual output on the legacy shader. Generated programs use the bone texture. |
| `MAX_GPU_MORPH_*` exports | Kept as deprecated constants; not consulted by `prd06.deform`. |
| `setAnimationPose` | Kept. An empty pose is rejected (throw under strict, otherwise warn-once). |
| Evidence fields (`skinnedClipPlaybackProvenAtRoot`, `visibleMotionSource`) | Ignored by gates. Removal is the bench/games lanes' (PRD 12/14). |

## 12. Contracts consumed / provided

The earlier "Dependencies on other PRDs" table is replaced by contracts. PRD 06 builds against each consumed contract's PR 0a stub and never waits for the provider's real implementation. What a stub can and cannot show decides whether a criterion is standalone (§17.0) or integrated (§17.1, §17.4). Facts from the old table that were not dependencies (research citations on shadow strength, tint override, camera framing) moved to §17.4 "integrated with" notes.

### 12.1 Contracts provided

| ID | Name | Surface PRD 06 provides | Stub that must keep working (PR 0a, CONTRACTS) | Real (PRD 06) | Consumers |
|---|---|---|---|---|---|
| C-18 | Deformation resources | `Texture.update`/`revision`/`"2d-array"`; `SkinningPaletteBinding`; `SkinningPaletteTextureCacheLike`; `buildMorphTargetTexture`; chunks `a3d_prd06_skinning_common`, `a3d_prd06_morph_texture`, `a3d_prd06_deform` (`a3dDeform`, `a3dDeformPrevious`); feature `prd06.deform` at `vertex:deform` | `forward/Deform.ts` holds the verbatim moved code; `buildMorphTargetTexture` returns `{ fallback: "cpu", reason: "PRD06_PENDING" }`; deform chunks registered as passthrough (`pos = vec4(a_position,1)`); `Texture.update` replaces data and bumps revision, device re-uploads whole texture | `SkinningPaletteTextureCache.ts`, `SkinningUniforms.ts`, `SkinningBounds.ts`, `resources/MorphTargetTexture.ts`, `shaders/deform/*`, `webgl2/TextureUpload.ts` sub-image path, 8-influence path; `slot.provide` in `packages/rendering/src/lanes/prd06.ts` | 01 (generator includes `deform`), 02 (skinned/morph depth variants, joint-AABB caster culling), 03 (previous palette for velocity), 11 (compileAsync, palette budgets, WGSL twins) |
| C-19 | AnimationPlayback API | `AuraAnimationSpec` additions, `AuraActorAnimationApi` (`crossFadeTo`, `playLayer`, `stopLayer`, `resolveAnimationClips`, `animationState`, `socket`, `ik`, `springBones`), `AuraCreateAppAnimationOptions`, renderer options `skinnedShadows`/`morph`/`skinnedPbr`, `AuraAnimationDiagnostics`, `@aura3d/animation/pose` | `crossFadeTo` maps to `node.play` with an immediate switch; `playLayer`/`stopLayer` base layer only + `option-ignored`; `socket()` = root world matrix, `valid: false`; `animationState()` reads the existing `applyProductionActorAnimation` result | `@aura3d/animation/pose` (PoseMixer, inertializer, blend trees, IK, retargeting); `app/actorAnimationHandle.ts`; `compiler/animation.ts`; `actor/TypedGLBActorAnimation.ts`; `registerNodeHandleExtension("animation")` in `packages/engine/src/lanes/prd06.ts` | 07 (bone sockets for trails/emitters), 08 (hit-stop via `timeScale`), 09 (character binding in `game`), 13 (templates: `tracksApplied > 0`), 14 (games) |

Registry entries PRD 06 provides into other contracts: C-02 chunks `a3d_prd06_*` and feature `prd06.deform`; C-11 depth feature `prd06.deform` and `SkinnedBoundsProvider`; C-14 `RenderItem.previousJointTexture`/`previousMorphWeights` values; C-31 section `animation`; C-33 step plugin `burst` (`tools/quality-rebuild-capture/steps/burst.mjs`); C-36 `diagnosticOnly.prd06.ts` entries for every C-19 field until wired, and option-coverage rows for each wired field; C-37 member `animation`; C-39 codemod `animation-3.1` and commands `animation inspect-clips`, `animation validate-hero`; C-30 scenes `prd06-*`; C-40 facts `F-06-*`; TypedGLBActor extension `prd06.animation` (CONTRACTS §3.6).

Conformance suites that must pass for both `stub` and `real` (PRD 15-owned): `tests/unit/contracts/C-18-deform.test.ts` (palette key stability; no allocation on second upload), `tests/browser/contracts/C-18-deform.spec.ts` (GPU deform equals CPU reference within 1e-3 world units), `tests/unit/contracts/C-19-animation.test.ts` (timeScale composition; fallback semantics), `tests/browser/contracts/C-19-tracks-applied.spec.ts` (a rigged fixture reports `tracksApplied > 0` and its bone moves between frames). PRD 06 adds `tests/unit/contracts/impl/prd06-{deform,playback}.test.ts` for its real implementations.

### 12.2 Contracts consumed

| ID | Name | Provider | What PRD 06 uses | Day-0 stub behaviour PRD 06 relies on | Effect on acceptance |
|---|---|---|---|---|---|
| C-01 | FrameGraph phase hooks | 01 | none required; palette upload is lazy per frame (§9.2) | — | — |
| C-02 | ProgramFeatures, chunk registry, ProgramCache | 01 | `registerShaderChunk`, `registerShaderFeature`, `ProgramFeatures.skinning/morph`, `ProgramCacheLike.precompile`, `ChunkHarness` | registries real (store and validate); `generateProgram` throws `PROGRAM_GENERATOR_PENDING`; cache wraps `ShaderLibrary` and ignores features; ChunkHarness real | chunk compile and GPU = CPU numerics standalone; unified skinned PBR and morph pixels integrated |
| C-03 | MaterialFeature lobe registry | 04 | read-only: skinned/morphed items keep whatever lobes C-03 reports; deform chunks (C-18) run at `vertex:deform` before lobe evaluation; PRD 06 registers no lobes | registry real; lobes have no render effect until the C-02 generator is real; `materials.paths.materialModel = "legacy"` (`CONTRACTS.md:490-491`) | none standalone (skinned shading stays on the legacy `SkinnedLitMaterial` path); lobe-correct skinned shading integrated |
| C-07 | Primitive tessellation, InstanceBuffer | 01 | none for P0-P4 (crowds out of scope) | — | — |
| C-09 / C-10 | Environment, lighting | 02 | hero scene lighting | legacy environment and lights | hero IBL/lighting look integrated |
| C-11 | ShadowCaster depth-variant hook | 02 | `registerDepthVariantFeature`, `registerSkinnedBoundsProvider`, `ShadowCasterVariantKey.skinning/morphTargets` | features stored, applied only once the lighting lane's `DepthPass` consumes them; key has only `instanced`/`doubleSided` | light-view silhouette standalone (lane harness); on-screen skinned shadows integrated |
| C-14 | Velocity, temporal history | 03 | `RenderItem.previousJointTexture`, `previousMorphWeights`; `resetTemporalHistory` | fields inert; `TemporalHistory` still throws for skinned items | `a3dDeformPrevious` numerics standalone; TAA ghosting integrated |
| C-17 | Asset manifest 1.1 | 05 | `animationClips[{name,duration,channelCount}]`, role `hero`/`character`, admission | reader accepts 1.1, writer emits 1.0; consumers use `AuraCliAnimationClipInspection` | runtime clip resolution standalone; typegen durations and admitted heroes integrated |
| C-22 | CameraRig live API | 08 | follow camera in `prd06-character-hero` | scripted camera from scene source | framing integrated |
| C-23 | Time controller | 08 | `app.time.scale`, `handle.timeScale` (C-37 member `timeScale`) | `AuraTimeController` real; `timeScale` a plain field defaulting to 1 | hit-stop freezing the mixer standalone (unit, with the stub) |
| C-26 | World queries | 10 | `GroundRaycaster` for foot IK | `ground()` raycasts the physics world, else plane `y = 0`; `height()` = 0 | slope/stairs foot IK standalone with a test raycaster; on real terrain integrated |
| C-27 | QualityTier settings | 11 | tier for §13 caps (`A3D_MORPH_MAX_ACTIVE`, skinned casters, spring Hz, IK actors) | real data; `"auto"` → high desktop / medium coarse pointer | standalone |
| C-28 | Device capabilities | 11 | `compileAsync`, `counters()` (`textureUploads`, `programCompiles`), `probe.maxTextureSize` | `compileAsync` resolves after a synchronous compile; counters partial | standalone (0 textures created per frame measured by the cache itself) |
| C-29 | Renderer factory / WebGPU backend | 11 | WebGPU parity runs | today's backend selection | WebGPU >96-joint parity integrated (also needs Q-11-1) |
| C-30 | Benchmark scene registry | 12 | lane scene index `scenes/prd06/`, `prd06-<slug>` ids, `ReadyPayloadV2.qrFlags` | registry wraps the 18 base scenes + lane indices | standalone (own scenes) |
| C-31 | Diagnostics sections | 12 | `registerDiagnosticsSection("animation")` | section present with null/empty values | standalone |
| C-32 / C-33 | Rubric, capture harness | 12 | judgement schema; step plugins; `--flags` passthrough | today's capture scripts + plugin loading + `a3d-qr=` URL passthrough | standalone screening; acceptance only at G-PANEL |
| C-36 | SceneCompiler extension points | 15 | `SceneCompileContext.strict/flags/quality`, `degrade("clip-apply-failed" \| "pose-apply-failed" \| "morph-apply-failed" \| "foot-planting-failed")`, `DIAGNOSTIC_ONLY_FIELDS`, `registerOptionCoverage` | wraps the moved legacy compiler | standalone |
| C-37 | Node-handle extensions | 15 | `registerNodeHandleExtension("animation")`; reads C-23 `timeScale` member | extension stubs present; `add` remounts (`RUNTIME_ADD_REMOUNT`) | standalone |
| C-38 | App surface registry | 15 | pre-declared `animation` and renderer options; CCR-06-1 member | real in PR 0 | standalone |
| C-39 | CLI command / codemod registry | 15 | `registerCodemod`, `registerCliCommand` | real in PR 0 | standalone |
| C-40 | Facts handoff | each lane → 13 | rows `F-06-*` | n/a | — |

Resolved conflicts from CONTRACTS §0 that changed this PRD: R5 (PRD 06 owns morph texture, palette and `a3dDeform`; PRD 01's generator includes the chunk through C-02), R15 (hit-stop arrives through `handle.timeScale`, C-23), R20 (templates and skills are written by PRD 13 from this PRD's bar).

### 12.3 Requests to other lanes (non-blocking)

Filed on day 0 as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). PRD 06 never waits: each row names what PRD 06 does meanwhile, and any criterion that needs the change is evaluated at the next checkpoint after it lands.

| ID | To | File / exact change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-01-1 | 01 | At removal of `A3D_QR_CORE` and `A3D_QR_ANIMATION`: delete the skinned-lit forks (`ShaderLibrary.ts:564-1057`, `:1090-1587`), skinned-unlit 4/8 (`:536`, `:1058`), `aura3d/morph-unlit` (`:1588`), legacy `skinning_common` (`ShaderChunks.ts:516-573`) and `MAX_GPU_MORPH_*` (`ForwardPass.ts:119-120`) | §3.7, §5.4 | legacy forks are the flag-off path; generated path never reaches them |
| Q-01-2 | 01 | Generator: honour `ProgramFeatures.skinning.influences`/`morph.targetBucket` by splicing `prd06.deform` at `vertex:deform` before `vertex:world`; add `a3d_prd06_deform` to the warm-up set for skinned items | C-02 | ChunkHarness compile + lane deform harness |
| Q-01-3 | 01 | `WebGL2Device` uniform reflection: recognise `sampler2DArray` (`GL_SAMPLER_2D_ARRAY`) uniforms and bind `"2d-array"` textures to `TEXTURE_2D_ARRAY` units (legacy patch, §3.7; no flag-off change since no legacy program declares one) | C-18 | `bindUniforms` binds by explicit name through the 06 `TextureUpload.ts` path |
| Q-02-1 | 02 | `DepthPass`: compose registered `DepthVariantFeature`s (this is C-11 real); consume `SkinnedBoundsProvider` in caster culling; report `features["prd06.deform"]` in `ShadowCasterVariantKey` | C-11 | lane light-view harness (T0.14) proves the silhouette; on-screen shadow scored at checkpoints |
| Q-03-1 | 03 | `TemporalHistory.ts:73-74`: admit skinned/morph items that carry `previousJointTexture`/`previousMorphWeights` when the velocity pass is active | C-14 | TAA stays off for skinned items (today's behaviour); `a3dDeformPrevious` tested numerically |
| Q-04-1 | 04 | `SkinnedLitMaterial.ts`: map options to the PBR material on the generated path; accept-and-ignore the `:225-229` uniforms with one warning | C-03, C-18 | generator applies `prd06.deform` to the item regardless of class |
| Q-04-2 | 04 | `TypedGLBActor.ts`: confirm the `registerTypedGLBActorExtension` call sites (PR 0b-3) run `onLoad` before the first `collectRenderItems` | §3.6 | none needed if PR 0b-3 lands as specified |
| Q-05-1 | 05 | `packages/aura3d-cli/src/index.ts:2112` `inspectGltfAnimations`: call `inspectAnimationClips(json, bin)` from `commands/prd06/inspectAnimationClips.ts` and add `duration`, `hasRootMotionCandidate`, `frameRate?`; `asset-manifest.ts:64`: emit C-17 `animationClips` objects | C-17 | engine resolves real durations at runtime (T0.6); `aura3d animation inspect-clips` command gives the same data |
| Q-05-2 | 05 | Admit a `hero`-role rigged humanoid meeting §6.9 (≥ 15k tris, ≥ 50 joints, the clip set) and a combat fighter pair for `fighting-game` (E9b); candidates `auraClashPlayerRig`/`auraClashRivalRig` if licensing allows | C-17 | lane scene uses repo rigs by path (§6.9); missing clips reported `HERO_MISSING_CLIP` |
| Q-09-1 | 09 | `agent-api/nodes/game/`: alias `game.characterAnimation = characterAnimation` (import from `@aura3d/engine` public entry) | C-24 | `characterAnimation` exported from the engine lane barrel |
| Q-11-1 | 11 | `WebGPUDevice.ts:2249-2251, 2944-2948, 3447`: bind a storage-buffer palette from `SkinningPaletteTextureCache` data (WGSL twin `shaders/deform/skinning.wgsl.ts`); `texture_2d_array` for morph | C-18, C-29 | WebGPU keeps today's path; E27 recorded as evidence |
| Q-11-2 | 11 | Tier table: confirm `A3D_MORPH_MAX_ACTIVE` (8/16/32/64), skinned-caster scope and spring Hz per tier as C-27 fields, or accept them as PRD 06 constants keyed by `tier` | C-27 | PRD 06 constants keyed by the C-27 tier |
| Q-11-3 | 11 | `WebGPUDevice.ts`: on `Texture.revision` change call `queue.writeTexture` for the changed region instead of recreating; support `dimension: "2d-array"` via `depthOrArrayLayers` | C-18 | WebGPU recreates/re-uploads the whole texture (stub semantics) |
| Q-12-1 | 12 | Add `prd06-*` scenes to checkpoint captures (automatic via registry) and LFS paths for any new fixtures to `ci.sh`; rubric prompt lines for character shadow and motion | C-30, C-32 | lane workflow captures its own scenes |
| Q-13-1 | 13 | `templates/fighting-game/src/game/fighters.ts:57-79`: delete `tracks: []`/`poseBakedFallback` clips; add `fighterClipMap` with explicit stand-ins (spec in T0.9a) | C-40 | lane fixture project `tests/qr/prd06/fixtures/fighting-clipmap/` proves the pattern |
| Q-13-2 | 13 | `skills/aura3d-character-animation/SKILL.md:51-74`: rewrite from facts F-06-01..05 (spec in T0.16) | C-40 | facts published `proposed` → `verified` |
| Q-13-3 | 13 | New `templates/character-hero/` and upgraded `templates/character-controller/` from scene `prd06-character-hero` (spec in T4.3/T4.4) | C-40 | lane scene is the reference implementation |
| Q-13-4 | 13 | Run `aura3d codemod animation-3.1 --write` on templates; templates set `animation: { strict: true }` | C-39 | report attached |
| Q-14-1..6 | 14 | Route changes for aura-clash, rooftop-buckets, skyline-runner, neon-swarm, mech-hangar, gallery-shift (specs in T5.1-T5.6) | C-19 | per-game specs in `tests/qr/prd06/games/` run with `?a3d-qr=animation` |
| Q-14-7 | 14 | Run `aura3d codemod animation-3.1 --write` on `apps/world-war-x-showcase` (`WorldWarXApp.ts:1071`) and every route the report lists | C-39 | report attached |
| Q-14-8 | 14 | `tools/quality-rebuild-capture/games.json`: add `{ "burst": { "frames": 150, "intervalMs": 33, "region": "character" } }` steps for the six §17.4 games | C-33 | lane workflow passes the step inline |
| Q-15-1 | 15 | `compiler/renderInput.ts` (ex-`index.ts:13871-13883`): replace the inline pose/clip branch with `dispatchActorAnimation(entry, currentState, …)` from `compiler/animation.ts` | C-36 | empty poses never stored (T0.2), so the inline branch is already correct |
| Q-15-2 | 15 | `LeanWebGL2Device.ts`: honour `Texture.revision` (sub-image re-upload) or route lean through the shared upload path | C-18 | lean path keeps full re-upload (correct, slower) |
| Q-15-3 | 15 | `root-manifest` batch: root script `"codemod:animation-3.1": "aura3d codemod animation-3.1"` | §4.4 | run through the CLI |

Third-party code: none vendored. `three@0.185.1` is already a repo-root devDependency and is used only in tests and the benchmark's three side.

---

## Parallel execution

### Day-0 start conditions

PRD 06 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artifacts: `packages/rendering/src/contracts/{core,program,shadows,velocity,deform,quality,device,renderItem,index}.ts` and `testing/ChunkHarness.ts`; `packages/engine/src/contracts/{flags,animation,time,world,diagnostics,compiler,runtimeNodes,app,assets,index}.ts` and `stubs/*`; `packages/animation/src/contracts/pose.ts`; `packages/aura3d-cli/src/contracts/{assetManifest,commands}.ts`; the C-18/C-19 pre-declared fields on `Texture.ts`, `index.ts` and `AuraCreateAppOptions`; the lane barrels `packages/{rendering,engine,assets,animation}/src/lanes/prd06.ts`, `agent-api/compiler/diagnosticOnly.prd06.ts`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd06/index.ts`, `packages/aura3d-cli/src/commands/prd06/index.ts`; the conformance harness. Nothing from any other lane's real implementation is needed.

Work in files PRD 06 owns outright starts on day 0: `packages/animation/**` (incl. `pose/`), `GLTFAnimationRuntime.ts`, engine `AnimationController.ts`, `VisemeController.ts`, `GameCharacterAnimation.ts`, `Texture.ts`, `MorphTargetPlan.ts`, `Skinning*.ts`, `WebGPUSkinningLimits.ts`, `resources/MorphTargetTexture.ts`, `shaders/deform/`, CLI `asset-inspection-types.ts`, `animation-asset-validator.ts`, `commands/prd06/`, `tools/codemods/animation-3.1.mjs`, `steps/burst.mjs`, lane scenes and tests. Edits to carved regions start when the PR 0b part containing them merges (≤ 2026-10-07); until then the replacement is written in a new lane module and wired after the merge:
- PR 0b-1: `app/actorAnimationHandle.ts`, `compiler/animation.ts`, C-31/C-36/C-37/C-38 seams.
- PR 0b-2: `forward/Deform.ts`, `webgl2/TextureUpload.ts`, `renderer/SkinnedBounds.ts`, C-11 and C-18 seams.
- PR 0b-3: `actor/TypedGLBActorAnimation.ts` and the TypedGLBActor extension hook, C-39 fallthrough, C-33 step-plugin loading.

### Owned files and directories (must match CONTRACTS §4.1)

`packages/animation/` (all, incl. `Keyframe.ts`, `AnimationController.ts`, `pose/`); `packages/rendering/src/Skinning*.ts`, `WebGPUSkinningLimits.ts`, `MorphTargetPlan.ts`, `Texture.ts`, `resources/MorphTargetTexture.ts`, `shaders/deform/`, `forward/Deform.ts`, `webgl2/TextureUpload.ts`, `renderer/SkinnedBounds.ts`; `packages/assets/src/GLTFAnimationRuntime.ts`; `packages/engine/src/agent-api/{AnimationController,GameCharacterAnimation,VisemeController,FootPlanting,humanoid-walk-runtime}.ts`, `agent-api/app/actorAnimationHandle.ts`, `agent-api/compiler/animation.ts`, `production-runtime/actor/TypedGLBActorAnimation.ts`; `packages/aura3d-cli/src/{animation-asset-validator,asset-inspection-types}.ts`; `tools/codemods/animation-3.1.mjs`; `tools/quality-rebuild-capture/steps/burst.mjs`; `playwright.animation-matrix.config.ts`; `docs/rendering/skinning-and-morphs.md`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd06,prd-06}/`, `packages/*/src/lanes/prd06.ts`, `agent-api/compiler/diagnosticOnly.prd06.ts`, `packages/aura3d-cli/src/commands/prd06/`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd06/`, `.github/workflows/qr-prd06-*.yml`, `tests/qr/prd06/`, `tests/unit/contracts/impl/prd06-*`. New test files elsewhere under `tests/` belong to this lane by the creator rule.

Tasks of the earlier draft that edited files owned by other lanes were converted: to extension points (`DepthPass.ts`/`ShaderLibraryCore.ts` → C-11 feature; `ShaderChunks.ts`/`ShaderLibrary.ts` → C-02 chunks in `shaders/deform/`; `ForwardPass.ts`/`WebGL2Device.ts`/`Renderer.ts` → 06-owned carves; `TypedGLBActor.ts` → actor extension; `index.ts` handle/options → C-37/C-38/C-19 pre-declared fields; `capture-games.mjs` → C-33 plugin; `scenes.ts` → lane scene index; `browser-matrix.yml` → `qr-prd06-animation-browser.yml`; root script → C-39) or to §12.3 requests (`TemporalHistory.ts`, `SkinnedLitMaterial.ts`, `WebGPUDevice.ts`, `LeanWebGL2Device.ts`, `compiler/renderInput.ts`, CLI `index.ts`/`asset-manifest.ts`, templates, skill, routes, `games.json`).

### Extension points used in files owned by others

| Host file (owner) | Extension point | PRD 06 registrant |
|---|---|---|
| generated programs (01) | C-02 `registerShaderChunk`, `registerShaderFeature("prd06.deform")` at `vertex:deform` | `shaders/deform/*.glsl.ts`, `lanes/prd06.ts` |
| `DepthPass.ts` / shadow culling (02) | C-11 `registerDepthVariantFeature`, `registerSkinnedBoundsProvider` | `shaders/deform/depthFeature.ts`, `renderer/SkinnedBounds.ts` |
| velocity pass (03) | C-14 `RenderItem.previousJointTexture`, `previousMorphWeights` | `actor/TypedGLBActorAnimation.ts` `collectRenderItems` |
| `TypedGLBActor.ts` (04) | `registerTypedGLBActorExtension({ id: "prd06.animation", owner: "prd06", flag: "A3D_QR_ANIMATION", onLoad, collectRenderItems, dispose })` | `actor/TypedGLBActorAnimation.ts` |
| `app/runtimeNodes.ts` (15) | C-37 `registerNodeHandleExtension({ member: "animation" })` | `packages/engine/src/lanes/prd06.ts` |
| `app/diagnostics.ts` (15) | C-31 `registerDiagnosticsSection({ key: "animation" })` | same |
| `app/createAuraApp.ts` (15) | C-38 pre-declared `animation`/renderer options; CCR-06-1 member | same |
| compiler (15) | C-36 `SceneCompileContext`, degradations, `DIAGNOSTIC_ONLY_FIELDS`, option coverage | `compiler/animation.ts`, `diagnosticOnly.prd06.ts` |
| `aura3d-cli/src/cli.ts` (05) | C-39 `registerCodemod("animation-3.1")`, `registerCliCommand("animation inspect-clips" \| "animation validate-hero")` | `commands/prd06/index.ts` |
| `capture-games.mjs` (12) | C-33 step plugin `burst` | `tools/quality-rebuild-capture/steps/burst.mjs` |
| `shared/registry.ts` (12) | C-30 lane scene index | `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd06/index.ts` |

### Feature flags

| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_ANIMATION` | bool | every PRD 06 behaviour change: empty-pose rejection, clip drive, runtime durations, 3.1 root defaults, palette cache, persistent buffers, `node.animation` members beyond the C-19 stub, sockets, constraints, springs, diagnostics values | `animation.defaults: "3.1"` (on) / `"3.0"` (off) |
| `A3D_QR_ANIMATION_POSE_MIXER` | bool | PoseMixer behind every facade (three r185 blend semantics) | `animation.mixer: "pose" \| "legacy"` |
| `A3D_QR_ANIMATION_GPU_MORPH` | bool | `buildMorphTargetTexture` real and `prd06.deform` morph bits (off = CPU morph into a persistent buffer) | `renderer.morph: "gpu" \| "cpu"` |
| `A3D_QR_ANIMATION_SKINNED_SHADOWS` | bool | registration of the C-11 depth feature and the skinned-bounds provider | `renderer.skinnedShadows` |

Unified skinned PBR additionally requires `A3D_QR_CORE=v2` (generator); `renderer.skinnedPbr: "fork"` forces the legacy forks even then. Strictness is not a PRD 06 flag: `animation.strict` or `A3D_QR_STRICT`.

### Stubs used

C-02 (`PROGRAM_GENERATOR_PENDING`, cache wraps `ShaderLibrary`, ChunkHarness real), C-09/C-10 (legacy lighting), C-11 (features stored but not applied), C-14 (fields inert), C-17 (1.0 writer), C-22 (scripted camera), C-23 (real time controller, plain `timeScale` field), C-26 (physics/plane ground), C-27 (real data), C-28 (sync `compileAsync`, partial counters), C-29, C-30, C-31, C-33, C-36, C-37 (remount add), C-38/C-39 (real). PRD 06's own stubs (C-18, C-19) stay the flag-off path until CONTRACTS §5.4 removal.

### Integration checkpoints

Integrated acceptance (§17.1, §17.4 and the integrated half of §17.2) is evaluated only at CONTRACTS §7 checkpoints with `A3D_QR_ANIMATION` on inside `qr_flags=all`, and never blocks a PRD 06 merge:
- IC-0 (2026-10-08): flags `none` baseline; PRD 06 records per-scene and per-game character baselines (shadow ROI, `tracksApplied`, motion metrics where measurable).
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): screening (vision-only, recorded, cannot accept). First expected integrated signal: skinned shadows on screen once Q-02-1/C-11 real lands.
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds; the only rounds that can move `A3D_QR_ANIMATION` to `integrated-accepted` and satisfy §17.1/§17.4. Leave-one-out (`all,-animation`) attributes regressions; per-lane attribution separates 06 deltas from lighting/materials/camera deltas.
A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane (CONTRACTS §7). Unresolved Q-* requests are listed in each checkpoint report.

## 13. Performance budgets

Measured per frame at the stated character load. "CPU" is the animation update: mixer + inertializer + constraints + springs + palette build + uploads, reported by the engine as `diagnostics.animation.cpuMs` (§9.8, `performance.now()` around the animation phase), median over 600 frames after 120 warm-up frames.

"GPU" is the extra GPU time from skinning and morph in the forward + shadow + velocity passes compared with the same meshes rigid. It is measured in a **dedicated tier scene** (`prd06-perf-tier-{low,medium,high,ultra}`, lane scenes: the stated load on a ground plane, one directional shadow, no post). Do not use game routes, where 5-15 fps frames bury a 1 ms delta in noise. Use `EXT_disjoint_timer_query_webgl2` where the browser exposes it. It is usually absent on macOS Chrome/ANGLE and on Safari. Otherwise run on/off frame-time differencing: 5 alternating runs × 300 frames, with skinning on vs the same meshes frozen at bind pose (`renderer.skinnedShadows`/deformation disabled). A budget passes when the **upper bound of the 95% bootstrap CI** of the median delta is within budget.

The macos-14 paravirtual GPU is neither a desktop dGPU nor a mobile proxy. Its High/Medium numbers are recorded as "macos-14 proxy" and do not stand for real hardware (§19). The tier comes from the C-27 resolved tier (`SceneCompileContext.quality.tier`), overridable by `createAuraApp({ animation: { tier } })` once CCR-06-1 lands; lane perf scenes set it explicitly.

Standalone vs integrated: the CPU column, the micro-budgets and the shadow-pass GPU cost of the lane light-view harness are standalone gates. The forward+shadow+velocity GPU column on the production path is measured standalone on today's renderer (legacy skinned shader, no skinned casters) and re-measured at checkpoints once C-02/C-11/C-14 are real; the integrated measurement is recorded against the same budget but never blocks a merge.

| Tier | Load | CPU anim (ms) | GPU skin+morph+shadow (ms) | Memory (anim+palette+morph) | Bundle delta (gz) | Notes |
|---|---|---|---|---|---|---|
| Low (mobile mid, integrated) | 1 hero (≤ 70 joints, 4 infl, ≤ 25k tris) + 4 NPCs (≤ 40 joints, ≤ 8k tris) | ≤ 1.0 | ≤ 1.0 | ≤ 12 MB | ≤ +8 KB net | morph active ≤ 8, normals off for NPC morphs; skinned shadow casters: hero only; springs 30 Hz, 1 chain; IK: hero feet only |
| Medium (laptop iGPU / high mobile) | 1 hero + 8 NPCs | ≤ 1.5 | ≤ 1.8 | ≤ 32 MB | ≤ +8 KB net | morph ≤ 16; all characters cast; foot IK on 4 nearest |
| High (desktop dGPU) | 2 heroes (≤ 200 joints, 8 infl) + 16 NPCs | ≤ 2.5 | ≤ 3.0 | ≤ 64 MB | ≤ +8 KB net | morph ≤ 32 (ARKit 52 face → 32 active); look-at on all; springs 60 Hz, 4 chains/hero |
| Ultra | 2 heroes + 32 NPCs | ≤ 4.0 | ≤ 5.0 | ≤ 128 MB | ≤ +8 KB net | morph ≤ 64; velocity for all skinned |

Fixed micro-budgets (unit benchmarks, Node on GH macos-14):

| Item | Budget |
|---|---|
| `PoseMixer.evaluate` | ≤ 25 µs for 65 bones × 2 clips. ≤ 60 µs for 191 bones × 3 clips with mask |
| Allocations | 0 bytes allocated per frame in steady state, for the mixer and palette build (heap-snapshot delta over 600 frames < 64 KB) |
| Palette build | ≤ 10 µs per 65 joints |
| Textures/geometries created per frame after warm-up | 0 |
| Two-bone IK solve | ≤ 2 µs |
| Spring chain (5 bones, 1 substep) | ≤ 3 µs |

Regression rule: on games, the animation changes must not raise median frame time by more than 3% at equal content on the macos-14 capture (`tools/quality-rebuild-capture`, flag A/B `--flags none` vs `--flags animation` in one workflow run, 3 runs each). Content changes such as replacing a 4-triangle card with a 25k-triangle hero are budgeted under the tier table.

Bundle delta is measured with `pnpm check:bundle-size` (`tools/bundle-size/index.ts`, run through the lane workflow) on `@aura3d/engine` + `@aura3d/animation` + `@aura3d/rendering` gzip, as net change against `85aafcd0`. The per-recommendation KB figures in §6.10 are estimates. The ≤ +8 KB net figure is the gate, and it is the same for every tier because tiers do not change shipped code. Flag-gated code ships in the bundle, so the gate applies with flags off too.

## 14. Implementation phases

Each phase ends with its **standalone** exit criteria met on remote CI: `.github/workflows/test.yml` and `qr-contracts.yml` for unit and conformance, the lane workflow `.github/workflows/qr-prd06-animation-browser.yml` (macos-14 matrix, T0.0) for browser, and `quality-rebuild-capture.yml` (dispatched by the lane with `qr_flags=animation`) for lane-scene and route captures. Standalone exit criteria gate the lane's next phase and its merges; integrated criteria (§17.1, §17.4) are evaluated at checkpoints and never gate a phase. No phase is "done" on a green test run alone where §17 asks for review. Phases overlap freely: P1 has no code dependency on P0 and also starts on day 0.

**Phase 0: Characters move; deformation resources (day 0).** Scope: R1, R3 cache (with the E39 `Texture.update` prerequisite), the R2 depth feature registered and proven in the lane harness, a minimal `animationState()`, the fighting-game clip-map pattern as a lane fixture.
Day-0 startable tasks (owned files only, no PR 0b needed): T0.0, T0.3-T0.8 (engine `AnimationController.ts`, CLI inspection types), T0.10a (`Texture.ts`), T0.10 cache class (`SkinningPaletteTextureCache.ts`), T0.11 (`GLTFAnimationRuntime.ts`), T0.12 (chunks), T0.15 (lane scene), T0.9a fixture. T0.2, T0.13 wiring, T0.18 and T0.19 wire up when PR 0b-1/0b-2 merge (≤ day 2).
Standalone exit criteria (each is an automated check in the named test; "visible" is never self-judged):
- Gallery-shift thief and guard-2, route loaded with `?a3d-qr=animation` (no route edit): `animationState().tracksApplied > 0` on 30 consecutive frames read through `globalThis.__AURA3D_LIVE_APPS__.all()[i].diagnostics().animation` (the registry the capture tool already reads at `capture-games.mjs:371`). Thief in SPRINT vs SNEAK at the same normalised phase: hips height differs by ≥ 5 cm **or** mean knee flexion differs by ≥ 15°, computed from `socket("Hips")`, `socket(<thigh|shin|foot>)` world matrices (C-19). Asserted in `tests/qr/prd06/browser/gallery-shift-thief-gait.spec.ts`.
- Fighting-game clip-map fixture (`tests/qr/prd06/fixtures/fighting-clipmap/`, the T0.9a pattern applied to the template's current assets read by path): every state resolves to a GLB clip with `duration > 0` and `tracksApplied > 0` when played; stand-ins reported as `FIGHTER_CLIP_STAND_IN` and not counted as passing.
- Deform light-view silhouette: `deform-light-view.spec.ts` (T0.14) CesiumMan posed at t = 0.5 s, light-view depth silhouette with `prd06.deform` vs a CPU-skinned reference, IoU ≥ 0.98; the same capture without the feature (today's raw `a_position`) is recorded as the failing control.
- `SkinningPaletteTextureCache.diagnostics().createdThisFrame === 0` after frame 10 on a 191-joint rig, legacy forward path (T0.10 browser assertion), and 0 leaked GL textures after actor dispose.
- Flag-off sentinel identity (CONTRACTS §6.1) unchanged.
Integrated (checkpoint): on-screen skinned shadow shape IoU ≥ 0.85 vs three on CesiumMan and ≥ 0.8 on 08/`prd06-skinned-character-posed`/15 (§17.1), once C-11 is real.

**Phase 1: Root defaults + one mixer (day 0).** Scope: R4, §6.3, §6.4, codemod. All code is in `packages/animation/src/pose/`, `GLTFAnimationRuntime.ts` and `compiler/animation.ts`.
Standalone exit criteria:
- The PoseMixer unit suite reproduces three.js r185 `AnimationMixer` output within 1e-4 (local TRS per bone, quaternions compared up to sign) on Soldier (`fixtures/threejs-parity/assets/character/soldier.glb`), Fox (`benchmarks/quality-rebuild/shared/assets.ts` `fox.repoPath`, read-only), CesiumMan (`fixtures/three-compat/assets/corpus/cesium-man.glb`) and RobotExpressive (`fixtures/threejs-parity/assets/character/robot-expressive.glb`) for:
  - single clip;
  - weight 0.3 (with rest);
  - three simultaneous actions at weights 0.5/0.3/0.4 (exercises incremental slerp order, §6.4);
  - crossfade at t = 0.1/0.2;
  - warp;
  - additive via `makeClipAdditive` (reference frame 0).

  The comparison is the three.js `PropertyMixer` result computed in the same Node test from `three@0.185.1` (already a repo-root devDependency). Load the GLBs on the three side with `GLTFLoader.parse` on the fixture bytes. Both sides step `update(dt)` with the identical dt sequence (1/60 × 120 frames).
- Transition continuity C ≤ 1.5 (§17.3) on all three transitions of `prd06-crossfade-filmstrip`.
- Aura Clash regression A/B (route read, not edited): for every clip key in `AURA_CLASH_REQUIRED_CLIP_KEYS` (`apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps.ts`), `tracksApplied` with `?a3d-qr=none` and `?a3d-qr=animation` is equal (±0) when the clip plays alone.
- Codemod `--report` flags `apps/world-war-x-showcase/src/WorldWarXApp.ts:1071`.

**Phase 2: GPU deformation resources and numerics.** Scope: R5 (texture morph), R8, CPU-fallback buffer, WGSL twins, velocity inputs; R6/R7/R15 provided for integration.
Standalone exit criteria:
- C-18 browser conformance real: GPU `a3dDeform` (skin 4/8 + morph 52 targets) equals the CPU reference within 1e-3 world units in the lane deform harness, and `a3dDeformPrevious` equals the CPU reference for the previous palette/weights.
- `buildMorphTargetTexture`: 20k verts × 52 targets → one RGBA16F array texture ≈ 16.6 MB; over-limit returns the documented fallback reason.
- Legacy forward path with `A3D_QR_ANIMATION` on: lit + skinned + morph item → 0 `Geometry` constructions per frame (constructor spy) through the persistent CPU-morph buffer.
- Joint-AABB bounds conservative on 50 random Soldier poses and ≤ 1.3× exact volume.
- WGSL twins validate (`tools/wgsl-validate`, read-only use); `decideSkinningPalettePath({ jointCount: 191 })` → GPU path.
Integrated (checkpoint): `prd06-morph-face` pixels, `skinned-pbr-parity` ΔE, no "armor flatter" deficiency on 08/15/18, TAA ghosting ≤ 2 px, WebGPU 191-joint IoU ≥ 0.98 (§17.1).

**Phase 3: Constraints, root motion, retargeting, sockets.** Scope: R9, R11, R13, R14.
Standalone exit criteria:
- `prd06-ik-slope`: foot-to-ground penetration ≤ 1 cm and float ≤ 2 cm on a 20° slope and on 18 cm stairs (engine-reported foot-sole height vs the scene's analytic `GroundRaycaster`, cross-checked by depth readback at the foot).
- Foot slide ≤ 2 cm per contact phase in Soldier Walk with root motion (§17.3 definition).
- The retargeted locomotion set (sources: Soldier Idle/Walk/Run, any licensed in-repo humanoid set) plays on CesiumMan and `auraClashPlayerRig` with no limb flips. A flip is automated as either (a) a local rotation jump > 90° between consecutive 60 Hz frames on any humanoid limb bone, or (b) a knee or elbow bending against the source clip's bend direction (sign of the dot product of the chain-plane normal with the source's, < 0) for more than 2 consecutive frames. Human review of the lane capture is still required.
- Root-motion walk loop closure drift ≤ 1 cm per cycle (`measureRootMotionLoopClosure`, `RootMotion.ts:82`).
- `socket("RightHand")` follows the hand bone on Soldier Walk; C-19 conformance passes with `valid: true`.
Integrated (checkpoint): foot IK on PRD 10 terrain via C-26 real.

**Phase 4: Character binding, secondary motion, hero bar.** Scope: R10, R12, the `prd06-character-hero` lane scene, viseme default, validator profiles.
Standalone exit criteria:
- `prd06-character-hero` passes the §17.2 automated motion gates and the human motion checklist on the lane capture.
- Locomotion blend on a scripted 0 → 5 m/s ramp: normalised-phase difference between walk and run actions ≤ 1% of the cycle while both have weight > 0.05, and foot slide ≤ 2 cm walk / ≤ 3 cm run (§17.3).
- Spring accessory: after the root decelerates from 1 m/s to 0 within 0.1 s, the angular deviation of every chain bone from its settled pose is < 1° from 0.6 s onwards (`spring-bones.test.ts` + capture burst).
- `hero-character` validator rejects `skylineArcticRunner.glb` with exactly the four codes (T4.6).
Integrated (checkpoint): §17.2 vision categories (≥ 6.5, within 0.5 of three) on the lane scene with lighting/camera/materials real; templates written by PRD 13 (Q-13-3) pass the same bar.

**Phase 5: Game adoption support.** Scope: per-game specs and change lists for Aura Clash, gallery-shift, rooftop, skyline, neon-swarm and mech-hangar; route edits are PRD 14's (Q-14-1..8).
Standalone exit criteria: every per-game spec in `tests/qr/prd06/games/` runs against the current route with `?a3d-qr=animation`, reports its metrics, and fails on today's route where §17.4 says it must (failing controls); the change list for each route is attached to its Q-14 issue.
Integrated (checkpoint): §17.4 thresholds on the macos-14 capture with G-PANEL review.

## 15. Task checklist

Every task names a file, a function, the behaviour, and a test. Every file a task edits is PRD 06-owned (§5.1, §5.2, "Parallel execution"); work in other lanes' files is in §12.3. Every behaviour change is behind `A3D_QR_ANIMATION` or a sub-flag, and every test runs flag-on unless it says flag-off. "Unit" means vitest, run remotely by `.github/workflows/test.yml`/`qr-contracts.yml`. "Browser" means Playwright in the lane workflow below. New test files are lane-owned wherever they sit (creator rule); new lane-only harnesses go in `tests/qr/prd06/`.

Today `browser-matrix.yml` runs **Chromium on ubuntu-latest only** (`browser-matrix.yml:19, 82`). It does not run on macos-14 and runs no WebKit or Firefox, and it is PRD 12's file. Task **T0.0** therefore adds a lane workflow:

- [x] **T0.0** Add `playwright.animation-matrix.config.ts` (06), following the per-browser config precedent of `playwright.audio-webkit.config.ts`, with `chromium` (Chrome channel, `--use-angle=metal` through the wrapper script pattern of `remote-browser-301.yml:128-133`), `webkit` and `firefox` projects. Its `testMatch` lists the PRD 06 specs from §16.
  - Add `.github/workflows/qr-prd06-animation-browser.yml` (lane-owned) with `runs-on: macos-14`, a matrix over the three projects, triggers `pull_request` on PRD 06 paths and `workflow_dispatch`. It installs the matching Playwright browsers and uploads reports and screenshots as artefacts. No cloud credentials are used; the workflow runs public-repo-safe steps only.
  - Check: the job runs the existing `tests/browser/animated-character-browser.spec.ts` green on all three projects at current main, flag-off, before any other P0 browser task merges. That establishes the baseline.

"Browser" below means this job unless stated otherwise.

### Phase 0

- [x] **T0.1** (converted; no edit to `compiler/renderInput.ts`, owner 15) The ex-`index.ts:13871` guard becomes correct through T0.2 (no empty pose is ever stored). File request Q-15-1 to route the branch through `dispatchActorAnimation` exported from `compiler/animation.ts`; implement and export `dispatchActorAnimation(entry, state, node, time, warnings, modelMatrix, refresh)` there now, with today's branch semantics plus the empty-pose guard, so the request is a one-line call-site change.
  - Unit `tests/unit/agent-api/production-actor-dispatch.test.ts`: `dispatchActorAnimation` with an empty pose plus `node.play("Walk")` calls `actor.playClip`/`applyClips`, not `applyRetargetedPose`; with a 1-bone pose it calls `applyRetargetedPose`.
- [x] **T0.2** `packages/engine/src/agent-api/app/actorAnimationHandle.ts` (PR 0b-1 carve of ex-`index.ts:10982-10984`) `setAnimationPose`. With `A3D_QR_ANIMATION` on, reject poses with 0 bones and 0 morph targets:
  - store `undefined`;
  - warn once per node `ANIMATION_EMPTY_POSE` (through the existing `runtimeWarnings` set) and record a C-36 `pose-apply-failed` degradation;
  - throw `ANIMATION_EMPTY_POSE` when strict (C-19 `animation.strict` via CCR-06-1, else `SceneCompileContext.strict`). Do not use `import.meta.env`, because the engine has no such convention and library builds would not get it.
  - Until PR 0b-1 merges, write the guard as `rejectEmptyAnimationPose(pose): AnimationPose | undefined` in `compiler/animation.ts`'s replacement module and call it from the carved function after the merge.

  Unit `tests/unit/agent-api/runtime-node-empty-pose.test.ts` (new): strict and non-strict modes; flag-off stores the empty pose exactly as today. A morph-only pose (0 bones, ≥ 1 morph) is still accepted.
- [x] **T0.3** `packages/engine/src/agent-api/AnimationController.ts` (06) `createRuntimeNodeAnimationBindingMetadata` (`:2316-2341`). Add `clipSamples: snapshot.clipSamples`, which `createRuntimeNodeClipSamples` (`:2370-2384`) already computes as `AuraAnimationRuntimeClipSample` (`:465-472`), and add a per-sample `mask` taken from the state's `layerMetadata.bodyMask`.
  - Type: declare `type Prd06BindingMetadata = AuraRuntimeNodeAnimationBindingMetadata & { readonly clipSamples?: readonly AuraActorClipSample[] }` locally in `AnimationController.ts` and a type guard `hasClipSamples(m)` in `compiler/animation.ts`. `RuntimeNodeHandle.ts:63` (owner 15) is not edited; CCR-06-5 later folds the field into the interface and the local type becomes an alias.
  - In `compiler/animation.ts` `applyProductionActorAnimation` (carved ex-`index.ts:15070`), when `hasClipSamples(animationBinding)` and `animationBinding.rootMotion` is unset, call `entry.actor.animation.applyClips(samples)` instead of `playClip`. Map each sample to `GLTFSceneAnimationClipSample` (`GLTFAnimationRuntime.ts:145-156`) as `{ clipName: entry.actor.animation.resolveClipName(s.clipName), time: s.localTime, weight: s.weight, additive: s.additive, mask }`. Drop samples whose name does not resolve, and warn `ANIMATION_CLIP_NOT_FOUND` once. The root-motion branch (ex-`:15086-15114`) keeps its existing sample path.
  - Unit `tests/unit/agent-api/production-actor-dispatch.test.ts`: controller `crossFade("walk", 0.2)` advanced 0.1 s → `applyClips` receives two samples with weights 0.5 ± 0.01 each.
- [ ] **T0.4** `AnimationController.ts:1823`. With the flag on, make the default `drive: "clips"`: call `setAnimationPose` only when `drive === "pose"` or the active clip has a `sample` function or non-empty `tracks`. Keep `applyPose` as an alias (§11).
  - Unit `tests/unit/animation/animation-controller.test.ts` (flag-on case): an embedded-name registry produces no `setAnimationPose` call; flag-off case unchanged.
- [ ] **T0.5** `AnimationController.ts:1780-1796` `sampleSinglePose`. When a clip has no sampler and is embedded (`metadata.source === "embedded-glb-animation-name"`), return `undefined` (not `emptyPose`, `:1793`), and have `captureRuntimeNodeBindingPose` propagate `undefined`. Stop using `createIdentityPose` as the implicit fallback at `:1492`.
  - Unit: a registry with a `skeleton` list must not emit identity poses (research/19 C16 counter-evidence).
- [ ] **T0.6** `AnimationController.ts` `bindRuntimeNode` (`:853`). It stays synchronous. If the node exposes `resolveAnimationClips()` (C-19 member, present on model handles through the C-37 `animation` extension; C-19 does not specify a stub result for it, so with the flag off the controller does not call it and keeps today's behaviour), start the promise. Until it settles, mark the binding `pending` and skip `applyRuntimeNodeBinding` for it. On resolve, replace each `durationSource: "defaulted"` duration with the real one (`durationSource: "runtime"`) when finite, then apply. On reject, warn `ANIMATION_CLIP_RESOLVE_FAILED` and stay pending.
  - In `app/actorAnimationHandle.ts`, implement `resolveAnimationClips()` for the `prd06.animation` node-handle extension (registered from `packages/engine/src/lanes/prd06.ts`). It resolves after the production actor loads, from `entry.actor.animation` clip names and durations, and resolves to `[]` for non-model nodes.
  - Unit with a fake actor: duration 1.0 → 2.367 after resolve, nothing is pushed while pending, and looping wraps at 2.367.
- [ ] **T0.7** `packages/aura3d-cli/src/asset-inspection-types.ts:12-19` (06). Add `duration: number` (the max over the clip's samplers of the input accessor's `max[0]`; when `max` is absent, read the accessor data), `hasRootMotionCandidate: boolean` (hips/root translation track with net XZ displacement > 5 cm), and `frameRate?: number` (median input-time delta, inverted).
  - Implement the computation as a pure `inspectAnimationClips(json: GltfJson, bin?: Uint8Array): readonly AuraCliAnimationClipInspection[]` in `packages/aura3d-cli/src/commands/prd06/inspectAnimationClips.ts`, and register `aura3d animation inspect-clips <glb>` (C-39) that prints it as JSON.
  - Calling it from `inspectGltfAnimations` (`packages/aura3d-cli/src/index.ts:2112`) and emitting C-17 `animationClips: [{ name, duration, channelCount }]` in `asset-manifest.ts:64` (today `animationClips: asset.animations`) is request Q-05-1. The engine already prefers `metadata.animationClips` over `metadata.animations` (`AnimationController.ts:2611`), so the controller sees real durations as soon as it lands; until then T0.6 provides them at runtime.
  - Unit `tests/unit/aura3d-cli/asset-inspection-animation.test.ts` on `fixtures/threejs-parity/assets/character/soldier.glb`: Walk duration matches three r185 `GLTFLoader` `AnimationClip.duration` within 1e-3.
- [ ] **T0.8** `AnimationController.ts:2668-2704` `embeddedClipToDefinition` (object branch). This branch already reads `input.duration` (`:2677`) and writes `durationSource: "metadata"` (`:2702`), so no new logic is needed. The task is a guard test: a registry built from a typed manifest fixture with object `animationClips` (the C-17 1.1 shape, built in the test) produces real durations before load and never `durationSource: "defaulted"`.
  - Unit in `tests/unit/animation/animation-controller.test.ts`.
- [ ] **T0.9a** Fighting-game clip-map pattern as a lane fixture (the template file `templates/fighting-game/src/game/fighters.ts:57-79` is PRD 13's; its rewrite is Q-13-1 with this fixture attached).
  - In `tests/qr/prd06/fixtures/fighting-clipmap/`, implement `fighterClipMap: Record<FighterAssetKey, Record<FighterClip, { clip: string; standIn?: true }>>`, modelled on `apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps.ts`, plus `validateFighterClipMap(map, assetsMetadata)`. The validator ships in `packages/engine/src/agent-api/GameCharacterAnimation.ts` as `validateClipMap` so templates can import it from `@aura3d/engine`.
  - For today's default heroes (E9b), read by path from `templates/fighting-game/src/aura-assets.ts`, the map is explicit about stand-ins:
    - player `showcaseWalkAnimatedGirl`: every state → `"Take 001"`, with `standIn: true` on all but `walk`;
    - rival `showcaseRunnerRobot`: idle → `IDLE`, walk → `WALK`, dash → `RUN`, the rest → `IDLE` with `standIn: true`.
  - A mapped clip that is absent from the asset throws `FIGHTER_CLIP_MISSING` with the list. Each stand-in emits one `FIGHTER_CLIP_STAND_IN` warning.
  - Unit `tests/qr/prd06/unit/fighting-clipmap.test.ts`: every state resolves to a GLB clip with duration > 0; the stand-in count equals the declared count; unmapped states fail. Browser: each mapped clip played on the hero reports `tracksApplied > 0`.
  - Q-13-1 asks PRD 13 to delete the `tracks: []`/`poseBakedFallback: true` clips, adopt the map and `validateClipMap`, wire `main.ts:190-197`/`:430-445` through it, list stand-ins in the HUD readiness panel, and add `tests/templates/fighting-game.test.ts`.
- [ ] **T0.9b** (integrated; follows Q-05-2 and Q-13-1) When the assets lane admits a fighter pair with a real combat set (idle, walk, jump, dash, guard, light, heavy, special, hitstun), the fixture map is re-pointed at it and must report 0 stand-ins; PRD 13 swaps the template defaults. Evaluated at the next checkpoint after both land.
- [ ] **T0.10a** (prerequisite, E39; day 0) `packages/rendering/src/Texture.ts` (06). Implement `revision` and `update(data, region?)` (§7.3; declared in PR 0a by C-18). `update` stores a reference with no clone, bumps `revision`, and throws for compressed formats. Existing constructor cloning (`:85`) is unchanged.
  - `packages/rendering/src/webgl2/TextureUpload.ts` (06, PR 0b-2 carve of the `WebGL2Device` texture path): allocate once with `texStorage2D`. When `texture.revision` differs from the last uploaded revision, re-upload with `texSubImage2D` (whole texture or region). Until 0b-2 merges, write `uploadTextureRevision(gl, texture, state)` in a new 06 module and call it from the carve after the merge.
  - `LeanWebGL2Device.ts` (15) and `WebGPUDevice.ts` (11, `queue.writeTexture` on revision change) are requests Q-15-2 and Q-11-3. Until they land those backends re-upload the whole texture on revision change (the C-18 stub semantics), which is correct but slower.
  - Unit `tests/unit/rendering/texture-update.test.ts` with the mock GL: 100 updates → 1 `texStorage2D`, 100 `texSubImage2D`, 0 `texImage2D`, and 0 new `WebGLTexture`s.
- [ ] **T0.10** `packages/rendering/src/forward/Deform.ts` (06, PR 0b-2 carve of `ForwardPass.ts:1942-2036` and `:382-452`). Move `applySkinningUniforms` into `packages/rendering/src/SkinningUniforms.ts` (shared with the depth feature's `bindUniforms`, T0.13). Replace `createSkinningPaletteTexture` with `SkinningPaletteTextureCache` (new `packages/rendering/src/SkinningPaletteTextureCache.ts`, implementing C-18 `SkinningPaletteTextureCacheLike`; the class itself is written on day 0). Flag-off keeps the verbatim carved code path.
  - Key by `skinning.paletteKey` (T0.11), create the texture once per key, and call `texture.update(matrices)` at most once per key per frame (§9.2 frame id).
  - Cache the zero-filled `Float32Array(96*16)` for the still-declared legacy uniform array (`ForwardPass.ts:1994` today) and the `Sampler`/`TextureBinding` per key, instead of allocating them per draw (E21). Skip the full-palette `isFiniteArrayLike` scan (`:1966`) after the first frame per key unless the runtime marks the palette dirty from a non-finite source.
  - `release(key)` calls `texture.dispose()`. The `dispose` hook of the `prd06.animation` TypedGLBActor extension (`actor/TypedGLBActorAnimation.ts`) releases the actor's keys.
  - `SkinningPaletteUploadManager.diagnostics()` adds `texturesCreatedThisFrame`.
  - Unit `tests/unit/rendering/skinning-palette-cache.test.ts` with a mock device: 100 frames × 2 skins of 191 joints → 2 textures created in total, and 0 live textures after release. C-18 conformance (key stability; no allocation on second upload) passes on `real`.
  - Browser `animated-character-browser.spec.ts` (flag-on case; lane-owned spec copy in `tests/qr/prd06/browser/` if the original is not lane 06's): `texturesCreatedThisFrame === 0` after frame 10, and the `WebGL2Device` live texture count returns to its pre-load value after dispose.
- [ ] **T0.11** `packages/assets/src/GLTFAnimationRuntime.ts:1263-1293` `refreshSkinningPalettes` (06; day 0).
  - Allocate one `Float32Array(joints*16)` per skinning binding at bind time and write into it in place (replaces `:1270`).
  - Write `binding.renderable.skinning = { jointCount, matrices, paletteKey: binding }`, where `binding` is the stable per-skin entry of `this.skinningBindings` (E40).
  - Also replace the per-joint `multiplyMat4` allocations with in-place multiplies into scratch matrices.
  - `TypedGLBActor.collectRenderItems` (`TypedGLBActor.ts:302`, owner 04) already forwards `renderable.skinning` with a spread and needs no edit; `paletteKey` travels with it.
  - Unit: across 10 frames `paletteKey` and `matrices` keep the same identity, and two actors of the same asset have different keys.
- [ ] **T0.12** `packages/rendering/src/shaders/deform/{skinning,morph,deform}.glsl.ts` (06; day 0). Write the C-18 chunks `a3d_prd06_skinning_common`, `a3d_prd06_morph_texture`, `a3d_prd06_deform` (§8.1-§8.3) and register them, replacing the PR 0a passthrough registrations, from `packages/rendering/src/lanes/prd06.ts` when `A3D_QR_ANIMATION` is on. Register `prd06.deform` as a C-02 `ShaderFeature` (`select`, `defines`, `bindUniforms`, hook `vertex:deform`). `ShaderLibraryCore.ts`/`ShaderChunks.ts` are not edited.
  - Unit `tests/unit/rendering/deform-feature.test.ts`: `select()` returns `undefined` for rigid items and `skin4`/`skin8`/`skin4|morph8` style keys otherwise; `defines()` contains `A3D_SKINNING=4` iff `skin4`; the number of distinct values over the Soldier, CesiumMan, Fox and Aura Clash rigs is ≤ 6; `computeProgramKey` changes when the feature value changes (C-02 conformance).
  - Browser `tests/browser/contracts/C-02-chunks.spec.ts` (PRD 15-owned) compiles every registered chunk in ChunkHarness on macos-14.
- [ ] **T0.13** Depth feature (06; wired after PR 0b-2). In `shaders/deform/depthFeature.ts`, define `prd06DeformDepthFeature: DepthVariantFeature` (passes `depth`, `distance`, `velocity`; defines `A3D_DEPTH_ONLY` for depth/distance) and register it through C-11 `registerDepthVariantFeature` under `A3D_QR_ANIMATION_SKINNED_SHADOWS`. Its `bindUniforms` calls the shared `SkinningUniforms.bindBoneTexture(set, cache, item)`, which binds the texture this frame's forward bind already uploaded (no second upload). Register `prd06SkinnedBounds` through `registerSkinnedBoundsProvider`.
  - `DepthPass.ts` (owner 02) is not edited; its consumption of registered features is C-11 real (Q-02-1).
  - Unit: with the C-11 stub, the registered feature appears in the registry and `ShadowCasterVariantKey.features["prd06.deform"]` once the lighting lane's real `resolveShadowCasterVariant` runs (asserted in the lane's impl test against a fake resolver); `bindUniforms` on a 65-joint and a 191-joint item sets `u_boneTexture` from the cache and allocates nothing.
- [ ] **T0.14** Browser test `tests/qr/prd06/browser/deform-light-view.spec.ts` with harness `tests/qr/prd06/browser/deform-light-view-harness.{ts,html}` (06; no other lane's files):
  - CesiumMan (`fixtures/three-compat/assets/corpus/cesium-man.glb`) posed with clip 0 at t = 0.5 s. One directional light at elevation 50°, azimuth 30°, orthographic light camera, 2048² R32F target.
  - Build a depth `ShaderModule` from ChunkHarness + `a3d_prd06_deform` with `A3D_DEPTH_ONLY`, draw the posed rig with `WebGL2Device` directly, and threshold the depth target into a silhouette mask. Reference: the same rig CPU-skinned (`GLTFAnimationRuntime` palette applied on the CPU) and rasterised with the rigid depth shader.
  - Assert IoU(GPU mask, CPU mask) ≥ 0.98. Failing control: the raw `a_position` mask (today's `registerLeanDepthShader` behaviour) must give IoU < 0.8 for this pose, else the test is non-discriminating and fails.
  - Also render the scene-08 CesiumMan bind pose both ways and attach the masks, to resolve the §2 benchmark-08 hypothesis (raw caster vs shadow strength).
  - The on-screen shadow-shape comparison against three r185 (luma(on) < 0.9 × luma(off) mask, IoU ≥ 0.85, area ≥ 0.8× three) is kept as `tests/qr/prd06/browser/skinned-shadow-onscreen.spec.ts`; it runs in the lane workflow and at checkpoints, reports its value, and gates only integrated acceptance (§17.1) because it needs C-11 real.
- [x] **T0.15** Lane scene `prd06-skinned-character-posed` (ex-`08b`) in `benchmarks/quality-rebuild/scenes/prd06/skinnedCharacterPosed.ts` with adapters in `aura3d/scenes/prd06/` and `three/scenes/prd06/` (06): CesiumMan, clip index 0 at t = 0.75 s, same lights and camera as `08-skinned-character` (`benchmarks/quality-rebuild/shared/scenes.ts:174`, read-only). `owner: "prd06"`, `qrFlags: ["animation"]`, masks `shadow-receiver`, `silhouette-edge`, primary region `shadow-receiver`.
  - Unit: C-30 conformance (unique id, owner prefix, both adapters). Capture via `quality-rebuild-capture.yml` dispatched by the lane workflow; the vision review is §17.1 (integrated).
- [ ] **T0.16** Skill content for `packages/create-aura3d/skills/aura3d-character-animation/SKILL.md:51-74` (PRD 13's file; Q-13-2). PRD 06 delivers, in its own files:
  - C-40 rows F-06-01..05 (appended to CONTRACTS Appendix B in the PR that verifies each): (01) "with `A3D_QR_ANIMATION`, `bindRuntimeNode(hero, { defaultClipId })` drives GLB clips; never pass `applyPose`"; (02) "map actions to the asset's real clip names from `assets.hero.metadata.animations`; run `aura3d animation inspect-clips` first"; (03) "`createAuraApp(..., { animation: { strict: true } })` throws on empty poses and unknown clips"; (04) "`animationState().tracksApplied > 0` is a precondition, not proof of quality"; (05) "no `poseBakedFallback` / `tracks: []` clips".
  - A reference snippet `tests/qr/prd06/fixtures/skill-snippet.ts` plus test `tests/qr/prd06/unit/character-animation-skill-snippet.test.ts`: type-check it against `@aura3d/engine` public types with a fixture `assets.hero` whose clips are `["Idle","Walk","Run"]`, assert every clip name it passes exists, and assert it contains no `poseBakedFallback` and no `applyPose`. Q-13-2 asks PRD 13 to embed the snippet and run the same assertion on the skill file.
- [ ] **T0.17** Gallery-shift verification, no route edit (`apps/showcase-gallery-shift/src/main.ts:1145-1177` is PRD 14's). The engine fix alone makes the thief and guard-2 controllers drive clips with the flag on. The `sin(frameCount/34)` at `:1371` is a flashlight sweep, a gameplay sight-line cue, not body sway (E32), and is out of scope.
  - Browser `tests/qr/prd06/browser/gallery-shift-thief-gait.spec.ts`: load the route with `?a3d-qr=animation` and assert the Phase 0 exit criteria (tracksApplied every frame, and sprint vs sneak hips-height or knee-flexion difference from `socket()` matrices). With `?a3d-qr=none` it must reproduce today's freeze (failing control).
- [ ] **T0.18** Minimal `animationState()` and diagnostics (06; wired after PR 0b-1/0b-3). Implement the C-19 `animationState()` member in `app/actorAnimationHandle.ts`, returning the C-19 `AuraActorAnimationStateSnapshot` (`activeClip`, `tracksApplied`, `activeActions`, `timeScale`) from the actor's last apply result, collected in `actor/TypedGLBActorAnimation.ts` (carve of `TypedGLBActor.ts:357-390`). Register the C-31 `animation` section returning `AuraAnimationDiagnostics`. Per-bone samples (`bones?`) follow CCR-06-4; until then tests read bones through `socket(bone)`.
  - Unit: after `node.play("Walk")` and 2 frames, `tracksApplied > 0`, and `socket("Hips").worldMatrix()` changes between frames. C-19 browser conformance (`C-19-tracks-applied.spec.ts`) passes on `real`.
- [ ] **T0.19** App options (06 reads; 15 owns the file). `animation?: AuraCreateAppAnimationOptions` and `renderer.skinnedShadows`/`morph`/`skinnedPbr` are pre-declared by C-38 in PR 0a. Implement `resolvePrd06Options(ctx: SceneCompileContext, appOptions?: AuraCreateAppAnimationOptions)` in `compiler/animation.ts`: strict from options (after CCR-06-1) or `ctx.strict`; `defaults` from options or the flag (`"3.1"` on / `"3.0"` off); `mixer` from options or `A3D_QR_ANIMATION_POSE_MIXER`; tier from options or `ctx.quality.tier`. Add `diagnosticOnly.prd06.ts` entries for each C-19 field not yet wired and remove them as T0-T4 wire them, with option-coverage rows (C-36).
  - Type test `tests/unit/agent-api/animation-spec-types.test-d.ts` against the pre-declared types; unit for each resolution branch.

### Phase 1

- [ ] **T1.1** New `packages/animation/src/pose/PoseBuffer.ts` and `SkeletonBinding.ts`. Implement `createPoseBuffer`, `copyPose` and `bindSkeleton`.
  - `bindSkeleton` resolves joints by **node index** from the glTF skin (replacing `nodesByName.get(jointName)?.[0]` at `GLTFAnimationRuntime.ts:1275`).
  - Unit: a rig with duplicate bone names binds both correctly.
- [ ] **T1.2** New `packages/animation/src/pose/CompiledClip.ts`. Implement `compileClip`:
  - flat `Float32Array` times and values;
  - per-track cursor cache in a `Uint32Array` on the action, so sampling is O(1) amortised with binary search on jumps;
  - LINEAR, STEP and CUBICSPLINE, with quaternion cubic normalised directly (no `slerpQuat(identity,q,1)` trick, `AnimationTrack.ts:139-158`).
  - Unit: equality to `AnimationTrack.sample` within 1e-6 over 1000 random times; µ-benchmark ≤ 25 µs (§13).
- [ ] **T1.3** New `packages/animation/src/pose/PoseMixer.ts`. Implement §6.4 base blend with rest (`out = lerp(rest, avg, min(1, Σw))`), override and additive layers, `BoneMask` weights, fades, `crossFadeTo` with warp, `syncWith`/`syncGroup`, `setEffectiveTimeScale`, and loop modes.
  - Events go through `AnimationClipEvents.ts` (no new event system).
  - Unit `tests/unit/animation/pose-mixer-three-parity.test.ts`: build three r185 `AnimationMixer` on the same clips from `three@0.185.1` and compare bone local TRS within 1e-4 for the cases in Phase 1 exit criteria.
- [ ] **T1.4** `packages/animation/src/pose/makeClipAdditive.ts`. Subtract the reference pose (default frame 0 of the clip; or `{clip,time}`) per track: `delta = inverse(ref) * sample` for rotations, and `sample − ref` for translations **and scales**. The subtraction for scales matches three r185 `AnimationUtils.makeClipAdditive`, which subtracts every non-quaternion track, and `PropertyMixer._lerpAdditive`, which adds it back (§6.4).
  - Unit: parity with three `AnimationUtils.makeClipAdditive` within 1e-5.
- [ ] **T1.5** `packages/animation/src/pose/BoneMask.ts` `createBoneMask`. Support exact names, `{bone, descendants}`, `{humanoid}` via `HumanoidBoneInference.ts`, presets (`upper-body` = Spine and descendants, excluding legs; `lower-body` = Hips + legs), and a `weights` falloff.
  - Unit on the Soldier rig: the upper-body mask includes the arms and excludes `LeftUpLeg`.
- [ ] **T1.6** `packages/animation/src/pose/PoseInertializer.ts`. Implement `transition()`, which captures per-bone offset and velocity from the last two output poses, and `apply()`, which decays with `inertializedQuat`/`inertializedVec3` (`Inertialization.ts:71,117`).
  - Unit: the per-bone angular velocity at transition is continuous (difference ≤ 5% of pre-transition velocity).
- [ ] **T1.7** `packages/assets/src/GLTFAnimationRuntime.ts:718-767` `applyClips`. Re-implement on a per-runtime `PoseMixer` evaluation with explicit sample times (stateless mode), and write the PoseBuffer to scene nodes in `applySampledTargets` order.
  - Material and light pointer tracks keep the existing path.
  - Unit: the existing `packages/assets/tests/assets.test.ts` animation cases are unchanged except for the two documented semantic changes (rest blend, rest reset), which get new expectations.
- [ ] **T1.8** `GLTFAnimationRuntime.ts:110-136` `resolveGLTFClipName`. Add `options?: { fallback?: "error" | "first" }`. Default: `"error"` → `undefined` when `defaults` resolves to `"3.1"` (flag on), `"first"` otherwise, so flag-off callers see today's `available[0]` (`:135`).
  - Update the clip-resolution call in `compiler/animation.ts` (carved ex-`index.ts:15079-15083`) to warn `ANIMATION_CLIP_NOT_FOUND` with the available names and record a C-36 `clip-apply-failed` degradation.
  - Unit: `"idle-ready"` against `["Take 001"]` → `undefined` + warning; with `fallback:"first"` → `"Take 001"`; flag-off → `"Take 001"`.
- [ ] **T1.9** `compiler/animation.ts` (06; carved `ProductionRuntimeActorEntry` animation fields, ex-`index.ts:12552`). Add `mixer: PoseMixer` and `baseAction` to the entry's animation state.
  - `applyProductionActorAnimation`: when `node.animation.clip` changes, `crossFadeTo(new, crossFade ?? 0.2, { warp })`, and honour `speed` via `setEffectiveTimeScale`. Per-actor dt is `dt * app.time.scale * handle.timeScale` (C-23; stub `timeScale` field defaults to 1).
  - `restPoseReset` defaults to true under 3.1.
  - Stop using `resolveAnimationSeconds` (carved ex-`:15461-15477`) for skinned clips under 3.1. Keep it for model-transform clips and for flag-off.
  - Unit: switching Idle→Walk yields two-clip evaluation for 0.2 s; `speed: 0.5` halves the advance; `handle.timeScale = 0` freezes the pose (C-23 hit-stop); flag-off reproduces today's `playClip` call sequence exactly.
- [ ] **T1.10** C-19 members on the handle (06 implementation; types are pre-declared by PR 0a, so no `index.ts` edit). Implement `crossFadeTo`, `playLayer`, `stopLayer` and the full `animationState()` snapshot (active actions with weight/time/layer, `timeScale`) in `app/actorAnimationHandle.ts`, attached by `registerNodeHandleExtension({ member: "animation", owner: "prd06", flag: "A3D_QR_ANIMATION", appliesTo: ["model"] })`. Wire the C-19 `AuraAnimationSpec` fields (§7.1) in `compiler/animation.ts` and remove their `diagnosticOnly.prd06.ts` entries.
  - Type test `tests/unit/agent-api/animation-spec-types.test-d.ts`; C-19 unit conformance (timeScale composition; fallback semantics) on `real`; C-37 conformance (members present on every model handle with flags off = stub members).
- [ ] **T1.11** `packages/animation/src/AnimationMixer.ts:364-425` (06). With `A3D_QR_ANIMATION_POSE_MIXER` on, route `blendBase`/`additiveContribution` through `PoseMixer`; with it off, keep them (deleted at flag removal).
  - Keep the public API.
  - `packages/animation/src/AnimationController.ts:662-700` `blendStates`: when every weighted state's clip is a `CompiledClip`, delegate to `PoseMixer.evaluate`. Otherwise keep today's path and warn once that it renormalises (E38).
  - Existing `tests/unit/animation/*` keep their flag-off expectations; flag-on cases are added where they asserted renormalisation (each cites the three r185 value).
- [ ] **T1.12** Bone-texture-only skinning on the generated path (06). `a3d_prd06_skinning_common` (T0.12) has no `u_jointMatrices`/`u_jointPaletteMode`; `SkinningUniforms.bindBoneTexture` always binds the cached bone texture for programs that include it. The legacy `skinning_common` (`ShaderChunks.ts:516-573`, owner 01, frozen) and its uniform-array upload in `forward/Deform.ts` stay as the flag-off and `A3D_QR_CORE=off` path; their deletion is Q-01-1.
  - WebGPU still consumes `u_jointMatrices` until Q-11-1; `SkinningUniforms` keeps setting it **only** when `device.backend === "webgpu"`.
  - Unit: a 65-joint and a 191-joint palette both bind via texture for a program that includes `a3d_prd06_skinning_common`; the legacy program still receives `u_jointMatrices` for ≤ 96 joints.
  - Browser: the lane deform harness renders the 191-joint rig with the bone-texture chunk; `animated-character-browser.spec.ts` and `skinning-over-cap.spec.ts` keep passing flag-off and flag-on.
- [ ] **T1.13** New `tools/codemods/animation-3.1.mjs` (06) exporting a pure C-39 `AuraCodemod` (`transform(source, fileName) → { code, rows }`), registered as `animation-3.1` from `packages/aura3d-cli/src/commands/prd06/index.ts`; run as `aura3d codemod animation-3.1 <glob> [--report|--write|--dry-run]`. The root alias script is Q-15-3.
  - Inputs: `apps/*/src/**/*.ts`, `packages/create-aura3d/templates/*/src/**/*.ts`, `examples/**/*.ts`. For each, the sibling `aura-assets.ts` supplies the asset's `metadata.animations`.
  - Reports: (a) `.animate({ clip })` / `node.play(clip)` / `resolveGLTFClipName(clip, …)` whose clip does not match exactly; (b) every `speed:` in an animation spec; (c) `bindRuntimeNode(…, { applyPose: … })`.
  - Unit `tests/unit/tools/animation-codemod.test.ts` with fixture projects: it must flag `apps/world-war-x-showcase/src/WorldWarXApp.ts:1071` (`"idle-ready"`, `speed: 0.44`); C-39 codemod purity conformance passes. PRD 06 runs only `--report` on files it does not own; the report JSON is attached to Q-13-4 and Q-14-7.
- [ ] **T1.14** Lane scene `prd06-crossfade-filmstrip` in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd06/` (06): Soldier Idle → Walk → Run crossfades at t = 0.5/1.5 s, 0.25 s fades, 8 frames at fixed times, on both sides (three uses `crossFadeTo(…, 0.25, true)`), `strip: { frames: 8, … }` (C-30). The Aura side also emits per-frame bone rotations for the §17.3 continuity and foot-slide metrics, computed by `packages/animation/src/pose/MotionMetrics.ts` (new; not built on `MotionQuality.ts`, E42).
- [ ] **T1.15** Delete `packages/animation/src/CrowdAnimation.ts` (no consumers per research/09 §5) or move it to `experimental/`. Its re-export from `packages/animation/src/index.ts` is 06-owned; any re-export from `@aura3d/engine` barrels (15) stays until a request removes it.
  - Check: `rg CrowdAnimation packages apps` → only the export removal and any listed barrel re-export.

### Phase 2

- [ ] **T2.0** (prerequisite, E39) `Texture` `dimension: "2d-array"` with `layers` (`Texture.ts`, 06; types pre-declared by C-18). `webgl2/TextureUpload.ts` (06) allocates with `texStorage3D(TEXTURE_2D_ARRAY)`, uploads with `texSubImage3D`, and binds to `sampler2DArray` uniforms. Uniform reflection of `sampler2DArray` lives in the core device (01): if it does not already recognise the type, file legacy patch request Q-01-3 and, meanwhile, bind by explicit uniform name from the feature's `bindUniforms`. WebGPU (`depthOrArrayLayers`) is Q-11-3.
  - Unit with the mock GL: a 3-layer RGBA16F array → one `texStorage3D` and 3 layer uploads. Browser (lane harness): one `texelFetch` from layer 2 returns the uploaded value (WebKit included, §18).
- [ ] **T2.1** `packages/rendering/src/resources/MorphTargetTexture.ts` (06, new) implements C-18 `buildMorphTargetTexture(geometry, targets, limits, "rgba16f")` using the packing plan in `MorphTargetPlan.ts` (06). It packs the §8.2 layout and returns `{ fallback: "cpu", reason }` when `targets > limits.maxArrayLayers` or width × height > `limits.maxTextureSize²`. Provided through the C-18 slot under `A3D_QR_ANIMATION_GPU_MORPH`.
  - Unit: 20k verts × 52 targets → 1 array texture, ≈ 16.6 MB at stride 2; C-18 conformance on `real`.
- [ ] **T2.2** `shaders/deform/{morph,deform}.glsl.ts` (06): finish `a3d_prd06_morph_texture` (§8.2) and the morph half of `a3dDeform`/`a3dDeformPrevious` (§8.3); `prd06.deform.select()` adds the morph bucket and `bindUniforms` binds the array texture + active list (top-K by |w|, K from the C-27 tier).
  - `forward/Deform.ts` (06): when the item's program comes from the generator (C-02 real), skip the legacy morph dispatch (`ForwardPass.ts:312-313` today, carved) and draw `item.geometry` unchanged; with the legacy program, keep the CPU path (T2.3). `applyGpuMorphUniforms` (carved ex-`:1855-1940`) stays as the legacy flag-off path until Q-01-1.
  - Browser (lane deform harness): lit + skinned + morph item, GPU result equals CPU reference within 1e-3 for 52 targets (C-18 browser conformance on `real`).
  - Unit (anti-divergence, research/09 rec 1): only `shaders/deform/*` define skinning or morph math among registered chunks (`rg "a3dSkin|a3dApplyMorph" packages/rendering/src/shaders packages/rendering/src/program` matches only `shaders/deform/`); `prd06.deform` is the single feature registered at `vertex:deform` for forward, depth and velocity.
- [ ] **T2.3** CPU fallback in `resolveRenderGeometry` (`forward/Deform.ts`, carved ex-`ForwardPass.ts:343-349`). With `A3D_QR_ANIMATION` on, write into one persistent dynamic vertex buffer per item (`bufferSubData`), not `new Geometry` + `dispose`.
  - Unit: 100 frames → 1 buffer and 0 `Geometry` constructions per frame (constructor spy) on a lit + skinned + morph item rendered by the legacy program.
- [ ] **T2.4** Unified skinned PBR (integrated; no edit to `ShaderLibrary.ts` or `SkinnedLitMaterial.ts`). The generator splices `prd06.deform` into PBR programs for skinned items (Q-01-2); Q-04-1 maps `SkinnedLitMaterial` options; fork deletion is Q-01-1.
  - PRD 06 adds `tests/qr/prd06/browser/skinned-pbr-parity.spec.ts`: with `A3D_QR_CORE=v2` + `A3D_QR_ANIMATION`, the Soldier in bind pose rendered through `prd06.deform` equals the same mesh as a static PBR item within ΔE2000 ≤ 2 on 99% of pixels. It runs in the lane workflow and reports; it gates only integrated acceptance until the generator is real, then becomes standalone for regressions.
  - `rg "SkinnedLitMaterial|MorphUnlitMaterial" apps/<game>/src` lists routes whose output changes when the generator is on; the list is attached to Q-14-6.
- [ ] **T2.5** Velocity inputs (§8.5; 06).
  - `SkinningPaletteTextureCache.swap()` once per presented frame, from the actor extension, after all passes.
  - `actor/TypedGLBActorAnimation.ts` `collectRenderItems` sets `previousJointTexture` (cache `previous`) and `previousMorphWeights` on skinned/morph items (C-14 fields, inert until the post lane's velocity pass is real).
  - `a3dDeformPrevious` (T0.12/T2.2) numerics: lane harness compares against the CPU previous-frame deformation within 1e-3.
  - `TemporalHistory.ts:73-74` admission is Q-03-1. `tests/qr/prd06/browser/taa-skinned-ghosting.spec.ts` (Soldier walking under TAA, ≤ 2 px trail per the Phase 2 integrated criterion) runs at checkpoints once C-14 is real.
- [ ] **T2.6** `renderer/SkinnedBounds.ts` (06, PR 0b-2 carve of `Renderer.ts:2295-2305`) `skinnedItemLocalBounds`. With the flag on, replace `computeSkinnedGeometryBounds` (`packages/rendering/src/SkinningBounds.ts`) with per-joint local AABBs. Compute them once per `Geometry` at first use from the vertices each joint influences with weight > 0.01, in bind space, and cache them in a `WeakMap<Geometry, Float32Array>` in `SkinningBounds.ts`. `bindSkeleton` has no vertex data, so the computation cannot live there. Per frame, transform each box's 8 corners by that joint's palette matrix and take the union. The per-frame cache key moves from `Geometry` to `paletteKey`, so two actors sharing a geometry stop evicting each other (E26). Register the same computation as the C-11 `SkinnedBoundsProvider`.
  - Unit: bounds contain all CPU-skinned vertices on 50 random poses of Soldier (conservative), and are ≤ 1.3× the volume of the exact bounds.
- [ ] **T2.7** WebGPU (06 parts; `WebGPUDevice.ts` binding is Q-11-1):
  - WGSL twins in `shaders/deform/*.wgsl.ts` (C-02 `ShaderChunk.wgsl`): storage-buffer bones sized to the rig, `prevBones`, morph `texture_2d_array`;
  - `WebGPUSkinningLimits.ts` (06): set the `decideSkinningPalettePath` default `maxDataTextureJoints` to `MAX_SKINNING_JOINTS`;
  - after Q-11-1 lands, delete the T1.12 WebGPU-only `u_jointMatrices` upload from `SkinningUniforms.ts`.
  - Unit: `decideSkinningPalettePath({ jointCount: 191 })` → GPU path, not `cpu`; WGSL twins pass `tools/wgsl-validate` (used read-only).
  - Browser on `native-webgpu-functional-301.yml` (dispatched, not edited): before Q-11-1, record the 191-joint character mask vs WebGL2 as E27 evidence; after it, IoU ≥ 0.98 (integrated).
- [ ] **T2.8** Shader warm-up (§9.7; 06). In `actor/TypedGLBActorAnimation.ts` `onLoad`, precompile forward + depth (+ velocity) programs for each skinned/morph item through C-02 `ProgramCacheLike.precompile` (generator real) or C-28 `device.compileAsync?.(shader)` (pre-declared; stub resolves after a synchronous compile), and keep the actor's render items out of `collectRenderItems` until every promise resolves. `RenderDevice.ts`/`WebGL2Device.ts`/`WebGPUDevice.ts` are not edited; real parallel compile is the GPU/tiers lane's C-28.
  - Unit: items are withheld until the precompile promise resolves; with the stub, at most one frame is withheld.
  - Browser: the first visible frame of Aura Clash (route read with `?a3d-qr=animation`) has no frame > 100 ms caused by program link (trace-based check in `tests/qr/prd06/browser/animation-resource-lifecycle.spec.ts`); this becomes meaningful once C-28 real lands and is reported before that.
- [ ] **T2.9** Lane scene `prd06-morph-face` (06): a licensed ARKit-52 head, with viseme weights at a fixed frame (≤ 32 non-zero targets, so High tier drops nothing), rendered on both sides with identical weights. Asset: the best licensed in-repo morph head (RobotExpressive face morphs as the standalone stand-in, flagged `admittedAsReference: false` until an ARKit-52 head is admitted via Q-05-2).

### Phase 3

- [ ] **T3.1** `packages/animation/src/IK.ts:26-61`. Add `solveTwoBoneIkRotations` (§7.2), which writes local rotations for root and mid with pole and twist handling.
  - Keep `solveTwoBoneIk` (positions) as a deprecated wrapper.
  - Unit: tip reaches the target within 1 mm when reachable; mid stays on the pole plane; no flip across 360° target sweep.
- [ ] **T3.2** `packages/animation/src/FootIk.ts` `createFootIkRig` (`:161`).
  - Consume `solveTwoBoneIkRotations`.
  - Replace the fixed `hipDropFactor` (default 0.72, `:166`) with pelvis offset = min of the per-foot ground deltas, clamped to `maxPelvisDrop`.
  - Add foot-normal alignment (≤ 35°).
  - Move the glTF runtime's foot-planting post-pass (`GLTFAnimationRuntime.ts` `setFootPlanting` `:593`, `applyFootPlanting` `:982`, called from `:1437`) onto PoseBuffer constraints.
  - The foot-surface diagnostic sampler (`:1228-1262`) stays as the measurement used by §17.3.
  - Unit: on a 20° slope, both feet penetration ≤ 1 cm and float ≤ 2 cm. Existing `tests/unit/animation/foot-ik-runtime.test.ts` and `foot-ik-walk-cycle.test.ts` keep passing.
- [ ] **T3.3** New `packages/animation/src/pose/LookAtConstraint.ts`. Distribute yaw and pitch across bones by weight, enforce limits, smooth with a critically-damped spring.
  - Unit: a target behind the character beyond the limit clamps to the limit, with no snap when crossing ±180°.
- [ ] **T3.4** New `packages/animation/src/pose/CcdIkConstraint.ts`. Implement CCD with cone limits, iterations ≤ 8 and tolerance 1 mm.
  - Unit: a 6-bone tail reaches a reachable target in ≤ 8 iterations.
- [ ] **T3.5** Constraints on the actor (06): `actor/TypedGLBActorAnimation.ts` evaluates the actor's `constraints` list after the mixer and before the palette build (inside the `prd06.animation` extension's per-frame update, not in `TypedGLBActor.ts`). Expose them as C-19 `node.animation.ik.add(spec)` / `clear()` with `AuraConstraintSpec` (CCR-06-4; until it merges the lane-exported `characterAnimation` binding and `@aura3d/animation/pose` APIs carry the typed specs).
  - Unit: the constraint order is respected; weight 0 equals the pure clip bitwise; `add` returns a disposer that removes exactly that constraint.
- [ ] **T3.6** `socket(bone)` (C-19, 06): return a live world matrix after constraints with `valid: true`, for VFX (C-19 consumer 07) and prop attachment. Unknown bone → `valid: false` plus `ANIMATION_SOCKET_UNKNOWN_BONE` warning once.
  - Unit: a socket follows the hand bone on the Soldier Walk; C-19 conformance passes on `real`.
- [ ] **T3.7** Root motion on the root path (§6.8; 06). Generalise the carved `playRootMotionClips` path in `compiler/animation.ts` (ex-`index.ts:15086-15114`, E41) to any `play(clip, { rootMotion })` with C-19 `AuraRootMotionSpec`: remove the delta from the pose, then `mode: "apply"` integrates into the node transform (or calls `consumer` after CCR-06-3) and `"extract-only"` only reports it.
  - Unit: a Walk with root motion moves the node by the clip's displacement per cycle ± 1 cm, and the pose hips XZ stays fixed.
- [ ] **T3.8** `bakeRetargetedClips` in `packages/animation/src/pose/Retarget.ts`, using `HumanoidRetargeting.ts` mapping.
  - `actor.animation.addClipsFrom(source)` bakes in a Worker (`packages/animation/src/pose/retarget.worker.ts`) and caches by `(engineVersion, sourceHash, targetHash)` in IndexedDB.
  - Unit: retarget Soldier Walk → CesiumMan has no NaN, and hips height scales by leg ratio.
  - Unit: the limb-flip detector (Phase 3 exit (a)/(b)) reports 0 flips over the full clip.
  - Human review of the rendered result (lane capture; §17.2 checklist items that apply).
- [ ] **T3.9** Lane scene `prd06-ik-slope` (06): Soldier Idle on a 20° ramp plus 18 cm stairs, foot IK on (Aura), with an analytic `GroundRaycaster` supplied by the scene (C-26 interface; the C-26 stub's plane ground is not used). three r185 has no foot IK, so its side uses `CCDIKSolver` (`three/addons/animation/CCDIKSolver.js`) on each leg toward the raycast ground point, as the closest public equivalent; the scene is `admittedAsReference: false`. Acceptance is the engine-reported metric (§17.0), not parity.

### Phase 4

- [ ] **T4.1** `packages/animation/src/SpringBones.ts:77`.
  - Add `bindSpringChainToSkeleton(chain, skeleton, boneNames)`, which initialises particles from bone world positions and writes local rotations aiming each bone at its simulated child after `step`.
  - Fixed-step accumulator at `substepHz`.
  - C-19 `node.animation.springBones.add(spec)` / `clear()`, evaluated in `actor/TypedGLBActorAnimation.ts` after constraints and before the palette build (no `TypedGLBActor.ts` edit).
  - Unit: a chain at rest under gravity 0 stays at rest pose within 1e-4; after a 1 m/s root stop, it settles below 1° oscillation within 0.6 s with the `"hair"` preset.
- [ ] **T4.2** `characterAnimation` in `packages/engine/src/agent-api/GameCharacterAnimation.ts` (06, new), exported from `packages/engine/src/lanes/prd06.ts`; the `game.characterAnimation` alias is Q-09-1. Implement §7.1:
  - 1-D/2-D blend tree in one sync group;
  - airborne states, landing blend and actions on masked layers;
  - foot IK and look-at;
  - per-actor dt through C-23 (`app.time.scale * handle.timeScale`).
  - Unit with a scripted controller speed ramp 0 → 5 m/s: weights match the blend-tree spec and the walk/run phase stays aligned (sync error ≤ 1%).
- [ ] **T4.3** `character-controller` upgrade content (template is PRD 13's; Q-13-3). PRD 06 delivers, in lane files, the replacement for `templates/character-controller/src/main.ts:28,59,88`:
  - a reference module `benchmarks/quality-rebuild/aura3d/scenes/prd06/characterHero.ts` that replaces `.animate({ clip: "Take 001" })` and the HUD-only `createLocomotionKit` weights with `characterAnimation(controller, hero, {...})`;
  - the clip map and validator profile (`template-hero`, T4.6) the template must pass;
  - test `tests/qr/prd06/unit/character-controller-binding.test.ts`: required clips exist on the lane hero, and blend weights reach the actor (`animationState().activeActions.length ≥ 2` during the speed ramp).
  - Q-13-3 asks PRD 13 to apply it to the template, swap the 1-clip hero `showcaseWalkAnimatedGirl` (`templates/character-controller/src/aura-assets.ts:12`) for a C-17-admitted hero (Q-05-2), and add the template test.
- [ ] **T4.4** Lane scene `prd06-character-hero` (06) in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd06/`, the reference for the new `character-hero` template (PRD 13, Q-13-3):
  - hero (§6.9 asset rule) + whatever lighting C-10 provides + a scripted follow camera (C-22 rig when real);
  - ground with receive shadow, foot IK, look-at, one spring chain;
  - morph visemes driven by `VisemeController` on the hero's face morphs when the hero has them.

  Browser capture `tests/qr/prd06/browser/character-hero.spec.ts` runs the 8 s §17.2 sequence with the T4.8 burst and attaches it for review.
- [ ] **T4.5** `packages/engine/src/agent-api/VisemeController.ts:121-122` (06). Under `A3D_QR_ANIMATION`, the default example becomes morph visemes on a morph-capable hero. Keep `primitiveMouthVisemeExample` as a named fallback.
  - Unit: the default example references morph targets.
- [ ] **T4.6** `packages/aura3d-cli/src/animation-asset-validator.ts` (06). Today it only checks clip names against a clip map (`:26-60`), so it needs geometry input. Extend `AnimationAssetValidationOptions` with `inspection?: { triangleCount; skinCount; jointCount; clips: { name; duration }[]; hasBaseColorTexture }`, filled by a lane-owned GLB reader in `packages/aura3d-cli/src/commands/prd06/validateHero.ts` (which reuses `inspectAnimationClips`, T0.7, and needs nothing from CLI `index.ts`), exposed as `aura3d animation validate-hero <glb> [--profile hero-character|template-hero]` (C-39). Add profiles:
  - `hero-character` (floor for any player character in a game). Reject when the asset has:
    - fewer than 2,000 triangles (`HERO_NOT_A_CHARACTER`);
    - no skin (`HERO_NO_SKIN`);
    - fewer than 30 joints (`HERO_TOO_FEW_JOINTS`);
    - any required action (idle, walk, run, jump-start, jump-loop, land) unmapped or missing (`HERO_MISSING_CLIP`);
    - any mapped clip with `duration` < 0.2 s (`HERO_CLIP_TOO_SHORT`);
    - no baseColor texture (`HERO_UNTEXTURED`).
  - `template-hero` (the §6.9 bar). `hero-character` plus ≥ 15,000 triangles, ≥ 50 joints, and the full §6.9 clip set.
  - Report all reason codes, not just the first.
  - Unit with `apps/showcase-skyline-runner/generated/skylineArcticRunner.glb` (read-only; verified: 4 triangles, 0 skins, 0 animations) → rejected with exactly `HERO_NOT_A_CHARACTER`, `HERO_NO_SKIN`, `HERO_TOO_FEW_JOINTS` and `HERO_MISSING_CLIP`. With `fixtures/threejs-parity/assets/character/soldier.glb` → `HERO_MISSING_CLIP` only (it has Idle/Walk/Run/TPose). Wiring the profile into admission gates (C-17 `AssetQualityCheck`) is the assets lane's choice; the profile is published as fact F-06-06.
- [ ] **T4.7** `docs/rendering/skinning-and-morphs.md:37,56-65` (06). Remove "changed px" certification (the doc currently says both "No hero rig is certified yet" at `:37` and "Certified 2026-09-03" at `:56`) and replace it with §17.3 metrics. Doc lint test `tests/qr/prd06/unit/skinning-doc-lint.test.ts`: no "changed px" string used as a certification criterion.
- [ ] **T4.8** C-33 step plugin `tools/quality-rebuild-capture/steps/burst.mjs` (06): `{ "burst": { "frames": 150, "intervalMs": 33, "region": "character" | "full" } }`, implementing `CaptureStepPlugin` (`name: "burst"`, `owner: "prd06"`). It writes a JPEG sequence plus a per-frame `diagnostics().animation` JSON, read through `globalThis.__AURA3D_LIVE_APPS__` as `capture-games.mjs:371` already does. `capture-games.mjs` (12) is not edited: it loads `steps/*.mjs` after PR 0b-3. Adding burst steps to the six §17.4 games in `games.json` (14) is Q-14-8; meanwhile the lane workflow passes the step inline for lane runs.
  - Unit: C-33 conformance (unique plugin name). Smoke run on `aura-clash-showcase` dispatched by the lane through `quality-rebuild-capture.yml`: 150 frames and 150 diagnostic records.

### Phase 5: adoption support (route edits are PRD 14's)

PRD 06 does not edit `apps/showcase-*` or `apps/aura-clash-showcase/`. For each route it (a) writes a per-game spec in `tests/qr/prd06/games/<route>.spec.ts` that loads the route with `?a3d-qr=animation`, measures the §17.4 automated gates and fails on today's route where §17.4 requires (failing control), and (b) files the change list below as a Q-14 request with the codemod report and, where useful, a patch. The specs run in the lane workflow and at checkpoints; the §17.4 thresholds are integrated acceptance.

- [ ] **T5.1** Spec `aura-clash-showcase.spec.ts` + Q-14-1 for `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts`:
  - `:3071-3090`: blend attack/hurt/KO in over 0.06 s with `transition: "inertialize"` instead of snapping.
  - `:3173-3211` `syncFighterRoot`: delete `squash` non-uniform scale and the `sin` `idleSway`. Replace them with an additive breathing clip (authored or `makeClipAdditive` of `Idle_Loop` vs frame 0) on the upper-body mask.
  - Spring chain: bind it to spine/head or accessory bones (`fighterSecondaryMotion.ts`) instead of a root lean.
- [ ] **T5.2** Spec `rooftop-buckets.spec.ts` + Q-14-2 for `apps/showcase-rooftop-buckets/src/main.ts:502-536`:
  - mount the skinned `rooftopDefender`/`rooftopLayupScorer` (191 joints, per research/18 C10) as the visible athletes in normal play; today they are mounted only under `animationDebugCapture` and with `visible: false` (`:514`, `:530`);
  - delete the static raised-pose statues and the root sways: the shooter `Math.sin(elapsedPlayTime * 1.8) * 0.028` yaw (`:1118`) and the defender `warmupSway = Math.sin(elapsedPlayTime * 1.4 + 0.8) * 0.022` (`:1321`);
  - drive Ready/Shoot/Land/Contest through `node.play` with crossfades.
- [ ] **T5.3** Spec `skyline-runner.spec.ts` + Q-14-3 for `apps/showcase-skyline-runner/src/main.ts:3416-3525`: replace the 4-triangle card hero with a C-17-admitted rigged hero via `characterAnimation` bound to the existing `game.platformer` controller; delete the procedural bob/lean/squash and the `skinnedClipPlaybackProvenAtRoot` workaround evidence (`:3616-3621`).
- [ ] **T5.4** Spec `neon-swarm.spec.ts` + Q-14-4 for `apps/showcase-neon-swarm`: replace `neonCourierAvatar` (no skin) with a rigged hero with run/strafe/fire/dash on masked layers (research/20 neon-swarm rec 4); delete the `sin(t*9)*0.04` bob (`main.ts:1506`, per research/09).
- [ ] **T5.5** Spec `mech-hangar.spec.ts` + Q-14-5 for `apps/showcase-mech-hangar`: rig mechs (C-17 admission) or attach rigid parts to a skeleton with authored idle, walk, light, heavy, special, guard, hit-react and KO clips (research/20 mech-hangar rec 2); sync walk SFX to clip footstep events instead of the 0.42 s timer (`main.ts:1550-1554`, per research/09).
- [ ] **T5.6** Spec `gallery-shift.spec.ts` + Q-14-6 for `apps/showcase-gallery-shift`: replace the 72-triangle voxel thief with a rigged character matching one guard style (research/21 gallery-shift rec 5); make sprint and sneak distinct clips (or a 1-D blend with a crouch additive). Q-14-6 also carries the T2.4 list of routes using `SkinnedLitMaterial`/`MorphUnlitMaterial`.

## 16. Test requirements

All automated tests run remotely on GitHub Actions. Unit and conformance tests run via `.github/workflows/test.yml` and `qr-contracts.yml` (CONTRACTS §3.8; `pnpm typecheck:raw`, `pnpm lint`, `pnpm test:unit`, ownership check). Browser tests run on **macos-14** (Chrome with ANGLE Metal, WebKit, Firefox) via the lane workflow `.github/workflows/qr-prd06-animation-browser.yml` with `playwright.animation-matrix.config.ts` (T0.0); the existing `browser-matrix.yml` is ubuntu Chromium only and is not edited. WebGPU tests are dispatched on `native-webgpu-functional-301.yml` (macos-14). Lane-scene and route captures are dispatched on `quality-rebuild-capture.yml` with `qr_flags=animation` (and `none` for A/B). No local browser, build or Docker runs (policy). Every suite runs flag-on; suites that touch legacy behaviour also run flag-off to prove identity.

Unit (vitest; new files named in §15):
- **Contract conformance.** C-18 and C-19 unit and browser suites green on `stub` and `real`; lane impl tests `tests/unit/contracts/impl/prd06-*`.
- **three.js parity.** PoseMixer vs `three@0.185.1` AnimationMixer for single, weighted, crossfade, warp and additive cases on 4 rigs, within 1e-4 local TRS.
- **Sampling.** CompiledClip equals AnimationTrack within 1e-6. Cursor cache is correct across loop wrap and backwards seeks.
- **Masks.** Humanoid presets on Soldier, Fox (non-humanoid → `upper-body` resolves via hierarchy fallback, else error) and RobotExpressive.
- **Controller.** Embedded registry → clip drive, no empty pose, real durations after resolve. Fighting-game clip-map fixture resolves.
- **Renderer.**
  - `prd06.deform` `select`/`defines`/`bindUniforms` per item type; depth feature registered with C-11.
  - Palette cache creates 0 textures per frame after warm-up.
  - Morph texture packing and fallback reasons.
  - Joint-AABB conservativeness.
  - Velocity inputs (`previousJointTexture`, `previousMorphWeights`) set on skinned items.
- **IK/constraints/springs.** Per §15 thresholds.
- **Allocation.** A heap test using `--expose-gc` in a dedicated vitest project runs 600 frames of a 2-actor mixer + palette build, and the heap delta must be < 64 KB.

Browser (Playwright, macos-14, lane workflow; S = standalone gate, I = reported in lane CI, gated only at checkpoints):
- S `deform-light-view.spec.ts` (T0.14): GPU light-view silhouette IoU ≥ 0.98 vs CPU-skinned reference; raw-`a_position` failing control.
- I `skinned-shadow-onscreen.spec.ts` (T0.14): on-screen shadow-shape IoU ≥ 0.85 vs three r185 (needs C-11 real).
- S `gallery-shift-thief-gait.spec.ts` (T0.17): tracksApplied every frame; sprint vs sneak pose difference; flag-off failing control.
- I `taa-skinned-ghosting.spec.ts` (T2.5; needs C-14 real).
- S `animation-mixer-root-e3` flag-on case (lane copy if the original is not lane 06's): `node.play` crossfade has continuity C ≤ 1.5 (§17.3, from `socket()` bone samples), `speed: 0.5` halves clip advance within 2%, and an unknown clip emits `ANIMATION_CLIP_NOT_FOUND`.
- S `animated-character-browser.spec.ts` flag-on case: 191-joint rig renders through the cached bone texture, with `texturesCreatedThisFrame === 0` after frame 10.
- I `skinned-pbr-parity.spec.ts`: ΔE ≤ 2 on 99% of pixels (T2.4; needs C-02 real).
- S `character-hero.spec.ts` (T4.4): lane scene renders, the §17.2 motion gates pass, and its capture is attached for human motion review.
- S `animation-resource-lifecycle.spec.ts`: actor dispose releases palette and morph textures. WebGL exposes no GPU-memory query, so the counters are `SkinningPaletteTextureCache.diagnostics().bytes`, morph-texture bytes and `WebGL2Device` live texture count. All three return to their pre-load values exactly.
- S existing `threejs-parity-skinning-{blending,additive,ik}-parity.spec.ts`: flag-off unchanged; flag-on cases assert r185-parity semantics (§10).
- S C-18 and C-19 browser conformance (PRD 15-owned) on `real`.

Benchmarks (C-30 registry; captures dispatched on `quality-rebuild-capture.yml`): base scenes 08, 15, 18 (read-only, owner 12) and lane scenes `prd06-skinned-character-posed`, `prd06-crossfade-filmstrip`, `prd06-morph-face`, `prd06-ik-slope`, `prd06-character-hero` and `prd06-perf-tier-{low,medium,high,ultra}` on both engines. Output goes to `docs/project/aura3d-quality-rebuild/evidence/prd06/benchmark/<scene>-side-by-side.jpg` and `report.json`, with the region-masked metrics from PRD 12's tooling (C-30/C-31).

## 17. Acceptance: standalone and integrated

Two kinds of acceptance, per CONTRACTS §8:
- **Standalone acceptance (§17.0)** is provable by this lane alone, with today's renderer, its own flag, and stubs for everything else. It gates PRD 06 merges and the move of `A3D_QR_ANIMATION` to `standalone-accepted`. It is evidence of mechanism (motion, deformation, resources), never a claim of visual parity with three.js.
- **Integrated acceptance (§17.1, the vision half of §17.2, §17.4)** depends on other lanes' real implementations and is evaluated only at CONTRACTS §7 checkpoints with `qr_flags=all`. It never blocks a merge. It is the only route to `integrated-accepted` and to any visual claim.

The integrated judge has three parts:
1. The PRD 12 automated region metrics. These are necessary, not sufficient.
2. A vision model reviewing the side-by-side and game frames, with the same rubric as research/21 and research/23.
3. A human reviewer (owner or delegate) signing the per-scene checklist; at G-PANEL rounds, 2 humans + 1 vision model with the median of record (C-32).

A scene passes only when all three pass. The vision prompt must include the three.js reference image where one exists, and it must score both images. Conformance tests, engineering gates, metric thresholds and vision-only screening rounds never support a claim that Aura3D matches three.js (CONTRACTS §7 honesty rule).

### 17.0 Standalone acceptance (this lane alone; gates PRD 06 merges and `standalone-accepted`)

All on remote macos-14 CI, flag-on, with the flag-off sentinel identity check green (engineering evidence only;
numeric parity with three r185 here supports no claim of three.js-level visual quality, CONTRACTS §7):

| # | Criterion | Test / evidence | Contracts stubbed |
|---|---|---|---|
| S1 | No empty pose is ever stored; documented controller path drives GLB clips; real durations after resolve | T0.2-T0.6 units; gallery-shift thief + guard-2 `tracksApplied > 0` on 30 consecutive frames with `?a3d-qr=animation`, sprint vs sneak hips Δ ≥ 5 cm or knee Δ ≥ 15°; flag-off reproduces the freeze | C-19 (own), C-37, C-36 |
| S2 | Palette resources: 0 textures created per frame after frame 10 on a 191-joint rig; 0 leaked GL textures after dispose; `Texture.update` uses `texSubImage2D` only | T0.10, T0.10a, `animation-resource-lifecycle.spec.ts`; C-18 conformance `real` | C-18 (own), C-28 |
| S3 | Deformed light-view silhouette matches CPU-skinned reference, IoU ≥ 0.98; raw-position control < 0.8 | `deform-light-view.spec.ts` (T0.14) | C-11, C-02 |
| S4 | GPU deform equals CPU reference within 1e-3 (skin 4/8, morph 52 targets, previous-frame variant) | lane deform harness; C-18 browser conformance `real` | C-02 |
| S5 | PoseMixer three r185 parity within 1e-4 on 4 rigs for the six Phase 1 cases; `makeClipAdditive` within 1e-5 | `pose-mixer-three-parity.test.ts` | — |
| S6 | `prd06-crossfade-filmstrip`: continuity C ≤ 1.5 on each transition; foot slide ≤ 2 cm walk / ≤ 3 cm run; walk/run phase error ≤ 1% while both weighted; human "smooth, no foot skate" on the 8-frame strip | lane scene capture + MotionMetrics JSON | C-30, C-33 |
| S7 | `prd06-ik-slope`: penetration ≤ 1 cm, float ≤ 2 cm on 20° slope and 18 cm stairs | lane scene capture, engine-reported + depth readback | C-26 (test raycaster) |
| S8 | Retargeted locomotion on CesiumMan and `auraClashPlayerRig`: 0 automated limb flips; root-motion loop drift ≤ 1 cm/cycle | T3.8 units + lane capture; human review | — |
| S9 | `prd06-character-hero`: all §17.2 automated motion gates pass and the human motion checklist is signed | `character-hero.spec.ts` + T4.8 burst | C-10, C-11, C-22 (stubs) |
| S10 | Validator: `skylineArcticRunner.glb` rejected with exactly the four codes; Soldier → `HERO_MISSING_CLIP` only | T4.6 | — |
| S11 | Per-game specs (`tests/qr/prd06/games/`) run against today's routes and fail where §17.4 says they must (failing controls) | T5.1-T5.6 specs | C-33 |
| S12 | §13 CPU micro-budgets, 0 bytes/frame steady-state allocation, CPU tier budgets on the lane perf scenes; bundle ≤ +8 KB net | unit benchmarks, `prd06-perf-tier-*`, `pnpm check:bundle-size` | C-27, C-28 |
| S13 | Aura Clash `tracksApplied` identical with `?a3d-qr=none` and `?a3d-qr=animation` for every required clip key (no regression on the only working skinned game) | Phase 1 A/B | — |

### 17.1 Integrated acceptance: benchmark scenes (checkpoints only; never blocks; vs three.js r185 same input)

| Scene | Criterion | Automated threshold | Vision/human threshold | Today (research/22, /23) | Also needs (contracts) |
|---|---|---|---|---|---|
| 08 skinned-character | Character grounded by a full silhouette shadow | shadow-ROI luma drop ≥ 85% of three's (three: 118.2→96.7) | Aura score ≥ three − 0.5; no "shadow missing" difference listed | Aura shadow ROI 117.2 vs ground 116.6 (none); 3.5 vs 5 | C-11 real (depth features, strength) |
| `prd06-skinned-character-posed` | Shadow matches the posed silhouette (arms and legs readable) | shadow-shape mask IoU vs three ≥ 0.85 (T0.14 relative-luma mask) | "skinned shadow" not listed as a difference | n/a (new) | C-11 |
| 15 animation-skinning | Soldier stride and Fox legs readable in shadow | dark-shadow pixel count ≥ 85% of three's (three 25.4k vs Aura 12.8k today); fox shadow extent within ±10% of three's x-span | Aura ≥ three − 0.5; armor specular difference not "minor-aura3d-deficiency" | 4.5 vs 5.5 | C-11; C-02 + C-03 for armor |
| 18 game-scene | Hero shadow shows legs and torso | character shadow IoU ≥ 0.8 (the band artefact is the lighting lane's) | character-related differences absent | 3.5 vs 5 | C-11 |
| `prd06-crossfade-filmstrip` | Same as S6, plus vision | as S6 | Aura ≥ three − 0.5 on motion strip | n/a | — |
| `prd06-morph-face` | Visemes shaded with lighting (not flat) and correct normals | per-pixel ΔE2000 vs three ≤ 3 in face mask on 95%; `morph.droppedTargets == 0` | Aura ≥ three − 0.5 | n/a | C-02 (generator), admitted ARKit head (C-17) |
| `prd06-ik-slope` | Feet planted on slope and stairs | as S7 | human: "feet on ground" | n/a | — (reference approximate, not a parity claim) |
| `prd06-character-hero` | Hero vs matched three scene (§17.2) | §17.2 automated gates | §17.2 vision + human | n/a | C-02, C-09/C-10, C-11, C-22, C-17 hero |
| TAA on 15 | No limb ghosting | no connected trail > 2 px in the character mask (T2.5 method) | — | throws today (E25) | C-14 |
| WebGPU 191-joint | Same silhouette as WebGL2 | character-mask IoU ≥ 0.98 | — | most likely zero palette (E27) | C-29 + Q-11-1 |

Shadow rows for 08, 15 and 18 measure the combined result of this lane's depth feature and the lighting lane's shadow system. Leave-one-out (`all,-animation` vs `all,-lighting`) attributes the delta; a row passes only on the combined `all` run, and PRD 06 never reports a 06-only improvement as a pass.

### 17.2 Hero bar (`prd06-character-hero`; templates `character-hero` and upgraded `character-controller` by PRD 13)

- **Reference.** A matched three.js r185 scene built from the same hero GLB, the same HDRI and the same camera, as lane scene `prd06-character-hero` (C-30, owner prd06).
- **Vision categories** (research/21 rubric; **integrated**): `character_presentation` ≥ 6.5, `animation_quality` ≥ 6.5, `shadows` ≥ 6. Each must be within 0.5 of the three reference. Scored at G-PANEL checkpoints with lighting, materials, shadows and camera real.
- **Automated motion gates** (**standalone**, S9) on an 8 s scripted sequence (walk → run → stop → jump → land → idle), captured with the T4.8 burst (240 frames at 30 fps) plus per-frame `animationState()` and `socket()` samples:
  - foot slide ≤ 2 cm per walk contact and ≤ 3 cm per run contact;
  - continuity C ≤ 1.5 at every state change;
  - on stop, pelvis horizontal velocity reaches 0 within 0.4 s, and the hips bone shows a ≥ 2 cm settle (weight shift) rather than an instant freeze;
  - on landing, hips height dips ≥ 3 cm below standing within 0.15 s (landing compresses);
  - spring accessory settles < 1° within 0.6 s of stop;
  - head look-at error ≤ 5° for targets within limits;
  - no frame where ≥ 90% of bones equal the rest pose within 1e-3 (no T-pose or bind-pose frames).
- **Motion review** (**standalone**, S9). A human reviews the same 8 s capture against this checklist: no foot skate, visible weight shift on stop, landing compresses, accessory lags and settles, head tracks the look target, no T-pose or bind-pose frames. The human can fail a sequence that passes the automated gates. Automated gates alone cannot pass it. This review judges motion only, not look or parity.

### 17.3 Motion-quality metrics (automated; definitions)

All metrics are implemented once in `packages/animation/src/pose/MotionMetrics.ts` (T1.14). They sample at a fixed 60 Hz from engine bone data, not from screenshots.

- **Transition continuity C.** Over a transition window [t₀ − 0.1 s, t₀ + 0.3 s], take the max per-bone angular speed, over humanoid limb and spine bones only (fingers excluded). Divide it by the max per-bone angular speed of either clip played alone over the same phase range, with the denominator floored at 90°/s so idle-to-idle transitions cannot divide by ~0. Pass if C ≤ 1.5. Snapping attacks in today's Aura Clash are expected to fail this. That is a deliberate failing control, and the metric test asserts it fails on today's code.
- **Foot slide.** The world displacement of a foot bone while its contact flag is set. The flag is a clip footstep event, or foot height < 3 cm and foot speed < 0.1 m/s. Pass if ≤ 2 cm per contact phase for walk and ≤ 3 cm for run.
- **Shadow-silhouette agreement.** IoU between (a) the ground shadow mask from Aura and (b) the three reference, using the T0.14 relative-luma mask. For games, (b) is the mask from a CPU-skinned reference render of the same pose produced by the lane harness. The standalone variant (S3) compares light-view depth silhouettes instead of on-screen shadows.
- **Clip sampled.** `animationState().tracksApplied > 0` on every visible character. This is a precondition, not a quality signal.
- **Failing controls.** Each metric's unit test includes a known-bad input that must fail: a snapped transition for C, a root-translated in-place walk for foot slide, and a bind-pose shadow for IoU. A metric that cannot fail is a defect.

### 17.4 Integrated acceptance: games (checkpoints only; never blocks; macos-14 capture via `quality-rebuild-capture.yml`)

These rows are evaluated on PRD 14's routes after the route changes in Q-14-1..6 land and the route opts into `A3D_QR_ANIMATION`. The automated gates are also run on today's routes by the S11 specs, where they are expected to fail (failing controls). Character-presentation and shadow thresholds measure the combined result of several lanes (named per row) and are attributed by leave-one-out.

"Today" uses research/21 vision scores, which are authoritative for visual categories, with research/20 code-based scores in brackets where they differ. Every vision threshold below is strictly above today's score. Automated gates come from the T4.8 burst plus `animationState()`.

| Game | Today: animation_quality / character_presentation / shadows (research/21 [research/20]) | Automated gates | Vision thresholds (+ human sign-off) |
|---|---|---|---|
| aura-clash-showcase | 4 / 3 / 2; fighters "cast no shadows" | both fighters `tracksApplied > 0` every frame; attack/hurt/KO transitions C ≤ 1.5; `rg -n "squash\|idleSway" src/playable/AuraClashArenaApp.ts` → 0; fighter shadow IoU vs CPU-skinned reference ≥ 0.8 in the action frame | `animation_quality` ≥ 6, `shadows` ≥ 5 (with C-11 real), `character_presentation` ≥ 6 (with C-15 tint fix, C-22 framing) |
| showcase-gallery-shift | 3 (inferred) / 2 / 2; voxel thief, no gait difference | thief and both guards `tracksApplied > 0`; thief sprint vs sneak hips-height Δ ≥ 5 cm or knee Δ ≥ 15° (T0.17); after T5.6 the thief passes `hero-character` | `animation_quality` ≥ 5.5, `character_presentation` ≥ 5.5 |
| showcase-rooftop-buckets | 3 (inferred) / 5 / 2 [1.5 / 2.25]; visible athletes are static raised-pose statues, the skinned ones are hidden | skinned athletes are `visible` in normal play (no `?debug`); shooter pose differs between mid and action frames by ≥ 20° on the shooting arm; no root sway (`rg "Math.sin\(elapsedPlayTime" src/main.ts` hits only non-character nodes) | `animation_quality` ≥ 5.5, `character_presentation` ≥ 6 |
| showcase-skyline-runner | 3 (inferred) / 5 / 2 [1 / 1]; 4-triangle card hero, "worst single failure" (research/20) | hero passes `hero-character` (T4.6); run/jump/land clips play (`tracksApplied > 0`); foot slide ≤ 3 cm in run | `animation_quality` ≥ 5.5, `character_presentation` ≥ 6 |
| showcase-neon-swarm | 2 / 3 / 2 [1.25 / 1.75]; "identical static T-ish pose" | hero passes `hero-character`; upper-body fire layer and lower-body run active together (`activeActions` on 2 layers); `rg "elapsedSeconds \* 9" src/main.ts` → 0 | `animation_quality` ≥ 5 |
| showcase-mech-hangar | 3 (inferred) / 3.5 / 2 [0.75 / 2] | mechs `tracksApplied > 0`; walk SFX triggered by clip footstep events (the `walkCueCooldown = 0.42` timer at `main.ts:1553` removed); idle vs action pose Δ ≥ 15° on a limb bone | `animation_quality` ≥ 5, `character_presentation` ≥ 4.5 |

Each game review needs:
- the four standard frames (`desktop-1920x1080` 02-opening/03-mid/04-action, `mobile-390x844` 03-mid);
- a 150-frame (5 s at 30 fps) character burst from T4.8, plus its per-frame `diagnostics().animation` JSON;
- a vision-model score per category;
- human sign-off.

### 17.5 Per-game, per-template and per-demo impact

Every shipped surface is listed so that no consumer of the changed defaults is missed. "Default changes" means P0/P1 semantics change its output once `A3D_QR_ANIMATION` is on for it (route opt-in from `standalone-accepted`, or the default from `integrated-accepted`), even if nobody edits it. Edits to these surfaces are made by their owners (13 templates, 14 routes, 15 demos) through the named requests.

| Surface | Character content today | PRD 06 impact | Gate |
|---|---|---|---|
| aura-clash-showcase | 2 skinned fighters (`auraClashPlayerRig`/`RivalRig`), app-side frozen-pose blends | P0: depth feature registered (shadows appear when C-11 is real). P1: root-path defaults do not apply, because the app drives clips itself. Q-14-1 moves it onto the mixer | §17.4 |
| showcase-gallery-shift | voxel thief, skinned guards via the controller (freeze bug) | P0 fixes the freeze (default changes, no route edit). Q-14-6 replaces the thief | S1, §17.4 |
| showcase-rooftop-buckets | static statues; skinned athletes hidden | Q-14-2 | §17.4 |
| showcase-skyline-runner | 4-tri card | Q-14-3, after a C-17-admitted hero (Q-05-2) | §17.4 |
| showcase-neon-swarm | unskinned `neonCourierAvatar` (`main.ts:688`) | Q-14-4, after a C-17-admitted hero | §17.4 |
| showcase-mech-hangar | rigid mechs | Q-14-5, after a C-17-admitted rig | §17.4 |
| world-war-x-showcase | `.animate({ clip: "idle-ready", speed: 0.44 })` on clips that do not match (`WorldWarXApp.ts:1071`) | P1 default changes: speed honoured, clip-name miss warns and no-ops instead of playing the first clip. Q-14-7 applies the codemod before the route opts in | codemod report empty for this app; route-health capture unchanged or improved |
| orbital-defense, bank-shot, vault-breakers, pulse-tunnel, patrol-wing, courier-rush, turbo-drift-circuit, siege-golf, blockfall-reactor, aurora-lander, deep-recovery, gravity-post | no skinned characters (vehicles, ships, balls, a 2-D mascot sticker in blockfall) | none, except generated-path skinned PBR if any of them uses a `SkinnedLit`/`MorphUnlit` material (T2.4 list in Q-14-6). Rigid animation stays PRD 14/09 | capture A/B unchanged (±3% frame time) |
| template `fighting-game` | 9 `tracks: []` clips, 1-clip default hero | Q-13-1 (stand-ins declared, fixture T0.9a); T0.9b after Q-05-2 | PRD 13 template test |
| template `character-controller` | 1-clip hero, HUD-only locomotion weights | Q-13-3 (content T4.3) | PRD 13 template test + §17.2 |
| template `character-hero` (new) | n/a | Q-13-3 (reference scene T4.4) | §17.2 |
| template `mini-game`, `animation-studio`, `three-compat-character-viewer` | use `node.play`/`.animate` or the controller | default changes in P1 (crossfade, speed, strict names) when they opt in. Q-13-4 runs the codemod; `pnpm check:templates` must pass | PRD 13 template tests |
| demos `animation-walk`, `skinning-blending`, `skinning-additive`, `skinning-ik`, `skinning-morph` | three.js parity demos | P1 changes their flag-on output toward three r185. Their parity specs gain flag-on cases (§10) | parity specs |

## 18. Browser coverage

| Browser | Runner | Required for |
|---|---|---|
| Chromium (ANGLE Metal) | GH macos-14 (`qr-prd06-animation-browser.yml`, dispatched `quality-rebuild-capture.yml`) | all lane browser specs, lane scenes, game captures |
| WebKit (Playwright) | GH macos-14 (lane workflow) | `deform-light-view`, `animated-character-browser`, `skinned-pbr-parity`, `sampler2DArray` texelFetch (RGBA32F `texelFetch`, `sampler2DArray`) |
| Firefox | GH macos-14 (lane workflow) | correctness only: chunk compile + `deform-light-view` IoU |
| Chromium WebGPU | `native-webgpu-functional-301.yml` (dispatched) | WGSL twins (T2.7); >96-joint parity after Q-11-1 |
| Chromium ANGLE D3D11 | GH windows runner (requested from the GPU/tiers and bench lanes; not available today) | uniform/texture limits on Windows drivers; at minimum shader compile and one capture. Recorded as a coverage gap until a runner exists |

## 19. Mobile coverage

- The 390×844 viewport in `tools/quality-rebuild-capture` is layout coverage only. It runs on the same paravirtual Mac GPU and is not mobile GPU evidence.
- Real-device runs (iOS Safari 17+ on A15-class, Android Chrome on Adreno 6xx/Mali-G7x) are required before claiming Low/Medium budgets (§13).
  - The remote device-farm provider is chosen by the GPU/tiers and bench lanes. It is not available in the current harness. This is recorded as a blocker for Low-tier sign-off, not as a reason to skip, and it does not block standalone acceptance.
- Mobile-specific checks:
  - chunk link succeeds with the bone-texture path (the 96-joint uniform array was the risk, E22);
  - `MAX_ARRAY_TEXTURE_LAYERS` ≥ target count, else the CPU fallback is reported;
  - RGBA16F morph texture sampling;
  - hero-only skinned shadow casters on Low (C-27 tier);
  - CPU animation ≤ 1.0 ms with 1 hero + 4 NPCs.

## 20. Screenshots and evidence required

Store under `docs/project/aura3d-quality-rebuild/evidence/prd06/` (lane-owned):
1. Lane-scene side-by-sides `prd06-skinned-character-posed`, `prd06-crossfade-filmstrip` (8-frame strip), `prd06-morph-face`, `prd06-ik-slope`, `prd06-character-hero`, and the base scenes 08, 15, 18 as captured with `qr_flags=animation` and at checkpoints with `all`, plus `report.json` with region metrics and capability log entries `animation:*` and `skinned-shadow-caster` (research/22 harness notes).
2. Light-view silhouette masks (GPU | CPU | raw-position control) from T0.14, and a shadow-ROI crops image per shadow scene (Aura | three | diff) from checkpoints.
3. Per-game four frames + 5 s character burst + vision JSON + human checklist for the six games in §17.4, before (IC-0) and after (the checkpoint after each Q-14 lands).
4. Motion-metric JSON per scene and game: C, foot slide, shadow IoU, tracksApplied.
5. Perf JSON per tier scene: CPU anim ms, GPU delta ms, textures/geometries created per frame, palette and morph bytes.
6. The GH Actions run IDs for every artefact, and the `qrFlags` each ran with. Artefacts without a run ID are not accepted.

## 21. Completion criteria

**Standalone complete** (moves `A3D_QR_ANIMATION` to `standalone-accepted`; needs nothing from other lanes):
1. All §15 tasks owned by this lane are checked, with the named tests green on remote CI, flag-on and flag-off.
2. Every §17.0 row S1-S13 passes.
3. C-18 and C-19 conformance suites pass on `real` and `stub`.
4. All §12.3 requests and CCR-06-1..6 are filed with exact changes; their status is listed in the next checkpoint report.
5. Facts F-06-01..06 are appended to CONTRACTS Appendix B with evidence (test or run id) and status `verified`.
6. There is one animation authority behind the flag (PoseMixer): with `A3D_QR_ANIMATION_POSE_MIXER` on, no blend math outside `packages/animation/src/pose/` runs for compiled clips (asserted by a spy test).
7. `docs/rendering/skinning-and-morphs.md` describes the new path and no doc uses changed pixels as certification.

**Integrated complete** (moves the flag to `integrated-accepted`; evaluated at G-PANEL checkpoints, never blocks):
1. §17.1 rows pass all three judges on a G-PANEL round with `qr_flags=all`.
2. §17.2 vision categories pass on `prd06-character-hero`, and PRD 13's `character-hero`/`character-controller` templates (Q-13-3) pass the same bar.
3. §17.4 rows for Aura Clash, gallery-shift and rooftop-buckets pass after Q-14-1/2/6. Skyline, neon-swarm and mech-hangar pass after the C-17-admitted heroes (Q-05-2) and Q-14-3/4/5; until then they are listed as open in the checkpoint report, not as done.
4. §13 budgets are met on macos-14 for High/Medium with real lanes. Low/Mobile is met on a real device, or the blocker is explicitly reported.
5. No route in `apps/` uses root-transform `sin` sway or non-uniform squash on a skinned character. Check: `rg -n "setScale\([^)]*squash" apps` → 0 for skinned actors, with review of remaining hits.

**Flag removal** (CONTRACTS §5.4, after two `default-on` checkpoints): legacy blend math, empty-pose acceptance and the `3.0` defaults path are deleted from lane files; Q-01-1 deletes the legacy skinned forks; `rg "function blendBase"` returns only `packages/animation/src/pose/`.

## 22. Rollback considerations

- Flags (CONTRACTS §5): `A3D_QR_ANIMATION` off restores every pre-rebuild behaviour; sub-flags roll back independently:
  - `A3D_QR_ANIMATION_POSE_MIXER` off (alias `animation.mixer: "legacy"`): old blend math via facades.
  - `A3D_QR_ANIMATION_SKINNED_SHADOWS` off (alias `renderer.skinnedShadows: false`): the depth feature and bounds provider are not registered.
  - `A3D_QR_ANIMATION_GPU_MORPH` off (alias `renderer.morph: "cpu"`): CPU morph path, persistent buffer kept.
  - `renderer.skinnedPbr: "fork"` or `A3D_QR_CORE` off: legacy skinned forks.
  - `createAuraApp({ animation: { defaults: "3.0" } })`: old root semantics with the rest of the flag on.
- Any PR that turns main red is reverted at once by anyone (CONTRACTS §6.1); each task lands as its own PR, so a revert of the depth feature does not revert controller fixes.
- Visual goldens are versioned per checkpoint by the bench lane. A rollback restores the matching golden set.
- The data format (C-17 `animationClips` objects) is additive. Old string arrays stay readable, so rolling back the engine does not require regenerating assets.
- The IndexedDB retarget cache is keyed by engine version, so a rollback ignores newer caches.

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Shader variant explosion (skin 0/4/8 × morph × instancing × alpha × velocity × PBR features), with compile stalls (the depth recompile once held Aura Clash at 2 FPS, `DepthPass.ts:30-43` rationale) | high | high | `prd06.deform` exposes ≤ 6 values per scene (unit-tested); warm-up through C-02 `precompile`/C-28 `compileAsync`; define-key budget test (≤ 12 live programs per character material) |
| PoseMixer rewrite regresses Aura Clash (the only working skinned game) | medium | high | three-parity unit tests; S13 A/B (`?a3d-qr=none` vs `animation`); sub-flag `_POSE_MIXER` |
| Real crossfades expose authoring problems (clip names, missing clips) across routes | high | medium | codemod report; strict errors in dev; validator `hero-character` |
| Morph texture memory on mobile (16 MB+ per head) | medium | medium | RGBA16F, normals optional, active-K cap per tier, CPU fallback |
| Integer/float joint index precision or out-of-range index → undefined `texelFetch` | low | high | import-time index validation; float index exact below 2^24 |
| WebGL2 drivers with slow RGBA32F `texSubImage2D` | low | medium | one upload per skin per frame; PBO path optional on High |
| Retarget quality on non-standard rigs (Meshy, Quaternius variants) | medium | medium | `RETARGET_MISSING_BONES` errors; per-rig mapping override; human review of retargeted clips |
| On-screen skinned shadows depend on the lighting lane's C-11 real `DepthPass` | high | medium | standalone proof in the light-view harness (S3); Q-02-1 filed day 0; on-screen rows integrated only; leave-one-out attribution; never claim pass early |
| Unified skinned PBR and morph pixels depend on the generator (C-02 real) | high | medium | numerics proven standalone in ChunkHarness/lane harness (S4); pixels integrated |
| CCRs (CCR-06-1..6) slower than one working day | medium | low | lane keeps the fields internal and uses `ctx.strict`, `socket()` and local types meanwhile; nothing waits |
| Hero assets (licensing, quality) late from the assets lane | high | high | standalone uses repo rigs by path; P0-P3 need no new hero; integrated hero rows evaluated after Q-05-2 |
| Vision judge cannot read images (research/20/22 "image viewer returned empty") | medium | high | capture pipeline must emit JPEGs the judge can load (research/21 and /23 succeeded), and the human review is mandatory regardless |
| Frame-time already 5-15 fps on macos-14 for most games | certain | medium | animation must not worsen it (§13 3% rule); the frame-time fix is the GPU/tiers lane's |
| Flag combinatorics hide an interaction bug (e.g. `animation` on, `core` off) | medium | medium | CI runs `none`, `all` and each single lane flag (CONTRACTS §5.4); lane tests cover `animation` alone and `animation,core` |

## 24. Explicitly out of scope

- Dual-quaternion skinning, corrective blendshape solvers, muscle and tissue simulation.
- Cloth simulation, strand hair and ragdoll/physical animation. Spring bones are the only secondary-motion system here. The full cloth gap noted in research/18 is deferred to a later program.
- Motion matching, learned locomotion and procedural gait generation.
- GPU crowd animation (vertex animation textures, compute skinning for thousands of agents) beyond the Ultra tier's 32 NPCs.
- Facial performance capture, audio-to-viseme ML models (AuraVoice owns these), and an animation editor UI or timeline authoring in `apps/editor`.
- Rigid-object animation in non-character games (wheels, suspension, flippers, control surfaces): PRD 14/09.
- Character art direction and asset sourcing (assets/games lanes, C-17/C-35). Material and skin shading models (C-03). Shadow filtering, strength and CSM (C-11 provider). TAA and motion blur consumers (C-14 provider). Camera rigs and hitstop (C-22/C-23 provider). PRD 06 supplies the deformation and playback contracts these consume.
- Editing any file outside the CONTRACTS §4.1 lane-06 set; those changes are §12.3 requests.
- Claims of three.js-equivalent quality. This PRD sets thresholds relative to three r185 on specific scenes only.

