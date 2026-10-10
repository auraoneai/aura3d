# Open issue triage — aura3d main @ afb475c2 (2026-10-08)

Source: /tmp/qrfinal/issues.json (195 open). Owner lane is the lane that must make the change. Still-needed legend: Y = confirmed open by reading code on afb475c2; Y? = not spot-checked (assumed open); P = partly done; R / R? = done on main (close it / verify, then close); O = obsolete.

## Counts

| Lane | Issues | Y | Y? | P | R/R? | O | Blocking |
|---|---|---|---|---|---|---|---|
| 01 | 11 | 5 | 5 | 0 | 1 | 0 | 7 |
| 02 | 7 | 2 | 3 | 2 | 0 | 0 | 2 |
| 03 | 4 | 1 | 3 | 0 | 0 | 0 | 2 |
| 04 | 9 | 2 | 7 | 0 | 0 | 0 | 1 |
| 05 | 7 | 1 | 6 | 0 | 0 | 0 | 3 |
| 07 | 10 | 1 | 5 | 4 | 0 | 0 | 1 |
| 08 | 1 | 0 | 1 | 0 | 0 | 0 | 1 |
| 09 | 10 | 2 | 7 | 0 | 1 | 0 | 5 |
| 10 | 2 | 0 | 2 | 0 | 0 | 0 | 0 |
| 11 | 10 | 3 | 5 | 1 | 0 | 1 | 1 |
| 12 | 11 | 3 | 5 | 0 | 3 | 0 | 7 |
| 13 | 12 | 2 | 10 | 0 | 0 | 0 | 1 |
| 14 | 37 | 3 | 32 | 2 | 0 | 0 | 5 |
| 15 | 63 | 37 | 15 | 4 | 6 | 1 | 17 |
| other | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| **total** | 195 | 62 | 107 | 13 | 11 | 2 | 53 |

| Type | Count |
|---|---|
| qr-request | 115 |
| handoff-14 | 35 |
| removal | 17 |
| ccr | 15 |
| fact-13 | 8 |
| other | 5 |

## Blocking a lane's standalone acceptance

Lanes in parentheses are the ones blocked.

- #34 (blocks 10; owner 15): Delete createTerrainTileGrid/createNamedEnvironmentPreset blocks + fix HDRI counts in 3 unit tests (still present); lane-10 Phase-1 test:unit gate
- #46 (blocks 14,12; owner 14): games.json: add scenarios/hudSelectors/qrFlags for all 18 games (partial)
- #47 (blocks 12; owner 14): scorecard/forms consume C-32 GameJudgement + PanelRoundRecord
- #51 (blocks 12; owner 05): Admit 2k CC0 HDRIs (studio/outdoor/night) for benchmark refs
- #52 (blocks 12; owner 05): Admit ground texture set (ref-03) + street kit (ref-04)
- #65 (blocks 14; owner 15): Root scripts batch (check:art-direction etc. absent)
- #68 (blocks 14; owner 05): Host K1-K7/K9 kits in assets/library/kits; K1 at 2k
- #70 (blocks 14; owner 09): game-sfx-core cues for the 18 art directions
- #72 (blocks 14; owner 15): resolveQrFlags route-<id>: flagNameFor still splits sub.length===2 only
- #73 (blocks 14; owner 12): steps/acceptance.mjs missing (only burst/strip/webm)
- #76 (blocks 14; owner 08): Rig factories accept framing.subjectHeightFraction
- #90 (blocks 11; owner 01): FrameStats scopes on shadow/forward passes
- #91 (blocks 11; owner 03): Postprocess guard + target pool + scope wiring
- #92 (blocks 11; owner 12): Harness records engine frame timing + fps agreement
- #94 (blocks 11; owner 01): WebGL2Device invalidateGpuObjects absent
- #97 (blocks 11; owner 12): Harness quality.lock() before shots + per-tier captures
- #98 (blocks 11; owner 12): perf_gate input + windows smoke (workflow_call exists; perf_gate absent)
- #100 (blocks 11; owner 15): compiler/primitives.ts cache/batch/static copy
- #103 (blocks 11; owner 14): games.json tiers flag variants + forced-Medium scenario
- #111 (blocks 11; owner 09): GameAppRuntime.ts:145 still calls createPerformanceGovernor without app.quality
- #113 (blocks 11; owner 01): ForwardPass stop 64-instance chunking
- #115 (blocks 11; owner 02): DepthPass composes depthVariantFeatures (field exists); verify prd11.drawId registered
- #129 (blocks 11; owner 15): C-07 RenderItem.batch?/static? (absent)
- #135 (blocks 10; owner 15): AuraSceneNode union (nodes/types.ts:652) has no world kinds; carve or registry
- #137 (blocks 13; owner 13): Org-side: KIRO_PRISM_API_KEY Actions secret + docs; owner action, not a lane PR
- #146 (blocks 07; owner 15): registry.ts imports every lane but prd07 (and prd12); vfx CLI never registers
- #156 (blocks all; owner 12): Browser Matrix mounted-evidence timeouts are systemic (16/17 specs time out on main per audit); root-cause on main
- #172 (blocks 14; owner 15): Duplicate of #72 (flagNameFor multi-segment)
- #177 (blocks 10; owner 15): packages/engine/assets/world/ still resolves to 15 (CONTRACTS says 10)
- #179 (blocks 11; owner 01): rendering index does not export batching/
- #180 (blocks 11; owner 01): MultiDraw.ts still identity-loops draw(); real WEBGL_multi_draw binding
- #181 (blocks 11; owner 01): DrawSubmit/BVH consume prd11 BatchPlan
- #187 (blocks 10; owner 07): setFog({mode:'absorption'}) in C-21; verify live path from UnderwaterState
- #198 (blocks 11; owner 15): contracts/program.ts exports no allShaderChunks(); blocks lane-11 manifest parity exit
- #204 (blocks 10; owner 15): cityBlock.ts still resolves to 15; reassign to 10 for T5.6
- #207 (blocks 08; owner 03): No post pass reads prd08.screenFeel; lane-08 relies on fallback
- #208 (blocks 08; owner 09): GameAudio PannerNode + occlusion lowpass
- #210 (blocks 08; owner 09): Master limiter + jitter + voice limit
- #212 (blocks 08; owner 09): GameAppRuntime.ts:183 still loop.onFrame->app.step(dt) (no advance/onTick)
- #237 (blocks 07; owner 15): AuraEffectType (types.ts:741) lacks trail/lightCone/auroraRibbon/meshParticles
- #241 (blocks 09; owner 15): runtimeNodes.ts has no InstanceBufferLike accessor
- #245 (blocks 07; owner 01): No float readback on RenderDevice; blocks PRD-07 P3-T1/T3 GPU asserts
- #249 (blocks 10; owner 15): engine package.json has ./lanes but no ./world export
- #252 (blocks 10; owner 02): DepthPass has depthVariantFeatures + alphaTest; confirm prd10.wind consumed
- #259 (blocks 10; owner 04): C-15 honour alphaMode mask/alphaToCoverage/doubleSided
- #263 (blocks 10; owner 12): No LFS rule for packages/engine/assets/world/** in .gitattributes/ci.sh
- #266 (blocks 10; owner 15): resolveQrFlags has no parent->sub default for WORLD_{TERRAIN,WATER,BIOME}
- #271 (blocks 09; owner 11): WebGPUDevice handles device.lost + onDeviceLost listeners; verify listeners fire from lost promise
- #308 (blocks 14,12; owner 14): games.json evidenceGlobal migrated for ~3 of 18 games
- #310 (blocks 09; owner 12): Checkpoint capture-parity + look-signature jobs
- #313 (blocks 07; owner 15): All 15 lane flags still 'dev' in flags.state.ts; promotion gated on a passing §17.1 standalone run
- #340 (blocks 10; owner 15): C-26-world.test.ts still a stub (expect(contracts).toBeDefined())
- #344 (blocks 12; owner 14): No strip/webm steps in games.json timelines

