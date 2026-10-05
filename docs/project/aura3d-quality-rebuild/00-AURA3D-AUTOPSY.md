# Aura3D Autopsy — why the pixels lose

- Date: 2026-10-05
- Branch: `aura3d-quality-rebuild/audit` (audit HEAD lineage `c08d8acb` → `85aafcd0` → `7992a0dd`)
- Pixel evidence: GitHub Actions run **37289688772** (`.github/workflows/quality-rebuild-capture.yml`, macos-14, Chromium ANGLE Metal, production origin `aura3d.auraone.ai`, sha `c08d8acb`). Raw frames: `evidence/games/`, `evidence/benchmark/`.
- Authoritative visual judgments: `research/21-game-vision-judgment.md` (18 games) and `research/23-benchmark-vision-judgment.md` (18 same-scene benchmark scenes vs three.js r185). Corrected engineering claims: `research/19-claim-verification.md`.

## Executive verdict

Aura3D 3.0.1 does not look like a modern three.js browser game, and it is not close. In the same-scene benchmark, built from identical GLBs, HDRIs and cameras through a harness that research 22 checked for fairness, Aura averages **3.6/10** against three.js r185's **5.4/10**. Only 2 of 18 scenes come within half a point (03 helmet 6.5 vs 7; 11 multi-light 5 vs 5), and 16 of 18 are classified major-deficiency or implementation-bug (`_sections/A-capability-matrix.md:118-176`). The 18 shipped games score **1.5–4/10 overall, median 3, fleet mean 3.0**. The vision judge says "not competitive with a well-built three.js game" for all 18: 17 need a substantial rebuild and 1 needs a full rebuild (`_sections/B-game-scorecard.md:558-622`).

The renderer core is not the problem. GGX/Smith/multi-scatter shading, the RGBA16F + MSAA targets and the ACES fit are correct and reach near-parity wherever only they are exercised (`_sections/C-rendering-stack.md:292`). The problem is what sits between the public API and that core:

