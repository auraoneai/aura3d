# Aura3D Quality Rebuild: Master Plan (15 parallel lanes)

- Date: 2026-10-05 (Monday). Branch `aura3d-quality-rebuild/audit`. Owner of this file: lane 15 (custodian), `CONTRACTS.md:2442`.
- Authority order: `CONTRACTS.md` (contracts C-01..C-40, ownership §4, flags §5, merge §6, checkpoints §7, soft dependencies §8)
  > this plan > the PRD files. Where this plan and `CONTRACTS.md` disagree, `CONTRACTS.md` wins and this plan is corrected.
- Inputs: `CONTRACTS.md` §0, §2.0, §3.9, §4-§8; `00-AURA3D-AUTOPSY.md` (executive verdict :8-23, root causes :25-42, Quality Bar
  :1945-2082, tiers :2085-2125); PRD-01..15 sections "Contracts consumed / provided", "Parallel execution", implementation phases,
  standalone and integrated acceptance, performance budgets; research 19 (corrected claims), 21 (game vision judgment), 23
  (benchmark vision judgment); `_sections/A-capability-matrix.md:139-158` (per-scene table); `_sections/parallel-conflict-map.md`.
- Pixel baseline: GitHub Actions run **37289688772** (`.github/workflows/quality-rebuild-capture.yml`, macos-14, Chromium ANGLE Metal,
  paravirtual M1 GPU, sha `c08d8acb`), `00-AURA3D-AUTOPSY.md:5`.

**What this plan is not.** It records no visual result. Score columns labelled "target" are thresholds copied or derived from the PRDs'
integrated acceptance tables. They are not forecasts with a measured confidence. The only evidence that can move a number in §5 is a
G-PANEL checkpoint record (`benchmarks/quality-rebuild/history/rounds/IC-<k>.json`, `CONTRACTS.md:2700-2707`). Conformance tests,
engineering gates, metric thresholds and vision-only screening rounds never support a claim that Aura3D matches three.js
(`CONTRACTS.md:2720-2727`).

---

## 1. Execution model

### 1.1 One bootstrap, then fifteen lanes at once

There is no serial order between lanes (`00-AURA3D-AUTOPSY.md:137-146`). The program is:

1. **PR 0 Contract Bootstrap, day 0-2 (2026-10-05..07)**, owned by lane 15 and executed first by whichever agent starts
   (`CONTRACTS.md:2351-2413`). Rule: PR 0 changes no rendered pixel, no public signature (optional additions only) and no default
   (`CONTRACTS.md:2353`).
2. **All 15 lanes start on day 0 (2026-10-05)** in their own new files, branched from the PR 0a branch, which is pushed within hours
   (`CONTRACTS.md:2400-2403`). No lane waits for PR 0a to *merge*, and no lane waits for any other lane at any point.
3. **Lanes merge to main whenever they are green, behind their own `A3D_QR_*` flag** (`CONTRACTS.md:2627-2639`). Consumers build against
   PR 0 stubs; providers swap stub for real with `slot.provide(real)` in their lane barrel, so a swap is a flag flip and no consumer code
   changes (`CONTRACTS.md:2650-2657`).
4. **Integration is measured, never awaited.** Weekly checkpoints IC-1..IC-n (Thursdays from 2026-10-15) and G-PANEL rounds every 4th
   checkpoint (IC-4, IC-8, IC-12, …) score the all-flags build. A failure becomes a `qr-ic-regression` issue against the attributed lane;
   that lane's flag is not promoted; nothing else is held (`CONTRACTS.md:2709-2718`).

### 1.2 PR 0 exact scope (`CONTRACTS.md:2355-2398`)