Blockers seen in captures that have no issue filed:

- A3D_QR_STRICT: the benchmark harness `benchmarks/quality-rebuild/aura3d/common.ts:396` passes `renderer: { mode: "production", ... }`, so every Aura scene throws AuraMigrationError. Owner 12, blocks the strict-mode runs for every lane.
- prd05 scenes throw `TypeError: g.color is not a function` from `environments.color(...)` at `aura3d/scenes/prd05/common.ts:74`. Owner 05 or 15 (environments namespace). Blocks lane 05.
- `prd12-ref-06-product-turntable is not active`: the `ACTIVE_SCENE_IDS` gate in `shared/registry.ts:151` rejects it. Owner 12.
- All-flags capture: 12/18 benchmark scenes time out and 6 render black frames with drawCalls 0; 9/9 games crash or never draw. #156 (systemic browser timeouts) and #54 (C-24 beacon) are the closest issues, but neither has a root cause yet. Every lane is blocked until this is fixed.

Issues to close now (done on main, or obsolete): #74, #145, #155, #164, #225, #232, #236, #247, #251, #261, #339
Issues to verify, then close: #161, #211
Issues to close as duplicates or umbrellas: #172 (dup of #72), #314 (dup of #254), #77/#78/#79 (umbrellas; their specific rows are open separately)

## Lane 01 (11)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #36 | [qr-request to:prd01] index.ts exports: drop deprecated tile-grid types, export  | removal | Y | - | - | Drop TerrainTile* type exports (index.ts:727) and export toHeightTexture |
| #90 | [QR-11 Q-01-2] FrameStats scopes on shadow/forward passes (C-28) | qr-request | Y? | 11 | - | FrameStats scopes on shadow/forward passes |
| #94 | [QR-11 Q-01-1] WebGL2Device invalidateGpuObjects + liveVertexArrays (C-28/C-29) | qr-request | Y | 11 | #130 | WebGL2Device invalidateGpuObjects absent |
| #112 | [QR-11 Q-01-3] ProgramGenerator WGSL target delegates to WgslAssembler (conditio | qr-request | Y? | - | - | Optional/conditional: WGSL via WgslAssembler; defer |
| #113 | [QR-11 Q-01-4] ForwardPass: stop 64-instance chunking under C-07 real (C-07/C-02 | qr-request | Y? | 11 | #129 | ForwardPass stop 64-instance chunking |
| #179 | qr-request: export packages/rendering/src/batching/index.ts from rendering barre | qr-request | Y | 11 | #180 #181 | rendering index does not export batching/ |
| #180 | qr-request: webgl2/MultiDraw.ts — real WEBGL_multi_draw_elements_instanced bindi | qr-request | Y | 11 | #179 #181 | MultiDraw.ts still identity-loops draw(); real WEBGL_multi_draw binding |
| #181 | qr-request: forward/DrawSubmit.ts + performance/BVH.ts consumption of prd11 Batc | qr-request | Y? | 11 | #179 #180 | DrawSubmit/BVH consume prd11 BatchPlan |
| #206 | [QR-08 Q-01-1] Optional legacy patch | qr-request | Y? | - | - | Optional legacy camera-fade patch in ShaderLibrary |
| #232 | [QR-09 Q-01-1] C-05 overlay in OutputPass per §8 reference GLSL | qr-request | R | - | #233 | output/OutputPass.ts implements C-05 juice overlay; close |
| #245 | qr-request: expose float readback on RenderDevice for rgba16f GPU asserts (PRD-0 | qr-request | Y | 07 | - | No float readback on RenderDevice; blocks PRD-07 P3-T1/T3 GPU asserts |

## Lane 02 (7)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #96 | [QR-11 Q-02-1] ShadowOrchestration: GPU or disabled point-shadow face path (C-11 | qr-request | Y? | - | - | Point-shadow face path GPU or disabled |
| #114 | [QR-11 Q-02-2] Optional: BVH.queryFrustum for light-frustum caster query (C-11) | qr-request | Y? | - | - | Optional BVH.queryFrustum; defer |
| #115 | [QR-11 Q-02-3] DepthPass: compose registered depth-variant features incl. prd11. | qr-request | P | 11 | #252 | DepthPass composes depthVariantFeatures (field exists); verify prd11.drawId registered |
| #252 | [QR-10] Q-02-1: DepthPass.ts: apply registered C-11 depth features (prd10.wind)  | qr-request | P | 10 | #115 | DepthPass has depthVariantFeatures + alphaTest; confirm prd10.wind consumed |
| #253 | [QR-10] Q-02-2: Accept prd10 sky-capture resolutions (probe.capture.include='sky | qr-request | Y? | - | - | Accept sky-only probe resolutions + iblPixelBacked |
| #254 | [QR-10] Q-02-3: EnvironmentPlatform.ts:395-415: delete createProceduralSkyDome/c | removal | Y | - | #314 | createProceduralSkyDome/createEnvironmentStage still in EnvironmentPlatform + index |
| #314 | [qr-request] to:prd02 — R-02-3: remove `createProceduralSkyDome` at A3D_QR_VFX r | removal | Y | - | #254 | Duplicate of #254 (createProceduralSkyDome), removal window |

