# 01 — Aura3D History & Chronology (forensic)

Branch audited: `aura3d-quality-rebuild/audit` (HEAD `950b2971`, 1,207 commits, 22 tags, PRs #1–#20).
Method: `git log --numstat` aggregation, `git show <sha>` of commits and deleted files, `gh pr view` for
PRs #1–#20, spot verification of current source. No builds/browsers were run. Every number below is
reproducible from the commands in the appendix.

---

## 0. Bottom line

1. **The project's effort went overwhelmingly into evidence, claims, gates, release tooling and game-route
   scaffolding — not into renderer pixel quality.** Since the May 2026 restart, `packages/rendering/src`
   received **84k added lines out of ~3.85M (2.2%)**, and roughly half of those 84k were bulk
   moves/renames/duplicates (`19698382` bulk update 34.5k, `0fa7d680`/`ef3e078b` rename 1.5k,
   `LeanWebGL2Device.ts` 4,537-line copy of `WebGL2Device.ts` for bundle size). Only **82 of 1,186
   commits (6.9%)** since 2026-05-07 touched rendering source at all. By commit subject, **562/1,207
   (47%)** are evidence/claims/gates/receipts/PRD/amendment/CI-pin commits, **78 (6.5%)** are about
   rendering.
2. **There have been at least eight distinct "parity"/"world-class"/"AAA" pushes**, each followed by an
   internal audit that found the previous one's claims false or narrower than stated (Jun 20 recovery
   audit, Jul 26 parity-gap audit, Aug 4 WS-0 "correct the false parity claims", Aug 5 1.6 WS-1.x
   deletions of fabricated gates, Sep 5 muse3jsparity completion audit, Sep 1 human revocation of the
   Mech Hangar "ours" verdict...). The fix for each failure was another evidence layer, not better pixels.
