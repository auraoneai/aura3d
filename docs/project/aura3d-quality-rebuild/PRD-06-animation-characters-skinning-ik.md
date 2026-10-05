# PRD 06: Animation, Characters, Skinning, IK

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`.
Evidence base: `research/09-animation-characters.md` (primary), `research/17-games-g*.md`, `research/18-completeness-critic.md` (C10, row "Animation controller freeze", Q6), `research/19-claim-verification.md` (C4, C16), `research/20-game-scorecards-code-pixelstats.md` (non-visual categories), `research/21-game-vision-judgment.md` (visual categories, authoritative), `research/22-benchmark-pass1-code-metrics.md`, `research/23-benchmark-vision-judgment.md` (authoritative benchmark visuals). All `research/` paths are relative to `docs/project/aura3d-quality-rebuild/`. Code line numbers were re-checked in this checkout unless marked "(per research/NN)". A staff review on 2026-10-05 re-verified E1-E5, E8-E15, E17, E19-E28, E30-E37 against the source and corrected E14, E21, E24, E27, the gallery-shift and rooftop sway references, the foot-planting line references and the ShaderLibrary fork ranges. It also added E38-E42. Line numbers drift, so every task names the function as well as the line, and the function name is authoritative.

Passing tests, 200-status routes, non-blank screenshots and "changed pixels" are not quality, and this PRD does not count them as quality. The gate is whether characters in the shipped games and in the same-scene benchmark look and move like they would in a competent modern three.js build. A vision model and a human reviewer judge that.

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
| E1 | Root renderer prefers any truthy pose over clip playback | `packages/engine/src/agent-api/index.ts:13871-13883` (`if (currentState.animationPose) entry.actor.applyRetargetedPose(...) else applyProductionActorAnimation(...)`) |
| E2 | Node handle stores any pose, including `{bones:{}}` | `packages/engine/src/agent-api/index.ts:10982-10984` (`setAnimationPose`) |
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
| E20 | Depth/shadow material is `a_position` only. `drawCaster` ignores `skinning`, `morphTargets` and `instanceTransforms` | `packages/rendering/src/DepthPass.ts:15-27, 59-86`; shader `ShaderLibraryCore.ts:784-806` |
| E21 | Joint counts above 96 get a new RGBA32F palette `Texture` per draw. The constructor clones the data again. The texture is never disposed, and `WebGL2Device` keeps every `Texture` in a strong `Map` and frees GL handles only for `texture.disposed` textures. Result: one leaked GL texture plus two Float32Arrays per >96-joint draw per frame. The same path also allocates a zero-filled `Float32Array(96*16)` for the still-declared uniform array, plus a new `Sampler`/`TextureBinding`, and scans the whole palette with `isFiniteArrayLike` on every draw | `ForwardPass.ts:1942-2006` (`createSkinningPaletteTexture` `:2014-2036`, called `:1984`; zero array `:1994`; finite scan `:1966`); `SkinningPaletteUploadManager.bind` `:428-452` does not cache it; `WebGL2Device.ts:274` (`Map<Texture, WebGLTexture>`), `:4106-4114` (`releaseDisposedTextureHandles`); `Texture.ts:41` (`clonePixelData`) |
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
| E39 | `Texture` cannot be updated in place or be a 2-D array. `dimension` is `"2d" \| "cube"`, `data` is `readonly` and cloned at construction, and there is no update/revision API. A persistent bone texture (R3) and a morph `sampler2DArray` (R5) both need device work first | `packages/rendering/src/Texture.ts:2, 5, 41`; no `TEXTURE_2D_ARRAY`/`texImage3D` in `WebGL2Device.ts` |
| E40 | The skin-binding identity is rebuilt every frame: `refreshSkinningPalettes` assigns a new `{ jointCount, matrices }` object to `renderable.skinning`, so nothing downstream can key a cache on it | `GLTFAnimationRuntime.ts:1263-1293` (`:1286-1289`); spread into render items at `TypedGLBActor.ts:302` |
| E41 | The root-motion bridge already exists, but only for controller bindings that carry `animationBinding.rootMotion` | `index.ts:15086-15114` (`playRootMotionClips`) |
| E42 | The existing motion-quality tracker measures motion *existence* (`tracksApplied`, `poseDiversityScore`), not quality. §17.3 metrics must not be built on it | `packages/animation/src/MotionQuality.ts:1-40` |

Benchmark evidence (macos-14 ANGLE Metal, GH run 37289688772; harness verified fair in research/22):

- **08-skinned-character** (CesiumMan bind pose)
  - Aura shadow ROI mean luma is 117.2 against ground 116.6 (no shadow). three's is 96.7 against 118.2 (research/22 §08 skeptic).
  - Vision scores: Aura 3.5, three 5 (research/23).
  - Bind pose does not by itself hide the skinning-shadow bug here. The depth shader draws raw `a_position`, which for a skinned glTF is the unskinned mesh in skin space, not the posed or bound mesh. For CesiumMan the skin hierarchy carries the Z-up→Y-up root rotation, so the raw caster may lie flat or sit off the silhouette. Whether 08's missing shadow comes from that or from PRD 02's shadow strength has not been measured. T0.14 settles it by capturing the shadow map for 08 before and after T0.13. Research/22 also asks for an animated-pose variant (T0.15).
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

The animation subsystem is not the dominant cost in these numbers. PRD 11 owns the frame-time gap. This PRD must not make it worse (§13).

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

- `@aura3d/rendering`: DepthPass, ShadowPass, ForwardPass, ShaderChunks, ShaderLibrary/Core, SkinnedLitMaterial, SkinnedUnlitMaterial, MorphUnlitMaterial, MorphTargetPlan, TemporalHistory, Renderer (bounds), SkinningBounds, **Texture + WebGL2Device + WebGPUDevice** (in-place texture update, `2d-array` dimension), WebGPU skinning limits.
- `@aura3d/assets`: GLTFAnimationRuntime (evaluator, palette, masks, root motion, foot planting).
- `@aura3d/animation`: mixer, controller (`AnimationController.ts`, E38), clip and track sampling, blend trees, inertialization, IK, FootIk, SpringBones, HumanoidRetargeting, RootMotion, LocomotionKit, LocomotionController.
- `@aura3d/physics`: `ArcadeCharacterController` (`packages/physics/src/ArcadeCharacterController.ts:36`) and `FightingCharacterController` (`FightingCharacterController.ts:19`). These are read-only inputs to `game.characterAnimation`, with no behaviour change.
- `@aura3d/engine`: agent-api `index.ts` (node handle, production actor dispatch, `AuraAnimationSpec`, `createAuraApp` options), `AnimationController.ts`, `RuntimeNodeHandle.ts`, `production-runtime/TypedGLBActor.ts`, `VisemeController.ts`, and the new `GameCharacterAnimation.ts` (hosted under the PRD 09 `game` namespace).
- `@aura3d/cli`: inspection and typegen of clip durations, skeleton and morph metadata, plus the animation validator.
- `create-aura3d`: templates `fighting-game`, `character-controller`, `mini-game`, `animation-studio`, `three-compat-character-viewer`; skill `aura3d-character-animation`.
- Apps: `aura-clash-showcase`, `showcase-gallery-shift`, `showcase-rooftop-buckets`, `showcase-skyline-runner`, `showcase-neon-swarm`, `showcase-mech-hangar`, `world-war-x-showcase` (codemod target), `animation-walk`, `skinning-blending`, `skinning-additive`, `skinning-ik`, `skinning-morph`.
- Tools: `tools/quality-rebuild-capture` (frame-burst capture, T4.8), new `tools/codemods/`.

## 5. Affected files and directories

```
packages/rendering/src/DepthPass.ts
packages/rendering/src/ShadowPass.ts
packages/rendering/src/CascadedShadowMaps.ts            (consumer of DepthPass; no logic change)
packages/rendering/src/ForwardPass.ts                   (palette upload, morph path, SkinningPaletteUploadManager)
packages/rendering/src/ShaderChunks.ts                  (skinning chunk; new morph + velocity chunks)
packages/rendering/src/ShaderLibraryCore.ts             (depth variants)
packages/rendering/src/ShaderLibrary.ts                 (remove forked skinned shader; PBR defines)
packages/rendering/src/SkinnedLitMaterial.ts            (becomes alias of PBR material + USE_SKINNING)
packages/rendering/src/MorphTargetPlan.ts               (texture plan becomes the only GPU plan)
packages/rendering/src/TemporalHistory.ts               (accept skinned/morph with previous palette)
packages/rendering/src/Renderer.ts                      (skinned bounds 2295-2305)
packages/rendering/src/WebGPUSkinningLimits.ts
packages/rendering/src/WebGPUDevice.ts                  (palette storage buffer; 96-joint cap at 2249-2251, 2944-2948)
packages/rendering/src/Texture.ts                       (new: update(data, region?) + revision; dimension "2d-array")
packages/rendering/src/WebGL2Device.ts                  (texSubImage2D on revision change; TEXTURE_2D_ARRAY upload)
packages/rendering/src/SkinningPaletteTextureCache.ts   (new)
packages/rendering/src/SkinningUniforms.ts              (new: applySkinningUniforms moved out of ForwardPass, shared with DepthPass)
packages/rendering/src/webgpu/                          (WGSL equivalents; co-owned with PRD 11)
packages/assets/src/GLTFAnimationRuntime.ts
packages/animation/src/{AnimationMixer,AnimationController,AnimationTrack,Keyframe,AnimationAction,AnimationLayer,BlendTree,
  Inertialization,IK,FootIk,SpringBones,HumanoidRetargeting,HumanoidBoneInference,RootMotion,LocomotionKit}.ts
packages/animation/src/pose/                            (new: PoseBuffer, SkeletonBinding, CompiledClip, PoseMixer, BoneMask,
                                                         makeClipAdditive, PoseInertializer, constraints, Retarget, MotionMetrics)
packages/engine/src/agent-api/index.ts                  (1288-1304, 10497-10520, 10965-10990, 13865-13890, 15070-15124, 15461-15490, createAuraApp options ~10780-10830)
packages/engine/src/agent-api/AnimationController.ts
packages/engine/src/agent-api/RuntimeNodeHandle.ts
packages/engine/src/agent-api/GameCharacterAnimation.ts (new)
packages/engine/src/production-runtime/TypedGLBActor.ts
packages/engine/src/agent-api/VisemeController.ts
packages/aura3d-cli/src/{asset-inspection-types,asset-manifest,animation-asset-validator,index}.ts   (index.ts:2112 inspectGltfAnimations)
packages/create-aura3d/templates/{fighting-game,character-controller,mini-game}/
packages/create-aura3d/templates/character-hero/        (new)
packages/create-aura3d/skills/aura3d-character-animation/SKILL.md
docs/rendering/skinning-and-morphs.md
apps/aura-clash-showcase/src/playable/{AuraClashArenaApp.ts,animation/fighterSecondaryMotion.ts}
apps/showcase-gallery-shift/src/{main.ts,thief.ts,guard.ts}
apps/showcase-rooftop-buckets/src/main.ts
apps/showcase-skyline-runner/src/main.ts
apps/showcase-neon-swarm/src/main.ts
apps/showcase-mech-hangar/src/main.ts
benchmarks/quality-rebuild/shared/{scenes,assets}.ts     (new animated-pose scenes; harness owned by PRD 12)
tools/quality-rebuild-capture/capture-games.mjs          (frame-burst step, T4.8)
tools/codemods/animation-3.1.mjs                         (new)
tests/unit/animation/, tests/unit/rendering/, tests/unit/agent-api/, tests/unit/aura3d-cli/, tests/templates/,
tests/browser/animation-*.spec.ts, tests/browser/animated-character-browser.spec.ts,
tests/browser/threejs-parity-skinning-{blending,additive,ik}-parity.spec.ts   (existing; expectations change with §6.4)
```

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
  Upload: one RGBA32F bone texture per skin, texSubImage2D in place; previous palette kept for velocity
  Draw: forward PBR (USE_SKINNING / USE_MORPH), depth (same defines), velocity (prev palette)
```

The `AnimationController` in the engine becomes a **state/intent layer** over `PoseMixer`. It owns states, transitions, events and requested clips, and it never builds poses itself for GLB clips. `GLTFSceneAnimationRuntime` becomes the loader/binder that produces `SkeletonBinding` and `CompiledClip`, and its `applyClips` is re-implemented on `PoseMixer` (§12). `@aura3d/animation`'s `AnimationMixer` becomes a compatibility facade over `PoseMixer`. `@aura3d/animation`'s `AnimationController.blendStates` (E38) delegates to `PoseMixer` when its clips are `CompiledClip`s, and keeps its current blend only for sampler-function clips, behind the same `mixer: "legacy"` flag.

### 6.2 Controller → renderer contract (fixes E1-E7)

