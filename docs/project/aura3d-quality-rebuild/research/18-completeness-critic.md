# 18 — Completeness critic: gaps, contradictions, open questions

Branch `aura3d-quality-rebuild/audit` @ `c08d8acb`. Inputs: research reports 01–15 and 17-g1…g5 (there
is **no report 16**; the numbering skips it). Method: read all reports in full, then re-checked every
contradiction and every unverified claim that could change a verdict against the code (read-only:
`sed`/`rg` over `packages/` and `apps/`; no browser, build or test run). "Verified" below means the code
was re-read in this pass; line numbers are from HEAD `c08d8acb`.

---

## 0. Summary

- **Coverage is strong** on renderer, defaults, PBR, lighting, post, WebGPU, VFX, animation, camera/feel,
  assets, agent authoring, packaging, evidence and the 18 games. All 18 games in
  `tools/quality-rebuild-capture/games.json` are covered exactly once across 17-g1…g5.
- **The single biggest gap is that there is no pixel evidence at all.** Every score in every report is
  code-inferred. `benchmarks/quality-rebuild/` and `tools/quality-rebuild-capture/` exist, but no capture
  output exists anywhere in the tree (§3, Q1).
- **Brief requirements not yet delivered by any report:** the ~33-category scorecard (reports used 13
  axes), a consolidated Three.js capability matrix with API-coverage/implementation-quality/severity/fix
  columns, measured performance-tier costs (GPU/CPU/memory/bundle/mobile), a written quality-bar
  definition, and several technical-art topics (lightmaps/baking, cloth/hair, world streaming, light
  probes, LUTs) that were mentioned only in passing. §2 answers the technical-art gaps from code.
- **12 contradictions between reports**, none of which overturns a headline conclusion. §1 resolves each
  from code. The two that matter most: (a) Aura Clash really does run **rgba8 + Reinhard**, while every
  other game runs rgba16f + ACES (05 and 17-g1 are both right, about different paths); (b) the shadow map
  is fit to the **camera-culled caster set**, and its **size** comes from **all node positions including
  hidden/parked nodes** (02, 04, 06 and g1 each described a different half).

---

## 1. Contradictions between reports, resolved from code

