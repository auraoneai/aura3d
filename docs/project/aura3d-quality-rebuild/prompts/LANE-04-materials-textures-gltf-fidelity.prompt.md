# Agent prompt — Lane 04: PRD 04: Materials, Textures and glTF Fidelity

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the implementation agent for **Lane 04** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local checkout: repo root). Fifteen lanes run **at the same time**; none waits for another. Your job is to execute **PRD-04-materials-textures-gltf-fidelity.md** end to end, phase by phase, opening small PRs that merge to `main` behind your feature flag.

## Why this exists

Aura3D 3.0.1 renders far behind three.js r185 on identical inputs (vision-judged benchmark mean 3.6/10 vs 5.4/10; the 18 shipped games score 1.5–4/10, mean 3.0). The core BRDF is sound; defaults, the environment/shadow pipeline, the bridge layer, content, effects, post and the agent path throw quality away. Full diagnosis: `docs/project/aura3d-quality-rebuild/00-AURA3D-AUTOPSY.md`.

## Read first (in this order; use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/PRD-04-materials-textures-gltf-fidelity.md` — your PRD. Sections:
  - line 31: ## 1. Problem statement
  - line 80: ## 2. Evidence from current code
  - line 167: ## 3. Root cause
  - line 190: ## 4. Affected packages
  - line 214: ## 5. Affected files and directories
  - line 278: ## 6. Architecture proposal
  - line 610: ## 7. APIs to add, change and remove
  - line 839: ## 8. Shader changes
  - line 1085: ## 9. Rendering changes
  - line 1119: ## 10. Migration plan
  - line 1166: ## 11. Backward compatibility
  - line 1185: ## 12. Contracts consumed / provided, and dependencies
  - line 1289: ## Parallel execution
  - line 1358: ## 13. Implementation phases
  - line 1409: ## 14. Task checklist
  - line 1477: ## 15. Test requirements
  - line 1523: ## 16. Visual acceptance tests
  - line 1617: ## 17. Performance budgets
  - line 1669: ## 18. Browser coverage
  - line 1687: ## 19. Mobile coverage
  - line 1712: ## 20. Screenshots and evidence required
  - line 1732: ## 21. Completion criteria
  - line 1755: ## 22. Rollback considerations
  - line 1776: ## 23. Risks
  - line 1797: ## 24. Explicitly out of scope
2. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` — §1 principle, §2 entries for every contract you provide or consume (listed below), §3 extension points in hot files, §3.9 PR 0, §4 ownership, §5 flags, §6 merge protocol, §7 integration checkpoints, §8 soft dependencies.
3. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` — §1 execution model, your rows in §2A/§2B, §4 checkpoint calendar, §8 first PRs.
   Also read `docs/project/aura3d-quality-rebuild/CI-ROUTING.md`, which says where each kind of run goes (GitHub vs GitLab), how to trigger GitLab runs, and the minute budget.
   Where your PRD says "remote GH Actions macos-14" for captures or visual tests, read it as the GitLab macOS route in `CI-ROUTING.md`. PR gates and the sentinel check stay on GitHub.
4. The research files your PRD cites under `docs/project/aura3d-quality-rebuild/research/`, and the actual source files before changing them.

## Your lane at a glance

