# 09 — Animation & Characters Autopsy

Branch `aura3d-quality-rebuild/audit`. Everything here comes from reading the implementation (shader strings, render loops, defaults, game code) and from parsing GLB JSON chunks with a small Node script (`/tmp/glbinfo.mjs`, deleted afterwards). I did not run any browser, Playwright or dev server, and I did not treat test or evidence files as proof. Reference: three.js **0.185.1** source at `node_modules/three/src`.

## 0. Bottom line

Characters look a generation or more behind for five reasons that stack. In order of how much they cost the final pixels:

1. **(D/C) Most showcase "characters" are not animated characters.** They fall into five groups:
   - 4-triangle textured cards (billboards): skyline-runner hero, blockfall, neon-swarm, aurora "generated" GLBs.
   - A 72-triangle Kenney-style block figure animated by rigid node clips (gallery-shift thief).
   - Static-pose statues (rooftop-buckets presentation athletes; world-war-x 675k-triangle leaders).
   - 54-triangle boxes (world-war-x IronLedger and RomanSignal).
   - Rigid kit parts with no gait (mech-hangar).

   The routes then fake life with `Math.sin` bob, sway, lean and non-uniform "squash" applied to the root of the whole model. Only **aura-clash** actually drives a skinned rig with real clips every frame.
2. **(A) Skinned and morphed meshes cast bind-pose shadows.** The only depth/shadow shader (`aura3d/depth`) reads `a_position` and nothing else. Every animated character that casts a shadow casts the silhouette of its T-pose or A-pose. three.js includes `skinning_vertex` and `morphtarget_vertex` in `depth.glsl.js` and `distance.glsl.js`.
3. **(B/E) The documented agent path freezes characters.** The `AnimationController` + `clipRegistry: assets.x` + `bindRuntimeNode` pattern is the one in the skill, the fighting-game template and gallery-shift.
   - It registers GLB clips **by name only**, with duration defaulted to 1 s and no sampler. The controller then emits an **empty pose** every frame.
   - The root renderer sees a pose object (truthy, even when empty) and calls `applyRetargetedPose(emptyPose)` *instead of* `playClip`.
   - Result: the embedded clip never plays, and the character keeps its bind or previous pose.
   - This is very likely why the skyline-runner comment says "root runtime does not advance skinned mixers".
4. **(A/B) Transitions pop and layering is crude.**
   - The root `node.play(clip)` path calls `playClip(single clip)` with no crossfade. `speed` is ignored, and clip-name misses silently fall back to the first clip.
   - Bones a new clip does not animate keep the previous clip's values. There is no rest-pose reset like three.js's `PropertyMixer` original-state restore.
   - Additive layers have no reference-pose subtraction (no `makeClipAdditive`).
   - Masks are substring name matches with a hard 0/1 boundary.
5. **(A) Morph targets and per-frame palette work are toy-grade.**
   - The GPU morph fast path is capped at **4 targets × 64 vertices** in uniform arrays (`ForwardPass.ts:119-120`), and only `MorphUnlitMaterial` (flat colour) supports it.
   - Every lit or skinned morph mesh therefore takes a CPU path that builds a **new Geometry, uploads it and disposes it every frame** (`ForwardPass.ts:313,347-349`).
   - Rigs with more than 96 joints get a **new RGBA32F Texture per draw per frame** (`ForwardPass.ts:1984`, `2014-2034`).

Large, well-tested *libraries* exist: inertialization, spring chains, two-bone IK, foot IK, humanoid retargeting, root motion, state machines, blend trees, a 3,368-line engine AnimationController. Almost none of it reaches the pixels of the 18 showcases:

| Feature | App/template files using it (excluding tests) |
|---|---|
| `createSpringBones` / `SpringBone` | 0 |
| `Inertializer` (pose-space) | 0 |
| `AnimationStateGraph` | 0 |
| `retargetHumanoidPose` | 2 (both animation-studio template scripts) |
| `createSpringChain` | 1 (aura-clash, used only for a rigid root lean) |

---

## 1. Skinning implementation

### 1.1 What exists

