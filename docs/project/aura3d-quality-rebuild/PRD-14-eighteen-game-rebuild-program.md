# PRD 14 — 18-Game Rebuild Program

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit` @ `3a51cba3` (audit capture sha `c08d8acb`); revised for
contracts-first parallel execution against `CONTRACTS.md` @ `85aafcd0`.
Status: proposed, parallel-ready. Lane: **PRD 14**. Starts day 0 (2026-10-05) on PR 0a contract types and stubs only; never waits for another lane
(§12A). Owned paths are exactly CONTRACTS.md §4.1 row "14" (listed in §12A.2). Game work targets `apps/aura-clash-showcase` plus the 17 game dirs
`apps/showcase-{blockfall-reactor,skyline-runner,turbo-drift-circuit,siege-golf,aurora-lander,neon-swarm,gravity-post,courier-rush,pulse-tunnel,
mech-hangar,vault-breakers,rooftop-buckets,gallery-shift,deep-recovery,patrol-wing,bank-shot,orbital-defense}`. The other `apps/showcase-*` dirs are
owned by this lane but are non-game showcases and out of scope (§24). The 18 ids are exactly the `games[].id` list in
`tools/quality-rebuild-capture/games.json`. `tools/quality-rebuild-capture/capture-games.mjs` and `.github/workflows/quality-rebuild-capture.yml`
belong to PRD 12; this PRD consumes them (C-33) and files requests (§12A.6).

Path conventions used below: bare `index.ts:<n>` means `packages/engine/src/agent-api/index.ts` (18,733 lines at `3a51cba3`); `GameRenderPreset.ts` and
`TypedGLBActor.ts` are under `packages/engine/src/production-runtime/`; `GameRuntime.ts` and `GameFeel.ts` under `packages/engine/src/agent-api/`;
`WebGL2Device.ts`, `DepthPass.ts` and `MeshConsolidation.ts` under `packages/rendering/src/`; bare `main.ts`/`environment.ts`/… inside a game row or
plan are `apps/<that game's dir>/src/…`. Line numbers are at `3a51cba3`; a task that cites a line must re-locate it by the quoted symbol if lines moved.
After the Phase 1 dispatcher task (§14.1, T1.10) moves each route's current `src/main.ts` to `src/legacy/main.ts`, every route line cited here refers to
the same line in `src/legacy/main.ts`. Contract ids (C-NN), flags (`A3D_QR_*`), checkpoints (IC-k, G-PANEL) and ownership are as defined in
`CONTRACTS.md`; where this PRD and CONTRACTS.md disagree, CONTRACTS.md wins and this PRD is wrong. Ids without a hyphen (`C9`, `C10`, `C13`,
`C14`, `C16`, `C19`) are research/19 claim ids; ids with a hyphen (`C-09`, `C-35`) are CONTRACTS.md contracts.

Reviewer spot-check (2026-10-05, `85aafcd0`, read-only `sed`/`rg`): 40+ cited anchors re-verified. Corrections applied in this revision: Courier's
ambient is at `main.ts:302` (inside the previously cited 270-313 block); Pulse Tunnel has **9** versioned `scripts/build-*-v*.py` scripts (10 `.py`
total), not 11; Aura Clash's DPR clamp is `Math.min(window.devicePixelRatio || 1, 1.75)` at `AuraClashArenaApp.ts:1530`; Orbital's per-frame
`hud.innerHTML` write is at `main.ts:342` inside `renderHud` (`:341`); `apps/aura-clash-showcase` has no `route-health.json` (it must be created);
`capture-games.mjs` has no `validateGames()` (existing validators are `validateTimeline` :103 and `evaluateExpression` :450); `packages/game` and
`tools/quality-gate` do not exist at `85aafcd0` (PR 0a creates their skeletons, CONTRACTS §3.8/§3.9); the §16 shot names now use the real
`games.json` shot ids. Anchors confirmed unchanged include `index.ts:4256,10664,12705,12743,13570,13723,14747`, `GameRenderPreset.ts:373`,
`WebGL2Device.ts:1906`, `MeshConsolidation.ts:109`, bank-shot `main.ts:234-247,741-745`, gallery `main.ts:347,1353-1357`, gravity
`main.ts:1447,1455,2378`, siege `main.ts:111,329,441,739,975`, deep `main.ts:280,305`, turbo `hud.ts:146`, `scenery.ts:39`, `main.ts:3002,3076,3383`,
skyline `main.ts:1879,1964,3960`, `hud.ts:176`, `level.ts:372`, neon `main.ts:688,1326,1667`, mech `main.ts:200,228,247,892,938`, vault
`environment.ts:61`, `main.ts:131-139`, patrol `main.ts:136,520`, `sky.ts:136,329`, aurora `sites.ts:50-52` (65 cells × 1.5 m = 96 m), blockfall
`reactor-scene.ts:44,516`, `main.ts:482,630`, Aura Clash `AuraClashArenaApp.ts:837-844,872,920,942,1179,1239,1443,3371`.

Evidence base: `research/21-game-vision-judgment.md` (authoritative for every visual category), `research/20-game-scorecards-code-pixelstats.md`
(authoritative only for sound, controls, physics feel, game feel, loading, performance), `research/17-games-g1..g5.md` (code forensics per game),
`research/16-route-local-extraction.md` (route composition and duplicated systems), `research/11-asset-pipeline.md`, `research/19-claim-verification.md`
(corrected counts: ambient-kills-IBL hits **15 of 18** games; Aura Clash avoids it through its compatibility-source path), `research/23-benchmark-vision-judgment.md`,
`_sections/B-game-scorecard.md` (merged scorecard), capture report `evidence/games/report.slim.json` (GH Actions run 37289688772, macos-14, ANGLE Metal on an
Apple paravirtual GPU, production origin `https://aura3d.auraone.ai`).

Rule for this PRD: a game is done only when the shipped default route, captured by `tools/quality-rebuild-capture` with real input on the remote
runner and on the human-review devices, is judged **competitive with a well-built modern three.js browser game** by both a vision-model pass using
the research/21 rubric and a human review panel, at overall ≥ 7/10. Passing unit tests, route 200s, non-blank screenshots, green parity matrices,
`release` asset labels and self-reported 60 fps do not count. A game that cannot reach the bar after two counted G-PANEL review rounds (§6.3) is
withdrawn from the public showcase, not relabelled. That judgement is **integrated acceptance** (§16.2): it is evaluated only at G-PANEL
checkpoints (CONTRACTS §7) and never blocks starting or merging work. Merges are gated only by **standalone acceptance** (§16.1), which this lane
can pass alone on the current renderer plus PR 0a stubs. Neither a standalone pass nor any engineering gate is a claim of three.js quality.

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
agents rejected Quaternius CC0 PBR kits because the renderer showed them black (17-g4 §3.3) and shipped a 128² NEAREST kitbash instead. The
parallel program must not repeat that while engine lanes are still on stubs, so three rules apply from day 0: (1) every v2 route is authored to
physical intent from its art-direction contract (no ambient fill, shadow strength 1, authored exposure EV, HDR emissive only on light sources), never
tuned until it looks right on the stubbed renderer; `auditArtDirection` (§7.1) fails compensations such as ambient lights, emissive fill and fake
contact discs; (2) assets are accepted or rejected on a three r185 look-dev turntable (§6.4, `apps/showcase-kits/lookdev`), never on how they render
under an Aura stub; (3) the legacy route stays frozen behind the route flag (§10) so every checkpoint measures the same legacy content with flags
`none` and `all`, which is the clean "what do engine defaults alone recover" measurement the old Wave 0 tried to get by waiting.

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
| Courier Rush | `apps/showcase-courier-rush` (1,492) | 2 | 2.8 | 7.1 | substantial | context loss with no restore; ~1,530 draws; ambient 1.25 (`main.ts:302`); traffic tint-wiped (`main.ts:391-398`); engine/ambience loops never cued (`courier-audio.ts:105-106`) |
| Pulse Tunnel | `apps/showcase-pulse-tunnel` (2,628) | 3 | 2.9 | 23.5 | substantial (presentation) | camera is one literal (`main.ts:1589-1591`); world static; 128² NEAREST textures (`scripts/build-encounter-finish-v11.py:74-107`); particles review-only (`main.ts:1264-1467`); 65% evidence code |
| Mech Hangar | `apps/showcase-mech-hangar` (1,577) | 3.5 | 3.2 | 9.3 | substantial | 144–608-tri JS-generated parts (`scripts/build-models.mjs`); no animation (yaw only, `main.ts:892,938`); 27.3 MB unrigged hero ×2; 4 directionals light both sets |
| Vault Breakers | `apps/showcase-vault-breakers` (986) | 2.5 | 2.8 | 57.4 | substantial (whole visual layer) | 1,012-tri synth `vaultBreakersTable` under a "Real catalog pinball cabinet — textured" comment (`environment.ts:61-69`); Sketchfab cabinet (12 PBR maps) unused; chrome ball under no IBL |
| Rooftop Buckets | `apps/showcase-rooftop-buckets` (1,799) | 4 | 3.8 | 7.6 | substantial (art layer) | box sky bands (`environment.ts:22-55`); skinned 191-joint players only under `?debug=animation` (`main.ts:502-536`); `setMaterial` every frame (`:1184,1223,1239`); raw `new Audio` (`buckets-audio.ts:44-48`) |
| Gallery Shift | `apps/showcase-gallery-shift` (2,048) | 3 | 3.0 | 10.1 | substantial | thief never rotates (`main.ts:1353-1357`, verified); 31 lights over 16-light cap; two ambients total 1.56; 72-tri unlit hero; static camera 24.6 m |
| Deep Recovery | `apps/showcase-deep-recovery` (1,090) | 2.5 | 2.6 | 0.5 | substantial | CPU `volumetricFog` readback (`main.ts:280-285`), p50 1,917 ms; searchlight fixed in world (`environment.ts:58-69`); camera smoothing 0 (`main.ts:305`); faceted no-UV GLBs |
| Patrol Wing | `apps/showcase-patrol-wing` (1,652) | 3 | 3.3 | 15.8 | substantial (env, lighting, camera) | no sky/IBL/water; ocean is a flat 90×90 plane (`sky.ts:329-338`); 108-tri drones; evidence strip in HUD (`main.ts:136-140`); FOV 47 |
| Bank Shot | `apps/showcase-bank-shot` (1,139) | 3 | 3.0 | 14.9 | substantial | balls never rotate (`main.ts:741-745`, verified position-only); directional outranks lamp for shadow (`index.ts:13227,13244,13267`); no renderer option → DPR 1 |
| Orbital Defense | `apps/showcase-orbital-defense` (430) | 1.5 | 1.8 | 59.6 | **full rebuild** (visual layer) | 0 GLB / 0 textures; opaque 1.13× emissive shell hides planet (`main.ts:82-131`); HUD `innerHTML` per frame (`:313,341-377`); no audio; false "particle-heavy" claim (`:74`) |

### 2.2 Engine defects the games hit (research/19 corrected). Other lanes fix them behind contracts (§12); this lane never edits engine files

| Tag | Code | Games hit | Fixed behind (contract, owner lane) |
|---|---|---|---|
| ambient-kills-IBL | `packages/engine/src/agent-api/index.ts:12693-12707` (zeros at :12705) | 15 of 18 (not Aura Clash; Siege Golf and Turbo author `environments.studio`, a 128×64 LDR probe, C10) | C-09/C-10, PRD 02 |
| exposure-dropped | root tone map fixed ACES exposure 1, `index.ts:12898-12904` | 16 pass `colorGrade.exposure` | C-05, PRD 01 |
| DPR-1 | safe-basic `pixelRatio: 1`, `index.ts:4256` | ~13–14 | C-27, PRD 11 |
| tint-wipe | `replaceSurfaceTextures: true`, `index.ts:13570`; `TypedGLBActor.ts:477-507` | Aura Clash, Skyline, Siege, Neon, Gravity, Courier, Deep, Aurora (opacity), Patrol (ghost) | C-15, PRD 04 |
| effects-zero-px | particles/rain/snow/flipbook/beam non-pixel-backed on production bridge, `index.ts:13723`; `game.effects`/`gameFeel` data-only (`GameRuntime.ts:2800-2879`, `GameFeel.ts:1-17`); `rg '\.nodes\(\)'` = 0 hits in routes | all | C-20, PRD 07 |
| shadow-0.32 | `index.ts:12966-12968`; depth pass ignores skinning/instancing/alpha (`DepthPass.ts:59-87`); single map fit over all casters; no CSM on root | all | C-10/C-11, PRD 02 |
| no-sky | root never draws environment background (C9) | all | C-05 `background({environment:true})`, C-21, PRDs 02/07 |
| bloom-knee | softKnee 0.5 × "balanced" gain blooms mid-tones; threshold clamped ≤1 (C13) | all 17 that author `neonBloom` | C-13, PRD 03 |
| fake-AA/AO | "FXAA" is a 4-tap cross blur on 4× MSAA; SSAO ≈0 at gameplay depth (C14) | all that author `antiAlias`/`ambientOcclusion` | C-13, PRD 03 |
| instancing size | `createProductionInstanceTransforms` omits `node.size` (`index.ts:14747`, research/22 §16) | Blockfall, Neon, Turbo (43 `instances.*`), Rooftop | R18, PRD 15 (unflagged correctness fix) |
| light cap | `pbr-textured` caps at 16 direct lights (research/04 §4) | Gallery (31), Courier (~20), Deep (16) | C-10 clustered lights, PRD 02 |
| no runtime node add | `AuraRuntimeNodeRegistry`, `index.ts:10664-10670` | forces parked pools (y=-50/-60) that inflate shadow fit | C-37, PRD 15 |

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

| Package / path | Owner | Change in this PRD |
|---|---|---|
| `apps/aura-clash-showcase`, `apps/showcase-*` (17 games) | 14 | Rebuilt per §6.9 as `src/v2/**` behind `A3D_QR_ROUTE_<ID>`; current code moved verbatim to `src/legacy/**`; gameplay modules kept and moved to `src/gameplay/**`; v2 presentation built on `@aura3d/game` (C-24, C-25) |
| `apps/showcase-kits` (new) | 14 (`apps/showcase-*/` prefix) | Kit staging K1–K7, K9 (sources, `kit.json` licences, hashes) and the three r185 + Aura look-dev turntable page `lookdev/`; never deployed publicly |
| `apps/showcase-index` | 14 | Lists only `qualityGate.status === "accepted"` games publicly |
| `packages/game/src/art/` | 14 | Real implementation of C-35: validator, `auditArtDirection`, acceptance evaluators (`requiredConditions`, `canvasBlankCheck`) (§7.1); the frozen C-35 surface file stays custodian-owned (§12) |
| `tools/quality-rebuild-capture/games.json` | 14 (data; schema `games.schema.json` is 12, R22) | C-35 `GameEntryV2` fields and `qrFlags` for all 18 (§7.2) |
| `tools/quality-gate/src/scorecard.ts`, `tools/quality-gate/forms/` | 14 (rest of `tools/quality-gate/` is 12) | Scorecard builder and verdict (§7.3); offline human-review form |
| `scripts/check-art-direction.mjs`, `scripts/check-route-health.mjs` | 14 | Art-direction audit, capture-branch scan of `src/v2/**`, route-health gate |
| `.github/workflows/qr-prd14-*.yml`, `tests/qr/prd14/**`, `tests/unit/contracts/impl/prd14-*`, `docs/project/aura3d-quality-rebuild/evidence/{prd14,games-after}/` | 14 (lane NN rule) | Lane CI on macos-14, lane tests, evidence |
| `@aura3d/game` (rest of `packages/game/`) | 09 | Consumed through C-24/C-25; not edited |
| `tools/quality-rebuild-capture/capture-games.mjs`, `steps/`, `.github/workflows/quality-rebuild-capture.yml` | 12 | Consumed (C-33); changes are requests R-14-01/02 |
| `aura.assets.json`, `src/aura-assets.ts`, `public/aura-assets/` | 05 (generated, CONTRACTS §4.3) | This lane commits only regenerated diffs for its own asset ids, produced by `aura3d assets …` and re-checked with `--check` |
| `packages/create-aura3d/templates/*` | 13 | Receive pilot patterns as C-40 facts and requests; not edited here |
| Root `package.json` | 15 | New root scripts through the root-manifest batch (R-14-04); lane runs tools directly meanwhile |

## 5. Affected files and directories

Per game, the files kept (gameplay), rewritten and deleted. Paths are under `apps/<dir>/`. Under the parallel plan (§10): "Keep" modules move to
`src/gameplay/` and are imported by both `src/legacy/` and `src/v2/` (pure moves, no behaviour change, so legacy stays frozen); "Rewrite" means a new
file under `src/v2/` replaces the legacy file's role, and the legacy file stays untouched until Phase 6; "Delete" items are never ported to v2 and
are deleted with `src/legacy/` in Phase 6 (§13), except the declared P0 correctness fixes, which also land in legacy (§14.1).

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
| Pulse Tunnel | `beat-clock.ts`, `patterns.ts`, `gates.ts`, audio stems | `src/main.ts`, `player.ts` visuals, `hud.ts`, `styles.css` | `art-review/` (82 MB), 9 `scripts/build-*-v*.py` scripts, 128² NEAREST textures |
| Aurora Lander | `lander.ts`, `terrain.ts` height function, Rapier heightfield, `prediction.ts`, `ghost.ts`, `touchdown.ts`, campaign | `src/main.ts`, `sites.ts` visuals, `hud.ts` | `auroraLanderProbe` (460-tri), `auroraPadBeacon` (66-tri), 72 snow spheres, aurora boxes, image cards |
| Gravity Post | `wells.ts`, `pod.ts`, `contracts.ts`, `scoring.ts`, `prediction.ts` | `src/main.ts:274-1240` scene graph, HUD | `gravityPostCourierSkiff`/`FreightDistrict` synth (32² stripes), 84+24 in-volume star/dust spheres, 78 bead spheres, `freightway.ts` review set |
| Gallery Shift | `floor.ts`, `vision.ts`, `guard.ts` FSM, detection meter | `src/main.ts`, `environment.ts` (695), `thief.ts` visuals | `showcaseRunnerGirl` (72-tri unlit), synth pedestals/cases/exhibits, box harnesses, world-text labels, emissive light-pool discs (`main.ts:743-771`) |
| Deep Recovery | `sub.ts`, `sonar.ts`, `salvage.ts`, `oxygen.ts`, HUD structure | `src/main.ts`, `deep-audio.ts` | `environment.ts` (953), all `scripts/build-models.mjs` outputs, `volumetricFog` node |

All 18 v2 routes: no `?capture=review` branches, no `window.__*__` route globals (the C-24 beacon `window.__AURA3D_GAME__` and
`window.__AURA3D_GAME_EVIDENCE__[route]` replace them), no `scripts/write-performance-report.ts` (13 copies today), no route-local audio wrappers;
every v2 route boots through `createGame` (C-24). Aura Clash additionally gains a `route-health.json` (none exists today). Legacy copies of these are
deleted with `src/legacy/` in Phase 6.

## 6. Architecture proposal

### 6.1 The rebuild unit

Each game is rebuilt as one unit with five parts. Every game can start on day 0: the unit is written against PR 0a contract types and stubs, and
the real engine implementations arrive later behind their own flags with no route code change (CONTRACTS §6.3). Which engine lanes must be real
for the game's **integrated** targets to be reachable is informational and listed per game in §12.3; it never gates scheduling.

1. **Art direction contract** `apps/<id>/art/direction.ts` (typed, §7.1): one-sentence fantasy, reference board, palette, key-light design, environment
   (HDRI asset key or sky preset), camera framing targets, asset roles with budgets, VFX list, audio list, HUD theme. Reviewed by a human before
   any asset spend. The vision judge receives it, so "matches its own direction" is judgeable.