- **Owned paths:** `rendering/src/materials/`, `shaders/{physical,physical-wgsl}/`, `forward/Transmission.ts`, `textures/TextureBudget.ts`, PBR material classes, `Sampler.ts`, `IBL.ts`; `assets/src/{GLTFRenderResources,GLTFExtensionSupport,MikkTSpaceTangents}.ts`; `production-runtime/{TypedGLBActor,ModelMaterialOverrides}.ts`, `actor/`; `compiler/{modelMaterials,textures}.ts`, `nodes/material.ts`; `fixtures/asset-corpus/`
- **Contracts you provide:** C-03 MaterialFeature lobe registry, C-15 material spec + model overrides
- **Contracts you consume (besides universal C-27, C-30, C-31, C-38):** C-01, C-02, C-04, C-09, C-12, C-16, C-36, C-39
- **Feature flags:** `A3D_QR_MATERIALS`, `_TRANSMISSION`, `_KTX2`
- **Scope P0 (day 0 → IC-1, 2026-10-15):** Lobe chunks + r185 CPU oracle (ChunkHarness), `ModelMaterialOverrides.ts` (texture-preserving tint), procedural detail textures, MikkTSpace, TextureBudget, lane scenes and negative controls, `pin-emissive-defaults` codemod (`PRD-04:1358-1375`)
- **Scope P1 (→ IC-4/IC-8 G-PANEL rounds):** Spec-exact glTF mapping (no Duck clamp), samplers + anisotropy L4/M8/H16/U16 (R9), transmission capture, KHR variants, Draco/Meshopt via `model()`
- **Scope P2 (→ IC-12 and later):** Iridescence, anisotropy, dispersion, WGSL parity, extension matrix marked `conformant` only with integrated evidence
- **Expected visual impact (integrated, judged at G-PANEL):** Bench 02 3.5/6, 04 4.5/6.5, 05 3/6, 07 3/6 → each ≥ three−0.5; 03 6.5/7 → ≥ three−0.3 (`PRD-04:1562-1570`). Games: e.g. Aura Clash texture_quality → ≥6, Courier Rush / Gallery Shift material_quality → ≥5, Patrol Wing / Pulse Tunnel / Rooftop hero material_quality → ≥6 (`PRD-04:1594-1613`). Root cause #3 (renderer half: tint wipe + 0.28 self-emissive)
- **Risk:** **Medium-high.** Lobes are invisible on production draws until C-02 is real; fixes tied to 01's generator
- **Standalone acceptance gate (gates your merges):** S1-S16 (`PRD-04:1538-1555`): tint keeps textures (Laplacian variance ≥90% of untinted), lobe math within 1e-3 of r185, tiled-ground shimmer ≤50% of flag-off, MikkTSpace exact, Medium ≤256 MiB textures, flag-off ΔE p99 ≤ noise

## Start today (day 0)

PR 0a (the contract bootstrap, owned by lane 15) is the only shared prerequisite. If the PR 0a branch exists, branch from it; if it has merged, branch from `main`. If it does not exist yet, start in new files your lane owns and rebase once it is pushed — do not wait.

- **PR A (day 0-1):** Lobe chunks in `shaders/physical/` with the r185 CPU oracle in ChunkHarness, `qr-prd04-materials.yml`, ten `prd04-*` lane scenes + negative controls, flag-`none` baselines (`PRD-04:1365-1375`).
- **PR B (day 1-3):** `production-runtime/ModelMaterialOverrides.ts` (pure, texture-preserving multiply tint, no auto self-emissive) + `tools/codemods/pin-emissive-defaults.mjs` + `prd04-model-tint-report`; `MikkTSpaceTangents.ts`; `textures/TextureBudget.ts` pure functions; exit S3 tint check on DamagedHelmet and `prd04-tinted-hero`.

Then continue through the PRD's implementation phases and task checklist in order, ticking `- [ ]` items in the PRD (your lane owns its PRD file) as they land with evidence.

## Non-negotiable rules