| # | Topic | What the reports say | Resolution (verified) | Who was right |
|---|---|---|---|---|
| C1 | Ambient-kills-IBL location and reach | Lines cited as `12686-12700` (12), `12691-12706` (02), `12693-12707` (06/11/g2/g3), `12701-12716` (04/g5). Counts: 20/26 (02), 24/26 (04), 21/27 (06), ~21/25 (12), 19/23 (11) | Code is `packages/engine/src/agent-api/index.ts:12693-12707` (`preset: "authored-ambient"` at :12702, zeroed intensities at :12705). Counts differed because each report scanned a different app set (26–28 `apps/showcase-*` dirs incl. non-games). **For the 18 games** (census this pass): all 18 author `lights.ambient`; only Turbo and Siege Golf add an `environments.*` node (which makes ambient a dead parameter, :12638-12692 returns first); Aura Clash gets its env from the compatibility RenderSource (`index.ts:13994`). **Net: 15/18 games have zero IBL; 3/18 get the 128×64 LDR procedural env.** | Mechanism: all. Use 15/18 in the final autopsy |
| C2 | Shadow map fit | "culled visible items" (02); "all render items incl. ground" (04, g2); "all casters" (06, g1) | `Renderer.ts:623` passes `items.filter(item => item.castShadow !== false)`; `items` were already frustum-culled because the root sets `frustumCulling: true` (`index.ts:13994`, `Renderer.ts:2208-2209`). `createDirectionalShadowMatrix` fits an ortho box to the bounds of that set (`Renderer.ts:1964-1986`, `collectItemBounds` :2895-2903). Primitives pass `castShadow: node.castShadow` (undefined → caster), so ground planes and backdrops are included. **Map size** is separate: `sceneRadius` is computed from **every flattened node's position+scale** regardless of visibility (`index.ts:12949-12960`), so parked FX pools (y=-50/-60/-70) push maps to 4096. | 02 for culling; 04/g2 for "ground included"; g4's open question answered: hidden nodes inflate **size**, not **fit** |
| C3 | `pbr-direct.frag.glsl` | 04: dead file, not what runs. 06 and 17-g1 cite its line numbers as the running shader | `rg "pbr-direct.frag"` over `packages/` returns no importer. The running shader is the inline `aura3d/pbr-direct` string in `ShaderLibraryCore.ts:291-781`. 06/g1 conclusions still hold (same math), but **their line citations point at dead code** and must be re-pointed to `ShaderLibraryCore.ts` in the final doc | 04 |
| C4 | Default env prefilter | GGX importance-sampled (03, 04) vs "5 box-blurred mips" (08) | `EnvironmentMapResources.ts:233-282` is a GGX importance-sampled prefilter (`specularFilterModel: "ggx-importance-sampled-equirect-prefilter"`, :570). **But** it is bound with `new Sampler({ minFilter: "linear" })` (`ExternalParityRenderPreset.ts:169`), and WebGL2Device uses sampler objects (`samplerParameteri TEXTURE_MIN_FILTER`, `WebGL2Device.ts:3819-3824`), so only level 0 is ever read. | 03/04. 08's "box-blurred" is wrong; the practical outcome (no roughness variation) is the same |
| C5 | Tone-map operator | 05: root always ACES, exposure 1. 17-g1: Aura Clash runs Reinhard on rgba8 | Both true. Root builds ACES (`index.ts:12898-12904`), **but** `postprocess: compatibility?.source.postprocess ?? createProductionRuntimePostprocess(...)` (`index.ts:13996`). Aura Clash supplies `GameRenderPreset` postprocess with `targetFormat: "rgba8"` and no `toneMapping` (`GameRenderPreset.ts:372-386`); the plan pushes `tone-mapping` with `{}` (`RendererPostprocessPlan.ts:183-184`); the device default operator is `"reinhard"` (`WebGL2Device.ts:1906`). **Aura Clash is the only game on LDR+Reinhard**; the other 17 are rgba16f+ACES. The `character-controller` template uses the same preset. | Both, different paths |
| C6 | Fog strength at default | 02: ~40% at 10 m. 08: 76% at 10 m | `density 0.12`, `maxOpacity = 0.25 + 0.5·0.55 = 0.525` (`index.ts:12747-12759`). exp² at 10 m = 0.763 × 0.525 = **40%**. 08 omitted the cap (while describing it in the next bullet). | 02 |
| C7 | Shadow filtering quality | 06 row 25: "comparable" to three PCF. 02/04: manual nearest grid, no HW compare | Shadow binding uses `Sampler({ minFilter: "nearest", magFilter: "nearest" })` (`ShadowPass.ts:142`); `rg "sampler2DShadow|TEXTURE_COMPARE_MODE"` over `rendering/src` returns nothing. | 02/04. 06 is wrong |
| C8 | Primitive opacity | Turbo comment: "primitive path carries no alpha"; Patrol comment: sub-1 opacity renders "dark shells"; g2: production reads opacity | Production primitives do honor opacity: `blend: opacity < 0.999, depthWrite: off, cullMode: "none"` (`index.ts:14892-14933`). The **tint path for models ignores opacity** (`TypedGLBActor.ts:484-513` never sets alpha), which is why Aura's "ghost" at 0.32 and Skyline's ghost at 0.62 render opaque (g4 correct). "Dark shells" is consistent with `cullMode: "none"` + no intra-object sort (back faces blended) + the only blend mode being alpha-over (`WebGL2Device.ts:4404`) — **plausible, needs a screenshot**. The Turbo comment is stale. | g2 for primitives, g4 for models |
| C9 | Particles in Turbo | g2 table: particles "used 1/4 (Turbo)". 08: production bridge draws zero particle pixels | `rg 'effect === "particles"'` in `index.ts`: consumers only at :12519 (continuous-render flag), :16004 (safe-basic fallback), :18523 (Canvas2D). No production consumer. `createRootGpuParticleWorkload` is exported (`production-runtime/index.ts:1`) and **has no consumer in packages or apps**. Turbo's 420-particle fountain is a dead node. | 08. g2's "used" means authored, not rendered |
| C10 | Rooftop skinned athletes | 09: `visible:false` at y=-10 in play. 17-g3: mounted only under `?debug=animation`, and hidden even then | `apps/showcase-rooftop-buckets/src/main.ts:502-536`: wrapped in `...(animationDebugCapture ? [...] : [])`, both `visible: false`. Yet `route-health` `primaryAssets` lists them (`main.ts:1603`). | g3 |
| C11 | Number of FXAA games / production-profile games | "16+" (05), "17 of 18" (06), "7 apps opt into production" (01), "8" (12) | 18-game census: FXAA in **17/18** (Orbital Defense has none). `qualityProfile: "production"` in **4/18** (Aura Clash, Mech Hangar, Vault Breakers, Rooftop); Skyline explicitly `safe-basic` + `pixelRatio 0.7`. Profiles: `safe-basic` 1, `production` 1.5, `cinematic` 1.5 (`index.ts:4256/4271/4286`), applied before DPR (`index.ts:11133`). | Use census numbers |
| C12 | Audio | 10: "All 17 showcases supply asset cues … which is good". g2–g5: every cue is offline oscillator synthesis; Rooftop and Deep Recovery bypass `createGameAudio` with raw `HTMLAudioElement` | Both describe the same files: typed WAV assets exist, but 17/18 games' WAVs come from `scripts/build-sfx.mjs` oscillator/noise synthesis. Only Aura Clash ships sampled audio (Kenney CC0). | g2–g5 for quality; 10 only for "has a cue" |