## Lane 03 (4)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #91 | [QR-11 Q-03-1] Postprocess guard + target pool + scope wiring (C-28/C-13) | qr-request | Y? | 11 | - | Postprocess guard + target pool + scope wiring |
| #95 | [QR-11 Q-03-2] compiler/postprocess.ts: stop emitting CPU-only passes (C-13/C-21 | qr-request | Y? | - | - | compiler/postprocess.ts stop emitting CPU-only passes |
| #207 | [QR-08 Q-03-1] C-13 post pass reading blackboard `prd08.screenFeel` (`AuraS | qr-request | Y | 08 | - | No post pass reads prd08.screenFeel; lane-08 relies on fallback |
| #315 | [qr-request] to:prd03 — R-03-2: remove `cinematic/{BloomPass,FilmGrainPass,Vigne | removal | Y? | - | - | Delete cinematic/{Bloom,FilmGrain,Vignette,DepthHaze}Pass at VFX removal |

## Lane 04 (9)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #78 | qr-request: R-14-12 — material presets per §8 | qr-request | Y? | - | #80 #83 #84 #88 | Umbrella for material presets; close as dup of specific rows |
| #80 | qr-request: R-14-14 §8.1 — Planet surface, atmosphere, shield (Orbital Defense,  | qr-request | Y? | - | #258 #78 | material.planet/atmosphere/shield |
| #83 | qr-request: R-14-14 §8.4 — Emissive grid floor (Neon Swarm) | qr-request | Y? | - | #78 | material.gridFloor |
| #84 | qr-request: R-14-14 §8.6 — Felt, lacquer, car paint (sheen/clearcoat) (Bank Shot | qr-request | Y? | - | #78 | sheen/clearcoat + flake normal presets |
| #88 | qr-request: R-14-14 §8.10 — Rim term (Aura Clash) | qr-request | Y? | - | #78 | rim material option |
| #104 | [QR-11 Q-04-1] wow-webgpu-product-viewer material clamps + u_productColorSmoothi | qr-request | Y? | - | - | wow-webgpu-product-viewer material clamps |
| #192 | [qr-request] Q-04-1: @deprecated JSDoc on material.visualQA (nodes/material.ts) | qr-request | Y | - | #193 | material.visualQA (material.ts:330) lacks @deprecated |
| #258 | [QR-10] Q-04-1: nodes/material.ts: add material.foliage/terrainLayer/planet alia | qr-request | Y | - | #80 | material.foliage/terrainLayer/planet aliases absent |
| #259 | [QR-10] Q-04-2: C-15 real: honour alphaMode:'mask', alphaCutoff, alphaToCoverage | qr-request | Y? | 10 | - | C-15 honour alphaMode mask/alphaToCoverage/doubleSided |

## Lane 05 (7)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #51 | [QR][Q-05-1] Admit 2k CC0 HDRIs (studio, outdoor, night; Poly Haven) | qr-request | Y? | 12 | - | Admit 2k CC0 HDRIs (studio/outdoor/night) for benchmark refs |
| #52 | [QR][Q-05-2] Admit ground texture set (ref-03) + street kit (ref-04) | qr-request | Y? | 12 | - | Admit ground texture set (ref-03) + street kit (ref-04) |
| #68 | qr-request: R-14-07 — host K1–K7/K9 kits in assets/library/kits | qr-request | Y? | 14 | - | Host K1-K7/K9 kits in assets/library/kits; K1 at 2k |
| #126 | [QR-11 Q-05-1] Admit street-lamp asset <= 5k tris (C-17) | qr-request | Y? | - | #116 | Admit street-lamp asset <=5k tris |
| #165 | [Q-05-1] assets add --type audio + validate --release: adopt C-25 sfx provenance | qr-request | Y? | - | - | assets add --type audio + validate --release adopt C-25 provenance |
| #242 | [qr-request] Q-05-1: genericAgentText should load the canonical agent file | qr-request | Y | - | - | genericAgentText still hard-coded string (cli index.ts:3781) |
| #243 | [qr-request] Q-05-2: forward `aura3d doctor --look` to the C-39 `look lint` comm | qr-request | Y? | - | - | doctor --look forward to look lint |

## Lane 07 (10)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #77 | qr-request: R-14-11 — atmospheric/volume effects per §8 | qr-request | Y? | - | #81 #82 #85 #87 | Umbrella for per-game VFX asks; close as dup of the 4 specific rows |
| #81 | qr-request: R-14-14 §8.2 — Aurora ribbon (Aurora Lander) | qr-request | Y? | - | #77 #237 | effects.auroraRibbon (needs AuraEffectType append #237) |
| #82 | qr-request: R-14-14 §8.3 — Underwater absorption, caustics, god rays (Deep Recov | qr-request | P | - | #187 #77 | Underwater absorption/caustics/god rays; absorption fog partly in UnderwaterState |
| #85 | qr-request: R-14-14 §8.7 — Synthwave sky (Pulse Tunnel) | qr-request | P | - | #257 #77 | sky.gradient sun disc + bands (bands typed unknown in C-21) |
| #87 | qr-request: R-14-14 §8.9 — Vision cone (Gallery Shift) | qr-request | Y? | - | #77 #237 | Vision-cone volume (lightCone effect type) |
| #101 | [QR-11 Q-07-1] particles.ts: honest update-cost fields + measured scope (C-28/C- | qr-request | Y? | - | #102 | particles.ts honest update-cost fields |
| #102 | [QR-11 Q-07-2] Particle scope + resident renderer move (C-20/C-29) | qr-request | Y? | - | #101 | Particle scope + resident renderer move |
| #187 | [QR-10] Q-07-3: real C-21 setFog({mode:"absorption"}) for underwater | qr-request | P | 10 | #82 | setFog({mode:'absorption'}) in C-21; verify live path from UnderwaterState |
| #256 | [QR-10] Q-07-1: nodes/weather.ts: weather.wetGround @deprecated → C-21 wetness + | qr-request | Y | - | - | weather.wetGround lacks @deprecated |
| #257 | [QR-10] Q-07-2: C-21 AuraSkySpec gradient `bands` support: aurora band (polar-ni | qr-request | P | - | #85 | C-21 bands typed unknown; give real type + implement |

