# PRD 14 — 18-Game Rebuild Program

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit` @ `3a51cba3` (audit capture sha `c08d8acb`).
Status: proposed. Owner area: `apps/aura-clash-showcase` plus the 17 game dirs `apps/showcase-{blockfall-reactor,skyline-runner,turbo-drift-circuit,
siege-golf,aurora-lander,neon-swarm,gravity-post,courier-rush,pulse-tunnel,mech-hangar,vault-breakers,rooftop-buckets,gallery-shift,deep-recovery,
patrol-wing,bank-shot,orbital-defense}` (the other `apps/showcase-*` dirs are non-game showcases, out of scope §24), `tools/quality-rebuild-capture/`,
`.github/workflows/quality-rebuild-capture.yml`, `apps/showcase-index`, each route's `route-health.json`. The 18 ids are exactly the `games[].id` list in
`tools/quality-rebuild-capture/games.json`.

Path conventions used below: bare `index.ts:<n>` means `packages/engine/src/agent-api/index.ts` (18,733 lines at `3a51cba3`); `GameRenderPreset.ts` and
`TypedGLBActor.ts` are under `packages/engine/src/production-runtime/`; `GameRuntime.ts` and `GameFeel.ts` under `packages/engine/src/agent-api/`;
`WebGL2Device.ts`, `DepthPass.ts` and `MeshConsolidation.ts` under `packages/rendering/src/`; bare `main.ts`/`environment.ts`/… inside a game row or
plan are `apps/<that game's dir>/src/…`. Line numbers are at `3a51cba3`; a task that cites a line must re-locate it by the quoted symbol if lines moved.

Evidence base: `research/21-game-vision-judgment.md` (authoritative for every visual category), `research/20-game-scorecards-code-pixelstats.md`
(authoritative only for sound, controls, physics feel, game feel, loading, performance), `research/17-games-g1..g5.md` (code forensics per game),
`research/16-route-local-extraction.md` (route composition and duplicated systems), `research/11-asset-pipeline.md`, `research/19-claim-verification.md`
(corrected counts: ambient-kills-IBL hits **15 of 18** games; Aura Clash avoids it through its compatibility-source path), `research/23-benchmark-vision-judgment.md`,
`_sections/B-game-scorecard.md` (merged scorecard), capture report `evidence/games/report.slim.json` (GH Actions run 37289688772, macos-14, ANGLE Metal on an
Apple paravirtual GPU, production origin `https://aura3d.auraone.ai`).

Rule for this PRD: a game is done only when the shipped default route, captured by `tools/quality-rebuild-capture` with real input on the remote
runner and on the human-review devices, is judged **competitive with a well-built modern three.js browser game** by both a vision-model pass using
the research/21 rubric and a human review panel, at overall ≥ 7/10. Passing unit tests, route 200s, non-blank screenshots, green parity matrices,
`release` asset labels and self-reported 60 fps do not count. A game that cannot reach the bar after two full review rounds is withdrawn from the
public showcase, not relabelled.

---

## 1. Problem statement

Aura3D ships 18 browser games. None is competitive.

- Visual overall scores (research/21): 1.5 (Orbital Defense) to 4 (Blockfall Reactor, Skyline Runner, Rooftop Buckets). Fleet mean 3.0. research/21 answers
  "competitive with a well-built modern three.js browser game?" with **No** for all 18. Composite means (32 categories) range 1.8 to 3.8.
- Lowest fleet categories: particles 1.4, atmosphere 1.4, IBL 1.5, shadows 1.6, VFX 2.2, juice 2.2, textures 2.3, mobile 2.5, PBR 2.5
  (`_sections/B-game-scorecard.md` §1 bottom row). Highest are not 3D at all: typography 5.5, HUD 5.2, AA 4.9, controls 4.7.
- Non-visual (research/20, rounded): audio mean 2.7 (Orbital 0, Courier 1.5), game feel 3.2, physics 3.8, loading 4.1, performance 3.4.
- Performance is a real defect: 13 of 18 games run under 20 fps at 1920×1080 on the runner and 11 under 15; Deep Recovery runs at 0.5 fps. Orbital
  Defense (59.6) and Vault Breakers (57.4) hold ~60 fps on the same runner, so the runner is not the cap. The engine's own fps telemetry reports 60 in
  every slow game (research/20), so nobody saw it.
- Production defects that are not about taste: Courier Rush goes permanently black on `RenderDeviceError: Render context is lost` with no restore path;
  Pulse Tunnel's mobile canvas is 374×187 CSS px on a 390×844 screen; Gallery Shift's characters freeze (empty retargeted pose, C16, `index.ts:13871`);
  Gravity Post's keyboard launch is dead and two planets render black; Skyline Runner shows Lives 0 while play continues; Turbo shows "GGhost OFF" (a `<b>G</b>` keycap butted against the "Ghost OFF" span with no gap, `hud.ts:146`);
  debug/marketing UI ships to players in ~11 games.

The engine PRDs (01–13) remove the ceiling. They do not by themselves produce a competitive game: in the same-input benchmark, three.js r185 itself
scores only 4–6 on scenes built from programmer-art content (`01` 4.5, `10` 4.5, `17` 4.5, `18` 5; research/23 lines 60, 644, 1064, 1125), and the only
scene where Aura3D approaches three.js uses a professionally authored asset (`03-damaged-helmet` 6.5 vs 7.0). Reaching 7 requires authored content,
art direction, camera, VFX, audio and juice on top of a correct renderer. This PRD is that program: one plan per game, a rebuild order, the shared kits,
and the acceptance gate that closes the whole quality program.

It also fixes the process failure that produced the current fleet. Content iterated against broken defaults gets tuned around the defects: Pulse Tunnel
agents rejected Quaternius CC0 PBR kits because the renderer showed them black (17-g4 §3.3) and shipped a 128² NEAREST kitbash instead. Rebuilding art
before the default fixes land would repeat that, so the program begins by re-baselining every game on fixed defaults (Wave 0) before any art spend.

## 2. Evidence from current code

### 2.1 Fleet scoreboard (visual from research/21, non-visual from research/20, fps from report.slim.json 1920×1080)

| Game | Route dir (entry LOC) | Overall | Mean | fps | research/21 verdict | Defining code causes |
|---|---|---:|---:|---:|---|---|
| Aura Clash Arena | `apps/aura-clash-showcase` (`src/playable/AuraClashArenaApp.ts` 4,285) | 3 | 3.5 | 11.1 | substantial (presentation) | side-view preset `targetFormat:"rgba8"` (`GameRenderPreset.ts:372-386`) + tone operator defaulting to `"reinhard"` when none is passed (`WebGL2Device.ts:1906`); root discards source shadow (`index.ts:13991,14002`); tints over MR maps (`AuraClashArenaApp.ts:3371-3425`); arena scale 0.5876 vs fighter 1.08 (`:837-844`); 60° FOV (`fovYRadians ?? Math.PI / 3`, `:1239`) |
| Blockfall Reactor | `apps/showcase-blockfall-reactor` (2,374) | 4 | 3.7 | 9.8 | substantial (presentation) | 3 of 4 models 4-tri unlit cards; 200 hidden legacy boxes (`createLockedBlockNodes`, defined `reactor-scene.ts:516`, mounted `main.ts:630`, draw-call A/B probe `main.ts:763-826`); fov 32 static (`main.ts:479-489`, value at `:482`); ambient-kills-IBL |
| Skyline Runner | `apps/showcase-skyline-runner` (3,974) | 4 | 3.6 | 11.4 | substantial (3D layer) | hero is a 4-tri card; textured runner tint-wiped, ghost only; `pixelRatio:0.7` (`main.ts:1875-1879`); public guide boxes (`:1960-1971`); first fog node only (`index.ts:12743`) |
| Turbo Drift Circuit | `apps/showcase-turbo-drift-circuit` (5,723) | 3 | 3.5 | 19.7 | substantial | track GLB 28 flat mats 0 textures; hero car 5.4k tris BC-only; studio IBL outdoors (`main.ts:3002`); flat `#df967d` clear (`scenery.ts:39`); shadow fit over 500-unit ground |
| Siege Golf | `apps/showcase-siege-golf` (1,835) | 3.5 | 3.7 | 7.1 | substantial (art + scene) | `app.setScene` per camera phase (`main.ts:975-985`, verified) → 1.1 s p95; course GLB no UVs, flat normals; crate maps wiped (`main.ts:329`) |
| Aurora Lander | `apps/showcase-aurora-lander` (1,857) | 2.5 | 3.1 | 52.2 | substantial | no sky; opaque aurora boxes (alpha-over only, `main.ts:555-566`); 460-tri probe; ghost opacity dropped by tint path; 96 m terrain tile (`sites.ts:50-54`) |
| Neon Swarm | `apps/showcase-neon-swarm` (2,054) | 2.5 | 3.1 | 25.8 | substantial | `cameraDirector` result discarded (`main.ts:1667-1671`); 7 `gameEffects.spawn` never rendered; courier tint-wiped (`main.ts:688-701`); enemies 18/22-tri discs |
| Gravity Post | `apps/showcase-gravity-post` (2,489) | 3 | 2.7 | 6.4 | substantial (visual layer) | ~330 un-instanced primitives, 471+ draws; HUD `innerHTML` per frame (`main.ts:2378`); gate PBR wiped (`main.ts:492-499`); keyboard launch never called (`main.ts:1447-1461`) |
| Courier Rush | `apps/showcase-courier-rush` (1,492) | 2 | 2.8 | 7.1 | substantial | context loss with no restore; ~1,530 draws; ambient 1.25 (`main.ts:270-313`); traffic tint-wiped (`main.ts:391-398`); engine/ambience loops never cued (`courier-audio.ts:105-106`) |
| Pulse Tunnel | `apps/showcase-pulse-tunnel` (2,628) | 3 | 2.9 | 23.5 | substantial (presentation) | camera is one literal (`main.ts:1589-1591`); world static; 128² NEAREST textures (`build-encounter-finish-v11.py:74-107`); particles review-only (`main.ts:1264-1467`); 65% evidence code |
| Mech Hangar | `apps/showcase-mech-hangar` (1,577) | 3.5 | 3.2 | 9.3 | substantial | 144–608-tri JS-generated parts (`scripts/build-models.mjs`); no animation (yaw only, `main.ts:892,938`); 27.3 MB unrigged hero ×2; 4 directionals light both sets |
| Vault Breakers | `apps/showcase-vault-breakers` (986) | 2.5 | 2.8 | 57.4 | substantial (whole visual layer) | 1,012-tri synth `vaultBreakersTable` under a "Real catalog pinball cabinet — textured" comment (`environment.ts:61-69`); Sketchfab cabinet (12 PBR maps) unused; chrome ball under no IBL |
| Rooftop Buckets | `apps/showcase-rooftop-buckets` (1,799) | 4 | 3.8 | 7.6 | substantial (art layer) | box sky bands (`environment.ts:22-55`); skinned 191-joint players only under `?debug=animation` (`main.ts:502-536`); `setMaterial` every frame (`:1184,1223,1239`); raw `new Audio` (`buckets-audio.ts:44-48`) |
| Gallery Shift | `apps/showcase-gallery-shift` (2,048) | 3 | 3.0 | 10.1 | substantial | thief never rotates (`main.ts:1353-1357`, verified); 31 lights over 16-light cap; two ambients total 1.56; 72-tri unlit hero; static camera 24.6 m |
| Deep Recovery | `apps/showcase-deep-recovery` (1,090) | 2.5 | 2.6 | 0.5 | substantial | CPU `volumetricFog` readback (`main.ts:280-285`), p50 1,917 ms; searchlight fixed in world (`environment.ts:58-69`); camera smoothing 0 (`main.ts:305`); faceted no-UV GLBs |
| Patrol Wing | `apps/showcase-patrol-wing` (1,652) | 3 | 3.3 | 15.8 | substantial (env, lighting, camera) | no sky/IBL/water; ocean is a flat 90×90 plane (`sky.ts:329-338`); 108-tri drones; evidence strip in HUD (`main.ts:136-140`); FOV 47 |
| Bank Shot | `apps/showcase-bank-shot` (1,139) | 3 | 3.0 | 14.9 | substantial | balls never rotate (`main.ts:741-745`, verified position-only); directional outranks lamp for shadow (`index.ts:13227,13244,13267`); no renderer option → DPR 1 |
| Orbital Defense | `apps/showcase-orbital-defense` (430) | 1.5 | 1.8 | 59.6 | **full rebuild** (visual layer) | 0 GLB / 0 textures; opaque 1.13× emissive shell hides planet (`main.ts:82-131`); HUD `innerHTML` per frame (`:313,341-377`); no audio; false "particle-heavy" claim (`:74`) |

### 2.2 Engine defects that every rebuild depends on (research/19 corrected; owners in §12)

| Tag | Code | Games hit |
|---|---|---|
| ambient-kills-IBL | `packages/engine/src/agent-api/index.ts:12693-12707` (zeros at :12705) | 15 of 18 (not Aura Clash; Siege Golf and Turbo author `environments.studio`, a 128×64 LDR probe, C10) |
| exposure-dropped | root tone map fixed ACES exposure 1, `index.ts:12898-12904` | 16 pass `colorGrade.exposure` |
| DPR-1 | safe-basic `pixelRatio: 1`, `index.ts:4256` | ~13–14 |
| tint-wipe | `replaceSurfaceTextures: true`, `index.ts:13570`; `TypedGLBActor.ts:477-507` | Aura Clash, Skyline, Siege, Neon, Gravity, Courier, Deep, Aurora (opacity), Patrol (ghost) |
| effects-zero-px | particles/rain/snow/flipbook/beam non-pixel-backed on production bridge, `index.ts:13723`; `game.effects`/`gameFeel` data-only (`GameRuntime.ts:2800-2879`, `GameFeel.ts:1-17`); `rg '\.nodes\(\)'` = 0 hits in routes | all |
| shadow-0.32 | `index.ts:12966-12968`; depth pass ignores skinning/instancing/alpha (`DepthPass.ts:59-87`); single map fit over all casters; no CSM on root | all |
| no-sky | root never draws environment background (C9) | all |
| bloom-knee | softKnee 0.5 × "balanced" gain blooms mid-tones; threshold clamped ≤1 (C13) | all 17 that author `neonBloom` |
| fake-AA/AO | "FXAA" is a 4-tap cross blur on 4× MSAA; SSAO ≈0 at gameplay depth (C14) | all that author `antiAlias`/`ambientOcclusion` |
| instancing size | `createProductionInstanceTransforms` omits `node.size` (`index.ts:14747`, research/22 §16) | Blockfall, Neon, Turbo (43 `instances.*`), Rooftop |
| light cap | `pbr-textured` caps at 16 direct lights (research/04 §4) | Gallery (31), Courier (~20), Deep (16) |
| no runtime node add | `AuraRuntimeNodeRegistry`, `index.ts:10664-10670` | forces parked pools (y=-50/-60) that inflate shadow fit |

### 2.3 Route composition (research/16)

- 87,714 classified LOC across the 18 routes: 34% evidence/proof/capture, 34% presentation, 32% gameplay (+34,332 generated). Pulse Tunnel is 65%
  evidence, Gravity Post 48%, Aura Clash 47%.
- 16 of 18 routes branch on `?capture=review` **395 times** (research/16 §1; per route: Rooftop 81, Pulse 52, Neon 40, Gravity 37, Skyline 35,
  Blockfall 30, Aurora 21, Bank 21, Deep 17, Patrol 16, Courier 15, Gallery 12, Siege 9, Mech 5, Vault 4, Aura Clash 1; Turbo and Orbital 0 on that
  flag, but Turbo has 92 `visualCaptureCamera` branches), changing lights, emissive, materials, scale and pose (example block:
  `apps/showcase-rooftop-buckets/src/main.ts:322-382`, emissive 3.05 vs 1.4). The shipped frame was never the frame being reviewed.
- 31+ distinct `window.__*__` evidence globals; 0 users of `game.evidence`. 17 near-identical ~170-LOC audio wrappers. 13 copies of
  `scripts/write-performance-report.ts`. 0 routes handle `visibilitychange`.

### 2.4 Good assets in the repo that the games bury (research/21, 17-*)

| Game | Asset | Treatment today |
|---|---|---|
| Aura Clash | `auraClashPlayerRig` (35.5k tris, 65 joints, BC+N+MR), `arenaNeonDowntownTextured` (98.6k tris, 26 maps) | outfit tinted, MR replaced, flat emissive added; arena at 59% scale; foreground props filtered (`:872-877`) |
| Skyline Runner | `skylineHeroRunner` (48k, BC+N+MR), `skylineHeroMeshyV2` (80k) | tint-wiped ghost; unused |
| Vault Breakers | `vaultBreakersCabinet` (Sketchfab, 12 PBR maps), `...CabinetHigan`, `...FlipperReal` | never referenced in `src/` |
| Rooftop Buckets | `rooftopLayupScorer`/`rooftopDefender` (44.6k, 191 joints, 47 maps, 4 clips) | mounted only under `?debug=animation`, `visible:false` |
| Courier Rush | `courierTrafficSedan`/`Hatch` (14/6 PNG maps) | override colour wipes maps |
| Gravity Post | `gravityPostDockGate` (14 × 1024² maps) | override wipes maps |
| Patrol Wing | `patrolAircraftMeshy` (60k, BC+N+MR) | rendered with no IBL (metal reads dark) |
| Pulse Tunnel | Quaternius CC0 kits in `art-review/external-source/quaternius/*` | rejected by critic under broken renderer |
| Turbo | `showcaseCcByFormulaOpponent` (31k, 13 mats) | used for AI; the hero is the 5.4k BC-only car |

### 2.5 Asset bytes (research/11 §2)

120 referenced model ids total 463 MB of uncompressed GLB, 0 Draco/Meshopt/KTX2. Gravity Post loads 46.8 MB in ~9.9 s to ready; Mech Hangar 28.5 MB
(27 MB one hero). Five games ship 0.4–3 MB of untextured boxes. Both ends are wrong.

## 3. Root cause

1. **Defaults discarded authored work.** Across genres the same eight defaults (§2.2) zeroed IBL, exposure, shadows, VFX pixels, textures and
   resolution. From a still frame, a silently discarded feature looks the same as one never authored, so agents compensated with ambient lifts,
   emissive everything, flashlight point keys and fake contact discs. Vision judges assigned these to "authoring" (35–45%); code judges found engine
   plus defaults at 25–53% (median ~37%). Both are correct (`_sections/B` §3.4).
2. **No art direction per game.** No game has a reference board, palette, key-light design, HDRI choice, framing target or asset budget. Every past
   "visual pass" changed hex values on primitives (17-g3 §2.12). Comments such as "complete 10/10 visual environment" over a box room
   (`apps/showcase-bank-shot/src/environment.ts:10`) show self-grading without a reference.
3. **Content was synthesized to pass gates, not sourced to look good.** 71 of 131 release models have no textures, 13 are 4-tri unlit cards
   (C19); the texture gate is waived by a phrase regex (`packages/aura3d-cli/src/index.ts:3376-3382`). Mech Hangar, Deep Recovery, Bank Shot,
   Vault Breakers, Gallery Shift, Siege Golf, Aurora Lander and Patrol Wing ship JS/Blender-script geometry as `release`.
4. **The iteration target was the review frame.** 395 capture branches; gates like `minimumNonBlackPixels: 1500`, mean-luma targets
   (`aurora main.ts:594-597`) and `likelyBlank:false` on Courier's black world passed frames a human rejects.
5. **No shared game layer.** Each route rebuilt shell, HUD, audio wrapper, FX pool, camera, pause and evidence (research/16). The output was dashboard
   pages with a canvas card, synthesized chiptune audio, and performance never measured from rAF intervals.

## 4. Affected packages

| Package | Change in this PRD |
|---|---|
| `apps/aura-clash-showcase`, `apps/showcase-*` (17) | Rebuilt per §6.9. Gameplay modules kept, presentation and evidence rewritten on `@aura3d/game` (PRD 09) |
| `tools/quality-rebuild-capture` | `games.json` fields on top of PRD 12 (§7.2): required conditions, canvas-region black check, acceptance and budgets |
| `tools/quality-gate` (PRD 12, internal) | `src/scorecard.ts` scorecard builder and verdict (§7.3), human-review form export |
| `.github/workflows/quality-rebuild-capture.yml` | Per-game matrix jobs, PR-triggered capture for touched `apps/<id>/**`, artifact retention 30 days |
| `apps/showcase-index` | Lists only `qualityGate.status === "accepted"` games publicly |
| `@aura3d/game` (PRD 09) | Consumer; adds `art` subpath types (§7.1) |
| `aura.assets.json` / `public/aura-assets/` | Kits K1–K9 (§6.4) admitted through PRD 05 verbs; buried assets promoted; synth release models demoted |
| `packages/create-aura3d/templates/*` | Receive the pilot patterns via PRD 13 (not edited here) |

## 5. Affected files and directories

Per game, the files kept (gameplay) and deleted or rewritten (presentation/evidence). Paths are under `apps/<dir>/`.

