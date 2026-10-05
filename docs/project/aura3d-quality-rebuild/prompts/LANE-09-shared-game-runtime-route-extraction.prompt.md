# Agent prompt — Lane 09: PRD 09: Shared Game Runtime and Route-Local Extraction

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the implementation agent for **Lane 09** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local checkout: repo root). Fifteen lanes run **at the same time**; none waits for another. Your job is to execute **PRD-09-shared-game-runtime-route-extraction.md** end to end, phase by phase, opening small PRs that merge to `main` behind your feature flag.

## Why this exists

Aura3D 3.0.1 renders far behind three.js r185 on identical inputs (vision-judged benchmark mean 3.6/10 vs 5.4/10; the 18 shipped games score 1.5–4/10, mean 3.0). The core BRDF is sound; defaults, the environment/shadow pipeline, the bridge layer, content, effects, post and the agent path throw quality away. Full diagnosis: `docs/project/aura3d-quality-rebuild/00-AURA3D-AUTOPSY.md`.

## Read first (in this order; use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/PRD-09-shared-game-runtime-route-extraction.md` — your PRD. Sections:
  - line 24: ## 1. Problem statement
  - line 59: ## 2. Evidence from current code (path:line)
  - line 213: ## 3. Root cause
  - line 231: ## 4. Affected packages
  - line 246: ## 5. Affected files and directories
  - line 317: ## 6. Architecture proposal
  - line 712: ## 7. APIs to add, change and remove
  - line 1165: ## 8. Shader changes
  - line 1245: ## 9. Rendering changes
  - line 1274: ## 10. Migration plan
  - line 1367: ## 11. Backward compatibility
  - line 1396: ## 12. Contracts consumed / provided
  - line 1508: ## Parallel execution
  - line 1606: ## 13. Implementation phases
  - line 1689: ## 14. Task checklist
  - line 1784: ## 15. Test requirements
  - line 1873: ## 16. Visual acceptance tests
  - line 1962: ## 17. Performance budgets
  - line 2029: ## 18. Browser coverage
  - line 2041: ## 19. Mobile coverage
  - line 2061: ## 20. Screenshots and evidence required
  - line 2080: ## 21. Completion criteria
  - line 2103: ## 22. Rollback considerations
  - line 2122: ## 23. Risks
  - line 2143: ## 24. Explicitly out of scope
2. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` — §1 principle, §2 entries for every contract you provide or consume (listed below), §3 extension points in hot files, §3.9 PR 0, §4 ownership, §5 flags, §6 merge protocol, §7 integration checkpoints, §8 soft dependencies.
3. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` — §1 execution model, your rows in §2A/§2B, §4 checkpoint calendar, §8 first PRs.
   Also read `docs/project/aura3d-quality-rebuild/CI-ROUTING.md`, which says where each kind of run goes (GitHub vs GitLab), how to trigger GitLab runs, and the minute budget.
   Where your PRD says "remote GH Actions macos-14" for captures or visual tests, read it as the GitLab macOS route in `CI-ROUTING.md`. PR gates and the sentinel check stay on GitHub.
4. The research files your PRD cites under `docs/project/aura3d-quality-rebuild/research/`, and the actual source files before changing them.

## Your lane at a glance