## Lane 08 (1)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #76 | qr-request: R-14-10 — rig factories accept framing.subjectHeightFraction | qr-request | Y? | 14 | - | Rig factories accept framing.subjectHeightFraction |

## Lane 09 (10)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #54 | [QR][Q-09-1] Confirm C-24 beacon writes state:playing after first presented fram | qr-request | Y? | - | - | Confirm C-24 beacon writes state:playing after first presented frame (games never draw in all-flags capture) |
| #66 | qr-request: R-14-05 — game-capture-parity flags | qr-request | Y? | - | #149 #310 | game-capture-parity flags (--fail-on-any exists per #149); verify and close |
| #70 | qr-request: R-14-09 — game-sfx-core cues for the 18 art directions | qr-request | Y? | 14 | - | game-sfx-core cues for the 18 art directions |
| #111 | [QR-11 Q-09-1] GameAppRuntime: pass app.quality to createPerformanceGovernor (C- | qr-request | Y | 11 | - | GameAppRuntime.ts:145 still calls createPerformanceGovernor without app.quality |
| #208 | [QR-08 Q-09-1] `GameAudio.ts | qr-request | Y? | 08 | - | GameAudio PannerNode + occlusion lowpass |
| #209 | [QR-08 Q-09-2] `AudioSource.setPlaybackRate(rate, rampMs)` (already declare | qr-request | Y? | - | - | AudioSource.setPlaybackRate ramp |
| #210 | [QR-08 Q-09-3] Master limiter (threshold −6 dB, ratio 12, knee 6), per-cue  | qr-request | Y? | 08 | - | Master limiter + jitter + voice limit |
| #211 | [QR-08 Q-09-4] Confirm the 176 Hz default cue (`playDefaultCue`, `GameAudio | qr-request | R? | - | - | 176 Hz default cue no longer found in GameAudio.ts; confirm and close |
| #212 | [QR-08 Q-09-5] `GameAppRuntime.ts | qr-request | Y | 08 | - | GameAppRuntime.ts:183 still loop.onFrame->app.step(dt) (no advance/onTick) |
| #213 | [QR-08 Q-09-6] `createGame` calls lane-08 `bindFeelSound(app, sound)` after | qr-request | Y? | - | - | createGame calls bindFeelSound + reducedMotion mapping |

## Lane 10 (2)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #79 | qr-request: R-14-13 — world systems per §8/§6.9 | qr-request | Y? | - | #86 #265 | World systems umbrella (ocean, spline road, ...) |
| #86 | qr-request: R-14-14 §8.8 — Ocean (Patrol Wing) | qr-request | Y? | - | #79 | world.water({mode:'ocean'}) |

## Lane 11 (10)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #53 | [QR][Q-11-1] Name one device per tier (Low/Medium/High/Ultra) | qr-request | Y? | - | - | Name one reference device per tier |
| #67 | qr-request: R-14-06 — game render presets honor probeHdrTargetFormat | qr-request | Y? | - | - | GameRenderPreset honors probeHdrTargetFormat |
| #194 | [qr-request] Q-11-1: add lanes/prd13.ts entry to tools/bundle-size | qr-request | Y | - | - | tools/bundle-size has no prd13 entry |
| #214 | [QR-08 Q-11-1] `WebGPUDevice.ts | qr-request | Y | - | - | WebGPUDevice has no cameraFade per-draw fields |
| #215 | [QR-08 Q-11-2] Export a sphere-sweep query over `performance/BVH.ts` from t | qr-request | Y? | - | - | Public BVH sphereSweep export |
| #233 | [QR-09 Q-11-1] WGSL twin of the §8 juice overlay (extra pass when any amount ≥ 1 | qr-request | Y? | - | #232 | WGSL twin of juice overlay |
| #260 | [QR-10] Q-11-1: WebGPUDevice.ts:3179 createNativeShaderSources: consume C-02 Sha | qr-request | Y | - | - | WebGPUDevice does not consume a3d_prd10_* wgsl twins |
| #261 | [QR-10] Q-11-2: QUALITY_TIERS CCR (additive) only if §17 world budgets need tier | qr-request | O | - | - | No action expected (conditional); close |
| #262 | [QR-10] Q-11-3: devtools/sceneKitBudgets.ts (from index.ts:9689): replace 'insta | qr-request | Y? | - | - | sceneKitBudgets cityBlock evidence from diagnostics().world |
| #271 | [QR-09→11] Q-11-2: wire WebGPU device.lost to onDeviceLost | qr-request | P | 09 | #99 | WebGPUDevice handles device.lost + onDeviceLost listeners; verify listeners fire from lost promise |