| Item | Implementation | Evidence |
|---|---|---|
| Method | Linear blend skinning (LBS), matrix palette. No dual quaternion skinning anywhere (`rg dualQuat` → 0). | `rendering/src/ShaderChunks.ts:557-573` |
| Influences | 4 by default. 8 via `a_joints1/a_weights1` shader variant (`a3dSkinMatrix8`). | `ShaderChunks.ts:571`, `ShaderLibrary.ts:1072` |
| Palette ≤96 joints | `uniform mat4 u_jointMatrices[96]` (384 vec4 slots) | `ShaderChunks.ts:13,528` |
| Palette >96 joints | RGBA32F data texture, `texelFetch` ×4. Max 1024 joints. | `ShaderChunks.ts:533-544`, `ForwardPass.ts:115,1975-1995` |
| Normal/tangent skinning | `skin * vec4(n,0)` (same as three.js `skinnormal_vertex`) | `ShaderLibrary.ts:599-602` |
| Palette compute | CPU, per skin per frame: `inverse(meshWorld) * jointWorld * inverseBind`. Joint lookup by **node name**, first match. | `assets/src/GLTFAnimationRuntime.ts:1263-1293` (line 1275 `nodesByName.get(jointName)?.[0]`) |
| Shadow/depth skinning | **None** | `rendering/src/ShaderLibraryCore.ts:784-806`, `DepthPass.ts:59-86` |
| Motion vectors / TAA for skinned | **Hard error**: `TEMPORAL_UNSUPPORTED_GEOMETRY` | `rendering/src/TemporalHistory.ts:73-74` |
| Skinned culling bounds | CPU-skins every vertex whenever the palette changes, i.e. every animated frame. Cache key is palette equality. | `rendering/src/Renderer.ts:2295-2304` |

### 1.2 Skinned shadows are bind-pose (P0)

`DepthPass.drawCaster` binds a `DepthMaterial` whose shader is:

```glsl
// ShaderLibraryCore.ts:788-795  (aura3d/depth)
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }
```

- It never sets `u_jointMatrices` and ignores `caster.skinning`, `caster.morphTargets` and `caster.instanceTransforms`.
- Directional, point (6-face atlas) and spot passes all go through `ShadowPass` → `new DepthPass(...)`: `Renderer.ts:1412-1419`, `1543-1550`, `CascadedShadowMaps.ts:420`.
- `casters: options.items` passes skinned items in unchanged.
- `rg "skinnedDepth|depth-skinned|cpuSkin|bakeSkin"` returns nothing.

Aura Clash enables shadows (`createSideViewGameRenderPreset` shadow at 1024, `AuraClashArenaApp.ts:1421`; `createLightingRig({... shadows: true})` at `:902`). Its two 65-joint fighters therefore project T-pose/A-pose shadows that do not follow punches, crouches or KO poses.

three.js r185 for comparison:
- `ShaderLib/depth.glsl.js:7,35` and `distance.glsl.js:11,33` include `skinning_pars_vertex` and `skinning_vertex`, plus morph chunks.
- `WebGLShadowMap` picks a depth material variant per object, so shadows always match the deformed mesh.

### 1.3 Palette upload costs

- **Uniform path.** A new `Float32Array(joints*16)` per skin per frame (`GLTFAnimationRuntime.ts:1270`), plus array-based `multiplyMat4` and `invertMat4` allocations per joint.
- **Data-texture path (>96 joints).** `createSkinningPaletteTexture()` builds a `new Texture({format:"rgba32f"})` **per draw call** (`ForwardPass.ts:1984`). Nothing disposes it in `applySkinningUniforms` (`:1942-2006`).
  - rooftopDefender/LayupScorer have 191 joints; doc-roster `showcaseAnimatedRunnerHero` has 136.
  - Each skinned primitive sharing a skin uploads its own copy every frame.
  - three.js keeps one persistent `boneTexture` per `Skeleton` and calls `needsUpdate` on it.
- **96-joint uniform array.** 384 vec4s for the palette alone. WebGL2 only guarantees `MAX_VERTEX_UNIFORM_VECTORS >= 256`. three.js has used a bone texture unconditionally since r1xx. Risk on low-end and mobile.

### 1.4 Skinned material is a forked PBR shader

`DEFAULT_SKINNED_LIT_SHADER` (`ShaderLibrary.ts:564-1040+`) is a hand-copied PBR fragment shader.

What it has:
- Its own single `u_shadowMapMatrix`. There is no CSM cascade selection in this shader.
- Procedural "stripe" environment specular terms (`ShaderLibrary.ts:969-979`).
- A filmic curve embedded in the material: `a3dPbrEncodeOutput`, `:909-914`.
- A procedural "wrinkle" normal made of `sin(p.x*230)` products (`:783-787`). That is a fake, not wrinkle maps.