Minor drift that the final autopsy should normalize: app-set denominators (26/27/28 vs 18), Rooftop sky
band hex (`#ea580c` in 08 vs `#c2410c` in g3; g3 quotes the code), and the WebGPU "4 instances" vs
ForwardPass "64" caps (both true, on different backends).

---

## 2. Gaps: topics not investigated, answered now from code

| Brief topic | Status before this pass | Finding (verified this pass) | Grade |
|---|---|---|---|
| **Lightmaps / baking** | Not investigated | No lightmap, baked-GI or bake pipeline anywhere: the only `lightmap` hit in `rendering/src`, `engine/src`, `assets/src` is a doc comment on the occlusion slot (`index.ts:1070`). The textured shader does carry a second UV set (`a_uv1`, `ShaderLibrary.ts:1653, 2085`), and primitives emit `uv1s: tilingSecondUnwrap(uvs)` (`index.ts:17355`), so an AO/lightmap slot on UV1 is the cheapest entry point. No CLI bake verb (11 §4.1). | Missing |
| **Light probes / SH** | 04 said "none" | SH9/cosine irradiance is computed (`EnvironmentMapResources.ts`) and never bound; no `LightProbe` type, no per-object probe selection. `ReflectionProbe.ts` captures a raw cube with no prefilter and no consumers (04 §5.7). | Fake parity |
| **LUT grading** | 05: "no 3D LUT on GPU" | Confirmed: `rg "TEXTURE_3D|texImage3D|sampler3D"` over `WebGL2Device.ts` and the shader libraries returns nothing. `colorGrade.lut` is accepted and dropped (05 §6.7). | Missing |
| **Cloth / hair** | 09 covered spring bones only | No cloth, Verlet or strand system in `rendering`, `engine`, `animation` or `physics` (only `SpringBones.ts` matches "hair"-adjacent terms). Spring bones are bound to no skeleton bone in any app (09 §5). | Missing (springs exist, unwired) |
| **World / scene streaming** | 07 mentioned texture residency | `assets/src/TextureStreaming.ts` is a pure budget calculator (`evaluateTextureStreamingBudget`, residency planner) used only for diagnostics (`index.ts:13099, 14606-14617`). No mip streaming, no chunk/scene streaming, no async scene add (`AuraRuntimeNodeRegistry` cannot add nodes after mount, g4 §0.6). `setScene` tears down and remounts (10 §9). | Missing |
| **Occlusion culling** | 07: none | Confirmed: the only GPU queries are timer queries (`RendererTiming.ts:192`) and WebGPU timestamps. | Missing |
| **Light-count overflow** | g5 claimed "excess dropped or culled" without code | Clustering engages only when `lights.length > 16` (`ForwardPass.ts:250-257`). In every textured variant that defines `A3D_PBR_DISABLE_CLUSTERED_LIGHTING` (all extension variants, `ShaderLibrary.ts:2066-2075`) the loop is `count = min(u_lightCount, 16)` (`ShaderLibrary.ts:3140-3147`). Lights 17+ are **silently ignored** for those GLB materials; base-variant materials use the 2D CPU cluster grid. Gallery Shift (~31 lights) and Courier (~20) hit this. | Confirmed defect |
| **Per-act fog in Skyline** | g2: "unverified whether act toggling changes which fog is first" | Fog is resolved from the static snapshot with `nodes.find(...)` (`index.ts:12740-12745`), not from runtime visibility. Skyline mounts five act fog nodes (`main.ts:1391, 1904`) and toggles them through runtime handles (`main.ts:2229-2238, 3864`). **Act 0's fog is used for all five acts**; the toggling has no effect on fog (volumetric fog, if present, would win over all of them). | Confirmed defect (code-read) |
| **Ambient energy scale** | 04 claim; 06 implied same convention as three | `ambientEnvironment = u_environmentColor * u_environmentIntensity * hemi` feeds `kd * albedo * diffuseIrradiance` with no 1/π (`ShaderLibraryCore.ts:622-634`, `ShaderChunks.ts:205-214`). Confirms 04: Aura ambient ≈ π × three `AmbientLight`. | Confirmed |
| **Capsule primitive** | 02/06 (cited lines in fallback region?) | Production path: `if (primitive === "capsule") return createCapsuleApproxGeometry()` (`index.ts:14979`), which returns `createSphereGeometry()` (12×16, `index.ts:17359-17362, 17477`). | Confirmed |
| **Animation controller freeze** | 09 traced it; g2 noted root `playClip` exists | Both hold. The production path takes `applyRetargetedPose` whenever a pose object exists (`index.ts:13871-13878`), else `applyProductionActorAnimation`. String clip registrations get `duration: 1`, no sampler, `durationSource: "defaulted"` (`AnimationController.ts:2646-2666`). Rooftop's "bind-pose reads as a T" (`main.ts:510-514`) with `.animate({ captureTime: 0.62 })` is an **unresolved runtime question** (Q6). | Confirmed by code; runtime pending |
| **Ghost/tint opacity** | g4 claim | Confirmed: `applyMaterialTint` sets colour, emissive 0.28 default, roughness 0.38, metallic 0.16 and disables BC/MR textures; it never touches alpha or blend (`TypedGLBActor.ts:484-513`). | Confirmed |
| **Bloom knee validator** | 05 | Confirmed `softKnee > 0.5` throws (`WebGL2Device.ts:4495-4496`); this is why 16 games copy 0.5. | Confirmed |
| **Terrain, vegetation, water, weather, day/night, decals, trails, GPU particles, SSR, DOF, motion blur, SSAO/GTAO, contact shadows, volumetric fog, skies, HDRI mgmt, LOD, IK, retargeting, blending** | Covered by 03–11 | No new code check needed; the reports agree. One-line status for the matrix: terrain = geometry only, no splat; vegetation = CPU planner, two-box trees; water = box bands / CPU Gerstner telemetry; weather = ≤160 static PBR boxes; day/night = sphere sun/stars/clouds, zenith discarded; decals = works, 0 games; trails = boxes; GPU particles = demo on its own canvas; SSR/DOF/MB = post-tonemap LDR, 0 games; SSAO = raw-depth ≈0; contact shadows = name-counted blobs; volumetric fog = CPU radial blur; skies = clear colour only, `environmentBackground` never set by root; HDRI = 4×1k files, 0 games; LOD = authored `distanceLod` only; IK = two-bone; retargeting = 2 template scripts; blending = single-clip root, no crossfade. | Covered |

