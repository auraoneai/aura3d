# Agent prompt — Lane 03: PRD 03: Postprocessing, Anti-Aliasing, Tone Mapping, Cinematic Pipeline

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the implementation agent for **Lane 03** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local checkout: repo root). Fifteen lanes run **at the same time**; none waits for another. Your job is to execute **PRD-03-postprocessing-aa-tonemap-cinematic.md** end to end, phase by phase, opening small PRs that merge to `main` behind your feature flag.

## Why this exists

Aura3D 3.0.1 renders far behind three.js r185 on identical inputs (vision-judged benchmark mean 3.6/10 vs 5.4/10; the 18 shipped games score 1.5–4/10, mean 3.0). The core BRDF is sound; defaults, the environment/shadow pipeline, the bridge layer, content, effects, post and the agent path throw quality away. Full diagnosis: `docs/project/aura3d-quality-rebuild/00-AURA3D-AUTOPSY.md`.

## Read first (in this order; use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/PRD-03-postprocessing-aa-tonemap-cinematic.md` — your PRD. Sections:
  - line 46: ## 1. Problem statement
  - line 88: ## 2. Evidence from current code (path:line)
  - line 215: ## 3. Root cause
  - line 238: ## 4. Affected packages
  - line 257: ## 5. Affected files and directories
  - line 380: ## 6. Architecture proposal
  - line 874: ## 7. APIs to add, change, remove
  - line 1088: ## 8. Shader changes (GLSL ES 3.00; WGSL mirrors in Phase 7)
  - line 1237: ## 9. Rendering changes
  - line 1290: ## 10. Migration plan
  - line 1339: ## 11. Backward compatibility
  - line 1361: ## 12. Contracts consumed / provided
  - line 1469: ## Parallel execution
  - line 1606: ## 13. Implementation phases
  - line 1764: ## 14. Task checklist
  - line 2073: ## 15. Test requirements
  - line 2143: ## 16. Visual acceptance tests
  - line 2214: ## Standalone acceptance (gates lane 03 merges and the `standalone-accepted` flag state)
  - line 2249: ## Integrated acceptance (evaluated at CONTRACTS §7 checkpoints; never blocks a merge)
  - line 2275: ## 17. Performance budgets
  - line 2305: ## 18. Browser coverage
  - line 2323: ## 19. Mobile coverage
  - line 2341: ## 20. Screenshots and evidence required
  - line 2361: ## 21. Completion criteria
  - line 2376: ## 22. Rollback considerations
  - line 2393: ## 23. Risks
  - line 2418: ## 24. Explicitly out of scope
2. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` — §1 principle, §2 entries for every contract you provide or consume (listed below), §3 extension points in hot files, §3.9 PR 0, §4 ownership, §5 flags, §6 merge protocol, §7 integration checkpoints, §8 soft dependencies.
3. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` — §1 execution model, your rows in §2A/§2B, §4 checkpoint calendar, §8 first PRs.
   Also read `docs/project/aura3d-quality-rebuild/CI-ROUTING.md`, which says where each kind of run goes (GitHub vs GitLab), how to trigger GitLab runs, and the minute budget.
   Where your PRD says "remote GH Actions macos-14" for captures or visual tests, read it as the GitLab macOS route in `CI-ROUTING.md`. PR gates and the sentinel check stay on GitHub.
4. The research files your PRD cites under `docs/project/aura3d-quality-rebuild/research/`, and the actual source files before changing them.

## Your lane at a glance