What it lacks:
- Morph uniforms. Every skinned + morph mesh therefore goes through the CPU morph path (§2).

The forked shader means character shading drifts from the static-mesh PBR path whenever the main shader is improved. three.js composes skinning chunks into the same `MeshStandardMaterial` program through `#ifdef USE_SKINNING`.

### 1.5 Ladder: skinning

| Rung | Status |
|---|---|
| exists | yes |
| technically works | yes (LBS 4/8 influences, >96 via texture) |
| public API | yes (`SkinnedLitMaterial`, TypedGLBActor) |
| used by generated apps | aura-clash only for visible pixels. Rooftop's skinned actors are `visible:false` at y=-10 (`showcase-rooftop-buckets/src/main.ts:530-535`). |
| good defaults | **no**: bind-pose shadows, TAA throws, per-frame texture allocation |
| composes | **no**: depth/shadow, temporal, morph-GPU, instancing (rejected) |
| modern visual quality | **no**: no DQS/corrective blendshapes, forked shading, wrong shadows |
| agents know to use it | partially; the skill routes through the broken controller path (§4) |
| examples demonstrate it | `skinning-*` apps use three.js's own `robot-expressive.glb` |

---

## 2. Morph targets

| Item | Implementation | Evidence |
|---|---|---|
| GPU fast path limits | `MAX_GPU_MORPH_TARGETS = 4`, `MAX_GPU_MORPH_VERTICES = 64` | `ForwardPass.ts:119-120` |
| GPU path shaders | Only `aura3d/morph-unlit`: `uniform vec4 u_morphPositionDeltas[256]` and `gl_VertexID` clamped to 63; the output is a flat `u_baseColor` | `ShaderLibrary.ts:1588-1640` |
| Texture morph path | Exists in the same unlit shader (`u_morphDeltaTexture`, 64-target loop). `MorphTargetPlan.ts` plans it, but ForwardPass only uploads the 4×64 uniform path (`applyGpuMorphUniforms`, `:1855-1940`). | `ShaderLibrary.ts:1599-1618`, `ForwardPass.ts:1885-1887` |
| Everything else | CPU path: `resolveRenderGeometry` → `applyMorphTargets(...)` **creates a new Geometry each frame**, uploads it in `draw`, and disposes it in `finally` | `ForwardPass.ts:312-313,316,347-349,1841-1853` |
| Normals | CPU path morphs normals/tangents (comment `:1881-1884`). GPU unlit path packs normals but the unlit shader ignores them. | — |
| Skinned + morph | Skinned shader has no morph uniforms, so it is always CPU-morph + GPU-skin | `SkinnedLitMaterial.ts` uniform schema `:225-238` |

three.js r185 handles any target count through a `sampler2DArray morphTargetsTexture` (`morphtarget_pars_vertex.glsl.js`, `WebGLMorphtargets.js:50-52`), with position, normal and colour strides on every lit material. It is built once and only influences change per frame.

**Impact:** facial animation (visemes, expressions) works only through a full-mesh CPU rebuild and re-upload per frame. That is acceptable for one RobotExpressive head, but it rules out a 50-blendshape ARKit face or a crowd. The "lip sync" demo default is a primitive mouth card that gets scaled: `primitiveMouthVisemeExample` = "Primitive character fallback that scales a small mouth-card runtime node from sampled visemes" (`engine/src/agent-api/VisemeController.ts:121-122`).

None of the 18 showcase character GLBs I parsed has morph targets (`morphMax=0` across every game GLB, §6). The exception is the shared `showcaseExpressiveRobot` (3 targets), which is three.js's RobotExpressive.

---

## 3. Animation sampling, mixer, blending, additive, masks

### 3.1 There are four parallel animation stacks

| Stack | File | Lines | Used by showcase pixels? |
|---|---|---|---|
| `@aura3d/animation` `AnimationMixer`/`Action`/`Layer`/`StateMachine`/`BlendTree` | `packages/animation/src/*.ts` | 7,120 total | Indirectly: aura-clash imports `fighterInertializedWeights`, `sampleClipEvents`, `createSpringChain` |
| glTF scene runtime / `GLTFSceneAnimationMixerBinding` | `packages/assets/src/GLTFAnimationRuntime.ts` | 2,115 | **Yes**: the only path that writes bone TRS and palettes |
| Engine agent `AnimationController` (pose-blending, events, layers, retarget, foot planting) | `packages/engine/src/agent-api/AnimationController.ts` | 3,368 | Only through `setAnimationPose`, which breaks clip playback (§4) |
| Legacy WebGL path in `createAuraApp` (rigid node-TRS only, no skinning) | `engine/src/agent-api/index.ts:16330-16420` | — | Fallback primitive path |

