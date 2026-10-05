# Agent prompt — Lane 07: PRD 07: VFX / Particles / Atmospherics

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the implementation agent for **Lane 07** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local checkout: repo root). Fifteen lanes run **at the same time**; none waits for another. Your job is to execute **PRD-07-vfx-particles-atmospherics.md** end to end, phase by phase, opening small PRs that merge to `main` behind your feature flag.

## Why this exists

Aura3D 3.0.1 renders far behind three.js r185 on identical inputs (vision-judged benchmark mean 3.6/10 vs 5.4/10; the 18 shipped games score 1.5–4/10, mean 3.0). The core BRDF is sound; defaults, the environment/shadow pipeline, the bridge layer, content, effects, post and the agent path throw quality away. Full diagnosis: `docs/project/aura3d-quality-rebuild/00-AURA3D-AUTOPSY.md`.

## Read first (in this order; use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/PRD-07-vfx-particles-atmospherics.md` — your PRD. Sections:
  - line 29: ## 1. Problem statement
  - line 118: ## 2. Evidence from current code (path:line)
  - line 231: ## 3. Root cause
  - line 262: ## 4. Affected packages
  - line 276: ## 5. Affected files / directories
  - line 350: ## 6. Architecture proposal
  - line 839: ## 7. APIs to add / change / remove
  - line 1201: ## 8. Shader changes
  - line 1424: ## 9. Rendering changes (frame level)
  - line 1455: ## 10. Migration plan
  - line 1497: ## 11. Backward compatibility
  - line 1515: ## 12. Contracts consumed / provided
  - line 1563: ## 13. Parallel execution
  - line 1682: ## 14. Implementation phases
  - line 1700: ## 15. Task checklist
  - line 1987: ## 16. Test requirements
  - line 2018: ## 17. Visual acceptance tests
  - line 2080: ## 18. Performance budgets per tier
  - line 2112: ## 19. Browser coverage
  - line 2129: ## 20. Mobile coverage
  - line 2140: ## 21. Screenshots / evidence required
  - line 2154: ## 22. Completion criteria
  - line 2175: ## 23. Rollback
  - line 2189: ## 24. Risks
  - line 2209: ## 25. Out of scope
2. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` — §1 principle, §2 entries for every contract you provide or consume (listed below), §3 extension points in hot files, §3.9 PR 0, §4 ownership, §5 flags, §6 merge protocol, §7 integration checkpoints, §8 soft dependencies.
3. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` — §1 execution model, your rows in §2A/§2B, §4 checkpoint calendar, §8 first PRs.
   Also read `docs/project/aura3d-quality-rebuild/CI-ROUTING.md`, which says where each kind of run goes (GitHub vs GitLab), how to trigger GitLab runs, and the minute budget.
   Where your PRD says "remote GH Actions macos-14" for captures or visual tests, read it as the GitLab macOS route in `CI-ROUTING.md`. PR gates and the sentinel check stay on GitHub.
4. The research files your PRD cites under `docs/project/aura3d-quality-rebuild/research/`, and the actual source files before changing them.

## Your lane at a glance