2. **Scene modules** `apps/<id>/src/v2/scene/{world,lighting,camera,fx,materials}.ts`, each importing only `@aura3d/engine` (public entry and
   `@aura3d/engine/contracts`) and `@aura3d/game` (CONTRACTS §6.2: no import of another lane's non-contract module).
3. **Asset kit**: kit assets staged in `apps/showcase-kits/<Kn>/`, approved on the three r185 look-dev turntable, admitted with
   `aura3d assets add` (C-17 1.0 writer today, 1.1 when PRD 05 is real), drawn from shared kits K1–K9 (§6.4) first.
4. **Shell adoption**: `createGame` (C-24; PR 0a stub wraps `createGameApp`, `index.ts:11818`): full-bleed canvas, session, sound (C-25), FX layer,
   HUD, touch, capture context, evidence beacon.
5. **Acceptance**: standalone checks on every PR (§16.1); integrated judgement at G-PANEL checkpoints (§16.2) with the scorecard committed under
   `apps/<id>/art/scorecards/<round>-<sha>.json`.

Standard layout after rebuild:

```
apps/<id>/
  art/direction.ts            GameArtDirection (§7.1)
  art/references/             ≥3 reference images + references.json (source URL, licence or "internal mood board", why it was chosen)
  art/scorecards/<round>-<sha>.json   GameScorecard (§7.3), one per checkpoint round
  src/main.ts                 ≤ 30 LOC route-flag dispatcher (§10): dynamic import of ./v2/boot.ts or ./legacy/main.ts
  src/legacy/**               the pre-rebuild route, moved verbatim (frozen except declared P0 fixes, §14.1)
  src/v2/boot.ts              ≤ 400 LOC: createGame(), scene mount, gameplay loop wiring
  src/v2/scene/*.ts           world, lighting, camera, fx, materials
  src/gameplay/**             kept modules (moved, not rewritten; shared by legacy and v2)
  src/v2/scenarios/*.ts       named capture scenarios (C-24 GameScenario): state only
  src/v2/evidence/*.ts        lazy route evidence sections published under window.__AURA3D_GAME_EVIDENCE__[route]
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
| F (full) | Only the rules module survives; `src/v2/` is written fresh on `createGame` (offered back to PRD 13 as a template reference, R-14-08) | `waves.ts` logic | everything else | Orbital Defense |

"Save-through-polish" is not available to any game. The frozen legacy routes, captured at every checkpoint with flags `none` and `all`
(CONTRACTS §5.4), measure how much each game gains from engine defaults alone; no game is expected to clear 5 that way (research/21 estimates
Pulse Tunnel at ~6 reachable "if IBL works", the highest such estimate).

### 6.3 Acceptance gate (applies to every game; integrated, evaluated only at G-PANEL checkpoints)

This is the game's **integrated acceptance** (§16.2). It is evaluated only on G-PANEL rounds (IC-4 2026-11-05, IC-8, IC-12, …; CONTRACTS §7) on
the checkpoint's main HEAD, with the route flag on and `qr_flags=all`. It never blocks a merge. The standalone gate that does block merges is §16.1.

A game is **accepted** when all hold on the same commit:

1. Vision judge (research/21 prompt and 27 visual categories, unchanged so scores are comparable; C-32 `GAME_VISUAL_CATEGORIES`,
   `RUBRIC_PROMPT_VERSION`) on the v2 capture set (§20): overall ≥ 7, every visual category ≥ 5, the genre-critical categories in §6.10 at their
   target, and the answer to "competitive with a well-built modern three.js browser game?" is **Yes**. The judge model id is pinned per round and
   recorded in C-32 `JudgeIdentity`; each viewport is judged **3 times** and the per-category **median** is used; the round is void (re-judge, not
   accept) if the PRD 12 calibration canaries judged in the same session drift by more than ±1.0 from their recorded scores, or if the three runs for
   any critical category span more than 2 points.
2. Human panel: the C-32 G-PANEL judges (2 humans + 1 vision model, median of record) **plus** this PRD's play sessions so that ≥ 3 humans in total
   score the game, at least one not on the implementing team. Each plays the route for ≥ 5 minutes on a High-tier desktop and a Medium-tier phone
   and scores the same rubric blind to the vision score. Median overall ≥ 7; no reviewer below 6.
3. Non-visual (research/20 rubric, C-32 `GAME_NONVISUAL_CATEGORIES`, judged by the human panel with the evidence beacon): sound ≥ 6, controls ≥ 7,
   game feel ≥ 6.5, loading ≥ 6, physics feel ≥ 6 where physics is gameplay (Siege, Vault, Bank, Rooftop, Turbo, Courier, Patrol, Aurora, Gravity).
4. Performance gates of §17 on the runner and on the reference devices; p50/p95 from rAF intervals only (C-28 FrameStats via C-31 `frame` section).
5. Production health: 0 page errors, 0 console errors, canvas-region not uniformly black in any shot, the look identical across play and every
   scenario URL (C-31 `appliedLook` equal), no debug/evidence/marketing text in the play view.
6. The scorecard is committed and `route-health.json` `qualityGate.status` is set to `"accepted"` by the reviewer, not by the implementing agent.

Rejection loop: a rejected game gets a written finding list (judge §3 "what looks poor" + human notes) and one more round. A rejected round
**counts** toward withdrawal only if every contract listed for that game in §12.3 as integrated-critical was real (provided and flag at least
`standalone-accepted`, per `diagnostics().qrFlags` and `degradations` in the capture) in that round's `all` run; otherwise it is recorded as
`engine-pending` and does not count, so a game is never withdrawn for another lane's lateness. After two counted rejected rounds the game is
removed from `apps/showcase-index` and `qualityGate.status` becomes `"withdrawn"` until a new plan is approved.

### 6.4 Shared kits (built once, consumed by ≥ 2 games)

Kits are sourced and staged by this lane, starting day 0, in `apps/showcase-kits/<Kn>/` (owned by 14 through the `apps/showcase-*/` prefix) with a
`kit.json` per kit: per-file source URL, licence (CC0 or a licence that allows bundled web redistribution), SHA-256, triangle count, texture
sizes, and the look-dev verdict. Each candidate is approved on the `apps/showcase-kits/lookdev/` turntable, which renders the same asset in
three r185 (`three@0.185.1`, exact version in that app's `package.json`) and in Aura under the K1 `studioSmall08` HDRI; **approval is decided on
the three r185 view** so no asset is rejected for an Aura stub defect (the Pulse Tunnel failure, §1). Approved files are admitted per consuming
route with `aura3d assets add --type model|texture|environment|audio` (C-17: 1.0 writer today, 1.1 with `admission`/`lookDev` records once PRD 05
is real), which regenerates the PRD 05-owned `aura.assets.json` only for this lane's ids (CONTRACTS §4.3). When PRD 05 hosts kits in
`assets/library/kits/` (request R-14-07), staging moves there and `apps/showcase-kits/<Kn>/` keeps only `kit.json` pointers. Agent-synthesized
geometry is not admissible as a hero or world asset.

| Kit | Contents (minimum) | Consumers | Budget per kit | Visual benefit | Fallback |
|---|---|---|---|---|---|
| K1 HDRI set | Existing benchmark HDRIs `studioSmall08`, `autumnFieldPuresky`, `kloppenheim06Puresky` (`benchmarks/quality-rebuild/shared/assets.ts:180-197`; these are **1k** `.hdr` files under `fixtures/environment-corpus/hdri/`, so the game library admits the 2k/4k versions of the same Poly Haven CC0 sources, not the 1k fixtures); new: night-city street, pool-hall/bar interior, industrial hangar, dusk rooftop city, sunset ocean, deep-space starfield (8k equirect), museum interior | all 18 | 2k RGBE `.hdr` per HDRI for IBL (≤ 6 MB), 4k AVIF (or KTX2 UASTC) LDR background plate (≤ 3 MB; not JPEG-XL, which Chrome does not decode); Low tier 1k | Real specular, Fresnel, sky; ends ambient-only lighting | Standalone: the three 1k fixture HDRIs through today's `environments.hdri`; superseded by PRD 05's 2k HDRI library (C-17) when it lands (R-14-07) |
| K2 Neon-night kit | Wet asphalt + puddle mask PBR (2k tiling), emissive window-atlas buildings (4 variants, instanced), signage atlas, street props (bollard, lamp ≤ 5k tris, AC unit), rain/steam flipbooks | Aura Clash, Courier, Neon, Rooftop, Pulse, Vault | ≤ 25 MB raw → ≤ 8 MB KTX2 | Coherent neon look with reflections instead of emissive boxes | Medium tier drops puddle SSR to env-only |
| K3 Outdoor nature kit | Terrain splat set (grass/rock/sand/dirt, 2k each, ORM+N), 3 conifer + 3 deciduous trees with 3 LODs + impostor, rocks ×6, grass card clumps, hedge modules | Turbo, Siege, Patrol, Skyline | ≤ 30 MB → ≤ 10 MB | Replaces sphere-on-stick trees and flat planes | Low: impostors only beyond 40 m |
| K4 Interior kit | Plaster, marble (veined), parquet, walnut, brushed steel, felt (sheen), leather, glass; trims; lamps; frames with licensed art | Bank, Gallery, Mech, Blockfall | ≤ 20 MB → ≤ 7 MB | Textured rooms instead of flat-colour boxes | 1k textures on Low |
| K5 Space kit | Planet albedo/normal/night-lights/clouds (Earth-like, gas giant, rocky, ice; 4k/2k), starfield HDRI (K1), nebula layer, asteroid set | Orbital, Gravity, Aurora (sky) | ≤ 24 MB → ≤ 8 MB | Lit planets with terminators | 2k maps on Low |
| K6 Character set | Rigged humanoids (Quaternius UBC family already in Aura Clash), clip library (locomotion, melee, sports, sneak), 1 mech rig, crowd LOD (vertex-animated, ≤ 800 tris) | Aura Clash, Rooftop, Gallery, Skyline, Mech, Neon | hero ≤ 40k tris, ≤ 4 MB each | Animated, lit characters instead of cards and statues | Crowd → silhouette cards on Low |
| K7 Vehicle set | Formula car hero ≥ 30k tris with BC/N/ORM, van with separate wheels, aircraft (existing Meshy 60k), drones ×2 ≥ 5k, sub, lander ≥ 3k | Turbo, Courier, Patrol, Deep, Aurora, Orbital | ≤ 6 MB each | Readable heroes | LOD1 on Low |
| K8 SFX core | PRD 09's `assets/packs/game-sfx-core/` (C-25 real) when it lands; until then licensed samples staged in `apps/showcase-kits/K8/` (starting with the 11 Kenney samples Aura Clash already ships) and referenced as C-25 `AudioAssetRef` with `provenance: "sample"` | all 18 | ≤ 1.5 MB per game + streamed music | Replaces oscillator WAVs | silent + logged, never a synth beep |
| K9 VFX flipbooks | spark, smoke, dust, explosion (3 sizes), muzzle, splash, bubble, electric arc, confetti; 8×8 sheets, 2k, premultiplied | all 18 | ≤ 6 MB total KTX2 | Real VFX instead of moved primitives (pixels only once C-20 `particle-pass` is real) | `game.fx` `backend: "primitive-pool"` (C-24 stub over C-20 stub) |

### 6.5 Rebuild order (review targets, not start gates)

Every game starts day 0 (§12A.1). Waves only decide (a) which G-PANEL round a game's first counted review targets, (b) the order in which shared kits
are staged, and (c) staffing priority when agents are scarce. No wave waits for another wave or another lane. Columns "integrated-critical
contracts" list what must be real for the game's integrated targets to be reachable; they feed the `engine-pending` rule (§6.3), never a gate.

| Wave | Games | Why this grouping | First counted review target | Integrated-critical contracts (informational) |
|---|---|---|---|---|
| 0 Baseline | all 18 legacy routes | Frozen legacy captured with `none` and `all` at every checkpoint measures engine-default gains; P0 correctness fixes land in legacy (§14.1) | IC-0 (2026-10-08) records round-0 scorecards | none |
| 1 Pilots | Bank Shot, Turbo Drift, Aura Clash, Orbital Defense | Each exercises a distinct engine stack: interior IBL + spot shadows + clearcoat/sheen (Bank); outdoor HDRI sky + CSM + terrain + particles + vehicle camera (Turbo); skinned shadows + combat VFX + fighting camera + HUD shell (Aura Clash); greenfield on `createGame` (Orbital, 430 LOC) | G-PANEL IC-4 (2026-11-05) | per game in §12.3 |
| 2 Neon-night + table/sports | Vault Breakers, Rooftop Buckets, Courier Rush, Neon Swarm, Pulse Tunnel, Siege Golf | Reuse K2, K4, K3 staged for the pilots; SSR wet floors | G-PANEL IC-8 (2026-12-03) | per game in §12.3 |
| 3 Sky / atmosphere / space / water | Patrol Wing, Aurora Lander, Gravity Post, Deep Recovery | Heaviest on PRD 07 atmospherics and PRD 10 terrain/ocean/underwater, which are likely to be real later | G-PANEL IC-12 (2026-12-31) | per game in §12.3 |
| 4 Characters / interiors | Skyline Runner, Blockfall Reactor, Mech Hangar, Gallery Shift | Heaviest on PRD 06 (C16 empty pose, skinned shadows) and PRD 02 multi-caster shadows | G-PANEL IC-12 (2026-12-31) | per game in §12.3 |

A game may be put up for any earlier G-PANEL round once its standalone acceptance (§16.1) passes; an early round that is `engine-pending` costs
nothing. Pilot learnings reach later waves as C-40 fact rows and the pilot retrospective issues (§14.5 T5.3), not as a gate.

### 6.6 Review protocol

- Capture: `tools/quality-rebuild-capture/capture-games.mjs` (PRD 12, C-33) on `macos-14` (ANGLE Metal) with v2 timelines that must reach the
  game's action condition (`requiredConditions`, §7.2). A shot whose condition is not reached is `capture-failed` (C-32 `GateVerdict`), rather than
  an "action" frame with no action (Aurora, Neon, Bank, Rooftop, Patrol failed this in run 37289688772). Until PRD 12 wires the evaluator into a
  capture step plugin (R-14-01), this lane evaluates the same conditions in its own remote spec `tests/qr/prd14/browser/required-conditions.spec.ts`
  and the scorecard builder refuses a round whose spec run failed.
- Flags: every capture of a v2 route records the resolved `qrFlags` (C-30 `ReadyPayloadV2`, C-31 `qrFlags`). Standalone runs use
  `none` + the route flag; checkpoint runs use `all` + the route flag (and `none`, for attribution).
- Vision judge: same prompt as research/21 (C-32 `RUBRIC_PROMPT_VERSION`) with three additions: the art direction contract, the reference board, and
  the previous round's scorecard. The judge must list "what looks poor" before scoring. Vision-only rounds (IC-1..3, 5..7, …) are screening and
  cannot accept (C-32).
- Human panel: reviewers use the Vercel preview URL of the checkpoint commit with the route flag on, on their own devices (one High desktop, one
  Medium phone minimum), fill `GameScorecard.human[]`, and record device, browser and measured fps from the beacon overlay (`?dev=1` shows rAF
  p50/p95 from C-28 FrameStats).
- Comparables: each reference board contains ≥ 3 shipped three.js/WebGL browser games or demos chosen by a human in the same genre. The judge scores
  "gap to references" per category; the gap must be ≤ 1.5 on the genre-critical categories.

### 6.7 Quality tiers per game

Every v2 game reads the C-27 tier (`app.quality`, `low | medium | high | ultra`; `"auto"` only in options) with automatic selection and a settings
override. Under the C-27 stub, `"auto"` resolves to `high` on desktop and `medium` on coarse-pointer devices; the PRD 11 governor replaces that
without route changes. Routes read tier-dependent values only from `app.quality.settings` (e.g. `particleBudget`, `shadow.mapSize`, `drawBudget`) and
from their art-direction `tiers` block. Tier changes may reduce resolution, sample counts, particle counts, shadow cascades and LOD distances; they
may not remove the key light's shadow, the environment, or the art direction's signature effect (e.g. Aurora's aurora, Courier's wet reflections at
env-only quality). Budgets are in §17.

### 6.8 Cost of the cross-game recommendations

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory | Bundle | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| G1 | Delete `lights.ambient`; HDRI environment (K1) as IBL + background per game | Specular, Fresnel and sky return in 15 games; fixes the black metals (Pulse, Vault, Mech) | +0.2–0.5 ms (sky pass + IBL fetches) | 0 | 2k RGBE prefiltered ≈ 12 MB GPU; background 4k ≈ 32 MB → Low 1k/2k | 0 JS; 3–9 MB assets per game | Low: 1k HDRI, background at half res | Standalone: 1k fixture HDRI via `environments.hdri`; IBL correctness arrives with C-09/C-10 real (PRD 02) |
| G2 | One shadowed key per scene, frustum fitted to play bounds or CSM (outdoor), contact shadows; delete fake discs/cylinders | Grounding (shadows 1.6 → ≥ 6) | +0.6–1.5 ms (2–3 cascades 2048) | +0.1 ms | 16–48 MB shadow maps | 0 | Low: 1 cascade 1024, PCF 4 | Standalone: one shadowed key with `shadow: { fit: { center, extent } }` (C-10 field; not guaranteed honoured by the stub, so the route also keeps caster bounds tight: no parked nodes, `castShadow: false` on backdrops); `decals.blobShadow` (C-10) when real; never emissive discs |
| G3 | Replace synth/card assets with kit assets at budget | Assets 3.1 → ≥ 7; largest single content lift | +0.5–2 ms (more triangles, textures) | +0.2 ms (more draws if not batched) | +50–200 MB GPU (KTX2 bounded) | 0 JS; assets per §17 | LOD + 1k textures on Low | LOD1 meshes |
| G4 | Genre camera rig (C-22 `app.camera.rigs.*`) with framing targets | Subject legibility; composition 3.1 → ≥ 7 | 0 | +0.05 ms | 0 | 0 (engine) | Per-orientation framing | Standalone: route-local `AuraCameraRig` object in `src/v2/scene/camera.ts` passed to `app.camera.use()` (C-22 stub honours any rig object); swapped to the PRD 08 factory only when the framing test still passes with `A3D_QR_CAMERA` on |
| G5 | Pixel-backed VFX via `game.fx` + PRD 07 particles, K9 flipbooks | VFX 2.2 / particles 1.4 → ≥ 6.5 | +0.3–1.2 ms (overdraw-bound) | +0.1–0.3 ms | 4–16 MB (atlases + buffers) | +0 (engine) | Low caps live particles at 25% | `game.fx` `primitive-pool` (C-24/C-20 stubs). Because the C-37 stub implements `add` as a remount (`RUNTIME_ADD_REMOUNT`), a route whose p95 rises > 50 ms during bursts mounts its pool once at scene build (§6.8 G13) |
| G6 | `createGame` shell: full-bleed canvas, HUD kit, delete debug/marketing UI | HUD 5.2 → ≥ 7; canvas from 43–60% to ≥ 95% of viewport | up to ×2.3 fill for formerly boxed games (absorbed by tiers) | ≤ 0.05 ms | DOM ≤ 300 nodes | ≤ 14 KB (PRD 09) | Largest mobile win | `layout: "letterbox-16x9"` |
| G7 | Sampled audio (K8) on `GameSoundEngine` | Audio 2.7 → ≥ 6 | 0 | ≤ 0.2 ms | decoded SFX ≤ 24 MB High, ≤ 10 MB Low | ≤ 10 KB | gesture unlock on title | silent + logged |
| G8 | Look preset per art direction: HDR emissive 2–8, bloom threshold ≥ 1.0, knee ≤ 0.2, no FXAA over MSAA, exposure authored | Ends milky mid-tone bloom and blur; neon reads as light | 0 to −0.3 ms (FXAA removed) | 0 | 0 | 0 | Low: bloom at quarter res | PRD 03 defaults |
| G9 | Batch/instance repeated geometry; budget draws per tier | Fixes the 5–15 fps games (Courier ~1,530, Gravity 1,200+, Mech ~190 unbatched, Blockfall 460 nodes) | −2 to −10 ms on the runner | −2 to −8 ms | −(per-node overhead) | 0 | Required for Low tier | Standalone: route-authored reduction (delete hidden nodes, `instances.*` for repeats with per-instance scale in the transform rather than `size`, which `createProductionInstanceTransforms` ignores until PRD 15's R18 fix at `index.ts:14747`, fewer merged GLBs); integrated: engine static batching (PRD 11 `A3D_QR_TIERS_BATCHING`, wrapping `consolidateStaticMeshes`, `MeshConsolidation.ts:109`; routes never import `@aura3d/rendering` internals) |
| G10 | Remove capture forks; scenarios drive state only | Review frames equal play frames; no tuning of a different game | 0 | 0 | 0 | −(6–8k LOC fleet-wide, research/16) | 0 | none needed |
| G11 | Route-flag dispatcher (`src/main.ts` → dynamic `import("./v2/boot.ts")` or `import("./legacy/main.ts")`) | Lets every v2 route merge to main from day 0 without changing the shipped default | 0 | one extra module fetch before boot (< 5 ms) | 0 | +0.3 KB gzip; legacy and v2 are separate chunks, only one is fetched | 0 | flag off = legacy route, byte-identical behaviour |
| G12 | Route-local camera rigs implementing C-22 `AuraCameraRig` (temporary) | Correct framing while PRD 08 rigs are stubs | 0 | ≤ 0.05 ms | 0 | ≤ 3 KB gzip per route, deleted when the PRD 08 factory passes the same framing test | per-orientation framing table | `app.camera.rigs.static(pose)` (real in the stub) |
| G13 | Pre-mounted FX pool adapter with the C-24 `GameFxLayer` shape (temporary, only where G5's remount cost shows) | FX visible without per-burst remounts | +0.05–0.2 ms (hidden pooled nodes still culled per frame) | +0.05 ms | ≤ 2 MB | ≤ 2 KB gzip, shared in `apps/showcase-kits/src/fx/prewarmedFxLayer.ts` | pool size from `app.quality.settings.particleBudget` | plain `game.fx` once C-37/C-20 are real |

### 6.9 Per-game plans

Scores quoted as "now" are research/21 (visual) and research/20 (non-visual, rounded per `_sections/B`). Targets are in the consolidated table §6.10.
Reading rule for the plans below: "PRD NN <feature>" names the lane whose real implementation, behind the contract listed for that game in §12.3,
makes the bullet fully true. The v2 route always calls the contract surface (§7.6) and ships the standalone fallback from that game's change table or
the §8 index until the real implementation arrives; no bullet is a reason to wait. Line references in the plans point into `src/legacy/` after T1.10.
Every plan inherits: G1 (no ambient; HDRI/sky environment), G6 (shell, debug UI deleted), G7 (sampled audio), G8 (look preset), G10 (no capture
forks), and the acceptance gate §6.3. Only game-specific work is listed. Cost tables cover the game-specific recommendations; G1–G13 costs are in §6.8.

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
  Euler XYZ and call `handle.setRotation(...)` (the Euler form used at `apps/showcase-mech-hangar/src/main.ts:892`), or the C-37 `teleport(x, y, z, rotation)`
  extension (C-23, PRD 08) once real; the stub `teleport` is `setPosition` plus one non-interpolated frame, so v2 uses `setRotation` until then. Put the conversion in a pure helper `src/gameplay/ball-visuals.ts` (`ballEulerFromBody(q)`) so it is unit-testable. Cue pull-back scales with
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

- **Environment:** replace `turboCircuitEnvironmentV2` (75.5k tris, 28 flat materials, 0 textures) with a spline-extruded road (PRD 10 world content when real; standalone: the
  road is extruded offline from the existing centreline data into a UV'd GLB staged in `apps/showcase-kits/K3/turbo-road/`) carrying UV'd 2k asphalt, a rubbered racing-line mask, kerb and run-off decals; K3 splat terrain around it (grass/dirt/rock by slope);
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
  K1 night-city HDRI at 1.0. The side-view preset forces `targetFormat: "rgba8"` (`GameRenderPreset.ts:373`, owned by PRD 11), so v2 does not use it: the route sets
  `app.setOutput({ toneMapping: "aces", exposure })` (C-05) and the `arena-fight` post preset (C-13), and files R-14-06 so the preset follows
  C-05 `probeHdrTargetFormat`. The HDR target itself becomes real with `A3D_QR_CORE=v2` (C-05, PRD 01). Delete the DPR clamp
  `Math.min(window.devicePixelRatio || 1, 1.75)` (`AuraClashArenaApp.ts:1530`); DPR comes from C-27.
- **Camera:** `rigs.fighting({ fighters: ["p1", "p2"], framing: { subjectHeightFraction: 0.5 }, fov: 32 })`, pitch −6°, separation dolly (today 60°
  orthogonal side view, `:1239`).
- **Animation:** anticipation and follow-through by clip time-scale curves on heavy attacks; landing squash through juice tween.
- **VFX:** K9 additive spark flipbook + 0.08 s impact point light (intensity 6) + shock ring + landing dust; dash afterimage as a PRD 07 trail (the
  current ghosting reads as a glitch); KO slow-mo.
- **Shaders:** rim term (§8.10); SSR wet floor (PRD 02) with puddle mask from the arena textures.
- **World population:** rain (PRD 07) 1,500 High / 400 Low; two steam vents.
- **Audio:** keep the 11 Kenney samples; add music bed, announcer (round/fight/KO from K8), crowd bed, per-move whooshes.
- **Juice:** per-actor hit-stop (`session.hitStop(0.07, { actors })`, C-24 delegating to C-23 `app.time.hitStop` with an actor scope); "2 HIT"/"3 HIT" plates move to the top HUD band, off the impact point.
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
`src/gameplay/waves.ts`. Build `src/v2/` directly on `createGame` (C-24) on day 0; it does not wait for PRD 13's arena-shooter template. When that template exists,
  the pilot's v2 code is offered to PRD 13 as the template's reference implementation (R-14-08, C-40 rows), and any template/route divergence is a
  PRD 13 finding, not a route blocker.

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

- **Robustness (P0, before art):** context-loss UI from the C-24 session state `"context-lost"` (stub shell) plus
  GPU resource restore from C-29 `ResourceRegistry` (PRD 11, R19) when real; standalone, the legacy route gets a declared fix that listens for
  `webglcontextlost`/`webglcontextrestored` on its canvas and shows a "Restoring graphics…" overlay that reloads the route state on restore; capture fails when the canvas region is
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
  now comes from the C-23 fixed-step loop and seeded C-24 scenarios, not a rigid camera).
- **VFX:** bubbles on thrust, silt kick-up near the seabed, breach shake and red light flicker; sonar ping as a screen-space ring with depth test.
- **Audio:** move from raw `HTMLAudioElement` (`deep-audio.ts:18-40`) to C-25 `createGameSoundEngine` with `reverb: "underwater"`; sonar return
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
  `state.deaths >= lives` transition the session to `results` (C-24 `shell.showResults`) with Restart; the HUD never shows 0 during `playing`.
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

- **Correctness (P0):** drive clips through C-19 `crossFadeTo` (the stub maps it to `node.play`,
  `index.ts:10970-10973`), never through `AnimationController({ clipRegistry })`, whose empty pose (C16, `index.ts:13871` area) is PRD 06's fix; add thief facing in `syncCharacterVisuals` (`main.ts:1353-1357`): yaw =
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

Fleet acceptance (integrated, §21.2): all 18 overall ≥ 7 (or withdrawn per §6.3), fleet mean ≥ 7.2, no fleet category mean below 6.0 (today particles 1.4,
atmosphere 1.4, IBL 1.5).

## 7. APIs to add, change and remove

This PRD provides **C-35** (art direction and game acceptance schema) and the route flags `A3D_QR_ROUTE_<ID>`. Engine and runtime APIs are
consumed through contracts, never redefined (§7.6, §12). Judgement records reuse C-32 types (`GameJudgement`, `PanelRoundRecord`,
`JudgeIdentity`, `GAME_VISUAL_CATEGORIES`, `GAME_NONVISUAL_CATEGORIES`) from `tools/quality-gate/src/contracts.ts` (PRD 12).

### 7.1 Art direction contract (C-35) — `@aura3d/game/art` (subpath reserved in PR 0a; types + validator only, 0 runtime bytes in play)

Files: the frozen C-35 surface is created by PR 0a at `packages/engine/src/contracts/art.ts` (custodian PRD 15; changes only by CCR) and
re-exported by `packages/game/src/art/index.ts` (owner 14). The block below is the "PRD 14 provides list" that C-35 freezes. The real
implementation lives in this lane's files `packages/game/src/art/{define,audit,snapshot}.ts` and `packages/game/src/art/acceptance/{requiredConditions,canvasBlankCheck}.ts`;
`packages/game/src/art/index.ts` switches its exports from the PR 0a stub (`auditArtDirection` returns `[]` with a `PENDING` marker) to them.
C-35 has no runtime slot and no flag ("data"): the validator is tooling and ships unflagged.

```ts
import type { AuraQualityTier } from "@aura3d/engine/contracts"; // C-27: "low" | "medium" | "high" | "ultra" ("auto" only in option types, R1)

/** Mirrors C-32 GAME_VISUAL_CATEGORIES in tools/quality-gate/src/contracts.ts (PRD 12, internal). T1.2 asserts the two lists are identical. */
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
  readonly exposureEV: number;           // authored; applied via C-05 setOutput({ exposure: 2 ** exposureEV }); honoured exactly once C-05 is real
}