Each stack has its own blend math, time wrapping and name resolution, and none of them is the authority. three.js has exactly one `AnimationMixer` → `PropertyMixer` → `PropertyBinding`.

### 3.2 Track sampling (`AnimationTrack.ts`)

- Keyframes are an **array of objects**, searched with a **linear scan from index 0 every sample** (`AnimationTrack.ts:47-60`). That is O(keys) per track per frame, plus a fresh tuple per sample. three.js `Interpolant` caches the last index and searches in flat `Float32Array`s.
  - Example: a 195-channel Quaternius clip at 30 fps × 1.5 s ≈ 45 keys per channel.
- LINEAR, STEP and CUBICSPLINE are supported. The cubic quaternion is normalised through a `slerpQuat(identity, q, 1)` trick (`:139-158`); correct, but wasteful.
- `slerpQuat` has the shortest-path flip and an NLERP fallback above 0.9995 (`Keyframe.ts:144-168`). This part is fine.

### 3.3 Blending (`AnimationMixer.ts`, mirrored in the glTF runtime)

- **Weighted base blend** (`blendBase`, `AnimationMixer.ts:364-386`): a running weighted average, `t = w/(acc+w)`. Total weights below 1 are re-normalised, so a single action at weight 0.3 renders at full strength.
  - three.js `PropertyMixer.apply` mixes the remaining weight with the **original (rest) value** (`_origIndex`). Fade-ins from rest work there; here they cannot.
- **No rest-pose restore.** The glTF runtime writes only sampled targets (`applySampledTargets`, `GLTFAnimationRuntime.ts:1378-1420`; no reset step). Any bone the new clip lacks keeps the previous clip's value.
- **Additive** (`additiveContribution`, `:410-425`): the *absolute* sampled quaternion is slerped from identity by weight and multiplied on top. There is no reference-frame subtraction (`rg makeClipAdditive|referenceFrame` → 0). An authored (non-delta) clip used as additive double-applies its bind rotation.
  - three.js has `AnimationUtils.makeClipAdditive(clip, referenceFrame)` and `AdditiveAnimationBlendMode`.
- **Crossfade.** `AnimationMixer.crossFade` (`:111-123`) runs linear fades on both actions. There is no `warp` and no time sync. three.js `crossFadeTo(…, warp)` and `syncWith` keep walk/run phase aligned.
  - `skinning-blending` wraps each clip on its own duration (`apps/skinning-blending/src/blendController.ts:33-39`), so idle/walk/run feet fight each other.
- **Masks** (glTF runtime). `nodeName.includes(entry)` substring match (`GLTFAnimationRuntime.ts:158-163`), hard 0/1, no per-bone weight falloff across the spine.
- **"Inertialization"** in the mixer is only a different weight curve, `(1+kt)e^{-kt}` (`Inertialization.ts:73-79`; `AnimationMixer.inertialCrossFade` `:132-146`).
  - The header (`:1-9`) correctly describes real offset-decay inertialization, and `inertializedVec3/Quat` plus an `Inertializer` class exist.
  - The `Inertializer` has 0 uses in apps. Aura Clash uses only the weight helper (`fighterInertializedWeights`) blending a **frozen** outgoing pose (`AuraClashArenaApp.ts:3083`, `prevClipTime` frozen).
  - That is a pose-hold crossfade, not inertialization: no velocity carry-over.

### 3.4 Root `createAuraApp` clip path (what generated apps get by default)

`node.play(clip, opts)` sets `node.animation` (`engine/src/agent-api/index.ts:10970-10973`). Each frame, `applyProductionActorAnimation` (`:15070-15124`) does the following:
- Resolves the clip with `resolveGLTFClipName` (exact → synonym → substring → **`available[0]`**, `GLTFAnimationRuntime.ts:110-136`). A wrong name silently plays the first clip. world-war-x asks for `"idle-ready"` on assets whose only clip is `"Modi Ji|Modi Walking"`, `"Take 001"` or `"Animation"`, so idle fighters walk in place.
- Calls `entry.actor.playClip(clipName, seconds)`: **one clip, no crossfade**. Changing clip snaps.
- Computes seconds with `resolveAnimationSeconds` (`:15461-15476`), which **ignores `animation.speed`**. world-war-x's `.animate({speed:0.44})` has no effect on skinned playback.