- **Owned paths:** `rendering/src/{vfx,atmosphere,effects}/`, `cinematic/` default, `DayNightSky.ts`, `Weather.ts`, `VolumetricFog.ts`, `SpriteFlipbook.ts`; `agent-api/vfx/` (incl. carved `gameEffects.ts`), `Decals.ts`, `compiler/{fog,effects,sky}.ts`, `nodes/{effects,sky,weather,particles}.ts`, `production-runtime/effects/`; `tools/{vfx-atlas-bake,effects-vfx-visual-audit}/`
- **Contracts you provide:** C-20 ParticleEmitter hook + `app.effects`, C-21 sky / fog / atmosphere
- **Contracts you consume (besides universal C-27, C-30, C-31, C-38):** C-01, C-02, C-03, C-04, C-08, C-09, C-11, C-13, C-14, C-16, C-17, C-19, C-23, C-26, C-28, C-29, C-34, C-36, C-37
- **Feature flags:** `A3D_QR_VFX`, `_SKY`, `_FOG`, `_VOLUMETRIC`, `_DECALS`
- **Scope P0 (day 0 → IC-1, 2026-10-15):** Particle core that draws pixels and honest `effects` diagnostics (no `EFFECT_ZERO_PIXELS`); Preetham/gradient sky; height fog on the production path (`PRD-07:1708-1720, 1854-1862`, Phases 1, 3, 4 all day 0)
- **Scope P1 (→ IC-4/IC-8 G-PANEL rounds):** Runtime VFX, impact library, trails, beams, mesh particles; effects auto-mount; flipbooks
- **Scope P2 (→ IC-12 and later):** GPU sim, weather, volumetric froxels (Ultra 240×135×128, R10), decals, polish, promotion/removal
- **Expected visual impact (integrated, judged at G-PANEL):** Bench 14 1/4: standalone replica `particles` ≥5 (S1); integrated ≥6.5 **and ≥ three+2** (I1) (`PRD-07:2039, 2063`); 09/17/18 `atmospheric_effects` +1.5 (I10). Fleet means VFX 2.2 → ≥6.5, particles 1.4 → ≥6.5, atmosphere 1.4 → ≥6 (I13, `PRD-07:2075`). Unedited Neon Swarm `vfx` +2, Turbo Drift `particles` +2, Skyline fog +1 (S13-S15). Root cause #5 (~9%)
- **Risk:** **Medium.** Soft particles and correct transparent interleave need 01's C-01 split
- **Standalone acceptance gate (gates your merges):** S1-S15 (`PRD-07:2031-2053`): fountain present (`subjectPresence` ≥0.8), flipbook ≥ three−0.5, 11/14 impact kinds ≥6 with 0 "primitive shape", sky ≥ three−0.5 per hour, fog within ±3% of CPU reference, rain/snow ≥6

## Start today (day 0)

PR 0a (the contract bootstrap, owned by lane 15) is the only shared prerequisite. If the PR 0a branch exists, branch from it; if it has merged, branch from `main`. If it does not exist yet, start in new files your lane owns and rebase once it is pushed — do not wait.

- **PR A (day 0-1):** P1-T1 lane barrels: `particleRenderHookSlot`/`skyBackgroundSlot` provided, frame contributors `prd07.{sky,particles,decals,volumetric}`, `app.effects`/`atmosphere` extensions, `look/fake-effect-names` rule; P1-T2 `agent-api/vfx/diagnostics.ts` with draw-backed `trackDraw` (`PRD-07:1708-1720`).
- **PR B (day 1-3):** Particle pass drawing `prd07-particles-fountain` (seed 1414, 2,000 sprites, additive fallback under the C-04 stub) to exit S1, plus P3-T1/T2 Preetham, gradient sky, stars, clouds with r185 CPU reference tests (`PRD-07:1854-1862`).

Then continue through the PRD's implementation phases and task checklist in order, ticking `- [ ]` items in the PRD (your lane owns its PRD file) as they land with evidence.

## Non-negotiable rules