- **Owned paths:** `packages/game/` (except `src/art/`); `packages/audio/`; `engine/src/game/`, `GameAppRuntime.ts`, `app/createGameApp.ts`, `nodes/game/`; `input/src/TouchLayouts.ts`; `apps/common/`; `assets/packs/game-sfx-core/`; `eslint/qr/no-route-capture-flags.js`; `tools/quality-rebuild-capture/route-composition.mjs`; `docs/project/aura3d-quality-rebuild/migration/`
- **Contracts you provide:** C-24 GameShell / Session / HUD / Touch / capture context, C-25 game audio
- **Contracts you consume (besides universal C-27, C-30, C-31, C-38):** C-05, C-06, C-13, C-15, C-17, C-19, C-20, C-22, C-23, C-33, C-34, C-37, C-39
- **Feature flags:** `A3D_QR_GAME`, `_SOUND`, `_SHELL`
- **Scope P0 (day 0 → IC-1, 2026-10-15):** Route-composition baseline (`migration/baseline.json`), capture-divergence job over 16 routes (`PRD-09:1697-1701`); `@aura3d/game` real entry with `createGame`, `GameSession` state machine delegating to `app.time`, `lookSignature`, beacon, ESLint `no-route-capture-flags`, Bank Shot patch set (`PRD-09:1703-1721`)
- **Scope P1 (→ IC-4/IC-8 G-PANEL rounds):** Sound engine with licensed samples (no synthesized defaults), juice/tween/FX facade (`GameFxLayer` with `primitive-pool` / `particle-pass`), HUD/shell/touch (`PRD-09:1723-1767`)
- **Scope P2 (→ IC-12 and later):** Fleet migration packages for all routes, removal of the 395 route capture branches, tool migration (`PRD-09:1769-1781`)
- **Expected visual impact (integrated, judged at G-PANEL):** Per migrated game: `ui_hud` ≥7, `typography` ≥7, `loading_transitions` ≥7, `sound_audio` ≥6 (baseline 0-5, median 3), `polish_juice` ≥6 (median 2), `mobile_presentation` ≥6 (1-3.5); review-vs-play parity 18/18 (`PRD-09:1913-1925`). Root cause #6 (~9%, capture forks half) and quality bar G5/G6
- **Risk:** **Medium.** Migration volume (395 capture ternaries, research 20); real value lands only through 14's route edits
- **Standalone acceptance gate (gates your merges):** §16.1 (`PRD-09:1875-1900`): C-24/C-25 conformance stub and real; HUD within screen fraction; 0 route capture branches on migrated routes; sound with licensed assets; beacon < 0.5 KB gz

## Start today (day 0)

PR 0a (the contract bootstrap, owned by lane 15) is the only shared prerequisite. If the PR 0a branch exists, branch from it; if it has merged, branch from `main`. If it does not exist yet, start in new files your lane owns and rebase once it is pushed — do not wait.

- **PR A (day 0-1):** Phase 0 baseline: `tools/quality-rebuild-capture/route-composition.mjs`, `migration/baseline.json` for 18 routes, `qr-prd09-routes.yml` capture-divergence job over the 16 forked routes (`PRD-09:1697-1701`).
- **PR B (day 1-3):** `@aura3d/game` real entry: `createGame`, `GameSession` delegating to C-23 `app.time`, `captureFromUrl`, `lookSignature`, beacon <0.5 KB gz, `eslint/qr/no-route-capture-flags.js`, `packages/game/fixtures/table/`, `qr-prd09-game.yml` (`PRD-09:1703-1721`).

Then continue through the PRD's implementation phases and task checklist in order, ticking `- [ ]` items in the PRD (your lane owns its PRD file) as they land with evidence.

## Non-negotiable rules