### 3.5 Ladder: mixer/blending

| Rung | Status |
|---|---|
| exists / works / public | yes (multiple stacks) |
| used by generated apps | aura-clash only (via `actor.animation.applyClips`). Root path is single-clip. |
| good defaults | **no**: root path has no crossfade, ignores speed, falls back to the first clip silently, has no rest reset |
| composes | **no**: four stacks, the controller's pose path cancels clip playback |
| modern visual quality | **below three.js**: no warp/sync, no makeClipAdditive, renormalised weights |
| agents know to use it | the skill teaches the broken controller pattern |
| examples demonstrate it | `skinning-blending` (no phase sync) |

---

## 4. Engine `AnimationController` + embedded GLB clips = frozen character (P0, verified by code trace)

The pattern taught in `packages/create-aura3d/skills/aura3d-character-animation/SKILL.md:51-74` and used in `templates/fighting-game` and `apps/showcase-gallery-shift` is:

```ts
const controller = createAnimationController({ clipRegistry: assets.hero, requiredClips: [...] });
controller.bindRuntimeNode(hero, { defaultClipId: "idle" });
app.onFrame(({dt}) => { controller.crossFade(moving ? "walk" : "idle", 0.12); controller.update(dt); });
```

Trace:

1. `clipRegistry` → `registerEmbeddedGLBClips` → `createEmbeddedGLBAnimationClipRegistryMetadata` reads `metadata.animationClips` / `metadata.animations` (`AnimationController.ts:2611`). In the typed manifest these are **string names only**; for example, `src/aura-assets.ts:78573-78630` lists 27 names for `showcaseRunnerGirl`, and `animationMetadata` has channel counts but no keyframes or durations.
2. String entries become `{ duration: 1, loop: true, ... durationSource: "defaulted" }` with **no `sample` function** (`AnimationController.ts:2646-2666`).
3. `sampleSinglePose` (`:1780-1796`): `clip.sample` is undefined, so the result is `clip.fallbackPose ?? emptyPose({poseBakedFallback:true})`. `emptyPose` = `{bones:{}, morphTargets:{}}` (`:3011-3017`).
4. `applyRuntimeNodeBinding` (`:1805-1840`) calls `node.play(clip, {captureTime: localTime, duration: 1, ...})` **and** `node.setAnimationPose(emptyPose)` (default `applyPose: true`, `:862-867`).
5. The node handle stores the pose; it is truthy (`index.ts:10982-10984,11059`).
6. The production renderer does `if (currentState.animationPose) actor.applyRetargetedPose(pose) else applyProductionActorAnimation(...)` (`index.ts:13871-13883`). The empty pose wins, `applySampledTargets` iterates zero targets, and **the embedded clip is never sampled**.
7. Even without step 6, playback time would be `phase % duration` with the defaulted `duration: 1` (`index.ts:15486-15489`), so only the first second of any clip would ever show.

Corroborating source comments, written by agents who hit this without diagnosing it:
- `showcase-skyline-runner/src/main.ts:3416-3418`: "the root runtime does not advance skinned mixers".
- Same file, `:3464-3466`: "does not yet advance a skinned GLB mixer".
- Same file, `:3616-3620`: `skinnedClipPlaybackProvenAtRoot: false`.

No app passes `applyPose: false` (`rg 'applyPose: false' apps` → 0).

The fighting-game template goes further. It defines its clips with `tracks: []`, metadata `"fighting-game-template-pose-fallback"` and `templateReadiness: "source-only"` (`templates/fighting-game/src/game/fighters.ts:57-79`). Its `syncFighterAnimation` crossfades between these empty clips (`main.ts:430-445`). **Every generated fighting game starts with fighters in bind pose.**

The character-controller template computes `createLocomotionKit` idle/walk/run weights but only prints them in the HUD. The model plays one fixed clip: `.animate({ clip: "Take 001", loop: true })` (`templates/character-controller/src/main.ts:28,59,87`). Blend weights never reach the mesh. This is fake parity.

---

## 5. IK, foot IK, root motion, springs, retargeting, events, visemes

