# GameUpgrades47-PRD: make the 25 live games look better and distinct (Aura3D 4.7.0)

Status: ready for execution. Release: Aura3D 4.7.0. Checkout researched: `audit-fix/integration` (origin/main plus the 4.6.0 audit fixes E1-E5 and the merged game lanes; lanes G10, G11, G13, G14, G18-G25 read from their `audit-fix/gNN` branches). All file:line references below are to that checkout unless a branch is named. Anything that does not exist yet is marked **NEW** with the place it will live.

Every number in this document was measured on software WebGL2 (SwiftShader) on the remote runner unless it says otherwise. No real-GPU number exists for any game today.

Aura3D is a standalone engine. Nothing in this PRD, its commits, release notes or site copy may describe it as built on three.js.

---

## 1. Executive summary and autonomous decisions

### 1.1 Problem

The 25 live games (`docs/workflows/game-inventory.json`, `liveGameCount: 25`) read as one game with different props. They are built from the same small set of looks, HDRIs and post settings, most of them switch off the atmosphere the looks provide, and almost none use the parts of the engine that make a frame distinctive (sky, height fog, god rays, depth of field, LUTs, lens flare, weather, reflections, camera sequences, per-game VFX). Section 2 gives the evidence.

### 1.2 Goal

For 4.7.0, every live game must:

1. Score 7 or higher in every one of the 12 rubric categories (`AGENT_LOOK_CATEGORIES`, `packages/aura3d-cli/src/look/rubric.ts:15-19`) in a panel judging round, not a self-judgement.
2. Have its own written identity (palette, time of day, sky, signature effect) and pass a blind pairwise distinctness judgement against its genre neighbours: `aura3d evidence judge` returns `same_game: false` with `same_game_confidence >= 0.8` (`packages/aura3d-cli/src/commands/evidence/judge.ts:37-38`).
3. Stay inside a written per-game frame budget (draw calls, triangles, texture memory, page weight, route JS gzip delta), recorded before and after in `evidence/<game>/.../budget.json`.
4. Keep gameplay and determinism unchanged. Every sim, replay and parity test that passes on 4.6.0 still passes.

### 1.3 Scope

- 10 engine work packages (lanes E-A to E-J) that add the missing visual controls and fix stages that are declared but do not draw.
- 25 game work packages (lanes G01-G25), one per live game, with 18-36 upgrades each (about 570 upgrade items in total).
- One Meshy and asset batch WP, one site/posters WP and one proof WP.

### 1.4 Autonomous decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Each game owns its look.** Every game gets an art-direction file (`defineArtDirection`, `packages/game/src/art/define.ts:146`) and a per-variant look table in its own source folder. Engine looks (`looks.preset`) are an input, not the identity. A game drops `looks.preset` wherever the 5 override keys cannot express its look, and moves back once the E-A override keys land. | Today 0 of the 25 live games declare an art direction; only 4 non-live apps do (`apps/showcase-{blockfall-reactor,bank-shot,aurora-lander,vault-breakers}/art/direction.ts`). |
| D2 | **No two live games share an environment HDRI, a signature effect, or a non-generic asset key.** Enforced by a NEW `look-identity` and `prop-exclusivity` check (E-I). Each game picks HDRIs from the 25 files already in `fixtures/environment-corpus/hdri/` and `assets/library/hdri/`; the per-game plans below are already de-duplicated. | Every look today resolves to 3 HDRIs (`packages/engine/src/agent-api/looks/lookPresets.ts:110-370`). |
| D3 | **Meshy spend is uncapped** (owner rule) and tracked in `aura3d meshy ledger`. Prompts are text only, generic, unbranded, never derived from another game's frames (`packages/aura3d-cli/skills/meshy-cli/SKILL.md`, Safety). Every result goes through `aura3d assets import-meshy`, `assets optimize --meshopt` and `assets validate --release`. Retextures prove unchanged geometry with the position-accessor hash (`packages/aura3d-cli/skills/aura3d-retexture/references/geometry-hash.mjs`). | Most look gaps are asset gaps: primitives, borrowed props, untextured surfaces. |
| D4 | **Proof standard** is the 5-part bundle in section 7: steady-state luma capture at 25 s and 60 s per variant, rubric panel round, pairwise distinctness, budget row, retaken final screens and posters. Mean luma alone never proves a look; crops and grid cells are used where the plan says so. | Lessons R20 and the mean-luma trap (`/tmp` cap-proof section 9). |
| D5 | **Real-GPU evidence is owner-run only.** Agents add the scenarios (`tools/real-gpu/scenarios.json`, 18 games have none) and never run `tools/real-gpu/run.sh` on the Mac. Every public number in 4.7.0 notes, README or site copy is labelled "software WebGL2" until the owner run exists. | Machine policy and `tools/real-gpu/README.md:13`. |
| D6 | **Engine and game lanes run in parallel.** Every game upgrade that depends on a NEW engine API names that dependency and ships an interim path that works on 4.6.0 APIs. When the engine WP lands, the game lane swaps to the real API in the same release. Items with no interim path are marked "blocked on E-x" and may slip to 4.7.1 without blocking the release. | No sequential waiting (owner preference for parallel lanes). |
| D7 | **Budget overruns block the look change**, not the budget. A game over its written budget fixes draws (instancing, `mergeStatic`, LOD, impostors) before merging. Bundle budgets are never raised to manufacture a pass (`BUNDLE_SIZES.md:38-39`). | |
| D8 | **Presentation only.** No sim, physics, collision, scoring or input change except where a visual needs a read-only value (for example exposing a brake flag). Ports keep their reference replays byte-identical. | |
| D9 | **Licensed fonts only**, from `/Users/gurbakshchahal/fonts`. No Inter, Roboto, Google Fonts (including Barlow, which HUD_THEMES `sports-broadcast` and `motorsport` use, `packages/game/src/hud/themes.ts:19,40`), Geist or system stacks. | Machine policy. |
| D10 | **Order of work** follows the code-complete rule: implement product code, then source tests and contracts, then commit and freeze `CODE_COMPLETE_GO`, then remote captures, judging, posters and deploy. Progress is reported as code-completion %, not acceptance %. | Machine policy. |
| D11 | **Frozen launch blockers** are only real product defects or the 7 policy blockers (availability, authentication, isolation, custody, migration integrity, signed-source identity, rollback). A game whose look items are not all done ships with the items it has, as long as it has no regression and stays in budget. | Machine policy. |

### 1.5 Success measures

| Measure | Today | 4.7.0 target |
|---|---|---|
| Games with a declared art direction | 0 of 25 | 25 of 25, `auditArtDirection` passing |
| Distinct environment HDRIs across live games | 3 behind the looks, plus 3 game-loaded files, two of them shared | at least one game-owned HDRI or authored sky per game, no file shared |
| Games using DOF / god rays / lens flare / weather / LUT / camera sequences | 0 / 0 / 0 / 0 / 0 / 0 | used where the game's plan calls for it (about 15 / 14 / 12 / 9 / 12 / 22) |
| Games with a per-game VFX preset pack | 0 | 25 |
| Rubric panel score | not judged | every category >= 7 |
| Pairwise distinctness vs genre neighbours | not judged | `same_game: false`, confidence >= 0.8 |
| Games with a written budget row | 1 (Aura Slam 150 draws, `docs/agents/build-a-game.md:247`) | 25 |
| Steady-state luma outliers | 2.26 (Links neonBay) to 231.74 (FC Uyuni); splat-rush 25.83% clipped (`evidence/audit-fix/e5/wave2/sweep/table.md`) | every variant inside the per-game band in section 5; darkFrac <= 0.6 and clipFrac <= 0.05 unless a declared exception |

---

## 2. Current state

### 2.1 How games get their look today

There are two families.

**Look-preset games (14 of 25).** `looks.preset(id, overrides)` (`packages/engine/src/agent-api/looks/looks.ts:399-457`) emits one HDRI or procedural fill, one shadowed key, an optional rim, exp2 fog, a colour grade with contrast/saturation/exposure only, default AO and default bloom (`looks.ts:278-360`). Users: top-tennis is the exception (it hand-builds); the preset users are roadster-rush, heatsink, teleoperator, iron-crown, pips-big-leap, aura-hoops-3d, aura-diamond-3d, aura-fc-3d, aura-links-3d, bunker-zero, slingshot-siege, dot-dash-3d, cross-hop and cloud-runner-port (tally `/tmp/gu47/tally.txt`).

**Hand-built games (11 of 25).** Top-tennis and the ports (strange-orbit, splat-rush, serpentine, drift-and-deliver, heatsink-port, ninja-runner, last-train, roadster-hours, where-the-wind, silt-and-signal) build bloom, vignette and grade by hand, and most draw the world with `material.custom` GLSL that hard-codes its own sun and fog (12 games use `material.custom`).

### 2.2 Why they read alike (evidence)

1. **Three HDRIs.** The v0 look table uses `autumn_field_puresky_1k` for outdoor-day, overcast and alpine-snow, all with the sun at elevation 48, azimuth 35; `kloppenheim_06_puresky_1k` for golden-hour; `studio_small_08_1k` for every interior and studio look; and no HDRI for night-city, polar-night, space, underwater and neon-arcade (`lookPresets.ts:110-370`). Venues that differ only by look id differ mainly in key and fog colour. The hand-built games add only three files: `kloppenheim_06_puresky_1k` again (drift-and-deliver-port `examples/drift-and-deliver-port/look.ts:23` and last-train-port), and a 1k sky in ninja-runner that never loads (plain-object texture, `examples/ninja-runner-port/world.ts:229`).
2. **Looks drop half of what they declare.** Grade temperature is never emitted (`looks.ts:334-343`) and the declared post preset is never applied (no `output.preset` child in `looks.ts:278-360`). Bloom is a bare default for every look.
3. **Atmosphere switched off.** Nine look-using games pass `fogDensityScale: 0` (for example `apps/showcase-roadster-rush/src/main.ts:200`, `examples/kid-goku-beyond-the-clouds-port/world.ts:59`, all six Diamond parks `apps/showcase-aura-diamond-3d/src/main.ts:801-808`, every Cross Hop theme).
4. **Unused stack.** Across the 25 live games: 0 use `sky.dayNight`, `weather.*`, depth of field, SSR, volumetric fog / god rays, TAA, LUT, auto-exposure, outline, chromatic aberration, `output.preset`, lens flare, area lights or transmission. One each uses motion blur (aura-fc-3d), toon post (silt-and-signal) and film grain (bunker-zero). 20 use vignette, 18 bloom, 17 fog (tally).
5. **Same VFX everywhere.** Every game that fires runtime effects uses the same 14 presets with the same colours (`packages/engine/src/agent-api/vfx/effects-api.ts:38-53`). `registerPreset`, `spawn` and `decal` have 0 game call sites. Iron Crown and FC force runtime VFX off (`apps/showcase-iron-crown/src/main.ts:399`, `apps/showcase-aura-fc-3d/src/main.ts:97`), Links too (`apps/showcase-aura-links-3d/src/main.ts:2816`).
6. **Same camera language.** No game uses `app.camera.play` sequences, `fovKick`, rail shots or letterbox bars. Every game has one fixed chase or broadcast angle.
7. **Shared and borrowed assets.** Iron Crown dresses its stages with about 21 keys from other games (`auraClashCornerBrazierPylonMeshy`, `billiardsClubChairMeshy` as a throne, `gullsiege*`, `heatsinkArch*`, `showcaseTeaHouse` used twice). Pip's Big Leap uses a heatsink drone as a hawk and a reactor turbine as a fan (`apps/showcase-pips-big-leap/src/aura-assets.ts:19-48`). Top Tennis, Diamond and Hoops share `rooftopScoreboardRigMeshy` and `rooftopFloodlightTowerMeshy`. FC uses `diamondStadium` and `hoopsBallCart` (`apps/showcase-aura-fc-3d/src/aura-assets-v2.ts:97-114`). Diamond copies three Hoops background hexes (`#c98a5a`, `#070a12`, `#9db8cf`; Diamond `main.ts:811-818`, Hoops `main.ts:229,235,241,253`).
8. **Same palette range.** Most games sit between 50 and 150 mean luma with no clipped highlights (`table.md`); p95 stays under 190 in most sports venues, so there are no specular highlights or hot lamps.
9. **Primitive soup.** Sports and arcade games build crowds, furniture and set pieces from boxes and capsules (Links 38 `primitives.` calls, FC 34, Slingshot 30, Diamond 29, Hoops 20, Teleoperator 19, Iron Crown 19).

### 2.3 Capability map summary

Detail is in the three capability maps (`/tmp/gu47/cap-render.md`, `cap-content.md`, `cap-proof.md`). The facts that shape this PRD:

| Area | Status in 4.6.0 | Consequence |
|---|---|---|
| Flags | Default-on: CORE, LIGHTING, POST, MATERIALS, ASSETS, ANIMATION, VFX, CAMERA, COMPILER. Off: VFX_SKY, VFX_FOG, VFX_VOLUMETRIC, VFX_DECALS, MATERIALS_TRANSMISSION, MATERIALS_KTX2, POST_VELOCITY_MRT, ANIMATION_SKINNED_SHADOWS, TIERS, WORLD* (`packages/rendering/src/contracts/flags.state.ts:18-46`) | Real sky, height fog, Gerstner water, per-object motion blur and deformed skinned shadows are invisible to players |
| Look overrides | 5 keys: `sun`, `exposureEv`, `fogDensityScale`, `accent`, `background` (`packages/engine/src/contracts/looks.ts:12`) | A game cannot pick its HDRI, key, rim, fog, grade or post through a look |
| HDR grade | `contrast`, `saturation` reach pixels; `temperature`, `tint`, `lift/gamma/gain`, `shadows/midtones/highlights` have no uniform writer (`packages/rendering/src/post/shaders/composite.glsl.ts:25-31`) | No white balance or split tone |
| LUT | Parsed (`packages/rendering/src/post/CubeLut.ts:25`), never bound: `u_hasLut = 0` (`packages/rendering/src/post/v2Stages.ts:1218-1221, 1250-1253`) | No per-game colour script |
| SSR | Declared and bridged, no S3 program (`v2Stages.ts:6-21`) | Wet floors need mirrors or probes |
| Tone mapping | `agx`/`neutral` exist in the output pass but presets degrade them to ACES (`packages/engine/src/agent-api/postPresets.ts:201-213`) | |
| Runtime control | No light setter on node handles (`packages/engine/src/agent-api/nodes/types/runtime.ts:148-160`), no environment swap, environment rotation is bookkeeping only (`packages/engine/src/lanes/prd02.ts:233`), no runtime post parameters except custom-pass uniforms (`packages/engine/src/contracts/post.ts:38`) | Time of day, venue swaps and per-shot post need scene rebuilds today |
| Shadows | One production shadow caster (`packages/engine/src/agent-api/compiler/observations.ts:283-300`) even though High allows 2 local shadow lights | Floodlit stadiums cannot cast 2-4 radial shadows |
| VFX atlas | `packages/engine/assets/vfx/aura-vfx-2k.png` with 18 named sequences (`packages/engine/src/agent-api/vfx/atlas.ts:8-15`) is never sampled; particles draw soft dots or the built-in fireball sheet | Smoke, dust and splashes all look like dots |
| `app.effects.trail` | Stub returning `alive: false` with `VFX_TRAIL_PENDING` (`effects-api.ts:246-257`) | No runtime ribbons |
| Custom presets | `registerPreset` names are ignored by `burst`/`spawn` (`effects-api.ts:166, 290`) | Per-game packs need engine work |
| Materials | No PBR rim term (`rimColor` only feeds solar shaders, `packages/engine/src/agent-api/nodes/types.ts:177`), no toon material, no triplanar helper for PBR, no per-instance emissive colour (`packages/rendering/src/ShaderLibrary.ts:118-129`) | |
| Custom shaders | `material.custom` has author chunks `a3d_sky`, `a3d_noise`, `a3d_fog`, `a3d_shadow`, `a3d_triplanar` (`packages/rendering/src/shaders/chunks/author/index.ts:37-79`) but no access to IBL, clustered lights or the engine sun colour; no shadow casting with the author vertex shader | Ports duplicate the light rig in GLSL |
| Camera | `play(sequence)` with bars, `fovKick`, `setRoll`, shake, punch exist (`packages/engine/src/contracts/camera.ts:38-56`); the contract `rail` factory is a static stub (`camera.ts:100`), the controller rail is real (`packages/engine/src/agent-api/camera/rigs/rail.ts:30`) | Sequences work through the controller; the contract factory needs fixing |
| World | `world.*` (terrain, water, grass, wind, biome) is internal, not exported from `packages/engine/src/public/index.ts` | |
| Shipped but unused | Area lights, lens flare, DOF, auto-exposure, CA, grain, probes, irradiance volumes, planar mirror, decals, weather nodes, `environments.preset("sunset"\|"night"\|"indoor")`, `output.preset`, PCSS, 4 cascades | Many upgrades need no engine work |

### 2.4 Proof tooling today

| Tool | Where | Limits |
|---|---|---|
| Remote runner | `tools/remote-acr/run.sh` (serverless Azure ACR Tasks; `SPECS`, `RUN_ID`, `EXTRA_DIRS`, `CONTEXT_PROFILE`) | software WebGL2; one step stops at 3600 s; frames return as base64 in `acr-run.log` |
| Steady-state luma capture | `tests/browser/game-luma-capture.spec.ts`, targets `tests/browser/game-luma-targets.ts` (64 targets, groups `@g1`-`@g8`), decoders `evidence/audit-fix/e5/decode-luma.mjs`, `compare-luma.mjs` | logs only mean, p5/p50/p95, darkFrac, clipFrac, 3x3 grid means, renderPath, drawCalls (`:36-73`); no RGB, hue, per-cell stddev, crops or frame diffs |
| Static checks | `node tools/game-checks/run.mjs <slug>` (`tools/game-checks/lib/index.mjs:699-722`) | no check reads pixels or compares games |
| Rubric | `aura3d look judge --validate` (`packages/aura3d-cli/src/look/judge.ts:153`) | `--judge prism` exits `judge-unavailable` (`judge.ts:53-67`) |
| Distinctness | `aura3d evidence judge` (`packages/aura3d-cli/src/commands/evidence/judge.ts`) | prompt assumes reference vs reimplementation |
| Pixel metrics | `tools/quality-gate/metrics/metrics/metrics.py` (flip, ssim, lpips, delta_e2000), `tests/qr/prd01/metrics/regionSsim.ts`, `tools/crayon-capture/heatsink-judge-lib.ts` (imageStats, frameDistance) | |
| Final screens and posters | `tests/browser/audit-fix/<game>.spec.ts`, `tools/site/build-card-images.mjs` | `screens-fresh` compares commit time to the latest `vX.Y.0` tag (`index.mjs:624-650`) |
| Real GPU | `tools/real-gpu/run.sh`, `scenarios.json` (7 games) | owner only |

---

## 3. Interfaces and contracts

### 3.1 Engine additions (NEW in 4.7.0), consolidated from all 25 plans

Each item names its lane (section 4) and the games that need it. Signatures are the contract; implementers may add optional fields but must not rename these.

#### E-A Look overrides, HDRI catalogue and HDRI delivery

```ts
// packages/engine/src/contracts/looks.ts:12 (extend AuraLookOverrides)
export interface AuraLookOverrides {
  sun?: { azimuthDeg?: number; elevationDeg?: number };      // exists
  exposureEv?: number; fogDensityScale?: number; accent?: string; background?: string; // exist
  hdri?: AuraHdriId | AuraAssetRef<"texture">;                // NEW
  environmentIntensity?: number;                              // NEW, 0..4
  environmentRotationDeg?: number;                            // NEW
  key?: { color?: string; intensity?: number; shadow?: AuraDirectionalShadowOptions }; // NEW
  rim?: false | { color?: string; intensity?: number; azimuthDeg?: number };         // NEW
  fog?: { color?: string; near?: number; far?: number; height?: AuraHeightFogSpec }; // NEW
  grade?: { contrast?: number; saturation?: number; temperature?: number; tint?: number; lut?: AuraAssetRef<"lut"> }; // NEW
  post?: AuraPostPresetId | { bloom?: false | AuraBloomOptions };                    // NEW
}
// packages/engine/src/agent-api/looks/looks.ts:200-219 (extend HDRI_ASSET)
export type AuraHdriId = "autumn_field_puresky" | "kloppenheim_06_puresky" | "studio_small_08"
  | "belfast_sunset_puresky" | "industrial_sunset_puresky" | "spruit_sunrise" | "venice_sunset"
  | "rooftop_night" | "cobblestone_street_night" | "hangar_interior" | "warm_bar" | "museum_of_history"
  | "kloppenheim_02" | "deep_space_starfield" | "outdoor-midday" | "sunset-dramatic" | "indoor-workshop"; // NEW ids
```

Behaviour changes in `applyOverrides` (`looks.ts:252-275`) and `v0Children` (`looks.ts:278-360`): emit the preset's `grade.temperature`/`tint` (reaches pixels once E-C lands); attach the preset's declared post id as `output.preset`; when `background` is a colour, emit the look HDRI with `background: false` (fixes the FC studio-HDRI-as-sky defect, `looks.ts:271-273, 291-298`).

HDRI delivery (NEW in `packages/aura3d-cli/src/commands/assets/optimizeVerb.ts`): `aura3d assets optimize --hdri <1k|2k> [--rgb9e5-cube]` writes a downsized `.hdr` and, optionally, an RGB9E5 cube built with `packages/rendering/src/environment/Rgb9e5Cube.ts`. Target: 2k sources (4.3-6.5 MB) to <= 1.5 MB at 1k, about 2 MB as a 2k RGB9E5 cube.
Needed by: G01, G02, G03, G04, G05, G08, G09, G10, G11, G12, G14, G19, G20, G21, G22, G24, G25.

#### E-B Runtime lighting, environment and atmosphere control

```ts
// packages/engine/src/agent-api/nodes/types/runtime.ts (AuraRuntimeNodeHandle, beside setMaterial :155)
setLight?(patch: { color?: string; intensity?: number; power?: number; distance?: number;
  direction?: Vec3; position?: Vec3 }, opts?: { transitionSeconds?: number }): void;        // NEW
// packages/engine/src/contracts/lighting.ts:29-35 (AuraLightingRuntime)
setEnvironment(texture: AuraAssetRef<"texture">, opts?: { intensity?: number;
  background?: boolean; rotationDeg?: number; crossfadeSeconds?: number }): void;           // NEW
setEnvironmentRotation(radians: number): void;  // exists as bookkeeping (prd02.ts:233); NEW: applied to probe sampling
// AuraLightingDiagnostics (lighting.ts:16-24): add punctualLights: number; localShadowLights: number  // NEW
// packages/engine/src/contracts/atmosphere.ts:20 (AuraAppAtmosphere.setFog)
setFog(spec: Partial<AuraHeightFogSpec> & { near?: number; far?: number },
  opts?: { transitionSeconds?: number; overrideSceneFog?: boolean }): void;   // NEW option overrideSceneFog
```

- `setFog` today is ignored on scenes that declare a fog node (`packages/engine/src/production-runtime/effects/LiveAtmosphere.ts:174-184`); `overrideSceneFog: true` (default true when the scene's only fog is `effects.fog`) applies it to that node's handle (`LiveAtmosphere.ts:159`).
- Height-fog runtime binding moves out of the `A3D_QR_VFX_SKY` atmosphere extension (`packages/engine/src/agent-api/vfx/atmosphere-api.ts:26`, `packages/engine/src/lanes/prd07.ts:46-50`) so `A3D_QR_VFX_FOG` works alone.
- Multi-caster shadows: `resolveProductionShadowCasterIndex` (`packages/engine/src/agent-api/compiler/observations.ts:283-300`) returns up to `localShadowLights` (tier: 0/1/2/4) local casters plus the sun.
- Verify that light nodes follow per-frame `setPosition` (unproven; only `TransientLightPool.ts:65` moves lights today) and `setVisible(false)` removes the light and its shadow map. Add a receipt.
Needed by: G01, G02, G03, G04, G06, G09, G11, G14, G15, G17, G18, G20, G21, G23.

#### E-C Post: grade, LUT, tone mapping, runtime post control, SSR, bloom

```ts
// packages/engine/src/contracts/post.ts:36-40 (AuraPostSurface)
setEffect(name: string, patch: Record<string, number | string | boolean | number[]>): void;  // NEW
setEffectEnabled(name: string, enabled: boolean): void;                                      // NEW
// packages/engine/src/agent-api/nodes/effects.post.ts:99 colorGrade: lut becomes AuraAssetRef<"lut">
// packages/engine/src/agent-api/nodes/effects.ts:131 depthOfField options: add
tiltShift?: { bandCenter: number; bandWidth: number; angleDeg?: number };                    // NEW
// packages/engine/src/agent-api/nodes/effects.ts:82 volumetricFog options: add
godRayDensity?: number;  // NEW: decoupled from scene-fog density (postBridge.ts:884)
// AuraMaterialSpec (nodes/types.ts:172): add bloom?: number  (0..2, default 1)                // NEW, used by NativeBloomPyramid prefilter
```

- HDR grade writer: set `u_whiteBalance`, `u_lift`, `u_gamma`, `u_gain`, `u_shadows`, `u_midtones`, `u_highlights` from `pipeline.grade` (`packages/engine/src/agent-api/postBridge.ts:921-936`), folded into the exposure draw at `packages/rendering/src/post/v2Stages.ts:1079` or the S10 composite. One fullscreen draw.
- LUT: upload `parseCubeLut` output through `packages/rendering/src/post/DisplayLutCache.ts`, set `u_hasLut = 1` (`v2Stages.ts:1218-1253`). CLI: `aura3d assets add <file.cube> --type lut` (NEW type in `packages/aura3d-cli/src/cli-help.ts:8` list and the admission code).
- AgX/neutral: delete the preset degrade (`postPresets.ts:201-213`) after one capture shows AgX output.
- Stage trace: `recordPostStage` for S4 god rays, S6 DOF, S7 motion blur, S9 bloom, S10b grade, CA, grain (`packages/rendering/src/renderer/postSkipped.ts:28`); today only enter, S1C, S2, TAA and custom passes record.
- SSR: NEW S3 half-res depth march on the S1 linear depth (`v2Stages.ts:662`), reprojected previous colour, fade to the nearest reflection probe, roughness cutoff 0.5.
- Selective bloom: per-material `bloom` weight written to an alpha or MRT channel and read in the `packages/rendering/src/postprocess/NativeBloomPyramid.ts` prefilter.
Needed by: every game (grade/LUT 22 games; runtime post 12; selective bloom 18; SSR 6; tilt-shift 4).

#### E-D Materials and custom-shader access

```ts
// packages/engine/src/agent-api/nodes/types.ts:172 (AuraMaterialSpec)
rim?: { color: string; power?: number; intensity?: number };                          // NEW (forward PBR chunk)
// packages/engine/src/agent-api/nodes/material.ts (beside :68)
material.toon(opts: { steps?: number; ramp?: AuraAssetRef<"texture">; shadowColor?: string;
  rim?: AuraMaterialSpec["rim"] }): AuraMaterialSpec;                                    // NEW
// AuraCustomMaterialSpec (types.ts:2679): add castShadow?: boolean (depth variant runs the author vertex shader) // NEW
// AuraModelMaterialOverride (packages/engine/src/contracts/materials.ts:21): add rim, transmission, iridescence  // NEW
// AuraModelMaterialHandle (materials.ts:29-33): add setEmissive(target: string, color: string, intensity: number): void // NEW, no snapshot re-apply
```

- NEW author chunks in `packages/rendering/src/shaders/chunks/author/` registered in `index.ts`: `a3d_ibl` (`a3dEnvDiffuse(N)`, `a3dEnvSpecular(R, roughness)`), `a3d_lights` (`a3dDirect(N, V, albedo, roughness)` over the sun and clustered lights), plus built-in uniforms `u_a3dSunColor`, `u_a3dSunIntensity`, `u_a3dHemiSky`, `u_a3dHemiGround`, `u_a3dFogColor`, `u_a3dFogDensity` beside `u_a3dSunDirection` (`shadow.glsl.ts`).
- `material.custom({ fog: true })` applies scene fog (today only recorded, `packages/engine/src/agent-api/compiler/customMaterial.ts:37`).
- Per-instance emissive colour: `instanceColorTarget: "base" | "emissive" | "both"` (instance colour multiplies base only today, `packages/rendering/src/ShaderLibrary.ts:118-129`); option lives on `instances.*` (E-G owns `instances.ts`, E-D owns the shader).
- Per-instance `modelMatrix` and colour attributes for `material.custom` on instanced nodes.
- Diagnostics: `AuraDiagnostics` (`types.ts:2509`) gains `triangles` and `textureBytes` counters.
Needed by: rim 15 games; custom-shader chunks G15, G16, G17, G19, G22, G23, G24, G25; toon G16; castShadow G23.

#### E-E Outline targets and toon post

```ts
// packages/engine/src/agent-api/nodes/effects.ts:105 outline options: add
targets?: string[];         // NEW node names written to an ID/stencil mask in the forward pass
// packages/engine/src/agent-api/nodes/effects.toon.ts:5-20: add
inkSource?: "color" | "depth" | "both"; fadeDistance?: number; inkColor?: string;     // NEW
```
Needed by: G16, G20, G24 (others may adopt).

#### E-F Runtime VFX: atlas sprites, trails, presets

```ts
// packages/engine/src/contracts/effects.ts:9-24
burst(kind: AuraVfxKind | string, at: Vec3, opts?: AuraBurstOptions): void;   // NEW: registered names resolve
trail(target: string | AuraRuntimeNodeHandle, opts: { width: number; life: number; color: string;
  widthOverSpeed?: [number, number] }): AuraTrailHandle;                        // NEW: real ribbon, no VFX_TRAIL_PENDING
// emitter sprite (contracts/effects.ts:119,156): read by production lowering                    // NEW
sprite?: "soft-dot" | "glow" | "flare" | "spark-streak" | "ring" | "ring-thin" | "dust-mote" | "bubble"
  | "rain-streak" | "snowflake" | "smoke-a" | "smoke-b" | "fireball" | "flame-loop" | "muzzle"
  | "splash" | "electric" | "debris-chips" | { atlas: AuraAssetRef<"texture">; frame?: number };
// effects.flipbook (nodes/effects.ts:198): add texture?: AuraAssetRef<"texture">                // NEW
```

- `spawnEmitter` reads `registerPreset` entries before `BURST_PRESETS` (`effects-api.ts:166, 290`).
- `AuraVfxEffectSpec.attachTo` (`contracts/effects.ts:125`) honoured in `ProductionEffectSystem.ts`.
- Trail wiring to the ribbon path (`ProductionEffectSystem.ts:500-522`).
- Root-cause the "floating dot" report that made FC and Links force `effects.runtime = "off"`; add a receipt.
- Delete the stale "flipbook-sprite is recorded but withheld" warning (`packages/engine/src/agent-api/rendererDiagnostics.ts:92`); check `effects.lightCone` really draws (same withheld consumer).
- Ship genre-coloured variants of `spark`, `dust`, `pickup` in `effects-api.ts`.
Needed by: all 25 games (preset packs), trail 14 games, atlas sprites 19 games.

#### E-G Flags, world, sky and instancing

- Promote to default-on after a luma and LPIPS capture (`packages/rendering/src/contracts/flags.state.ts`): `A3D_QR_VFX_SKY`, `A3D_QR_VFX_FOG`, `A3D_QR_WORLD_WATER` (alone, not all of WORLD), `A3D_QR_POST_VELOCITY_MRT`, `A3D_QR_ANIMATION_SKINNED_SHADOWS`. `A3D_QR_TIERS` gets a post-only mode so phones stop paying for High post (`packages/engine/src/agent-api/compiler/postprocess.ts:101`).
- Builder-time world flags honour app `qualityRebuild.flags` (`packages/engine/src/agent-api/world/flags.ts:12-16` reads env only).
- Export `world` (`packages/engine/src/agent-api/world/index.ts:30-47`) from `packages/engine/src/public/index.ts`; `world.grass/scatter` accept a heightfield sampler `(x, z) => y`.
- Typed sky options: `stars?: { count: number; brightness?: number }` and `clouds?: { coverage: number; speed?: number; color?: string }` on `sky.preetham/gradient` (today `unknown`, `packages/engine/src/contracts/atmosphere.ts:13-14`), bound to `packages/rendering/src/atmosphere/StarField.ts` and `CloudLayer.ts`.
- `instances.model({ wind })` works without the WORLD lane, and `instances.custom` gains `wind` (`packages/engine/src/agent-api/nodes/instances.ts:64-100`).
- `instances.model({ lights: { offset: Vec3; color: string; power: number; distance: number } })` attaches clustered point lights per instance (lamp posts).
Needed by: sky 12 games, height fog 14, water 6, velocity 6, skinned shadows 7.

#### E-H Camera, animation, crowds, asset cache

```ts
// packages/engine/src/contracts/camera.ts:95-102: rail factory returns the real controller rig
rigs.rail(opts: { points: Vec3[]; lookAt: Vec3 | Vec3[]; duration: number; ease?: AuraEase; fov?: number }): AuraCameraRig;
// packages/engine/src/contracts/animation.ts:35 playLayer opts: add speed?: number            // NEW (forwarded in actorAnimationHandle.ts:490-513)
// animation.ts: actor.pose.setLocalRotation(bone: string, quat: Quat): void                   // NEW procedural bone override
// runtime.ts: handle.part(name: string): AuraRuntimeNodeHandle | undefined                    // NEW named GLB sub-node
// TypedGLBActor (production-runtime/TypedGLBActor.ts:184-215): crossFadeTo(clip, seconds) and playLayer  // NEW
```

- Crowd kit (`packages/engine/src/instances-model/`): impostor or vertex-animated skinned instances with per-instance colour, clip phase and pose index; skinned `instances.model` stops falling back to one draw per actor (`instances.ts:59-62`).
- GLB resource cache across `app.setScene`, keyed by asset hash (`packages/engine/src/production-runtime/`).
- Verify `attachRootRenderSource` items (`packages/engine/src/agent-api/RootRuntimeSupport.ts:101`) cast sun shadows and receive contact shadows.
Needed by: crowds G01, G07, G08, G09, G10; rail G03, G04, G12, G13; playLayer speed G05; TypedGLBActor G17; cache G05.

#### E-I Proof tooling and checks

- `tests/browser/game-luma-capture.spec.ts:36-73` GL_META gains: per-frame and per-cell mean RGB and mean hue, per-cell luma stddev and p5/p95, Laplacian variance per cell, named crop rects published by the game's QA hook (`window.__AURA_QA__.crops`), and a two-shot diff mode (`GL_PAIR_MS`).
- `tests/browser/game-luma-targets.ts` gains per-variant URL params (`?chapter=`, `?band=`, `?at=`, `?floor=`, `?circuit=`, `?look=`) and the new variant targets listed per game.
- `aura3d look judge --judge prism` imports `judgeWithPrism` from `tools/quality-gate/src/judge-prism.ts:38` (fix `packages/aura3d-cli/src/look/judge.ts:53-69`).
- `aura3d evidence judge --mode sibling` (NEW prompt in `packages/aura3d-cli/src/commands/evidence/judge.ts:26-43`): "are these two frames from the same game?".
- New game-checks in `tools/game-checks/lib/index.mjs`: `art-direction` (file present, `auditArtDirection` passes), `look-identity` (HDRI sha256, signature effect and palette not shared with another live game), `prop-exclusivity` / `borrowed-asset` (asset keys owned by another game's prefix), `luma-band` (committed steady-state JSON inside the declared band).
- `aura3d assets certify-game-geometry --category sports|fighting|arena|puzzle` (`packages/aura3d-cli/src/cli.ts:181-186`).
- `tools/real-gpu/scenarios.json`: one scenario per live game (18 NEW).
- Remote image gains a Basis/KTX2 encoder (`tools/remote-acr/Dockerfile.playwright`).
- Lessons (`docs/agents/lessons-learned.md`): mean-luma trap, LFS pointer stubs, single shadow caster.

#### E-J Game package: HUD themes and art-direction contract

- `packages/game/src/hud/themes.ts`: replace the `plain` theme's Roboto stack (`:23`) and Barlow in `sports-broadcast`/`motorsport` (`:19,40`) with licensed faces; add themes `storybook`, `ink-scroll`, `sky-expedition` on licensed fonts.
- `packages/engine/src/contracts/art.ts:9` `GameGenre` adds `"maze-arcade"`; `look-recipes.md` gains a maze-arcade row.
- Optional `audioReactive` juice binding on `AudioAnalyser` (`packages/game/src/juice/`).

### 3.2 Per-game look contract

Every live game ships, in its own folder (app-local `art/` for app games, `examples/<x>/art/` for ports):

1. `art/direction.ts` built with `defineArtDirection` (`packages/game/src/art/define.ts:146`): id, genre, one-sentence fantasy, >= 3 generic references, palette `{ primary: string[3..4], accent, reservedObjective }`, lighting `{ key: "one shadowed key", fill: "environment" }` (no ambient fill), framing, asset roles, a VFX entry per gameplay event, a `signatureEffect` string unique among live games, critical categories, and per-tier budgets.
2. A look table (`look.ts`, `lighting.ts`, `daylight.ts`, `bands.ts`, `courtRigs.ts` or `colorScript.ts`, as each plan names) with one row per variant: HDRI or sky, sun elevation/azimuth/colour/intensity, fill, fog colour and density, post preset, grade, bloom, signature-effect parameters.
3. A preset pack (`vfx.ts` or `fx.ts`) registering the game's runtime effect kinds.
4. An identity sheet in `evidence/game-upgrades-47/<slug>/identity.md`: palette swatches with hex, the variant list with time of day and HDRI, the signature effect, the before/after card frames, the budget row, and the distinctness results.
5. `evidence/game-upgrades-47/<slug>/budget.json` with `{ before, after }` rows per variant: drawCalls, triangles, textureBytes, page MB, route JS gzip delta, runner fps.

---

## 4. File-by-file breakdown and lane ownership

Lanes own disjoint files. A lane that needs a change in another lane's file asks the owner; it does not edit it. Shared files are listed once, with one owner.

### 4.1 Engine lanes

| Lane | Files (CREATE / MODIFY) |
|---|---|
| E-A Looks and HDRIs | MODIFY `packages/engine/src/contracts/looks.ts`, `packages/engine/src/agent-api/looks/looks.ts`, `packages/engine/src/agent-api/looks/lookPresets.ts`, `packages/engine/src/agent-api/looks/lookNodeHandler.ts`, `packages/aura3d-cli/src/commands/assets/optimizeVerb.ts`, `packages/aura3d-cli/src/commands/assets/optimize.ts`, `public/hdri/ATTRIBUTION.md`, `assets/art-direction/hdri-environments.json`. CREATE `public/hdri/<id>_1k.hdr` for each catalogued HDRI, `tests/unit/looks/look-overrides-47.test.ts` |
| E-B Runtime light/env/fog | MODIFY `packages/engine/src/agent-api/nodes/types/runtime.ts`, `packages/engine/src/contracts/lighting.ts`, `packages/engine/src/contracts/atmosphere.ts`, `packages/engine/src/agent-api/compiler/environment.ts`, `packages/engine/src/agent-api/compiler/lights.ts`, `packages/engine/src/agent-api/compiler/observations.ts`, `packages/engine/src/lanes/prd02.ts`, `packages/engine/src/lanes/prd07.ts`, `packages/engine/src/agent-api/vfx/atmosphere-api.ts`, `packages/engine/src/production-runtime/effects/LiveAtmosphere.ts`, `packages/rendering/src/shadows/SpotShadowMaps.ts`, `packages/rendering/src/shadows/ShadowAtlas.ts`, `packages/rendering/src/shadows/CascadeUse.ts`. CREATE `tests/unit/lighting/set-light.test.ts`, `evidence/receipts/runtime-light-control/` |
| E-C Post | MODIFY `packages/rendering/src/post/v2Stages.ts`, `packages/rendering/src/post/DisplayLutCache.ts`, `packages/rendering/src/post/PostGraph.ts`, `packages/rendering/src/post/shaders/*`, `packages/rendering/src/renderer/postSkipped.ts`, `packages/rendering/src/postprocess/NativeBloomPyramid.ts`, `packages/engine/src/agent-api/postBridge.ts`, `packages/engine/src/agent-api/postPresets.ts`, `packages/engine/src/contracts/post.ts`, `packages/engine/src/agent-api/nodes/effects.post.ts`, `packages/aura3d-cli/src/cli-help.ts` (lut type), the CLI admission for `--type lut`. CREATE `packages/rendering/src/post/shaders/ssr.glsl.ts`, `evidence/receipts/{effects-god-rays,effects-lut,effects-white-balance,effects-ssr,effects-motion-blur,effects-selective-bloom}/` |
| E-D Materials | MODIFY `packages/engine/src/agent-api/nodes/types.ts`, `packages/engine/src/agent-api/nodes/material.ts`, `packages/engine/src/agent-api/compiler/customMaterial.ts`, `packages/engine/src/contracts/materials.ts`, `packages/rendering/src/ShaderLibrary.ts`, `packages/rendering/src/ForwardPass.ts`, `packages/rendering/src/DepthPass.ts`, `packages/rendering/src/shaders/chunks/author/index.ts`, `packages/rendering/src/shaders/chunks/author/shadow.glsl.ts`, `packages/engine/src/production-runtime/ModelMaterialOverrides.ts`. CREATE `packages/rendering/src/shaders/chunks/author/{ibl,lights}.glsl.ts`, `packages/rendering/src/shaders/chunks/rim.glsl.ts`, `evidence/receipts/material-rim/` |
| E-E Outline/toon | MODIFY `packages/engine/src/agent-api/nodes/effects.toon.ts`, the outline pass in `packages/rendering/src/renderer/PostprocessExecution.ts` |
| E-F VFX | MODIFY `packages/engine/src/contracts/effects.ts`, `packages/engine/src/agent-api/vfx/effects-api.ts`, `packages/engine/src/production-runtime/effects/EffectNodeLowering.ts`, `packages/engine/src/production-runtime/effects/ProductionEffectSystem.ts`, `packages/engine/src/production-runtime/effects/FlipbookAtlas.ts`, `packages/engine/src/agent-api/rendererDiagnostics.ts`, `packages/engine/src/agent-api/nodes/effects.ts` (also hosts the DOF `tiltShift`, outline `targets` and `godRayDensity` option fields on behalf of E-C/E-E), `packages/aura3d-cli/skills/aura3d-game-art/SKILL.md`. CREATE `evidence/receipts/{vfx-atlas-sprites,vfx-trail}/` |
| E-G Flags/world/sky | MODIFY `packages/rendering/src/contracts/flags.state.ts`, `packages/engine/src/contracts/flags.ts`, `packages/engine/src/public/index.ts`, `packages/engine/src/agent-api/world/flags.ts`, `packages/engine/src/agent-api/world/index.ts`, `packages/engine/src/agent-api/compiler/fog.ts`, `packages/engine/src/agent-api/compiler/sky.ts`, `packages/engine/src/agent-api/nodes/sky.ts`, `packages/engine/src/agent-api/nodes/water.ts`, `packages/engine/src/agent-api/nodes/instances.ts`, `packages/engine/src/agent-api/compiler/postprocess.ts`, `packages/rendering/src/atmosphere/{StarField,CloudLayer}.ts`. CREATE `evidence/receipts/{sky,height-fog,water}/` |
| E-H Camera/animation | MODIFY `packages/engine/src/contracts/camera.ts`, `packages/engine/src/contracts/animation.ts`, `packages/engine/src/agent-api/app/actorAnimationHandle.ts`, `packages/engine/src/production-runtime/TypedGLBActor.ts`, `packages/engine/src/agent-api/RootRuntimeSupport.ts`, `packages/engine/src/instances-model/*`. CREATE `packages/engine/src/production-runtime/GlbResourceCache.ts`, `evidence/receipts/crowd-kit/` |
| E-I Proof tooling | MODIFY `tests/browser/game-luma-capture.spec.ts`, `tests/browser/game-luma-targets.ts`, `tests/unit/game-luma-targets.test.ts`, `packages/aura3d-cli/src/look/judge.ts`, `packages/aura3d-cli/src/commands/evidence/judge.ts`, `packages/aura3d-cli/src/cli.ts` (certify categories), `tools/game-checks/lib/index.mjs`, `tools/game-checks/data/terms.json`, `tools/real-gpu/scenarios.json`, `tools/remote-acr/Dockerfile.playwright`, `docs/agents/lessons-learned.md`, `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md`. CREATE `tools/look-metrics/region-luma.mjs`, `tools/look-metrics/silhouette-iou.mjs` |
| E-J Game package | MODIFY `packages/game/src/hud/themes.ts`, `packages/engine/src/contracts/art.ts`, `packages/game/src/art/define.ts`, `packages/aura3d-cli/skills/aura3d-art-direction/references/look-recipes.md`. CREATE `packages/game/src/juice/audioReactive.ts` (optional) |

### 4.2 Game lanes

Each game lane owns its app folder, its `examples/` folder if it is a port, its capture spec, its evidence folders and its new luma-target rows (the rows are merged into `tests/browser/game-luma-targets.ts` by E-I from a per-game list the lane hands over).

| Lane | Slug (public title) | Owned folders |
|---|---|---|
| G01 | top-tennis (Aura Slam) | `apps/showcase-top-tennis/`, `examples/aura-slam/`, `tests/browser/aura-slam-*.spec.ts`, `evidence/aura-slam/` |
| G02 | roadster-rush (Apex Overdrive) | `apps/showcase-roadster-rush/`, `tests/browser/audit-fix/roadster-rush.spec.ts`, `evidence/apex-overdrive/` |
| G03 | heatsink (Thermal Drift) | `apps/showcase-heatsink/`, `tests/unit/heatsink/`, `evidence/thermal-drift/` |
| G04 | teleoperator (Grid Dispatch) | `apps/showcase-teleoperator/`, `evidence/teleoperator/` |
| G05 | iron-crown (Iron Crown) | `apps/showcase-iron-crown/`, `evidence/iron-crown/` |
| G06 | pips-big-leap (Pip's Big Leap) | `apps/showcase-pips-big-leap/`, `tests/unit/pips-big-leap/`, `evidence/pips-big-leap/` |
| G07 | aura-hoops-3d | `apps/showcase-aura-hoops-3d/`, `tools/hoops-athlete-retexture/`, `evidence/aura-hoops-3d/` |
| G08 | aura-diamond-3d | `apps/showcase-aura-diamond-3d/`, `tests/unit/aura-diamond/`, `evidence/aura-diamond-3d/` |
| G09 | aura-fc-3d | `apps/showcase-aura-fc-3d/`, `evidence/aura-fc-3d/` |
| G10 | aura-links-3d | `apps/showcase-aura-links-3d/`, `tests/unit/aura-links-3d/`, `evidence/aura-links-3d/` |
| G11 | bunker-zero | `apps/showcase-bunker-zero/`, `evidence/showcase-bunker-zero/` |
| G12 | slingshot-siege | `apps/showcase-slingshot-siege/`, `evidence/slingshot-siege/` |
| G13 | dot-dash-3d | `apps/showcase-dot-dash-3d/`, `evidence/game-upgrades-47/dot-dash-3d/` |
| G14 | cross-hop | `apps/showcase-cross-hop/`, `evidence/cross-hop/` |
| G15 | strange-orbit-port (Craterline GP) | `apps/showcase-strange-orbit-port/`, `examples/strange-orbit-port/`, `evidence/strange-orbit-port/` |
| G16 | splat-rush-port (Chroma Roll) | `apps/showcase-splat-rush-port/`, `examples/splat-rush-port/`, `tests/unit/splat-rush-port/`, `evidence/audit-fix/g16/` successors |
| G17 | serpentine-sky-run-port | `apps/showcase-serpentine-sky-run-port/`, `examples/saiyan-snake-way-port/`, `tests/unit/saiyan-snake-way-port/`, `evidence/serpentine-sky-run-port/` |
| G18 | drift-and-deliver-port (Gridlock Courier) | `apps/showcase-drift-and-deliver-port/`, `examples/drift-and-deliver-port/`, `evidence/drift-and-deliver-port/` |
| G19 | heatsink-port (Ion Circuit) | `apps/showcase-heatsink-port/`, `examples/heatsink-port/`, `tests/unit/heatsink-port/`, `evidence/heatsink-port/` |
| G20 | ninja-runner-port (Shadowstep Gauntlet) | `apps/showcase-ninja-runner-port/`, `examples/ninja-runner-port/`, `tests/unit/ninja-runner-port/`, `evidence/ninja-runner-port/` |
| G21 | last-train-port (Lamplight Line) | `apps/showcase-last-train-port/`, `examples/last-train-port/`, `tests/unit/last-train-port/`, `evidence/last-train-port/` |
| G22 | roadster-hours-port (Saltwind Highway) | `apps/showcase-roadster-hours-port/`, `examples/roadster-hours-port/`, `evidence/roadster-hours-port/` |
| G23 | where-the-wind-wanders-port (The Bellkeeper's Walk) | `apps/showcase-where-the-wind-wanders-port/`, `examples/where-the-wind-wanders-port/`, `evidence/where-the-wind-wanders-port/` |
| G24 | silt-and-signal-port (Duneglide) | `apps/showcase-silt-and-signal-port/`, `examples/silt-and-signal-port/`, `evidence/silt-and-signal-port/` |
| G25 | cloud-runner-port (Cumulus Dash) | `apps/showcase-cloud-runner-port/`, `examples/kid-goku-beyond-the-clouds-port/`, `evidence/kid-goku-beyond-the-clouds-port/` |

### 4.3 Shared files and their single owner

| Shared file | Owner | Rule |
|---|---|---|
| `tests/browser/game-luma-targets.ts`, `tests/unit/game-luma-targets.test.ts` | E-I | game lanes submit variant rows; E-I merges once per wave |
| `tools/game-checks/lib/index.mjs`, `tools/game-checks/data/terms.json` | E-I | |
| `tools/real-gpu/scenarios.json` | E-I | one row per game |
| root `aura.assets.json`, `public/aura-assets/`, `.gitattributes` (LFS) | WP-36 Meshy/asset batch | games owning an app-local manifest (`apps/<app>/aura.assets.json`) edit only their own |
| `public/hdri/`, `public/hdri/ATTRIBUTION.md` | E-A | games that vendor an HDRI into their own `public/hdri/` own that copy |
| `docs/workflows/game-inventory.json` (generated), `tools/site/games.catalog.json`, `public/previews/showcase-index/`, `marketing/public/previews/` | WP-37 site/posters | |
| `CHANGELOG.md`, `README.md`, release notes | WP-38 proof/release | |
| `packages/game/src/hud/themes.ts` | E-J | |
| `evidence/game-upgrades-47/distinctness/` | WP-38 | |

---

## 5. Work packages

All engine WPs start at once. All game WPs start at once too: each game item uses an interim path until its engine dependency merges (D6). Dependencies are written as `E-x` lane ids.

### 5.1 Engine work packages

#### WP-1 (E-A) Look overrides, HDRI catalogue, HDRI delivery
- [ ] Add the NEW `AuraLookOverrides` keys (section 3.1, E-A) with clamps in `applyOverrides`.
- [ ] Extend `HDRI_ASSET` with the 14 unused corpus/library HDRIs as typed ids; ship 1k copies in `public/hdri/` with licence rows (Poly Haven CC0; fixtures `manifest.json`).
- [ ] Emit grade `temperature`/`tint` and the declared post preset from `v0Children`; a colour `background` override sets the look HDRI to `background: false`.
- [ ] `aura3d assets optimize --hdri 1k|2k [--rgb9e5-cube]`.
- Acceptance: unit test covers every new key and clamp; a FC Munich-style scene with `interior-industrial` plus `background: "#0d1a24"` shows the background colour in the top grid row (top-row mean within 10 luma of the colour's luma); each 1k HDRI <= 1.5 MB; `pnpm typecheck` error count does not exceed the 58 baseline.

#### WP-2 (E-B) Runtime light, environment and fog control; multi-caster shadows
- [ ] `setLight` on light handles with `transitionSeconds` blending; receipt shows a directional colour ramp over 2 s and a point light following `setPosition` every frame.
- [ ] `app.lighting.setEnvironment` with crossfade; `setEnvironmentRotation` rotates probe sampling.
- [ ] `setFog` applies to scenes with an `effects.fog` node; height-fog binding no longer needs `A3D_QR_VFX_SKY`.
- [ ] Up to `localShadowLights` local shadow casters plus the sun.
- [ ] `punctualLights` and `localShadowLights` in lighting diagnostics.
- Acceptance: receipts in `evidence/receipts/runtime-light-control/`; `setVisible(false)` on a shadowed spot removes its shadow map row from `diagnostics().lighting.shadows`; a 4-spot stadium test scene at High reports 2 sampled spot shadow rows.

#### WP-3 (E-C) Post: grade writer, LUT, AgX, stage trace, runtime post, SSR, selective bloom, tilt-shift DOF
- [ ] HDR grade uniform writer; receipt `effects-white-balance` shows temperature +0.2 moving mean R/B by >= 0.08.
- [ ] `.cube` binding plus `assets add --type lut`; receipt `effects-lut` shows a non-identity LUT changing mean |dRGB| by >= 6.
- [ ] Remove the AgX/neutral degrade after a capture.
- [ ] `recordPostStage` for S4, S6, S7, S9, S10b, CA, grain.
- [ ] `app.post.setEffect` / `setEffectEnabled` for bloom, colorGrade, depthOfField, motionBlur, chromaticAberration, volumetricFog, vignette.
- [ ] S3 SSR program; receipt `effects-ssr`.
- [ ] Per-material `bloom` weight in the bloom prefilter; receipt shows an emissive lamp at weight 1 blooming and a white wall at weight 0 not changing (p95 within 3).
- [ ] DOF `tiltShift` band mode; `godRayDensity` field.
- Acceptance: all receipts committed; `diagnostics().post.stagesRan` names every stage that ran in a test scene with all effects on.

#### WP-4 (E-D) Materials and custom-shader access
- [ ] PBR `rim` term and override field; receipt `material-rim`.
- [ ] `material.toon`.
- [ ] `a3d_ibl` and `a3d_lights` author chunks, sun/hemi/fog built-in uniforms, `fog: true` honoured.
- [ ] `castShadow` for `material.custom` with the author vertex shader in the depth pass.
- [ ] Per-instance emissive colour target; per-instance matrix for instanced `material.custom`.
- [ ] `setEmissive` on model material handles; `transmission`/`iridescence` override fields.
- [ ] `triangles` and `textureBytes` in `app.diagnostics()`.
- Acceptance: `tests/unit/*shaders-compile*` suites of all ports still compile; a swaying-card test scene casts a shadow that moves with the sway (frame diff > 0 in the shadow crop).

#### WP-5 (E-E) Outline targets and depth-aware toon ink
- [ ] `outline({ targets })` with an ID mask; `toon({ inkSource, fadeDistance, inkColor })`.
- Acceptance: an outlined target shows ink on >= 60% of its silhouette perimeter and < 0.5% edge pixels in the sky.

#### WP-6 (E-F) Runtime VFX
- [ ] Atlas sprite sampling by name; `flipbook({ texture })`; `attachTo`; registered presets resolve in `burst`/`spawn`; real `trail`; genre-coloured base variants; stale warning removed; floating-dot root cause fixed with a receipt.
- Acceptance: receipts `vfx-atlas-sprites` (smoke-a, dust-mote, splash render as their sprites, not dots), `vfx-trail` (ribbon >= 30 m long behind a moving node, no `VFX_TRAIL_PENDING`); `liveCount` returns to 0 within 1.2 s after the last burst in a 60 s soak.

#### WP-7 (E-G) Flags, world, sky, instancing
- [ ] Capture-gated promotion of `A3D_QR_VFX_SKY`, `A3D_QR_VFX_FOG`, `A3D_QR_WORLD_WATER`, `A3D_QR_POST_VELOCITY_MRT`, `A3D_QR_ANIMATION_SKINNED_SHADOWS`; each with a before/after luma table over all 64 targets showing no unintended change > 2 luma on games that do not use the feature.
- [ ] Post-only tier following for phones.
- [ ] `world` export, heightfield sampler; world flags read from app flags.
- [ ] Typed `stars`/`clouds` on sky nodes.
- [ ] Instance `wind` without WORLD; `wind` on `instances.custom`; per-instance `lights`.
- Acceptance: receipts `sky`, `height-fog`, `water`; luma tables committed under `evidence/game-upgrades-47/flag-promotion/`.

#### WP-8 (E-H) Camera, animation, crowd kit, GLB cache
- [ ] Contract `rigs.rail` returns the controller rail; `playLayer({ speed })`; `pose.setLocalRotation`; `handle.part(name)`; TypedGLBActor `crossFadeTo`/`playLayer`; root render sources cast shadows.
- [ ] Crowd kit: 480 instanced spectators in <= 4 draws with per-instance colour and clip phase.
- [ ] GLB cache across `setScene`.
- Acceptance: receipt `crowd-kit` with draw count; a second `setScene` with the same assets makes 0 GLB fetches.

#### WP-9 (E-I) Proof tooling and checks
- [ ] GL_META colour, hue, per-cell stddev, Laplacian, crops, pair diff; `tools/look-metrics/region-luma.mjs`.
- [ ] Variant URL params and all new variant targets (about 45 new rows, listed per game in WP-11 to WP-35).
- [ ] `look judge --judge prism` wired; `evidence judge --mode sibling`.
- [ ] `art-direction`, `look-identity`, `prop-exclusivity`, `luma-band` checks.
- [ ] Certify categories sports/fighting/arena/puzzle; real-GPU scenarios for all 25; KTX2 encoder in the runner image; lesson entries.
- Acceptance: `vitest run tests/unit/game-luma-targets.test.ts` passes; `node tools/game-checks/run.mjs --all` runs the 4 new checks (warn level until WP-38 flips them to error).

#### WP-10 (E-J) HUD themes and art-direction genre
- [ ] Licensed fonts in every HUD theme; `storybook`, `ink-scroll`, `sky-expedition` themes; `maze-arcade` genre.
- Acceptance: `rg -n "Roboto|Barlow|system-ui|-apple-system" packages/game/src/hud/themes.ts` returns nothing.

### 5.2 Game work packages: how to read the tables

Each game WP lists: lane, identity, today's measured state, engine dependencies, budget, Meshy batch, and the full upgrade table. Columns: **ID**, **Area**, **Pri** (M must, S should, C could), **Change**, **APIs and files** (file:line is in the checkout; NEW items name their engine lane), **Assets**, **Acceptance**. Captures are steady state at 25 s and 60 s on the remote runner, 1280x720 unless stated; "grid[n]" is the 3x3 grid cell n (0 top-left, 8 bottom-right) from `game-luma-capture.spec.ts`. Every item ends with diagnostics recorded before and after in the game's `budget.json`.

#### WP-11 (G01) top-tennis: "World Tour broadcast"

- **Code:** `apps/showcase-top-tennis/src/main.ts:3` mounts `examples/aura-slam`; look in `examples/aura-slam/view/`.
- **Today:** ambient 0.62 + hemisphere 0.72 + one 1-cascade directional + a #d8ff3e centre point light that makes a court hotspot (`view/lighting.ts:16-23`); no environment, sky or fog; flat-colour PBR; capsule athletes; 24 capsule spectators; 3 GLBs, two shared with Diamond and Hoops; one camera (eye [0,25.5,37.1], fov 15). Hard court mean 49.3-53.3, p95 69-129; 390x844 darkFrac 0.42; 115-126 draws (`evidence/aura-slam/audit-2026-10-29/after/meta.jsonl`). All six venues share light, sky and post.
- **Identity:** a long-lens TV tennis game; each venue its own hour and climate. NY cold-white floodlit night on navy acrylic; London soft late-morning sun on striped turf; Paris 18-degree golden raking light on terracotta; Dubai white-hot noon haze; Beach magenta sunset; Moon one hard sun on grey regolith with Earth in view. Signature: persistent surface-coloured ball marks and bounce puffs, and a crowd that turns its heads to follow the rally. No HDRI, rooftop prop or cyan floodlit moon shared with Diamond.
- **Engine deps:** E-A (HDRI catalogue, delivery), E-B (setEnvironment so a venue change does not remount), E-C (LUT, selective bloom), E-D (rim), E-F (sprite particles), E-H (bone override, crowd kit), E-I (crops, look judge, `--category sports`).
- **Budget:** <= 150 draws at 1280 High (`docs/agents/build-a-game.md:247`, assertion `tests/browser/aura-slam-render.spec.ts:91`), <= 170 at 390x844; <= 450k tris; <= 96 MB GPU textures; active venue <= 18 MB download; frame time +20% max.
- **Meshy (about 1,400 credits):** 10 athlete segment props and a racket; umpire chair, seated umpire, line-judge chair, ball kid, bench, ball basket, radar post, scoreboard frame, floodlight mast; 5 stand sections and a lunar dome/lander; 4 seated spectators; hydrangea planter, palm, lifeguard tower. Textures from ambientCG/Poly Haven (acrylic, turf, clay, concrete, sand) and aura3d-game-art (net alpha, ball marks, crater decal, venue chips).

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| TT-L1 | lighting | M | Remove ambient, hemisphere and the centre point light; `sceneLights(venueId)` from a VENUE_LIGHT table: sun elev/az grass 40/120, clay 18/250, desert 72/10, beach 8/290, moon 25/60; hard court gets 4 floodlight spots, 2 shadowed | `environments.hdri` environments.ts:125; `lights.directional/spot` lights.ts:51,75; tier `localShadowLights` quality.ts:53-98; `view/lighting.ts:16-23`, `view/venues.ts` | HDRIs from TT-E1 | no `lighting` game-check finding (index.mjs:597); hard grid[4] / mean(grid[6],grid[8]) <= 1.25; unit test sun azimuths differ >= 40 deg; 1 directional shadow row per sun venue, 2 spot rows on hard |
| TT-L2 | lighting | M | PCSS sun (lightSize per venue), mapSize 2048, `fit {center [0,0,0], extent 22}`; `effects.contactShadows`; delete cylinder shadow discs | lighting.ts:11-12; Prd02ShadowFilter.ts; effects.lighting.ts:22; `athleteRig.ts:79`, `ball.ts:13-16` | - | contact pass executed, filter pcss on sun venues, no CONTACT_SHADOWS_WEAK_KEY; feet probe >= 35% darker than court 1 m aside; clay long-shadow probe >= 20% darker than grass |
| TT-L3 | lighting | S | One box reflection probe over the court (res 128, update once) | probes.ts:9-15,45; ProbeBoxProjection.ts | - | hard: court under each floodlight >= 1.6x court 3 m away; frame 120 draws = frame 60; <= 150 draws |
| TT-E1 | env-sky | M | 6 venue HDRIs used by no other game: rooftop_night (0.35), kloppenheim_02, venice_sunset, outdoor-midday-2k, sunset-dramatic-2k, deep_space_starfield (2k, 0.05); background where the sky shows; remove backdrop wall; remount per venue until E-B `setEnvironment` | environments.ts:125; `view/assets.ts`, `scene.ts:241-246`, `renderer.ts:137-150` | 6 repo HDRIs + licence rows | environment.source differs on all 6 and is none of the 3 look HDRIs; rg finds the 6 files only in aura-slam and asset-lookdev; only the active HDRI fetched (<= 6.5 MB); `assets validate --require-license` |
| TT-E2 | env-sky | S | Per-venue fog: desert #e8d2b0 strongest plus volumetric fog at High; clay amber; beach #e09a86; grass light; hard navy #0b1426 with 4 light cones; moon none | effects.ts:52,82,298 | - | desert top/bottom row means within 25; hard difference >= 20; volumetric stage only on desert High; 4 lightCone nodes on hard; no fog on moon |
| TT-E3 | env-sky | C | Moon: Earth sphere at 150 m inside `material.atmosphere`; `material.planet("moon")` ground | material.ts:338,346; primitives.ts:114 | - | Earth >= 4% of frame width; moon darkFrac 0.15-0.5 (declared exception); grid[4] >= 90 |
| TT-P1 | post | M | Per-venue `app.setOutput({ preset })`: hard arena-fight, grass daylight-outdoor, clay cinematic-film, desert daylight-outdoor (exp 1.3), beach cinematic-film, moon space; per-venue contrast/saturation; SMAA | output.ts:15,19; postPresets.ts:47-109; effects.post.ts:27,99,118; `view/lighting.ts:26-31` | - | sun venues p95 >= 160 and p95-p5 >= 120; clipFrac <= 0.02; hard mean 38-60, grid[4] >= 70; six means span >= 30; antiAlias reports smaa |
| TT-P2 | post | C | Long-lens DOF fStop 4 at High+; fStop 2 in intro and replay | effects.ts:131 | - | far-stand Laplacian -40%, far athlete -10% max; frame time +15% max; no DOF stage on Medium |
| TT-P3 | post | S | 6 venue LUTs (blocked on E-C; contrast/saturation until then) | effects.post.ts:99-111; CubeLut.ts | 6 authored .cube | LUT on/off >= 6 mean dRGB; stands hue differs >= 25 deg between sun venues |
| TT-M1 | materials | M | Hero court surfaces: acrylic grain with clearcoat 0.35; turf with sheen 0.6 and mow stripes via texture rotation (drop 8 stripe boxes); clay roughness 0.95; lines #fbfbf5 raised 2 mm | material.ts:68,133,184; types.ts:188-232; `assets resolve --role texture` cli.ts:351; textureStats.ts; `scene.ts:27,38-97` | 3 CC0 sets | service-line probe >= 200 on sun venues; court stddev >= 6; texture gates pass; <= 12 MB maps; -8 draws |
| TT-M2 | materials | M | Kits `material.fabric` sheen 0.5; racket clearcoatPaint; felt ball sheenColor #f2ff7a; net alpha-mask with depth write | material.ts:184,266; types.ts:191-193,286-287; `athleteRig.ts`, `ball.ts:10`, `scene.ts:27-31` | net alpha grid | ivory torso luma >= 170, abs(R-B) <= 20 (today 54,103,120); ball >= 1.8x court; net band >= 60% of court |
| TT-M3 | materials | S | Per-venue surround sets (concrete, painted wood and hedges, terracotta, tensile fabric, bamboo + `water.surface`, regolith + crater decals) | types.ts:218-232; water.ts:20; Decals.ts:492; `scene.ts:40-47` | CC0 sets, crater decal | side cells grid[3]/grid[5] >= 12 dE apart between every venue pair |
| TT-A1 | assets | M | Segment-kit athletes on the existing pose rig (pose.ts and rig parity unchanged) | overrideMaterial.ts; `import-meshy --profile prop` admission.ts:35-40; `athleteRig.ts`, `rigparity/main.ts` | 11 Meshy segments | pose-parity spec passes; no look/primitive-subject; <= 25k tris per athlete; draws not above today |
| TT-A2 | assets | M | Tennis-only models replace rooftop props and catalog seats; scoreboard with live SDF text | text3d.ts:29; `scene.ts:163-237`; `main.ts:6` | Meshy officials and furniture | every AURA_ASSET_IDS key found only in tennis folders; scoreboard text matches debug() within 1 frame; validate --release |
| TT-A3 | assets | S | Venue stand kits via `instances.model` with LOD and impostor shadows | instances.ts:64-80; bake-impostor prd10/index.ts:116 | 5 stand sections | stands <= 6 draws; 390x844 top row >= 40, darkFrac <= 0.15 |
| TT-A4 | assets | M | 240-480 seated spectators (4 variants) via existing setInstanceMatrices | instances.ts:64-74; `spectators.ts:74` | 4 humanoids | crowd <= 4 draws; >= 30 saturated seats in frame; update <= 0.3 ms, 0 allocations |
| TT-V1 | vfx | M | Signature: registered clay-puff/grass-flick/hard-skid/regolith-drift bursts coloured from VENUES[].particleColor plus `app.effects.decal` marks (clay lasts the set); red ring on out calls; delete court-mark cylinders | effects.ts (contract):14,17,19,20; effects-api.ts:36-38; `ball.ts:30-37`, `contract/venues.ts:23-28` | mark and scuff decals | liveCount >= 6 after a 6-bounce clay rally and after the point; burst within 20 dE of particleColor; `?vfx=off` removes |
| TT-V2 | vfx | S | `app.effects.trail("tennis-ball")` replaces 8 spheres; ace punch + impact-flash, skipped on reduced motion | effects.ts:16; camera.ts:38,49 | - | trail 1 draw, >= 25 px; reduced-motion ace pose unchanged |
| TT-V3 | vfx | C | Floodlight lens flares, beach spray, grass leaves, win confetti, moon dust | lights.ts:15; effects.ts:248,337 | - | <= 3 extra draws; 4 flare nodes on hard intro; win liveCount > 0 |
| TT-AN1 | animation | M | Crowd yaw follows the ball with 80-200 ms per-seat lag; stand on cheer | facing.ts:36,56; `spectators.ts:74`, `renderer.ts:245-250` | - | unit test: mean yaw moves >= 25 deg within 0.3 s, no allocation; two rally frames 1 s apart differ >= 10 deg |
| TT-AN2 | animation | C | Wind on palms and planters (0 on moon); net deflects 3 cm on net cords | instances.ts:77; public/index.ts:15 | palm, planter | net offset non-zero 10-20 frames; no wind node on moon |
| TT-C1 | camera | S | Broadcast camera v2: eye [0,15.5,33.5], target [0,0,-1.5], fov 26 via cameraFovForAspect, damped ±0.6 m pan; `?cam=classic` keeps fov 15 | camera.ts (nodes):62; contracts/camera.ts:46-47; `view/camera.ts:4-8`, `renderer.ts:120-127` | - | both athletes in frame in every flow shot; far athlete >= 45 px; top row >= 40; projectWorldPoint within 4 px |
| TT-C2 | camera | S | 4 s 3-shot match intro with bars; 2 s changeover shot; skippable | contracts/camera.ts:41-43,55,60,69 | - | ?intro=1 shot at 1.5 s >= 10 m from broadcast eye; ends at TT-C1 pose; key press ends within 1 frame |
| TT-C3 | camera | C | Ace replay at 0.5x from the baseline with bars, REPLAY tag, DOF fStop 2; sim paused | contracts/camera.ts:53-54; effects.ts:131 | - | replays = 1; sim dt 0 during replay; <= 2.2 s |
| TT-H1 | hud | S | Broadcast scorebug (sets/games/points, serve dot, venue chip), serve-speed lower third; Graphik + DIN Pro, not HUD_THEMES sports-broadcast | `examples/aura-slam/ui/*` | 6 venue chips | HUD <= 9% of canvas; never over an athlete box; no unlicensed font requests |
| TT-H2 | hud | S | Rear boards with SDF "AURA SLAM", "WORLD TOUR" and venue names; LED ribbon pulses on aces | text3d.ts:29; `scene.ts:188-194` | - | cap height >= 10 px; <= 3 draws |
| TT-H3 | hud | M | `examples/aura-slam/art/direction.ts`; audit; sibling judge vs other sports games; look judge round | define.ts:146; audit.ts:35; evidence judge; judge.ts:156 | - | audit passes; same_game false >= 0.8 vs diamond, hoops and others; every category >= 7 |
| TT-W1 | dressing | S | Courtside dressing along the perimeter via scatterAlongPath (baskets, coolers, radar; per venue planters, flower boxes, palms, lifeguard tower, lander) | scatter.ts:177,267; instances.ts:64; NEW `view/dressing.ts` | Meshy props | >= 8 distinct models per venue; <= 10 draws; grounding checks clean |
| TT-PF1 | perf | M | Budget gates: 150 at 1280 / 170 at 390; remove stripe boxes and trail spheres; DOF, volumetric fog and probe at High+ only | types.ts:2505-2560; quality.ts:53-98; `aura-slam-render.spec.ts:91` | - | draws within budget per venue; venue download <= 18 MB; render spec passes |

#### WP-12 (G02) roadster-rush (Apex Overdrive): "Blue-hour skyway"

- **Code:** `apps/showcase-roadster-rush/src` (no examples mount).
- **Today:** `looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: 0.08 })` (`main.ts:200`) puts a noon key (48/35) under a custom sunset dome whose sun sits at about 6.7 deg (`src/art/sky.ts:89-114`); plus ambient 0.5 (look-lint ambient-flattens), an unshadowed directional, a cyan point light and vignette. Flat PBR boxes, emissive cylinder plumes, cartoon townhouse skyline (~75 draws), sky-lane enemies with the same bounds as the player (`src/assets.ts:27-28`). Means 76.8-85.0, sky shot 48.4; time-of-day spread 22.65; 114-175 draws desktop, 108-159 phone.
- **Identity:** an elevated five-lane skyway between glass tower tops in the last minutes of sunset, haze 25 m below the deck, a low tangerine sun dead ahead backlighting traffic under a cobalt-to-violet zenith. Palette #22232a, #ff8a3d, #1f3fa8; cyan #4df0ff only for player and sky lane, red #ff2a3c for rivals. Night is sodium lamps and red tail-light rivers, no magenta. The only racer set in the air above a city.
- **Engine deps:** E-A (look hdri/key/grade/bloom overrides), E-B (setLight, setFog with near/far), E-C (grade writer, LUT, receipts S4/S7, velocity), E-D (rim), E-F (atlas sprites), E-G (tier for phones).
- **Budget:** desktop dense <= 230 draws, phone <= 190; S4 and S7 High only; textures <= 2048 px; route JS gzip delta reported.
- **Meshy (about 370 credits):** hero retexture; red-graphite interceptor rival with far LOD; 9 traffic retextures; 3 glass towers with impostors; deck pylon; interchange span; billboard frame.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| AO-L1 | lighting | M | `looks.preset("golden-hour", { sun: { elevationDeg: 7, azimuthDeg: 175 }, fogDensityScale: 0.7 })` so key, disc and shadows agree; remove ambient and cyan point; keep a 0.6 camera-side fill | lookPresets.ts:128-140; looks.ts:136-162; contracts/looks.ts:12; `main.ts:200-227` | - | appliedLook golden-hour; no ambient-flattens; gameplay-early mean 60-80, p95 >= 215, darkFrac <= 0.06 |
| AO-L2 | lighting | M | Scene light follows time of day from `skyLook(tod)`: key sunset/dusk/night colours and intensities, env intensity 1.0/0.55/0.18 | environment.ts:477-490; contracts/lighting.ts:33; NEW `setLight` (E-B); `main.ts:668-693`, `art/sky.ts:89-128` | - | sunset 70-85, dusk 50-65, night 32-48; spread >= 30 (today 22.65); night darkFrac <= 0.35 |
| AO-L3 | lighting | S | Night: pool of 6 sodium spots following pole rows, 2 headlights from dusk, tail point; intensities scale with nightAmount | lights.ts:62,75; runtime.ts:150; quality.ts:80; NEW setLight | - | night bottom-centre cell mean >= 25, stddev >= 10; draws unchanged; fps -10% max |
| AO-L4 | lighting | S | 3 cascades, maxDistance 140, PCSS; contact shadows replace the black disc | contracts/lighting.ts:12-13; NEW look `key.shadow` (E-A); effects.lighting.ts:22-33; `main.ts:441-448` | - | sun row cascadeCount 3, skipped 0; no weak-key warning; disc node gone; road band darkFrac +0.04 |
| AO-E1 | env-sky | M | Re-palette the dome for blue hour (cobalt mid/top, 6-deg tangerine band, under-lit cirrus, bloom-sized corona, sodium night glow); IBL from belfast_sunset or industrial_sunset | `art/sky.ts` STOPS :89-93; NEW look `hdri` (E-A); fallback environments.hdri environments.ts:125 | 1 HDRI + attribution | title top-centre B > R by >= 15; horizon R > B; clip <= 1.5%; night horizon R > B |
| AO-E2 | env-sky | M | Lift the freeway: ground to y -28 as a haze-floor shader with lit window specks; instanced pylons every 40 m | material.custom + setUniform runtime.ts:198; instances.ts:63-100; `main.ts:232-238`, `art/ground.ts`, NEW `render/pylons.ts` | Meshy pylon | mid-drive red-pink ground pixels <= 15% (from ~45%); pylons <= 2 draws |
| AO-E3 | env-sky | S | Atmosphere back: fog scale 0.7 (near 43/far 257); fog colour follows time of day | looks.ts:257-269,324; NEW `setFog({color,near,far})` (E-B) | - | top road cell stddev >= 30% below bottom; night top-centre <= 30 |
| AO-P1 | post | M | Own grade: contrast 1.12, saturation 1.08; time-of-day white balance after E-C; replaces the look grade (one grade stage) | effects.post.ts:95-112; NEW look `grade` (E-A); NEW grade writer (E-C) | `public/luts/apex-bluehour.cube` (after E-C) | gameplay-early p5 <= 14, p95 >= 210; exactly one grade stage |
| AO-P2 | post | M | Racer bloom 0.55/0.85/0.5 for corona, brake bars, plumes, lamps | effects.post.ts:27-52; postBridge.ts:603; NEW look `post.bloom` (E-A) | - | one bloom at threshold 0.85; sky cell within 3 of bloom off; brake bars +25 |
| AO-P3 | post | S | Motion blur 0.35 (High) and sun lens flare; both off on reduced motion | effects.ts:150; postBridge.ts:831; v2Stages.ts:617; lights.ts:15 | - | S7 ran, no velocity skip; lane-dash stddev -25% at 64 m/s; receipt `effects-motion-blur` |
| AO-P4 | post | S | God rays through the haze (volumetricFog 0.06); warm crash and cyan rocket flash via setOutputOverlay, peak <= 0.3 | effects.ts:82; postBridge.ts:879-884; v2Stages.ts:789; output.ts:20; effects-api.ts:56 | - | S4 ran; sun-side sky +8; overlay peak <= 0.3; receipt `effects-god-rays` |
| AO-M1 | materials | M | Hero cobalt metallic with tangerine stripe via `material.carPaint`; warm rim after E-D | material.ts:324; overrideMaterial.ts; NEW rim (E-D); `meshy-vehicles.ts:10`, `main.ts:366-373` | hero retexture | position hash 0, bounds same; hero p99 >= 240, B > R; rim edge R > B |
| AO-M2 | materials | M | CC0 asphalt (repeat [6,95], roughness 0.55) for sun glare; concrete barriers; trims amber/cyan, no magenta | `assets search` cli-help.ts:38,63; types.ts:216-256; `main.ts:239-305` | asphalt, concrete sets | road cell stddev >= 8; centre road +15 over shoulders; no texture > 2048; no magenta hex in main.ts |
| AO-M3 | materials | S | Retexture 9 traffic types to remove baked blotches, emissive lamps; keep brake bars; regenerate far LODs | `meshy retexture`; optimize.ts; `tools/make-far-lod.mjs` | 9 retextures | hash 0; taxi/bus high-pass energy -30%; draws unchanged |
| AO-M4 | materials | C | Energy plumes: additive fresnel cone with scrolling noise and hot core | material.custom; NEW `art/plume.ts`; `main.ts:399-483,526-530` | - | core p95 >= 240, edge <= 120; draws unchanged |
| AO-A1 | assets | M | Glass tower kit (3 variants) rising from the haze, LOD + impostor beyond 220 m; retire showcaseModernBuildingOne | instances.ts:63-100; prd10/index.ts:109-116; `main.ts:342-345`, `assets.ts:29` | 3 towers | no showcaseModernBuildingOne; skyline <= 75 draws; >= 2 top cells stddev >= 12 |
| AO-A2 | assets | M | Distinct sky-lane rival with ducted fans and far LOD | `import-meshy --profile vehicle`; `assets.ts:28`, `main.ts:516-531` | rival | sha differs; bounds differ >= 10% on one axis |
| AO-V1 | vfx | M | Pack: apex-crash, apex-bolt, apex-land, apex-rocket, apex-skykill; cyan player and red rival trails | contracts/effects.ts:13-20; effects-api.ts:36-41; NEW sprites (E-F); NEW `src/art/vfx.ts` | optional flipbook | presets contain all 5; liveCount <= 96 dense; crash <= 0.12 of screen |
| AO-V2 | vfx | S | Speed lines above 50 m/s and on boost, heat shimmer on Rocket Send, landing sparks | GameFeel.ts:101,255; contracts/effects.ts:14; `main.ts:906-912` | - | speedLines accepted at >= 50 m/s; not called on reduced motion; >= 1 landing spark |
| AO-AN1 | animation | S | Hero rolls up to 6 deg on lane change, pitches on hops, squashes on landing; wheels spin; traffic roll | runtime.ts:152,190; `src/native/presentation.ts` | - | roll sign matches lateral velocity in >= 95% of samples; 6,000-step replays unchanged |
| AO-C1 | camera | M | 3-shot title intro and 1.2 s letterboxed slow-mo on ramps and Rocket Send; skippable; no slow-mo on reduced motion | contracts/camera.ts:41,54,68; GameFeel.ts:98 | - | 2 s title differs from chase by >= 15 mean abs luma; ends within 4.5 s; keydown skips; replays unchanged |
| AO-C2 | camera | S | Chase drops from 3.6 to 2.7 m with speed, banks 2-3 deg, rises in sky lane | contracts/camera.ts:49,53; motionReport.ts:105-114 | - | height <= 2.8 m at 64 m/s; max roll > 0.5 deg; insideColliderSteps 0 |
| AO-H1 | hud | M | Fold the quick bar into one Showcase chip (open only with ?dev=1 or ?capture=1); fix the stuck Sunset button | `index.html`, `src/native/hud.ts`, `hud.css` | - | no DOM rect over the sun disc; active button matches beacon; game-checks 0 errors |
| AO-H2 | hud | S | Motorsport cluster in the identity palette (arc speedo, AIR ladder), licensed fonts already in hud.css | themes.ts:39 (reference only); `hud.css`, `hud.ts` | 5 icons | no rect outside viewport; targets >= 44 px; HUD <= 12% of canvas |
| AO-W1 | dressing | S | Cyan beacon rings every 30 m, interchange spans every 600 m, SDF gantry text, shadowless billboard frames | instances.ts:27; text3d.ts:29; `main.ts:319-346`, `render/gantry.ts` | span, billboard | rings in frustum in >= 4 of 5 states; <= 12 draws; no-three and visible-strings pass |
| AO-W2 | dressing | C | Recycled skid marks, oil stains, lane arrows | Decals.ts:493; Decals.ts:46 | CC0 decals | <= 32 live; no decal-budget overrun |
| AO-PF1 | perf | M | Written budget; S4/S7 High only; sibling judge vs Saltwind, Thermal Drift, Grid Dispatch | diagnostics; `tools/bundle-report/report.mjs`; judge.ts:37 | - | desktop dense <= 230, phone <= 190; no S4/S7 on phone; same_game false vs the 3 racers |

#### WP-13 (G03) heatsink (Thermal Drift): "Foundry megacity seen through heat"

- **Code:** `apps/showcase-heatsink/src` (scene.ts, main.ts, camera.ts, data.ts, view.ts).
- **Today:** `looks.preset("night-city", { fogDensityScale: 0 })` (`scene.ts:88-91`), two unshadowed points, own fog 0.008; no sky (emissive backdrop and band boxes, `scene.ts:105-114`); box road, 18-box rain; 26 grey CC-BY GLBs; no VFX (`main.ts:187-219` only banners and trauma). MEGACITY mean 31.5-46.8, darkFrac 0.25-0.39; card 26.9; 436-555 draws, title 915. The three circuits differ only in four hex colours.
- **Identity:** a race through a foundry megacity seen through heat. Soot #14110f, oxidised iron #3a2a22, molten amber #ff8a1f, slag red #d2361c; coolant cyan #35d6ff only for pickups, shields and the cooling HUD. MEGACITY is a rain-wet sodium night (rooftop_night), DUSTFALL an ochre dust storm under a 9-deg burnt sun with god rays (industrial_sunset_puresky), VESPER a violet pre-dawn lit from below by vents (spruit_sunrise). Signature: refraction heat haze. The only warm-key, heat-haze racer.
- **Engine deps:** E-A (HDRI downsize, look overrides), E-B (setEnvironment, setLight/fog for sector cross-fades), E-C (LUT, SSR, selective bloom, velocity), E-F (flipbook sampler for lava curtain), E-G (height fog), E-H (rail rig, `part()` for rotors).
- **Budget:** steady laps <= 520 draws at 1280 (today 436-555), <= 420 at 390; title <= 700 (today 915); <= 1.2M tris; <= 32 model nodes (`scene.ts:175`); added payload <= 18 MB; NEW `evidence/thermal-drift/budget.json`; NEW real-GPU scenario.
- **Meshy (about 550 credits):** 15 set-piece retextures in two families (soot cast iron; riveted oxidised steel with emissive seams), 7 drone livery retextures, 11 new pieces (fin wall, cooling tower, smokestacks, ladle crane, pipe overpass, dead pine, water tower, aqueduct arch, crystal spire, causeway pylon, reactor ring).

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| HS-01 | lighting | M | Per-circuit rig replaces night-city: one PCSS 3-cascade key (MEGACITY #ffb070 28/120 1.6; DUSTFALL #ff9a4a 9/35 2.6; VESPER #b9a4ff 18/300 1.0), cyan counter-rim 0.35, VESPER up-fill; explicit AO; drop the 2 points | lights.ts:51; contracts/lighting.ts:12-13,23-24; effects.post.ts:67; `scene.ts:88-102`, `data.ts`, `tests/unit/heatsink/scene.test.ts` | - | one shadow row, cascadeCount 3, pcss, sampled; no dropped features; drone cell R/B >= 1.4 on MEGACITY/DUSTFALL; 0 lighting warnings |
| HS-02 | lighting | S | Drone headlight spot; 4 sodium points on gantries; tunnel rect strips | lights.ts:62,75,100; compiler/lights.ts:285-288; quality.ts:80; NEW verified light setPosition (E-B) | - | droppedFeatures empty with <= 7 local lights; draws flat; road cell varies >= 8 over 10 frames once moving pools land |
| HS-03 | env-sky | M | HDRI sky per circuit (rooftop_night 0.55, industrial_sunset 0.9, spruit_sunrise 0.7, background on) replaces backdrop boxes; downsized to 1k; remount on circuit change until E-B | environments.ts:125; contracts/lighting.ts:21,33; cli.ts:351; NEW `assets optimize --hdri` (E-A); `scene.ts`, `view.ts:69-78`, `aura-assets.ts` | 3 HDRIs | source names the circuit HDRI, backgroundDrawn; top-row means differ >= 25 in one channel pairwise; no backdrop/band nodes; each HDRI <= 1.5 MB |
| HS-04 | dressing | M | Parallax skyline layers at 180/300/450 m per circuit, instanced, far layer impostor (baked on the runner) | instances.ts:64,69,75,77; prd10/index.ts:116; scatter.ts:177; NEW `CircuitSpec.skyline` | HS-09 pieces | top-row stddev >= 6 per circuit; <= 9 draws; judge sees a skyline |
| HS-05 | env-sky | M | Per-circuit fog (MEGACITY #2a1d14 0.011, DUSTFALL #8a5a2e 0.02, VESPER #2a2348 0.008); volumetric fog on DUSTFALL only | effects.ts:52,82; postBridge.ts:826,879-890; v2Stages.ts:213; contracts/post.ts:40 | - | far-road p95-p5 -40% DUSTFALL, -20% MEGACITY; S4 only on DUSTFALL at High |
| HS-06 | vfx | S | Rain + wet ground on MEGACITY replaces 18 boxes; DUSTFALL dust field; VESPER embers; off on reduced motion | weather.ts:19,53; effects.ts:248; contracts/effects.ts:20; `scene.ts:135` | - | rain only MEGACITY, dust only DUSTFALL, embers only VESPER; net draws not up; reduced-motion weather liveCount 0 |
| HS-07 | materials | M | Worn asphalt CC0 set (wet roughness 0.15-0.25, DUSTFALL 0.7 ochre); reflection probe every 6 frames; SSR after E-C | types.ts:172-275; probes.ts:9,45; cli.ts:351; ambientcg.ts; textureStats.ts; `scene.ts:119-122` | asphalt set | MEGACITY road p95 >= p50 + 60; gates pass; <= 1.5 MB; probe at 1-in-6 |
| HS-08 | assets | M | Retexture 15 grey pieces in 2 families; pickups keep cyan | meshy retexture; admission.ts:36-37; geometry-hash.mjs; optimizeVerb.ts:29,40 | 15 retextures | hash and bounds same; >= 3 maps, family B emissive; <= 1.5 MB each; judge no longer sees grey blocks |
| HS-09 | assets | M | 11 new pieces per circuit; fin wall as one instanced draw; one-offs replace anchors | admission.ts:37; instances.ts:64; `data.ts`, `scene.ts:129` | 11 Meshy | validate --release; walls <= 2 draws; <= 12 MB; <= 32 model nodes |
| HS-10 | assets | S | 7 drone liveries from DRONE_SPECS colours, clearcoat lacquer, emissive nozzles | admission.ts:38; material.ts:266,309; `scene.ts:152-159` | 7 retextures | hash same; crop hue within 20 deg of spec; <= 1.5 MB |
| HS-11 | post | M | Signature heat haze: one before-tonemap shaderPass with up to 8 projected sources; edge thermal ramp above 80% heat; static tint on reduced motion | effects.post.ts:180,215,221; `camera.ts:28`; NEW `src/heatHaze.ts` | - | pass in stages; qaHaze diff >= 1.5/255 inside exhaust, < 0.3 outside; edge red +15 at 90% heat; reduced-motion diff < 0.3 |
| HS-12 | post | M | Per-circuit post: warm bloom 0.55/0.8, grade per circuit, vignette 0.28, grain on MEGACITY, boost motion blur (High); LUT after E-C | effects.post.ts:27,99,136,148; effects.ts:150; v2Stages.ts:1218-1221 | - | nothing skipped; desktop mean 45-70, darkFrac <= 0.20, clip <= 0.02 on every circuit; card >= 40 (today 26.9) |
| HS-13 | vfx | M | Pack td-slag-burst, td-ember-hit, td-wall-scrape, td-coolant-burst, td-boost-flare, td-shock (camera:false); drone and missile trails | contracts/effects.ts:9,14,16,19; effects-api.ts:67; NEW `src/vfx.ts`; `main.ts:187-219` | - | bursts = beacon events on an autopilot lap; liveCount <= 96; action-frame centre >= 1.5% amber hot pixels |
| HS-15 | materials | S | Molten shader for lava and foundry channels; chevrons follow core heat by uniform | material.ts:59; runtime.ts:198; contracts/lighting.ts:26; NEW `src/shaders.ts` | - | no program compiles between 5 s and 60 s; chevron +25% at 90% heat; lava varies >= 10 over 6 frames |
| HS-16 | dressing | S | Per-sector dressing (tunnel, flooded underpass with splash, foundry, civic ruin); 1.5 s fog/key cross-fade (E-B) | water.ts:21; contracts/effects.ts:9,14; `track.ts:60` | - | adjacent sectors differ >= 12 in a channel; judge names 4 of 5 sector types |
| HS-17 | camera | S | fov 62, camera y 3.2 z 8.2; bank roll up to 6 deg; 3-shot countdown; results orbit; skipped on reduced motion | `main.ts:390`; contracts/camera.ts:44,48; motionReport.ts:105-115 | - | subject height 0.15-0.25; banks and shake-decays pass; title pose >= 4 m from chase |
| HS-18 | hud | S | Thermal instrument cluster; slag-red damage and orange overheat overlays; licensed fonts; card hides chrome | output.ts:17,20; themes.ts:39 (reference); `hud.ts`, `index.html`, `tests/browser/audit-fix/heatsink.spec.ts` | - | card HUD <= 30% (today ~45%); overlay applied; labels >= 12 px; font from aura-fonts.css |
| HS-19 | animation | C | Drone bob and boost pitch, rotating rings, holo flicker, ladle swing; off on reduced motion | runtime.ts:150,152,198; createFixedStepPresenter | - | view tests at 60/120/144 Hz; sim replay exact; reduced-motion bob 0 |
| HS-20 | perf | M | Instance everything repeated; shadowLod none on far/emissive; budget file before/after | instances.ts:69,75; types.ts:2509; rendererOptions.ts:28,38,53 | - | laps <= 520 (1280) and <= 420 (390); title <= 700; <= 1.2M tris; payload <= 18 MB |
| HS-21 | hud | M | Luma targets for DUSTFALL and VESPER; captures, final screens, card; sibling judge vs heatsink-port, roadster-rush, kart-havoc; look judge | game-luma-targets.ts:56; decode-luma.mjs; judge.ts:37-38; look judge.ts:153 | - | 3 circuit targets at 25/60 s; same_game false >= 0.8; every category >= 7; 0 warnings |

#### WP-14 (G04) teleoperator (Grid Dispatch): "Marine-layer dispatch feed"

- **Code:** `apps/showcase-teleoperator/src` (scene.ts, main.ts, rules.ts, sim.ts, hud.ts). Fixed scene camera; the world scrolls past it (`main.ts:555-640`).
- **Today:** 4 skies each remount with their own look (noon outdoor-day fog 0, golden, overcast, night-city; `scene.ts:107-128`), plus hemisphere, plain `shadow: true` directional, and a point fill that leaks objective teal into noon light. One shared post stack. Sky is an emissive box and sphere sun; 19 `primitives.` lines (trees, lamps, signals, passenger). Means noon 100.8, golden 86.7, fog 108.6, night 27.8; hero car crop p95 217; 411 draws.
- **Identity:** a remote operator's sensor feed over a cool bay-city avenue at dusk. A fog bank eats tower tops above 30-40 m while the street stays clear; sodium #ffb15a lamps and lit bay windows against slate-teal fog #5f7f8c; red #b3262b and brass #b59449 cable cars; teal #3fd6c6 only for the objective and the sensor overlay. Default sky becomes "Marine dusk"; night is relabelled "Sodium night". Signature: LiDAR scan pulse. Rain stays secondary (Lamplight Line owns rain and trams).
- **Engine deps:** E-B (moving lights), E-C (LUT, white balance, selective bloom, SSR, AgX), E-F (atlas sprites), E-G (sky/fog flags, typed stars), E-H (rail), E-I (crop metrics, two-shot diff).
- **Budget:** chase noon/dusk/fog <= 480 draws, night <= 560 (<= 650 only with the mirror); textureBytes <= 64 MB; route JS gzip +25 KB max.
- **Meshy (about 575 credits):** street lamp, 2 street trees, signal mast, bus shelter, hydrant, news box, catenary pole; pyramid tower, glass tower, red bridge tower and deck, 2 new building types; rigged passenger and 2 pedestrians; retextures for gridCruiser, 3 vehicles' rear lamps and the 4 gridBldg facades.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| GD-00 | lighting | M | Record-form flags: keep A3D_QR_GAME, add A3D_QR_VFX_SKY and A3D_QR_VFX_FOG | contracts/flags.ts:16,224; compiler/sky.ts:18; compiler/fog.ts:79; flags.state.ts:18-38; `main.ts:180` | - | all 4 skies within ±2 luma and same draws before the new nodes exist |
| GD-01 | lighting | M | Explicit rig per sky in place of looks.preset: own HDRI, shadowed key aligned with the visible sun (dusk 9 deg #ffb070 2.2; noon 62 deg 3.0; fog 0.8; night moon 0.25), hemisphere; remove the teal fill; shadow 2048/3 cascades/pcss | environments.ts:125; contracts/lighting.ts:11-12; lights.ts:24; `scene.ts:107-151` | belfast_sunset (dusk), outdoor-midday-2k (noon), autumn_field_puresky_2k at 0.6 (fog), cobblestone_street_night_2k (night) | cascadeCount 3 on all skies; dusk mean 75-100, p95 >= 210, clip <= 0.01; noon 95-120; dusk p5 at least 10 below golden today; lighting check passes without escape |
| GD-02 | lighting | M | Night street: lamp globes emissive 3.0; 6 sodium points on the nearest lamps (interim: additive light-pool quads); warm window emissive via materialOverrides; hemisphere ground #3a2a1c | lights.ts:62; instances.ts:24; runtime.ts:156; contracts/materials.ts:21-25; model.ts:85; quality.ts:80 | window material names from `assets inspect` | night mean 40-65 (today 27.8), p95 >= 180, darkFrac <= 0.35; road row >= 2x today; facade cells >= 35; <= 560 draws |
| GD-03 | lighting | M | Headlight spots (interim: static at rest x); tail and brake lamps via setMaterialOverrides on brake change only; expose brake flag from sim | lights.ts:75; contracts/materials.ts:31; lights.ts:15; `sim.ts` NEW brake flag | rear-lamp material names | headlight pool bottom-centre >= 1.6x sides; brake shot +6; inspectMaterials shows emissive lamp |
| GD-04 | env-sky | M | Real sky node per sky (dusk gradient #2b3a55 to #f2a65e, noon Preetham turbidity 3, fog grey gradient, night dark gradient); delete box sky and sun sphere | sky.ts:53-75; contracts/atmosphere.ts:14; GradientSky.ts, PreethamSky.ts | - | dusk top row >= 25 below middle; noon top 120-200, no 255 cell; draws not up; no box edge |
| GD-05 | env-sky | M | Signature marine layer: height fog per sky (dusk ref 28 m, fog ref 12 m with clear lane lines at 40 m, night thin) | contracts/atmosphere.ts:17,20; effects.ts:52-64; compiler/fog.ts:79 | - | fog: bottom row spans >= 20 while top row spans <= 8; fog mean 105-135; dusk towers fade (top cells within 12), street darker by >= 15 |
| GD-06 | env-sky | S | Dusk/fog god rays down the avenue (volumetricFog 0.08, #ffb878) | effects.ts:82-94; postBridge.ts:879-890 | - | sun-side top cell +4, bottom cells within 1; S4 in stagesRan; +2 draws max |
| GD-07 | materials | S | Wet sodium night: asphalt roughness 0.22, box probe; drizzle; mirror only within budget | probes.ts:45; effects.ts:165; surfaces.ts:49 | - | night p95 >= 190, clip <= 0.01; <= 560 draws (<= 650 with mirror) |
| GD-08 | post | M | Tone mapping and post per sky via app.setOutput after setScene (dusk agx with aces fallback; noon bloom threshold 0.95 removes the white-car halo; fog low bloom; night bloom 0.55) | output.ts:9-19; outputSurface.ts:193-206; effects.post.ts:27,67,99,136,148 | LUTs after E-C | noon car p95 <= 235, clip <= 0.005; 4 sky means differ >= 10 pairwise |
| GD-09 | post | M | Signature LiDAR pulse: depth-read teal ring every 2.4 s to 60 m, 2x on roof cam, off when motionOk() is false | effects.post.ts:180-236; NEW `src/scanPulse.ts`; `main.ts:176` | - | 0.6 s pair: bottom row differs >= 2, top <= 0.5; reduced motion matches; +1 draw |
| GD-10 | post | S | Contact shadows and explicit AO (the look's AO is gone) | effects.lighting.ts:22; contactShadowKey.ts:63; effects.post.ts:67 | - | passExecuted noon and dusk; no weak-key warning; noon p5 -6 |
| GD-11 | materials | M | Pearl clearcoat pod, dark glass, black sensor dome, fare-lit teal strip; muted clearcoat traffic; remove whole-model setMaterial | contracts/materials.ts:21-32; material.ts:266,324; `main.ts:316-317` | retexture if single-material | car crop p95-p5 >= 175, clip <= 0.01, mean 120-150 |
| GD-12 | assets | M | Meshy trees, lamps, signals, passenger, landmarks and 2 building variants; retexture pod and 4 facades | admission.ts:36-39; instances.ts:64-75; runtime.ts:156; groups.ts:39; `scene.ts:188-251` | see Meshy | 0 game-check errors; `primitives.` lines 19 -> <= 7; no instanced spheres for trees/lamps/signals |
| GD-13 | materials | M | Road as 14 m instanced PBR tiles recycled on the dash stride (asphalt x2, pavers, granite, paint) | instances.ts:22,52; types.ts:216-256; ambientcg.ts, poly-haven.ts; textureStats.ts | CC0 sets | gate passes; two 1 s noon shots differ >= 1.5 on the road cell; +4 draws max |
| GD-14 | vfx | M | Amber sparks + impact-flash (camera:false), teal ring at pickup/drop-off, night tyre splash, red tail trails; delete sphere sparks | contracts/effects.ts:14-20; effects-api.ts:39-49; `scene.ts:262`, `main.ts:187,198-208` | - | liveCount > 0 on collision; p95 +10; -1 +2 draws |
| GD-15 | vfx | S | Manhole steam, headlight-cone motes, beacon as lightCone | effects.ts:248,298; atlas.ts:8-10 (sampling E-F) | shipped atlas | emitters within tier budget; 2 fewer primitives; night <= 560 |
| GD-16 | animation | S | Rigged passenger (idle/wave/walk), 3 pedestrians, car pitch spring, 120 ms signal fade | contracts/animation.ts:34; actorAnimationHandle.ts; packages/game/src/motion/index.ts; animation-asset-validator.ts | 3 rigged humanoids | validate-animation passes; foot slide <= 0.05 m; clip order idle, wave, walk |
| GD-17 | camera | S | fovKick 0-6 deg, 1.5 deg lane roll, skippable 3-shot intro from static rigs, results DOF; off when motionOk() false | contracts/camera.ts:39-53,101; effects.ts:131 | - | presented fov >= 61 at max speed; skip within 2 frames; reduced motion fov 56, no intro |
| GD-18 | hud | S | Operator-console bezel (CAM label, clock, link bars, REC dot); bracket rival tags; teal objectives, amber warnings | `hud.ts`, `index.html`; themes.ts:65 colours only | - | overlap checks pass at 390/1280; tags <= 3% of viewport; contrast >= 4.5:1 |
| GD-19 | dressing | S | Parked cars, catenary wires, shelters, hydrants, SDF street signs matching the HUD `where` | instances.ts:25,64; text3d.ts:29; runtime.ts:156 | Meshy street furniture | side cells change >= 6 at noon; sign text equals HUD; within GD-20 |
| GD-20 | perf | M | Budget: instanced and LODed dressing, impostor shadows, cap 6 points + 2 spots | types.ts:2509-2550; instances.ts:75 | - | chase <= 480 (night <= 560); textureBytes <= 64 MB; JS +25 KB max |
| GD-21 | perf | M | Marine dusk becomes the boot sky; targets updated; capture all 4 skies; rubric panel; sibling judge vs 7 racers | game-luma-targets.ts:50,57; judge.ts:37-38,153; build-card-images.mjs | - | dusk 75-100, noon 95-120, fog 105-135, night 40-65; clip <= 0.01; every category >= 7; same_game false >= 0.8 vs all 7 racers; 0 warnings |

#### WP-15 (G05) iron-crown: "The Royal Forge"

- **Code:** `apps/showcase-iron-crown/src` (main.ts buildArena :236-325; game/stages.ts; game/fighters.ts; game/hud.ts).
- **Today:** one look per stage (arena-fight, night-city, golden-hour; three stages share autumn_field at sun 48/35), the same post and lights on all six stages; runtime VFX forced off (`main.ts:399`); attack layering opt-in and its `speed` dropped by the engine (`actorAnimationHandle.ts:490-513`); about 21 borrowed cross-game keys; primitive crowd. Means: Crown 56.5, Neo-Tokyo 30.7 (darkFrac 0.343, clip 0.273), Dock 115.4, Colosseum 131.3, Airstrip 122.3, Monastery 129.9. Draws 154-2,984 (tea house and towers).
- **Identity:** a theatrical tournament fighter in black iron, molten gold and ember crimson (#0e0b0d, #d9a441, #9e1b22, one accent per venue): one hard overhead follow-spot through smoke or dust, fighters rimmed in their own colour on a reflective floor, sparks and embers, letterboxed intro and K.O. cinematics. Venues: forge-smoke night, midnight rain helipad, dusk over water, harsh-noon dust, sunset heat haze, cold dawn snow. Signature: single-spot chiaroscuro plus letterbox cinematics.
- **Engine deps:** E-A (look rim/hdri), E-C (grade writer, LUT, selective bloom), E-D (rim), E-F (atlas sprites), E-G (sky), E-H (`playLayer({ speed })`, crowd kit, GLB cache), E-I (`--category fighting`, prop-exclusivity).
- **Budget:** <= 300 draws per stage on desktop, <= 220 on phone; <= 1.5M tris; <= 96 MB GPU textures; <= 2,000 particles; JS +5% of 1.00 MB max.
- **Meshy (about 58 generations + 30 animate):** 30 stage hero props, shrine/monastery/tower remeshes, 3 spectators baked to impostors, 5 clips x 6 fighters.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| IC47-L1 | lighting | M | Per-stage StageLight: PCSS follow-spot in Crown Arena plus 2 back rims in each fighter's emissive colour; outdoor suns Colosseum 72, Airstrip 10, Monastery 18, Dock 8 deg; remove the pink look rim (NEW look rim, or leave the look) | lights.ts:51,75; contracts/lighting.ts:12-14,21; contracts/looks.ts:12; `main.ts:276-323`, `stages.ts:35-49` | - | fighter crops >= 95 vs outer ring <= 35; foot crop 15% darker; follow-spot row filter pcss; outdoor p95-p5 >= 140 (today 91-119) |
| IC47-L2 | lighting | M | Neo-Tokyo: shadowed sodium flood, magenta/cyan rect panels, fill via env intensity | lights.ts:75,100; contracts/lighting.ts:33; contactShadowKey.ts | - | mean 45-65 (30.7), darkFrac <= 0.20, clip <= 0.06; no weak key; contact on/off feet diff >= 4 |
| IC47-L3 | lighting | S | Opt into A3D_QR_ANIMATION_SKINNED_SHADOWS; on/off capture | depthFeature.ts:24; contracts/flags.ts:223; `main.ts:385` | - | heavy-attack shadow extent differs >= 25% from idle; frames committed |
| IC47-E1 | env-sky | M | Own HDRI per stage: rooftop_night, venice_sunset, outdoor-midday-2k, industrial_sunset_puresky, spruit_sunrise, warm_bar at 0.25 (Crown, background off) | environments.ts:125; cli.ts:66; Rgb9e5Cube.ts; NEW look hdri (E-A); `stages.ts`, `aura.assets.json`, NEW `public/hdri/ATTRIBUTION.md` | 6 repo HDRIs | source differs on all 6; day means span >= 40 (115-131 today); top rows differ >= 18; <= 6 MB each |
| IC47-E2 | env-sky | M | Rain and wet rooftop on Neo-Tokyo; snow and frost on the Monastery; streakLimit halved on reduced motion | weather.ts:19,53; effects.ts:165,178 | - | Neo-Tokyo idle diff >= 2 in upper-middle cell; Monastery ground p95 +10; reduced streaks <= 50% |
| IC47-E3 | env-sky | S | Forge smoke shafts (Crown) and noon dust (Colosseum fog 1.0 ochre) | effects.ts:52,82; types.ts:976-978; `stages.ts:376` | - | shaft crop >= 8 over side crop; Colosseum top vs fight row >= 20 |
| IC47-E4 | env-sky | C | Preetham/gradient sky outdoors once VFX_SKY is on | sky.ts:35-76; compiler/sky.ts | - | no solid-void; top vs middle >= 12 |
| IC47-P1 | post | M | Post preset per stage (arena-fight, neon-night, cinematic-film x2, daylight-outdoor x2), one grade each, grain on Crown | output.ts:9-16; postPresets.ts:47,58,96,108; effects.post.ts:99,148 | - | stagesRan matches, no POST_DUPLICATE_STAGE; hue histogram L1 >= 0.35 between stages; Crown p95 >= 170 |
| IC47-P2 | post | S | Temperature and 4 LUTs (blocked on E-C) | effects.post.ts:99; DisplayLutCache.ts | 4 .cube LUTs | Colosseum R/B >= 1.15, Monastery <= 0.92; LUT hue shift >= 6 deg |
| IC47-P3 | post | S | DOF only in intro/K.O. shots; CA and vignette pulse on special/K.O. | effects.ts:131; effects.post.ts:159; output.ts:17-20 | - | K.O. background variance <= 40% of fighter; no DOF in neutral; no pulse on reduced motion |
| IC47-M1 | materials | M | Hero floors: obsidian with gold inlay + box probe + mirror at High; wet concrete; sand with grit normal; frosted slate | surfaces.ts:49; probes.ts:45; material.ts:68-190; textureStats.ts; `stages.ts:64-266` | 4 CC0 sets | reflection correlation r >= 0.3; floor p95 >= 120; texture gates pass |
| IC47-M2 | materials | S | Fresnel rim on fighter overrides (E-D); clearcoat on Gilded/Crimson | NEW rim (E-D); ModelMaterialOverrides.ts; `fighters.ts:452-462` | - | 3 px edge band >= 25 brighter than interior on all stages |
| IC47-A1 | assets | M | Iron Crown-only props replace every borrowed key; NEW prop-exclusivity check | cli.ts:111-147; admission.ts; NEW check (E-I); `stages.ts`, `stage-assets.ts` | ~30 Meshy props | 0 shared keys (today ~21); validate --release |
| IC47-A2 | assets | M | Replace showcaseTeaHouse and tower GLBs with single-material remeshes | meshy remesh; mergeStatic.ts:104 | shrine, hall, 2 towers | Dock <= 300 (2,810), Monastery <= 300 (2,984), Neo-Tokyo <= 350 |
| IC47-A3 | assets | S | Real idle, crouch, throw, victory, taunt clips per fighter | meshy animate; merge-clips; cli.ts:262; `fighters.ts:102-123` | 30 animate tasks | no stand-in clips; hash unchanged; 2 fighters <= 9 MB |
| IC47-V1 | vfx | M | Runtime VFX back on after an owner real-GPU run; pack ic-forge-spark, ic-guard-ember, ic-special-burst, ic-ko-shower | contracts/effects.ts:9,14,17,19,20; `tools/real-gpu/scenarios.json:18`; `main.ts:399` | - | liveCount 0 within 1.2 s of last hit; hit crop >= 300 amber hot px in 80 ms; block 180-210 deg hue |
| IC47-V2 | vfx | S | Embers, smoke in cones, lantern motes, dust, Airstrip shimmer pass, gold win confetti | effects.ts:198,248; effects.post.ts:180; NEW sprites (E-F) | - | idle bg cell diff >= 2; <= 2,000 particles |
| IC47-V3 | vfx | C | Follow-spot and sun flares; scorch decal on K.O. | lensFlare.ts; Decals.ts; contracts/effects.ts:17 | - | decal visible 10 s later; flare within 2 when light off-frame |
| IC47-AN1 | animation | M | Upper-body attack layering by default with engine-forwarded `speed` | contracts/animation.ts:35 NEW speed; actorAnimationHandle.ts:490-513; `main.ts:149,602,1462-1479` | - | feet move <= 0.03 m while hands >= 0.10 m; hit frame within 1 frame of hitbox |
| IC47-AN2 | animation | S | Banners and flags in wind, swinging lanterns, flickering signs, crowd bob and K.O. reaction, tail spring bones | instances.ts:63-86; public/index.ts:15; TypedGLBActorAnimation.ts | - | >= 3 bg cells diff >= 2; crowd stddev +10% within 0.5 s of K.O. |
| IC47-C1 | camera | M | Intro (venue dolly then fighter close-ups), K.O. orbit, win hero shot, all with bars; skippable; cuts on reduced motion | contracts/camera.ts:40,53,55; motionReport.ts | - | 3 intro + 1 K.O. shot with bars; report passes; intro <= 4.0 s |
| IC47-C2 | camera | S | Pair at 20-30% frame height, fov 40-45, lower lens; FOV kick on dash/special | contracts/camera.ts:52,62; `main.ts:427-454` | - | bbox share 22-30% at 1280, >= 18% at 390 |
| IC47-H1 | hud | S | Forged HUD: gold-bevelled iron bars with ember drain, molten SUPER meter, crown pips, slams synced to C1; real stage thumbnails | themes.ts:12; index.ts:239; cli.ts:308; `hud.ts`, `styles.css` | 6 thumbnails | HUD <= 14% (1280), <= 22% (390); fonts Whitney/DIN Pro/Monument only; ui_hud >= 7 |
| IC47-W1 | dressing | M | Far backdrop 10-60 m per venue (skyline, wall ring, ridge, hangars, river boats) | instances.ts:63-86; groups.ts:39; scatter.ts:177,214; prd10 | ridge, wall, 3 blocks | top-row stddev >= 8; <= 60 draws |
| IC47-W2 | dressing | S | Meshy crowd impostors, truss and dais replace Crown primitives | instances.ts:75; contracts/looks.ts:14; `stages.ts:434-593` | 3 spectators, truss, dais | primitives -80%; no primitive-subject; crowd <= 12 draws |
| IC47-PF1 | perf | M | Budget row; mergeStatic floor decks; instance paired props | mergeStatic.ts:104; instances.ts:63 | - | <= 300 desktop, <= 220 phone; <= 1.5M tris; JS within +5% |
| IC47-PF2 | perf | C | Engine GLB cache across setScene (E-H) | NEW `GlbResourceCache.ts` | - | 0 new GLB fetches on repeat; switch time <= 50% |

#### WP-16 (G06) pips-big-leap: "Felt-and-clay woodland diorama"

- **Code:** `apps/showcase-pips-big-leap/src` (game/world.ts buildWorld :306-333, game/worlds.ts, main.ts, framing.ts, aura-assets.ts).
- **Today:** per-world `looks.preset` with fog 0 plus own fog, contact shadows and a bloom that probably loses to the look's; academy, w2 and w3 share background #2a5c8a; two flat PBR slabs per platform; pink emissive thorn slabs; every world prop borrowed (hawk = heatsink drone, fan = reactor turbine); voxel NPCs; ambientFx spores/petals declared and never rendered; no VFX. Means academy 171.7 to w6 109.1; w3 has nothing darker than 156; interiors as bright as daylight; draws 460-784; W1 26 GLBs, 6.24 MB.
- **Identity:** a hand-made miniature: felt-and-clay woodland dioramas through a macro lens, Pip acorn-sized. Moss #4f7a3a, toadstool red #c8432f, birch cream #efe3c8; sun-seed gold #ffc23d only for pickups and the gate. Each world a closed diorama with its own hour: garden mid-morning, canopy dawn shafts, millpond golden hour, dandelion-fluff dawn, lava-lit basalt cellar, amber hollow-tree palace, firefly night garden. Signature: shallow-focus miniature DOF. Never an open sky or wide vista (Cumulus Dash, Serpentine, Bellkeeper's Walk own those).
- **Engine deps:** E-B (height fog without vfx.sky), E-C (grade writer, LUT, selective bloom, tilt-shift DOF and runtime focus, god-ray density field, AgX), E-D (rim), E-F (atlas sprites), E-G (sky), E-I (chroma stats, light count), E-J (storybook HUD theme).
- **Budget:** <= 420 draws desktop in every world (high-tier drawBudget 600, quality.ts:84), <= 300 phone; <= 600 ambient particles; <= 6 point/spot lights, <= 2 shadowed; <= 9 MB GLB per world; tiles <= 8k tris; flora <= 1.5k tris.
- **Meshy (about 1,300 credits):** 10 platform tiles, 15 woodland props, 2 rigged villagers, 4 Pip clips + leaf cape, 6 diorama bases, 6 landmarks, 5 flora instances, 4 retextures.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| PBL-L1 | lighting | M | Authored per-world `rig` on WorldSpec: own HDRI, one PCSS 3-cascade key per world (academy 42/120, w1 18/80, w2 10/250, w3 24/150, w4 0.15 key, w5 0.25 key, w6 moon 30/300), hemisphere, cool rim; 7 distinct backgrounds; drop looks.preset after post/fog land | environments.ts:125; lights.ts:24,51; contracts/lighting.ts:11-12,19-20; `world.ts:306-333`, `worlds.ts`, `types.ts:126-128`, NEW `public/hdri/` | spruit_sunrise, belfast_sunset, hangar_interior (0.2), warm_bar (0.45), rooftop_night (0.3) | academy 140-160, w1 115-140, w2 125-150, w3 150-175 with p5 <= 70, w4 60-90 with p95 >= 235, w5 85-115, w6 55-80; thumb sd >= 45; 7 backgrounds; cascadeCount 3; no lighting finding |
| PBL-L2 | lighting | S | Practicals: 4 flickering lava points (w4), lantern points + shadowed throne spot (w5), cyan crystal points (w6), w2 lens flare | lights.ts:15,62,75; lensFlare.ts:51; quality.ts:77-80 | - | w4 grid[7] >= 25 over top corners; w5 throne cell >= 1.3x lanterns off; <= 6 lights, <= 2 shadowed |
| PBL-E1 | env-sky | M | Diorama base 3-6 m below every course plus height fog (flags `vfx.fog`, `vfx.sky`; setFog after each setScene) | contracts/flags.ts:88-103,142; compiler/fog.ts:79; atmosphere-api.ts:26; prd07.ts:46-50; contracts/atmosphere.ts:17,20; `main.ts:201,265-290` | 6 Meshy bases | bottom band sd >= 20 and >= 25 from background; no solid-void; height-mode fog in diagnostics; +6 draws max |
| PBL-E2 | env-sky | S | Real sky in w2 (Preetham), w3 (peach-lilac gradient), w6 (gradient + stars), captureEnvironment false | sky.ts:46-47,52-76; compiler/sky.ts:18 | - | w6 top band 25-50 with >= 20 bright cells; w3 row 0 minus row 5 >= 15; HDRI still the env source |
| PBL-E3 | vfx | M | Make ambientFx real: one seeded box emitter per world (petals, spores, motes, fluff, embers, dust, fireflies) | effects.ts:248; contracts/effects.ts:122-150; prd07.ts:58-63; `world.ts:330-333`, `types.ts:142` | - | exactly one emitter per world, live > 0 at 35 s, <= 600; top row diff >= 1/255 over 0.5 s; mean within 4 |
| PBL-E4 | env-sky | C | w2 millpond as horizontal mirror under tinted glass with foam ring; colliders unchanged | surfaces.ts:49; material.ts:118; `world.ts:399-412` | - | water crop sd >= 18; +1 pass +3 draws max; swim tests unchanged |
| PBL-P1 | post | M | `setOutput({ preset })` per world (daylight-outdoor x4, arena-fight, cinematic-film, space) after each setScene; per-world contrast/saturation; vignette; drop authored bloom | output.ts:11,15,19; postPresets.ts:47,72,96,108; postBridge.ts:747-760; effects.post.ts:99,136; precedent `apps/showcase-bank-shot/src/v2/boot.ts:345` | - | S2-gtao, S9-bloom, S10b in stagesRan everywhere; no duplicate stage; L1 bands hold |
| PBL-P2 | post | M | Signature miniature DOF: focus on Pip (~4.6 m desktop, 5.7 m portrait), fStop 2.0, 50 mm, maxBlur 4; tilt-shift and focus follow after E-C | effects.ts:131; postBridge.ts:891-904; PostQualityTiers.ts:106-111; `framing.ts:13-14` | - | S6-dof at High; Pip crop keeps >= 0.85 variance, corners drop to <= 0.6; camera and post >= 7 |
| PBL-P3 | post | C | Sun shafts in w1, w2, w5 (needs PBL-E1 fog flag so density is not read as scene fog) | effects.ts:82; postBridge.ts:808-812,879-890; compiler/fog.ts:81-88; NEW godRayDensity (E-C) | - | S4 in those worlds only; sun cell +8; mean +10 max; clip < 0.03; receipt `effects-god-rays` |
| PBL-M1 | materials | M | Interim surfaces: roundedBox slabs; felt, matte clay, clearcoat red, brushed metal, gold; darker mushroom #b8a58a; identity palette | primitives.ts:133; material.ts:103,204,242,266,295,356; `world.ts:29-46,344-374` | - | no face crop > 230; no flat-palette or primitive-subject; material_quality >= 7 |
| PBL-M2 | materials | S | Plum bramble hazard, crusted scrolling lava shader, iridescent crystals, gold seeds | material.ts:59; customMaterial.ts; types.ts:184,194; overrideMaterial.ts | bramble | lava p95 >= 240, clip < 0.03; seed +30 over platform; hazard hue outside 290-330 |
| PBL-A1 | assets | M | Meshy platform tile kit fitted to existing colliders; static tiles instanced | cli.ts:147,181; admission.ts:37; optimizeVerb.ts; instances.ts:30-42 | 10 tiles | <= 8k tris, <= 2 textures each; validate --release; collision tests unchanged; 0 box platforms; <= 420 draws |
| PBL-A2 | assets | M | Replace every borrowed prop with woodland props (sparrow, pinwheel, ember pot, root column, firefly jar, twig arch, berry heart, paper star, acorn padlock, bounce mushroom, stump, flower and toadstool clusters, puffball) | cli.ts:147; `aura-assets.ts:19-48`, `aura-assets.shared.ts`, `world.ts:139-267,377-397` | woodland set | rg for borrowed prefixes returns 0; likeness, shared-catalog, asset-provenance 0 errors; modeling >= 7 |
| PBL-A3 | assets | S | Rigged hedgehog villager and beetle headmaster (idle/wave/cheer) replace voxel NPCs | cli-help.ts:45; admission.ts:39; cli.ts:262-271; `world.ts:495-507` | 2 rigged NPCs | validate-animation --require-rig; >= 2 clips per villager in 10 s |
| PBL-A4 | animation | S | Hurt, land, glide, fall clips; leaf cape on a spine socket | cli-help.ts:45; contracts/animation.ts:39-40; prd06/index.ts; `aura-assets.ts:57-68` | 4 clips, cape | PIP_CLIPS hurt/fall/land distinct; validate --map passes; cape within 0.03 m of socket |
| PBL-A5 | dressing | S | One landmark per world (hollow oak, mill wheel, dandelion spire, basalt chimney with lavafall, throne-tree wall, crystal moon tree) | admission.ts:38; NEW decor kind `landmark` | 6 landmarks | landmark >= 8% of spawn frame; judge: different places >= 70% |
| PBL-A6 | assets | C | Retexture conifer, boulder, crate, barrel to felt and clay | geometry-hash.mjs; `aura-assets.ts:32-39` | 4 retextures | hash and bounds same; no dark face next to a lit face |
| PBL-V1 | vfx | M | Pack pip-land-dust, pip-jump-puff, pip-seed-sparkle, pip-acorn-ring, pip-checkpoint-leaf, pip-thorn-hit, pip-gate-open | contracts/effects.ts:13-24; effects-api.ts:38-53; NEW `src/game/vfx.ts`; `main.ts:402-540` | - | 30 s autoplay >= 10 land dusts, one sparkle per seed; liveCount <= 40; feet crop sd +8 vs vfx=off |
| PBL-V2 | vfx | S | Leaf-green glide trail, white dive trail, pulsing gate ring | contracts/effects.ts:16 | - | glide crop sd +6; trail stopped within 0.5 s of landing |
| PBL-V3 | vfx | C | w4 heat-shimmer pass; w6 aurora ribbon | effects.post.ts:180,205; effects.ts:316 | - | pass in w4 only; mean shift <= 3 |
| PBL-AN1 | animation | M | Squash 0.18 on land, stretch on jump; pinwheels, mill wheel, banners, bobbing leaf pads (visual only); GPU wind on flora | Juice.ts:103,215; instances.ts:42; public/index.ts:15 | - | scale.y < 0.9 on land, > 1.05 at takeoff; foliage diff >= 1.5/255; animation >= 7; collisions unchanged |
| PBL-C1 | camera | S | 3.5 s rail fly-over on world load; 1.2 s gate cut on unlock; per-frame setPose skipped while a sequence plays | contracts/camera.ts:37-42,52,64,67 | - | rail rig for 3.5 s then game pose; skip within 1 frame; no inside-geometry frames |
| PBL-C2 | camera | S | Miniature framing: camY +1.7, fov 46; glide/dive fovKick; pound shake | contracts/camera.ts:37-39,52; `main.ts:880-901`, `framing.ts:13-14` | - | Pip 18-25% of frame height; fovKick energy on glide; portrait hFOV >= 34 deg |
| PBL-H1 | hud | S | Storybook HUD from the `tabletop` theme base (later E-J storybook), parchment chips, game-art icons, licensed display face | themes.ts:13,91-100; index.mjs:351-357; `styles.css`, `hud.ts`, `main.ts:154` | 3 icons | HUD <= 12% at 390x844; fonts check 0; ui_hud >= 7 |
| PBL-W1 | dressing | M | 150-400 seeded instanced clover, grass, ferns, pebbles, leaves per world; <= 24 moss decals | scatter.ts:89,177,214,267; instances.ts:30-42; Decals.ts:46,492-493 | 5 flora | <= 14 draws; same seed gives same transforms; environment >= 7, no floating/void notes |
| PBL-PF1 | perf | M | Instance tiles, decor and dressing; mergeStatic; no shadows on tiny decor; budget row per world | instances.ts:5,30; public/index.ts:25; quality.ts:84 | - | <= 420 draws in every world (today 460-784); <= 9 MB GLB; triangles recorded |

#### WP-17 (G07) aura-hoops-3d: "Blacktop World Tour"

- **Code:** `apps/showcase-aura-hoops-3d/src/main.ts` (3,793 lines; VENUES :226-263, buildScene :818-847).
- **Today:** 6 courts on 3 HDRIs with one outdoor sun and fog off; flat planes and line boxes for the court; 14 emissive trail spheres; 3 empty stadium-seat copies; neon point fills; system font stacks in `index.html:36-38`. Means 54.3 (Shanghai, darkFrac 0.219) to 122.2; p95 147-180 everywhere, clip 0; AO moves the feet crop 2-3.4%; draws 278-347.
- **Identity:** summer-league streetball shot like a late-night mixtape broadcast: asphalt and acrylic, chain-link fences, sodium floods, spray paint, rain, low long-lens sideline camera. Charcoal #23262b, sodium #ffb347, chain-link steel #8a9199, one squad accent. Courts: Rucker blue hour under floods, Venice sun behind the backboard, Athens hard white noon, Manila tungsten under a corrugated roof with rain outside, Shanghai wet neon night in rain, Orbit starlit deck lit by Earth-shine. Signature: spray-tag decal after a Jam dunk. The only sports game with rain; no HDRI shared with another sports app.
- **Engine deps:** E-C (runtime post enable, grade, LUT, selective bloom), E-D (rim), E-F (atlas sprites), E-G (water, sky), E-H (crowd kit, skinned shadows), E-I (RGB in GL_META, triangle count, sports certify, prism judge).
- **Budget:** <= 320 draws on every court at desktop High (aim ~300), <= 240 Medium; <= 1.2M tris; <= 160 MB GPU textures (one 2k HDRI per court).
- **Meshy:** 4 spectators x 3 frozen poses; ~26 court props (fences, walkups, murals, boombox, lifeguard tower, parapets, corrugated roof, bulb strings, neon boxes, umbrellas, station ribs, maglev stanchion); rigged net; retextures of floodlight, hoop rig and ball.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| H47-L1 | lighting | M | Route-owned rig per court in NEW `courtRigs.ts`: HDRI + PCSS 3-cascade key + explicit AO (Rucker belfast 7/250; Venice venice_sunset 5/185 behind hoop; Athens outdoor-midday 64/150; Manila indoor-workshop; Shanghai rooftop_night; Orbit starfield 2k) | environments.ts:56,125; lights.ts:51; contracts/lighting.ts:12-13; effects.post.ts:67; `main.ts:226-263,818-829` | 6 HDRIs | 6 distinct HDRI keys; p95 >= 215 on 5 courts; clip <= 0.03; per-court mean bands; AO feet -4%; 0 lighting warnings |
| H47-L2 | lighting | M | Real floods: 4 sodium spots at Rucker (2 shadowed), 12 tungsten bulbs at Manila, lamp heads emissive >= 6 | lights.ts:62,75; quality.ts:79-80; material.ts:95; contracts/lighting.ts:23 | flood head, bulb string | >= 3 sampled shadow rows on Rucker; lamp crop p95 >= 245 with clip <= 0.03; feet p5 -8% |
| H47-L3 | lighting | S | Rect area lights for Shanghai signs and Orbit ribs replace neon point fills | lights.ts:100,118; LtcLuts.ts; `main.ts:744-773` | - | Shanghai darkFrac <= 0.10, mean 45-65; left/right columns differ >= 12 |
| H47-L4 | lighting | S | Lens flare on Venice sun and camera-facing Rucker floods | lensFlare.ts:111,225 | - | Venice intro top row +30; visibility 0 with sun behind camera |
| H47-E1 | env-sky | M | Remove the void: per-court fog to the HDRI horizon, HDRI backgrounds, skyline 60-120 m, court backdrops (brick walkups behind a 4 m fence, whitewashed hillside, boardwalk and ocean, corrugated walls, riverside towers, station viewport) | effects.ts:52,95; groups.ts:39; public/index.ts:25; lookLint.ts:172-180 | backdrop sets | no solid-void; top third p95-p5 >= 60; far crop spread 15% below near |
| H47-E2 | env-sky | M | Shanghai always in light rain with wet ground and a court reflection probe; Manila rain outside the canopy; Shanghai lightning every ~40 s | weather.ts:19,36,53,98; probes.ts:45 | - | Shanghai precipitation (<= 160 streaks) and wetGround nodes; no Manila rain inside canopy; Shanghai floor p95 >= 200 |
| H47-E3 | env-sky | S | Real water for Venice surf and Shanghai river (needs E-G water) | water.ts; flags.state.ts:39 | - | ocean crop moves >= 2 over 10 s; p95 >= 230 glint |
| H47-E4 | env-sky | C | Preetham sky on Athens and Venice (E-G sky flag) | sky.ts:53-56; compiler/sky.ts:18 | - | top-left vs top-middle >= 10 or sky band spread >= 40 |
| H47-P1 | post | M | One output preset and grade per court (cinematic-film, daylight-outdoor, neon-night, space); bloom 0.85 day / 0.6 night | output.ts:15; postPresets.ts:39-108; effects.post.ts:27,99,148,159; postBridge.ts:234,359; `main.ts:3569-3571` | - | bloom and grade in stagesRan, grain on Rucker/Manila; means in L1 bands; R/B gates after E-I RGB |
| H47-P2 | post | S | DOF and motion blur only in intro/replay (rebuild post until E-C enable toggles) | effects.ts:131,150; NEW setEffectEnabled (E-C); NEW `src/broadcast.ts` | - | DOF stage only during replay; replay background spread -20% |
| H47-M1 | materials | M | One textured court per venue with lines and wear painted in (cracked asphalt, bleached teal acrylic, blue-white acrylic, painted concrete, wet asphalt 0.12 with puddle mask, polished composite); delete line boxes, ticks, scuff decals | material.ts:68; types.ts:216-222; asset-index index.ts:96,118; textureStats.ts; `main.ts:528-566,795-798` | 6 PBR sets + 6 line overlays | gates pass; draws -14 per court; floor spread >= 60 |
| H47-M2 | materials | M | Rubber ball with pebble normal; powder-coat rim; clear-glass backboard; alpha chain-link; galvanised poles; remove pole camo noise | material.ts:103,112,204,224,358; `main.ts:574-618,738,779` | pebble normal, chain-link alpha, retextures | Athens ball p95 >= 220; retexture bounds and hash same; pole spread -30% |
| H47-M3 | materials | S | Kits as fabric with sheen 0.6; number atlas offsets | material.ts:184; types.ts:191-193; `tools/hoops-athlete-retexture/split-kit-materials.mjs` | number atlas | draws unchanged; 10 distinct offsets; torso spread >= 70 |
| H47-A1 | assets | M | Fitting seating plus 140-220 instanced spectators per court; far rows impostor | instances.ts:59-78; scatter.ts:177,214; prd10/index.ts:116; NEW `src/crowd.ts` | 4 spectators x 3 poses, bleacher, chairs, gantry | crowd <= 10 draws; fit-grounding 0; >= 140 transforms |
| H47-A2 | assets | M | Per-court Meshy dressing and a rigged nylon net | cli.ts:111-147; admission.ts:35-40; `aura-assets.route.ts` | ~26 props, net | validate --release --require-license; provenance, deployable, brand checks 0 |
| H47-V1 | vfx | M | Pack net-flick, blacktop-dust, spray-burst, rain-splash, sweat-fleck; one ribbon trail (fire at full Jam) replaces 14 spheres | contracts/effects.ts:10,15,16,19; effects-api.ts:36,290; atlas.ts:8-15; NEW `src/fxPack.ts` | - | 5 kinds registered, each juice event maps to one; draws -12; caps hold with reducedFlash |
| H47-V2 | vfx | S | Flood cones and haze (Rucker, Manila); Manila roof-gap god rays and motes | effects.ts:82,248,298 | - | god-ray stage on Manila; beam +15 over air; +12 draws max |
| H47-V3 | vfx | S | Signature spray-tag decal under the rim after a Jam dunk, fading 20 s; NEW `art/direction.ts` | contracts/effects.ts:17; Decals.ts:46; define.ts:113,222; audit.ts:35 | 8 tag textures | audit passes; <= 8 live tags over 20 jams |
| H47-AN1 | animation | S | Spring-bone net swings on swish; backboard shake; head look-at the ball; celebration crossfades; additive breathing | contracts/animation.ts:34,35,41,42; SpringBones.ts | net rig, clips | net tip moves >= 0.12 m in 200 ms; head yaw error <= 25 deg on 80% of frames |
| H47-C1 | camera | M | Broadcast language: 6 s rail fly-in per court with bars; 2.4 s Jam-dunk replay at 0.4x with DOF; FOV kick on makes; long-lens live cam fov 30-34, 2 m lower | contracts/camera.ts:40,52,53; rail.ts; GameFeel.ts:98; `main.ts:2961-3067` | - | replay only after Jam dunk; skip within 1 frame; reduced motion skips; intro eyes >= 8 m apart; pole avoidance green |
| H47-H1 | hud | S | Spray-stencil score bug, spray-can Jam meter, Obviously Condensed numbers, no system fonts; SDF diegetic scoreboard and painted court name | index.ts:239; text3d.ts:29; `index.html:36-38` | woff2, 8 icons | grep for system stacks returns 0; fonts check 0; in-world score equals DOM score |
| H47-W1 | dressing | M | >= 12 prop types per court within 25 m by seeded scatter; mergeStatic; far skyline in distanceLod | scatter.ts:89,177,214; public/index.ts:25; groups.ts:39; NEW `src/dressing.ts` | - | >= 12 keys per court, <= 2 shared between courts; <= 25 draws |
| H47-PF1 | perf | M | Instance discs, rings, auras, cones; remove trail spheres and court nodes | instances.ts:21-27; rendererOptions.ts:83; `main.ts:616-647,802-816` | - | <= 320 draws on every court; bundle delta reported; tests pass |
| H47-PF2 | perf | S | Proof run for six courts plus intro and replay; rubric per court; sibling judge vs FC, Diamond, Links | `tests/browser/audit-fix/aura-hoops-3d.spec.ts`; judge.ts:156; evidence judge.ts:15 | - | every category >= 7; distinguishable vs each at 70%, same-game <= 25%; 0 warnings |

#### WP-18 (G08) aura-diamond-3d: "Six postcards of summer baseball"

- **Code:** `apps/showcase-aura-diamond-3d/src` (main.ts buildParkScene :798-834, rules.ts :72-77).
- **Today:** six looks with fog 0 everywhere; flat hex backgrounds, three copied from Hoops; no bloom, grade, DOF or setOutput; post flag off so `stagesRan` is not reported; flat PBR grass with 9 mow planes; rock GLB as pines; 18 identical wavers. Means 67.3-121.6, p95 never above 167; Skyline darkFrac 8.1%, Lunar 14.9%; draws 337-528.
- **Identity:** warm broadcast-TV film stock, real mown turf, terracotta clay, a visible horizon, one hour and one HDRI per park: Harbor Sandlot at last light over water (belfast_sunset), Midtown Skyline in rain-wet blue hour under sodium and LED towers, Canyon Rim at hard desert noon, Ivy Classic at spring sunrise, Typhoon Dome in a storm with god rays, Lunar Park in a black sky with Earth rising. Signature: bat-crack splinter flash. Lunar avoids Hoops orbit and FC glacier (no blue fog, grey regolith, visible Earth); no venice_sunset or Hoops hex.
- **Engine deps:** E-A (key/hdri/fog overrides, catalogue), E-C (LUT, AgX, selective bloom), E-D (rim), E-F (atlas sprites), E-G (sky/fog opt-in, typed stars, water), E-H (crowd kit, skinned shadows), E-I (GL_META RGB and stddev, look-identity).
- **Budget:** <= 450 draws at 1280x720 and <= 260 at 390x844 in every park (sandlot 528 and canyon 505 are over today); <= 1.2M tris; steady heap <= 300 MB; route transfer +12 MB max, each park loads only its HDRI; effects <= 96.
- **Meshy:** 4 static fans (+ impostors); Harbor pines, lighthouse, boat, boardwalk stand; Canyon hoodoo, mesa, mesquite; Skyline water tower, HVAC, sign frame; Ivy brick facade, manual scoreboard, rowhouse roof; Dome truss and LED board; Lunar habitat, boulders, antenna; ball; 2 kit retextures.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| DIA-L1 | lighting | M | Per-park sun through the existing override (Harbor 9/250, Canyon 72/20, Ivy 24/110, Lunar 18/300); key colour/intensity after E-A; PCSS cascades | contracts/looks.ts:12; looks.ts:252; contracts/lighting.ts:12-13; lights.ts:51; `main.ts:801-808,821`, `rules.ts:72-77` | - | p95 >= 200 in Harbor/Canyon/Ivy (153-165 today), clip < 2%; Canyon p5 <= 25; Lunar darkFrac 20-40% with p95 >= 200; lookManifest key colours all differ |
| DIA-L2 | lighting | M | Night stadiums: 6 tower spot banks in Skyline (2 shadowed), 4 rect truss panels in the Dome, 4 cold spots on Lunar; lens flare on 2 towers; per-park cone colours | lights.ts:15,75,100; lensFlare.ts; contracts/lighting.ts:10; effects.ts:298; `main.ts:545-558` | - | Skyline darkFrac < 3%, p95 >= 190; Dome p50 >= 85; infield cell >= 1.6x outfield wall; +20 draws max |
| DIA-E1 | env-sky | M | Own HDRI per park (belfast_sunset, rooftop_night, outdoor-midday-2k, spruit_sunrise, hangar_interior, starfield 2k at 0.15); 1k IBL + 2k background; lazy per park; remove the three Hoops hexes | environments.ts:125; NEW look hdri (E-A); cli-help.ts:8; `main.ts:811-825`, NEW `public/hdri/ATTRIBUTION.md` | 6 HDRIs | rg finds none of the 3 hexes; top-row means differ >= 15 in all 15 pairs; licence rows; +6 MB max, one HDRI fetched per park |
| DIA-E2 | env-sky | S | Analytic sky where better: Harbor Preetham low sun, Canyon bleached gradient, Lunar stars with no atmosphere | sky.ts:53-109; compiler/sky.ts:18; NEW sky opt-in and typed stars (E-G) | - | Harbor/Canyon top row >= 20 over middle, Canyon top >= 140; Lunar top <= 12; vision sees stars and sunset |
| DIA-E3 | env-sky | M | Atmosphere per park: sea haze, dust + height fog, wet blue haze, light mist, Dome volumetric god rays, Lunar none | effects.ts:52,82; postBridge.ts; compiler/fog.ts; NEW look fog (E-A) | - | middle row 40-170 everywhere; bottom-middle gap shrinks 15-35% in day parks; Dome S4 ran with post flag on |
| DIA-E4 | env-sky | S | Skyline drizzle and wet warning track; Dome rain only outside the glass | weather.ts:19,53; effects.ts:165; `main.ts:564-665` | - | rain and reflections seen; Skyline p95 +15; fps -10% max; +6 draws max |
| DIA-P1 | post | M | Broadcast film grade: setOutput preset per park (cinematic-film, neon-night, arena-fight, daylight-outdoor, space), agx on Harbor/Ivy, grain 0.03, bloom 0.85 day / 0.65 night; `post` quality flag on; LUTs after E-C | output.ts:9-19; postPresets.ts:47-109,201-206; effects.post.ts:27,99,148; v2Stages.ts:1221,1253; `main.ts:826-829,849,1647` | 6 .cube LUTs | bloom and grain in stagesRan; night p95 +25, clip < 2%; R/B Harbor >= 1.15, Skyline/Lunar <= 0.9, Dome 0.95-1.05 (after E-I) |
| DIA-P2 | post | C | DOF in walk-up and home-run shots, motion blur on the HR track only | effects.ts:131,150; effects.post.ts:205-236; `main.ts:3558,4145` | - | DOF stage in walk-up state, not in batting |
| DIA-M1 | materials | M | Grass PBR at 2 m with one stripe-mask custom plane (drop 9 mow planes); clay PBR with normal; chalk emissive 0.05; darker warning track | cli.ts:351-354; cli-help.ts:8; types.ts:172+; material.ts; textureStats.ts; `main.ts:366-430` | turf, clay | no `mow-` planes, -9 draws; gates pass; bottom-row stddev >= 6 |
| DIA-M2 | materials | S | Brick and green scoreboard (Ivy), real rock texture (Canyon), box probe over a glossy Dome infield, regolith (Lunar), wet rubber (Skyline); rim after E-D | probes.ts:45; `main.ts:366-460,564-665`; NEW rim (E-D) | brick set | Dome reflections seen; Canyon middle cells differ >= 12; probe +2 draws |
| DIA-A1 | assets | M | Meshy set pieces replace rock-as-pine and primitives (rafters, banners, regolith cylinders); repeated props instanced | cli.ts:111; admission.ts; optimize.ts; instances.ts:63; `main.ts:564-665` | park sets | `primitives.` 29 -> <= 15; game-checks 0 errors; modeling >= 7 |
| DIA-A2 | assets | M | About 600 instanced fans with section colours and impostor far rows; keep 18 skinned wavers close up | instances.ts:59-90; prd10/index.ts:116; `rules.ts:119-160`, `main.ts:476-535` | 4 fans | crowd <= 12 draws, <= +400k tris; stands read as full; middle-row stddev >= 18 |
| DIA-A3 | assets | S | Stitched baseball (< 1k tris) replaces the sphere; home/road kit retextures | meshy retexture; geometry-hash.mjs; `main.ts:736-766` | ball, 2 retextures | hash same; ball < 1,000 tris; teams told apart |
| DIA-V1 | vfx | M | Pack: bat-crack splinters + flash, clay puffs, chalk puffs, HR fireworks, canyon dust, dome confetti, lunar regolith arcs; JUICE_EVENTS mapped | contracts/effects.ts:14-19; effects-api.ts:67; effects.ts:248; NEW sprites (E-F); `main.ts:785-787,1090-1128` | - | >= 6 registerPreset calls; <= 96 instances; vision sees splinters and dust, not discs |
| DIA-V2 | vfx | S | Live linescore canvas board with HOME RUN animation; SDF park name on the wall | texture.ts:466; text3d.ts:29; `main.ts:539-543` | - | vision reads linescore and name; board cell +15 for 2 s after HR; <= 4 updates/s |
| DIA-N1 | animation | S | Staggered cheers, flag wind, boat bob, Earth rotation, additive breathing on the batter | contracts/animation.ts:13,34-35; instances.ts:63-90; `batter-pose.ts` | - | motion-gate test passes; layer weight non-zero; cheer within 0.5 s of HR |
| DIA-C1 | camera | M | Park intro rail, batter walk-up, HR sequence with bars, half-inning wide; live play keeps batting/pitching cams | contracts/camera.ts:40,53; rail.ts; publishedUnion.ts:230; `main.ts:3558` | - | >= 4 sequences per QA match; no inside-geometry frames; HR sequence <= 4.5 s, skippable |
| DIA-H1 | hud | S | Broadcast bug (linescore, count pill, pitch speed, lower third) on HudKit with DIN Pro/Whitney (not Barlow) | HudKit.ts:197; themes.ts:19,40,52; `index.html`, `main.ts:3624` | - | text >= 12 px off the batter at 390x844; accent differs per park; no Barlow in CSS |
| DIA-W1 | dressing | S | Horizon per park: Harbor mirror water and boats, Skyline window grids, Canyon mesas in fog, Ivy rooftops, Lunar crater rim + Earth; foul-line and box decals | surfaces.ts; Decals.ts:493; scatter.ts:214; mergeStatic.ts:104; NEW world.water export (E-G) | - | Harbor p95 >= 200; <= 40 draws per park; distinct skyline per park |
| DIA-W2 | perf | M | Merge static dressing, one mow draw, instancing, LOD and impostors, <= 2 shadowed spots; before/after in route-health.json | mergeStatic.ts:104-112; groups.ts:39; instances.ts:63-90; contracts/lighting.ts:10 | - | <= 450 (1280) and <= 260 (390) in every park; <= 1.2M tris; heap <= 300 MB |
| DIA-X1 | post | M | Art direction (accent per park, signature 'bat-crack splinter flash', reserved #f5f1e4 ball); sibling judge vs Hoops, FC, Links, Top Tennis | define.ts:107,113,146; audit.ts:35; judge.ts:37 | - | audit 0 errors; same_game false in 4 of 4; >= 14 of 15 park pairs read as different venues; every category >= 7 on Harbor, Skyline, Lunar |

#### WP-19 (G09) aura-fc-3d: "Floodlight football in weather"

- **Code:** `apps/showcase-aura-fc-3d/src` (main.ts, game/scene.ts VENUE_LOOKS :34-41, buildFcScene :443-460, rig.ts).
- **Today:** 4 venues on `interior-industrial`, whose studio HDRI paints as the sky because the look emits it with background on (`looks.ts:291-298`, `environments.ts:138`) and has no fog, so `fog: 0.5` does nothing; 4 unshadowed spots and 4 fake cones; runtime VFX off (`main.ts:97`); flat pitch, box stands, capsule crowd; borrowed diamond/hoops keys; 34 primitive calls. Uyuni mean 231.74 (white-out, grid 224.6-235.8); Glacier 95.3 with a 134-151 top row; darkFrac and clip 0 everywhere; draws 249-401.
- **Identity:** European broadcast night football: rain slanting through steel floodlight banks into haze, wet turf throwing back specular streaks, a TV match package. Munich storm navy and cold-white floods with lime accent; Favela sodium and dust; Lagos low copper sun over the sea; Kyoto lantern red and magenta in drizzle; Uyuni pale dawn on a mirror flat; Glacier polar night under a live aurora with snow. Signature: rain through floodlight shafts on wet turf. The only sports game combining night, weather, shafts and wet reflections.
- **Engine deps:** E-A (background fix, hdri override), E-B (multi-caster shadows), E-C (runtime post, grade, LUT), E-F (floating-dot fix), E-G (sky/wetness), E-H (crowd kit), E-I (crop metrics, prism judge, distinctness).
- **Budget:** <= 360 draws on Favela, Munich, Lagos, Kyoto, Glacier; <= 480 on Uyuni with the mirror (fall back to a probe); crowd <= 16 draws; route JS +40 KB max; `evidence/aura-fc-3d/budget.json`.
- **Meshy:** stand module, 3 rigged fans + impostors, dugout, LED board, broadcast camera, tunnel, goal frame; venue sets (houses, light pole, palm, lifeguard tower, boat, lanterns, gate, cherry tree, ridge, salt cone, ice crystals); dome retexture; steward and photographer.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| FC47-L1 | lighting | M | Fix both look defects game-side: Munich, Kyoto, Favela to `night-city`, Glacier to `polar-night` (no HDRI, real fog); venue background through the override; low-intensity night IBL (background false) | lookPresets.ts:160-195; contracts/looks.ts:12; looks.ts:200-207,271-273; environments.ts:125-138; `scene.ts:34-41,443-460`, `main.ts:86-90` | night-2k (already served), optional rooftop_night, cobblestone_street_night | Munich and Glacier top row <= 45 (134-151 today); pitch cells 55-95; darkFrac 0.05-0.35; draws within 5% |
| FC47-L2 | lighting | M | Night key is the main-stand flood (PCSS 2048, 3.5-4.0); look key 0.4 unshadowed; other towers faked with one instanced blob-decal batch until E-B multi-caster; day venues keep a cascaded sun | lights.ts:75; contracts/lighting.ts:12-13; observations.ts:288; instances.ts:24; types.ts:1233-1262; `scene.ts:307-321,562-600` | blob texture | spot shadow requested, casterIsSpot, mapRendered and sampled; blob batch 1 draw; pitch cell spread >= 18 |
| FC47-L3 | lighting | S | Cool unshadowed rim opposite the camera; irradiance volume over the bowl | lights.ts:51; probes.ts:59 | - | player crop >= 20 over crowd crop on Munich and Kyoto |
| FC47-S1 | env-sky | M | Day skies: Lagos golden-hour sun 8/250 over the sea; Uyuni hand rig on spruit_sunrise (background on) with a low warm cascaded key, exposure -0.9; Glacier `sky.dayNight({ hour: 23 })`, starLimit 120 | contracts/looks.ts:12; looks.ts:260-265; environments.ts:125-138; sky.ts:87 | spruit_sunrise_2k | Uyuni mean 150-190 (231.74), p5 <= 120, grid spread >= 30; Glacier <= 401 draws; Lagos top-row R-B >= 40 |
| FC47-S2 | env-sky | M | Haze shafts: volumetric fog with `lightPosition` at the main-stand tower on Munich and Glacier; cones to 0.5 | effects.ts:82,298; postBridge.ts:582,826-827,878-890; EffectNodeLowering.ts:433 | - | S4 in stagesRan at High; top-row spread -20% vs bottom; cost logged |
| FC47-S3 | env-sky | S | `effects.rain` Munich, drizzle Kyoto, `effects.snow` Glacier, dust motes Favela (not weather.precipitation, which adds up to 90 box streaks) | effects.ts:165,178,248; contracts/atmosphere.ts:20; prd07.ts:49; NEW VenueSpec.weather | - | rain node Munich, snow node Glacier; +2 draws max |
| FC47-P1 | post | M | Output preset per venue (arena-fight, neon-night, cinematic-film, daylight-outdoor); vignette 0.25; grain on Favela; CA on Kyoto | postPresets.ts:39-110; output.ts:15,19; effects.post.ts:136,148,159; `main.ts:104-110` | - | stagesRan differs Munich/Kyoto/Glacier; 3x3 vectors differ >= 15 pairwise; distinctness gate passes |
| FC47-P2 | post | S | Per-venue LUTs and white balance (blocked on E-C) | effects.post.ts:99; v2Stages.ts:1218-1252 | 6 .cube LUTs | pitch hue differs >= 8 deg Munich vs Kyoto; LUT bound in receipt |
| FC47-P3 | post | C | Lens flares on the 2 main banks at night; goal DOF waits on E-C runtime post | lights.ts:15; lensFlare.ts:111-125 | - | bank cell p95 >= 230, clip < 1% |
| FC47-M1 | materials | M | Real turf (acg-grass005 with normal and roughness, tiled 24x16), stripes as 30% tinted planes; wet roughness 0.35 Munich/Kyoto; clearcoat ice on Glacier; concrete cage on Favela | types.ts:82-86,216-227,256; material.ts:133; aura.library.json:5502,5606; `scene.ts:96-147,203-226,531-560` | acg-grass005, acg-concrete034 | pitch stddev >= 6; validate --release; draws unchanged |
| FC47-M2 | materials | S | Kits with fabric sheen 0.45; shirt numbers by projected decals | material.ts:184-191; Decals.ts:494; contracts/materials.ts:33; `rig.ts:109-113` | number sheet | kit p95-p50 >= 25; material >= 7 |
| FC47-M3 | materials | M | Uyuni mirror pitch (res 256) under a thin water film; probe fallback if draws pass 480 | surfaces.ts:16-24,44-49; material.ts:118; probes.ts:9-17,45 | - | bottom row p5 <= 120 and >= 25 below top; flipped player correlation >= 0.5; <= 480 draws |
| FC47-A1 | assets | M | Football Meshy kit replaces box stands, capsule crowd and borrowed diamond/hoops assets | instances.ts:15-23,64; prd10/index.ts:116; importMeshy.ts; optimize.ts; `scene.ts:148-199,242-305,348-366`, `aura-assets-v2.ts:97-114` | stand, fans, dugout, LED, camera, tunnel, goal | `primitives.` 34 -> <= 14; no diamond/hoops keys; game-checks 0 errors |
| FC47-A2 | assets | S | Venue dressing sets in NEW `dressing.ts` via scatterInArea and mergeStatic; frosted dome retexture | model.ts; scatter.ts:214; public/index.ts:25; geometry-hash.mjs | venue sets | >= 3 venue-only props per venue; dome hash same; within PF1 |
| FC47-V1 | vfx | M | Runtime VFX on after E-F floating-dot fix; pack: turf divot + scuff decal, wet splash, net spark, goal pyro per venue, Munich lightning (skip on reduced flash) | contracts/effects.ts:17-22; effects-api.ts:38-60; `main.ts:97,223-243` | - | effects active within 0.5 s of a goal; pyro in >= 2 of 3 goal frames; 0 floating dots in 10 action frames |
| FC47-V2 | vfx | S | 3 aurora ribbons replace flat aurora planes | effects.ts:316; EffectNodeLowering.ts:434; `scene.ts:332-346,518,558,571` | - | Glacier sky G-R >= 25; 3 fewer planes |
| FC47-AN1 | animation | S | Rigged front-row fans with idle/cheer crossfades; impostor mid/back rows bob in waves; flag sway; additive fist pump | contracts/animation.ts:34-35; public/index.ts:15; `scene.ts:539,562-600`; motionReport.ts | fan clips | crowd diff >= 3x baseline after a goal; motion report passes; crowd <= 16 draws |
| FC47-C1 | camera | S | Broadcast package: 4 s tunnel-to-gantry rail intro with bars; 4 s goal replay from a NEW sim-snapshot ring buffer; full-time orbit; main cam 14 m at 30 deg | contracts/camera.ts:40-53; prd08.ts:113; contracts/app.ts:22; `main.ts:535`; NEW `src/game/replay.ts`; `camera.ts:15` | - | cutThisFrame on shot changes; replay >= 3 s; portrait fit test passes |
| FC47-H1 | hud | S | TV match package: score bug, venue ident, goal lower third, REPLAY stinger, SDF in-world score; drop `system-ui` fallback | text3d.ts:29; themes.ts:52 (tokens only); `hud.ts:45`, `scene.ts:323-330` | - | lower third on goal; in-world score matches state; text >= 12 px; no system-ui |
| FC47-W1 | dressing | C | Stewards, photographers, fourth-official board, SDF LED hoardings; graffiti and chain-link on Favela; neon shapes on Kyoto | Decals.ts:493; instances.ts:64; text3d.ts:29 | steward, photographer | >= 8 prop keys within 10 m per venue; within PF1 |
| FC47-PF1 | perf | M | Instanced and merged stands, crowd and dressing; impostor crowd shadows; budget.json for 6 venues | instances.ts:21; public/index.ts:25; capture spec :71 | - | <= 360 draws (Uyuni <= 480); JS +40 KB max; 6 before/after rows |

#### WP-20 (G10) aura-links-3d: "Golf-broadcast postcard tour"

- **Code:** `apps/showcase-aura-links-3d/src` (main.ts, game/courses.ts, game/lighting.ts, game/rig.ts); line numbers from `audit-fix/g10`.
- **Today:** St Auroras, Maple and Cloud Terrace share one HDRI and one sun (`lookPresets.ts:120-122, 204-206`); Neon Bay and Mare have no HDRI; fog 0 on every course; flat ambient; flat-colour turf with no UVs on ribbons; sphere-stack conifers; landmarks borrowed from siege/turbo/aurora/skyline/showcase games; runtime VFX off (`main.ts:2816-2817`); gallery is 6 copies of the player golfer. Day courses within 23 luma of each other (128-152); Neon Bay 27.6 (darkFrac 43%, p95 59); Mare 49.9 (51% dark); draws 106-218.
- **Identity:** six courses, six places and hours: cold sunrise haar over marram dunes and a lighthouse (St Auroras), warm late-afternoon maples over still ponds (Maple), dusk on a basalt crater with lava and god rays (Cinder), hard cobalt noon above a cloud sea (Cloud), wet floodlit harbour night in teal and magenta (Neon Bay), airless black-sky regolith under an earthrise (Mare). Signature: broadcast camera language (hole flyover, tracer, cup cam). The only open-landscape, natural-light sports game.
- **Engine deps:** E-A (key/hdri/post overrides, catalogue), E-B (height fog default), E-C (grade writer, LUT, AgX), E-D (rim), E-F (burst custom kinds, atlas, floating-dot root cause), E-G (`world` export with heightfield sampler, water), E-H (crowd kit), E-I (GL_META hue/stddev, borrowed-asset rule, prism judge).
- **Budget:** <= 220 draws desktop High and <= 150 phone on all six courses (Cloud is 218 today); <= 1.2M tris; +48 MB textures per course max (total <= 160 MB); +12 MB HDRI in dist; <= 2 mirrors at 256 px per hole; <= 2 shadowed spots; <= 10 animated gallery actors; <= 2,000 particles; fps within ±10%.
- **Meshy (~30 generations + 3 rigs + 1 retexture):** lighthouse, dyke, starter hut, marram, gorse; 3 maples, birch, clubhouse, footbridge; caldera ridge, basalt columns, charred tree, fumarole; cable-car station, mountain pine, prayer flags; harbour crane, skyline backdrop, neon palm, LED leaderboard, floodlight mast; lander, regolith rock, Earth disc; 3 spectators; ball, tee marker, ball washer, yardage post; golfer matte retexture.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| LINKS-01 | lighting | M | Own sun per course (St Auroras 12/95, Maple 30/235, Cinder 7/265, Cloud 62/160, Mare 25/40); per-course rig table; remove flat ambient on HDRI courses; PCSS cascades | contracts/looks.ts:12; looks.ts:252-275; contracts/lighting.ts:12-13; lights.ts:51; NEW look key (E-A); `game/lighting.ts:41-57`, `courses.ts`, `main.ts:943-955` | - | sun vectors differ >= 25 deg pairwise (unit test); pcss with >= 3 cascades; no ambient-flattens; St Auroras vs Cinder top row >= 12 |
| LINKS-02 | env-sky | M | Own HDRI per course: spruit_sunrise, autumn_field_puresky_2k, industrial_sunset, outdoor-midday-2k, rooftop_night (IBL only over navy), starfield 2k; rotated to match the sun | environments.ts:125; cli-help.ts:38; NEW look hdri + rotation (E-A); `main.ts:975-996`, NEW `public/hdri/` | 6 HDRIs | 6 distinct environment keys; day top rows differ >= 12; Mare top >= 4; Neon top >= 10; <= 12 MB |
| LINKS-03 | env-sky | M | Atmosphere per course: St Auroras sea haar height fog, Maple warm haze, Cinder ash + god rays, Cloud clear, Neon navy fog, Mare none | effects.ts:52,82; contracts/atmosphere.ts:17,20; contributors.ts:317; postBridge.ts:879-890; flags.state.ts:36 | - | St Auroras top-bottom +15 with fog on; Cinder god-ray stage ran; Cloud mean 145-175, clip <= 0.02; no Mare fog node |
| LINKS-04 | post | S | Per-course post beyond the presets; delete the game's own vignette that overrides presets; temperature after E-C | output.ts:15,19; postBridge.ts:747-753; postPresets.ts:19-110; effects.post.ts:99; v2Stages.ts:1076-1082,1218-1221 | - | Maple and St Auroras stages differ (grain on Maple); Cloud cell stddev 1.3x; hue differs >= 15 deg St Auroras vs Maple |
| LINKS-05 | materials | M | Textured turf: tiled grass with stripe ribbons rotated 90 deg, fine green normal and sheen, long rough, sand, basalt and regolith; world-metre uv0 on ribbon and disc builders | types.ts:191-193,216-220,256; ambientcg.ts, poly-haven.ts; texel.ts; `main.ts:228-300,819-869` | CC0 sets | validate --release; texel p50 256-1024 px/m; turf stddev >= 2x; <= 48 MB per course |
| LINKS-06 | materials | S | Find the golfer's glossy blue-silver source; matte cotton, twill and leather retexture | meshy retexture; overrideMaterial.ts; `rig.ts:99-115` | retexture | hash same; golfer pixels >= 250 <= 1%; Neon golfer >= 1.5x turf |
| LINKS-07 | assets | M | Delete sphere conifers; own flora per course via instances.model with LOD, impostor shadows, wind | instances.ts:69-76; prd10/index.ts:116; scatter.ts:177,214; `main.ts:346-385,592-659` | flora sets | no `conifer-boughs`; no flora key shared between courses; no primitive-subject |
| LINKS-08 | assets | M | One Links-owned landmark per course in the aim sightline; Links ball and SFX; NEW borrowed-asset game check | model() `main.ts:696-746`; cli-help.ts:40; admission.ts:34-39; NEW rule in index.mjs (E-I) | landmarks | rg for borrowed prefixes returns nothing; validate --release; 0 borrowed findings |
| LINKS-09 | dressing | S | Ground cover: >= 3,000 instanced tufts in the rough, heather, wildflowers, ash, snow patches, pebbles; SDF tee signs | instances.ts:69-76; scatter.ts:214,252; text3d.ts:29; NEW world export + heightfield (E-G) | tufts | <= 4 extra draws; phone <= 50% instances; rough crop moves >= 2 luma over 1 s |
| LINKS-10 | dressing | C | Divots, pitch marks, rake lines, scorch and boot prints; runtime decal at each landing | Decals.ts:46,494; contracts/effects.ts:17 | - | <= 24 static per hole; >= 3 runtime decals per hole; <= 32 total |
| LINKS-11 | vfx | M | Runtime VFX back on after a root cause; fix splash-to-dust mapping; Links specs (divot, sand burst, water splash, ember hiss, low-gravity dust, hole-out ring) via spawn(spec) | contracts/effects.ts:9,14-15,19-20; effects-api.ts:290; audit.ts:35; NEW `art/direction.ts`; `main.ts:2052-2059,2558-2585,2816-2817` | - | no `effects.runtime = "off"`; liveCount > 0 within 100 ms of landing and 0 by 2 s; spec colours >= 20 deg apart |
| LINKS-12 | camera | M | Broadcast camera: 3-shot rail flyover with bars (4-6 s, skippable), tracer cam on drives > 150 m, cup cam on short putts, hole-out orbit, DOF only in flyover/cup cam, 2 deg FOV kick | contracts/camera.ts:39-42,53,55,58,67; effects.ts:131; motionReport.ts; `main.ts:1183-1290` | - | no play() under reduced motion; flyover 4-6 s, skip within 1 frame; DOF only in those shots; no inside-geometry frames |
| LINKS-13 | animation | S | 3 spectator models with idle/clap/cheer (additive upper-body cheer on hole-out), marshal by the cart; flag flutter from wind, stiff on Mare | cli-help.ts:45; contracts/animation.ts:35; AnimationController.ts:2570; `main.ts:775-801,2329-2330` | 3 spectators | golfer key only on the player; >= 3 spectator keys; <= 10 actors; flag test 0 on Mare |
| LINKS-14 | hud | S | Broadcast HUD: hole-card lower third with hole map, shot stats chip, real accent per course; DIN Pro/Whitney; not sports-broadcast as-is | HudKit.ts:197; index.ts:202; themes.ts:19,40,52; `index.html` | - | hole map matches path; accents >= 30 deg apart; contrast >= 4.5:1; no Barlow/Inter/Roboto |
| LINKS-15 | perf | M | Budget enforced before dressing; merge static; LOD and impostors on trees and landmarks; Cloud pines first | public/index.ts:25; instances.ts:69-75; groups.ts:39; rendererOptions.ts:28,38,53 | - | <= 220 desktop, <= 150 phone on all 6; fps ±10%; NEW `evidence/aura-links-3d/budget.json` |
| LINKS-16 | lighting | S | Neon Bay spot masts (2 shadowed), cones in navy fog, emissive skyline, harbour probe; Mare earthshine hard shadow; Cinder lava points | lights.ts:62,75; quality.ts:80,91; effects.ts:298; probes.ts:45; contracts/lighting.ts:12 | masts | Neon darkFrac <= 0.25 (0.43), mean 35-70, p95 >= 170; Mare darkFrac <= 0.35; Cinder 0.5-3% pixels >= 230 |
| LINKS-17 | materials | S | Ponds and harbour as horizontal mirrors; Cinder lava as scrolling emissive custom material | surfaces.ts:49; material.ts:59-67; flags.state.ts:39; `main.ts:871-887` | - | <= 2 mirrors at 256 px; pond/lava moves >= 2 over 0.5 s; lava mean >= 180 |
| LINKS-18 | vfx | C | Ambient particles per course (wisps, leaves, embers, spindrift, moths); sun flares on St Auroras and Cinder | effects.ts:178,248,337; lights.ts:15 | - | emitter listed; <= 2,000 high, 0 low; reduced motion halves |
| LINKS-19 | hud | M | Proof: hue and stddev in GL_META; all 6 courses at desktop and phone; sibling judge vs Hoops, Diamond, FC, Top Tennis; look judgement | capture spec :37-59; game-luma-targets.ts:45; judge.ts:15,53-69,153 | - | courses' middle-row hues >= 10 deg apart or means >= 12; same_game false on >= 75% of 48 trials vs each; every category >= 7; 0 warnings |

#### WP-21 (G11) bunker-zero: "Cold-War bunker lit by its own fixtures"

- **Code:** `apps/showcase-bunker-zero/src/main.ts` (integration 1,240 lines; `audit-fix/g11` 1,635 lines with blocks shifted), maps.ts, sim.ts, weapons-view.ts (g11).
- **Today:** `looks.preset("night-city")` plus ambient 0.9, hemisphere 1.0, two unshadowed directionals, two player-following points; sealed ceilings mean nothing casts a shadow in the corridors; muzzle and boom lights at intensity 0 with no setter; flat-colour boxes; enemies with 0 clips glide; borrowed sci-fi kit (pulse gate, sci-fi crate, reactor pylon, mech weapons). Floor 1 mean 74.95, p5-p95 30-102 (flat), darkFrac 2.9%, 165 draws; Floor 6 mean 42.0, 29 draws; one luma target.
- **Identity:** a buried Cold-War civil-defence bunker lit only by its own fixtures: caged tungsten bulbs, sodium lamps, flickering fluorescents and red alarm beacons, deep shadow and dust haze between pools of light. Board-formed concrete, olive steel, rust; hazard yellow-black the only saturated accent. One light colour per floor (F1 tungsten, F2 green-teal wet cellar, F3 forge orange from below, F4 brass and wood, F5 cold fluorescent, F6 red alarm with a moonlit hatch shaft, Kill House white floods). Signature: gunfire lights the room. The only first-person, practically lit, underground game.
- **Engine deps:** E-B (setLight for flicker and beacons, hidden-floor light culling), E-C (LUT, temperature), E-D (rim), E-F (atlas sprites), E-G (height fog opt-in, skinned shadows), E-I (RGB/hue capture), E-J (licensed HUD fonts).
- **Budget:** per active floor <= 200 draws on F1 and <= 120 on F6; <= 40 point/spot/rect lights with 2 shadowed spots at 1024 plus the F6 moon; <= 600 particles; texture memory <= 64 MB; HDRI 1k < 2 MB; GLBs < 25 MB after meshopt; owner real-GPU p50 >= 60 fps at 1440 x DPR 2.
- **Meshy (~700 credits):** rigs and 15 animate tasks for guard, gunner, warden (hound tried); ~19 generations (blast door, freight elevator, push-wall panel, concrete pillar, caged lamp, fluorescent fixture, alarm beacon, pipe runs, cable tray, vent fan, sandbags, cabinet, desk, forge grate, chains, period SMG, rocket tube, trench knife); 3 retextures (pistol, ammo crate, warden).

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| BZ-20 | camera | M | First: `?floor=1..6,kh` boot param at a fixed reference viewpoint per floor; 7 new luma targets | URLSearchParams (g11 `main.ts:41`); game-luma-targets.ts:65; decode/compare-luma | - | 8 bunker-zero targets, unit guard passes; 7 per-floor frames and the table committed under `evidence/showcase-bunker-zero/upgrade-47/` |
| BZ-01 | lighting | M | Practical lights: delete ambient, both directionals and night-city (and the HUD credit); a point (distance 8) under every work-light fixture; 2 shadowed PCSS spots per floor; player light 5.6 -> 1.2; hemisphere 0.25 | lights.ts:24,62,75; contracts/lighting.ts:12-14; quality.ts:79-80; contracts/looks.ts:14; `main.ts:37,71-80`, `maps.ts` | fixtures (BZ-12) | F1 p95-p5 >= 110 (72), darkFrac 0.08-0.35, clip <= 0.02, mean 45-70; no ambient/night-city in src; lighting and shadows >= 7 |
| BZ-02 | lighting | M | One light colour per floor from maps.ts data (F5 rect tubes; F3 lights at grate height); fog per floor at 30% lamp value; env intensity per floor | lights.ts:100; effects.ts:52; prd02.ts:238; `maps.ts` | - | adjacent floors' mean hue differs >= 25 deg (E-I hue); lighting >= 7 per floor |
| BZ-03 | vfx | M | Gunfire lights the room through bursts with transient lights (muzzle, explosion-small, impact-flash + debris); delete intensity-0 lights and pooled flash nodes | contracts/effects.ts:14-24; effects-api.ts:45-49,100-107,171-180; `main.ts:333-378,733-750` | - | muzzle crop +25% on fire frames; liveCount > 0; no muzzle/boom light in src; F1 within budget |
| BZ-04 | materials | M | ambientCG walls and floors per floor (concrete034, bricks075a, metal046b, plaster017 over wood096, metal049a, tiles141; floors concrete047a, metal063 grates), 1 repeat per 3 m; instance colour jitter ±6% only | types.ts:204,217-256; aura.library.json:5398-6126; `aura.assets.json`, `src/aura-assets.local.ts`, `main.ts`, `maps.ts` | 9 sets at 1K | validate --release; lit wall stddev >= 12; texture and material >= 7 |
| BZ-05 | env-sky | M | hangar_interior HDRI at 1k, intensity 0.35, background false; one box probe per floor | environments.ts:56,125-135; probes.ts:9-15,45; index.mjs:590; fixtures manifest.json:344 | bzHangarHdri | no lighting warning; HDRI 1k < 2 MB; ibl_reflections >= 7 on F2, F5 |
| BZ-06 | dressing | M | Wet Flooded Cellars: mirror per water region under a dark tint (replaces the cyan emissive slab); wet ground F2/F6; puddle decals; drips | surfaces.ts:16-22,49; weather.ts:53; Decals.ts; manifest.json:277; effects.ts:248 | - | water crop darker with p95 >= 150; floorEmissive only on F3; mirror <= 4 draws |
| BZ-08 | post | M | AO 0.65/0.9, bloom 0.82/0.45, grade 1.14/0.82, vignette 0.34, grain 0.04; aces via createGame output | effects.post.ts:27,67,99,136,148; v2Stages.ts:733; runtime.ts:498; contracts/output.ts:10-11; createGame.ts:105-115 | - | S2 gtao and bloom ran, nothing dropped; corners >= 15% darker than centre; post and tone mapping >= 7 |
| BZ-12 | assets | M | Bunker kit replaces borrowed sci-fi assets and weapons; fixtures and dressing modules | admission.ts:36-37; VIEWMODEL_ASSET g11 `weapons-view.ts:4-9`; `aura-assets.root.ts` | ~19 generations, 3 retextures | rg for borrowed keys returns nothing; validate --release; pistol hash same; modeling >= 7 |
| BZ-11 | assets | M | Rig and animate guard, gunner, warden (walk, run, aim-fire, hit-react, death); additive upper-body hit layer; death plays before hide; hound via proceduralLegSwing if needed | merge-clips; validate-animation --require-rig; admission.ts:39; contracts/animation.ts:13,33-36; locomotion.ts:125 | 3 rigs, 15 clips | >= 5 clips and 1 skin per humanoid; limbs move while walking; death completes before setVisible(false) |
| BZ-07 | env-sky | S | F6 set piece: 3x3 ceiling hatch, night backdrop, shadowed moon key (strongest directional), volumetric fog shaft onto the Warden arena | effects.ts:82; postBridge.ts:808-827,879-890; lights.ts:48-56 | - | S4 on Medium+; centre band > outer bands (28.1 vs 48.7 today); darkFrac <= 0.30; shaft p95 >= 140 |
| BZ-09 | vfx | S | Per-floor atmosphere emitters (dust in cones, F3 embers, F2 drips, F5 falling sparks); `concrete-chip` preset | effects.ts:248; contracts/effects.ts:19,30 | - | 2-3 live emitters on the active floor, 0 on hidden; <= 600 particles; particles/atmosphere >= 7 |
| BZ-10 | dressing | S | 12 seeded scorch/crack decals per floor, hazard stripes, 20 s bullet holes, SDF stencil floor names | Decals.ts:7,27; contracts/effects.ts:12,17; text3d.ts:29 | decal sheets | no overBudget; impact decals visible after 20 s fight; environment >= 7 |
| BZ-13 | dressing | S | Instanced pipe runs and cable trays along wall tops; per-floor clutter within 1 m of walls; mergeStatic | instances.ts:63-86; scatter.ts:89,214; mergeStatic.ts:104 | modules | <= 12 draws per floor; autopilot clears all 6 floors; top-band stddev 2x |
| BZ-14 | materials | S | Enemies read by light, not glow: remove emissive lift and eye spheres; cloth sheen; small cool back light until E-D rim | overrideMaterial.ts; types.ts:191-193 | warden retexture | no eye spheres; enemy vs wall >= 20 luma at 8 m; readability >= 7 |
| BZ-15 | animation | S | Sliding blast doors with dust, push walls with debris, bobbing pickups, viewmodel sway/recoil/reload dip; F5 flicker and F6 beacons after E-B | runtime.ts:150-154; contracts/effects.ts:14; effects-api.ts:40-41 | - | door x/z changes, y constant, liveCount > 0; ?demo=1 runs identical at 30 s |
| BZ-16 | camera | S | 2.5 s elevator-descent sequence with bars between floors; death roll 12 deg + fade; sprint FOV +4; reduced motion skips | contracts/camera.ts:40,52-54; output.ts:20; motionReport.ts | elevator cage | sequence with bars on every floor change; motion report passes; reduced-motion test |
| BZ-17 | hud | S | Bunker-equipment HUD: DIN Pro, stencil panels, olive and hazard accents, blueprint minimap, directional damage arc; accent = floor lamp colour | `index.html` (g11), `main.ts`; output.ts:20 | DIN Pro woff2 | computed font DIN Pro; labels >= 11 px; ui_hud and typography >= 7; arc within 45 deg |
| BZ-18 | post | C | Per-floor LUTs and CA pulse on heavy hits (after E-C) | effects.post.ts:99,159; postBridge.ts:921-937 | 6 .cube LUTs | LUT on/off on F3 shifts hue >= 10 deg |
| BZ-19 | perf | M | Budget per active floor; hidden-floor lights and emitters not counted | types.ts:2509-2547; drawCallsByFloor (g11 `main.ts:1485-1494`); NEW real-GPU row | - | all 7 floors within budget; budget.json committed; owner run p50 >= 60 fps |

#### WP-22 (G12) slingshot-siege: "Tilt-shift seaside siege diorama through one day"

- **Code:** `apps/showcase-slingshot-siege/src` (main.ts:67-70, game/stage.ts, game/levels.ts:185-218, game/hud.ts).
- **Today:** `looks.preset("outdoor-day", { fogDensityScale: 0 })` (`stage.ts:175-181`) on all six chapters, so the same HDRI with fog off; ambient + hemisphere + 3 unshadowed directionals; flat background; cylinder island and ocean; 30 `primitives.` calls; every block material is one bridge GLB at 0.45; debris always planks; static box flag; fixed camera; gull pips although enemies are boars. Mean 111.9, p5 25, p95 184, fort cell grid[5] = 77 (darkest); 395 draws (before the SS-17 fix; after-fix count unrecorded).
- **Identity:** a painted wooden toy siege diorama through one day: crisp morning, dusty noon, misty overcast, golden hour, stormy red sunset with drizzle, starry night with lantern light. Chalk cliffs, sea teal #2f8f9d, bleached sand #e9d6a8, driftwood, one hot accent per chapter (pennant red #e2483d, lantern amber at night). Signature: miniature depth of field with a real sea horizon.
- **Engine deps:** E-A (look hdri/key/fog), E-C (tilt-shift DOF, white balance, LUT), E-D (transmission/iridescence overrides, rim), E-F (atlas sprites), E-G (sky default, world water from app flags), E-H (spline rail), E-I (crop metrics, per-chapter targets and URL param).
- **Budget:** <= 200 draws on level 1 and <= 260 on Gull Keep; dressing <= 12 draws; water <= 3; route JS +40 KB max.
- **Meshy (~22 generations, 6 retextures, 2 animations):** sea-stack island; 5 block GLBs and debris sets; slingshot; windmill rotor; cloth pennant; lighthouse islet; quarry crane, greenhouse frame, curtain wall, crystal crater; beach dressing; boar knockback and dazed clips; starfield 2k downsample.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| SS47-L1 | lighting | M | Remove ambient, hemisphere and warm bounce; one PCSS 2-cascade sun fitted to the island; per-chapter sun elevation 35/62/48/14/8/30 | lights.ts:51; contracts/lighting.ts:11-12; contracts/looks.ts:12,14; `stage.ts:188-195`, `levels.ts:185-218` | - | no ambient/hemisphere; one shadowed directional; no ambient-flattens; p95-p5 >= 170; fort grid[5] >= 100, darkFrac <= 3% |
| SS47-L2 | lighting | M | Contact shadows from the sun; smaller AO radius for miniature scale | effects.lighting.ts:8-31; effects.post.ts:67; contactShadowKey.ts | - | no degrade warning; grid[4] p50 within 8 of 122 |
| SS47-L3 | lighting | S | Window points in gatehouse/watchtower (ch4-5), far lighthouse spot (ch5), sun flare (ch3-4) | lights.ts:15,62,75; lensFlare.ts:105-126; NEW ChapterDef practicals | - | flares only ch3/ch4, points only ch4/ch5; ch5 p95 >= 200 with mean <= 70, clip <= 0.03 |
| SS47-E1 | env-sky | M | Own look and HDRI per chapter, fog back on: spruit_sunrise, outdoor-midday-2k, overcast x1.6, kloppenheim_06_puresky_2k, belfast_sunset x2.2, polar-night with starfield 2k; fallback environments.hdri until E-A | looks.ts:214,399-457; contracts/world.ts:16; environments.ts:125; NEW look hdri (E-A) | 5 HDRIs + starfield | NEW targets ch0-ch5; neighbours differ >= 12; ch5 <= 70, ch1 >= 115; >= 4 of 6 distinct env sources; no fog 0 |
| SS47-E2 | env-sky | M | Real sky and sea horizon: gradient by day, Preetham at golden and sunset, stars at night; opt into A3D_QR_VFX_SKY | sky.ts:37-76; compiler/sky.ts:18; contracts/flags.ts:16; atmosphere-api.ts:15-21; `main.ts:70`, `stage.ts:544-547` | - | ch0-4 top-row stddev >= 8, top minus middle >= 10; ch5 top p95 >= 170 with mean <= 50 |
| SS47-E3 | env-sky | S | Animated water with shoreline foam and splashes (needs E-G app-flag world water) | water.ts:1-72; world/flags.ts:12-30 | - | bottom row changes >= 3 between 25 s and 60 s; no blob; <= 3 draws |
| SS47-E4 | env-sky | C | Drizzle + wet fort pad (ch4), dust (ch1), low mist (ch2) | weather.ts:19,53; flags.state.ts:36; effects.ts:248,357 | - | only those chapters; no streaks on reduced motion; ch4 fort >= 70 |
| SS47-P1 | post | M | Signature miniature DOF on the flight lane; tilt-shift mode after E-C | effects.ts:131-145; v2Stages.ts:938; effects.post.ts:180; `main.ts:277-356` | - | S6 ran, no degrade; fort crop >= 2.5x sharper than far headland and within 10% of DOF-off |
| SS47-P2 | post | M | Output preset and grade per chapter (daylight-outdoor, cinematic-film, neon-night or space) | output.ts:11-19; contracts/post.ts:12; postPresets.ts:39-110; effects.post.ts:99 | - | expected preset per chapter; sand R/B >= 1.25 on ch3-4, <= 0.95 on ch5 |
| SS47-P3 | post | S | Bloom threshold ~0.9 by day, ~0.6 at night; vignette 0.18/0.3 | effects.post.ts:27,136 | - | day clip <= 0.01; ch5 p95 >= 200, clip <= 0.03 |
| SS47-M1 | materials | M | Readable block families: painted wood, chalky stone, glass clearcoat at 0.55 opacity, pale-emissive ice, glossy obsidian | contracts/materials.ts:21-26; TypedGLBActor.ts:249-250; NEW transmission/rim (E-D); `stage.ts:111-125`, `materials.ts` | blocks from A1 | glass >= 20 above stone, obsidian <= 45; panel judge names >= 4 of 5 materials |
| SS47-M2 | materials | S | Textured sand, turf, wet rock (or baked into the island); drop photoreal moss | cli.ts; textureStats.ts; `stage.ts:300-318` | CC0 sets | gates pass; island cells spread +15 |
| SS47-A1 | assets | M | Island diorama, 5 block GLBs, debris chips, slingshot, rotor, cloth pennant, far islets, chapter set pieces | meshy-cli; admission.ts; optimize; `stage.ts:219-527` | ~22 generations | game-checks pass; primitives 30 -> <= 8; each material its own key |
| SS47-A2 | assets | S | Retexture catapult, watchtower, gatehouse, windmill, crate, barrel into one painted-toy style; boar knockback/dazed clips | geometry-hash.mjs; merge-clips; validate --skin | 6 retextures, 2 clips | hash same with filmstrip; clips listed |
| SS47-V1 | vfx | M | Material-specific breaks (dust+debris wood, grey dust stone, white-blue sparks glass/ice, purple obsidian, impact-flash on boar, splash in sea); delete sphere puffs | contracts/effects.ts:5,9-20; effects-api.ts:38-53; NEW sprites (E-F) | - | liveCount > 0 within 100 ms of a break; puff pool removed |
| SS47-V2 | vfx | S | Ammo-tinted trails, launch dust ring, hit-stop + flash, scorch decals cleared on load | contracts/effects.ts:12-20; GameFeel.ts:49-50; output.ts:19-20 | - | trail alive in flight; liveCount 0 after loadLevel; no hit-stop on reduced motion |
| SS47-AN1 | animation | C | Grass and tree wind, waving pennant, additive boar flinch | instances.ts:63-100; contracts/animation.ts:34-35 | - | gull scare triggers playLayer; fort cell differs >= 1 over 1 s |
| SS47-C1 | camera | M | 3 s skippable intro (fort wide, cut to sling); fovKick and punch on release; fort 18-25% of frame height | contracts/camera.ts:36-43,51,53,100; motionReport.ts | - | report passes; fort fraction >= 0.18 (1280), >= 0.12 (390); skip resolves done |
| SS47-H1 | hud | S | Nautical parchment and rope HUD; boar pips; no comet glyph; game-art icons; SDF wooden level sign | aura3d-game-art; text3d.ts:21; `hud.ts:69,99`, `styles.css` | icons | no glyph; typed icon asset; min 11 px kept; ui_hud >= 7 |
| SS47-W1 | dressing | M | Seeded instanced beach dressing (grass, shells, driftwood, rope posts, lobster pots), clear of the flight lane | scatter.ts:177,214,267; instances.ts:63-100 | dressing | <= 12 draws; nothing within 1.2 m of the lane; environment >= 7 |
| SS47-PF1 | perf | M | Record post-SS-17 draws; mergeStatic and instancing; cap shadow casters | rendererOptions.ts:40-60; mergeStatic.ts; NEW `evidence/slingshot-siege/game-upgrades-47/budget.json` | - | level 1 <= 200, Gull Keep <= 260; JS +40 KB max |

#### WP-23 (G13) dot-dash-3d: "Night shift on the workbench"

- **Code:** `apps/showcase-dot-dash-3d/src/game/world.ts` buildScene (line numbers from `audit-fix/g13`), palette.ts, mazes.ts, sim.ts, hud.ts.
- **Today:** no assets at all (`aura.assets.json` is empty); everything is primitives; ambient 0.92 + hemisphere 0.5 + one directional on top of `neon-arcade` (no HDRI); per-instance colour cannot glow (g13 world.ts:157-158). Mean 29.5, p5 8, p95 124, 9-9.6% dark, mean RGB 25.7/31.6/19.0 (almost no blue), 39 draws; poster still shows the pre-rework clone.
- **Identity:** a tilt-shift macro view of a powered circuit board under one warm desk lamp late at night: glossy solder mask, black epoxy chip walls with silver pins, copper traces that light up behind the courier, edges dissolving into an out-of-focus walnut bench. Board 1 mask #1f4a38, copper #c8743a, silver #c9ced6, cyan LED #5ff3ff; six boards are six PCB types. Signature: shallow macro DOF and traces lit by the courier's path. Differs from The Bellkeeper's Walk (pastel meadow) and Duneglide (dunes), and from the neon cabinet games.
- **Engine deps:** E-A (`workbench-night` look), E-C (LUT, selective bloom, runtime post, stage trace), E-D (per-instance emissive, rim, transmission), E-F (atlas sprites), E-H (rail), E-I (silhouette IoU, per-board targets), E-J (`maze-arcade` genre).
- **Budget:** <= 110 draws High (today 39), <= 90 Medium, <= 70 Low; 1 shadowed spot + <= 9 points; only the active board's 4 maps resident; JS +20 KB max; fps within 15%.
- **Meshy (~30 generations, ~525 credits):** courier pod, 4 bug-bot sentries, 8 components (capacitors, toroid, crystal can, heatsink, pin header, QFP, ribbon), soldering iron, solder spool, mug.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| DD47-L1 | lighting | M | Desk-lamp key: delete ambient and hemisphere; one shadowed PCSS spot from [-13,19,9]; directional becomes a cool 0.25 unshadowed bounce | lights.ts:51,75; contracts/lighting.ts:12,14,23; types.ts:1239; contracts/looks.ts:14 | - | left third >= 1.6x right third (today ~1.0); spot sampled and rendered; no ambient/weak-shadow lint |
| DD47-L2 | lighting | M | Moving practicals: cyan point on the courier, amber points on live surge cells, slate points on sentries during surge (<= 9) | lights.ts:62; quality.ts:58-91; runtime handle setPosition | - | courier 3x3 crop >= 1.5x an empty corridor crop; fps within 10% |
| DD47-E1 | env-sky | M | indoor-workshop-2k HDRI at 0.35, background off; one box probe over the board; later NEW look `workbench-night` | environments.ts:125; probes.ts:45; cli.ts:351; types.ts:2555 | indoor-workshop-2k | not neon-arcade; no no-ibl; lamp-side p95 >= p50 + 30; no lighting warning |
| DD47-E2 | env-sky | M | Walnut bench and anti-static mat beyond the board; fog retinted to #1a120c at ~0.006 | primitives.ts:114-133; types.ts:172-275; ambientcg.ts; effects.ts:52 | walnut, rubber sets | every corner cell >= 10 at 1280 and 390; darkFrac <= 0.12; no solid-void |
| DD47-P1 | post | M | Signature macro DOF: focus on the board centre (~22, scaled by fitK), fStop 2, 85 mm, maxBlur 6; High/Ultra only | effects.ts:131; postBridge.ts:583,894-900; PostQualityTiers.ts:106-110 | - | bench cell variance <= 40% of centre, centre within 10% of DOF-off; stage trace after E-C |
| DD47-P2 | post | M | Lens stack: bloom 0.55/0.92, vignette 0.32, CA 0.0012, grain 0.02, grade 1.08/1.06; aces explicit | effects.post.ts:27,99,136,148,159; types.ts:913; output.ts:10-11 | - | p95 >= 200 (124), clip <= 0.01, mean 42-60, mean blue >= 30 |
| DD47-P3 | post | S | Per-board grade and lamp colour now; LUT and temperature after E-C | effects.post.ts:99; types.ts:927; v2Stages.ts:1218-1252 | 6 .cube LUTs | 6 NEW per-board targets; each board's mean RGB differs >= 12 in a channel; garden >= 1.5x zerocore |
| DD47-M1 | materials | M | Real PCB: NEW bake script writes per-board albedo, normal, ORM and an emissive trace mask from the maze rows; slab `material.custom` lights corridors the courier passed and ripples surge pulses | material.ts:59; customMaterial.ts; runtime.ts:198; NEW `scripts/bake-board-textures.mjs`, `src/game/boardMaterial.ts` | baked sets | admission checks pass; passed corridors +25 over untouched 0.5 s later; no degradations |
| DD47-M2 | materials | M | Black epoxy rounded-box walls; silver gull-wing pin boxes replace amber rails | instances.ts:39; material.ts:103; types.ts:187 | - | wall/corridor >= 1.8:1; pins 1 draw; material and composition >= 7 |
| DD47-M3 | materials | S | SMD LED shards with glowing lenses; capacitor-can surge cells with glowing vents | material.ts:142; instances.ts:64 | from A3 | lens >= 4x slab; halo > 128 at 3 px |
| DD47-A1 | assets | M | Meshy courier pod (glass dome, cyan core, copper fins), halo kept | meshy-cli; optimize.ts:119; importMeshy.ts:148; admission.ts:36; overrideMaterial.ts | courier | validate --release; no primitive-subject; >= 1.2% of frame (~0.6% today) |
| DD47-A2 | assets | M | 4 bug-bot sentries keeping silhouette classes, colours from GHOST_TINT | instances.ts:64; sim.ts:54 (g13) | 4 sentries | pairwise silhouette IoU <= 0.6 (NEW script); <= 8 draws |
| DD47-A3 | assets | S | Component kit per theme replaces icosahedron trophies and stubs; bench props merged | instances.ts:64-75; mergeStatic.ts:104; `palette.ts` | 8 components + 3 bench props | fit-grounding and deployable pass; no primitive-subject on any board |
| DD47-V1 | vfx | M | Pack solder-spark, surge-ring (+ trace pulse), short-circuit, blown-fuse (no flicker on reduced flash) | contracts/effects.ts:9,14,19,20; effects-api.ts:38; atlas.ts:8-10; NEW `src/game/vfx.ts` | - | each fires on its event; >= 40 hot pixels 80 ms after a disable; liveCount <= 60 |
| DD47-V2 | vfx | C | 60 dust motes in the lamp cone | effects.ts | - | lamp crop differs >= 4/255 over 1 s paused; <= 120 particles |
| DD47-AN1 | animation | S | Courier banks 12 deg and eases yaw over 90 ms; per-sentry motion styles; 30% amplitude on reduced motion | runtime handles (g13 world.ts:161) | - | roll >= 8 deg in a turn; yaw step <= 45 deg/frame; reduced-motion probe passes |
| DD47-AN2 | animation | S | Board power-up wave at READY and trace sweep at CLEAR; lamp dims to 40% | runtime.ts:198; sim.ts (g13) :24,26 | - | READY+0.6 s spawn half >= 3x far half; equal within 20% at +1.4 s |
| DD47-C1 | camera | S | Two-shot macro intro and 2 s clear orbit via play(); dash fovKick +3; skipped on reduced motion and captures | contracts/camera.ts:43,52-54,100 | - | sequences in evidence; captures within 2 of disabled; 19 columns at 390x844 |
| DD47-H1 | hud | S | Silkscreen HUD: dark mask panels, gold pad dividers, LED lives, Graphik + DIN Pro numerals | `hud.ts`, `styles.css`, `index.html`; themes.ts:26 (reference) | LED icons | contrast >= 4.5:1; HUD <= 14% at 390x844; ui_hud >= 7 |
| DD47-W1 | dressing | C | SDF silkscreen labels and gold mounting holes | text3d.ts:29; primitives.ts:114-133 | - | label contrast >= 3:1; +6 draws max |
| DD47-PF1 | perf | M | Merge bench props; instanced components with LOD and no shadows for small parts; unshadowed points; budget row | mergeStatic.ts:104; instances.ts:69,75; PostQualityTiers.ts:106-110; report.mjs | - | <= 110 / 90 / 70 draws by tier; JS +20 KB max; fps within 15% |
| DD47-PR1 | perf | M | Proof: 7 targets, look judgement, sibling judge vs Bellkeeper's Walk, Duneglide, blockfall, vault-breakers, heatsink, bunker-zero; new poster | game-luma-targets.ts:67; judge.ts:14-15; rubric.ts:14-18; define.ts; build-card-images.mjs | - | same_game false >= 0.8 vs all 6; every category >= 7; 0 warnings; poster no longer navy (11,24,77) |

#### WP-24 (G14) cross-hop: "Tabletop toy diorama through a tilt-shift lens"

- **Code:** `apps/showcase-cross-hop/src/game/core.ts` (buildLookGroup :243-276, buildScene :304-404, swapLook :641-683, paintLane :857, paintDressing :911), themes.ts, main.ts.
- **Today:** six themes via `looks.preset` with fog 0, the look's bloom and fog filtered out, key capped at 1.25 and IBL forced to 0.58; ambient 0.42 + two unshadowed directionals; emissive box sky and sphere sun; all lanes share one white instanced PBR pool; primitive logs, pads and dressing; every critter overridden to one cream material (`core.ts:70`); 2.7:1 strip coin. theme0 mean 101-108, p95 154-165; Emberline 68 and Neon 71 read as the same dusk-blue board; 145-165 draws; textureBytes 284.8 MB.
- **Identity:** a handmade tabletop toy diorama through a tilt-shift lens: felt meadows, painted-wood logs, clay critters and lacquered toy cars on bevelled tiles, one low sun. Themes are a day clock: crisp dawn, overcast noon, amber golden hour, red lava-lit dusk, blue-black lamplit night, pastel studio toybox. Chalk mint, butter yellow, terracotta, slate; coin gold is the accent. Signature: tilt-shift blur bands plus a sun that moves with progress. Keeps clouds minor so it does not read as Cumulus Dash or Serpentine.
- **Engine deps:** E-B (setLight for day-clock blend, runtime look removal), E-C (tilt-shift DOF, selective bloom), E-F (atlas sprites, custom kinds), E-G (sky flag, height fog), E-B (instanced shadow cascade per chunk; `packages/rendering/src/shadows/CascadeUse.ts` joins the E-B file list), E-A (look override keys), E-D (per-instance emissive).
- **Budget:** <= 200 draws desktop High; textureBytes <= 170 MB (today 284.8 MB, no growth over 20 restarts); <= 2,000 particles; +8 MB HDRIs (1k), ~12 MB total with the kit.
- **Meshy (~36 generations, 10 retextures):** coin, 2 logs, lily pad, basalt stone; 6 themed dressing kits and 6 gate arches; rail crossing, tram pole, track; 10 vehicle lacquer retextures; hawk glide/dive clips if missing.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| CH47-01 | lighting | M | One shadowed PCSS 2-cascade sun per theme (dawn 18/220, noon 55/30, golden 10/250, dusk 6/280 low, night moon 35/340 at 0.35, studio 50/25) and hemisphere fill; remove ambient and rim; stop capping key and IBL | lights.ts:24,51; contracts/lighting.ts:12-13,33; contracts/looks.ts:12; `core.ts:243-320,641-683`, `themes.ts` | - | every theme p95-p5 >= 140; darkFrac < 0.05, clip < 0.01; sun row 2 cascades, none skipped; no ambient-flattens/weak-shadow; no lights.ambient |
| CH47-02 | lighting | M | Neon lamp models with 12 pooled sodium/cyan points following the rows; red-orange points over Emberline lava; pulse after E-B | lights.ts:62; quality.ts:80; runtime.ts:150; `core.ts:687,911` | lamp | theme3 p95 >= 170, theme4 >= 180; theme3 bottom third +15%; means 50-80; +15 draws max |
| CH47-03 | env-sky | M | Gradient sky per theme with night stars and light dawn/noon clouds; own HDRI per theme (spruit_sunrise, autumn_field_puresky_1k, venice_sunset, industrial_sunset, rooftop_night, studio_small_08_1k) at 1k | sky.ts:59-63; compiler/sky.ts:18; contracts/flags.ts:16; environments.ts:125; NEW 1k downsample (E-A); `core.ts:341-364,648-677`, `main.ts:65` | 4 downsampled HDRIs | no box sky or sun disc; row 0 vs row 240 differ >= 25 on themes 0-4; +8 MB max |
| CH47-04 | env-sky | S | Per-theme fog colour and density (dawn #b9cfe0 0.012 to night blue 0.016; studio none); height fog | effects.ts:52; compiler/fog.ts:79; `themes.ts`, `core.ts:270` | - | theme0 top-third stddev -30%; player crop spread not lower; fog colours >= dE 10 apart |
| CH47-05 | post | M | Signature tilt-shift DOF focused on the player row, focus updated each frame; off on reduced motion; band mode after E-C | effects.ts:131-145; postBridge.ts:891-901; PostQualityTiers.ts; postBridge.ts:234 | - | top 20% and bottom 10% variance <= 50% of the player band; DOF in stagesRan; absent at quality low |
| CH47-06 | post | M | Per-theme post preset (daylight-outdoor, cinematic-film without its DOF, neon-night, product-studio) and bloom (neonBloom on Neon, 0.5/0.75 on Emberline) | output.ts:15,18; postPresets.ts:39-109; effects.post.ts:27,54,99; `core.ts` buildLookGroup/swapLook | - | 5 distinct preset ids; theme4 clip 0.2-2%; theme0 clip < 0.2%; degrades listed |
| CH47-07 | materials | M | One pool per surface: felt meadow, matte asphalt with lacquer dashes, glossy clearcoat water, gravel with brushed rails, emissive lava 2.5-3; rounded toy tiles | material.ts:95,204,266,295,309,356-360; types.ts:187,209,217; instances.ts:39; `core.ts:15,366-368,857` | - | >= 5 ground materials; river crop spread >= 60; lava mean >= 170; +6 draws max |
| CH47-08 | materials | S | Remove the cream override so Meshy textures show; sheen on furry/feathered critters, clearcoat on robo/astro frogs and vehicles | model.ts; types.ts:187-193; runtime.ts:155; `core.ts:70,387-401`, NEW `src/game/critterLook.ts` | - | player crop spread +25%; thumbnail chroma +15; material >= 7 |
| CH47-09 | assets | M | Meshy coin, 2 logs, lily pad and basalt stone into the existing pools | cli.ts:111-147; optimize.ts:119; instances.ts:64; `core.ts:380-383` | 5 props | coin axis ratio <= 1.3, <= 300 KB; others <= 400 KB and 8k tris; no primitive platform pools; game-checks pass |
| CH47-10 | assets | M | Dressing kit per theme plus a gate arch per theme | admission profiles; prd10/index.ts:116; instances.ts:64-76; NEW `src/game/dressing.ts` | ~26 assets | each <= 600 KB; no sphere canopies; theme0/3/4 pairs same_game false >= 0.8 |
| CH47-11 | camera | M | High diorama camera (y 9.5, back 8.5, ahead 3.0, fov 32), damped follow; crane-down intro, theme lift, death push-in | `core.ts:133,230,546,830`; contracts/camera.ts:53; `main.ts:55-64` | - | player 15-20% of frame height; horizon 18-28% from top; no inside-geometry frames |
| CH47-12 | animation | S | Anticipation squash, stretch at take-off, landing squash; 70 ms turns; one jump clip per hop | runtime.ts:152-165; Juice.ts:103-104; contracts/animation.ts:34; motion/index.ts | - | scale.y 0.75-1.15, never uniform 1.25; yaw <= 45 deg/frame; no double frames; animation >= 7 |
| CH47-13 | vfx | M | Theme-coloured landing dust, log splash + ring, lava sparks, one effect per death kind, coin pickup and combo trail | contracts/effects.ts:5,9-17; effects-api.ts:67; NEW `src/game/vfx.ts`; `core.ts:230,546` | - | >= 8 distinct kinds in the beacon log; death hues >= dE 15 apart; liveCount <= 96 |
| CH47-14 | vfx | S | Ambient per theme: pollen, fireflies over water, rising embers, Neon rain and cones, toybox confetti | effects.ts:165,248,298; weather.ts:19 | - | emitter on every theme but Downtown; <= 2,000; emitter region differs >= 2 over 5 s |
| CH47-15 | dressing | M | Kit scattered along both verges at 3x density with LOD and wind; gate arch with SDF sign every 25 rows; nothing within abs(x) < 17.5 | scatter.ts:177,214,252,267; instances.ts:64-76; text3d.ts:29; Decals.ts:46,495 | - | >= 2.5x dressing instances; unit test over 500 rows; arch visible on theme change; <= 200 draws |
| CH47-16 | dressing | S | Lane furniture: sleepers and crossing arm, reeds, lava crust and steam, tram poles, kerbs | instances.ts:64; effects.ts:248; lights.ts:62; `core.ts:857` | lane furniture | vision names lane type >= 90% |
| CH47-17 | hud | S | `tabletop` HUD theme, paper-tag score, theme banner, captions >= 12 px, licensed font | themes.ts:13,91; index.ts:239; `main.ts:35`, `ui.ts`, `styles.css` | - | all HUD text >= 12 px with opacity >= 0.75; banner within 300 ms; ui_hud >= 7 |
| CH47-18 | perf | M | Stop resubmitting static pools every frame; 1024 px critters; lazy critter and spectator loads; static and impostor far dressing | optimize.ts:119; instances.ts:73-75; runtime.ts:163 | - | <= 200 draws; <= 170 MB textures, no growth over 20 restarts; budget.json |
| CH47-20 | post | M | Art direction (signature "tilt-shift diorama + day clock"); final screens for 6 themes; panel round; sibling judge vs Pip's Big Leap, Chroma Roll, Serpentine, Cumulus Dash | define.ts:146; audit.ts:35; judge.ts:72; game-luma-targets.ts:68 | - | all categories >= 7 (panel); same_game false >= 0.8 vs 4 peers; 6 themes at 25/60 s; 0 warnings |
| CH47-19 | lighting | C | Day-clock blend over the last 5 rows of each theme (needs E-B setLight); only HDRI and preset snap | NEW setLight (E-B); contracts/lighting.ts:33 | - | rows 20-25 change monotonically <= 4 luma/row; no frame jumps > 6 except the swap |

#### WP-25 (G15) strange-orbit-port (Craterline GP): "Gouache on the crater rim"

- **Code:** `apps/showcase-strange-orbit-port` mounts `examples/strange-orbit-port`; rig at `world.ts:208-221`; shaders.ts; materials.ts; palette.ts; race.ts.
- **Today:** hemisphere 1.1, a 53-deg key (2 cascades), cool fill, neutral env 0.9, bloom/grade/vignette, aces. Most pixels come from `material.custom` that hard-codes its own key three times (`shaders.ts:32,193,319`) and its own haze. Planet is a flat backdrop; no fog, flare, DOF, motion blur, VFX or camera layers; rivals are tints of 2 bikes. Menu 86.1, race 42.6 (sky region 36.1), 115 draws, edgeDensity 0.020 (original 0.067). Luma target points at the wrong route (`game-luma-targets.ts:69`).
- **Identity:** a moon race painted in thick oil at permanent planet-rise: terracotta impasto road #d98464 along a jagged crater wall under a low white sun from the left, a huge banded peach gas giant with a ring filling the right of the sky, violet-teal nebula; amber #ecb75f and jade #93ead5 only for objectives. Sectors change key tint and haze. Signature: brush-textured moving painting with long raking shadows. The only off-world racer; avoids Ion Circuit's cyan/magenta.
- **Engine deps:** E-B (setLight), E-C (runtime post, grade writer, LUT, selective bloom), E-D (lit chunk for custom shaders, rim), E-F (atlas sprites, string kinds in burst), E-G (verify env capture of custom domes).
- **Budget:** race <= 150 draws High, <= 120 Low; grain on all tiers but Low; motion blur and CA only during boost on High/Ultra; DOF only in menu/results; 1 spot + 5 points unshadowed; 3 PCSS cascades; textures <= 2k; NEW craterline real-GPU scenario.
- **Meshy (~15 retextures + 5 generations):** gouache retextures of bike, 5 rival liveries, skate rider, pylon, 2 boulders, lander, observatory; gate arch, crystal cluster, paddock dome, grandstand, comm mast.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| SO47-L1 | lighting | M | Raking 18-deg key from the left; GLSL rig moved onto shared uniforms (keyDir, keyColor, fill, hemi, haze) so custom surfaces match engine lights; 3 PCSS cascades | lights.ts:51; contracts/lighting.ts:11-12; runtime.ts:198; `shaders.ts:27-45,193,319`, `world.ts:208-213` | - | track spread >= 1.4x; shadow patch >= 2x rider width; key literal gone (rg 0); cascadeCount 3, pcss |
| SO47-L2 | lighting | M | Planetshine: warm unshadowed directional #ffb48c 0.8 from the planet; cool hemisphere ground | lights.ts:24,51 | - | planet-facing half R/B >= 1.25, far half <= 1.0; rider mean 95-125 |
| SO47-L3 | lighting | S | Sectors drive light: 1.5 s lerp of key and haze per PALETTE_STOP (warm, violet, jade, opal); GLBs after E-B | runtime.ts:198; `palette.ts:39-58`; NEW setLight (E-B) | - | s=200 vs s=450 hue differs >= 25 deg; centre cell RGB distance >= 30 |
| SO47-L4 | lighting | S | Unshadowed headlight spot; red tail points on 5 rivals; `?off=headlight` | lights.ts:62,75; quality.ts:80; `world.ts:396-411` | - | patch 6 m ahead +15; shadow rows unchanged; draws +2 max |
| SO47-E1 | env-sky | M | `environments.capture` of nebula and planet (res 128, once, background false); neutral behind `?env=neutral` | environments.ts:82,102-123; `world.ts:190-197,218` | - | menu bike within ±5% of 124.96; bike chroma 1.3x neutral; source reports capture (needs E-G verify) |
| SO47-E2 | env-sky | M | Planet size 520, lower, banded ring with additive edge, small second moon; nebula shifts per sector | primitives.ts:114-133; materials.ts; `world.ts:231-243` | - | planet and ring 15-25% of race pixels; race sky region 50-70 (36.1) |
| SO47-E3 | env-sky | S | Height term in haze: dense mist below the rim; matching engine fog on GLBs | effects.ts:52-64; `shaders.ts:41-45` | - | middle-row sides stddev <= 0.7x, mean 40-90; GLB vs island within 12 |
| SO47-E4 | env-sky | C | Aurora ribbons in jade sector; meteor streaks every 4-8 s | effects.ts:316; contracts/effects.ts:9,14 | - | >= 6 streaks in 60 s; +3 draws; no aurora on low |
| SO47-P1 | post | M | Painterly grade: split tone inside the custom shaders now; contrast 1.1, saturation 1.08, grain 0.035/1.6; engine split tone and LUT after E-C | effects.post.ts:99,148; composite.glsl.ts:25-31; v2Stages.ts:1221-1253 | craterline-gouache.cube (later) | darkest 5% B-R >= +6, brightest R-B >= +12; grain in stages |
| SO47-P2 | post | S | Boost: motion blur ramp 0-0.6, CA 0.0015 only on boost or zero-G, bloom threshold 0.72 (ramp needs E-C runtime post) | effects.ts:150; effects.post.ts:27,159 | - | border edgeDensity -25% on boost, rider within 10%; clip <= 1% |
| SO47-P3 | post | S | Menu/results DOF on the grid riders; sun lens flare | effects.ts:131; lensFlare.ts:106-121 | - | menu bike edgeDensity >= 2x sky; flare off-screen removes its draws |
| SO47-M1 | materials | M | Gouache retexture of riders, pylon, boulders, lander, observatory | meshy retexture; cli.ts:111; geometry-hash.mjs; textureStats.ts | retextures | hashes same; texture gate passes; judge "same style as track" 3 of 4 |
| SO47-M2 | materials | S | 5 distinct rival liveries; clearcoat hero; rim after E-D | world.ts:404-410; material.ts:266 | 5 liveries | 6 rider crops pairwise RGB distance >= 35; 6 liveries counted |
| SO47-A1 | assets | M | Meshy gate arch and crystal cluster replace roundedBox lintels and cones | optimize --meshopt; import-meshy --profile prop; `world.ts:286-334` | 2 props | primitives only in `?meshy=0` fallback; validate --release |
| SO47-W1 | dressing | M | Jagged crater-rim ring (mineral shader with strata) at 600-900 m; >= 300 instanced boulders and spires with LOD and impostor shadows | instances.ts:63-86; scatter.ts:177,267; `world.ts:336-348`, `course.ts` | boulders | >= 300 rocks in <= 6 draws; edgeDensity >= 0.035; horizon silhouette >= 60% width |
| SO47-W2 | dressing | S | Amber beacon posts every 40 m pulsing for the leader; lit paddock dome and grandstand; comm masts | instances.ts:52-86; runtime.ts:163; text3d.ts:29 | dome, grandstand, mast | paddock >= 10% of start frame; beacons <= 2 draws; beacon crop changes >= 30 |
| SO47-V1 | vfx | M | Pack mapped to race events: terracotta land dust, hit debris + spark, gold dust pickup, amber gate-ring, jade sling via spawn(spec) | contracts/effects.ts:9-22; effects-api.ts:38-53; `race.ts:465,498,568,600,846,1228,1271`; NEW `vfx.ts` | - | each event type logs an effect with liveCount > 0; vfx=off gives 0; tints differ >= 0.2 from defaults |
| SO47-V2 | vfx | S | Amber-to-jade player ribbon and rival trails; atlas smoke/flame exhaust after E-F | contracts/effects.ts:16; effects.ts:280; atlas.ts:8-16 | - | trail >= 120 px on boost; +2 draws for 6 trails |
| SO47-V3 | vfx | C | Tyre-scuff decals at landings and hard leans, fading 6 s | contracts/effects.ts:12,17; Decals.ts:492-501 | - | >= 3 live after 3 landings; >= 20 darker than track |
| SO47-C1 | camera | M | Base fov 64; boost +9 and landing +5 kicks; punch on hard landings; 2 deg lean roll; zero on reduced motion | contracts/camera.ts:38-56; `world.ts:642-668` | - | fov 64 ±1 cruising, >= 72 at boost; roll >= 1.5 deg; kick energy 0 on reduced motion |
| SO47-C2 | camera | S | 4 s countdown sequence with bars (planet wide, grid pan, chase); finish tracking shot; results orbit | contracts/camera.ts:40-41,53,58-70 | - | countdown frames SSIM < 0.5 pairwise with bars; results >= 30 deg off chase |
| SO47-N1 | animation | C | Suspension squash, wheel lift on boost, 25 deg lean, planet spin; optional celebrate clip | Juice.ts:103; contracts/animation.ts:33-55 | optional rig | landing vertical scale change >= 6% |
| SO47-H1 | hud | S | Curved speed/energy arc, sector chip, gap delta, orbit-ring minimap with livery dots | index.ts:179; `ui.ts`, `index.html` | - | no overlap at 390 and 1280; DOM writes only on change |
| SO47-X1 | perf | M | Fix the luma target route to `/apps/craterline-gp/`; add to the sweep; low quality drops extras | game-luma-targets.ts:69; types.ts:2512 | - | race <= 150 high, <= 120 low; race mean 60-95, menu 80-110; darkFrac <= 0.3, clip <= 0.02 |

#### WP-26 (G16) splat-rush-port (Chroma Roll): "Paint carnival at golden hour"

- **Code:** `apps/showcase-splat-rush-port` mounts `examples/splat-rush-port` (world.ts, shaders.ts, backdrop.ts, meshes.ts, fx.ts, main.ts). Deterministic port: `tests/unit/splat-rush-port/reference-replay.test.ts`, `sim.test.ts`, `policy-parity.test.ts`.
- **Today:** no look, post or shadows; tone mapping "none"; every surface is `material.custom` toon with lights hard-coded in GLSL (`shaders.ts:68-73`); 4-stop noon-blue sky with no sun; 56 white clouds; GLBs lit separately by a neutral room; DOM-only juice. 4.5.0 sweep 192.6 mean with 25.83% clipped; after G16 roll 189.4, 0.1% white; 20-25 draws; 31.7-34.4 MB textures; 34 programs.
- **Identity:** a wet-paint ribbon road through a low-sun sky: ink-teal zenith #1f4a63, apricot horizon #f3a96b with a rose band #e8798a, lilac cloud sea #a99bc9 below; paint-pot and palette islands and paint-tube balloons with warm rims and plum ink outlines; the sky moves golden to rose dusk to violet twilight with stars as the run lengthens. Gate colours #f0433a, #f9c647, #5ecaf0, #b868e8 stay the most saturated things on screen. Signature: hand-inked cel paint carnival at sunset. Not noon-blue like Cumulus Dash or Serpentine.
- **Engine deps:** E-D (custom-shader light/fog uniforms, `material.toon`), E-C (selective bloom, grade writer), E-E (outline targets), E-F (real trail, sprites), E-I (look-identity, distinctness).
- **Budget:** <= 48 draws in play (today 22-25); textureBytes <= 45 MB; no program compiles after warm; remote frame time <= 1.3x 4.6.0; card mean 125-150, dark <= 2%, 250+ pixels <= 1%.
- **Meshy (~190 credits):** paint-pot island, palette island with brush tower, paint-tube balloon, crayon spire, easel island; 4 gem enamel retextures.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| CR-00 | perf | M | Presentation-only `?look=original or carnival` (default carnival); original keeps today's constants byte-for-byte; one LOOK table | `main.ts:14,29-35`; NEW `look.ts` | - | replay, sim and parity tests unchanged; original card within LPIPS 0.02 of 4.6.0; rng count identical across looks |
| CR-L1 | lighting | M | Toon lights become LOOK uniforms: sun 16 deg at -35 az #ffc58a 0.75, sky fill #6f8fb8, rose bounce; backdrop engine lights from the same constants | toonSpec `world.ts:47-56`; setUniform `world.ts:493,565`; `shaders.ts:52-79`; lights.ts:24,51; `backdrop.ts:57-62` | - | unit test: toon sun equals backdrop key direction; ball lit/shadow >= 1.35; deck R/B >= 1.12 |
| CR-L2 | lighting | M | Warm fresnel rim in the toon program, stepped like the ramp | `shaders.ts:52-79`; customMaterial.ts:72 | - | ball outer ring >= 15 brighter than body on the lit side |
| CR-L3 | lighting | M | kloppenheim_06_puresky_1k IBL (background off) for GLBs, recalibrated; fallback preset "sunset" | environments.ts:10,69,125-135; `backdrop.ts:53,57` | HDRI copy + attribution | GLB region 135-160 (176.5), R/B >= 1.15; gem highlights >= 2% at 230+ |
| CR-S1 | env-sky | M | 5-stop sunset sky with a 1.6 sun disc and halo, cirrus bands, run-length time of day (golden to rose to violet with 120 stars) from read-only distance | `shaders.ts:81-104`; `world.ts:74` | - | card top row 70-110 (~180), mid sky hue 15-45 deg (~200); 500/3,500/6,500 m tops differ >= 15 |
| CR-S2 | env-sky | M | Sunset-lit clouds (apricot tops, lilac shadows); scrolling lilac cloud-sea plane under the road | `world.ts:220,371-379,438-441`; NEW cloud-sea fragment | - | bottom row 90-130, hue 250-290; white pixels < 0.3%; +1 draw |
| CR-S3 | env-sky | M | Horizon haze: exp2 to the LOOK horizon colour in toon shaders; matching engine fog for GLBs | effects.ts:52; `shaders.ts`, `backdrop.ts` | - | far road within 20 of sky above; near road keeps 2.5x far stddev |
| CR-P1 | post | M | Bloom 0.45/0.92/0.5 (sun, gems, flashes only); warm engine vignette; grade 1.06/1.08; tone mapping stays none | effects.post.ts:27,99,136-145; `fx.ts` | - | bloom and grade ran; 250+ pixels <= 1%; sun area +10; deck within 4 |
| CR-P2 | post | S | Plum ink outlines with the edge pass; per-object targets after E-E | effects.ts:105-114 | - | edge pixels 3-8% in bottom rows, < 0.5% in top row; outline stage ran |
| CR-P3 | post | C | Title-only DOF on the ball (drop if the runner tier skips DOF) | effects.ts:131-145; `main.ts:192-202` | - | DOF on splash; islands variance -40%; roll frames within LPIPS 0.01 |
| CR-M1 | materials | M | Wet-paint gloss on ball and splatters; splatters dry over 2 s | `shaders.ts:26-37,52-79`; `world.ts:425,580` | - | fresh splats 3-10% at 235+, older < 1% |
| CR-M2 | materials | S | Painted-canvas deck (weave and brush streaks, no texture); plum enamel rails | `shaders.ts:66`; BATCH_IDS `world.ts:359` | - | deck stddev >= 8 with mean within 10 of 150; rails 40-80 |
| CR-M3 | materials | S | Paint-drip gate arches merged into the gate mesh, same footprint | `meshes.ts:113,119,132`; `meshes.test.ts` | - | x/z bounds pinned; gates one batch; >= 3 drip tips |
| CR-A1 | assets | M | 5 paint-world backdrop kinds; PIECES 12 -> 16 by the same rule | cli-help.ts:42,44; `models.ts:13`, `backdrop.ts:29-45` | 5 GLBs <= 15k tris, 512 px | validate --release; game-checks 0 errors; <= 45 MB; all 5 kinds on screen |
| CR-A2 | assets | S | Enamel gem retextures with gold rims | meshy retexture; geometry hash | 4 retextures | hash same; pickup saturation >= 0.55 |
| CR-V1 | vfx | M | Gate-coloured `paint-splash` burst on matches and pickups (seeded from the sim step, camera false); double on PERFECT | contracts/effects.ts:14-19; effects-api.ts:47,385; flags.state.ts:36; `main.ts:183`; NEW `vfx3d.ts` | - | liveCount > 0 within 3 frames; replay unchanged; vfx=off within LPIPS 0.01; peak <= 48 draws |
| CR-V2 | vfx | S | In-game ribbon of the last 12 ball positions in the ball colour (engine trail is a stub until E-F) | `world.ts:58-60,142`; effects-api.ts:246-249 | - | ball-colour pixels >= 0.4% behind the ball; +1 draw; hidden on reduced motion |
| CR-V3 | vfx | C | Low-sun shafts through islands, only if S4 proves it renders | effects.ts:82-94 | - | S4 ran; rays +8 vs off; otherwise dropped |
| CR-V4 | vfx | C | Paint motes near the horizon and drips from paint-pot islands | effects.ts:248; contracts/effects.ts:26 | - | 2 emitters, <= 2 draws; >= 20 specks on title |
| CR-AN1 | animation | S | Wobbling gate drips and a 0.25 s squash-and-splat on match, vertex-shader driven | `shaders.ts:26-37`; customMaterial.ts:11,72 | - | idle drips move > 2 px; matched gate gone in 0.3 s; replay unchanged |
| CR-AN2 | animation | S | Balloon sway, island rocking, easel stroke reveal, pure functions of time | `backdrop.ts:74-85` | - | deterministic poses; tilt within ±6 deg over 60 s |
| CR-C1 | camera | S | Presentation bank roll (max 3 deg) and +3 deg speed FOV layers; off on reduced motion and manual=1 | contracts/camera.ts:51-52; CameraController.ts:138,447; `world.ts:635-636` | - | layers with energy; roll within ±3; replay unchanged |
| CR-C2 | camera | S | 3 s title rail fly-in with bars; 8 s game-over orbit; skip setPose while playing | contracts/camera.ts:39-41,53,57,64 | - | rail rig at splash; first input ends it; results yaw differs >= 10 deg over 2 s |
| CR-H1 | hud | S | Paint-world HUD (swatch chip, paint-tube combo meter, brush popups, deckled paper cards, plum ink); licensed display face only | `index.html:11-37`; `main.ts` updateHud | licensed face | no system/Trebuchet font; contrast >= 4.5:1 at all sky stages; mute hit test passes |
| CR-W1 | dressing | S | Festival bunting in the 4 gate colours on poles every 26 m; deck-edge drips | `world.ts:142`; `meshes.ts` | - | +2 draws; bunting both sides; gate vs bunting dE >= 25 |
| CR-W2 | dressing | C | Horizon silhouette ring of crayon spires and towers in violet haze | `world.ts:371-379` | - | +1 draw; >= 30 vertical luma steps per row |
| CR-PF1 | perf | M | Warm every new program; diagnostics per state; sibling judge vs Cumulus Dash and Serpentine | `world.ts:77-82`; `main.ts:301`; spec :52; judge.ts:15 | - | <= 48 draws; <= 45 MB; no compiles after warm; frame <= 1.3x; card bands; different-game on >= 7 of 8 trials vs each |

#### WP-27 (G17) serpentine-sky-run-port: "Mythic dusk pilgrimage on a sky serpent"

- **Code:** `apps/showcase-serpentine-sky-run-port` mounts `examples/saiyan-snake-way-port` (world.ts, shaders.ts, materials.ts, sim.ts, hero.ts, hud.ts).
- **Today:** no look, HDRI, fog node, grade or vignette; hemisphere 1.1, neutral env 0.9, one 1-cascade sun; bloom 0.12 at 0.95; tone mapping none; pixelRatio 1; unlit custom sky, road and props; runner is a TypedGLBActor drawn outside the scene graph and tinted per colourway; primitive VFX pools (22 boxes, 18 + 14 spheres). Mean 189-192; runner crop darker than its surroundings (193.4 vs 206.0); road tile moire past 30 m; all 8 stages share one sky; 115 draws, 0 instanced batches, 105.8 MB textures.
- **Identity:** a mythic dusk pilgrimage along the back of a sky serpent: a road of mother-of-pearl and jade scales with a glowing gold spine over a molten-gold cloud sea, a low sun ahead backlighting the runner into a hot rim silhouette under indigo-to-coral. The 8 stages are one evening as a colour script (rose, amber, dusty copper, red lacquer, storm violet, lightning, moonlit indigo, white-gold sunburst). Indigo #1c1640, coral #ff7a6b, cloud gold #f2b33d, pearl-jade #7fe0c4. Signature: the stage colour script on a scaled serpent road. Not Roadster Hours' redline sunset (coastal road), not noon cloud runners.
- **Engine deps:** E-B (setLight), E-C (runtime post handles, white balance, LUT, selective bloom, god-ray receipt), E-D (sun/fog uniforms for custom, instanced custom material, rim), E-F (preset names in burst, atlas), E-H (TypedGLBActor layers, root-source shadows), E-I (sibling judge mode, KTX2 encoder).
- **Budget:** <= 95 draws in the capture state, <= 140 worst stage on High, <= 110 Medium; <= 450k tris; <= 80 MB GPU textures (<= 70 MB at capture); new GLBs <= 6 MB; god rays and motion blur High only, +20% frame time max; JS +25 KB max.
- **Meshy:** colossal serpent head, red-lacquer pavilion, 3 spires, stage gate with banners, prayer-flag line; runner colourway retextures; lantern retexture with emissive.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| SSR-01 | lighting | M | STAGE_LOOK table (8 rows: sun, sky, fog, cloud tint, exposure, bloom), blended over 120 m at stage boundaries; read-only `stageAt` | `sim.ts:95-104,127`; runtime.ts:197-198; contracts/lighting.ts:33; output.ts:11,19; NEW `colorScript.ts` | - | neighbouring stages' top-third dE2000 >= 12, any pair >= 8; replay and sim tests unchanged |
| SSR-02 | lighting | M | Backlit runner reads: violet camera-side fill 0.6; hemisphere 1.1 -> 0.6; env 0.9 -> ~0.6 | lights.ts:24,51; environments.ts:82; `world.ts:161-166,178-180` | - | runner crop >= +15 over the verge (today -12.6); mean 140-170; 390x844 runner >= 10 over mean |
| SSR-03 | lighting | M | Sun shadows: 2 cascades over 140 m, PCSS, contact shadows; check the runner is a caster (E-H verify); remove the blob after | contracts/lighting.ts:12-13,23; effects.lighting.ts:21-31; `world.ts:180,254,407-413` | - | sun cascadeCount 2 sampled; feet patch >= 35 darker shadow on vs off; within MAX_LUMA_DROP |
| SSR-04 | env-sky | M | Sky shader: uniform sun dir and fog, sun disc with corona, horizon band, indigo zenith with stars, lit cumulus top over a darker under-deck, moon in DROWSE | material.ts:59; `shaders.ts:37-42,302-381`; `materials.ts:104` | - | top third p5 <= 60 and p95 >= 220 at stages 1, 2, 8; cloud cells stddev >= 25; compile time +10% max |
| SSR-05 | post | M | ACES tone mapping with recalibrated palette; grade per stage; vignette 0.22; bloom 0.45/0.85 | output.ts:10; effects.post.ts:27,99-112,136-146; `main.ts:456`, `world.ts:273-275` | - | clip <= 0.03 and darkFrac <= 0.4 (DROWSE 0.6); road cell <= 215 while orbs hit 250; bloom and vignette ran |
| SSR-06 | post | S | God rays and sun lens flare at low-sun stages 1, 2, 3, 8 | effects.ts:82-94; postBridge.ts:879-890; v2Stages.ts:10,595; lensFlare.ts:40,111 | - | god-ray stage at High; sun-side +8; frame +15% max; NEW god-ray receipt |
| SSR-07 | post | S | Motion blur with speed > 60, CA pulses on surge and roll, DOF only in outro and results; all off on reduced motion | effects.ts:131,150-164; effects.post.ts:159-166; NEW runtime post handles (E-C) | - | corners variance -20% at top speed, runner keeps 90%; no blur/CA stages on reduced motion |
| SSR-08 | materials | M | Living serpent road: overlapping scales, view-angle pearl sheen, jade-pearl ramp, pulsing gold spine wave, belly scales, fwidth antialiasing, per-stage scale tints | material.ts:59; `shaders.ts:158,172`; `materials.ts:55`; `world.ts:185-196,323-324` | - | far-road frame diff <= 50% of today; road hue stddev >= 15 deg; middle third <= 190 |
| SSR-09 | materials | S | HDR orb cores with fresnel shells; per-type power-up shells; emissive lanterns at dusk; rim after E-D | `materials.ts:46`; `world.ts:25,258-270`; overrideMaterial.ts; TypedGLBActor.ts:215 | - | orbs >= 250 with a 3 px halo; lanterns +60 at stages 4, 7; material >= 7 |
| SSR-10 | assets | M | Serpent head on the horizon at the final stage, lacquer pavilion, spire and pagoda islands, gate arch; runner colourway retextures replace setTint | cli.ts:111; admission.ts:35-40; prd10/index.ts:116; `models.ts`, `world.ts:546` | see Meshy | validate --release; head and spires <= 6 draws; runner hash same; modeling >= 7; provenance checks 0 |
| SSR-11 | dressing | M | Prayer flags and lanterns every 18 m along the verges; instanced islands in 3 parallax bands with impostors; SDF stage boards; fog far to ~1,600 m | scatter.ts:177,252,267; instances.ts:64-91; text3d.ts:29; `road.ts` | - | >= 12 instances in frustum across the 3 bands; within budget; environment >= 7 |
| SSR-12 | vfx | M | Engine runtime effects replace primitive pools: jade/gold pickups, pearl chips, cloud puffs, surge aura; runner trail on surge and flight | contracts/effects.ts:9,14,16,19; effects-api.ts:38-53; NEW `vfx.ts`; `world.ts:169-170,255-256` | - | liveCount rises on every scripted event; nodeCount -32; colours unused by other games |
| SSR-13 | vfx | S | Petals and embers, cloud wisps replacing box streaks, BROKEN SPINE rain with sim wind and lightning flashes, soul tails | effects.ts:165-177,248; output.ts:17,20; atlas.ts:8-15 | - | >= 2 lightning flashes (+25 mean, 1-3 frames) in 16 s; rain directional ratio >= 1.5; <= 10k particles |
| SSR-14 | animation | S | Lean up to 12 deg into bank and lane change; aura pulse with kiPulse; Hit_React blended over Run_Loop (needs E-H) | TypedGLBActor.ts:186; `world.ts:289,376-380,402-403`; motion/index.ts:5; doubleFrame.ts | - | foot slide <= 0.1 m per stride; no popped frame across a hit; lean >= 8 deg |
| SSR-15 | camera | S | 4 s intro from the serpent head with bars; 1.2 s stage-start push past each gate; bank-following roll; surge FOV kick; leap orbit; setPose skipped during sequences | contracts/camera.ts:39-40,48,52-55; `world.ts:513-524`, `presentation.ts` | - | shots in evidence; replay unchanged; reduced motion skips push and kick |
| SSR-16 | hud | S | Indigo lacquer panels with gold hairlines; Canela or GT Sectra titles; serpent progress bar; jade SPARK and coral STRAIN | `index.html`, `hud.ts`, `public/fonts/local.css` | display face | fonts check 0; contrast >= 4.5:1; no overlap at 390x844; ui_hud >= 7 |
| SSR-17 | dressing | S | Per-stage set pieces (soul column, pavilion with warm point pair, visible coils, cracked glowing plates, DROWSE mist, tail into the sunburst) | lights.ts:62; models.ts; output.ts:17,20 | - | stage frames pairwise SSIM <= 0.6 and dE >= 8; pavilion region +40 |
| SSR-18 | perf | M | Instanced orbs, souls and power-ups via instances.sphere + emissive; KTX2 when the encoder exists; custom glow on instances after E-D | instances.ts:23; runtime.ts:156,163; material.ts:95,142; AssetDecoders.ts | - | capture <= 95 draws with >= 3 instanced batches; textures <= 70 MB; fps not lower |
| SSR-19 | perf | M | Written budget and gate; Medium/Low drop god rays, motion blur and the second cascade | types.ts:2509; CONTRACTS.md:1960; quality.ts:53-98; NEW `evidence/serpentine-sky-run-port/budget.json` | - | 8 stage targets within budget; `run.mjs --strict` exits 0 |
| SSR-20 | post | M | Proof: 8 stages at 1280 and 390, panel judgement, final screens, sibling judgement vs cloud-runner-port, ninja-runner-port, pips-big-leap, roadster-hours-port | capture spec; metrics.py:316; judge.ts:153; NEW `--mode sibling` (E-I) | - | every category >= 7 (panel); darkFrac <= 0.4, clip <= 0.03; dE2000 >= 20 and SSIM <= 0.5 vs the 4 siblings; departures in PORTING-NOTES.md |

#### WP-28 (G18) drift-and-deliver-port (Gridlock Courier): "Last shift on the harbour"

- **Code:** `apps/showcase-drift-and-deliver-port` mounts `examples/drift-and-deliver-port` (look.ts, sky.ts, city.ts, textures.ts, models.ts, props.ts, chase.ts, shift.ts, main.ts); line numbers from `audit-fix/g18`.
- **Today:** kloppenheim_06 HDRI tinted #ffc890 (shared with Lamplight Line and the golden-hour look); one 21-deg sun with 2 cascades; fixed peach sky; flat orange skyline with no fog; dry uniform road; beige facades with fixed 0.6 windows; matte cars; flat pickup blobs; no practical lights, VFX or DOF. Drive mean 113, p5 66, p95 170, saturation 0.15; 83 draws.
- **Identity:** a pastel hillside port town just after summer rain; the 3:00 shift runs the sun down from golden light to sunset to blue hour. Wet charcoal streets, puddles mirroring the sky, sodium lamps and shop windows coming on block by block. Asphalt #2b2f36, terracotta #d9765f, mint #9fd8c4, cream #efe3cf; courier teal #22c3c9 reserved for the car, drop-off beacon and minimap; sodium #ffb347; tail red #ff3b3b. Signature: the delivery beacon. Separated from the other racers by wet-street reflections, pastel districts and in-run time of day.
- **Engine deps:** E-B (setLight for per-frame time of day), E-C (SSR, grade writer, LUT, selective bloom, runtime post), E-F (sprite bursts), E-G (world water export, velocity MRT), E-D (fog for custom, rim).
- **Budget:** drive <= 130 draws (83 today); <= 1.3M tris; <= 22 MB download; fps within 15% of 4.6.0; shadow-pass draws reported separately.
- **Meshy (~725 credits):** 5 car retextures; 3 pickups; 5 landmarks (cranes, boats, hotel, funicular, market hall); 6 sidewalk props; rigged pedestrian.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| GC-L1 | lighting | M | venice_sunset (1k) replaces the shared HDRI; drop the warm tint; rotate env to the new sun | environments.ts:54,125; contracts/lighting.ts:32; `look.ts:23-24,239` | venice_sunset 1k | only this game uses it; env source names it; <= 1.5 MB; darkFrac <= 0.10, clip <= 0.02 |
| GC-L2 | lighting | M | 12-15 deg sun raking the avenues; 3 cascades, 220 m, PCSS; traffic and props cast | lights.ts:51; contracts/lighting.ts:7-8; instances.ts:63-86; quality.ts:78; `look.ts:242`, `models.ts:57`, `props.ts:108`, `sky.ts:8` | - | 25-45% of road in shadow; cascadeCount 3, pcss; bottom p5 <= 35 (62-67) |
| GC-L3 | lighting | S | Contact shadows for cars, posts, props | effects.lighting.ts:22-31; contactShadowKey.ts | - | pass executed; no weak key; under-car crop >= 20 darker |
| GC-L4 | lighting | M | Pool of 16 sodium points moved to the nearest lamps every 0.5 s; shown from sunset; 4 warm shopfront fills at blue hour | lights.ts:62; runtime.ts:150,154,289; quality.ts:80; `city.ts:385-399` | - | >= 6 lamp pools 25 over surround at 2:50; draws unchanged; no dropped features |
| GC-L5 | lighting | S | Headlight spots and brake tail point; lens flare in the results orbit | lights.ts:6,75; lensFlare.ts:111; runtime.ts:150-154; `main.ts:368` | - | road ahead +30 with headlights; brake halo +15 |
| GC-L6 | lighting | M | Time of day from the shift clock: golden, sunset, blue hour (moon fill); interim setScene swap under an overlay fade at the 2 boundaries; per-frame setLight after E-B | contracts/lighting.ts:32-33; output.ts:17-19; runtime.ts:327; `shift.ts:11`; NEW PHASES table | - | 0:10/2:00/2:50 means 115/85/55 ±10; top hue 20-40 to 200-240 deg; darkFrac <= 0.5; switch <= 1 frame over 100 ms |
| GC-S1 | env-sky | M | Time-driven sky shader: colours, sun disc, post-rain cumulus, stars from blue hour | material.ts:59-67; customMaterial.ts:469; runtime.ts:196; `sky.ts:22-46` | - | uniforms match PHASES; sunset top saturation >= 0.25; >= 30 stars; no recompiles |
| GC-S2 | env-sky | M | Skyline aerial perspective via a3dFogExp2 and lit windows at dusk | fog.glsl.ts:7; `sky.ts:48-67`, `city.ts:301` | - | horizon band within 20 of sky; >= 1% lit windows at blue hour |
| GC-S3 | env-sky | S | Cool harbour mist per phase (#c9d6dc, #b88c86, #2a3550); runtime blend after E-B | effects.ts:52; atmosphere.ts:20; LiveAtmosphere.ts:178 | - | golden far third warm fraction <= 0.2; 150 m silhouettes >= 15 contrast |
| GC-S4 | env-sky | S | Animated harbour water shader (normal octaves, fresnel, glitter path, quay foam) until world.water is exported | runtime.ts:196; world/index.ts:30-47; `look.ts:260`, NEW `water.ts` | - | water moves >= 3 over 1 s, buildings < 1; sunset >= 0.5% water pixels > 220 |
| GC-S5 | env-sky | C | Sunset god rays down the canyons | effects.ts:82; postBridge.ts:879-890; PostGraph.ts:213 | - | S4 only at sunset; sun area +12; frame +10% max |
| GC-M1 | materials | M | Wet asphalt roughness canvas (puddles 0.04), darker albedo, follow-car box probe; SSR after E-C | material.ts:211; probes.ts:45; contracts/lighting.ts:30; effects.ts:119; postBridge.ts:920; PostGraph.ts:207-211; `textures.ts:43` | - | sunset road spread >= 120; >= 1% bottom pixels > 200; texture <= 2048 |
| GC-M2 | materials | M | Pastel stucco districts (harbour, old town, downtown glass); normal canvas; window emissive 0.15 day to 1.4 blue hour on a seeded mask | types.ts:172-275; runtime.ts:155; `city.ts:20,51,159-212`, `textures.ts:256-341` | - | golden mid saturation >= 0.25 with >= 3 hue clusters; >= 3% lit windows; city draws unchanged |
| GC-M3 | materials | M | PBR retexture of courier (teal, cream roof, orange stripe, rack) and 4 traffic GLBs | admission.ts:38; geometry-hash.mjs; material.ts:324 | 5 retextures | hashes same; >= 2% courier specular; courier vs road >= 40 |
| GC-M4 | materials | S | Instanced Meshy parcel, express tag and care box pickups with glow discs | instances.ts:63-86; runtime.ts:163; material.ts:95 | 3 props | +6 draws max; kind hues >= 40 deg apart; <= 0.5M tris |
| GC-A1 | assets | S | District landmarks; rotating lighthouse light cone | `models.ts:15`; `props.ts:28,105`; effects.ts:298 | 5 landmarks | judge names the district in >= 4 of 5; +8 draws, +150k tris max |
| GC-A2 | assets | M | Fix furniture scale (signals 4.2 m, lamps 5 m); scattered sidewalk props registered as solids | scatter.ts:89,177; instances.ts:63-86; `models.ts:61-68`, `city.ts:445` | 6 props | signal head 4.0-4.4 m; props in the solids list; +12 draws max |
| GC-V1 | vfx | M | Tyre smoke preset while drifting, ring-buffer skid ribbon fading 20 s, nitro trail and speed lines | contracts/effects.ts:14-22; geometry.ts:25; runtime.ts:200; GameFeel.ts:101; NEW `fx.ts` | - | liveCount >= 12 after a 3 s drift; >= 100 skid quads; +3 draws max |
| GC-V2 | vfx | M | Signature delivery beacon: 70 m teal light pillar, objective ring, SDF address board; delivery ring burst, teal flash, camera punch | effects.ts:298; prefabs/index.ts:7,70; text3d.ts:29; contracts/effects.ts:9,14; output.ts:17; contracts/camera.ts:38,51; `main.ts:247,336` | - | beacon >= 40 px from 300 m and +30 over sky; delivery +25 peak, recovers in 300 ms; signatureEffect declared |
| GC-V3 | vfx | C | ~600 festoon bulbs (1 draw) from sunset; intro drizzle that stops at 0:20 | instances.ts:21-60; weather.ts:19 | - | +1 draw; bulbs >= 0.3% at 230+ with halos |
| GC-P1 | post | M | Bloom 0.55/0.9, grade 1.14/1.12 (from 1.38), vignette 0.28, grain 0.025, ACES vs neutral compared, motion blur 0.3 on High | effects.post.ts:27,99,136,148; effects.ts:150; output.ts:9-11; `look.ts:247-249`, `main.ts:78,741` | - | golden p5 <= 35 and p95 >= 205 (66/170), clip <= 0.02; stages ran on High |
| GC-P2 | post | S | Per-phase LUTs or temperature (blocked on E-C) | effects.post.ts:99; composite.glsl.ts:25-26; v2Stages.ts:1218-1252 | 3 .cube LUTs | LUT on/off hue >= 8 deg, luma within 5 |
| GC-P3 | post | C | Tilt-shift toy-city pass on title and results only | effects.post.ts:180; contracts/post.ts:36; NEW `tiltshift.ts` | - | title bands <= 0.4x middle variance; gameplay within 0.5 luma |
| GC-C1 | camera | S | 6 s skippable intro (harbour, rail down the avenue, chase); first-delivery side shot; blue-hour results orbit | contracts/camera.ts:40-42,49,53; rigs static/rail/orbit; cameraClear.ts:65 | - | no eye inside buildings; skip in 1 frame; replay hashes unchanged |
| GC-C2 | camera | M | Chase framing: back 5.0, up 2.1, fov 60; 3 deg drift bank | `chase.ts:30-37`; contracts/camera.ts:43,47 | - | courier 15-20% of height; evidence fraction 0.15-0.20; no camera-in-building frames |
| GC-H1 | hud | S | Dispatch HUD: paper ticket card, DELIVERED stamp, analog dial, district-tinted minimap; fonts from /fonts/local.css only (not motorsport/Barlow) | `index.html`, `main.ts:18,442`; themes.ts:39 (not used) | optional icons | text >= 13 px, no overlap at 390/1280; ui_hud >= 7; no outside fonts |
| GC-H2 | dressing | C | SDF district banners, street plates, drop-off boards; bus lanes and loading boxes in road paint | text3d.ts:29; `textures.ts:43-193`, `main.ts:336` | - | +6 draws max; board glyphs >= 14 px at 30 m |
| GC-H3 | dressing | M | Art direction (palette, reserved teal, signature `delivery-beacon`, budgets) | define.ts:107,113,146; audit.ts:35; NEW `art/direction.ts` | - | audit passes; game-checks 0 errors and 0 warnings |
| GC-AN1 | animation | S | Car pitch and roll from presented state; braking traffic tints its tail lights | runtime.ts:152,163; `presentation.ts:18`, `world.ts` (braking flag) | - | roll 0 straight, >= 3 deg in drift; replay hashes unchanged |
| GC-AN2 | animation | C | 12-16 recycled near-field pedestrians that step back from the car | animation-asset-validator.ts; runtime.ts:164; footSlide.ts:31 | rigged walker | <= 16 skinned draws; >= 3 walkers in frame; slide < 5 cm |
| GC-PF1 | perf | M | Budget and per-phase targets | types.ts:2509; game-luma-targets.ts:72; NEW `evidence/drift-and-deliver-port/budget.json` | - | <= 130 draws; <= 1.3M tris; <= 22 MB; fps -15% max; blue-hour darkFrac <= 0.5; clip <= 0.02 |
| GC-PF2 | perf | M | Sibling judge vs the 7 other racers; rubric | evidence judge; look judge --validate | - | same_game false >= 0.8 on >= 7 of 8 frames per pair; every category >= 7, lighting/environment/atmosphere >= 8 |

#### WP-29 (G19) heatsink-port (Ion Circuit): "Alien blue-hour canyon"

- **Code:** `apps/showcase-heatsink-port` mounts `examples/heatsink-port` (world.ts, shaders.ts, materials.ts, models.ts, map.ts, hud.ts). Lane G19 (`audit-fix/g19`) adds a neutral env, blob shadow, target silhouettes, lite models and reduced motion. IDs here use the prefix `IC-` (not to be confused with Iron Crown's `IC47-`).
- **Today:** almost the whole world is `material.custom` whose `lit()` scales everything by 0.26 (`shaders.ts:37-41`) and fogs with one teal; engine key at 52 deg and the shader sun at 13 deg disagree; models never cast shadows; heat uniforms skip the drone; district colours used only on gate veils. Mean 49.3, p50 31, bottom row 20-28, darkFrac 3.1%; 55-90 draws.
- **Identity:** an alien blue-hour canyon: an obsidian-glass causeway mirroring a violet aurora and a large ringed planet, a magenta-to-amber sunset band, cyan mineral veins and bioluminescent crystals lighting the rock. Teal haze #0f3a40, violet #9f8cff, magenta #ff5ab4 to amber #ffb02e, copper drone #c8743a, ion cyan #40e0ff for boost and objectives; each district tints fog with its HUD colour. Signature: the ion wake. The only coloured-twilight racer. Target mean 62-75.
- **Engine deps:** E-D (a3d_ibl, a3d_lights chunks; per-frame emissive setter), E-C (grade writer, stage trace, selective bloom), E-F (real trail, presets in spawnEmitter), E-G (verify capture of custom domes), E-I (triangle/texture counters, real-GPU scenario).
- **Budget:** desktop High <= 140 draws; GLB tris <= 450k; texture bytes <= 160 MB; Low (coarse pointer or fps < 30 for 3 s) <= 90 draws with GTAO, motion blur and god rays dropped.
- **Meshy (~300 credits):** sentry and heavy drones; 3 crystal clusters; fossil ribcage arch; cliff dwelling and needle spire (impostors); drone2 copper retexture. CC0 basalt set and lichen mask via assets add.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| IC-01 | lighting | M | Twilight `lit()`: hemisphere from a3dSkyGradient fed by the map sky; warm sunset bounce; violet top fill; scale 0.26 -> 0.45; road albedo 0.30-0.38 | `shaders.ts:37-41`; `materials.ts:26-32,118`; `map.ts:611-640`; sky.glsl.ts:3; author/index.ts:46 | - | bottom cells >= 40 (20-28); p50 >= 50; darkFrac <= 0.02; clip <= 0.01; shaders-compile passes |
| IC-02 | lighting | M | Moving glow pools from the 4 nearest emitters packed into mat4 uniforms; 2 moving points for the GLBs | customMaterial.ts:79,272; `world.ts:327-328`; lights.ts:62 | - | road near the first pad +25; draws +0 |
| IC-03 | lighting | S | Engine key matches the shader sun ([220,92,-248], #ffe0dc, 2.9); drone casts; 3 PCSS cascades over 220 m; pylons via shadowLod lod1 | contracts/lighting.ts:11-12; `world.ts:102`; `models.ts:30,90`; instances.ts:75 | - | shadow map rendered; under-drone -12; model luma within ±8% of G19's calibration; +6 draws max |
| IC-04 | lighting | M | environments.capture of the dome (or a dusk HDRI rotated to the sun if capture misses custom domes) replaces the neutral room | environments.ts:102-131; g19 `world.ts`; `tests/unit/heatsink-port/environment.test.ts` | optional dusk HDRI | env reports capture or hdri; drone hue +15 deg toward 260-290; drone luma 60-85 |
| IC-05 | env-sky | M | Sky dome: magenta-amber band at the sun azimuth, 1.6x planet with crescent and ring shadow, drifting aurora at 1.35, twinkling stars, teal below the horizon | `shaders.ts` sky; `materials.ts`; `map.ts:672,715`; sky.glsl.ts:9 | - | darkest top cell >= 65 with spread >= 25; hue peaks 170-200 and 290-330; clip <= 0.01 |
| IC-06 | env-sky | S | District atmosphere: fog colour blends 30% toward each district HUD colour over 120 m; neon and posts tinted | `world.ts:29-30,108,327`; `map.ts:294-420` | - | row-2 hue differs >= 20 deg between the #c9a0ff and #ffb02e districts, adjacent >= 8; +0 draws |
| IC-07 | env-sky | S | God rays from the low sun through arches; sun lens flare | effects.ts:82; postBridge.ts:582,884; lensFlare.ts:100-125 | - | no dropped passes; sun cell +12; fps -15% max |
| IC-08 | post | M | Own post stack: agx vs aces by rubric; bloom 0.6/1.0 with veins above 1.5 HDR; GTAO 4x4; motion blur; CA 0.0012; grain 0.025; vignette 0.28 with afterburner pulse; reduced motion drops blur and pulse | output.ts:10,19,22; effects.post.ts:67,136,148,159; effects.ts:150; v2Stages.ts:615,733; `main.ts:253` | - | stages include S2:gtao-4x4 and mb=true, no velocity skip; no dropped passes; clip <= 0.01, p95 <= 235; post >= 7 |
| IC-09 | post | S | Teal-shadow, amber-highlight split tone: contrast/saturation 1.08 now; temperature and split after E-C | effects.post.ts:99; postBridge.ts:921-936; composite.glsl.ts:25-31 | - | chroma +6% now; later dark pixels hue 175-200, bright 25-45 |
| IC-10 | materials | M | Obsidian-glass causeway: fresnel sky reflection, lit hex seams, district-tinted veins above 1.5 HDR, ion pulse at drone speed | `shaders.ts:44+`; `materials.ts:34`; author/index.ts:46; `world.ts:317` | - | bottom-centre mean >= 45 and spread >= 60; material >= 7 |
| IC-11 | materials | M | Triplanar CC0 basalt with lichen mask and cyan bioluminescent lichen (violet in 2 districts) | triplanar.glsl.ts:8; author/index.ts:64; customMaterial.ts:238,273; textureStats.ts | basalt set, lichen mask | gates pass; side cells >= 55 with spread >= 70; +8 MB max |
| IC-12 | materials | S | Heat visible on the drone: 8 quantised emissive steps copper to white-hot via setMaterialOverrides; clearcoat 0.6; per-frame setter after E-D | contracts/materials.ts:21-33; `world.ts:254-256`, `models.ts` | - | heat 1 vs 0: red +30, blue ±5; no hitch over 10% |
| IC-13 | assets | M | Meshy sentry and heavy targets replace primitives; lens/vent flash on hit | admission.ts:36; `models.ts:14`; g19 `world.ts` | 2 models | validate --release; <= 15k tris, 3 maps at 1024; judge sees 2 enemy types; +4 draws max |
| IC-14 | assets | S | 3 crystal-cluster variants instanced with 2-level LOD, district emissive | instances.ts:63-86; scatter.ts:177; `world.ts:94-95` | 3 clusters | +6 draws max; <= 20k tris each; >= 60 coarse colours (36-45 today) |
| IC-15 | assets | S | Fossil ribcage arch every 240 m; start gate with SDF course name | instances.ts:63-86; text3d.ts:29; admission.ts:37; `world.ts:92-93` | arch | <= 40k tris; +3 draws; racing certify passes |
| IC-16 | assets | C | drone2 copper anodised retexture | meshy retexture; geometry-hash.mjs | 1 retexture | hash same; drone chroma +10% |
| IC-17 | dressing | S | Cliff dwellings with lit windows and needle spires on far ridges (impostors) | prd10/index.ts:116; instances.ts:75-77 | 2 pieces | +4 draws max; >= 20 window clusters > 180 |
| IC-18 | vfx | M | Signature ion wake: 60-segment ribbon from the last 1.2 s, cyan-violet at cruise, amber on afterburner; game-side until E-F trail | `world.ts:315-317`; effects-api.ts:246-257 | - | wake >= 1.5% of frame at >= 100 km/h; amber hue under afterburner; +1 draw |
| IC-19 | vfx | S | Engine bursts for hits, kills, barrels, boosts with per-game colours (camera false where the game shakes) | contracts/effects.ts:9,14; effects-api.ts:166,293 | - | kill area +40 over 0.3 s; liveCount <= 96; vfx=off still passes |
| IC-20 | vfx | C | 300 slow spores in a camera-following box | effects.ts:248 | - | emitter listed without warning; >= 40 points; +1 draw |
| IC-21 | animation | S | Rotor-blur discs, landing overshoot, crystal wind, pickup pulse, arch light chase | primitives.ts:125; instances.ts:76; public/index.ts:15 | - | drone crop diff >= 6 over 4 steps; +4 draws max; animation >= 7 |
| IC-22 | camera | M | Countdown sequence (rail sweep, hero shot); bank roll ±6 deg; afterburner fovKick (+6 cap on reduced motion); finish orbit; skipped under manual=1 | contracts/camera.ts:39-57,64,67; `world.ts:273-277` | - | roll spans ±3 deg; kick energy under afterburner; replay pins unchanged; early vs race SSIM < 0.6 |
| IC-23 | hud | S | Ion telemetry HUD: hairline panels, district accent bar, district banner, licensed display numerals, glowing heat meter | `index.html`, `hud.ts`, `main.ts`; themes.ts:65 (token model) | licensed face | no clipped text at 390/1280; banner within 0.2 s; licence recorded |
| IC-24 | dressing | S | Scenery via scatterAlongPath at 2.5x density; lane beacons every 44 m; violet rift in one district; art direction with signature `ion-wake` | scatter.ts:177; groups.ts:39; define.ts:113,146; audit.ts:35; `models.ts:41-75`; NEW `art/direction.ts` | - | 2.5x transforms; +4 draws; audit passes; environment >= 7 |
| IC-25 | perf | M | Budget rows per item; automatic quality set by pointer and fps; Medium tier on low | types.ts:2509-2520; rendererOptions.ts:183-204; quality.ts; `main.ts:21`; NEW `evidence/heatsink-port/budget.json` | - | High <= 140 draws, <= 450k tris, <= 160 MB; Low <= 90; steady state within 4 min; 0 errors |
| IC-26 | camera | M | Proof: captures, final screens, card; sibling judge vs Thermal Drift and Craterline GP; look judgement | capture spec; decode/compare-luma; evidence judge; judge.ts:152-156; build-card-images.mjs | - | same_game false >= 0.8 on >= 5 of 6 passes vs each; every category >= 7; mean 62-75 |

#### WP-30 (G20) ninja-runner-port (Shadowstep Gauntlet): "One evening, one run"

- **Code:** `apps/showcase-ninja-runner-port` mounts `examples/ninja-runner-port` (world.ts, scenery.ts, materials.ts, shaders.ts, models.ts, palette.ts, course.ts, main.ts).
- **Today:** one bright midday for all six districts; the sky HDRI never loads (plain-object texture, `world.ts:229`; g20 adds `?ibl=hdri`); one sun at [-40,67,56], 2 cascades; fixed sky gradient; FOG_FOREST declared and unused (`palette.ts:12`); emissive-only lanterns; 4 rigged models for 13 slots told apart by tint; clip time-scrubbing; no `app.effects`. Mean 121.2, p5 52, p95 173 (121-level span); 93 draws; GLBs ~20.2 MB.
- **Identity:** a woodblock-print gauntlet whose time of day moves with distance: late-afternoon gold in Lantern Village, vermilion sunset over Rooftop Run, dusk at the river, blue-hour mist in Whispering Forest, first stars at Valley Gate. Indigo #2b3550, persimmon #d4553a, mist paper #e8e2d4, lantern amber #ffb45e; spirit cyan #51dfff for pickups and power. Signatures: indigo ink outline and a vermilion scarf ribbon. Ends cool and inked, unlike Iron Crown's static warm lantern dock.
- **Engine deps:** E-B (setLight blending, setEnvironment, setFog verify), E-C (LUT, temperature, runtime post handles, selective bloom), E-D (rim), E-E (outline targets), E-F (presets in burst, real trail, atlas), E-G (skinned shadows), E-H (rail), E-I (per-cell RGB and hue, `?at=` targets), E-J (`ink-scroll` theme).
- **Budget:** <= 150 draws at every district stop on every tier (low-tier drawBudget, quality.ts:63); lantern pools add 0 draws; GLBs <= 24 MB; 1k HDRI ~1 MB (<= 3 MB after per-district HDRIs).
- **Meshy (600-700 credits):** 9 retextures (4 houses, teahouse, tower, gate, pine, oak, hero); 10 props (lantern garland, stone lantern, noren banner, bamboo, blossom tree, water wheel, shrine gate, pagoda silhouette, reeds, laundry line); robed caster and light scout.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| NR-01 | lighting | M | Real HDRI by default (belfast_sunset 1k through defineAuraAssets); env intensity steps per district 1.0/0.85/0.6/0.35/0.3; per-district HDRIs after E-B | environments.ts:125-127; g20 `world.ts:12,236`; prd02.ts:233,238-242 | belfast_sunset 1k | env source is the HDRI; stops village 115-130, rooftops 95-115, river 75-95, forest 50-70, gate 40-60, each >= 12 apart |
| NR-02 | lighting | M | Sun sinks with distance (22 to 9 to 4 deg, then a 25-deg moon key); 3 PCSS cascades; one key swap per boundary during a banner until E-B blending | lights.ts:51-60; contracts/lighting.ts:12-13; Prd02ShadowFilter.ts:46; runtimeNodes.ts:15-16; NEW `districtLook.ts` | - | cascadeCount 3, pcss; rooftop bottom p5 <= 35; warm palette >= 50%; no jump > 10 across 1510 m after E-B |
| NR-03 | lighting | M | 12 (High) or 6 (Low) pooled lantern points moved to the nearest lanterns, on from the river; 4 cyan points on spirit flames; `?lanterns=0` | lights.ts:62; runtime.ts:150,155; quality.ts:58,80; `scenery.ts` | - | gate bottom row +15 vs lanterns off; p95 >= 210 on forest and gate; +0 draws |
| NR-04 | lighting | S | Evening fills: hemisphere 0.25 in the village, removed from the river on; sky-side counter-rim in forest and gate | lights.ts:24-30,51; environment.ts:687 | - | p5 <= 25 at river, forest, gate; darkFrac <= 0.35 |
| NR-05 | env-sky | M | Sky dome driven per district (zenith/horizon pairs, stars above 15 deg, moon disc) | `materials.ts:35-40`; runtime.ts:198; `shaders.ts` SKY_FRAGMENT | - | rooftop top row 90-140 with >= 40% warm; gate top <= 45 with p95 from lights/stars; compile test passes |
| NR-06 | env-sky | M | Per-district fog via `app.atmosphere.setFog` with 2 s transitions (prove pixels first); FOG_FOREST gets the blue-hour value; fog volumes at the river and falls | contracts/atmosphere.ts:19-20; atmosphere-api.ts:14-32; effects.ts:52,357; contributors.ts:321 | - | ridge cell moves >= 15 village to forest; paletteDistance >= 0.1; forest top spread <= half bottom |
| NR-07 | env-sky | S | God rays only in Rooftop Run and the forest entry (1100-1700 m); `?godrays=0` | effects.ts:82-94; postBridge.ts:808-812; v2Stages.ts:789 | - | S4 on rooftop, not gate; sun-side +4; receipt committed |
| NR-08 | post | M | Woodblock grade: agx; bloom 0.55/0.85; grade 1.14/1.04; indigo vignette 0.3; grain 0.025; LUT after E-C | output.ts:10; ToneMappingOperators.glsl.ts:73,228; effects.post.ts:27,99,136-157 | - | hdr-msaa; clip <= 0.03; p95-p5 >= 150 everywhere (121 today); post >= 7 |
| NR-09 | post | S | Signature ink line: full-frame outline #1b2236 width 1; per-target after E-E | effects.ts:105-114; postBridge.ts:586 | - | village edgeDensityRatio 1.1-1.6; same_game false >= 90% vs cloud-runner-port |
| NR-10 | post | C | Dash speed lines and fovKick; edge-streak custom pass driven by setPassUniform | GameFeel.ts:101,255; contracts/camera.ts:51; effects.post.ts:180; contracts/post.ts:38 | - | dash side-column edge ratio <= 0.9; kick only on dash; no change on reduced motion |
| NR-11 | materials | S | Clearcoat lacquer roofs and gates; damp stones; lantern emissive per district | material.ts:68,95,133; runtime.ts:155; overrideMaterial.ts | - | roof cell p95 >= p50 + 30; material >= 7; +2 draws max |
| NR-12 | assets | M | Dusk retextures (fixes dark cottage and faceted leaves); 10 new props; 2 new enemies in CHARACTER_URLS and SLOT_MODEL | meshy-cli; cli.ts:111; `models.ts:12,20,26`, `scenery.ts` | see Meshy | hashes same; props < 8k, characters < 15k tris; <= 24 MB; cottage >= 0.7x grass |
| NR-13 | dressing | M | District silhouettes (lantern garlands, laundry and noren with wind, chimneys and pagoda, water wheel and reeds, bamboo and stone lanterns, gate lantern rows) via scatterAlongPath, 3 m off the camera path | instances.ts:69-76; scatter.ts:177,252; groups.ts:39 | - | environment >= 7 on 5 stops; <= 150 draws; adjacent paletteDistance >= 0.08; clearance scan passes |
| NR-14 | vfx | M | Built-in kinds with colours (indigo debris and persimmon sparks on kills), authored petals, embers, fireflies, falls spray; ink decals on crate breaks | contracts/effects.ts:14,17; effects-api.ts:38-53,67,236,258-283; effects.ts:248; contributors.ts:532; NEW `vfx.ts` | - | liveCount > 0 idle in village and forest; zeroPixelFrames 0; kill frame indigo +0.5 pp; <= 96 |
| NR-15 | vfx | M | Signature vermilion scarf: scene-node trail on a `hero-scarf` anchor pinned to the upper spine; cyan twin toggled for Sage/Beast | effects.ts:280-291; EffectNodeLowering.ts:59-67,436; contracts/animation.ts:33-41 | - | ribbon live, zeroPixelFrames 0; +0.3% #d4553a vs `?scarf=0`; declared signatureEffect |
| NR-16 | vfx | C | Light cones under 4 gate lanterns; faint aurora on the win screen (verify both draw) | effects.ts:298-330; EffectNodeLowering.ts:433-435; rendererDiagnostics.ts:93 | - | zeroPixelFrames 0; cone cells +15 vs `?cones=0` |
| NR-17 | animation | S | Blended locomotion (inertialize crossfades), additive upper-body flinch, 12 deg lean, landing dust | contracts/animation.ts:13,33-41; GameFeel.ts:102,276; motionGate.ts:44 | - | 2 weighted actions for >= 5 frames on run-to-jump; clipFlips <= 4/10 s; socket jumps <= 0.15 m; animation >= 7 |
| NR-18 | camera | S | Intro sequence (high over roofs, blend to chase) with bars; 3-shot win at the gate; lane-change roll up to 3 deg | contracts/camera.ts:40-56,99-100; extension.ts:39 | - | title bars and height > 20 m; first running frame within 0.5 m of today's chase; reduced motion skips; camera >= 7 |
| NR-19 | hud | S | Ink-scroll HUD (paper progress scroll with district seals, brush district card, matching icons), licensed fonts, >= 44 px controls | HudKit.ts:197; themes.ts:7-25; index.ts:239 | icons | ui_hud >= 7; HUD <= 90 px at the bottom on 390x844; touch check passes |
| NR-20 | env-sky | S | River takes the sky colours (horizon and zenith uniforms) and moon glints | `materials.ts:42-48`; `world.ts:458` | - | river crop >= 50% warm; paletteDistance >= 0.1 vs pinned blue |
| NR-21 | dressing | M | Art direction (palette, reserved cyan, one shadowed key, signature `scarf-trail`, budgets) | define.ts:146; audit.ts:35; NEW `apps/showcase-ninja-runner-port/art/direction.ts` | - | audit passes; game-checks 0 errors |
| NR-22 | perf | M | `?at=<m>` via the QA advanceTo hook; 5 district targets (100, 700, 1300, 1900, 2500 m); final screens and card | `main.ts:307`; game-luma-targets.ts:42-50,74; capture spec :37-59; heatsink-judge-lib.ts | - | 5 rows in the NR-01 bands; spread >= 150; darkFrac <= 0.35; clip <= 0.03; <= 150 draws; adjacent paletteDistance >= 0.08 |

#### WP-31 (G21) last-train-port (Lamplight Line): "The last tram before dark"

- **Code:** `apps/showcase-last-train-port` mounts `examples/last-train-port`; `buildScene(data, mode, tex)` at `world.ts:170` (g21 numbering), main.ts, shaders.ts, townkit.ts, data/tables.json.
- **Today:** a day scene and a night scene swapped with setScene; kloppenheim_06 HDRI shared with Gridlock Courier; one 3-cascade sun; no point/spot lights (lamps are emissive spheres); tone mapping none; six town skies near-identical; primitive rocks, trees, bushes, clouds and folk; hand-written rain and snow shaders. Steady mean ~85, p95 142-147; night ~30; 126-167 draws; 272-285 MB GPU.
- **Identity:** one service from late afternoon at Mango Tide to blue hour at Saltlight Terminus; the sun sinks leg by leg and lamps, windows and the tram's bulbs take over. A warm tilt-shift miniature of pastel hill towns floating on a sunlit cloud sea: apricot and rose sky, cream stucco, terracotta, lilac clouds; lamplight amber #ffc77a the only accent; cherry-red livery the reserved objective. Signature: a sky filling with lanterns the player earned. The only racer whose light changes along the route.
- **Engine deps:** E-A (HDRI downsize), E-B (setLight, setEnvironment crossfade), E-C (runtime post, white balance, tilt-shift DOF, selective bloom, god-ray receipt), E-G (world spline/grass export), E-I (region-luma tool, look-identity sha check).
- **Budget:** band D <= 190 draws; <= 320 MB GPU; +8 MB models and +3.6 MB HDRI at 1k; JS +40 KB max; 26 punctual lights add 0 draws.
- **Meshy:** 6 tree kits x 2, 3 island undersides, 4 rocks, 2 cloud puffs, 2 horizon islands (impostor), paper sky lantern, signal post, bunting, rigged gull; tram retexture with emissive; 4 rigged riders with sway clips.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| LT-01 | lighting | M | Time-band scenes from one `buildScene(data, band, tex)`: A late afternoon 28 deg, B golden 12 deg, C storm dusk 6 deg, D blue hour key 0.55 with practicals, E moon; swap only while docked; PCSS; `?band=` | lights.ts:32; contracts/lighting.ts:12-13; runtime.ts:327; `world.ts:516`; NEW `bands.ts`, `bands.test.ts` | - | means A 100-125, B 85-110, C 60-85, D 40-60, E 28-40; dark < 0.35, clip < 0.01; p95/p5 >= 3.5 in A/B; never setScene enroute; pcss, 3 cascades |
| LT-02 | lighting | M | Real lamplight in C/D/E: 4 points per town (24), saloon point and a shadowed headlamp spot moving with the tram; window emissive x1.33 | lights.ts:43,56; contracts/lighting.ts:14; effects.ts:298; runtime.ts:150-152 (verify light movement, E-B) | - | >= 26 point/spot nodes, 1 shadowed spot; platform >= 1.8x corners; +2 draws max |
| LT-03 | lighting | S | Hemisphere per band (cloud bounce ground); contact shadows under riders, benches and tram | lights.ts:5; effects.lighting.ts:22; contactShadowKey.ts | - | no weak key in A/B; pass executed; under-tram -10 |
| LT-04 | env-sky | M | Own HDRIs: belfast_sunset (A/B), industrial_sunset (C), rooftop_night (D/E), not night-2k; rotated to the key | environments.ts; contracts/lighting.ts:31-32; NEW 1k resample (E-A) | 3 HDRIs | no sha shared with another game; env source names the band HDRI; <= 3.6 MB at 1k |
| LT-05 | env-sky | M | Sky carries time of day (afterglow, horizon warm, sun sink below the horizon); six divergent town sky pairs; cloud sea lit by the sun with lilac valleys | `shaders.ts` SKY/CLOUD; `materials.ts`; `data/tables.json`; runtime.ts:198 | - | top hue A vs D >= 40 deg, adjacent towns >= 15; B clouds sun side >= 1.3x; D top >= 25, no solid-void |
| LT-06 | env-sky | S | Fog per band; band B god rays; sun flare in A/B | effects.ts:52,82; postBridge.ts:808-890; lights.ts:15; lensFlare.ts:7 | - | S4 in B only at High; sun side +5-15, far side < 3; flare only in A/B |
| LT-07 | post | M | agx with dither on; exposure per band; GTAO default-on; game tilt-shift pass (screen band by depth); grain 0.03; split-tone pass until E-C white balance | output.ts:9-18; ToneMappingOperators.glsl.ts:228; effects.post.ts:67,148,180; contracts/post.ts:30,38; `main.ts:516` | - | GTAO and both passes ran; clip <= 0.01; top/bottom rows -25% variance; A highlights R/B >= 1.15, D shadows B/R >= 1.2 |
| LT-08 | materials | S | 6 station box probes (update once); clearcoat livery after retexture | probes.ts:45; overrideMaterial.ts; types.ts | tram retexture | 6 probes; B tram p99 >= 230, mean 0.8-1.2x; +12 MB max |
| LT-09 | materials | S | Monsoon: engine rain, wet platforms (roughness 0.82 -> 0.25), puddle decals; Observatory: engine snow and snow-dusted roofs; delete hand rain/snow shaders | effects.ts:165,178; runtime.ts:155; Decals.ts:46 | puddle decal | wet platform p95 +20; Observatory roofs 1.4x Gardens; setMaterial only on weather change |
| LT-10 | assets | M | Meshy tree kits per town, island undersides, rocks, cloud puffs via instances.model with wind, LOD, impostor shadows and scatterInArea | instances.ts:63-76; scatter.ts:89,214; public/index.ts:25; prd10/index.ts:116; `world.ts:395,404-406,423-425` | tree kits etc. | no primitive canopies/pines/bushes/stones/puffs/rocks; no primitive-subject; modeling >= 7; D <= 190 draws |
| LT-11 | assets | M | Tram PBR retexture (cherry enamel, cream band, brass, teak) with emissive lamps; 4 rigged riders, one model per seat | meshy; cli.ts:111,262; gltfToolkit.ts; geometry-hash.mjs | tram, 4 riders | tram hash same; validate-animation per rider; >= 36 fewer passenger nodes; <= 285 MB; headlamp p95 >= 200 |
| LT-12 | dressing | M | Merged catenary ribbons (1 draw), instanced festoon bulbs (C/D/E), SDF nameboards, signal posts red/green, horizon island impostors, gull flocks | `world.ts:49`; text3d.ts:29; instances.ts:63; public/index.ts:25 | signal, bunting, islands, gull | +12 draws max; 6 text3D nodes match town names; >= 4 of 6 mid-leg top rows show silhouettes |
| LT-13 | vfx | M | Signature earned sky lanterns: 6-12 released per clean arrival, staying aloft; a catch drops one guttering lantern; one instanced emissive mesh | instances.model; runtime.ts:163; define.ts:113,146; NEW `lanterns.ts` | sky lantern | >= 40 lanterns after runCircuit; D top p95 >= 170 (<= 120 without); 1 draw; release only on clean arrivals |
| LT-14 | vfx | S | Pantograph sparks, fare sparkle, platform splash, departure dust via spawn(); storm lightning flash <= 200 ms | contracts/effects.ts:14-18; output.ts:19; effects-api.ts:36; effects.ts:198 | spark/coin sheets | liveCount > 0 on curves; 4 presets registered; flash +15 for <= 200 ms; <= 0.05 screen share |
| LT-15 | animation | S | Riders lean against tram roll with 0.25 s lag and sway clips past 0.22; tree wind; lantern bob; gull flaps; 1-2 cm tram bob | contracts/animation.ts:34-35; runtime.ts:152; instances.ts:76; `presentation.ts:1` | - | lean reaches 63% in 0.15-0.35 s; sway clip past 0.22; reduced motion <= 30% |
| LT-16 | camera | S | 3 s arrival rail along the platform, departure trackside shot, finale crane into the lantern sky; FOV kick and catch shake; skippable, cuts on reduced motion | contracts/camera.ts:23-24,38,55; motionReport.ts; NEW `shots.ts` | - | 6 arrival sequences per circuit; hitch < 1; service time identical with and without shots |
| LT-17 | hud | S | Railway-enamel HUD with brass spirit-level lean meter and departure-board results | `index.html`, `main.ts:188` | display face | HUD <= 22% at 390x844; text >= 12 px, contrast >= 4.5:1; no unlicensed fonts |
| LT-18 | perf | M | Budget, band targets A-E, sibling judge vs drift-and-deliver-port, roadster-hours-port, cloud-runner-port | game-luma-targets.ts:75; decode/compare-luma; judge.ts; rubric.ts:16-17; `main.ts:407` | - | LT-01 bands; D <= 190 draws, <= 320 MB; same_game false >= 0.8 in >= 90% of trials; key categories >= 7 |
| LT-19 | dressing | C | Art direction (lamplight accent, livery reserved, signature "earned sky lanterns", budgets) | define.ts:146,222; audit.ts:35; NEW `apps/showcase-last-train-port/art/direction.ts` | - | audit passes; game-checks 0 errors |

#### WP-32 (G22) roadster-hours-port (Saltwind Highway): "Wind-scoured maritime road trip"

- **Code:** `apps/showcase-roadster-hours-port` mounts `examples/roadster-hours-port` (world.ts rig :444-453 on integration, ~10 lines later on g22; shaders.ts; materials.ts; look.ts; meshy.ts).
- **Today:** hand rig with a 1-cascade 90 m sun, unshadowed fill, `environments.preset` night/sunset/outdoor; most of the world is custom GLSL with its own light model, so engine lights only reach vehicles and props; Meshy props with base colour only; pixelRatio 1, dither off; deprecated bloom radius. Sunbreak 89-92, redline 33.5, halo 15.9-18.4 (near black); 106-152 draws; captures may be judged before textures upload (0 of 58 textured).
- **Identity:** a 4 pm side sun through salt haze: bleached limestone and ochre cliffs, a deep teal Atlantic with surf lines, wind turbines and a red-white lighthouse, crosswind salt spray across the asphalt. Salt white #e9e4d6, sea teal #12606e, ochre #c9a25e, signal red #c8321f only accent. Routes are three hours of one day: Sunbreak 4 pm haze, Redline last light with heat shimmer, Halo blue hour over a mercury-white and sea-glass city carpet with red beacons (no amber, no neon). Signature: crosswind salt spray. The only racer with sea, coastal haze and wind-borne spray.
- **Engine deps:** E-C (grade writer, LUT, velocity MRT), E-D (custom shading chunks, fog for custom), E-F (atlas sprites), E-G (instances.custom wind, verify env capture of custom dome), E-I (real-GPU scenario).
- **Budget:** <= 170 draws on every route at 1280 and 390x844 (106-152 today); <= 900k tris; <= 12 MB transfer; <= 24 MB new textures at 1k; <= 12 programs; <= 2,000 particles; replay still ends at 48.325 s.
- **Meshy (~32 jobs, ~630 credits):** PBR retexture of 15 existing models; hero regenerated with parts; sunbreak turbine (separate rotor), sea stack, boat, crane, cypress, salt pan; redline mesa, arch, scrub, uplink mast, hoodoo; halo arcology, maglev tube, gantry sign, antenna; shared relay gantry.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| RH47-01 | perf | M | Device resolution (DPR up to 2) and dither on; wait for full texture upload before judged shots | output.ts:9-16; contracts/looks.ts:14; `main.ts:9,318,338-340` | - | no look/low-dpr; dithering true; textured === total before the shot; no banding steps > 2 |
| RH47-02 | lighting | M | One Look record feeds engine and shader uniforms per route: sunbreak 20 deg #ffe2b0 3.4 with sea-bounce fill; redline 7 deg #ff9a5a 3.8 with violet rim; halo blue-hour key 0.6, city-glow hemisphere, cool gantry points | lights.ts:24,51,62; quality.ts:80; `materials.ts:18`, `look.ts:53-87`, `world.ts:444-446` | - | sunbreak 100-125, clip < 0.02; redline 60-85 (33.5); halo 32-48 (16-18), darkFrac < 0.40, road cell > 45 |
| RH47-03 | lighting | M | 3 cascades over 260 m with PCSS; blob shadow under the roadster fading with ride height | contracts/lighting.ts:11-12,19-20; shadows.ts:32; `world.ts:444` | - | cascadeCount 3 on High; under-car -25; +30 shadow draws max |
| RH47-04 | env-sky | M | Vehicle reflections from route HDRIs (belfast_sunset, industrial_sunset, rooftop_night) at reduced intensity; capture of the dome only as an experiment | environments.ts:102-125; `world.ts:446` | 3 fixture HDRIs | env source names the route; car highlight hue within 20 deg of horizon; no option-ignored |
| RH47-05 | env-sky | S | Sky shader: two wind-driven cloud layers, sun-side glow, sea-side salt haze band; halo indigo with a city-glow band | material.ts:59-67; `shaders.ts:212`; `materials.ts:40-46` | - | sunbreak top stddev +30%; halo horizon >= 2x zenith; specs compile |
| RH47-06 | env-sky | M | Water shader: shoreline foam, sun glitter path, depth colour, wind whitecaps; halo city-carpet shader below the skyway | `shaders.ts:149,156`; `materials.ts:34-38`; `world.ts:585`; NEW CITY_FRAGMENT | - | water >= 3% pixels > 200, stddev >= 30; halo bottom >= 25 with > 1% > 200; +1 program max |
| RH47-07 | post | M | Per-route post, no deprecated radius: sunbreak bloom 0.3/1.1 + flare; redline 0.45/1.0, grain, depth-masked heat shimmer pass beyond 40 m, flare; halo bloom 0.8/0.9 with auto-exposure | effects.post.ts:27,99,136,148,180; postBridge.ts:594-599,838-843; contracts/post.ts:11,13; lensFlare.ts:111-125; NEW `heatPass.ts` | - | no deprecated/threshold warnings; halo S8 ran on Medium+; sunbreak clip < 0.02; <= 1 shaderPass per route |
| RH47-08 | post | S | Depth-masked radial speed streak pass from speed and nitro; motionBlur after velocity MRT; off on reduced motion | effects.post.ts:180; contracts/post.ts:30; effects.ts:150; velocity.glsl.ts:19; NEW `speedPass.ts` | - | corners edge density -20% at top speed, car SSIM >= 0.95; absent on reduced motion |
| RH47-09 | materials | M | Full PBR Meshy re-bake (normal, ORM); hero split into car paint, glass, chrome and emissive lamps; salt-faded traffic palette | types.ts:172-275; material.ts:118,194,324; `tools/bake-meshy.mjs`; textureStats.ts; `meshy.ts:64-67` | 15 retextures | admission with normal and ORM; >= 0.5% car pixels > 230; >= 4 traffic hue buckets; meshy <= 10 MB |
| RH47-10 | materials | S | Texture detail on custom surfaces: worn asphalt, limestone and sandstone triplanar cliffs, galvanised rails | cli.ts:351; customMaterial.ts:27-33; `shaders.ts:96,254,293` | 3-5 CC0 sets | road and flank edge density +40%, no moire beyond 150 m; +24 MB max |
| RH47-11 | assets | M | Landmark set per route; Meshy relay gantry tinted per route replaces cyan emissive box gates | cli.ts:111-147; scatter.ts:177,214; `world.ts:486-597,523-530` | ~16 models | >= 4 landmark kinds per route (redline 1, halo 0 today); within RH47-19 |
| RH47-12 | vfx | M | Signature crosswind spray sheets from the sea-side cliff base drifting with route wind (salt, sand, mist); surf bursts; dust devils | effects.ts:248; `materials.ts:89` fallback; atlas.ts; NEW `spray.ts` | optional flipbook | spray centroid moves >= 8% width laterally over 2 s; <= 2,000; visible in >= 5 of 8 states |
| RH47-13 | vfx | M | Driving feel preset pack: route-tinted tyre smoke, scrape sparks, signal-red nitro trail, landing ring, 8 s skid decals, gate flares | contracts/effects.ts:9,14-19; effects-api.ts:36,293; NEW `fx.ts` | - | each sim event maps to one preset; liveCount > 0 0.2 s after landing; replay ends at 48.325 s |
| RH47-14 | post | S | Per-route temperature and LUTs (after E-C) | effects.post.ts:99; postBridge.ts:575,923; composite.glsl.ts:25-26; v2Stages.ts:1221,1253 | 3 .cube LUTs | hue shift >= 6 deg in the intended direction |
| RH47-15 | animation | S | Turbine rotors, boat bob, gantry pulse, roadster body roll and pitch (visual); palm sway after E-G | instances.ts:64-76; `presentation.ts` | rotor part | replay 48.325 s, score 26949, 0 crashes; turbine/boat crop moves; rotor angle advances |
| RH47-16 | camera | M | 6 s intro rail per route with bars; finish trackside shot then orbit; kicker hang-time FOV push with 0.6x slow-mo | contracts/camera.ts:40,53,64,67; GameFeel.ts:98,335; motionReport.ts:105-116; NEW `shots.ts` | - | motion report passes; intro ends within 1 frame of input; reduced motion disables slow-mo and bars |
| RH47-17 | hud | S | Salt-white panels with signal-red accent, route stripe, nitro-glowing arc speedo; SDF gate signs; motorsport spacing tokens with DIN Pro | themes.ts:9,39; text3d.ts:29; `index.html`, g22 `hud.ts` | - | game-checks pass, no touch warning; targets >= 44 px; sign cap height >= 14 px at 60 m |
| RH47-18 | dressing | M | Art direction (signature crosswind spray); sibling judge vs all 7 racers | define.ts:146; audit.ts:35; judge.ts:37-38; look judge.ts:5; NEW `art/direction.ts` | - | audit passes; same_game false >= 0.8 in >= 5 of 6 per pair; every category >= 7 |
| RH47-19 | perf | M | mergeStatic landmarks per route, LOD/impostors for far turbines, towers, mesas; budget row | index.ts:472; groups.ts:39; instances.ts:64-80; prd10/index.ts:116; package.json:139 | impostors | <= 170 draws everywhere; <= 900k tris; <= 12 MB; <= 12 programs; bundle delta recorded |

#### WP-33 (G23) where-the-wind-wanders-port (The Bellkeeper's Walk): "Storybook gouache valley where the wind is a character"

- **Code:** `apps/showcase-where-the-wind-wanders-port` mounts `examples/where-the-wind-wanders-port` (world.ts, shaders.ts COMMON :28-33, sim.ts, scenery.ts, models.ts, ui.ts, main.ts).
- **Today:** no look, environment or engine lights ("Scene has no lights"); 11 custom shaders share hard-coded constants (53-deg midday sun, fixed sky and fog); the GLBs take the implicit fill, so the frame has two lighting models; no shadows; deprecated `qualityProfile` and bloom radius; `system-ui` in the UI font. Mean 162-167, centre 174-177, almost no dark pixels; judged as flat low-poly with no painted detail (edgeDensityRatio 0.49-0.60); 14-24 draws; 8.4 MB GLB.
- **Identity:** late afternoon in a storybook gouache valley: a low apricot sun from the west-southwest, long shadows, cloud shadows and gust waves rolling over sage grass. The day moves forward with each letter (15:30 to golden 18:30 to lilac dusk with lanterns and stars at the bell). Sage #8fae6a, slate-teal sea #3f7f86, apricot light #ffc58a; brass bell #d9a441 and wax-seal red #b8432f the only accents. Target mean 120-145. Signature: visible wind (cloud shadows and gust waves). Differs from Dot Dash (dark neon) and Duneglide (textured canals, night chapters) by one continuous day arc and untextured painted surfaces.
- **Engine deps:** E-B (setLight for the engine sun), E-C (runtime post toggles, god-ray receipt), E-D (custom castShadow, sun colour uniforms, rim), E-F (atlas sprites), E-I (real-GPU scenario).
- **Budget:** High <= 54 draws (17 today; shadows ~+22, dressing +6, emitters +2, kite +2, flare +1), <= 450k tris, GLB <= 10 MB, JS +15 KB max; Low <= 28 draws with no shadows, god rays, particles or paper pass.
- **Meshy:** paper kite, dry-stone wall, signpost, footbridge, haystack, sheep, washing-line posts, pennants; admit the unused lantern; gouache retextures of pine, oak, shrub, cottage, belltower and bell, hero (could).

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| WW47-L1 | lighting | M | One daylight state keyed by letters found (34, 28, 22, 16, 6 deg, night moon) eased over 6 s; COMMON constants become uniforms written each frame | runtime.ts:198; `shaders.ts:28-33`; `world.ts:438-493`; `sim.ts:203-204`; NEW `daylight.ts`, `daylight.test.ts` | - | no SUN_DIR const; found 3 vs 0: grass R/B +0.12, top row changes >= 15; unit test on unit vectors and falling elevation |
| WW47-L2 | lighting | M | Engine key matching the daylight sun (2 cascades, 2048, PCSS, 70 m); casters back on; custom specs receive the sun shadow via a3dSunShadowAuto | lights.ts:51; contracts/lighting.ts:11-12; types.ts:421-422,2679; author/index.ts:76-79; instances.ts:75 | - | one sun row sampled with 2 cascades; cottage shadow 25% darker; no "no lights" warning; no lighting warning |
| WW47-L3 | lighting | M | GLBs get the same fill: hemisphere from key-0 colours plus kloppenheim_06 IBL at 0.55 (background off) scaled per key | lights.ts:24; environments.ts:125; contracts/lighting.ts:33; NEW `env-assets.ts`; app `public/hdri/` | vendored HDRI | hero GLB within ±12% of adjacent painted foliage; env source hdri, no background |
| WW47-L4 | lighting | M | Engine sun follows the day (E-B setLight); interim one light per key toggled by setVisible after proving it removes the shadow | NEW setLight; runtime.ts:154; contracts/lighting.ts:9 | - | cottage shadow centroid moves >= 30 px found 0 to 3; 1 sun row at every key; direction within 1 deg of the uniform |
| WW47-L5 | lighting | S | Lantern points ramping from found=2 to the bell; brass point inside the bell pulsing with the swing | lights.ts:62; quality.ts:80; `scenery.ts:36,227` | - | lantern crops >= 1.5x found 0; +2 draws max |
| WW47-S1 | env-sky | M | Sky on a3d_sky helpers fed by daylight (gradient, sun disc and glow, horizon haze, sun-tinted clouds, stars after the bell) | author/index.ts:46-51; customMaterial.ts:469-472 | - | top third falls >= 30 found 0 to epilogue; > 50 stars on a dark background; sun disc within 3 deg |
| WW47-S2 | env-sky | M | Signature wind: advected cloud shadows (up to 0.35 off the sun term) and a gust band in WIND_VERTEX; mirrored in NEW wind.ts for kite, particles, sails | author/index.ts:37-42; `world.ts:454`; NEW `wind.ts`, `wind.test.ts` | - | meadow SSIM < 0.97 over 4 s, sky > 0.995; gust spans 1.0-2.5x over 20 s |
| WW47-S3 | env-sky | S | Height fog (a3dFogHeight) pooling over sea and stream at golden hour and dusk | author/index.ts:55-60; `shaders.ts:62-66` | - | sea cell spread -20% at found 3, bottom-middle within 5% |
| WW47-P1 | post | M | Softer palette: saturation 1.28 -> 1.05, contrast 1.06, exposure 1.05; bloom 0.42/0.92 #ffe2b8 without radius; umber vignette 0.22; renderer.quality "high" | effects.post.ts:27,99,131-146; output.ts:10-11; rendererOptions.ts:183-190; quality.ts:7; `world.ts:376-378`, `main.ts:305-307` | - | mean 120-145, p5 >= 18, clip <= 2%, dark <= 5%; no deprecation warnings |
| WW47-P2 | post | S | Golden-hour shafts through oaks and over the bell at a low fixed strength; absent on quality low | effects.ts:82; postBridge.ts:234,879-890; `main.ts:18` | - | god-ray stage at High; sun-side cell +8; NEW receipt |
| WW47-P3 | post | S | Gouache paper pass after tonemap (fibre and granulation 4%, midtone weighted) plus grain 0.02; 0 on low | effects.post.ts:148,180-236; contracts/post.ts:36-38; NEW `paper-pass.ts` | - | sky high-pass energy 1.5-3x with mean ±2; post >= 7 |
| WW47-P4 | post | C | Golden-hour sun flare; title/epilogue DOF after E-C toggles | lensFlare.ts:111-125; effects.ts:131 | - | flare +5 at the mirrored spot, +1 draw; epilogue background -40% variance |
| WW47-M1 | materials | M | Painted-look GLB overrides: rough plaster and stone, brass bell, wax-seal letters, fabric sail | overrideMaterial.ts; material.ts:74,95,103,184; types.ts:172-209; `models.ts` | - | bell max >= 230, mean 0.7-1.3x tower; no fallback warnings |
| WW47-M2 | materials | S | Wind-aligned brush strokes on terrain, ochre path band, triplanar brush grain on props | author/index.ts:37-42,64-67 | - | edgeDensityRatio >= 0.70 (~0.53); judge cites missing painted detail in <= 4 of 12 |
| WW47-A1 | assets | M | Paper kite replaces the wisp companion (likeness risk); procedural swaying tail ribbon | admission.ts:36; `world.ts:338`; `models.ts`, `model-assets.ts` | kite | likeness and deployable pass; <= 400 KB; +2 draws; yaw follows wind within 25 deg |
| WW47-A2 | assets | M | Gouache retextures of pine, oak, shrub, cottage | retexture with original UV; geometry-hash.mjs; optimize --tex 1024 | 4 retextures | hash diff 0; validate --release; <= 10 MB; filmstrip stored |
| WW47-A3 | assets | S | Dressing props (dry-stone wall, signpost, footbridge, washing line, haystack, sheep) and the unused lantern | admission.ts:36-37; instances.ts:64; `assets/ATTRIBUTION.md:18` | 6 props | validate and fit-grounding pass; +6 draws; <= 10 MB |
| WW47-A4 | assets | C | Hero retexture with wax-red scarf and rust cloak | geometry-hash.mjs; validate-animation | 1 retexture | hash 0; hero chroma >= 1.4x meadow ring |
| WW47-V1 | vfx | M | Visible wind: ~220 petals and seeds streaming along windDir; velocity-stretched gust streaks | effects.ts:248; contracts/effects.ts:156-163; quality.ts:61,72 | - | <= 300 particles, +2 draws; sky SSIM < 0.99 with on, > 0.995 off |
| WW47-V2 | vfx | M | Letter-flutter burst downwind, brass bell ring burst, lantern flare, warm 0.12 flash at the bell | contracts/effects.ts:14-20; effects-api.ts:38; output.ts:20; NEW `vfx.ts` | - | liveCount > 0 within 100 ms; >= 200 paper pixels; overlay applied |
| WW47-V3 | vfx | S | Grass-flick dust on hop landings; ripple rings at the stream and jetty | contracts/effects.ts:9,14,19,163; GameFeel.ts:102 | - | burst within 50 ms; no particle > 5% of height |
| WW47-V4 | vfx | C | Downwind chimney smoke from the smoke-a sequence (needs E-F) | contracts/effects.ts:119,156; atlas.ts:10-14 | - | plume +10 over sky; axis within 30 deg of wind |
| WW47-AN1 | animation | S | Sails and kite follow the gust; flapping washing line; reduced motion 0.3x | `world.ts:338,464`; g23 `world.ts:185-188` | - | gust sail speed >= 1.8x calm; reduced amplitude 0.3 ±0.05 |
| WW47-AN2 | animation | C | Hero head turns toward letters and the bell in reach | GameCharacterAnimation.ts:212,409; g23 `sim.ts:220`; `sim.ts:48` | - | head yaw error <= 15 deg; no foot-slide regression |
| WW47-C1 | camera | M | 6 s intro crane from the valley to START with bars; 8 s bell finale orbit rising over the dusk valley; follow camera suspended during sequences | contracts/camera.ts:40,53; rail.ts, static.ts; `world.ts:510,521` | - | no inside-geometry frames; belltower in frame 0; skip within 1 frame |
| WW47-C2 | camera | S | Storybook composition: fov 40, 1.2 u lead, lower offset so the horizon sits near the upper third | `world.ts:521-526`; `sim.ts:58` | - | traveller 18-22% of height; horizon step 30-38% from the top |
| WW47-H1 | hud | S | Storybook HUD in Untitled Serif; wax-seal letter counter; deckled caption panel; proximity prompt | register.ts:18; index.ts:239; g23 `sim.ts:220`; `ui.ts:29` | 3 seal icons | no system-ui; font check true; no HUD overlap at 390x844 |
| WW47-W1 | dressing | M | Walls and fence posts along the path, haystacks, 8 sheep, signpost, footbridge, washing line, fluttering belltower pennants | scatter.ts:177,214,267; instances.ts:64 | from A3 | fit-grounding passes; bases within 0.1 u of terrain; composition and environment >= 7 |
| WW47-PF1 | perf | M | Budget row; foliage cards cast no shadows (depth pass lacks the sway shader until E-D); trees via shadowLod lod1; low drops extras | types.ts:2513; runtime.ts:535; NEW `budget.json` | - | High <= 54 draws, <= 450k tris, <= 10 MB, JS +15 KB; Low <= 28 with no shadow rows |
| WW47-PF2 | perf | S | Proof: 4 states captured; sibling judge vs dot-dash-3d, silt-and-signal-port, cloud-runner-port; site cards; sweep row | capture spec; judge.ts:37,156; build-card-images.mjs | - | same_game false >= 90% per pair; screens-fresh passes after v4.7.0; every category >= 7 |

#### WP-34 (G24) silt-and-signal-port (Duneglide): "Hand-inked desert canal journey"

- **Code:** `apps/showcase-silt-and-signal-port` mounts `examples/silt-and-signal-port` (world.ts rigOf :132-147, architecture.ts, shaders.ts, terrain.ts, chapters-data.ts, main.ts toon pass :401-403).
- **Today:** one hand rig with the key at the same position in all 7 chapters (only colour changes); neutral env; exp2 fog; bloom with deprecated radius and sub-HDR threshold; custom sky with no sun or clouds; tone mapping none at exposure 0.65; the catalogue's only toon pass. Grass texture on desert terrain; flat cream plaster slabs; Kenney trees as green shards; landmarks only in chapter 0; two cyan sphere thrusters; no VFX; credit badge covers the flight HUD. Means 61.8-138; live title 173.5 at 3 s falling to 101.2 at 12 s; 116-199 draws; 15 programs, 3,392 ms compile.
- **Identity:** a hand-inked gouache travel poster: sun-bleached sandstone, terracotta and bone white over indigo shadows, one jade "signal" accent for rings, board and HUD, umber ink lines fading with distance, sand always moving. Seven chapters are seven hours of one long day: amber dusk, white-hot noon, indigo moonlight under roots, teal lantern-dusk reef, slate storm with rain and lightning, violet night crown, rose dawn. Signature: the sand wake. The only cel-inked game and the only one whose key direction and colour change every chapter.
- **Engine deps:** E-E (depth-aware toon ink), E-F (attachTo, real trail, atlas sprites), E-G (instance wind without WORLD, height fog promotion), E-B (setFog on scenes with a fog node), E-C (temperature, LUT, selective bloom, runtime post toggles), E-D (rim).
- **Budget:** <= 140 draws desktop High, <= 110 coarse; <= 18 programs; compile <= 4,000 ms on SwiftShader; <= 1.2M visible tris; <= 600 particles and 96 effects; <= 32 decals; <= 8 points per chapter; +40 MB GPU and <= 1.5 MB HDRI per chapter; owner real-GPU >= 55 fps at 1440 DPR 2.
- **Meshy:** date palms x2, tamarisk, grass tuft; 3 adobe dwellings; bronze signal mast; 2 horizon silhouettes; 9 chapter landmarks; 5 dressing props; courier, hoverboard, ring and lantern retextures; 4 courier clips.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| DG-L1 | lighting | M | CHAPTER_LIGHT table: elev/az/colour/intensity per chapter (9/250 amber, 64/160 noon, moon 28/40, 14/290, storm 40/200, moon 22/330, 6/80 rose); sky and water share the vector | lights.ts:7,15; contracts/lighting.ts:13; `world.ts:132-147,179-185`; `chapters-data.ts`; NEW `lighting-rig.test.ts` | - | key directions >= 15 deg apart; ch0/ch6 shadow ratio >= 3; chapter pairs differ >= 12 mean or >= 10 in a cell |
| DG-L2 | lighting | M | Per-chapter HDRI for IBL only (belfast_sunset, outdoor-midday-2k, industrial_sunset, kloppenheim_02, spruit_sunrise at 1k); night chapters keep neutral 0.35 | environments.ts:125; `world.ts:177`, `assets.ts` | 5 HDRIs | hdri source on 5 chapters; no lighting warning; <= 1.5 MB each; day means 95-150, clip < 0.02 |
| DG-L3 | lighting | S | Unshadowed jade-white rim opposite the sun, always below the key | lights.ts:7; postBridge.ts:808-812 | - | rim < key in all 7; rider vs surround >= 25; mean within 5% |
| DG-L4 | lighting | S | Night practicals: 8 amber points per chapter on the ring route, landmark spots, brighter lantern emissive | lights.ts:18,31; `world.ts:283-286`; quality.ts:80 | - | night darkFrac < 0.35, p95 >= 190, >= 3 hot cells; +2 draws; <= 8 points |
| DG-L5 | lighting | S | PCSS long shadows in ch0/ch3/ch6; contact shadows | contracts/lighting.ts:12-13,23; effects.lighting.ts:22 | - | pcss with 3 cascades there; no weak key; penumbra > 4 px |
| DG-L6 | lighting | C | Low-sun lens flare in ch0 and ch6 | lensFlare.ts; lights.ts:15 | - | sun cell +6 vs flare off; < 1 off-frustum |
| DG-S1 | env-sky | M | Sky: sun or moon disc and glow from the DG-L1 vector, two inked cirrus bands, horizon dust band, storm cover in ch4 | material.ts:59; `world.ts:44-56,92`, `shaders.ts` | - | specs compile; sun p99 >= 245; day chapter tops differ >= 15; <= 15 programs |
| DG-S2 | env-sky | S | Three farDunes rings at 1500/1800/2150 m tinted toward fog; 4-6 mesa and arch silhouettes per chapter | `architecture.ts:300`; instances.ts:63-91 | 2 silhouettes | >= 3 horizon plateaus 6 apart; +3 draws max |
| DG-S3 | env-sky | M | Height-fog ground haze per chapter via A3D_QR_VFX_FOG; apply through the fog node handle (setFog is ignored on scenes with fog nodes) | createAuraApp.ts:90-99; contracts/flags.ts:224; contracts/atmosphere.ts:17; LiveAtmosphere.ts:159,174-184; compiler/fog.ts:76; `main.ts:392-398`, `world.ts:186` | - | height fog in every chapter; far ground +8, rider within 3; mean within 10 |
| DG-S4 | env-sky | S | God rays from the low sun (ch0) and moon shafts through roots (ch2) | effects.ts:82; postBridge.ts:808-812 | - | S4 only in ch0 and ch2; radial variance 1.5x; cost recorded |
| DG-S5 | env-sky | S | Storm chapter rain, wet road and plaza, lightning timed to audio | weather.ts:19,53,98; `audio.ts` | - | rain only ch4; lightning top row +30 for < 200 ms |
| DG-P1 | post | M | Game-owned silt-ink pass: depth plus colour edges, umber by day and indigo at night, fading to 0 by 600 m, paper grain; 4 bands by day, 6 at night; ?toon=0 | effects.post.ts:180,243-256; contracts/post.ts:11; effects.toon.ts:65; `main.ts:401-405`; NEW INK_FRAGMENT | - | bottom-row edges >= 3x top; >= 60% of rider perimeter inked; ink RGB within 12; sky edges < 0.5% |
| DG-P2 | post | M | ACES with per-chapter exposure; contrast/saturation per chapter (bleached noon, saturated dusk); vignette 0.22; grain 0.03 | output.ts:10-11; effects.post.ts:99,136,148; `main.ts:36-37,397`, `world.ts:188` | - | day clip < 0.02, dark < 0.05; ch1 150-185, dusk/dawn 95-135; title 3 s vs 12 s within 15% |
| DG-P3 | post | S | Bloom only on HDR emissives (threshold 1.0, 0.3/0.5/0.75), no radius field | effects.post.ts:27; `world.ts:187` | - | no deprecated or threshold warnings; plaster p95 within 3 of bloom off |
| DG-P4 | post | C | DOF only in intro and finish sequences; boost motion blur 0.35 at High (rebuild or E-C toggle) | effects.ts:131,150; postBridge.ts:446-448 | - | DOF only in sequences, blur only on boost; background -25% on boost |
| DG-M1 | materials | M | Rippled desert sand on dunes with scrub blended by vertex colour on banks; sandstone cliffs | asset-index index.ts:95-118; types.ts:172-275; `world.ts:192-196` | 2K sand, scrub, sandstone | gates pass; bottom-third hue 22-45 deg in ch0/1/6 (green today); texel within 1 octave of road |
| DG-M2 | materials | M | PaintedPlaster017 (from g24) plus baked base darkening, edge AO and sand-stain band; 5 terracotta, ochre and lime-wash wall hues | `architecture.ts:161`; `world.ts:232-235` | - | wall stddev >= 14 (~5); >= 4 hues 12 deg apart; README problem 1 closed |
| DG-M3 | materials | S | Canal water: fresnel to sky, sun glint, silt foam, flow streaks; one transparent pass | `world.ts:58`; `shaders.ts` WATER_FRAGMENT | - | canal spread >= 60; moves >= 2 over 1 s; ch0 glint >= 240 |
| DG-M4 | materials | S | Brushed bronze masts with verdigris; jade emissive reserved for ring and board strips | material.ts:204,405; `world.ts:303-311,320-322` | - | jade clusters only in ring, board and HUD crops |
| DG-A1 | assets | M | Meshy palms, tamarisk and grass replace the Kenney tree (shard artefact) with 2k/1k/300 LODs | admission.ts:36; instances.ts:69; `world.ts:253` | 4 flora | no Kenney tree; flora <= 3 draws, <= +400k tris; README problem 2 closed |
| DG-A2 | assets | M | 3 adobe dwellings replace the Kenney house | admission.ts:37; instances.model; `world.ts:281` | 3 houses | 3 draws; gates pass; modeling >= 7 |
| DG-A3 | assets | M | Courier (ochre suit, long jade scarf) and hoverboard (jade thruster strips) retextures; remove cyan spheres; boost, lean and celebrate clips | meshy retexture and animate; mergeClips.ts; geometry-hash.mjs; `world.ts:320-322,379` | 2 retextures, 4 clips | hash same; rider >= 7% of height; validate-animation with 5 clips; problem 5 closed |
| DG-A4 | assets | S | Bronze signal mast with jade lens and pennants, instanced | instances.ts:63; `world.ts:303-311` | mast | 1 draw; jade lens visible on each mast |
| DG-A5 | assets | S | 2-3 landmarks per chapter 1-6 (sluice gate, searchlight tower, root arch, coral spires, orchard tree and pollen sail, crown arch, harbour bridge) | landmark() `world.ts:326-354` | ~9 landmarks | a landmark >= 4% of each chapter's frame; +4 draws per chapter |
| DG-V1 | vfx | M | Signature sand wake under the board scaling with speed and low altitude; canal spray variant | effects-api.ts:225,239; contracts/effects.ts:130-159; NEW sprites (E-F) | - | live particles > 0 below 6 m at > 20 speed, 0 above 10 m; bottom cell +4 vs vfx=off; <= 600 |
| DG-V2 | vfx | M | Twin jade ribbon trails widening on boost (needs E-F trail) | effects-api.ts:246-249; effects.ts:280; ProductionEffectSystem.ts:500-522 | - | ribbon >= 30 m on boost; no VFX_TRAIL_PENDING; +2 draws |
| DG-V3 | vfx | S | `silt-signal` ring pass burst with jade flash and beacon pulse; dust and debris on collisions | contracts/effects.ts:9,14,19; output.ts:17,20 | - | ring pass centre +15 after 100 ms; impact +8; < 96 live |
| DG-V4 | vfx | S | Ambient sand, fireflies and pollen, lantern motes, embers per chapter | effects.ts:248; contracts/effects.ts:146,159 | - | >= 1 live emitter per chapter; >= 3 cells change in a frozen 2 s strip |
| DG-AN1 | animation | S | Additive lean clips from bank, boost crouch, real celebrate clip, scarf spring bones | actorAnimationHandle.ts:490,612; `world.ts:375-424` | - | lean weight correlates with bank r >= 0.6; left vs right 2x change; 5 clips load |
| DG-AN2 | animation | S | Palm, tamarisk and banner sway in a custom flora vertex shader (until E-G instance wind) | material.ts:59; instances.ts:76,100 | - | >= 1.5 px RMS at palm crowns; +1 program max |
| DG-C1 | camera | M | 4 s rail establishing shot per chapter with bars, blending into the chase; title rail at the settled pose | contracts/camera.ts:53,55,67,97-100; CameraController.ts:143-147; `camera.ts` | - | rig rail then chase; skip within 1 frame; title 3 s vs 12 s within 15%; no rail point inside a collider |
| DG-C2 | camera | S | Boost fovKick +8 deg eased, roll 0.4x board bank (max 6 deg), ring-pass punch; off on reduced motion | contracts/camera.ts:48,52; motionReport.ts:109-110; `world.ts:440-447` | - | roll tracks bank, max 6; no FOV step > 2 deg/frame; 0 on reduced motion |
| DG-C3 | camera | C | 3 s finish orbit with DOF, then results over a live frame | contracts/camera.ts:53,64; effects.ts:131 | - | rider >= 15% of height; background -30% gradient energy |
| DG-H1 | hud | M | Poster HUD: Graphik body plus Canela titles; brass compass with jade needle (no #19e6ff); labels >= 13 px; hold prompts; flight HUD clear of the credit badge | `index.html:7-32` (both copies); `public/fonts/local.css:7` | Canela woff2 | both font checks true on the deployed route; no #19e6ff; no overlap at 1280 and 390; ui_hud >= 7 |
| DG-W1 | dressing | M | Seeded scatter of reeds, pots, cloth lines, column drums, scrub, ruins and bones outside 40 m of rings, near/far split with LOD | scatter.ts:177,214,252; groups.ts:39; `terrain.ts` | 5 props | none within 40 m of a ring; >= 25 in frustum; +8 draws max |
| DG-W2 | dressing | C | Sand drifts, aqueduct water stains and lamp soot decals | Decals.ts:494-495 | - | plaza stddev 1.3x; <= 32 decals |
| DG-PF1 | perf | M | Merge g24 instanced rings and coarse 2048 shadow; LOD all new flora and houses; <= 3 new programs; real-GPU row | types.ts:2509; instances.model lod; NEW `budget.json`, scenarios.json row | - | <= 140 / 110 draws; <= 18 programs; <= 4,000 ms compile; <= 1.2M tris; owner run >= 55 fps |

#### WP-35 (G25) cloud-runner-port (Cumulus Dash): "Storm-washed sky plateau"

- **Code:** `apps/showcase-cloud-runner-port` mounts `examples/kid-goku-beyond-the-clouds-port` (world.ts :57-65 on integration, :117-125 on g25; materials.ts; shaders.ts; props.ts; fx.ts).
- **Today:** `outdoor-day` look (the HDRI Roadster Rush and Slingshot also use) with fog 0, own sun and hemisphere; ignored authored grade; dropped SSAO; custom sky whose sun disagrees with the scenery light (`materials.ts:14-15`); custom scenery that never receives shadows; one rock map for everything; no app.effects, flare or camera sequences. Mean 126-131 at 1280; portrait 176 with saturation 0.07 (washed out); 69-149 draws; 647k tris.
- **Identity:** mid-morning just after a mountain squall, on a wet terracotta sandstone ridge above a sea of clouds: cobalt sky #2f6fb8, wet sandstone #b5643c, sage moss #6f8f4a, sky-pearl amber #ffb347 the only accent, a low 28-deg side sun, a rainbow in the antisolar sky, rain curtains under distant storm towers. Signature: a rainbow over silver-lined storm towers. Differs from Serpentine (pink, starry), Pip's and Cross Hop (cheerful daylight), Chroma Roll (paint arcade), and leaves the shared default HDRI and sun.
- **Engine deps:** E-A (hdri, environmentIntensity, key overrides), E-C (grade writer, authored grade wins, LUT, S4 trace, selective bloom, runtime post), E-D (rim), E-G (height fog default), E-I (prism judge, look-identity).
- **Budget:** <= 160 draws at s=60 and <= 140 at s=520; <= 560k tris (clouds <= 70k); <= 200 MB device textures; frame time +10% max; god rays, DOF and motion blur High/Ultra only.
- **Meshy:** hero retexture; 3 cumulus towers with impostors; 2 cloud-deck tiles; staff; 2 junipers; waystone; sandstone arch; bridge segment; hut; bird; cord pole. Sandstone strata set and puddle mask via assets resolve.

| ID | Area | Pri | Change | APIs and files | Assets | Acceptance |
|---|---|---|---|---|---|---|
| CD-01 | lighting | M | One SUN_POS drives the sky disc, scenery light, look sun and the shadowed directional; sun at 28 deg side-front, #ffe2b8 | contracts/looks.ts:12; lights.ts:51; g25 `world.ts:53,56`; `materials.ts:10-23` | - | unit test: all sun vectors within 3 deg, elevation 28 ±2; shadow crop 1.6x darker than lit |
| CD-02 | lighting | M | Custom scenery receives sun shadows (receiveShadow + a3dSunShadow); delete the fake hero shadow quad; 4 cascades, 160 m, PCSS | customMaterial.ts:445-450; shadow.glsl.ts:23; contracts/lighting.ts:8-9; ShadowSystem.ts:227; `materials.ts:72-87`, g25 `world.ts:190-191` | - | 4 cascades none skipped; grass under trees -20; +12 draws max |
| CD-03 | lighting | S | Cool unshadowed back rim (#9fc8ff 0.8); PBR rim after E-D | lights.ts:51; NEW rim (E-D) | - | hero silhouette vs 20 px ring >= 25 at three distances |
| CD-04 | env-sky | M | spruit_sunrise (or kloppenheim_02) IBL at 0.8, background false; look override after E-A | environments.ts:125-135; fixtures manifest.json:169-174; NEW look hdri (E-A) | spruit_sunrise | env names the HDRI; 0 errors; differs from Roadster Rush and Slingshot keys |
| CD-05 | env-sky | M | Post-storm sky in the shader: cobalt zenith, rain-washed horizon, 40-42 deg rainbow, 2-3 silver-lined storm towers, moving rain curtains | `materials.ts:25-35`; `shaders.ts` SKY_FRAGMENT | - | top cells 95-150; rainbow cell hue spread >= 0.15; draws unchanged; judge mentions a rainbow |
| CD-06 | dressing | M | 3 Meshy cumulus towers instanced with LOD and impostors past 600 m; cloud-sea deck tiles below the ridge | instances.ts:63-79; prd10/index.ts:116; cli.ts:111,147; `props.ts:77` | 3 towers, 2 tiles | clouds <= 70k tris, scene <= 560k at s=60 (647k); cloud draws <= 6 |
| CD-07 | env-sky | S | Aerial perspective toward #9fb8cf; haze 0.0032; height fog in gorges | effects.ts:52; `materials.ts:37-41`; compiler/fog.ts:79; contracts/flags.ts:224 | - | far mesa saturation <= 0.6x near track; mesa within 30 of horizon sky |
| CD-08 | post | M | One grade: remove the ignored node; temperature +0.08, warm gain, cool lift after E-C; storm-washed LUT later; vignette 0.2 | effects.post.ts:99; types.ts:922-925; NEW grade writer and authored-grade rule (E-C); `world.ts:63-65` | storm-washed.cube | one grade node; temperature shifts R-B >= 4; mean 105-125, p5 >= 25, p95 <= 235, clip < 0.02 |
| CD-09 | post | S | Sun lens flare on bends facing the sun; low god rays through towers on High/Ultra | lights.ts:15; lensFlare.ts:51-53; effects.ts:82; v2Stages.ts:789-790 | - | sky near sun +8, clip < 0.03; frame +2 ms max |
| CD-10 | post | M | GTAO runs (after the E2 normals fix) with the look's single AO node; contact shadows for feet and boulders | effects.post.ts:67; effects.lighting.ts:8-31; postBridge.ts:218; v2Stages.ts:733 | - | no dropped passes; S2:gtao in stagesRan; no contact-shadow warning |
| CD-11 | post | C | DOF in title flyover and finale; glider motion blur on High/Ultra (runtime toggle E-C) | effects.ts:131,150; types.ts:960-961 | - | finale background -40% variance vs hero; no DOF in play |
| CD-12 | materials | M | Wet sandstone track: roughness map (0.35 puddles, 0.9 dry), 20-30 puddle decals, sandstone strata set, normal map uniform on scenery | types.ts:172-182; Decals.ts:46,494; `materials.ts:84` | strata set, puddle mask | centre band mean <= 175 (181-214) with p95 >= 190; validate --release; <= 32 decals |
| CD-13 | assets | M | Hero retexture (teal tunic, amber sash); staff, junipers, waystone, bridge, hut, bird | meshy; cli.ts:111,147,197; `props.ts:147,192` | see Meshy | validate --release; hero hash same; <= 200 MB textures; 0 errors |
| CD-14 | materials | S | Sky pearls as the brightest objects (emissive core, fresnel halo); per-material bloom after E-C | `materials.ts:51-54`; effects.post.ts:27 | - | pearl p95 >= 240, road p95 <= 225 |
| CD-15 | vfx | S | Preset pack pearl-spark, cloud-puff, puddle-splash, storm-mist; glider trail; speed lines and landing dust | contracts/effects.ts:14-24; effects-api.ts:36-38; GameFeel.ts:101-102; `fx.ts` | - | liveCount > 0 on launch; colours differ from defaults; <= 96 |
| CD-16 | vfx | C | Waterfall off the ridge into the cloud sea, stream spray (no screen-wide rain) | `materials.ts:43-49`; geometry.custom; `fx.ts` | - | waterfall MAD >= 4 over 0.5 s; +4 draws |
| CD-17 | animation | S | Tree wind, two cloud drift speeds, 6-10 soaring birds, hero hair and sash spring bones if bones exist | instances.ts:76; public/index.ts:15; actorAnimationHandle.ts:618; cli.ts:197-204 | bird | canopy MAD >= 2 over 1 s; birds in >= 2 of 6 screens |
| CD-18 | camera | M | Title rail flyover past the towers and rainbow with bars; controller trauma replaces sine shake; launch fovKick +6; finale hut sequence | contracts/camera.ts:40,52,53,55; CameraController.ts:483; rail.ts:30; motionReport.ts | - | report passes; title sequence recorded; shake 0 on reduced motion; finale bounds in view |
| CD-19 | hud | S | Parchment and sandstone HUD, amber pearl icons, licensed display font; optional `sky-expedition` theme | HudKit.ts:197; themes.ts:7,25; register.ts | icons | no system or Google fonts; icons typed; no overlap at 640x360 and 390x844 |
| CD-20 | dressing | S | Cairns, cord poles with cloth strips and wind-carved arches over 3 gaps along the spline; moss and flowers in hollows | scatter.ts:89,177; instances.ts:63; `terrain.ts`, `props.ts` | arch, pole | +6 draws at s=60; edge cells stddev >= 30 |
| CD-21 | perf | M | Budget row; cloud LOD and earlier bush/flower culling pay for new effects | RenderDevice.ts:237; g25 budget test (633260d4a); CONTRACTS.md:1960; NEW `budget.json` | - | values within the row at s=60/520/1100/1420/1700 |
| CD-22 | hud | M | Art direction (signature rainbow over silver-lined storm towers); final screens and card; sibling judge vs Serpentine, Pip's, Cross Hop, Chroma Roll, Roadster Rush, Slingshot; panel round | define.ts:146; audit.ts:35; judge.ts; look judge.ts; NEW `art/direction.ts` | - | same_game false >= 0.8 for every pair; every category >= 7, lighting/environment/atmosphere >= 8; portrait saturation >= 0.18 (0.07) |

### 5.3 Cross-cutting work packages

#### WP-36 Meshy and asset batch
- [ ] Run the per-game Meshy lists above in parallel batches, one batch per game, with text-only generic prompts. Approximate totals: ~330 text-to-3d generations, ~130 retextures, ~25 rigs, ~120 animate tasks. Spend is uncapped; reserve and settle each job in `aura3d meshy ledger` so spend is visible.
- [ ] Every result: `aura3d assets import-meshy <dir> --name <key> --rights-evidence <rights.json> --profile prop|environment|vehicle|humanoid` (profile limits `packages/aura3d-cli/src/meshy/admission.ts:35-40`), then `aura3d assets optimize --meshopt --tex <1024|2048>`, then `aura3d assets validate --release --require-license`.
- [ ] Retextures: `--enable-original-uv true --enable-pbr true`; before/after `assets inspect` bounds plus the position-accessor hash diff (`packages/aura3d-cli/skills/aura3d-retexture/references/geometry-hash.mjs`); one matched filmstrip per retexture.
- [ ] Rigs and clips: `meshy rigging --height-meters <h>`, `meshy animate`, `aura3d assets merge-clips`, `aura3d assets validate-animation --require-rig`.
- [ ] Impostors: `aura3d assets bake-impostor` runs in a browser, so on the remote runner.
- [ ] Textures and HDRIs that are not Meshy: `aura3d assets resolve "<need>" --role texture|hdri` (ambientCG and Poly Haven adapters) or `aura3d assets add <file> --type texture|environment` from `fixtures/environment-corpus/hdri/` and `assets/library/hdri/`, each with a licence row.
- [ ] GLBs are LFS (`.gitattributes`); check that the runner context has real files, not pointer stubs (black frame with `RENDERER_MOUNT_FAILED` means stubs).
- Acceptance: `node tools/game-checks/run.mjs --all` reports 0 `asset-provenance`, `deployable-assets`, `likeness`, `brand-identifiers` and `prop-exclusivity` errors; the ledger total is recorded in `evidence/game-upgrades-47/meshy-ledger.md`.

#### WP-37 Site, posters and inventory
- [ ] After each game's final screens are retaken (`tests/browser/audit-fix/<game>.spec.ts` on the remote runner, `git add -f` the frames), rebuild posters: `node tools/site/build-card-images.mjs` (720x450 and 1440x900 webp, <= 200 KB each, copied to `marketing/public/previews/showcase-index/`).
- [ ] Regenerate `docs/workflows/game-inventory.json` (`node tools/site/gen-game-inventory.mjs`) and the showcase index (`node tools/site/gen-showcase-index.mjs`); update one-line descriptions in `tools/site/games.catalog.json` to the new identities.
- [ ] Commit side-by-side before/after posters per game in `evidence/game-upgrades-47/<slug>/poster-before-after.jpg`.
- [ ] After deploy: `tests/browser/live-index-games.spec.ts` on the remote runner (lesson B9).
- Acceptance: `screens-fresh` and `screens-tracked` report 0 findings after the `v4.7.0` tag; every poster changed (mean |dRGB| >= 8 vs the 4.6.0 poster).

#### WP-38 Proof and release
- [ ] Before captures: all 64 existing targets plus the ~45 new variant targets on the 4.6.0 build, decoded with `decode-luma.mjs`, committed under `evidence/game-upgrades-47/before/`.
- [ ] After captures, the same targets, `compare-luma.mjs` tables per game.
- [ ] Panel rubric round per game (`aura3d look judge --judge prism` once WP-9 wires it), `look-judgement.json` validated with `--validate`.
- [ ] Pairwise distinctness: every game's card and two gameplay frames against its genre neighbours (section 6.1 groups) and against every game that shares its time of day, with `aura3d evidence judge --mode sibling --trials 48`; outputs in `evidence/game-upgrades-47/distinctness/`.
- [ ] Flip the 4 new game-checks from warn to error.
- [ ] CHANGELOG 4.7.0 entry and release notes; every number labelled software WebGL2; no "built on three.js".
- [ ] Owner step: real-GPU runs for all 25 scenarios.

---

## 6. Visual and edge-case specs

### 6.1 Identity table (all 25 side by side)

| Lane | Game | Genre | Core palette (accent) | Time of day / variants | Sky and environment | Signature effect |
|---|---|---|---|---|---|---|
| G01 | top-tennis | sports | navy, racing green, terracotta, teal (electric yellow) | 6 venues: floodlit night, late morning, 18-deg golden, noon haze, magenta sunset, lunar daylight | rooftop_night, kloppenheim_02, venice_sunset, outdoor-midday, sunset-dramatic, starfield | surface ball marks and bounce puffs; crowd heads follow the rally |
| G02 | roadster-rush | racing | charcoal, tangerine, cobalt (player cyan, rival red) | sunset, dusk, night (sodium) | custom blue-hour dome + belfast or industrial sunset IBL | backlit skyway traffic above a haze floor |
| G03 | heatsink | racing | soot, oxidised iron, molten amber, slag red (coolant cyan) | sodium rain night, dust-storm sunset, violet pre-dawn | rooftop_night, industrial_sunset, spruit_sunrise | refraction heat haze |
| G04 | teleoperator | racing | slate-teal fog, dusk sky, sodium (objective teal) | marine dusk (boot), noon, marine fog, sodium night | belfast_sunset, outdoor-midday, autumn_field 2k, cobblestone_street_night + sky nodes | height-fog marine layer + LiDAR scan pulse |
| G05 | iron-crown | fighting | black iron, molten gold, ember crimson (venue accent) | forge night, midnight rain, dusk over water, noon dust, sunset haze, dawn snow | warm_bar, rooftop_night, venice_sunset, outdoor-midday, industrial_sunset, spruit_sunrise | single follow-spot chiaroscuro + letterbox cinematics |
| G06 | pips-big-leap | platformer | moss, toadstool red, birch cream (sun-seed gold) | 7 worlds: mid-morning to firefly night | spruit_sunrise, belfast_sunset, hangar_interior, warm_bar, rooftop_night + sky nodes | shallow-focus miniature DOF |
| G07 | aura-hoops-3d | sports | charcoal asphalt, sodium, chain-link steel (squad accent) | blue hour, sun behind board, noon, tungsten + rain outside, wet neon rain, Earth-shine | belfast_sunset, venice_sunset, outdoor-midday, indoor-workshop, rooftop_night, starfield | spray-tag decal after a Jam dunk |
| G08 | aura-diamond-3d | sports | turf green, terracotta clay, chalk (per-park accent) | last light, blue-hour rain, desert noon, spring sunrise, storm dome, lunar | belfast_sunset, rooftop_night, outdoor-midday, spruit_sunrise, hangar_interior, starfield | bat-crack splinter flash |
| G09 | aura-fc-3d | sports | storm navy, wet emerald, cold white (lime) | 4 night venues in weather, copper sunset, pale dawn mirror | night fill + night-2k IBL, spruit_sunrise, golden-hour | rain through floodlight shafts on wet turf |
| G10 | aura-links-3d | sports | per course | sunrise haar, late afternoon, dusk crater, cobalt noon, harbour night, airless | spruit_sunrise, autumn_field 2k, industrial_sunset, outdoor-midday, rooftop_night, starfield | broadcast flyover, tracer and cup cam |
| G11 | bunker-zero | action | concrete grey, olive steel, rust (hazard yellow) | 7 floors, one lamp colour each | hangar_interior IBL, practical lights only | gunfire lights the room |
| G12 | slingshot-siege | arcade/physics | chalk, sea teal, sand, driftwood (pennant red, lantern amber) | 6 chapters through one day | spruit_sunrise, outdoor-midday, overcast, kloppenheim_06 2k, belfast_sunset, starfield + sky | miniature DOF over a real sea horizon |
| G13 | dot-dash-3d | arcade | solder-mask green, copper, silver (LED cyan) | 6 boards under one desk lamp at night | indoor-workshop IBL, walnut bench | macro DOF + traces lit by the courier's path |
| G14 | cross-hop | platformer | chalk mint, butter yellow, terracotta, slate (coin gold) | 6-theme day clock: dawn to night to studio | spruit_sunrise, autumn_field, venice_sunset, industrial_sunset, rooftop_night, studio + gradient skies | tilt-shift blur bands + moving sun |
| G15 | strange-orbit-port | racing | terracotta, deep teal, chalk (amber, jade) | permanent planet-rise; 4 painted sectors | captured nebula and gas giant | brush-textured moving painting |
| G16 | splat-rush-port | platformer/arcade | ink teal, apricot, rose, lilac (4 gate colours) | golden to rose dusk to violet twilight by distance | custom sunset dome + kloppenheim_06 IBL for GLBs only | hand-inked cel paint carnival |
| G17 | serpentine-sky-run-port | runner | indigo, coral, cloud gold (pearl jade) | 8-stage evening colour script | custom serpent sky + cloud sea | scaled serpent road with stage colour script |
| G18 | drift-and-deliver-port | racing | wet asphalt, terracotta, mint, cream (courier teal) | golden, sunset, blue hour inside one shift | venice_sunset + time-driven sky | delivery beacon pillar |
| G19 | heatsink-port | racing | teal haze, aurora violet, magenta-amber (ion cyan) | alien blue hour; 8 tinted districts | captured aurora/planet dome | ion wake |
| G20 | ninja-runner-port | runner | indigo, persimmon, mist paper (lantern amber, spirit cyan) | one evening by distance: gold to vermilion to dusk to blue hour to stars | belfast_sunset (later per district) + driven dome | ink outline + vermilion scarf ribbon |
| G21 | last-train-port | racing/rail | apricot, rose, cream stucco, terracotta, lilac (lamplight amber) | 5 bands: afternoon to blue hour | belfast_sunset, industrial_sunset, rooftop_night | earned sky lanterns |
| G22 | roadster-hours-port | racing | salt white, sea teal, ochre (signal red) | 4 pm haze, last light, blue hour | route HDRIs for reflections + custom dome | crosswind salt spray |
| G23 | where-the-wind-wanders-port | arcade/exploration | sage, slate-teal sea, apricot (brass, wax red) | one afternoon advancing with each letter to dusk | kloppenheim_06 IBL for GLBs + a3d_sky dome | visible wind: cloud shadows and gust waves |
| G24 | silt-and-signal-port | racing/flight | sandstone, terracotta, bone, indigo (jade) | 7 hours of one day | belfast_sunset, outdoor-midday, industrial_sunset, kloppenheim_02, spruit_sunrise | sand wake + depth-faded ink |
| G25 | cloud-runner-port | runner | cobalt, wet sandstone, sage (pearl amber) | mid-morning after rain | spruit_sunrise + post-storm dome | rainbow over silver-lined storm towers |

Shared HDRIs across this table are only used for different purposes or are resolved before release: the `look-identity` check (E-I) compares the HDRI sha256 of each game's **primary** visible environment and fails on a duplicate; secondary IBL-only uses must differ in rotation and intensity and are listed in each identity sheet. Where two plans picked the same file as a primary sky (for example `belfast_sunset_puresky_2k` appears in several), WP-38 assigns it to the first game listed in its genre group and swaps the others to the next free file in the same mood family (`sunset-dramatic-2k`, `outdoor-golden-2k`, `industrial_sunset_puresky_2k`, `venice_sunset_2k`, `kloppenheim_02_2k`), or to an authored sky node. That swap is a one-line change in each game's look table.

Genre groups for distinctness judging:
- Racing: G02, G03, G04, G15, G18, G19, G21, G22, G24.
- Sports: G01, G07, G08, G09, G10.
- Platformer and runner: G06, G14, G16, G17, G20, G25.
- Action and fighting: G05, G11.
- Arcade: G12, G13, G23.

### 6.2 Phone and portrait

- Every game captures 390x844 as well as 1280x720. Portrait acceptance numbers are in each WP; where a WP is silent, portrait darkFrac must be within 0.1 of the landscape value and the subject must be at least 70% of its landscape screen fraction.
- Phones get the post tier from the device once E-G's post-only tier mode lands; until then each game caps DPR (`renderer.quality` tier) and drops god rays, DOF and motion blur below High (`packages/rendering/src/post/PostQualityTiers.ts:87-138`).
- HUD: touch targets >= 44 px; no HUD over the subject's projected box; text >= 12 px.

### 6.3 Reduced motion and flashes

- `prefers-reduced-motion`: camera sequences become cuts or are skipped; camera shake, roll, FOV kicks, motion blur, chromatic aberration pulses, slow-mo and secondary sway amplitudes drop to 0 or <= 30% as each WP states; particle emission halves.
- Reduced flash: lightning, super-flash and output-overlay flashes are skipped or capped at peak 0.3 for <= 200 ms (`SUPER_FLASH`, `packages/engine/src/agent-api/vfx/effects-api.ts:56`).
- Each game adds a unit or browser test that asserts its reduced-motion path.

### 6.4 Low-end quality tier fallbacks

- Low tier: 1 cascade, PCF, no local shadow lights, 4 lights per pixel, no AO, no god rays, no DOF, no motion blur, no grain or CA (`packages/rendering/src/contracts/quality.ts:54-97`). Every upgrade must degrade to something that still reads as the game's identity on Low: the palette, sky and signature effect stay; expensive post goes.
- Signature effects that are post passes (heat haze, LiDAR pulse, ink line, tilt-shift) ship a cheap Low variant (static tint, half-strength, or a fixed blur band) or are declared High-only in the art direction with a fallback cue.
- Per-game Low draw budgets are in each WP where the plan set one; otherwise Low must be at most 80% of the High budget.

### 6.5 Steady-state capture rules

- Judge only the 25 s and 60 s shots (`GL_SETTLE`, `tests/browser/game-luma-capture.spec.ts:21`); the first frame is lit by the analytic floor probe (lesson R20).
- Wait for the QA hook's texture-upload status before a judged shot (lesson R4); Saltwind needs all 58 textures uploaded.
- Discard black frames and check for LFS pointer stubs (lesson V1).
- Mean luma is never the only gate: use grid cells and named crops (E-I adds them).
- Every variant gets a target: venues, courses, parks, stages, worlds, themes, chapters, bands, floors, circuits, districts, skies.
- Captures run only on the remote runner: `RUN_ID=gu47-<slug>-<before|after> SPECS='tests/browser/game-luma-capture.spec.ts --grep=@gN' EXTRA_DIRS=apps/showcase-<slug> tools/remote-acr/run.sh`. One ACR step stops at 3600 s, so split by group tag; cancel a hung run after 20-25 min.

---

## 7. Verification and acceptance checklist

Local commands are static or unit-level only. All browser and capture work runs on the remote runner.

### 7.1 Per engine WP (WP-1 to WP-10)
- [ ] `pnpm typecheck` (`tsc -p tsconfig.check.json --noEmit`): error count at or below the 58-error baseline, no new errors in touched files.
- [ ] `pnpm test:unit` (vitest over `tests/unit`) passes; new unit tests for every NEW API.
- [ ] `pnpm lint` clean on touched files.
- [ ] `pnpm check:skills` passes after skill doc edits (materials-environments, game-art, art-direction).
- [ ] `pnpm check:bundle-size` run and the delta stated in the PR (`BUNDLE_SIZES.md:22-27`); no budget raised.
- [ ] Receipts committed under `evidence/receipts/<name>/` from a remote run, each with before/after frames and numbers.
- [ ] Flag promotions (WP-7): full 64-target before/after table shows no change > 2 mean luma on games that do not use the promoted feature.

### 7.2 Per game WP (WP-11 to WP-35)
- [ ] `node tools/game-checks/run.mjs <slug>` reports 0 errors and 0 warnings (including the new `art-direction`, `look-identity`, `prop-exclusivity`, `luma-band` checks).
- [ ] Game unit tests pass unchanged (sim, replay, parity, motion-gate, shaders-compile suites named in each WP), plus the new tests each WP lists.
- [ ] `pnpm typecheck` at or below baseline.
- [ ] `auditArtDirection` passes against a runtime snapshot of `art/direction.ts`.
- [ ] Remote steady-state capture of every variant target, before and after:
  `RUN_ID=gu47-<slug>-after SPECS='tests/browser/game-luma-capture.spec.ts --grep=<slug>--' EXTRA_DIRS=apps/showcase-<slug> tools/remote-acr/run.sh`
  then `node evidence/audit-fix/e5/decode-luma.mjs <acr-run.log> <out>` and `node evidence/audit-fix/e5/compare-luma.mjs <before> <after>`; numbers inside the WP's acceptance bands.
- [ ] Remote capture spec for final screens (`tests/browser/audit-fix/<game>.spec.ts`) at 1280x720 and 390x844; frames committed with `git add -f`.
- [ ] `budget.json` before/after rows inside the WP budget (draw calls from `app.diagnostics().drawCalls`, triangles from `info().render.triangles`, texture bytes, download size, route JS gzip from `node tools/bundle-report/report.mjs`).
- [ ] Every acceptance line in the WP table checked and marked in `evidence/game-upgrades-47/<slug>/checklist.md`; items blocked on an engine WP marked "blocked on E-x" with the interim result.
- [ ] Panel rubric round: `look-judgement.json` validated with `aura3d look judge --validate`, every one of the 12 categories >= 7.
- [ ] Sibling distinctness: `aura3d evidence judge --mode sibling --a <this game frames> --b <neighbour frames> --trials 48` against every genre neighbour (section 6.1): `same_game: false`, `same_game_confidence >= 0.8`.
- [ ] Identity sheet `evidence/game-upgrades-47/<slug>/identity.md` written.
- [ ] Before/after poster pair committed.

### 7.3 Release gate (WP-38)
- [ ] `node tools/game-checks/run.mjs --all --strict` exits 0 with the 4 new checks at error level.
- [ ] All targets in `tests/browser/game-luma-targets.ts` captured on the 4.7.0 build; `luma-band` passes for every committed JSON.
- [ ] Distinctness matrix complete in `evidence/game-upgrades-47/distinctness/summary.md`: every in-group pair `same_game: false` at >= 0.8.
- [ ] 25 of 25 panel judgements with every category >= 7.
- [ ] Posters rebuilt; `screens-fresh` clean after the `v4.7.0` tag.
- [ ] CHANGELOG 4.7.0 lists engine additions and per-game look changes; every visual number labelled "software WebGL2"; grep of release notes and site copy for "three.js" finds no claim that Aura3D is built on it.
- [ ] `tools/real-gpu/scenarios.json` has 25 scenarios; owner run scheduled (agents do not run it).
- [ ] Live smoke `tests/browser/live-index-games.spec.ts` on the remote runner after deploy.
- [ ] Code-completion % reported, then `CODE_COMPLETE_GO` frozen before acceptance captures (D10).

---

## 8. Out of scope and guardrails

- **No local Docker, no local Playwright, no local browsers for captures.** Every frame comes from `tools/remote-acr/run.sh`. Loopback CDP is only for REA or a local dev server that the cloud browser cannot reach.
- **No gameplay changes** beyond read-only values a visual needs (brake flags, nearby-interaction state, district names). Sims, physics, collision, scoring, input, replays and reference hashes stay byte-identical; ports keep `reference-replay` tests passing.
- **No new games, modes or levels.** New props are dressing; collision changes are only allowed where a Meshy tile is fitted to an existing collider box with unchanged bounds.
- **Real-GPU runs are owner-only.** Agents add scenarios; they never execute `tools/real-gpu/run.sh`.
- **Claims:** every number is software WebGL2 until the owner run exists. No "beats three.js" or performance claims from these changes; comparison numbers stay only in `evidence/vs-threejs/RESULTS.md`. Aura3D is never described as built on three.js.
- **Assets:** Meshy prompts are generic text, never another game's frames, brands, logos, real stadiums, teams or named characters. Every asset has a licence row and rights evidence. No shared asset keys across live games except generic engine assets.
- **Fonts:** licensed faces from `/Users/gurbakshchahal/fonts` only; no Inter, Roboto, Google Fonts (Barlow), Geist or system stacks.
- **Budgets are not raised to pass.** Over-budget changes are reworked (instancing, merge, LOD, impostors) or cut.
- **Engine scope:** only the NEW APIs in section 3.1. Rendering refactors, WebGPU work, bundle-size Track C and the beat-three.js part 3 WPs are out of scope; if beat-three.js WP-1 moves a game off `hdr-msaa`, that game is re-captured but its look work is not reopened.
- **Secrets:** Prism keys come from `PRISM_KEY_FILE`/`PRISM_API_KEY` and Meshy keys from env; none go into code, logs or evidence.
- **Reversibility:** each game's look change sits behind its look table, and ports keep a `?look=original` (or equivalent) switch where the plan defines one, so a regression can be reverted per game without touching others.

### Appendix: dependency map (game item to engine lane)

| Engine lane | Games whose items wait on it (interim path shipped meanwhile) |
|---|---|
| E-A looks/HDRI | G01, G02, G03, G04, G05, G06, G08, G09, G10, G11, G12, G13, G14, G19, G20, G21, G22, G24, G25 |
| E-B runtime light/env/fog | G01, G02, G03, G04, G06, G09, G11, G14, G15, G17, G18, G20, G21, G23, G24 |
| E-C post | all 25 |
| E-D materials/custom shaders | G02, G05, G07, G08, G10, G11, G12, G13, G15, G16, G17, G18, G19, G20, G22, G23, G24, G25 |
| E-E outline/toon | G16, G20, G24 |
| E-F runtime VFX | all 25 |
| E-G flags/world/sky | G04, G06, G07, G08, G09, G10, G12, G14, G18, G19, G20, G21, G22, G24, G25 |
| E-H camera/animation/crowds | G01, G03, G04, G05, G07, G08, G09, G10, G12, G13, G17, G20 |
| E-I proof tooling | all 25 |
| E-J HUD themes/genre | G06, G11, G13, G20, G25 |
