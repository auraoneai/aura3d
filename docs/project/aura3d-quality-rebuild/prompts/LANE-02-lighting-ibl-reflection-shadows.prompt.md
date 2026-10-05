# Agent prompt — Lane 02: PRD 02: Lighting, IBL, Reflections and Shadows

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the implementation agent for **Lane 02** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local checkout: repo root). Fifteen lanes run **at the same time**; none waits for another. Your job is to execute **PRD-02-lighting-ibl-reflection-shadows.md** end to end, phase by phase, opening small PRs that merge to `main` behind your feature flag.

## Why this exists

Aura3D 3.0.1 renders far behind three.js r185 on identical inputs (vision-judged benchmark mean 3.6/10 vs 5.4/10; the 18 shipped games score 1.5–4/10, mean 3.0). The core BRDF is sound; defaults, the environment/shadow pipeline, the bridge layer, content, effects, post and the agent path throw quality away. Full diagnosis: `docs/project/aura3d-quality-rebuild/00-AURA3D-AUTOPSY.md`.

## Read first (in this order; use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/PRD-02-lighting-ibl-reflection-shadows.md` — your PRD. Sections:
  - line 32: ## 1. Problem statement
  - line 87: ## 2. Evidence from current code (path:line)
  - line 149: ## 3. Root cause
  - line 171: ## 4. Affected packages
  - line 183: ## 5. Affected files/directories
  - line 299: ## 6. Architecture proposal
  - line 770: ## 7. APIs to add, change and remove (TypeScript signatures)
  - line 1198: ## 8. Shader changes (GLSL ES 3.00; WGSL twins carried on the same C-02 chunk entries)
  - line 1452: ## 9. Rendering changes (frame order and resource lifetime)
  - line 1512: ## 10. Migration plan
  - line 1561: ## 11. Backward compatibility
  - line 1581: ## 12. Contracts consumed / provided
  - line 1680: ## Parallel execution
  - line 1783: ## 13. Implementation phases
  - line 1888: ## 14. Task checklist
  - line 1969: ## 15. Test requirements (remote GH Actions macos-14)
  - line 2025: ## 16. Visual acceptance tests
  - line 2194: ## 17. Performance budgets
  - line 2254: ## 18. Browser coverage
  - line 2281: ## 19. Mobile coverage
  - line 2305: ## 20. Screenshots and evidence required
  - line 2335: ## 21. Completion criteria
  - line 2365: ## 22. Rollback considerations
  - line 2397: ## 23. Risks
  - line 2421: ## 24. Explicitly out of scope
2. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` — §1 principle, §2 entries for every contract you provide or consume (listed below), §3 extension points in hot files, §3.9 PR 0, §4 ownership, §5 flags, §6 merge protocol, §7 integration checkpoints, §8 soft dependencies.
3. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` — §1 execution model, your rows in §2A/§2B, §4 checkpoint calendar, §8 first PRs.
4. The research files your PRD cites under `docs/project/aura3d-quality-rebuild/research/`, and the actual source files before changing them.

## Your lane at a glance