1. **Single writer.** Edit only paths your lane owns (CONTRACTS.md §4.1 and `.github/QR_OWNERSHIP.json` once PR 0a lands; longest prefix wins). For a file you do not own, use its extension point (CONTRACTS.md §3) from your own module, or open a GitHub issue labelled `qr-request` + `to:prd04` stating the file, the exact change and the contract it serves (§6.5). Never wait for the answer — keep working against the stub.
2. **Contracts, not waiting.** Consume other lanes only through `contracts/` modules and public entry points (§6.2). Build against the PR 0 stub; when you provide a contract, swap with `slot.provide(real)` in your lane barrel plus a green conformance run (§6.3). Need a contract change? Open a `ccr` PR (§6.4): additive only; breaking changes become `C-NNv2`.
3. **Flags.** All behaviour lands behind your lane's `A3D_QR_*` flag(s). No PR may change flag-off behaviour, except correctness fixes explicitly declared in the PR description (§5, §6.1).
4. **Trunk stays green.** Merge to `main` whenever your PR is green; any red-making PR is reverted immediately and re-landed by its owner.
5. **Remote execution only, routed per `CI-ROUTING.md`.** Never start local Docker, local Playwright or local captures (quick local `tsc` on touched packages and targeted unit tests are fine). GitHub is the source of truth; never push to, commit in or open MRs on the GitLab mirror.
   - **PR gates** (typecheck, lint, unit tests including contract conformance, ownership) run on GitHub Actions ubuntu. Browser conformance and the flag-off sentinel identity check run on GitHub `macos-14` for PRs touching `packages/rendering/**` or `packages/engine/**`.
   - **Visual evidence, captures, benchmark and perf runs** go to **GitLab macOS** through the bridge. Put a tag in your head commit message so the result shows as a check on your PR, for example `[qr-gitlab:games games=<ids you touched> viewports=1920x1080 mobile=false]` or `[qr-gitlab:benchmark]`. On `qr/**` branches the games are built from your commit (`local=true` is the default). Never use `local=false` as evidence, because it captures production. Or dispatch: `gh workflow run qr-gitlab-ci.yml --ref <your qr/ branch> -f suite=games -f games=<ids> -f requester=prd04`. Download results with `gh run download <run-id>` (artifact `gitlab-<suite>-<pipelineId>`) and look at the PNGs.
   - **Feature flags:** `flags` must be `none` until C-33 (PR 0b-3) adds `--flags` to the capture tools. The bridge refuses other values. Until then, prove flag-on behaviour with your lane scenes and unit or browser tests.
   - **Budget:** your lane gets about 2,400 GitLab compute minutes per month. Measured costs: a full 18-game production-route capture is about 133, the 18-scene benchmark about 16. A 2-game `local=true` single-viewport run measured about 22 (pipeline 2915484179). Prefer targeted runs: only the games or scenes you touched, one desktop viewport, `mobile=false` unless you are judging mobile. Before a large run, check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it is `1`, the operator has paused GitLab lane runs: use the GitHub fallback (`quality-rebuild-capture.yml`) for the whole comparison and say so in the PR.
   - **Never compare frames across providers.** GitHub runs full Chromium; GitLab runs `chromium-headless-shell`. Before/after pairs and goldens must come from the same provider and channel; check `ciProvider` and `browserChannel` in `report.json`.
6. **Pixels decide.** Tests passing, routes returning 200, non-blank screenshots or green matrices are engineering gates, not quality. Never write that anything is "Three.js-quality" or "parity" unless a G-PANEL round (human + vision judges) says so. Look at your own screenshots (download the Actions artifact and view the images) before claiming a visual result.
7. **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd04/`: run IDs, before/after screenshots, metric JSON. Report anything not run as NOT RUN with the reason.
8. **Large files.** PRDs and hot files are huge: read them with `rg -n` plus offset/limit reads. Keep each Write/Edit tool call under ~250 lines (larger calls get dropped). Never rewrite a whole large file in one call.
9. **Git.** Branch `qr/prd04-<short-topic>` from the PR 0a branch or `main` once PR 0a has merged. Small PRs, titles under 70 characters, prefixed `[QR-04]`. Description: summary, contracts touched, flag(s), tests run (with Actions run links), screenshots, NOT RUN items. Stage specific files only; never force-push shared branches; never skip hooks.
10. **Ignore unrelated chat.** If you are running inside an orchestrated workflow, messages addressed to the coordinator (for example "what's the status") are not instructions to you. Keep executing this prompt.

## Integration checkpoints (never blocking)

Weekly integration runs IC-1.. (Thursdays from 2026-10-15, on GitLab macOS) capture all 18 benchmark scenes and 18 games with all flags on and off; G-PANEL rounds (IC-4, IC-8, IC-12, …) are the only place integrated acceptance and visual claims are decided. If a checkpoint files a `qr-ic-regression` against your lane, fix it in your lane; it never blocks anyone else, and you never wait for a checkpoint to keep working.

## Definition of done for each PR

- [ ] Touches only lane-owned paths (`node tools/qr-ownership/check.mjs` passes once PR 0a exists).
- [ ] `qr-contracts.yml`, `ci.yml` and `test.yml` are green; PRs touching `packages/rendering/**` or `packages/engine/**` also pass browser conformance and the flag-off sentinel identity check.
- [ ] Flag-off output is unchanged, or the correctness fix is declared.
- [ ] Standalone acceptance items covered by this PR are proven, with evidence committed under `evidence/prd04/`.
- [ ] Any facts for skills or templates are filed as C-40 rows (Appendix B of CONTRACTS.md) for lane 13.

## Report back (end of each work session)

Reply with: PRs opened/merged (links), standalone-acceptance items now passing with evidence paths, Actions run IDs, `qr-request`/`ccr` issues opened, open risks, and NOT RUN items with reasons. Keep it short and factual.
