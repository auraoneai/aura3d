# Agent prompt — Lane 11: PRD 11: WebGPU, GPU Architecture and Performance Tiers

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the implementation agent for **Lane 11** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local checkout: repo root). Fifteen lanes run **at the same time**; none waits for another. Your job is to execute **PRD-11-webgpu-gpu-architecture-performance-tiers.md** end to end, phase by phase, opening small PRs that merge to `main` behind your feature flag.

## Why this exists

Aura3D 3.0.1 renders far behind three.js r185 on identical inputs (vision-judged benchmark mean 3.6/10 vs 5.4/10; the 18 shipped games score 1.5–4/10, mean 3.0). The core BRDF is sound; defaults, the environment/shadow pipeline, the bridge layer, content, effects, post and the agent path throw quality away. Full diagnosis: `docs/project/aura3d-quality-rebuild/00-AURA3D-AUTOPSY.md`.

## Read first (in this order; use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/PRD-11-webgpu-gpu-architecture-performance-tiers.md` — your PRD. Sections:
  - line 13: ## 1. Problem statement
  - line 52: ## 2. Evidence from current code
  - line 165: ## 3. Root cause
  - line 182: ## 4. Affected packages
  - line 197: ## 5. Affected files and directories
  - line 244: ## 6. Architecture proposal
  - line 415: ## 7. APIs to add, change and remove
  - line 667: ## 8. Shader changes
  - line 721: ## 9. Rendering changes
  - line 801: ## 10. Migration plan
  - line 815: ## 11. Backward compatibility
  - line 829: ## 12. Contracts consumed / provided
  - line 929: ## Parallel execution
  - line 995: ## 13. Implementation phases
  - line 1039: ## 14. Task checklist
  - line 1152: ## 15. Test requirements
  - line 1181: ## 16. Acceptance: standalone and integrated
  - line 1240: ## 17. Performance budgets
  - line 1297: ## 18. Browser coverage
  - line 1311: ## 19. Mobile coverage
  - line 1320: ## 20. Screenshots and evidence required
  - line 1337: ## 21. Completion criteria
  - line 1357: ## 22. Rollback considerations
  - line 1369: ## 23. Risks
  - line 1390: ## 24. Explicitly out of scope
2. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` — §1 principle, §2 entries for every contract you provide or consume (listed below), §3 extension points in hot files, §3.9 PR 0, §4 ownership, §5 flags, §6 merge protocol, §7 integration checkpoints, §8 soft dependencies.
3. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` — §1 execution model, your rows in §2A/§2B, §4 checkpoint calendar, §8 first PRs.
   Also read `docs/project/aura3d-quality-rebuild/CI-ROUTING.md`, which says where each kind of run goes (GitHub vs GitLab), how to trigger GitLab runs, and the minute budget.
   Where your PRD says "remote GH Actions macos-14" for captures or visual tests, read it as the GitLab macOS route in `CI-ROUTING.md`. PR gates and the sentinel check stay on GitHub.
4. The research files your PRD cites under `docs/project/aura3d-quality-rebuild/research/`, and the actual source files before changing them.

## Your lane at a glance