- Replace the dual channel (`animationPose` + `node.animation`) with **one typed message** per node per frame: `AuraActorAnimationFrame` (§7.1). It carries either `clipSamples` (GLB clips evaluated by the actor's PoseMixer) or `pose` (an externally computed pose, e.g. retargeted). It is never an empty pose.
- `index.ts:13871` dispatch becomes:
  - if `frame.pose` has at least one bone, apply the pose;
  - otherwise, if `frame.clipSamples.length > 0`, run `actor.animation.applyClips(frame.clipSamples)`;
  - otherwise use the root `node.animation` path.
- An empty pose is never stored. With `createAuraApp({ animation: { strict: true } })` it throws `ANIMATION_EMPTY_POSE`. Otherwise it warns once per actor. The engine has no `import.meta.env` convention, so strictness is an explicit option. Templates and every test harness set `strict: true`.
- Controller clip durations come from the bound actor. On `bindRuntimeNode`, the controller calls `node.resolveAnimationClips()`, which returns `{name, duration}[]` from the loaded `CompiledClip`s, and replaces defaulted durations. Until the asset loads, the state is `pending` and nothing is pushed. Typegen also emits `duration` (E8) so that durations exist before load for controller timing.
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

### 6.5 GPU deformation as composable defines (fixes E20-E26)

Defines: `A3D_SKINNING` (4 or 8 influences), `A3D_MORPH` (texture morph, with position/normal/tangent strides), `A3D_INSTANCING` (PRD 02 owns its depth use), `A3D_ALPHA_TEST` (PRD 02), `A3D_VELOCITY` (PRD 03).

- One PBR program family (PRD 01 owns the PBR body). `SkinnedLitMaterial` becomes `PbrMaterial` + `skinning: true`, and the fork is deleted.
- **Depth programs.** `aura3d/depth` takes a define set, and `DepthPass.drawCaster` picks the variant from the caster's `skinning`, `morphTargets`, `instanceTransforms` and material alpha mode. Variants are cached in a `WeakMap<ShaderLibrary, Map<defineKey, ShaderModule>>`, which keeps the existing static cache rationale (`DepthPass.ts:30-43`: a per-frame recompile once held Aura Clash at 2 FPS).
- **Bone texture.**
  - Prerequisite (E39): `Texture` gains `update(data: TexturePixelData, region?: { x, y, width, height, layer? })`, which bumps a `revision` counter without cloning. `WebGL2Device` re-uploads with `texSubImage2D` (or `texSubImage3D` for arrays) only when `revision` changed since its last upload. Allocation happens once, with `texStorage2D`.
  - One persistent `Texture` per skin instance, RGBA32F, width 4×N rounded, updated in place.
  - A second texture holds the previous-frame palette, swapped by reference, not copied.
  - The uniform-array path is removed for WebGL2. A 96-joint uniform array overflows the guaranteed vertex uniform budget (E22).
  - On WebGPU (PRD 11) the palette is a `storage` buffer sized to the rig. That removes the 96-joint uniform cap in `WebGPUDevice` (E27).
- **Morph texture.**
  - Built once per geometry at load: a `sampler2DArray` (`Texture` `dimension: "2d-array"`, E39), one layer per target, texel index = vertexIndex × stride + attribute. This is the same layout three r185 uses for `morphTexture` (`DataArrayTexture`, one layer per target, addressed by `gl_VertexID`).
  - Per frame, only the active-target list is uploaded (§8.2 packing; up to 64 entries in uniforms; above that, a 1-D R32F texture). three r185 uploads every influence (`morphTargetInfluences[MORPHTARGETS_COUNT]`). The top-K active list is an Aura cost optimisation and changes output only when more than K targets are non-zero.
  - The CPU geometry rebuild in `resolveRenderGeometry` is kept only as a fallback when `MAX_TEXTURE_SIZE` or `MAX_ARRAY_TEXTURE_LAYERS` are exceeded. It must then reuse one persistent dynamic buffer, not allocate.
- **Culling bounds.** At load, compute per-joint local AABBs from the vertices each joint influences with weight above 0.01. Per frame, transform those 8-corner boxes by the palette and union them: O(joints) instead of O(vertices). This replaces `computeSkinnedGeometryBounds` per frame (E26). Morph bounds use a precomputed union of `base + Σ max(0, w)·targetAABB`.
- **Velocity.** The velocity variant skins with both palettes and morphs with previous and current influences. `TemporalHistory` accepts skinned and morph items when the material declares `A3D_VELOCITY` (E25). PRD 03 owns the TAA consumer.

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
- This enables a shared, licensed locomotion and combat library, so a hero needs only a rig. Asset acquisition is PRD 05.
- Bake rules:
  - Hips translation is scaled by leg-length ratio.
  - Non-humanoid bones keep their rest pose.
  - Finger curls are optional.
  - Missing required humanoid bones fail with `RETARGET_MISSING_BONES` (list).

### 6.8 Root motion and character controller binding

- `play(clip, { rootMotion: { bone?: "auto"|string, translation: "xz"|"xyz"|"none", rotation: "yaw"|"none" } })`.
  - Each frame's root delta (world space, through `transformRootMotionDelta`, `RootMotion.ts:204`) is removed from the pose and emitted to a consumer.
  - The consumer is the character controller's `move()`. It falls back to node transform integration when no consumer exists.
  - This generalises the existing `playRootMotionClips` path (`index.ts:15087-15116`). Today it is reachable only from the controller binding and the `animation-walk` demo.
- `game.characterAnimation(controller, node, spec)` binds a locomotion controller's speed, grounded, jump/fall/land, turn rate and actions to a 1-D (speed) or 2-D (velocity-local) blend tree in one sync group, with event-driven one-shots and foot IK.
  - Blend weights reach the mesh (fixes E10).
  - It replaces hand-written per-route state machines (research/16 row 18).

### 6.9 Character template + hero

New template `character-hero`. The existing `character-controller` template is upgraded to the same content.
- One rigged, PBR-textured humanoid hero (≥ 15k triangles, ≥ 50 joints, ≥ 1 face morph set optional) with clips: idle, walk, run, sprint, jump-start, jump-loop, land, turn-L/R 90, interact, hit-react, plus one attack.
- Hero is lit by the PRD 02 rig, has a shadow and contact shadow, and uses the PRD 08 follow camera.
- Foot IK on, look-at to the camera's interest point, spring bones on one accessory chain (hair, scarf or backpack strap).
- The asset comes from PRD 05 (licensed source or Meshy rig + retargeted library). This PRD defines acceptance.

### 6.10 Major recommendations: cost/benefit

| Rec | Visual benefit | GPU cost | CPU cost | Memory | Bundle (gz) | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|
| R1 Controller/root dispatch fix + real durations | Characters on the documented path animate at all (gallery-shift thief/guard, every fighting-game scaffold) | 0 | −(skips pose blend) | 0 | ≈ −1 KB (dead path removal later) | none | `applyPose:true` legacy flag for one release |
| R2 Skinned/morph depth variants | Shadows follow pose: grounding and silhouette in 08/15/18, aura-clash | +1 skinning VS per caster per shadow view (≈ forward VS cost × views); 1 CSM cascade × 2 fighters is negligible | 0 | 0 (bone texture shared with forward) | +1.5 KB shader text | same VS cost; restrict skinned casters to hero on Low | Low tier: hero only skinned caster, others blob/contact shadow (PRD 02) |
| R3 Persistent bone texture, drop 96-uniform path | Fixes possible mobile link failure (E22) and per-frame alloc/leak (E21) | −texture allocation; texelFetch ×4 per influence (+≈2% VS) | −(no allocs) | joints×64 B ×2 per skin (191 joints = 24 KB) | ≈ 0 | removes uniform-limit risk | none needed (RGBA32F + texelFetch is core WebGL2) |
| R4 One mixer with three.js weight semantics, additive, masks, sync, inertialization | No pops, correct fade from rest, layered upper-body over locomotion, no foot fighting | 0 | ≈ 0.02 ms per 65-bone actor per active clip with flat arrays + cached cursors (target, §13) | ≈ 40 B/key/channel compiled; 12-clip 65-joint rig ≈ 0.5-1.5 MB | +10 KB new, −15 KB after removing 3 stacks | CPU bound on Low: cap active actions per actor at 3 | `animation: { mixer: "legacy" }` for one minor release |
| R5 Texture morphs on lit/skinned PBR | Faces/visemes/correctives at any target count on shaded skin | +1 `texelFetch` per active target per attribute per vertex | −(no per-frame geometry rebuild) | verts×targets×(pos+normal)×8 B (RGBA16F); 20k verts × 52 targets ≈ 16.6 MB | +2 KB | Low: cap active targets at 8 and normals off | CPU morph into a persistent dynamic VBO when texture limits are exceeded |
| R6 Unified skinned PBR | Characters get the same IBL, CSM, specular and tone path as the world; no procedural wrinkle-noise stand-in | ≈ 0 (same shader as static PBR + VS skinning) | 0 | −2 forked programs (4- and 8-influence, E24) | −12 KB shader text (estimate; measure with `pnpm check:bundle-size`) | fewer programs to compile | none (fork deleted after parity screenshots) |
| R7 Skinned velocity | TAA/motion blur work on characters instead of throwing (PRD 03) | +1 palette fetch set in velocity pass | +palette swap | +1 palette texture per skin | +1 KB | TAA usually off on Low | exclude skinned from TAA history with reactive mask (old behaviour, minus the throw) |
| R8 Joint-AABB culling bounds | 0 (correctness kept) | 0 | −O(verts) → O(joints) per animated skin (e.g. 35k verts → 65 boxes) | +joints×24 B | +0.5 KB | big CPU win on mobile | conservative bind AABB × 1.5 |
| R9 IK v2 + foot IK + look-at + CCD | Feet plant on slopes and stairs, heads track targets, reach looks intentional | 0 | ≈ 0.01 ms per two-bone solve; foot rig 2 raycasts per actor | small | +4 KB | raycasts against heightfield only on Low | weight 0 (pure clip) |
| R10 Spring bones bound to bones | Hair, tails and straps lag and settle; removes rigid look | 0 | ≈ 0.005 ms per particle substep | small | +1 KB (existing code) | Low: 1 chain per hero, 30 Hz substep | disabled → rest pose |
| R11 Retarget-bake library | Any humanoid gets a full clip vocabulary, so games stop using cards/statues | 0 | load-time bake ≈ 5-30 ms per clip set (worker) | compiled clips per rig | +3 KB | bake in worker; cache in IndexedDB | ship pre-baked clips in the asset (PRD 05) |
| R12 Character controller binding + template hero | Locomotion visibly matches speed (walk/run blend), jumps land, feet plant | as R2/R5 | ≈ 0.05 ms per hero | asset ≈ 3-8 MB (KTX2 via PRD 04/05) | +2 KB | Low tier hero LOD (PRD 05) | template validates and fails loudly without required clips |
| R13 Root motion on the root `play` path (§6.8) | Feet stop skating against the ground because travel comes from the clip | 0 | ≈ 0.005 ms per actor (one root-track delta) | 0 | +1 KB | none | `rootMotion: false` (in-place clip + controller velocity, today's behaviour) |
| R14 Bone sockets (`node.socket`) | VFX, weapons and props follow hands and feet instead of the root (PRD 07) | 0 | one mat4 multiply per socket per frame | 64 B per socket | +0.5 KB | none | attach to root transform (today's behaviour) |
| R15 WebGPU storage-buffer palette (with PRD 11) | Rigs above 96 joints deform on WebGPU instead of getting a zero palette (E27) | ≈ 0 (storage read vs uniform read) | −(no 96-cap packing) | joints×64 B | +1 KB WGSL | WebGPU-capable mobile only | WebGL2 backend |

## 7. APIs to add, change and remove (TypeScript)

### 7.1 Engine (`@aura3d/engine`, agent-api)

```ts
// index.ts:1288 — extend, do not break existing fields
export interface AuraAnimationSpec {
  readonly clip?: string;
  readonly loop?: boolean;
  readonly restart?: boolean;
  readonly speed?: number;                       // NOW honoured on skinned playback (time *= speed)
  readonly startTime?: number;
  readonly duration?: number;
  readonly captureTime?: number;
  /** Crossfade from the current base action. Default 0.2 s; `false` snaps. */
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
  /** Clip-name miss policy. Default "error" (warn + no-op in production). */
  readonly fallback?: "error" | "first";
  /** Reset unanimated bones to rest each evaluation. Default true. */
  readonly restPoseReset?: boolean;
  // ... existing easing/orbit/joint/chain/rootBob/jointHierarchy fields unchanged (primitive/legacy path only)
}

// createAuraApp options (index.ts AuraCreateAppOptions, ~10780-10830): new `animation` key
export interface AuraCreateAppAnimationOptions {
  /** Throw on empty poses, unknown clips and missing samplers instead of warn-once. Default false; templates/tests set true. */
  readonly strict?: boolean;
  /** "3.0" restores pre-P1 root semantics (no crossfade, speed ignored, first-clip fallback) for one minor release. */
  readonly defaults?: "3.0" | "3.1";
  /** "legacy" keeps the old renormalising blend math behind the facades for one minor release. */
  readonly mixer?: "pose" | "legacy";
  /** Explicit quality tier until PRD 11 tier detection lands; drives §13 caps (active morphs, skinned casters, springs Hz). */
  readonly tier?: "low" | "medium" | "high" | "ultra";
}
// AuraCreateAppRendererOptions additions: skinnedShadows?: boolean (default true), morph?: "gpu" | "cpu", skinnedPbr?: "unified" | "fork"

export type AuraBoneMaskSpec =
  | "full-body" | "upper-body" | "lower-body" | "left-arm" | "right-arm" | "head"
  | { readonly include: readonly AuraBoneSelector[]; readonly exclude?: readonly AuraBoneSelector[];
      readonly weights?: Readonly<Record<string, number>> };
export type AuraBoneSelector = string /* exact bone name */ | { readonly bone: string; readonly descendants?: boolean }
  | { readonly humanoid: HumanoidBoneName; readonly descendants?: boolean };

export interface AuraRootMotionSpec {
  readonly bone?: "auto" | string;
  readonly translation?: "xz" | "xyz" | "none";
  readonly rotation?: "yaw" | "none";
  readonly consumer?: (delta: { readonly translation: AuraVec3; readonly yaw: number }) => AuraVec3 | void;
}

// Runtime node handle (index.ts:10497 `AuraRuntimeNodeHandle`; play at :10512)
export interface AuraRuntimeNodeHandle {
  play(clip: string, options?: Omit<AuraAnimationSpec, "clip">): this;            // semantics change: crossfade default
  crossFadeTo(clip: string, seconds: number, options?: Omit<AuraAnimationSpec, "clip" | "crossFade">): this;
  playLayer(layer: string, clip: string, options?: Omit<AuraAnimationSpec, "clip" | "layer">): this;
  stopLayer(layer: string, fadeOut?: number): this;
  resolveAnimationClips(): Promise<readonly AuraResolvedClipInfo[]>;               // real names + durations after load
  readonly animationState: () => AuraActorAnimationStateSnapshot | undefined;
  readonly ik: AuraActorConstraintApi;
  readonly springBones: AuraActorSpringBoneApi;
  socket(bone: string): AuraBoneSocket;                                           // world matrix of a bone (VFX/props, PRD 07)
  /** @deprecated use the typed animation frame; kept one release */
  setAnimationPose(pose: AnimationPose | undefined, metadata?: AuraRuntimeNodeAnimationPoseBindingMetadata): this;
}

export interface AuraResolvedClipInfo { readonly name: string; readonly duration: number; readonly channelCount: number;
  readonly hasRootMotion: boolean; readonly loopClosureError?: number; }

/** Single controller → renderer message (replaces animationPose + node.animation dual channel). */
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

export interface AuraActorConstraintApi {
  twoBone(spec: TwoBoneIkConstraintSpec): AuraConstraintHandle;
  footIk(spec: FootIkConstraintSpec): AuraConstraintHandle;
  lookAt(spec: LookAtConstraintSpec): AuraConstraintHandle;
  ccd(spec: CcdIkConstraintSpec): AuraConstraintHandle;
}
export interface AuraConstraintHandle { setTarget(target: AuraVec3 | AuraRuntimeNodeHandle | AuraBoneSocket): void;
  setWeight(weight: number, fadeSeconds?: number): void; remove(): void; }
export interface AuraActorSpringBoneApi { add(spec: SpringBoneChainSpec): AuraSpringChainHandle; reset(): void; }

// AnimationController.ts
export interface AuraAnimationRuntimeNodeBindingOptions<TClipId extends string> {
  // existing fields ...
  /** Default "clips": controller sends clipSamples; renderer evaluates GLB clips. "pose" requires a sampler. */
  readonly drive?: "clips" | "pose";
  /** @deprecated replaced by drive; true == "pose" */
  readonly applyPose?: boolean;
}

// game kit (engine/src/agent-api/Game*.ts, PRD 09 hosts the namespace)
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
```

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

// rendering
export interface SkinningPaletteBinding {
  readonly jointCount: number;
  readonly matrices: Float32Array;
  readonly previousMatrices?: Float32Array;          // for A3D_VELOCITY
  readonly paletteKey: object;                       // identity of the skin instance → persistent texture. Set to the
                                                     // GLTFAnimationRuntime skinning binding object (stable), never the per-frame skinning object (E40)
  readonly extraInfluences?: boolean;
}
export class SkinningPaletteTextureCache {            // replaces createSkinningPaletteTexture per draw
  acquire(device: RenderDevice, key: object, jointCount: number): { current: Texture; previous: Texture };
  upload(key: object, matrices: Float32Array): void;  // texSubImage2D in place; once per skin per frame
  swap(key: object): void; release(key: object): void; diagnostics(): { textures: number; bytes: number; createdThisFrame: number };
}
export interface MorphTargetTexture { readonly texture: Texture /* 2d-array */; readonly targetCount: number;
  readonly stride: 1 | 2 | 3; readonly width: number; readonly attributes: readonly ("position" | "normal" | "tangent")[]; }
export function buildMorphTargetTexture(geometry: Geometry, targets: readonly MorphTargetDelta[],
  limits: MorphDeviceLimits, format?: "rgba16f" | "rgba32f"): MorphTargetTexture | { readonly fallback: "cpu"; readonly reason: string };
export function resolveDepthShaderVariant(item: RenderItem): { readonly key: string; readonly defines: Readonly<Record<string, string | number>> };

// Texture.ts (prerequisite, E39)
export type TextureDimension = "2d" | "cube" | "2d-array";
export interface TextureDescriptor { /* existing */ readonly layers?: number; /* required for "2d-array" */ }
export class Texture {
  readonly revision: number;                                   // bumped by update(); devices re-upload when it changes
  update(data: TexturePixelData, region?: { readonly x: number; readonly y: number; readonly width: number;
    readonly height: number; readonly layer?: number }): void; // no clone; caller keeps ownership of `data`
}
```

### 7.4 Remove or deprecate

| Item | Action | Release |
|---|---|---|
| `emptyPose` as a sampler fallback for embedded clips (`AnimationController.ts:1793`) | remove; state is `pending` until clips resolve | P0 |
| `createIdentityPose` as implicit fallback (`:3019-3036`) | remove the implicit use | P0 |
| `poseBakedFallback: true` with `tracks: []` in `fighting-game` | delete clips; bind real GLB clips | P0 |
| `resolveGLTFClipName` → `available[0]` default | default to `undefined` + warning; `fallback:"first"` opt-in | P1 |
| `MAX_UNIFORM_SKINNING_JOINTS` uniform path (WebGL2) | remove after P0 bone-texture parity | P1 |
| `createSkinningPaletteTexture` per draw | replaced by `SkinningPaletteTextureCache` | P0 |
| `MAX_GPU_MORPH_TARGETS/VERTICES` uniform morph + `aura3d/morph-unlit` limits | replaced by texture morph on all materials | P2 |
| `DEFAULT_SKINNED_LIT_SHADER` and `DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER` forks, with their procedural wrinkle `sin(p*230)` | delete; `SkinnedLitMaterial` = PBR + `skinning: 4\|8` | P2 |
| `DEFAULT_SKINNED_UNLIT(_EIGHT_INFLUENCE)` and `aura3d/morph-unlit` programs | become the unlit material + `A3D_SKINNING`/`A3D_MORPH` defines | P2 |
| `@aura3d/animation` `AnimationController.blendStates` renormalisation (`AnimationController.ts:662-700`) | delegate to `PoseMixer` for compiled clips | P1 |
| WebGPU 96-joint `u_jointMatrices` packing (`WebGPUDevice.ts:2249-2251`) | storage-buffer palette | P2 |
| `AnimationMixer` blend math in `@aura3d/animation` (`AnimationMixer.ts:364-425`) | facade over `PoseMixer` | P1 |
| engine `AnimationController` internal pose blender for GLB clips | delegate to actor `PoseMixer` | P1 |
| substring bone masks | deprecated selector | P1 |
| `CrowdAnimation.ts` (25-line stub) | delete or mark experimental (no consumers) | P1 |
| `primitiveMouthVisemeExample` as the default lip-sync example | replace default with morph-viseme on the template hero; keep primitive as `fallback` | P4 |
| Aura Clash `fighterInertializedWeights` frozen-pose crossfade, root squash, `sin` idle sway | replace with mixer inertialization and additive breathing clip | P5 |

## 8. Shader changes (GLSL ES 3.00; WGSL equivalents noted)

### 8.1 Skinning chunk (`ShaderChunks.ts` `skinning_common`, replaces `:516-573`; lands in P1 T1.12, not P0)

P0 (T0.12) reuses the **existing** `skinning_common` chunk (`a3dSkinMatrix4`/`a3dSkinMatrix8`, uniform-array or data-texture mode) in the new depth variants, so P0 does not depend on this chunk. The code below is the P1 replacement.

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

### 8.2 Morph chunk (new; based on `MorphTargetPlan.ts` texture mode)

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

### 8.3 Common deformation entry (used by PBR, depth, velocity)

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

### 8.4 Depth variants (`ShaderLibraryCore.ts:784-806` → `registerDepthShaderFamily`)

```glsl
// vertex
uniform mat4 u_lightViewProjection; uniform mat4 u_modelMatrix;
void main() { vec4 p; vec3 n; vec4 t; a3dDeform(p, n, t);
#ifdef A3D_INSTANCING
  p = a_instanceMatrix * p;            // PRD 02 owns
#endif
  gl_Position = u_lightViewProjection * (u_modelMatrix * p); }
```

- The single `u_modelViewProjection` is split into light VP + model so the skinned path can transform correctly.
- **P0 form (T0.12).** `a3dDeform` and the §8.1 bone-texture chunk do not exist yet in P0. So the P0 depth variant includes the existing `skinning_common` chunk and computes `mat4 s = A3D_SKINNING == 8 ? a3dSkinMatrix8(a_joints, a_weights, a_joints1, a_weights1) : a3dSkinMatrix4(a_joints, a_weights); vec4 p = Σw > 1e-4 ? s * vec4(a_position, 1.0) : vec4(a_position, 1.0);`. It sets the palette uniforms through the same `applySkinningUniforms` function as ForwardPass, moved to `SkinningUniforms.ts`. Morph casters in P0 draw the CPU-morphed geometry from `resolveRenderGeometry`. In P2 (T2.2) both forward and depth switch to `a3dDeform`.
- `a_normal` and `a_tangent` are compiled out in depth (`A3D_DEPTH_ONLY` makes `a3dDeform` skip normal and tangent work). Shadow VS cost is therefore position + morph position + palette fetches only.
- Point-light faces and CSM cascades reuse the same variant with a different `u_lightViewProjection`.
- Variant key: `depth|skin:{0,4,8}|morph:{0,1}|inst:{0,1}|alpha:{0,1}`. Expected live variants per scene are ≤ 6.

### 8.5 Velocity variant (with PRD 03)

```glsl
out vec4 v_currClip; out vec4 v_prevClip;
void main() {
  vec4 p; vec3 n; vec4 t; a3dDeform(p, n, t);
  vec4 pp = a3dDeformPrevious();     // morph with u_morphPrevWeight4, skin with u_prevBoneTexture
  v_currClip = u_viewProjectionUnjittered * u_modelMatrix * p;
  v_prevClip = u_prevViewProjectionUnjittered * u_prevModelMatrix * pp;
  gl_Position = u_viewProjection * u_modelMatrix * p;
}
// fragment: o_velocity = (v_currClip.xy / v_currClip.w - v_prevClip.xy / v_prevClip.w) * 0.5;
```

### 8.6 PBR integration

- `SkinnedLitMaterial` emits `A3D_SKINNING` + `A3D_MORPH` defines into the **PRD 01** PBR program.
- Delete from the skinned path:
  - both hand-copied fragments (`ShaderLibrary.ts:564-1057` 4-influence and `:1090-1587` 8-influence; E24);
  - their single `u_shadowMapMatrix` (characters gain CSM through PRD 02);
  - the stripe environment specular;
  - the material-embedded filmic `a3dPbrEncodeOutput` (tone mapping moves to PRD 03);
  - the `sin(p.x*230)` wrinkle noise (`ShaderLibrary.ts:782-786`, duplicate `:1312-1316`).
- `u_wrinkleStrength` stays a hook. Real wrinkle normal maps are PRD 04 scope.

### 8.7 WGSL (WebGPU, PRD 11 co-owned)

- `@group(1) @binding(0) var<storage, read> bones: array<mat4x4<f32>>;`, with `prevBones` alongside.
- Morph: `texture_2d_array<f32>` + `textureLoad(morphTex, vec2<i32>(x, y), target, 0)`, with an active list in a uniform struct `array<vec4<f32>, 16>` (index, weight packed).
- `@builtin(vertex_index)`, identical ordering.
- `WebGPUSkinningLimits.ts`: `MAX_WEBGPU_SKINNING_JOINTS` stops being the palette capacity, and the `decideSkinningPalettePath` default `maxDataTextureJoints` becomes `MAX_SKINNING_JOINTS` (1024, `ForwardPass.ts:115`), so a rig above 96 joints never routes to CPU or to a zero palette (E27). `WebGPUDevice` stops packing `u_jointMatrices` into the 96-slot uniform struct (`:2249-2251`, `:3447`) and binds the storage buffer instead.

## 9. Rendering changes

1. **DepthPass.**
   - `drawCaster` resolves a variant via `resolveDepthShaderVariant(caster)`, binds the bone texture through the shared `SkinningPaletteTextureCache` (same texture the forward pass uses this frame; no second upload), and binds the morph texture and active list.
   - `ShadowPass` constructs `DepthPass` per render. The variant cache must therefore be static, as the existing shader cache already is (`DepthPass.ts:30-43`).
2. **Palette lifetime.**
   - The palette is uploaded once per skin per frame, before any pass, in `Renderer` frame prep.
   - Forward, depth and velocity passes only bind it. `RenderItem.skinning.paletteKey` identifies the skin instance. It is the `GLTFAnimationRuntime` skinning-binding object, which lives as long as the actor's runtime and is unique per actor and skin. It is not the `renderable.skinning` object, which is replaced every frame (E40).
   - Textures are released on actor dispose by calling `Texture.dispose()`. That is the only path `WebGL2Device.releaseDisposedTextureHandles` frees (E21). Diagnostics report `createdThisFrame`, which must be 0 after warm-up.
3. **Morph textures** are built at geometry upload, cached on a `WeakMap<Geometry, MorphTargetTexture>`, and disposed with the geometry. Per frame, only uniforms are updated.
4. **Culling.** `skinnedItemLocalBounds` (`Renderer.ts:2295-2305`) uses joint AABBs. Shadow caster culling (PRD 02) uses the same bounds, so a crouching character's shadow box does not use bind bounds.
5. **Static batching** keeps excluding skinned and morph items (`Renderer.ts:2388-2397`, per research/19 C4).
6. **Temporal.** `TemporalHistory.ts:73-74` no longer throws for skinned or morph items whose material compiles `A3D_VELOCITY`. Transparent items stay excluded.
7. **Shader warm-up.** On asset load, precompile forward + depth (+ velocity when TAA is on) variants for each skinned/morph material, and do not draw the actor until its programs are linked. This prevents the first-frame hitch that research/09 attributes to depth recompiles. `WebGL2Device` has no `KHR_parallel_shader_compile` support today (`rg parallel_shader packages/rendering/src/WebGL2Device.ts` → 0). T2.8 therefore adds `RenderDevice.compileAsync(shader): Promise<void>`, which polls `COMPLETION_STATUS_KHR` when the extension exists and links synchronously otherwise.
8. **Diagnostics** (feeds PRD 12 evidence; not a quality claim):
   - `animation.actors[]`: active actions, tracksApplied, mixer ms, constraints ms, springs ms, palette bytes, morph active/dropped.
   - `shadows.skinnedCasters`, `shadows.morphCasters`.

## 10. Migration plan

1. **P0 is behaviour-fixing and has no API break.**
   - Controller bindings switch to `drive: "clips"` by default. Apps that relied on the freeze (none intentionally; research/19 C16 found only gallery-shift and fighting-game) start animating.
   - Visual goldens for gallery-shift, the fighting-game template, and benchmarks 08, 15 and 18 are re-baselined with a vision + human review. A blind update is not allowed.
2. **P1 changes root defaults** (crossfade 0.2 s, speed honoured, strict clip names, rest reset).
   - A codemod `node tools/codemods/animation-3.1.mjs [--write]` (root script `pnpm codemod:animation-3.1`; no `aura3d migrate` CLI command exists today) scans `apps/**`, `packages/create-aura3d/templates/**` and `examples/**` for `.animate({clip})`, `node.play(` and `resolveGLTFClipName` callers. It reports clip names that do not resolve **exactly** against the asset's `metadata.animations` in that app's `aura-assets.ts`. Example: `apps/world-war-x-showcase/src/WorldWarXApp.ts:1071` requests `"idle-ready"` with `speed: 0.44` (research/09 §3.4).
   - For each miss, the codemod writes the nearest real clip name, or `fallback: "first"`, with a `// TODO(animation-3.1)` marker.
   - Existing three.js parity specs whose expectations encode today's renormalised blend (`tests/browser/threejs-parity-skinning-{blending,additive,ik}-parity.spec.ts`, `tests/unit/agent-api/animation-mixer-root-e3.test.ts`, `tests/unit/animation/animation-controller.test.ts`) are updated in the same PR as T1.3/T1.11. Every changed expectation cites the three r185 value it now matches.
3. **P1 stack collapse.**
   - `@aura3d/animation` `AnimationMixer` keeps its public signature as a facade. Its internal blend math is deleted.
   - `@aura3d/animation` `AnimationController` keeps its public API, and `blendStates` delegates to `PoseMixer` for compiled clips (E38).
   - `GLTFSceneAnimationRuntime.applyClips` keeps its signature and is re-implemented on `PoseMixer`.
   - The engine controller keeps its public API, and its pose blend is used only for `drive: "pose"` clips that have samplers.
4. **P2 shader unification.**
   - `SkinnedLitMaterial` constructor options are mapped to PBR options one-to-one.
   - Uniform names declared in `SkinnedLitMaterial.ts:225-229` (`u_jointCount`, `u_jointMatrices`, `u_jointPaletteMode`, `u_jointPaletteTexture`, `u_jointPaletteTextureSize`) are accepted and ignored with a one-time deprecation warning for one release. The bone texture is bound by the renderer, not by material parameters.
5. **Templates and skills** are updated in the same PR as each phase (§15 tasks). Generated projects pin `@aura3d/engine`, so existing scaffolds are not silently changed.
6. **Games** migrate in PRD 14 order. This PRD provides per-game acceptance (§17).

## 11. Backward compatibility

| Surface | Compatibility |
|---|---|
| `bindRuntimeNode({ applyPose })` | `applyPose:false` → `drive:"clips"` (same as new default). `applyPose:true` explicitly → `drive:"pose"`; it warns if any bound clip lacks a sampler. Removed in the next major release. |
| `node.play` without `crossFade` | **Behaviour change**: 0.2 s crossfade. Opt out with `crossFade:false`, or app-wide `createAuraApp({ animation: { defaults: "3.0" } })` for one minor release. |
| `speed` | **Behaviour change**: now applied. Apps that set `speed` and relied on it being ignored get different timing. The codemod lists them (world-war-x `.animate({speed:0.44})`). |
| Clip-name miss | Was the first clip, now a warning + no-op. `fallback:"first"` restores the old behaviour. |
| Weight < 1 on a single base action | Was full strength, now blends with rest. `createAuraApp({ animation: { mixer: "legacy" } })` keeps the old math for one minor release (facades only). |
| Additive scale | Today's additive path (glTF runtime and `@aura3d/animation` mixer) multiplies absolute sampled values (E16). It is now a three-style subtractive delta. Clips authored against the old behaviour must be re-made additive with `makeClipAdditive`. |
| WebGPU rigs above 96 joints | Were most likely zero-palette (E27). They now skin correctly, so visual goldens change. |
| `GLTFSceneAnimationClipBoneMask` substring | Still accepted, deprecated warning once per mask. |
| `SkinnedLitMaterial` | Same class name, now PBR-backed. Visual diffs are expected (gains IBL/CSM), so re-baseline with review. |
| Joint counts ≤ 96 | Same visual output. Internals use the bone texture. |
| `MAX_GPU_MORPH_*` exports | Kept as deprecated constants; no longer limit anything. |
| `setAnimationPose` | Kept. An empty pose is rejected (throw under `animation.strict`, otherwise warn-once). |
| Evidence fields (`skinnedClipPlaybackProvenAtRoot`, `visibleMotionSource`) | Ignored by gates. Removal is PRD 12/14. |

## 12. Dependencies on other PRDs

| PRD | Dependency | Direction |
|---|---|---|
| 01 Rendering Core | PBR program with define composition; skinned PBR joins it (R6). Scene-graph matrix composition (research/19 C6: group transforms add Euler angles) affects props attached to bone sockets | 06 needs 01's define system before P2; P0 can land on the existing skinned shader |
| 02 Lighting/Shadows | DepthPass variant framework (instancing, alpha-test, batched casters), shadow strength (bridge constant ≈ 0.24-0.32 washes out shadows, research/22 §08/§15), CSM reachability from root (research/19 C5), shadow map size API. 06 adds the skinning/morph variants. **Benchmark 08/15/18 shadow acceptance needs both** | co-delivery; 06 P0 skinned variant can ship before 02's strength fix, but visual sign-off requires both |
| 03 Post/AA/Tone | Velocity buffer contract and TAA consumer for R7. Tone mapping removed from the skinned material | 06 P2 provides the velocity variant; 03 consumes |
| 04 Materials/glTF | Tint override wipes textures (`replaceSurfaceTextures:true`, research/19 C3); Aura Clash fighters "read as clay mannequins" (research/21). Skin and cloth shading (sheen, SSS approximation), wrinkle normal maps, KTX2 | hero acceptance (§17) blocked on 04's tint fix |
| 05 Asset Pipeline | Clip durations and root-motion flags in inspection/typegen (E8). Rigged textured hero acquisition, Meshy rig, licensed retarget library, hero LODs, validator rules (reject 4-tri card heroes). A combat-clip fighter pair for the `fighting-game` template (E9b) | 06 P0 needs `duration` in typegen. T0.9b needs a fighter pair (the Aura Clash rigs `auraClashPlayerRig`/`auraClashRivalRig` are the candidates if PRD 05 clears them for the public catalog). P4 needs the hero |
| 07 VFX | Bone sockets for hit sparks, trails and muzzle flashes (`node.socket(bone)`). Dash afterimage reads as a glitch in Aura Clash (research/21) | 06 provides sockets in P3 |
| 08 Camera/Game Feel | Follow/shoulder camera framing the hero (fighters at 25-33% of frame height, research/21), hitstop (pauses the mixer via `mixer.timeScale`) | 08 consumes `PoseMixer` timescale |
| 09 Shared Game Runtime | Hosts `game.characterAnimation`, top-down mover kit (research/16 row 18) | 06 defines the binding; 09 hosts the namespace |
| 10 World/Environment | Ground raycasters for foot IK (heightfield, mesh colliders) | 06 consumes `GroundRaycaster` |
| 11 WebGPU/Perf tiers | Storage-buffer palettes (E27), WGSL variants, tier detection that sets `A3D_MORPH_MAX_ACTIVE`, skinned-caster limits (until it lands, `animation.tier` is explicit), `RenderDevice.compileAsync`. Frame-time gap (most games 5-15 fps on macos-14) is 11's | shared |
| 12 Benchmark/Regression | Animated-pose variant of scene 08, crossfade filmstrip, morph face, IK slope, character-hero scenes; region-masked metrics (shadow ROI, character mask); motion metrics harness; frame-burst capture in `tools/quality-rebuild-capture`. **Scene ids:** PRDs 01, 02, 03 and 04 all claim numeric ids 19+, so PRD 06 scenes use the `p06-` prefix, and PRD 12 assigns final indices | 06 defines scene content and thresholds; 12 owns harness |
| 13 Agent Authoring/Skills | Rewrite `aura3d-character-animation` SKILL.md; template defaults | 06 provides content |
| 14 18-Game Rebuild | Game adoption order and art direction | 14 consumes §17 gates |
| 15 API/Package Consolidation | Collapsing five animation stacks; package boundary (`pose/` in `@aura3d/animation`, evaluator binding in `@aura3d/assets`) | 06 executes the animation part under 15's rules |

## 13. Performance budgets

Measured per frame at the stated character load. "CPU" is the animation update: mixer + inertializer + constraints + springs + palette build + uploads, reported by the engine as `diagnostics.animation.cpuMs` (§9.8, `performance.now()` around the animation phase), median over 600 frames after 120 warm-up frames.

"GPU" is the extra GPU time from skinning and morph in the forward + shadow + velocity passes compared with the same meshes rigid. It is measured in a **dedicated tier scene** (`p06-perf-tier-{low,medium,high,ultra}`: the stated load on a ground plane, one directional shadow, no post). Do not use game routes, where 5-15 fps frames bury a 1 ms delta in noise. Use `EXT_disjoint_timer_query_webgl2` where the browser exposes it. It is usually absent on macOS Chrome/ANGLE and on Safari. Otherwise run on/off frame-time differencing: 5 alternating runs × 300 frames, with skinning on vs the same meshes frozen at bind pose (`renderer.skinnedShadows`/deformation disabled). A budget passes when the **upper bound of the 95% bootstrap CI** of the median delta is within budget.

The macos-14 paravirtual GPU is neither a desktop dGPU nor a mobile proxy. Its High/Medium numbers are recorded as "macos-14 proxy" and do not stand for real hardware (§19). The tier comes from `createAuraApp({ animation: { tier } })` until PRD 11's detection lands.

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

Regression rule: on games, the animation changes must not raise median frame time by more than 3% at equal content on the macos-14 capture (`tools/quality-rebuild-capture`, same commit-pair A/B in one workflow run, 3 runs each). Content changes such as replacing a 4-triangle card with a 25k-triangle hero are budgeted under the tier table.

Bundle delta is measured with `pnpm check:bundle-size` (`tools/bundle-size/index.ts`) on `@aura3d/engine` + `@aura3d/animation` + `@aura3d/rendering` gzip, as net change against the commit before P0. The per-recommendation KB figures in §6.10 are estimates. The ≤ +8 KB net figure is the gate, and it is the same for every tier because tiers do not change shipped code.

## 14. Implementation phases

Each phase ends with its exit criteria met on remote CI: `.github/workflows/test.yml` for unit, the `browser-matrix.yml` `prd06-animation-browser` job (macos-14, added by T0.0) for browser, and `quality-rebuild-capture.yml` (macos-14) for capture. No phase is "done" on a green test run alone. Visual exit criteria need the review in §17.

**Phase 0: Characters move, shadows follow (P0 bugs).** Scope: R1, R2, the R3 cache (with the E39 `Texture.update` prerequisite), the fighting-game template clips, and a minimal `node.animationState()`.
Exit criteria (each is an automated check in the named test; "visible" is never self-judged):
- Gallery-shift thief and guard-2: `node.animationState().tracksApplied > 0` on every frame of the capture burst (T4.8 burst, or in P0 30 consecutive frames read through `globalThis.__AURA3D_LIVE_APPS__.all()[i].diagnostics().animation`, the registry the capture tool already reads at `capture-games.mjs:371`). Thief in SPRINT vs SNEAK at the same normalised phase: hips height differs by ≥ 5 cm **or** mean knee flexion differs by ≥ 15°, read from `animationState().bones`. Asserted in `tests/browser/gallery-shift-thief-gait.spec.ts` (new).
- Fighting-game scaffold: every state in the template's `fighterClipMap` resolves to a GLB clip with `duration > 0` and `tracksApplied > 0` when played (T0.9 template test). States the default heroes cannot supply are reported as `FIGHTER_CLIP_STAND_IN` (T0.9) and are not counted as passing.
- Skinned shadows: `skinned-shadow.spec.ts` (T0.14) shadow-**shape** IoU ≥ 0.85 vs three on CesiumMan posed at t = 0.5 s. Shape uses a mask threshold relative to each engine's own unshadowed ground, so it does not depend on PRD 02 strength. On benchmarks 08b and 15, shape IoU vs three ≥ 0.8 with the PRD 12 mask. The darkening ratio is reported, not gated (it is gated in §17.1 after PRD 02).
- `SkinningPaletteUploadManager.diagnostics().texturesCreatedThisFrame === 0` after frame 10 on a 191-joint rig (T0.10 browser assertion).

**Phase 1: Root defaults + one mixer.** Scope: R4, §6.3, §6.4, codemod, removal of the 96-uniform path.
Exit criteria:
- The PoseMixer unit suite reproduces three.js r185 `AnimationMixer` output within 1e-4 (local TRS per bone, quaternions compared up to sign) on Soldier (`fixtures/threejs-parity/assets/character/soldier.glb`), Fox (`benchmarks/quality-rebuild/shared/assets.ts` `fox.repoPath`), CesiumMan (`fixtures/three-compat/assets/corpus/cesium-man.glb`) and RobotExpressive (`fixtures/threejs-parity/assets/character/robot-expressive.glb`) for:
  - single clip;
  - weight 0.3 (with rest);
  - three simultaneous actions at weights 0.5/0.3/0.4 (exercises incremental slerp order, §6.4);
  - crossfade at t = 0.1/0.2;
  - warp;
  - additive via `makeClipAdditive` (reference frame 0).

  The comparison is the three.js `PropertyMixer` result computed in the same Node test from `three@0.185.1` (already a repo-root devDependency, `package.json:739`). Load the GLBs on the three side with `GLTFLoader.parse` on the fixture bytes. Both sides step `update(dt)` with the identical dt sequence (1/60 × 120 frames).
- Transition continuity C ≤ 1.5 (§17.3) on all three transitions of `p06-crossfade-filmstrip`.
- Aura Clash regression A/B: for every clip key in `AURA_CLASH_REQUIRED_CLIP_KEYS` (`apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps.ts`), `tracksApplied` before and after P1 is equal (±0) when the clip plays alone.

**Phase 2: GPU deformation parity.** Scope: R5, R6, R7, R8, WGSL.
Exit criteria:
- `p06-morph-face` renders 52 targets on a lit skinned head at the Ultra cap (K = 64, so nothing is dropped), with 0 `Geometry` constructions per frame (constructor spy).
- Both skinned PBR forks are deleted (`rg DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME packages/rendering/src` → only the deprecated export). On benchmarks 08/15/18 the vision judge no longer lists "armor flatter / weaker specular" as an Aura deficiency (research/23 §15 #4, §18 #7). The automated gate is `skinned-pbr-parity.spec.ts` (T2.4).
- TAA on benchmark 15 runs without `TEMPORAL_UNSUPPORTED_GEOMETRY`. Limb ghosting: in the character mask, edge pixels present in frame N but absent from both the rendered frame N without TAA and the TAA frame N−1 reprojected by the velocity buffer must form no connected trail longer than 2 px (`taa-skinned-ghosting.spec.ts`, with PRD 03).
- WebGPU: a 191-joint rig renders with the same silhouette as WebGL2 (character-mask IoU ≥ 0.98) on `native-webgpu-functional-301.yml`.

**Phase 3: Constraints, root motion, retargeting, sockets.** Scope: R9, R11, §6.8 root motion, `node.socket`.
Exit criteria:
- `p06-ik-slope`: foot-to-ground penetration ≤ 1 cm and float ≤ 2 cm on a 20° slope and on 18 cm stairs (engine-reported foot-sole height vs `GroundRaycaster`, cross-checked by depth readback at the foot).
- Foot slide ≤ 2 cm per contact phase in Soldier Walk with root motion (§17.3 definition).
- The retargeted UAL locomotion set plays on CesiumMan and Soldier with no limb flips. A flip is automated as either (a) a local rotation jump > 90° between consecutive 60 Hz frames on any humanoid limb bone, or (b) a knee or elbow bending against the source clip's bend direction (sign of the dot product of the chain-plane normal with the source's, < 0) for more than 2 consecutive frames. Human review is still required (§17.2).
- Root-motion walk loop closure drift ≤ 1 cm per cycle (`measureRootMotionLoopClosure`, `RootMotion.ts:82`).

**Phase 4: Character binding, secondary motion, template hero.** Scope: R10, R12, `character-hero` template, `character-controller` upgrade, viseme default.
Exit criteria:
- Template hero passes §17.2 (vision ≥ 6.5 on character presentation and animation, plus the automated motion gates and human sign-off).
- Locomotion blend on a scripted 0 → 5 m/s ramp: normalised-phase difference between walk and run actions ≤ 1% of the cycle while both have weight > 0.05, and foot slide ≤ 2 cm walk / ≤ 3 cm run (§17.3).
- Spring accessory: after the root decelerates from 1 m/s to 0 within 0.1 s, the angular deviation of every chain bone from its settled pose is < 1° from 0.6 s onwards (`spring-bones.test.ts` + capture burst).

**Phase 5: Game adoption gates.** Scope: Aura Clash, gallery-shift, rooftop, skyline, neon-swarm and mech-hangar per §17.4, executed with PRD 14.
Exit criteria: per-game thresholds in §17.4 on the macos-14 capture with vision + human review.

## 15. Task checklist

Every task names a file, a function, the behaviour, and a test. "Unit" means vitest under `tests/unit/**`, run remotely by `.github/workflows/test.yml`. "Template" means `tests/templates/**` via `pnpm test:templates`. "Browser" means Playwright under `tests/browser/**`.

Today `browser-matrix.yml` runs **Chromium on ubuntu-latest only** (`browser-matrix.yml:19, 82`). It does not run on macos-14 and runs no WebKit or Firefox. Task **T0.0** therefore lands first:

- [ ] **T0.0** Add `playwright.animation-matrix.config.ts`, following the per-browser config precedent of `playwright.audio-webkit.config.ts`, with `chromium` (Chrome channel, `--use-angle=metal`, as in `remote-browser-301.yml:128-133`), `webkit` and `firefox` projects. Its `testMatch` lists the PRD 06 specs from §16.
  - Add job `prd06-animation-browser` to `browser-matrix.yml` with `runs-on: macos-14` and a matrix over the three projects. It installs the matching Playwright browsers and uploads reports and screenshots as artefacts.
  - Check: the job runs `animated-character-browser.spec.ts` green on all three projects on the current main before any other P0 task merges. That establishes the baseline.

"Browser" below means this job unless stated otherwise.

### Phase 0

- [ ] **T0.1** `packages/engine/src/agent-api/index.ts:13871`. Change the guard to `if (currentState.animationPose && Object.keys(currentState.animationPose.bones ?? {}).length > 0)`. Otherwise fall through to clip dispatch (T0.3).
  - Unit `tests/unit/agent-api/production-actor-dispatch.test.ts`: an empty pose plus `node.play("Walk")` must call `actor.playClip`/`applyClips`, not `applyRetargetedPose`.
- [ ] **T0.2** `index.ts:10982-10984` `setAnimationPose`. Reject poses with 0 bones and 0 morph targets:
  - store `undefined`;
  - warn once per node `ANIMATION_EMPTY_POSE` (through the existing `runtimeWarnings` set);
  - throw `ANIMATION_EMPTY_POSE` when the app was created with `animation: { strict: true }` (T0.19). Do not use `import.meta.env`, because the engine has no such convention and library builds would not get it.

  Unit `tests/unit/agent-api/runtime-node-empty-pose.test.ts` (new): strict and non-strict modes. A morph-only pose (0 bones, ≥ 1 morph) is still accepted.
- [ ] **T0.3** `AnimationController.ts` `createRuntimeNodeAnimationBindingMetadata` (`:2316-2341`). Add `clipSamples: snapshot.clipSamples`, which `createRuntimeNodeClipSamples` (`:2370-2384`) already computes as `AuraAnimationRuntimeClipSample` (`:465-472`), and add a per-sample `mask` taken from the state's `layerMetadata.bodyMask`.
  - In `RuntimeNodeHandle.ts:63-90`, add `readonly clipSamples?: readonly AuraActorClipSample[]` to `AuraRuntimeNodeAnimationBindingMetadata`.
  - In `index.ts` `applyProductionActorAnimation` (`:15070`), when `animationBinding.clipSamples?.length` is non-zero and `animationBinding.rootMotion` is unset, call `entry.actor.animation.applyClips(samples)` instead of `playClip`. Map each sample to `GLTFSceneAnimationClipSample` (`GLTFAnimationRuntime.ts:145-156`) as `{ clipName: entry.actor.animation.resolveClipName(s.clipName), time: s.localTime, weight: s.weight, additive: s.additive, mask }`. Drop samples whose name does not resolve, and warn `ANIMATION_CLIP_NOT_FOUND` once. The root-motion branch (`:15086-15114`) keeps its existing sample path.
  - Unit `tests/unit/agent-api/production-actor-dispatch.test.ts`: controller `crossFade("walk", 0.2)` advanced 0.1 s → `applyClips` receives two samples with weights 0.5 ± 0.01 each.
- [ ] **T0.4** `AnimationController.ts:1823`. Make the default `drive: "clips"`: call `setAnimationPose` only when `drive === "pose"` or the active clip has a `sample` function or non-empty `tracks`. Keep `applyPose` as an alias (§11).
  - Unit `tests/unit/animation/animation-controller.test.ts`: an embedded-name registry produces no `setAnimationPose` call.
- [ ] **T0.5** `AnimationController.ts:1780-1796` `sampleSinglePose`. When a clip has no sampler and is embedded (`metadata.source === "embedded-glb-animation-name"`), return `undefined` (not `emptyPose`), and have `captureRuntimeNodeBindingPose` propagate `undefined`. Stop using `createIdentityPose` as the implicit fallback at `:1492`.
  - Unit: a registry with a `skeleton` list must not emit identity poses (research/19 C16 counter-evidence).
- [ ] **T0.6** `AnimationController.ts` `bindRuntimeNode` (`:853`). It stays synchronous. If the node exposes `resolveAnimationClips()`, start the promise. Until it settles, mark the binding `pending` and skip `applyRuntimeNodeBinding` for it. On resolve, replace each `durationSource: "defaulted"` duration with the real one (`durationSource: "runtime"`), then apply. On reject, warn `ANIMATION_CLIP_RESOLVE_FAILED` and stay pending.
  - In `index.ts`, add `resolveAnimationClips()` to `AuraRuntimeNodeHandle` (`:10497`). It resolves after the production actor loads, from `entry.actor.animation` clip names and durations, and resolves to `[]` for non-model nodes.
  - Unit with a fake actor: duration 1.0 → 2.367 after resolve, nothing is pushed while pending, and looping wraps at 2.367.
- [ ] **T0.7** `packages/aura3d-cli/src/asset-inspection-types.ts:12-19`. Add `duration: number` (the max over the clip's samplers of the input accessor's `max[0]`; when `max` is absent, read the accessor data), `hasRootMotionCandidate: boolean` (hips/root translation track with net XZ displacement > 5 cm), and `frameRate?: number` (median input-time delta, inverted).
  - Populate them in `inspectGltfAnimations` (`packages/aura3d-cli/src/index.ts:2112`). It already has the glTF JSON, so `accessors[sampler.input].max` is available.
  - In `asset-manifest.ts:63-65`, emit `animationClips: [{ name, duration, channelCount }]` and keep the string array under `animations`. The engine already prefers `metadata.animationClips` over `metadata.animations` (`AnimationController.ts:2611`), so this is enough for the controller to see real durations.
  - Unit `tests/unit/aura3d-cli/asset-inspection-animation.test.ts` on `fixtures/threejs-parity/assets/character/soldier.glb`: Walk duration matches three r185 `GLTFLoader` `AnimationClip.duration` within 1e-3.
- [ ] **T0.8** `AnimationController.ts:2668-2704` `embeddedClipToDefinition` (object branch). This branch already reads `input.duration` (`:2677`) and writes `durationSource: "metadata"` (`:2702`), so no new logic is needed. The task is a guard test: a registry built from T0.7's typed manifest (`assets.x` with object `animationClips`) produces real durations before load and never `durationSource: "defaulted"`.
  - Unit in `tests/unit/animation/animation-controller.test.ts`.
- [ ] **T0.9a** `templates/fighting-game/src/game/fighters.ts:57-79`. Delete the `tracks: []` / `poseBakedFallback: true` clip definitions.
  - Add `fighterClipMap: Record<FighterAssetKey, Record<FighterClip, { clip: string; standIn?: true }>>`, modelled on `apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps.ts`. Validate it at startup against `assets.<hero>.metadata.animations`.
  - For today's default heroes (E9b), the map is explicit about stand-ins:
    - player `showcaseWalkAnimatedGirl`: every state → `"Take 001"`, with `standIn: true` on all but `walk`;
    - rival `showcaseRunnerRobot`: idle → `IDLE`, walk → `WALK`, dash → `RUN`, the rest → `IDLE` with `standIn: true`.
  - A mapped clip that is absent from the asset throws `FIGHTER_CLIP_MISSING` with the list. Each stand-in emits one `FIGHTER_CLIP_STAND_IN` warning, and the HUD readiness panel lists them, so a scaffold can never silently claim combat animation.
  - Update `main.ts:190-197` (controller creation and bind) and `:430-445` (`syncFighterAnimation`) to look up clips through the map.
  - Template test `tests/templates/fighting-game.test.ts` (new; picked up by `tests/templates/vitest.config.ts` `include`, run with `pnpm test:templates`): scaffold → every state resolves to a GLB clip with duration > 0. The stand-in count equals the declared count. Unmapped states → test failure.
- [ ] **T0.9b** (blocked on PRD 05) Swap the template's default fighters to a pair with a real combat set (idle, walk, jump, dash, guard, light, heavy, special, hitstun). Candidates are `auraClashPlayerRig`/`auraClashRivalRig` if PRD 05 admits them to the public catalog. When swapped, `standIn` count must be 0, and the template test asserts that.
- [ ] **T0.10a** (prerequisite, E39) `packages/rendering/src/Texture.ts`. Add `revision` and `update(data, region?)` (§7.3). `update` stores a reference with no clone, bumps `revision`, and throws for compressed formats.
  - `WebGL2Device.ts`: allocate once with `texStorage2D`. When `texture.revision` differs from the last uploaded revision, re-upload with `texSubImage2D` (whole texture or region). Same in `LeanWebGL2Device.ts`.
  - `WebGPUDevice.ts`: `queue.writeTexture` on revision change.
  - Unit `tests/unit/rendering/texture-update.test.ts` with the mock GL: 100 updates → 1 `texStorage2D`, 100 `texSubImage2D`, 0 `texImage2D`, and 0 new `WebGLTexture`s.
- [ ] **T0.10** `packages/rendering/src/ForwardPass.ts:1942-2036`. Move `applySkinningUniforms` into the new `packages/rendering/src/SkinningUniforms.ts` (shared with DepthPass in T0.13). Replace `createSkinningPaletteTexture` with `SkinningPaletteTextureCache` (new file `packages/rendering/src/SkinningPaletteTextureCache.ts`).
  - Key by `skinning.paletteKey` (T0.11), create the texture once per key, and call `texture.update(matrices)` at most once per key per frame (frame id from the renderer).
  - Cache the zero-filled `Float32Array(96*16)` for the still-declared uniform array and the `Sampler`/`TextureBinding` per key, instead of allocating them per draw (E21).
  - `release(key)` calls `texture.dispose()`. `TypedGLBActor.dispose` releases its keys.
  - `SkinningPaletteUploadManager.diagnostics()` adds `texturesCreatedThisFrame`.
  - Unit `tests/unit/rendering/skinning-palette-cache.test.ts` with a mock device: 100 frames × 2 skins of 191 joints → 2 textures created in total, and 0 live textures after release.
  - Browser `animated-character-browser.spec.ts` (extend): `texturesCreatedThisFrame === 0` after frame 10.
- [ ] **T0.11** `packages/assets/src/GLTFAnimationRuntime.ts:1263-1293` `refreshSkinningPalettes`.
  - Allocate one `Float32Array(joints*16)` per skinning binding at bind time and write into it in place (replaces `:1270`).
  - Write `binding.renderable.skinning = { jointCount, matrices, paletteKey: binding }`, where `binding` is the stable per-skin entry of `this.skinningBindings` (E40).
  - Also replace the per-joint `multiplyMat4` allocations with in-place multiplies into scratch matrices.
  - `TypedGLBActor.collectRenderItems` (`TypedGLBActor.ts:302`) already forwards `renderable.skinning` and needs no change beyond the type (`SkinningPaletteBinding.paletteKey`).
  - Unit: across 10 frames `paletteKey` and `matrices` keep the same identity, and two actors of the same asset have different keys.
- [ ] **T0.12** `packages/rendering/src/ShaderLibraryCore.ts:784-806`. Replace `registerLeanDepthShader` with `registerDepthShaderFamily`. It registers `aura3d/depth` with variant defines `A3D_SKINNING` (0/4/8) and `A3D_MORPH_CPU` (0/1, where 1 only marks the caster for diagnostics in P0), using the **P0 form** in §8.4. Skinned variants `#include <skinning_common>` (the existing chunk, `ShaderChunks.ts:516`).
  - The unskinned variant stays byte-identical to today's lean depth shader apart from the `u_lightViewProjection`/`u_modelMatrix` split.
  - Unit `tests/unit/rendering/depth-shader-variants.test.ts`: the variant source contains `a3dSkinMatrix4` iff `A3D_SKINNING == 4`, and `a3dSkinMatrix8` iff 8. Every variant compiles through the mock `ShaderModule`. Variant count ≤ 6.
  - The anti-divergence check (depth and forward share one `a3dDeform`) moves to T2.2, where `a3dDeform` first exists.
- [ ] **T0.13** `packages/rendering/src/DepthPass.ts:59-87` `drawCaster`.
  - Resolve a variant with `resolveDepthShaderVariant(caster)`. Change the static cache (`:41`) to `WeakMap<ShaderLibrary, Map<variantKey, ShaderModule>>`.
  - Set `u_lightViewProjection` + `u_modelMatrix`. When `caster.skinning` is set, call the shared `applySkinningUniforms` (T0.10), so ≤ 96 joints use the uniform array and > 96 use the cached palette texture: the same binding ForwardPass used this frame, with no second upload.
  - Morph casters in P0 use the same CPU-morphed geometry as ForwardPass (`resolveRenderGeometry`) and dispose it in `finally`. P2 replaces this with the texture morph.
  - `DepthMaterial` (`:15-27`): `requiredAttributes` stays `["a_position"]`. The skinned variants declare `a_joints`/`a_weights` (+ `a_joints1`/`a_weights1`) in their own module's required attributes.
  - Unit: a skinned caster draw command carries `u_jointMatrices` (65 joints) or `u_jointPaletteTexture` (191 joints) and selects the skinned variant. A rigid caster's command is unchanged from today.
- [ ] **T0.14** Browser test `tests/browser/skinned-shadow.spec.ts` (new) with harness `tests/browser/skinned-shadow-harness.ts` + `.html`:
  - CesiumMan (`fixtures/three-compat/assets/corpus/cesium-man.glb`) posed with clip 0 at t = 0.5 s. One directional light at elevation 50°, azimuth 30°, orthographic shadow camera, 2048² map. A 6 m receive-only ground plane at y = 0. Camera straight down at the plane, 1024², no post, no tone mapping.
  - Render each engine twice: casters on, and the character's `castShadow: false`. Shadow mask = pixels where luma(on) < 0.9 × luma(off). The mask is relative to each engine's own lit ground, so it measures shape, not strength.
  - The three r185 side runs in a second canvas in the same page with the same parameters (the pattern used by `tests/browser/threejs-parity-skinning-*-parity.spec.ts`).
  - Assert IoU(Aura mask, three mask) ≥ 0.85, and Aura mask area ≥ 0.8 × three's.
  - Also capture the Aura shadow map for scene 08 before/after T0.13 and attach it, to resolve the §2 benchmark-08 hypothesis.
  - Runs on macos-14 in the `browser-matrix.yml` `prd06-animation-browser` job (T0.0).
- [ ] **T0.15** `benchmarks/quality-rebuild/shared/scenes.ts`. Add scene `08b-skinned-character-posed`: CesiumMan, clip index 0 at t = 0.75 s, same lights and camera as `08-skinned-character` (`scenes.ts:174`). Implement it on both the `benchmarks/quality-rebuild/aura3d` and `/three` sides, coordinated with PRD 12.
  - Capture via `benchmarks/quality-rebuild/ci.sh` on macos-14. The vision review is §17.1.
- [ ] **T0.16** `packages/create-aura3d/skills/aura3d-character-animation/SKILL.md:51-74`. The code pattern itself is already correct once T0.1-T0.6 land, because it uses `bindRuntimeNode(hero, { defaultClipId: "idle" })`. What is wrong is the guidance around it.
  - Replace `requiredClips: ["idle", "walk", "sprint"]` with a `clipMap` from action to the asset's real clip names, read from `assets.hero.metadata.animations`, and tell the agent to run `assets inspect --animation` first.
  - Add `createAuraApp(..., { animation: { strict: true } })` to the example.
  - Add "verify `node.animationState().tracksApplied > 0`" as a precondition only, not as proof of quality.
  - Test `tests/unit/create-aura3d/character-animation-skill.test.ts` (new): extract the first `ts` block, type-check it against `@aura3d/engine` public types with a fixture `assets.hero` whose clips are `["Idle","Walk","Run"]`, and assert that every clip name it passes exists in that fixture. It also asserts the text contains no `poseBakedFallback` and no `applyPose`.
- [ ] **T0.17** `apps/showcase-gallery-shift/src/main.ts:1145-1177`. Confirm the thief and guard-2 controllers now drive clips. Keep the `sin(frameCount/34)` flashlight sweep at `:1371`: it is a gameplay sight-line cue, not body sway (E32).
  - Browser `tests/browser/gallery-shift-thief-gait.spec.ts` (new): the Phase 0 exit criteria (tracksApplied every frame, and sprint vs sneak hips-height or knee-flexion difference).
- [ ] **T0.18** Minimal `node.animationState()` on `AuraRuntimeNodeHandle` (`index.ts:10497`), returning `{ activeClip, tracksApplied, skinningPalettesUpdated, bones?: Record<string, { rotation: Quat; position: Vec3 }> }` from the production actor's last apply result (`TypedGLBActor.ts:357-390` already collects `lastApply`). Bones are populated only when `diagnostics.animation.bones: string[]` names them, so the cost is opt-in. Surface the same data under `app.diagnostics().animation.actors[]`.
  - Unit: after `node.play("Walk")` and 2 frames, `tracksApplied > 0`, and the named bone's rotation changes between frames.
- [ ] **T0.19** `createAuraApp` options (`index.ts` ~`:10780-10830`). Add `animation?: AuraCreateAppAnimationOptions` (§7.1) and `renderer.skinnedShadows`. P0 implements `strict` and `skinnedShadows`. `defaults`, `mixer` and `tier` are accepted and validated now, and implemented in P1/P2. Type test in `tests/unit/agent-api/animation-spec-types.test-d.ts`.

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
- [ ] **T1.8** `GLTFAnimationRuntime.ts:110-136` `resolveGLTFClipName`. Add `options?: { fallback?: "error" | "first" }`, with default `"error"` → `undefined`.
  - Update `index.ts:15079-15083` to warn `ANIMATION_CLIP_NOT_FOUND` with the available names.
  - Unit: `"idle-ready"` against `["Take 001"]` → `undefined` + warning; with `fallback:"first"` → `"Take 001"`.
- [ ] **T1.9** `index.ts` `ProductionRuntimeActorEntry`. Add `mixer: PoseMixer` and `baseAction`.
  - `applyProductionActorAnimation`: when `node.animation.clip` changes, `crossFadeTo(new, crossFade ?? 0.2, { warp })`, and honour `speed` via `setEffectiveTimeScale`.
  - `restPoseReset` defaults to true.
  - Remove the use of `resolveAnimationSeconds` for skinned clips. Keep it for model-transform clips.
  - Unit: switching Idle→Walk yields two-clip evaluation for 0.2 s; `speed: 0.5` halves the advance.
- [ ] **T1.10** `index.ts:1288-1304` `AuraAnimationSpec` and `AuraRuntimeNodeHandle` (`:10497-10520`). Add the fields in §7.1, plus `crossFadeTo`, `playLayer` and `stopLayer`, and extend T0.18's `animationState` to the full `AuraActorAnimationStateSnapshot` (active actions with weight/time/layer, mixer ms).
  - Type test `tests/unit/agent-api/animation-spec-types.test-d.ts`.
- [ ] **T1.11** `packages/animation/src/AnimationMixer.ts:364-425`. Delete `blendBase`/`additiveContribution` and route through `PoseMixer`.
  - Keep the public API.
  - `packages/animation/src/AnimationController.ts:662-700` `blendStates`: when every weighted state's clip is a `CompiledClip`, delegate to `PoseMixer.evaluate`. Otherwise keep today's path behind `mixer: "legacy"` semantics, and warn once that it renormalises (E38).
  - Existing `tests/unit/animation/*` pass, with expectations updated where they asserted renormalisation (each update cites the three r185 value).
- [ ] **T1.12** `packages/rendering/src/ShaderChunks.ts:516-573` (`skinning_common`). Replace the uniform-array palette with the §8.1 bone-texture chunk.
  - Delete `u_jointPaletteMode` and `u_jointMatrices[96]` from WebGL2 shaders, and the zero-filled `u_jointMatrices` upload (`ForwardPass.ts:1994`).
  - Update `applySkinningUniforms` (now `SkinningUniforms.ts`, T0.10) to always bind the cached bone texture.
  - The WebGPU device still consumes `u_jointMatrices` until T2.7. Until then, `SkinningUniforms` keeps setting `u_jointMatrices` **only** when `device.backend === "webgpu"`.
  - Unit: a 65-joint and a 191-joint palette both bind via texture on WebGL2.
  - Browser `tests/browser/animated-character-browser.spec.ts` and `skinning-over-cap.spec.ts` keep passing.
- [ ] **T1.13** New `tools/codemods/animation-3.1.mjs` with root `package.json` script `"codemod:animation-3.1": "node tools/codemods/animation-3.1.mjs"`. `--report` (default) prints JSON and `--write` edits files.
  - Inputs: `apps/*/src/**/*.ts`, `packages/create-aura3d/templates/*/src/**/*.ts`, `examples/**/*.ts`. For each, the sibling `aura-assets.ts` supplies the asset's `metadata.animations`.
  - Reports: (a) `.animate({ clip })` / `node.play(clip)` / `resolveGLTFClipName(clip, …)` whose clip does not match exactly; (b) every `speed:` in an animation spec; (c) `bindRuntimeNode(…, { applyPose: … })`.
  - Unit `tests/unit/tools/animation-codemod.test.ts` with fixture projects. It must flag `apps/world-war-x-showcase/src/WorldWarXApp.ts:1071` (`"idle-ready"`, `speed: 0.44`).
- [ ] **T1.14** New benchmark scene `p06-crossfade-filmstrip` (with PRD 12): Soldier Idle → Walk → Run crossfades at t = 0.5/1.5 s, 0.25 s fades, 8 frames at fixed times, on both sides (three uses `crossFadeTo(…, 0.25, true)`). The Aura side also emits per-frame bone rotations for the §17.3 continuity and foot-slide metrics, computed by `packages/animation/src/pose/MotionMetrics.ts` (new; not built on `MotionQuality.ts`, E42).
- [ ] **T1.15** Delete `packages/animation/src/CrowdAnimation.ts` (no consumers per research/09 §5) or move it to `experimental/`.
  - Check: `rg CrowdAnimation` → only the export removal.

### Phase 2

- [ ] **T2.0** (prerequisite, E39) `Texture` `dimension: "2d-array"` with `layers`. `WebGL2Device` allocates with `texStorage3D(TEXTURE_2D_ARRAY)`, uploads with `texSubImage3D`, and binds to `sampler2DArray` uniforms. `WebGPUDevice` uses `dimension: "2d"` with `depthOrArrayLayers`. Reflection must recognise `sampler2DArray` uniforms.
  - Unit with the mock GL: a 3-layer RGBA16F array → one `texStorage3D` and 3 layer uploads. Browser: one `texelFetch` from layer 2 returns the uploaded value (WebKit included, §18).
- [ ] **T2.1** `packages/rendering/src/MorphTargetPlan.ts`. Add `buildMorphTargetTexture(geometry, targets, limits, "rgba16f")`, which packs the §8.2 layout and returns the fallback reason when `targets > MAX_ARRAY_TEXTURE_LAYERS` or width × height > `MAX_TEXTURE_SIZE²`.
  - Unit: 20k verts × 52 targets → 1 array texture, ≈ 16.6 MB at stride 2.
- [ ] **T2.2** `ShaderChunks.ts`. Add the `morph_texture` chunk (§8.2) and the `deform` chunk (§8.3). Switch the forward PBR and depth variants to `a3dDeform`.
  - `ForwardPass.ts:312-313`: when `item.morphTargets` is set and the texture plan succeeds, bind the texture + active list and draw `item.geometry` unchanged.
  - Delete `applyGpuMorphUniforms` (`:1855-1940`) and `MAX_GPU_MORPH_*` uses.
  - Unit: lit + skinned + morph item → 0 `Geometry` constructions per frame (spy on the constructor).
  - Unit (anti-divergence, research/09 rec 1): the forward, depth and velocity programs all `#include <deform>`, and none of them defines its own skinning or morph math (`rg "a3dSkinMatrix|a3dApplyMorph" ShaderLibrary*.ts` matches only the chunk).
- [ ] **T2.3** CPU fallback in `resolveRenderGeometry`. Write into one persistent dynamic vertex buffer per item (`bufferSubData`), not `new Geometry` + `dispose` (`ForwardPass.ts:343-349`).
  - Unit: 100 frames → 1 buffer.
- [ ] **T2.4** `ShaderLibrary.ts`. Delete the skinned lit fork (`:565` onward) and the duplicate wrinkle noise (`:784`, `:1314`).
  - `packages/rendering/src/SkinnedLitMaterial.ts`: becomes a thin subclass of the PRD 01 PBR material setting `skinning: 4|8`, with uniform aliases.
  - Browser `tests/browser/skinned-pbr-parity.spec.ts`: the Soldier rendered with SkinnedLit equals the same mesh frozen in bind pose with static PBR within ΔE2000 ≤ 2 on 99% of pixels.
- [ ] **T2.5** Velocity variant (§8.5).
  - `SkinningPaletteTextureCache.swap()` once per frame after all passes.
  - `TemporalHistory.ts:73-74`: allow skinned and morph items when the shader declares `A3D_VELOCITY`.
  - Unit: no throw. Browser `tests/browser/taa-skinned-ghosting.spec.ts` (with PRD 03): Soldier walking under TAA, limb ghosting measured as in the Phase 2 exit criteria (≤ 2 px trail).
- [ ] **T2.6** `Renderer.ts:2295-2305` `skinnedItemLocalBounds`. Replace `computeSkinnedGeometryBounds` (`packages/rendering/src/SkinningBounds.ts`) with per-joint local AABBs. Compute them once per `Geometry` at first use from the vertices each joint influences with weight > 0.01, in bind space, and cache them in a `WeakMap<Geometry, Float32Array>` in `SkinningBounds.ts`. `bindSkeleton` has no vertex data, so the computation cannot live there. Per frame, transform each box's 8 corners by that joint's palette matrix and take the union. The cache key moves from `Geometry` to `paletteKey`, so two actors sharing a geometry stop evicting each other (E26).
  - Unit: bounds contain all CPU-skinned vertices on 50 random poses of Soldier (conservative), and are ≤ 1.3× the volume of the exact bounds.
- [ ] **T2.7** WGSL equivalents in `packages/rendering/src/webgpu/` and `WebGPUDevice.ts` (with PRD 11):
  - storage-buffer bones sized to the rig, replacing the 96-slot `u_jointMatrices` packing (`WebGPUDevice.ts:2249-2251, 2944-2948, 3447`); morph `texture_2d_array`;
  - set the `WebGPUSkinningLimits.ts` `decideSkinningPalettePath` default `maxDataTextureJoints` to `MAX_SKINNING_JOINTS`;
  - after this lands, delete the T1.12 WebGPU-only `u_jointMatrices` upload.
  - Unit: `decideSkinningPalettePath({ jointCount: 191 })` → GPU path, not `cpu`.
  - Browser on `native-webgpu-functional-301.yml`: a 191-joint rig's character mask matches WebGL2 with IoU ≥ 0.98. Before T2.7, run the same test once and record the result as evidence for E27.
- [ ] **T2.8** Shader warm-up (§9.7). Add `RenderDevice.compileAsync(shader)` to `RenderDevice.ts`, implemented in `WebGL2Device` (`KHR_parallel_shader_compile` polling when present, else synchronous link) and `WebGPUDevice` (`createRenderPipelineAsync`). In `TypedGLBActor` load, precompile forward + depth (+ velocity) variants, and keep the actor's render items out of the draw list until every promise resolves.
  - Browser: the first visible frame of Aura Clash has no frame > 100 ms caused by program link (trace-based check in `animation-resource-lifecycle.spec.ts`).
- [ ] **T2.9** New benchmark scene `p06-morph-face` (with PRD 12): a licensed ARKit-52 head (asset via PRD 05), with viseme weights at a fixed frame (≤ 32 non-zero targets, so High tier drops nothing), rendered on both sides with identical weights.

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
- [ ] **T3.5** `TypedGLBActor`. Add `constraints` evaluated after the mixer and before the palette. Expose `node.ik.twoBone/footIk/lookAt/ccd`.
  - Unit: the constraint order is respected; weight 0 equals the pure clip bitwise.
- [ ] **T3.6** `node.socket(bone)`. Return a live world matrix after constraints, for PRD 07 VFX and prop attachment.
  - Unit: a socket follows the hand bone on the Soldier Walk.
- [ ] **T3.7** Root motion on the root path (§6.8). Generalise `index.ts:15086-15114` (E41) to any `play(clip, { rootMotion })`: remove the delta from the pose and call `consumer` or integrate into the node transform.
  - Unit: a Walk with root motion moves the node by the clip's displacement per cycle ± 1 cm, and the pose hips XZ stays fixed.
- [ ] **T3.8** `bakeRetargetedClips` in `packages/animation/src/pose/Retarget.ts`, using `HumanoidRetargeting.ts` mapping.
  - `actor.animation.addClipsFrom(source)` bakes in a Worker (`packages/animation/src/pose/retarget.worker.ts`) and caches by `(engineVersion, sourceHash, targetHash)` in IndexedDB.
  - Unit: retarget Soldier Walk → CesiumMan has no NaN, and hips height scales by leg ratio.
  - Unit: the limb-flip detector (Phase 3 exit (a)/(b)) reports 0 flips over the full clip.
  - Human review §17.2 of the rendered result.
- [ ] **T3.9** New benchmark scene `p06-ik-slope` (with PRD 12): Soldier Idle on a 20° ramp plus 18 cm stairs, foot IK on (Aura). three r185 has no foot IK, so its side uses `CCDIKSolver` (`three/addons/animation/CCDIKSolver.js`) on each leg toward the raycast ground point, as the closest public equivalent. Document in the scene description that the reference is approximate. Acceptance is the engine-reported metric (§17.1), not parity.

### Phase 4

- [ ] **T4.1** `packages/animation/src/SpringBones.ts:77`.
  - Add `bindSpringChainToSkeleton(chain, skeleton, boneNames)`, which initialises particles from bone world positions and writes local rotations aiming each bone at its simulated child after `step`.
  - Fixed-step accumulator at `substepHz`.
  - `node.springBones.add()` in `TypedGLBActor`.
  - Unit: a chain at rest under gravity 0 stays at rest pose within 1e-4; after a 1 m/s root stop, it settles below 1° oscillation within 0.6 s with the `"hair"` preset.
- [ ] **T4.2** `game.characterAnimation` (with PRD 09 namespace) in `packages/engine/src/agent-api/GameCharacterAnimation.ts` (new). Implement §7.1:
  - 1-D/2-D blend tree in one sync group;
  - airborne states, landing blend and actions on masked layers;
  - foot IK and look-at.
  - Unit with a scripted controller speed ramp 0 → 5 m/s: weights match the blend-tree spec and the walk/run phase stays aligned (sync error ≤ 1%).
- [ ] **T4.3** `templates/character-controller/src/main.ts:28,59,88`.
  - Replace `.animate({ clip: "Take 001" })` and the HUD-only `createLocomotionKit` weights with `game.characterAnimation(controller, hero, {...})`.
  - Replace the hero asset `showcaseWalkAnimatedGirl` (1 clip, `aura-assets.ts:12`) with the PRD 05 hero that has the §6.9 clip set.
  - Template test: required clips exist, and blend weights reach the actor (`animationState().activeActions.length ≥ 2` during the speed ramp).
- [ ] **T4.4** New template `packages/create-aura3d/templates/character-hero/`:
  - hero + PRD 02 lighting rig + PRD 08 follow camera;
  - ground with receive shadow, foot IK, look-at, one spring chain;
  - morph visemes driven by `VisemeController` on the hero's face morphs.

  Template test + browser capture `tests/browser/character-hero-template.spec.ts`.
- [ ] **T4.5** `packages/engine/src/agent-api/VisemeController.ts:121-122`. Change the default example to morph visemes on the template hero. Keep `primitiveMouthVisemeExample` as a named fallback.
  - Unit: the default example references morph targets.
- [ ] **T4.6** `packages/aura3d-cli/src/animation-asset-validator.ts`. Today it only checks clip names against a clip map (`:26-60`), so it needs geometry input. Extend `AnimationAssetValidationOptions` with `inspection?: { triangleCount; skinCount; jointCount; clips: { name; duration }[]; hasBaseColorTexture }`, filled from the CLI's existing GLB inspection in `index.ts`, and add profiles:
  - `hero-character` (floor for any player character in a game). Reject when the asset has:
    - fewer than 2,000 triangles (`HERO_NOT_A_CHARACTER`);
    - no skin (`HERO_NO_SKIN`);
    - fewer than 30 joints (`HERO_TOO_FEW_JOINTS`);
    - any required action (idle, walk, run, jump-start, jump-loop, land) unmapped or missing (`HERO_MISSING_CLIP`);
    - any mapped clip with `duration` < 0.2 s (`HERO_CLIP_TOO_SHORT`);
    - no baseColor texture (`HERO_UNTEXTURED`).
  - `template-hero` (the §6.9 bar). `hero-character` plus ≥ 15,000 triangles, ≥ 50 joints, and the full §6.9 clip set.
  - Report all reason codes, not just the first.
  - Unit with `apps/showcase-skyline-runner/generated/skylineArcticRunner.glb` (verified: 4 triangles, 0 skins, 0 animations) → rejected with exactly `HERO_NOT_A_CHARACTER`, `HERO_NO_SKIN`, `HERO_TOO_FEW_JOINTS` and `HERO_MISSING_CLIP`. With `fixtures/threejs-parity/assets/character/soldier.glb` → `HERO_MISSING_CLIP` only (it has Idle/Walk/Run/TPose).
- [ ] **T4.7** `docs/rendering/skinning-and-morphs.md:37,56-65`. Remove "changed px" certification (the doc currently says both "No hero rig is certified yet" at `:37` and "Certified 2026-09-03" at `:56`) and replace it with §17.3 metrics. Doc lint test in `tests/unit/docs/`: no "changed px" string used as a certification criterion.
- [ ] **T4.8** `tools/quality-rebuild-capture/capture-games.mjs`. Add a `burst` step (`{ "burst": { "frames": 150, "intervalMs": 33, "region": "character" | "full" } }`) next to the existing `STEP_KEYS` (`:101`). It writes a JPEG sequence plus a per-frame `diagnostics().animation` JSON, read through `globalThis.__AURA3D_LIVE_APPS__` as the tool already does at `:371`. Add burst steps for the six §17.4 games in `games.json`. Co-owned with PRD 12. Test: a smoke run on `aura-clash-showcase` in `quality-rebuild-capture.yml` produces 150 frames and 150 diagnostic records.

### Phase 5 (with PRD 14)

- [ ] **T5.1** `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts`:
  - `:3071-3090`: blend attack/hurt/KO in over 0.06 s with `transition: "inertialize"` instead of snapping.
  - `:3173-3211` `syncFighterRoot`: delete `squash` non-uniform scale and the `sin` `idleSway`. Replace them with an additive breathing clip (authored or `makeClipAdditive` of `Idle_Loop` vs frame 0) on the upper-body mask.
  - Spring chain: bind it to spine/head or accessory bones (`fighterSecondaryMotion.ts`) instead of a root lean.
  - Capture §17.4.
- [ ] **T5.2** `apps/showcase-rooftop-buckets/src/main.ts:502-536`.
  - Mount the skinned `rooftopDefender`/`rooftopLayupScorer` (191 joints, per research/18 C10) as the visible athletes in normal play. Today they are mounted only under `animationDebugCapture` and with `visible: false` (`:514`, `:530`).
  - Delete the static raised-pose statues and the root sways: the shooter `Math.sin(elapsedPlayTime * 1.8) * 0.028` yaw (`:1118`) and the defender `warmupSway = Math.sin(elapsedPlayTime * 1.4 + 0.8) * 0.022` (`:1321`).
  - Drive Ready/Shoot/Land/Contest through `node.play` with crossfades.
  - Capture §17.4.
- [ ] **T5.3** `apps/showcase-skyline-runner/src/main.ts:3416-3525`.
  - Replace the 4-triangle card hero with the PRD 05 rigged hero via `game.characterAnimation` bound to the existing `game.platformer` controller.
  - Delete the procedural bob/lean/squash and the `skinnedClipPlaybackProvenAtRoot` workaround evidence (`:3616-3621`).
- [ ] **T5.4** `apps/showcase-neon-swarm`. Replace `neonCourierAvatar` (no skin) with a rigged hero with run/strafe/fire/dash on masked layers (research/20 neon-swarm rec 4). Delete `sin(t*9)*0.04` bob (`main.ts:1506`, per research/09).
- [ ] **T5.5** `apps/showcase-mech-hangar`. Rig mechs (PRD 05) or attach rigid parts to a skeleton with authored idle, walk, light, heavy, special, guard, hit-react and KO clips (research/20 mech-hangar rec 2). Sync walk SFX to clip footstep events instead of a 0.42 s timer (`main.ts:1550-1554`, per research/09).
- [ ] **T5.6** `apps/showcase-gallery-shift`. Replace the 72-triangle voxel thief with a rigged character matching one guard style (research/21 gallery-shift rec 5). Make sprint and sneak distinct clips (or a 1-D blend with a crouch additive).

## 16. Test requirements

All automated tests run remotely. Unit tests run on GH Actions via `.github/workflows/test.yml`, and template tests via `pnpm test:templates` in the same workflow. Browser tests run on macos-14 (Chrome with ANGLE Metal, WebKit, Firefox) via the new `browser-matrix.yml` `prd06-animation-browser` job (T0.0). The existing `browser-matrix.yml` job is ubuntu Chromium only. WebGPU tests run via `native-webgpu-functional-301.yml` (macos-14). Game and benchmark capture runs via `quality-rebuild-capture.yml` and `benchmarks/quality-rebuild/ci.sh`. No local browser or Docker runs (policy).

Unit (vitest; new files named in §15):
- **three.js parity.** PoseMixer vs `three@0.185.1` AnimationMixer for single, weighted, crossfade, warp and additive cases on 4 rigs, within 1e-4 local TRS.
- **Sampling.** CompiledClip equals AnimationTrack within 1e-6. Cursor cache is correct across loop wrap and backwards seeks.
- **Masks.** Humanoid presets on Soldier, Fox (non-humanoid → `upper-body` resolves via hierarchy fallback, else error) and RobotExpressive.
- **Controller.** Embedded registry → clip drive, no empty pose, real durations after resolve. Fighting-game template clips resolve.
- **Renderer.**
  - Depth variants per caster type.
  - Palette cache creates 0 textures per frame after warm-up.
  - Morph texture packing and fallback reasons.
  - Joint-AABB conservativeness.
  - TemporalHistory accepts velocity-capable skinned items.
- **IK/constraints/springs.** Per §15 thresholds.
- **Allocation.** A heap test using `--expose-gc` in a dedicated vitest project runs 600 frames of a 2-actor mixer + palette build, and the heap delta must be < 64 KB.

Browser (Playwright, macos-14):
- `skinned-shadow.spec.ts`: posed shadow-shape IoU ≥ 0.85 vs the three reference (T0.14 method).
- `gallery-shift-thief-gait.spec.ts` (new, T0.17): tracksApplied every frame; sprint vs sneak pose difference.
- `taa-skinned-ghosting.spec.ts` (new, T2.5, with PRD 03).
- `animation-mixer-root-e3.spec.ts` (extend): `node.play` crossfade has continuity C ≤ 1.5 (§17.3, from `animationState()` bone samples), `speed: 0.5` halves clip advance within 2%, and an unknown clip emits `ANIMATION_CLIP_NOT_FOUND`.
- `animated-character-browser.spec.ts` (extend): 191-joint rig renders via the bone texture, with `texturesCreatedThisFrame === 0` after frame 10.
- `skinned-pbr-parity.spec.ts`: ΔE ≤ 2 on 99% of pixels (§15 T2.4).
- `character-hero-template.spec.ts`: template scaffold builds and renders, and its capture is attached for vision review.
- `animation-resource-lifecycle.spec.ts` (extend): actor dispose releases palette and morph textures. WebGL exposes no GPU-memory query, so the counters are `SkinningPaletteTextureCache.diagnostics().bytes`, morph-texture bytes and `WebGL2Device` live texture count. All three return to their pre-load values exactly.
- Existing `threejs-parity-skinning-{blending,additive,ik}-parity.spec.ts`: updated to the r185-parity semantics in the same PR as T1.3 (§10).

Benchmarks (`benchmarks/quality-rebuild`, PRD 12 harness): scenes 08, 08b, 15, 18, `p06-crossfade-filmstrip`, `p06-morph-face`, `p06-ik-slope`, `p06-character-hero` and `p06-perf-tier-*` on both engines. Output goes to `evidence/benchmark/<scene>-side-by-side.jpg` and `report.json`, with the region-masked metrics from PRD 12.

## 17. Visual acceptance tests

The judge has three parts:
1. The PRD 12 automated region metrics. These are necessary, not sufficient.
2. A vision model reviewing the side-by-side and game frames, with the same rubric as research/21 and research/23.
3. A human reviewer (owner or delegate) signing the per-scene checklist.

A scene passes only when all three pass. The vision prompt must include the three.js reference image where one exists, and it must score both images.

### 17.1 Benchmark scenes (vs three.js r185 same input)

| Scene | Criterion | Automated threshold | Vision/human threshold | Today (research/22, /23) |
|---|---|---|---|---|
| 08 skinned-character | Character grounded by a full silhouette shadow | shadow-ROI luma drop ≥ 85% of three's (three: 118.2→96.7) | Aura score ≥ three − 0.5; no "shadow missing" difference listed | Aura shadow ROI 117.2 vs ground 116.6 (none); 3.5 vs 5 |
| 08b posed (new) | Shadow matches the posed silhouette (arms and legs readable) | shadow-shape mask IoU vs three ≥ 0.85 (T0.14 relative-luma mask) | "skinned shadow" not listed as a difference | n/a (new) |
| 15 animation-skinning | Soldier stride and Fox legs readable in shadow | dark-shadow pixel count ≥ 85% of three's (three 25.4k vs Aura 12.8k today); fox shadow extent within ±10% of three's x-span | Aura ≥ three − 0.5; armor specular difference not "minor-aura3d-deficiency" after P2 | 4.5 vs 5.5 |
| 18 game-scene | Hero shadow shows legs and torso; no shadow artefact band | character shadow IoU ≥ 0.8; (band artefact owned by PRD 02) | character-related differences absent | 3.5 vs 5 |
| p06-crossfade-filmstrip (new) | No pop or foot fighting across Idle→Walk→Run | §17.3 continuity C ≤ 1.5 on each transition; foot-slide ≤ 2 cm walk / ≤ 3 cm run; walk/run phase error ≤ 1% while both weighted | human: "smooth, no foot skate" on 8-frame strip | n/a |
| p06-morph-face (new) | Visemes shaded with lighting (not flat) and correct normals | per-pixel ΔE2000 vs three ≤ 3 in face mask on 95%; `morph.droppedTargets == 0` | Aura ≥ three − 0.5 | n/a |
| p06-ik-slope (new) | Feet planted on slope and stairs | penetration ≤ 1 cm, float ≤ 2 cm (engine-reported, cross-checked by depth readback at foot) | human: "feet on ground" | n/a |
| p06-character-hero (new) | Template hero vs matched three scene (§17.2) | §17.2 automated gates | §17.2 vision + human | n/a |

Shadow thresholds for 08, 15 and 18 depend on PRD 02 shadow strength and map-size fixes landing too (§12). If PRD 02 has not landed, report the 06-only improvement and do not claim the scene passes.

### 17.2 Template hero (`character-hero`, upgraded `character-controller`)

- **Reference.** A matched three.js r185 scene built from the same hero GLB, the same HDRI and the same camera, under `benchmarks/quality-rebuild` as scene `p06-character-hero` (PRD 12).
- **Vision categories** (research/21 rubric): `character_presentation` ≥ 6.5, `animation_quality` ≥ 6.5, `shadows` ≥ 6. Each must be within 0.5 of the three reference.
- **Automated motion gates** on an 8 s scripted sequence (walk → run → stop → jump → land → idle), captured with the T4.8 burst (240 frames at 30 fps) plus per-frame `animationState()`:
  - foot slide ≤ 2 cm per walk contact and ≤ 3 cm per run contact;
  - continuity C ≤ 1.5 at every state change;
  - on stop, pelvis horizontal velocity reaches 0 within 0.4 s, and the hips bone shows a ≥ 2 cm settle (weight shift) rather than an instant freeze;
  - on landing, hips height dips ≥ 3 cm below standing within 0.15 s (landing compresses);
  - spring accessory settles < 1° within 0.6 s of stop;
  - head look-at error ≤ 5° for targets within limits;
  - no frame where ≥ 90% of bones equal the rest pose within 1e-3 (no T-pose or bind-pose frames).
- **Motion review.** A human reviews the same 8 s capture against this checklist: no foot skate, visible weight shift on stop, landing compresses, accessory lags and settles, head tracks the look target, no T-pose or bind-pose frames. The human can fail a sequence that passes the automated gates. Automated gates alone cannot pass it.

### 17.3 Motion-quality metrics (automated; definitions)

All metrics are implemented once in `packages/animation/src/pose/MotionMetrics.ts` (T1.14). They sample at a fixed 60 Hz from engine bone data, not from screenshots.

- **Transition continuity C.** Over a transition window [t₀ − 0.1 s, t₀ + 0.3 s], take the max per-bone angular speed, over humanoid limb and spine bones only (fingers excluded). Divide it by the max per-bone angular speed of either clip played alone over the same phase range, with the denominator floored at 90°/s so idle-to-idle transitions cannot divide by ~0. Pass if C ≤ 1.5. Snapping attacks in today's Aura Clash are expected to fail this. That is a deliberate failing control, and the metric test asserts it fails on today's code.
- **Foot slide.** The world displacement of a foot bone while its contact flag is set. The flag is a clip footstep event, or foot height < 3 cm and foot speed < 0.1 m/s. Pass if ≤ 2 cm per contact phase for walk and ≤ 3 cm for run.
- **Shadow-silhouette agreement.** IoU between (a) the ground shadow mask from Aura and (b) the three reference, using the T0.14 relative-luma mask. For games, (b) is the mask from a CPU-skinned reference render of the same pose produced by the harness.
- **Clip sampled.** `animationState().tracksApplied > 0` on every visible character. This is a precondition, not a quality signal.
- **Failing controls.** Each metric's unit test includes a known-bad input that must fail: a snapped transition for C, a root-translated in-place walk for foot slide, and a bind-pose shadow for IoU. A metric that cannot fail is a defect.

### 17.4 Games (macos-14 capture via `tools/quality-rebuild-capture`, `quality-rebuild-capture.yml`)

"Today" uses research/21 vision scores, which are authoritative for visual categories, with research/20 code-based scores in brackets where they differ. Every vision threshold below is strictly above today's score. Automated gates come from the T4.8 burst plus `animationState()`.

| Game | Today: animation_quality / character_presentation / shadows (research/21 [research/20]) | Automated gates | Vision thresholds (+ human sign-off) |
|---|---|---|---|
| aura-clash-showcase | 4 / 3 / 2; fighters "cast no shadows" | both fighters `tracksApplied > 0` every frame; attack/hurt/KO transitions C ≤ 1.5; `rg -n "squash\|idleSway" src/playable/AuraClashArenaApp.ts` → 0; fighter shadow IoU vs CPU-skinned reference ≥ 0.8 in the action frame | `animation_quality` ≥ 6, `shadows` ≥ 5 (with PRD 02), `character_presentation` ≥ 6 (with PRD 04 tint fix, PRD 08 framing) |
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

Every shipped surface is listed so that no consumer of the changed defaults is missed. "Default changes" means P0/P1 semantics change its output even if nobody edits it.

| Surface | Character content today | PRD 06 impact | Gate |
|---|---|---|---|
| aura-clash-showcase | 2 skinned fighters (`auraClashPlayerRig`/`RivalRig`), app-side frozen-pose blends | P0: skinned shadows appear. P1: root-path defaults do not apply, because the app drives clips itself. P5 (T5.1) moves it onto the mixer | §17.4 |
| showcase-gallery-shift | voxel thief, skinned guards via the controller (freeze bug) | P0 fixes the freeze (default changes). P5 (T5.6) replaces the thief | §17.4 |
| showcase-rooftop-buckets | static statues; skinned athletes hidden | P5 (T5.2) | §17.4 |
| showcase-skyline-runner | 4-tri card | P5 (T5.3), blocked on a PRD 05 hero | §17.4 |
| showcase-neon-swarm | unskinned `neonCourierAvatar` (`main.ts:688`) | P5 (T5.4), blocked on a PRD 05 hero | §17.4 |
| showcase-mech-hangar | rigid mechs | P5 (T5.5), blocked on a PRD 05 rig | §17.4 |
| world-war-x-showcase | `.animate({ clip: "idle-ready", speed: 0.44 })` on clips that do not match (`WorldWarXApp.ts:1071`) | P1 default changes: speed now honoured, and the clip-name miss now warns and no-ops instead of playing the first clip. The codemod (T1.13) must fix it in the same PR as T1.8/T1.9 | codemod report empty for this app; route-health capture unchanged or improved |
| orbital-defense, bank-shot, vault-breakers, pulse-tunnel, patrol-wing, courier-rush, turbo-drift-circuit, siege-golf, blockfall-reactor, aurora-lander, deep-recovery, gravity-post | no skinned characters (vehicles, ships, balls, a 2-D mascot sticker in blockfall) | none, except P2 shader unification if any of them uses a `SkinnedLit`/`MorphUnlit` material. T2.4 runs `rg "SkinnedLitMaterial\|MorphUnlitMaterial" apps/<game>/src` and re-captures any hit. Rigid animation stays PRD 14/09 | capture A/B unchanged (±3% frame time) |
| template `fighting-game` | 9 `tracks: []` clips, 1-clip default hero | P0 T0.9a (stand-ins declared), T0.9b after PRD 05 | template test |
| template `character-controller` | 1-clip hero, HUD-only locomotion weights | P4 T4.3 | template test + §17.2 |
| template `character-hero` (new) | n/a | P4 T4.4 | §17.2 |
| template `mini-game`, `animation-studio`, `three-compat-character-viewer` | use `node.play`/`.animate` or the controller | default changes in P1 (crossfade, speed, strict names). Each template's test re-runs, and `pnpm check:templates` must pass | template tests |
| demos `animation-walk`, `skinning-blending`, `skinning-additive`, `skinning-ik`, `skinning-morph` | three.js parity demos | P1 changes their output toward three r185. Their parity specs (`threejs-parity-*`) are updated to the r185 values (§10) | parity specs |

## 18. Browser coverage

| Browser | Runner | Required for |
|---|---|---|
| Chromium (ANGLE Metal) | GH macos-14 (`browser-matrix.yml`, capture workflows) | all unit-adjacent browser specs, benchmarks, game captures |
| WebKit (Playwright) | GH macos-14 | `skinned-shadow`, `animated-character-browser`, `skinned-pbr-parity` (RGBA32F `texelFetch`, `sampler2DArray`) |
| Firefox | GH ubuntu (software GL) or macos-14 | correctness only: shader compile + `skinned-shadow` IoU |
| Chromium WebGPU | `native-webgpu-functional-301.yml` | WGSL skinning/morph variants (T2.7) |
| Chromium ANGLE D3D11 | GH windows runner (PRD 11/12 to add) | uniform/texture limits on Windows drivers; at minimum shader compile and one capture |

## 19. Mobile coverage

- The 390×844 viewport in `tools/quality-rebuild-capture` is layout coverage only. It runs on the same paravirtual Mac GPU and is not mobile GPU evidence.
- Real-device runs (iOS Safari 17+ on A15-class, Android Chrome on Adreno 6xx/Mali-G7x) are required before claiming Low/Medium budgets (§13).
  - The remote device-farm provider is chosen under PRD 11/12. It is not available in the current harness. This is recorded as a blocker for Low-tier sign-off, not as a reason to skip.
- Mobile-specific checks:
  - shader link succeeds with the bone-texture path (the 96-joint uniform array was the risk, E22);
  - `MAX_ARRAY_TEXTURE_LAYERS` ≥ target count, else the CPU fallback is reported;
  - RGBA16F morph texture sampling;
  - hero-only skinned shadow casters on Low;
  - CPU animation ≤ 1.0 ms with 1 hero + 4 NPCs.

## 20. Screenshots and evidence required

Store under `docs/project/aura3d-quality-rebuild/evidence/prd06/`:
1. Benchmark side-by-sides 08, 08b, 15, 18, 19 (8-frame strip), 20, 21, 22, plus `report.json` with region metrics and capability log entries `animation:*` and `skinned-shadow-caster` (research/22 harness notes).
2. A shadow-ROI crops image per scene (Aura | three | diff).
3. Per-game four frames + 5 s character clip + vision JSON + human checklist for the six games in §17.4, before and after.
4. Motion-metric JSON per scene and game: C, foot slide, shadow IoU, tracksApplied.
5. Perf JSON per tier scene: CPU anim ms, GPU delta ms, textures/geometries created per frame, palette and morph bytes.
6. The GH Actions run IDs for every artefact. Artefacts without a run ID are not accepted.

## 21. Completion criteria

PRD 06 is complete when all of the following hold:
1. All §15 tasks are checked, with the named tests green on remote CI.
2. §17.1 benchmark rows pass all three judges. For 08, 15 and 18 this requires the PRD 02 co-delivery.
3. §17.2 template hero passes vision and human review, and is the default hero of `character-controller` and `character-hero`.
4. §17.4 rows for Aura Clash, gallery-shift and rooftop-buckets pass. Skyline, neon-swarm and mech-hangar pass once PRD 05 delivers their heroes. Until then they are tracked in PRD 14 as blocked on assets, not as done.
5. §13 budgets are met on macos-14 for High/Medium. Low/Mobile is met on a real device, or the blocker is explicitly reported.
6. There is one animation authority (PoseMixer). `rg "function blendBase"` returns only `packages/animation/src/pose/`, and the skinned PBR fork is deleted.
7. No route in `apps/` uses root-transform `sin` sway or non-uniform squash on a skinned character. Check: `rg -n "setScale\([^)]*squash" apps` → 0 for skinned actors, with review of remaining hits.
8. Skill and docs describe the new path, and no doc uses changed pixels as certification.

## 22. Rollback considerations

- Feature flags, each removable after one minor release:
  - `createAuraApp({ animation: { defaults: "3.0" } })`: old root semantics.
  - `animation.mixer: "legacy"`: old blend math via facade.
  - `renderer.skinnedShadows: false`: old depth shader.
  - `renderer.morph: "cpu"`: old morph path, with the persistent buffer kept.
  - `renderer.skinnedPbr: "fork"`: fork kept behind a flag until P2 parity is signed.
- Each phase lands as separate PRs per workstream, so a revert of the R2 depth variants does not revert R1 controller fixes.
- Visual goldens are versioned per phase. A rollback restores the matching golden set.
- The data format (typegen `animationClips` objects) is additive. Old string arrays stay readable, so rolling back the engine does not require regenerating assets.
- The IndexedDB retarget cache is keyed by engine version, so a rollback ignores newer caches.

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Shader variant explosion (skin 0/4/8 × morph × instancing × alpha × velocity × PBR features), with compile stalls (the depth recompile once held Aura Clash at 2 FPS, `DepthPass.ts:33-37`) | high | high | static variant caches, warm-up at load with `KHR_parallel_shader_compile`, define-key budget test (≤ 12 live programs per character material) |
| PoseMixer rewrite regresses Aura Clash (the only working skinned game) | medium | high | three-parity unit tests; Aura Clash capture A/B before merging P1; legacy flag |
| Real crossfades expose authoring problems (clip names, missing clips) across routes | high | medium | codemod report; strict errors in dev; validator `hero-character` |
| Morph texture memory on mobile (16 MB+ per head) | medium | medium | RGBA16F, normals optional, active-K cap per tier, CPU fallback |
| Integer/float joint index precision or out-of-range index → undefined `texelFetch` | low | high | import-time index validation; float index exact below 2^24 |
| WebGL2 drivers with slow RGBA32F `texSubImage2D` | low | medium | one upload per skin per frame; PBO path optional on High |
| Retarget quality on non-standard rigs (Meshy, Quaternius variants) | medium | medium | `RETARGET_MISSING_BONES` errors; per-rig mapping override; human review of retargeted clips |
| Shadow acceptance blocked by PRD 02 (strength/size/CSM) | high | medium | co-delivery plan; report 06-only deltas separately; never claim pass early |
| Hero assets (licensing, quality) late from PRD 05 | high | high | P0-P3 do not depend on new heroes; P4/P5 explicitly gated |
| Vision judge cannot read images (research/20/22 "image viewer returned empty") | medium | high | capture pipeline must emit JPEGs the judge can load (research/21 and /23 succeeded), and the human review is mandatory regardless |
| Frame-time already 5-15 fps on macos-14 for most games | certain | medium | animation must not worsen it (§13 3% rule); fix is PRD 11 |

## 24. Explicitly out of scope

- Dual-quaternion skinning, corrective blendshape solvers, muscle and tissue simulation.
- Cloth simulation, strand hair and ragdoll/physical animation. Spring bones are the only secondary-motion system here. The full cloth gap noted in research/18 is deferred to a later program.
- Motion matching, learned locomotion and procedural gait generation.
- GPU crowd animation (vertex animation textures, compute skinning for thousands of agents) beyond the Ultra tier's 32 NPCs.
- Facial performance capture, audio-to-viseme ML models (AuraVoice owns these), and an animation editor UI or timeline authoring in `apps/editor`.
- Rigid-object animation in non-character games (wheels, suspension, flippers, control surfaces): PRD 14/09.
- Character art direction and asset sourcing (PRD 05/14). Material and skin shading models (PRD 04). Shadow filtering, strength and CSM (PRD 02). TAA and motion blur consumers (PRD 03). Camera rigs and hitstop (PRD 08).
- Claims of three.js-equivalent quality. This PRD sets thresholds relative to three r185 on specific scenes only.