| Capability | Implementation (actual) | Used where | Grade |
|---|---|---|---|
| Two-bone IK | Analytic, returns joint **positions** only, lerped by weight. Pole projection. No twist handling. (`animation/src/IK.ts:26-61`) | aura-clash foot IK (weight 0.5, `fighterSecondaryMotion.ts:24`), `skinning-ik` demo | works, minimal |
| CCD / FABRIK / full-body IK | **Absent** (`rg -i 'ccd\|fabrik'` → 0). three.js ships `CCDIKSolver`. | — | missing |
| Foot IK / planting | `FootIk.ts` (371 lines) + glTF runtime post-pass with ground raycast and foot locks (`GLTFAnimationRuntime.ts:593-603`, `1230-1260`) | aura-clash (custom), root path via controller `footPlanting` binding | works where wired |
| Root motion | `extractRootMotion`/`consumeRootMotion` with blended displacement (`GLTFAnimationRuntime.ts:611-672`) | `animation-walk` demo only | demo-only |
| Spring bones | Particle chain, Euler substeps, colliders (`SpringBones.ts`). **Not bound to any skeleton bone in any app.** | aura-clash: 2-particle chain → rigid **root lean** (`fighterSecondaryMotion.ts:7-10,73-83`) | unused for hair/cloth |
| Retargeting | `HumanoidRetargeting.ts` (794 lines) | animation-studio template scripts only | not in games |
| Inertialization (pose-space) | `Inertializer` class | 0 app uses | unused |
| State machines | `AnimationStateMachine`/`StateGraph`/`BlendTree` | aura-clash has its *own* `src/animation/AnimationStateMachine.ts`. Animation-studio template uses BlendTree. | partially |
| Clip events | `AnimationClipEvents.ts` + `sampleClipEvents` | aura-clash hitboxes/sfx/vfx (`AuraClashArenaApp.ts:1044-1105`) | **real and good** |
| Lip sync / visemes | `VisemeController` + AuraVoice bridge; default example scales a mouth card | animation-channel, episode-builder templates | primitive |
| Crowd animation | `CrowdAnimation.ts` (25 lines) | 0 | stub |

---

## 6. How the games actually animate characters

All GLB facts below come from parsing each file's JSON chunk.

| Game | Visible character asset(s) | Skinned? | Clips | How motion is produced |
|---|---|---|---|---|
| **aura-clash** | `auraClashPlayerRig` (35,508 tris, 65 joints, 12 clips), `auraClashRivalRig` (26,982 tris, 65 joints, 10 clips) | yes | Quaternius UAL (`Idle_Loop`, `Punch_Jab`, …) | **Real clips** via `actor.animation.applyClips` / `playClip` (`AuraClashArenaApp.ts:3123-3171`). Attacks, hurt and KO **snap** (no blend, `:3072-3090`). 0.12 s blend between locomotion states only. Upper-body masked attack over walk. On top of the clips: rigid root roll/pitch plus non-uniform scale `setScale(s*squash, s*(2-squash), s)` (`:3173-3211`), and idle sway `sin(t*2.1)*0.026`. Shadows are bind-pose (§1.2). |
| **gallery-shift** | Thief `showcaseRunnerGirl`: **72 tris, 8 nodes, no skin**, 27 rigid node-TRS clips. Guard-2 `showcaseExpressiveRobot` (three.js RobotExpressive, 43 joints, 3 morphs). Guard-1 `robotcand` (100k tris, no skin, no clips). | thief no / guard-2 yes | — | `AnimationController.crossFade(..., 0.12)` → empty pose → **no clip playback** (§4). Guard-1 patrol is a route transform plus `sin(frameCount/34)*0.18` sway (`main.ts:1371`). |
| **skyline-runner** | `skylineArcticRunner.glb`: **4 triangles** (a textured card), 0 clips | no | 0 | Procedural: `abs(sin(runPhase))*0.05*height` bob, lean, `sin` sway, and non-uniform scale per state (`main.ts:3416-3525`). Accessories are separate nodes moved by hand. |
| **rooftop-buckets** | Visible: `rooftopAthleteShooter`/`Defender` (15,432 tris, **no skin, no clips**, static broadcast pose). Hidden: `rooftopDefender`/`LayupScorer` (191 joints, 4 clips) at `visible:false`, y=-10. | visible: no | — | Static statues moved by route transforms plus `sin(elapsed*1.8)*0.028` yaw sway (`main.ts:1118,1321`). Skinned actors exist only for "evidence" (`:124-137,278-284,530-535`). |
| **mech-hangar** | 16 rigid parts (400–608 tris each), 0 skins, 0 clips | no | 0 | "Parts are rigid attachments … no skinning" (`assembly.ts:6-8`). Movement plays a walk SFX every 0.42 s with no leg motion (`main.ts:1550-1554`). |
| **world-war-x** | 3 skinned fighters with **one** clip each (a walk), 2 static 200k–676k-tri sculpts, 2 **54-tri** boxes, `republicDuelist` skinned with 0 clips | mixed | ≤1 | `.animate({clip:"idle-ready", speed:0.44})`. Fuzzy resolve picks the first clip (walk), speed is ignored, and static fighters stay frozen. Primitive "pulse" halos/rings carry most of the motion (`WorldWarXApp.ts:1030-1160`). |
| **neon-swarm** | `neonCourierAvatar` (3,254 tris, 7 nodes, no skin). `generated/neonRainCourier.glb` = 4 tris. | no | 0 | `sin(t*9)*0.04` bob (`main.ts:1506`) |
| **blockfall / aurora / turbo / skyline "generated"** | `generated/*.glb` = **4-triangle cards** (1–2 MB textures on a quad) | no | 0 | billboards |
| **patrol-wing, deep-recovery, bank-shot, vault-breakers, siege-golf, pulse-tunnel, courier-rush** | vehicles/props (≤ a few k tris); no characters | no | 0 | rigid transforms |