export interface ArtFraming {
  readonly rig: "chase" | "flight" | "follow2d" | "fighting" | "shoulder" | "orbit" | "topDown" | "altitude" | "rail" | "static"; // = C-22 factory names
  readonly subjectHeightFraction: readonly [min: number, max: number]; // C-22 evidence().subjectScreenHeightFraction when real; route `framing` section until then
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
  /** Route-local stand-ins for engine features still on stubs (§12A.4); validator requires `request` to match /^R-14-\d{2}$/. */
  readonly standIns?: readonly { readonly feature: string; readonly file: string; readonly request: string; readonly removeWhen: string }[];
  readonly criticalCategories: readonly GameVisualCategory[]; // bold columns of §6.10
  readonly tiers: Readonly<Record<AuraQualityTier, { readonly particles: number; readonly shadowMap: number; readonly cascades: number; readonly textureMax: 1024 | 2048 | 4096 }>>;
}

/** Validates at build time; throws AuraArtDirectionError listing every violation. */
export function defineArtDirection(direction: GameArtDirection): GameArtDirection;

/** Used by `scripts/check-art-direction.mjs`: compares the mounted scene (snapshotForAudit) with the contract. */
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
    | "draws-over-tier-budget" | "emissive-fill" | "capture-branch";
  readonly detail: string;
}

/** Builds the snapshot from the authored scene (AuraSceneSnapshot), asset metadata in aura.assets.json, and diagnostics().drawCalls.
 *  Works on PR 0a stubs: it reads authored intent and measured draw counts only, never stub-reported GPU features. */
export interface AuraAssetManifestLike { readonly assets: Readonly<Record<string, { readonly triangles?: number; readonly textures?: number; readonly unlit?: boolean; readonly role?: string }>>; }
export function snapshotForAudit(app: AuraApp, assets: AuraAssetManifestLike): ArtDirectionSnapshot;

// packages/game/src/art/acceptance/requiredConditions.ts
/** Restricted evaluator: property paths, numeric/string/boolean literals, === !== < <= > >=, && || !, parentheses. No eval/Function.
 *  Scope = { beacon: window.__AURA3D_GAME__, ...window.__AURA3D_GAME_EVIDENCE__[route] }. Unknown path => { ok: false, reason: "unknown-path" }. */
export function evaluateRequiredCondition(expr: string, scope: Readonly<Record<string, unknown>>): { readonly ok: boolean; readonly reason?: "false" | "unknown-path" | "parse-error" };

// packages/game/src/art/acceptance/canvasBlankCheck.ts
/** rgba = sRGB RGBA8 pixels of the canvas rect; mask = HUD rects to exclude. Dark = Rec.709 luma < 10/255; colours counted after 5-bit quantisation. */
export function canvasBlankCheck(rgba: Uint8ClampedArray, width: number, height: number, mask: readonly { x: number; y: number; w: number; h: number }[],
  limits: { readonly maxDarkFraction: number; readonly minDistinctColors: number }): { readonly pass: boolean; readonly darkFraction: number; readonly distinctColors: number };
```

Validator rules (all fatal): `references.length >= 3`; no `lights.ambient` in the mounted scene; exactly one light with `shadow: true` unless
`lighting.key.type === "spot"` and the genre is `stealth` or `underwater-salvage` (up to 3 shadowed spots); every hero/character/vehicle/enemy role
has `minTriangles` and a texture set other than `BC`; no role resolves to a `KHR_materials_unlit` 4-triangle asset; `fill !== "ambient"`.
Audit rules added for the parallel plan (§1): `emissive-fill` fails any non-practical material with `emissiveIntensity > 0.1` whose node is not
listed as a light source in the art direction; `capture-branch` fails any `src/v2/**` source containing `capture=review`, `visualReviewCapture` or a
`window.__*__` evidence global other than the C-24 beacon (static scan in `scripts/check-art-direction.mjs`).

### 7.2 `tools/quality-rebuild-capture/games.json` — C-35 `GameEntryV2` fields (data owned by 14; schema `games.schema.json` owned by 12, R22)

PR 0a creates `games.schema.json` with every C-33/C-35 field optional, so this lane can write the data on day 0 without waiting for PRD 12 to make
fields required. The TypeScript below is C-35 as frozen in CONTRACTS.md, plus one additive field requested by CCR-14-1.

```ts
// C-35 (frozen), packages/engine/src/contracts/art.ts
export interface GameEntryV2 /* merged into the existing games.json entry: id, route, timeline, evidenceGlobal, hudSelectors, scenarios (C-33) */ {
  readonly wave: 0 | 1 | 2 | 3 | 4;
  readonly rebuildTier: "S-presentation" | "S-world" | "F";
  readonly artDirection: string;                       // "apps/<dir>/art/direction.ts"
  /** Conditions the timeline must reach; the shot is "capture-failed" (C-32 GateVerdict) if one is not met by its deadline. */
  readonly requiredConditions: readonly {
    readonly shot: string;                             // an existing games.json shot id, e.g. "04-action"
    readonly expr: string;                             // evaluateRequiredCondition grammar (§7.1); scope = beacon + route evidence sections
    readonly deadlineMs: number;
  }[];
  /** Fails a shot when the canvas region (HUD masked) is uniformly dark, independent of DOM HUD pixels.
   *  Defaults 0.9 and 2,000. A per-game override is allowed only with `reason` (space/underwater/night games, §7.2.1),
   *  and never above maxDarkFraction 0.97 (the Courier black frame measures 0.968 and must still fail on Courier). */
  readonly canvasBlankCheck: { readonly maxDarkFraction: number; readonly minDistinctColors: number; readonly reason?: string };
  readonly acceptance: GameAcceptance;                 // minOverall 7, minVisualCategory 5, critical (§6.10 bold), minNonVisual
  readonly budgets: GameBudgets;
}
export interface GameBudgets {
  readonly transferToPlayableMB: number;               // Medium tier (C-35 frozen as a single number)
  readonly routeJsGzipKB: number;                      // route chunk only, excluding engine and @aura3d/game
  readonly drawCalls: Readonly<Record<AuraQualityTier, number>>;
  readonly gameLogicCpuMs: number;                     // ≤ 4 (PRD 11 §17.1 separates engine CPU)
  /** CCR-14-1 (additive optional): per-tier transfer budgets from §17. Until merged, the scorecard reads them from the §17 table constant
   *  in tools/quality-gate/src/scorecard.ts. */
  readonly transferToPlayableMBByTier?: Readonly<Record<AuraQualityTier, number>>;
}
// C-33 field this lane also writes per entry: qrFlags: string[] = [ "A3D_QR_ROUTE_<ID>" ]  (CONTRACTS §5.4: same list the route passes to createGame)
```

Shot ids are the ones already in `games.json` (`defaults.requiredShots = ["02-opening", "03-mid", "04-action"]`, `mobileStopAfterShot: "03-mid"`, plus
each game's existing `05-*`/`02b-*`: Aura Clash `05-special`, Siege `05-charge`, Neon `05-burst`, Gravity `05-late-coast`, Mech `02b-arena-opening`
and `05-special`, Rooftop `05-charge`, Deep `05-grapple`, Patrol `05-banked-fire`, Bank `05-charge`, Orbital `05-shield`). This PRD does not rename
shots; it adds the state each shot must prove. Expression scope: `beacon` is `window.__AURA3D_GAME__` (C-24 `GameBeacon`: `route`, `state`,
`frame`, …); every other top-level name is a section of `window.__AURA3D_GAME_EVIDENCE__[route]`. The shell owns `session`, `sound`, `juice`,
`hud`, `perf`, `capture`; route sections use other names (`fx`, `framing`, `render`, `loading`, and gameplay names), so stub and real shells never
collide. Field names below are the contract each v2 route must publish.

#### 7.2.1 Per-game capture contract, route flag and budgets (seeds `games.json`; Medium draws ≤ 300 because the PRD 11 §17.2 runner gate runs forced Medium)

Route flag naming (CONTRACTS §5.1, owner 14): `A3D_QR_ROUTE_` + the `games.json` id with a leading `showcase-` or trailing `-showcase` removed,
upper snake case; URL/capture short name `route-` + the same suffix in kebab case (`route-bank-shot`, `route-aura-clash`). `--flags route-<id>`
means every lane flag at its registry default (off while `dev`) plus the route flag; `all,route-<id>` turns every lane flag on. Touch presets are
C-24 `TouchPreset` values only. `fx.liveCount` is C-24 `GameFxLayer.liveCount`, republished by the route in its
`fx` section.

| Game (`games.json` id) | Route flag | `04-action` required condition (`expr`, deadline) | Other required conditions | Touch preset / orientation | `canvasBlankCheck` override | Draws Low / Med / High | Transfer to playable, Medium |
|---|---|---|---|---|---|---|---|
| `aura-clash-showcase` | `A3D_QR_ROUTE_AURA_CLASH` | `combat.hitStopActive === true && fx.liveCount > 0`, 12 s | `03-mid`: `framing.subjectHeightFraction >= 0.45 && framing.subjectHeightFraction <= 0.6` (both fighters) | `dpad-4btn` / landscape | — | 150 / 150 / 150 | ≤ 15 MB |
| `showcase-blockfall-reactor` | `A3D_QR_ROUTE_BLOCKFALL_REACTOR` | `board.linesClearedThisRound >= 1 && fx.liveCount > 0`, 20 s | `03-mid`: `board.stackHeight >= 4` | `dpad-4btn` / both | — | 120 / 150 / 150 | ≤ 12 MB |
| `showcase-skyline-runner` | `A3D_QR_ROUTE_SKYLINE_RUNNER` | `player.airborne === true && fx.liveCount > 0` (jump with snow/landing FX), 10 s | `03-mid`: `level.act >= 2` | `dpad-2btn` / landscape | — | 150 / 250 / 250 | ≤ 15 MB |
| `showcase-turbo-drift-circuit` | `A3D_QR_ROUTE_TURBO_DRIFT_CIRCUIT` | `car.drifting === true && fx.liveCount > 0` (smoke), 15 s | `03-mid`: `car.speedKph >= 120` | `steer-pedals` / landscape | — | 150 / 300 / 350 | ≤ 15 MB |
| `showcase-siege-golf` | `A3D_QR_ROUTE_SIEGE_GOLF` | `structures.toppledThisShot >= 1`, 12 s | `05-charge`: `shot.power > 0.5`; `04-action`: `loading.sceneSwaps === 0` (no `setScene` between `02` and `04`) | `aim-drag` / both | — | 120 / 200 / 200 | ≤ 15 MB |
| `showcase-aurora-lander` | `A3D_QR_ROUTE_AURORA_LANDER` | `lander.touchdown === "landed"`, 40 s | `03-mid`: `lander.altitude < 30 && framing.padInFrame === true` | `aim-drag` (thrust + rotate) / both | `{ 0.95, 1500, "night sky" }` | 120 / 150 / 150 | ≤ 15 MB |
| `showcase-neon-swarm` | `A3D_QR_ROUTE_NEON_SWARM` | `swarm.killsThisWave >= 3 && fx.liveCount > 0`, 15 s | `05-burst`: `fx.liveCount >= 20` | `twin-stick` / both | — | 120 / 150 / 150 | ≤ 15 MB |
| `showcase-gravity-post` | `A3D_QR_ROUTE_GRAVITY_POST` | `pod.state === "in-flight" && pod.launchedBy === "keyboard"`, 10 s | `03-mid`: image check in the scorecard builder, every planet rect in `framing.planetRects` has lit-half mean luma ≥ 40/255 (no black planets) | `aim-drag` / both | `{ 0.95, 1500, "space" }` | 100 / 120 / 120 | ≤ 15 MB (from 46.8 MB) |
| `showcase-courier-rush` | `A3D_QR_ROUTE_COURIER_RUSH` | `delivery.completed >= 1`, 45 s | every shot: default canvas check (no override) | `steer-pedals` / landscape | — (must fail on the 0.968 black frame) | 150 / 300 / 300 | ≤ 15 MB |
| `showcase-pulse-tunnel` | `A3D_QR_ROUTE_PULSE_TUNNEL` | `gates.passedOnBeat >= 2 && fx.liveCount > 0`, 12 s | mobile `03-mid`: `framing.canvasMatchesViewport === true` (CSS size = viewport ± 1 px) | `lane-swipe` / both | — | 120 / 200 / 200 | ≤ 12 MB |
| `showcase-mech-hangar` | `A3D_QR_ROUTE_MECH_HANGAR` | `combat.lastHit === "heavy" && fx.liveCount > 0`, 20 s | `02b-arena-opening`: `loading.sceneId === "pit"`; every shot: `loading.fetchCount.mechHeroDecimated === 1` | `dpad-4btn` / landscape | — | 150 / 250 / 250 | ≤ 15 MB (from 28.5 MB) |
| `showcase-vault-breakers` | `A3D_QR_ROUTE_VAULT_BREAKERS` | `table.bumperHitsThisBall >= 1 && fx.liveCount > 0`, 20 s | `03-mid`: `ball.inPlay === true` | `flippers` / portrait | — | 100 / 100 / 100 | ≤ 15 MB |
| `showcase-rooftop-buckets` | `A3D_QR_ROUTE_ROOFTOP_BUCKETS` | `shot.result === "make" && characters.skinnedVisible >= 2`, 20 s | `05-charge`: `shot.meter > 0.5` | `aim-drag` / both | — | 150 / 200 / 200 | ≤ 15 MB |
| `showcase-gallery-shift` | `A3D_QR_ROUTE_GALLERY_SHIFT` | `guard.state === "alert" && fx.conesVisible >= 1`, 30 s | `03-mid`: `characters.thiefTracksApplied > 0 && characters.thiefYawErrorDeg <= 15` (C-19 `animationState().tracksApplied`) | `twin-stick` (move only) / both | `{ 0.93, 1500, "night interior" }` | 150 / 250 / 250 | ≤ 15 MB |
| `showcase-deep-recovery` | `A3D_QR_ROUTE_DEEP_RECOVERY` | `salvage.grappled >= 1`, 40 s | every shot: `render.readbacksThisFrame === 0` (C-28 counter via C-31 `frame`) | `twin-stick` / both | `{ 0.95, 1500, "deep water" }` | 150 / 200 / 200 | ≤ 15 MB |
| `showcase-patrol-wing` | `A3D_QR_ROUTE_PATROL_WING` | `drones.hitsThisSortie >= 1 && fx.liveCount > 0`, 30 s | `03-mid`: `rings.inFrame >= 1 && flight.throttle > 0.4` | `flight` / landscape | — | 150 / 230 / 230 | ≤ 15 MB |
| `showcase-bank-shot` | `A3D_QR_ROUTE_BANK_SHOT` | `table.pottedThisShot >= 1`, 15 s (today's `until` on `__BANK_SHOT_EVIDENCE__.potted` moves to the route `table` section) | `03-mid`: `balls.maxAngularSpeed > 0` (balls roll) | `aim-drag` / both | — | 100 / 120 / 120 | ≤ 12 MB |
| `showcase-orbital-defense` | `A3D_QR_ROUTE_ORBITAL_DEFENSE` | `fx.explosionsLive >= 1`, 20 s | `03-mid`: `framing.dronesUnderHud === 0` (drone screen bboxes vs `hudSelectors` rects) | `twin-stick` / both | `{ 0.95, 1500, "space" }` | 80 / 80 / 80 | ≤ 12 MB |

A route that cannot publish a listed field must add it to its evidence section in the same PR; renaming a field requires updating this table.

### 7.3 Scorecard — `apps/<id>/art/scorecards/<round>-<sha>.json` (schema in `tools/quality-gate/src/scorecard.ts`, owner 14, internal)

```ts
import type { GameJudgement, JudgeIdentity, PanelRoundRecord } from "./contracts";  // C-32, tools/quality-gate/src/contracts.ts (PRD 12, PR 0a)