| Part | Day | Scope | Who may start after it |
|---|---|---|---|
| **PR 0a** (additive only) | 0 (2026-10-05) | (1) `packages/rendering/src/contracts/` — `core, frameGraph, program, materialLobes, blend, output, geometry, frameUniforms, environment, shadows, sampling, post, velocity, textureFormats, deform, particles, atmosphere, quality, device, rendererFactory, renderItem, renderSource, index` + `testing/ChunkHarness.ts`. (2) `packages/engine/src/contracts/` — `flags, output, sceneGraph, environment, lighting, post, materials, assets, animation, effects, atmosphere, camera, time, game, world, diagnostics, looks, art, compiler, runtimeNodes, app, index` + `stubs/*.ts` (each stub = exactly its catalog "Stub" paragraph). (3) `packages/assets/src/contracts/decoders.ts`, `packages/animation/src/contracts/pose.ts`, `packages/audio/src/contracts/gameSound.ts`, `packages/aura3d-cli/src/contracts/{assetManifest,commands}.ts`, `packages/aura3d-cli/src/commands/{registry.ts,prdNN/index.ts}`. (4) Declaration-only optional fields on existing types for C-04, 06, 07, 10, 12, 13, 14, 15, 16, 17, 18, 19, 27, 28, 30, 31, 37, 38. (5) Lane barrels, subpath reservations, `packages/game` skeleton, `eslint/qr/*.js`, benchmark lane scene indices, `tools/quality-rebuild-capture/games.schema.json` + `contracts.mjs`, `tools/quality-gate/src/contracts.ts`. (6) Conformance harness and every `tests/unit/contracts/C-NN-*.test.ts` / `tests/browser/contracts/*.spec.ts` green on stubs. (7) `.github/workflows/qr-contracts.yml`, `.github/QR_OWNERSHIP.json`, `tools/qr-ownership/check.mjs`. | Every lane, for every contract in the "no 0b seam" set: C-02, 03, 04, 06, 07, 08, 10, 15, 17, 19, 20-27, 30, 32, 35 (`CONTRACTS.md:2405-2408`). C-40 needs no PR 0. |
| **PR 0b-1** | 1-2 (2026-10-06..07) | Verbatim carve-outs of `packages/engine/src/agent-api/index.ts` (18,733 lines, §3.2) into lane modules; C-36/C-37/C-38/C-31/C-34 seams; extra carve of `GameRuntime.ts` `GameEffectKind` :1150-1171, `createGameEffects` :2800-2879, `effectToSceneNode` :3879-3915 into `agent-api/vfx/gameEffects.ts` (07) (`CONTRACTS.md:2410-2412`). | Lanes editing carved `agent-api` regions (02 `compiler/{environment,lights,shadows}.ts`, 03 `compiler/postprocess.ts`, 06 `app/actorAnimationHandle.ts`, 07 `compiler/{fog,effects,sky}.ts`, 11 `app/rendererOptions.ts`, 13 `looks/generatedCodeWarnings.ts`, …). |
| **PR 0b-2** | 1-2 | Rendering hot files `ForwardPass.ts` (2,213 lines), `WebGL2Device.ts` (4,769), `Renderer.ts` (3,152), frozen legacy shader libraries (§3.3-§3.5, §3.7); seams for C-01, 09, 11, 12, 13, 16, 18, 28, 29, incl. C-29 delegating stubs in `renderer/{RendererFactory,DeviceLifecycle}.ts` (owner 11 after merge). | 01 core edits, 02 `forward/Lighting.ts` / `webgl2/Samplers.ts` / `DepthPass.ts`, 05 `webgl2/TextureFormats.ts`, 11 `webgl2/{Probe,Counters}.ts`. |
| **PR 0b-3** | 1-2 | `TypedGLBActor` + GLTF carve-outs (§3.6), C-39 CLI fallthrough in `cli.ts`, capture step plugins and `qr_flags` (C-33). | 04/05/06 actor extensions, 05 `gltf/ImageDecode.ts`, every lane's CLI verbs and capture steps. |