## Lane 12 (11)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #73 | qr-request: R-14-01 — capture step plugin for acceptance conditions | qr-request | Y | 14 | - | steps/acceptance.mjs missing (only burst/strip/webm) |
| #74 | qr-request: R-14-02 — workflow_call inputs on quality-rebuild-capture | qr-request | R | - | - | workflow_call present in quality-rebuild-capture.yml; close |
| #75 | qr-request: R-14-03 — G-PANEL schedule covers lane-14 play sessions | qr-request | Y? | - | - | G-PANEL schedule includes lane-14 human play sessions |
| #92 | [QR-11 Q-12-1] Harness records engine frame timing + fps agreement (C-30/C-33) | qr-request | Y? | 11 | #89 | Harness records engine frame timing + fps agreement |
| #97 | [QR-11 Q-12-2] Harness quality.lock() before shots + per-tier checkpoint capture | qr-request | Y? | 11 | #103 #119 | Harness quality.lock() before shots + per-tier captures |
| #98 | [QR-11 Q-12-3] quality-rebuild-capture.yml perf_gate input + windows smoke (C-33 | qr-request | Y? | 11 | #74 | perf_gate input + windows smoke (workflow_call exists; perf_gate absent) |
| #156 | qr-request: Browser Matrix showcase shards time out at mounted-evidence on every | other | Y | all | - | Browser Matrix mounted-evidence timeouts are systemic (16/17 specs time out on main per audit); root-cause on main |
| #164 | [qr-request] capture.mjs ?a3d-qr param + lane scene dirs never reach the app | qr-request | R | - | #236 | createAuraApp reads ?a3d-qr (flags.ts:128) and router globs scenes/*/*; close |
| #236 | [qr-request] to:prd12 — bench router skips lane scenes; a3d-qr URL param unwired | qr-request | R | - | #164 | main.ts globs scenes/*/* + forwards qrFlags; close (note ACTIVE_SCENE_IDS gate: prd12-ref-06 inactive) |
| #263 | [QR-10] Q-12-1: Add packages/engine/assets/world/** binaries to LFS in .gitattri | qr-request | Y | 10 | - | No LFS rule for packages/engine/assets/world/** in .gitattributes/ci.sh |
| #310 | [Q-12-1] Checkpoint-level capture parity + look-signature jobs in quality-rebuil | qr-request | Y? | 09 | #149 #66 | Checkpoint capture-parity + look-signature jobs |

## Lane 13 (12)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #48 | [QR][Q-13-1] Drop threejs-parity-lab reference from agent-examples | removal | Y | - | #41 | Drop threejs-parity-lab ref in tools/agent-examples/index.ts |
| #49 | [QR][Q-13-2] Quarantine lane-13 aggregator-only dirs from CLASSIFICATION.json | removal | Y? | - | #44 | Quarantine lane-13 aggregator dirs in CLASSIFICATION.json |
| #50 | [QR][Q-13-3] aura3d-evidence-review skill: quality:* outputs + panel rounds | fact-13 | Y? | - | #106 #217 | evidence-review skill: quality:* outputs + panel rounds (needs #39 first) |
| #69 | qr-request: R-14-08 — adopt pilot v2 code as template reference | fact-13 | Y? | - | #216 | Adopt pilot v2 code as template reference |
| #105 | [QR-11 Q-13-1] Archive templates/production-webgpu-starter (C-40) | removal | Y | - | #125 | templates/production-webgpu-starter still present; archive |
| #106 | [QR-11 Q-13-2] Skill text rewrites from facts F-11-01..05 (C-40) | fact-13 | Y? | - | #50 #217 | Skill rewrites from F-11-01..05 |
| #137 | qr-request: KIRO_PRISM_API_KEY secret + kiro-prism Claude Code docs for agent-ev | other | Y? | 13 | - | Org-side: KIRO_PRISM_API_KEY Actions secret + docs; owner action, not a lane PR |
| #216 | [QR-08 Q-13-1] Template rewrites with the exact specs of tasks D-1…D-5 (§14 | fact-13 | Y? | - | #69 #218 | Template rewrites D-1..D-5 (camera rigs/feel) |
| #217 | [QR-08 Q-13-2] Both `aura3d-browser-game/SKILL.md` copies | fact-13 | Y? | - | #106 #50 | browser-game SKILL 'Camera and feel' from F-08 facts |
| #218 | [QR-08 Q-13-3] `tests/templates` | fact-13 | Y? | - | #216 | tests/templates assertions for camera/feel |
| #264 | [QR-10] Q-13-1: Skills/templates from facts F-10-01..08; no template uses water. | fact-13 | Y? | - | #106 | Skills/templates from F-10-01..08 |
| #351 | [Q-13-1] PRD-09 handoff: game templates ride createGame (F-09 facts) | fact-13 | Y? | - | #216 | F-09 facts: templates ride createGame |