| Game | Keep (gameplay, tests) | Rewrite | Delete |
|---|---|---|---|
| Aura Clash | `src/playable/{combat,input,state,training}/**`, `fighterSecondaryMotion.ts`, `auraClashClipMaps.ts`, `SpringJointSigns.ts`, `RoundCeremony.ts` | `src/playable/AuraClashArenaApp.ts` (split to `src/scene/*`), `RenderedArenaStage.ts`, `playable.css`, `styles.css` | `rendering/GamePostProcess.ts`, `rendering/GameLighting.ts`, `rendering/HitSparkVfx.ts`, `fighters/AuraBurstDirector.ts` (all dead, 17-g1 §5), `showcaseProofBoot.ts`, 6 unskinned roster GLBs, crowd card usage |
| Mech Hangar | `src/arena/mech-fight.ts`, combat AI wiring, `characterAssembly` validation, input map | `src/main.ts`, `src/arena/feel.ts`, `src/hud.ts`, `styles.css` | `scripts/build-models.mjs` outputs (`mechChassisA..D`, `mechArmsA..D`, `mechLegsA..D`, `mechWeaponA..D` as release), `scripts/build-sfx.mjs`, asset-passport panel |
| Orbital Defense | wave/heat/shield logic in `src/main.ts` (~430 LOC, extract to `src/gameplay/waves.ts`) | everything else | `route-health.json` claim text "particle-heavy" |
| Turbo Drift | lap/race/AI/ghost (`ghost.ts`, `opponent-ai.ts`, `race-proof.ts` logic), `feel.ts` | `src/main.ts` (5,723 → ≤600), `scenery.ts`, `track-props.ts`, `signage.ts`, `hud.ts` | 92 capture branches, `turboHairpinVenueKit` capture-only mount, `turboAlpineVenueBackdrop` card, `src/generated/game-geometry.ts` if superseded by new track collider |
| Skyline Runner | `level-layout.ts`, platformer kit wiring, acts, sensors, `ghost.ts` | `src/main.ts`, `backdrop.ts`, `foliage.ts`, `act-palette.ts`, `hud.ts` | `skylineArcticRunnerHero` card, `skylineIceLedge*` cards, guide-box overlay, 5-rig light stack, `lights.studio` |
| Courier Rush | dispatch, `traffic.ts`, `van.ts` arcade vehicle | `src/main.ts`, `city.ts` (902), `hud.ts` | `city.block` prefab usage, 30 box rain traces, emissive "road reflection" slivers (`city.ts:238-249`), review canyon set (`city.ts:762-773`) |
| Patrol Wing | `flight.ts`, ring/sensor layer, patrol grading, `ghost.ts` | `src/main.ts`, `sky.ts` (868) | `patrolWingDroneA/B` (108-tri), glass-sphere clouds, 16 sky streak boxes, evidence strip |
| Siege Golf | `structures.ts`, `hole-flow.ts`, `shot.ts`, `replay-proof.ts` logic | `src/main.ts` scene builders (`buildValleyEnvironment` :739-796, `buildSetDressing` :441-679) | `siegeGolfCourseWorld` synth, 26 hill/tree spheres, `paintedTimberMaterial`, debug slider panel (`main.ts:111-117`) |
| Rooftop Buckets | `hoop-sim.ts`, `shot.ts`, `rim.ts`, `scoring.ts`, state machine | `src/main.ts`, `environment.ts` (1,113), `buckets-audio.ts` | box sky bands, `rooftopShooter`, `rooftopShooterV2`, `rooftopDefenderV2`, `.candidate-assets/`, static posed athletes |
| Bank Shot | `rules.ts`, `racks.ts`, `table.ts` physics, `cue.ts` aim | `src/main.ts`, `environment.ts`, `billiards-audio.ts` | 16 contact-shadow cylinders, poster boxes, evidence strip |
| Vault Breakers | `table.ts`, `flippers.ts`, `ball-flow.ts`, `missions.ts`, `scoring.ts` | `src/main.ts`, `environment.ts`, `scoreboard.ts` | `vaultBreakersTable` synth as visual (keep as collider source only), false "textured" comment (`environment.ts:61`) |
| Blockfall Reactor | `rules.ts`, instanced tile pools, stem audio system, `board-view.ts` logic | `src/main.ts`, `reactor-scene.ts`, `clear-fx.ts`, `camera-feel.ts` | `createLockedBlockNodes` 200 boxes (`reactor-scene.ts:516`, mount `main.ts:630`) and the A/B probe (`main.ts:763-826`), 3 unlit card GLBs, marquee occluder boxes (`main.ts:548-567`) |
| Neon Swarm | `swarm.ts`, `waves.ts`, input buffer, instancing approach | `src/main.ts`, `environment.ts`, `combat-feel.ts`, `hud.ts`, `player.ts` visuals | arena card, moth cards, 272k-tri lamp props (replace), review dressing branch |
| Pulse Tunnel | `beat-clock.ts`, `patterns.ts`, `gates.ts`, audio stems | `src/main.ts`, `player.ts` visuals, `hud.ts`, `styles.css` | `art-review/` (82 MB), 11 `build-*-v*.py` scripts, 128² NEAREST textures |
| Aurora Lander | `lander.ts`, `terrain.ts` height function, Rapier heightfield, `prediction.ts`, `ghost.ts`, `touchdown.ts`, campaign | `src/main.ts`, `sites.ts` visuals, `hud.ts` | `auroraLanderProbe` (460-tri), `auroraPadBeacon` (66-tri), 72 snow spheres, aurora boxes, image cards |
| Gravity Post | `wells.ts`, `pod.ts`, `contracts.ts`, `scoring.ts`, `prediction.ts` | `src/main.ts:274-1240` scene graph, HUD | `gravityPostCourierSkiff`/`FreightDistrict` synth (32² stripes), 84+24 in-volume star/dust spheres, 78 bead spheres, `freightway.ts` review set |
| Gallery Shift | `floor.ts`, `vision.ts`, `guard.ts` FSM, detection meter | `src/main.ts`, `environment.ts` (695), `thief.ts` visuals | `showcaseRunnerGirl` (72-tri unlit), synth pedestals/cases/exhibits, box harnesses, world-text labels, emissive light-pool discs (`main.ts:743-771`) |
| Deep Recovery | `sub.ts`, `sonar.ts`, `salvage.ts`, `oxygen.ts`, HUD structure | `src/main.ts`, `deep-audio.ts` | `environment.ts` (953), all `scripts/build-models.mjs` outputs, `volumetricFog` node |

All 18: delete `?capture=review` branches, `window.__*__` route globals (replaced by PRD 09 beacon), `scripts/write-performance-report.ts`, and
route-local audio wrappers; adopt `createGame` (PRD 09 §7.1).

## 6. Architecture proposal

### 6.1 The rebuild unit

Each game is rebuilt as one unit with five parts. A game is not scheduled until its engine dependencies (§12) are merged and verified on the
benchmark scenes listed for it in §16.

1. **Art direction contract** `apps/<id>/art/direction.ts` (typed, §7.1): one-sentence fantasy, reference board, palette, key-light design, environment
   (HDRI asset key or sky preset), camera framing targets, asset roles with budgets, VFX list, audio list, HUD theme. Reviewed by a human before
   any asset spend. The vision judge receives it, so "matches its own direction" is judgeable.
2. **Scene modules** `apps/<id>/src/scene/{world,lighting,camera,fx,materials}.ts`, each importing only `@aura3d/engine` and `@aura3d/game`.
3. **Asset kit**: assets admitted via PRD 05 (`aura3d assets admit`, look-dev turntable, budgets), drawn from shared kits K1–K9 (§6.4) first.
4. **Shell adoption**: `createGame` (PRD 09): full-bleed canvas, session, sound engine, FX layer, HUD kit, touch, capture contract, evidence beacon.
5. **Acceptance**: capture with `tools/quality-rebuild-capture` (schema v2), vision + human review, perf gates, scorecard committed under
   `apps/<id>/art/scorecards/<sha>.json`.

Standard layout after rebuild:

```
apps/<id>/
  art/direction.ts            GameArtDirection (§7.1)
  art/references/             ≥3 reference images + references.json (source URL, licence or "internal mood board", why it was chosen)
  art/scorecards/<sha>.json   GameScorecard (§7.3), one per review round
  src/main.ts                 ≤ 400 LOC: createGame(), scene mount, gameplay loop wiring
  src/scene/*.ts              world, lighting, camera, fx, materials
  src/gameplay/**             kept modules (moved, not rewritten)
  src/scenarios/*.ts          named capture scenarios (PRD 09 §6.4): state only
  src/evidence/*.ts           lazy evidence sections (PRD 09 §6.5)
  route-health.json           qualityGate block (§7.4); no self-graded claims
```

### 6.2 Rebuild tiers

research/21 classifies 17 games as substantial rebuild and Orbital Defense as full rebuild; research/20's three "polish" calls (Aura Clash,
Blockfall, Bank Shot) are overruled by the screenshots. This PRD keeps those verdicts and splits "substantial" by what survives, because the split
decides effort and scheduling.

| Tier | Definition | Kept | Replaced | Games |
|---|---|---|---|---|
| S-presentation | Scene topology and the hero assets survive; lighting, materials, camera, VFX, HUD and audio are rebuilt | gameplay, world layout, hero GLBs | look, camera, FX, HUD, audio | Aura Clash, Bank Shot, Pulse Tunnel, Blockfall Reactor, Skyline Runner |
| S-world | Gameplay survives; the visible world and most assets are replaced | gameplay, physics, rules, input | world, assets, look, camera, FX, HUD, audio | Turbo Drift, Siege Golf, Courier Rush, Patrol Wing, Rooftop Buckets, Vault Breakers, Neon Swarm, Mech Hangar, Gallery Shift, Deep Recovery, Gravity Post, Aurora Lander |
| F (full) | Only the rules module survives; the route is regenerated from the PRD 13 game template | `waves.ts` logic | everything else | Orbital Defense |

"Save-through-polish" is not available to any game. Wave 0 (§6.5) measures how much each game gains from engine defaults alone; no game is
expected to clear 5 from Wave 0 (research/21 estimates Pulse Tunnel at ~6 reachable "if IBL works", the highest such estimate).

### 6.3 Acceptance gate (applies to every game)

A game is **accepted** when all hold on the same commit:

1. Vision judge (research/21 prompt and 27 visual categories, unchanged so scores are comparable) on the v2 capture set (§20): overall ≥ 7, every
   visual category ≥ 5, the genre-critical categories in §6.10 at their target, and the answer to "competitive with a well-built modern three.js
   browser game?" is **Yes**. The judge model id is pinned per wave and recorded in `JudgeIdentity`; each viewport is judged **3 times** and the
   per-category **median** is used; the round is void (re-judge, not accept) if the PRD 12 calibration canaries judged in the same session drift by
   more than ±1.0 from their recorded scores, or if the three runs for any critical category span more than 2 points.
2. Human panel: ≥ 3 reviewers, at least one not on the implementing team, play the route for ≥ 5 minutes on a High-tier desktop and a Medium-tier
   phone, score the same rubric blind to the vision score. Median overall ≥ 7; no reviewer below 6.
3. Non-visual (research/20 rubric, judged by the human panel with the evidence beacon): sound ≥ 6, controls ≥ 7, game feel ≥ 6.5, loading ≥ 6,
   physics feel ≥ 6 where physics is gameplay (Siege, Vault, Bank, Rooftop, Turbo, Courier, Patrol, Aurora, Gravity).
4. Performance gates of §17 on the runner and on the reference devices; p50/p95 from rAF intervals only (PRD 09 §6.5 `perf` section).
5. Production health: 0 page errors, 0 console errors, canvas-region not uniformly black in any shot, `lookSignature` identical across play and every
   scenario URL (PRD 09 §6.4), no debug/evidence/marketing text in the play view.
6. The scorecard is committed and `route-health.json` `qualityGate.status` is set to `"accepted"` by the reviewer, not by the implementing agent.

Rejection loop: a rejected game gets a written finding list (judge §3 "what looks poor" + human notes) and one more round. After two rejected rounds
it is removed from `apps/showcase-index` and `qualityGate.status` becomes `"withdrawn"` until a new plan is approved.

### 6.4 Shared kits (built once, consumed by ≥ 2 games)

All kits are admitted through PRD 05 (`assets admit` with look-dev turntable under `studioSmall08`, measured texel density, tri budget, KTX2).
Licence per file is mandatory (CC0 or a licence that allows bundled web redistribution). Agent-synthesized geometry is not admissible as a hero or
world asset.

| Kit | Contents (minimum) | Consumers | Budget per kit | Visual benefit | Fallback |
|---|---|---|---|---|---|
| K1 HDRI set | Existing benchmark HDRIs `studioSmall08`, `autumnFieldPuresky`, `kloppenheim06Puresky` (`benchmarks/quality-rebuild/shared/assets.ts:180-197`; these are **1k** `.hdr` files under `fixtures/environment-corpus/hdri/`, so the game library admits the 2k/4k versions of the same Poly Haven CC0 sources, not the 1k fixtures); new: night-city street, pool-hall/bar interior, industrial hangar, dusk rooftop city, sunset ocean, deep-space starfield (8k equirect), museum interior | all 18 | 2k RGBE `.hdr` per HDRI for IBL (≤ 6 MB), 4k AVIF (or KTX2 UASTC) LDR background plate (≤ 3 MB; not JPEG-XL, which Chrome does not decode); Low tier 1k | Real specular, Fresnel, sky; ends ambient-only lighting | PRD 02 neutral default environment |
| K2 Neon-night kit | Wet asphalt + puddle mask PBR (2k tiling), emissive window-atlas buildings (4 variants, instanced), signage atlas, street props (bollard, lamp ≤ 5k tris, AC unit), rain/steam flipbooks | Aura Clash, Courier, Neon, Rooftop, Pulse, Vault | ≤ 25 MB raw → ≤ 8 MB KTX2 | Coherent neon look with reflections instead of emissive boxes | Medium tier drops puddle SSR to env-only |
| K3 Outdoor nature kit | Terrain splat set (grass/rock/sand/dirt, 2k each, ORM+N), 3 conifer + 3 deciduous trees with 3 LODs + impostor, rocks ×6, grass card clumps, hedge modules | Turbo, Siege, Patrol, Skyline | ≤ 30 MB → ≤ 10 MB | Replaces sphere-on-stick trees and flat planes | Low: impostors only beyond 40 m |
| K4 Interior kit | Plaster, marble (veined), parquet, walnut, brushed steel, felt (sheen), leather, glass; trims; lamps; frames with licensed art | Bank, Gallery, Mech, Blockfall | ≤ 20 MB → ≤ 7 MB | Textured rooms instead of flat-colour boxes | 1k textures on Low |
| K5 Space kit | Planet albedo/normal/night-lights/clouds (Earth-like, gas giant, rocky, ice; 4k/2k), starfield HDRI (K1), nebula layer, asteroid set | Orbital, Gravity, Aurora (sky) | ≤ 24 MB → ≤ 8 MB | Lit planets with terminators | 2k maps on Low |
| K6 Character set | Rigged humanoids (Quaternius UBC family already in Aura Clash), clip library (locomotion, melee, sports, sneak), 1 mech rig, crowd LOD (vertex-animated, ≤ 800 tris) | Aura Clash, Rooftop, Gallery, Skyline, Mech, Neon | hero ≤ 40k tris, ≤ 4 MB each | Animated, lit characters instead of cards and statues | Crowd → silhouette cards on Low |
| K7 Vehicle set | Formula car hero ≥ 30k tris with BC/N/ORM, van with separate wheels, aircraft (existing Meshy 60k), drones ×2 ≥ 5k, sub, lander ≥ 3k | Turbo, Courier, Patrol, Deep, Aurora, Orbital | ≤ 6 MB each | Readable heroes | LOD1 on Low |
| K8 SFX core | PRD 09 §6.9 `game-sfx-core` library | all 18 | ≤ 1.5 MB per game + streamed music | Replaces oscillator WAVs | silent + logged, never a synth beep |
| K9 VFX flipbooks | spark, smoke, dust, explosion (3 sizes), muzzle, splash, bubble, electric arc, confetti; 8×8 sheets, 2k, premultiplied | all 18 | ≤ 6 MB total KTX2 | Real VFX instead of moved primitives | `game.fx` primitive backend (PRD 09 §6.7 backend A) |

### 6.5 Rebuild order

| Wave | Games | Why this order | Entry condition |
|---|---|---|---|
| Phase 0 infra (no game changes) | — | Contracts, gates and scorecards must exist before any game is re-judged | PRD 09 `packages/game` package skeleton merged (so `@aura3d/game/art` has a home) and PRD 12 `tools/quality-gate/src/types.ts` merged (`GAME_VISUAL_CATEGORIES`, `GameJudgement`, `PanelRoundRecord`) |
| 0 Re-baseline | all 18 | Measure what engine defaults alone recover; strip debug UI and dead code; no art spend | PRD 01 DPR/exposure/HDR/blend, PRD 02 ambient-additive IBL + shadow strength 1 + caster fit + spot priority, PRD 03 bloom threshold/knee + real AA, PRD 04 texture-preserving tint merged and green on benchmarks 01, 02, 12, 13, 18; **plus** the PRD 09 pieces the Wave 0 tasks call (HUD kit diffed bindings, auto-mounted `game.fx`, `GameSoundEngine`, the `__AURA3D_GAME__` beacon, scenario/capture contract, `check:capture-parity --fail-on-any` — today the script only accepts `--fail-on-art`, `tools/showcase-library/game-capture-parity.mjs:30`) and PRD 12 capture v2 + panel record. The §17 runner gate is measured in Wave 0 but only enforced once PRD 11 forced-Medium/`adaptive=0` lands |
| 1 Pilots | Bank Shot, Turbo Drift, Aura Clash, Orbital Defense | Each exercises a distinct engine stack: interior IBL + spot shadows + clearcoat/sheen (Bank); outdoor HDRI sky + CSM + terrain + particles + vehicle camera (Turbo); skinned shadows + combat VFX + fighting camera + HUD shell (Aura Clash); greenfield on `createGame` + PRD 13 template (Orbital, 430 LOC) | Wave 0 done; PRD 05 admit/optimize, PRD 07 particle + sky pixel path, PRD 08 rigs, PRD 09 `createGame`, PRD 11 tiers, PRD 12 capture/regression infra |
| 2 Neon-night + table/sports | Vault Breakers, Rooftop Buckets, Courier Rush, Neon Swarm, Pulse Tunnel, Siege Golf | Reuse K2 (from Aura Clash), K4 (from Bank), K3 (from Turbo); SSR wet floors | ≥ 3 of 4 pilots accepted; pilot learnings merged into PRD 13 templates/skills |
| 3 Sky / atmosphere / space / water | Patrol Wing, Aurora Lander, Gravity Post, Deep Recovery | Need PRD 10 terrain/ocean/underwater and PRD 07 atmospherics that land later | PRD 07 sky/fog/god-rays, PRD 10 water + terrain, K5 |
| 4 Characters / interiors | Skyline Runner, Blockfall Reactor, Mech Hangar, Gallery Shift | Need PRD 06 retarget/IK fixes (C16), skinned shadow casters, multiple shadow casters | PRD 06 merged; PRD 02 multi-caster |

Waves 2–4 may run in parallel once their entry conditions hold. Within a wave, games are independent and are assigned to separate agents.

### 6.6 Review protocol

- Capture: `tools/quality-rebuild-capture/capture-games.mjs` on `macos-14` (ANGLE Metal) with v2 timelines that must reach the game's action
  condition (`requiredConditions`, §7.2). Capture fails if the condition is not reached, rather than shipping an "action" frame with no action
  (Aurora, Neon, Bank, Rooftop, Patrol failed this in run 37289688772).
- Vision judge: same prompt as research/21 with three additions: the art direction contract, the reference board, and the previous round's
  scorecard. The judge must list "what looks poor" before scoring.
- Human panel: reviewers use the deployed Vercel preview URL on their own devices (one High desktop, one Medium phone minimum), fill
  `GameScorecard.human[]`, and record device, browser and measured fps from the beacon overlay (`?dev=1` shows rAF p50/p95).
- Comparables: each reference board contains ≥ 3 shipped three.js/WebGL browser games or demos chosen by a human in the same genre. The judge scores
  "gap to references" per category; the gap must be ≤ 1.5 on the genre-critical categories.

### 6.7 Quality tiers per game

Every game runs on the PRD 11 tier API (`low | medium | high | ultra`) with automatic selection and a settings override. Tier changes may reduce
resolution, sample counts, particle counts, shadow cascades and LOD distances; they may not remove the key light's shadow, the environment, or the
art direction's signature effect (e.g. Aurora's aurora, Courier's wet reflections at env-only quality). Budgets are in §17.

### 6.8 Cost of the cross-game recommendations

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory | Bundle | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| G1 | Delete `lights.ambient`; HDRI environment (K1) as IBL + background per game | Specular, Fresnel and sky return in 15 games; fixes the black metals (Pulse, Vault, Mech) | +0.2–0.5 ms (sky pass + IBL fetches) | 0 | 2k RGBE prefiltered ≈ 12 MB GPU; background 4k ≈ 32 MB → Low 1k/2k | 0 JS; 3–9 MB assets per game | Low: 1k HDRI, background at half res | PRD 02 neutral environment |
| G2 | One shadowed key per scene, frustum fitted to play bounds or CSM (outdoor), contact shadows; delete fake discs/cylinders | Grounding (shadows 1.6 → ≥ 6) | +0.6–1.5 ms (2–3 cascades 2048) | +0.1 ms | 16–48 MB shadow maps | 0 | Low: 1 cascade 1024, PCF 4 | blob contact shadow from PRD 02, never emissive discs |
| G3 | Replace synth/card assets with kit assets at budget | Assets 3.1 → ≥ 7; largest single content lift | +0.5–2 ms (more triangles, textures) | +0.2 ms (more draws if not batched) | +50–200 MB GPU (KTX2 bounded) | 0 JS; assets per §17 | LOD + 1k textures on Low | LOD1 meshes |
| G4 | Genre camera rig (PRD 08 `rigs.*`) with framing targets | Subject legibility; composition 3.1 → ≥ 7 | 0 | +0.05 ms | 0 | 0 (engine) | Per-orientation framing | `rigs.static` with authored pose |
| G5 | Pixel-backed VFX via `game.fx` + PRD 07 particles, K9 flipbooks | VFX 2.2 / particles 1.4 → ≥ 6.5 | +0.3–1.2 ms (overdraw-bound) | +0.1–0.3 ms | 4–16 MB (atlases + buffers) | +0 (engine) | Low caps live particles at 25% | PRD 09 backend A primitive pool |
| G6 | `createGame` shell: full-bleed canvas, HUD kit, delete debug/marketing UI | HUD 5.2 → ≥ 7; canvas from 43–60% to ≥ 95% of viewport | up to ×2.3 fill for formerly boxed games (absorbed by tiers) | ≤ 0.05 ms | DOM ≤ 300 nodes | ≤ 14 KB (PRD 09) | Largest mobile win | `layout: "letterbox-16x9"` |
| G7 | Sampled audio (K8) on `GameSoundEngine` | Audio 2.7 → ≥ 6 | 0 | ≤ 0.2 ms | decoded SFX ≤ 24 MB High, ≤ 10 MB Low | ≤ 10 KB | gesture unlock on title | silent + logged |
| G8 | Look preset per art direction: HDR emissive 2–8, bloom threshold ≥ 1.0, knee ≤ 0.2, no FXAA over MSAA, exposure authored | Ends milky mid-tone bloom and blur; neon reads as light | 0 to −0.3 ms (FXAA removed) | 0 | 0 | 0 | Low: bloom at quarter res | PRD 03 defaults |
| G9 | Batch/instance repeated geometry; budget draws per tier | Fixes the 5–15 fps games (Courier ~1,530, Gravity 1,200+, Mech ~190 unbatched, Blockfall 460 nodes) | −2 to −10 ms on the runner | −2 to −8 ms | −(per-node overhead) | 0 | Required for Low tier | engine static batching (PRD 11 `planBatches`, which wraps `consolidateStaticMeshes` from `@aura3d/rendering` `MeshConsolidation.ts:109`; routes do not import `@aura3d/rendering` directly) |
| G10 | Remove capture forks; scenarios drive state only | Review frames equal play frames; no tuning of a different game | 0 | 0 | 0 | −(6–8k LOC fleet-wide, research/16) | 0 | none needed |

### 6.9 Per-game plans

Scores quoted as "now" are research/21 (visual) and research/20 (non-visual, rounded per `_sections/B`). Targets are in the consolidated table §6.10.
Every plan inherits: G1 (no ambient; HDRI/sky environment), G6 (shell, debug UI deleted), G7 (sampled audio), G8 (look preset), G10 (no capture
forks), and the acceptance gate §6.3. Only game-specific work is listed. Cost tables cover the game-specific recommendations; G1–G10 costs are in §6.8.

