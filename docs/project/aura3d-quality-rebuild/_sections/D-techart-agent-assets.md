# D. Technical art, agent authoring, and assets

Evidence base: research reports 04, 05, 07, 08, 09, 10, 11, 12, 16, 18, corrected by 19 (claim
verification). Visual judgments come from 21 (shipped game screenshots, GH Actions run 37289688772,
macos-14 ANGLE Metal) and 23 (same-input Aura3D 3.0.1 vs three.js r185 benchmark). fps figures come
from `evidence/games/report.slim.json` (desktop run on a virtual M1 runner). Code citations are
`path:line` at HEAD `c08d8acb`. Unless a line says it was observed in a screenshot, it was read from
code.

The question this section answers: how much of the gap is missing technical-art capability, how much is
agents producing weak scenes, and how much is the assets. Short answer: almost none of the gap comes
from missing headline features. It comes from (1) broken defaults on features that already exist, (2)
an authoring path that teaches and rewards the 2012-era recipe, and (3) a release pipeline that
certifies programmer art and demotes the best assets. All three show up in the same frames.

---

## Technical-art findings

Columns:
- **Status in Aura3D** is what reaches pixels on the root `createAuraApp` production bridge, not
  what exists as a library.
- **Explains gap?** asks whether the item's absence or brokenness materially explains the low scores
  in 21/23. Yes means it is visible in most frames. Partly means it is visible in some genres or is
  secondary. No means three.js-class games ship without it.
- **Priority:** P0 = in the default look baseline, ship first. P1 = needed for competitive genre
  frames. P2 = later. Defer = do not build now.

Vision category averages across the 18 games (21) give the scale: particles 1.4, IBL/reflections 1.5,
shadows 1.6, VFX 2.2, texture quality 2.3, environment/world 2.7, postprocessing 2.9, modeling/assets
3.1, lighting 3.2, tone mapping 3.8 (out of 10).

### Lighting and environment