- **Owned paths:** `rendering/src/{quality,batching,webgpu}/` (except `WebGPUPostShaders.ts`), `renderer/{CullingBatching,RendererFactory,DeviceLifecycle}.ts`, `forward/DrawSubmit.ts`, `webgl2/{Probe,Counters,ContextLifecycle,MultiDraw}.ts`, `program/UniformLayout.ts`, `resources/{ResourceRegistry,RenderTargetPool}.ts`, `RenderDevice.ts`, `WebGPUDevice.ts`, `RendererTiming.ts`; `GameRenderPreset.ts`, `RootPerformanceQuality.ts`, `app/rendererOptions.ts`; `tools/{perf-gate,wgsl-validate,bundle-size}/`
- **Contracts you provide:** C-27 QualityTier settings, C-28 device caps / counters / FrameStats, C-29 renderer factory + device lifecycle
- **Contracts you consume (besides universal C-27, C-30, C-31, C-38):** C-01, C-02, C-04, C-07, C-11, C-14, C-18, C-36
- **Feature flags:** `A3D_QR_TIERS`, `_GOVERNOR`, `_BATCHING`; `A3D_QR_WEBGPU`
- **Scope P0 (day 0 → IC-1, 2026-10-15):** Measured telemetry: `FrameStats` (no constant 60), GPU timer scopes, C-28 counters, device probe, `prd11-tier-ladder`, `qr-prd11-perf.yml`, bundle `--splitting` baseline (`PRD-11:1041-1054`); WebGPU freeze: delete fake shading and CPU rasterizer, sync readback throws (`PRD-11:1056-1071`); no CPU readback guard (`:1073`)
- **Scope P1 (→ IC-4/IC-8 G-PANEL rounds):** Batching with pixel identity and multi-draw (Phase 3); tier table and governor (Phase 4); context-loss restore (Phase 5) (`PRD-11:1081-1133`)
- **Scope P2 (→ IC-12 and later):** Phases 6-8 WebGPU rebuild only if gate G-WGPU passes at a G-PANEL checkpoint (`PRD-11:262-285, 1135`)
- **Expected visual impact (integrated, judged at G-PANEL):** No direct pixel gain; protects pixels while buying frame time: Deep Recovery 1080p p50 1,917 ms → ≤50 ms, then ≤33 ms (I3); governor holds p50 ≤33 ms on Patrol Wing, Turbo Drift, Gravity Post (I5); mobile backing 390×844 → 585×1266 on all 18 (V9); Low tier overall ≥ High−1.5 (V5); no game category drop >0.5 under forced Medium (V6) (`PRD-11:1204-1231`). Root cause #10 (~5%, a floor because judged frames were DSF 1)
- **Risk:** **Medium.** Real-device access for tier claims; pressure to ship WebGPU before G-WGPU
- **Standalone acceptance gate (gates your merges):** S1-S12 (`PRD-11:1185-1199`): engine fps within 10% of rAF counter; counters change exactly when operations run; batching SSIM ≥0.999 and ≤2/255; `prd11-draw-call-stress` ≤110 draws; governor recovery within 1,500 frames; context restore ≤2 s at SSIM ≥0.98

## Start today (day 0)

PR 0a (the contract bootstrap, owned by lane 15) is the only shared prerequisite. If the PR 0a branch exists, branch from it; if it has merged, branch from `main`. If it does not exist yet, start in new files your lane owns and rebase once it is pushed — do not wait.

- **PR A (day 0-1):** Phase 0 telemetry: `quality/FrameStats.ts`, GPU timer `scope()` in `RendererTiming.ts`, `webgl2/Counters.ts`, `webgl2/Probe.ts` + `quality/DeviceProbe.ts`, C-31 `frame` section, `fps-agreement.spec.ts`, `prd11-tier-ladder`, `qr-prd11-perf.yml`, bundle `--splitting` baseline (`PRD-11:1041-1054`).
- **PR B (day 1-3):** Phase 1 WebGPU freeze: delete `productProp*` gates, `rasterizeDraw`/`rasterizeTriangle`, CPU-shadowed readbacks (throw `WEBGPU_SYNC_READBACK_UNSUPPORTED`), flat-colour WGSL fallbacks (throw `WGSL_PROGRAM_MISSING`), `NodeMaterial.ts`; `quality/PostprocessGuard.ts` (`PRD-11:1056-1075`).

Then continue through the PRD's implementation phases and task checklist in order, ticking `- [ ]` items in the PRD (your lane owns its PRD file) as they land with evidence.

## Non-negotiable rules