#### 6.9.1 Bank Shot (`showcase-bank-shot`) — Wave 1 pilot P1, S-presentation

Now: overall 3, mean 3.0, 14.9 fps at DPR 1. Feel 3, controls 5, physics 4.5, audio 3, loading 5. Fantasy: *late-night pool hall, one warm lamp over
felt, the room falls into darkness.* Keep `rules.ts`, `racks.ts`, `table.ts`, `cue.ts`.

- **Environment:** replace the 56-primitive box room (`src/environment.ts`) with a K4 pool-hall set: panelled walls, bar back, cue rack, two stools,
  framed licensed prints (images, not flat boxes, `environment.ts:189-197`). Room luminance falls below 5% of table luminance beyond 3 m.
- **Assets:** table ≥ 20k tris with UVs for felt, rail wood and pockets (catalog or commissioned; the synth `bankShotTable` has no UVs). Balls: UV spheres
  ≥ 2k tris sharing one 1k atlas (numbers, stripes, subtle wear). Cue ≥ 3k tris with ferrule, wrap and butt textures (replaces 170-tri `bankShotCue`).
- **Materials:** felt with PRD 04 sheen (sheenRoughness 0.6) + 2k fibre normal at 8× tiling; walnut rails clearcoat 0.8; balls clearcoat 1.0, roughness
  0.05; leather pockets.
- **Lighting:** one pendant `lights.spot({ shadow: true })` (angle 0.75, penumbra 0.5, 2048 map, strength 1) as the only caster; delete the "cool rim key"
  directional and the three cyan/magenta/teal rim points (`main.ts`, 17-g3 §4.4) that contradict the one-lamp fiction; two dim practicals (bar shelf,
  sconce). K1 pool-hall HDRI at 0.35 for reflections only. Delete the 16 `ball-shadow-NN` cylinders (`main.ts:234-247`).
- **Camera:** aim phase `rigs.orbit({ target: "cue-ball", distance: 1.1–2.0, pitchLimits: [18°, 38°] })` with yaw bound to aim angle; roll phase blends
  (0.4 s) to a 3/4 overhead `rigs.static`; optional pocket cam on the final ball.
- **Animation:** balls rotate: in `syncVisuals` (`main.ts:741-745`, which today calls only `setScale`/`setPosition`) convert each Rapier body quaternion to
  Euler XYZ and call `handle.setRotation(...)` (the Euler form used at `apps/showcase-mech-hangar/src/main.ts:892`), or the quaternion `teleport` of PRD 08
  §7.1 when merged. Put the conversion in a pure helper `src/gameplay/ball-visuals.ts` (`ballEulerFromBody(q)`) so it is unit-testable. Cue pull-back scales with
  power; forward stroke 80 ms; pocket drop lowers the ball 6 cm over 120 ms.
- **VFX:** chalk puff on strike (K9 dust, 12 particles), felt dust on break (24), no other effects (restraint is the art direction).
- **World population:** GPU spot-cone haze (PRD 07 volumetric, High/Ultra only).
- **Audio:** K8 `billiard-clack` ×3 variants with gain and pitch from impact speed, `cushion`, `pocket`, cue strike; room-tone bed; optional low bar music.
- **Juice:** break trauma 0.25; 30 ms global hit-stop on break; 0.5× slow-mo for 0.6 s when the 8-ball drops.
- **Physics tuning:** with visible rotation, tune rolling resistance and spin decay so balls stop without sliding; cushion restitution 0.75–0.80.
- **HUD:** delete the evidence strip (`styles.css:105`) and the 9-cell stat grid; keep turn indicator, sunk-ball tray, power meter; no "…" placeholders.
- **Tech art:** ≤ 120 draws; set ≤ 12 MB KTX2; balls share one material with atlas offsets.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Spot as sole shadow caster | Balls grounded under the lamp; shadows 2 → ≥ 8 | +0.3 ms (1 × 2048 spot map) | +0.05 ms | 16 MB | 0 | Low: 1024 map | PRD 02 blob contact under each ball |
| Clearcoat balls + HDRI reflections | Lamp highlight and Fresnel rim; PBR 3 → ≥ 8 | +0.1 ms | 0 | +12 MB HDRI | 0 | Low: 1k HDRI | studio IBL |
| Rolling balls | Motion reads as billiards, not pucks | 0 | +0.02 ms | 0 | 0 | none | none needed (pure transform update) |
| Pool-hall set (K4) | Environment 2 → ≥ 7 | +0.4 ms | +0.05 ms | +40 MB GPU | 0 JS, ≤ 12 MB assets | 1k textures | darker room, fewer props |
| Chalk puff + break dust (K9) | VFX 1 → ≥ 5 without breaking the one-lamp restraint | +0.05 ms | +0.02 ms | 1 MB | 0 | 50% particles | PRD 09 primitive pool |

#### 6.9.2 Turbo Drift Circuit (`showcase-turbo-drift-circuit`) — Wave 1 pilot P2, S-world

Now: overall 3, mean 3.5, 19.7 fps. Feel 5, controls 5, physics 4, audio 3. Fantasy: *sunset alpine circuit: golden low sun, long shadows, tyre smoke.*
Keep lap/race logic, `opponent-ai.ts` (or migrate to `VehicleDriverAi`, research/16 row 17), `ghost.ts`, `feel.ts` start lights.

- **Environment:** replace `turboCircuitEnvironmentV2` (75.5k tris, 28 flat materials, 0 textures) with a spline-extruded road (PRD 10 road/spline
  generator) carrying UV'd 2k asphalt, a rubbered racing-line mask, kerb and run-off decals; K3 splat terrain around it (grass/dirt/rock by slope);
  K1 sunset HDRI as sky and IBL; distant mountain impostor ring beyond fog. Delete the 500-unit box ground and `#df967d` clear colour
  (`scenery.ts:39`). Fog density ~0.02 at track scale (17-g2 §1.10).
- **Assets:** hero car ≥ 30k tris, BC/N/ORM, separate wheel and brake meshes (replaces the 5.4k BC-only hero). Trackside: instanced barrier, tyre-wall,
  fence and gantry modules; grandstands with K6 crowd LOD.
- **Materials:** car paint clearcoat 1.0 with flake normal; tyre rubber; tinted glass; asphalt roughness 0.6–0.85 with the racing line 0.1 darker.
  Delete `proceduralTexture("plastic-micro-scratch")` and `"rubber-roughness"` on grass (`main.ts:3076-3077`).
- **Lighting:** sun directional aligned to the HDRI sun; CSM 3 cascades (PRD 02) fitted to the camera frustum, strength 1, shadow from instanced
  scenery (PRD 02 instanced casters); delete the five weak point lights and the dead ambient (`main.ts:3383`).
- **Camera:** PRD 08 `rigs.chase({ target: "hero-car", framing: { subjectHeightFraction: 0.24 }, fov: { base: 60, perSpeed: 8 }, lookAhead: 0.25 })`
  with collision probe; delete the composition-gate tuning (`main.ts:2696-2700`) and 92 `visualCaptureCamera` branches.
- **Animation:** wheel spin from speed, steer angle from input, body roll and pitch from lateral and longitudinal acceleration (critically damped spring,
  halflife 0.12 s).
- **VFX:** tyre smoke (K9 soft lit particles, emission ∝ slip), ribbon skid marks (PRD 07 trail decals) replacing box decals, wall-scrape sparks,
  off-track dust; replace `driftParticleCloud` (zero pixels today). Delete the tan drift ellipse gizmo.
- **World population:** ~1,200 instanced K3 trees (3 LODs + impostor), flag cloth sway (vertex shader), marshal posts.
- **Audio:** K8 `car-sport` RPM layer set with load blend (PRD 09 `sound.engine`), skid loop gain ∝ slip, wind ∝ speed, crowd bed, music.
- **Juice:** screen-space speed streaks above 85% top speed (PRD 03), kerb shake trauma 0.1, finish slow-mo; keep start lights.
- **Physics tuning:** drift entry threshold aligned with smoke onset so feedback matches state.
- **HUD:** racing HUD (tach arc, gear, lap, position, minimap); fix the "GGhost OFF" rendering (the `<b aria-hidden="true">G</b>` keycap and the
  `#ghost-state-value` span in `hud.ts:146` render with no gap: make the keycap a styled `<kbd>` with `margin-inline-end`, or drop it on touch devices); delete telemetry.
- **Tech art:** ≤ 350 draws High, ≤ 300 Medium (runner gate), ≤ 150 Low (PRD 11 Low cap); track + terrain + trees ≤ 25 MB KTX2; `src/main.ts` 5,723 → ≤ 600 LOC.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Spline road + PBR asphalt + splat terrain | Env 2.5 → ≥ 7; tex 1.5 → ≥ 7 | +0.8 ms | mount-time generation ~40 ms | +60 MB GPU | +PRD 10 code | 1k textures, 2 splat layers | flat-textured road mesh |
| CSM + HDRI sun | Car shadows visible (sub-texel today) | +1.0 ms (3 × 2048) | +0.15 ms | 48 MB | 0 | Low: 2 cascades 1024 | single fitted map |
| Hero car ≥ 30k + clearcoat | Asset 3.5 → ≥ 8 | +0.2 ms | 0 | +20 MB | ≤ 6 MB asset | LOD1 15k | opponent car as hero |
| Smoke + skid ribbons | VFX 2 → ≥ 7 | +0.5–1.0 ms overdraw | +0.2 ms | 8 MB | 0 | 25% particles | decals only |

#### 6.9.3 Aura Clash Arena (`aura-clash-showcase`) — Wave 1 pilot P3, S-presentation

Now: overall 3, mean 3.5, 11.1 fps; canvas ~43% of viewport. Feel 5, controls 5.5, physics 4, audio 4; animation 4 (fleet best by code, 6 in
research/20). Fantasy: *rain-soaked neon rooftop street fight, 2.5D.* Keep the combat sim, input buffering, replay, inertialized clip blending, foot-lock,
secondary motion, clip-event bridge, hit-stop, victim-flash pulse (17-g1 §7).

- **Environment:** set `arenaScale` to 1.0 metric (today `(5.7·1.34)/13 = 0.5876`, `AuraClashArenaApp.ts:837-844`) and recompose the fight plane;
  restore the filtered `Prop_ACUnit_*`/`Prop_Bollard_*` (`:872-877`) as a foreground parallax layer; K2 skyline layer beyond fog; delete the four root
  "shadow evidence" boxes (`:1443-1483`).
- **Assets:** keep the UBC rigs and the textured downtown GLB; replace the 4-tri spectator card with K6 vertex-animated crowd or remove the crowd;
  delete the six unskinned roster GLBs; replace rival `Zombie_Walk_Fwd_Loop` with a proper walk clip.
- **Materials:** delete the baseColor/MR/emissive overrides in `collectFighterFlashMaterials` (`:3371-3425`); team identity via PRD 04 rim term
  (`rim: { color, power: 3, intensity: 1.5 }`) or a material variant; neon signs at emissive strength 4–8 (HDR).
- **Lighting:** delete the per-fighter camera-side 4.7/4.45 point keys (`:942-952`) and per-fighter rim points (`:920-930`); rig = warm overhead spot
  key (shadow, strength 1, frustum fitted to the fighter envelope `:1179-1207`) + cool back-rim directional + two neon practicals at sign positions;
  K1 night-city HDRI at 1.0. Requires the side-view preset on rgba16f + ACES (PRD 01; `GameRenderPreset.ts:372-386`).
- **Camera:** `rigs.fighting({ fighters: ["p1", "p2"], framing: { subjectHeightFraction: 0.5 }, fov: 32 })`, pitch −6°, separation dolly (today 60°
  orthogonal side view, `:1239`).
- **Animation:** anticipation and follow-through by clip time-scale curves on heavy attacks; landing squash through juice tween.
- **VFX:** K9 additive spark flipbook + 0.08 s impact point light (intensity 6) + shock ring + landing dust; dash afterimage as a PRD 07 trail (the
  current ghosting reads as a glitch); KO slow-mo.
- **Shaders:** rim term (§8.10); SSR wet floor (PRD 02) with puddle mask from the arena textures.
- **World population:** rain (PRD 07) 1,500 High / 400 Low; two steam vents.
- **Audio:** keep the 11 Kenney samples; add music bed, announcer (round/fight/KO from K8), crowd bed, per-move whooshes.
- **Juice:** per-actor hit-stop (`session.hitStop(0.07, { actors })`, PRD 09 §6.3); "2 HIT"/"3 HIT" plates move to the top HUD band, off the impact point.
- **HUD:** full-bleed; slanted health bars, timer medallion, portraits; self-hosted Saira `@font-face` (named in `playable.css:15,191,294,413`, never
  loaded); delete nav, prose cards, control strip, evidence `<details>`. Wire the unreferenced `TitleScreen`, `CharacterSelect`, `ResultsPanel`, `PauseMenu`
  through the shell menus or delete them.
- **Tech art:** arena maps (26) → KTX2 (8.7 MB → ≤ 3 MB); ≤ 150 draws.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| HDR + ACES side-view preset, shadowed key, remove tints | Light 3 → ≥ 7; textures visible again; bloom fires | +0.4 ms | 0 | +8.3 MB at 1920×1080 single-sample (rgba16f 8 B/px vs rgba8 4 B/px); +33 MB if the 4× MSAA colour buffer is also rgba16f | 0 | Low R11F_G11F_B10F (renderable only with `EXT_color_buffer_float`; else rgba8) | rgba8 degraded path (reported in diagnostics) |
| Fighting rig, 1:1 scale | Fighters 45–60% of frame height | 0 | +0.05 ms | 0 | 0 | Portrait shows letterboxed 16:9 | static framed pose |
| SSR wet floor | Neon reflections | +0.8–1.5 ms (half-res) | 0 | 8 MB | 0 | Medium/Low env-only | env reflection |
| Hit VFX + impact light | VFX 2 → ≥ 7 | +0.3 ms | +0.1 ms | 4 MB | 0 | 50% particles | primitive pool |

#### 6.9.4 Orbital Defense (`showcase-orbital-defense`) — Wave 1 pilot P4, F (full rebuild)

Now: overall 1.5, mean 1.8, 59.6 fps on an empty scene; audio 0; `route-health.json` "blocked", `publicShowcase:false`. Fantasy: *low-orbit defense
at the planet's terminator; drones streak in against the Milky Way; every kill explodes.* Keep only the wave, heat and shield rules, extracted to
`src/gameplay/waves.ts`. Regenerate the route from the PRD 13 arena-shooter template on `createGame`; this pilot validates that template path.

- **Environment:** K1 deep-space starfield HDRI as background and IBL; sun directional matched to the HDRI's bright source; asteroid belt 300 instanced
  K5 rocks.
- **Assets:** planet as a 128×64-segment sphere (PRD 01 tessellation) with K5 Earth-like albedo, normal, night-lights and cloud layer; station/turret
  GLB ≥ 8k tris; interceptor ≥ 5k; two drone types ≥ 5k each (K7). Delete the opaque 1.13× emissive shell (`main.ts:82-131`) that hides the planet.
- **Materials / shaders:** planet day/night terminator and atmosphere rim (§8.1); shield as an additive Fresnel shell with a hex mask (§8.1 variant);
  orbit paths as thin additive ribbons, not tori.
- **Lighting:** sun key with shadows onto stations and rings; night side lit only by city-light emission.
- **Camera:** 25–35° above the orbital plane; planet fills ~70% of frame height (research/21 win 5); slow orbit drift 0.5°/s; punch on hits; drones must
  stay outside HUD safe areas (today they render under HUD panels).
- **VFX:** HDR additive bolt streaks with short trails; K9 explosion flipbooks (3 sizes) + 0.1 s point-light flash + 6–12 debris; shield ripple on hit;
  muzzle flash.
- **Audio:** K8 laser, explosion ×3, shield-hit, space-hum bed, music. Today there is none.
- **Juice:** 40 ms hit-stop on multi-kills; trauma shake on shield hits; in-world score popups.
- **HUD:** HUD kit with diffed updates (today `renderHud()` rebuilds `innerHTML` every frame, `:313,341-377`); delete "Checksum" and "Systems"; delete the
  false "particle-heavy" claim (`:74`).
- **Tech art:** ≤ 80 draws; planet maps ≤ 8 MB KTX2.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Textured planet + atmosphere + terminator | The hero object exists; Env 1 → ≥ 7 | +0.3 ms | 0 | +32 MB | 0 JS; ≤ 8 MB | 2k maps | no clouds |
| Modelled turret/drones (K7) | Assets 1 → ≥ 7 | +0.2 ms | 0 | +12 MB | ≤ 4 MB | LOD1 | LOD1 of the same asset; never a synthesized mesh (if no admitted asset exists the game stays in review) |
| Explosions + streaks + flash | VFX 0.5 → ≥ 7; feel 1 → ≥ 6.5 | +0.4–1 ms | +0.1 ms | 6 MB | 0 | 25% particles | primitive pool |

#### 6.9.5 Vault Breakers (`showcase-vault-breakers`) — Wave 2, S-world

Now: overall 2.5, mean 2.8, 57.4 fps (cheap scene); physics 6 (fleet best, keep). Fantasy: *heist-themed pinball cabinet in a dark arcade: chrome
ball, lit inserts, printed playfield.* Keep `table.ts`, `flippers.ts`, `ball-flow.ts`, `missions.ts`, `scoring.ts`.

- **Environment:** dark arcade room (K2 + K4 trims) visible only around the cabinet; K1 dark-arcade HDRI for reflections.
- **Assets:** promote the unused `vaultBreakersCabinet` (Sketchfab, 12 PBR maps) or `...CabinetHigan` as the shell; promote `vaultBreakersFlipperReal`;
  keep the synth table only as a collider source. Commission or author a 4k playfield texture (art, lanes, insert cut-outs) on a UV'd plane aligned to
  the physics plane; plastics, ramps and bumper caps as authored meshes.
- **Materials:** ball = chrome (`metallic 1, roughness 0.05`, no emissive tint; today `#39dfff ×0.42`, `main.ts:131-139`); playfield clearcoat 0.9
  over printed art; plastics with transmission (PRD 04) or alpha + Fresnel on Low.
- **Lighting:** delete the three coloured directionals (3.6 warm, 2.2 cyan, 1.15 magenta) and ambient 0.82; one soft overhead key (rect light via PRD 02
  area integrator, or a shadowed spot) with a tight shadow frustum on the playfield; GI-under-plastics approximated by insert emission.
- **Camera:** fixed 3/4 table view kept, plus ball-tracking tilt (pitch ±4°) and multiball widen; plunger close-up at launch.
- **VFX:** bumper flash rings, sparks on slingshot hits, insert chase sequences on mission start (emissive animation, §8.5), vault-door opening light
  show; ball trail (PRD 07) at high speed.
- **Audio:** K8 `flipper`, `bumper`, `plunger`, `rubber-ball`, rolling loop by speed; mission stingers; arcade ambience.
- **Juice:** tilt shake; flipper squash; score reel spin-up.
- **HUD:** DMD-style backglass (in-world, text3D on an emissive dot-matrix material) replacing the 300 px side panel (`styles.css:27-28`); touch:
  two flipper zones + plunger drag.
- **Tech art:** ≤ 100 draws; cabinet + playfield ≤ 15 MB KTX2. Delete the false "Real catalog pinball cabinet — textured" comment
  (`environment.ts:61`, which annotates the synth `vaultBreakersTable`).

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Textured cabinet + printed playfield | Asset 2 → ≥ 7; tex 1 → ≥ 7 | +0.3 ms | 0 | +48 MB | ≤ 15 MB | 2k playfield | 2k art |
| Chrome ball under HDRI + contact shadow | The hero is readable (40×28 px dark disc today) | +0.1 ms | 0 | +12 MB | 0 | — | studio IBL |
| Insert chases + bumper VFX | VFX 1 → ≥ 6.5; juice 1 → ≥ 6.5 | +0.2 ms | +0.05 ms | 2 MB | 0 | — | emissive only |

#### 6.9.6 Rooftop Buckets (`showcase-rooftop-buckets`) — Wave 2, S-world

Now: overall 4, mean 3.8 (fleet best), 7.6 fps; physics 6. Fantasy: *dusk streetball on a city rooftop, skyline lights coming on.* Keep `hoop-sim.ts`,
`shot.ts`, `rim.ts`, `scoring.ts`, the state machine.

- **Environment:** open the far wall to a K1 dusk-rooftop HDRI skyline + K2 instanced emissive-window buildings; delete the three emissive sky bands
  (`environment.ts:22-55`) and the 13 box skyline buildings; rooftop parapet, HVAC and fence from K2 props.
- **Assets:** render the skinned `rooftopLayupScorer`/`rooftopDefender` (44.6k, 191 joints, 4 clips) in play; delete static posed athletes and
  `rooftopShooter`, `rooftopShooterV2`, `rooftopDefenderV2`, `rooftopShooterMeshyV1` (21.6 MB, always hidden) and `.candidate-assets/`. Textured ball
  (seams, pebble normal), glass backboard + rim + cloth net with vertex-animated ripple; court with painted lines on textured concrete; crowd as K6
  instanced LOD (replaces cube torsos with icosphere heads in `rooftopCourt`).
- **Materials:** stop `setMaterial` every frame (`main.ts:1184,1223,1239`); backboard glass transmission/alpha + Fresnel; court roughness map with wear.
- **Lighting:** delete ambient 1.32 and 8 of 11 lights; low warm sun (shadow, strength 1) + 2 court floodlights (spot, one shadowed) + rim.
- **Camera:** over-the-shoulder shooter rig (PRD 08 `rigs.shoulder`), ball-follow on release, make/miss reaction cut with 0.6 s slow-mo replay on swish.
- **Animation:** shooter clips Ready → Release from shot state (today strings, `main.ts:220`); defender contest clip; celebration on make.
- **VFX:** tapered arc ribbon (replaces the solid tube drawn over the player); net ripple; "ON FIRE" flame flipbook on the ball; confetti on streak.
- **Audio:** K8 `ball-bounce-court`, `rim`, `net-swish`, crowd swell; move off raw `new Audio` (`buckets-audio.ts:44-48`) to `GameSoundEngine`.
- **HUD:** keep the shot meter structure; delete "Rapier Rim Physics" subtitle; fix "07DUSK" kerning.
- **Tech art:** players ≤ 9.9 MB each → KTX2 ≤ 4 MB; ≤ 200 draws (11 lights and 200+ boxes today).

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Skinned athletes in play | Char 5 → ≥ 7; anim 3 → ≥ 7 | +0.3 ms (skinning, 2 × 191 joints) | +0.2 ms | +24 MB | ≤ 8 MB | 64-joint LOD | static LOD with idle sway |
| Open dusk skyline | Env 3 → ≥ 7; atmo 2 → ≥ 6 | +0.2 ms | 0 | +15 MB | ≤ 6 MB | 2k plate | gradient sky |
| Net ripple + arc ribbon | VFX 4 → ≥ 7 | +0.1 ms | +0.05 ms | 1 MB | 0 | — | rigid net |