## Lane 14 (37)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #46 | [QR][Q-14-1] games.json per-game capture fields (scenarios/hudSelectors/qrFlags) | handoff-14 | P | 14,12 | #103 #308 #344 | games.json: add scenarios/hudSelectors/qrFlags for all 18 games (partial) |
| #47 | [QR][Q-14-2] scorecard.ts/forms consume C-32 GameJudgement + PanelRoundRecord | handoff-14 | Y? | 12 | #38 | scorecard/forms consume C-32 GameJudgement + PanelRoundRecord |
| #103 | [QR-11 Q-14-10] games.json: tiers flag variants + forced-Medium scenario (C-33) | handoff-14 | Y? | 11 | #46 #97 | games.json tiers flag variants + forced-Medium scenario |
| #107 | [QR-11 Q-14-1] Blockfall Reactor: remove A/B render probe + text3D scoreboard (C | handoff-14 | Y? | - | #117 | Blockfall: remove A/B probe + text3D scoreboard |
| #108 | [QR-11 Q-14-2] Siege Golf: handle updates instead of setScene rebuilds (C-37) | handoff-14 | Y? | - | - | Siege Golf: handle updates instead of setScene rebuilds |
| #109 | [QR-11 Q-14-3] Skyline Runner: drop pixelRatio clamp + safe-basic + unused asset | handoff-14 | Y? | - | #110 #119 | Skyline: drop DPR clamp + safe-basic |
| #110 | [QR-11 Q-14-4] Remove qualityProfile + DPR clamps from 4 games (C-27) | handoff-14 | Y? | - | #109 #119 | Remove qualityProfile + DPR clamps from 4 games |
| #116 | [QR-11 Q-14-5] Neon Swarm: use Q-05-1 lamp asset (C-17) | handoff-14 | Y? | - | #126 | Neon Swarm uses lamp asset after #126 |
| #117 | [QR-11 Q-14-6] Bank Shot: replace text3D digits with DOM (C-24) | handoff-14 | Y? | - | #107 | Bank Shot text3D digits -> DOM |
| #118 | [QR-11 Q-14-7] Courier Rush: static hints + device-loss overlay + review fork (C | handoff-14 | Y? | - | - | Courier Rush static hints + device-loss overlay |
| #119 | [QR-11 Q-14-8] Turbo Drift: replace capture-only pixelRatio with quality.lock()  | handoff-14 | Y? | - | #109 #97 | Turbo: capture-only pixelRatio -> quality.lock() |
| #120 | [QR-11 Q-14-9] Gravity Post: stop per-frame dock-gate texture replacement (C-15) | handoff-14 | Y? | - | - | Gravity Post: stop per-frame texture replacement |
| #121 | [QR-11 Q-14-11] Review prd11-batch-optout codemod report (C-39) | handoff-14 | Y? | - | - | Review prd11-batch-optout codemod report |
| #122 | [QR-11 Q-14-12] Rename apps/showcase-webgpu-particle-lab | removal | Y | - | #125 | apps/showcase-webgpu-particle-lab still present; rename |
| #140 | [Q-14-1] showcase-bank-shot: review-only lighting/camera/aim-line deltas after r | handoff-14 | Y? | - | - | Bank Shot review-only lighting/camera deltas after migration |
| #188 | [QR-10] Q-14-1: keep deprecated WaterReflectionRefractionCapture/WaterSurface (i | removal | Y | - | - | WaterSurface/WaterReflectionRefractionCapture still imported (rendering index, engine nodes/water.ts); migrate then delete |
| #219 | [QR-08 Q-14-1] One ticket per §10.1 row | handoff-14 | Y? | - | #265 | Per-route camera opt-in + codemod (one ticket per row) |
| #220 | [QR-08 Q-14-2] Turbo | handoff-14 | Y? | - | - | Turbo: drop composition-report strings + smoothing bypass |
| #221 | [QR-08 Q-14-3] `tests/unit/apps/skyline-player-feel.test.ts` | handoff-14 | Y? | - | - | skyline-player-feel test reads diagnostics().camera.layers |
| #265 | [QR-10] Q-14-1: Per-route adoption of world.* per §1 target table via prd10-worl | handoff-14 | Y? | - | #79 #219 | Per-route world.* adoption via prd10-world-migrate |
| #278 | [Q-14-1] showcase-rooftop-buckets: apply PRD-09 migration patch set | handoff-14 | Y? | - | - | Rooftop Buckets: apply PRD-09 migration patch set |
| #281 | [QR-09/Q-14-1] showcase-blockfall-reactor: art/camera/probe handoff to PRD-14 | handoff-14 | Y? | - | - | Blockfall art/camera/probe handoff |
| #282 | [QR-09] Q-14-1: pulse-tunnel spec migration to scenario capture + game evidence | handoff-14 | Y? | - | #308 | Pulse Tunnel spec migration |
| #285 | [QR-09] Q-14-1: neon-swarm spec migration to scenario capture + game evidence | handoff-14 | Y? | - | #308 | Neon Swarm spec migration |
| #288 | [QR-09] Q-14-1: gravity-post spec migration to scenario capture + game evidence | handoff-14 | Y? | - | #308 | Gravity Post spec migration |
| #290 | [QR-09] Q-14-1: skyline-runner spec migration to scenario capture + game evidenc | handoff-14 | Y? | - | #308 | Skyline Runner spec migration |
| #291 | [QR-09] Q-14-1: aurora-lander spec migration to scenario capture + game evidence | handoff-14 | Y? | - | #308 | Aurora Lander spec migration |
| #293 | [QR-09] Q-14-1: deep-recovery spec migration to scenario capture + game evidence | handoff-14 | Y? | - | #308 | Deep Recovery spec migration |
| #295 | [QR-09] Q-14-1: patrol-wing spec migration to scenario capture + game evidence | handoff-14 | Y? | - | #308 | Patrol Wing spec migration |
| #296 | [QR-09] Q-14-1: gallery-shift spec migration to scenario capture + game evidence | handoff-14 | Y? | - | #308 | Gallery Shift spec migration |
| #299 | [QR-09] Q-14-1: siege-golf spec migration to scenario capture + game evidence | handoff-14 | Y? | - | #308 | Siege Golf spec migration |
| #300 | [QR-09] Q-14-1: mech-hangar spec migration to scenario capture + game evidence | handoff-14 | Y? | - | #308 | Mech Hangar spec migration |
| #302 | [QR-09] Q-14-1: vault-breakers spec migration to scenario capture + game evidenc | handoff-14 | Y? | - | #308 | Vault Breakers spec migration |
| #306 | [Q-14-1] turbo-drift-circuit: art/camera handoff to PRD-14 | handoff-14 | Y? | - | - | Turbo Drift art/camera handoff |
| #308 | [Q-14-3] games.json: evidenceGlobal -> __AURA3D_GAME_EVIDENCE__ + captureContrac | handoff-14 | P | 14,12 | #46 | games.json evidenceGlobal migrated for ~3 of 18 games |
| #309 | [Q-14-1] courier-rush: art/camera handoff to PRD-14 | handoff-14 | Y? | - | - | Courier Rush art/camera handoff |
| #344 | [qr-request] to:prd14 — adopt strip/webm capture steps in games.json timelines | handoff-14 | Y | 12 | #46 | No strip/webm steps in games.json timelines |