export interface GameScorecard {
  readonly schema: "aura3d.game-scorecard/1";
  readonly gameId: string;
  readonly commit: string;
  readonly round: string;                              // checkpoint id, e.g. "IC-4" (C-32 PanelRoundRecord.round)
  readonly countedRound: 0 | 1 | 2;                    // 0 = baseline or engine-pending (§6.3); 1 or 2 = counted rejection-loop round
  readonly qrFlags: readonly string[];                 // resolved flags of the judged capture (C-31)
  readonly enginePending: readonly string[];           // integrated-critical contracts still on stubs in this round (§12.3), from diagnostics().degradations
  readonly captureRunId: string;                       // GitHub Actions run id
  readonly env: { readonly runner: string; readonly gpu: string; readonly browser: string };   // from capture report.environment
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

`pnpm exec tsx --tsconfig tsconfig.base.json tools/quality-gate/src/scorecard.ts --game <id> --run <runId> --round <IC-k>` (new file; `tools/*`
is not a pnpm workspace member, so `--filter` does not apply; the root script `quality:scorecard` is a root-manifest request to PRD 15, R-14-04,
and the direct command works without it) builds the file from the capture run, the C-32 `PanelRoundRecord` of that checkpoint
(`benchmarks/quality-rebuild/history/rounds/IC-<k>.json`, PRD 12), and the human-review form exports. It computes the §6.3 verdict, runs
`canvasBlankCheck` on the shot PNGs with the `hudSelectors` rects masked, sets `countedRound`/`enginePending`, and refuses to write `accepted` if
any required field is missing or the round is not a G-PANEL round. Standalone use (no PRD 12 record yet): `--panel tests/qr/prd14/fixtures/<file>.panel.json`.

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
  `?debug=animation` code paths (ignored with a warning by C-24 `captureFromUrl`, real in the PR 0a stub).
- Route evidence globals (`__AURA_CLASH_ARENA_PROOF__`, `__MECH_HANGAR_EVIDENCE__`, `__COURIER_RUSH_EVIDENCE__`, … 31+): never in `src/v2/`;
  they remain only in the frozen `src/legacy/` (which `games.json` `evidenceGlobal` keeps reading for flag-off captures) and are deleted with it.
- `scripts/write-performance-report.ts` (13 copies), route `*-audio.ts` wrappers (17), route spark pools (≥ 9), route `togglePause` (11), route
  `matchMedia('(prefers-reduced-motion)')` (17).
- `scripts/build-models.mjs` / `build-*.py` outputs registered as release hero/world assets (Mech, Deep, Bank, Vault, Gallery, Siege, Aurora, Patrol,
  Gravity, Pulse). Scripts may remain for colliders and greybox only, and their outputs are tagged `role: "collider" | "greybox"` and rejected by the
  art-direction validator as visible assets.
- `scripts/build-sfx.mjs` / `build-music.mjs` synthesized audio, except where the art direction declares a chiptune style (none of the 18 does).

### 7.6 Engine APIs consumed (owned elsewhere; full contract table in §12)

Names used in the per-game plans map to contracts as follows: "HUD kit" = C-24 `Hud`/`HudMountOptions`; "`GameSoundEngine`" = C-25
`createGameSoundEngine`/`GameSound`; "`game.fx`" = C-24 `GameFxLayer`; "`rigs.*`" = C-22 `app.camera.rigs`; "`sound.engine`" = C-25 `engine()`.

| Need | Contract (provider lane) | Surface used by v2 routes | What the PR 0a stub gives this lane on day 0 |
|---|---|---|---|
| Shell, session, hit-stop, HUD, touch, capture context, beacon, `game.fx` | C-24 (09) | `createGame`, `session.hitStop/slowMo`, `hud.set`, `captureFromUrl`, `fx.burst/trail` | wraps `createGameApp`; DOM HUD; beacon published; `fx` primitive-pool |
| Game audio | C-25 (09) | `GameSoundOptions.cues` with `asset` refs, `loop`, `engine`, `music` | wraps `GameAudio.ts`; `engine()` restarts voice on rate change |
| Camera rigs and layers | C-22 (08) | `app.camera.use(rig)`, `shake`, `punch`, `fovKick`, `rigs.static/fromSpec` | layers and `static`/`fromSpec` real; other factories static + degraded |
| Time, feel bus | C-23 (08) | `app.time.hitStop`, `app.feel.define/emit` | time controller real; feel channels count only real executions |
| Quality tier | C-27 (11) | `app.quality.settings`, `?aura3d-quality=` | table real; `auto` → high/medium |
| Output, exposure, environment background | C-05 (01) | `app.setOutput`, `scene().background({ environment: true })` | maps to today's tone map; Reinhard default at `WebGL2Device.ts:1906` until real |
| Lighting | C-10 (02) | `lights.*({ shadow })`, `shadow.fit`, `app.lighting.diagnostics()` | `legacy-3.0` model; today's shadow strengths (0.65 default at `ForwardPass.ts:913`, 0.32–0.38 root presets at `index.ts:12966-12968`) until `A3D_QR_LIGHTING` |
| Post presets, bloom, AA | C-13 (03) | `postPresets["neon-night" \| "arena-fight" \| …]`, `effects.bloom/antiAlias` | preset ids with empty values + `PRESET_PENDING`; legacy chain runs |
| Materials and overrides | C-15 (04) | `materialOverrides` (`colorMode: "multiply"`), `setMaterialVariant`, `inspectMaterials` | `color` lowers to `setTint`; other fields diagnostic-only |
| Asset manifest, admission | C-17 (05) | `aura3d assets add/inspect`, 1.1 fields when real | 1.0 writer; reader accepts 1.1 |
| Animation | C-19 (06) | `crossFadeTo`, `animationState()`, `socket()` | `crossFadeTo` → `node.play`; `socket` valid:false |
| VFX, sky, fog | C-20, C-21 (07) | `app.effects.*`, `sky.gradient/preetham/hdri`, `app.atmosphere.setFog` | primitive bursts; sky → `sky.dayNight`; linear fog |
| World queries | C-26 (10) | `app.world.ground()/height()/describeBiome()` | physics raycast or y=0 plane; height 0 |
| Runtime nodes | C-37 (15) | `app.nodes.add/remove`, `teleport`, `setInstanceTransforms` | `add/remove` remount (`RUNTIME_ADD_REMOUNT`) |
| Diagnostics | C-31 (12 schema, sections by owners) | `diagnostics().frame/appliedLook/qrFlags/degradations` | `qrFlags`, `degradations` real; other sections null |
| Looks and lint | C-34 (13) | `lookLint` findings in `check:art-direction` | host real; registered rules only |
| Capture, rubric, benchmarks | C-33, C-32, C-30 (12) | `capture-games.mjs`, `PanelRoundRecord`, scene G-REF results | today's capture script + `--flags`; types |
| Codemods | C-39 (15 registry; codemods by lanes, R21) | `core-v2`, `post-v2`, `pin-emissive-defaults`, `animation-3.1`, `camera-cast`, `prd11-batch-optout`, lighting migration | none until each lane ships its codemod |

## 8. Shader changes

Routes import only `@aura3d/engine` and `@aura3d/game`; there is no route-level GLSL and this lane edits no shader file. Each shader below is a
**request** to the owning lane (R-14-14, §12A.6), filed day 0 with this section as its spec, implemented there behind that lane's flag through
its contract (C-03 material lobes, C-13 post passes, C-20 particles/ribbons, C-21 sky/fog). The route never waits for it: every subsection names the
standalone fallback the v2 route ships with on stubs, and the full effect is judged only at checkpoints (integrated). GLSL is WebGL2
(`#version 300 es`); the WGSL port follows PRD 11.

| § | Effect | Owner / contract | Standalone fallback in the v2 route (no shader) |
|---|---|---|---|
| 8.1 | Planet surface, atmosphere, shield | 04 C-03 (+ 01 C-04 additive blend) | K5 albedo + normal maps, night-lights as `emissiveMap` at ≤ 0.6, cloud layer as a second slightly larger sphere with alpha; no rim shell |
| 8.2 | Aurora ribbon | 07 C-20 ribbons | 2–4 emissive alpha-blended ribbon meshes (authored GLB, UV-scrolled emissive map) |
| 8.3 | Underwater absorption, caustics, god rays | 07 C-21 (`mode: "absorption"`), C-13; 10 preset | exp2 fog colour-matched to depth bands; no caustics; no god rays |
| 8.4 | Emissive grid floor | 04 C-03 | grid baked into the floor's emissive texture (2k, mipmapped) |
| 8.5 | Pinball inserts | none (instances) | as specified |
| 8.6 | Felt, lacquer, car paint | 04 C-03 sheen/clearcoat | C-15 `clearcoat`/`roughness` fields (diagnostic-only on the stub, recorded) |
| 8.7 | Synthwave sky | 07 C-21 `sky.gradient` | stub lowers `sky.gradient` to `sky.dayNight` (degraded); route also mounts a backdrop dome GLB with the gradient baked |
| 8.8 | Ocean | 10 | normal-mapped flat water plane to the fog line |
| 8.9 | Vision cone | 07 C-20 | additive-free cone mesh with alpha gradient texture, depth write off (C-15 `depthWrite`), no soft depth |
| 8.10 | Rim term | 04 C-03 | team identity through C-15 material variants only (no tint over MR maps) |

### 8.1 Planet surface + atmosphere shell (Orbital Defense, Gravity Post) — owner PRD 04 (material preset `material.planet`, `material.atmosphere`)

- Surface fragment: `float ndl = dot(N, L); float day = smoothstep(-0.08, 0.18, ndl);` `color = mix(nightLights.rgb * nightIntensity, pbrLit(albedo, N, …), day);`
  clouds as a second layer: `albedo = mix(albedo, vec3(0.95), cloud.a * 0.85)` with cloud shadow `pbrLit *= 1.0 - 0.35 * cloudShadow(uv + L.xz * 0.002)`.
- Atmosphere shell: sphere at 1.025 R, front faces, additive blend (`ONE, ONE`, needs PRD 01 blend modes), depth test on, depth write off.
  `float rim = pow(1.0 - saturate(dot(N, V)), 4.0); float lit = saturate(dot(N, L) + 0.25);` `out = atmosphereColor * rim * lit * intensity` (HDR, 2–6).
  Terminator band: multiply by `smoothstep(-0.25, 0.1, dot(N, L))` and add a warm tint `vec3(1.0, 0.45, 0.2) * rim * (1.0 - abs(dot(N, L)) * 4.0)` clamped.
- Shield variant (Orbital): same shell with a hex mask texture, `alpha = rim * hex(uv * 24.0) * (0.3 + hitPulse)`, `hitPulse` a uniform array of 4 impact
  points with `exp(-distance(P, hit_i) * 8.0) * fade_i`.
- Fallback: no clouds on Low; shell alpha-blended while C-04 additive blending is not real; standalone fallback per the §8 index.

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

No renderer code is changed by this PRD. Each rebuilt v2 route changes only its own rendering configuration, through public builders and the
contracts in §7.6; the same configuration is correct on stubs and on real implementations because it states physical intent:

1. No `lights.ambient`. One shadowed key. `environments.hdri` or a PRD 10 environment preset with `background` per the art direction.
2. No `renderer.pixelRatio` overrides (delete Skyline's 0.7, Aura Clash's `min(DPR, 1.75)`, Rooftop's review 640 px width); DPR comes from the tier.
3. No `effects.antiAlias({ mode: "fxaa" })` stacked on MSAA (17 routes today); AA is the PRD 03 tier default.
4. Bloom: threshold ≥ 1.0 in linear HDR, knee ≤ 0.2, intensity from the art direction; emissive values authored in HDR (2–8 for lights and signs,
   ≤ 0.1 on base materials). Remove emissive used as fill light (Deep Recovery rock 0.26–0.46, Mech emissive strips 0.42–2.35, Gallery light-pool discs).
5. Fog authored in world units with the art direction's visibility distance (e.g. Turbo ~0.02, Courier ~0.03 at scene scale); one fog node per scene.
6. `castShadow: false` on backdrops, sky plates and distant scatter; no parked nodes far from the play area (PRD 09 FX layer hides instead of parking).
7. Draw budget per tier enforced by `node scripts/check-art-direction.mjs` (root alias `pnpm check:art-direction` via R-14-04) against
   `diagnostics().drawCalls` (C-28 counters, measured).
8. Every v2 route passes its flag list to `createGame({ qualityRebuild: { flags } })` (C-24) and writes the same list to `games.json` `qrFlags`.

## 10. Migration plan

1. **Route-flag dispatcher, day 0 (T1.10).** In each of the 18 routes: `git mv src/main.ts src/legacy/main.ts` (relative imports re-pathed only);
   kept gameplay modules moved to `src/gameplay/` with legacy imports re-pathed (no logic change); a new `src/main.ts` (≤ 30 LOC) resolves flags and
   dynamically imports one entry:

   ```ts
   // apps/<dir>/src/main.ts — owner 14
   import { resolveQrFlags } from "@aura3d/engine/contracts";        // packages/engine/src/contracts/flags.ts (CONTRACTS §1.1, PR 0a)
   const ROUTE_FLAG = "A3D_QR_ROUTE_BANK_SHOT" as const;              // §7.2.1
   const DEFAULT_ON = false;                                          // flipped to true only after G-PANEL acceptance (step 5)
   const flags = resolveQrFlags({ url: location.href, env: { VITE_A3D_QR: import.meta.env.VITE_A3D_QR }, options: { [ROUTE_FLAG]: routeFlagFromUrl(location, ROUTE_FLAG) ?? DEFAULT_ON } });
   void (flags.on(ROUTE_FLAG) ? import("./v2/boot") : import("./legacy/main"));
   ```

   `routeFlagFromUrl` accepts `?a3d-qr=…,route-bank-shot` and `?a3d-qr=…,A3D_QR_ROUTE_BANK_SHOT` (returns `undefined` when absent). It exists
   because PR 0a's short-name table has no route names; CCR-14-2 asks for `route-<id>` short names in `resolveQrFlags` (additive), after which
   the helper is deleted. v2 then passes its own list to `createGame({ qualityRebuild: { flags } })`.
2. **Trunk-based merges.** No long-lived `rebuild/<id>` branches. Every v2 PR (`qr/prd14/<id>/<topic>`) merges to `main` as soon as its standalone
   acceptance (§16.1) passes; with the flag off the shipped route is the frozen legacy route, so a v2 merge never changes production.
3. **Preview, not production:** every PR deploys a Vercel preview; `?a3d-qr=route-<id>` (or `all,route-<id>`) selects v2. The lane workflow
   `.github/workflows/qr-prd14-games.yml` captures changed routes with `capture-games.mjs` (`QRC_GAMES=<id>`, `QRC_LOCAL_BUILD=true`,
   `--flags route-<id>`) on macos-14.
4. **Showcase visibility:** in Phase 1 every game is set to `qualityGate.status: "in-rebuild"` and `publicShowcase: false` (no exceptions; §7.4 makes
   `publicShowcase: true` require `accepted`, and `scripts/check-route-health.mjs` enforces it). `apps/showcase-index` lists in-rebuild games only in a
   separate "In development" section with no quality claims and no thumbnail taken from a review capture; that section is not a public-showcase
   listing.
5. **Swap:** when a G-PANEL round accepts a game (§6.3), this lane sets `DEFAULT_ON = true` in that route's dispatcher in one PR, and PRD 15 records the
   route flag's state change at the next checkpoint (CONTRACTS §5.3). Production deploy follows
   `/Users/gurbakshchahal/AuraOne/AuraOne-Deploy-Final-PERMANENT.md` for any AuraOne-hosted target (this PRD does not define deployment). Tag the
   pre-swap commit `pre-rebuild/<id>`.
6. **Legacy removal (Phase 6).** After a route's default has been on for two checkpoints with no attributed regression, delete `src/legacy/`, the
   dispatcher and `routeFlagFromUrl`; `v2/boot.ts` becomes `main.ts`; the flag is added to `REMOVED_QR_FLAGS` by PRD 15.
7. **Assets:** promoted assets (§2.4) are admitted for v2 use without touching legacy; synth release assets are re-tagged `greybox` once only legacy
   uses them; byte deletion of unused GLBs happens in Phase 6 after legacy is gone.
8. **Kits** are staged from day 0 (Phase 3) in `apps/showcase-kits/`; a game's content tasks (Phase 4) consume whatever is approved and fall back to
   the §6.4 fallback column for the rest.
9. **Other lanes' codemods** (R21: core-v2, post-v2, pin-emissive-defaults, animation-3.1, camera-cast, prd11-batch-optout, lighting migration) are
   run by this lane on `src/v2/**` within 2 working days of each landing. They run on `src/legacy/**` only when a codemod is required to keep legacy
   compiling, as a declared no-visual-change PR.

## 11. Backward compatibility

- Flag off (the default until acceptance) serves the frozen legacy route; its only changes are the declared P0 correctness fixes (§14.1), each listed
  in its PR as a CONTRACTS §6.1 correctness exception so PRD 12 re-baselines that game's flag-off capture.
- Route URLs are unchanged. `vercel.json` rewrites (`/showcase/aura-clash/:path*`) are kept.
- Removed query params are ignored with a console warning by C-24 `captureFromUrl` in v2, not errors, so old links still load the game. Legacy keeps
  honouring them until Phase 6.
- `localStorage` best scores, ghosts and settings: v2 keys are versioned (`a3g:<route>:<key>:v2`); v1 values are read once and migrated where the rules
  did not change (Turbo laps, Aurora best runs, Neon best score); invalidated where physics tuning changes results (Bank Shot rolling resistance,
  Patrol stall model, Siege one-scene flow), with a one-time "records reset" toast. Legacy never reads v2 keys.
- Legacy evidence globals stay in `src/legacy/` (and `games.json` `evidenceGlobal`) until Phase 6, so `tools/showcase-library/*` gates keep running.
- Input bindings are unchanged unless a plan says otherwise (Gravity Post gains Enter launch; Gallery facing; nothing is removed).

## 12. Contracts consumed / provided (see CONTRACTS.md)

This PRD never depends on another PRD being merged. It consumes contracts, built against their PR 0a stubs, and provides C-35 and the route flags.

### 12.1 Provided

| ID | Surface | Consumers | Stub that must keep working | Real (this lane) | Conformance |
|---|---|---|---|---|---|
| C-35 | `GameArtDirection`, `defineArtDirection`, `auditArtDirection`, `ArtDirectionSnapshot`, `ArtDirectionViolation` (§7.1), `GameEntryV2`, `GameAcceptance`, `GameBudgets`, `RouteHealthQualityGate` (§7.2, §7.4) | 12 (scorecards, gates), 13 (templates follow pilot patterns) | PR 0a `packages/engine/src/contracts/art.ts` types + `auditArtDirection` returning `[]` with `PENDING`; `packages/game/src/art/index.ts` keeps exporting every C-35 name with the frozen signature at all times | `packages/game/src/art/{define,audit,snapshot}.ts`, `acceptance/*.ts`; ships unflagged (data/tooling) | `tests/unit/contracts/C-35-art.test.ts` (PRD 15) on stub and real; lane cases `tests/unit/contracts/impl/prd14-art.test.ts` |
| `A3D_QR_ROUTE_<ID>` ×18 | route flags (§7.2.1) | 12 (checkpoint captures via `games.json` `qrFlags`), 15 (flag-state file, `REMOVED_QR_FLAGS`) | flag off = frozen legacy route, captured at every checkpoint | `src/v2/**` per route | lane browser spec: flag off and flag on both boot to `playing` with 0 errors |
| C-40 rows `F-14-*` | facts handoff (pilot patterns: art-direction fields, framing values, FX/audio cue sets, tier budgets) | 13 | rows stay `proposed` until a capture run id is cited | appended to CONTRACTS Appendix B | PRD 13 consumes only `verified` rows |

### 12.2 Consumed (all built against PR 0a stubs; no consumption needs a PR 0b seam except where marked)

| ID | Provider | Used for | Stub behaviour this lane relies on (honest) | Effect when real (integrated only) |
|---|---|---|---|---|
| C-05 | 01 | `app.setOutput` exposure/tone map, environment background | existing tone map (Reinhard default `WebGL2Device.ts:1906`); DOM overlay; 0b seam for `setOutput` | HDR target, authored exposure honoured, one tone map |
| C-10 | 02 | key light `shadow`, `fit`, hemisphere, `app.lighting.diagnostics()` | legacy model; unknown fields null | strength 1, CSM, contact shadows, ambient additive to IBL (15 of 18 games) |
| C-13 | 03 | `postPresets`, bloom threshold/knee, AA mode | preset ids with `PRESET_PENDING`; legacy chain; 0b seam | real bloom threshold, no FXAA over MSAA, AO/SSR |
| C-15 | 04 | `materialOverrides` with `colorMode: "multiply"`, variants, `inspectMaterials` | `color` → `setTint`; other fields diagnostic-only | textures preserved under tint; clearcoat/sheen/transmission |
| C-17 | 05 | asset admission for kits and per-game assets | 1.0 writer, 1.1 reader | KTX2/Meshopt derived assets, admission and look-dev records |
| C-19 | 06 | clip playback, `animationState().tracksApplied` | `crossFadeTo` → `node.play` (immediate switch) | inertialized blends, IK, skinned shadows via C-11 |
| C-20 | 07 | `app.effects`, behind `game.fx` | primitive-pool bursts via C-37 `add` (remount) | particle pass, flipbooks, ribbons, decals |
| C-21 | 07 | `sky.*`, `app.atmosphere.setFog` | sky → `sky.dayNight` (degraded); linear fog | Preetham/gradient sky, height/absorption fog |
| C-22 | 08 | `app.camera.use(rig)`, layers, `rigs.static/fromSpec` | layers real; most factories static + degraded | genre rigs with framing, collision probe |
| C-23 | 08 | `app.time.hitStop/slowMo`, `app.feel` | time controller real; feel counts only real channels | feel channels execute VFX/audio/post |
| C-24 | 09 | `createGame`, session, HUD, touch, capture context, beacon, `game.fx` | wraps `createGameApp` (`index.ts:11818`), DOM HUD/shell, beacon published | `packages/game` shell, HUD kit, touch presets |
| C-25 | 09 | sampled cues, loops, engine RPM, music | wraps `GameAudio.ts`; `engine()` restarts voice | spatial HRTF, limiter, `game-sfx-core` pack |
| C-26 | 10 | `ground()`, `height()`, `describeBiome()` for terrain-heavy games | physics raycast or y=0; height 0 | terrain, scatter, water, biome rigs |
| C-27 | 11 | `app.quality.settings`, tier URL | table real; `auto` → high/medium | governor, calibrated tiers, forced-Medium runner gate |
| C-30 | 12 | read-only: benchmark G-REF results named in §16.2 | registry wraps today's 18 scenes | — |
| C-31 | 12 schema | `diagnostics().frame/appliedLook/qrFlags/degradations` in evidence and scorecards | `qrFlags`, `degradations` real; others null; 0b seam | measured sections from each owner |
| C-32 | 12 | `PanelRoundRecord`, `GameJudgement`, categories, verdicts | types + verbatim category list | G-PANEL records at IC-4/8/12 |
| C-33 | 12 | `capture-games.mjs`, `games.schema.json`, `--flags` | today's script; plugin loading + `--flags` arrive with 0b-3 | step plugins (R-14-01) |
| C-34 | 13 | `lookLint` findings folded into `check:art-direction` | host real after 0b-1; registered rules only | full rule set |
| C-37 | 15 | `app.nodes.add/remove` (FX pools), `teleport`, `setInstanceTransforms` | remount with `RUNTIME_ADD_REMOUNT`; 0b seam | subtree add/remove without remount |
| C-38, C-39 | 15 | app surface members; codemod registry | infrastructure | lanes' codemods (§10 step 9) |

Reached only indirectly, through the public builders and contracts above (this lane imports none of them): C-03 material lobes, C-04 blend
modes, C-07 tessellation/crease normals, C-09 environment sources, C-11 shadow casters, C-14 temporal history, C-18 deformation, C-28 device
counters/FrameStats (read through C-31 `frame`), C-29 device lifecycle (surfaced through the C-24 `context-lost` state).

### 12.3 Per-game integrated-critical contracts (replaces the old "blocking dependencies" table; feeds only the §6.3 `engine-pending` rule)

| Game(s) | Integrated-critical (round counts only if these are real in the `all` run) | Integrated-helpful (improve targets; never affect counting) |
|---|---|---|
| All | C-05 (exposure/HDR), C-10 (IBL + shadow 1), C-13 (bloom/AA), C-15 (texture-preserving tint), C-24, C-25, C-27 | C-22, C-23, C-34 |
| Bank Shot | C-10 spot shadow, C-03 via C-15 sheen/clearcoat (PRD 04) | C-21 volumetric spot |
| Turbo Drift | C-10 CSM + instanced casters, C-20 particles/ribbons, C-26 + PRD 10 road/terrain/scatter | C-13 speed streaks |
| Aura Clash | C-05 HDR, C-10 skinned casters (with C-19), C-13 SSR, C-20 flipbooks, C-21 rain | PRD 10 kit |
| Orbital Defense | C-04 additive (via C-15 `blend`), C-03 planet/atmosphere (PRD 04), C-20 | — |
| Vault Breakers | C-10 spot/area key, C-15 transmission | C-20 trails |
| Rooftop Buckets | C-19 skinned playback, C-10 skinned casters, C-20 ribbons | C-13 SSR court |
| Courier Rush | C-29 context restore (PRD 11), C-10 clustered lights + CSM, C-13 SSR, C-21 rain | PRD 11 batching |
| Neon Swarm | C-13 SSR, C-10 instanced casters, C-03 grid floor, C-20 | C-19 locomotion |
| Pulse Tunnel | C-21 gradient sky, C-20 particles, C-13 SSR | PRD 10 spline tunnel |
| Siege Golf | C-26 + PRD 10 terrain/scatter, C-20 debris/dust | C-10 CSM |
| Patrol Wing | PRD 10 ocean + C-26 terrain, C-20 trails, C-21 clouds, C-10 CSM | C-13 heat haze |
| Aurora Lander | C-20 aurora ribbons + particles, C-26 terrain, C-15 tint opacity | — |
| Gravity Post | C-03 planet/atmosphere, C-20 ribbons | PRD 10 space preset |
| Deep Recovery | C-21 absorption fog, C-13 god rays, C-20 snow, PRD 10 underwater preset, C-10 shadowed spot | — |
| Skyline Runner | C-19 rig playback, C-20 snow, C-21 per-act fog | PRD 10 parallax |
| Blockfall Reactor | PRD 01 crease normals (C-07), C-10 rect area light + instanced casters, C-20 bursts | — |
| Mech Hangar | C-19 rig + IK, C-10 per-scene lights | C-20 smoke |
| Gallery Shift | C-19 empty-pose fix (C16), C-10 ≥ 2 shadowed spots + clustered lights, C-20 cones | C-15 glass transmission |

## 12A. Parallel execution

### 12A.1 Day-0 start conditions

- Required: **PR 0a only** (CONTRACTS §3.9): contract types and stubs, the `packages/game` skeleton with `src/art/index.ts` re-exporting C-35,
  `tools/quality-gate/src/contracts.ts` (C-32), `tools/quality-rebuild-capture/games.schema.json` with every field optional, lane barrels,
  `.github/QR_OWNERSHIP.json`. The lane branches from the PR 0a branch the day it is pushed; it does not wait for PR 0a to merge.
- Not required: any PR 0b part, any other lane's real implementation, PRD 13 templates, PRD 05 admission, PRD 12 step plugins.
- Calls into C-05, C-13, C-31, C-33 plugins, C-34 and C-37 compile on day 0 against PR 0a types; their browser checks pass once the corresponding 0b
  part merges (scheduled 2026-10-06..07). No Phase 1 exit criterion depends on them.
- Agent fan-out on day 0 (all independent, no ordering): 1 infrastructure agent (§14.1 T1.1–T1.9), 18 game agents (one per route: T1.10–T1.12 then
  that game's Phase 2 and 4 tasks), up to 9 kit agents (K1–K9, Phase 3). Within a game, Phase 4 follows that game's Phase 2; nothing crosses lanes.

### 12A.2 Owned files and directories (exactly CONTRACTS §4.1 row "14" plus the lane-NN rule)

- `apps/showcase-*/` (every showcase app, including `showcase-index`, `showcase-webgpu-particle-lab`, `showcase-cinematic-architecture`, and the new
  `showcase-kits`), `apps/aura-clash-showcase/`, `apps/world-war-x-showcase/` (owned, not modified by this PRD).
- `packages/game/src/art/` (except the custodian-owned frozen surface, which PR 0a places at `packages/engine/src/contracts/art.ts`).
- `tools/quality-rebuild-capture/games.json`; `tools/quality-gate/src/scorecard.ts`; `tools/quality-gate/forms/`.
- `scripts/check-art-direction.mjs`, `scripts/check-route-health.mjs`.
- `docs/project/aura3d-quality-rebuild/evidence/games-after/`, `…/evidence/prd14/`, this PRD file.
- Lane-NN paths: `packages/*/src/lanes/prd14.ts`, `agent-api/compiler/diagnosticOnly.prd14.ts`, `packages/aura3d-cli/src/commands/prd14/`,
  `.github/workflows/qr-prd14-*.yml`, `tests/qr/prd14/**`, `tests/unit/contracts/impl/prd14-*`.
- Not owned, and therefore not edited by any task here: `capture-games.mjs`, `steps/`, `games.schema.json`, `quality-rebuild-capture.yml` (12);
  the rest of `tools/quality-gate/` (12); `packages/game/` outside `src/art/`, `tools/showcase-library/`, `eslint/qr/no-route-capture-flags.js`,
  `assets/packs/game-sfx-core/` (09); `GameRenderPreset.ts` (11); `aura.assets.json`, `src/aura-assets.ts`, `public/aura-assets/` (05, generated:
  only regenerated diffs for this lane's ids); root `package.json` (15); `packages/create-aura3d/**` (13); every engine/rendering file.
  Each former task that edited one of these is now a request in §12A.6 plus an owned-file alternative in §14.

### 12A.3 Feature flags

- 18 route flags `A3D_QR_ROUTE_<ID>` (§7.2.1), owner 14, state file entries maintained by PRD 15 from checkpoint records (CONTRACTS §5.3):
  `dev` until the game's standalone acceptance passes, `standalone-accepted` after, `integrated-accepted` when a G-PANEL round accepts it,
  `default-on` after two clean checkpoints (§10 steps 5–6).
- v2 routes opt into engine lane flags explicitly per CONTRACTS §5.4 (`createGame({ qualityRebuild: { flags } })`, same list in `games.json`
  `qrFlags`); checkpoints also capture each route with `all` and `none`.
- No other flag is introduced. The C-35 validator and the scorecard tooling are unflagged (data/tooling).

### 12A.4 Stubs used and how standalone results stay honest

All C-NN stubs in §12.2. Rules: (1) every scorecard records `qrFlags` and the `degradations` list from the capture (C-31), so a standalone frame is
never mistaken for an integrated one; (2) standalone visual changes are reported as "standalone screening", never as quality claims; (3) where a
stub is known to cost performance (C-37 remount, C-25 `engine()` restart), the route measures it and uses the §6.8 G13 fallback rather than
hiding the cost; (4) route-local stand-ins for missing engine features (G12 rigs, G13 FX pool, baked gradients in §8) are listed in each route's
`art/direction.ts` `standIns[]` field (validator-checked) and deleted when the real contract passes the same test.

### 12A.5 Integration checkpoints (where integrated acceptance is evaluated; never blocks)

| Checkpoint | What PRD 14 gets evaluated | Effect |
|---|---|---|
| IC-0 2026-10-08 | 18 legacy routes, flags `none`, vs `85aafcd0` (identity) | round-0 scorecards (`countedRound: 0`) |
| IC-1..IC-3, IC-5..7, IC-9..11 (weekly Thursdays) | every route with `none`, `all`, and its own `qrFlags`; vision screening only | findings into scorecards; `qr-ic-regression` issues filed against the owning lane by leave-one-out |
| G-PANEL IC-4 2026-11-05 | Wave 1 pilots (and any game whose standalone acceptance passed) | §6.3 accept / reject / `engine-pending` |
| G-PANEL IC-8 2026-12-03 | Wave 2 + round 2 of rejected pilots | same |
| G-PANEL IC-12 2026-12-31 and later | Waves 3–4 + round 2s | same; fleet criteria §21.2 evaluated from IC-12 on |

### 12A.6 Requests to other lanes (non-blocking; `qr-request`, `to:prdNN`, CONTRACTS §6.5) and CCRs

| Id | To | File / surface | Exact change | Serves | Meanwhile (this lane, owned files) |
|---|---|---|---|---|---|
| R-14-01 | 12 | `tools/quality-rebuild-capture/steps/acceptance.mjs` (new, 12) + `capture-games.mjs` | step plugin that calls `@aura3d/game/art` `evaluateRequiredCondition` before each named shot and `canvasBlankCheck` per shot; emit `capture-failed` with expr and last scope | C-33, C-35 | `tests/qr/prd14/browser/required-conditions.spec.ts`; scorecard builder runs `canvasBlankCheck` on PNGs |
| R-14-02 | 12 | `.github/workflows/quality-rebuild-capture.yml` | add `workflow_call` with `games`, `qr_flags`, `strict` inputs; 30-day artifact retention; `apps/**` path filter computes changed game ids | C-33 | `.github/workflows/qr-prd14-games.yml` runs `capture-games.mjs` directly on macos-14 |
| R-14-03 | 12 | G-PANEL schedule | include this lane's supplemental human play sessions (≥ 3 humans total, §6.3) in the IC-4/8/12 rounds; publish `history/rounds/IC-<k>.json` within 2 days | C-32 | scorecards accept `--panel` fixture files |
| R-14-04 | 15 | root `package.json` (root-manifest batch) | scripts `check:art-direction`, `check:route-health`, `quality:scorecard` | — | run `node scripts/…` / `pnpm exec tsx …` directly |
| R-14-05 | 09 | `tools/showcase-library/game-capture-parity.mjs` | `--fail-on-any` and `--routes` (today only `--fail-on-art`, `:30`; root script at `package.json:691`) | C-24 | `check-art-direction.mjs` `capture-branch` static scan of `src/v2/**` |
| R-14-06 | 11 | `packages/engine/src/production-runtime/GameRenderPreset.ts:373` (and `:450`) | side-view/game presets take `targetFormat` from C-05 `probeHdrTargetFormat` instead of `"rgba8"` | C-05, C-27 | Aura Clash v2 does not use the preset (§6.9.3) |
| R-14-07 | 05 | `assets/library/kits/`, admission | host K1–K7/K9 kits; admit K1 at 2k; confirm `public/aura-assets/` writes by `aura3d assets add` for lane-14 ids fall under the §4.3 generated-file rule | C-17 | stage in `apps/showcase-kits/`; three r185 look-dev page |
| R-14-08 | 13 | arena-shooter and other game templates | adopt Orbital/pilot v2 code as template references; consume `F-14-*` rows | C-40 | Orbital v2 built on `createGame` directly |
| R-14-09 | 09 | `assets/packs/game-sfx-core/` | include cues named in the 18 art directions' `audio[]` | C-25 | per-route licensed samples in `apps/showcase-kits/K8/` |
| R-14-10 | 08 | rig factories | `chase/flight/follow2d/fighting/shoulder/orbit/topDown/altitude` accept `framing.subjectHeightFraction`; evidence fills `subjectScreenHeightFraction` | C-22 | route-local rigs (G12) |
| R-14-11 | 07 | `effects.auroraRibbon`, vision-cone volume, `sky.gradient` bands, absorption fog, god rays | §8.2, §8.3, §8.7, §8.9 specs | C-20, C-21, C-13 | §8 fallback column |
| R-14-12 | 04 | `material.planet`, `material.atmosphere`, `material.gridFloor`, `rim` | §8.1, §8.4, §8.10 specs | C-03, C-15 | §8 fallback column |
| R-14-13 | 10 | ocean (`world.water({ mode: "ocean" })`), spline road, terrain splat, underwater preset | §8.8, §6.9.2, §6.9.14 | C-26 | flat normal-mapped water; offline road GLB; exp2 fog |
| R-14-14 | 01, 04, 07, 10 | §8 shader index | file each §8 row as its own issue on day 0 | as listed | as listed |
| CCR-14-1 | 15 + 14 + 12 | `packages/engine/src/contracts/art.ts` | add optional `GameBudgets.transferToPlayableMBByTier` | C-35 | scorecard reads §17 table constant |
| CCR-14-2 | 15 + 01 + 12 | `packages/engine/src/contracts/flags.ts` | `resolveQrFlags` URL list accepts `route-<id>` short names for `A3D_QR_ROUTE_*` | flags | `routeFlagFromUrl` helper (§10 step 1) |

## 13. Implementation phases

Every phase below starts on day 0 except where a dependency is inside this lane (marked "after <phase> for the same game"). Exit criteria are
standalone unless labelled "integrated"; integrated criteria are evaluated at checkpoints and never gate a merge or the next phase.

1. **Phase 1 — Program infrastructure, flags and baseline (day 0; target exit 2026-10-12).** C-35 implementation, scorecard builder, human form,
   lane CI, `games.json` V2 data, route-health gate, route-flag dispatchers in all 18 routes, art-direction contracts and reference boards for all 18,
   declared P0 correctness fixes in legacy.
   *Exit (standalone):* 18 `art/direction.ts` files validate; `tests/unit/contracts/C-35-art.test.ts` passes on stub and real; the scorecard builder fed
   `tests/qr/prd14/fixtures/run-37289688772.panel.json` (research/21 visual and research/20 non-visual scores transcribed verbatim into a C-32
   `PanelRoundRecord`) writes 18 `rejected` scorecards whose per-category values equal `_sections/B` §1 within ±0.05; the ambient-route fixture fails
   `check-art-direction.mjs`; the Courier black-frame fixture fails `canvasBlankCheck`; all 18 routes boot to `playing`-equivalent readiness with
   the flag off and match their pre-move capture (same `evidenceGlobal` values, no new console errors); each P0 fix passes its test (§14.1).
   *Integrated:* IC-0 round-0 scorecards recorded.
2. **Phase 2 — v2 shell port, all 18 in parallel (day 0, one agent per game).** `src/v2/boot.ts` on `createGame`; kept gameplay wired; scene modules
   authored to the art direction using existing admitted or greybox assets; no ambient, no capture branches, no debug UI; route-local rigs (G12);
   `game.fx` FX; sampled audio from existing route samples; HUD on C-24; `requiredConditions` sections published.
   *Exit (standalone, per game):* §16.1 S1–S9 pass with flags `route-<id>`; `src/v2/boot.ts` ≤ 400 LOC; legacy untouched (diff limited to
   moves). *Integrated:* screening scores recorded at the next weekly IC.
3. **Phase 3 — Kits (day 0, kit agents).** K1–K9 sourced, licensed, staged in `apps/showcase-kits/`, approved on the three r185 look-dev page,
   admitted per consumer with `aura3d assets add`.
   *Exit (standalone, per kit):* `kit.json` complete (licence, source, hash, tris, texture sizes per file); every file approved on the three r185
   turntable by a human; budgets in §6.4 met; zero agent-synthesized hero/world geometry.
4. **Phase 4 — Per-game content and genre work (after Phase 2 for the same game).** The §6.9 plan for that game: asset swaps, materials (C-15),
   lighting (C-10), camera framing, VFX, audio, juice, HUD, tech-art budgets; stand-ins listed in `standIns[]`.
   *Exit (standalone, per game):* §16.1 S1–S12 pass; §17 standalone budgets met with flags `none`; every §6.9 bullet either done or listed as a
   stand-in with its R-14-xx. *Integrated:* first counted G-PANEL round per §6.5.
5. **Phase 5 — Review rounds (integrated, checkpoint-driven).** Each G-PANEL round (IC-4, IC-8, IC-12, …) judges every game whose Phase 4 exit
   passed; rejected games get a findings list and one more counted round; `engine-pending` rounds do not count. Pilot retrospective after IC-4
   (filed as `qr-ic-regression` / `qr-request` issues and C-40 rows).
   *Exit (integrated):* each game accepted or withdrawn per §6.3.
6. **Phase 6 — Fleet lock and legacy removal (per game, after that game's acceptance + two clean checkpoints).** Route default flipped, then
   `src/legacy/` deleted; goldens registered with PRD 12 G-REG (request, R-14-03 thread); unused GLBs deleted; fleet budgets in lane CI.
   *Exit (integrated):* §21.2 fleet criteria met on one commit; two consecutive green fleet capture runs.

## 14. Task checklist

Conventions: every task is executable by one agent in owned files only. "Test" names the file that must exist and pass; unit tests under
`tests/qr/prd14/` run in `.github/workflows/qr-prd14-games.yml` (`pnpm exec vitest run tests/qr/prd14`, macos-14); browser specs under
`tests/qr/prd14/browser/` run there with Playwright against a local build of the route (remote runner only, never local). `<dir>` = route dir,
`<id>` = `games.json` id, `<ID>` = route flag suffix (§7.2.1).

### 14.1 Phase 1 — infrastructure, flags, baseline (day 0)

Infrastructure agent:
- [ ] T1.1 `packages/game/src/art/define.ts`: `defineArtDirection(direction)` implementing every §7.1 validator rule; throws `AuraArtDirectionError`
      listing all violations. `packages/game/src/art/index.ts` re-exports it in place of the PR 0a stub. Test `tests/unit/contracts/impl/prd14-art.test.ts`:
      one failing fixture per rule (fewer than 3 references; `fill: "ambient"`; hero without `minTriangles`; `textureSet: "BC"` on a hero; 2 shadowed
      directionals in a non-stealth genre; `standIns[].request` not matching `R-14-NN`) and one passing fixture.
- [ ] T1.2 Same test file: assert the `GameVisualCategory` union (as a runtime list exported for tests, `GAME_VISUAL_CATEGORY_LIST`) deep-equals C-32
      `GAME_VISUAL_CATEGORIES` imported from `tools/quality-gate/src/contracts.ts`, in order, 27 entries.
- [ ] T1.3 `packages/game/src/art/snapshot.ts` `snapshotForAudit(app, manifest)` and `audit.ts` `auditArtDirection(direction, snapshot)`; lights from the
      authored scene snapshot, `hasAmbient` from any `lights.ambient` node, models from the manifest's triangle/texture metadata, `drawCalls` from
      `app.diagnostics()`. Test `tests/qr/prd14/unit/audit.test.ts`: a synthetic snapshot with `hasAmbient: true`, a 4-tri unlit model and an
      `emissiveIntensity: 0.4` non-practical material returns exactly `ambient-light`, `asset-unlit-card`, `emissive-fill`.
- [ ] T1.4 `packages/game/src/art/acceptance/requiredConditions.ts` `evaluateRequiredCondition` (grammar §7.1; hand-written tokenizer + Pratt parser,
      no `eval`/`Function`). Test `tests/qr/prd14/unit/required-conditions.test.ts`: every `expr` in §7.2.1 parses; `fx.liveCount > 0` is true for
      `{ fx: { liveCount: 3 } }`; unknown path returns `unknown-path`; `constructor`/`__proto__` path segments are rejected as `parse-error`.
- [ ] T1.5 `packages/game/src/art/acceptance/canvasBlankCheck.ts` per §7.1. Test with fixtures `tests/qr/prd14/fixtures/courier-1920-03-mid.png`
      (from run 37289688772: meanLuma 1.7, darkFraction 0.968) fails with the defaults (0.9, 2,000); the `games.json` test (T1.13) asserts
      Courier has no override; `bank-shot-1920-03-mid.png` passes with the defaults; an override above 0.97 is rejected by the validator.
- [ ] T1.6 `tools/quality-gate/src/scorecard.ts`: `buildScorecard({ runReport, panel, humanForms, round })` and `verdict(scorecard, acceptance,
      integratedCritical)` implementing §6.3 including `countedRound` and `enginePending` from capture `degradations`; CLI per §7.3. Tests
      `tests/qr/prd14/unit/scorecard.test.ts`: all-7 vision + all-7 humans on a G-PANEL round → `accepted`; same on a screening round → refuses;
      one critical category at target − 0.5 → `rejected`; integrated-critical contract listed in `degradations` → `countedRound: 0`; missing human
      notes → throws.
- [ ] T1.7 `tools/quality-gate/forms/human-review.schema.json` + `tools/quality-gate/forms/index.html` (static, no network calls; exports one
      `human[]` entry as a JSON download). Test: the schema validates the exported example `tools/quality-gate/forms/example.json`.
- [ ] T1.8 `scripts/check-route-health.mjs`: fails when `publicShowcase: true` and `qualityGate.status !== "accepted"`, when `acceptedBy` is empty or
      contains an agent id, or when free-text `claim`/`systems` fields remain. Test `tests/qr/prd14/unit/check-route-health.test.ts` with fixture dirs.
- [ ] T1.9 `scripts/check-art-direction.mjs --routes <ids>`: (a) static `capture-branch` scan of `apps/<dir>/src/v2/**`; (b) builds the route, then
      in the lane workflow's Playwright job mounts it with flags `route-<id>`, collects `snapshotForAudit` + `lookLint` findings (C-34), runs
      `auditArtDirection`, exits 1 on any violation. Fixture route `tests/qr/prd14/fixtures/ambient-route/` must fail. Lane workflow
      `.github/workflows/qr-prd14-games.yml`: on PRs touching owned paths, runs T1.x unit tests, `check-route-health`, `check-art-direction` for
      changed routes, and `capture-games.mjs` with `QRC_GAMES=<changed ids>`, `QRC_LOCAL_BUILD=true`, `--flags route-<id>`; uploads
      `evidence/prd14/<run>/` artifacts.
- [ ] T1.13 `tools/quality-rebuild-capture/games.json`: add `wave`, `rebuildTier`, `artDirection`, `requiredConditions`, `canvasBlankCheck`,
      `acceptance`, `budgets`, `qrFlags` for all 18 from §6.10 and §7.2.1. Test `tests/qr/prd14/unit/games-json.test.ts`: validates against
      `games.schema.json` (PR 0a) and against the C-35 types (every field present, shots exist in each timeline, Courier has no override).
- [ ] T1.14 `tests/qr/prd14/fixtures/run-37289688772.panel.json`: research/21 and research/20 scores transcribed verbatim into a C-32
      `PanelRoundRecord` (`round: "baseline-c08d8acb"`); seed `apps/<dir>/art/scorecards/baseline-c08d8acb.json` for all 18 with `verdict: "rejected"`.
- [ ] T1.15 Append `F-14-01` (art-direction schema fields) and `F-14-02` (route-flag pattern) to CONTRACTS Appendix B as `proposed`.
- [ ] T1.16 File R-14-01 … R-14-14 and CCR-14-1/2 as issues on day 0 with the §12A.6 text.

Per-game agents (all 18, independent):
- [ ] T1.10 Dispatcher: `git mv src/main.ts src/legacy/main.ts`; move the §5 "Keep" modules to `src/gameplay/` (imports re-pathed only); add the §10
      step 1 `src/main.ts` with this route's flag; add `src/v2/boot.ts` that mounts `createGame({ id: "<id>", target, scene, qualityRebuild: { flags:
      ["A3D_QR_ROUTE_<ID>"] } })` with an empty scene and publishes the beacon. Test `tests/qr/prd14/browser/<id>-dispatch.spec.ts`: flag off boots
      legacy with the same `evidenceGlobal` keys as before the move and 0 new console errors; `?a3d-qr=route-<id>` boots v2 to
      `window.__AURA3D_GAME__.state === "playing"`.
- [ ] T1.11 `apps/<dir>/art/direction.ts` and `apps/<dir>/art/references/references.json` (≥ 3 entries, ≥ 3 shipped three.js/WebGL comparables) from
      §6.9; human approval recorded as a PR review on the file. `route-health.json`: `qualityGate.status: "in-rebuild"`, `publicShowcase: false`,
      free-text claims removed (Aura Clash: create the file).
- [ ] T1.12 Declared P0 correctness fixes in `src/legacy/` (each PR body: "CONTRACTS §6.1 correctness fix; PRD 12 re-baseline <id>"), each with a test:
  - [ ] Bank Shot: in `syncVisuals` (`legacy/main.ts:741-745`) call `handle.setRotation(...ballEulerFromBody(q))` with
        `src/gameplay/ball-visuals.ts` `ballEulerFromBody`. Test `tests/qr/prd14/bank-shot/ball-visuals.test.ts`: rolling 1 m along +x with radius r
        rotates −1/r rad about z within 1%.
  - [ ] Gallery Shift: in `syncCharacterVisuals` (`legacy/main.ts:1353-1357`) `app.nodes.get("thief")?.setRotation(0, yaw, 0)` with yaw from
        `src/gameplay/facing.ts` `facingYaw(prevYaw, moveX, moveZ, dt, halflife = 0.08)`. Test: moving +x for 10 frames at 60 Hz yields yaw within
        5° of π/2.
  - [ ] Gravity Post: call `steerKeyboardAim(dt)` (`:1447`) from the input update and `launchActiveAim()` (`:1455`) on Space/Enter keydown. Browser
        test: keyboard-only launch reaches `pod.state === "in-flight"` within 3 s.
  - [ ] Skyline Runner: read `lives` from the level config (`level.ts:372`) instead of the literal at `main.ts:3960`; when `state.deaths >= lives` end
        the run (results overlay + Restart). Test `tests/qr/prd14/skyline-runner/lives.test.ts`: HUD `livesRemaining` never shows 0 while
        `phase === "playing"`.
  - [ ] Turbo Drift: in `hud.ts:146` replace `<b aria-hidden="true">G</b>` with `<kbd class="keycap" aria-hidden="true">G</kbd>` + CSS
        `margin-inline-end: 0.4em`; hidden on `(pointer: coarse)`. Test: rendered text of `#ghost-toggle-control` reads "G Ghost OFF" (with a gap).
  - [ ] Pulse Tunnel: `styles.css:16-47` `.pulse-shell` becomes 100dvh full-bleed on `(max-width: 900px)`. Browser test at 390×844@3: canvas CSS
        size equals viewport ± 1 px.
  - [ ] Siege Golf: replace `app.setScene(buildHoleScene(...))` inside `applyCameraPhase` (`:975`) with one scene per hole plus a camera pose change.
        Browser test: p95 rAF interval across a scripted shot ≤ 50 ms at 1280×720 on macos-14; delete the debug slider section (`:111-117`).
  - [ ] Deep Recovery: delete `effects.volumetricFog` (`:280-285`), keep `effects.fog`. Browser test: 1920×1080 p50 ≤ 50 ms and C-28 readbacks
        0 per frame after warm-up.
  - [ ] Courier Rush: canvas `webglcontextlost` (preventDefault) / `webglcontextrestored` handlers with a "Restoring graphics…" overlay that
        re-mounts the scene. Browser test via `WEBGL_lose_context`: overlay appears, then canvas-region `canvasBlankCheck` passes after restore.
  - [ ] Gravity Post and Orbital Defense: render the HUD only when a displayed value changed (string compare before `innerHTML`, Gravity `:2378`,
        Orbital `:342`). Test: 300 frames with constant state cause ≤ 1 DOM write.
  - [ ] Neon Swarm: apply `cameraDirector.update(...)` output (`:1667`) to the camera instead of discarding it. Browser test: camera pose changes
        while the player moves.
  - [ ] Rooftop Buckets: call `setMaterial` (`:1184,1223,1239`) only on state change. Test: 300 frames with constant `isGold` → 0 calls.
  - [ ] Mech Hangar: fetch `mechHeroDecimated` once and share the handle. Browser test: one network request for its URL.
  - [ ] Debug/marketing UI shipped to players (declared fix): Siege sliders (above), Bank `.evidence-strip` (`styles.css:105` + markup), Gallery
        evidence strip (`:347`), Patrol evidence strip (`:136`), Orbital "Checksum"/"Systems" and the `:74` claim text, Aurora "PROTOTYPE" sidebar.
        Test: browser text scan of the play view finds none of these strings.

### 14.2 Phase 2 — v2 shell port (each game, day 0, in `apps/<dir>/src/v2/`)

For each of the 18 games:
- [ ] T2.1 `src/v2/boot.ts`: `createGame` with `layout: "full-bleed"`, `hud` widgets from the art direction (`maxScreenFraction` 0.15 on phones),
      `touch.preset` from §7.2.1, `sound.cues` with `asset` refs only (C-25; existing route samples or `apps/showcase-kits/K8/`), `juice` map from
      §6.9; wire `src/gameplay/**` to `game.session.scaledDt`. No `?capture=` reads; scenarios in `src/v2/scenarios/*.ts` set state only.
- [ ] T2.2 `src/v2/scene/{world,lighting,camera,fx,materials}.ts` from the art direction: no `lights.ambient`; exactly one shadowed key (stealth and
      underwater ≤ 3 spots); `environments.hdri` (K1 or the 1k fixture) with `scene().background({ environment: true })`; `app.setOutput({ exposure })`
      from `exposureEV`; post via `postPresets[<preset>]`; no `effects.antiAlias({ mode: "fxaa" })`; no `renderer.pixelRatio`; emissive ≤ 0.1 on
      non-light materials; `castShadow: false` on backdrops; no parked nodes. Existing admitted assets only in this phase; tinted models use
      `materialOverrides` with `colorMode: "multiply"`, never `replaceTextures`.
- [ ] T2.3 `src/v2/scene/camera.ts`: a route-local `AuraCameraRig` (G12) implementing the art direction's `framing` (subject fraction, FOV, mobile
      orientation) passed to `app.camera.use(rig, { blend })`; listed in `standIns[]` with R-14-10. Test `tests/qr/prd14/browser/<id>-framing.spec.ts`:
      route `framing.subjectHeightFraction` within the art-direction range in `03-mid` at 1920×1080 and 390×844.
- [ ] T2.4 `src/v2/scene/fx.ts`: every gameplay event in the art direction's `vfx[]` calls `game.fx.burst/trail`; measure p95 during the `04-action`
      burst; if > 50 ms with `RUNTIME_ADD_REMOUNT` in `degradations`, switch to `apps/showcase-kits/src/fx/prewarmedFxLayer.ts` (G13, written once by the
      first game that needs it) and list it in `standIns[]`.
- [ ] T2.5 `src/v2/evidence/*.ts`: publish the §7.2.1 route sections (`fx`, `framing`, `render`, `loading`, gameplay sections) under
      `window.__AURA3D_GAME_EVIDENCE__["<id>"]`, lazily computed, no per-frame allocation > 1 KB.
- [ ] T2.6 Browser spec `tests/qr/prd14/browser/<id>-v2.spec.ts` with flags `route-<id>`: boot to `playing`; 0 console/page errors over a 60 s
      scripted timeline; every §7.2.1 condition reached by its deadline (`evaluateRequiredCondition`); `canvasBlankCheck` passes on every shot;
      keyboard-only and touch-only playthrough of the first objective; `visibilitychange` → `session.paused === true`; `appliedLook` equal between play
      URL and every scenario URL.

### 14.3 Phase 3 — kits (day 0, kit agents)

- [ ] T3.1 `apps/showcase-kits/package.json` (`three@0.185.1` exact, private, no deploy target), `apps/showcase-kits/lookdev/index.html` + `main.ts`:
      loads one GLB/HDRI/texture set by query, renders side by side in three r185 (`MeshStandardMaterial`/`MeshPhysicalMaterial` from glTF,
      `PMREMGenerator` on the chosen HDRI, ACES, sRGB output) and Aura (`createAuraApp`, same HDRI, flags `all`); turntable 8 frames; export PNG strip.
      Browser test (remote): the damaged-helmet fixture renders non-blank in both panes.
- [ ] T3.2 For each kit K1–K7, K9: `apps/showcase-kits/<Kn>/kit.json` (schema `apps/showcase-kits/kit.schema.json`: per file `source`, `licence`,
      `sha256`, `triangles`, `textures[]`, `lookdev: { runId, reviewer, verdict }`) and the source files (Git LFS per `.gitattributes`, request to PRD 12
      if a new pattern is needed). Test `tests/qr/prd14/unit/kits.test.ts`: every file has a licence in the allow-list, a hash that matches, and an
      `accept` verdict before any route references it.
- [ ] T3.3 K8: `apps/showcase-kits/K8/cues.json` mapping each art-direction `audio[]` cue to licensed samples (`provenance: "sample"`); loudness
      normalized to −16 LUFS integrated (measured with `ffmpeg -af ebur128` on the remote runner, values recorded).
- [ ] T3.4 Admission per consumer: `aura3d assets add --type <kind> <file> --id <id>` from the consuming route's PR; commit only the regenerated
      `aura.assets.json`/`src/aura-assets.ts` diff for that id; CI `--check` identical.

### 14.4 Phase 4 — per-game content (each game, after its own Phase 2)

Common to every game (each a separate PR, each re-running T2.6 and `check-art-direction`):
- [ ] T4.0 Replace greybox/synth/card assets with kit or promoted assets per §6.9 "Assets"; update `art/direction.ts` `assets[]`; the audit must report
      0 `asset-*` violations.

Bank Shot
- [ ] Admit K4 pool-hall set and the K1 pool-hall HDRI; `src/v2/scene/world.ts` mounts them; no `ball-shadow-NN` cylinders (legacy `main.ts:234-247`
      not ported).
- [ ] 16 balls on one 1k atlas (numbers/stripes), table ≥ 20k tris with UVs, cue ≥ 3k tris; `art/direction.ts` roles updated.
- [ ] `lighting.ts`: one `lights.spot({ shadow: { mapSize: 2048 }, angle: 0.75, penumbra: 0.5 })` over the table; no rim directional or tinted rim points.
- [ ] `materials.ts`: felt `sheen` 0.6 + fibre normal at 8× tiling; walnut `clearcoat` 0.8; ball `clearcoat` 1.0, `roughness` 0.05 (C-15 fields).
- [ ] `camera.ts`: aim rig bound to aim yaw, 0.4 s blend to the roll view. Browser test: cue-ball subject fraction in `05-charge` 0.08–0.2.
- [ ] Cue strike (pull-back ∝ power, 80 ms stroke); pocket drop 6 cm over 120 ms; chalk puff (12) + break dust (24) via `game.fx`.
- [ ] Cue gain/pitch from impact speed. Test `tests/qr/prd14/bank-shot/audio-map.test.ts`: speeds 1 and 4 m/s differ by ≥ 6 dB.
- [ ] `juice`: `break` (trauma 0.25, hit-stop 30 ms), `eight-ball` (slow-mo 0.5× for 0.6 s) via `session.hitStop/slowMo`.

Turbo Drift Circuit
- [ ] Road GLB extruded offline from the existing centreline data (UV'd 2k asphalt, racing-line mask, kerb decals) in `apps/showcase-kits/K3/turbo-road/`;
      `turboCircuitEnvironmentV2` not used by v2; K3 terrain splat; ~1,200 instanced trees via `instances.model` with per-instance scale; mountain
      impostor ring; no 500-unit ground; no `#df967d` clear (`scenery.ts:39`).
- [ ] Hero car ≥ 30k tris with separate wheels; `src/v2/scene/car-visuals.ts` wheel spin/steer + body roll spring (halflife 0.12 s). Test
      `tests/qr/prd14/turbo/car-visuals.test.ts`: roll sign matches lateral acceleration sign.
- [ ] Sun directional aligned to the HDRI sun with `shadow: { cascades: 3 }` (C-10; one map on the stub); no point lights, no ambient (legacy
      `main.ts:3383` not ported). Browser test with flags `all`: car shadow ≥ 30 px at 1920×1080 chase view (integrated check, recorded only).
- [ ] Chase rig per §6.9.2 (route-local until R-14-10); tyre smoke ∝ slip and skid trails via `game.fx`; no drift ellipse gizmo.
- [ ] Engine cue via `sound.engine({ cue: "car-sport", rpmRange: [900, 8000], pitchRange: [0.6, 1.8] })`. Test: RPM 3,000→7,000 raises rate monotonically.
- [ ] Racing HUD (tach, gear, lap, position, minimap) on C-24 `hud`; `src/v2/boot.ts` ≤ 400 LOC.

Aura Clash Arena
- [ ] Do not use the side-view `GameRenderPreset`; `app.setOutput({ toneMapping: "aces", exposure: 2 ** exposureEV })` and `postPresets["arena-fight"]`;
      no DPR clamp (legacy `AuraClashArenaApp.ts:1530`). Browser test: `diagnostics().appliedLook.toneMapping` is `"aces-filmic"`.
- [ ] `arenaScale = 1.0` (legacy computes 0.5876 at `:837-844`), fight plane and camera bounds recomposed; `Prop_ACUnit_*`/`Prop_Bollard_*`
      (filtered at `:872-877`) restored as a foreground layer.
- [ ] No baseColor/MR/emissive overrides (legacy `collectFighterFlashMaterials`, `:3371-3425`); team identity by C-15 material variant; victim-flash
      pulse kept via `materialOverrides` `emissiveIntensity` only during the pulse.
- [ ] Spot key + rim directional + 2 neon practicals; no per-fighter point keys (legacy `:920-952`); K1 night-city HDRI.
- [ ] Fighting framing: subject fraction 0.5, fov 32. Browser test: both fighters' bbox height 45–60% of frame in `03-mid`.
- [ ] Hit VFX (burst + 0.08 s point light + ring + landing dust), dash trail, rain; full-bleed shell with HUD health bars/timer/portraits;
      self-hosted Saira `@font-face` from `apps/aura-clash-showcase/public/fonts/` (licence file alongside).
- [ ] Music, announcer, crowd bed through C-25 cues; replace the rival `Zombie_Walk_Fwd_Loop` clip with a walk clip from K6.

Orbital Defense
- [ ] `src/gameplay/waves.ts` extracted from legacy `main.ts` with a unit test (spawn cadence 1.8 s, shield segments 5); v2 on `createGame` directly.
- [ ] Planet: K5 maps on a 128×64-segment sphere, night lights as `emissiveMap`, cloud sphere (§8.1 fallback) until R-14-12 lands; starfield HDRI;
      asteroid belt 300 instances.
- [ ] Station, interceptor and two drone GLBs ≥ 5k tris each, PBR, from K7.
- [ ] Bolts, explosions (3 sizes), shield ripple, muzzle flash via `game.fx`; 40 ms hit-stop on multi-kill.
- [ ] Camera 25–35° above the plane, planet 65–75% of frame height; drones kept out of HUD rects. Browser test at 1920×1080 and 390×844:
      `framing.dronesUnderHud === 0`.
- [ ] C-25 cue set + music.

Phases 4 for Waves 2–4 (one epic per game; each bullet of the game's §6.9 plan is one PR; standalone tests named here):
- [ ] Vault Breakers: promote `vaultBreakersCabinet` + `vaultBreakersFlipperReal`; 4k playfield on a UV'd plane aligned to `table.ts` (test: insert
      positions in texture space match `missions.ts` insert coordinates within 2 mm); chrome ball without emissive (legacy `main.ts:131-139` not
      ported); instanced insert lamps driven by mission state; DMD backglass; `flippers` touch preset.
- [ ] Rooftop Buckets: skinned `rooftopLayupScorer`/`rooftopDefender` in play via C-19 `crossFadeTo` (test: `characters.skinnedVisible >= 2` and
      `animationState().tracksApplied > 0` on both); open skyline (K1/K2); glass backboard, rim, vertex-animated net; arc ribbon via `game.fx.trail`;
      shoulder framing; unused athlete GLBs dropped from the art direction.
- [ ] Courier Rush: K2 modular city replacing `city.block` usage (not ported); ≤ 300 draws Medium measured; van with separate wheels; rain via
      `game.fx`/`app.effects`; chase framing ~6 m/12°; mobile HUD ≤ 15% of screen (browser test: HUD rect area / viewport ≤ 0.15 at 390×844).
- [ ] Neon Swarm: plaza with baked grid emissive (§8.4 fallback) until R-14-12; rigged K6 player with run/strafe/fire; 2–3 drone meshes ≥ 3k tris;
      top-down framing with look-ahead; ≤ 5k-tri lamps in frame.
- [ ] Pulse Tunnel: segment conveyor in `src/gameplay/conveyor.ts` (test: recycling keeps ≤ N live segments, N from the tier); baked synthwave dome
      (§8.7 fallback) plus `sky.gradient`; chase framing with FOV kick and ±6° roll; review-only VFX re-authored as `game.fx` calls; 1–2k mipmapped
      textures; `art-review/` not referenced by v2.
- [ ] Siege Golf: K3 terrain + castle kit; K1 golden-hour HDRI; crate/plank maps restored (no `paintedTimberMaterial`); one scene per hole with aim /
      flight / settle rigs; splinter debris via `game.fx`; test `loading.sceneSwaps === 0` across a shot.
- [ ] Patrol Wing: normal-mapped water plane to the fog line (R-14-13 for ocean); island heightfield ≥ 128 with splat; HDRI-aligned sun key; flight
      framing; stall model in `src/gameplay/flight.ts` (test: at throttle 0 and level attitude, airspeed never drops below `minAirspeed` without
      altitude loss); contrails via `game.fx.trail`; drones ≥ 5k tris.
- [ ] Aurora Lander: emissive ribbon meshes (§8.2 fallback); terrain far rings + horizon skirt; textured lander 3–5k tris; nozzle point light ∝
      thrust (0–8, range 12 m); plume/dust/snow via `game.fx`; framing keeps the pad in frame (test: `framing.padInFrame` in 100% of `03`/`04` shots);
      translucent ghost via `materialOverrides` `opacity` 0.35.
- [ ] Gravity Post: instanced stars/dust/beads (≤ 120 draws Medium); K5 planets ≥ 32k tris; sun point light with distance falloff; K7 craft; flight
      path as `game.fx.trail`; follow-and-zoom framing; dock gate maps restored (no override, legacy `main.ts:492-499` not ported).
- [ ] Deep Recovery: exp2 depth-band fog (§8.3 fallback); heightfield seabed + instanced rocks/coral + textured wreck; textured sub with propeller;
      emissive on base materials ≤ 0.1; searchlight + headlight spots attached to the sub and updated each frame; camera smoothing 0.15; C-25 cues
      with `reverb: "underwater"`.
- [ ] Skyline Runner: rig and animate `skylineHeroRunner` (C-19); textured platform kit; backdrop re-cut into 3–4 parallax layers; one act rig
      mounted at a time; per-act fog via `app.atmosphere.setFog`; snowfall via `game.fx`; no card assets, no `lights.studio`.
- [ ] Blockfall Reactor: no `createLockedBlockNodes` (legacy `main.ts:630`) or A/B probe (`:763-826`); one text node per score field; one WebGL
      context; lit 3D arcade room; cabinet re-textured without occluders; tilted (8–12°) drifting camera, fov 40–50; lock flash, hard-drop trail, clear
      bursts; sampled stems.
- [ ] Mech Hangar: rigged animated mechs (walk/strike/recoil/hit/KO via C-19); hangar kit; hangar and pit as separate scenes via `game.setScene`
      with a fade transition (test: `loading.sceneId === "pit"` in `02b-arena-opening`); combat VFX; sampled audio.
- [ ] Gallery Shift: thief and guards from one K6 family animated via C-19 `crossFadeTo` (test: `characters.thiefTracksApplied > 0`); textured
      museum + exhibits + alpha/Fresnel glass; flashlight spots that follow the guards (≤ 3 shadowed); cone meshes (§8.9 fallback); follow framing.
- [ ] Every game: request its first counted G-PANEL round by adding the game id to `evidence/prd14/review-queue.json` with the commit.

### 14.5 Phase 5 — review rounds (integrated; checkpoint-driven)

- [ ] T5.1 After each G-PANEL record lands: `scorecard.ts --round IC-<k>` for every queued game; commit `art/scorecards/IC-<k>-<sha>.json`.
- [ ] T5.2 Rejected: write `findings[]` into a `qr/prd14/<id>/round-2` issue with one task per finding; `engine-pending`: list the stubbed contracts
      and leave the game queued for the next G-PANEL round.
- [ ] T5.3 After IC-4: pilot retrospective recorded as issues and rows only: each engine gap → a `qr-ic-regression` issue against the owning
      lane with the capture run id; each reusable pattern → a C-40 row `F-14-1x` for PRD 13.
- [ ] T5.4 Accepted: reviewer sets `qualityGate.status: "accepted"` with `acceptedBy` human logins; this lane flips `DEFAULT_ON` (§10 step 5).

### 14.6 Phase 6 — fleet lock and legacy removal (per game)

- [ ] T6.1 Two checkpoints after the default flip with no attributed regression: delete `src/legacy/`, the dispatcher and `routeFlagFromUrl`;
      rename `src/v2/boot.ts` to `src/main.ts`; ask PRD 15 to add the flag to `REMOVED_QR_FLAGS`.
- [ ] T6.2 Request PRD 12 to register the accepted captures as G-REG goldens for every viewport.
- [ ] T6.3 Remove assets with 0 consumers through `aura3d assets` (regenerated manifest diff), including synth release models and the 82 MB
      `apps/showcase-pulse-tunnel/art-review/`.
- [ ] T6.4 `apps/showcase-index` lists accepted games with their scorecard date; withdrawn games removed.

## 15. Test requirements

All runs are remote. Lane workflow `.github/workflows/qr-prd14-games.yml` (owner 14) runs on GitHub Actions `macos-14` (Chromium, ANGLE Metal, the
same runner class as `quality-rebuild-capture.yml` run 37289688772). Nothing in this section runs a browser or a heavy build locally.

- **Contract conformance (required check `qr-contracts.yml`, PRD 15):** `tests/unit/contracts/C-35-art.test.ts` on stub and real;
  `tests/unit/contracts/impl/prd14-art.test.ts` (T1.1–T1.2).
- **Lane unit (Vitest, `pnpm exec vitest run tests/qr/prd14`, macos-14):** audit (T1.3), condition evaluator (T1.4), canvas blank check (T1.5),
  scorecard verdict incl. `countedRound`/`enginePending` (T1.6), route-health (T1.8), `games.json` (T1.13), kits (T3.2), and the per-game gameplay
  tests named in §14 (ball rotation, thief facing, lives, stall model, segment conveyor, wave cadence, RPM mapping, impact-speed audio, car roll,
  ghost label). Existing tests that import kept gameplay modules must pass unchanged after the `src/gameplay/` move; only import paths may change.
- **Lane browser (Playwright, macos-14):** per game, both flag states: `<id>-dispatch.spec.ts` (T1.10) and `<id>-v2.spec.ts` (T2.6): boot to
  `window.__AURA3D_GAME__.state === "playing"`; 0 console/page errors over a 60 s scripted timeline; every §7.2.1 condition reached by its deadline;
  `canvasBlankCheck` on every shot; C-31 `appliedLook` equal between play URL and every scenario URL; framing assertions (T2.3); keyboard-only and
  touch-only playthrough of the first objective; `visibilitychange` pauses; `WEBGL_lose_context` round-trip shows recovery UI and restores a
  non-blank canvas (Courier legacy in Phase 1; all v2 routes once C-24's `context-lost` state is real, integrated).
- **Capture (macos-14):** `capture-games.mjs` for each changed game on every PR via the lane workflow (flags `route-<id>`); checkpoint captures
  (`none`, `all`, route `qrFlags`) are dispatched by PRD 12.
- **Audio:** C-25 `proof()` shows `synthCues === 0` and every art-direction cue backed by an `AudioAssetRef` with `provenance: "sample"`.
- **Static:** `scripts/check-art-direction.mjs` `capture-branch` scan returns 0 for every `src/v2/**`; `scripts/check-route-health.mjs` passes;
  `.github/QR_OWNERSHIP.json` check passes (no edits outside §12A.2).

## 16. Visual acceptance tests

### 16.1 Standalone acceptance (passable by this lane alone; gates every merge)

Evaluated in the lane workflow with flags `none` + the route flag, on the current renderer plus PR 0a stubs. These are engineering and
composition checks. They do not and cannot show three.js-level quality, and no standalone result is reported as a visual-quality claim.

| # | Check | Threshold | Tool |
|---|---|---|---|
| S1 | Route boots with flag off (legacy) and on (v2) | `playing`, 0 console/page errors over 60 s, both states | `<id>-dispatch.spec.ts` |
| S2 | Required conditions | every §7.2.1 condition true by its deadline | `<id>-v2.spec.ts` + `evaluateRequiredCondition` |
| S3 | Canvas not black | `canvasBlankCheck` passes on every shot at 1920×1080, 1280×720, 390×844@3 | scorecard builder on capture PNGs |
| S4 | Art direction honoured | `auditArtDirection` returns 0 violations; `lookLint` 0 errors | `check-art-direction.mjs` |
| S5 | No capture forks / debug UI | 0 `capture-branch` hits; play-view text scan finds no debug/evidence/marketing strings | `check-art-direction.mjs`, `<id>-v2.spec.ts` |
| S6 | Look identical across scenarios | C-31 `appliedLook` deep-equal between play URL and every scenario URL | `<id>-v2.spec.ts` |
| S7 | Framing | route `framing.subjectHeightFraction` inside `art/direction.ts` range in `03-mid` (desktop and 390×844) | `<id>-framing.spec.ts` |
| S8 | Draws and readbacks | `diagnostics().drawCalls` ≤ §7.2.1 Medium budget at `?aura3d-quality=medium`; C-28 readbacks 0/frame after warm-up | `<id>-v2.spec.ts` |
| S9 | Stall-free | p95 rAF interval ≤ 50 ms at 1280×720 on macos-14 across the 60 s timeline (relative runner gate; real-device numbers are integrated) | `<id>-v2.spec.ts` |
| S10 | Assets admitted | every `art/direction.ts` asset role resolves to an admitted id whose kit file has an `accept` look-dev verdict on the three r185 pane | `kits.test.ts`, `check-art-direction.mjs` |
| S11 | Audio | `proof().synthCues === 0`; every cue in `audio[]` plays at least once in the timeline (`voicesPlayed`) | `<id>-v2.spec.ts` |
| S12 | Stand-ins tracked | every route-local stand-in listed in `standIns[]` with an open R-14-NN | validator |

### 16.2 Integrated acceptance (evaluated only at checkpoints; never blocks starting or merging)

Evaluated on the checkpoint's main HEAD with `qr_flags=all` + the route flag. Screening rounds record scores; only G-PANEL rounds (IC-4, IC-8,
IC-12, …) can accept (§6.3). "Benchmark context" lists the PRD 12 benchmark scenes (C-30) whose G-REF result in the same round is reported next to
the game score for attribution; a failing scene makes the round `engine-pending` for the game only if the scene's owning contract is in the game's
§12.3 integrated-critical list. Shot ids are the real `games.json` ids (§7.2).

| Game | Benchmark context (same round) | Judged shots (`games.json` id: content) | Reference | Criterion and threshold (plus §6.3 for all) | Review |
|---|---|---|---|---|---|
| Bank Shot | 04-clearcoat, 07-sheen-fabric, 10-indoor-environment, 12-shadows | `02-opening`: rack; `05-charge`: aim; `03-mid`: roll; `04-action`: pot | `art/references` + research/21 Bank Shot | shadows ≥ 8, materials ≥ 8, lighting ≥ 8 | vision ×3 + ≥ 3 humans |
| Turbo Drift | 09-outdoor-environment, 12-shadows, 14-particles, 17-large-environment | `02-opening`: grid; `03-mid`: straight ≥ 120 kph; `04-action`: drift with smoke | same | env ≥ 7.5, shadows ≥ 7.5, VFX ≥ 7 | same |
| Aura Clash | 08-skinned-character, 12-shadows, 14-particles, 15-animation-skinning | `02-opening`: round intro; `03-mid`: exchange; `04-action`: hit during hit-stop; `05-special` | same | light ≥ 7.5, VFX ≥ 7.5, anim ≥ 7.5, camera ≥ 7.5 | same |
| Orbital Defense | 13-ibl-only, 14-particles | `02-opening`: wave 1; `03-mid`; `04-action`: explosion; `05-shield` | same | env ≥ 7, assets ≥ 7, VFX ≥ 7.5 | same |
| Vault Breakers | 04-clearcoat, 05-transmission, 13-ibl-only | `02-opening`: plunge; `03-mid`: play; `04-action`: bumper hit | same | assets ≥ 7.5, materials ≥ 7.5 | same |
| Rooftop Buckets | 08-skinned-character, 09-outdoor-environment, 15-animation-skinning | `02-opening`: ready; `05-charge`; `03-mid`: release; `04-action`: make | same | env ≥ 7, anim ≥ 7 | same |
| Courier Rush | 11-multiple-lights, 17-large-environment, 14-particles | `02-opening`: depot; `03-mid`: street (no black canvas); `04-action`: drop-off | same | env ≥ 7, IBL ≥ 7, atmo ≥ 7 | same |
| Neon Swarm | 11-multiple-lights, 14-particles, 16-instancing | `02-opening`: wave; `03-mid`; `04-action`: kills; `05-burst` | same | env ≥ 7, VFX ≥ 7.5, juice ≥ 7.5 | same |
| Pulse Tunnel | 13-ibl-only, 14-particles | `02-opening`: launch; `03-mid`: run (mobile too); `04-action`: gate pass | same | post ≥ 7.5, camera ≥ 7, mobile ≥ 6.5 | same |
| Siege Golf | 09-outdoor-environment, 12-shadows, 18-game-scene | `02-opening`: tee; `05-charge`; `03-mid`: flight; `04-action`: topple | same | env ≥ 7.5, assets ≥ 7 | same |
| Patrol Wing | 09-outdoor-environment, 13-ibl-only, 17-large-environment | `02-opening`: pad; `03-mid`: airborne, rings in frame; `04-action`: drone hit; `05-banked-fire` | same | env ≥ 7.5, camera ≥ 7.5, atmo ≥ 7.5 | same |
| Aurora Lander | 09-outdoor-environment, 14-particles | `02-opening`: descent; `03-mid`: approach; `04-action`: touchdown | same | env ≥ 7, atmo ≥ 7.5 | same |
| Gravity Post | 13-ibl-only, 16-instancing | `02-opening`: board; `03-mid`: aim; `04-action`: flight; `05-late-coast` | same | lighting ≥ 7 | same |
| Deep Recovery | 09-outdoor-environment (fog), 12-shadows, 14-particles | `02-opening`: shallows; `03-mid`: descent; `04-action`: wreck; `05-grapple` | same | lighting ≥ 7, atmo ≥ 7.5, perf ≥ 7 | same |
| Skyline Runner | 08-skinned-character, 15-animation-skinning | `02-opening`: act 1; `03-mid`: act ≥ 2; `04-action`: jump with FX | same | anim ≥ 7 | same |
| Blockfall Reactor | 10-indoor-environment, 16-instancing | `02-opening`: board; `03-mid`: stack ≥ 4; `04-action`: line clear | same | VFX ≥ 7, camera ≥ 7, juice ≥ 7.5 | same |
| Mech Hangar | 08-skinned-character, 10-indoor-environment, 15-animation-skinning | `02-opening`: hangar; `02b-arena-opening`: pit; `03-mid`; `04-action`: heavy strike; `05-special` | same | assets ≥ 7.5, anim ≥ 7 | same |
| Gallery Shift | 10-indoor-environment, 12-shadows, 08-skinned-character | `02-opening`: lobby; `03-mid`: sneak, cone visible; `04-action`: alert | same | lighting ≥ 7.5, shadows ≥ 7, anim ≥ 7 | same |

Each shot is captured at 1920×1080, 1280×720 and 390×844@3 (mobile stops after `03-mid` per `games.json` defaults). Every judged frame is a player
frame: scenarios set only state, clock, seed and camera pose (C-24 `GameScenario`, `CaptureContext`), never look. Fleet-level integrated criteria
are in §21.2.

## 17. Performance budgets

Engine budgets per tier are PRD 11 §17.1 (GPU 12/16 ms p50/p95 Medium–Ultra; Low 28/33 ms mobile; engine CPU 5/8 ms; draws ≤ 150/300/600/1,500;
GPU memory ≤ 256 MB/512 MB/1 GB/2 GB; tier settings are the frozen C-27 table). This PRD adds the game share and the content budgets. Game caps
are at or below the C-27 values (e.g. live particles here vs C-27 `particleBudget` 2,000/10,000/50,000/100,000; draws here vs C-27 `drawBudget`
150/300/600/1,500), so a game never relies on an engine cap to stay in budget.

Which budgets are standalone and which are integrated:
- **Standalone (gate merges, §16.1 S8/S9):** draw calls per tier from C-28 counters, 0 readbacks, game-logic CPU p95 ≤ 4 ms (measured with
  `performance.now()` around the route's update, reported in the route `render` section), transfer to playable and route JS chunk size (measured
  from the build output and the capture network log), decoded audio resident (C-25 `proof()` plus buffer sizes), p95 ≤ 50 ms at 1280×720 on the
  runner.
- **Integrated (checkpoints only):** the PRD 11 §17.2 runner gate under forced Medium, GPU ms and GPU memory per tier (need C-28 timer queries and
  C-27 governor real), real-device fps from the human panel, KTX2-resident texture memory (needs C-16/C-17 real).

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
| Total critical-path JS (gzip) | ≤ 650 KB today (engine root 575 KB, `BUNDLE_SIZES.md`); ≤ 400 KB once PRD 15's consolidation is real (integrated) | same | same | same |
| Mobile | primary phone tier; landscape for vehicle/fighting games; touch preset mandatory | flagship phones | not auto-selected on phones | never on phones |

Runner gate: PRD 11 §17.2 (1280×720 p50 ≤ 20 ms, p95 ≤ 34 ms; 1920×1080 p50 ≤ 33 ms, p95 ≤ 50 ms; 390×844 p50 ≤ 33 ms; 0 readbacks; ≤ 300 draws),
for all 18 games, two consecutive runs (integrated). Today 13 games fail it (§1). Per-game current → required (1920×1080 runner; current = 1000 / mean fps from `report.slim.json`, required = p50): Deep Recovery 1,917 ms → ≤ 33;
Gravity 156 → ≤ 33; Siege 141 → ≤ 33 and p95 1,100 → ≤ 50; Courier 141 → ≤ 33; Rooftop 132 → ≤ 33; Mech 108; Blockfall 102; Gallery 99; Aura Clash 90;
Skyline 88; Bank 67; Patrol 63; Turbo 51; Pulse 43; Neon 39 → all ≤ 33; Aurora, Vault, Orbital must stay ≤ 33 after their scenes get heavier.

Reference devices for the human panel (one per tier minimum): Low — iPhone 11 or Pixel 6a; Medium — MacBook Air M1/M2 and iPhone 13–15; High — MacBook Pro
M1–M3 Pro or RTX 3060 laptop; Ultra — RTX 4070+ desktop. Measured from the beacon's rAF p50/p95 and reported in the scorecard.

## 18. Browser coverage

| Browser | Lane / runner | Standalone (gates merge) | Integrated (checkpoints) |
|---|---|---|---|
| Chrome stable (ANGLE Metal on macOS) | `qr-prd14-games.yml` on macos-14; checkpoint captures by PRD 12 | S1–S12 for every changed game | all 18, every round |
| Safari 17+ macOS (WebKit) | lane job using a lane config `tests/qr/prd14/playwright.webkit.config.ts` (copied pattern of `playwright.audio-webkit.config.ts`, which PRD 12 owns), macos-14; human panel | S1, S2, S11 (boot, conditions, audio unlock) | all 18 before acceptance (human) |
| Firefox stable | lane job on macos-14 with Playwright Firefox (lanes add `qr-prdNN-*.yml` rather than editing `browser-matrix.yml`, CONTRACTS §4.2) | S1 boot + 60 s timeline, 0 errors | same, all 18 |
| Edge stable (Windows) | human panel, one reviewer | — | pilots and any game whose art direction uses SSR or CSM |
| WebGPU | only if PRD 11 selects it for the tier (C-29 `backend: "auto"`, `A3D_QR_WEBGPU`) | — | informational; `appliedLook` must match WebGL2 within PRD 12 tolerance |

## 19. Mobile coverage

- iOS Safari (iPhone 11 Low, iPhone 13–15 Medium) and Android Chrome (Pixel 6a Low, Pixel 8 / Galaxy S23 Medium), by the human panel on real devices
  (integrated); emulated 390×844@3 on the runner for every lane capture (standalone).
- Standalone requirements per game: full-bleed canvas at the C-27 tier DPR (never fixed at 1 on 3× screens except Low); C-24 touch preset from
  §7.2.1 (`twin-stick`, `dpad-2btn`, `dpad-4btn`, `steer-pedals`, `aim-drag`, `flight`, `lane-swipe`, `flippers`); no keyboard prompts on touch devices
  (Vault's "HOLD SPACE" today); HUD ≤ 15% of screen area in play (C-24 `hud.snapshot().widgets[].screenFraction` sum); orientation guidance for
  landscape-only games (Aura Clash, Turbo, Courier, Patrol, Mech); audio unlock on the title tap (C-25 `unlock()`).
- Integrated: thermal, a 10-minute session holds ≥ 27 fps p50 on Low devices; mobile score ≥ 6.5 in every game (fleet 2.5 today).

## 20. Screenshots and evidence required

Standalone, per merged v2 PR (artifacts of `qr-prd14-games.yml`, retained 30 days, linked in the PR):
1. Changed game's shots at 1920×1080, 1280×720, 390×844@3 with flags `route-<id>`, plus the same shots with the flag off (legacy) for S1.
2. Lane `report.json`: rAF p50/p95/p99, draws, readbacks, console/page errors, `requiredConditions` results, `canvasBlankCheck` results,
   `appliedLook` per URL, resolved `qrFlags`, `degradations`.
3. `check-art-direction.mjs` and `check-route-health.mjs` output.
4. Kit PRs: the three r185 / Aura look-dev strip for every new hero/character/vehicle/enemy asset with the reviewer's verdict in `kit.json`.

Integrated, per checkpoint round per game (committed under `apps/<dir>/art/scorecards/` and `docs/project/aura3d-quality-rebuild/evidence/games-after/`):
5. Capture set from the PRD 12 checkpoint run (`none`, `all`, route `qrFlags`); contact sheet `evidence/games-after/<id>-IC-<k>-contact.jpg`; 5 s
   video around `04-action` (PRD 12 strip/webm steps, C-33).
6. The C-32 `PanelRoundRecord` reference and the `GameScorecard` JSON (with `countedRound`, `enginePending`).
7. Side-by-side: IC-0 legacy frame vs current v2 frame per shot, and current frame vs the closest reference-board image.

## 21. Completion criteria

### 21.1 Standalone (this lane alone)
- All 18 routes have dispatchers, art-direction contracts, reference boards and `qualityGate.status` set; 0 debug/evidence/marketing text in
  either flag state; the P0 correctness fixes of §14.1 merged with tests.
- All 18 v2 routes pass §16.1 S1–S12 with flags `none` + route flag; 0 `capture-branch` hits; 0 `lights.ambient`; 0 visible synthesized hero/world
  assets; `proof().synthCues === 0`.
- C-35 implemented; its conformance suite passes on stub and real; scorecard tooling, form and gates run in lane CI.
- Every stand-in listed in `standIns[]` with an open R-14-NN; every request in §12A.6 filed.

### 21.2 Integrated (evaluated at G-PANEL checkpoints; the program's actual goal)
- All 18 games have `qualityGate.status` `accepted` or `withdrawn` (withdrawal only after two counted rounds); at least 15 are accepted.
- Every accepted game: §6.3 met on one commit (vision overall ≥ 7 and "competitive" = Yes; human median ≥ 7, no reviewer < 6; every visual
  category ≥ 5; critical categories at their §6.10 targets; non-visual thresholds; PRD 11 runner gate and §17 integrated budgets; 0 console/page
  errors; mobile ≥ 6.5).
- Fleet: mean overall ≥ 7.2 across accepted games; no fleet category mean < 6.0.
- Legacy removed for every accepted game; route flags in `REMOVED_QR_FLAGS`; PRD 12 goldens registered for every accepted game; two consecutive
  green fleet capture runs on `main`.

## 22. Rollback considerations

- **Before acceptance:** flag off is the frozen legacy route, so rolling back a v2 change never touches production. A v2 PR that breaks main is
  reverted at once (CONTRACTS §6.1).
- **After the default flip, before legacy removal:** set `DEFAULT_ON = false` in the route's dispatcher (one-line PR) to serve legacy again;
  `?a3d-qr=-route-<id>` does the same per session for diagnosis.
- **After legacy removal:** revert to the `pre-rebuild/<id>` tag at route level.
- If an engine change regresses an accepted game (PRD 12 G-REG on a golden), the route opts out of that lane's flag (`all,-<lane>` in its
  `qualityRebuild.flags`) and a `qr-ic-regression` issue goes to the owning lane; the game is not rolled back.
- If an accepted game fails on a real device class (e.g. thermal drop on Low), its tier mapping is lowered through C-27 `app.quality.set` +
  `lock()` per device class before any content is cut.
- Withdrawn games are hidden from `apps/showcase-index` and keep serving the legacy route at their URL with an "in development" banner.
- Kit assets are shared: a kit change requires re-capture of every consuming game (§6.4 consumers); a kit regression is rolled back by pinning the
  previous asset hash through `aura3d assets` (regenerated manifest diff).

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Content is tuned around stub defects while engine lanes are not yet real (the Pulse Tunnel failure, now in parallel form) | high | high | Physical-intent authoring enforced by `auditArtDirection` (`ambient-light`, `emissive-fill`, no fake discs); asset approval on the three r185 pane (§6.4); `engine-pending` rounds do not count (§6.3) |
| Engine lanes land late, so integrated targets slip | high | medium | Nothing here waits; standalone work completes regardless; first counted rounds are per-wave targets, and early rounds that are engine-pending cost nothing |
| Stub costs mislead performance work (C-37 remount per FX burst, C-25 engine voice restarts) | medium | medium | S9 measures p95 under bursts; G13 pre-mounted pool fallback; costs recorded in scorecards with `degradations` |
| Route-local stand-ins (rigs, FX pool, baked gradients) linger and become a second engine | medium | medium | `standIns[]` validator requires an open R-14-NN; Phase 6 refuses legacy removal while any stand-in remains whose contract is real |
| Two code paths per route (legacy + v2) double maintenance | certain | low | Legacy frozen except declared P0 fixes; shared `src/gameplay/`; legacy deleted per game in Phase 6 |
| Ownership ambiguity for asset bytes in `public/aura-assets/` | medium | low | R-14-07 asks PRD 05 to confirm the §4.3 generated-file rule covers them; until confirmed, assets stay staged in `apps/showcase-kits/` |
| Content cost: ~18 hero sets, 9 kits, licensed HDRIs and audio | high | high | Kit agents start day 0; catalog/CC0 first; Meshy promotion path through PRD 05 when real; withdraw games rather than ship weak art |
| Vision judge drift or leniency between rounds | medium | high | Same prompt as research/21 (C-32 `RUBRIC_PROMPT_VERSION`); calibration canaries; human panel co-equal and blind |
| Agents optimise for the judge instead of the player (new form of capture forks) | medium | high | `appliedLook` equality across scenarios, player-frame-only capture, human play on own devices, judge receives references |
| Performance regresses as content grows (scenes were cheap only because empty: Orbital, Vault) | high | medium | Standalone draw/readback/CPU budgets in S8/S9; C-27 tiers |
| Runner GPU is paravirtual and far below Low class | certain | medium | Runner gates are relative; real-device numbers from the human panel are authoritative for tiers |
| Licence errors in admitted assets or HDRIs | medium | high | Per-file licence in `kit.json` with an allow-list test; reference images marked "reference-only" are never shipped |
| Some games cannot reach 7 within two counted rounds | medium | medium | Explicit withdrawal; completion requires ≥ 15 accepted, not 18 |
| Human reviewer availability | medium | medium | G-PANEL schedule fixed (IC-4/8/12); offline form; one external reviewer minimum |

## 24. Explicitly out of scope

- Engine, renderer, shader-library, asset-pipeline and runtime implementation (PRDs 01–13, 15), and every file outside §12A.2. This PRD consumes
  contracts and files requests (§12A.6); it never edits another lane's file and never waits on another lane.
- Changing any frozen contract except through the CCRs listed in §12A.6.
- Claims that any game or the engine matches three.js, other than G-PANEL judgements cited with round id, rubric version and capture run id.
- New games beyond the 18, and non-game showcases (`showcase-data-galaxy`, `showcase-product-configurator`, `showcase-webgpu-particle-lab`, etc.).
- Gameplay redesign beyond the bugs and tuning named in §6.9 (rules, levels, progression stay as they are).
- Production deployment procedure (governed by `/Users/gurbakshchahal/AuraOne/AuraOne-Deploy-Final-PERMANENT.md` for AuraOne targets).
- Multiplayer, accounts, monetisation, analytics.
- Marketing pages, SEO, README claims (they follow acceptance, not the other way round).
- Local execution of browsers, builds or Docker: all capture, browser tests and heavy builds run on the remote lanes named in §15 and §18.