1. **Defaults that silently throw authored work away.** `lights.ambient()` without `environments.*` zeroes IBL in 15 of 18 games (`packages/engine/src/agent-api/index.ts:12693-12707`). Shadow strength is 0.24–0.38, chosen from node names (`index.ts:12966-12968`). Exposure is pinned to 1 (`index.ts:12898-12904`). DPR is pinned to 1 (`index.ts:4256`). A tint wipes GLB textures (`index.ts:13570`). Effect nodes draw zero pixels (`index.ts:13722-13723`). No sky is ever drawn (C9).
2. **A thin, lossy environment and shadow pipeline.** The default environment is a 128×64 LDR CPU map. Its sampler reads mip 0 only. PMREM runs on the CPU with an average-blend fudge. The depth pass handles position only, so skinned, instanced and alpha content cast wrong shadows. CSM cannot be reached from the root path (C.4 A1–A11).
3. **A bridge that owns quality policy.** `createProductionRuntime*` (`index.ts:12523-14006`) hard-codes environment choice, the tone curve, shadow strength, bloom clamps, background and backend. When it fails it falls back to a second renderer. No single place can raise the floor (C.7 #1).
4. **Weak and mis-rendered content.** 71 of 131 release models have no textures, 13 are 4-triangle cards, and a regex waives the texture gate (`packages/aura3d-cli/src/index.ts:3376-3382`). At least 6 games bury better assets that already exist in the repo (`_sections/D-techart-agent-assets.md:273-441`).
5. **An evidence apparatus that certified failure.** The 13-scene "three.js parity" scores are constants (`benchmarks/three-compat/shared/scenes.ts:22-34`). "Game Visual QA 17/17 PASS" passed frames its own document described as washed out. `?capture=review` forks meant the frame being iterated on was never the shipped frame (C.6 rows 1–49; B §3.6).
6. **An agent path that converges on the worst recipe.** The skills carry about 6× more evidence lines than craft lines. The engine's own lint recommends adding ambient, which kills IBL (`index.ts:18256`). The flagship lean starter discards lights (D "Net").

Vision judges and code judges disagree on how much of the gap is the engine: 3–10% versus 25–53%. Both are right. A feature the engine silently discarded looks the same in a still frame as a feature nobody authored (B §3.4).

The fix is a contracts-first rebuild: **PR 0 (Contract Bootstrap) and then 15 PRD lanes running fully in parallel**. Contracts C-01..C-40 are frozen and every lane builds against their stubs. Feature flags `A3D_QR_*` gate each lane, and integrated quality is judged at weekly non-blocking checkpoints (`CONTRACTS.md:56-73, 2681-2729`). The bar is pixels judged by people. Gates do not count.

## Top 10 root causes

Shares are this audit's estimate of how much each cause contributes to the shipped-game visual gap (fleet 3.0 → target 7.0). They overlap, they were judged from research 21/23 frames plus code forensics, and they were **not measured** by leave-one-out. That attribution comes from the G-PANEL rounds in PRD 12. Buckets: A renderer, B defaults, C assets, D game, E authoring, F architecture, G process.

| # | Root cause | Evidence | Bucket | Share | Fix PRD · contracts |
|---|---|---|---|---|---|
| 1 | Environment lighting is effectively off. Ambient replaces IBL; the default env is 128×64 LDR; the sampler reads mip 0; CPU PMREM blend fudge; SH unbound; no sky/background on the root path | `index.ts:12693-12707` (15/18 games, 19 C1 corrected); `ExternalParityRenderPreset.ts:133-221, 169`; `PMREMGenerator.ts:345-350`; benchmarks 06 4 vs 7, 13 3.5 vs 6, 09 3.5 vs 5.5; fleet IBL mean 1.5, atmosphere 1.4 | A+B | ~16% | PRD 02 (C-09, C-10, C-12); PRD 01 background coverage (C-05); PRD 07 sky (C-21) |
| 2 | Shadows are faint, wrong or absent. Strength 0.24–0.38; position-only DepthPass; one shadowed light; camera-culled fit, no snap; CSM unreachable; NEAREST manual PCF | `index.ts:12966-12968`; `DepthPass.ts:59-87`; `Renderer.ts:1371, 1387-1391`; `ShadowPass.ts:142`; cited in 10/18 benchmark scenes; 23/15 shadow darkening 9% (Aura) vs 50% (three); fleet shadows 1.6 | A+B | ~13% | PRD 02 (C-11, C-10); PRD 06 deform variants (C-18) |
| 3 | Content is weak and rendered badly. 71/131 models untextured; 13 4-tri cards; texture waiver regex; no optimize stage (463 MB raw); tint wipe plus 0.28 self-emissive; better assets unused in ≥6 games | 19 C3, C19; `index.ts:13570`; `TypedGLBActor.ts:484-514`; `packages/aura3d-cli/src/index.ts:3376-3382`; textures mean 2.3, PBR 2.5 | C+B | ~13% | PRD 05 (C-16, C-17); PRD 04 overrides (C-15); PRD 14 replacement |
| 4 | Game art direction is missing. Void backgrounds, sparse primitive scenes (685 `primitives.*` vs 112 `model()`), weak framing, debug UI in ~11 games, desktop layouts stacked on mobile | research 21 per-game verdicts; B §3.8–3.9; env mean 2.7, comp 3.1, mobile 2.5 | D | ~12% | PRD 14 (C-35); PRD 08 camera (C-22, C-23); PRD 10 world (C-26) |
| 5 | Effects draw zero pixels. Particles, rain, snow, flipbook and beam are no-ops on the production bridge; `game.effects` is never mounted; one alpha-over blend engine-wide | `index.ts:13722-13723`; `WebGL2Device.ts:4404`; `GameRuntime.ts:2860-2876`; 19 C8; benchmark 14 1 vs 4; particles 1.4, VFX 2.2, juice 2.2 | A+F | ~9% | PRD 07 (C-20, C-21); PRD 01 blend (C-04); PRD 09 fx facade (C-24) |
| 6 | The evidence process certified failure. Fabricated parity constants, LOOSE pixel gates (MAE ≤ 64), liveness-only QA, capture-review forks, self-reported 60 fps | C.6 rows 1, 5, 13–15, 44–49; 19 C18; research 14; research 20 (395 capture ternaries) | G | ~9% | PRD 12 (C-30..C-33); PRD 09 capture context (C-24); PRD 15 deletions |
| 7 | The agent authoring path produces the retro look. Ambient+directional starter; lint suggests ambient; lean starter inert; prompt-plan fields echoed but ignored; no art-direction skill; no screenshot loop | `index.ts:18256`; 19 C7, C17; `llms.txt:36, 62-67, 211`; D "Agent-authoring findings" §1–7 | E | ~8% | PRD 13 (C-34, C-40); PRD 15 lean (C-36) |
| 8 | The architecture caps quality. Bridge-as-policy; 11+ renderer front-ends and a silent fallback; float-branched uber-shaders copied into ≥5 programs; heuristic material lobes; additive-Euler scene graph | `index.ts:12523-14006, 12543-12549, 17982-18006`; `ShaderLibrary.ts:2063-2076`; `ShaderChunks.ts:253-327`; benchmarks 04/05/07 3–4.5 vs 6–6.5 | F | ~8% | PRD 15 (C-36..C-39); PRD 01 (C-02, C-06); PRD 04 lobes (C-03) |
| 9 | Post and output flatten the image. Exposure dropped in 16 games; ACES@1 everywhere; fake AgX/Neutral; bloom ×7 gain with soft knee 0.5 gives haze; "FXAA" is a 4-tap blur on MSAA; SSAO ≈ 0 beyond 2 m; 8-bit post after the tone map; CPU readbacks | 19 C12–C15; `WebGL2Device.ts:1016-1033, 3613-3630, 3091-3129`; `NativeBloomPyramid.ts:106-111`; post mean 2.9 | A+B | ~7% | PRD 03 (C-13, C-14); PRD 01 OutputPass (C-05) |
| 10 | Resolution and frame cost. DPR 1 by default (¼ of native pixels on 2× displays, ~1/9 on 3× mobile); per-draw allocations; 64-instance cap; VAO leak; instance `size` bug; 13/18 games under 20 fps at 1080p | `index.ts:4256, 14747-14753`; `ForwardPass.ts:121, 249-351`; `evidence/games/report.slim.json`; benchmark 16 2.5 vs 4.5 | A+B+F | ~5% | PRD 11 (C-27, C-28, C-29); PRD 01 InstanceBuffer (C-07); PRD 15 size fix (C-36, R18) |

Note on #10: the judged screenshots were captured at `deviceScaleFactor: 1`, so they **do not show** the DPR loss. Real retina and mobile users see worse frames than research 21 scored (C.4 A20). The ~5% share is therefore a floor.

## Answers to the ten questions

### 1. Why does Aura3D still look bad after so much work?

The work went into feature count and evidence, and pixels stayed flat (research 01 chronology). Every release added named capabilities: CSM, PMREM, SSAO, particles, AgX, node materials, WebGPU. Most of them never reach the pixels a `createAuraApp` route draws. They are unreachable from the root path (CSM, `EnvironmentBackgroundPass`, SH irradiance), they are no-ops (effects, `bloom.color`, `colorGrade.lut`, spot `decay`), or they are stubs named like the feature ("FXAA", AgX, `NodeMaterial`, `ReflectionProbe`). See the 49-row register in C.6. The gates that should have caught this measured liveness, constants or loose thresholds. Whole-frame SSIM is ≥ 0.95 on 14 of 18 benchmark scenes even where the glass renders black (`_sections/A-capability-matrix.md:133-135`). Nobody looked at the shipped default frame next to a well-built reference, and the engine reported 60 fps while games ran at 0.5–15 (B §3.7).

### 2. Is it the renderer, or the games and assets?

Both, and the two interact. The benchmark isolates the engine. On identical input Aura loses by 1.8 points on average, and by 2–3 points on every scene that needs shadows, sky, IBL roughness, particles, transmission, sheen or instancing. That gap is renderer + defaults, with no authoring involved. The games add a second gap of roughly 2–3 points from assets, composition, camera and missing VFX. Much of what looks like an authoring failure is authoring that was thrown away by defaults: ambient-kills-IBL (15/18), exposure dropped (16), DPR-1 (13–14), zero-pixel effects (all), tint wipe. Pulse Tunnel is the clearest case: agents rejected good CC0 PBR kits because the renderer showed them as black (B §3.4). In the Top 10 table, about 60% of the share is renderer, defaults and architecture (A+B+F) and about 40% is content, game, authoring and process (C+D+E+G). Engine defaults must change first. Otherwise rebuilt content is discarded the same way.

### 3. Where exactly is Aura3D behind three.js visually?

These are ranked by benchmark gap (research 23; full table at `_sections/A-capability-matrix.md:139-158`):
- **Particles** (14): 1 vs 4. The subject is missing.
- **Transmission** (05): 3 vs 6. The glass renders as black lacquer.
- **Roughness response** (06): 4 vs 7. Reflections are blotchy and the roughness-1 end is dead.
- **Sheen** (07): 3 vs 6.
- **PBR product** (02): 3.5 vs 6. The pedestal is translucent and shadows are near-absent.
- **IBL-only** (13): 3.5 vs 6.
- **Clearcoat** (04): 4.5 vs 6.5.
- **Outdoor** (09): 3.5 vs 5.5.
- **Shadows** (12): 3.5 vs 5.5.
- **Instancing** (16): 2.5 vs 4.5.
- **Skinned shadow** (08), **large environment** (17), **game scene** (18): each −1.5.
- **Simple geometry** (01), **indoor** (10), **animation** (15): each −1.0.

Near parity: helmet (03, −0.5) and multi-light (11, 0). By cluster, the gaps are shadows (10/18 scenes), environment/IBL (4), material extensions (3), and silent no-ops or geometry bugs (4). In games, the lowest fleet categories are particles 1.4, atmosphere 1.4, IBL 1.5, shadows 1.6, VFX 2.2, juice 2.2, textures 2.3 and PBR 2.5 (`_sections/B-game-scorecard.md:29`).

### 4. Is there an architecture ceiling?

Yes. It is not in the BRDF or the render targets. The ranked ceilings are in C.7:
1. **Bridge-as-policy and renderer sprawl.** Quality constants sit in `index.ts:12523-14006`. There are 11+ front-ends and a silent fallback renderer.
2. **The environment pipeline** (CPU LDR env, CPU PMREM).
3. **The shadow subsystem** (static depth shader, culled fit).
4. **Shader and material architecture.** Float-branched uber-shaders are copied into ≥ 5 programs, lights 17+ are silently dropped, lobes are heuristic, and there is no material graph. This is the hardest ceiling to remove.
5. **The post model.** Kernels are 8-bit and run after the tone map, there are CPU readbacks, and there is one blend mode.
6. **Draw submission and the scene graph** (per-draw allocation, additive Euler).
7. **DPR and AA defaults.**
8. **WebGPU.** It has no effect today and is not a path to a higher ceiling in its current form.

Ceilings 1–6 are classed STRUCTURAL or CONTRACT, so no constant change removes them. Removing them is what PRDs 01, 02, 03, 04, 07, 11 and 15 do.

### 5. What should be built?

Build what the shipped frame is missing, not the long tail (D "What the list shows"). Eight items explain most of the gap: lighting presets, studio env, outdoor lighting, HDRI, sky, shadows, particles/impact VFX, and tone/bloom defaults. Concretely:
- One renderer with one scene compiler (PRD 15, C-36) and a chunk-assembled program generator keyed on a feature hash (PRD 01, C-02).
- Ambient additive to IBL, GPU PMREM with SH irradiance, a neutral-room default env, a visible background, and physical light units (PRD 02, C-09/C-10).
- Depth variants, `sampler2DShadow`, CSM on root, strength 1.0 (PRD 02, C-11).
- An HDR post graph with real bloom threshold, GTAO, SMAA/TAA, real AgX/Neutral, a wired exposure and LUT (PRD 03 + PRD 01 OutputPass, C-05/C-13).
- Spec-correct lobes and texture-preserving tint (PRD 04, C-03/C-15).
- A particle/flipbook pass with additive and premultiplied blend, plus sky and fog (PRD 07, C-20/C-21, C-04).
- An asset optimize and admission pipeline and curated kits (PRD 05, C-16/C-17).
- Measured tiers, DPR up to 2–3, and persistent instancing (PRD 11, C-27..C-29).
- Animation authority (PRD 06), camera/feel (PRD 08), shared game shell with sampled audio (PRD 09), world systems (PRD 10).
- A perceptual benchmark with a human panel (PRD 12), looks and lookLint (PRD 13), and the 18-game rebuild (PRD 14).

Keep the subsystems listed in `_sections/E-debt-delete-qualitybar.md` "Preserve". Delete about 13k lines and rewrite about 38k lines of `packages/` (E "What should be deleted or replaced").

### 6. How do we stop agents producing low-quality scenes?

Make the default path the good path, then catch regressions mechanically:
- **Looks.** `looks.*` baselines (env + hemisphere fill + shadowed sun + horizon fog + AA + grade + env background) become the template and skill default (PRD 13, C-34).
- **lookLint.** It replaces the `index.ts:18256` advice and adds rules for ambient-without-env, DPR below device, solid background with no fog, and primitive-only scenes. Lanes register rules through `registerLookLintRule`.
- **No silent failure.** Lean either throws on `lights.*`/`environments.*` or is retired (PRD 15). Prompt-plan fields are implemented or removed, and `visualSystems` may only report what reached pixels (quality bar A4).
- **Art direction.** An `aura3d-art-direction` skill provides genre reference frames and numeric targets, written from verified C-40 facts.
- **A look-at-the-output loop.** Agents get a remote screenshot loop by default.
- **Measured outcome.** The agent-eval harness (12 prompts × 3 seeds) must score a median ≥ 6.5 with zero renderer-knowledge escapes (`_sections/E-debt-delete-qualitybar.md` "Agent-generated output", A1–A4).

### 7. The 18 games: what is wrong with each, and its PRD 14 target

All 18 are rebuilt by PRD 14, the only writer of route `main.ts` files (CONTRACTS R21), against art-direction contracts (C-35). Scores below are now → target overall; fps is desktop 1920×1080 on the runner. Each line gives the dominant visual failure first and the first fix second (research 21 via `_sections/B-game-scorecard.md:59-553`; targets from `PRD-14-eighteen-game-rebuild-program.md:920-946`).

- **Aura Clash Arena** 3 → 7.5, 11.1 fps. Fighters fill 30% of a 43%-viewport canvas. Flat tints erase textures, and the game runs on an rgba8+Reinhard preset where bloom never fires. Fix: HDR+ACES, tint → rim, full-bleed side camera, hit VFX.
- **Blockfall Reactor** 4 → 7.5, 9.8 fps. A locked dead-on camera reads as 2D web Tetris, and line clears have no particles. Fix: 8–12° tilt with drift, and punch plus VFX on clears.
- **Skyline Runner** 4 → 7.5, 11.4 fps. A painted backdrop sits behind flat primitive "stickers", and the textured runner is used only as the ghost. Fix: delete the slab and grey bars, and use the hero assets.
- **Turbo Drift Circuit** 3 → 7.5, 19.7 fps. 50–65% of the frame is untextured grey ground. Fix: spline road with PBR asphalt, car-paint clearcoat, speed VFX.
- **Siege Golf** 3.5 → 7.5, 7.1 fps (p95 1,100 ms). Greybox castle of identical cubes, and the scene is rebuilt per camera phase. Fix: cohesive stylized kit with a trim atlas, and keep the physics (6).
- **Aurora Lander** 2.5 → 7, 52.2 fps. 85–95% of the frame is flat navy and the terrain is missing in 3 of 4 captures. Fix: altitude-adaptive camera, sky, aurora ribbon (PRD 07).
- **Neon Swarm** 2.5 → 7, 25.8 fps. Pure-black ellipses read as rendering errors. Fix: glossy floor with an emissive grid (PRD 04 `material.gridFloor`) and additive glow.
- **Gravity Post** 3 → 7, 6.4 fps. The sun lights nothing, two planets render black, and keyboard launch is dead. Fix: sun point light, lit planet/atmosphere materials, batching of 1,200+ draws.
- **Courier Rush** 2 → 7, 7.1 fps. A black world with context loss and no restore, and a scaled-group city that collapses (19 C6). Fix: context restore, matrix hierarchy, IBL, batching of ~1,530 draws.
- **Pulse Tunnel** 3 → 7, 23.5 fps. The hero blocks 45% of the width, and the mobile canvas is 374×187. Good CC0 kits were rejected because they rendered black. Fix: 100dvh canvas, synthwave sky, IBL. About 6/10 is reachable on IBL alone.
- **Mech Hangar** 3.5 → 7, 9.3 fps. Untextured cube clusters intersect a good mech. Fix: socketed authored parts or material swaps on the base mech.
- **Vault Breakers** 2.5 → 7, 57.4 fps. The ball is a dark 40×28 px disc, and the Sketchfab cabinet is never referenced. Fix: chrome ball under HDRI with contact shadow and trail, and use the cabinet.
- **Rooftop Buckets** 4 → 7.5, 7.6 fps. The crowd is cube torsos with faceted heads, and skinned players appear only under `?debug`. Fix: instanced crowd, open dusk skyline, ship the skinned players.
- **Gallery Shift** 3 → 7, 10.1 fps. Untextured box architecture, invisible vision cones, frozen animation (19 C16), and lights 17+ dropped. Fix: visible additive cones (PRD 07), animation authority (PRD 06).
- **Deep Recovery** 2.5 → 7, 0.5 fps. Translucent teal shapes float in a black void, and a CPU fog readback collapses the frame rate. Fix: GPU fog and god rays (PRD 07) and an underwater preset (PRD 10).
- **Patrol Wing** 3 → 7.5, 15.8 fps. A flat clear-colour "evening" with hero assets but no IBL. Fix: sunset HDRI as sky and IBL, ocean (PRD 10), chase camera.
- **Bank Shot** 3 → 7.5, 14.9 fps. The table floats in a near-black void with 40% of the frame empty. Fix: overhead soft-shadow spot, contact shadows, felt sheen, lacquer clearcoat.
- **Orbital Defense** 1.5 → 7, 59.6 fps. Polygonal pastel primitives are the final art, there is no audio, and it is the fleet's lowest. Fix: HDR starfield skybox as IBL, planet shader. E proposes withdrawing it; PRD 14 §6.3 permits withdrawal if it misses the bar.

Fleet acceptance (integrated, G-PANEL only): every game overall ≥ 7 or withdrawn, fleet mean ≥ 7.2, and no fleet category mean below 6.0.

### 8. In what order should this be implemented?

There is no serial order. There is one bootstrap and then everything in parallel (`CONTRACTS.md:2351-2413`):

1. **PR 0a, day 0 (2026-10-05).** Additive only, owned by the PRD 15 lane. It adds all contract types and stubs (`packages/{rendering,engine}/src/contracts/`), declaration-only optional fields, lane barrels, the conformance harness passing on stubs, `qr-contracts.yml`, `QR_OWNERSHIP.json`, and the ownership checker. PR 0 changes no pixel, no default and no signature.
2. **PR 0b, days 1–2.** Verbatim carve-outs and seams, split into three independently mergeable PRs: 0b-1 `agent-api/index.ts`; 0b-2 rendering hot files; 0b-3 GLTF, CLI and capture. Acceptance is the **IC-0 identity run**: `qr_flags=none` on 18 games and 18 scenes, with ΔE2000 p99 within the run-to-run noise of 37289688772.
3. **All 15 lanes start on day 0** in their own new files, branched from the PR 0a branch. Consumers build against stubs. 21 contracts need no 0b seam at all (C-02, C-03, C-04, C-06, C-07, C-08, C-10, C-15, C-17, C-19..C-27, C-30, C-32, C-35). Each file has one writer (§4). Behaviour lands behind `A3D_QR_*` flags, so a swap is a flag flip (`ContractSlot.get`).
4. **Integration checkpoints never block.** IC-1 is 2026-10-15 and they run every Thursday after that. G-PANEL rounds are IC-4, IC-8, IC-12 and so on. Each run captures `qr_flags=all` and `none` and records per-lane leave-one-out attribution. A failure files a `qr-ic-regression` against the owning lane, and that lane's flag is not promoted. Nobody else's merge is held.

PRD 14 §6.5 sets an internal review order for the games as targets, not as start gates. Soft dependencies are listed with standalone proofs per lane in `CONTRACTS.md:2731-2753`.

### 9. What is measurable acceptance?

The Aura3D Quality Bar (`_sections/E-debt-delete-qualitybar.md` "The Aura3D Quality Bar") is judged by a panel on the **shipped default path**. Captures are remote only.
- **Renderer**
  - R1: every benchmark scene scores ≥ three − 0.5.
  - R2: no major-deficiency or implementation-bug classification on any scene.
  - R3 (secondary signals, each of which must reject a broken control): shadow contrast within ±15%, FLIP ≤ 0.10, ΔE2000 ≤ 3, metal specular energy within ±20%.
  - R4: 6 "well-built" v2 scenes where three scores ≥ 7.
  - R5: time to first frame ≤ 1.5× three and draw calls ≤ 1.2× three.
- **Games**
  - G1: overall ≥ 7.
  - G2: no category below 5.
  - G3: measured rAF p50 ≥ 58 fps and p95 ≤ 20 ms on tier hardware.
  - G4: desktop and mobile both judged.
  - G5: default URL only.
  - G6: sampled audio.
- **Agents**
  - A1–A4: median ≥ 6.5 across 12 prompts × 3 seeds, with zero escapes.

The baseline is 0/18 games passing G1 and 2/18 scenes within 0.5. Conformance tests, engineering gates, vision-only rounds and metric thresholds are **not** acceptance (`CONTRACTS.md:2720-2727`). SSIM is excluded as a gate because it failed to discriminate (A §118).

### 10. Can Aura3D stand beside three.js?

Conditionally, and not today. The evidence that it is possible is that the core shading reaches parity where it is actually exercised (03 helmet, 11 multi-light). The largest losses are defaults, unwired passes and a lossy env/shadow chain, all of which the audit traced to specific code. None of them needs a new rendering paradigm. The conditions are:
1. PRDs 01–04 and 07 land the real env/IBL, shadows, post, materials and VFX paths, and their flags are promoted.
2. PRD 15 collapses the bridge so there is one renderer with no silent fallback.
3. PRD 05 and PRD 14 replace the content.
4. A **G-PANEL round** shows R1/R2 on all 18 base scenes plus the 6 well-built v2 scenes, and G1/G2 on the games, under the same capture conditions.

Matching today's three.js scores (4–7, capped by programmer-art scenes) is necessary but not sufficient. Standing beside a well-built three.js game means reaching ≥ 7 against references where three itself scores ≥ 7. Two structural risks remain:
- Shader and material architecture (C.7 #4). If PRD 01's generator and PRD 04's lobes slip, materials stay capped.
- WebGPU, which is not a credible higher ceiling in its current form.

Until a panel round says otherwise, the only honest claim is "behind three.js r185, by measured margins".

## Method and limits

- **Capture.** Run remotely in GitHub Actions run 37289688772 (`quality-rebuild-capture.yml`, macos-14, 3-vCPU virtual M1, Chromium ANGLE Metal on a **paravirtual GPU**), against the production origin at sha `c08d8acb`. Each of the 18 games got 3 desktop shots (opening/mid/action) and 1 mobile shot. The 18 same-input benchmark scenes were rendered in both Aura3D 3.0.1 and three.js 0.185.1 (`benchmarks/quality-rebuild/`). fps from this runner is **relative only**: Orbital Defense and Vault Breakers reach ~60 on the same runner, which rules out the runner as the cap, but absolute numbers do not represent user hardware. The engine's own fps telemetry is inadmissible because it reports 60 everywhere.
- **Vision judgments.** Subagent image reads of the screenshots failed, so the judgments were run through Kiro Prism (`claude-opus-5.5`) using 1100 px JPEGs and an art-director + rendering-engineer rubric calibrated to modern browser 3D (`research/21-game-vision-judgment.md:3`; research 23). Research 20 and 22 (code + pixel-stat pass 1) are superseded for visual scores, which is why three's pass-1 6.5–8.5 range differs from research 23's 4–7. The CONTRACTS IC-0 row was corrected to the research 23 means.
- **Code forensics.** Research 01–18 trace the frame from public API to GPU with path:line citations. Research 19 ran **2-skeptic adversarial verification** (code-trace lens + alternate-path lens, static reading) of 19 load-bearing claims (C1–C19): 7 confirmed by both skeptics, 8 confirmed by one and partially true by the other, 4 partially true by both, 0 refuted. The corrections include ambient-kills-IBL applying to 15/18 games, not all 18.
- **Not done.** No human review panel has been run; G-PANEL starts at IC-4. No real mobile devices were tested; mobile is an emulated 390×844 viewport at `deviceScaleFactor: 1`, so DPR loss is under-represented. No measurement was made on tier hardware or on real discrete or integrated GPUs. No leave-one-out attribution was run, so the Top 10 shares are estimates. No local builds or browsers were used.
- **Execution plan.** `AURA3D-QUALITY-MASTER-PLAN.md` holds the lane table, gantt, checkpoint calendar, scoreboard and first PRs per lane; `_sections/parallel-readiness-check.md` records the parallel-readiness verification.
- **Claim discipline.** Nothing in this document claims three.js-level quality from an engineering gate. Every parity statement above cites a vision-judged frame from run 37289688772.
## Capability matrix: Aura3D vs Three.js r185

Scope: the path that ships pixels. That is root `createAuraApp` → `createProductionRuntimeSceneRenderer`
(`packages/engine/src/agent-api/index.ts:13540`), hard-wired to WebGL2 (`index.ts:13590`). The 18 games and
the `benchmarks/quality-rebuild/` Aura side all run through it. Library code that this path never reaches
appears in its own rows, but the grade it gets is for what reaches pixels. Line numbers are at HEAD `c08d8acb`.

**Sources**
- Code forensics: research 02–13.
- Corrected counts: research 18 and 19.
- Visual verdicts: research 21 (shipped games) and research 23 (same-scene benchmark, Aura3D 3.0.1 vs
  three@0.185.1, GH Actions run 37289688772, macos-14 ANGLE Metal).
- Fairness: research 22, whose skeptic found the harness fair in every scene.

**Columns**
- **Ladder.** The rungs in order are E exists, W works, A public API, U used by apps, D good defaults,
  C composes, M modern quality, K agents know it, X examples show it. A cell lists the contiguous rungs
  reached and then the first rung that fails (`→ ✗D`). Rungs reached past a failure are not listed.
- **Visual quality.** Shown as `Aura / three` on a 0–10 scale. "bench NN" means the number is the research
  23 vision score for that scene. "est." means it is inferred from code and the shipped-game frames in
  research 21, with no isolated benchmark. Research 23 capped scores by scene content: three.js tops out
  at 7 even where it is correct.
- **Severity.** P0: visibly breaks most shipped frames, or fails the core of a benchmark scene.
  P1: a clear quality gap in common content. P2: niche, or hygiene.
- **PRD numbers.** These are this section's proposed workstreams (see the legend at the end). The final
  PRD section can renumber them, but the fix column should still map one to one.

| # | Capability | Three.js r185 | Aura3D implementation (path) | Ladder | API coverage | Visual Aura / three | Sev | Recommended fix (PRD) |
|---|---|---|---|---|---|---|---|---|
| 1 | Color pipeline (working space, sRGB I/O) | `ColorManagement` on; sRGB textures decoded by hardware; one output encode | Linear working space. `SRGB8_ALPHA8` for base/emissive textures, linear for data maps, a single encode (05 §0). The colour parser accepts only `#rrggbb`; `#f80`, `"orange"` and `rgb()` silently become near-black (05 §0 #9). The safe-basic fallback treats sRGB as linear and then gamma-encodes, a double gamma (`index.ts:16484, 16923`). | E·W·A·U → ✗D (parser, fallback) | ~70% | 6 / 7 est. (production path correct) | P1 | Full CSS colour parser that throws on unparseable input; delete the safe-basic renderer (PRD-1, PRD-10) |
| 2 | HDR scene target | RGBA16F / HalfFloat RT; post in linear HDR, `OutputPass` last | The forward target is `rgba16f` with 4× MSAA (`index.ts:12863`, `Renderer.ts:611`). SSAO, SSR, DOF, motion blur and TAA all run after tone mapping on 8-bit data (05 §0 #6). Aura Clash runs **rgba8 + Reinhard** through `GameRenderPreset.ts:373` (19 C15). | E·W·A·U·D → ✗C | partial: no target-format API on root | 5 / 7 est. | P1 | Move every screen-space pass before tone mapping on HDR targets; one OutputPass; delete the rgba8 presets (PRD-4) |
| 3 | Tone-mapping operators | Linear, Reinhard, Cineon, ACESFilmic, AgX, Neutral, Custom | Root forces ACES (`index.ts:12898-12904`), and the ACES fit matches three's. "AgX" is `log2(1+x)/log2(17)` plus a smoothstep; "Neutral" is a per-channel curve, not Khronos PBR Neutral (`WebGL2Device.ts:3541-3550`; 19 C12). The bench capability log lists `tone-mapping:agx/neutral` as missing in all 18 scenes. | E·W → ✗A (operator not selectable on root) | 1 of 6 real | 6 / 7 (ACES equivalent, bench 11) | P1 | Real AgX and Khronos Neutral; expose `toneMapping.operator`; default AgX or Neutral for games (PRD-4) |
| 4 | Exposure | `renderer.toneMappingExposure` | Hard-coded `exposure: 1` (`index.ts:12898`). `effects.colorGrade({exposure})` is dropped in all 16 root games that set it, and only a warning at `index.ts:4547` records it. The per-category `sceneExposurePresets` (`index.ts:4204-4213`) feed diagnostics only (19 C12). | E·W → ✗A | 0% on root | n/a (games authored 1.02–1.06) | P1 | Wire exposure to `u_exposure`; delete the decorative presets; add EV/physical-camera exposure (PRD-1, PRD-4) |
| 5 | Device pixel ratio | App sets `setPixelRatio(devicePixelRatio)`; r3f `dpr=[1,2]` | The `options.pixelRatio ?? profile.pixelRatio ?? devicePixelRatioSafe()` chain never reaches the third operand, because every profile defines a number (safe-basic 1, production/cinematic 1.5) (`index.ts:4256, 11133, 12280`). About 13–14 of 18 games render at 1× on retina; Skyline forces 0.7 (19 C2). | E·W·A·U → ✗D | full API, wrong default | 3 / 8 est. (¼ pixels at DPR 2) | **P0** | Default `min(devicePixelRatio, 2)` with a frame-time resolution governor; `preserveDrawingBuffer:false` (PRD-1, PRD-9) |
| 6 | MSAA | `antialias:true`; `samples` on RTs | 4× multisample renderbuffer under post, resolved before tone mapping (`WebGL2Device.ts:680-692, 769-786`). This works, and the default is better than `EffectComposer`'s. Canvas MSAA plus `preserveDrawingBuffer:true` is wasted bandwidth (`index.ts:13591-13595`). | E·W·A·U·D·C·M | implicit | 7 / 7 (bench 01/11 AA "equivalent") | P2 | Keep; drop canvas `antialias` and `preserveDrawingBuffer` (PRD-9) |
| 7 | FXAA | `FXAAShader` / `FXAANode` (FXAA 3.11) | A thresholded 4-tap cross blur that outputs `mix(center, avg(NSWE), 0.75)` above 0.125 luma range (`WebGL2Device.ts:3613-3630`). It runs on top of 4× MSAA in 17 of 18 games (19 C14). | E·W·A·U → ✗D ✗M (degrades the image) | API only | 2 / 6 est. (blurs texture detail) | **P0** | Delete it; MSAA-only by default; port real FXAA 3.11 as opt-in (PRD-4) |
| 8 | SMAA | `SMAAPass` / `SMAANode` | None on any path (05 §4.6) | ✗E | 0 | — / 7 | P2 | Port SMAA as the cheap post-AA (PRD-4) |
| 9 | TAA | `TAARenderPass`, `TRAANode` (velocity, variance clip) | `WebGL2Device.ts:3313-3409`: Catmull-Rom history and AABB clamp. The most correct effect in the device, but rigid opaque only: skinned meshes throw and particles are excluded. Used by 0 games. | E·W·A → ✗U | partial | — / 7 | P1 | HDR TAA with skinned velocity, after MSAA/TAA decision (PRD-4) |
| 10 | PBR core BRDF | GGX + correlated Smith + Schlick; `BRDF_GGX_Multiscatter`; `geometryRoughness` spec-AA; IOR→F0 | The GGX/Smith/Burley core is equivalent (`ShaderChunks.ts:65-126`). Missing: direct multiscatter, specular AA, IOR→F0 (F0 fixed at 0.04, `ShaderChunks.ts:93`). The production GLB shader also carries an asset hack, a "source paint" red gate that caps red albedo at `(0.98,0.12,0.075)` (`ShaderLibrary.ts:2905-2955`), plus the WebGPU Duck colour gates (`WebGPUDevice.ts:3555-3588`). | E·W·A·U·D·C → ✗M | ~80% | 6.5 / 7 (bench 03, closest scene) | P1 | Add multiscatter, spec-AA, IOR F0; delete every asset-specific gate (PRD-5) |
| 11 | IBL / PMREM | `PMREMGenerator` (GPU cube-UV, GGX), `RoomEnvironment` one-liner, HDR | The default/preset environment is a 128×64 procedural gradient, Reinhard-encoded to 8-bit sRGB *before* the GGX prefilter (`ExternalParityRenderPreset.ts:133-221`, `EnvironmentMapResources.ts:525-537`). It is bound with `minFilter:"linear"`, so WebGL2 reads only mip 0 (`ExternalParityRenderPreset.ts:169`). The HDRI path uses a CPU PMREM that blends toward the average radiance by up to 82% (`PMREMGenerator.ts:345-350`). SH9 irradiance is computed and never bound (19 C10). | E·W·A → ✗U (0 games use HDRI) | API exists | 4 / 7 (bench 06); 3.5 / 6 (bench 13) | **P0** | GPU PMREM over HDR RGBA16F; mip-sampled; bound SH/irradiance; default procedural HDR room or sky for every app (PRD-2) |
| 12 | HDRI visible background | `scene.background`, `backgroundBlurriness`, `backgroundIntensity` | `EnvironmentBackgroundPass` exists, but the root never sets `environmentBackground` (`rg` over `packages/engine/src` finds 0 matches). The background is always `clearColor` (`index.ts:13596`) (19 C9). 0 of 18 games have a sky. Bench capability log: `hdri-background` missing (09, 13). | E·W → ✗A | 0% on root | 0 / 7 (bench 09, 13: flat colour) | **P0** | Wire `environmentBackground`, with blur and intensity, on root; fog-to-background rule (PRD-2, PRD-12) |
| 13 | Ambient light | `AmbientLight`, `HemisphereLight`; additive to `scene.environment` | `lights.ambient()` with no `environments.*` node returns `environmentMapIntensity: 0, environmentMapSpecularIntensity: 0` (`index.ts:12693-12707`). **15 of 18 games have zero IBL** this way; Aura Clash avoids it through the compatibility RenderSource (18 C1, 19 C1). Ambient is also π× three's, because `kd·albedo·I` is applied with no 1/π (`ShaderLibraryCore.ts:622-634`). There is no `HemisphereLight`. | E·W·A·U → ✗D ✗C | API present, semantics wrong | 2 / 6 est. (flat "PS1" fill in 21) | **P0** | Ambient adds to the default env and never zeroes it; divide by π; real hemisphere light (PRD-1) |
| 14 | Punctual lights | Directional, Point (`distance`, `decay=2`), Spot (`decay`, `penumbra`, `map`), `RectAreaLight` (LTC); exact compiled count | Point range is hard-coded to `10*scale`, with no distance/decay option (`index.ts:13244`). Spot `decay` is accepted and never read (`:13258-13276`). Rect and softbox are emitted as spot proxies, so the LTC/area shader is unreachable (`:13279-13301`). Clustered lighting is disabled in all extension GLB variants: lights 17+ are silently ignored there (`ShaderLibrary.ts:2066-2075, 3140-3147`; 18 §2). | E·W·A·U → ✗D | ~55% | 5 / 5 (bench 11, equivalent) | P1 | Expose distance/decay; real area lights; remove the 16 cap on extension variants (PRD-1, PRD-3) |
| 15 | Light units | Physically correct by default since r155 (candela, lux, `decay 2`) | No unit anywhere. Directional is lux-like, point/spot candela-like with a d² ≥ 1 m² clamp, ambient radiance-scaled at π× (04 §3.2) | ✗E | 0% | — | P1 | Declare physical units; lux/candela/lumen API; EV exposure (PRD-1) |
| 16 | Directional shadows | `DirectionalLight.shadow`, `intensity=1`, `bias`, `normalBias`, `mapSize`, user frustum | Strength defaults to 0.32 (0.24 product/material, 0.38 city-day) via `mix(1,1-occ,s)` (`index.ts:12966-12968`, `ShaderLibrary.ts:251`), and there is no public strength option (19 C11). The ortho box is fit to the camera-culled caster set, with no texel snapping (`Renderer.ts:1964-1986`). Map size is derived from all node positions, including parked FX pools at y=-50 (18 C2). No normal bias. Only one shadowed light per scene (`index.ts:13174-13195`). | E·W·A·U → ✗D | ~35% (no strength, mapSize, bias or camera) | 3.5 / 5.5 (bench 12); 3 / 4.5 (bench 17) | **P0** | Strength 1.0 default; public shadow config; stable texel-snapped fit from an unculled light-frustum query; normal bias (PRD-3) |
| 17 | Shadow filtering | Hardware `sampler2DShadow` PCF, VSM, Basic; PCSS in examples | Manual `texture().r` compare on a NEAREST sampler (`ShadowPass.ts:142`), 9 or 16 binary taps (`ShaderLibrary.ts:225-251`). There is no `sampler2DShadow` and no `TEXTURE_COMPARE_MODE` in `rendering/src` (18 C7). | E·W·A·U → ✗M | 1 filter | 3 / 6 (bench 01/18: over-blurred, low contrast) | P1 | Hardware compare plus bilinear PCF; optional PCSS (PRD-3) |
| 18 | CSM | `examples/jsm/csm` | `CascadedShadowMaps.ts` (526 lines) with texel-stable fits exists, but the root can never reach it. The bridge passes `{viewProjectionMatrix}` rather than a `PerspectiveCamera`, and never sets `cascadeCount` (`Renderer.ts:1387-1391`, `index.ts:14006`). Cascades are selected per draw item, not per fragment (`ForwardPass.ts:834-854`). | E·W → ✗A | 0% on root | — / 7 (bench 17 three uses crisp shadows) | P1 | Per-fragment CSM on the root path for every directional sun (PRD-3) |
| 19 | Spot shadows | Perspective depth map, `penumbra` | Works (`Renderer.ts:1871-1877`). Four extension variants define `A3D_PBR_NO_SPOT_SHADOW` (`ShaderLibrary.ts:2067-2075`), so those GLBs get none. | E·W·A·U → ✗C | partial | 3.5 / 4.5 (bench 10: "largely lost") | P1 | Same depth path for every material variant (PRD-3) |
| 20 | Point shadows | GPU cube/atlas depth | Six faces are rendered, **read back to the CPU, quantized to 8 bits**, and re-uploaded as an RGBA8 atlas every frame (`Renderer.ts:1540-1577, 1915-1930`) | E·W → ✗D | implicit | 2 / 6 est. | P1 | GPU depth cube or DEPTH24 atlas (PRD-3) |
| 21 | Skinned / morphed shadow casters | Depth/distance materials include `skinning_vertex`, `morphtarget_vertex` | The only depth shader is position-only MVP (`DepthPass.ts:59-87`, `ShaderLibraryCore.ts:784-805`), so animated characters cast bind-pose shadows (19 C4) | E → ✗W | — | 3.5 / 5 (bench 08: "character floats") | **P0** | Depth-material variants that share the forward vertex stage (PRD-3) |
| 22 | Instanced / batched shadow casters | `InstancedMesh`, `BatchedMesh` cast per instance | Instanced items cast one copy at `modelMatrix`. Static batches (the root sets `staticBatching: !temporal`, `index.ts:13994`) cast **one copy at the world origin**, and the real copies cast nothing (19 C4). | E → ✗W | — | — (bench 16 shadowless by spec) | **P0** | Instanced depth variant reading `instanceTransforms` (PRD-3) |
| 23 | Alpha-tested / blended shadow casters | `alphaTest`, `alphaToCoverage`, `shadowSide` | MASK materials cast solid quads; BLEND materials are dropped as casters (`ShadowPass.ts:68, 206-212`) | E → ✗W | — | 2 / 6 est. (foliage, cards) | P1 | Alpha-test depth variant (PRD-3) |
| 24 | Contact shadows | Example (`webgl_shadow_contact`); GTAO contact | `ContactShadows.ts` is a CPU-pixel pass the root never requests. "Contact shadows" in diagnostics are counted from node **names** such as "footprint" and "glow pool" (`index.ts:4485-4487`). Ten apps fake them with translucent dark cylinders (`shadows.contact`, `index.ts:2366-2385`). | name-count only | fake | 1 / 5 est. | P1 | Delete name-counting; GTAO plus real contact hardening (PRD-4, PRD-14) |
| 25 | Ambient occlusion | `SSAOPass`, `SAOPass`, `GTAOPass`, TSL `ao()` | 8-tap SSAO over **raw non-linear depth** with a 0.025 raw-depth bias. At near 0.05 / far 100 it gives about zero occlusion beyond ~2 m (`WebGL2Device.ts:3091-3129`, `RootRuntimeSupport.ts:17-18`). It runs post-tonemap and multiplies emissive. Used by 7 games for no visible effect (19 C14). | E·W·A·U → ✗D ✗M | API only | 0 / 6 est. | **P0** | GTAO on linear depth plus normals (MRT), before tone mapping, denoised (PRD-4) |
| 26 | Screen-space reflections | `SSRPass`, `SSRNode` | A 64-step linear march on tone-mapped LDR (`WebGL2Device.ts:3131-3208`), `maxDistance` fixed at 18 (`index.ts:12925-12930`). 0 games. | E·W·A → ✗U | partial | — / 6 | P2 | SSR in HDR with roughness blur, after PRD-2 probes (PRD-4) |
| 27 | Reflection / light probes | `CubeCamera` + `PMREMGenerator.fromCubemap`; `LightProbe` + `LightProbeGenerator` | `ReflectionProbe.ts` captures a raw cube with no prefilter, no per-object selection and no consumers. No `LightProbe` type exists, and SH is computed but never sampled (04 §5.7; 18 §2). | E → ✗W | 0% | — / 6 | P1 | Prefiltered probes with per-object selection; SH light probes (PRD-2) |
| 28 | Bloom | `UnrealBloomPass`, `BloomNode` (HDR threshold > 1, mip pyramid) | The threshold is clamped to ≤ 1 and the device throws above it (`index.ts:12873`, `WebGL2Device.ts:4489`). `softKnee ≤ 0.5` is the maximum, and 17 routes copy it, so bloom starts at linear luma 0.05–0.34, i.e. mid-tones. "Balanced" adds a hidden ×7 gain (`NativeBloomPyramid.ts:106-109`) (19 C13). | E·W·A·U → ✗D | ~60% | 3 / 6 (bench 18: "overblown"; 21: milky haze) | **P0** | HDR threshold ≥ 1, knee ≤ 0.1, no hidden gain, energy-preserving pyramid default (PRD-1, PRD-4) |
| 29 | Depth of field | `BokehPass`, `DepthOfFieldNode` | Single-layer disc gather on LDR, no near/far separation (`WebGL2Device.ts:3210-3262`). 0 games. | E·W·A → ✗U | partial | — / 5 | P2 | HDR, CoC-weighted, layered DOF (PRD-4) |
| 30 | Motion blur | `MotionBlurNode` (velocity) | Per-pixel velocity, 16 taps, LDR, no tile-max (`WebGL2Device.ts:3264-3299`). 0 games. | E·W·A → ✗U | partial | — / 5 | P2 | Velocity from the TAA buffer, tile-max (PRD-4) |
| 31 | LUT / colour grade / vignette | `LUTPass`, `Lut3DNode`, `VignetteShader` | The present shader has contrast, temperature, saturation, vibrance, vignette and sharpening, but the bridge forwards **only contrast and saturation** (`index.ts:12905-12910`). There is no 3D texture anywhere (`rg TEXTURE_3D` finds 0), and `colorGrade.lut` is dropped. No dithering in the present path, which bands dark fog (05 §7). | E·W·A(2 of 10 fields) → ✗D | ~20% | 3 / 6 est. | P1 | Forward every grade field; 3D LUT; output dither (PRD-4) |
| 32 | Fog (exp/exp2/height/volumetric) | `Fog`, `FogExp2`; TSL fog nodes for height/range; volumetric via examples | The exp/exp2 chunk is correct (08 §3.1). Fog does not touch the background. Height is a multiplier, not integrated. Fog is resolved once from the static snapshot (`index.ts:12740-12745`), which freezes Skyline's per-act fog at act 0. "Volumetric" is a CPU radial blur anchored at UV [0.5, 0.18] that forces a readback chain (`VolumetricFog.ts:105-144`); Deep Recovery runs at 0.5–1 fps. | E·W·A·U → ✗C | ~50% | 4 / 6 est. | P1 | Fog applied to the background; runtime fog state; GPU froxel or raymarched volumetrics; delete the CPU chain (PRD-12) |
| 33 | Sky | `Sky` addon (Preetham), HDRI background | No sky path on root. `sky.dayNight` = gradient table plus emissive sphere stars and opaque PBR sphere clouds (`index.ts:3730-3769`). `planSkyBackdrop` emits posterized colour bands (`LayeredSceneComposition.ts:503-543`). 0 games call `sky.*`; games stack emissive boxes. | E·W·A → ✗U | façade | 1 / 6 (21: "flat navy void") | **P0** | Physical sky (Preetham/Hillaire) as a background plus env source (PRD-12) |
| 34 | Particles | `Points`, `Sprite`, instanced quads, `three.quarks`, TSL compute | The production bridge draws **zero pixels** for `effects.particles` / rain / snow / flipbook / beam and logs "non-pixel-backed" (`index.ts:13722-13723`). `RootGpuParticleWorkload` has no consumer. `ResidentGPUParticleRenderer` runs on its own canvas with a fixed camera (19 C8; 08 §1). | E·W(CPU only) → ✗A (silent no-op) | API only | 1 / 4 (bench 14) | **P0** | Billboard/flipbook particle pass in the root frame, with soft particles from depth and a runtime pool (PRD-6) |
| 35 | Blend modes | Normal, Additive, Subtractive, Multiply, Custom, premultiplied | Exactly one blend function in the engine, `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` (`WebGL2Device.ts:4404`; WebGPU `:1842`). `"additive-glow"` and `additive: true` are metadata only (19 C8). | E(alpha) → ✗M | 1 of 5 | 2 / 7 est. (glow renders as dimming cards) | **P0** | Per-material blend state: additive, premultiplied, multiply (PRD-6) |
| 36 | Decals | `DecalGeometry` | `ProjectedDecalGeometry.ts` is roughly at `DecalGeometry` level; `decals.*` allows up to 32 forward decals. Paint only: no normal or roughness blend, no skinned targets. **0 games.** | E·W·A → ✗U | ~parity | — / 5 | P2 | Teach and use it; add normal/roughness decal channels (PRD-6, PRD-14) |
| 37 | Trails / ribbons | `MeshLine`, ribbon geometry (ecosystem) | GameRuntime "trails" are scaled boxes. Ribbons exist only inside the standalone resident GPU demo (08 §1). | ✗E (on root) | 0 | 1 / 5 est. | P1 | Ribbon/trail primitive in the PRD-6 VFX pass (PRD-6) |
| 38 | KHR_materials_emissive_strength / unlit | Supported | Correct (`ShaderLibrary.ts:3070`; `GLTFRenderResources.ts:1550-1572`). Unlit is over-used: 16 of 120 game GLBs, heroes included (03 §0 #6). | E·W·A·U·D·C·M → ✗K | full | 6 / 6 est. | P2 | Ban unlit cards from `release` (PRD-11) |
| 39 | KHR_texture_transform | Per-texture `uvTransform` | Per-slot on textured PBR. The rotation sign is opposite to three's. The skinned path applies the baseColor transform to all maps. The in-shader `fract()` wrap breaks derivatives, so tiled UVs show seam lines (03 §5.2, §7). | E·W·A·U → ✗C | ~60% | 4 / 6 est. | P1 | Hardware wrap; per-slot transform in skinned; fix the rotation sign (PRD-5) |
| 40 | KHR_materials_ior / specular | IOR drives F0; specular scales it | IOR reaches only `refract()`; base F0 is a constant 0.04 (`ShaderChunks.ts:93`), yet the support matrix says "runtime-supported" (`GLTFExtensionSupport.ts:57`). Specular ≈ correct on a wrong F0. | E·W·A → ✗M | ~40% | — | P1 | IOR-derived F0 (PRD-5) |
| 41 | KHR_materials_clearcoat | Separate lobe, `(1−cc·Fcc)` base attenuation, roughness floor 0.0525 | Roughness floor 0.18. Clearcoat normal blended at 26%. No base attenuation. Absent entirely in the skinned shader (03 §7). Bench 04: `clearcoatRoughnessTexture` ignored, plus a milky non-Fresnel veil. | E·W·A → ✗M | ~50% | 4.5 / 6.5 (bench 04) | P1 | Spec-conformant layered lobe, all shader families (PRD-5) |
| 42 | KHR_materials_sheen | Charlie D + `IBLSheenBRDF` + energy compensation | Direct term `D·V·0.012 + pow(1−NdV,12)·0.18`; env term `pow(1−NdV,8)`; no energy compensation; none on skinned (03 §7). Bench 07: sheen roughness has no effect, IBL sheen is missing, base roughness is mishandled. | E·W(fudge) → ✗M | ~20% | 3 / 6 (bench 07) | P1 | Charlie plus E-LUT per spec (PRD-5) |
| 43 | KHR_materials_transmission / volume / dispersion | Transmission RT of opaques, roughness-LOD refraction, Beer volume, per-channel IOR dispersion | All 10 textured variants define `A3D_PBR_DISABLE_TRANSMISSION_BACKDROP` (`ShaderLibrary.ts:2066-2075`), so refraction samples the env only and the mix is ≤ 58% at energy 0.08. Volume is Beer ≈ OK. Dispersion is a fixed RGB tint (`ShaderChunks.ts:319`). `material.glass()` = opacity 0.24 + transmission, double-counted (03 §8). Bench 05: **black glass**. | E·W → ✗M (functionally broken) | ~30% | 3 / 6 (bench 05) | **P0** | Opaque-pass transmission RT with mips, per spec (PRD-5) |
| 44 | KHR_materials_anisotropy / iridescence | `alphaT` lobe + bent normal; `evalIridescence` in multiscatter | Anisotropy is an additive lobe evaluated with the *clearcoat* roughness, the base cut to 18%, and a hard-coded env direction (`ShaderLibrary.ts:2766, 2807, 3081`). Iridescence is an Airy film on textured, a cosine palette on primitives. `a3dApplyAdvancedPbrLobes` computes five lobes and returns none, so it only darkens the base by up to 28% (`ShaderChunks.ts:253-327`). | E·W(fudge) → ✗M | ~25% | 2 / 6 est. | P1 | Spec lobes; delete `a3dApplyAdvancedPbrLobes` (PRD-5) |
| 45 | KHR_materials_variants | `GLTFLoader` + `selectVariant` | Parsed in the asset layer; `createTypedGLBActor` never passes `materialVariant` (`TypedGLBActor.ts:184-191`), and `model()` has no option | E·W → ✗A | 0% on root | — | P2 | `model(asset,{variant})` (PRD-5) |
| 46 | Tint semantics (`material.color` on a model) | `color` multiplies `map` | `model(asset,{material:{color}})` hard-codes `replaceSurfaceTextures:true` (`index.ts:13570`). Every material in the GLB loses base-colour and MR textures, gains emissive = base colour at 0.28 when no emissive is given, and ignores opacity (`TypedGLBActor.ts:477-514`). `material.pbr()` always injects a colour, so any override triggers it (19 C3). | E·W·A·U → ✗D | wrong semantics | 2 / 7 est. ("toy plastic") | **P0** | Tint multiplies `baseColorFactor` only; never auto-emissive; honour alpha (PRD-1, PRD-5) |
| 47 | KTX2 / Basis | `KTX2Loader.detectSupport(renderer)`; sRGB compressed formats | ETC2 is assumed. Compressed uploads use non-sRGB formats, so base colour is sampled as linear (washed out). Each image is transcoded twice. The transcoder loads from the unpkg CDN at runtime (03 §5.1; 11 §1). 0 assets; no encoder. | E·W(RGBA8 fallback) → ✗U | decode only | — | P1 | Format detection, sRGB formats, local transcoder, CLI encode (PRD-11) |
| 48 | Draco / Meshopt / quantization | `DRACOLoader`, `MeshoptDecoder`, local libs; gltfpack/gltf-transform norm | Decoder adapters exist, but `TypedGLBActor` injects none, so any Draco/Meshopt GLB fails in `createAuraApp` (`TypedGLBActor.ts:184-191`, `AssetDecoders.ts:13`). 0 of 226 model assets use either. No encoder. Meshy heroes are 15–28 MB at ~200 MB VRAM each (11 §0). | E·W(if injected) → ✗A | 0% on root | n/a (perf) | P1 | Wire decoders; `assets optimize` (Meshopt, KTX2, resize, tangents, LOD) (PRD-11) |
| 49 | Mipmaps / anisotropy / wrap | `generateMipmaps`, `anisotropy` (default 1), hardware wrap | GLB textures: `linear-mipmap-linear`, repeat, aniso 8, **better than three's default** (`GLTFRenderResources.ts:2196-2213`). Primitive textures: `new Sampler({maxAnisotropy})`, which means no mip sampling and clamp-to-edge, so they cannot tile (`index.ts:14379-14381`). That is why the games use 4 texture refs and 0 normal maps (03 §0 #3). No MAX_TEXTURE_SIZE downscale. | E·W·A·U → ✗D (primitives) | partial | 6 / 6 GLB; 2 / 6 primitives est. | P1 | Mipmapped repeat sampler and a wrap API on primitives (PRD-5) |
| 50 | Normal mapping / tangents | Authored tangents or per-pixel derivative frame | Per-vertex Lengyel accumulation, not MikkTSpace. Tangents are transformed by the normal matrix with no re-orthogonalization, so TBN skews under non-uniform scale (03 §6). Only 22 of 120 GLBs carry TANGENT. | E·W·A·U → ✗M | ~70% | 5 / 6 est. | P2 | Derivative-frame fallback; MikkTSpace in `assets optimize` (PRD-5, PRD-11) |
| 51 | Skinning | `SkinnedMesh`, persistent bone texture | LBS 4/8 influences works: bench 08/15 silhouette IoU 0.994. Above 96 joints, a **new RGBA32F texture is created per draw per frame** (`ForwardPass.ts:1984, 2014-2034`). The skinned PBR shader is a fork without clearcoat or sheen. Only Aura Clash shows skinned pixels in games (09 §1.5). | E·W·A·U → ✗D (shadows, perf) | ~75% | 4.5 / 5.5 (bench 15) | P1 | Persistent bone texture; shared material path; shadows via #21 (PRD-8) |
| 52 | Morph targets | `sampler2DArray` morph texture, unlimited, all lit materials | The GPU path is capped at 4 targets × 64 vertices and only for `MorphUnlitMaterial` (`ForwardPass.ts:119-120`). Everything else gets a **new Geometry every frame** on the CPU (`ForwardPass.ts:313, 347-349`). Visemes default to a scaled mouth card (`VisemeController.ts:121-122`). | E·W(CPU) → ✗D | ~30% | 2 / 6 est. | P1 | Morph texture array in all lit and skinned shaders (PRD-8) |
| 53 | Animation mixer / crossfade | `AnimationMixer`, `crossFadeTo(warp)`, `syncWith`, rest restore | Four parallel stacks (09 §3.1). Root `node.play` is a single clip: no crossfade, `speed` ignored, a silent first-clip fallback on a name miss (`index.ts:15070-15124, 15461-15476`). The documented `AnimationController`+`clipRegistry` path emits an empty pose that wins over `playClip`, which **freezes** Gallery Shift and the fighting-game template (`index.ts:13871-13883`; 19 C16). | E·W·A → ✗U (root) / ✗D | ~40% | 2 / 6 est. | **P0** | One animation authority; the root drives the mixer with crossfade, speed and rest restore; fix the empty-pose branch (PRD-8) |
| 54 | Additive / masks / IK / retarget | `makeClipAdditive`, `AdditiveAnimationBlendMode`, `CCDIKSolver`, `SkeletonUtils.retargetClip` | Additive uses absolute values with no reference subtraction. Masks are substring matches with a hard 0/1 boundary. IK is two-bone analytic only. Retargeting appears in 2 template scripts. Spring bones, the Inertializer and the state graph have **0 app uses** (09 §0, §3.3). | E·W·A → ✗U | ~50% | — | P2 | Reference-frame additive, weighted masks, wire springs/IK into PRD-8 runtime (PRD-8) |
| 55 | Instancing | `InstancedMesh` (unlimited, upload on change) | **Bug:** `createProductionInstanceTransforms` (`index.ts:14747-14753`) omits `node.size`, and the item modelMatrix applies size outside the instance translation (`index.ts:13976`, `ShaderLibraryCore.ts:261`). Positions shrink to 0.3×, boxes overlap and sink (22, confirmed). The uniform path is capped at 64. Above 64 instances, or with colours, a vertex buffer is created per frame and a **VAO is leaked** (`ForwardPass.ts:1755, 1803`; `WebGL2Device.ts:4225-4236`). WebGPU caps at 4. | E·W → ✗C (bug) | ~50% | 2.5 / 4.5 (bench 16) | **P0** | Fix transform composition; persistent instance buffers; remove the caps (PRD-7, PRD-9) |
| 56 | Batching | `BatchedMesh` (multi-draw / indirect) | "Static batching" regroups into 64-instance chunks **every frame** from dynamic matrices (`Renderer.ts:2361-2385`), feeding the leaking path and the origin-shadow bug (#22). No `WEBGL_multi_draw`, no UBOs. | E·W → ✗D | — | n/a (perf; draw calls 1.9–7× three, 15 §4.1) | P1 | Merge-once static batching; multi-draw; UBOs (PRD-9) |
| 57 | LOD | `LOD` object, meshopt simplifier | `distanceLod` switches only between authored primitive levels (`index.ts:2348`); it does not reach GLBs. No simplification, no HLOD (07 §3.4; 11 §1). | E·W·A → ✗D | ~30% | n/a | P2 | GLB LOD plus generated LODs in `assets optimize` (PRD-9, PRD-11) |
| 58 | Culling | Per-object frustum; WebGPU occlusion queries | Frustum culling is on in root (`index.ts:13995`), with a `Box3` allocation per item. `BVH`, `Octree` and `Batcher` are exported with 0 call sites. No occlusion culling (07 §3.4). Shadow casters are wrongly camera-culled (#16). | E·W·A·U·D | ~60% | n/a | P2 | Separate light-frustum caster query; occlusion queries on WebGPU (PRD-3, PRD-9) |
| 59 | Scene graph | `Object3D.matrixWorld = parent * local` | `composeAuraTransform` adds positions, **adds Euler angles**, and multiplies scales component-wise (`index.ts:17982-18006`). A rotated or scaled parent does not move its children's offsets. Live hit: Courier Rush's city kit is scaled ×6 and collapses (19 C6). | E → ✗W | API exists, semantics wrong | n/a (geometry correctness) | **P0** | Matrix/quaternion hierarchy; the `@aura3d/scene` Transform already does it (PRD-7) |
| 60 | Primitive geometry | `SphereGeometry(…,64,32)`, `CapsuleGeometry`, caps | Sphere 16×12 and cylinder 24 segments (bench log `primitive-tessellation` missing in 10 scenes). `capsule` returns a sphere (`index.ts:14979, 17359-17362`). **Cylinder top cap missing** in bench 01 and 12 (implementation bug, cause not yet traced). Faceted spheres in bench 13. | E·W·A·U → ✗M | ~70% | 3.5 / 4.5 (bench 01) | P1 | 64×32 spheres, 48-segment cylinders, real capsule, fix the cap (PRD-7) |
| 61 | WebGPU | `WebGPURenderer` default with WebGL2 fallback; TSL → WGSL/GLSL | Root hard-codes `backend:"webgl2"` (`index.ts:13590`). The WebGPU device is GLSL→WGSL marker-sniffing (`WebGPUDevice.ts:3179-3311`), and unknown shaders become flat unlit. One hard-coded light direction ×2.25. One render pass and one submit per draw. CPU raster shadow copy. 8-bit shadow depth (07 §0). 0 games. | E·W(5 families) → ✗U | façade | — | P1 (decision P0) | Decide: adopt three r185 `WebGPURenderer`+TSL vs repair (18 Q3); delete the marker dispatch either way (PRD-10) |
| 62 | Shader / material system | Chunk-assembled programs keyed by `getProgramCacheKey`; `onBeforeCompile`; TSL node materials; custom post passes | About 14 hand-named GLSL uber-programs with runtime uniform branching and copy-pasted lighting across families (02 §7 #1). `NodeMaterial` is a 20-line data bag with no codegen (`packages/materials/src/NodeMaterial.ts`). `PortableShaderMaterial` needs hand-written GLSL *and* WGSL. No custom post pass (05 §8). Sync compile at first draw, no `KHR_parallel_shader_compile`. | E·W·A·U → ✗C | ~25% | n/a (enabler) | P1 | Single feature-keyed program generator, or TSL via PRD-10; async compile (PRD-10) |
| 63 | Camera rigs | Controls (Orbit, PointerLock, Fly…); game cameras user-owned or `camera-controls` | `camera.follow` is a single first-order lag (~0.27–0.36 s) on both eye and target. The up vector is fixed `[0,1,0]`, so there is no roll. Shake is filtered down to 4–9%. Collision-aware orbit and shoulder cam have 0 uses. There is no live camera API, so games cast the frozen spec (10 §1, §3). | E·W·A·U → ✗D ✗C | more names than three, last mile missing | 3 / 6 est. (21: static wide shots) | P1 | Live camera API; spring-damped rig with look-ahead; shake post-smoothing (PRD-13) |
| 64 | Physics | None in core (ecosystem: Rapier, cannon-es, `RaycastVehicle`) | Rapier is used only as a contact oracle in 3 games. The `rapier-physics-proof` drops a box for 480 steps as evidence. The arcade vehicle is a unicycle with no lateral slip (`GameRuntime.ts:2007-2045`). `VehicleChassis` is used only by Turbo. `@aura3d/physics` controllers (7.3k lines) have 0 imports (10 §6). | E·W·A·U → ✗D ✗M | n/a vs three | feel est. 3 / 6 (20) | P1 | Bicycle-model vehicle plus chassis by default; delete proof-evidence worlds (PRD-13) |
| 65 | Audio | `AudioListener` (follows the camera), `PositionalAudio` (HRTF), live `setPlaybackRate` | `GameAudio.playPositional` never builds a panner: spatial data goes to evidence only (`GameAudio.ts:345-386`). The default cue is a 176 Hz sine beep (`:485-503`). No live rate or gain, so no RPM-pitched engines. 17 of 18 games ship oscillator-synthesized WAVs; only Aura Clash ships sampled audio (18 C12). `@aura3d/audio` `SpatialAudio` is unused. | E·W·A·U → ✗D ✗M | below three | n/a (20: low) | P1 | Route GameAudio through `SpatialAudio`, with a camera-synced listener, live params and a master limiter; sampled SFX bar (PRD-13, PRD-11) |
| 66 | Editor | threejs.org/editor (scene JSON, import, scripting) | `@aura3d/editor-runtime` is 7,663 lines; `@aura3d/editor` is a one-line `export *` (13 §1.1). No game or template authors through it. Visual quality not assessed. | E → ✗U | unknown | — | P2 | Out of scope until the rendering baseline lands; collapse the alias package (PRD-14) |
| 67 | Agent-authoring APIs | None (three's only "agent" surface is its docs and examples) | Declarative `createAuraApp` plus skills, prompt plans and scene kits: Aura's one structural advantage, currently harmful. Skills spend about 6× more lines on evidence than on visual craft; the browser-game skill has 0 craft lines (12 §0). `compilePromptPlan` ignores camera, lighting and effects yet reports them in `visualSystems` (19 C17). `visualQA` grades node names. The `mini-game` starter runs `@aura3d/lean`, where lights and environments are inert and rotation is identity (19 C7). | E·W·A·U·K → ✗D ✗M | broad | output 1.5–4 / ~7 (21: 18 games) | **P0** | Agents copy a good-default recipe; honest prompt-plan report; pixel-judged gates; lean starter onto the root renderer (PRD-14) |
| 68 | Parity / quality evidence | n/a | The `three-compat` "visual and runtime parity" suite hard-codes scores, frame times and draw calls, and paints its screenshots in Canvas2D (`benchmarks/three-compat/shared/scenes.ts:21-35`; 19 C18). Release gates waive textures on the word "stylized" (`aura3d-cli/src/index.ts:3376-3382`; 19 C19). The only real comparison is `benchmarks/quality-rebuild/`. | fake | — | — | **P0** | Delete fake parity; make the research 23 benchmark plus a vision rubric the release gate (PRD-14) |

**PRD legend.** These are proposed workstreams; each maps to the capability rows above.

| PRD | Workstream | Rows |
|---|---|---|
| PRD-1 | **Default look baseline.** Default HDR environment. Ambient adds to the environment. DPR. Exposure. Shadow strength 1. Bloom defaults. Tint semantics. Light units. | 4, 5, 13, 14, 15, 28, 46 |
| PRD-2 | **IBL rebuild.** GPU PMREM on HDR. Visible background. Probes and SH. | 11, 12, 27 |
| PRD-3 | **Shadow system rewrite.** Depth variants. Hardware compare. CSM on root. Multiple shadowed lights. GPU point shadows. Public config. | 16–23, 58 |
| PRD-4 | **HDR post and colour.** AA policy. GTAO. Real AgX and Neutral. LUT. Dither. SSR, DOF and motion blur in HDR. | 2, 3, 7–9, 24–26, 29–31 |
| PRD-5 | **Material conformance.** KHR extensions. Specular AA. IOR. Transmission RT. Primitive samplers. Tangents. | 10, 39–46, 49, 50 |
| PRD-6 | **VFX.** Blend modes. Particle, flipbook and trail pass. Runtime spawn. Decals. | 34–37 |
| PRD-7 | **Geometry and scene-graph correctness.** Matrix hierarchy. Instancing size bug. Tessellation. Cylinder cap. Capsule. | 55, 59, 60 |
| PRD-8 | **Single animation authority.** Mixer on root. Crossfade. Morph texture. Bone texture. | 51–54 |
| PRD-9 | **GPU performance architecture.** Persistent instance buffers. VAO leak. Multi-draw and UBOs. LOD. preserveDrawingBuffer. | 6, 55–58 |
| PRD-10 | **Renderer strategy.** Three.js r185 `WebGPURenderer`+TSL vs repair. Delete safe-basic, the lean device and the marker WGSL. | 1, 61, 62 |
| PRD-11 | **Asset optimization and admission.** Meshopt, KTX2 and LOD encode. Wire decoders. Remove the waiver. Ban unlit cards. | 38, 47–50, 57, 65 |
| PRD-12 | **World and atmosphere.** Sky. Fog-to-background. Runtime fog. GPU volumetrics. | 32, 33 |
| PRD-13 | **Game-feel runtime.** Live camera. Interpolated loop. Vehicle model. Spatial audio. | 63–65 |
| PRD-14 | **Agent path and quality gates.** Recipes. Honest reports. Pixel-judged release gate. Delete fake parity. | 24, 36, 66–68 |

### Where exactly Aura3D is behind visually (same-scene benchmark, research 23)

**What was compared.** Both engines rendered identical scene specs (`benchmarks/quality-rebuild/shared/scenes.ts`).
The Aura side used only public, idiomatic API, and research 22's skeptic confirmed the harness fair in all 18 scenes.

**Scores.** Research 23 vision scores are on a "modern browser 3D" scale where scene content caps both engines.
- Aura3D: 1–6.5, mean **3.6**.
- three.js: 4–7, mean **5.4**.
- Mean gap: 1.8.

Research 22's pass-1 pixel-stat scores (three 6.5–8.5) are superseded for visual judgment.

**Classifications.** Eight scenes are primary implementation bugs, seven major deficiencies, two minor
deficiencies, and one equivalent (11).

**Global metrics do not see the defects.** SSIM is ≥ 0.95 in 14 of 18 scenes, including black glass (05,
SSIM 0.946) and bind-pose shadows (08, 0.989). Only 14 (particles absent, 0.558) and 16 (instancing collapse,
0.399) register. SSIM must not be used as a gate.

The table is ranked by gap (three minus Aura), then by how often the root cause recurs.

| Rank | Scene | Classification (23) | Aura | three | Gap | What is visibly wrong | Root cause (code) | PRD |
|---|---|---|---|---|---|---|---|---|
| 1 | 14-particles | implementation-bug (major) | 1 | 4 | 3.0 | The entire 2000-sprite fountain is absent, and the ground is lit by an injected fallback light | The production bridge has no particle draw path (`index.ts:13722`); the direct-light fallback (`index.ts:13159`); alpha-over blending only | PRD-6, PRD-1 |
| 2 | 05-transmission | implementation-bug | 3 | 6 | 3.0 | The transmissive bowl renders as opaque black lacquer; the backdrop is darker | `A3D_PBR_DISABLE_TRANSMISSION_BACKDROP` in all textured variants (`ShaderLibrary.ts:2066-2075`) | PRD-5 |
| 3 | 06-metal-roughness-sweep | major-deficiency | 4 | 7 | 3.0 | Blotchy mid-roughness reflections; the roughness-1 sphere is a flat disc; red is darker; rims ignore roughness; aliasing | The CPU PMREM averaging blend and low-res chain (`PMREMGenerator.ts:345-350`); no roughness-aware Fresnel or spec-AA | PRD-2, PRD-5 |
| 4 | 07-sheen-fabric | implementation-bug | 3 | 6 | 3.0 | 16 near-identical glossy plastic balls; sheen roughness has no effect; IBL sheen is missing | The ×0.012 Charlie fudge and no env sheen (03 §7); base roughness mishandled | PRD-5 |
| 5 | 02-pbr-product | implementation-bug | 3.5 | 6 | 2.5 | The pedestal renders translucent and ragged; tripod and ground shadows are near-absent; chrome is clipped | The material path wrongly takes blend/transmission (cause not fully traced); shadow strength 0.24 for the "product" category (`index.ts:12966-12968`) | PRD-5, PRD-3 |
| 6 | 13-ibl-only | major-deficiency | 3.5 | 6 | 2.5 | No HDRI backdrop; flat diffuse IBL; wrong gold roughness; faceted spheres; shadows and a hotspot in an IBL-only scene | No root `environmentBackground`; the PMREM chain; 16×12 spheres; the injected fallback light rig (`index.ts:13159`) | PRD-2, PRD-7, PRD-1 |
| 7 | 04-clearcoat | implementation-bug | 4.5 | 6.5 | 2.0 | `clearcoatRoughnessTexture` is ignored; a milky veil sits over the coated cell; the base is darker | Coat roughness floor, 26% normal blend, no base attenuation (03 §7) | PRD-5 |
| 8 | 09-outdoor-environment | major-deficiency | 3.5 | 5.5 | 2.0 | Flat sky; washed-out sun-to-IBL balance; no specular; weak shadows under haze | No HDRI background (C9); shadow strength 0.32; π× ambient | PRD-2, PRD-3, PRD-1 |
| 9 | 12-shadows | major-deficiency | 3.5 | 5.5 | 2.0 | The second light's shadows are absent; the primary shadows are barely visible; the cylinder cap is missing | One shadow caster per scene (`index.ts:13174-13195`); strength 0.32; the cap geometry bug | PRD-3, PRD-7 |
| 10 | 16-instancing | implementation-bug | 2.5 | 4.5 | 2.0 | The field shrinks to about 30% of its extent and collapses into an overlapping slab sunk into the ground | `createProductionInstanceTransforms` omits `node.size` (`index.ts:14747`; 22 confirmed) | PRD-7 |
| 11 | 08-skinned-character | implementation-bug | 3.5 | 5 | 1.5 | The character casts almost no shadow and floats | The position-only depth shader gives bind-pose shadows (`DepthPass.ts:59-87`); strength 0.24 | PRD-3 |
| 12 | 17-large-environment | major-deficiency | 3 | 4.5 | 1.5 | Flat-shaded boxes with no visible cast shadows; under-weighted sun | Single culled-fit map, strength 0.38 for city-day; CSM unreachable (`Renderer.ts:1387-1391`) | PRD-3 |
| 13 | 18-game-scene | major-deficiency + bug | 3.5 | 5 | 1.5 | Mushy shadows with the silhouette lost; a spurious diagonal shadow band; overblown orb bloom; muddy ground | Shadow fit and filter; a fit/projection artifact; bloom ×7 gain and wide knee (`NativeBloomPyramid.ts:106-109`) | PRD-3, PRD-4 |
| 14 | 01-simple-geometry | implementation-bug + major shadow | 3.5 | 4.5 | 1.0 | Cylinder cap missing; shadows faint (~10% darker vs ~80% in three) and over-blurred; flat form shading | The cap bug; strength 0.32; over-wide PCF; π× ambient lift | PRD-7, PRD-3, PRD-1 |
| 15 | 10-indoor-environment | major-deficiency | 3.5 | 4.5 | 1.0 | Spotlight shadowing largely lost; furniture floats; muddy image | Spot shadow strength; under-powered punctual lights (`index.ts:13244`) | PRD-3, PRD-1 |
| 16 | 15-animation-skinning | minor-deficiency | 4.5 | 5.5 | 1.0 | Skinning matches (IoU 0.994), but the shadows are ~9% darker vs ~50% in three, mushy and misshapen | Bind-pose depth plus strength 0.24 | PRD-3 |
| 17 | 03-damaged-helmet | minor-deficiency | 6.5 | 7 | 0.5 | The visor highlight is softer and over-blurred; the metal is slightly brighter and flatter | Env prefilter LOD mapping and specular energy | PRD-2 |
| 18 | 11-multiple-lights | equivalent | 5 | 5 | 0 | Only a faint extra ambient lift on up-facing surfaces | The hemisphere/ambient floor | PRD-1 |

**How the defects cluster.** The ranks reduce to four recurring root causes, in order of pixel impact:

1. **Shadows.** This is the dominant visible failure, present in 10 of 18 scenes (01, 02, 08, 09, 10, 12,
   13, 15, 17, 18). Weak strength, bind-pose casters, a single caster, culled fits and manual NEAREST PCF
   together lose object grounding, which is the main cue in every game frame. One rewrite (PRD-3) plus one
   default change (strength 1.0, PRD-1) addresses all ten.
2. **Environment and IBL.** Scenes 03, 06, 09 and 13 fail on no visible HDRI, a lossy CPU PMREM, and an LDR
   procedural default that the 15 ambient-only games do not even receive (PRD-2).
3. **Material extensions.** Transmission, sheen and clearcoat (scenes 04, 05, 07) are fudge-factor lobes
   that fail the conformance intent of their own scenes (PRD-5).
4. **Silent no-ops and geometry bugs.** Missing particles (14), instancing transforms (16), the cylinder
   cap (01, 12) and faceted primitives (13) are cheap to fix. They are categorical failures, not tuning
   (PRD-6, PRD-7).

**Where Aura matches.** Equivalence holds only where none of these paths is exercised: multi-light GGX with
ACES (11), skinning pose (15), and base PBR on a textured GLB (03). The renderer core is not the ceiling. The
defaults, the shadow pipeline, the IBL chain and the unreachable or no-op features are.

**The shipped games.** Research 21 vision scores range from 1.5 (Orbital Defense) to 4 (Blockfall,
Rooftop, Skyline), median 3. On the macos-14 runner most games ran at 5–15 fps, Deep Recovery at 0.5–1 fps
(CPU volumetric readback chain), and Orbital Defense and Vault Breakers at about 60 fps. Fixing the
benchmark rows is necessary but not sufficient. The games also need assets, sky, VFX and camera work
(PRD-11 to PRD-13), and none of them is competitive with a well-built three.js r185 browser game today.
## 18-game scorecard

Sources. The 27 visual categories (everything except Feel, Ctrl, Phys, Audio, Load, Perf) come from research/21-game-vision-judgment.md. That is the authoritative vision pass over the shipped production screenshots: GH Actions run 37289688772, macos-14, ANGLE Metal on a paravirtual GPU, production origin aura3d.auraone.ai, sha c08d8acb. The six non-visual categories come from research/20-game-scorecards-code-pixelstats.md, rounded to the nearest 0.5 with ties going up. Performance was cross-checked against fps in evidence/games/report.slim.json.

"Mean" is the per-game mean of the 32 component categories, excluding Overall. The bottom row is the per-category mean across games. fps figures are relative: the runner is a 3-vCPU, 7 GB virtual M1. On that same runner, Orbital Defense and Vault Breakers sustain about 60 fps, so the runner is not the cap.

### 1. Summary table (0–10)

| Game | Env | Asset | Tex | Mat | PBR | Light | Shad | Amb | IBL | Tone | Color | AA | Post | VFX | Part | Anim | Char | Cam | Comp | Depth | Atmo | Read | HUD | Type | Feel | Ctrl | Phys | Audio | Load | Juice | Mob | Perf | Overall | Mean |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Aura Clash Arena | 4 | 4 | 4 | 3 | 3 | 3 | 2 | 3 | 2 | 3 | 4 | 4 | 2 | 2 | 2 | 4 | 3 | 3 | 3 | 4 | 1 | 5 | 6 | 6 | 5 | 5.5 | 4 | 4 | 4 | 3 | 2 | 3 | 3 | 3.5 |
| Blockfall Reactor | 4 | 3 | 5 | 5 | 4 | 4 | 1 | 3 | 3 | 6 | 6 | 6 | 5 | 2 | 2 | 2 | 3 | 2 | 5 | 3 | 2 | 6 | 4 | 5 | 4 | 6 | 4 | 3 | 4 | 2 | 3 | 2 | 4 | 3.7 |
| Skyline Runner | 5 | 4 | 4 | 4 | 3 | 4 | 2 | 4 | 1 | 4 | 5 | 5 | 4 | 4 | 1 | 3 | 5 | 4 | 4 | 3 | 3 | 4 | 6 | 6 | 3 | 4 | 4 | 3 | 4 | 2 | 2 | 2 | 4 | 3.6 |
| Turbo Drift Circuit | 2.5 | 3.5 | 1.5 | 3 | 3 | 3.5 | 2.5 | 3.5 | 2.5 | 4 | 4.5 | 5 | 3.5 | 2 | 1.5 | 3 | 4 | 3.5 | 2.5 | 2.5 | 3 | 5 | 6.5 | 7 | 5 | 5 | 4 | 3 | 5 | 2.5 | 3 | 3 | 3 | 3.5 |
| Siege Golf | 3.5 | 3 | 2.5 | 3 | 2.5 | 4.5 | 4.5 | 4 | 1.5 | 5 | 5 | 6 | 4 | 3 | 1.5 | 3 | 1 | 4.5 | 3.5 | 3 | 2 | 6 | 4 | 6 | 4 | 5 | 6 | 3 | 3.5 | 3 | 3.5 | 3 | 3.5 | 3.7 |
| Aurora Lander | 1.5 | 4 | 1.5 | 2.5 | 2 | 2.5 | 1 | 3 | 1 | 3.5 | 4.5 | 5 | 3 | 2.5 | 1 | 3 | 3.5 | 2 | 1.5 | 1.5 | 1 | 4 | 5.5 | 5.5 | 3 | 5 | 4 | 3 | 5 | 2 | 4 | 6 | 2.5 | 3.1 |
| Neon Swarm | 2 | 3 | 3 | 3 | 3 | 3 | 2 | 2 | 1 | 4 | 4 | 5 | 4 | 2 | 1 | 2 | 3 | 4 | 3 | 2 | 2 | 2 | 5 | 5 | 3 | 5 | 4 | 3 | 4.5 | 2 | 3 | 4.5 | 2.5 | 3.1 |
| Gravity Post | 2.5 | 3 | 2.5 | 2 | 1.5 | 2 | 0.5 | 2 | 1 | 3 | 4 | 4 | 1 | 2 | 2 | 2 | 2.5 | 4 | 4 | 2 | 1 | 5 | 6 | 6 | 3 | 3 | 4 | 2 | 3 | 2.5 | 2.5 | 2 | 3 | 2.7 |
| Courier Rush | 2 | 4 | 3 | 3 | 2 | 3 | 1 | 3 | 1 | 2 | 4 | 5 | 2 | 3 | 1 | 3 | 2 | 3 | 3 | 3 | 1 | 2 | 6 | 6 | 2.5 | 5 | 3 | 1.5 | 4 | 2 | 3 | 2 | 2 | 2.8 |
| Pulse Tunnel | 3 | 3 | 1 | 3 | 3 | 3 | 1 | 2 | 3 | 4 | 5 | 5 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | 4 | 1 | 2 | 5 | 5 | 3 | 5 | 3 | 5 | 4.5 | 2 | 1 | 3 | 3 | 2.9 |
| Mech Hangar | 2.5 | 3.5 | 2.5 | 3.5 | 3.5 | 3.5 | 2 | 3 | 2.5 | 5 | 5 | 5 | 4 | 1.5 | 1 | 3 | 3.5 | 3.5 | 3.5 | 3 | 1.5 | 5 | 4.5 | 4.5 | 3 | 5 | 2.5 | 2 | 4 | 2 | 1.5 | 2 | 3.5 | 3.2 |
| Vault Breakers | 2 | 2 | 1 | 2 | 1 | 2 | 1 | 2 | 0 | 4 | 4 | 5 | 1 | 1 | 0 | 3 | 1 | 4 | 4 | 3 | 1 | 3 | 5 | 5 | 4 | 5.5 | 6 | 3 | 4.5 | 1 | 3 | 7 | 2.5 | 2.8 |
| Rooftop Buckets | 3 | 3 | 2 | 3 | 3 | 5 | 2 | 4 | 2 | 4 | 5 | 5 | 4 | 4 | 3 | 3 | 5 | 4 | 4 | 4 | 2 | 6 | 6 | 5 | 3.5 | 5 | 6 | 2.5 | 4.5 | 3 | 3 | 3 | 4 | 3.8 |
| Gallery Shift | 4 | 3 | 2 | 3 | 2 | 4 | 2 | 3 | 1 | 4 | 5 | 5 | 4 | 2 | 1 | 3 | 2 | 4 | 3 | 4 | 1 | 4 | 4 | 5 | 2.5 | 4 | 3.5 | 2.5 | 3.5 | 2 | 2 | 2 | 3 | 3.0 |
| Deep Recovery | 2.5 | 2.5 | 1 | 2 | 1.5 | 2.5 | 1 | 2.5 | 1 | 3 | 4 | 5 | 3 | 3.5 | 3 | 2 | 1.5 | 2.5 | 2 | 2 | 1.5 | 3 | 6 | 6 | 1.5 | 3.5 | 2 | 2 | 3 | 3 | 3 | 0.5 | 2.5 | 2.6 |
| Patrol Wing | 2 | 4 | 3 | 4 | 3 | 3 | 2 | 3 | 1 | 4 | 5 | 5 | 3 | 2 | 2 | 4 | 6 | 3 | 2 | 1 | 1 | 3 | 6 | 6 | 3 | 4 | 2 | 3 | 4 | 3 | 3 | 5 | 3 | 3.3 |
| Bank Shot | 2 | 3 | 2 | 3 | 3 | 3 | 2 | 2 | 2 | 4 | 4 | 5 | 2 | 1 | 0 | 2 | 1 | 3 | 3 | 3 | 1 | 5 | 5 | 5 | 3 | 5 | 4.5 | 3 | 5 | 2 | 2 | 4 | 3 | 3.0 |
| Orbital Defense | 1 | 1 | 0.5 | 1.5 | 1 | 1.5 | 0 | 1.5 | 0 | 2.5 | 3.5 | 4 | 0.5 | 0.5 | 0 | 1 | 1 | 2 | 2 | 1 | 0 | 4 | 4 | 5 | 1 | 3.5 | 1.5 | 0 | 3 | 0.5 | 1 | 7 | 1.5 | 1.8 |
| **Mean** | **2.7** | **3.1** | **2.3** | **3.0** | **2.5** | **3.2** | **1.6** | **2.8** | **1.5** | **3.8** | **4.5** | **4.9** | **2.9** | **2.2** | **1.4** | **2.7** | **2.8** | **3.2** | **3.1** | **2.7** | **1.4** | **4.1** | **5.2** | **5.5** | **3.2** | **4.7** | **3.8** | **2.7** | **4.1** | **2.2** | **2.5** | **3.4** | **3.0** | **3.1** |

Desktop 1920x1080 fps on the runner, from report.slim.json:
- 0.5: Deep Recovery
- 6.4 to 7.6: Gravity Post 6.4, Siege Golf 7.1, Courier Rush 7.1, Rooftop Buckets 7.6
- 9.3 to 11.4: Mech Hangar 9.3, Blockfall Reactor 9.8, Gallery Shift 10.1, Aura Clash Arena 11.1, Skyline Runner 11.4
- 14.9 to 25.8: Bank Shot 14.9, Patrol Wing 15.8, Turbo Drift Circuit 19.7, Pulse Tunnel 23.5, Neon Swarm 25.8
- 52 to 60: Aurora Lander 52.2, Vault Breakers 57.4, Orbital Defense 59.6

The engine's own fps telemetry reports 60 in every slow game (research/20). The engine defects cited below are shorthand for findings in research/19:
- **ambient-kills-IBL:** `lights.ambient` with no `environments.*` node zeroes IBL diffuse and specular (`packages/engine/src/agent-api/index.ts:12693-12707`, zeros at :12705). It hits 15 of 18 games. Aura Clash avoids it through its own bridge path. Siege Golf and Turbo Drift author `environments.studio`, but that is a 128x64 LDR probe (C10).
- **exposure-dropped:** root tone mapping is fixed to ACES at exposure 1 (`index.ts:12898-12904`), and `colorGrade.exposure` is discarded in 16 games (C12).
- **DPR-1:** the default safe-basic profile sets `pixelRatio: 1` (`index.ts:4256`), and that value wins over devicePixelRatio. This affects about 13-14 games (C2).
- **tint-wipe:** `model(asset, {material:{color}})` hard-codes `replaceSurfaceTextures: true` (`index.ts:13570`), which disables albedo and metal-roughness maps (C3).
- **effects-zero-px:** particles, rain, snow, flipbook and beam are non-pixel-backed on the production bridge (`index.ts:13723`). No game wires `game.effects().nodes()`, and there is only alpha-over blending (C8).
- **shadow-0.32:** root shadow strength is `0.32` (`index.ts:12966-12968`). The depth pass ignores skinning, instancing and alpha (DepthPass.ts:59-87), and the root path never runs CSM (C4, C5, C11).
- **no-sky:** the root path never draws an environment background, only a solid clear colour (C9).
- **bloom-knee:** softKnee 0.5 with a ×7 balanced gain blooms mid-tones, and the threshold is clamped to ≤1 (C13).
- **fake-AA/AO:** "FXAA" is a 4-tap cross blur stacked on 4x MSAA, and SSAO is about zero at gameplay depth (C14).

---

### 2. Per-game findings

The attribution lines below give two splits:
- **Code split** (research/20): engine / defaults / assets / game / authoring.
- **Vision split** (research/21): authoring / camera / defaults / assets / engine limits. A vision judge cannot see a silently disabled feature, so it books engine defaults as "authoring".

Verdict wording follows research/21; research/20's verdict is noted where it differs.

#### Aura Clash Arena (`aura-clash-showcase`) — overall 3, mean 3.5, 11.1 fps
- **What looks poor:**
  - The fighters fill about 30% of the frame height, inside a canvas that covers about 43% of the viewport in a web dashboard.
  - Flat team tints erase the textures, the lighting is murky with no rim, and there is a sourceless floor hotspot.
  - There are no cast shadows, reflections, fog or impact VFX.
  - The "2 HIT" and "3 HIT" plates cover the impact point, and the dash ghosting reads as a glitch.
  - On mobile a third of the canvas is black and the controls are keyboard hints.
- **Why (engine):**
  - The side-view preset renders into rgba8 with the Reinhard fallback (C15). Max luma is about 200 and 0% of pixels clip.
  - The bloom threshold of 0.78 sits above that ceiling, so bloom never fires.
  - Skinned fighters cast bind-pose shadows, and shadow strength is 0.38.
  - Aura Clash does not hit ambient-kills-IBL, but it gets only a 128x64 LDR generated probe.
- **Why (game):**
  - Frontal point "flashlight" keys, MR maps replaced with flat values, and the arena scaled to 0.59 against 1.08 fighters.
  - The 128 declared particles are never read.
  - Saira is named in CSS but never loaded.
- **Attribution:** code split 30/23/11/24/12; vision split 35/25/20/12/8.
- **Assets:** good assets rendered badly. The 65-joint Quaternius rigs, the city GLB and the strongest animation in the fleet (score 6 in research/20) are undercut by the tint and the LDR pipe. The weak exceptions are a 4-tri crowd card and the stock clips.
- **Missing renderer capability:** HDR and ACES on the game preset, skinned shadow casters, and pixel-backed VFX. SSR, planar reflection and HDRI exist but are not wired.
- **Largest wins:**
  1. HDR target plus ACES on the preset, with exposure honoured.
  2. Remove the tints and use rim or fresnel for team identity.
  3. A full-bleed canvas with a side-on camera framing the fighters at 45-60% of frame height.
  4. One shadowed key with contact AO.
  5. Hit flash, sparks and hitstop wired to pixels.
- **Verdict:** substantial rebuild of the presentation layer. Research/20 said save-through-polish, because the rigs, animation and juice code are real.
- **Evidence:** `evidence/games/aura-clash-showcase-mid.jpg`, `-contact.jpg`.

#### Blockfall Reactor (`showcase-blockfall-reactor`) — overall 4, mean 3.7, 9.8 fps
- **What looks poor:**
  - A locked, dead-on camera makes it read as a 2D web Tetris.
  - The backdrop cabinets and mascot are flat image cards (the mascot sits on a magenta rectangle).
  - There are no shadows or AO, and the lower 25% of the frame is a dead navy void.
  - The mid and action frames are near-identical. One orange ring is the only VFX in the whole set.
  - A centre hotspot and a vertical streak read as debug artifacts.
- **Why:**
  - 3 of 4 models are 4-tri `KHR_materials_unlit` cards (C19). The cabinet mesh is hidden behind cards.
  - ambient-kills-IBL means the glossy blocks have nothing to reflect.
  - Bloom threshold 0.55 with softKnee 0.5 starts at linear luma 0.05.
  - AO is a no-op (C14).
  - Hidden performance costs: 200 hidden legacy boxes, about 80 text3D digits and 3 WebGL contexts.
- **Attribution:** code split 22/25/21/22/10; vision split 35/20/15/25/5.
- **Assets:** weak. The jelly-block shader is the best-scoring material in the fleet (5).
- **Missing renderer capability:** instanced shadow casters, working SSAO, real FXAA or SMAA, IBL when ambient is present, and pooled runtime FX.
- **Largest wins:**
  1. Tilt the camera 8-12°, add idle drift and punch on clears.
  2. Make the well a real bezel with contact shadows and a reflective floor.
  3. Replace the cards with lit 3D cabinets, or parallax layers with matched lighting.
  4. GPU particle bursts on lock and clear.
  5. Thin the gridlines and outline the ghost piece.
- **Verdict:** substantial rebuild of the presentation layer. Research/20 called it borderline polish.
- **Evidence:** `evidence/games/showcase-blockfall-reactor-mid.jpg`, `-contact.jpg`.

#### Skyline Runner (`showcase-skyline-runner`) — overall 4, mean 3.6, 11.4 fps
- **What looks poor:**
  - An illustration-grade painted backdrop sits behind flat-shaded primitive 3D, so the 3D reads as stickers.
  - A floating untextured tree slab sits top-centre.
  - Grey bars under the platforms look like visible collision volumes.
  - Olive coins on dark blue have almost no contrast, and the pickups clip to white.
  - There are no shadows, and no snow particles in a snow level.
  - Lives reads 0 while play continues.
- **Why:**
  - The hero is a 4-tri card. The 48k textured runner is tint-wiped and used only as the ghost, and an 80k Meshy hero is loaded but unused.
  - The route sets `pixelRatio` 0.7.
  - Guide-box overlays are on in public play, the world has `castShadow:false`, and five act light rigs plus `lights.studio` are mounted at once.
  - Engine causes: ambient-kills-IBL, exposure-dropped, and only the first fog node honoured (`index.ts:12743`).
- **Attribution:** code split 20/15/25/25/15; vision split 35/20/15/25/5.
- **Assets:** both weak and rendered badly. Good assets exist in the repo, but the route ships the card.
- **Authoring:** 51-92 `?capture=review` forks meant the art went into evidence frames, not the shipped frame.
- **Largest wins:**
  1. Delete the slab and the grey bars.
  2. Swap in the textured runner without the tint.
  3. Fog and a key light matched to the painted plate.
  4. ACES highlight rolloff and a raised bloom threshold.
  5. Snowfall and contact shadows.
  6. A landscape mobile layout at DPR ≥2.
- **Verdict:** substantial rebuild of the 3D layer. The art direction, backdrop and HUD can be kept.
- **Evidence:** `evidence/games/showcase-skyline-runner-mid.jpg`, `-contact.jpg`.

#### Turbo Drift Circuit (`showcase-turbo-drift-circuit`) — overall 3, mean 3.5, 19.7 fps
- **What looks poor:**
  - 50-65% of every frame is an untextured flat grey ground.
  - The track is stacked paper-cut slabs, and one slab floats.
  - Trees are sphere-on-stick, and the gantry and stands are boxes.
  - A translucent tan drift ellipse reads as a debug gizmo, and skid marks are discs.
  - A milky haze sits over the scene, with clipped highlights and over-wide bloom.
  - The car is faceted. The "GGhost OFF" label is a text bug.
- **Why:**
  - The track GLB has 0 textures and 28 flat materials. The hero car (5.4k tris, base colour only) is worse than the opponent (31k).
  - The indoor studio IBL is applied to an outdoor scene, the clear colour is flat #df967d, and fog is 0.0027.
  - The single uncascaded shadow map is fitted to a 500-unit ground, so the car's shadow is sub-texel. The shadow pass also ignores the 43 instanced scenery calls.
  - `driftParticleCloud` draws zero pixels (effects-zero-px).
- **Attribution:** code split 25/15/30/19/11; vision split 30/15/15/30/10.
- **Assets:** weak.
- **Missing renderer capability:** CSM on the root path, instanced shadows, HDR bloom, and a `ProceduralTexture` rasteriser (those maps are silently dropped). The game's 92 capture-mode branches are also a factor.
- **Largest wins:**
  1. A spline-extruded road with tiling PBR asphalt and a rubbered racing line.
  2. A sunset HDRI used for both sky and IBL, plus cascaded shadows.
  3. Clearcoat car paint with smooth normals.
  4. Ribbon skids and smoke drawn as real pixels.
  5. Instanced trackside barriers and fencing.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-turbo-drift-circuit-mid.jpg`, `-contact.jpg`.

#### Siege Golf (`showcase-siege-golf`) — overall 3.5, mean 3.7, 7.1 fps (p95 1,100 ms)
- **What looks poor:**
  - The world reads as greybox: a castle made of identical cubes, box and ellipsoid trees, squashed-sphere hills, and an infinite green plane.
  - A giant blue ellipsoid sits unexplained behind the goal.
  - The textured crates clash with the flat colour around them.
  - The goal, obstacles and signs all share coral, so the colour hierarchy fails.
  - A debug slider panel ships, and the mobile 3D view is blurred under the modal.
  - It has the best shadows in the fleet (4.5), because a directional sun plus an environment node is present.
- **Why:**
  - Assets: about 130 primitives plus a course GLB with no UVs and flat normals.
  - tint-wipe deletes the crate and plank PBR maps.
  - The LDR peach studio probe is used outdoors, exposure is dropped, and FXAA runs over MSAA.
  - `app.setScene` rebuilds the scene on every camera phase, which causes the 1.1 s P95 stalls and hard cuts.
- **Attribution:** code split 13.5/17.5/25/29/15; vision split 25/15/20/35/5.
- **Assets:** weak, plus game code that makes the good crates look bad.
- **Capture:** the 1920 frames 03-mid, 04-action and 05-charge are identical (luma 154.3, 594 colours). That is a genuine stall or duplicate, not missing VFX alone.
- **Largest wins:**
  1. A cohesive stylized asset kit with a shared trim atlas.
  2. HDRI sky and IBL with a warm low sun.
  3. Terrain heightfield, backdrop and fog.
  4. One reserved hue for the goal.
  5. Replace the debug panel with an in-world aim arrow.
  6. Stop rebuilding the scene per camera phase.
- **Verdict:** substantial rebuild of art and scene. The physics (6) and controls can be kept.
- **Evidence:** `evidence/games/showcase-siege-golf-mid.jpg`, `-contact.jpg`.

#### Aurora Lander (`showcase-aurora-lander`) — overall 2.5, mean 3.1, 52.2 fps
- **What looks poor:**
  - 85-95% of every frame is flat navy, and the terrain is missing in 3 of 4 captures.
  - The game is called "Aurora" and has no aurora, sky gradient or horizon.
  - The lander is about 4% of the frame, in teal plastic.
  - The exhaust is a static capsule mesh offset from the nozzle.
  - Clipped white sits next to murky mid-blue, and one haloed "star" looks like a debug dot.
  - A "PROTOTYPE" sidebar ships.
- **Why:**
  - no-sky.
  - ambient-kills-IBL.
  - Additive or transparent emissive does not composite (alpha-over only), which forced opaque aurora boxes.
  - The tint path drops opacity, so the ghost is opaque.
  - Shadows at strength 0.32 with nearest compare and a whole-scene fit are effectively invisible.
  - There is no particle path.
  - DPR-1.
  - Agents nudged emissive and background values to hit mean-luma targets (`main.ts:594-597`).
- **Attribution:** code split 28/15/20/25/12; vision split 40/25/10/20/5.
- **Assets:** weak. The 460-tri flat probe, 66-tri beacons and the 4-tri card lander hero have no textures or normal maps (C19).
- **Missing renderer capability:** sky and atmosphere, additive blending, GPU particles, usable shadows.
- **Largest wins:**
  1. An altitude-adaptive camera that keeps the pad in frame.
  2. A sky gradient plus shader aurora ribbons.
  3. Full-width layered terrain with haze.
  4. A shadowed key light and the exhaust as a point light.
  5. A tapered cone with a particle plume and dust.
- **Verdict:** substantial rebuild. Polish caps it at about 4.
- **Evidence:** `evidence/games/showcase-aurora-lander-mid.jpg`, `-contact.jpg`.
- **Capture:** the landing condition was never hit, so 04-action shows no action.

#### Neon Swarm (`showcase-neon-swarm`) — overall 2.5, mean 3.1, 25.8 fps
- **What looks poor:**
  - Pure-black ellipses dominate every frame and read as rendering errors.
  - Enemies are tiny, flat, non-emissive pale hexagons.
  - The hero prop is an off-theme photoscanned road barricade.
  - The floor is a void with no grid or gloss.
  - The player is dark-on-dark with a static pose.
  - About half the frame is crushed black (dark fraction 0.40-0.60).
  - Score rises with nothing visible happening.
- **Why:**
  - ambient-kills-IBL, with ambient about π×.
  - The depth pass ignores instancing, so the swarm casts no shadows.
  - Raw-depth SSAO is about zero.
  - tint-wipe strips the courier's textures.
  - cameraDirector, cameraPunch and 7 effect spawns are wired to nothing (effects-zero-px).
  - The visual gate is `minimumNonBlackPixels: 1500`.
- **Attribution:** code split 26/16/23/25/10; vision split 35/15/12/30/8.
- **Assets:** weak. The enemies are programmatic discs, half the assets are 4-tri cards, and the default avatar is an untextured waived asset (C19).
- **Missing renderer capability:** runtime FX spawning or pooling, instanced shadows, HDR bloom, IBL alongside ambient.
- **Largest wins:**
  1. A glossy floor with SSR and an emissive grid.
  2. Emissive hostile drones with soft contact shadows instead of black blobs.
  3. On-theme barriers.
  4. A rim-lit, animated player.
  5. Hit particles and hitstop.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-neon-swarm-mid.jpg`, `-contact.jpg`.
- **Capture:** the kill condition was never hit at 1920 or 1280.

#### Gravity Post (`showcase-gravity-post`) — overall 3, mean 2.7, 6.4 fps
- **What looks poor:**
  - The sun is a flat sprite that lights nothing, and two planets (Rust, Gale) render pure black.
  - Overlapping translucent cyan rings flatten into a teal mass.
  - Asset styles clash: photo cardboard, a photoreal Earth, a voxel truck and particle-noise stations.
  - The ship plus box is about 3× a planet's diameter and occludes the stations.
  - The backdrop is a flat teal board. There is no post or VFX (post score 1).
  - The box detaches from the ship.
- **Why:**
  - ambient-kills-IBL and no-sky.
  - About 330 un-instanced primitives give 1,200+ draws, which explains the 6 fps.
  - The HUD rebuilds innerHTML every frame.
  - tint-wipe wipes the one good asset (the dock gate, C3).
  - Spheres are tessellated at 16x12.
  - Keyboard launch is dead (controls 3).
- **Attribution:** code split 15/20/27/23/15; vision split 40/12/15/30/3.
- **Assets:** weak. The hero and district are agent kitbash with 32x32 stripe textures.
- **Missing renderer capability:** GPU particles and ribbons, and automatic instancing of repeated primitives.
- **Largest wins:**
  1. A point light at the sun with a lit standard material, so the planets get terminators.
  2. A deep-space skybox with parallax stars.
  3. Thin additive orbit lines.
  4. One art language, rescaled.
  5. Instancing to fix the fps.
- **Verdict:** substantial rebuild of the visual layer.
- **Evidence:** `evidence/games/showcase-gravity-post-mid.jpg`, `-contact.jpg`.

#### Courier Rush (`showcase-courier-rush`) — overall 2, mean 2.8, 7.1 fps (1920), 5.0 (1280), 8.1 (mobile)
- **What looks poor:**
  - The one working desktop frame shows untextured navy box buildings.
  - A bloom-blown centreline splits the frame, and the hero van is clipped to a white blob.
  - There are no shadows, no reflections on a "wet" night street, no fog and no sky.
  - On mobile the HUD covers 35-40% of the screen.
- **Black frames (1920 run):** `03-mid` and `04-action` are black. Report data: meanLuma 1.7, darkFraction 0.968, 158 colours, byte-identical, timer frozen at 57.5. The page error is `RenderDeviceError: Render context is lost` at `assertAlive`/`setRenderTarget`.
- **Is that a real defect?** It is a real production robustness defect, not a capture-script artifact:
  - The engine has no `webglcontextlost` restore path, so a lost context stays black permanently with no recovery UI.
  - The trigger was environmental: a paravirtual GPU, 7 GB of memory, about 1,530 draw calls and 30 MB of resources.
  - The same build rendered in the 1280 and mobile runs, so the black screen is not deterministic on all hardware.
  - The harness reported `blankShots: []` and `likelyBlank: false` because the HUD still draws. The blank detector is blind to a black world under a live DOM HUD.
  - The vision overall of 2 is pulled down by these frames; the working frame alone scores about 3.5.
- **Why:**
  - ambient-kills-IBL zeroes the authored wet asphalt and clearcoat (IBL 0 in research/20).
  - exposure-dropped, plus neonBloom at threshold 0.68 with ×7 gain.
  - Group scale is composed incorrectly (C6), which collapses the scale-6 `city.block` kit.
  - tint-wipe on the traffic cars.
  - Rain is 30 static boxes, and the engine and ambience audio loops are never played (audio 1.5).
- **Attribution:** code split 30/20/20/20/10; vision split 35/12/20/8/25 (engine limits weighted up for the context loss).
- **Assets:** the van is good but rendered badly; the city is weak.
- **Largest wins:**
  1. Context-loss restore, plus a harness check that the canvas region is not uniformly black.
  2. Real IBL plus SSR on the road.
  3. A textured modular city kit.
  4. Batch about 1,500 draws down to a few hundred.
  5. An HDR bloom threshold above 1.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-courier-rush-mid.jpg`, `-contact.jpg`. The mid shot is a black frame.

#### Pulse Tunnel (`showcase-pulse-tunnel`) — overall 3, mean 2.9, 23.5 fps
- **What looks poor:**
  - The hero craft fills about 45% of the screen width at lane centre and blocks incoming obstacles.
  - The hero is a near-black glossy blob.
  - The "neon" is flat emissive boxes with no glow or spill, and there is no floor reflection.
  - The background is a void.
  - A full-height blue centre-column artifact runs through the sky and HUD.
  - Frames at 178 m and 1,488 m look identical.
  - The mobile canvas is 374x187 CSS (report.slim.json) on a 390x844 screen. This is a real layout defect, and mobile scores 1.
- **Why:**
  - High-metallic materials (0.72-0.92) under ambient-kills-IBL render black. The finale reactor arches were hidden because of this.
  - Good CC0 PBR kits were rejected because they were judged under the broken renderer.
  - The camera is a static literal.
  - Particles exist only in review mode, so players get about 10 tiny spheres.
  - The bloom threshold is clamped to ≤1.
- **Attribution:** code split 22/20/18/29/11; vision split 30/25/20/20/5.
- **Assets:** both weak (procedural kitbash with 128 px NEAREST textures) and rendered badly. Audio is the best in the fleet (5).
- **Largest wins:**
  1. A 100dvh canvas and anchored HUD on mobile.
  2. Raise and pull back the chase cam, so the hero is 15-20% of the width.
  3. HDR emissive above 1 with selective bloom.
  4. A planar or SSR floor with moving lights.
  5. A synthwave sky and fog, with the column artifact removed.
- **Verdict:** substantial rebuild of the presentation layer. Research/21 estimates about 6/10 is reachable without new engine features if IBL works.
- **Evidence:** `evidence/games/showcase-pulse-tunnel-mid.jpg`, `-contact.jpg`.

#### Mech Hangar (`showcase-mech-hangar`) — overall 3.5, mean 3.2, 9.3 fps
- **What looks poor:**
  - Untextured cube clusters intersect a good mech model and make it look worse.
  - An "Asset passport" provenance panel ships to players.
  - The hangar is a floor plane in a void, and the arena is a flat blue wall.
  - There are no shadows or AO, so the mechs float on blob discs.
  - The metal reflects nothing.
  - The action frame has no projectiles, hits or shake.
  - The emissive strips are blown out.
  - The mobile FOV crops the fighters (mobile 1.5).
- **Why:**
  - The mech parts are scripted GLBs: 144-608 tris, with no UVs, textures or skeleton. Their suitabilityReason uses the waiver phrase "intentionally untextured stylized flat-color" (C19).
  - The hero is an unrigged scan loaded twice at 27 MB each.
  - Both sets share one scene and 12 lights, so everything is double-lit.
  - Animation is yaw-only.
  - ambient-kills-IBL.
  - A forced 1.5x DPR plus about 190 unbatched draws.
- **Attribution:** code split 16/12/35/26/11; vision split 35/15/15/30/5.
- **Assets:** weak.
- **Largest wins:**
  1. Authored socketed parts, or material swaps on the base mech.
  2. Shadowed key, contact shadows, HDRI and SSR.
  3. Dressed sets.
  4. Muzzle, tracer and impact VFX with hitstop.
  5. A fighting camera that frames both mechs.
  6. Delete the asset passport.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-mech-hangar-mid.jpg`, `-contact.jpg`.

#### Vault Breakers (`showcase-vault-breakers`) — overall 2.5, mean 2.8, 57.4 fps
- **What looks poor:**
  - The ball is never clearly visible: it is a dark, tinted disc about 40x28 px.
  - Every part is a raw primitive.
  - The "neon" doesn't glow (post 1).
  - The playfield is one untextured grey plane, about 60% of the 3D frame.
  - IBL is 0 and particles are 0, and score changes produce no in-world reaction.
  - Under 1% of pixels change between frames.
  - On mobile the prompt says "HOLD SPACE" on a touch device.
- **Why:**
  - Every rendered GLB is a 0-UV synth. The shipped Sketchfab cabinet (12 PBR maps) and the Higan cabinet are typed and hashed but never referenced.
  - Code comments falsely claim "textured".
  - ambient-kills-IBL turns the metallic 0.96 chrome ball matte.
  - Three coloured directional lights wash the table.
  - A single torus is the only VFX, and particles are not wired on the production bridge.
- **Attribution:** code split 13.5/17.5/26.5/27.5/15; vision split 40/10/15/30/5.
- **Assets:** weak as used. Better assets exist in-repo but go unused.
- **Performance:** 7, the best in the fleet, but only because the scene is cheap.
- **Largest wins:**
  1. A chrome ball under an HDRI, with a contact shadow and trail.
  2. Emissive neon with selective bloom and lamp inserts.
  3. An authored playfield texture under clearcoat.
  4. A tight-frustum shadow plus AO.
  5. Use the textured cabinet.
- **Verdict:** substantial rebuild of the whole visual layer.
- **Evidence:** `evidence/games/showcase-vault-breakers-mid.jpg`, `-contact.jpg`.

#### Rooftop Buckets (`showcase-rooftop-buckets`) — overall 4, mean 3.8 (highest), 7.6 fps
- **What looks poor:**
  - The crowd is cube torsos topped with brown faceted icospheres, filling about 35% of the frame.
  - Brown lumps sit on every bleacher tread.
  - There is no rooftop and no dusk: it is an enclosed black box.
  - The backboard is a full-white emissive quad, so the hoop is a clipped blob.
  - There are no floor reflections, shadows or AO.
  - The arc VFX is a solid tube drawn over the player, and a ghosted player appears in the action frame.
  - "07DUSK" has a kerning collision.
- **Why:**
  - The backboard is 12 tris, the venue 1,280 tris, and the court is untextured.
  - The good 191-joint textured players exist but mount only under `?debug=animation`.
  - `setMaterial` overwrites GLB materials every frame.
  - Ambient 1.32 with ambient-kills-IBL, and 11 lights with no shadowed key.
  - neonBloom softKnee blooms mid-tones.
  - The depth pass ignores skinning.
- **Attribution:** code split, using research/20's buckets: engine capability 13 / defaults 16 / assets 21 / game code 34 / authoring 15. Vision split 40/12/15/30/3.
- **Assets:** weak, and the good ones are hidden.
- **Largest wins:**
  1. Silhouette crowd cards or instanced people, and open the far wall to a dusk skyline.
  2. A reflective court.
  3. A glass backboard with a real hoop.
  4. Shadowed key plus rim light.
  5. Bloom threshold above 1 and a tapered arc ribbon.
  6. An over-the-shoulder camera with make or miss reactions.
- **Verdict:** substantial rebuild of the art layer.
- **Evidence:** `evidence/games/showcase-rooftop-buckets-mid.jpg`, `-contact.jpg`.
- **Capture:** the make condition was never hit.

#### Gallery Shift (`showcase-gallery-shift`) — overall 3, mean 3.0, 10.1 fps
- **What looks poor:**
  - Axis-aligned box architecture with no texture or art, in a "private gallery".
  - No floor reflections or shadows.
  - The HUD says "AVOID THE CONES", but no cones render. A stray blue trapezoid outside the building is probably a mis-parented cone mesh.
  - The voxel player, white mech guard and gold barrel guard look like three different games.
  - The "TREASUR'" text is clipped.
  - Characters are under 1% of the screen, and about 25% of the viewport is an empty plinth plus black void.
  - Rapier/LOS debug telemetry ships.
- **Why:**
  - The thief and guard-2 are bound with `AnimationController({clipRegistry})`. Each frame produces an empty pose, so the renderer applies `applyRetargetedPose(emptyPose)` and the characters freeze (C16, `index.ts:13871`). Gallery Shift is the only showcase game that hits this.
  - ambient-kills-IBL, with ambient 1.56 at about π×.
  - The 16-light cap silently drops part of the 31-light rig.
  - The thief has no yaw (a one-line bug).
  - A separate `?capture=review` composition was tuned instead of the shipped route.
- **Attribution:** code split 15/18/30/20/17; vision split 35/20/15/25/5.
- **Assets:** weak. The museum is an untextured Blender-script build, and the hero is a 72-tri unlit Kenney model.
- **Missing renderer capability:** skinned shadows, multiple shadow casters, true rect area lights, configurable point-light range.
- **Largest wins:**
  1. Visible, correctly parented vision cones.
  2. A glossy textured floor with env map and SSR.
  3. Shadow-casting spots and flashlights.
  4. Tighter camera framing.
  5. One art style.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-gallery-shift-mid.jpg`, `-contact.jpg`.

#### Deep Recovery (`showcase-deep-recovery`) — overall 2.5, mean 2.6, 0.5 fps (1920), 1.1 (1280), 3.6 (mobile)
- **What looks poor:**
  - Translucent teal cylinders, slabs and discs float in a black void.
  - There is no seabed, reef or water volume.
  - Emissive caps clip to white and bloom into blobs.
  - The diagonal cyan streaks read as projectiles.
  - "Shallow Reef, 4.8 m" looks abyssal.
  - The player sub is unidentifiable.
  - There is a smeared, label-like sprite in the ring VFX.
- **Performance:** the fps collapse is real and scales with pixel count: p50 frame time is 1,917 ms at 1920, 850 ms at 1280 and 282 ms on mobile. research/20 names the prime suspect as `volumetricFog`, which does a per-frame CPU 8-bit readback. This is the worst production defect in the fleet after Courier Rush's context loss.
- **Why:**
  - The meshes come from agent-generated `build-models.mjs`: 232-2,068 tris, per-face normals, no UVs, registered as "release".
  - tint-wipe on the sub's livery.
  - Emissive is used everywhere in place of lighting.
  - ambient-kills-IBL.
  - Camera smoothing is 0 for harness determinism.
- **Attribution:** code split 20/14/26/25/15; vision split 40/15/15/25/5.
- **Assets:** weak.
- **Missing renderer capability:** a GPU underwater stack (absorption fog, projected caustics, god rays, GPU particles).
- **Largest wins:**
  1. Fix the fog cost.
  2. Turquoise-to-deep depth-keyed fog, god rays and marine snow.
  3. Authored opaque PBR seabed, wreck and sub.
  4. Cut emissive 3-5×.
  5. A chase cam at a 15-25° pitch.
- **Verdict:** substantial rebuild. One research/20 judge said full rebuild.
- **Evidence:** `evidence/games/showcase-deep-recovery-mid.jpg`, `-contact.jpg`.

#### Patrol Wing (`showcase-patrol-wing`) — overall 3, mean 3.3, 15.8 fps (1920) vs 54.8 (1280)
- **What looks poor:**
  - The sky is a flat clear colour with nothing that reads as "evening".
  - Once airborne the camera sees no world, and there is no ocean.
  - The terrain is faceted untextured green, and the runway slab floats with a black underside.
  - There are no shadows.
  - The canopy and paint have nothing to reflect.
  - A blown white square sits inside the ring gate.
  - Debug text ships: "Backend rapier / Flight mode authored".
- **Why:**
  - ambient-kills-IBL means the good hero GLB's metal and roughness channels have nothing to work with.
  - The game never uses `environments.hdri`, `sky.dayNight` or the engine water surface.
  - The sun disc is misaligned with the key light.
  - FOV 47 with no horizon hold.
  - Transform-only flight with no stall model, so the plane hovers at 0 airspeed.
  - The 1080p vs 720p fps gap at under 230 draws points to fill or post cost.
- **Attribution:** code split 18/22/17/33/10; vision split 45/25/15/12/3.
- **Assets:** the hero is good but rendered badly; the drones (108-tri) and props are weak.
- **Capture:** the autopilot let throttle decay to 0, so no rings or drones appear in 03-05. That is partly capture choreography, but the gameplay objects that do appear are unreadable.
- **Largest wins:**
  1. A sunset HDRI as both sky and IBL.
  2. Ocean to the horizon with fog.
  3. Splat-textured terrain with an embedded runway.
  4. Fitted sun shadows.
  5. A chase cam with look-ahead.
  6. Torus ring gates and contrails.
- **Verdict:** substantial rebuild of environment, lighting and camera.
- **Evidence:** `evidence/games/showcase-patrol-wing-mid.jpg`, `-contact.jpg`.

#### Bank Shot (`showcase-bank-shot`) — overall 3, mean 3.0, 14.9 fps
- **What looks poor:**
  - The table floats in a near-black void, with about 40% of the frame empty.
  - There is no cue stick.
  - The felt is flat royal blue with no lamp pool, and the rails are orange plastic.
  - Cyan and magenta glints contradict the "one lamp" fiction.
  - There are no ball shadows or AO.
  - Balls have no numbers or stripes, so suits are unreadable.
  - The camera never moves, and the "…" placeholders and "Backend rapier, Bodies 34" debug text ship.
- **Why:**
  - ambient-kills-IBL, so the authored lacquer and clearcoat fail.
  - `shadowPriority` ranks the directional light above the spot, so the overhead lamp cannot cast.
  - The AO pass is about a no-op and `contactOcclusion` is diagnostics-only (C14).
  - DPR-1.
  - Ball rotation is never synced to the visuals.
  - Audio is oscillator-only.
- **Attribution:** code split 18/20/20/31/11; vision split 40/15/15/25/5.
- **Assets:** both weak (no UVs, a 170-tri faceted cue) and rendered badly.
- **Missing renderer capability:** point and spot shadow casters alongside a directional light, and ambient plus IBL together.
- **Largest wins:**
  1. One overhead spot with soft shadows and contact shadows.
  2. A dim bar HDRI with clearcoat balls and rails.
  3. Numbered and striped balls, a modeled cue with strike animation, and felt with sheen.
  4. A pool-hall room falling into darkness.
  5. A cue-follow camera.
- **Verdict:** substantial rebuild. Research/20 said save-through-polish, because the physics, rules and loading are fine.
- **Evidence:** `evidence/games/showcase-bank-shot-mid.jpg`, `-contact.jpg`.

#### Orbital Defense (`showcase-orbital-defense`) — overall 1.5, mean 1.8 (lowest), 59.6 fps
- **What looks poor:**
  - Primitives are the final art: the planet is visibly polygonal at 1080p, with pastel flat fills.
  - There is no sun direction, terminator, or planet-ring shadow.
  - The background is a pure clear-colour void.
  - VFX 0.5, particles 0, atmosphere 0, and audio 0.
  - About 80% of the pixels are black or UI.
  - Debug and marketing text ships ("one mounted Aura app", "Checksum: 3486416317").
  - Drones render under the HUD panels.
- **Why:**
  - 0 GLBs, 0 textures, 0 VFX sheets.
  - An opaque emissive shell at 1.13× deletes the only lit surface.
  - ambient-kills-IBL.
  - DPR-1.
  - Bloom drops `color`.
  - A false "particle-heavy" claim in the claim text.
- **Attribution:** code split 5/20/32/25/18; vision split 25/15/20/35/5.
- **Assets:** weak. No rendering fix makes a pink sphere read as a drone.
- **Performance:** 7, an artifact of an empty scene.
- **Largest wins:**
  1. An HDR starfield skybox reused as IBL.
  2. A textured, tessellated planet with a fresnel atmosphere and a sun terminator.
  3. A modeled turret and drones.
  4. HDR emissive, bloom, trails and explosions.
  5. A tilted camera filling about 70% of the frame height.
- **Verdict:** full rebuild of the visual layer. The wave, heat and shield logic is kept.
- **Evidence:** `evidence/games/showcase-orbital-defense-mid.jpg`, `-contact.jpg`.

---

### 3. Aggregate observations

1. **No game is competitive.** The best overall visual score is 4/10 (Blockfall Reactor, Skyline Runner, Rooftop Buckets), and the fleet mean is 3.0. research/21 answers "competitive with a well-built modern three.js browser game?" with **No** for all 18. Per-game composite means range from 1.8 (Orbital Defense) to 3.8 (Rooftop Buckets).

2. **The lowest categories match the engine-default failures, in every genre.**
   - Particles 1.4, atmosphere 1.4, IBL 1.5, shadows 1.6, VFX 2.2, juice 2.2, textures 2.3, PBR 2.5.
   - These line up with effects-zero-px, no-sky, ambient-kills-IBL, shadow-0.32 plus the depth-pass gaps, and tint-wipe or untextured release assets.
   - The pattern is the same across fighting, puzzle, racing, golf, flight, pinball and pool. That uniformity points to a systemic cause, not 18 independent authoring failures.

3. **The highest categories are not 3D.** Typography 5.5, HUD 5.2, AA 4.9, controls 4.7 and colour 4.5 come from the DOM shell, input handling and MSAA. The parts that are working are the parts that don't go through the renderer's lighting path.

4. **The two attribution splits disagree, and both are right.**
   - Vision judges put engine rendering limits at 3-10% (25% only for Courier Rush), and authoring plus assets plus camera at about 75-85%.
   - Code judges put engine plus defaults at 25-53% (median about 37%).
   - The reconciliation: much of what looks like "nobody authored reflections, shadows or VFX" is authoring against defaults that silently throw the work away:
     - ambient-kills-IBL in 15 of 18 games
     - exposure dropped in 16
     - effect nodes producing zero pixels
     - shadow strength 0.32
     - DPR pinned at 1
     - tint wiping GLB maps
   - From a still frame, a feature that was silently discarded looks the same as one that was never authored. Pulse Tunnel is the clearest case: agents rejected good CC0 PBR kits because the renderer showed them as black.

5. **Assets are weak, and where good ones exist they go unused or are rendered badly.**
   - 71 of 131 release models have no textures, and 13 are 4-tri unlit cards. A regex on phrases like "stylized" or "flat-color" waives the texture gate (`packages/aura3d-cli/src/index.ts:3376-3382`, C19).
   - In at least 6 games better assets exist in-repo but are not used:
     - Aura Clash: rigs tinted.
     - Skyline Runner: textured runner used only as the ghost, Meshy hero unused.
     - Vault Breakers: Sketchfab cabinet never referenced.
     - Rooftop Buckets: skinned players only under `?debug`.
     - Courier Rush and Patrol Wing: hero assets with no IBL.
     - Pulse Tunnel: rejected kits.

6. **The shipped frame was never the frame being iterated on.**
   - Skyline Runner, Turbo Drift Circuit, Neon Swarm, Blockfall Reactor, Gallery Shift, Deep Recovery, Gravity Post and Courier Rush all maintain `?capture=review` forks (research/20). Skyline has 51-92 and Turbo 92.
   - Gates such as `minimumNonBlackPixels`, mean-luma targets and `likelyBlank` passed frames a human would reject. Courier Rush's black world scored `likelyBlank:false`.

7. **Performance is a real defect, not a runner artifact.**
   - 13 of 18 games run under 20 fps at 1920x1080, and 11 run under 15.
   - Orbital Defense and Vault Breakers hold about 60 fps on the same runner, so the runner is not the cap.
   - Causes are known per game: unbatched draws (Courier Rush about 1,530, Gravity Post 1,200+), per-camera-phase scene rebuilds (Siege Golf), and CPU fog readback (Deep Recovery, 0.5 fps).
   - The engine's fps telemetry self-reports 60 throughout, so nobody saw it.

8. **Production-defect inventory, separated from capture artifacts.**
   - Real defects:
     - Courier Rush: context loss with no restore.
     - Deep Recovery: fps collapse.
     - Pulse Tunnel: 374x187 mobile canvas.
     - Gallery Shift: frozen animation (C16) and missing vision cones.
     - Gravity Post: black planets and dead keyboard launch.
     - Skyline Runner: Lives-0 bug.
     - Turbo Drift Circuit: "GGhost" label.
     - Debug UI shipped to players in about 11 games.
   - Capture-choreography gaps, meaning "action" frames with no action:
     - Aurora Lander, Neon Swarm, Bank Shot and Rooftop Buckets: the trigger condition was never hit.
     - Patrol Wing: throttle decayed to 0.
     - Siege Golf: duplicate frames.
   - Even where choreography failed, C8 confirms the absent VFX are real: effect spawns produce no pixels.

9. **Mobile scores 2.5 on average.** DPR-1 renders a 390x844 buffer on 3x devices, about 1/9 of native pixels. On top of that, keyboard prompts appear on touch devices, desktop sidebars are simply stacked vertically, and the HUD covers 35-45% of the screen.

10. **Verdict distribution (research/21).**
    - 17 substantial rebuild, 1 full rebuild (Orbital Defense), 0 polish. Research/20's three "polish" calls (Aura Clash, Blockfall, Bank Shot) are overruled by the screenshots.
    - In every game the parts that survive are gameplay, physics (Siege Golf and Vault Breakers 6, Rooftop Buckets 6), controls and the HUD skeleton.
    - What gets rebuilt is the same list everywhere: lighting rig, IBL, sky, materials and textures, VFX, camera and environment. Engine defaults have to change first, or the rebuilt content will be silently discarded the same way.
## Rendering-stack findings (GPU to public API)

Scope: the path from `createAuraApp` scene nodes to the default framebuffer, as the 18 captured games actually run it. Sources: research 02, 03, 04, 05, 06, 07, 13, 14, 15, 18, and the adversarial corrections in 19, which take precedence. Pixel evidence comes from 21 (game vision judgment) and 23 (same-input benchmark vision judgment, Aura3D 3.0.1 vs three@0.185.1). Line numbers were spot-checked against the current checkout (`index.ts:12705`, `:13590`, `:14747`, `:17982`, `:4256`; `Renderer.ts:1389`; `ExternalParityRenderPreset.ts:169`; `WebGL2Device.ts:4404`; `DepthPass.ts:66`). Unless stated otherwise, `index.ts` means `packages/engine/src/agent-api/index.ts`.

Bottom line. The core BRDF is sound. Benchmark 11-multiple-lights, which uses direct lights only (no shadows, no IBL, no post), is the one scene where the judges rated Aura3D equal to three.js (5/5, 23 §11). Every subsystem around that core is behind three.js r185, with the largest gaps in environment lighting, shadows, post order, blending, materials beyond base PBR, and draw submission. Most quality decisions are also hard-coded as constants in a 13k-line agent-api bridge, so no public API can reach them. Across the 18 benchmark scenes, Aura3D averages 3.6/10 (median 3.5) and three.js 5.4/10 (median 5.5) (23). Pass-1 metric judging (22) gave three.js 6.5–8.5. The vision scores in 23 are authoritative, and they rate the three.js reference itself as "competent but dated". Aura3D loses on identical inputs, and it loses most in exactly the features that define a modern look.

---

### C.1 Frame trace: what one game frame actually does

This is the root production bridge path used by 17 of 18 games. Aura Clash diverges at the marked points. `✖` marks a defect that caps quality; `≈` marks a working subsystem whose defaults limit it.

```
SCENE (public API)
 createAuraApp / createGameApp(canvas, {scene})                  index.ts:11126, :11818 (thin wrapper)
  ├ profile = "safe-basic" (default)                              index.ts:4312
  ├ backing store = options.pixelRatio ?? profile.pixelRatio(=1) ?? DPR   index.ts:11133, :12280
  │   ✖ DPR fallback unreachable → 1x CSS pixels on retina (13–14/18 games; Skyline 0.7)   19 C2
  ├ scene → flattenSceneNodes → composeAuraTransform              index.ts:17960-18006
  │   ✖ pos = p+c, euler = e_p+e_c, scale = s_p⊙s_c (no matrix hierarchy)   19 C6
  ▼
ASSETS
 createProductionSceneRenderer                                    index.ts:12523
  ├ try createProductionRuntimeSceneRenderer                      index.ts:13540
  │   catch → ✖ createWebGLSceneRenderer (raw GL, 1 light, no shadow/IBL)   index.ts:12543-12549, :15982
  ├ typed GLB → TypedGLBActor → GLTFRenderResources material select  GLTFRenderResources.ts:1506-1653
  │   ✖ material.color ⇒ tint{replaceSurfaceTextures:true} (hard-coded)  index.ts:13570; TypedGLBActor.ts:484-514
  │   ✖ OPAQUE+transmission ⇒ roughness≥0.72, transmission=0           GLTFRenderResources.ts:1743-1769, :1840
  ├ primitives → scalar PBRMaterial; sphere 12x16, capsule = sphere   index.ts:17360-17479, :14979
  ├ instances → createProductionInstanceTransforms (✖ drops node.size)  index.ts:14747-14753
  ├ effect nodes (particles/rain/snow/flipbook/beam) → ✖ warning only, 0 pixels  index.ts:13722-13723
  ├ ENVIRONMENT = createProductionRuntimeEnvironment              index.ts:12628
  │   authored env node     → 128x64 LDR procedural map (2/18: Turbo, Siege Golf)
  │   ✖ ambient, no env node → environmentMapIntensity 0, specular 0 (15/18)   index.ts:12693-12707
  │   none                  → category preset "gameplay" (teal/cyan tint)   ExternalParityRenderPreset.ts:588-606
  │   Aura Clash            → compatibility RenderSource environmentLighting   index.ts:13994
  └ ProductionRuntimeRenderer.create({backend:"webgl2" ✖ hard-coded, antialias, preserveDrawingBuffer,
        clearColor: ACES-pre-inverted background})                index.ts:13586-13597
  ▼
GRAPH / TRANSFORMS (per RAF)
 createProductionRuntimeRendererInput                             index.ts:13871-14005
  ├ modelMatrix = T·R(eulerXYZ)·S·normalizeToUnit                 index.ts:17766-17789
  ├ source = {staticBatching:true, frustumCulling:true, collectedLights, environmentLighting,
  │           postprocess: compat?.postprocess ?? root, shadow (spread after compat), fog, cameraPosition}
  │   ✖ no environmentBackground ever set (rg empty in engine/src)   19 C9
  └ camera = {viewProjectionMatrix} only (not a Camera instance)   index.ts:14006
  ▼
CULLING
 Renderer.render → cull explicit items → static batching (modelMatrix=identity + instanceTransforms)
                                                                  Renderer.ts:2200-2228; SceneOptimization.ts:207-217
  ✖ the culled + batched list is reused as the shadow-caster list  Renderer.ts:622-625
  ▼
SHADOWS (first shadow-casting light only)                         Renderer.ts:1371
  ├ directional: ortho box around culled caster bounds (+8%), no texel snap   Renderer.ts:1964-1986
  │   map size 1024/2048/4096 from ALL node positions incl. parked FX pools   index.ts:12949-12960
  ├ ✖ CSM gate needs PerspectiveCamera AND cascadeCount>1; root provides neither   Renderer.ts:1387-1391
  ├ ✖ DepthPass: one position-only MVP shader (no skin/instance/morph/alpha)   DepthPass.ts:59-87; ShaderLibraryCore.ts:784-805
  ├ point: 6 faces → readDepthPixels → 8-bit CPU atlas             Renderer.ts:1516-1603, :1915-1931
  └ strength 0.32 (0.38 city-day, 0.24 product; name-inferred)     index.ts:12966-12968
  ▼
TARGETS
 forward target RGBA16F, MSAA 4x (1x if TAA), DEPTH24 MS RB      Renderer.ts:582-618; WebGL2Device.ts:640-700
   Aura Clash: ✖ targetFormat "rgba8"                             GameRenderPreset.ts:373
  ▼
MATERIALS / SHADERS / LIGHTING (ForwardPass)
 sort → per item: new uniform Map, LightUniforms.pack, new RenderPipeline,
        instance VBO create+destroy (>64 or colors)              ForwardPass.ts:249-351, :1744-1816
 shader = shaderKey[:variant] (10 hand-named textured variants; rest = runtime float branches)
                                                                  ForwardPass.ts:681-683; ShaderLibrary.ts:2063-2076
 ≈ GGX + height-correlated Smith + Burley; split-sum + multi-scatter   ShaderChunks.ts:43-245
 ✖ ambient = color·intensity·hemi(0.35..1)·albedo, no 1/π (≈π× three)   ShaderLibraryCore.ts:622-634
 ✖ env sampler minFilter "linear" ⇒ WebGL2 reads mip 0 only      ExternalParityRenderPreset.ts:169
 ✖ diffuse IBL = roughest specular mip; SH9 irradiance never bound   ShaderLibraryCore.ts:636-637
 ✖ lights 17+ ignored in extension-textured variants (count = min(n,16))   ShaderLibrary.ts:3140-3147
 fog exp² mixed in linear (default ≈40% haze at 10 m)            ShaderChunks.ts:493-495; index.ts:12741-12759
 out: linear HDR (u_outputColorSpace = 0)
  ▼
RESOLVE: blitFramebuffer color+depth, NEAREST                     WebGL2Device.ts:769-785
  ▼
POST (fused native path)                                          Renderer.ts:1068-1111; WebGL2Device.ts:871-1120
 [HDR]  bloom bright-pass: threshold clamped ≤1, soft knee ≤0.5, "balanced" gain ×7   index.ts:12872; NativeBloomPyramid.ts:106-111
 [HDR→LDR] tone map ACES fitted, exposure 1, whitePoint 1 (hard-coded)   index.ts:12898-12904
           Aura Clash: ✖ "reinhard" device default on rgba8       WebGL2Device.ts:1906; RendererPostprocessPlan.ts:183-184
 [LDR 8-bit] DOF → motion blur → SSAO(raw depth) → SSR(depth 0.1/1000) → TAA → outline   WebGL2Device.ts:1016-1033
 [LDR] "FXAA" (4-tap cross blur) on top of the MSAA result (17/18 games)   WebGL2Device.ts:3613-3630
 ✖ non-fusable (volumetric light, contact shadow, grain, CA) → readPixels → JS kernel → upload   Renderer.ts:994-1066, :1245-1280
  ▼
COLOR / FRAMEBUFFER
 linearToSrgb in shader → RGBA8 default framebuffer, alpha:false, preserveDrawingBuffer:true,
 no dither                                                        WebGL2Device.ts:351-355, :3482-3493
 blend: one function engine-wide, SRC_ALPHA/ONE_MINUS_SRC_ALPHA    WebGL2Device.ts:4404
```

Game-path census for the 18 games (18 C1/C5/C11, 19). 15/18 have zero IBL. 2/18 use the 128×64 LDR procedural environment. Aura Clash gets its environment through a compatibility source. 17/18 run rgba16f + ACES, and 1/18 (Aura Clash) runs rgba8 + Reinhard. 17/18 add "FXAA" on top of 4× MSAA. 4/18 use the `production` profile, which gives a fixed 1.5×. None of the 18 shows a sky from its environment, uses an HDRI, renders particles through the bridge, uses CSM or WebGPU, or uses additive blending.

---

### C.2 Render-path inventory (front-ends and devices)

There is no single renderer. These are the 15 distinct entry points that produce or claim to produce frames:

| # | Front-end | File:line | Device | Lighting contract | Who reaches it |
|---|---|---|---|---|---|
| 1 | Root production bridge `createProductionRuntimeSceneRenderer` | `index.ts:13540` → `ProductionRuntimeRenderer.ts:95-108` → `ProductionWebGL2Renderer.ts:34-46` → `Renderer` | `WebGL2Device` (4,769 LOC) | Bridge-constant policy: env selection, ACES@1, shadow 0.32, no background | 17/18 games, racing and falling-blocks templates |
| 2 | Same bridge with `attachRootRenderSource` compatibility source | `RootRuntimeSupport.ts:92`; `index.ts:13991-14001` | `WebGL2Device` | Caller's `environmentLighting`/`postprocess` (GameRenderPreset rgba8 + Reinhard) | Aura Clash, `character-controller` template, smart-city-control (no postprocess) |
| 3 | Safe-basic raw-GL fallback `createWebGLSceneRenderer` | `index.ts:15982`, GLSL `:16681-16975`, own GLB parser `:17018` | raw `getContext("webgl2")` | 1 `u_lightDirection`, no shadows/IBL, `CULL_FACE` off (`:16010`), double gamma (05 §4.4) | **Silent** swap whenever #1 throws (`index.ts:12543-12549`), or `mode !== "production"` |
| 4 | Canvas2D diagnostic preview | `index.ts:11364-11396` | 2D context | none | non-renderable scenes |
| 5 | `LeanProductionRenderer` | `rendering/src/lean/LeanProductionRenderer.ts:29, 52-70` | **`LeanWebGL2Device`** fork (4,537 LOC, about 92% identical, 13 §2.2) | One ForwardPass, no lights/env/shadow/post | core `@aura3d/lean` |
| 6 | `LeanProductRenderer` | `rendering/src/lean/LeanProductRenderer.ts:17-36` | `WebGL2Device` via `Renderer` | `Renderer` capable, but `lean/base.ts` submits no lights/env (`base.ts:386-397`); placement has no rotation (`base.ts:521-523`) | `templates/mini-game`, `templates/product-viewer` (19 C7) |
| 7 | `ProductionWebGPURenderer` | `…/ProductionWebGPURenderer.ts:32` | `WebGPUDevice` (4,001 LOC, marker-sniffed WGSL) | 5 shader families; everything else is flat `u_draw.color` (07 §0.2) | `wow-webgpu-*` diagnostic routes only |
| 8 | `A3DRenderer` (advanced) | `engine/src/advanced-runtime/A3DRenderer.ts:41` | `Renderer` | Caller-supplied (can reach CSM) | 31 app imports, no game |
| 9 | `A3DRenderer` (production) | `engine/src/production-runtime/index.ts:175` | `ProductionRuntimeRenderer` | Caller `RendererShadowOptions` (`:163-173`) | subpath only; no game |
| 10 | `AdvancedRenderer` | `rendering/src/advanced-runtime/AdvancedRenderer.ts:19` (73 LOC delegation) | `Renderer` | Caller | advanced subpath |
| 11 | `CurrentRoutesInteractiveRenderer` | `rendering/src/threejs-example-parity/index.ts:43` | `ProductionRuntimeRenderer` | parity harness | 2 apps by deep relative import |
| 12 | `createProductViewer` | `engine/src/production-runtime/index.ts:1436-1621` | `ProductionRuntimeRenderer` | The only product path with a visible HDR skybox (sphere mesh) and honoured exposure (`?? 0.9`) | production-* templates |
| 13 | Direct `Renderer.render({cameraPolicy:"identity"})` harnesses | 15 tool/test files; `apps/flagship-ibl-states` (14 §3.5) | `WebGL2Device` | Hand-tuned `createExternalParityEnvironmentLighting("studio")` | parity gates; **not** games |
| 14 | `NativeFrameGraphBindings` / FrameGraph façade | `NativeFrameGraphBindings.ts:77-104` | `WebGL2Device` | Wires `EnvironmentBackgroundPass` as SkyboxPass | tests only (19 C9) |
| 15 | `ResidentGPUParticleRenderer` | `ResidentGPUParticleRenderer.ts` (522 LOC) | WebGPU, **own canvas** | none (does not compose) | `wow-webgpu-compute-particles` |

Two more paths look like renderers but are not: `production-runtime/backends/{webgpu,webgl2}/*` (2-line descriptor classes) and `WebGPURendererBackend`, which wraps only a capability report (07 §1).

Consequence: three lighting contracts (bridge constants, caller-supplied, none), two forked WebGL2 devices, and a silent fallback renderer. A game's look depends on which path it lands on (17 vs Aura Clash) and on whether an unrelated bridge branch throws. No single place can fix "the renderer". The 227 rendering files (43.6k LOC) outside the production renderer's static closure, including `CascadedShadowMaps`, `ScreenSpaceReflectionPass`, `PlanarReflection`, `ReflectionProbe`, `SpecularPrefilter` and `EffectComposer`, are unreachable from the builder API the games use (13 §2.4).

---

### C.3 HDR/LDR boundaries (root path, in frame order)

1. **IBL source, pre-lighting: float → Reinhard → sRGB8.** The 128×64 procedural map is tone-mapped and quantized before the GGX prefilter and the SH bake (`EnvironmentMapResources.ts:153-173, 525-537`, called from `ExternalParityRenderPreset.ts:137-151`). The brightest possible environment reflection is about 0.65 linear (04 §5.2), and the map is tone-mapped twice (Reinhard here, ACES later). This applies on every backend because it happens on the CPU.
2. **Environment and fog colour uniforms are validated to [0,1]** (`ForwardPass.ts:1291-1296, 557-562`). No HDR sky or ambient energy can be authored.
3. **Forward shading writes to RGBA16F + MSAA 4×** (`index.ts:12862-12866`). This is genuine HDR. Aura Clash is the exception and writes to **RGBA8** (`GameRenderPreset.ts:373`).
4. **MSAA resolve in HDR** (`WebGL2Device.ts:769-785`).
5. **Bloom bright pass runs in HDR, but the threshold must be ≤1** (engine clamp `index.ts:12872-12873`; device throws above 1, `WebGL2Device.ts:4484-4490`). Emissive isolation above 1.0 is impossible.
6. **Tone map: ACES fitted, exposure 1 → RGBA8 ping-pong.** From here on, every pass is 8-bit display-referred: DOF, motion blur, SSAO, SSR, TAA, outline and FXAA (`WebGL2Device.ts:1016-1033`). Bloom ping-pong stays RGBA16F only when its source is HDR (`:946-948`).
7. **CPU fallback passes** round-trip through `readPixels`/`readFloatPixels` (`Renderer.ts:994-1066, 1245-1280`).
8. **Point-shadow depth goes from 24-bit to 8-bit** through a CPU `Math.round(depth*255)` (`Renderer.ts:1915-1931`).
9. **Present: in-shader linear→sRGB to an RGBA8 framebuffer, no dither** (`WebGL2Device.ts:3482-3493`; 05 §7). This bands dark exp² fog gradients.
10. **Alternate curves.** The forward shader carries its own Narkowicz ACES for `outputColorSpace="srgb"` (lean, no-post and background-without-post paths: `ShaderLibraryCore.ts:588-593`). Some unlit programs output linear with no encode (`ShaderLibrary.ts:85-96`). The clear colour is pre-inverted through fitted ACES (`index.ts:15400-15415`), so every path that uses another curve gets the wrong background.

The HDRI path (`PBRHDRPipeline.ts:149-237`, RGBA16F PMREM) is the only physically sane IBL, and 0 of 18 games use it.

---

### C.4 Architectural issues: path, visual consequence, ceiling class

Ceiling class:
- **STRUCTURAL**: a permanent ceiling while the current design stands. The fix replaces the subsystem.
- **CONTRACT**: the public API or bridge data shape cannot express the capability. The fix is an API or bridge change.
- **DEFAULT**: a wrong constant. It is cheap to fix, but caps every app until it is changed.
- **BUG**: a localized defect.

Pixel evidence is cited as 23/<scene> (benchmark, Aura vs three score) or 21/<game>.

| # | Issue | Code | Visual consequence (evidence) | Class |
|---|---|---|---|---|
| A1 | Ambient light **replaces** IBL instead of adding to it | `index.ts:12693-12707` (zeros at `:12705`); `production-runtime/index.ts:1455, 1566` keep the explicit 0; the engine lint tells agents to add ambient (`index.ts:18256`) | 15/18 games have no reflections and no sky/ground diffuse gradient; metals read black or plastic. 21 repeatedly records "unlit black void" and "flat" lighting. | CONTRACT (permanent until the lighting contract makes environment the default and ambient additive) |
| A2 | Default environment is a CPU-generated **128×64 LDR** map, tone-mapped before prefilter, cyan-tinted "gameplay" preset | `ExternalParityRenderPreset.ts:133-221, 588-606`; `EnvironmentMapResources.ts:153-173` | No HDR glints, nothing for bloom to catch, teal cast on every game that does not light itself | STRUCTURAL |
| A3 | Env sampler `minFilter:"linear"` makes WebGL2 read **mip 0 only** | `ExternalParityRenderPreset.ts:169`; `WebGL2Device.ts:3819-3824, 4139-4146`; `Sampler.ts:27` default | Rough and smooth materials get identical sharp reflections, and "diffuse IBL" is a per-normal texel (04 §5.2). The same `Sampler` default breaks mipmapping on textured primitives (`index.ts:14379-14381`). | BUG (but a `Sampler` default that every caller inherits) |
| A4 | HDRI PMREM runs on the CPU with 128² faces and 32 point samples, blends toward the global average by `min(0.82, r⁴·0.82)`, takes diffuse from the 1×1 roughest mip, and never binds SH9 | `production-runtime/environment/PMREMGenerator.ts:118-149, 282-351` (blend `:345-350`); `ShaderLibraryCore.ts:636-637`; SH computed at `EnvironmentMapResources.ts:543-571`, unbound | 23/06 roughness sweep 4 vs 7 ("blotchy prefiltered specular, dead roughness-1 end"); 23/13 IBL-only 3.5 vs 6 ("diffuse irradiance, roughness-filtered specular … wrong"); 23/03 helmet visor blurrier (6.5 vs 7). The main thread hitches on HDRI upgrade (04 §5.5). | STRUCTURAL (no GPU PMREM, no irradiance binding) |
| A5 | No environment background on any root path | `rg environmentBackground packages/engine/src` returns nothing; only `clearColor` (`index.ts:13586-13596`); the default background is `#070b12` (`index.ts:4781`) | 23/09 outdoor 3.5 vs 5.5 ("no HDRI background"); 23/13; 21: void backgrounds dominate most of the 18 verdicts | CONTRACT |
| A6 | **DepthPass is one static position-only shader** | `DepthPass.ts:59-87`; `ShaderLibraryCore.ts:784-805`; used by directional, spot, point, CSM and framegraph paths (19 C4) | Skinned characters cast bind-pose shadows (23/08: 3.5 vs 5, "character casts almost no shadow"; 23/15). Instanced items cast one copy. Static batches (≥2 identical items) cast one copy at the **world origin** (`SceneOptimization.ts:209-216`). Alpha-mask foliage casts solid quads. Blended materials cast nothing. | STRUCTURAL |
| A7 | Shadow fit and selection: one shadowed light per frame; ortho box fit to **camera-culled** casters (ground included) with no texel snap; map size from all nodes, including parked FX at y=-50…-70 | `Renderer.ts:1371, 622-625, 1964-1986`; `index.ts:12949-12960` | Shimmer under camera motion. Shadows vanish when casters leave the screen. Texel density is spread over the whole visible world. 23/12 shadows 3.5 vs 5.5 ("drops one shadow-casting light entirely"). 23/17 large environment 3 vs 4.5. | STRUCTURAL |
| A8 | CSM is unreachable from root: the gate needs a `PerspectiveCamera` instance **and** `cascadeCount>1`; the bridge passes `{viewProjectionMatrix}` and never sets `cascadeCount`; the public `lights.directional` takes only `shadow?: boolean` | `Renderer.ts:1387-1391`; `index.ts:14006, 12942-12974, 3072`; the CSM implementation also picks a cascade per item by object centre (`ForwardPass.ts:834-854`) | Large levels get one low-density map (23/17) | CONTRACT (the CSM code exists in `CascadedShadowMaps.ts` with stable texel snap at `:198-201`, but needs a real camera object on the root path) |
| A9 | Shadow filtering is manual NEAREST compare with 9/16 taps; no `sampler2DShadow` or `TEXTURE_COMPARE_MODE` | `ShadowPass.ts:142`; `ShaderLibrary.ts:225-251`; rg finds no compare mode | Stair-stepped penumbrae. 23/15: Aura shadows "over-blurred … slightly misprojected". | BUG/STRUCTURAL (depth texture setup) |
| A10 | Shadow **strength 0.24/0.32/0.38**, chosen by node-name category, with no public override | `index.ts:12966-12968`; categories `index.ts:4737-4765`; applied as `mix(1,1-occ,s)` (`ShaderLibrary.ts:251` etc.) | Fully shadowed pixels keep 62–76% of the key light; three.js defaults to 1.0. 23/15 measured shadow darkening of 9% (Aura) vs 50% (three). 23/17 is city-day 0.38 because the boxes are named "city building N" (22 §17 skeptic). | DEFAULT + CONTRACT |
| A11 | Point shadows: 6 GPU→CPU stalls per frame, 8-bit depth | `Renderer.ts:1516-1603, 1915-1931` | Acne or peter-panning; slow | STRUCTURAL |
| A12 | **Post order:** everything after tone mapping runs on 8-bit byte kernels | `WebGL2Device.ts:1016-1033` | SSR reflects tone-mapped colour, DOF loses highlight energy, TAA in 8-bit ghosts and bands (05 §0.6) | STRUCTURAL |
| A13 | SSAO uses raw nonlinear depth, 8 taps, bias 0.025, no normals | `WebGL2Device.ts:3091-3129`; `index.ts:12895`; near 0.05/far 100 at `RootRuntimeSupport.ts:16-21` | Numerically zero occlusion beyond about 2 m (19 C14). 7 games pay for AO and get none, so objects float. | STRUCTURAL (no normal or linear-depth buffer) |
| A14 | SSR/DOF linearize with a hard-coded near 0.1/far 1000; the renderer never passes the camera range | `WebGL2Device.ts:865, 4567-4574` | Wrong depth reconstruction by a large factor | BUG |
| A15 | CPU-readback post passes (volumetric light, contact shadow, grain, CA, CPU bloom chain) | `Renderer.ts:994-1066, 1245-1280`; 05 §5.4 | Deep Recovery captured at **0.5 fps** (1920×1080), 1.1 fps (1280×720) and 3.6 fps (mobile) (`evidence/games/report.slim.json`) | STRUCTURAL |
| A16 | Tone mapping is hard-coded to ACES, exposure 1; `colorGrade.exposure`, `lut`, `shadows`, `highlights` and `temperature` are dropped; "AgX" and "Neutral" are per-channel fakes; exposure presets are diagnostics only | `index.ts:12898-12904, 4547, 4204-4214`; `WebGL2Device.ts:3541-3550`; no `TEXTURE_3D` anywhere (18 §2) | Every game has the same ACES@1 look; 16 games' authored exposures are ignored; no LUT grading | CONTRACT |
| A17 | Aura Clash path: rgba8 target and a Reinhard device default | `GameRenderPreset.ts:264-389`; `RendererPostprocessPlan.ts:183-184`; `WebGL2Device.ts:1906` | The flagship fighting game tone-maps clamped LDR input with a different curve from the other 17 | BUG (preset) |
| A18 | Bloom contract: threshold ≤1, soft knee ≤0.5 (the validator max is copied into 17 routes), hidden ×7 "balanced" gain, `bloom.color` dropped, default "performance" is single-scale 1–4 px | `index.ts:12872, 12791-12796`; `WebGL2Device.ts:4484-4496, 2847-2851, 1004-1007`; `NativeBloomPyramid.ts:106-111` | Mid-tones from luma 0.05–0.34 upward bloom → milky haze (19 C13). 21/courier-rush shows "blown-out bloom". 23/18 game scene "bloom is overblown". | CONTRACT + DEFAULT |
| A19 | "FXAA" is a thresholded 4-tap cross blur (25% centre + 75% neighbour average), applied after 4× MSAA | `WebGL2Device.ts:3613-3630`; `Renderer.ts:611` | Double AA that blurs edges and texture detail; 17/18 games | BUG |
| A20 | Backing store at 1× DPR by default; no resolution governor | `index.ts:4256, 11133, 12280`; `devicePixelRatioSafe` (`:18699`) is dead | A quarter of the native pixels on 2× displays (13–14/18 games). The capture runner used `deviceScaleFactor: 1`, so 21's screenshots **do not show this loss**; the shipped retina experience is worse than the judged frames. | DEFAULT |
| A21 | **One blend function engine-wide**; `renderState.blend` is a boolean | `WebGL2Device.ts:4404`; `LeanWebGL2Device.ts:4183`; `WebGPUDevice.ts:1826-1844` | Glow, neon, sparks, beams and "additive-glow" particles composite as occluding alpha cards (07 §8.2). `SpriteFlipbook` beam reports `additive: true` (`SpriteFlipbook.ts:119,153`), which nothing honours. | STRUCTURAL (render-state model) |
| A22 | Production bridge draws **zero pixels** for `effects.particles`/rain/snow/flipbook/beam; `game.effects` nodes are never mounted | `index.ts:13722-13723, 3646-3670`; `GameRuntime.ts:2860-2876`; no `.nodes()` caller (16 §4) | 23/14 particles **1 vs 4** ("the scene's entire subject is missing"); 21: missing hit feedback across games; ≥9 routes hand-roll spark pools | CONTRACT (silent no-op API) |
| A23 | Scene "hierarchy" is additive Euler / additive position / component scale | `index.ts:17982-18006` | Agents can only build axis-aligned assemblies. Courier Rush's `group(...).scale([6,6,6])` city collapses, because primitives grow 6× at unscaled positions (19 C6). | STRUCTURAL (flatten-snapshot design) |
| A24 | `createProductionInstanceTransforms` omits `node.size`, so S(size) is applied **outside** the instance translation | `index.ts:14747-14753, 13976`; `ShaderLibraryCore.ts:258-261` | 23/16 instancing 2.5 vs 4.5: the 41.6-unit grid renders at 12.5 units as one overlapped slab. Non-uniform sizes would shear rotated instances. | BUG (confirmed, 22 §16 skeptic) |
| A25 | Shader architecture: hand-concatenated GLSL uber-shaders, 10 hand-named `#ifdef` variants, everything else branched on float uniforms, no feature-hash program key, lighting copy-pasted into ≥5 programs with drift | `ShaderLibrary.ts:2063-2076, 565, 1091, 101, 1643`; `ShaderLibraryCore.ts:291-781, 476-480, 642` vs `ShaderLibrary.ts:2655-2665`; `ForwardPass.ts:681-683` | Each feature needs about 5 edits and drifts. Every program binds every sampler. Lights 17+ are silently dropped in extension variants (`ShaderLibrary.ts:3140-3147`: Gallery Shift about 31 lights, Courier about 20). | STRUCTURAL (largest long-term ceiling) |
| A26 | Extension lobes are heuristics, not KHR lobes: `a3dApplyAdvancedPbrLobes` modulates albedo with constants; sheen adds rim without radiance; anisotropy multiplies all shading by `mix(1,0.18,a)`; `sampledSpecular *= mix(1.1,0.65,r)` | `ShaderChunks.ts:253-327, 428-430`; `ShaderLibraryCore.ts:650, 667, 756` | 23/07 sheen 3 vs 6 ("16 near-identical glossy plastic balls"); 23/04 clearcoat 4.5 vs 6.5 (clearcoat roughness texture ignored, milky veil); 23/05 transmission 3 vs 6 (black glass, also A27) | STRUCTURAL |
| A27 | Import and tint heuristics rewrite authored materials: forced tint wipes BC/MR textures and adds emissive = base × 0.28 by default; unbacked transmission becomes rough plastic; red-paint and "product prop" gates sit in general shaders | `index.ts:13570`; `TypedGLBActor.ts:484-514`; `GLTFRenderResources.ts:1743-1769, 1840`; `WebGPUDevice.ts:3555-3588`; 03 §3.1 | Tinted GLBs become flat, self-lit solids. 23/05: glass → dark plastic. Tint never touches alpha, so "ghosts" render opaque (18 C8). | CONTRACT + BUG |
| A28 | No material-authoring system: `NodeMaterial` is a 20-line data bag, WebGPU uses marker sniffing, and there is no TSL equivalent | `packages/materials/src/NodeMaterial.ts`; `WebGPUDevice.ts:3179-3311` | No triplanar, dissolve, rim, flow, vertex-animated foliage or emissive pulse without hand-written GLSL. Agents fall back to `baseColor` + emissive on primitives (07 §8.6). | STRUCTURAL |
| A29 | Per-draw CPU cost: `new Map` uniforms, `new RenderPipeline` per item, no UBOs, no multi-draw, no parallel shader compile, per-frame instance VBOs (>64 instances or with colours) that leak a VAO each frame | `ForwardPass.ts:249-351, 1744-1816`; `WebGL2Device.ts:4225-4236, 1459-1462`; `MAX_GPU_INSTANCES = 64` (`ForwardPass.ts:121`); budget `maxRecommendedDrawCalls: 180` (`index.ts:4258`) | Pushes content toward sparse primitive scenes. Measured on the macos-14 GH runner (3-vCPU virtual M1, ANGLE Metal; run 37289688772): most games ran at 5–15 fps at 1920×1080 (Courier 7.1, Gravity Post 6.4, Rooftop 7.6, Aura Clash 11.1); only Orbital Defense, Vault Breakers and Aurora Lander reached about 52–60 fps. The runner is virtualized, so absolute fps is not representative; the relative spread is. | STRUCTURAL |
| A30 | Morphs: GPU path limited to ≤64 vertices and ≤4 targets; otherwise a new Geometry is allocated, uploaded and disposed every frame | `ForwardPass.ts:119-120, 313, 347-349, 1841-1853, 1885-1887` | Faces and visemes cost a full CPU re-upload; the budget pressure caps character density | STRUCTURAL |
| A31 | Low-tessellation primitives (sphere 12×16, cylinder 24, torus tube 10, capsule = sphere; no UVs or tangents on cylinder/torus) | `index.ts:17359-17362, 17477-17479, 14979` | 685 `primitives.*` vs 112 `model()` calls in the games (06 §0.5), so most pixels are faceted, untexturable meshes | DEFAULT |
| A32 | Fog: default density 0.12 capped at 0.525, giving ≈40% haze at 10 m; resolved from the **static snapshot's first fog node** | `index.ts:3442-3448, 12740-12759` | Flattened contrast. Skyline's five act fogs freeze at act 0 (18 §2). 23/09: "greyed-out haze". | DEFAULT + BUG |
| A33 | Light units: ambient ≈ π× three.js; point intensity default 2, range 10×scale, `d² ≥ 1` clamp; spot `decay` ignored; an implicit direct light is injected when none is authored | `ShaderLibraryCore.ts:622-634, 733-735`; `index.ts:3088, 13244`; 22 §14 | Ambient washes out directional cues; point lights barely register. 23/14: an authored dark scene is lit anyway. | CONTRACT |
| A34 | Depth: 0.05/100 default, single-sample path uses DEPTH16, no reversed-Z or log depth | `RootRuntimeSupport.ts:16-21`; `WebGL2Device.ts:654-690` | Precision waste and z-fighting risk on large levels; it also feeds A13 | DEFAULT |
| A35 | WebGPU backend: GLSL marker sniffing selects hand-written WGSL; unknown shaders become flat unlit; fixed light `normalize(0.36,0.52,0.78)` × 2.25; Duck-colour gates; 4-instance cap; one encoder, buffer, bind group and submit per draw, plus a CPU software raster | `WebGPUDevice.ts:3179-3311, 3555-3588, 3665, 3765, 3863-3868, 1789-1981, 1150` | Zero effect on the games (the root hard-codes webgl2 at `index.ts:13590`). Switching to it would make them look worse. | STRUCTURAL (sunk cost) |

Benchmark failures with no attributed cause yet (23/01 and 23/12: a missing cylinder cap from the same GLB; 23/02: the product pedestal renders translucent and artifacted; 23/18: a shadow streak band across the ground) are recorded as implementation bugs pending root cause.

---

### C.5 MVP shortcuts that became ceilings

| Shortcut (why it was taken) | What it now blocks | Evidence |
|---|---|---|
| A **bridge** that translates the scene snapshot into `Renderer` calls, with quality policy hard-coded inside it (env choice, ACES@1, shadow strength by name, bloom clamps, `backend:"webgl2"`, no background) | Every quality knob sits in a constant the public API cannot reach. Fixing a look means editing a 13k-line file, and harnesses that call `Renderer` directly prove features the games cannot get. | `index.ts:12523-14006`; 14 §3.5 |
| Silent `try/catch` fallback to a second, raw-GL renderer | Any exception changes the game's look; there is no single renderer to own quality | `index.ts:12543-12549`; 13 §2.3 |
| Forked `LeanWebGL2Device` and lean base with inert intents, to hit a bundle-size gate | Templates agents scaffold from start unlit, with no rotation, and every device fix has to be made twice | `LeanWebGL2Device.ts`; `lean/src/base.ts:250-260, 521-523`; 13 §2.2 |
| Uber-shaders branched on float uniforms, plus copy-paste per material family | Feature-keyed variants, a consistent BRDF across programs, compile-time stripping, and any material extension | A25 |
| A single static depth shader | Correct shadows for skinned, instanced, batched, morphed and alpha-tested content | A6 |
| Shadow box fit to visible item bounds | Stable, camera-frustum-fitted, cascaded shadows; off-screen casters | A7, A8 |
| CPU point-shadow atlas | GPU cube shadows | A11 |
| Post kernels written to bit-match a CPU reference (integer LUTs, "squareWords" arithmetic, 05 §0.6), placed after tone mapping | HDR SSAO, SSR and TAA; correct DOF/bokeh energy | A12–A15 |
| CPU-generated LDR procedural environment | Bright reflections, roughness response and any default IBL quality | A2, A3 |
| CPU PMREM with an average-blend fudge, chosen because it passes "variance decreases with mip" checks | Directional diffuse IBL and clean rough specular | A4 |
| `lights.ambient` treated as an alternative environment branch | IBL in 15/18 games | A1 |
| Flattened additive transform composition | Hierarchical assemblies, rigs and rotated groups | A23 |
| `pixelRatio: 1` hard-coded in every profile | Native resolution | A20 |
| `blend: boolean` render state | Additive and premultiplied VFX | A21 |
| Effect nodes accepted as typed API with "non-pixel-backed" warnings | Particles, weather, flipbooks, beams and feel feedback in production | A22 |
| Per-draw allocation-heavy submit path (no UBO, no persistent instance buffers) | Scene density beyond about 180 draws; frame rate | A29 |
| Name-inferred scene categories feeding renderer constants | Predictable shading; it also makes benchmark results depend on node names | A10; 22 §17 |

---

### C.6 Fake parity register (merged from 03, 04, 05, 07, 13, 14, 15; corrected by 19)

Verdict key: **FABRICATED** (not produced by the engine) · **LABEL** (hand-authored status) · **SELF-REF** (checks its own config, labels or strings) · **LOOSE** (real render, threshold cannot discriminate quality) · **LIVENESS** (renders / no errors only) · **HARNESS-ONLY** (works on a path games do not take) · **UNREACHABLE** (code exists; the product path never runs it) · **STUB** (named like a feature, does no work) · **HEURISTIC** (named like a capability, computes a guess) · **ROUTE-LOCAL** (one-off code counted as engine capability).

| # | Claimed capability | Where claimed | What really backs it | Verdict |
|---|---|---|---|---|
| 1 | 13-scene three.js visual parity, scores 0.82–0.93 | `three-compat:compare-threejs` (`package.json:335`) → `three-compat:release` | Constants in `benchmarks/three-compat/shared/scenes.ts:22-34`; Canvas2D paintings shifted 18 px (`tests/browser/three-compat-threejs-visual-parity.spec.ts:64-100`) | FABRICATED (19 C18 confirmed) |
| 2 | Aura faster than three.js (e.g. 11.4 vs 15.9 ms) | `tools/three-compat-threejs-runtime-parity` | The same constants injected into `window.__runtime` | FABRICATED |
| 3 | Three.js broad-replacement readiness | `tools/three-compat-broad-replacement-readiness/index.ts:16` | Consumes #1 | FABRICATED (transitive) |
| 4 | Production-runtime three.js parity | `production-runtime-threejs-*-parity.json` | `renderA3DScene(s){return 'a3d:'+s}` (`benchmarks/production-runtime/aura3d/renderScene.ts:2`) | STUB |
| 5 | 54/54 three.js examples "matched", 22 categories, 0 partial | `docs/project/parity/threejs/parity-matrix.md`; `README.md:218` | Literal `"matched"` in `tools/threejs-parity-threejs-inventory/index.ts`; `visualStatus` derived from it (`:251-256`) | LABEL + SELF-REF |
| 6 | "graphics-and-visual-quality: parity" | `tools/superiority-visual-quality/index.ts:7-22` | #5 plus report pass flags | SELF-REF |
| 7 | WebXR ballshooter/dragging/AR matched | inventory `:177-179` | Injected XR session; Canvas2D preview "not Aura3D rendering evidence" | LABEL (mocked) |
| 8 | WebGPU rtt/compute/materials/instancing matched | inventory; `wow-webgpu-*` | Marker-sniffed WGSL; `wow-webgpu-instancing` issues 160 separate draws (`src/main.ts:44-58`); WebGPU instancing capped at 4 | LABEL |
| 9 | WebGPU Duck product-viewer parity | `wow-webgpu-product-viewer` evidence | Hue gates replacing albedo with Duck colours, fixed light, ×2.25 (`WebGPUDevice.ts:3555-3588, 3665, 3765`); per-route material clamps (`src/main.ts:51-66`) | FABRICATED (asset-tuned) |
| 10 | WebGPU sync pixel proof | `renderImportedAsset` | Returns the CPU software raster, not GPU output (`WebGPUDevice.ts:804-842, 1150`) | FABRICATED |
| 11 | WGSL "PBR" / skybox foundation | `docs/rendering/webgpu-current-architecture.md` | `pbr.wgsl` = `abs(normal)`; `skybox.wgsl` = constant colour | STUB |
| 12 | `webgpu-lab`, `production-webgpu-starter`, `showcase-webgpu-particle-lab` | route and template names | Render WebGL2 | LABEL |
| 13 | PBR material parity vs three/Babylon (11 extensions) | `tools/external-parity-pbr-visual-parity` | MAE ≤ 64, ≤ 82% changed (`:584-587`); the three.js side has no environment; 23/04, /05 and /07 show clearcoat, transmission and sheen failing on identical inputs | LOOSE |
| 14 | Shadow visual parity | `tools/external-parity-shadow-visual-parity` | MAE ≤ 72, ≤ 86% changed (`:578-579`); 23/08, /12 and /15 show shadows missing or 9% vs 50% | LOOSE |
| 15 | three.js shadowmap PCF parity | `tools/threejs-parity-shadowmap-parity` | `pcfCoverage` = harness config self-report (`:119`); "SSIM proxy" = `1-meanDelta/255 ≥ 0.4` (`:338`) | SELF-REF + LOOSE |
| 16 | Diagnostic `mapType: "pcf-soft"` / quality preset `shadowMap:"pcf-soft"` | `index.ts:4614`; `renderer.qualityPresets()` | Runtime always uses `filter:"pcf"` (`index.ts:12971`), NEAREST manual compare | LABEL |
| 17 | Cascaded shadow maps (stable fits, hysteresis) | `rendering/src/shadows/*`; `apps/shadow-cascade-evidence` | Real, but unreachable from root (A8); `CascadeHysteresis.ts` has no consumer | UNREACHABLE |
| 18 | GGX-prefiltered default environment mips | `specularFilterModel: "ggx-importance-sampled…"` (`EnvironmentMapResources.ts:570`) | Never sampled on WebGL2 (non-mip sampler, `ExternalParityRenderPreset.ts:169`); on WebGPU, nearest-mip only | UNREACHABLE (19 C10: WebGL2-specific) |
| 19 | Diffuse irradiance "sh9-cosine-convolved" | diagnostics `diffuseIrradianceModel` | Computed and reported; no shader binds it | UNREACHABLE |
| 20 | Unit test proves "IBL cube sampling" | `tests/unit/rendering/shader-library.test.ts:131, 155` | The fragment source contains `textureLod(u_environmentCubeMapTexture` | SELF-REF (string) |
| 21 | `ReflectionProbe` | `rendering/src/ReflectionProbe.ts` | Raw cube capture: no prefilter, no selection, no consumers | STUB |
| 22 | Rect/softbox area lights | shader integrator | The root emits spot proxies | UNREACHABLE |
| 23 | Spot `decay` | public light options | Accepted, ignored | STUB |
| 24 | Exposure control (`sceneExposurePresets`, `colorGrade.exposure`, overlay `tone: aces-filmic @ <exposure>`) | `index.ts:4204-4214, 3549, 18657` | Renderer always uses 1 (`index.ts:12898-12904`); warning at `:4547` | LABEL |
| 25 | AgX / Neutral tone mapping | `ToneMappingOperator` union; `WebGL2Device.ts:3541-3550` | Per-channel smoothstep / rational curve; never selected on root | STUB |
| 26 | "FXAA" | `effects.antiAlias({mode:"fxaa"})` | 4-tap cross blur (`WebGL2Device.ts:3613-3630`); the WebGPU version is a 2-tap directional blend described as "FXAA 3.11 console core" | STUB |
| 27 | SSAO / `ambientOcclusion` / `contactOcclusion` | effects API, 7 games | Raw-depth kernel ≈ 0 beyond 2 m (19 C14); `runExternalParitySSAO` defaults to a synthetic square depth buffer (`SSAOPass.ts:12-20`) | STUB |
| 28 | Contact shadows | diagnostics | Counted from node **names** ("contact shadow", "footprint", "glow pool", `index.ts:4485-4487`); `shadows.contact` is a translucent dark cylinder (`index.ts:2366-2385`) | HEURISTIC |
| 29 | `EffectComposer`, cinematic `Bloom/Vignette/FilmGrain/DepthHaze` passes | `postprocess/EffectComposer.ts`; `cinematic/*Pass.ts` | JS readback kernels / data descriptors with `rendererOwnedEvidence` flags | STUB |
| 30 | Bloom colour, LUT grading | `bloom.color`, `colorGrade.lut` | Accepted and dropped; no 3D textures exist | STUB |
| 31 | Additive glow (`materialMode:"additive-glow"`, beam `additive:true`) | `index.ts:3707`; `SpriteFlipbook.ts:119,153` | No additive blend exists (`WebGL2Device.ts:4404`) | STUB |
| 32 | `effects.particles` visible particles | API; `showcase-webgpu-particle-lab` README | Production bridge draws 0 pixels (`index.ts:13722`); 23/14: 1 vs 4 | STUB (silent no-op) |
| 33 | GPU particles `particles.diagnostics().gpuReady`, `estimatedUpdateCostMs` | `index.ts:8344-8358` | `total >= 1000 && texturedBillboard`; a linear formula | HEURISTIC |
| 34 | Compute particles `createRootGpuParticleWorkload` | `production-runtime` export | GPU dispatch → full readback → CPU vertex rebuild; no consumer | HARNESS-ONLY |
| 35 | Water reflections "tie" vs three | 3.0.1 matrix `water-reflections` | Route-local constant-colour horizon band (`showcaseShaders.ts:290-367`); engine says "no planar reflection … unsupported" (`WaterSurface.ts:83-91`) | ROUTE-LOCAL + LOOSE |
| 36 | Transmission | `TransmissionPass.ts`; KHR matrix | `evaluateExternalParityTransmission` is a CPU function on one RGB sample; every interactive variant defines `A3D_PBR_DISABLE_TRANSMISSION_BACKDROP` | STUB (03 §13) |
| 37 | Advanced PBR lobes (sheen, clearcoat, iridescence, anisotropy "browser-proven") | `PhysicalMaterialSpec.ts:43-52`; `PRODUCTION_PBR_SHADER_FEATURES` all `true` | `a3dApplyAdvancedPbrLobes` computes five lobes and returns none (`ShaderChunks.ts:253-327`); the "proof" is that pixels change under rotation | STUB |
| 38 | glTF `KHR_materials_ior`, `KHR_texture_transform` "runtime-supported"; Draco/Meshopt/KTX2 | `GLTFExtensionSupport.ts:39-68` | IOR is not in F0; transform is base-only in skinned shaders; the app path supplies no decoder; KTX2 sRGB decodes as linear | LABEL |
| 39 | Node materials | README; `NodeMaterial.ts` | 20-line data bag, no codegen | STUB |
| 40 | Performance helpers `Batcher`, `BVH`, `Octree`, `FrustumCuller`, `LOD` | `rendering/src/index.ts:1163-1166` | `createFlatOctree = {bounds, items}`; no engine call sites | STUB |
| 41 | Quality profiles (`safe-basic`/`production`/`cinematic`) with antialiasing, `blockedInRoot`, `requestedFeatures` | `index.ts:4248-4309` | Only `pixelRatio` is live; `safe-basic` "blocks" a post chain that runs anyway | LABEL |
| 42 | `sceneKitPerformanceBudgets` (draw calls, p50 fps) | `index.ts:9681-9692` | Literal table | LABEL |
| 43 | three-compat layer ("faithful" ledger rows; `ThreeToA3DAdapter`) | `ApproximationLedger.ts`; `migration/ThreeToA3DAdapter.ts:18` | No imports from rendering; geometries generate no attributes; the rewrite target `createThreeCompatRenderer` does not exist; templates are 2-line stubs | STUB |
| 44 | Same-scene three.js parity incl. "large-scene performance" | `tools/external-parity-threejs-visual-parity` | "Close" = channel Δ < 96; the large scene is byte-identical to the gallery scene; setup-line counts are constants | LOOSE + FABRICATED |
| 45 | 15/15 r185 head-to-head workloads pass | `docs/project/threejs-superiority-status.md` | Correctness checks only; 6/11 verdict strings admit "visible aura lighting loss"; the reference scenes have shadows off, ambient 0.35 and 87–99% near-black pixels | LIVENESS |
| 46 | 3.0.1 visual superiority targets met | `muse3jsparity-301-visual.spec.ts:124-129` | 1 win (text), 5 ties, 1 loss; a vacuous `.every` over the wins; SSIM computed but ungated | SELF-REF |
| 47 | Game Visual QA 17/17 PASS | `AURA3D-VERIFICATION-MATRIX.md:160-203` | Non-blank canvas + 0 errors + state change; it notes "washed-out grey" and "bloom blowout" while passing | LIVENESS |
| 48 | CI visual baseline | `pnpm test:visual` → `tools/visual-baseline` | A fixture with 2 distinct pixels; no golden images anywhere | LIVENESS |
| 49 | `compare-engines` visual gate | `tools/compare-engines/index.ts:2110` | `maxChangedPixelRatio: 1` cannot fail; renders box grids, not the named scenes | FABRICATED (metric) |

Pattern (14 §3.11, 15 §7): the honesty cleanups reworded claims and deleted the worst fabrications. None of them added a perceptual bar, and the comparison loop tuned Aura toward a dark three.js contract scene. Every row above was able to pass because no gate captured the shipped `createAuraApp` route with engine defaults and compared it against a well-built reference. The only real, tight comparison is `tools/external-parity-product-visual-parity` (MAE ≤ 8, ≤ 15% changed), plus the new `benchmarks/quality-rebuild/` harness, whose fairness 22 verified.

---

### C.7 Which parts of the architecture impose the current quality ceiling (ranked)

Ranking is by how much of the gap to well-built three.js work each part holds in the shipped frames, and by whether it can be fixed without redesign.

1. **Renderer ownership and the bridge-as-policy design** (A1, A5, A10, A16, A18, A20; C.2 rows 1–3; C.5 rows 1–2). Quality is decided by constants inside `createProductionRuntime*` (`index.ts:12523-14006`): environment branch, ACES@1, shadow strength by node name, bloom clamps, no background, WebGL2 hard-coded, 1× DPR. The renderer underneath can do more than the bridge lets it. Three lighting contracts and a silent fallback renderer mean there is no single place to raise the floor. This ceiling is the root of most of the others: until one renderer with one public lighting/output contract exists, every fix stays route-local or bridge-local.
2. **The environment-lighting pipeline** (A1–A5). This covers ambient replacing IBL in 15/18 games, the LDR 128×64 CPU environment, the mip-0 sampler, the average-blended CPU PMREM, the unbound irradiance, and the missing background. It is the largest per-pixel loss. Modern three.js work starts from PMREM/RoomEnvironment plus `scene.background`, and Aura's default delivers neither. Benchmark scenes that depend on IBL score 3–4 vs 6–7 (23/06, /09, /13).
3. **The shadow subsystem** (A6–A11). Shadow problems are the most frequent cause of lost points in 23: 01, 02, 08, 10, 12, 15, 17 and 18 all cite missing, faint or misprojected shadows. The causes are a static depth shader, a camera-culled fit with no snapping, one shadowed light, unreachable CSM, software NEAREST PCF, and 0.24–0.38 strength. Fixing the strength is a constant change; the rest needs a rewrite of `DepthPass`, the fitter, and how the bridge hands over the camera.
4. **Shader and material architecture** (A25–A28). Runtime-branched uber-shaders, copy-pasted lighting, heuristic extension lobes, asset-specific gates, and no material-graph system together cap every material beyond base metal/rough. Benchmark 04/05/07 score 3–4.5 vs 6–6.5, and stylized looks cannot be built without hand-written GLSL. This is the hardest ceiling to remove, and every new feature makes it worse.
5. **The post chain and compositing model** (A12–A15, A19, A21, A22). This covers LDR byte kernels after tone mapping, raw-depth SSAO, wrong SSR/DOF depth, CPU readback passes (Deep Recovery at 0.5 fps), the fake FXAA, a single alpha-over blend, and effect nodes that draw nothing. Together these remove the "energy" layer (glow, sparks, particles, grounding AO) that modern browser games depend on (23/14: 1 vs 4; 21: missing feedback is a common thread across games).
6. **Draw submission and scene representation** (A23, A24, A29, A30, A31). Per-draw allocations, no UBOs or persistent instance buffers, the VAO leak, CPU morphs, the flattened additive-Euler scene graph, the instancing size bug, and 12×16 primitives. Together they cap scene density and composition, which pushes agents toward sparse, axis-aligned primitive scenes. Measured fps is 5–15 for most games on the capture runner.
7. **Resolution and AA defaults** (A19, A20). These are cheap to fix and large in shipped perceived quality on retina displays. They are under-weighted by the judged screenshots, which were captured at `deviceScaleFactor: 1`.
8. **WebGPU** (A35). It imposes no ceiling on today's frames, because games never select it. It matters strategically: in its current form it is not a path to a higher ceiling and should not be counted as one.

Keep these subsystems; they are sound: the RGBA16F + MSAA targets and resolve (`WebGL2Device.ts:640-785`), the core BRDF and multi-scatter split-sum (`ShaderChunks.ts:43-245`), the fitted ACES matching three.js (`WebGL2Device.ts:3495-3517`), the glTF texture/sampler plumbing (sRGB, trilinear, 8× anisotropy), the HDRI RGBE → RGBA16F path (with a GPU PMREM replacing the CPU one), skinning palettes, render-queue sorting, the native bloom pyramid (with its contract changed), and the CSM code in `CascadedShadowMaps.ts`, once a real camera reaches it.
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
## Code debt

The ceiling is architectural. Aura3D has no single place where "the renderer" can be fixed. Rendering features
reach pixels only if someone hand-wires them into one 18.7k-line bridge. When that bridge throws, it silently swaps
in a different renderer. The release process measures liveness, not appearance, so none of this ever registered as
a failure. Line counts come from `wc -l` at HEAD `c08d8acb` unless a research file is cited.

### D1. Renderer sprawl: 11+ front-ends, 2 devices, 4 live pipelines

- Front-ends (research/13 §2.1):
  - `Renderer`, `ProductionWebGL2Renderer`, `ProductionWebGPURenderer`, `ProductionRuntimeRenderer`
  - `CurrentRoutesInteractiveRenderer`, `AdvancedRenderer` (73 lines of pure delegation)
  - two different classes named `A3DRenderer` (`engine/src/advanced-runtime/A3DRenderer.ts:41`, `engine/src/production-runtime/index.ts:175`)
  - `LeanProductionRenderer`, `LeanProductRenderer`
  - an inline raw-WebGL2 renderer with its own GLSL and GLB parser (`agent-api/index.ts:15982-~17040`)
- Devices: `WebGL2Device.ts` (4,769) and `LeanWebGL2Device.ts` (4,537). The second is a ~92% copy-fork with
  only 346 differing lines, added in `efe051c0` to pass a bundle budget. Every device fix has to be made twice.
- Pipelines a game can actually land on (research/18 Q4):
  - the production bridge;
  - the silent `safe-basic` fallback, used when the bridge throws (`index.ts:12529-12548`; one light, no shadows,
    no IBL, `CULL_FACE` disabled);
  - the lean path, where lights and environment are no-op intents (`packages/lean/src/base.ts:252-259`);
  - the compat-source preset path, which runs rgba8 + Reinhard (Aura Clash only, research/19 C15).
- WebGPU: `WebGPUDevice.ts` (4,001) software-rasterizes every triangle inside `draw()`, caps instancing at 4, and
  is used by 0 games (research/07 §2.3-2.5).

### D2. The agent-api monolith

`packages/engine/src/agent-api/index.ts` is **18,733 lines**. It holds the builder vocabulary, scene flattening,
the production bridge, the fallback renderer, a GLB parser, the prompt compiler and diagnostics, with about 74
`export *` statements. A leaf imports it back (`Decals.ts ↔ index.ts`, research/13 §9).

Most of the verified look-killers live in this one file (research/19):

| Defect | Location |
|---|---|
| Ambient light zeroes IBL (15/18 games) | `:12693-12707` |
| DPR fixed at 1 | `:4256`, `:11133` |
| Tint strips textures and adds emissive | `:13567-13580` |
| Shadow strength 0.24-0.38 | `:12966-12968` |
| Exposure hard-coded to 1, colorGrade.exposure dropped | `:12898-12904` |
| Additive-Euler group transforms | `:17982-18006` |
| `createProductionInstanceTransforms` omits `node.size` (benchmark 16 bug, research/22) | `:14747` |
| No `environmentBackground` ever set | (absent from file) |
| Effect nodes declared "non-pixel-backed" | `:13722` |
| Prompt-plan fields ignored but echoed back | `:10118-10289` |

Because one file owns every concern, each look fix touches the same hot spot as every other workstream.

### D3. Most of the rendering package never reaches pixels

- **227 of 285** rendering files (**43.6k of 73.2k lines, 60%**) are outside the production renderer's import
  closure.
- The engine imports **57 of 632** runtime values from `@aura3d/rendering`.
- **31 files (4,928 lines)** have no consumer anywhere: `PbrReference.ts`, `ReflectionSurfaces.ts`, `VoxelWorld.ts`,
  `ScreenSpaceReflectionPass.ts`, `performance/{LOD,Octree,FrustumCuller}.ts`, and others. `Octree` returns
  `{bounds, items}` (research/13 §2.4).
- CSM, SSR, planar reflection, `EffectComposer`, `ReflectionProbe` and `TerrainTiles` are exported, tested and listed
  in feature lists, but none of them is on the game path.

### D4. Copy-pasted shaders

- `ShaderLibrary.ts` (3,331) and `ShaderLibraryCore.ts` (904) hold six hand-written programs: base PBR, textured,
  normal-mapped, instanced, skinned, and skinned-8. The lighting code is pasted into each with drift. For example,
  the rough-floor term is `mix(0.04,0.38,r)` in one and `mix(0.012,0.16,r)` plus extra stripes in another
  (research/02 §3, :122).
- Every program declares every sampler because of runtime-uniform branching. Each new feature costs about five
  edits.
- `pbr-direct.frag.glsl` is dead, yet reports cited it as the live shader (research/18 C3).
- Divergence bugs this produced:
  - Lights 17+ are silently dropped in the extension-textured variants (`ShaderLibrary.ts:3140-3147`, research/18 §2).
  - The single position-only `DepthPass` shader (`ShaderLibraryCore.ts:784-805`) ignores skinning, instancing,
    morphs and alpha-cutout (research/19 C4).
  - "AgX" and "Neutral" are per-channel curves, not the real operators (`WebGL2Device.ts:3541-3550`).

### D5. Duplicate implementations and duplicate exports

| Concern | Count | Evidence |
|---|---:|---|
| Scene representations | 6 | `Scene`, `A3DScene`, `AuraSceneSnapshot`, ECS `World`, lean builder, `Object3DCompat` (research/13 §6) |
| glTF/GLB parsers | ≥4 (+4 in template scripts) | `GLTFLoader.ts` (4,389), agent-api `parseGlb`, two asset corpora |
| Material preset registries | 6 | agent-api `material.*`, `MaterialPresets`, `CinematicMaterialPresets`, `ArchitecturalMaterialCatalog`, `AnimationMaterialStyle`, `@aura3d/materials` (used by nothing) |
| Math implementations / `Vec3` types | 4 / 5 | `@aura3d/math`, `scene/MathTypes`, `animation/Keyframe`, `physics/Shape` |
| Controls | 2 | `@aura3d/controls`, `@aura3d/input/controls` |
| `AnimationController` | 2 | engine 3,368 lines vs animation 1,017 lines; only the engine copy is live |
| Names exported by >1 package | 397 (53 with different declarations) | research/13 §5 |
| Alias subpath pairs | 4 | `engine`/`engine-runtime` and 3 more |
| Root "." exports | 1,726 vs three r185's 441 | 130 of them are evidence/report/audit types |
| Repo-only symbols (absent from the published "." entry) | 77 | 4 `external-parity-*` templates would break when installed from npm |

### D6. The evidence apparatus outweighs the engine

| Area | Size | Source |
|---|---:|---|
| `tools/` | 454 dirs, 126.6k LOC | research/14 §1 |
| `tests/unit` + `tests/browser` | 115.7k + 116.2k LOC | research/14 §1 |
| `benchmark(s)/` | 21.1k LOC | research/14 §1 |
| **Evidence total** | **~381k LOC, 5.2× `packages/rendering/src` (72.9k)** | research/14 §1 |
| Tool dirs that only aggregate prior JSON (no browser, no pixel decode) | 340 of 449 (76%) | research/14 §1.1 |
| Tool dirs that decode a pixel at all | 40 (9%) | research/14 §1.1 |
| Root `package.json` scripts | 560 (7 point at missing files) | research/14 §4 #30 |
| Unit tests asserting source substrings | 141 | research/14 §1.2 |
| `tests/reports` on disk | 9.5 GB, git-ignored, 60 files tracked | research/14 §1 |
| Commits that are evidence/claims/gates/PRD/amendments | 562/1,207 (47%); only 6.9% touched rendering source | research/01 §1.4 |

The suites that sit at the top of the release gate are fabricated or hand-labelled:
- `three-compat:compare-threejs` uses constant scores and Canvas2D "screenshots" (research/19 C18).
- The "54/54 matched" matrix is built from literal strings (research/14 §0.4).
- `superiorityTargetsMet` is vacuously true (research/14 §0.5).

### D7. Route-level debt in the 18 games

- 87.7k LOC across the 18 routes. **34% is evidence/proof/capture plumbing**: pulse-tunnel 65%, gravity-post 48%,
  aura-clash 47% (research/16).
- `?capture=review` is parsed in **16/18 routes** and branched on **395 times**. Review mode changes lights,
  emissives, materials, scale and pose, so evidence frames are not the player's frame (research/16 §3; research/11 #11).
- `createGameAudio` is wrapped 17 times in about 3.3k LOC of near-identical code.
- 13 copies of `write-performance-report.ts`, 13 hand-rolled RNGs, and 31+ `window.__X__` globals.
- **0** routes mount `game.effects().nodes()`, so engine juice draws nothing (research/16 §4, research/19 C8).
- The engine fps counter reports 60 while the harness measures 0.5-15 fps (research/20, Deep Recovery and others).

### D8. Fake public surfaces

- `@aura3d/three-compat` imports nothing from rendering. `createThreeCompatRenderer` does not exist. The 8
  `templates/three-compat-*` apps are 2-line files that a bundler can drop.
- `@aura3d/environments` exports two diagnostics and no environment.
- `@aura3d/materials` `NodeMaterial` returns a string.
- `@aura3d/lean` lights and environments are inert, and it is the default `create-aura3d` template path
  (research/13 §3, §7; research/19 C7).

### D9. Asset debt

- 71 of 131 `release` models contain no images, and 13 are 4-triangle `KHR_materials_unlit` cards.
- The release gate waives texture evidence when `suitabilityReason` matches
  `/stylized|flat-color|untextured/` (`packages/aura3d-cli/src/index.ts:3376-3382`, research/19 C19).
- 0 Draco/Meshopt/KTX2 assets, and no optimize stage.
- 1.7 GB of `public/aura-assets` is copied into every app's `dist` (research/11 §8).

### Why the debt blocks progress

1. **No composition point.** A rendering feature exists in up to five places: the shader copies, two devices, the
   bridge, and the fallback. Shipping it means wiring every one of them, and missing one fails silently.
2. **Failure is masked.** The bridge falls back instead of throwing. Builders accept parameters and drop them
   (lean `_options`, prompt-plan fields, colorGrade exposure). Diagnostics report success (fps 60, `visualSystems`
   echoes the input).
3. **Gates reward the status quo.** The composition QA was calibrated on current frames (research/14 §2.2). Pixel
   gates pass at 82% changed pixels / MAE 64. Review mode lets routes stage a different frame for evidence.
4. **The repo and npm resolve differently**, so in-repo tests cannot catch consumer breakage (research/13 §4).

---

## What should be deleted or replaced

Scope: rewrite or replace about **38k lines** and delete about **13k lines** of `packages/` (about 51k of 257k, about
20%). Delete about 250k LOC of evidence tooling and tests. Preserve the remaining ~80% of `packages/`, which includes
most of the code that is actually correct. The PRD IDs below are proposed; reconcile them with the PRD index section.

Proposed PRDs: **QR-01** single renderer + scene compiler · **QR-02** look-baseline defaults · **QR-03** shader/material
generator · **QR-04** shadows · **QR-05** HDR post chain · **QR-06** VFX/particles · **QR-07** instancing, perf and
tiers · **QR-08** animation authority · **QR-09** asset optimize + admission · **QR-10** evidence reset + quality bar ·
**QR-11** agent authoring path · **QR-12** shared game layer + portfolio · **QR-13** package surface.

### Delete / replace / rewrite

| Subsystem | Verdict | Reason | Evidence | PRD |
|---|---|---|---|---|
| `LeanWebGL2Device.ts` (4,537) | **delete** | 92% fork that exists only to meet a bundle number | research/13 §2.2 | QR-01 |
| Inline safe-basic renderer + GLB parser in agent-api (~1,050 lines, `:15982-17040`) and the silent fallback in `createProductionSceneRenderer` | **delete**; a bridge failure must throw visibly | Swaps in a one-light, no-shadow, no-IBL renderer on any exception | research/13 §2.3 | QR-01 |
| `AdvancedRenderer`, `CurrentRoutesInteractiveRenderer`, both `A3DRenderer`s, `LeanProductionRenderer`, `LeanProductRenderer` | **delete**; fold `ProductionWebGL2Renderer`/`ProductionRuntimeRenderer` into `Renderer` as backend selection | 11 front-ends with no owner | research/13 §2.1, §12.1 | QR-01 |
| `agent-api/index.ts` (18,733) | **rewrite**: split into a node-spec/builder layer (keep the vocabulary) and one `SceneSnapshot → RenderSource` compiler next to the renderer. Rule: nothing is exported until the compiler emits it | Monolith that hosts most of the verified look defects | research/13 §12.3, D2 above | QR-01 |
| `composeAuraTransform` additive Euler (`:17982-18006`) | **rewrite** as matrix hierarchy | Scaled and rotated groups render wrong (Courier city collapses ×6) | research/19 C6 | QR-01 |
| Default look path: ambient-zeroes-IBL, DPR 1, shadow 0.24-0.38, exposure 1, tint wipe + 0.28 emissive, solid-colour background, fog density 0.12 | **rewrite defaults**: ambient is additive; `min(dpr,2)`; shadow strength 1.0; exposure wired; tint multiplies `baseColorFactor` only; `environmentBackground` set; fog ~0.015 | Same defects in every `createAuraApp` scene | research/19 C1-C3, C9, C11, C12; research/02 §8 | QR-02 |
| Default environment (128×64 procedural, Reinhard→sRGB8 before prefilter, bound with non-mip `linear`) | **replace** with GPU PMREM of an HDR RoomEnvironment-equivalent in RGBA16F; read the mips; bind SH irradiance | Roughness has no effect on WebGL2; "IBL" is a flat gradient | research/19 C10; research/18 C4 | QR-02 |
| `ShaderLibrary.ts` + `ShaderLibraryCore.ts` six-program copy-paste (4,235) | **rewrite** as a chunk-assembled program generator keyed on a feature hash (three-style `getProgramCacheKey`); spec-correct sheen, clearcoat, transmission; no 16-light cap | Drift between copies; benchmarks 04/05/07 fail on material correctness | research/02 §7.1; research/23 (04: 4.5 vs 6.5, 05: 3 vs 6, 07: 3 vs 6) | QR-03 |
| `DepthPass` / `ShadowPass` / single-map fit / manual NEAREST PCF | **rewrite**: depth variants (skin, instance, morph, cutout); `sampler2DShadow`; CSM on the root path with texel-snapped fit; casters gathered from the light frustum | Bind-pose shadows, one-copy instanced shadows, faint and over-blurred shadows; **9 of 18** benchmark scenes cite shadows | research/19 C4, C5; research/23 (01, 02, 08, 09, 10, 12, 15, 17, 18) | QR-04 |
| Post: "FXAA" 4-tap blur on MSAA, raw-depth SSAO, bloom ×7 hidden gain with threshold ≤1, fake AgX/Neutral, CPU `*Pixels` kernels in `PostProcessPass.ts` (2,750) | **rewrite** as an HDR chain: GTAO/SSAO on linear depth, SMAA or TAA, a bloom pyramid with HDR threshold and no hidden gain, real AgX and Khronos Neutral, tone map last; **delete** the CPU kernels | No AO at gameplay distances; mid-tones bloom; aliasing | research/19 C12-C14; research/05 | QR-05 |
| Particles / rain / snow / flipbook / beam effect nodes (0 production pixels); single alpha-over blend | **replace** with a billboard/flipbook pass, additive and premultiplied blend modes, soft particles, and node add after mount | Benchmark 14: Aura 1/10; no game shows rendered particles | research/19 C8; research/23 (14) | QR-06 |
| Instancing: 64-uniform cap, per-frame VBOs plus a VAO leak, per-frame "static batching", WebGPU cap of 4, missing `node.size` | **rewrite**: persistent instance buffers, merge-once batching, VAO eviction | Benchmark 16: Aura 2.5/10, SSIM 0.399; draw-call-bound games at 5-8 fps | research/07 §3.3; research/22 (16) | QR-07 |
| Declarative performance budgets (`sceneKitPerformanceBudgets`, `gpuReady`, fps self-report) | **delete**; replace with measured rAF/`RendererTiming` values | Constants presented as measurements; the engine says 60 at 0.5 fps | research/07 §7; research/20 | QR-07 |
| `WebGPUDevice.ts` (4,001) as the production WebGPU path | **replace** (three r185 `WebGPURenderer` + TSL, Option A) **or freeze** until a material IR exists. Delete the CPU rasterizer in `draw()` and the marker-sniffing translation | Zero visual effect on games; would make them look worse if enabled | research/07 §10 | QR-07 |
| Animation: two `AnimationController`s, empty-pose freeze, no crossfade, 1 s defaulted durations | **rewrite** into one sampler/blender authority; `index.ts:13871` requires non-empty bones | Gallery Shift and the fighting template freeze; the taught skill pattern triggers it | research/19 C16; research/09 §9 | QR-08 |
| Asset admission: stylized regex waiver, 4-triangle release cards, JS-vertex-array "release" art, no optimize stage | **replace** with `aura3d assets optimize` (gltf-transform/gltfpack, KTX2, Meshopt, tangents, LOD) and a look-gated admission bar; demote code-built meshes to `proxy` | 71/131 release models have no textures | research/19 C19; research/11 §9 | QR-09 |
| Fabricated parity suites: `benchmarks/three-compat/shared/scenes.ts`, the 2 three-compat specs, 2 three-compat tools, `external-parity-roadmap-visual-quality`, "SSIM proxy", hand-labelled `parity-matrix.md`, `superiority-*` decisions, `external-parity-unity-unreal-parity` | **delete now** | Constants, Canvas2D paintings, vacuous truth | research/14 §6; research/19 C18 | QR-10 |
| ~340 report-aggregator tools; 141 source-substring unit tests; 560 scripts | **delete** down to ≤10 aggregators; keep only tests that guard real invariants; keep scripts under ~80 | Self-referential gates many hops from any pixel | research/14 §1, §6 | QR-10 |
| `?capture=review` forks (395 ternaries) | **delete**; add an engine `capture` mode that may set only camera pose, clock, seed and scenario, enforced by a lint on capture-conditioned look values | Evidence frames are not the shipped frame | research/16 §3 | QR-10, QR-12 |
| `@aura3d/three-compat`, 8 `templates/three-compat-*` stubs, `@aura3d/environments`, `@aura3d/materials` `NodeMaterial`, toy `Octree`/`FrustumCuller`/`LOD`, 31 orphan rendering files (4,928) | **delete**, or rebuild three-compat on the real renderer behind a working `WebGLRenderer` shim | No draw path; the ledger's "faithful" ratings are false | research/13 §6-7, §2.4 | QR-13 |
| `@aura3d/lean*` second builder API | **delete**, or make it a thin re-export of the one builder API, code-split | Same names with different semantics; the default template renders lightless | research/13 §3; research/19 C7 | QR-11, QR-13 |
| Root exports (1,726), alias subpaths, `ExternalParity*` (83) and evidence types, `dist/index.js`, tests/tools compiled into `dist` | **rewrite surface**: under ~400 runtime exports on "."; evidence types move to a `@aura3d/devtools` subpath; tsconfig/Vite paths generated from `exports` | Agents cannot tell which renderer is real; repo resolution ≠ npm | research/13 §4-5, §12 | QR-13 |
| Prompt-plan recipes that ignore camera/lighting/effects and echo them as `visualSystems`; name-based `material.visualQA` | **rewrite** to consume the fields, or drop them from the type | Lies to screenshot-repair loops | research/19 C17; research/12 §0 | QR-11 |
| Skills text (6× more evidence lines than craft lines) and the near-black ambient+directional starter recipe | **rewrite**: add an art-direction skill with a per-genre look recipe; give agents a remote screenshot loop | The recommended path converges on the retro look | research/12 §0, P1 | QR-11 |
| Per-route audio wrappers, RNGs, pause/visibility, performance-report copies | **replace** with a shared game layer (`game.audio` cue sets, `SeededRandom` on root, lifecycle) | ~3.3k + 1.1k duplicated LOC | research/16 | QR-12 |
| Orbital Defense | **delete** from the portfolio | 418 LOC; 1.5/10; silent | research/21; research/20 | QR-12 |

### Preserve (correct subsystems to build on)

| Subsystem | Why it is kept | Evidence |
|---|---|---|
| `Renderer` + `WebGL2Device` RGBA16F/MSAA/depth-texture targets and resolve (`WebGL2Device.ts:640-785`) | Correct HDR render-target core | research/02 §9 |
| BRDF chunk: GGX, height-correlated Smith, Burley, split-sum with Fdez-Agüera multi-scatter (`ShaderChunks.ts:43-245`) and the BRDF LUT | Benchmark 03 (helmet) 6.5 vs 7.0 and 11 (multi-light) 5 vs 5 show direct shading is near parity | research/04 §11; research/23 |
| ACES fit matching three r185 (`WebGL2Device.ts:3495-3517`), linear workflow, per-slot sRGB, single-encode present | Correct | research/05 §12 |
| `PBRHDRPipeline.ts` HDRI → RGBA16F PMREM chain + RGBE parser | Becomes the default environment instead of an unused option | research/02 §9; research/04 §11 |
| glTF loader breadth (clearcoat, specular, transmission, specGloss, animation pointer, KHR texture transform, tangents) | Asset side already feeds it | research/11 §10 |
| `WebGL2StateCache.ts`, `RenderGraph.ts`, `RendererTiming.ts`, `RenderItemSorting.ts`, VAO cache design (fix keying) | Correct infrastructure | research/07 §11 |
| `NativeBloomPyramid` planner (replace kernels and gain), CSM split and stable-fit math (`CascadedShadowMaps.ts`, `CascadeHysteresis.ts`), `EnvironmentBackgroundPass` (needs root wiring), fog chunk | Correct; currently unreachable or misconfigured | research/04 §11; research/08 §13 |
| `ResidentGPUParticleRenderer`, `GPUParticleBackend` WGSL kernels, CPU `ParticleSystem` + modules, `ProjectedDecalGeometry`, `TerrainHeightfield`, `OceanSurface` Gerstner, `WebGPUTemporal` TAA WGSL | Real implementations awaiting a scene pass | research/07 §11; research/08 §13 |
| `GLTFAnimationRuntime`, `skinning_common` (4/8 influences, data texture), clip events, `Inertialization`, `SpringBones`, two-bone/foot IK, Aura Clash combat→clip mapping | Correct math; mostly unwired | research/09 §10 |
| `createGameInput` (actions, buffering, gamepad, touch, replay), `PlatformerMotion`, `VehicleChassis`, `GameCameraRigs` math, `FrameLoop` + physics interpolation | Controls score 5-6 in research/20, the fleet's best non-visual category | research/10 §14 |
| `@aura3d/audio` `SpatialAudio`/`PositionalEmitter`, bus ducking, `createGameAudio` typed cues | Architecture is sound; the content is synthesized (17/18 games use oscillator WAVs) | research/10 §14; research/18 C12 |
| `@aura3d/physics` + `physics-rapier` + `navigation-recast` | Physics-feel highs (Vault Breakers 5.75, Siege Golf 6, Rooftop 5.75) come from Rapier | research/13 §13; research/20 |
| Typed assets (`model(assets.x)`), provenance ledger, content-hashed paths, `assets inspect`, Meshy spend controls | Prevents hallucinated assets; orthogonal to looks | research/11 §10; research/12 §11 |
| Genre kits (`game.platformer/racing/fallingBlocks/fighting`) as rules engines | The defects are in presentation, not rules | research/12 §11 |
| Package tiering (no package-level cycles), ESM + `sideEffects:false`, WebGPU behind a dynamic import | Correct packaging pattern | research/13 §13 |
| `benchmarks/quality-rebuild/` (18-scene same-input harness vs three@0.185.1), `tools/quality-rebuild-capture/` + `.github/workflows/quality-rebuild-capture.yml`, analytic pixel tests (`tests/visual/rendering-pixels.spec.ts`), head-to-head harness, hash-bound human-review workflow, premium-indie refs | The only evidence that measures appearance | research/14 §6; research/22 (harness verified fair) |

---

## The Aura3D Quality Bar

"Three.js-level" means a panel of judges looking at the **shipped default path** cannot rank Aura3D below a
well-built three.js r185 scene with the same input. The bar is defined on pixels judged by people and a vision
model. Gates, matrices and claim labels do not count toward it. Each domain has a **pass** threshold. All
thresholds hold on the default URL with engine defaults, captured on the remote harness.

### Where 3.0.1 stands (baseline for every threshold)

- **Renderer benchmark** (research/23, vision-judged, 18 scenes):
  - Aura mean **3.6**, three mean **5.4**.
  - Only **2/18** scenes are within 0.5: 03 helmet (6.5 vs 7.0) and 11 multi-light (5 vs 5).
  - 16/18 carry a major-deficiency or implementation-bug classification.
  - Worst scenes: 14 particles **1 vs 4**, 16 instancing **2.5 vs 4.5**, 05 transmission **3 vs 6**, 07 sheen
    **3 vs 6**, 06 roughness sweep **4 vs 7**.
  - The three.js scores are themselves capped at 4-7 by programmer-art content. Matching them is necessary but not
    sufficient (see R4).
  - Pass-1 code+metrics judges (research/22) scored three higher (about 6.5-8.5). Research/23 is the authoritative
    number.
- **Games** (research/21, vision-judged): overall **1.5-4/10**, median **3**, no game at 5. fps on the macos-14 runner
  is mostly 5-15. Deep Recovery runs 0.5-1, and only Orbital Defense and Vault Breakers reach about 60 (report.slim.json).
- **Perceptual metrics do not discriminate.** Whole-frame SSIM is **≥0.95 on 14/18** scenes, and MAE is 2.6-17.6,
  while the vision gap is 1-3 points (evidence/benchmark/report.json). SSIM only fell where the subject was missing
  (14: 0.558; 16: 0.399). This is why perceptual metrics are secondary signals here, never the gate.

### Renderer (same-scene benchmark)

Harness: `benchmarks/quality-rebuild/`, same SceneSpec, three@0.185.1 reference. Research/22 found it fair.

- **R1. Score.** For every scene, the panel score (protocol below) is **≥ three.js score − 0.5**.
- **R2. No disqualifying class.** No difference on any scene is classified `major-aura3d-deficiency`,
  `implementation-bug` or `missing-capability` (research/23 taxonomy).
- **R3. Region metrics as secondary signals.** Masks are generated from the SceneSpec geometry.
  - Shadow contrast under casters: receiver/caster-shadow luma ratio within ±15% of three. Today three is 19-27 on
    ground 127, while Aura is 122-124 on ground 134-137 (research/22 01).
  - FLIP (luminance) per object mask ≤ 0.10 and ΔE2000 ≤ 3 in lit regions.
  - Specular energy on metal masks within ±20%.
  - Each metric must reject a broken control (IBL off, shadows off, DPR 0.5, AA off) before it counts.
- **R4. Benchmark v2.** Add 6 "well-built" reference scenes in which three.js uses PMREM/RoomEnvironment, soft
  shadows with normalBias, GTAO, bloom, SMAA/TAA and AgX or Neutral, and scores **≥7**. R1-R2 apply to them too.
  This keeps the bar from becoming "match a dark test card" (research/14 §0.6).
- **R5. Cost.** Time to first frame ≤ 1.5× three on the same scene. Today it is 1.3-13× (06: 2,892 ms vs 218 ms).
  Draw calls ≤ 1.2× three.

### Product viewer

Input: a valid PBR GLB, `createAuraApp(scene().add(model(assets.x)))`, and **no lighting, environment or camera
authored**.

| Criterion | Pass condition |
|---|---|
| Lighting | Default HDR environment with prefiltered specular (roughness visibly varies), additive ambient, no flat-grey fill |
| Grounding | Contact shadow or AO under the object; cast-shadow strength 1.0 when a key light exists |
| Background | Neutral studio gradient or blurred env, not a solid void |
| Fidelity | Authored textures preserved; tint never drops maps; clearcoat, transmission and sheen match spec (research/23 04/05/07 classes ≤ minor) |
| Output | `min(dpr,2)` backing store, AA with no edge crawl at 1× zoom, ACES/Neutral tone mapping with highlights rolling off (no hard clip on chrome, research/23 02) |
| Camera | Auto-framed: subject fills 45-70% of frame height; orbit at ≥58 fps on Medium tier |
| Score | Panel ≥ **7.0** and ≥ three r185 (RoomEnvironment + ContactShadows reference) − 0.5 on each of 10 Khronos samples: DamagedHelmet, FlightHelmet, AntiqueCamera, WaterBottle, Corset, ToyCar, SheenChair, ClearCoatCarPaint, TransmissionTest, MetalRoughSpheres |

### Character

| Criterion | Pass condition |
|---|---|
| Playback | Clip actually sampled on the visible actor (`tracksApplied > 0`); real GLB durations; 0.2 s default crossfade; no empty-pose freeze |
| Shadows | Skinned shadow matches the posed silhouette: shadow-mask IoU ≥ 0.9 against a reference posed render |
| Motion | Foot slide < 2 cm per planted step; no per-bone angular-velocity spike > 3× clip median at transitions |
| Presentation | Rim/key separation from the background; textures and normal maps visible; never a 4-triangle card in a `character` role |
| Score | Panel ≥ **6.5** and ≥ three − 0.5 on benchmarks 08 and 15 and two v2 character scenes |

### Environment

| Criterion | Pass condition |
|---|---|
| Sky | Visible HDRI or analytic sky behind geometry (benchmarks 09/13 currently flag `hdri-background` missing) |
| Shadows | Cascaded, stable under camera motion, covering ≥ 100 m; no shadow-band artifacts (research/23 18) |
| Depth | Fog colour derived from sky/background; AO visible at 3-30 m gameplay distances |
| Detail | Tiled ground with mipmapped, anisotropic, repeat-wrapped textures (today `minFilter: linear`, clamp; research/06 #37) |
| Score | Panel ≥ **6.5** and ≥ three − 0.5 on benchmarks 09, 10, 17 and two v2 outdoor/indoor scenes |

### Games

Rubric: the 27 visual categories from research/21 (vision-judged) plus 6 non-visual categories from research/20:
sound_audio, controls, physics_feel, game_feel, loading_transitions, performance.

- **G1.** Overall ≥ **7.0/10**.
- **G2.** No category < **5**.
- **G3.** Measured rAF p50 ≥ **58 fps** and p95 frame ≤ **20 ms** on the game's declared tier hardware at that tier's
  DPR cap. Engine self-reported fps is inadmissible.
- **G4.** Desktop 1920×1080 and mobile 390×844 are both judged. Mobile must have touch controls and a full-bleed
  canvas (mobile_presentation ≥ 5).
- **G5.** Frames come from the **default URL only**. A capture mode may change camera, clock, seed and scenario,
  nothing else.
- **G6.** Sampled or designed audio. Oscillator-only cue sets cap sound_audio at 4, and the scores from oscillator
  sets in research/20 sit at 0-5.

Today **0/18** games pass G1. Every game fails G2. Typical fails are shadows 2, ibl_reflections 1.5-2,
postprocessing 1.5-2, vfx/particles 1-2 and performance 0.5-3 (research/20, 21).

### Agent-generated output

- **A1.** A fresh agent with no repo-internal knowledge uses only `create-aura3d` plus the installed skills and the
  recommended API. It runs on **12 standard prompts**: 3 product, 2 character, 2 environment, 4 game genres
  (platformer, racing, fighting, arcade) and 1 cinematic. Each prompt runs 3 times with different seeds.
- **A2.** Median panel score ≥ **6.5**, no prompt median < 5.
- **A3.** Zero renderer-knowledge escapes in the output: no `pixelRatio`, shadow strength, raw shader or
  `qualityProfile` overrides needed to pass. If an agent had to set them, the defaults have failed.
- **A4.** Each prompt's report fields describe only what was rendered. A `visualSystems` entry that does not
  correspond to pixels fails the run (research/19 C17).

### Scoring protocol

1. **Capture.** Remote GPU harness only: `.github/workflows/quality-rebuild-capture.yml` (macos-14, ANGLE Metal),
   plus a named tier device for G3. Never SwiftShader, never a local Docker host. Each frame is bound to its commit
   SHA, the harness run ID and the asset hashes.
2. **Rubric.**
   - Benchmark scenes use the research/23 template: per-image description, a difference table with the 6-class
     taxonomy (`equivalent`, `aura3d-better`, `minor-aura3d-deficiency`, `major-aura3d-deficiency`,
     `implementation-bug`, `missing-capability`), a 0-10 score per renderer, and a harness-fairness check.
   - Games use the research/21 template: 27 categories, a dominant-cause split, and a verdict. The research/20
     non-visual categories are added from measured data.
3. **Panel.** 2 humans (one art director, one rendering engineer, both named in the record) plus 1 vision model
   (claude-opus-5.5 via Kiro Prism, using the research/21/23 prompt).
   - Score = median of the three. A difference class stands if 2 of 3 assign it.
   - Any category with a judge spread > 2 is re-scored after a written reconciliation.
   - The vision model alone can never produce a pass.
4. **Calibration set.** Judges score it blind at the start of every round:
   - Known-bad: 3.0.1 Orbital Defense 1.5, benchmark 14 Aura 1.0.
   - Known-mid: three r185 benchmark frames at 4.5-7.
   - Known-good: v2 reference scenes plus the premium-indie stills from `tests/reports/_visual-critic-refs/`, moved
     into tracked `benchmarks/quality-rebuild/refs/` with licence records.
   - Broken controls: an IBL-off, shadow-off, DPR-0.5 or AA-off variant of a known-good frame must score ≥ 2 points
     below its source.
   - A judge whose calibration scores drift > 1.0 from the panel's frozen baseline is replaced for that round.
5. **No amendment mid-round.** Thresholds are frozen per round, and changing them requires a new PRD revision. The
   1.0 era amended the bar 25 times in 13 failing rounds (research/01 row 3).
6. **Admitted loss fails.** If any judge's prose or a harness verdict string records a visible loss, the item cannot
   pass (research/14 §7.7).

---

## Performance tiers

Nothing in the repo measures tier cost today. `AuraPerformanceQuality` is set by one game, budgets are constants,
and no mobile device has ever been tested (research/07 §7; research/18 §2.3). The values below are **targets** for
QR-07. Each target must be replaced by a measured value per tier on a named device before any tier claim.

The CI runner (Apple M1 Virtual, paravirtual Metal GPU, 3 vCPU, 7 GB) sits below Medium. Treat it as the **Low-desktop
proxy**: a Low-tier game must reach ≥ 55 fps there, which Orbital Defense and Vault Breakers already do.

| Setting | Low | Medium (default) | High | Ultra-Cinematic |
|---|---|---|---|---|
| Target hardware | Integrated GPUs (Intel UHD 620 / Iris Xe), mid-range mobile (iPhone 12-class, Snapdragon 7-series), CI runner proxy | Apple M1 / iPhone 14-class, GTX 1650 / RX 6500 | M2 Pro / M3, RTX 3060 / RX 6700 | RTX 4070+ / M3 Max; capture or offline use allowed |
| Frame target | 60 fps desktop, 30 fps floor mobile | 60 fps at 1080p | 60 fps at 1440p | 30-60 fps realtime; any rate for capture |
| DPR cap / resolution | min(dpr, 1.0); dynamic res 0.67-1.0 | min(dpr, 1.5); dynamic 0.75-1.0 | min(dpr, 2.0); dynamic 0.85-1.0 | native dpr; supersample 1.5× for capture |
| AA | MSAA 2× (no FXAA on top) | MSAA 4× or SMAA | TAA + MSAA resolve | TAA with 8× jitter accumulation for capture |
| Environment / IBL | PMREM 128 px cube, SH diffuse | PMREM 256 px | PMREM 512 px + visible HDRI | 1024 px + HDRI background at 2k |
| Shadows | 1 directional, 1 cascade 1024², HW PCF 4-tap; spots unshadowed | 2-3 cascades 2048², PCF 9-tap; 1 spot shadow | 4 cascades 2048², PCSS-lite; 4 local shadows | 4 cascades 4096², PCSS; contact shadows |
| AO | none (baked or contact blobs only) | SSAO half-res, linear depth | GTAO full-res | GTAO + bent normals |
| Bloom / post | 3-mip bloom, no gain, threshold ≥1 HDR; ACES/Neutral | 5-mip bloom; colour grade; vignette | 6-mip + lens dirt option; SSR on flagged surfaces | full pyramid; SSR; DoF; motion blur; 3D LUT |
| Lights (per view) | ≤ 4 dynamic | ≤ 16 clustered | ≤ 64 clustered | ≤ 128 clustered |
| Particles (live) | ≤ 2k CPU billboards | ≤ 10k | ≤ 50k GPU | ≤ 200k GPU, soft + lit |
| Draw calls / visible triangles | ≤ 150 / ≤ 300k | ≤ 400 / ≤ 1.5M | ≤ 1,000 / ≤ 4M | ≤ 2,500 / ≤ 10M |
| Texture max / VRAM | 1024, KTX2 ETC1S / ≤ 256 MB | 2048, KTX2 UASTC normals / ≤ 768 MB | 2048-4096 / ≤ 1.5 GB | 4096 / ≤ 3 GB |
| CPU frame budget (main thread) | ≤ 8 ms | ≤ 6 ms | ≤ 6 ms | ≤ 10 ms |
| Load (first interactive frame) | ≤ 3 s on 10 Mbps, ≤ 8 MB transfer | ≤ 3 s, ≤ 20 MB | ≤ 4 s, ≤ 40 MB | no limit for capture |

Bundle targets apply to all tiers, measured on the published package:
- Core renderer + builder API ≤ the three r185 equivalent + 20%, gzip. Today root "." is 575,343 B gzip against an
  80,000 B budget that is labelled "informational" (research/13 §9).
- Tier features (CSM, GTAO, TAA, SSR, GPU particles) load as lazy chunks, never as a second API with different
  semantics.

Today's numbers against these budgets (research/20; report.slim.json):
- Courier Rush makes about 1,530 draw calls at title, and Gravity Post 1,230-1,294, both at 5-8 fps. Both are over
  the High budget.
- Gravity Post loads 46.8 MB before ready.
- Aura Clash runs 11-13 fps with about 12.7 MB loaded.

Tier selection must be automatic. A GPU-tier probe picks the starting tier, and a frame-time governor driven by
`RendererTiming` steps resolution first, then AO, then shadows. Apps may pin a tier, but `safe-basic` DPR 1 must not
be the silent default.

---

## Engineering gates are not quality

These gates remain, and each one means only what is listed here:

| Gate | What it means |
|---|---|
| Typecheck, unit tests, packed-tarball template build | The code compiles and behaves as unit-specified, and consumers can install it |
| Route health 200, zero page errors, non-blank canvas | The route is alive |
| `check-deploy`, bundle-size budget | Shipping hygiene |
| Analytic GPU pixel tests (e.g. shadow < plane − 120) and golden-image regression per route on the remote GPU runner | **Regressions** against an already-approved frame. They cannot certify the first frame as good |
| Measured rAF/`RendererTiming` budgets | Performance. Engine self-reported fps is not admissible |

None of these is a quality claim, and none may appear in README, release notes or skills as one. "Visual QA PASS
17/17" passed three routes its own document called washed-out, bloom-blown and empty (research/14 §0.9). That is
exactly the failure being removed. Hand-labelled parity matrices, constant-scored suites and existence-checking
architecture verifiers are deleted rather than kept as gates.

The only release-blocking quality decision is the panel score against the bar above, on the shipped default path.

## Document map

All paths are relative to `docs/project/aura3d-quality-rebuild/`.

Program control
- `CONTRACTS.md`: authoritative. Contracts C-01..C-40, cross-PRD conflict resolutions R1–R22, PR 0 Contract Bootstrap (§3.9), single-writer ownership map (§4), flags (§5), merge protocol (§6), non-blocking integration checkpoints (§7), soft-dependency table (§8).
- `AURA3D-QUALITY-MASTER-PLAN.md`: master plan (path owned by the PRD 15 lane, `CONTRACTS.md:2442`). PR 0 bootstrap scope, lane table (owned paths, contracts, flags, standalone gates), date-anchored Gantt with no lane→lane edges, integration checkpoints IC-0..IC-16, program scoreboard (baseline benchmark Aura 3.6 vs three 5.4; games 1.5-4, mean 3.0), final acceptance = the Quality Bar, parallel-execution risks and CCR process.
- `_sections/parallel-conflict-map.md`: 253 cross-PRD needs and 105 shared files. Input to CONTRACTS.
- `_sections/parallel-readiness-check.md`: final parallel-readiness audit of all 15 PRDs and the master plan (blocking-edge scan, required sections, hot-file single ownership, numeric consistency, no-claim checks), with fixes applied and a per-PRD start-day / owned-paths / contracts table.

PRDs (one lane each, all parallel after PR 0)
- `PRD-01-rendering-core-color-hdr-pbr.md`: program generator, OutputPass/tone map, HDR target, blend modes, scene graph, primitives (C-01, C-02, C-04..C-08).
- `PRD-02-lighting-ibl-reflection-shadows.md`: ambient-additive IBL, GPU PMREM/SH, environment default, shadows/CSM, samplers (C-09..C-12).
- `PRD-03-postprocessing-aa-tonemap-cinematic.md`: HDR post graph, bloom, GTAO, SMAA/TAA, grading, auto-exposure (C-13, C-14).
- `PRD-04-materials-textures-gltf-fidelity.md`: spec-correct lobes, texture-preserving overrides, glTF fidelity (C-03, C-15).
- `PRD-05-asset-pipeline-technical-art-toolchain.md`: optimize, admission gates, KTX2/decoders, HDRI library, kits (C-16, C-17).
- `PRD-06-animation-characters-skinning-ik.md`: deformation resources, playback authority, IK (C-18, C-19).
- `PRD-07-vfx-particles-atmospherics.md`: particle pass, `app.effects`, sky/fog/atmosphere (C-20, C-21).
- `PRD-08-camera-controls-game-feel.md`: camera rigs, time controller, feel bus, touch primitives (C-22, C-23).
- `PRD-09-shared-game-runtime-route-extraction.md`: game shell/session/HUD/capture context, game audio (C-24, C-25).
- `PRD-10-world-building-environment-systems.md`: terrain, scatter, water, biomes, world queries (C-26).
- `PRD-11-webgpu-gpu-architecture-performance-tiers.md`: quality tiers, device caps/counters, renderer factory, WebGPU (C-27..C-29).
- `PRD-12-visual-benchmark-regression-infrastructure.md`: benchmark registry, diagnostics schema, rubric, capture harness, G-PANEL (C-30..C-33).
- `PRD-13-agent-authoring-skills-templates-defaults.md`: looks, lookLint, prompt plan v2, templates, skills (C-34, C-40).
- `PRD-14-eighteen-game-rebuild-program.md`: art-direction contracts and the 18-game rebuild (C-35).
- `PRD-15-api-package-architecture-consolidation.md`: scene compiler, runtime nodes, app/CLI registries, single renderer, PR 0 owner (C-36..C-39).

Research (inputs to this autopsy)
- `research/01-history-chronology.md`: release history; feature count rose while pixels stayed flat.
- `research/02-render-core-frame-trace.md`: one frame traced from public API to GPU.
- `research/03-pbr-materials-gltf.md`: BRDF, extension lobes, glTF material handling.
- `research/04-lighting-ibl-shadows.md`: environment, PMREM, shadow pipeline.
- `research/05-postfx-aa-tonemap-color.md`: post chain, AA, tone mapping, colour.
- `research/06-engine-defaults.md`: default constants and profiles.
- `research/07-webgpu-gpu-perf.md`: WebGPU backend, draw submission, performance.
- `research/08-vfx-atmos-environments.md`: particles, fog, sky, environments.
- `research/09-animation-characters.md`: animation controllers, skinning, morphs.
- `research/10-camera-controls-gameruntime.md`: camera, input, game runtime.
- `research/11-asset-pipeline.md`: asset corpus, admission, bytes.
- `research/12-agent-authoring.md`: skills, templates, prompt plans.
- `research/13-package-architecture.md`: renderer sprawl, monolith, exports.
- `research/14-evidence-fake-parity.md`: fabricated and self-referential parity evidence.
- `research/15-threejs-comparison-infra.md`: three.js comparison harnesses.
- `research/16-route-local-extraction.md`: route-local duplication and capture forks.
- `research/17-games-g1.md`: per-game code review, group 1.
- `research/17-games-g2.md`: per-game code review, group 2.
- `research/17-games-g3.md`: per-game code review, group 3.
- `research/17-games-g4.md`: per-game code review, group 4.
- `research/17-games-g5.md`: per-game code review, group 5.
- `research/18-completeness-critic.md`: gaps in research 01–17.
- `research/19-claim-verification.md`: 2-skeptic adversarial verification of 19 claims (authoritative corrections).
- `research/20-game-scorecards-code-pixelstats.md`: code + pixel-stat game scores (non-visual categories retained).
- `research/21-game-vision-judgment.md`: **authoritative** vision judgment of the 18 games.
- `research/22-benchmark-pass1-code-metrics.md`: benchmark pass 1 (harness fairness verified; visual scores superseded).
- `research/23-benchmark-vision-judgment.md`: **authoritative** vision judgment of the 18 same-scene benchmarks.

Evidence
- `evidence/`: frames from run 37289688772. `evidence/games/` holds the 18 games' desktop and mobile captures plus `report.slim.json` fps. `evidence/benchmark/` holds the 18 side-by-side JPEGs and `report.json` metrics.