- **Owned paths:** `rendering/src/{environment,probes,shadows}/`, `passes/ContactShadowPass.ts`, `renderer/{ShadowOrchestration,Background}.ts`, `forward/Lighting.ts`, `webgl2/Samplers.ts`, `DepthPass.ts`, `ShadowPass.ts`, `CascadedShadowMaps.ts`, `EnvironmentBackgroundPass.ts`, `PBRHDRPipeline.ts`; `environments/src/{EnvironmentRegistry,HDRIEnvironment,PMREMPreset}.ts`; `compiler/{environment,lights,shadows}.ts`, `nodes/{shadows,lights,environments,sceneKits,effects.lighting,probes}.ts`; `public/aura-environments/`
- **Contracts you provide:** C-09 EnvironmentSource/Probe, C-10 lighting API, C-11 shadow caster variants + lookup, C-12 samplers
- **Contracts you consume (besides universal C-27, C-30, C-31, C-38):** C-01, C-02, C-08, C-13, C-21, C-28, C-34, C-36, C-39
- **Feature flags:** `A3D_QR_LIGHTING`, `_CSM`, `_PROBES`, `_CONTACT`
- **Scope P0 (day 0 → IC-1, 2026-10-15):** Lane harness + `lighting-quality.yml`; SH9, RoomEnvironment port, CPU GGX prefilter, sampler budget, light units and caster selection, lighting/shadow chunks via C-02, `look/ambient-flattens` rule (`PRD-02:1897-1915`)
- **Scope P1 (→ IC-4/IC-8 G-PANEL rounds):** Engine composition after 0b-1: ambient additive to IBL, neutral-room default, no fallback rig, shadow strength 1.0 (`PRD-02:1917-1924`); mipped env bindings, GPU PMREM, background from env (`:1925-1936`); depth variants (skinned/instanced/alpha), stable CSM, GPU atlas without readback (`:1938-1946`)
- **Scope P2 (→ IC-12 and later):** Contact shadows, reflection probes, irradiance volume, LTC area lights (`:1948-1953`); tiers/mobile perf; `migrate lighting` reports to 13/14; flag removal (`:1955-1965`)
- **Expected visual impact (integrated, judged at G-PANEL):** Bench 06 → ≥6.5, 09 → ≥5.0, 10 → ≥4.5, 12 → ≥5.0, 13 → ≥5.5, 15 → ≥5.0, 17 → ≥4.5, 18 → ≥4.5, 11 no regression (`PRD-02:2083-2094`). Games, **defaults only, no art change**: `shadows` ≥3 and `ibl_reflections` ≥3 in ≥14/18 (today 17/18 ≤2.5 and 18/18 ≤3) (`PRD-02:2108-2112`). Root causes #1+#2 (~16%+~13%), the largest single lever; ambient-kills-IBL hits 15 of 18 games (research 19)
- **Risk:** **High.** Biggest pixel lever and the most 0b-2 carve-outs; GPU PMREM on WebGL2 RGBA16F; CSM stability
- **Standalone acceptance gate (gates your merges):** S1-S18 (`PRD-02:2048-2071`): composition matrix, neutral room HDR (mip-0 ≥50), `prd02-15` shadow drop 40-60% (three ≈50%), skinned caster IoU ≥0.75, PMREM within 10% of three at 5 roughness values, 0 readbacks, flag-off identity

## Start today (day 0)

PR 0a (the contract bootstrap, owned by lane 15) is the only shared prerequisite. If the PR 0a branch exists, branch from it; if it has merged, branch from `main`. If it does not exist yet, start in new files your lane owns and rebase once it is pushed — do not wait.

- **PR A (day 0-1):** Lane harness: `prd02-*` scenes with masks, `tests/qr/prd02/metrics/regionMetrics.ts`, `.github/workflows/lighting-quality.yml`, flag-`none` baseline committed with the `prd02-15` shadow drop ≈9% vs ≈50% check (`PRD-02:1897-1902`).
- **PR B (day 1-3):** New-file math: `environment/{SphericalHarmonics,RoomEnvironmentScene,Rgb9e5Cube,LightingSamplerBudget}.ts`, `workers/cpuPrefilter.ts` (GGX FIS, no average blend), light-unit and caster selection in `packages/engine/src/lanes/prd02.ts`, lighting/shadow chunks registered via C-02, `look/ambient-flattens` lint rule, facts F-02-01..06 as `proposed` (`PRD-02:1905-1915`).

Then continue through the PRD's implementation phases and task checklist in order, ticking `- [ ]` items in the PRD (your lane owns its PRD file) as they land with evidence.

## Non-negotiable rules