### Brief deliverables with no report yet (must be produced in the final autopsy)

1. **~33-category per-game scorecard.** Reports use 13 axes (env, assets, materials, lighting, shadows,
   IBL, post, VFX, animation, camera, HUD, audio, juice). Suggested 20 additional axes that the reports
   already contain data for: resolution/DPR, AA, tone mapping/exposure, colour grade, fog/atmosphere,
   sky/background, reflections, AO, texture density, triangle density, art-style coherence, character
   quality, locomotion/animation blending, physics feel, camera feel (lag/shake), VFX rendering path,
   frame pacing/loop, UI typography, menus/flow/transitions, review-vs-play parity (evidence honesty).
2. **Consolidated Three.js r185 capability matrix** (Aura vs three: exists/implementation quality/API
   coverage/visual quality/severity/fix). The rows are scattered across 02–11 ladders; none has a
   three.js API-coverage column or severity in one place.
3. **Performance tiers (Low/Med/High/Ultra) with GPU/CPU/memory/bundle/mobile cost.** No report measured
   anything. The only numbers that exist: root "." bundle 575,343 B gz vs 80 kB budget, lean 77,458 B gz
   (13 §9); foundation bundle 1.42 MB vs three 0.73 MB (15 §4.3); texture VRAM estimates (~200 MB per
   Meshy hero, >500 MB Gravity Post, 11 §3.5); draw-call ratios 1.9–7× vs three (15 §4.1). Existing
   "tiers" are DPR-only or degrade-only (06 §3, 07 §7). No mobile device has ever been tested.