- The three 0b parts merge independently, so a slip in one does not hold the others (`CONTRACTS.md:2378-2383`).
- **Size budget:** about 2,500 new lines and about 9,000 moved lines with 0 changed logic lines. A carve-out that cannot stay verbatim is
  dropped from 0b and its region stays with the hot-file owner, reachable by §6.5 request. PR 0 never grows to include behaviour
  (`CONTRACTS.md:2396-2398`).
- **Acceptance of each part, remote only:** `pnpm typecheck:raw` (tsconfig.build.json), `pnpm lint`, `pnpm test:unit`,
  `pnpm test:integration` green with no pre-existing test changed except import paths; `tests/unit/public-api-contracts.test.ts` green
  with exports a superset of `85aafcd0`; every conformance suite green on stubs; `tools/qr-ownership/check.mjs` passes with moved line
  counts equal to source line counts; and the **IC-0 identity run** (`quality-rebuild-capture.yml`, `qr_flags=none`, 18 games + 18 base
  scenes) with per-image ΔE2000 p99 at or below the noise of two captures of `85aafcd0` (run 37289688772 plus one fresh re-run)
  (`CONTRACTS.md:2385-2394`).

### 1.3 What lanes do before their 0b part lands

Every lane writes its replacement code in a new lane-owned module on day 0 and wires it after the 0b merge, no later than day 2
(`CONTRACTS.md:2400-2403`). Examples taken from the PRDs:

- PRD 02 writes light-unit and caster-selection logic in `packages/engine/src/lanes/prd02.ts` and moves it verbatim into
  `compiler/lights.ts` / `compiler/shadows.ts` after 0b-1 (`PRD-02:1910`).
- PRD 05 writes `resolveCompressedTextureFormatReal` in `packages/rendering/src/webgl2/TextureFormats.ts` before 0b-2 carves
  `WebGL2Device.ts:4117-4133` (`PRD-05:1359`).
- PRD 06 writes `rejectEmptyAnimationPose` in its `compiler/animation.ts` replacement module and calls it from the carved
  `setAnimationPose` after 0b-1 (`PRD-06` Phase 0 T0.2).

### 1.4 Rules every lane obeys (summary of `CONTRACTS.md` §4-§6)

| Rule | Source |
|---|---|
| Single writer: each path has one owning lane, resolved by longest prefix from `.github/QR_OWNERSHIP.json` | `CONTRACTS.md:2416-2444` |
| Other lanes reach a hot file only through a PR 0 registry/seam or a `qr-request` issue (owner answers within 2 working days; requester never waits) | `CONTRACTS.md:2446-2521, 2670-2677` |
| Imports across lanes only through `contracts/` or public entry points; arch gate `qr-no-cross-lane-import` warns from PR 0a, errors from IC-1 | `CONTRACTS.md:2641-2648` |
| No PR changes flag-off behaviour, except declared correctness fixes (R18 instancing `size`) and §5.4 removals | `CONTRACTS.md:2638-2639` |
| PRs touching `packages/rendering/**` or `packages/engine/**` also run browser conformance plus a flag-off sentinel identity check on the 6 scenes in `benchmarks/quality-rebuild/sentinels.json` | `CONTRACTS.md:2632-2635` |
| A PR that turns main red is reverted at once by anyone; the owner re-lands | `CONTRACTS.md:2636-2637` |
| Root `package.json` belongs to 15; lane dependencies go into the lane's own workspace manifest with exact versions; root changes ride a daily batch PR | `CONTRACTS.md:2534-2541` |
| Generated files (`aura.assets.json`, lockfile, resolution maps, extension matrix) are written only by their generator, re-run with `--check` in CI | `CONTRACTS.md:2523-2532` |
| Route `main.ts` files: only lane 14 writes them (other lanes ship codemods/reports); templates and skills: only lane 13 (others send C-40 facts) | `CONTRACTS.md:50-51` (R20, R21) |
| Remote execution only: all captures, browser tests and heavy builds on GitHub Actions macos-14 / remote runners; never local Docker, never SwiftShader for judged frames | `00-AURA3D-AUTOPSY.md:2056-2058` |

---

## 2. Lane table