- **Owned paths:** `rendering/src/{post,postprocess,reference}/`, `renderer/PostprocessExecution.ts`, `forward/Velocity.ts`, `webgl2/LegacyPost.ts`, `cinematic/{Bloom,Vignette,FilmGrain,DepthHaze}Pass.ts`, `RendererPostprocessPlan.ts`, `PostProcessPass.ts`, `TemporalHistory.ts`; `agent-api/{postBridge,postPresets}.ts`, `compiler/postprocess.ts`, `nodes/effects.post.ts`; `apps/postprocessing-*`
- **Contracts you provide:** C-13 PostPass registry + presets, C-14 velocity / temporal history
- **Contracts you consume (besides universal C-27, C-30, C-31, C-38):** C-01, C-02, C-04, C-05, C-08, C-18, C-22, C-23, C-28, C-36, C-39
- **Feature flags:** `A3D_QR_POST`, `_TAA`, `_SSR`, `_AO`, `_DOF`
- **Scope P0 (day 0 → IC-1, 2026-10-15):** Phase 0 scaffolding and truthful `post`/`exposure` sections; Phase 1 fixes on the existing chain: wired exposure, real depth range, tier AA (never FXAA on MSAA), r185 FXAA port + dither (`PRD-03:1621-1659`)
- **Scope P1 (→ IC-4/IC-8 G-PANEL rounds):** PostGraph with HDR ordering, bloom V2 (real threshold, no ×7 gain), linear composite into OutputPass, display LUT; GTAO; no CPU readback (Deep Recovery) (`PRD-03:1661-1665`, S9-S13)
- **Scope P2 (→ IC-12 and later):** TAA/TAAU, motion blur, DOF, SMAA, auto-exposure, presets, WGSL mirrors (S14-S20)
- **Expected visual impact (integrated, judged at G-PANEL):** Post benchmark scenes (02, 03, 06, 08, 09, 13, 15, 16, 18) Aura ≥ three−0.5 with no post-attributable major class; games: tone_mapping / anti_aliasing / postprocessing ≥ baseline in 18/18 and **+1.5 mean**, AA ≥6 at DSF2 (`PRD-03:2263-2264`). Deep Recovery median frame 849.9 ms → ≤50 ms with god rays (S12). Root cause #9 (~7%); fleet post mean 2.9
- **Risk:** **Medium.** Bundle growth (S19, I14); TAA on skinned content needs 06's C-18/C-14
- **Standalone acceptance gate (gates your merges):** S1-S20 (`PRD-03:2223-2244`): one tone operator per pixel; ACES ramp ΔE2000 mean ≤1.0 vs three; FXAA crawl ≤1.2× three; bloom halo ∝ excess ±10%; 0 `readPixels` over 300 frames in all 18 games

## Start today (day 0)

PR 0a (the contract bootstrap, owned by lane 15) is the only shared prerequisite. If the PR 0a branch exists, branch from it; if it has merged, branch from `main`. If it does not exist yet, start in new files your lane owns and rebase once it is pushed — do not wait.

- **PR A (day 0-1):** Phase 0: lane barrels with thin real C-13/C-14 slots, `post`/`exposure` diagnostics reporting what executes on the legacy chain, `post/ToneOperators.ts` with goldens, `prd03-*` scenes, `post-quality.yml` + `qr-prd03-captures.yml`, `post-v2` codemod in report mode; baseline 18 games × DSF1/DSF2/mobile (`PRD-03:1621-1638`).
- **PR B (day 1-3):** Phase 1 in own modules, wired after 0b-1/0b-2: exposure wired in `compiler/postprocess.ts`, real depth range, tier AA (never FXAA on MSAA), `webgl2/LegacyPost.ts` present split with the r185 FXAA port + triangular dither; exit ACES ramp ΔE2000 mean ≤1.0 vs three (`PRD-03:1640-1659`).

Then continue through the PRD's implementation phases and task checklist in order, ticking `- [ ]` items in the PRD (your lane owns its PRD file) as they land with evidence.

## Non-negotiable rules