#### 6.9.7 Courier Rush (`showcase-courier-rush`) — Wave 2, S-world

Now: overall 2 (working frame alone ~3.5), mean 2.8, 7.1 fps 1920 / 5.0 1280; audio 1.5; context loss went black in the 1920 run. Fantasy: *rain-slick
night city, delivery van threading traffic between pools of sodium and neon.* Keep dispatch, `traffic.ts`, `van.ts` on `createGameArcadeVehicle`.

- **Robustness (P0, before art):** context-loss UI from the PRD 09 shell plus PRD 01 GPU resource restore; capture fails when the canvas region is
  uniformly black (§7.2) even if the HUD draws. Batch ~1,530 draws to ≤ 300 (static consolidation of the city, instanced traffic headlights).
- **Environment:** replace `city.block` (primitive boxes with emissive "light pool" slabs, `index.ts:5842-5935`) and the 10 box towers with a K2 modular
  city: textured facades, emissive window atlas, sidewalks, curbs, street furniture; K1 night-city HDRI; height fog density ~0.03.
- **Assets:** keep `courierVanMeshyV2Decimated` but re-export with separate wheels (spin, steer, suspension); traffic sedan/hatch with their maps
  restored (delete overrides at `main.ts:391-398`; colour variety through PRD 04 material variants).
- **Materials:** wet asphalt (clearcoat 0.56 authored at `city.ts:100` finally gets IBL + SSR); delete the emissive "road reflection" slivers
  (`city.ts:238-249`) and tyre-contact boxes (`main.ts:443-457`).
- **Lighting:** ambient 1.25 → 0; moon directional (shadow, CSM 2) + ≤ 12 street points (clustered, PRD 02) + headlight spots on the van (one shadowed).
- **Camera:** `rigs.chase` at ~6 m, 12° pitch, fov 60 + speed kick, strike shake (today 10.4 m at 25°, fov 56, `van.ts:87-93`).
- **VFX:** rain particles (PRD 07) replacing 30 static boxes (`city.ts:369-387`) with screen-space droplets on Ultra; splash on puddles; drop-off ring
  shockwave rendered through `game.fx`.
- **Audio:** cue the defined `engine` and `ambient-city` loops (`courier-audio.ts:105-106`, never played) via K8 `van` RPM set; rain bed; horn variants.
- **HUD:** mobile HUD ≤ 15% of screen (35–40% today); keep dispatch card, timer, strikes.
- **Tech art:** city ≤ 30 MB KTX2; ≤ 300 draws High/Medium, ≤ 150 Low (PRD 11 Low cap).

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Draw batching 1,530 → ≤ 300 | 7 fps → ≥ 45 fps runner Medium; removes context-loss pressure | −3 to −6 ms | −4 to −8 ms | −20 MB | 0 | required | coarser merge |
| K2 city + IBL + SSR wet road | Env 2 → ≥ 7; IBL 1 → ≥ 7 | +1.5 ms (SSR half-res) | 0 | +60 MB | ≤ 10 MB | env-only reflections | env-only |
| Rain + splashes | Atmo 1 → ≥ 6.5 | +0.4 ms | +0.1 ms | 4 MB | 0 | 400 drops | fog only |

#### 6.9.8 Neon Swarm (`showcase-neon-swarm`) — Wave 2, S-world

Now: overall 2.5, mean 3.1, 25.8 fps; ~half the frame crushed black; enemies tiny pale hexagons. Fantasy: *twin-stick arena on a rain-wet neon plaza;
emissive drones swarm a rim-lit courier.* Keep `swarm.ts`, `waves.ts`, input buffer, instancing approach.

- **Environment:** reflective plaza (SSR roughness 0.15) with emissive grid inlays (§8.4); K2 facades ringing the arena; replace the photoscanned road
  barricades with on-theme K2 barriers; move or replace the 272k-tri street lamps (16 MB, off camera at ±22, ±13) with ≤ 5k-tri lamps in frame.
- **Assets:** rigged textured player from K6 with run/strafe/fire clips (replaces the static tinted courier, `main.ts:688-701`); 2–3 authored drone
  types ≥ 3k tris with emissive maps (replaces 18/22-tri extruded discs); delete all 4-tri cards.
- **Lighting:** delete ambient 1.05 and the 10 point lights at 9–16; one cool key with shadow (instanced casters, PRD 02) + rim from player + drone
  emission feeding bloom; fix the black ellipses (they are the contact-shadow discs; replace with PRD 02 contact shadows).
- **Camera:** apply `cameraDirector` (today `void cameraState`, `main.ts:1667-1671`) through PRD 08 `rigs.topDown({ pitchDeg: 55, deadZone })` with
  look-ahead toward aim and shake/punch layers; smoothing > 0 on all viewports.
- **VFX:** the 7 existing `gameEffects.spawn` calls render through the auto-mounted `game.fx` layer; add drone death bursts, hit flash, dash trail,
  muzzle flash; HDR emissive bolts.
- **Audio:** K8 laser, zap, explosion-small, shield-hit; music with intensity stems by wave.
- **Juice:** 50 ms hit-stop on elite kills; enemy flash on hit; score popups.
- **HUD:** HUD kit twin-stick layout; touch `twin-stick` preset (today `bindTouchStick` hand-rolled, `main.ts:1326-1390`).
- **Tech art:** ≤ 150 draws; replace the `minimumNonBlackPixels: 1500` gate with §6.3.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| SSR plaza + emissive grid | Env 2 → ≥ 7; removes black void | +1.2 ms half-res | 0 | 8 MB | 0 | env-only | grid only |
| Authored drones + player | Assets 3 → ≥ 7; char 3 → ≥ 7 | +0.3 ms | +0.1 ms | +20 MB | ≤ 8 MB | LOD1 | LOD1 meshes, emissive map kept |
| Wired FX + camera feel | VFX 2 → ≥ 7; juice 2 → ≥ 7 | +0.5 ms | +0.1 ms | 4 MB | 0 | 50% | primitive pool |

#### 6.9.9 Pulse Tunnel (`showcase-pulse-tunnel`) — Wave 2, S-presentation

Now: overall 3, mean 2.9, 23.5 fps; mobile 1 (374×187 canvas); audio 5 (fleet best: beat clock + stems). Fantasy: *synthwave tunnel run on the beat:
the world rushes past, neon spills light onto a glossy floor.* Keep `beat-clock.ts`, `patterns.ts`, gate logic, audio stems (re-mastered).

- **Mobile (P0):** 100dvh full-bleed canvas, anchored HUD; delete the 16:9 rounded card layout (`styles.css:16-47`).
- **Environment:** segment conveyor that scrolls rings, pylons and rocks (today static world); synthwave sky (§8.7) + fog; remove the full-height blue
  centre-column artifact.
- **Assets:** re-try the Quaternius CC0 kits rejected in `art-review/quaternius-presentation-v10-PROVENANCE.md` under the fixed renderer; rebuild the craft
  textures at 1–2k with linear-mipmap filtering (today 128² NEAREST, `build-encounter-finish-v11.py:74-107`); delete `art-review/` (82 MB).
- **Materials:** hull metallic 0.72–0.92 kept but now lit by IBL; HDR emissive frames 3–6 with selective bloom.
- **Lighting:** neutral key replacing the saturated cyan "sun" (`#38bdf8`); delete the 6 lights set to 0 in play; moving point lights on gates.
- **Camera:** `rigs.chase` raised and pulled back so the craft is 15–20% of width (45% today), FOV kick on boost, lane-change roll ±6°.
- **VFX:** ship the review-only particles, impacts and trails to play (`main.ts:1264-1467`), then delete the review branches; speed streaks; graze sparks
  through `game.fx`.
- **Audio:** re-master stems to −16 LUFS; add sampled hits for gate pass/fail on the beat.
- **Tech art:** ≤ 200 draws (~250 primitive nodes today); evidence code 65% → ≤ 10%.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Scrolling world + chase cam | Speed read; camera 2 → ≥ 7 | 0 | +0.1 ms | 0 | 0 | segment count halved on Low | static world + PRD 03 speed streaks |
| Glossy floor (planar or SSR) + HDR emissive | Post 2 → ≥ 7; reflections of neon | +1.0 ms | 0 | 8 MB | 0 | env-only | env-only |
| Mobile canvas fix | Mobile 1 → ≥ 6 | ×4 pixels on mobile (tiers absorb) | 0 | 0 | 0 | the fix | `layout: "letterbox-16x9"` at full width |

#### 6.9.10 Siege Golf (`showcase-siege-golf`) — Wave 2, S-world

Now: overall 3.5, mean 3.7, 7.1 fps, p95 1,100 ms; shadows 4.5 (fleet best), physics 6. Fantasy: *crazy-golf through a toy siege castle in a
golden-hour valley; stacks topple into splinters.* Keep `structures.ts`, `hole-flow.ts`, `shot.ts`, Rapier toppling.

- **Scene architecture (P0):** stop `app.setScene(buildHoleScene(...))` on every camera phase (`main.ts:975-985`); build one scene per hole and switch
  PRD 08 rigs with blends. This removes the 1.1 s p95 stalls and hard cuts.
- **Environment:** K3 terrain heightfield with splat (fairway, rough, dirt path), backdrop hills as terrain not spheres (delete the 26 hill/tree spheres),
  K1 golden-hour HDRI sky + IBL replacing `background("#8ecfe8")` and `environments.studio` (peach LDR probe outdoors).
- **Assets:** cohesive stylized castle kit with shared trim atlas (replaces ~130 primitives and the no-UV `siegeGolfCourseWorld`); keep Sketchfab crates,
  barrels, planks with their maps (delete `paintedTimberMaterial`, `main.ts:329`); ball ≤ 2k tris textured (today 76.8k untextured); club mesh.
- **Colour hierarchy:** one reserved hue for the goal; obstacles and signs use the kit palette (today all coral).
- **Lighting:** warm low sun (shadow, CSM 2) + sky fill from IBL; delete 4 cosmetic points.
- **Camera:** aim rig behind the ball, flight follow with look-ahead, settle orbit; no cuts.
- **VFX:** splinter debris + dust (K9) on topple, grass tufts on landing, flag cloth; trail as PRD 07 ribbon (replaces 8 spheres).
- **Audio:** K8 club thock, wood crack variants, stone impact, birds/wind bed.
- **Juice:** 60 ms hit-stop on structure break, light camera shake on topple.
- **HUD:** delete debug sliders "Aim offset / Set power" (`main.ts:111-117`); in-world aim arrow; stars as icons not "★★☆" text.
- **Tech art:** ≤ 200 draws; course kit ≤ 15 MB KTX2.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| One scene per hole | Removes 1.1 s stalls; loading 3.5 → ≥ 6 | 0 | −(rebuild cost per phase) | 0 | 0 | required | none (correctness fix) |
| Terrain + HDRI sky | Env 3.5 → ≥ 7; atmo 2 → ≥ 6 | +0.6 ms | 0 | +40 MB | ≤ 10 MB | 2 splat layers | flat textured terrain |
| Castle kit + restored crate maps | Assets 3 → ≥ 7 | +0.3 ms | 0 | +25 MB | ≤ 8 MB | 1k | LOD1 kit pieces, 1k trim atlas |

#### 6.9.11 Patrol Wing (`showcase-patrol-wing`) — Wave 3, S-world

Now: overall 3, mean 3.3, 15.8 fps 1920 vs 54.8 at 1280 (fill/post bound); character 6 (the Meshy plane). Fantasy: *evening coastal patrol: sunset
over the ocean, island cliffs, drones to intercept, rings to thread.* Keep `flight.ts`, ring/sensor layer, patrol grading, `ghost.ts`.

- **Environment:** K1 sunset-ocean HDRI as sky + IBL (delete flat `#254760`, `main.ts:520`); PRD 10 ocean to the horizon (replaces the 90×90 plane,
  `sky.ts:329-338`) with fog; island heightfield at ≥ 128 resolution (today 40-cell, `sky.ts:136-187`) with K3 splat; runway embedded in terrain
  (today a floating slab with black underside); volumetric-looking cloud cards (PRD 07) replacing 7 glass spheres.
- **Assets:** keep `patrolAircraftMeshy` (60k, BC+N+MR); drones ≥ 5k tris PBR (K7) replacing 108-tri synth; radar tower and props from kit.
- **Lighting:** sun directional aligned with the HDRI sun disc (today misaligned: sphere at (-29,21,-58), key from (-30,26,18)); CSM 3 fitted to camera;
  delete the pad spot as sole caster and static point lights.
- **Camera:** `rigs.flight({ fov: { base: 65, perSpeed: 8 }, horizonLock: 0.6, lookAhead })` with slight roll follow (today fov 47, no horizon hold).
- **Physics tuning:** add a stall model so the plane cannot hover at 0 airspeed; minimum airspeed at throttle 0.
- **VFX:** contrails from wingtips (PRD 07 trail), engine heat haze (Ultra), K9 explosions for drone kills, tracer glow, ring gates as torus with
  emissive gradient.
- **Audio:** K8 `prop-plane` RPM set pitch- and volume-mapped to throttle (today volume only, `wing-audio.ts:120-163`); wind ∝ airspeed.
- **HUD:** delete the evidence strip "Backend / Flight mode authored / Sensors" (`main.ts:136-140`); flight HUD with attitude, airspeed, ring compass.
- **Capture:** v2 timeline keeps throttle up so rings and drones appear in 03–05 (throttle decayed to 0 in run 37289688772).
- **Tech art:** ≤ 230 draws (already); investigate the 1080p vs 720p gap with PRD 11 GPU timers before adding SSR.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| HDRI sky + ocean + fog | Env 2 → ≥ 7; atmo 1 → ≥ 7 | +1.0 ms (ocean VS + Fresnel) | +0.1 ms | +20 MB | PRD 10 code | low-res ocean grid | flat normal-mapped water |
| Splat island ≥ 128 + embedded runway | Tex 3 → ≥ 7 | +0.4 ms | mount 30 ms | +20 MB | ≤ 8 MB | 64 grid | 64 grid, 2 splat layers |
| Flight rig + stall model | Feel 3 → ≥ 6.5; camera 3 → ≥ 7 | 0 | +0.05 ms | 0 | 0 | touch tilt/drag preset | `rigs.chase` without roll follow |

#### 6.9.12 Aurora Lander (`showcase-aurora-lander`) — Wave 3, S-world

Now: overall 2.5, mean 3.1, 52.2 fps; 85–95% of every frame flat navy; terrain missing in 3 of 4 captures. Fantasy: *night landing on an icy moon under a
moving aurora; the exhaust lights the regolith.* Keep `lander.ts`, `terrain.ts` height function, Rapier heightfield, `prediction.ts`, `ghost.ts`,
`touchdown.ts`, campaign.

- **Environment:** night sky with stars (K1 starfield) + aurora ribbons (§8.2, PRD 07 additive) — the game's name has no aurora today; terrain extended
  with low-res far rings and a horizon skirt (today a 96 m tile, `sites.ts:50-54`); triplanar regolith/ice albedo + normal + roughness + detail normal.
- **Assets:** panel-lined textured lander 3–5k tris with normal map (replaces 460-tri `auroraLanderProbe`); pad beacons ≥ 500 tris textured (replaces
  66-tri); delete image cards and the 16 star spheres, the planet sphere at scale 15 (use K5 texture in the sky plate instead).
- **Lighting:** moon key (shadow, strength 1, frustum fitted to the lander + pad) + aurora-tinted fill from IBL; nozzle point light scaling with thrust
  (intensity 0–8, range 12 m) so the exhaust lights the ground; delete the upward "regolith bounce" directional at (14,-26,18).
- **Camera:** PRD 08 `rigs.altitude({ target: "lander", ground: "pad", framing: { subjectHeightFraction: 0.08–0.12 } })` that keeps the pad in frame
  (today the pad is off screen at spawn and an objective beam was added, `main.ts:692-701`).
- **VFX:** tapered exhaust cone + GPU particle plume (replaces the stretched sphere), ground dust kicked up below 8 m altitude, snow particles (replace
  72 sphere nodes), crash debris + shockwave via `game.fx`.
- **Materials:** ghost through PRD 04 tint-with-opacity so it is translucent (today opaque `#7dd3fc`, `main.ts:762-773`).
- **Audio:** K8 thruster layer set with throttle, wind-high bed, touchdown thud variants.
- **Juice:** touchdown shake scaled by vertical speed; slow-mo on perfect landing.
- **HUD:** keep the instrument chips (best HUD by fit, 17-g4 §3.4); delete "PROTOTYPE" sidebar; delete emissive/luma nudges (`main.ts:594-597`).
- **Capture:** v2 timeline must complete a landing for 04-action.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Aurora ribbons + star sky | Atmo 1 → ≥ 7; the title's promise | +0.3 ms (additive, 2–4 ribbons) | 0 | 2 MB | +2 KB shader preset | 2 ribbons | gradient sky |
| Extended triplanar terrain | Env 1.5 → ≥ 7 | +0.5 ms | mount 25 ms | +24 MB | ≤ 8 MB | 2 rings | 1 far ring + horizon skirt |
| Nozzle light + plume + dust | VFX 2.5 → ≥ 7; light 2.5 → ≥ 7 | +0.4 ms | +0.1 ms | 4 MB | 0 | 50% | light only |

#### 6.9.13 Gravity Post (`showcase-gravity-post`) — Wave 3, S-world

Now: overall 3, mean 2.7, 6.4 fps; controls 3 (keyboard launch dead); 46.8 MB / ~9.9 s to ready. Fantasy: *slingshot courier between lit planets;
orbits are thin light, the sun actually lights the system.* Keep `wells.ts`, `pod.ts`, `contracts.ts`, `scoring.ts`, `prediction.ts`.

- **Controls (P0):** call `steerKeyboardAim`/`launchActiveAim` from the input loop (`main.ts:1447-1461`, never called today) and bind Enter to launch.
- **Performance (P0):** collapse ~330 primitive instances into instanced batches (stars, dust, beads), target ≤ 120 draws (1,200+ today); HUD via HUD kit
  diffing (today `innerHTML` per frame, `main.ts:2378`); KTX2 + size-appropriate textures for dot-sized planets (2 × 4096×3072 for ~40 px objects).
- **Environment:** K1 deep-space skybox with parallax star layers (replaces 84 in-volume star spheres, `index.ts:6159-6164`); flat teal board removed.
- **Assets:** one art language: K5 planets as ≥ 32k-tri spheres with albedo/normal and atmosphere shell (§8.1), sized 3–5× today's screen size; replace
  the 32×32-stripe `gravityPostCourierSkiff` with a textured K7 craft; restore the dock gate's 14 maps (delete override, `main.ts:492-499`).
- **Lighting:** sun as a point light at the sun position with physically falling intensity, so every planet has a terminator (today the sun sprite lights
  nothing and Rust/Gale render black); delete ambient.
- **Camera:** board view at an orbit-controllable tilt; follow-and-zoom on the pod in flight with damping; return to board on dock.
- **VFX:** thin additive orbit lines (replace overlapping translucent cyan rings that flatten into a teal mass); thrust particles; GPU ribbon for the flight
  path (replaces 78 bead spheres); dock sparks via `game.fx`.
- **Audio:** K8 thruster, dock clamp, space-hum bed, delivery stinger; real loops instead of retriggered one-shots (`post-audio.ts:48-58`).
- **HUD:** board labels via DOM anchors kept; delete the review-label swaps (`main.ts:2171-2178`).

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Instancing + HUD diffing | 6.4 fps → ≥ 45 runner Medium | −3 to −6 ms | −4 to −6 ms | −30 MB | 0 | required | none (performance fix) |
| Sun point light + lit planets + atmosphere | Light 2 → ≥ 7; PBR 1.5 → ≥ 7 | +0.2 ms | 0 | 0 | 0 | no atmosphere shell on Low | directional per planet aimed from the sun |
| Skybox + ribbon orbits | Env 2.5 → ≥ 7; atmo 1 → ≥ 6.5 | +0.2 ms | +0.05 ms | +16 MB | ≤ 6 MB | 2k sky | gradient + star points |

#### 6.9.14 Deep Recovery (`showcase-deep-recovery`) — Wave 3, S-world

Now: overall 2.5, mean 2.6, **0.5 fps** at 1920 (p50 1,917 ms), 1.1 at 1280, 3.6 mobile; performance 0.5. Fantasy: *salvage dive from turquoise
shallows into a dark wreck basin; the sub's searchlight cuts the murk.* Keep `sub.ts`, `sonar.ts`, `salvage.ts`, `oxygen.ts`, HUD structure.

- **Performance (P0):** delete `effects.volumetricFog` (`main.ts:280-285`, CPU 8-bit readback per frame); replace with the in-shader underwater fog
  (§8.3). Acceptance requires the fps collapse gone before any art work is reviewed.
- **Environment:** heightfield seabed with sand/rock PBR (K3 adapted), instanced rock and coral meshes, a real wreck with rust PBR and barnacle decals
  (replaces the squashed-sphere seabed `environment.ts:109-119` and ~200 primitives); turquoise-to-deep depth-keyed absorption (§8.3), projected
  caustics in the shallows, GPU god rays from the surface, marine snow particles.
- **Assets:** textured sub with normal maps, separate propeller (spin), lights; crates with PBR. Delete all `scripts/build-models.mjs` outputs (232–2,068
  tris, per-face normals, no UVs, registered as release).
- **Materials:** cut emissive on base materials 3–5× (rock emissive 0.26–0.46 today, `environment.ts:113-118,576-604`); delete the sub override
  (`main.ts:352-361`) so its 5 authored materials return.
- **Lighting:** attach the searchlight spot (shadow) and headlight to the sub as runtime nodes updated in `syncVisualNodes` (today fixed in world at
  `environment.ts:53-69`); surface key directional for the shallows only.
- **Camera:** chase at 15–25° pitch, smoothing 0.12–0.2 with look-ahead (today smoothing 0 "for harness determinism", `main.ts:302-305`; determinism
  now comes from the PRD 09 fixed-step loop, not a rigid camera).
- **VFX:** bubbles on thrust, silt kick-up near the seabed, breach shake and red light flicker; sonar ping as a screen-space ring with depth test.
- **Audio:** move from raw `HTMLAudioElement` (`deep-audio.ts:18-40`) to `GameSoundEngine` with `underwater` reverb preset (PRD 09 §6.8); sonar return
  scheduled on the audio clock, not `setTimeout(250)`.