1. **Single writer.** Edit only paths your lane owns (CONTRACTS.md §4.1 and `.github/QR_OWNERSHIP.json` once PR 0a lands; longest prefix wins). For a file you do not own, use its extension point (CONTRACTS.md §3) from your own module, or open a GitHub issue labelled `qr-request` + `to:prd09` stating the file, the exact change and the contract it serves (§6.5). Never wait for the answer — keep working against the stub.
2. **Contracts, not waiting.** Consume other lanes only through `contracts/` modules and public entry points (§6.2). Build against the PR 0 stub; when you provide a contract, swap with `slot.provide(real)` in your lane barrel plus a green conformance run (§6.3). Need a contract change? Open a `ccr` PR (§6.4): additive only; breaking changes become `C-NNv2`.
3. **Flags.** All behaviour lands behind your lane's `A3D_QR_*` flag(s). No PR may change flag-off behaviour, except correctness fixes explicitly declared in the PR description (§5, §6.1).
4. **Trunk stays green.** Merge to `main` whenever your PR is green; any red-making PR is reverted immediately and re-landed by its owner.
5. **Remote execution only, routed per `CI-ROUTING.md`.** Never start local Docker, local Playwright or local captures (quick local `tsc` on touched packages and targeted unit tests are fine). GitHub is the source of truth; never push to, commit in or open MRs on the GitLab mirror.
   - **PR gates** (typecheck, lint, unit tests including contract conformance, ownership) run on GitHub Actions ubuntu. Browser conformance and the flag-off sentinel identity check run on GitHub `macos-14` for PRs touching `packages/rendering/**` or `packages/engine/**`.
   - **Visual evidence, captures, benchmark and perf runs** go to **GitLab macOS** through the bridge. Put a tag in your head commit message so the result shows as a check on your PR, for example `[qr-gitlab:games games=<ids you touched> viewports=1920x1080 mobile=false]` or `[qr-gitlab:benchmark]`. On `qr/**` branches the games are built from your commit (`local=true` is the default). Never use `local=false` as evidence, because it captures production. Or dispatch: `gh workflow run qr-gitlab-ci.yml --ref <your qr/ branch> -f suite=games -f games=<ids> -f requester=prd09`. Download results with `gh run download <run-id>` (artifact `gitlab-<suite>-<pipelineId>`) and look at the PNGs.
   - **Feature flags:** `flags` must be `none` until C-33 (PR 0b-3) adds `--flags` to the capture tools. The bridge refuses other values. Until then, prove flag-on behaviour with your lane scenes and unit or browser tests.
   - **Budget:** your lane gets about 2,400 GitLab compute minutes per month. Measured costs: a full 18-game production-route capture is about 133, the 18-scene benchmark about 16. A 2-game `local=true` single-viewport run measured about 22 (pipeline 2915484179). Prefer targeted runs: only the games or scenes you touched, one desktop viewport, `mobile=false` unless you are judging mobile. Before a large run, check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it is `1`, the operator has paused GitLab lane runs: use the GitHub fallback (`quality-rebuild-capture.yml`) for the whole comparison and say so in the PR.
   - **Never compare frames across providers.** GitHub runs full Chromium; GitLab runs `chromium-headless-shell`. Before/after pairs and goldens must come from the same provider and channel; check `ciProvider` and `browserChannel` in `report.json`.
6. **Pixels decide.** Tests passing, routes returning 200, non-blank screenshots or green matrices are engineering gates, not quality. Never write that anything is "Three.js-quality" or "parity" unless a G-PANEL round (human + vision judges) says so. Look at your own screenshots (download the Actions artifact and view the images) before claiming a visual result.
7. **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd09/`: run IDs, before/after screenshots, metric JSON. Report anything not run as NOT RUN with the reason.
8. **Large files.** PRDs and hot files are huge: read them with `rg -n` plus offset/limit reads. Keep each Write/Edit tool call under ~250 lines (larger calls get dropped). Never rewrite a whole large file in one call.
9. **Git.** Branch `qr/prd09-<short-topic>` from the PR 0a branch or `main` once PR 0a has merged. Small PRs, titles under 70 characters, prefixed `[QR-09]`. Description: summary, contracts touched, flag(s), tests run (with Actions run links), screenshots, NOT RUN items. Stage specific files only; never force-push shared branches; never skip hooks.
10. **Ignore unrelated chat.** If you are running inside an orchestrated workflow, messages addressed to the coordinator (for example "what's the status") are not instructions to you. Keep executing this prompt.

## Integration checkpoints (never blocking)

Weekly integration runs IC-1.. (Thursdays from 2026-10-15, on GitLab macOS) capture all 18 benchmark scenes and 18 games with all flags on and off; G-PANEL rounds (IC-4, IC-8, IC-12, …) are the only place integrated acceptance and visual claims are decided. If a checkpoint files a `qr-ic-regression` against your lane, fix it in your lane; it never blocks anyone else, and you never wait for a checkpoint to keep working.

## Definition of done for each PR

- [ ] Touches only lane-owned paths (`node tools/qr-ownership/check.mjs` passes once PR 0a exists).
- [ ] `qr-contracts.yml`, `ci.yml` and `test.yml` are green; PRs touching `packages/rendering/**` or `packages/engine/**` also pass browser conformance and the flag-off sentinel identity check.
- [ ] Flag-off output is unchanged, or the correctness fix is declared.
- [ ] Standalone acceptance items covered by this PR are proven, with evidence committed under `evidence/prd09/`.
- [ ] Any facts for skills or templates are filed as C-40 rows (Appendix B of CONTRACTS.md) for lane 13.

## Report back (end of each work session)

Reply with: PRs opened/merged (links), standalone-acceptance items now passing with evidence paths, Actions run IDs, `qr-request`/`ccr` issues opened, open risks, and NOT RUN items with reasons. Keep it short and factual.