## Lane 15 (63)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #34 | [qr-request to:prd15] PRD-10 PR A removed world planners — update 3 claiming tes | qr-request | Y | 10 | - | Delete createTerrainTileGrid/createNamedEnvironmentPreset blocks + fix HDRI counts in 3 unit tests (still present); lane-10 Phase-1 test:unit gate |
| #35 | [qr-request to:prd15] De-aliased HDRI ids: migrate consumers to canonical preset | qr-request | Y | - | - | Re-point 5 consumers still using industrial-sunset-puresky etc. to canonical ids |
| #38 | [QR][CCR-12-1] contracts.ts additive JudgeIdentity/PanelRoundRecord fields | ccr | Y | - | #47 | Add role/itemId/blindKey/... optional fields to C-32 (none present in contracts.ts) |
| #39 | [QR][Q-15-1] Root package.json root-manifest batch (quality:* aliases + deleted- | qr-request | Y | - | #65 | Root manifest batch: 0 quality:* scripts, 107 scripts (target <=80) |
| #40 | [QR][Q-15-2] README.md parity/superiority claims backed by deleted gates | removal | P | - | - | README now hedged; sweep remaining parity/superiority lines (~139) then close |
| #41 | [QR][Q-15-3] Remove apps/threejs-parity-lab references | removal | Y | - | #48 | apps/threejs-parity-lab still exists + refs in QR_OWNERSHIP, naming-taxonomy, matrix |
| #42 | [QR][Q-15-4] QR_OWNERSHIP.json row for lane-12 test files | qr-request | Y? | - | #59 | Add explicit QR_OWNERSHIP row for lane-12 test files |
| #43 | [QR][Q-15-5] current-routes-route-health.spec.ts report key visual→liveness | qr-request | Y? | - | - | Rename route-health report key visual->liveness |
| #44 | [QR][Q-15-6] Quarantine lane-15 aggregator-only dirs from CLASSIFICATION.json | removal | Y? | - | #49 | Quarantine lane-15 aggregator-only dirs in CLASSIFICATION.json |
| #45 | [QR][Q-15-7] R18 fix must carry the re-baseline-scene-16 label | other | Y? | - | #247 | Process note: R18 fix PR must carry re-baseline-scene-16 label; close once #247 fix landed (it has) |
| #59 | qr-request: check.mjs misses tests/qr/prdNN/ lane pattern | qr-request | Y | - | #147 #177 #204 | check.mjs: tests/qr/prd14/** still resolves to 15; derive from lanePatterns |
| #65 | qr-request: R-14-04 — root package.json script batch | qr-request | Y | 14 | #39 | Root scripts batch (check:art-direction etc. absent) |
| #71 | ccr: CCR-14-1 — C-35 GameBudgets.transferToPlayableMBByTier | ccr | Y | - | - | C-35 GameBudgets.transferToPlayableMBByTier (absent) |
| #72 | ccr: CCR-14-2 — resolveQrFlags accepts route-<id> short names | ccr | Y | 14 | #172 | resolveQrFlags route-<id>: flagNameFor still splits sub.length===2 only |
| #89 | [QR-11 Q-15-1] Measured fps + throttled root diagnostics + overlay (C-28/C-31) | qr-request | Y? | - | #92 | Measured fps + throttled root diagnostics + overlay |
| #93 | [QR-11 Q-15-7] Test-suite renames: fps===60 assertions + WebGPU removed-behaviou | qr-request | Y? | - | - | Rename fps===60 assertions + WebGPU removed-behaviour specs |
| #99 | [QR-11 Q-15-3] Root bridge: device-lost pause + C-29 renderer construction | qr-request | Y? | - | #271 | Root bridge device-lost pause + C-29 construction |
| #100 | [QR-11 Q-15-2] compiler/primitives.ts: cache, batch/static copy, instance-transf | qr-request | Y? | 11 | #247 #129 | compiler/primitives.ts cache/batch/static copy |
| #123 | [QR-11 Q-15-4] RootRuntimeSupport: re-export AuraPerformanceQuality + alias (C-2 | qr-request | Y? | - | - | RootRuntimeSupport re-export AuraPerformanceQuality |
| #124 | [QR-11 Q-15-5] Rendering/materials barrels: drop deleted facades (deprecation pa | removal | Y? | - | - | Barrels drop deleted facades (deprecation path) |
| #125 | [QR-11 Q-15-6] Docs/bundle/route-health updates for the WebGPU freeze (C-40) | qr-request | Y? | - | #105 #122 | Docs/bundle/route-health for WebGPU freeze |
| #127 | [CCR-11-1] C-27: `renderScaleSourceSlot: ContractSlot<(o) => RenderScaleSource>` | ccr | Y | - | - | C-27 renderScaleSourceSlot (absent) |
| #128 | [CCR-11-2] C-27: optional `confidence?`, `reasons?`, `renderer?`, `tableVersion? | ccr | Y | - | - | C-27 AuraTierDecision optional fields (absent) |
| #129 | [CCR-11-3] C-07 / contracts/renderItem.ts: optional `RenderItem.batch?: boolean` | ccr | Y | 11 | #113 | C-07 RenderItem.batch?/static? (absent) |
| #130 | [CCR-11-4] C-28: optional `instances?`, `triangles?`, `programsBound?` on `Devic | ccr | Y | - | #94 | C-28 DeviceCounters instances?/triangles?/programsBound? (absent) |
| #131 | [CCR-11-5] C-02: optional `ShaderChunk.requiresExtensions?: readonly string[]` ( | ccr | Y | - | - | C-02 ShaderChunk.requiresExtensions? (absent) |
| #135 | [qr-request to:prd15] AuraSceneNode union carve for PRD-10 world node kinds | qr-request | Y | 10 | - | AuraSceneNode union (nodes/types.ts:652) has no world kinds; carve or registry |
| #142 | [qr-request] to:prd15 — remove setupLines ergonomics metric from external-parity | removal | Y | - | - | a3dSetupLines/threeSetupLines still in external-parity + spec |
| #145 | [qr-request] to:prd15 — `setRendererQrFlags` has zero callers; renderer flags ne | qr-request | R | - | - | setRendererQrFlags now called from lanes/prd07.ts:78 + prd11.ts:197; close |
| #146 | [qr-request] to:prd15 — `commands/registry.ts` does not import `commands/prd07/` | qr-request | Y | 07 | - | registry.ts imports every lane but prd07 (and prd12); vfx CLI never registers |
| #147 | [qr-request] to:prd15 — `QR_OWNERSHIP.json` machine map diverges from §4.1 row 0 | qr-request | Y | - | #59 | agent-api/vfx/** still resolves to 15 (should be 07) |
| #148 | [CCR-07-1] C-01 `contracts/frameGraph.ts`: optional `FrameContributorContext.can | ccr | Y | - | - | C-01 FrameContributorContext.canvas? absent |
| #149 | [Q-15-4] Wire --fail-on-any into the root game-capture-parity invocation | qr-request | Y | - | #66 #310 | Root package.json lacks --fail-on-any invocation |
| #155 | qr-request: lane-10 PR #154 adds @aura3d/rendering/world alias to tsconfig.base. | qr-request | R | - | - | @aura3d/rendering/world alias present in tsconfig.base.json + vitest.config.ts; close |
| #161 | [qr-request] to:prd15 re-point tests/unit/apps imports to legacy/gameplay paths | qr-request | R? | - | - | apps/*/src/main.ts exists again (legacy + main); verify tests/unit/apps import paths and close |
| #172 | [qr-request to:prd15] flagNameFor drops multi-segment route-<kebab> flag shorts | qr-request | Y | 14 | #72 | Duplicate of #72 (flagNameFor multi-segment) |
| #177 | qr-request: packages/engine/assets/world/ ownership — CONTRACTS says 10, QR_OWNE | qr-request | Y | 10 | #59 | packages/engine/assets/world/ still resolves to 15 (CONTRACTS says 10) |
| #193 | [qr-request] Q-15-2: @deprecated JSDoc + return-type widening on six visualQA su | qr-request | Y | - | #192 | @deprecated on 6 owner-15 visualQA surfaces (neon/charts none) |
| #198 | [QR-11 Q-01-4] contracts/program.ts: export allShaderChunks() for manifest parit | ccr | Y | 11 | - | contracts/program.ts exports no allShaderChunks(); blocks lane-11 manifest parity exit |
| #204 | [qr-request] T5.6: reassign nodes/prefabs/cityBlock.ts (owner 15) for the world. | qr-request | Y | 10 | #59 | cityBlock.ts still resolves to 15; reassign to 10 for T5.6 |
| #222 | [QR-08 Q-15-1] `index.ts | removal | P | - | #228 | rollUpVector used in lane camera; resolveCameraFrame/smoothedCameraFrame still in index.ts etc. |
| #223 | [QR-08 Q-15-2] `createAuraApp` render dt `index.ts | qr-request | P | - | - | frameLoop clamps delta low (Math.max(1,..)) but no DEFAULT_MAX_FRAME_DT upper clamp |
| #224 | [QR-08 Q-15-3] Runtime frame payloads at `index.ts | qr-request | Y? | - | - | Frame payload alpha from currentFrameAlpha(app) |
| #225 | [QR-08 Q-15-4] `packages/lean/src/game.ts | qr-request | O | - | - | packages/lean/src/ no longer exists; close as obsolete (leanAdapters live in engine) |
| #226 | [QR-08 Q-15-5] `@aura3d/controls` README | qr-request | Y | - | - | @aura3d/controls README lacks app.camera note |
| #227 | [QR-08 Q-15-6] Retire the "fired/adopted" assertions in `tests/browser/{gam | removal | Y? | - | - | Retire fired/adopted assertions once lane replacements are gating |
| #228 | [QR-08 CCR-08-1] `AuraCameraSpec.up? | ccr | Y | - | #222 | AuraCameraSpec up?/roll? not in types.ts |
| #229 | [QR-08 CCR-08-2] `AuraCameraSubject.rotation? | ccr | Y | - | - | AuraCameraSubject.rotation? only via lane-local casts; add to contract |
| #230 | [QR-08 CCR-08-3] `AuraTraumaLayer.configure` per-axis `maxYawDeg?/maxPitchDeg | ccr | P | - | - | per-axis maxYawDeg exists lane-local in camera/layers; promote to C-22 |
| #237 | [CCR-07-2] to:prd15 — `AuraEffectType` union append for §6.2.9–11 effect kinds | ccr | Y | 07 | #81 #87 | AuraEffectType (types.ts:741) lacks trail/lightCone/auroraRibbon/meshParticles |
| #241 | [QR-09 Q-15-2] handle -> C-07 InstanceBufferLike read accessor on app/runtimeNod | qr-request | Y | 09 | - | runtimeNodes.ts has no InstanceBufferLike accessor |
| #247 | [QR-10] Q-15-1: compiler/primitives.ts (from index.ts:14747-14754): localNode ke | qr-request | R | - | #45 | primitives.ts:94 keeps size: node.size; close |
| #248 | [QR-10] Q-15-2: index.ts:9241-9245 `city.block/cityBlock` aliases: add @deprecat | qr-request | Y | - | - | city.block/cityBlock (nodes/city.ts:381) lack @deprecated |
| #249 | [QR-10] Q-15-3: packages/engine/package.json#exports: reserve `@aura3d/engine/wo | qr-request | Y | 10 | - | engine package.json has ./lanes but no ./world export |
| #250 | [QR-10] Q-15-4: packages/materials/src/TextureSet.ts:40-59: mark THREE_COMPAT_TE | qr-request | Y | - | - | THREE_COMPAT_TEXTURE_SETS moved to engine devtools/materials/TextureSet.ts:38; add @deprecated there |
| #251 | [QR-10] Q-15-5: .github/QR_OWNERSHIP.json: confirm agent-api/compiler/world.ts + | qr-request | R | - | #59 | compiler/world.ts resolves to 10; close |
| #255 | [QR-10] CCR-10-1: C-09 additive field: AuraEnvironmentSourceResolution.blendFrom | ccr | Y | - | - | C-09 blendFrom? absent |
| #266 | [QR-10] Q-15-6: resolveQrFlags: propagate parent→sub-flag defaults for A3D_QR_WO | qr-request | Y | 10 | - | resolveQrFlags has no parent->sub default for WORLD_{TERRAIN,WATER,BIOME} |
| #267 | [QR-10] Q-15-7: environment-preset-pack.test.ts + b3-preset-pack-rows.json (owne | qr-request | Y? | - | - | environment-preset-pack test + fixture adopt exposure factor change |
| #313 | [qr-request] to:prd15 — flag-state request: A3D_QR_VFX* dev → standalone-accepte | qr-request | Y | 07 | - | All 15 lane flags still 'dev' in flags.state.ts; promotion gated on a passing §17.1 standalone run |
| #316 | [qr-request] to:prd15 — R-15-4: root re-export removals at A3D_QR_VFX removal (P | removal | Y? | - | - | Root re-export removals at VFX removal |
| #339 | [qr-request] to:prd15 — dev-server alias additions for QR lane subpaths (prd07) | other | R | - | - | Heads-up only (dev-server aliases already landed); close |
| #340 | [qr-request] C-26 conformance: replace stub in tests/unit/contracts/C-26-world.t | qr-request | Y | 10 | - | C-26-world.test.ts still a stub (expect(contracts).toBeDefined()) |

## Lane other (1)

| # | Title | Type | Still needed | Blocks | Dup/related | Action |
|---|---|---|---|---|---|---|
| #195 | [qr-request] lights.ambient() census outside PRD-13 carve-outs | other | Y? | - | - | Census for PRD-02 ambient lint; each owner rewrites lights.ambient() - informational |