- **HUD:** keep the structure (HUD 6); add a diegetic sonar panel.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Remove CPU volumetric; shader absorption fog | 0.5 fps → ≥ 45 runner Medium | −(CPU readback stall) | −1,500 ms+ per frame at 1920 | 0 | 0 | required | exp² fog |
| Underwater stack (caustics, god rays, snow) | Atmo 1.5 → ≥ 7.5; env 2.5 → ≥ 7 | +1.2 ms (god rays ¼ res) | +0.1 ms | 8 MB | +PRD 07 code | no god rays on Low | caustics + fog only |
| Attached shadowed searchlight | Light 2.5 → ≥ 7; the signature look | +0.3 ms | 0 | 16 MB | 0 | 1024 map | unshadowed spot |

#### 6.9.15 Skyline Runner (`showcase-skyline-runner`) — Wave 4, S-presentation

Now: overall 4, mean 3.6, 11.4 fps; char 5. Fantasy: *winter-dusk rooftop platformer across five acts; painted backdrop, lit 3D foreground.* Keep
`level-layout.ts`, platformer kit wiring, acts, sensors, `ghost.ts`, the painted backdrop art direction and HUD skeleton (research/21).

- **Gameplay bug:** Lives reads 0 while play continues because the HUD computes `max(0, lives − deaths)` (`hud.ts:176`) from a hard-coded
  `lives: 3` (`main.ts:3960`) while nothing ends the run when deaths reach it. Fix: read `lives` from the level config (`level.ts:372`), and when
  `state.deaths >= lives` transition the session to `results` (PRD 09 shell) with Restart; the HUD never shows 0 during `playing`.
- **Environment:** one art style: lit 3D foreground (K3 snow-adapted platform kit with textures) in front of the painted backdrop, which is re-cut into
  3–4 parallax layers with matched fog and key direction (today one card stretched 1.9× vertically, `main.ts:1244`); delete the floating untextured tree
  slab and the grey bars under platforms.
- **Assets:** rig and animate `skylineHeroRunner` (48k, BC+N+MR) through the PRD 06 / meshy-cli rig flow; delete the 4-tri `skylineArcticRunnerHero`
  card and `skylineIceLedge*` cards; textured sentries (today 3 flat materials).
- **Materials:** delete the tint on the runner; ice with clearcoat + normal.
- **Lighting:** one key per act (shadow) — mount only the active act's rig (five act rigs + `lights.studio` mounted at once today, `main.ts:2098`);
  delete `lights.studio`; fog per act through PRD 07 so the active act's fog is used (only the first fog node is honoured, `index.ts:12743`).
- **Camera:** keep the side-scroll follow; add landing shake and lead.
- **VFX:** snowfall particles, landing puffs, pickup sparkles, ember volleys as particles (today capsules).
- **Rendering config:** delete `pixelRatio: 0.7` (`main.ts:1875-1879`); delete public guide boxes `guideVisibility: "public"` (`main.ts:1960-1971`).
- **Pickups:** coins recoloured for contrast against dark blue; HDR emissive under threshold-≥1 bloom so they stop clipping white.
- **Audio:** K8 footsteps (snow, metal), jump/land, pickup; per-act ambience beds (keep concept, replace synth).
- **Mobile:** landscape layout at DPR ≥ 2 (High) / 1.5 (Medium).

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Rigged textured hero | Char 5 → ≥ 7.5; anim 3 → ≥ 7 | +0.2 ms | +0.15 ms | +20 MB | ≤ 5 MB | LOD1 | LOD1, 1k maps |
| Lit 3D foreground + parallax backdrop | Env 5 → ≥ 7.5; depth 3 → ≥ 7 | +0.3 ms | 0 | +30 MB | ≤ 10 MB | 2 layers | 2 parallax layers |
| DPR fix | Sharpness across all categories | ×2–4 fill | 0 | scales | 0 | tiers | governor |

#### 6.9.16 Blockfall Reactor (`showcase-blockfall-reactor`) — Wave 4, S-presentation

Now: overall 4, mean 3.7, 9.8 fps; materials 5 (jelly-block shader, fleet best). Fantasy: *falling-blocks cabinet in a living arcade; jewel tiles catch
reflections; clears detonate.* Keep `rules.ts`, the instanced tile pools, stem-layer audio system, `board-view.ts` logic.

- **Performance:** delete `createLockedBlockNodes` (200 hidden boxes, defined `reactor-scene.ts:516`, mounted `main.ts:630`) and the per-cell draw-call A/B probe (`main.ts:763-826`); scoreboard digits via one
  SDF text node per field (today ~80 text3D digit nodes); one WebGL context (3 today).
- **Environment:** lit 3D arcade room from K4/K2: neighbouring cabinets as meshes (today 4-tri unlit cards), reflective floor; fill the dead navy lower
  25% of the frame with the cabinet bezel and floor.
- **Assets:** the Sketchfab cabinet re-textured so its marquee does not read "GAME OVER / RESTART?" (today covered by occluder boxes, `main.ts:548-567`),
  placed so the playfield does not occlude it; delete the mechanic/rival image cards or replace with rigged K6 mascots.
- **Materials:** split vertices or flat-normal option for `BLOCK_TILE_GEOMETRY` (`reactor-scene.ts:44-58`) so the bevel catches light (PRD 01 crease
  normals); tiles now reflect the HDRI.
- **Lighting:** delete the π-scaled lavender ambient; cabinet-screen glow as a rect area light (PRD 02) + one overhead key (instanced tile shadows).
- **Camera:** tilt 8–12°, slow idle drift ±1.5°, punch on clears (research/21 win 1); fov 40–50 (32 today).
- **VFX:** per-cell lock flash, hard-drop trail + dust, GPU particle bursts on clears (today one orange ring), line-clear shockwave.
- **HUD:** thin the gridlines; outline the ghost piece; remove the centre hotspot and vertical streak artifacts (verify against PRD 03 bloom/AA fixes).
- **Audio:** keep the stem system; replace synthesized stems and 9 SFX with sampled K8 content.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Delete hidden nodes + digit nodes | 9.8 fps → ≥ 45 runner Medium | −2 ms | −3 ms | −10 MB | 0 | required | none (deletion) |
| Tilted drifting camera + real room | Cam 2 → ≥ 7; depth 3 → ≥ 7 | +0.3 ms | 0 | +25 MB | ≤ 8 MB | 1k | static camera tilt without drift (reduced motion) |
| Clear bursts + lock flash | VFX 2 → ≥ 7; juice 2 → ≥ 7 | +0.3 ms | +0.05 ms | 2 MB | 0 | 50% | primitive pool |

#### 6.9.17 Mech Hangar (`showcase-mech-hangar`) — Wave 4, S-world

Now: overall 3.5, mean 3.2, 9.3 fps; animation none; 28.5 MB to ready (27 MB one hero, loaded twice). Fantasy: *workshop hangar where you configure a
mech, then a floodlit pit where two mechs fight with weight.* Keep `arena/mech-fight.ts`, `createCombatAi` wiring, `characterAssembly` validation,
input map.

- **Assets:** replace the MH-2M family (144–608-tri JS-generated parts, `scripts/build-models.mjs`) with either a textured modular mech kit (5–20k tris
  per part, rigged at sockets) or 2–4 rigged, animated mechs (K6 mech rig); load the hero once, KTX2 + Meshopt (27.3 MB → ≤ 8 MB).
- **Animation:** walk, strike (light/heavy/special), recoil, hit reaction, KO (PRD 06); today rigid yaw only (`main.ts:892,938`).
- **Environment:** hangar kit (catwalks, gantries, crates, cables, decals, tiling trims) replacing ~190 primitive nodes; pit arena dressed separately.
- **Scene split:** hangar and pit in separate scenes via `game.setScene` with shell transition (today one scene, 4 directionals + 12 lights double-light
  both sets, `main.ts:718-732`).
- **Lighting:** per set: one shadowed key + 2–3 practicals + K1 hangar HDRI; delete fake emissive contact discs (`main.ts:366-380`) and parked nodes at
  y=-60/-70 that inflate the shadow fit.
- **Camera:** `rigs.fighting` framing both mechs in the pit; hangar orbit for configuration with FOV safe on mobile (crops fighters today).
- **VFX:** muzzle flash, tracers, impact sparks, smoke flipbooks, impact lights; hit-stop already present (light 4, heavy 7, special 9 frames) kept.
- **Audio:** sampled metal impacts, servo whines, footstep thuds, hangar bed, music (today oscillator WAVs).
- **HUD:** delete the asset-passport panel; game-styled overlay; full-bleed canvas (3/4 width today).

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Rigged textured mechs + animation | Assets 3.5 → ≥ 7.5; anim 3 → ≥ 7 | +0.5 ms (skinning) | +0.3 ms | +40 MB | ≤ 16 MB | LOD1 | static LOD with procedural recoil |
| Hangar kit + split scenes | Env 2.5 → ≥ 7; light 3.5 → ≥ 7 | +0.4 ms | −(one set at a time) | +30 MB | ≤ 10 MB | 1k | 1k kit, fewer props |
| Combat VFX | VFX 1.5 → ≥ 7 | +0.4 ms | +0.1 ms | 4 MB | 0 | 50% | primitive pool |

#### 6.9.18 Gallery Shift (`showcase-gallery-shift`) — Wave 4, S-world

Now: overall 3, mean 3.0, 10.1 fps; characters frozen (C16: `AnimationController({clipRegistry})` produces an empty pose, `index.ts:13871`); thief
never faces movement. Fantasy: *night heist in a private gallery: pools of light, sweeping guard flashlights, marble and glass.* Keep `floor.ts`,
`vision.ts`, `guard.ts` FSM, detection meter.

- **Correctness (P0):** fix the empty-pose path (PRD 06); add thief facing in `syncCharacterVisuals` (`main.ts:1353-1357`): yaw =
  `atan2(moveX, moveZ)` with slerp halflife 0.08 s.
- **Environment:** re-author the museum with K4 tiling marble, parquet and plaster (normal + ORM) replacing 14 flat-colour materials and ~200 merged
  detail boxes (`environment.ts:42-330`); real exhibits (licensed statues, vases, framed paintings) replacing 24–284-tri synth exhibits; display-case glass
  with transmission or env-reflective alpha + Fresnel.
- **Assets:** rigged lit humanoid thief ≥ 5k tris PBR (replaces 72-tri unlit Kenney figure); two guards from one K6 family (today voxel/mech/barrel styles
  clash) with walk/run/search clips.
- **Lighting:** delete both ambients (1.56 total) and 4 broad directionals; warm gallery spots on art; guard flashlights as shadowed spots following the
  guards (PRD 02 ≥ 2 shadow casters); interior HDRI at low intensity; stay within the light cap (31 lights today vs 16) or rely on PRD 02 clustered
  lighting for all variants.
- **Camera:** follow cam with damping, look-ahead toward the thief's heading, alert zoom (today static at 24.6 m).
- **VFX:** visible, correctly parented vision cones (§8.9) (the HUD says "AVOID THE CONES" and none render); dust in beams; alarm strobe light.
- **HUD:** delete Rapier/LOS telemetry (`main.ts:347-351`, `1231-1241`), box "identity harnesses" (`main.ts:196-251`) and world-text labels once characters
  read; fix the clipped "TREASUR'" text.
- **Audio:** K8 footsteps (marble, wood) per surface, guard radio barks, alarm, tension music layer by detection level.

| Change | Visual benefit | GPU | CPU | Memory | Bundle | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| Animated, facing characters | Anim 3 → ≥ 7; char 2 → ≥ 7 | +0.3 ms | +0.2 ms | +20 MB | ≤ 8 MB | LOD1 | LOD1, 64-joint skeleton |
| Following shadowed flashlights + cones | Light 4 → ≥ 7.5; shad 2 → ≥ 7 | +0.6 ms (2 × 1024 spot maps) | +0.05 ms | 8 MB | 0 | 1 caster on Low | unshadowed cones |
| Textured museum + glass | Env 4 → ≥ 7.5; mat 3 → ≥ 7 | +0.5 ms | 0 | +40 MB | ≤ 12 MB | 1k | alpha glass |

### 6.10 Target scorecard (now → target; visual targets judged by research/21 rubric, non-visual by research/20 rubric)

Genre-critical categories (bold) must reach the target; every other visual category ≥ 5.

| Game | Env | Asset | Mat | Light | Shad | IBL | Post | VFX | Anim | Cam | Atmo | HUD | Audio | Feel | Juice | Mob | Perf | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bank Shot | 2→7 | 3→7 | **3→8** | **3→8** | **2→8** | 2→7 | 2→6 | 1→5 | 2→7 | 3→7 | 1→6 | 5→7 | 3→7 | 3→7 | 2→6.5 | 2→6.5 | 4→7 | 3→**7.5** |
| Turbo Drift | **2.5→7.5** | 3.5→7.5 | 3→7 | 3.5→7.5 | **2.5→7.5** | 2.5→7 | 3.5→7 | **2→7** | 3→6.5 | 3.5→7.5 | 3→7 | 6.5→7.5 | 3→7 | 5→7.5 | 2.5→7 | 3→6.5 | 3→7 | 3→**7.5** |
| Aura Clash | 4→7 | 4→7.5 | 3→7.5 | **3→7.5** | 2→7 | 2→7 | 2→7 | **2→7.5** | **4→7.5** | **3→7.5** | 1→6 | 6→7.5 | 4→7 | 5→7.5 | 3→7.5 | 2→6.5 | 3→7 | 3→**7.5** |
| Orbital Defense | **1→7** | **1→7** | 1.5→7 | 1.5→7 | 0→6 | 0→7 | 0.5→7 | **0.5→7.5** | 1→6 | 2→7 | 0→7 | 4→7 | 0→6.5 | 1→7 | 0.5→7 | 1→6.5 | 7→7 | 1.5→**7** |
| Vault Breakers | 2→6.5 | **2→7.5** | **2→7.5** | 2→7 | 1→6.5 | 0→7.5 | 1→7 | 1→6.5 | 3→6 | 4→7 | 1→5.5 | 5→7 | 3→7 | 4→7 | 1→7 | 3→6.5 | 7→7 | 2.5→**7** |
| Rooftop Buckets | **3→7** | 3→7 | 3→7 | 5→7.5 | 2→7 | 2→7 | 4→7 | 4→7 | **3→7** | 4→7 | 2→6.5 | 6→7.5 | 2.5→7 | 3.5→7 | 3→7 | 3→6.5 | 3→7 | 4→**7.5** |
| Courier Rush | **2→7** | 4→7 | 3→7 | 3→7 | 1→6.5 | **1→7** | 2→7 | 3→6.5 | 3→6 | 3→7 | **1→7** | 6→7 | 1.5→7 | 2.5→7 | 2→6.5 | 3→6.5 | 2→7 | 2→**7** |
| Neon Swarm | **2→7** | 3→7 | 3→7 | 3→7 | 2→6.5 | 1→7 | 4→7.5 | **2→7.5** | 2→6.5 | 4→7 | 2→6 | 5→7 | 3→7 | 3→7.5 | **2→7.5** | 3→6.5 | 4.5→7 | 2.5→**7** |
| Pulse Tunnel | 3→7 | 3→7 | 3→7 | 3→7 | 1→5.5 | 3→7 | **2→7.5** | 1→7 | 2→6 | **2→7** | 1→7 | 5→7 | 5→7.5 | 3→7.5 | 2→7 | **1→6.5** | 3→7 | 3→**7** |
| Siege Golf | **3.5→7.5** | **3→7** | 3→7 | 4.5→7.5 | 4.5→7.5 | 1.5→7 | 4→6.5 | 3→6.5 | 3→6 | 4.5→7 | 2→6.5 | 4→7 | 3→7 | 4→7 | 3→7 | 3.5→6.5 | 3→7 | 3.5→**7.5** |
| Patrol Wing | **2→7.5** | 4→7 | 4→7 | 3→7.5 | 2→7 | 1→7 | 3→7 | 2→6.5 | 4→6.5 | **3→7.5** | **1→7.5** | 6→7 | 3→7 | 3→7 | 3→6.5 | 3→6.5 | 5→7 | 3→**7.5** |
| Aurora Lander | **1.5→7** | 4→7 | 2.5→7 | 2.5→7 | 1→6.5 | 1→6.5 | 3→7 | 2.5→7 | 3→6 | 2→7 | **1→7.5** | 5.5→7 | 3→7 | 3→7 | 2→6.5 | 4→6.5 | 6→7.5 | 2.5→**7** |
| Gravity Post | 2.5→7 | 3→7 | 2→7 | **2→7** | 0.5→5.5 | 1→7 | 1→7 | 2→6.5 | 2→6 | 4→7 | 1→6.5 | 6→7 | 2→6.5 | 3→7 | 2.5→6.5 | 2.5→6.5 | 2→7 | 3→**7** |
| Deep Recovery | 2.5→7 | 2.5→7 | 2→7 | **2.5→7** | 1→6.5 | 1→6 | 3→7 | 3.5→7 | 2→6 | 2.5→7 | **1.5→7.5** | 6→7 | 2→7 | 1.5→7 | 3→6.5 | 3→6.5 | **0.5→7** | 2.5→**7** |
| Skyline Runner | 5→7.5 | 4→7.5 | 4→7 | 4→7 | 2→6.5 | 1→6.5 | 4→7 | 4→7 | **3→7** | 4→7 | 3→7 | 6→7.5 | 3→7 | 3→7.5 | 2→7 | 2→6.5 | 2→7 | 4→**7.5** |
| Blockfall Reactor | 4→7 | 3→7 | 5→7.5 | 4→7 | 1→6 | 3→7 | 5→7.5 | **2→7** | 2→6 | **2→7** | 2→6 | 4→7 | 3→7 | 4→7.5 | **2→7.5** | 3→6.5 | 2→7 | 4→**7.5** |
| Mech Hangar | 2.5→7 | **3.5→7.5** | 3.5→7.5 | 3.5→7 | 2→7 | 2.5→7 | 4→7 | 1.5→7 | **3→7** | 3.5→7 | 1.5→6 | 4.5→7 | 2→7 | 3→7 | 2→7 | 1.5→6.5 | 2→7 | 3.5→**7** |
| Gallery Shift | 4→7.5 | 3→7 | 3→7 | **4→7.5** | **2→7** | 1→6.5 | 4→7 | 2→6.5 | **3→7** | 4→7 | 1→6.5 | 4→7 | 2.5→7 | 2.5→7 | 2→6.5 | 2→6.5 | 2→7 | 3→**7** |

Fleet acceptance: all 18 overall ≥ 7 (or withdrawn per §6.3), fleet mean ≥ 7.2, no fleet category mean below 6.0 (today particles 1.4,
atmosphere 1.4, IBL 1.5).

## 7. APIs to add, change and remove

This PRD owns route-level contracts and review data. Engine and runtime APIs are owned by PRDs 01–13 and are consumed, not redefined (§7.6).
Judgement records reuse PRD 12 §7 types (`GameJudgement`, `PanelRoundRecord`, `GAME_VISUAL_CATEGORIES`, `GAME_NONVISUAL_CATEGORIES`).

### 7.1 Art direction contract — `@aura3d/game/art` (new subpath of the PRD 09 package; types + validator only, 0 runtime bytes in play)

```ts
import type { AuraQualityTier } from "@aura3d/engine";          // PRD 01/03/11

/** Mirrors GAME_VISUAL_CATEGORIES in tools/quality-gate/src/types.ts (PRD 12, internal). A unit test asserts the two lists are identical. */
export type GameVisualCategory =
  | "environment_world" | "modeling_assets" | "texture_quality" | "material_quality" | "pbr_credibility" | "lighting" | "shadows"
  | "ambient_lighting" | "ibl_reflections" | "tone_mapping" | "color_management" | "anti_aliasing" | "postprocessing" | "vfx" | "particles"
  | "animation_quality" | "character_presentation" | "camera" | "composition" | "scale_depth_perception" | "atmospheric_effects"
  | "gameplay_readability" | "ui_hud" | "typography" | "polish_juice" | "mobile_presentation" | "overall_visual_quality";

export type GameGenre =
  | "fighting" | "falling-blocks" | "platformer" | "racing" | "golf-physics" | "lander" | "twin-stick"
  | "orbital-puzzle" | "vehicle-delivery" | "rhythm-runner" | "mech-fighting" | "pinball" | "basketball"
  | "stealth" | "underwater-salvage" | "flight" | "billiards" | "arena-shooter";

export type RebuildTier = "S-presentation" | "S-world" | "F";
export type AssetRole = "hero" | "character" | "vehicle" | "enemy" | "world" | "prop" | "set-dressing" | "backdrop";

export interface ArtReference {
  readonly file: string;                 // relative to apps/<id>/art/references/
  readonly source: string;               // URL or "internal mood board"
  readonly licence: string;              // "reference-only" allowed; never shipped as an asset
  readonly why: string;                  // ≥ 40 chars: which property to match (palette, lighting, framing, density)
}

export interface ArtAssetRole {
  readonly role: AssetRole;
  readonly assetKey: string;             // key in aura.assets.json, typed via src/aura-assets.ts
  readonly kit?: "K1" | "K2" | "K3" | "K4" | "K5" | "K6" | "K7" | "K8" | "K9";
  readonly maxTriangles: number;         // LOD0
  readonly minTriangles?: number;        // hero/character/vehicle/enemy must set it (≥ 2,000 except billiard balls)
  readonly textureSet: "BC" | "BC+N" | "BC+N+ORM" | "BC+N+ORM+E";
  readonly maxTextureSize: 512 | 1024 | 2048 | 4096;
  readonly targetTexelDensity?: number;  // px per metre at LOD0, checked by PRD 05 `assets budget`
  readonly animated?: { readonly clips: readonly string[] };
}

export interface ArtLightingDesign {
  readonly key: { readonly type: "directional" | "spot" | "rect"; readonly colorTemperatureK: number; readonly shadow: true };
  readonly fill: "ibl" | "ibl+bounce";   // never "ambient"
  readonly practicals: number;           // ≤ 6 point/spot lights besides the key
  readonly environment: { readonly hdri?: string; readonly preset?: string; readonly background: "hdri" | "sky" | "enclosed" };
  readonly exposureEV: number;           // authored; honoured after PRD 01
}

export interface ArtFraming {
  readonly rig: "chase" | "flight" | "fighting" | "shoulder" | "orbit" | "topDown" | "altitude" | "rail" | "static";
  readonly subjectHeightFraction: readonly [min: number, max: number]; // measured by the PRD 08 camera evidence
  readonly fovDeg: readonly [min: number, max: number];
  readonly mobile: "landscape" | "portrait" | "both";
}

export interface GameArtDirection {
  readonly id: string;                   // route id, equals games.json id
  readonly genre: GameGenre;
  readonly fantasy: string;              // one sentence, ≤ 140 chars
  readonly rebuildTier: RebuildTier;
  readonly wave: 0 | 1 | 2 | 3 | 4;
  readonly references: readonly ArtReference[];          // ≥ 3
  readonly palette: { readonly primary: readonly string[]; readonly accent: string; readonly reservedObjective?: string };
  readonly lighting: ArtLightingDesign;
  readonly framing: ArtFraming;
  readonly assets: readonly ArtAssetRole[];
  readonly vfx: readonly { readonly event: string; readonly kind: string; readonly flipbook?: string }[];
  readonly audio: readonly { readonly event: string; readonly cue: string; readonly variants: number }[];
  readonly signatureEffect: string;      // survives every tier (§6.7)
  readonly criticalCategories: readonly GameVisualCategory[]; // bold columns of §6.10
  readonly tiers: Readonly<Record<Exclude<AuraQualityTier, "auto">, { readonly particles: number; readonly shadowMap: number; readonly cascades: number; readonly textureMax: 1024 | 2048 | 4096 }>>;
}

/** Validates at build time; throws AuraArtDirectionError listing every violation. */
export function defineArtDirection(direction: GameArtDirection): GameArtDirection;

/** Used by `pnpm check:art-direction`: compares the mounted scene (app.diagnostics()) with the contract. */
export function auditArtDirection(direction: GameArtDirection, snapshot: ArtDirectionSnapshot): readonly ArtDirectionViolation[];

export interface ArtDirectionSnapshot {
  readonly lights: readonly { readonly type: string; readonly shadow: boolean; readonly intensity: number }[];
  readonly hasAmbient: boolean;
  readonly environment: { readonly kind: "none" | "hdri" | "preset" | "procedural"; readonly background: boolean };
  readonly models: readonly { readonly assetKey: string; readonly triangles: number; readonly textures: number; readonly unlit: boolean; readonly overridesTextures: boolean }[];
  readonly drawCalls: number;
}

export interface ArtDirectionViolation {
  readonly rule:
    | "ambient-light" | "missing-environment" | "no-shadowed-key" | "too-many-practicals"
    | "asset-under-min-triangles" | "asset-unlit-card" | "asset-texture-override" | "asset-not-in-contract"
    | "draws-over-tier-budget";
  readonly detail: string;
}
```