| Item | Status in Aura3D (evidence) | Explains gap? | Priority |
|---|---|---|---|
| Lighting presets | `lights.studio()` gives three directionals, all with `shadowRequested: false` (`agent-api/index.ts:13299-13360`); four skills teach it (04 §345). Any `lights.ambient` with no `environments.*` node zeroes `environmentMapIntensity` and `environmentMapSpecularIntensity` (`index.ts:12693-12707`; C1). **15 of 18 games have zero IBL.** Turbo and Siege Golf get the procedural env, and Aura Clash gets env through its compatibility source (18 C1, 19 C1). Aura ambient has no 1/π, so it is about π× three's `AmbientLight` (`ShaderLibraryCore.ts:622-634`; 18 §2). | **Yes.** It is the main cause of the "Lambert plastic" read: ibl_reflections averages 1.5, and benchmark 13-ibl-only scored 3.5 vs 8 (22). | **P0**: ambient becomes additive, a default env is always present, and the ambient scale is corrected |
| Studio rigs | `environments.studio/productHero/...` resolve to a 128×64 procedural gradient that is Reinhard-encoded to RGBA8 sRGB before prefilter (`ExternalParityRenderPreset.ts:133-151`; C10). It is bound with `minFilter: "linear"`, so only mip 0 is ever read and reflections ignore roughness (`ExternalParityRenderPreset.ts:163-169`; 04 TL;DR 4, 18 C4). The brightest env reflection is about 0.65 linear (04 §5.2). | **Yes**, for product and material scenes. Benchmarks 06-metal-roughness-sweep 4/10 ("blotchy prefiltered specular, dead roughness-1 end") and 07-sheen 3/10 (23). | **P0**: mipmapped sampler, half-float, ≥256 px faces, untonemapped source |
| Outdoor lighting | There is no sun+sky lighting model. Outdoor games pick `environments.studio` (turbo `main.ts:3002`, siege-golf `main.ts:838`). The no-light default "gameplay" preset has a cyan specular `[0.2,0.96,1.0]` (`ExternalParityRenderPreset.ts:588-606`). | **Yes.** Benchmark 09-outdoor-environment 3.5 ("flat sky, washed-out lighting, almost no shadow contrast", 23). Every outdoor game in 21 lacks a sky-matched key. | **P0**, delivered by the sky item below |
| HDRI management | `environments.hdri` exists and has **0 callers** in apps, examples or templates (11 §3.3). The repo has 4 HDRIs, all 1k, and 0 texture or environment entries in the root manifest (11 §2.1). The corpus manifest aliases "venice-sunset" to `studio_small_08_1k.hdr` with the same sha256 (08 §8.2). The Poly Haven adapter only deep-links models (`adapters/poly-haven.ts:25-35`). The HDR PMREM pulls diffuse 82% toward global average (`PMREMGenerator.ts:345-350`). | **Yes.** Without a curated HDRI set, no default env is possible. | **P0**: admit 4–6 curated 2k HDRIs as engine assets, add a Poly Haven HDRI/texture adapter, and fix the PMREM blend |
| Environment / reflection probes | `ReflectionProbe.ts` captures a raw cube with no prefilter, no per-object selection and no blending, and nothing uses it. SH irradiance is computed and never bound (04 §5.7; 18 §2). | **No.** The global IBL is missing first; probes only matter for interiors after that. | P2 |
| Light baking | Absent: no lightmap, baked-GI or bake verb (18 §2). The textured shader has `a_uv1` (`ShaderLibrary.ts:1653`), but the JS-built game meshes have **no UVs at all** (11 §4.5). | **Partly.** Missing grounding and AO is visible, but full-strength realtime shadows and AO fix most of it more cheaply. | P2: an AO bake in the asset optimize stage, not a lightmapper |
| Procedural skies | Missing. The production bridge clears to one colour (`index.ts:13596`). `EnvironmentBackgroundPass` exists but root never sets `environmentBackground` (C9). `planSkyBackdrop` emits discrete bands (`LayeredSceneComposition.ts:503-543`). `sky.dayNight` makes the sun, stars and clouds from primitive spheres and discards the zenith colour (`index.ts:3730-3769`). 0 games use it. | **Yes.** "Black void" or "flat solid-colour void" is named in nearly every 21 environment_world verdict (avg 2.7). | **P0**: wire `environmentBackground`, port r185 `Sky.js` (Preetham + clouds) as a background pass, and render the same sky into IBL |
| Volumetric fog | `effects.volumetricFog` is a surface lobe plus a **CPU** god-ray radial blur on 8-bit readback, anchored at a fixed UV `[0.5, 0.18]` (`PostProcessPass.ts:1177-1255`, `Renderer.ts:1245-1262`; 05 §6.5). It is used only by Deep Recovery, which drags its whole post chain into CPU readback (05 #7). | **No** for looks. **Yes** for Deep Recovery's measured 0.5 fps, the worst capture in `report.slim.json`. | P1: delete the CPU path or move it to the GPU. Real froxel fog: Defer |
| Atmospheric scattering | None. Forward fog never touches the background; `maxOpacity = 0.25 + i·0.55` caps default fog at 0.525 (`index.ts:12747-12763`; 18 C6). Height fog is a multiplier, not integrated along the ray (`ShaderChunks.ts:472-517`). | **Partly.** No aerial perspective and hard silhouettes against the void ("no fog or value falloff for depth", 21 Aura Clash). | P1: fog-to-sky composition, `maxOpacity` 1, analytic height fog. Ships with the sky pass |

### Tone, colour, camera

| Item | Status in Aura3D (evidence) | Explains gap? | Priority |
|---|---|---|---|
| LUTs | Not on the GPU path at all (no `TEXTURE_3D`/`sampler3D`); `colorGrade.lut` is accepted and dropped (05 §6.7; 18 §2). | **No.** | Defer |
| Color grading | The bridge forwards only `contrast` and `saturation` (`index.ts:12905-12910`). `exposure` (which every game passes, 1.02–1.06), `vignette`, `temperature`, `shadows` and `highlights` are silently dropped (05 #5; C12). Neon Swarm fakes a vignette in the DOM. | **Partly.** Agents believe they graded. Each game's grade intent never ships. | P1: wire the existing device uniforms, and make dropped fields throw |
| Cinematic tone mapping | ACES is hard-wired at exposure 1 (`index.ts:12898-12904`). "AgX"/"Neutral" are per-channel stand-ins (C12). Aura Clash alone runs rgba8 + Reinhard, peak about 188/255 (18 C5). Bloom `softKnee 0.5` plus a hidden ×7 gain blooms mid-tones and produces the milky wash (C13; validator forces `≤0.5`, `WebGL2Device.ts:4495`). There is no output dithering (05 §7). | **Partly to yes.** "Murky", "washed out" and "lifted blacks" recur in 21 (tone_mapping avg 3.8) and 23 (18-game-scene: "bloom is overblown, palette muddy"). | **P0**: exposure API, bloom threshold ≥1 with knee ≤0.1, dither, Aura Clash on rgba16f. P1: real AgX / Khronos Neutral |
| Camera presets | Follow, shoulder and collision-aware rigs exist. `collisionAwareOrbit` has 0 users (10 §1). Shake is low-pass filtered to 4–7% of amplitude in Skyline, and roll is dropped (`GameCameraRigs.ts:571-576`; 10 §3.3). Prompt-plan `camera` is ignored (C17). | **Partly.** 21 attributes 10–25% per game to camera/composition, but that is framing chosen by the route (tiny subjects, distant static cams), not a missing preset. | P1: framing guidance in the art-direction skill, apply shake post-damping. No new preset library |
| DOF | Exists. It runs post-tonemap on LDR, with no near/far separation (05 §6.3). 0 games use it. | **No.** | Defer |
| Motion blur | Exists, LDR, no tile-max (05 §6.4). 0 games use it. | **No.** | Defer |
| SSAO / GTAO | "SSAO" uses raw non-linear depth: at the default near 0.05 / far 100, per-tap occlusion is **0.0000** for any surface more than about 1.5 m from the lens. It is applied after ACES (`WebGL2Device.ts:3091-3129`; C14). Six games pay for it and get nothing. `contactOcclusion` maps to the same pass. | **Partly.** It adds to the "objects float" read alongside shadows. | P1: linear-depth GTAO with normals, run in HDR before tone map |
| SSR | Linear ray march, about 2010-era, on tone-mapped LDR. 0 games use it (05 §6.2). | **No.** Wet-floor reflections are noted as missing in Aura Clash and Rooftop, but they are secondary to IBL. | P2 |
| Screen-space / contact shadows | "Contact shadows" in diagnostics are counted from **node names** (`index.ts:4485-4487`). Agents compensate with 0.5-opacity blob spheres (rooftop `main.ts:354`, skyline `main.ts:1917`, turbo `main.ts:3252-3284`; 12 §4.4). The real defect is the shadow map: strength 0.32 (`index.ts:12966-12968`; C11); nearest-sampled grid PCF with no HW compare (`ShadowPass.ts:142`; 18 C7); fit to all casters with no texel snapping; a position-only depth shader, so skinned characters cast bind-pose shadows and instanced casters are wrong (C4); CSM unreachable from root (C5). | **Yes.** Shadows average 1.6 in 21. Benchmark 12-shadows: "shadows nearly invisible and one light's shadows absent", 3.5 vs 8 (23). Benchmark 01: a cube shadow is "a faint gray smudge". | **P0**: strength 1.0, HW-compare PCF, skinned/instanced depth variants, texel snapping. Contact shadows: P2 |

### VFX and world systems

| Item | Status in Aura3D (evidence) | Explains gap? | Priority |
|---|---|---|---|
| Decals | Mesh-projection decals work (`ProjectedDecalGeometry.ts`, `Decals.ts`, max 32, no normal/roughness blend). **0 games** use them (08 §7). | **Partly.** Tyre marks, scorch marks and wear are absent, which feeds texture_quality 2.3. This is an authoring and asset failure, not a capability gap. | P2: teach and use them. Normal/roughness blending later |
| Trails | `GameRuntime` dash/slash trails are scaled **boxes** (`GameRuntime.ts:3879-3915`). The only ribbon code lives in the camera-locked `ResidentGPUParticleRenderer` (`:4-10`). | **Partly**, as part of VFX. | P1: a ribbon emitter on the new particle pass |
| Destruction | No fracture or Voronoi code in `packages/` (rg returns no matches; not covered by the research reports). Siege Golf has rigid Rapier crates only. 21 Siege Golf: "no catapult, walls being breached … destruction debris". | **No.** It is genre-specific. Debris particles cover most of the perceived need. | Defer. Pre-fractured authored assets if Siege Golf survives |
| Impact VFX | `game.effects` and `gameFeel` are data-only. Pixels appear only if the route mounts `.nodes()`, and **0 of 18 routes do** (16 §4; C8). Even then the kit emits one shrinking emissive sphere, torus or box per effect. Nine routes hand-roll spark pools. | **Yes.** vfx averages 2.2. Aura Clash 04-action: "no hit sparks, flash, shake, or particles at contact" (21). | **P0**, delivered by the particle pass, plus the effects runtime rendering by default |
| GPU particles | `effects.particles/rain/snow/flipbook/beam` produce **zero production pixels** (`index.ts:13722-13723`, `3724-3728`; C8). There are four disconnected stacks: CPU modules with no draw target, WebGPU compute with per-frame readback, a renderer with a compile-time camera, and XY-plane squares (08 §2.1). The only blend mode is alpha-over (`WebGL2Device.ts:4404`). | **Yes.** Particles average 1.4. Benchmark 14-particles is **1/10** vs 6.5 ("the scene's entire subject is missing"). | **P0**: one instanced camera-facing billboard pass with flipbook, additive and premultiplied blend, soft particles from the depth texture, and 6–8 bundled CC0 sprites (08 R1) |
| Water | `water.surface` is opaque PBR box bands plus sphere foam (`index.ts:3870-3900`). The ocean is CPU Gerstner telemetry, and planar capture is 128² and CPU-composited. 0 games use it. Patrol Wing's ocean is a PBR plane with metallic 0.28. | **Partly.** It is visible only in Patrol Wing and Deep Recovery. | P2: a `Water.js`-model material |
| Terrain | `TerrainHeightfield.ts` makes real geometry but has no material and is not exported from root (16 §6). `TerrainTiles.ts` returns plan objects only. There is no splat or triplanar anywhere (`MaterialPresets.ts:243`). Aurora, Patrol and Pulse hand-roll untextured terrain. | **Partly.** Aurora Lander's "one untextured green blob" and Patrol Wing's "faceted flat-green hill" (21). | P1: `material.terrain` splat + triplanar, and export the heightfield |
| Vegetation | `planScatterInstances` is a CPU planner. Its only adopter draws "two boxes per tree" (`smart-city-control/main.ts:157-166`). There are no foliage cards and no wind shader. Instancing is capped at 64 with a per-frame VAO leak (07 §3.3) and 4 instances on WebGPU. The benchmark found a **confirmed engine bug**: `createProductionInstanceTransforms` omits `node.size` (`index.ts:14747-14754`; 22, 16-instancing 2.5 vs 7). | **Partly.** "Cone trees", "ellipsoid blobs as hills and trees" (21 Turbo, Siege, Patrol, Skyline). The fix is curated tree assets plus working instancing, before any vegetation system. | P1: fix the instancing bug and leak. Foliage material: P2 |
| Weather | `weather.precipitation` is ≤160 static PBR boxes or spheres, frozen at t=1.2 s (`index.ts:3772-3810`). 0 games use it. | **No.** | Defer, then build it on the particle pass |
| Day/night | `sky.dayNight` is sphere sun, moon, stars and clouds, sitting 6.5–7 units from the origin. 0 games use it. | **No.** | Defer. The sky shader replaces it |

### Animation and performance

| Item | Status in Aura3D (evidence) | Explains gap? | Priority |
|---|---|---|---|
| Cloth / hair | No cloth, Verlet or strand system. `SpringBones` is bound to no bone in any app (09 §5; 18 §2). | **No.** | Defer |
| Animation blending | Root `node.play` is a single clip with no crossfade, speed ignored and first-clip fallback (09 §0.4). The documented `AnimationController` + `clipRegistry` path emits an **empty pose**, so the clip never plays. The fighting-game template ships fighters in bind pose (`templates/fighting-game/src/game/fighters.ts:57-79`; C16). Only Aura Clash drives a skinned rig per frame. | **Partly.** Most "characters" are cards, statues or boxes (an asset problem first). For templates, the freeze is P0 because every generated fighter starts frozen. | P0: fix the controller freeze. P1: default 0.2 s crossfade |
| IK | Analytic two-bone and foot IK, used by Aura Clash only (09 §5). | **No.** | Defer |
| Retargeting | `HumanoidRetargeting.ts` is used only by 2 animation-studio scripts. | **No.** | Defer |
| LOD | `distanceLod` switches only between authored primitive levels. There is no simplification and nothing reaches GLBs (07 §3.4; `performance/LOD.ts:13-20`). | **No** for looks. Partly for fps: Gravity Post (126 MB of GLB) runs at 6.4 fps. But Bank Shot (1 MB) runs at 14.9 fps, so engine CPU paths dominate, not triangle count. | P1, inside `assets optimize` (meshopt simplify) |
| Occlusion | None. The only GPU queries are timer queries (18 §2). | **No.** | Defer |
| Streaming | `TextureStreaming.ts` is a budget calculator. There is no mip, chunk or scene streaming, and every app `dist` copies all 1.7 GB of `public/aura-assets` (11 §2.1). | **No** for looks. It is an ops and bundle problem. | P2: per-route asset deploy |

### What the list shows

Eight items materially explain the gap: lighting presets, studio env, outdoor lighting, HDRI, sky,
shadows, particles/impact VFX, and tone/bloom defaults. Every one of them is either a default on
existing code (ambient branch, shadow strength 0.32, bloom knee, `pixelRatio: 1` from `safe-basic`
(`index.ts:4256`, C2), sampler filter) or a pass whose code already exists in `@aura3d/rendering`
but is not wired to root (`EnvironmentBackgroundPass`, CPU particle modules, GPU compute kernels).
The long tail (DOF, motion blur, LUT, SSR, IK, retargeting, cloth, occlusion, destruction, weather,
day/night) does not explain the scores. three.js-class browser games ship competitive frames without
any of it. Building that tail first would repeat the failure mode documented in 01: feature count
rising while pixels stay flat.

The benchmark isolates the engine's share of the gap. With identical GLBs, HDRI and camera (harness
judged fair, 22), Aura scores 1–6.5 against three's 4.5–8.5 in vision (23). Its best result is
03-damaged-helmet at 6.5 vs 7: a curated hero asset with no shadow receiver and no background.
Whenever a scene needs shadows, a sky, particles, transmission, sheen or instancing, Aura falls to 1–4.

---

## Agent-authoring findings

Agents produce weak output because the authoring path is a compliance system with no art system next
to it. Every layer an agent reads asks for labels, evidence and forbidden-pattern avoidance. No layer
defines a good frame, teaches how to make one, or requires the agent to look at the result.

### 1. Evidence outweighs craft about 6:1

Line classification over the shipped skills and docs (12 §1.2, regex classifier, generous on the craft
side):

| Corpus | Non-blank lines | Evidence-only | Craft-only |
|---|---:|---:|---:|
| All 13 skills + `boundaries.md` | 1318 | 354 (27%) | 58 (4.4%) |
| `llms.txt` | 246 | 70 | 12 |
| `docs/agents/*` + `docs/guides/*` | 2159 | 541 | 148 |
| `aura3d-browser-game` skill | 103 | 28 | **0** |
| Game path (browser-game skill + game guide + game standards) | — | 84 | **4** |

Term counts: `evidence` 283, `claim` 237, `screenshot` 163. Against those: `tone mapping` 2,
`exposure` 1, `color grade` 1, `art direction` 1, `beautiful` 0. `shadow: true` appears 0 times.
`effects.colorGrade`, `ambientOcclusion`, `antiAlias`, `renderer.qualityProfile` and `pixelRatio` are
used in 8–16 showcases but appear in 0 templates and 0 skill or doc lines (12 §1.3).
`environments.hdri` is used by 0 games and 0 templates.

The one look-capable skill, `aura3d-materials-environments`, is **not installed for any game
template** (`packages/aura3d-cli/skills/manifest.json`). `aura3d-core` routes to it only on
"Materials, textures, HDRI, skies, water, weather" signals (`aura3d-core/SKILL.md:71`). The one
craft document, `docs/agents/cinematic-scene-quality.md` (26 craft lines of 79), has no API values and
is not linked from the game skill or game guide.

### 2. The flagship starter discards lighting silently

`templates/mini-game`, the platformer the game skill routes to first, imports `@aura3d/lean/game`. The
lean lighting and environment calls return inert intents and drop their arguments:

```ts
// packages/lean/src/base.ts:252-259
export const lights = {
  directional: (_options: { readonly intensity?: number } = {}) => ({
    ...intent("light"),
    position: (_x: number, _y: number, _z: number): AuraLeanIntentSpec => intent("light")
  })
} as const;
export const environments = { studio: (): AuraLeanIntentSpec => intent("environment") } as const;
```

The lean frame submits only `{ collectRenderItems, cameraPolicy }` (`base.ts:386-415`; C7). It submits
no lights, environment, shadows or post. Model matrices use identity rotation (`base.ts:521-523`), so
the 25-clip hero cannot turn or animate. `cameraRig.follow` runs only inside `publishEvidence`
(`main.ts:214`), so the game-feel the harness records never reaches pixels. The `product-viewer`
template's `environments.studio()` is the same no-op. Nothing warns the agent.

### 3. Prompt-plan fields are ignored and then reported as applied

`compilePromptPlan` (`index.ts:10118-10141`) dispatches to four hard-coded `promptRecipes`. From the
plan, the recipes read only `plan.subject.label` and `plan.interaction`. Corrected per C17:
- `camera`, `lighting` and `effects` are ignored, yet echoed into `report.visualSystems` as
  `"<preset> camera"`, `"<preset> lighting"` and `"<effect> effect"`
  (`visualSystemsForPromptPlan`, `index.ts:10279-10289`).
- `style` and `environment` are ignored silently, appearing only as "missing" warnings.

The skill tells agents to trust the report: "`visualSystems` names what the compiler added"
(`aura3d-scene-authoring/SKILL.md:76-80`). `repairHints` are static per scene type. Scope: this
affects the `cinematic-scene` template and skill followers. None of the 18 games calls it (C17). The
recipes themselves encode the primitive aesthetic: the `mini-game` recipe builds its HUD from
emissive 3D spheres and boxes on `#030711` with `ambient(0.16)` (`index.ts:10189-10229`, 12 §4.1).

### 4. The engine's own lint advice turns IBL off

When a scene has no lights, the engine warns:

> "Scene has no lights. Suggested fix: add lights.studio() or lights.ambient()." (`index.ts:18256`)

Following the second suggestion triggers the `authored-ambient` branch, which zeroes the environment
map (`index.ts:12693-12707`). `llms.txt:21` maps "Directional/Ambient/Point → `lights.*`" with no
caveat. All 4 prompt recipes (`index.ts:10152, 10182, 10227, 10243`) and the racing, falling-blocks
and controller templates (`racing-starter/src/main.ts:215`, `falling-blocks-starter/src/main.ts:249`,
`character-controller/src/main.ts:60`) add ambient (06 §2). No skill, doc or diagnostic says that
ambient disables reflections. three.js has no such coupling: `scene.environment` and
`AmbientLight` are additive.

### 5. Instructions reward the minimal answer

Quoted verbatim from the current checkout:

- `llms.txt:167`: "For benchmark runs, run finite commands such as `npm install` and `npm run
  build`, then stop. Do not run `npm run dev`, `npm run preview`, Playwright, browser screenshot
  capture, or manual visual verification inside the agent process." The same rule appears in
  `docs/agents/build-playbook.md:148-151` and `aura3d-scene-authoring/SKILL.md:22-24` ("No dev
  server, preview, Playwright, or screenshots from the agent").
- `docs/agents/benchmark-recipes.md:4`: "copy the smallest matching scene-kit recipe, make only
  prompt-required edits".
- `aura3d-scene-authoring/SKILL.md:81`: "Add only prompt-required customization." No prompt asks for
  an environment, shadows, fog or a grade, so none get added.
- `aura3d-evidence-review/SKILL.md:53-56`: "Critique loop, at most 3 rounds. For each `fail`, apply
  the cheapest targeted fix (a repair hint, the matching scene kit, a better typed asset)".
- `docs/agents/no-hackjob-rules.md:45-46`: "Do not swap GLBs or repaint primitives to make a route
  look different while the root cause remains unproven." This forbids iterative art direction.
- `llms.txt:36`: "Do not claim … HDR/IBL, postprocess … unless a browser test … verifies pixels".
  `llms.txt:211`: "Treat glass, clearcoat, transmission, normal maps, reflections, and contact
  shadows as partial or unsupported unless retained root pixels prove those exact features." Agents
  read "don't claim" as "don't use". Meanwhile the engine's capability catalog marks normal maps
  supported (`index.ts:2752`).
- `Aura3D-Skills-PRD.md:315` defines success as: "completes the template's golden path (`build`,
  `test`, `assets validate`, `check-deploy`) with correct claim labels and no forbidden patterns."
  It contains no visual criterion. The PRD's decision rule builds a skill only where "the evidence is
  an existing rule doc, gate, or anti-pattern list" (`:120-125`). That rule structurally excludes an
  art-direction skill, because no gate for beauty exists.

Each rule is defensible anti-hallucination hygiene on its own. Together they cap ambition at the
template, forbid trial-and-error on looks, and offer an honourable exit (label it `prototype`) that
never requires seeing a pixel.

### 6. No quality bar exists

12 §6 searched skills, `llms.txt`, docs and the PRD for "reference image", "art bible", "mood board",
"visual target", "quality bar" and "look dev". The search found only disclaimers. Correctness, gameplay
and readability bars exist and are gated. A **modern-look bar** (IBL on, shadows at full strength, DPR,
non-void background, fog for depth, grade, subject coverage, reference frames per genre) does not exist
anywhere. Beauty is delegated to "a named human reviewer" (`docs/project/showcase/visual-quality-standard.md:17-18`),
and that reviewer is recorded as `pending-user-review` with every route `needs-work`
(`docs/project/showcase-visual-review.json`). The game-upgrade audit records "visual state" as grep
counts such as `shadows(8) postfx(6)` (12 §6).

The gates that do exist pass Atari frames. The `mini-game` screenshot gate passes with
`brightPixels > 900`, `cyanPixels > 20`, `warmPixels > 10` and `redPixels > 5`
(`templates/mini-game/tests/screenshot.spec.ts:24-66`). That is the primitive palette, so a textured
natural-colour replacement risks failing it. `material.visualQA` decides that "chrome reflects
environment" by substring-matching node names such as "environment reflection" and "glow halo"
(`index.ts:2959-3010`). The cheapest pass is to add emissive cards with the right names.

### 7. No look-at-the-output loop

- Benchmark mode forbids screenshots, and the normal-mode rubric grades presence ("studio lighting
  visible"), capped at 3 cheap rounds (§5).
- When agents did capture, they captured a different game. 16 of 18 routes branch on
  `?capture=review` **395 times**, changing light intensities, emissive, materials, scale and pose
  (16 §3; for example rooftop ambient 0.72 vs 1.32, `main.ts:322-382`). Review-mode evidence is
  systematically optimistic.
- Before this audit no screenshot of the 18 shipped games existed in the tree. The 3.0.1 "Visual QA
  17/17" captures were left in `/tmp` (18 §3). The first production captures (run 37289688772) show
  Courier Rush black in 2 of 3 desktop frames, and every game scoring 1.5–4/10 (21).

### Net

The agent path converges on `lights.studio()` or ambient+directional, a `#0x0x1x` clear colour,
primitive boxes and `safe-basic` at 1× DPR. On this engine that recipe is worse than on three.js,
because ambient kills IBL and shadows are at 0.32. Fixes, in order:
1. A `looks.*` baseline (env + hemisphere fill + sun with `shadow: true` + horizon fog + AA + grade +
   env background) in `llms.txt:62-67`, `aura3d-core/SKILL.md:44-51`,
   `aura3d-browser-game/SKILL.md:35-41` and every template.
2. Change `index.ts:18256` to suggest that baseline, and add an engine "look lint"
   (ambient-without-env, DPR < device, solid background with no fog, primitive-only scene) to
   `diagnostics().warnings`.
3. Make lean throw on `lights.*`/`environments.*`, or move `mini-game`/`product-viewer` to the engine.
4. Implement or delete the prompt-plan fields.
5. Add an `aura3d-art-direction` skill installed for every game template, with genre reference frames
   and numeric targets.
6. Give the agent a remote screenshot loop by default outside benchmark mode, raise the visual
   critique cap, and amend `no-hackjob-rules.md:45-46` so it forbids hiding capability gaps, not art
   direction.
7. Rewrite `llms.txt:36, 211` so they separate "don't claim" from "don't use".

---

## Asset findings

The asset pipeline is a provenance ledger: 3.86 MB of manifest JSON, about 9.5 KB per entry. It is not
a content pipeline. Every CLI verb either moves a file and records metadata or validates and
certifies. None changes geometry or pixels (`packages/aura3d-cli/src/cli.ts:54-228`; 11 §4.1). No
technical-art stage sits between "file admitted" and "file rendered".

### 1. What the games actually ship (120 game-referenced models, 11 §2.2)

| Family | Count | What it is |
|---|---:|---|
| `aura3d-original` script-generated | 50 | Per-app `scripts/build-models.mjs` (346–796 lines each) emitting `addBox`/`addCylinderY` geometry with **no TEXCOORD**, flat `baseColorFactor` only. Typical 12–608 tris (`rooftopBackboard` 12, `galleryShiftDisplayCase` 24, `patrolWingDroneA` 108, `mechArmsA` 608). Example: `apps/showcase-vault-breakers/scripts/build-models.mjs:105-224` |
| CC0 "review-art" / Blender scripts | 19 | **14 are 4-triangle quads** carrying an AI-generated PNG, of which 13 are `release`. Six `build-review-*.mjs` scripts write them (C19). The rest are Blender kits with 32²–128² palette textures |
| Objaverse (Sketchfab mirror) | 32 | Uncurated: a 76,800-tri untextured golf ball, a 272k-tri street lamp, a 705k-tri CAD workcell, a 12-tri plank set |
| Meshy | 8 | 48k–237k tris after a one-off Blender collapse decimate (1.93M→80k). 2×4096² + 2048² JPEG, single material, no tangents, 10–28 MB each |
| NASA / Sketchfab direct / Kenney / OpenGameArt | 11 | Planets, two (byte-identical) skinned athletes, 3 Kenney kits, 1 formula car |

**54 of 120 have zero images.** Release labels: 97 `release`, 20 `candidate`. **Every primitive-built
and 4-tri card asset is `release`. Every Meshy asset is `candidate`** (11 §2.2).

### 2. Zero optimization, 463 MB raw

Across all 226 model assets: **0** Draco, 0 Meshopt, 0 `KHR_mesh_quantization`, 0 basisu, 0 KTX2 and
0 WebP textures (11 §2.1). The 120 game-referenced GLBs total **463 MB**, and the full set is 1,232 MB.
Each app's `dist` copies all 1.7 GB of `public/aura-assets`, including 529 orphaned files (490 MB).
- Texture budget: each Meshy hero costs about 200 MB of VRAM. Gravity Post exceeds 500 MB. A 216-tri
  courier parcel carries 3×1024² maps (11 §3.5).
- The distribution is bimodal. Five games ship under 1–3 MB of untextured boxes, others ship 40–126 MB
  of raw 4K dumps, and nothing sits in the 2–10 MB well-compressed band a three.js game targets.
- The typed-GLB path cannot load optimized assets anyway. `createTypedGLBActor` passes no
  Draco/Meshopt decoder (`TypedGLBActor.ts:184-191`), and `GLTFLoader.ts:1312` throws on Draco.
- `AssetImportPreflight.ts:109-131` (maxSize 2048, basis, 60k tris), `MeshOptimization.ts:23-50` and
  `KTX2LoaderThreeCompat` are descriptive. Nothing executes them.

### 3. Tint stripping neuters the real PBR assets

`model(asset, { material })` sets `replaceSurfaceTextures: true`, hard-coded at `index.ts:13570`.
`applyMaterialTint` then sets `u_baseColorTextureEnabled=0` and `u_metallicRoughnessTextureEnabled=0`
on **every** material in the GLB (`TypedGLBActor.ts:484-514`). `material.pbr()` always injects
`color: "#d7dee8"` (`index.ts:2415-2417`), so any override triggers it.

Corrected per C3:
- The 0.38/0.16 roughness and metallic fallbacks rarely apply, because `material.pbr` fills
  0.55/0 and games pass explicit values.
- Specs without an explicit emissive (courier cars, siege crate) get **emissive = base colour at
  0.28**.
- Normal, occlusion and emissive maps survive.
- The tint never sets alpha. That is why the Patrol Wing 0.32 and Skyline 0.62 "ghost" shells render
  opaque (18 C8).

Confirmed call sites include the 14-texture courier sedan and hatch, the gravity-post 14-texture dock
gate (flat `#b7f4ff`), the turbo formula car (`#8fd8ff`), the skyline pine trees, siege-golf crates,
the product-configurator headphones and six deep-recovery sites (11 §3.1). Aura Clash uses its own
multiply-tint plus flat emissive (`AuraClashArenaApp.ts:3371-3425`). 21 still calls it "the single
biggest programmer-art signal … clay mannequins".

### 4. The texture waiver regex

```ts
// packages/aura3d-cli/src/index.ts:3376-3380
function requiresTextureEvidence(role, suitabilityReason) {
  if (role === "debug" || role === "abstract") return false;
  if (/\b(stylized|stylised|flat[-\s]?color|flat[-\s]?colour|untextured|procedural material|clay render|solid material)\b/i.test(suitabilityReason)) {
    return false;
```

Writing "stylized flat-color" in free text waives texture evidence for character, vehicle, track,
world, product, environment and weapon roles. **24 of 131 root `release` assets** are in those roles
and match the regex (C19, skeptic 2). Examples include `mechChassisA-D`, `deepRecoverySub`,
`neonCourierAvatar`, `turboFormulaCircuit` and `rooftopCourt`.
`apps/showcase-mech-hangar/scripts/register-models.mjs:19-31` writes the waiver phrase straight into
suitability text.

Correction (C19): the 4-tri cards embed a PNG, so they pass texture checks honestly. They are not
waived; they are simply allowed. Four of them hold texture-required roles: `skylineArcticRunnerHero`,
`neonRainCourierHero`, `neonCrownMothElite` and `auroraExtractionLanderHero`. No gate asks for normal
or ORM maps, texel density, a triangle band for screen coverage, style coherence, or an IBL-lit probe.
The probe checks `nonBlankPixels`/`colorBuckets`, and the code admits "A 792-triangle body shell with
no wheels modelled passes all of them" (`index.ts:742-748`).

### 5. The best assets are hidden

Policy runs exactly against quality. `meshy/import.ts:42` throws on `--quality release` ("Meshy
imports cannot certify release quality … independent human review"), while a 4-tri card certifies in
minutes. Shipped consequences:

| Route | Best asset | What players see instead | Evidence |
|---|---|---|---|
| Skyline Runner | `skylineHeroRunner` Meshy 3D runner, 48k tris | 4-tri `skylineArcticRunnerHero` card as the live player; Meshy model used only as a 0.62-opacity cyan "ghost echo" | `main.ts:905-913, 1553-1575, 3254` |
| Pulse Tunnel | `pulseArena` Meshy, 237k tris | Mounted only with `?arena=candidate`; players get Blender boxes with 128² textures | `main.ts:63-64, 369-372, 1395` |
| Rooftop Buckets | Skinned Sketchfab athletes (4 clips, 47×512² maps) | Wrapped in `animationDebugCapture ? [...] : []`, `visible: false` even then. Still listed in `route-health` `primaryAssets` | `main.ts:502-536, 1603`; 18 C10 |
| Neon Swarm | Painted hero card | Review mode only. Play renders `neonCourierAvatar`, untextured, unlit, flat `#214f68` override | `main.ts:176-188, 688` |
| Aura Clash | Arena props `Prop_ACUnit_*`, `Prop_Bollard_*`, signs | Filtered out at consolidation, so the set loses its foreground | `AuraClashArenaApp.ts:872-877` (17-g1 §1.5) |
| Mech Hangar | `mechHeroDecimated` Meshy, 100k tris, `candidate` | Wrapped by 96–608-tri untextured box parts; static and unrigged | `main.ts:209-225, 1281` |

### 6. Renderer and pipeline mask the asset quality that does exist

With IBL zeroed in 15/18 games, all 8 Meshy assets and most Objaverse PBR assets render with no
environment reflection. Their normal and MR maps modulate only the direct lights (11 §3.2). The
benchmark shows what the same engine does with a good asset when shadows and background are not
tested: DamagedHelmet scores 6.5 vs three's 7 (23). Asset quality is the multiplier, but the renderer
defaults cut it before it reaches the frame.

### 7. Per-game asset responsibility

The "Weak assets %" column is the vision judge's share of the gap (21 §4), assigned from stills alone.
The judge could not see that IBL, shadows and particles are engine-broken, so it under-weights engine
defaults. Read the column as an upper bound on asset blame for frames where the engine bug is
invisible, and a lower bound where tint stripping makes a good asset look bad. Composition data is
from 11 §2.3 and 17-g1. Model and texture scores are from 21.

| Game | What the frame is made of | Render-time neutering | Model / texture (21) | Weak assets % (21) | Asset responsibility | fps |
|---|---|---|---|---|---|---:|
| Aura Clash | 2 Quaternius skinned rigs (27–35k, textured) + 98.6k-tri textured city block. Crowd is a 4-tri card borrowed from Blockfall. 6 roster GLBs are unskinned, untextured and unreferenced | Multiply-tint + flat emissive on fighters, props filtered, rgba8+Reinhard | 4 / 4 | 12 | **Secondary.** The only game whose authored assets own the frame. The problem is treatment, scale (arena at 0.5876 vs fighters 1.08) and missing props | 11.1 |
| Aurora Lander | 4 models / 534 tris. 2 are 4-tri cards (lander hero, bay backdrop), 2 untextured script meshes, hand-rolled terrain | Tint `main.ts:763`, no IBL | 4 / 1.5 | 20 | **Co-primary.** No world asset exists | 52.2 |
| Bank Shot | 3 untextured script meshes (table 10k tris, 14 factor materials). No felt, grain or ball numbers. Cue not visible | No IBL | 3 / 2 | 25 | **Co-primary.** The whole art set is about 1 MB of boxes | 14.9 |
| Blockfall Reactor | 3 4-tri cards (backdrop, mechanic, rival) + 1 Objaverse cabinet. Line-clear FX are 48 box shards | No IBL | 3 / 5 | 25 | **Co-primary.** The frame is image plates, not 3D | 9.8 |
| Courier Rush | 7 Objaverse PBR assets (42 images) + Meshy van. Buildings and road are primitives (45 call sites) | Tint strips sedan/hatch/parcel maps (`main.ts:363, 386`; `city.ts:700`), no IBL | 4 / 3 | 8 | **Secondary.** Good assets, too few, and stripped. Black frames dominate (engine/route) | 7.1 |
| Deep Recovery | 5 untextured script meshes, 0.4 MB total, 71 primitive call sites | 6 tint sites, no IBL, CPU volumetric chain | 2.5 / 1 | 25 | **Co-primary** for looks. fps is engine (CPU readback) | 0.5 |
| Gallery Shift | 7 untextured script meshes (24-tri cases), 72-tri unskinned Kenney thief, 100k-tri robot, Meshy thief (50k, 4K) | No IBL, controller freeze | 3 / 2 | 25 | **Co-primary.** Two orders of magnitude of fidelity in one room | 10.1 |
| Gravity Post | 14 models / 126 MB: 43.8 MB station ring (2,150 primitives), NASA planets at 4096, 32² skiff textures, Meshy freight | Dock gate tint `#b7f4ff` (`main.ts:484-495`), no IBL | 3 / 2.5 | 30 | **Primary**: mismatched sources and no optimization. Heaviest load, 6.4 fps | 6.4 |
| Mech Hangar | 16 of 17 are 96–608-tri untextured script parts + 1 raw 27 MB Meshy hero (candidate, unrigged). About 190 primitive nodes of set dressing | No IBL (`ambient 0.72`) | 3.5 / 2.5 | 30 | **Primary.** The modular system is programmer art | 9.3 |
| Neon Swarm | 3 4-tri cards (2 in review only), untextured unlit Objaverse avatar, 272k-tri lamp, off-theme barricade | Avatar tint `#214f68`, no IBL | 3 / 3 | 30 | **Primary.** Placeholder enemies and an incoherent kit | 25.8 |
| Orbital Defense | 0 assets: 33 primitive nodes, 12×16 spheres | No IBL, DPR 1 | 1 / 0.5 | 35 | **Primary.** Nothing to render. Delete or rebuild | 59.6 |
| Patrol Wing | Meshy aircraft (60k, 4K) + 108-tri untextured drones + hand-rolled terrain + PBR-plane ocean | Ghost tint `#9fd8ff` at 0.32, renders opaque (`main.ts:264-270`). No IBL | 4 / 3 | 12 | **Secondary.** "A good plane in an empty scene". The world is authoring | 15.8 |
| Pulse Tunnel | Blender procedural world (72k tris, 128² textures), procedural craft, 105 primitive call sites. Meshy arena behind a flag | No IBL | 3 / 1 | 20 | **Co-primary.** The best asset is hidden. 11 generator script versions are churn | 23.5 |
| Rooftop Buckets | Objaverse athletes (base map only), 12-tri backboard, 504-tri seamless ball, untextured court and venue, box sky bands. Skinned athletes hidden | No IBL | 3 / 2 | 30 | **Primary.** Hidden best assets, untextured court | 7.6 |
| Siege Golf | 4,032-tri untextured procedural course, 76.8k-tri untextured ball, 12-tri plank set, Objaverse crates | Crate tint (`main.ts:291-298`). Gets procedural env (one of 3) | 3 / 2.5 | 35 | **Primary.** Judge's top cause | 7.1 |
| Skyline Runner | Live player and 3 platforms are 4-tri cards. Backdrop is a card (judged 8+ alone). Pine trees tinted. Meshy runner used as ghost only | Tree tint `main.ts:378`, ghost tint, `pixelRatio 0.7`, no IBL | 4 / 4 | 25 | **Co-primary.** A 2D sprite game drawn through a 3D renderer | 11.4 |
| Turbo Drift | 4,112-tri untextured JS track, untextured Blender venue, Objaverse circuit (14 maps at 256²), formula car tinted flat | Car tint `#8fd8ff` (`main.ts:3217-3226`). Gets procedural studio env | 3.5 / 1.5 | 30 | **Primary.** A racing game with no asphalt texture | 19.7 |
| Vault Breakers | 5 untextured script meshes, 0.8 MB of `addBox` output, no playfield art | No IBL | 2 / 1 | 30 | **Primary.** Pinball's most important surface has no art | 57.4 |

Tally:
- **Primary (8):** Gravity Post, Mech Hangar, Neon Swarm, Orbital Defense, Rooftop, Siege Golf,
  Turbo, Vault.
- **Co-primary (7):** Aurora, Bank Shot, Blockfall, Deep Recovery, Gallery Shift, Pulse Tunnel,
  Skyline.
- **Secondary (3):** Aura Clash, Courier Rush, Patrol Wing. All three have credible hero assets that
  are mistreated, sparse or set in an empty world.

The fps column does not track asset weight: Vault (0.8 MB) runs at 57 fps, Bank Shot (1 MB) at 15
fps and Gravity Post (126 MB) at 6 fps. Frame cost is dominated by engine CPU paths (05 #7; 07 §3.3),
not by geometry.

### 8. What must change on the asset side

1. **Render path first.** Tint multiplies and preserves maps per material, with
   `replaceTextures: true` opt-in and no implicit 0.28 emissive. Ambient becomes additive to a default
   env. These are cheap and raise every PBR asset already shipped.
2. **`aura3d assets optimize`.** Pinned gltf-transform/gltfpack running on a remote worker, with
   per-role profiles:
   - weld/prune, quantize + Meshopt;
   - resize (hero 2048 / prop 1024 / bg 512), KTX2 (UASTC for normal/ORM, ETC1S for base);
   - MikkTSpace tangents, LOD 50/20%, colliders, AO bake;
   - outputs recorded as derived artifacts.

   Then wire the Meshopt/Draco decoders and a bundled (non-unpkg) basis transcoder into
   `createTypedGLBActor`.
3. **Replace the waiver with a look gate.** Release for character, vehicle, world, track and product
   requires UVs + base/normal/ORM (or a route-wide art-direction doc), a texel-density and triangle
   band for screen coverage, and an IBL-lit probe judged against a reference. Ban 4-tri cards and
   UV-less script meshes from `character`/`world`/`vehicle` release. Restrict script geometry to
   `debug`/proxy roles.
4. **Promotion path for Meshy.** Remesh to 15–30k, bake normal/AO from the high-poly, downsize, then
   apply the same gate. Replace the hard ban at `meshy/import.ts:42`.
5. **Curate instead of keyword-ranking.** `pull-bridge/scoring.ts` gives "has ≥1 texture" +4 and a
   missing licence URL the same weight as no textures (11 §4.3). Build one style-coherent kit per
   genre (Poly Haven, Quaternius, Kenney, commissioned). Keep licence as a filter, not as score.
6. **One rendering of the game.** Delete the `visualReviewCapture` asset and lighting forks so that
   evidence shows what players get.