4. **Quality-bar definition.** 14 §7 and 15 §11 give ingredients (reference frames, perceptual metrics,
   broken-control-must-fail, rubric). Nobody has written the bar itself (target references per genre,
   numeric thresholds, rubric axes and pass marks).
5. **Package/API consolidation plan and delete list** exist in pieces (13 §12, 07 §10, 08 §12 P2, 14 §6,
   15 §12, 17-g1 §8). They need merging into one ordered list with owners and dependencies.

---

## 3. Claims still made without pixel evidence

Every visual verdict in 01–17 is inferred from code. Specifically unverified and verdict-relevant:

- All 18 games' appearance at native DPR on a real GPU (no screenshot exists; the 3.0.1 "Visual QA 17/17"
  screenshots were left in `/tmp`, 14 §3.9).
- Aura Clash shadow texel density ("PLAUSIBLE blurry", g1 §1.4) and Mech Hangar shadow density (g1 §2.3).
- Patrol Wing "dark shells" for translucent primitives (C8).
- Neon Swarm review hero card under `replaceSurfaceTextures` ("should turn into a pale rectangle", g4).
- KTX2 sRGB loss on compressed upload (03 §5.1, 11 §3.4: "PLAUSIBLE").
- The VAO leak per instanced draw (07 §3.3: "confirmed by code, not measured").
- Whether the HDRI chain (`environments.hdri`) actually renders correctly end to end; zero apps use it,
  so it has never been exercised on the product path.
- Whether the skinned clip path visibly animates on root (`playClip` exists; Rooftop authors say the
  frame "reads as a T").
- WebGPU device output (no game uses it; all statements are from shader text).

---

## 4. The 10 open questions the final autopsy must resolve

1. **What do the 18 shipped frames actually look like?** Run `tools/quality-rebuild-capture` against
   the default (non-review) URLs at native DPR on a GPU runner (macOS or GPU VM, never SwiftShader), plus
   `?capture=review` for the divergence record. Every score in 17-g1…g5 must be corrected from those
   frames before the scorecard is published.