Validator rules (all fatal): `references.length >= 3`; no `lights.ambient` in the mounted scene; exactly one light with `shadow: true` unless
`lighting.key.type === "spot"` and the genre is `stealth` or `underwater-salvage` (up to 3 shadowed spots); every hero/character/vehicle/enemy role
has `minTriangles` and a texture set other than `BC`; no role resolves to a `KHR_materials_unlit` 4-triangle asset; `fill !== "ambient"`.

### 7.2 `tools/quality-rebuild-capture/games.json` — fields added on top of PRD 12 §9.6

```ts
export interface GameEntryV2 /* extends PRD 12 game entry: id, route, scenarios, hudSelectors, timeline */ {
  readonly wave: 0 | 1 | 2 | 3 | 4;
  readonly rebuildTier: "S-presentation" | "S-world" | "F";
  readonly artDirection: string;                       // "apps/<dir>/art/direction.ts"
  /** Conditions the timeline must reach; capture fails (verdict "capture-failed") if one is not met by its deadline. */
  readonly requiredConditions: readonly {
    readonly shot: string;                             // e.g. "04-action"
    readonly expr: string;                             // evaluated against window.__AURA3D_GAME__ + evidence sections, e.g. "fx.live > 0 && session.state === 'playing'"
    readonly deadlineMs: number;
  }[];
  /** Fails a shot when the canvas region (HUD masked) is uniformly dark, independent of DOM HUD pixels.
   *  "Dark" = Rec.709 luma < 10/255 on the sRGB PNG. Distinct colours counted after 5-bit-per-channel quantisation.
   *  Defaults 0.9 and 2,000. A per-game override is allowed only with `reason` (space/underwater/night games, see §7.2.1),
   *  and never above maxDarkFraction 0.97 (the Courier black frame measures 0.968 and must still fail on Courier). */
  readonly canvasBlankCheck: { readonly maxDarkFraction: number; readonly minDistinctColors: number; readonly reason?: string };
  readonly acceptance: {
    readonly minOverall: 7;
    readonly minVisualCategory: 5;
    readonly critical: Readonly<Record<string, number>>; // from §6.10 bold columns
    readonly minNonVisual: { readonly sound_audio: 6; readonly controls: 7; readonly game_feel: 6.5; readonly loading_transitions: 6; readonly physics_feel?: 6 };
  };
  readonly budgets: GameBudgets;                       // §17
}

export interface GameBudgets {
  readonly transferToPlayableMB: Readonly<Record<"low" | "medium" | "high" | "ultra", number>>;
  readonly routeJsGzipKB: number;                      // route chunk only, excluding engine and @aura3d/game
  readonly drawCalls: Readonly<Record<"low" | "medium" | "high" | "ultra", number>>;
  readonly gameLogicCpuMs: number;                     // ≤ 4 (PRD 11 §17.1 separates engine CPU)
}
```