1. **Single writer.** Edit only paths your lane owns (CONTRACTS.md §4.1 and `.github/QR_OWNERSHIP.json` once PR 0a lands; longest prefix wins). For a file you do not own, use its extension point (CONTRACTS.md §3) from your own module, or open a GitHub issue labelled `qr-request` + `to:prd11` stating the file, the exact change and the contract it serves (§6.5). Never wait for the answer — keep working against the stub.
2. **Contracts, not waiting.** Consume other lanes only through `contracts/` modules and public entry points (§6.2). Build against the PR 0 stub; when you provide a contract, swap with `slot.provide(real)` in your lane barrel plus a green conformance run (§6.3). Need a contract change? Open a `ccr` PR (§6.4): additive only; breaking changes become `C-NNv2`.
3. **Flags.** All behaviour lands behind your lane's `A3D_QR_*` flag(s). No PR may change flag-off behaviour, except correctness fixes explicitly declared in the PR description (§5, §6.1).
4. **Trunk stays green.** Merge to `main` whenever your PR is green; any red-making PR is reverted immediately and re-landed by its owner.
5. **Remote execution only, routed per `CI-ROUTING.md`.** Never start local Docker, local Playwright or local captures (quick local `tsc` on touched packages and targeted unit tests are fine). GitHub is the source of truth; never push to, commit in or open MRs on the GitLab mirror.
   - **PR gates** (typecheck, lint, unit tests including contract conformance, ownership) run on GitHub Actions ubuntu. Browser conformance and the flag-off sentinel identity check run on GitHub `macos-14` for PRs touching `packages/rendering/**` or `packages/engine/**`.
   - **Visual evidence, captures, benchmark and perf runs** go to **GitLab macOS** through the bridge. Put a tag in your head commit message so the result shows as a check on your PR, for example `[qr-gitlab:games games=<ids you touched> viewports=1920x1080 mobile=false]` or `[qr-gitlab:benchmark]`. On `qr/**` branches the games are built from your commit (`local=true` is the default). Never use `local=false` as evidence, because it captures production. Or dispatch: `gh workflow run qr-gitlab-ci.yml --ref <your qr/ branch> -f suite=games -f games=<ids> -f requester=prd11`. Download results with `gh run download <run-id>` (artifact `gitlab-<suite>-<pipelineId>`) and look at the PNGs.
   - **Feature flags:** `flags` must be `none` until C-33 (PR 0b-3) adds `--flags` to the capture tools. The bridge refuses other values. Until then, prove flag-on behaviour with your lane scenes and unit or browser tests.
   - **Budget:** your lane gets about 2,400 GitLab compute minutes per month. Measured costs: a full 18-game production-route capture is about 133, the 18-scene benchmark about 16. Local-build runs cost more, because they pull LFS and build the games. Prefer targeted runs: only the games or scenes you touched, one desktop viewport, `mobile=false` unless you are judging mobile. Before a large run, check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it is `1`, the operator has paused GitLab lane runs: use the GitHub fallback (`quality-rebuild-capture.yml`) for the whole comparison and say so in the PR.
   - **Never compare frames across providers.** GitHub runs full Chromium; GitLab runs `chromium-headless-shell`. Before/after pairs and goldens must come from the same provider and channel; check `ciProvider` and `browserChannel` in `report.json`.
6. **Pixels decide.** Tests passing, routes returning 200, non-blank screenshots or green matrices are engineering gates, not quality. Never write that anything is "Three.js-quality" or "parity" unless a G-PANEL round (human + vision judges) says so. Look at your own screenshots (download the Actions artifact and view the images) before claiming a visual result.
7. **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd11/`: run IDs, before/after screenshots, metric JSON. Report anything not run as NOT RUN with the reason.
8. **Large files.** PRDs and hot files are huge: read them with `rg -n` plus offset/limit reads. Keep each Write/Edit tool call under ~250 lines (larger calls get dropped). Never rewrite a whole large file in one call.
9. **Git.** Branch `qr/prd11-<short-topic>` from the PR 0a branch or `main` once PR 0a has merged. Small PRs, titles under 70 characters, prefixed `[QR-11]`. Description: summary, contracts touched, flag(s), tests run (with Actions run links), screenshots, NOT RUN items. Stage specific files only; never force-push shared branches; never skip hooks.
10. **Ignore unrelated chat.** If you are running inside an orchestrated workflow, messages addressed to the coordinator (for example "what's the status") are not instructions to you. Keep executing this prompt.

## Integration checkpoints (never blocking)

Weekly integration runs IC-1.. (Thursdays from 2026-10-15, on GitLab macOS) capture all 18 benchmark scenes and 18 games with all flags on and off; G-PANEL rounds (IC-4, IC-8, IC-12, …) are the only place integrated acceptance and visual claims are decided. If a checkpoint files a `qr-ic-regression` against your lane, fix it in your lane; it never blocks anyone else, and you never wait for a checkpoint to keep working.

## Definition of done for each PR

- [ ] Touches only lane-owned paths (`node tools/qr-ownership/check.mjs` passes once PR 0a exists).
- [ ] `qr-contracts.yml`, `ci.yml` and `test.yml` are green; PRs touching `packages/rendering/**` or `packages/engine/**` also pass browser conformance and the flag-off sentinel identity check.
- [ ] Flag-off output is unchanged, or the correctness fix is declared.
- [ ] Standalone acceptance items covered by this PR are proven, with evidence committed under `evidence/prd11/`.
- [ ] Any facts for skills or templates are filed as C-40 rows (Appendix B of CONTRACTS.md) for lane 13.

## Report back (end of each work session)

Reply with: PRs opened/merged (links), standalone-acceptance items now passing with evidence paths, Actions run IDs, `qr-request`/`ccr` issues opened, open risks, and NOT RUN items with reasons. Keep it short and factual.