2. **How much of the gap is defaults versus capability?** Capture each game twice: as shipped, and with
   a "fixed defaults" build (ambient additive to a default HDR env, shadow strength 1.0, DPR
   `min(dpr,2)`, MSAA-only AA, bloom threshold ≥1 with knee ≤0.1, exposure wired, tint multiplies). That
   one A/B decides whether the rebuild starts with a defaults patch or a renderer replacement.
3. **Own the renderer or build on three.js r185?** 07 §10 recommends adopting `WebGPURenderer`+TSL
   (Option A); 02/03/04/05/13 implicitly assume repairing Aura's renderer. Nothing else in the plan can be
   sequenced until this is decided, because it determines whether PMREM, shadows, post, particles,
   instancing and materials are ported or replaced.
4. **Which renderer paths are deleted?** Today games can land on four pipelines (production bridge,
   silent safe-basic fallback, lean `LeanWebGL2Device` fork, compat-source preset path with rgba8 +
   Reinhard). The final doc must name the single surviving path and whether a production failure throws
   or falls back.
5. **What is the default "look baseline" every `createAuraApp` scene gets?** Default environment
   (bundled HDRI vs procedural RoomEnvironment equivalent), visible sky/background, tone operator (ACES
   vs AgX/Neutral), shadow config, fog-to-background rule, AA, DPR. This is the highest-leverage single
   decision for both games and agent output (02 R1, 04 P0, 06 §8, 12 P0.1).
6. **Does skinned animation work on the root path, and what is the one animation authority?** Resolve
   the controller-empty-pose freeze (09 §4), Rooftop's "T" pose, and the four parallel animation stacks.
   Needed before any character-heavy game is rebuilt.
7. **What is the VFX architecture?** A billboard/flipbook particle pass with additive/premultiplied blend
   modes, soft particles from the depth texture, and a runtime spawn/pool API so `game.effects` and
   `gameFeel` render. Today `effects.particles` produces zero production pixels, there is no additive
   blend, and nodes cannot be added after mount (08, 07, 10, g4).
8. **What is the asset strategy and the admission bar?** Curated per-genre kits vs Meshy promotion vs
   commissioned art; an optimize stage (Meshopt/KTX2/resize/tangents/LOD); banning 4-tri unlit cards and
   synthesized UV-less GLBs from `release`; removing the "stylized flat-color" waiver
   (`aura3d-cli/src/index.ts:3376-3381`). Per-game triage depends on it.
9. **What is the quality bar, and who judges it?** Reference frames per genre (well-built three.js r185
   scenes and/or the unused indie stills in `tests/reports/_visual-critic-refs/`), perceptual metrics with
   broken-control tests, a named-human rubric, and the rule that evidence must come from the shipped
   lane. Also which of the ~340 report-aggregator tools are deleted.
10. **What are the performance tiers and target devices?** Define Low/Med/High/Ultra as concrete feature
    sets (DPR cap, shadow cascades/size, env resolution, bloom pyramid, AO, TAA, particle budget, texture
    max size), measure each on named desktop and mobile GPUs, and set bundle budgets per tier. Nothing in
    the repo measures this today. Alongside it, decide the portfolio: which games are polished, rebuilt or
    deleted (Orbital Defense is the obvious delete candidate; 17-g1 §3.4).

---

## 5. Recommended corrections to carry into the final autopsy

- Use **15/18 games with no IBL** (C1), **17/18 with FXAA-on-MSAA**, **4/18 on `production` profile**,
  **1/18 (Aura Clash) on rgba8+Reinhard** (C5), and **0/18 with sky, HDRI, rendered particles, decals,
  SSR or DOF**.
- Re-point 06 and 17-g1 shader citations from `pbr-direct.frag.glsl` to `ShaderLibraryCore.ts` (C3).
- State the shadow fit precisely: camera-culled casters including ground for the box, all nodes
  including parked ones for the map size, no texel snapping, no HW compare, strength 0.32, CSM
  unreachable (C2, C7).
- Drop 08's "box-blurred mips" and 06's "PCF comparable" statements (C4, C7).
- Add the two new defects found here: lights 17+ silently ignored on extension-textured GLB variants,
  and Skyline per-act fog frozen at act 0.