Shot ids are the ones already in `games.json` (`defaults.requiredShots = ["02-opening", "03-mid", "04-action"]`, `mobileStopAfterShot: "03-mid"`, plus
each game's existing `05-*`/`02b-*`). This PRD does not rename shots; it adds the state each shot must prove. `expr` reads the PRD 09 beacon
`window.__AURA3D_GAME__` and the evidence sections each route publishes through `publishEvidence` (field names below are the contract the route must publish).

#### 7.2.1 Per-game capture contract and budgets (seeds `games.json`; Medium draws ≤ 300 because the §17.2 runner gate runs forced Medium)

| Game (`games.json` id) | `04-action` required condition (`expr`, deadline) | Other required conditions | Touch preset / orientation | `canvasBlankCheck` override | Draws Low / Med / High | Transfer to playable, Medium |
|---|---|---|---|---|---|---|
| `aura-clash-showcase` | `combat.hitStopActive === true && fx.live > 0`, 12 s | `03-mid`: both fighters' bbox height 0.45–0.6 of frame (`camera.subjectHeightFraction`) | `dpad-2btn` / landscape | — | 150 / 150 / 150 | ≤ 15 MB |
| `showcase-blockfall-reactor` | `board.linesClearedThisRound >= 1 && fx.live > 0`, 20 s | `03-mid`: `board.stackHeight >= 4` | `dpad-2btn` / both | — | 120 / 150 / 150 | ≤ 12 MB |
| `showcase-skyline-runner` | `player.airborne === true && fx.live > 0` (jump with snow/landing FX), 10 s | `03-mid`: `level.act >= 2` or `player.x` past act-1 boundary | `dpad-2btn` / landscape | — | 150 / 250 / 250 | ≤ 15 MB |
| `showcase-turbo-drift-circuit` | `car.drifting === true && fx.live > 0` (smoke visible), 15 s | `03-mid`: `car.speedKph >= 120` | `dpad-2btn` (steer + throttle/brake) / landscape | — | 150 / 300 / 350 | ≤ 15 MB |
| `showcase-siege-golf` | `structures.toppledThisShot >= 1`, 12 s | `05-charge`: `shot.power > 0.5`; no `setScene` between `02` and `04` (`session.sceneSwaps === 0`) | `aim-drag` / both | — | 120 / 200 / 200 | ≤ 15 MB |
| `showcase-aurora-lander` | `lander.touchdown === "landed"`, 40 s | `03-mid`: `lander.altitude < 30 && camera.padInFrame === true` | `aim-drag` (thrust + rotate) / both | `{ 0.95, 1500, "night sky" }` | 120 / 150 / 150 | ≤ 15 MB |
| `showcase-neon-swarm` | `swarm.killsThisWave >= 3 && fx.live > 0`, 15 s | `05-burst`: `fx.live >= 20` | `twin-stick` / both | — | 120 / 150 / 150 | ≤ 15 MB |
| `showcase-gravity-post` | `pod.state === "in-flight"` via keyboard-only launch, 10 s | `03-mid`: every planet's mean luma on its lit half ≥ 40/255 (no black planets) | `aim-drag` / both | `{ 0.95, 1500, "space" }` | 100 / 120 / 120 | ≤ 15 MB (from 46.8 MB) |
| `showcase-courier-rush` | `delivery.completed >= 1`, 45 s | every shot: default canvas check (no override) | `dpad-2btn` / landscape | — (must fail on the 0.968 black frame) | 150 / 300 / 300 | ≤ 15 MB |
| `showcase-pulse-tunnel` | `gates.passedOnBeat >= 2 && fx.live > 0`, 12 s | mobile `03-mid`: canvas CSS size = viewport ± 1 px | `dpad-2btn` (lanes) / both | — | 120 / 200 / 200 | ≤ 12 MB |
| `showcase-mech-hangar` | `combat.lastHit.kind === "heavy" && fx.live > 0`, 20 s | `02b-arena-opening`: `scene.id === "pit"`; hero GLB fetched once (`assets.fetchCount.mechHeroDecimated === 1`) | `dpad-2btn` / landscape | — | 150 / 250 / 250 | ≤ 15 MB (from 28.5 MB) |
| `showcase-vault-breakers` | `table.bumperHitsThisBall >= 1 && fx.live > 0`, 20 s | `03-mid`: `ball.inPlay === true` | flipper zones + plunger drag / portrait | — | 100 / 100 / 100 | ≤ 15 MB |
| `showcase-rooftop-buckets` | `shot.result === "make"` with skinned athletes visible (`characters.skinnedVisible >= 2`), 20 s | `05-charge`: `shot.meter > 0.5` | `aim-drag` / both | — | 150 / 200 / 200 | ≤ 15 MB |
| `showcase-gallery-shift` | `guard.state === "alert"` with ≥ 1 cone rendered (`fx.cones >= 1`), 30 s | `03-mid`: `thief.boneDeltaSinceLastFrame > 0` (not frozen) and thief yaw within 15° of move direction | `twin-stick` (move only) / both | `{ 0.93, 1500, "night interior" }` | 150 / 250 / 250 | ≤ 15 MB |
| `showcase-deep-recovery` | `salvage.grappled >= 1`, 40 s | every shot: `perf.readbacksThisFrame === 0` | `twin-stick` / both | `{ 0.95, 1500, "deep water" }` | 150 / 200 / 200 | ≤ 15 MB |
| `showcase-patrol-wing` | `drones.hitsThisSortie >= 1 && fx.live > 0`, 30 s | `03-mid`: `rings.inFrame >= 1 && flight.throttle > 0.4` | tilt/drag flight preset / landscape | — | 150 / 230 / 230 | ≤ 15 MB |
| `showcase-bank-shot` | `table.pottedThisShot >= 1`, 15 s (today's `until` on `__BANK_SHOT_EVIDENCE__.potted` moves to the beacon) | `03-mid`: `balls.maxAngularSpeed > 0` (balls roll) | `aim-drag` / both | — | 100 / 120 / 120 | ≤ 12 MB |
| `showcase-orbital-defense` | `fx.explosionsLive >= 1`, 20 s | `03-mid`: no drone bbox overlaps a HUD selector rect | `twin-stick` / both | `{ 0.95, 1500, "space" }` | 80 / 80 / 80 | ≤ 12 MB |

A route that cannot publish a listed field must add it to its evidence section in the same PR; renaming a field requires updating this table.

### 7.3 Scorecard — `apps/<id>/art/scorecards/<sha>.json` (schema in `tools/quality-gate/src/scorecard.ts`, internal)

```ts
import type { GameJudgement, JudgeIdentity, EvidenceEnvironment } from "./types";  // tools/quality-gate/src/types.ts, PRD 12 §7

export interface GameScorecard {
  readonly schema: "aura3d.game-scorecard/1";
  readonly gameId: string;
  readonly commit: string;
  readonly round: number;                              // 1 or 2 (§6.3 rejection loop)
  readonly captureRunId: string;                       // GitHub Actions run id
  readonly env: EvidenceEnvironment;
  readonly vision: readonly GameJudgement[];           // one per viewport
  readonly human: readonly {
    readonly judge: JudgeIdentity;
    readonly device: string;                           // e.g. "MacBook Air M2 / Safari 18"
    readonly tier: "low" | "medium" | "high" | "ultra";
    readonly playedMinutes: number;                    // ≥ 5
    readonly visual: GameJudgement["scores"];
    readonly nonVisual: Readonly<Record<"sound_audio" | "controls" | "physics_feel" | "game_feel" | "loading_transitions", number>>;
    readonly measuredFps: { readonly p50: number; readonly p95: number };
    readonly competitiveWithModernThree: boolean;
    readonly notes: string;                            // ≥ 200 chars
  }[];
  readonly perf: readonly { readonly viewport: string; readonly p50Ms: number; readonly p95Ms: number; readonly p99Ms: number; readonly draws: number }[];
  readonly verdict: "accepted" | "rejected" | "withdrawn";
  readonly findings: readonly string[];                // required when rejected
}
```

`pnpm exec tsx --tsconfig tsconfig.base.json tools/quality-gate/src/scorecard.ts --game <id> --run <runId>` (new file; `tools/*` is not a pnpm workspace member, so `--filter` does not apply; wired as root script `quality:scorecard`) builds the file from the capture run, the PRD 12 panel record and the human-review form export,
computes the §6.3 verdict, and refuses to write `accepted` if any required field is missing.

### 7.4 `route-health.json` change (every game)

```ts
export interface RouteHealthQualityGate {
  readonly status: "unreviewed" | "in-rebuild" | "rejected" | "accepted" | "withdrawn";
  readonly scorecard?: string;                         // path to the accepted scorecard
  readonly acceptedAt?: string;                        // ISO date
  readonly acceptedBy?: readonly string[];             // human reviewer logins; never an agent id
}
```

Removed from `route-health.json`: free-text quality claims (`claim`, `systems` prose such as Orbital's "particle-heavy impact presentation"),
`primitiveStatus.sourceOccurrences` (counts call sites, not nodes, 17-g4 §3.1), self-assigned `quality: "release"` on route-local synthesized assets.
`publicShowcase: true` requires `qualityGate.status === "accepted"` (checked by `pnpm check:route-health`).

### 7.5 Removed from routes (all 18)

- `?capture=review`, `?capture=overview`, `?capture=combat-impact`, `?auraTestDriver`, `?spotlightProbe`, `?juiceProbe`, `?venuePlate`, `?arena=candidate`,
  `?debug=animation` code paths (ignored with a warning by PRD 09 `captureFromUrl`).
- Route evidence globals (`__AURA_CLASH_ARENA_PROOF__`, `__MECH_HANGAR_EVIDENCE__`, `__COURIER_RUSH_EVIDENCE__`, … 31+), kept one release as PRD 09 legacy
  aliases, then deleted.
- `scripts/write-performance-report.ts` (13 copies), route `*-audio.ts` wrappers (17), route spark pools (≥ 9), route `togglePause` (11), route
  `matchMedia('(prefers-reduced-motion)')` (17).
- `scripts/build-models.mjs` / `build-*.py` outputs registered as release hero/world assets (Mech, Deep, Bank, Vault, Gallery, Siege, Aurora, Patrol,
  Gravity, Pulse). Scripts may remain for colliders and greybox only, and their outputs are tagged `role: "collider" | "greybox"` and rejected by the
  art-direction validator as visible assets.
- `scripts/build-sfx.mjs` / `build-music.mjs` synthesized audio, except where the art direction declares a chiptune style (none of the 18 does).

### 7.6 Engine APIs consumed (owned elsewhere)

| Need | Owner | API (as specified there) |
|---|---|---|
| `createGame`, shell, session hit-stop, capture contract, evidence beacon, `game.fx`, `GameSoundEngine`, HUD kit, touch presets | PRD 09 | `createGame(options)` §7.1, `session.hitStop`, `captureFromUrl`, `publishEvidence`, `sound.engine` |
| Camera rigs and layers | PRD 08 | `rigs.chase/flight/fighting/shoulder/orbit/topDown/altitude/static`, `addLayer`, `AuraTraumaLayer`, `AuraPunchLayer` |
| Quality tiers, governor, frame timing | PRD 11 | `quality.set/lock/onChange`, `diagnostics().frameTiming` |
| HDR, exposure, DPR policy, additive blend, primitive tessellation, crease normals, context-loss restore | PRD 01 | `AuraQualityTier`, renderer options |
| Ambient additive to IBL, environment background, shadow strength 1, caster fit, CSM on root, spot priority, multi-caster, SSR, contact shadows, clustered lights | PRD 02 | `environments.hdri/preset`, `effects.screenSpaceReflections`, `effects.contactShadows`, `lights.*({ shadow })` |
| Bloom threshold/knee, real AA, AO, look presets, speed streaks | PRD 03 | `effects.*`, post tiers |
| Texture-preserving tint with opacity, material variants, rim term, sheen, clearcoat, transmission, KTX2 | PRD 04 | `AuraModelMaterialOverride`, `setMaterialVariant` |
| Asset admit/optimize/look-dev/budget; kits K1–K9 admission | PRD 05 | `aura3d assets admit|optimize|lookdev|budget` |
| Skinned shadows, empty-pose fix (C16), retarget, IK | PRD 06 | `AuraActorAnimationFrame` |
| Particles, flipbooks, trails, sky, fog, god rays, rain/snow | PRD 07 | `effects.particles/flipbook/trail`, sky presets |
| Terrain, scatter, spline roads, ocean, underwater, kits | PRD 10 | `world.terrain`, `world.water`, `world.kit` |
| Capture PR-build, scenarios, HUD masks, judge records | PRD 12 | `capture-games.mjs --pr-build`, `PanelRoundRecord` |
| Templates and skills carrying pilot patterns | PRD 13 | `create-aura3d` game templates |
| `@aura3d/game` packaging, deprecation calendar | PRD 15 | package layout |

## 8. Shader changes

Routes import only `@aura3d/engine` and `@aura3d/game`; there is no route-level GLSL. Every shader below is implemented as a named engine preset by
the owning PRD, with this PRD supplying the requirement, the consumers and the acceptance shot. GLSL is WebGL2 (`#version 300 es`); the WGSL port
follows PRD 11.

### 8.1 Planet surface + atmosphere shell (Orbital Defense, Gravity Post) — owner PRD 04 (material preset `material.planet`, `material.atmosphere`)

- Surface fragment: `float ndl = dot(N, L); float day = smoothstep(-0.08, 0.18, ndl);` `color = mix(nightLights.rgb * nightIntensity, pbrLit(albedo, N, …), day);`
  clouds as a second layer: `albedo = mix(albedo, vec3(0.95), cloud.a * 0.85)` with cloud shadow `pbrLit *= 1.0 - 0.35 * cloudShadow(uv + L.xz * 0.002)`.
- Atmosphere shell: sphere at 1.025 R, front faces, additive blend (`ONE, ONE`, needs PRD 01 blend modes), depth test on, depth write off.
  `float rim = pow(1.0 - saturate(dot(N, V)), 4.0); float lit = saturate(dot(N, L) + 0.25);` `out = atmosphereColor * rim * lit * intensity` (HDR, 2–6).
  Terminator band: multiply by `smoothstep(-0.25, 0.1, dot(N, L))` and add a warm tint `vec3(1.0, 0.45, 0.2) * rim * (1.0 - abs(dot(N, L)) * 4.0)` clamped.
- Shield variant (Orbital): same shell with a hex mask texture, `alpha = rim * hex(uv * 24.0) * (0.3 + hitPulse)`, `hitPulse` a uniform array of 4 impact
  points with `exp(-distance(P, hit_i) * 8.0) * fade_i`.
- Fallback: no clouds on Low; shell alpha-blended if additive is unavailable (never, after PRD 01).

### 8.2 Aurora ribbon (Aurora Lander) — owner PRD 07 (`effects.auroraRibbon`)

- Geometry: 2–4 vertical ribbons, 64 × 8 segments each, spline-driven, 40–80 m tall at 200–400 m distance. Vertex: `pos.x += sin(pos.y * 0.03 + time * 0.2 + ribbonSeed) * 6.0`.
- Fragment, additive: `float n = fbm(vec2(uv.x * 6.0 + time * 0.05, uv.y * 1.5));`
  `float curtain = smoothstep(0.35, 0.8, n) * pow(1.0 - uv.y, 1.6) * smoothstep(0.0, 0.08, uv.y);`
  `vec3 col = mix(vec3(0.1, 1.0, 0.45), vec3(0.75, 0.2, 1.0), smoothstep(0.45, 1.0, uv.y));` `out = col * curtain * intensity` (HDR 2–5, so bloom picks it up).
- Soft depth fade against terrain (`saturate((sceneDepth - fragDepth) * 0.5)`, both in **linear view-space metres**); fog applied after. Requires a sampled,
  MSAA-resolved scene depth texture from the opaque pass (PRD 01/03); WebGL2 cannot sample a multisampled depth renderbuffer directly. Without it the
  fade is skipped (hard intersection) and the fallback is reported in diagnostics.
- Optional: aurora contributes to IBL by updating a 32×16 sky-probe tint per second (High/Ultra only).

### 8.3 Underwater stack (Deep Recovery) — owner PRD 07 (fog, god rays) + PRD 10 (underwater environment preset)

- Absorption fog in the forward shader (replaces CPU `volumetricFog`): `vec3 sigma = vec3(0.42, 0.11, 0.07) * murk;`
  `float d = length(worldPos - cameraPos); float depthTerm = exp(-max(0.0, -worldPos.y) * depthFalloff);`
  `vec3 T = exp(-sigma * d); color = color * T + waterColor(depthTerm) * (1.0 - T);` where `waterColor` lerps turquoise (shallow) to deep navy.
- Caustics: projected on lit surfaces above −15 m: `float c = min(texture(caustics, P.xz * 0.12 + t * vec2(0.03, 0.02)).r, texture(caustics, P.xz * 0.15 - t * vec2(0.02, 0.035)).r);`
  `directLight *= 1.0 + c * 2.5 * saturate(N.y) * shallowMask;`
- God rays: screen-space radial blur at ¼ resolution from the projected surface-light position, 32 samples, occlusion mask from depth > surface plane;
  composited additively before tone mapping. GPU only; 0 readbacks.
- Marine snow: PRD 07 particles, 3,000 High / 800 Low, camera-relative volume, soft particles.

### 8.4 Emissive grid floor (Neon Swarm) — owner PRD 04 (procedural `material.gridFloor`)

`vec2 g = abs(fract(P.xz / cell - 0.5) - 0.5) / fwidth(P.xz / cell);` `float line = 1.0 - min(min(g.x, g.y), 1.0);`
`emissive = gridColor * line * gridIntensity * (1.0 + pulse * exp(-distance(P.xz, pulseOrigin) * 0.2));` base: dark wet asphalt, roughness 0.15
receiving SSR (PRD 02). `fwidth` keeps lines anti-aliased at any distance.

### 8.5 Pinball insert lamps (Vault Breakers) — no new shader

Inserts are separate instanced meshes over the playfield cut-outs with per-instance emissive colour and intensity (PRD 01 instance attributes). Chase
sequences animate per-instance intensity from `missions.ts` state. Fallback: emissive texture swap per state.

### 8.6 Felt, lacquer, car paint (Bank Shot, Turbo) — PRD 04 sheen, clearcoat and flake normal; no new shader.

### 8.7 Synthwave sky (Pulse Tunnel) — owner PRD 07 (`sky.gradient` with sun disc and bands)

`float h = saturate(dir.y); vec3 sky = mix(horizonColor, zenithColor, pow(h, 0.55));`
`float sunMask = 1.0 - smoothstep(sunRadius - 0.004, sunRadius, acos(clamp(dot(dir, sunDir), -1.0, 1.0)));` (GLSL ES 3.00 leaves `smoothstep` undefined when edge0 ≥ edge1, so the reversed-edge form is not used; `clamp` keeps `acos` in domain)
`float bands = step(0.5, fract((dir.y - sunDir.y) * bandFreq + time * 0.1)) + step(sunDir.y, dir.y);`
`sky += sunColor * sunMask * saturate(bands) * 4.0;` plus fog-matched horizon glow `exp(-abs(dir.y) * 12.0) * glowColor`.

### 8.8 Ocean (Patrol Wing) — owner PRD 10 (`world.water({ mode: "ocean" })`)

Vertex: 4 Gerstner waves (amplitudes 0.6/0.35/0.2/0.1 m, wavelengths 40/22/11/6 m) on a camera-centred clipmap grid. Fragment: 2 scrolling normal
maps; Fresnel Schlick `F = 0.02 + 0.98 * pow(1.0 - saturate(dot(N, V)), 5.0)`; reflection from sky IBL (+ SSR on Ultra); depth-less absorption tint
`mix(deepColor, shallowColor, saturate(heightAboveSeabed / 8.0))` near the island; foam from wave crest `saturate((height - foamThreshold) * 4.0)`.

### 8.9 Vision cone (Gallery Shift) — owner PRD 07 (soft additive volume)

Cone mesh attached to the guard's flashlight spot, additive, depth write off. `float axial = 1.0 - saturate(dist / coneLength);`
`float radial = 1.0 - smoothstep(0.7, 1.0, radialDist / coneRadiusAt(dist));` `float soft = saturate((sceneDepth - fragDepth) * 2.0);` (linear depth, same resolved-depth requirement as §8.2)
`out = coneColor * axial * axial * radial * soft * (0.15 + 0.05 * noise(P * 0.8 + t * 0.2)) * alertBoost;` Colour shifts to red on detection.

### 8.10 Rim term (Aura Clash team identity) — owner PRD 04 (`rim` material option)

`emissive += rimColor * rimIntensity * pow(1.0 - saturate(dot(N, V)), rimPower) * (0.4 + 0.6 * saturate(dot(N, -L_key)));` Applied after textures, so
albedo and MR maps survive (replaces the tint at `AuraClashArenaApp.ts:3371-3425`).

## 9. Rendering changes

No renderer code is changed by this PRD. Each rebuilt route changes only its rendering configuration:

1. No `lights.ambient`. One shadowed key. `environments.hdri` or a PRD 10 environment preset with `background` per the art direction.
2. No `renderer.pixelRatio` overrides (delete Skyline's 0.7, Aura Clash's `min(DPR, 1.75)`, Rooftop's review 640 px width); DPR comes from the tier.
3. No `effects.antiAlias({ mode: "fxaa" })` stacked on MSAA (17 routes today); AA is the PRD 03 tier default.
4. Bloom: threshold ≥ 1.0 in linear HDR, knee ≤ 0.2, intensity from the art direction; emissive values authored in HDR (2–8 for lights and signs,
   ≤ 0.1 on base materials). Remove emissive used as fill light (Deep Recovery rock 0.26–0.46, Mech emissive strips 0.42–2.35, Gallery light-pool discs).
5. Fog authored in world units with the art direction's visibility distance (e.g. Turbo ~0.02, Courier ~0.03 at scene scale); one fog node per scene.
6. `castShadow: false` on backdrops, sky plates and distant scatter; no parked nodes far from the play area (PRD 09 FX layer hides instead of parking).
7. Draw budget per tier enforced by `pnpm check:art-direction` against `diagnostics().drawCalls`.

## 10. Migration plan

1. **Per game branch** `rebuild/<id>` from `main`; one agent owns one game. The rebuild happens in place in `apps/<dir>` (URLs unchanged).
2. **Preview, not production:** every PR deploys a Vercel preview of the route; capture runs with PRD 12 `--pr-build`. Production keeps the old build
   until acceptance.
3. **Showcase visibility:** at Wave 0 every game is set to `qualityGate.status: "in-rebuild"` and `publicShowcase: false` (no exceptions; §7.4 makes
   `publicShowcase: true` require `accepted`, and `check:route-health` enforces it). `apps/showcase-index` lists in-rebuild games only in a separate
   "In development" section with no quality claims and no thumbnail taken from a review capture; that section is not a public-showcase listing.
4. **Swap:** merge to `main` after acceptance; production deploy follows `/Users/gurbakshchahal/AuraOne/AuraOne-Deploy-Final-PERMANENT.md`
   for any AuraOne-hosted target (this PRD does not define deployment). Tag the pre-rebuild commit `pre-rebuild/<id>`.
5. **Assets:** promoted assets (§2.4) move to the shared library first; synth release assets are re-tagged `greybox` in the same PR that removes
   their visible use; byte deletion of unused GLBs happens in Phase 6 after all consumers are gone.
6. **Kits** are built during the first wave that needs them and admitted before the consuming game starts.

## 11. Backward compatibility

- Route URLs are unchanged. `vercel.json` rewrites (`/showcase/aura-clash/:path*`) are kept.
- Removed query params are ignored with a console warning (PRD 09), not errors, so old links still load the game.
- `localStorage` best scores, ghosts and settings: keys are versioned (`a3g:<route>:<key>:v2`); v1 values are read once and migrated where the rules did
  not change (Turbo laps, Aurora best runs, Neon best score); invalidated where physics tuning changes results (Bank Shot rolling resistance, Patrol
  stall model, Siege one-scene flow), with a one-time "records reset" toast.
- Legacy evidence globals stay as aliases for one release (PRD 09 §6.5), so `tools/showcase-library/*` gates keep running during migration.
- Input bindings are unchanged unless a plan says otherwise (Gravity Post gains Enter launch; Gallery facing; nothing is removed).

## 12. Dependencies on other PRDs

| Game(s) | Blocking (must be merged and green on its benchmark scenes) | Soft (improves target, not blocking) |
|---|---|---|
| All (Wave 0) | 01 (DPR, exposure, HDR, blend), 02 (ambient + IBL, shadow 1, fit, spot priority), 03 (bloom, AA), 04 (tint keeps maps + opacity) | 11 tiers |
| All (Waves 1–4) | 05, 08, 09, 11, 12 | 13, 15 |
| Bank Shot | 02 spot shadows, 04 sheen/clearcoat | 07 volumetric spot |
| Turbo Drift | 02 CSM + instanced casters, 07 particles/trails, 10 spline road + terrain + scatter | 03 speed streaks |
| Aura Clash | 01 side-view preset HDR, 02 skinned casters + SSR, 04 rim, 06 skinned shadows, 07 flipbooks/rain | 10 kit |
| Orbital Defense | 01 tessellation + additive, 04 planet/atmosphere presets, 07 particles, 13 arena-shooter template | — |
| Vault Breakers | 02 area/spot key, 04 transmission plastics | 07 trails |
| Rooftop Buckets | 06 skinned playback + shadows, 07 ribbon, 10 skyline kit | 02 SSR court |
| Courier Rush | 01 context-loss restore + scene-graph scale, 02 SSR + clustered lights + CSM, 07 rain, 10 city kit | 11 batching |
| Neon Swarm | 02 SSR + instanced casters, 04 grid floor, 07 particles | 06 player locomotion |
| Pulse Tunnel | 07 sky gradient + particles, 02 planar/SSR | 10 spline tunnel |
| Siege Golf | 10 terrain + scatter, 07 debris/dust | 02 CSM |
| Patrol Wing | 10 ocean + terrain, 07 clouds + trails, 02 CSM | 03 heat haze |
| Aurora Lander | 07 aurora + particles, 10 terrain extension, 04 tint opacity | — |
| Gravity Post | 04 planet/atmosphere, 07 ribbons, 11 instancing | 10 space preset |
| Deep Recovery | 07 underwater fog + god rays + snow, 10 underwater preset + terrain, 02 attached shadowed spot | — |
| Skyline Runner | 06 rig/playback, 07 snow + per-act fog | 10 parallax backdrop |
| Blockfall Reactor | 01 crease normals, 02 rect area light + instanced casters, 07 bursts | — |
| Mech Hangar | 06 mech rig + IK, 02 per-scene lights | 07 smoke |
| Gallery Shift | 06 empty-pose fix (C16), 02 ≥ 2 shadowed spots + clustered lights, 07 cones | 04 glass transmission |

## 13. Implementation phases

1. **Phase 0 — Program infrastructure.** `@aura3d/game/art` types and validator; `games.json` acceptance fields; scorecard builder; human-review form;
   `check:art-direction`, `check:route-health`; reference boards and art direction contracts drafted for all 18 and approved by a human.
   *Entry:* Phase 0 row of §6.5.
   *Exit:* 18 `art/direction.ts` files validate; the scorecard builder, fed the fixture `tests/fixtures/quality-gate/run-37289688772.panel.json`
   (research/21 visual scores and research/20 non-visual scores transcribed verbatim into a PRD 12 `PanelRoundRecord`), writes 18 `rejected`
   scorecards whose per-category values equal `_sections/B` §1 exactly (rounding ±0.05); a fixture route with an ambient light fails `check:art-direction`;
   the Courier black-frame fixture fails `canvasBlankCheck`.
2. **Phase 1 — Wave 0 re-baseline.** After the Wave 0 engine set (§6.5) merges: delete debug/marketing UI, dead modules, capture forks and hidden
   legacy nodes in all 18; fix the P0 correctness bugs (Gallery facing, Bank rotation, Gravity keyboard launch, Skyline lives, Turbo label, Pulse
   mobile canvas, Siege scene rebuild, Deep volumetric fog, Courier draw count); no art changes. Re-capture and judge.
   *Exit:* 18 round-0 scorecards committed; per-game delta vs research/21 recorded; 0 console/page errors on all 18; the five P0 performance
   fixes measured on the runner at 1920×1080 (Deep Recovery p50 ≤ 50 ms per PRD 11's interim exit, Siege p95 ≤ 50 ms, Courier and Gravity
   ≤ 300 draws, Blockfall hidden nodes gone); the full PRD 11 §17.2 gate is recorded for every game and enforced only after PRD 11 forced-Medium lands;
   games still failing it are listed by name in their scorecard `findings[]` with the wave that fixes them.
3. **Phase 2 — Pilots (Wave 1).** Bank Shot, Turbo Drift, Aura Clash, Orbital Defense rebuilt per §6.9.1–6.9.4; kits K1 (subset), K2, K3, K4, K5 (subset),
   K7 (subset), K8, K9 admitted.
   *Exit:* ≥ 3 of 4 pilots accepted (§6.3); a written pilot retrospective (what engine gaps blocked, which defaults were still wrong) filed as issues
   against PRDs 01–13; PRD 13 templates updated from the pilot code.
4. **Phase 3 — Wave 2.** Vault, Rooftop, Courier, Neon, Pulse, Siege. *Exit:* ≥ 5 of 6 accepted; the sixth either accepted in round 2 or withdrawn (each withdrawal counts against §21's fleet limit of 3).
5. **Phase 4 — Wave 3.** Patrol, Aurora, Gravity, Deep. *Exit:* all 4 accepted or withdrawn after round 2.
6. **Phase 5 — Wave 4.** Skyline, Blockfall, Mech, Gallery. *Exit:* all 4 accepted or withdrawn after round 2.
7. **Phase 6 — Fleet sign-off and regression lock.** Golden captures of every accepted game registered with PRD 12 G-REG; perf budgets in CI;
   unused GLBs deleted; legacy evidence aliases removed. *Exit:* fleet criteria §21 met on one commit; two consecutive green capture runs.

## 14. Task checklist

### 14.1 Phase 0 — infrastructure

- [ ] Create `packages/game/src/art/index.ts` exporting `GameArtDirection`, `GameVisualCategory`, `ArtAssetRole`, `defineArtDirection`, `auditArtDirection`
      (§7.1); add `./art` to `packages/game/package.json` exports. Test `packages/game/src/art/art.test.ts`: one failing fixture per validator rule
      (fewer than 3 references, `fill: "ambient"`, hero without `minTriangles`, `textureSet: "BC"` on a hero, 2 shadowed directionals) and one passing fixture.
- [ ] Add test `packages/game/src/art/categories.test.ts` asserting `GameVisualCategory` equals `GAME_VISUAL_CATEGORIES` from `tools/quality-gate/src/types.ts`.
- [ ] Implement `auditArtDirection(direction, snapshot)` reading `app.diagnostics()` lights, environment, model stats and draw calls; unit test with a
      synthetic snapshot containing `hasAmbient: true` and an unlit 4-tri model returns `ambient-light` and `asset-unlit-card`.
- [ ] Add `scripts/check-art-direction.mjs` + `pnpm check:art-direction --routes <ids>`: builds each route, mounts it headless on the remote browser lane,
      runs `auditArtDirection`, exits 1 on any violation. Fixture route `tests/fixtures/art-direction/ambient-route/` must fail.
- [ ] Add `scripts/check-route-health.mjs` + `pnpm check:route-health`: fails when `publicShowcase: true` and `qualityGate.status !== "accepted"`, or
      `acceptedBy` is empty, or free-text `claim`/`systems` fields remain. Fixture tests under `tests/unit/scripts/check-route-health.test.ts`.
- [ ] Extend `tools/quality-rebuild-capture/games.json` entries with `wave`, `rebuildTier`, `artDirection`, `requiredConditions`, `canvasBlankCheck`,
      `acceptance`, `budgets` (§7.2) for all 18; validate in `capture-games.mjs` `validateGames()` (fail on missing fields).
- [ ] In `capture-games.mjs`, evaluate each `requiredConditions[i].expr` in page context before the named shot; on timeout record verdict
      `capture-failed` with the expression and last beacon state. Unit test with a stub page.
- [ ] In `capture-games.mjs`, compute `canvasBlankCheck` on the canvas bounding rect with `hudSelectors` masked; a frame with dark fraction ≥ 0.9 and
      < 2,000 colours fails even if `likelyBlank` is false. Regression fixture: Courier Rush 1920 `03-mid` from run 37289688772 (meanLuma 1.7,
      darkFraction 0.968) must fail.
- [ ] Add `tools/quality-gate/src/scorecard.ts` (§7.3) with `buildScorecard(runId, panelRecord, humanForms)` and `verdict(scorecard, acceptance)`;
      tests: all-7 vision + all-7 human → accepted; one critical category at target − 0.5 → rejected; missing human notes → throws.
- [ ] Add `tools/quality-gate/forms/human-review.schema.json` and a static form page `tools/quality-gate/forms/index.html` that exports the `human[]`
      entry JSON (no network calls).
- [ ] `.github/workflows/quality-rebuild-capture.yml`: matrix over `games.json` ids filtered by changed paths (`apps/<dir>/**`), PR-build mode (PRD 12),
      artifacts `evidence/games/<id>/<run>/` retained 30 days; job summary links the contact sheet.
- [ ] Write `apps/<dir>/art/direction.ts` and `apps/<dir>/art/references/references.json` (≥ 3 entries) for all 18 games from §6.9; human approval
      recorded as a PR review on each file.
- [ ] Seed `apps/<dir>/art/scorecards/c08d8acb.json` for all 18 from research/20/21 data with `verdict: "rejected"` (baseline).

### 14.2 Phase 1 — Wave 0 (all 18; one PR per game)

- [ ] All routes: delete every `URLSearchParams(...).get("capture") === "review"` branch (395 total, research/16) keeping the play value; run
      `pnpm check:capture-parity --fail-on-any` (PRD 09) → 0.
- [ ] All routes: delete `lights.ambient(...)` calls and add the art direction's `environments.hdri(...)`/preset; for routes whose K1 HDRI is not yet
      admitted use PRD 02's neutral default environment.
- [ ] All routes: delete `effects.antiAlias({ mode: "fxaa" })`, `renderer.pixelRatio` overrides, `effects.contactOcclusion` dead nodes, and duplicate bloom
      nodes (Gravity Post keeps one of `neonBloom`/kit `bloom`, `main.ts:281`).
- [ ] Aura Clash: delete `rendering/GamePostProcess.ts`, `rendering/GameLighting.ts`, `rendering/HitSparkVfx.ts`, `fighters/AuraBurstDirector.ts`, and the six
      roster GLB references; evidence must no longer report `bloomIntensity: 0.58` (`GamePostProcess.ts:62-77`).
- [ ] Blockfall: delete `createLockedBlockNodes` and its probe (`main.ts:763-826`); replace ~80 digit `text3D` nodes with one node per score field.
- [ ] Bank Shot: in `syncVisuals` (`main.ts:741-745`) set ball rotation from the Rapier body quaternion; unit test in `tests/` that a ball rolling 1 m along
      +x rotates ~`1 / r` rad about z; delete `.evidence-strip` markup and `styles.css:105`.
- [ ] Gallery Shift: in `syncCharacterVisuals` (`main.ts:1353-1357`) apply `setRotation(0, yaw, 0)` with yaw from movement direction, slerp halflife 0.08 s;
      unit test: moving +x for 10 frames yields yaw within 5° of π/2. Delete the Rapier/LOS evidence strip (`main.ts:347-351`) and guard route telemetry
      (`:1231-1241`).
- [ ] Gravity Post: call `steerKeyboardAim` and `launchActiveAim` from the input update (`main.ts:1447-1461`); bind Enter to launch; browser test: keyboard-only
      launch changes pod state to `in-flight`. Replace per-frame `renderHud` `innerHTML` (`:2378`) with HUD kit bindings.
- [ ] Orbital Defense: replace per-frame `innerHTML` HUD (`main.ts:313,341-377`) with HUD kit; delete "Checksum"/"Systems" output and the `:74` claim.
- [ ] Siege Golf: replace `app.setScene(buildHoleScene(...))` in `applyCameraPhase` (`main.ts:975-985`) with one scene per hole and a camera rig switch;
      browser test: p95 frame interval across a full shot ≤ 50 ms on the runner at 1280×720; delete the debug sliders (`main.ts:111-117`).
- [ ] Deep Recovery: delete `effects.volumetricFog` (`main.ts:280-285`); attach searchlight and headlight nodes to the sub in `syncVisualNodes`; set camera
      smoothing 0.15; runner test: 1920×1080 p50 ≤ 33 ms.
- [ ] Courier Rush: consolidate static city meshes and instance traffic headlights to ≤ 300 draws (`diagnostics().drawCalls`); cue `engine` and
      `ambient-city` loops (`courier-audio.ts:105-106`); delete traffic overrides (`main.ts:391-398`).
- [ ] Pulse Tunnel: make the canvas 100dvh full-bleed and anchor the HUD; browser test on 390×844@3: canvas CSS size equals viewport ± 1 px.
- [ ] Skyline Runner: fix the lives counter so `lives === 0` ends the run; delete `pixelRatio: 0.7` and `guideVisibility: "public"` (`main.ts:1960-1971`);
      delete the floating tree slab.
- [ ] Turbo Drift: fix the "GGhost OFF" label string in `hud.ts`; delete the 92 `visualCaptureCamera` branches and capture-only mounts.
- [ ] Rooftop Buckets: stop per-frame `setMaterial` (`main.ts:1184,1223,1239`); move audio from `new Audio` (`buckets-audio.ts:44-48`) to `createGame` sound.
- [ ] Mech Hangar: load `mechHeroDecimated` once; remove parked nodes at y=-60/-70 (`main.ts:200,228,247`); delete the asset-passport panel.
- [ ] Neon Swarm: apply `cameraDirector` output to the camera (delete `void cameraState`, `main.ts:1667-1671`); mount `game.fx` so the 7 spawns render.
- [ ] Patrol Wing: delete the evidence strip (`main.ts:136-140`); keep throttle in the v2 capture timeline so rings appear in 03–05.
- [ ] Aurora Lander: delete "PROTOTYPE" sidebar and luma-chasing emissive nudges (`main.ts:594-597`); v2 timeline completes a landing.
- [ ] Re-capture all 18 on the runner; judge with the PRD 12 panel; commit round-0 scorecards; record per-category deltas vs research/21 in each scorecard
      `findings[]`.

### 14.3 Phase 2 — pilots

Bank Shot
- [ ] Admit K4 pool-hall set and K1 pool-hall HDRI via `aura3d assets admit` with look-dev turntables; record licences.
- [ ] Replace `src/environment.ts` primitives with `src/scene/world.ts` mounting the K4 set; delete the 16 `ball-shadow-NN` cylinders (`main.ts:234-247`).
- [ ] Re-author 16 balls on one 1k atlas (numbers/stripes), table ≥ 20k tris with UVs, cue ≥ 3k tris; update `aura.assets.json` roles.
- [ ] `src/scene/lighting.ts`: one `lights.spot({ shadow: true, angle: 0.75, penumbra: 0.5 })` over the table; delete the rim directional and three tinted rim points.
- [ ] `src/scene/materials.ts`: felt sheen 0.6 + fibre normal; walnut clearcoat 0.8; ball clearcoat 1.0 roughness 0.05.
- [ ] `src/scene/camera.ts`: `rigs.orbit` aim rig bound to aim yaw, 0.4 s blend to roll view; browser test: ball subject fraction in aim view 0.08–0.2.
- [ ] Cue strike animation (pull-back ∝ power, 80 ms stroke); pocket drop 6 cm over 120 ms; chalk puff + break dust via `game.fx`.
- [ ] K8 billiard cues with impact-speed gain/pitch mapping; unit test: two clacks at speeds 1 and 4 m/s differ by ≥ 6 dB.
- [ ] Juice map in `createGame({ juice })`: `break` (trauma 0.25, hit-stop 30 ms), `eight-ball` (slow-mo 0.5× 0.6 s).
- [ ] Capture, judge, commit round-1 scorecard.

Turbo Drift Circuit
- [ ] Build the circuit with PRD 10 spline road from the existing centreline data; asphalt, racing-line mask and kerb decals; delete `turboCircuitEnvironmentV2` visual use.
- [ ] K3 terrain splat around the track; ~1,200 instanced trees with LODs; mountain impostor ring; delete the 500-unit ground and `#df967d` clear.
- [ ] Admit hero car ≥ 30k tris with separate wheels; wheel spin/steer and body roll spring in `src/scene/car-visuals.ts`; unit test: roll angle sign matches lateral acceleration.
- [ ] Sun directional aligned to HDRI sun; CSM 3 cascades; delete points and ambient; browser test: car shadow occupies ≥ 30 px at 1920×1080 chase view.
- [ ] `rigs.chase` per §6.9.2; delete composition-gate tuning (`main.ts:2696-2700`).
- [ ] Tyre smoke (emission ∝ slip) and ribbon skids via PRD 07; delete `driftParticleCloud` and box decals; delete the drift ellipse.
- [ ] K8 `car-sport` engine layers via `sound.engine`; skid loop ∝ slip; unit test: RPM 3,000→7,000 raises playback rate monotonically.
- [ ] Racing HUD (tach, gear, lap, position, minimap) on the HUD kit; `src/main.ts` ≤ 600 LOC.
- [ ] Capture, judge, commit round-1 scorecard.

Aura Clash Arena
- [ ] Switch the side-view preset to rgba16f + ACES (PRD 01 change verified in the route via `diagnostics().appliedLook`).
- [ ] Set `arenaScale = 1.0`, recompose the fight plane and camera bounds; restore `Prop_ACUnit_*`/`Prop_Bollard_*` as foreground layer (`:872-877`).
- [ ] Remove fighter material overrides in `collectFighterFlashMaterials` (`:3371-3425`); add PRD 04 rim per team; keep the victim-flash pulse.
- [ ] Replace per-fighter point keys (`:920-952`) with spot key + rim directional + 2 neon practicals; K1 night-city HDRI.
- [ ] `rigs.fighting` with `subjectHeightFraction: 0.5`, fov 32; browser test: fighter bounding box height 45–60% of frame in `03-mid`.
- [ ] Hit VFX (flipbook + 0.08 s point light + ring + landing dust), dash trail, rain 1,500/400, SSR floor.
- [ ] Shell: full-bleed canvas, HUD kit health bars/timer/portraits, self-hosted Saira; delete nav, prose cards, control strip.
- [ ] Music, announcer and crowd bed through K8; replace rival walk clip.
- [ ] Capture, judge, commit round-1 scorecard.

Orbital Defense
- [ ] Generate the route from the PRD 13 arena-shooter template; move wave/heat/shield logic to `src/gameplay/waves.ts` with existing behaviour covered by a unit test (spawn cadence 1.8 s, shield segments 5).
- [ ] Planet with `material.planet` + `material.atmosphere` (§8.1) and K5 maps; starfield HDRI; asteroid belt 300 instances.
- [ ] Admit station, interceptor and two drone GLBs (≥ 5k tris each, PBR).
- [ ] Bolts, explosions (3 sizes), shield ripple, muzzle flash via `game.fx` + PRD 07; hit-stop 40 ms on multi-kill.
- [ ] Camera 25–35° above the plane, planet 65–75% of frame height; HUD safe areas keep drones outside panels (browser test on 1920×1080 and 390×844).
- [ ] K8 audio set + music; capture, judge, commit round-1 scorecard.

### 14.4 Phases 3–5 — per game (each game is one epic; tasks map to §6.9 bullets)

- [ ] Vault Breakers: promote `vaultBreakersCabinet` and `vaultBreakersFlipperReal` into `src/scene/world.ts`; author the 4k playfield texture on a UV'd
      plane aligned to `table.ts` physics plane (test: insert positions in texture space match `missions.ts` insert coordinates within 2 mm); chrome ball
      material without emissive; instanced insert lamps driven by mission state; DMD backglass; K8 pinball cues.
- [ ] Rooftop Buckets: render `rooftopLayupScorer`/`rooftopDefender` with clips in play (delete the `?debug=animation` gate, `main.ts:502-536`); open
      skyline with K1/K2; glass backboard + rim + vertex-animated net; arc ribbon; shoulder rig; delete unused athlete GLBs.
- [ ] Courier Rush: K2 modular city replacing `city.block` and `city.ts` boxes; van with separate wheels; IBL + SSR wet road; rain particles;
      `rigs.chase` at ~6 m/12°; mobile HUD ≤ 15% of screen (browser test measures HUD rect area / viewport).
- [ ] Neon Swarm: SSR plaza + `material.gridFloor`; rigged K6 player with run/strafe/fire; 2–3 drone meshes; `rigs.topDown` with director layers;
      replace 272k-tri lamps; delete card assets.
- [ ] Pulse Tunnel: segment conveyor for rings/pylons/rocks (unit test: segment recycling keeps ≤ N live segments); `sky.gradient` synthwave; chase rig with
      FOV kick and roll; ship review-only VFX to play; 1–2k linear-mipmapped textures; delete `art-review/`.
- [ ] Siege Golf: K3 terrain + castle kit; K1 golden-hour HDRI; restore crate/plank maps; aim/flight/settle rigs with blends; splinter debris; delete
      `siegeGolfCourseWorld` visual use and the 26 spheres.
- [ ] Patrol Wing: `world.water({ mode: "ocean" })`; island heightfield ≥ 128 with splat; HDRI sun-aligned key + CSM; `rigs.flight`; stall model in
      `flight.ts` (unit test: at throttle 0 and level attitude airspeed never drops below `minAirspeed` without altitude loss); contrails; drones ≥ 5k.
- [ ] Aurora Lander: `effects.auroraRibbon` (§8.2); extended triplanar terrain with horizon skirt; textured lander; nozzle light ∝ thrust; GPU plume, dust
      and snow; `rigs.altitude` (browser test: pad inside frame in 100% of 03/04 shots); translucent ghost.
- [ ] Gravity Post: instanced stars/dust/beads (≤ 120 draws); K5 planets ≥ 32k tris with `material.atmosphere`; sun point light; K7 craft; ribbon flight path;
      follow-and-zoom camera; restore dock gate maps.
- [ ] Deep Recovery: underwater stack (§8.3); heightfield seabed + instanced rocks/coral + textured wreck; textured sub with propeller; emissive cut 3–5×;
      `GameSoundEngine` with `underwater` reverb; delete `environment.ts`.
- [ ] Skyline Runner: rig and animate `skylineHeroRunner`; textured platform kit; parallax-cut backdrop; one mounted act rig at a time; per-act fog;
      snowfall; delete card assets and `lights.studio`.
- [ ] Blockfall Reactor: lit 3D arcade room; re-textured cabinet without occluders; crease normals on `BLOCK_TILE_GEOMETRY`; tilted drifting camera;
      lock flash, hard-drop trail, clear bursts; sampled stems and SFX.
- [ ] Mech Hangar: rigged animated mechs (walk/strike/recoil/hit/KO); hangar kit; split hangar/pit scenes via `game.setScene`; per-scene rigs; combat VFX;
      sampled audio.
- [ ] Gallery Shift: PRD 06 empty-pose fix verified in route (browser test: thief bone transforms change between frames while walking); textured
      museum + exhibits + glass; K6 thief and guards; following shadowed flashlights; vision cones (§8.9); follow camera; delete harnesses and labels.
- [ ] For each game above: capture, judge, commit scorecard; on rejection, file findings and run round 2.

### 14.5 Phase 6 — fleet lock

- [ ] Register accepted captures as PRD 12 goldens (`tools/quality-gate` golden manifest) for every game and viewport.
- [ ] Delete GLBs no longer referenced by any route (`aura.assets.json` entries with 0 consumers), including synth release models and the 82 MB
      `apps/showcase-pulse-tunnel/art-review/`.
- [ ] Remove PRD 09 legacy evidence aliases from all 18 routes.
- [ ] Update `apps/showcase-index` to list accepted games with their scorecard date; withdrawn games removed from the index.

## 15. Test requirements

- **Unit (Vitest, runs in `.github/workflows/test.yml` on ubuntu):** art-direction validator rules; scorecard verdict logic; games.json field
  validation; `requiredConditions` evaluator; canvas blank check against the Courier black-frame fixture; per-game gameplay tests named in §14
  (ball rotation, thief facing, keyboard launch, stall model, segment conveyor, wave cadence, engine RPM mapping, impact-speed audio mapping). Existing
  gameplay unit tests in each kept module must pass unchanged, or their changes must be listed in the PR.
- **Browser (Playwright, remote only — GH Actions `macos-14`, ANGLE Metal, per policy; never local):** per game: boot to `session.state === "playing"`
  via the PRD 09 beacon; 0 console/page errors over a 60 s scripted timeline; `lookSignature` equal between default and every scenario URL; framing
  assertions named in §14 (subject fraction, pad in frame, HUD area on mobile); keyboard-only and touch-only playthrough of the first objective;
  `visibilitychange` pauses the session; context-loss simulation via `WEBGL_lose_context` shows the recovery UI and restores rendering (Courier first,
  then all).
- **Capture + judge (macos-14):** `quality-rebuild-capture.yml` per changed game on every PR; full fleet nightly on `main` once Phase 1 lands.
- **Audio:** `GameSoundEngine` evidence section shows every cue in the art direction as `provenance: "sample"`; no synth cues (PRD 09 §6.8).

## 16. Visual acceptance tests

| Game | Benchmark scenes that must pass PRD 12 G-REF before the game enters review (Aura ≥ three − 0.5) | Game shots (games.json) | Reference | Criterion and threshold | Review |
|---|---|---|---|---|---|
| Bank Shot | 04 clearcoat, 07 sheen, 10 indoor, 12 shadows | 02-opening rack, 03-aim, 04-break, 05-pocket | art/references + research/21 Bank Shot | §6.3; shadows ≥ 8, materials ≥ 8, lighting ≥ 8 | vision + 3 humans |
| Turbo Drift | 09 outdoor, 12 shadows, 14 particles, 17 large env | 02-grid, 03-straight, 04-drift (smoke visible) | same | env ≥ 7.5, shadows ≥ 7.5, VFX ≥ 7 | vision + 3 humans |
| Aura Clash | 08 skinned, 12 shadows, 14 particles, 15 animation | 02-round-intro, 03-exchange, 04-hit (during hit-stop) | same | light ≥ 7.5, VFX ≥ 7.5, anim ≥ 7.5, camera ≥ 7.5 | vision + 3 humans |
| Orbital Defense | 13 IBL only, 14 particles | 02-wave-1, 03-mid, 04-kill (explosion visible) | same | env ≥ 7, assets ≥ 7, VFX ≥ 7.5 | vision + 3 humans |
| Vault Breakers | 04 clearcoat, 05 transmission, 13 IBL | 02-plunge, 03-play, 04-bumper-hit | same | assets ≥ 7.5, materials ≥ 7.5 | vision + 3 humans |
| Rooftop Buckets | 08 skinned, 09 outdoor, 15 animation | 02-ready, 03-release, 04-make | same | env ≥ 7, anim ≥ 7 | vision + 3 humans |
| Courier Rush | 11 multiple lights, 17 large env, 14 particles | 02-depot, 03-street (no black canvas), 04-drop | same | env ≥ 7, IBL ≥ 7, atmo ≥ 7 | vision + 3 humans |
| Neon Swarm | 11 multiple lights, 14 particles, 16 instancing | 02-wave, 03-mid, 04-kill | same | env ≥ 7, VFX ≥ 7.5, juice ≥ 7.5 | vision + 3 humans |
| Pulse Tunnel | 13 IBL, 14 particles | 02-launch, 03-run, 04-gate-pass; mobile 03 | same | post ≥ 7.5, camera ≥ 7, mobile ≥ 6.5 | vision + 3 humans |
| Siege Golf | 09 outdoor, 12 shadows, 18 game scene | 02-tee, 03-flight, 04-topple | same | env ≥ 7.5, assets ≥ 7 | vision + 3 humans |
| Patrol Wing | 09 outdoor, 13 IBL, 17 large env | 02-pad, 03-airborne (rings in frame), 04-drone-hit | same | env ≥ 7.5, camera ≥ 7.5, atmo ≥ 7.5 | vision + 3 humans |
| Aurora Lander | 09 outdoor, 14 particles | 02-descent, 03-approach, 04-touchdown | same | env ≥ 7, atmo ≥ 7.5 | vision + 3 humans |
| Gravity Post | 13 IBL, 16 instancing | 02-board, 03-aim, 04-flight | same | lighting ≥ 7 | vision + 3 humans |
| Deep Recovery | 09 outdoor (fog), 12 shadows, 14 particles | 02-shallows, 03-descent, 04-wreck | same | lighting ≥ 7, atmo ≥ 7.5, perf ≥ 7 | vision + 3 humans |
| Skyline Runner | 08 skinned, 15 animation | 02-act-1, 03-jump, 04-act-3 | same | anim ≥ 7 | vision + 3 humans |
| Blockfall Reactor | 10 indoor, 16 instancing | 02-board, 03-stack, 04-line-clear | same | VFX ≥ 7, camera ≥ 7, juice ≥ 7.5 | vision + 3 humans |
| Mech Hangar | 08 skinned, 10 indoor, 15 animation | 02-hangar, 03-pit, 04-strike | same | assets ≥ 7.5, anim ≥ 7 | vision + 3 humans |
| Gallery Shift | 10 indoor, 12 shadows, 08 skinned | 02-lobby, 03-sneak (cone visible), 04-alert | same | lighting ≥ 7.5, shadows ≥ 7, anim ≥ 7 | vision + 3 humans |

Each shot is captured at 1920×1080, 1280×720 and 390×844@3 (mobile stops after `03-*` per `games.json` defaults). Every judged frame is a player frame:
no scenario overrides of look (PRD 09 §6.4); scenarios may only set state, clock, seed and camera pose for deterministic stills.

## 17. Performance budgets

Engine budgets per tier are PRD 11 §17.1 (GPU 12/16 ms p50/p95 Medium–Ultra; Low 28/33 ms mobile; engine CPU 5/8 ms; draws ≤ 150/300/600/1,500;
GPU memory ≤ 256 MB/512 MB/1 GB/2 GB). This PRD adds the game share and the content budgets:

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Target frame rate | 30 mobile / 60 desktop | 60 | 60 | 60 (120 if display allows) |
| Game logic CPU (gameplay + physics step + HUD), p95 | ≤ 4 ms | ≤ 4 ms | ≤ 4 ms | ≤ 4 ms |
| Draw calls per game scene (incl. shadow passes) | ≤ 150 | ≤ 300 | ≤ 500 | ≤ 1,000 |
| Live particles per game | ≤ 1,000 | ≤ 4,000 | ≤ 12,000 | ≤ 40,000 |
| Transfer to playable (compressed assets + JS) | ≤ 8 MB | ≤ 15 MB | ≤ 30 MB | ≤ 45 MB |
| Streamed after playable (music, far LODs) | ≤ 10 MB | ≤ 20 MB | ≤ 40 MB | ≤ 60 MB |
| Time to playable on reference network (50 Mbps, 40 ms RTT) | ≤ 4 s | ≤ 4 s | ≤ 6 s | ≤ 8 s |
| GPU texture memory per game (KTX2 resident) | ≤ 128 MB | ≤ 256 MB | ≤ 512 MB | ≤ 1 GB |
| Decoded audio resident | ≤ 10 MB | ≤ 16 MB | ≤ 24 MB | ≤ 24 MB |
| Route JS chunk (gzip, excluding engine and `@aura3d/game`) | ≤ 80 KB | same | same | same |
| Total critical-path JS (gzip) | ≤ 650 KB today (engine root 575 KB, `BUNDLE_SIZES.md`); ≤ 400 KB after PRD 15 | same | same | same |
| Mobile | primary phone tier; landscape for vehicle/fighting games; touch preset mandatory | flagship phones | not auto-selected on phones | never on phones |

Runner gate: PRD 11 §17.2 (1280×720 p50 ≤ 20 ms, p95 ≤ 34 ms; 1920×1080 p50 ≤ 33 ms, p95 ≤ 50 ms; 390×844 p50 ≤ 33 ms; 0 readbacks; ≤ 300 draws),
for all 18 games, two consecutive runs. Today 13 games fail it (§1). Per-game current → required (1920×1080 runner; current = 1000 / mean fps from `report.slim.json`, required = p50): Deep Recovery 1,917 ms → ≤ 33;
Gravity 156 → ≤ 33; Siege 141 → ≤ 33 and p95 1,100 → ≤ 50; Courier 141 → ≤ 33; Rooftop 132 → ≤ 33; Mech 108; Blockfall 102; Gallery 99; Aura Clash 90;
Skyline 88; Bank 67; Patrol 63; Turbo 51; Pulse 43; Neon 39 → all ≤ 33; Aurora, Vault, Orbital must stay ≤ 33 after their scenes get heavier.

Reference devices for the human panel (one per tier minimum): Low — iPhone 11 or Pixel 6a; Medium — MacBook Air M1/M2 and iPhone 13–15; High — MacBook Pro
M1–M3 Pro or RTX 3060 laptop; Ultra — RTX 4070+ desktop. Measured from the beacon's rAF p50/p95 and reported in the scorecard.

## 18. Browser coverage

| Browser | Lane | Required |
|---|---|---|
| Chrome stable (ANGLE Metal on macOS, D3D11 on Windows) | GH Actions macos-14 capture + human panel | all 18, every review round |
| Safari 17+ macOS | human panel; remote WebKit lane (`playwright.audio-webkit.config.ts` pattern, macos-14) | all 18 before acceptance |
| Firefox stable | remote browser-matrix lane (`.github/workflows/browser-matrix.yml`) | boot + 60 s timeline, 0 errors |
| Edge stable (Windows) | human panel, one reviewer | pilots and any game with SSR/CSM |
| WebGPU path | only if PRD 11 selects it for the tier; must match WebGL2 look signature within PRD 12 tolerance | informational until PRD 11 makes it default |

## 19. Mobile coverage

- iOS Safari (iPhone 11 Low, iPhone 13–15 Medium) and Android Chrome (Pixel 6a Low, Pixel 8 / Galaxy S23 Medium), by the human panel on real devices;
  emulated 390×844@3 on the runner for every capture.
- Requirements per game: full-bleed canvas at the tier DPR (never fixed at 1 on 3× screens except Low); touch preset from PRD 09 (`twin-stick`,
  `dpad-2btn`, `aim-drag`, flipper zones for Vault); no keyboard prompts on touch devices (Vault's "HOLD SPACE" today); HUD ≤ 15% of screen area in play;
  orientation guidance for landscape-only games (Aura Clash, Turbo, Courier, Patrol, Mech); audio unlock on the title tap; thermal: 10-minute session
  holds ≥ 27 fps p50 on Low devices.
- Mobile score ≥ 6.5 in every game (fleet 2.5 today).

## 20. Screenshots and evidence required

Per review round per game, committed or attached to the PR:

1. Capture set: every `games.json` shot at 1920×1080, 1280×720, 390×844@3; contact sheet `evidence/games/<id>-contact.jpg`; 5 s video around
   `04-action` (PRD 12 strip capture).
2. `report.json` with rAF p50/p95/p99, draws, console/page errors, `requiredConditions` results, canvas blank check results, look signatures.
3. PRD 12 panel record with vision judgements per viewport and the human entries; `GameScorecard` JSON.
4. Side-by-side: round-0 (Wave 0) frame vs current frame for each shot, and current frame vs the closest reference-board image.
5. Asset look-dev turntables (PRD 05) for every new hero/character/vehicle/enemy asset.
6. Art-direction audit output (`pnpm check:art-direction --routes <id>`) and `pnpm check:capture-parity --fail-on-any --routes <id>`.

## 21. Completion criteria

- All 18 games have `qualityGate.status` `accepted` or `withdrawn`; at least 15 are accepted.
- Every accepted game: vision overall ≥ 7 and "competitive" = Yes; human median ≥ 7, no reviewer < 6; every visual category ≥ 5; critical categories at
  their §6.10 targets; non-visual thresholds of §6.3; PRD 11 runner gate and §17 budgets met; 0 console/page errors; mobile ≥ 6.5.
- Fleet: mean overall ≥ 7.2 across accepted games; no fleet category mean < 6.0.
- Zero `?capture=` look branches (`check:capture-parity --fail-on-any` exits 0), zero `lights.ambient` in game routes, zero visible synthesized hero/world
  assets, zero synthesized audio cues, zero debug/evidence/marketing text in play views.
- PRD 12 goldens registered for every accepted game; two consecutive green fleet capture runs on `main`.

## 22. Rollback considerations

- Each game ships independently; production keeps the previous build until acceptance, and `pre-rebuild/<id>` tags allow a route-level revert.
- If an engine dependency regresses after a game is accepted (PRD 12 G-REG fails on a golden), the engine change is reverted, not the game.
- If a game is accepted and later fails on a real device class (e.g. thermal drop on Low), the tier mapping for that game is lowered (PRD 11 `quality.lock`
  per device class) before any content is cut.
- Withdrawn games are hidden from `apps/showcase-index` and keep serving at their URL with the old build and an "in development" banner; nothing is
  deleted until Phase 6.
- Kit assets are shared: a kit change requires re-capture of every consuming game (consumers listed in §6.4); a kit regression is rolled back by
  pinning the previous asset hash in `aura.assets.json`.

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Engine PRDs land late; games get rebuilt against broken defaults again (the Pulse Tunnel failure) | high | high | Hard entry conditions per wave (§6.5); benchmark G-REF gate before review (§16) |
| Content cost: ~18 hero sets, 9 kits, licensed HDRIs and audio | high | high | Kits shared across waves (§6.4); catalog/CC0 first; Meshy promotion path (PRD 05) for gaps; withdraw games rather than ship weak art |
| Vision judge drift or leniency between rounds | medium | high | Same prompt as research/21; PRD 12 calibration canaries; human panel is co-equal and blind |
| Agents optimise for the judge instead of the player (new form of capture forks) | medium | high | Look-signature equality, player-frame-only capture, human play sessions on own devices, judge receives references not just the frame |
| Performance regresses as content grows (scenes were cheap only because empty: Orbital, Vault) | high | medium | Draw/particle/texture budgets per tier enforced in `check:art-direction`; PRD 11 governor |
| Runner GPU is paravirtual and far below Low class | certain | medium | Runner gate is relative (PRD 11 §17.2); real-device numbers from the human panel are authoritative for tiers |
| Licence errors in admitted assets or HDRIs | medium | high | Per-file licence required at admission (PRD 05); reference images marked "reference-only" are never shipped |
| Shared kit changes break accepted games | medium | medium | Kit consumers re-captured on kit PRs; asset hash pinning |
| Some games cannot reach 7 within two rounds | medium | medium | Explicit withdrawal; completion requires ≥ 15 accepted, not 18 |
| Human reviewer availability | medium | medium | Panel scheduled per wave; review form works offline; one external reviewer minimum |

## 24. Explicitly out of scope

- Engine, renderer, shader-library, asset-pipeline and runtime implementation (PRDs 01–13, 15). This PRD specifies requirements and consumes them.
- New games beyond the 18, and non-game showcases (`showcase-data-galaxy`, `showcase-product-configurator`, `showcase-webgpu-particle-lab`, etc.).
- Gameplay redesign beyond the bugs and tuning named in §6.9 (rules, levels, progression stay as they are).
- Production deployment procedure (governed by `/Users/gurbakshchahal/AuraOne/AuraOne-Deploy-Final-PERMANENT.md` for AuraOne targets).
- Multiplayer, accounts, monetisation, analytics.
- Marketing pages, SEO, README claims (they follow acceptance, not the other way round).
- Local execution of browsers, builds or Docker: all capture, browser tests and heavy builds run on the remote lanes named in §15 and §18.