Tally: **1 of 18** showcases drives a skinned rig with authored clips in visible pixels. The rest show cards, block figures, statues or rigid parts animated by sinusoids on the root transform. That is exactly the "Atari / early-Nintendo" motion signature: whole-body rigid wobble and squash, no secondary motion, no weight shift, no contact.

### 6.1 Root-transform squash on skinned characters

Aura-clash `syncFighterRoot` scales the root non-uniformly (`AuraClashArenaApp.ts:3205,3211`), and skyline does the same per state (`main.ts:3518-3525`). Non-uniform scale on a skinned hierarchy shears the normals. The skinned shader uses `mat3(u_normalMatrix)`, which does handle it, but the motion still reads as cartoon squash applied to a realistic Quaternius rig, an inconsistent visual language.

---

## 7. Asset/authoring side (C/E)

- The **animation-studio** template builds its default "high-fidelity" cast procedurally from ellipsoid/capsule segments, "one segment rigidly skinned per joint" (`templates/animation-studio/scripts/build-characters.ts:1-40`). That is articulated-toy rendering by construction.
- **Certification metric = "changed px".** In `docs/rendering/skinning-and-morphs.md:56-65`, rigs are "certified" because 10k–96k pixels changed between frames. The same doc says "No hero rig is certified yet" at `:37`, contradicting itself.
  - A pixel delta proves motion. It does not prove quality, correct shadows, or correct blending.
  - The roster's face slot `showcaseMorphExpression` is a "single-triangle morph unit card" (`:53-54`).
- Agents repeatedly worked around the broken controller path with procedural sway instead of fixing the engine. The skyline, rooftop and world-war-x comments show it, and evidence JSON records the workaround (`visibleMotionSource: "procedural-bounded-pose-..."`, skyline `main.ts:3621`).

---

## 8. Comparison to three.js r185 (same jobs)

| Job | three.js r185 | Aura3D | Gap |
|---|---|---|---|
| Bone palette | Persistent `boneTexture` per Skeleton, `texelFetch`, any count | 96-uniform array, or a **new texture per draw per frame** | perf/leak, mobile limit |
| Skinned shadows | depth/distance materials include skinning + morph | **position-only depth shader** | P0 visual bug |
| Morphs | `sampler2DArray`, unlimited targets, pos/normal/colour, all lit materials | GPU 4×64 unlit only; otherwise a CPU rebuild + upload per frame | P1 |
| Mixer weights < 1 | Blends with original value | Renormalises (full strength) | P2 |
| Rest restore | `PropertyMixer` restores original state on unbind | Previous clip values leak | P2 |
| Additive | `makeClipAdditive` with reference frame | absolute values multiplied | P1 for layered motion |
| Crossfade | `crossFadeTo(warp)`, `syncWith`, `setEffectiveTimeScale` | Linear or pose-hold, no sync | P2 |
| Interpolant | cached-index flat arrays | linear scan of an object array per sample | perf |
| IK | `CCDIKSolver` (examples) | two-bone analytic only | P2 |
| Velocity for TAA/motion blur | `VelocityNode` (WebGPU) handles skinning | throws for skinned | P1 |
| Root API default | `mixer.clipAction(clip).play()` | `node.play()` = single clip, no crossfade, speed ignored, first-clip fallback | P0/P1 defaults |