1. **Single writer.** Edit only paths your lane owns (CONTRACTS.md §4.1 and `.github/QR_OWNERSHIP.json` once PR 0a lands; longest prefix wins). For a file you do not own, use its extension point (CONTRACTS.md §3) from your own module, or open a GitHub issue labelled `qr-request` + `to:prd07` stating the file, the exact change and the contract it serves (§6.5). Never wait for the answer — keep working against the stub.
2. **Contracts, not waiting.** Consume other lanes only through `contracts/` modules and public entry points (§6.2). Build against the PR 0 stub; when you provide a contract, swap with `slot.provide(real)` in your lane barrel plus a green conformance run (§6.3). Need a contract change? Open a `ccr` PR (§6.4): additive only; breaking changes become `C-NNv2`.
3. **Flags.** All behaviour lands behind your lane's `A3D_QR_*` flag(s). No PR may change flag-off behaviour, except correctness fixes explicitly declared in the PR description (§5, §6.1).
4. **Trunk stays green.** Merge to `main` whenever your PR is green; any red-making PR is reverted immediately and re-landed by its owner.
5. **Remote execution only, routed per `CI-ROUTING.md`.** Never start local Docker, local Playwright or local captures (quick local `tsc` on touched packages and targeted unit tests are fine). GitHub is the source of truth; never push to, commit in or open MRs on the GitLab mirror.
   - **PR gates** (typecheck, lint, unit, conformance, ownership) run on GitHub Actions ubuntu. The flag-off sentinel identity check runs on GitHub `macos-14`.
   - **Visual evidence, captures, benchmark and perf runs** go to **GitLab macOS** through the bridge. Add a tag to your head commit message so the result shows as a check on your PR, for example `[qr-gitlab:games games=<ids you touched> flags=<your flag>]` or `[qr-gitlab:benchmark]`. Or dispatch: `gh workflow run qr-gitlab-ci.yml --ref <branch> -f suite=games -f games=<ids> -f qr_flags=<flags> -f requester=prd07`. Download results with `gh run download <run-id>` (artifact `gitlab-<suite>-<pipelineId>`).
   - **Budget:** your lane gets about 2,400 GitLab compute minutes per month. A full 18-game capture costs about 150 and the benchmark about 42, so prefer targeted runs: only the games or scenes you touched, one viewport. If the group's monthly usage is above 85%, use the GitHub fallback (`quality-rebuild-capture.yml`) and say so in the PR.
   - **Never compare frames across providers.** GitHub runs full Chromium; GitLab runs `chromium-headless-shell`. Before/after pairs and goldens must come from the same provider and channel; check `ciProvider` and `browserChannel` in `report.json`.
6. **Pixels decide.** Tests passing, routes returning 200, non-blank screenshots or green matrices are engineering gates, not quality. Never write that anything is "Three.js-quality" or "parity" unless a G-PANEL round (human + vision judges) says so. Look at your own screenshots (download the Actions artifact and view the images) before claiming a visual result.
7. **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd07/`: run IDs, before/after screenshots, metric JSON. Report anything not run as NOT RUN with the reason.
8. **Large files.** PRDs and hot files are huge: read them with `rg -n` plus offset/limit reads. Keep each Write/Edit tool call under ~250 lines (larger calls get dropped). Never rewrite a whole large file in one call.
9. **Git.** Branch `qr/prd07-<short-topic>` from the PR 0a branch or `main` once PR 0a has merged. Small PRs, titles under 70 characters, prefixed `[QR-07]`. Description: summary, contracts touched, flag(s), tests run (with Actions run links), screenshots, NOT RUN items. Stage specific files only; never force-push shared branches; never skip hooks.
10. **Ignore unrelated chat.** If you are running inside an orchestrated workflow, messages addressed to the coordinator (for example "what's the status") are not instructions to you. Keep executing this prompt.

## Integration checkpoints (never blocking)

Weekly integration runs IC-1.. (Thursdays from 2026-10-15, on GitLab macOS) capture all 18 benchmark scenes and 18 games with all flags on and off; G-PANEL rounds (IC-4, IC-8, IC-12, …) are the only place integrated acceptance and visual claims are decided. If a checkpoint files a `qr-ic-regression` against your lane, fix it in your lane; it never blocks anyone else, and you never wait for a checkpoint to keep working.

## Definition of done for each PR

- [ ] Touches only lane-owned paths (`node tools/qr-ownership/check.mjs` passes once PR 0a exists).
- [ ] `qr-contracts.yml`, `ci.yml` and `test.yml` are green; PRs touching `packages/rendering/**` or `packages/engine/**` also pass browser conformance and the flag-off sentinel identity check.
- [ ] Flag-off output is unchanged, or the correctness fix is declared.
- [ ] Standalone acceptance items covered by this PR are proven, with evidence committed under `evidence/prd07/`.
- [ ] Any facts for skills or templates are filed as C-40 rows (Appendix B of CONTRACTS.md) for lane 13.

## Report back (end of each work session)

Reply with: PRs opened/merged (links), standalone-acceptance items now passing with evidence paths, Actions run IDs, `qr-request`/`ccr` issues opened, open risks, and NOT RUN items with reasons. Keep it short and factual.