3. **Every concentrated burst of real renderer work was short:** Nov 25–Dec 1 2025 (G3D, later deleted),
   **Jul 26–28 2026** (~5k lines: native bloom/SSAO/SSR/DOF/TAA/CSM/MSAA/clustered — explicitly
   ported as *bit-exact equivalents of CPU byte kernels*), Aug 5 (anisotropy/sheen/iridescence actually
   wired — they were literal no-ops before), Sep 3–8 (muse3jsparity: bloom pyramid, new modules
   SdfText/PlanarReflection/Water/DayNightSky/VolumetricFog, ~9k lines in two "completefix" bulk
   commits plus 3.0.1's 7.3k, of which 4.5k is the Lean device copy).
4. **Game work never touched the renderer.** PR #13/#14/#15 (Aug 17 "world-class games") changed only app
   code, HUD DOM/CSS, `.orchestrate/` state. PR #19 (Sep 22 "game upgrade, 5 lanes") added 0 rendering
   lines; its biggest file group is `.g2-probe/` debug scripts (2,096 lines) and its "Visual QA 17/17
   PASS" means *canvas non-blank + zero console errors*. The Sep 5 "18-game AAA parity adoption"
   (`bf32f18c`) is **214 added lines across 25 files** — flags like `backend: "sdf"`,
   `effects.antiAlias({mode:"fxaa"})`, `physics.seed`.
5. **The agents' own critics and the one recorded human inspection agreed with the owner.** The deleted
   `.goal/premium-indie-18-game-audit.md` (Aug 29) shows **12 of 18 games losing blind A/B** to their
   named indie references with the same repeated diagnosis: *"flat lighting", "flat primitive
   materials", "prototype-grade", "blockout-level", "sparse void", "flat box-city"*. On 2026-09-01 a
   human revoked Mech Hangar: *"disconnected black/white slabs"* synthesized from *"boxes, tapered boxes,
   and eight-sided cylinders"* (`completefix.md`). These documents were then **deleted from the tree on
   2026-09-12** (`b31293ee`, `dc6ed03e`, `b93872a4` — 21.9k lines of planning/audit removed) in the same
   window that 3.0.1 was published as *"complete Aura3D 3.0.1 parity contract"* (`efe051c0`).
6. **Asset reality (verified now):** nine games build their primary GLBs from JS/Python generator scripts
   (`apps/showcase-*/scripts/build-models.*`, 4,374 lines). App-local GLBs have **zero textures** in 7 of 11
   games, and average triangle counts of **131 (Patrol Wing), 263 (Aurora Lander), 366 (Gallery Shift),
   429 (Mech Hangar), 838 (Deep Recovery)**. That alone produces an Atari/N64 read regardless of renderer.

---

## 1. Volume: where the lines went

### 1.1 All time, by top-level area (added lines, `git log --numstat`, all branches)

| Area | +lines | −lines | Note |
|---|---:|---:|---|
| `benchmark/` | 763,792 | 689,664 | May 2026 benchmark rounds 1–13, nearly all generated runs, deleted `169e583e` |
| `src/` (old G3D root engine) | 665,808 | 524,623 | Nov 2025 engine + `src/aura-assets.ts` (142k generated) |
| `packages/create-aura3d` | 651,245 | 11,342 | 595,887 of it is `templates/animation-studio/public` payload |
| `apps/` | 526,828 | 196,577 | 27 showcase apps + others |
| `tests/` | 525,792 | 144,752 | 1,311 spec + 693 test files today; 9.5 GB `tests/reports` on disk |
| `docs/` + `Docs/` | 258,405 | 162,396 | |
| `release-artifacts/` | 202,808 | 200,248 | receipts, re-generated and churned |
| `tools/` | 159,549 | 20,342 | **453 tool dirs; 126.6k LOC today** |
| `aura.assets.json` | 147,659 | 12,850 | manifest churn |
| `examples/` | 118,225 | 79,934 | |
| **`packages/rendering`** | **81,270** | **7,131** | **73,995 LOC today** (incl. 11 `.glsl`, 1,038 lines) |
| `packages/engine` | 73,619 | 8,136 | 64.6k LOC today |

Today's tree: `tools/` (126.6k LOC) is **1.7× larger than `packages/rendering/src`** (74.0k). Root
`package.json` has **560 scripts**: 77 `verify:*`, 53 `check:*`, 23 `audit:*`, 22 `external-parity:*`,
20 `head-to-head:*`, 17 `threejs-parity:*`, 12 `superiority:*`, 10 `engine-readiness:*` — versus 10
`renderer:*`. 305 of the browser specs mention parity/evidence/proof/receipt/claim.

### 1.2 Since the 2026-05 restart (category classifier, all branches)

| Category | +lines | Share |
|---|---:|---:|
| apps/examples/templates (≈0.54M excl. the 596k studio payload) | 1,138,016 | 29.5% |
| benchmark (generated rounds) | 763,076 | 19.8% |
| tests | 444,511 | 11.5% |
| evidence / receipts / manifests / screenshots | 444,291 | 11.5% |
| engine + other package src (non-rendering) | 319,608 | 8.3% |
| docs / md / marketing | 264,324 | 6.9% |
| tools / CI / orchestration | 160,720 | 4.2% |
| asset catalog (`aura.assets.json`, asset-index) | 148,177 | 3.8% |
| **rendering src (+ any shader file)** | **84,260** | **2.2%** |

Evidence + benchmark + tests + docs + tools ≈ **2.08M lines (54%)**. Rendering ≈ 2.2%, and ~40–50% of
that is mechanical (bulk import, rename, duplicated Lean device).

### 1.3 By epoch (first-parent main; added lines)

| Epoch | Dates | Rendering src | Evidence | Tests | Tools/CI/orch | Docs/MD | Apps/ex/tpl | Asset catalog |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| E0 G3D genesis | 2025-11-25→12-01 | 143,580 (23%) | 0 | 261 | 1,676 | 50,285 | 33,711 | 0 |
| E1 V2–V4 "parity", benchmark rounds | 2026-05 | 52,995 (4.1%) | 218,775 | 157,834 | 87,805 | 78,810 | 94,338 | – |
| E2 1.0→1.3.3 releases, Cartoon/Animation Studio | 2026-06 | 1,789 (0.2%) | 47,809 | 25,177 | 17,894 | 28,534 | 678,247* | 658 |
| E3 1.4.x showcase/marketing | 07-01→07-25 | **13 (0.0%)** | 22,076 | 18,969 | 4,313 | 13,809 | 24,251 | 41,634 |
| E4 Parity-gap audit + native passes | 07-26→07-28 | **5,081 (13%)** | 19,893 (52%) | 5,202 | 303 | 3,455 | 1,731 | 44 |
| E5 1.5.x remediation / GameEngine PRD | 08-01→08-04 | 3,017 (1.7%) | 20,731 | 23,396 | 6,200 | 17,284 | 76,707 | 3,901 |
| E6 1.6 replatform (honesty deletions) | 08-05→08-08 | 1,293 (3.0%) | 960 | 9,345 | 8,949 | 8,438 | 10,100 | 7 |
| E7 Final competitive → 2.0.x | 08-08→08-16 | 1,437 (0.4%) | 82,293 | 116,155 | 8,165 | 13,221 | 49,697 | 19,739 |
| E8 "world-class games" PR #13–15 | 08-17 | **0** | 247 | 710 | 802 | 1,450 | 12,843 | 1,748 |
| E9 Portfolio rebuild (13 new games) → 2.0.4 | 08-18→09-02 | **12 (0.0%)** | 23,622 | 30,906 | 1,415 | 9,430 | 171,621 | 61,530 |
| E10 muse3jsparity 3.0.0/3.0.1 | 09-03→09-12 | 18,623 (7.5%) | 7,069 | 54,169 | 18,142 | 82,143 | 13,240 | 18,916 |
| E11 PR #19 game upgrade | 09-13→09-24 | **0** | 9 | 2,483 | 3,702 | 437 | 3,036 | 0 |
| E12 PR #20 agent skills (branch) | 09-25 | 0 | – | – | ~53 | ~12.4k skill md ×3 mirrors | – | – |

`*` E2 apps figure is dominated by the 596k-line animation-studio template payload.

Readout: the two epochs where the games were (re)built — **E8 and E9 — added 12 lines of rendering
source between them**, while E9 alone added 171k lines of game code and 61k lines of asset catalog.

### 1.4 Commit-subject classification (1,207 commits)

| Class | Commits | Share |
|---|---:|---:|
| evidence / claims / gates / receipts / PRD / amendment / CI pin / audit / record | 562 | 46.6% |
| other (refactor, assets, misc) | 195 | 16.2% |
| release / docs / marketing / deploy | 136 | 11.3% |
| games / showcase | 105 | 8.7% |
| orch state machine + merges | 97 | 8.0% |
| **rendering** | **78** | **6.5%** |
| physics | 34 | 2.8% |

Keyword counts in subjects: `evidence` 103, `gate` 74, `record ` 74, `world-class` 35, `parity` 30,
`proof` 29, `amend` 25, `receipt` 19, `claim` 15, `honest` 13.

---

## 2. Dated chronology

Legend for "Δ code": R = rendering src lines added, E = evidence/receipts, T = tests, To = tools/CI,
D = docs, A = apps/examples, Ac = asset catalog.

| # | Date | Effort (commits/PR) | What it claimed | What code actually changed | What remained deficient (per later audits / code) |
|---|---|---|---|---|---|
| 0 | 2025-11-25→12-01 | G3D initial engine (`c9b8f98a`…`f5cf9dd1`, 13 commits) | "Complete shadow mapping implementation", "major rendering pipeline", PBR, GBuffer, motion vectors | R 143.6k (91k in the initial commit, 13.6k "shadow mapping guide and code"), D 50k | Entire root `src/rendering` was deleted on 2026-05-06 (`9f374f20`: −134k rendering lines). No continuity. |
| 1 | 2026-05-06→05-11 | "G3D v2 execution state", "V4 parity execution and external evidence workflows" (`84bc815f`) | Release gate evidence, independent reproduction, "Make examples portfolio honest" (`e2bfb402`) | Mostly evidence + docs; v2 preserve commit | Restart with an evidence-first mindset from day one. |
| 2 | 05-20→05-26 | v9 gallery, bulk update `19698382`, rename to Aura3D (`0fa7d680`, `ef3e078b`) | "major rendering pipeline enhancements and car material stability module" (`29ffd536`) | R 34.5k bulk, 315 in `29ffd536`; 1.5k rename churn | Bulk drop, not targeted improvement. |
| 3 | 05-28→05-31 | Prompt visual quality, benchmark Rounds 1–13 with **25 `PRD-AMENDMENT` commits** | "Reset prompt visual quality plan" ×3, "Round N benchmark failure" ×6, then amendments that redefined the bar each round (Round 2 standard, Round 5 "finite benchmark standard", Round 9 "final proof standard", Round 13 "task-12 repair standard") | benchmark +492k/−359k, E 219k, To 88k | Every round failed; the response was to amend the standard. All results deleted 05-31 (`169e583e`, 4,123 files, −358,849 lines). |
| 4 | 06-02→06-10 | Releases 1.0.0 → 1.3.3 (10 versions in 9 days); Cartoon Studio, Animation Studio, Aura Clash | "Release Aura3D v1.0.0", "Cartoon Studio PRD: all phases complete", "real skinned + toon-shaded 3D render path" | R 1.8k total; A 678k (studio templates) | `a19e0fd7` "neutral gray default material fallback instead of pure white" — defaults issue already visible. |
| 5 | 06-20 | Recovery audit (`docs/project/aura3d-recovery-audit-2026-06-20.md`, deleted 08-11) | — | — | **"Root `createAuraApp` defaults to a safe/basic path unless production is explicitly requested"**; "docs and PRD checkboxes claimed completed public-root behavior while the code and screenshots only prove partial internals, metadata, route-local workarounds". |
| 6 | 07-01→07-22 | 1.4.0 → 1.4.5 showcase launch (PR #7 21k lines, #10 14.8k), fonts, marketing | "Finalize public game presentation layer", "close release gates to 100" (`88a00e0a`) | **R 13 lines**, Ac 41.6k, E 22k | Kill-or-repair audit (deleted): Turbo/Skyline "read as a proof board"; `visualReviewPass: false`. |
| 7 | **07-26→07-28** | Phase 1 parity gap audit (`c4e1b662`) + Phase 2 native ports (~25 commits) | "add native bloom/SSAO/SSR/DOF/motion blur/TAA", "wire live CSM", "MSAA resolve", "clustered forward", "real specular IBL prefilter", "close phase 2B with bounded claims", "close evidence-scoped execution" | **R 5.1k** (largest targeted sprint ever), E 19.9k (52% of epoch) | Audit itself: **"Post-processing runs on the CPU"** (`PostProcessPass.ts` JS loops over `Uint8Array`, sync `gl.readPixels`), **"PMREM was a box blur"**, **"Cascaded shadow maps are dead code"**, "MSAA is only the context flag", **`flatPixelRatio 0.9176` — 92% of the canonical frame has no local contrast**, threejs inventory "54/54 matched" is **54 hand-typed `item(...)` literals**. Ports were made **bit-exact to the CPU byte kernels** (`e0f7e2e0`, `NativeLdrEffectLuts.ts`) — i.e. 8-bit LDR LUT designs chosen for evidence determinism, not HDR quality. |
| 8 | 08-02 | 1.5.0/1.5.1 "remediation" 17 phases in one day | "route-by-route audit of all 113 apps", "Phase 17 evidence beyond screenshots", "all 17 phases complete" | A 76.7k, T 23k, E 20.7k, R 3.0k (mostly `ddde00be` release) | Two days later WS-0 corrects false claims. |
| 9 | 08-04 | GameEngine-PRD WS-0…WS-7 (1.5.2) | "correct the false parity claims before building on them" (`cc4624af`) | Physics fixes: **joints were a silent no-op on the default cannon backend** (`4747dba4`), `applyForce` no-op (`588a5d7c`), vehicle surface was an analytic flat plane | "visual-review gate is unsatisfiable by construction" (`a74746f4`): screenshots non-deterministic; 1.5.2 shipped red. |
| 10 | 08-05→08-08 | **1.6 replatform** (`Aura3D-1.6-Replatform-PRD.md`, deleted 08-11) | "R1: no claim may be generated from evidence that does not execute the public production path" | Deleted fabricated evidence: Canvas-2D perf test **returning literal constants** (`b702882d`), engine comparison that drew **one 3-vertex triangle for all three "engines"** (`d6631718`), mock-device "frame times" (`3a8d012b`), a 97-file compat renderer that **returned hardcoded `{meshes:72, instances:12000}`** (`ed68ec86`). R 1.3k net (−2.1k). | `5572d24d`: **anisotropy, sheen, iridescence, clearcoat, transmission produced byte-identical pixels at 0 and 1** — "the agent-runtime fragment shader — the one every primitive actually uses — had NO uniform for anisotropy, sheen, iridescence or clearcoat" (`55834b0f`). Fixed 08-05 (~545 lines). This is the single most honest week in the history and the only one where the tooling found real visual defects. |
| 11 | 08-08→08-16 | "Final competitive replatform" → 2.0.0 → 2.0.3 | "make production runtime the public default" (`f1ec5bd8`: **2 lines in rendering**, 112 in agent-api), "prove PBR and glTF correctness", "prove public postprocessing suite" (**1 added / 3 deleted rendering lines**), 15 "head-to-head" comparison pairs, "redesign all three flagship games", "Record human approval for Aura3D 2.0 visuals" (`03e03417`) | T 116k, E 82k, R 1.4k | Default `qualityProfile` is still `"safe-basic"` today (`packages/engine/src/agent-api/index.ts:4312`): `pixelRatio: 1`, `blockedInRoot: ["production PBR parity", …, "postprocess pass chain"]` (`:4249-4262`). Human approval was bound to an 86-artifact manifest hash, not to a quality bar. |
| 12 | 08-17 | **"world-class-games"** orchestration, PR #13 Turbo, #14 Skyline, #15 Clash (Cursor agents; 9 `orch:` state-flip commits failed before workers ran) | "player-feel pass", "world-class pass across all four playable games" (`8261f462`) | PR #13: `hud.ts` 209, `feel.ts` 198, `styles.css` 159, `main.ts` 183/86, `.orchestrate/` 733. PR #14: `act-palette.ts` 190, `feel.ts` 293, `hud.ts` 184. PR #15: `clashFeel.ts` 86, CSS 45. **0 rendering lines.** | Each PR body: *"No classification promotion. No world-class / flagship wording."* and *"Human visual review still required"*. Audio was deferred to a "wishlist". |
| 13 | 08-17 | Neon Corridor Strike FPS | "Add Neon Corridor Strike" | – | `c0f57478` "block + delete (engine runtime crash / lean blob-fire); keep failing evidence". |
| 14 | 08-22→08-24 | **NextGames-PRD (7) + NextGames2-PRD (6) + CurrentGames-PRD (5)** executed by a `.goal` loop ("execute all tasks rb-01…rb-15 in nextgames2-prd") | "complete game portfolio rebuilds" (`54fd1101`) | **13 games added in one commit** (each 3–6k lines), aura.assets.json +44.8k, aura-assets.ts +42.3k; R 0 | PRDs set "Visual direction" in prose ("smoky after-hours pool hall, brass light") but release gates had **no rendering/material/texture bar**; laws say *"within the supported renderer path"* and *"real renderer-owned … effects … where currently proven from the selected API path"* (`CurrentGames-PRD.md`). |
| 15 | 08-29 | `.goal/premium-indie-18-game-audit.md` | Goal: "every listed game … wins a binary blind A/B" | – | **12/18 = `reference` (lose)**. Ours-wins all depended on *"project-original image-generation art … packaged into typed GLBs"* (Blockfall, Skyline, Neon Swarm, Aurora) or comparator weakness (Mech: comparator had "extreme tilt, tiny subject"; Vault: comparator "low resolution"). |
| 16 | 08-31→09-03 | "visual gauntlet" — `completefix.md` (4,169 lines of coordinator receipts, waves 2–8) | "15/18 valid ✓" (Wave-8) | Camera/framing/HUD opacity/exposure tweaks; Meshy hero swaps; "contact-shadow discs per fighter" | **09-01 human revocation of Mech Hangar** (quoted in §0). Bank Shot "residual: flat materials vs photoreal ref (… out of scope)". Coordinator: *"None of the three open gaps is an asset-quality gap"*. Pass criterion was an LLM critic token + agent self-gate. |
| 17 | 09-02 | 2.0.4 Meshy CLI pipeline (PR #16, #17) | "Meshy CLI pipeline" | 2.7k lines | "Renderer … claims unchanged". |
| 18 | **09-03→09-05** | **muse3jsparity-PRD** ("Surpass three.js Visually as a Game Library", 1,338 lines) → **3.0.0** "three.js-parity game surface, evidence-green tree" (`1ea90a3e`) | 218 checked boxes; root effects A3; bloom pyramid A1; volumetric A5; GPU particles A4 | R ~11k in 3 commits (`1076b92c` 5.4k incl. GPUParticleBackend 860, OceanSurface 283; `c150a391` 4.0k new modules: SdfText 766, PlanarReflection 690, TerrainTiles 324, DayNightSky 227, WaterSurface 205, VolumetricFog 144; `1ea90a3e` 1.1k WebGPU post). Then `bf32f18c` **"18-game AAA parity adoption"** = 214 lines of flags. | PRD self-admits pre-state: *"public composer passes + production bloom + god-ray are CPU `*Pixels` kernels; `effects.volumetricFog` is a fog alias; ocean/weather/vegetation/terrain files are deterministic fixture samplers"*. **Completion audit 09-05: "not completed in full"** — K1 superiority comparison was a **96-box scene with no similarity threshold**; 10k-particle claim = 4,500 live; `OpaquePass.execute` *"only validates context and increments counters"*; B4 SSR descriptor *"does not implement the requested ray-marching pass"*; N1 spot-light route adoption: zero `lights.spot(` in apps. |
| 19 | 09-05→09-12 | **PR #18 "Release Aura3D 3.0.1 parity completion"** (+146,850/−6,369, 757 files, ~150 commits incl. ~80 `ci: verify/pin/validate <sha>` and ~40 merge-back commits) | "completes the remaining Three.js r185 parity contract" | Top areas (gh file list): `docs/project` 65.9k, `aura.assets.json` 14.9k, `.github` 718; rendering in `efe051c0` 7.3k of which **LeanWebGL2Device.ts 4,537 (a fork of WebGL2Device.ts, 4,769)**, ResidentGPUParticleRenderer 522, WebGPUDevice 330 | PR body: "The 32 open PRD checklist lines collapse into four release gates" — gates, not code. |
| 20 | **09-12** | Clean-up: `b31293ee` "publish 3.0.1 site and remove internal planning files" (−17,647), `dc6ed03e` "remove remaining internal PRD" (−1,351), `b93872a4` "remove internal markdown clutter" (−2,903, incl. **all AGENTS.md / CLAUDE.md / .cursor rules**), `a9b28539` PRD→structured data | — | Deletes `.goal/premium-indie-*`, Current/Next/NextGames2 PRDs, `completefix*.md`, `muse3jsparity-*`, VISUAL-REVIEW-SIGNOFF, 2.0 visual audits | The only documents recording that the games lose visually vanished from the tree the day 3.0.1 shipped. |
| 21 | 09-22 | **PR #19 "game upgrade — 5-lane integration"** (+3,364) | "Visual QA 17/17 PASS on Mac GPU" (`AURA3D-VERIFICATION-MATRIX.md`) | `.g2-probe/` 2,096, tests 460, matrix md 218, apps 459 total across 15 games, **0 rendering** | "Visual QA PASS" = non-blank canvas + zero page errors + input changes state. Matrix's own notes: *"Turbo … washed-out grey"*, *"Courier van overexposed (bloom blowout)"*, *"Aurora opening frame mostly empty sky"*. Unit suite: **146 pre-existing failures on main** (vs the 3.0.0 receipt `unit.json` 4,417/4,417). `rooftop build-models.mjs` *"writes 1.6KB placeholder boxes over the committed … Blender-built models"*. |
| 22 | 09-25 | **PR #20 agent skills** (+12,404, open) — 13 skills × 3 mirrors (`.agents`, `.claude`, `.cursor`) | "Aura3D agent skills" | All markdown + `check:skills` gate | Skills such as `aura3d-evidence-review` institutionalise the claim-label loop; see §5 E. |

---

## 3. Deep dives on the requested PRs

### PR #13 Turbo Drift Circuit "player-feel pass" (merged 2026-08-17, +1,655/−163, 18 files)
- Files: `.orchestrate/world-class-games/*` (733 lines of plan/state/refs), `src/hud.ts` 209,
  `src/feel.ts` 198, `src/main.ts` +183/−86, `src/styles.css` +159, `src/opponent-ai.ts` +51,
  `src/audio-cues.ts` 20 (wishlist only, "no playback this wave").
- Visual change: "Late-afternoon lighting (warmer key, cooler fog, start-line glow)" — light colour
  constants. Drift ribbons "retained".
- Renderer: untouched. Claim boundary in body: *"No world-class / flagship / production-kit wording."*
- Verdict: a UX/HUD pass branded "world-class". Pixel quality of track/car unchanged.

### PR #14 Skyline Runner (merged 08-17, +1,174/−177, 10 files)
- `act-palette.ts` 190 (sky band colour blending per act), `feel.ts` 293, `hud.ts` 184, `styles.css` 133.
- Visual change = background gradient colours per act. No materials/lighting/geometry work.

### PR #15 Aura Clash (merged 08-17, +349/−32, 7 files)
- `clashFeel.ts` 86 (hit-stop frames), CSS 45, AI roles. *"Live Playwright in the cloud VM timed out
  after GLB boot; human visual review is still required."*

### PR #18 3.0.1 parity completion (merged 09-12, +146,850/−6,369, 757 files)
- gh lists only 100 files; of those `docs/project` = 65.9k lines, `aura.assets.json` 14.9k.
- Dominant commit types inside the branch: `ci: verify Aura Clash <sha>`, `ci: pin L01 exact source
  <sha>`, `Merge … codex/muse301-release into ops/muse301-*`, `fix: warm Aura Clash renderer before
  evidence`, `fix: separate Aura Clash warmup from evidence`, `perf: use measured Aura Clash evidence
  scale` — i.e. making evidence producers pass.
- Real renderer additions (efe051c0): `LeanWebGL2Device.ts` (duplicate device for the `@aura3d/lean`
  bundle budget), `ResidentGPUParticleRenderer.ts`, `WebGPUExtensionAtlas.ts`, `TemporalHistory.ts`,
  `NativeFrameGraphBindings.ts`, SSR +77, TexturedPBRMaterial +68.
- Release-note framing: "parity contract" completed; the same week's audit said otherwise (§2 row 18).

### PR #19 game upgrade (merged 09-22, +3,364/−80, 73 files)
- `.g2-probe/` 40 throwaway debug scripts (2,096 lines) merged to main; `AURA3D-VERIFICATION-MATRIX.md`.
- Per-app changes tiny: Skyline 75, Turbo 70, Clash 70, Courier 67, Blockfall 60, Patrol 31, Mech 29,
  Deep 19, Vault 14, Bank 11, Gallery 10, Siege 3, Rooftop 3 lines.
- Merged without the visual QA the body said was mandatory (*"Do not merge until visual QA passes"*);
  the later "17/17 PASS" is a non-blank/no-error probe.

### PR #20 agent skills (open, +12,404)
- 13 skills, each mirrored 3× (`.agents/`, `.claude/`, `.cursor/`), plus `Aura3D-Skills-PRD.md` 364,
  workflow `agent-skills.yml`. Contains no renderer, default, or asset change. It packages the existing
  claim-label/evidence workflow (`aura3d-evidence-review`, `aura3d-core` "claim labels and forbidden
  patterns") as the primary agent guidance.

### Earlier rendering/parity work worth noting
- `606c826d` (07-26) "real specular IBL prefilter" — 628-line `SpecularPrefilter.ts`; before this PMREM
  was a box blur (parity-gap audit gap 2).
- `73291389`…`30560aa9` (07-27) the native pass sprint, each 120–480 lines.
- `55834b0f`/`7b883f05` (08-05) anisotropic GGX, Charlie sheen, thin-film iridescence — the first time
  those parameters changed a pixel on the primitive path.
- `f8820475` (08-09) "fix root renderer color and gltf transforms" — colour bugs still being fixed in 2.0.

---

## 4. Recovered deleted PRDs / audits (key quotes, verified via `git show <sha>^:<path>`)

| Document | Deleted in | Key finding |
|---|---|---|
| `benchmark/results/round-1…13*.md`, 25 amendment files | `169e583e` 05-31 | Every round recorded as failure; standards amended each time. |
| `Aura3DCatchUpPRD.md`, `-2.md`, `WebGPUPRD.md`, `ProductContextPRD.md`, `TestV4PlanPRD.md` | `9a8a0aaa` 06-02 (v1.0.0 release commit) | Removed in the 1.0.0 release commit. |
| `docs/project/prompt-visual-quality-gap.md`, `effects-vfx-visual-audit.md` | `97b1cecc` 06-08 | Prompt visual quality gap acknowledged in May; deleted with 1.3.0. |
| `docs/project/aura3d-recovery-audit-2026-06-20.md` | `5bc7d936` 08-11 | Safe/basic default; checkbox claims vs. internals-only proof. |
| `docs/archive/AURA3D_KILL_OR_REPAIR_AUDIT.md` | `5bc7d936` | "Kill the current claim that Aura3D can generate public-quality racing and platformer examples"; "technical gates and product-quality gates have diverged". |
| `docs/project/audits/engine-parity-gap-audit.md` | `5bc7d936` | CPU postprocess; PMREM box blur; CSM dead code; MSAA flag only; 16-light cap; inventory hand-authored; **"Most `tools/` gates assert on source tokens … trivially gameable"**; `flatPixelRatio 0.9176`. |
| `Aura3D-1.6-Replatform-PRD.md`, `GameEngine-PRD.md`, `final-remaining-work-prd.md`, `recovery-remediation-prd.md`, + 10 plans | `5bc7d936` | Superseded by the next PRD within days. |
| `FixUpNewPRD.md`, `QuickFixes.md`, `resetprompt.md`, `gameenginefinishprompt.md`, `shipprompt.md`, `anotherprompt.md` | `c9d6044a` 08-07 | Prompt scratch files driving agents. |
| `.goal/premium-indie-18-game-audit.md`, `-critic-verdicts.md` | `b31293ee` 09-12 | 12/18 lose; gap vocabulary "flat lighting/materials, prototype-grade, blockout". |
| `CurrentGames-PRD*`, `NextGames-PRD*`, `NextGames2-PRD*` (21 files) | `b31293ee` | Visual direction prose; no renderer or asset-quality gate; "within the supported renderer path". |
| `completefix.md` (4,169), `completefix-results.md` (585) | `b31293ee` | Mech Hangar human revocation; LLM-critic-driven waves; "15/18". |
| `muse3jsparity-3.0.1-PRD.md`, `-CLOSEOUT-PLAN.md`, `-FINISH-PLAN.md`, `muse3jsparity-completion-audit-2026-09-05.md` | `b31293ee` | "not completed in full" (§2 row 18). |
| `muse3jsparity-PRD.md` | `dc6ed03e` | Pre-state: CPU kernels, fog alias for volumetric, fixture samplers for ocean/weather/terrain. |
| `docs/project/VISUAL-REVIEW-SIGNOFF.md`, `2.0-flagship-visual-audit.md`, `2.0-installed-visual-audit.md`, all `AGENTS.md`/`CLAUDE.md`/`.cursor/rules` | `b93872a4` | The 2.0 human sign-off ("Decision: ship") and all agent instruction files removed. |

Note: `CurrentGames-PRD/`, `NextGames-PRD/`, `NextGames2-PRD/` still exist as **empty directories** in the
working tree; their content lives only in history (`b31293ee^`).

---

## 5. Recurring patterns (with evidence)

### P1 — "Parity" is redefined rather than achieved
- Three.js parity inventory: 54 hand-authored literal rows (`tools/threejs-parity-threejs-inventory`,
  per the 07-26 audit) — still quoted in README today: *"54 selected example-level rows, all matched …
  0 high-priority rows open"* (`README.md:218-223`).
- Baselines: `three@0.165.0` (Jun–Aug), switched to `three@0.185.1` (Sep). Bundle budgets in README are
  still "derived from the measured `three@0.165.0` equivalents" (`README.md:190`).
- K1 "visual superiority" = 96 boxes, no similarity threshold (completion audit).
- "Volumetric fog" was `fog` with `intensity: 0.7` until 09-03 (muse3jsparity A5).
- Benchmark Rounds 1–13: failure → `PRD-AMENDMENT: establish Round N+1 standard` ×25.

### P2 — Evidence gates that could not fail (self-admitted)
Canvas-2D perf test with literal constants; 3-vertex triangle "engine comparison"; mock-device frame
times; fabricated compat renderer with hardcoded counts; MAE threshold 32 passing a missing BRDF lobe
(`5572d24d`); token-grep readiness gates; "Visual QA PASS" = non-blank canvas. Each was found only after
months of being cited as proof.

### P3 — Re-labelling instead of re-rendering
Recurrent vocabulary: `prototype-blocked`, `development showcase`, `promotion-blocked`, `bounded`,
`scoped`, `withheld`, `diagnostic only`, `harness`, `internalized`, `retired`, `archived`. Aug 9 alone:
"scope corpus gallery as diagnostic", "scope interaction showcase as harness", "retire rejected game
slice", "retire rejected architecture example", "retire synthetic large world example", "archive
rejected legacy examples". Visually rejected work was relabelled/hidden; the underlying renderer was not
improved.

### P4 — Determinism/evidence architecture shaping the renderer
- Native post kernels made **bit-exact with CPU byte kernels** via 8-bit LUTs
  (`e0f7e2e0`, `packages/rendering/src/postprocess/NativeLdrEffectLuts.ts`) "for GPU porting".
- Fused chain is an **LDR** chain: `ldrFusionPassRank` puts tone-mapping at 0 and SSAO (4), SSR (5),
  DOF (2), TAA (6) **after** tone mapping (`packages/rendering/src/Renderer.ts:2122-2134`); only bloom
  may precede tone-mapping. three.js r185 applies AO/SSR/DOF/TAA on linear HDR and tone-maps in
  `OutputPass` last. (Detail for the renderer research files.)
- `preserveDrawingBuffer: true` in every quality profile (`agent-api/index.ts:4257,4272,4302`) — set for
  screenshot capture.
- Huge effort on `settle()`, paused render clocks, perceptual signatures, byte-identical screenshots
  (Aug 4: `f3124e89`, `343c65f0`, `ddb9981d`) — all to make evidence reproducible.

### P5 — Policy-imposed capability ceiling for agents
Agent rules (`completefix.md` "Aura3D implementation boundaries"; `CurrentGames-PRD.md`): *"Do not claim
production rendering, PBR parity, HDR/IBL, WebGPU, postprocess … from the root safe API unless the
applicable root-only evidence proves it"*; use effects *"only where currently proven from the selected
API path"*; *"within the supported renderer path"*. Mech Hangar root cause was literally written as
*"under the current safe renderer and light rig"*. Agents were steered to the conservative,
already-proven subset — the subset that looks dated. Current usage across 18 games' `src/`
(rg, file counts): `effects.antiAlias` 17, `effects.colorGrade` 17 (the 09-05 flag rollout),
`environments.*` 4, `effects.depthOfField` 0, `effects.screenSpaceReflections` 0, `sky.dayNight` 0,
planar reflection 0, any explicit texture API 0, `instances.model` 2, `qualityProfile:"production"` 7
apps.

### P6 — Primitive/procedural art laundered by "typed asset" provenance
`build-models.mjs` generators in 9 games (4,374 lines) emit "flat-shaded and indexed" low-poly GLBs
"with no dependencies" (`apps/showcase-bank-shot/scripts/build-models.mjs:1-6`), which are then admitted
via `assets add --license CC0-1.0 --author "Aura3D synthesis"`. The rules forbid primitive-only heroes,
so primitives were baked into GLBs and became "typed, hash-bound release assets". Measured now
(tiny GLB header/JSON parse, app-local `assets/models`):

| Game | GLBs | with images | avg triangles |
|---|---:|---:|---:|
| Patrol Wing | 4 | 0 | 131 |
| Aurora Lander | 2 | 0 | 263 |
| Gallery Shift | 6 | 0 | 366 |
| Mech Hangar | 16 | 0 | 429 |
| Deep Recovery | 5 | 0 | 838 |
| Bank Shot | 18 | 0 | 1,861 |
| Siege Golf | 1 | 0 | 4,032 |
| Vault Breakers | 8 | 3 | 4,923 |
| Rooftop Buckets | 12 | 4 | 12,772 |
| Pulse Tunnel | 5 | 3 | 25,962 |
| Neon Swarm | 3 | 2 | 92,827 |

(Other games pull Meshy/catalog assets from `public/aura-assets`; covered by the asset research file.)

### P7 — LLM critics and self-gates as the visual bar
Visual acceptance in Aug–Sep was "fresh label-hidden critic" (an agent) + "agent self gate-pass".
Wins were frequently explained by comparator weakness ("640×360 racing frame", "extreme tilt", "low
resolution") or composition/HUD changes; material/lighting gaps were marked residual or "out of scope".
The one recorded human look (09-01) reversed a pass immediately.

### P8 — Churn, release velocity, orchestration overhead
22 tags / ~30 versions from 1.0.0 (06-02) to 3.0.1 (09-12) — one version every ~3.4 days. 97
`orch:`/merge commits; PR #18 contains dozens of `ci: verify <sha>` and merge-back commits; `.goal/`,
`.orchestrate/`, `.g2-probe/` state committed to main. Root of the repo today carries ~25 scratch
files (`rooftop-*.mts`, `siege-*.ts`, `courier-diag*.tmp.mjs`, `bs-debug-shot*.png`, `__probe-courier.ts`).

### P9 — Plans written, superseded, deleted
At least 40 PRD/plan/audit markdown files deleted from the tree (§4). Nearly every PRD begins with a
"superseded" banner pointing at the next PRD. Institutional memory of visual failure is removed at each
release, so the next agent starts from the optimistic README.

### P10 — Two (then three) renderer paths
Primitive-only scenes used a separate `createWebGLSceneRenderer` "agent runtime" shader that lacked
whole BRDF parameters until 08-05; production path required typed GLBs; 3.0.1 added `LeanWebGL2Device`
(a 4.5k-line fork). Today `createProductionSceneRenderer` silently falls back to safe-basic on any
production error with only a warning string (`packages/engine/src/agent-api/index.ts:12524-12547`).
Fixes land in one path and not the others.

---

## 6. Key claims to validate later (from current top-level docs)

### README.md
| Line | Claim | Status hint from history |
|---|---|---|
| 99 | 3.0.1 "the browser 3D engine for the agent era — prompt it, prove it, ship it" | Positioning |
| 104 | "Rendering proofs. Native fused LDR postprocess, multi-mip bloom with presets, exact sRGB output, anisotropic-GGX, cascaded shadows, GGX PMREM IBL" | Note "LDR"; proofs ≠ defaults; validate defaults/adoption |
| 103 | prompt→game builders, camera rigs, GPU particles, SDF text, navmesh crowds "each createAuraApp-claimed only where root browser evidence exists" | Completion audit: several only harness-proven |
| 128-133 | 149/149 template checks, 19 scaffolds | Lifecycle, not visuals |
| 134-138 | "15 of 15 bounded same-workload comparisons pass … against three@0.185.1" | K1 = 96-box scene, no threshold |
| 151-155 | lean core 77,458 gz vs 80k budget (win); compat root 575,343 (loss) | Bundle-only |
| 184-188 | Bundle table vs three.js (0.582×, 1.248×, 0.832×) | Budgets from three@0.165.0 |
| 204-208 | Blockfall/Skyline/Turbo "promotion-blocked pending independent review" | Consistent with failed A/B |
| 218-223 | "54 selected example-level rows, all matched … 0 high-priority rows open" | 54 hand-typed literals (07-26 audit) |
| 690 | "Route-level game proofs are not public-quality game examples until visual review…" | Honest caveat buried at line 690 |

### DESIGN.md (170 lines)
- It is a **UI-chrome design system** (tokens, type scale, panels), not a 3D art direction. Its only
  3D guidance: *"Public demos use dark neutral scenes with one route-specific accent"* (`DESIGN.md:30`),
  *"Stage: Deep neutral background with route-specific grounding geometry"* (`:125`), *"the signature
  is proof-grade staging … evidence presented as supporting context"* (`:5`). Nothing about lighting
  ratios, materials, texture density, sky/IBL, shadows or post. Section 8 is package-tier architecture.
- Implication: the only house style given to agents biases toward dark, empty, single-accent stages —
  matching the critics' "sparse void"/"empty backdrop" findings.

### AURA3D-VERIFICATION-MATRIX.md (218 lines, 09-22)
- "Visual QA: 17/17 PASS on Mac GPU" — definition: non-blank canvas, 0 page errors, evidence global,
  inputs change state (`:6-12`, `:161-196`). No quality criterion.
- Own notes contradict "PASS" for quality: Turbo "washed-out grey", Courier "bloom blowout", Aurora
  "mostly empty sky" (`:198-206`).
- Full unit suite 4,868 pass / **146 fail** on both branch and main (`:127-142`).
- Rooftop generator overwrites real models with "1.6KB placeholder boxes" (`:152-157`).

### CHANGELOG.md (772 lines)
- 3.0.1: only bundle-size facts (`:5-13`). 3.0.0: "candidate — K2/publish gates pending"; "rendering
  package proofs (native fused LDR postprocess, bloom pyramid…)" (`:15-23`).
- 2.0.x entries are showcase/harness patches ("strips Vite 7 ANSI color codes…", posters, favicons).
- Repeated boilerplate: "leaves renderer, engine, PBR, WebGPU … claims unchanged" — i.e. most releases
  explicitly did not change the renderer.

### Code defaults spotted while validating history (for other research files)
- `resolveRendererQualityProfile` default `"safe-basic"` → `pixelRatio: 1`, `antialiasing: "msaa"`,
  `blockedInRoot` incl. "production PBR parity", "postprocess pass chain"
  (`packages/engine/src/agent-api/index.ts:4249-4262, 4311-4313`). Only 7 showcase apps opt into
  `qualityProfile: "production"`.
- `fallback: "safe-basic"` on production failure (`:4322`, `:12540-12546`).

---

## 7. Grading the history against the capability ladder

| Capability (as historically claimed) | exists | works | public API | used by games | good default | composes | modern quality | agents know | examples show |
|---|---|---|---|---|---|---|---|---|---|
| Native bloom (pyramid since 09-03) | Y | Y | Y | 18 (flags) | N (opt-in; preset knobs) | LDR chain | partial | via flag rollout | partial |
| SSAO/SSR/DOF/TAA native | Y | bounded | partial (TAA/MB withheld) | SSR 0, DOF 0 | N | post-tonemap LDR | N | N | N |
| CSM shadows | Y (since 07-27) | Y | Y | many | ? | ? | ? | – | – |
| GGX PMREM IBL | Y (since 07-26) | Y | `environments.*` | 4 files | N | – | – | weak | weak |
| Anisotropy/sheen/iridescence | Y (since 08-05) | Y | scalar only | ~0 | N | – | – | N | lab only |
| Volumetric fog | alias until 09-03 | bounded | Y | 1 file | N | – | – | N | N |
| Water/Ocean/DayNightSky/PlanarReflection | Y (09-04, new modules) | ? | partial | sky 0, planar 0, ocean 6 | N | ? | ? | N | N |
| Textured PBR assets in games | – | – | Y | 7/11 app asset sets have 0 textures | – | – | N | N | N |

The pattern across the ladder: capabilities reach "exists / technically works / has a proof spec" and
stop. None reached "good default" or "agents use it by default"; the games use a flag-level subset.

---

## 8. Recommendations (for the rebuild PRD)

1. **Freeze evidence tooling growth.** No new gates, receipts, or claim labels until default frames of the
   18 games materially improve. Delete or quarantine `tools/` gates that assert on tokens/literals.
2. **Make "looks modern by default" the acceptance bar**, measured by humans on fixed default frames
   (and against three.js r185 reference scenes built with standard addons), not by LLM critics or
   non-blank probes. Restore and keep the deleted A/B audit as a living baseline instead of deleting it.
3. **Renderer first, games second, with no claim ceiling:** HDR linear pipeline with post (AO/SSR/DOF/TAA)
   before tone mapping; production profile + DPR-aware pixel ratio + IBL + shadows as the default
   `createAuraApp` profile; remove the parallel safe-basic/agent-runtime/Lean device forks or make them
   share one shader library.
4. **Stop baking primitives into "typed" GLBs.** Ban `build-models.*` synthesized heroes; require textured
   PBR assets (base/normal/ORM) with triangle budgets appropriate for 2026 (hero ≥10–50k tris).
5. **Replace the UI-only DESIGN.md with a 3D art-direction standard** (lighting ratios, sky/IBL, fog,
   material density, contact shadows, colour grading targets, reference boards per genre).
6. **Change agent guidance from "only use what is proven" to "use the modern default stack"**; move
   claim-boundary language out of the skills that agents read while authoring scenes (PR #20 risks
   cementing the current loop).
7. **Stop the release treadmill** (one version / 3.4 days) and the orchestration commits on main; land
   renderer changes as reviewed PRs with before/after default-frame images.

---

## Appendix — reproduction commands

```bash
git log --format='%ad' --date=format:'%Y-%m' | sort | uniq -c            # commits per month
git log --numstat --format='' | awk '...top-level aggregation...'          # §1.1
git log --since=2026-05-01 --numstat --format='' | awk -f cat.awk           # §1.2 (classifier in /tmp, not committed)
git log --first-parent main --since=.. --until=.. --numstat --format=''    # §1.3 epochs
git log --format='@@%h %ad %s' --numstat -- packages/rendering/src         # rendering commits list
gh pr view {13,14,15,18,19,20} --repo auraoneai/aura3d --json title,body,files
git show b31293ee^:.goal/premium-indie-18-game-audit.md
git show b31293ee^:muse3jsparity-completion-audit-2026-09-05.md
git show dc6ed03e^:muse3jsparity-PRD.md
git show 5bc7d936^:docs/project/audits/engine-parity-gap-audit.md
git show 5bc7d936^:docs/archive/AURA3D_KILL_OR_REPAIR_AUDIT.md
git show 5bc7d936^:docs/project/aura3d-recovery-audit-2026-06-20.md
git show b31293ee^:completefix.md
git show b93872a4^:docs/project/VISUAL-REVIEW-SIGNOFF.md
git show bf32f18c   # "18-game AAA parity adoption" (214 lines of flags)
git log -1 --format=%B 5572d24d 55834b0f b702882d d6631718 3a8d012b ed68ec86 cc4624af 4747dba4 a74746f4
```