1. **Single writer.** Edit only paths your lane owns (CONTRACTS.md §4.1 and `.github/QR_OWNERSHIP.json` once PR 0a lands; longest prefix wins). For a file you do not own, use its extension point (CONTRACTS.md §3) from your own module, or open a GitHub issue labelled `qr-request` + `to:prd03` stating the file, the exact change and the contract it serves (§6.5). Never wait for the answer — keep working against the stub.
2. **Contracts, not waiting.** Consume other lanes only through `contracts/` modules and public entry points (§6.2). Build against the PR 0 stub; when you provide a contract, swap with `slot.provide(real)` in your lane barrel plus a green conformance run (§6.3). Need a contract change? Open a `ccr` PR (§6.4): additive only; breaking changes become `C-NNv2`.
3. **Flags.** All behaviour lands behind your lane's `A3D_QR_*` flag(s). No PR may change flag-off behaviour, except correctness fixes explicitly declared in the PR description (§5, §6.1).
4. **Trunk stays green.** Merge to `main` whenever your PR is green; any red-making PR is reverted immediately and re-landed by its owner.
5. **Remote execution only, routed per `CI-ROUTING.md`.** Never start local Docker, local Playwright or local captures (quick local `tsc` on touched packages and targeted unit tests are fine). GitHub is the source of truth; never push to, commit in or open MRs on the GitLab mirror.
   - **PR gates** (typecheck, lint, unit, conformance, ownership) run on GitHub Actions ubuntu. The flag-off sentinel identity check runs on GitHub `macos-14`.
   - **Visual evidence, captures, benchmark and perf runs** go to **GitLab macOS** through the bridge. Add a tag to your head commit message so the result shows as a check on your PR, for example `[qr-gitlab:games games=<ids you touched> flags=<your flag>]` or `[qr-gitlab:benchmark]`. Or dispatch: `gh workflow run qr-gitlab-ci.yml --ref <branch> -f suite=games -f games=<ids> -f qr_flags=<flags> -f requester=prd03`. Download results with `gh run download <run-id>` (artifact `gitlab-<suite>-<pipelineId>`).
   - **Budget:** your lane gets about 2,400 GitLab compute minutes per month. A full 18-game capture costs about 150 and the benchmark about 42, so prefer targeted runs: only the games or scenes you touched, one viewport. If the group's monthly usage is above 85%, use the GitHub fallback (`quality-rebuild-capture.yml`) and say so in the PR.
   - **Never compare frames across providers.** GitHub runs full Chromium; GitLab runs `chromium-headless-shell`. Before/after pairs and goldens must come from the same provider and channel; check `ciProvider` and `browserChannel` in `report.json`.
6. **Pixels decide.** Tests passing, routes returning 200, non-blank screenshots or green matrices are engineering gates, not quality. Never write that anything is "Three.js-quality" or "parity" unless a G-PANEL round (human + vision judges) says so. Look at your own screenshots (download the Actions artifact and view the images) before claiming a visual result.
7. **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd03/`: run IDs, before/after screenshots, metric JSON. Report anything not run as NOT RUN with the reason.
8. **Large files.** PRDs and hot files are huge: read them with `rg -n` plus offset/limit reads. Keep each Write/Edit tool call under ~250 lines (larger calls get dropped). Never rewrite a whole large file in one call.
9. **Git.** Branch `qr/prd03-<short-topic>` from the PR 0a branch or `main` once PR 0a has merged. Small PRs, titles under 70 characters, prefixed `[QR-03]`. Description: summary, contracts touched, flag(s), tests run (with Actions run links), screenshots, NOT RUN items. Stage specific files only; never force-push shared branches; never skip hooks.
10. **Ignore unrelated chat.** If you are running inside an orchestrated workflow, messages addressed to the coordinator (for example "what's the status") are not instructions to you. Keep executing this prompt.

## Integration checkpoints (never blocking)

Weekly integration runs IC-1.. (Thursdays from 2026-10-15, on GitLab macOS) capture all 18 benchmark scenes and 18 games with all flags on and off; G-PANEL rounds (IC-4, IC-8, IC-12, …) are the only place integrated acceptance and visual claims are decided. If a checkpoint files a `qr-ic-regression` against your lane, fix it in your lane; it never blocks anyone else, and you never wait for a checkpoint to keep working.

## Definition of done for each PR

- [ ] Touches only lane-owned paths (`node tools/qr-ownership/check.mjs` passes once PR 0a exists).
- [ ] `qr-contracts.yml`, `ci.yml` and `test.yml` are green; PRs touching `packages/rendering/**` or `packages/engine/**` also pass browser conformance and the flag-off sentinel identity check.
- [ ] Flag-off output is unchanged, or the correctness fix is declared.
- [ ] Standalone acceptance items covered by this PR are proven, with evidence committed under `evidence/prd03/`.
- [ ] Any facts for skills or templates are filed as C-40 rows (Appendix B of CONTRACTS.md) for lane 13.

## Report back (end of each work session)

Reply with: PRs opened/merged (links), standalone-acceptance items now passing with evidence paths, Actions run IDs, `qr-request`/`ccr` issues opened, open risks, and NOT RUN items with reasons. Keep it short and factual.