---

## 9. Recommendations (ordered)

1. **P0: skinned/morph depth shader.**
   - Add `aura3d/depth-skinned`, which includes `skinning_common` and the 8-influence variant.
   - Make `DepthPass.drawCaster` pick it whenever `caster.skinning` is present, and reuse `applySkinningUniforms`.
   - Route morph casters through the same resolved morphed geometry, or through a texture morph.
   - Add a unit check on the shader text so `aura3d/depth` cannot silently diverge again.
2. **P0: fix controller → GLB playback.**
   - When a controller clip has no sampler (`embedded-glb-animation-name`), `setAnimationPose` must not be called with an empty pose. Either skip the pose (`pose.bones` empty → undefined), or make the controller emit `clipSamples` that the root path feeds into `actor.animation.applyClips(samples)`. The wiring already exists as `applyImportedAnimationRuntime` at `AnimationController.ts:1831-1836`, but it is gated on an `importedRuntime` option nobody passes.
   - Read real clip durations from the GLB (the asset typegen should emit `duration` per clip).
   - Make `index.ts:13871` require `Object.keys(pose.bones).length > 0`.
3. **P0: delete the fighting-game template's `tracks: []` pose-fallback clips.** Bind the real GLB clips and make the template fail loudly if the asset has none.
4. **P1: root `node.play()` defaults.**
   - Crossfade by default (0.2 s) by keeping the previous clip and its time in the actor entry and calling `applyClips` with two weights.
   - Honour `speed`.
   - Turn the silent `available[0]` fallback into a warning plus an explicit `fallback: "first"` opt-in.
   - Restore rest TRS for bones the new clip does not animate.
5. **P1: single animation authority.**
   - Collapse `@aura3d/animation` `AnimationMixer`, the glTF runtime blend, and the engine controller's pose blender onto one sampler and blender working on flat typed arrays with cached keyframe indices. That gives one place to implement three.js-equivalent weight semantics, `makeClipAdditive`, warp/sync and real inertialization (`Inertializer` pose offsets, which already exist).
6. **P1: persistent bone texture.** One `Texture` per skin, updated in place, and drop the 96-uniform path (or cap it at 32). Dispose correctly.
7. **P1: texture morphs on lit/skinned materials.** Put the `MorphTargetPlan` data-texture path into the PBR and skinned shaders, build it once per geometry, and upload only the weight uniforms per frame. Retire the per-frame CPU geometry rebuild.
8. **P1: unify the skinned material** with the main PBR shader through defines. That removes the fork, gives characters CSM cascades, and removes the procedural wrinkle sin-noise.
9. **P1: skinned velocity.** Store the previous-frame palette and output motion vectors so TAA and motion blur stop throwing on characters.
10. **P2 (game/asset):** replace card/statue/box characters with rigged GLBs that have clips, and stop root-level `sin` sway and squash on skinned rigs. Blend attack/hurt transitions over 0.05–0.08 s instead of snapping. Wire `SpringChain` to real hair/cloth/tail bones, and add a `SpringBone` → bone-rotation binding.
11. **P2 (evidence):** replace the "changed px" certification with checks that matter:
    - Shadow-silhouette agreement between the skinned mesh and its shadow.
    - Transition continuity (max per-bone angular velocity spike during a clip swap).
    - Foot-slide distance.
    - "Clip actually sampled" (`tracksApplied > 0` on the visible actor).

## 10. Preserve

- `GLTFAnimationRuntime` per-target sampling plus palette refresh (correct math, glTF animation-pointer material/light tracks, foot-planting post-pass).
- The `skinning_common` chunk: 4/8 influences and the data-texture branch; only its upload strategy needs to change.
- Clip-event system (`AnimationClipEvents`, `sampleClipEvents`), which drives aura-clash hitboxes and sfx/vfx deterministically.
- `Inertialization.ts` offset primitives and `SpringBones.ts`: sound and pure, but unwired.
- `solveTwoBoneIk` plus `FootIk` as building blocks.
- Aura-clash's combat-to-clip-state mapping and upper-body layering, as the template for other games.
