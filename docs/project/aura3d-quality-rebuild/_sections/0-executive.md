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