1. **Single writer.** Edit only paths your lane owns (CONTRACTS.md §4.1 and `.github/QR_OWNERSHIP.json` once PR 0a lands; longest prefix wins). For a file you do not own, use its extension point (CONTRACTS.md §3) from your own module, or open a GitHub issue labelled `qr-request` + `to:prd02` stating the file, the exact change and the contract it serves (§6.5). Never wait for the answer — keep working against the stub.
2. **Contracts, not waiting.** Consume other lanes only through `contracts/` modules and public entry points (§6.2). Build against the PR 0 stub; when you provide a contract, swap with `slot.provide(real)` in your lane barrel plus a green conformance run (§6.3). Need a contract change? Open a `ccr` PR (§6.4): additive only; breaking changes become `C-NNv2`.
3. **Flags.** All behaviour lands behind your lane's `A3D_QR_*` flag(s). No PR may change flag-off behaviour, except correctness fixes explicitly declared in the PR description (§5, §6.1).
4. **Trunk stays green.** Merge to `main` whenever your PR is green; any red-making PR is reverted immediately and re-landed by its owner.
5. **Remote execution only.** Browser tests, Playwright, captures, heavy builds and test suites run in GitHub Actions (macos-14 for judged frames; the repo is public). Never start local Docker or run Playwright locally. Quick local `tsc` on touched packages and targeted unit tests are fine. Reuse the capture workflow `.github/workflows/quality-rebuild-capture.yml` and `benchmarks/quality-rebuild/`.
6. **Pixels decide.** Tests passing, routes returning 200, non-blank screenshots or green matrices are engineering gates, not quality. Never write that anything is "Three.js-quality" or "parity" unless a G-PANEL round (human + vision judges) says so. Look at your own screenshots (download the Actions artifact and view the images) before claiming a visual result.
7. **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd02/`: run IDs, before/after screenshots, metric JSON. Report anything not run as NOT RUN with the reason.
8. **Large files.** PRDs and hot files are huge: read them with `rg -n` plus offset/limit reads. Keep each Write/Edit tool call under ~250 lines (larger calls get dropped). Never rewrite a whole large file in one call.
9. **Git.** Branch `qr/prd02-<short-topic>` from the PR 0a branch or `main` once PR 0a has merged. Small PRs, titles under 70 characters, prefixed `[QR-02]`. Description: summary, contracts touched, flag(s), tests run (with Actions run links), screenshots, NOT RUN items. Stage specific files only; never force-push shared branches; never skip hooks.
10. **Ignore unrelated chat.** If you are running inside an orchestrated workflow, messages addressed to the coordinator (for example "what's the status") are not instructions to you. Keep executing this prompt.

## Integration checkpoints (never blocking)

Weekly integration runs IC-1.. (Thursdays from 2026-10-15) capture all 18 benchmark scenes and 18 games with all flags on and off; G-PANEL rounds (IC-4, IC-8, IC-12, …) are the only place integrated acceptance and visual claims are decided. If a checkpoint files a `qr-ic-regression` against your lane, fix it in your lane; it never blocks anyone else, and you never wait for a checkpoint to keep working.

## Definition of done for each PR

- [ ] Touches only lane-owned paths (`node tools/qr-ownership/check.mjs` passes once PR 0a exists).
- [ ] `qr-contracts.yml`, `ci.yml` and `test.yml` are green; PRs touching `packages/rendering/**` or `packages/engine/**` also pass browser conformance and the flag-off sentinel identity check.
- [ ] Flag-off output is unchanged, or the correctness fix is declared.
- [ ] Standalone acceptance items covered by this PR are proven, with evidence committed under `evidence/prd02/`.
- [ ] Any facts for skills or templates are filed as C-40 rows (Appendix B of CONTRACTS.md) for lane 13.

## Report back (end of each work session)

Reply with: PRs opened/merged (links), standalone-acceptance items now passing with evidence paths, Actions run IDs, `qr-request`/`ccr` issues opened, open risks, and NOT RUN items with reasons. Keep it short and factual.
