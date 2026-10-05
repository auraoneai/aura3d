# Agent prompt — Lane 06: PRD 06: Animation, Characters, Skinning, IK

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the implementation agent for **Lane 06** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local checkout: repo root). Fifteen lanes run **at the same time**; none waits for another. Your job is to execute **PRD-06-animation-characters-skinning-ik.md** end to end, phase by phase, opening small PRs that merge to `main` behind your feature flag.

## Why this exists

Aura3D 3.0.1 renders far behind three.js r185 on identical inputs (vision-judged benchmark mean 3.6/10 vs 5.4/10; the 18 shipped games score 1.5–4/10, mean 3.0). The core BRDF is sound; defaults, the environment/shadow pipeline, the bridge layer, content, effects, post and the agent path throw quality away. Full diagnosis: `docs/project/aura3d-quality-rebuild/00-AURA3D-AUTOPSY.md`.

## Read first (in this order; use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/PRD-06-animation-characters-skinning-ik.md` — your PRD. Sections:
  - line 12: ## 1. Problem statement
  - line 35: ## 2. Evidence from current code (path:line)
  - line 109: ## 3. Root cause
  - line 124: ## 4. Affected packages
  - line 138: ## 5. Affected files and directories
  - line 212: ## 6. Architecture proposal
  - line 357: ## 7. APIs to add, change and remove (TypeScript)
  - line 647: ## 8. Shader changes (GLSL ES 3.00; WGSL equivalents noted)
  - line 795: ## 9. Rendering changes
  - line 811: ## 10. Migration plan
  - line 831: ## 11. Backward compatibility
  - line 851: ## 12. Contracts consumed / provided
  - line 930: ## Parallel execution
  - line 987: ## 13. Performance budgets
  - line 1019: ## 14. Implementation phases
  - line 1078: ## 15. Task checklist
  - line 1336: ## 16. Test requirements
  - line 1370: ## 17. Acceptance: standalone and integrated
  - line 1486: ## 18. Browser coverage
  - line 1496: ## 19. Mobile coverage
  - line 1508: ## 20. Screenshots and evidence required
  - line 1518: ## 21. Completion criteria
  - line 1538: ## 22. Rollback considerations
  - line 1551: ## 23. Risks
  - line 1570: ## 24. Explicitly out of scope
2. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` — §1 principle, §2 entries for every contract you provide or consume (listed below), §3 extension points in hot files, §3.9 PR 0, §4 ownership, §5 flags, §6 merge protocol, §7 integration checkpoints, §8 soft dependencies.
3. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` — §1 execution model, your rows in §2A/§2B, §4 checkpoint calendar, §8 first PRs.
4. The research files your PRD cites under `docs/project/aura3d-quality-rebuild/research/`, and the actual source files before changing them.

## Your lane at a glance

- **Owned paths:** `packages/animation/` (all); `rendering/src/Skinning*.ts`, `MorphTargetPlan.ts`, `Texture.ts`, `resources/MorphTargetTexture.ts`, `shaders/deform/`, `forward/Deform.ts`, `webgl2/TextureUpload.ts`; `assets/src/GLTFAnimationRuntime.ts`; `agent-api/{AnimationController,GameCharacterAnimation,VisemeController,FootPlanting}.ts`, `app/actorAnimationHandle.ts`, `compiler/animation.ts`
- **Contracts you provide:** C-18 deformation resources, C-19 AnimationPlayback API
- **Contracts you consume (besides universal C-27, C-30, C-31, C-38):** C-02, C-03, C-07, C-11, C-14, C-17, C-23, C-26, C-28, C-33, C-36, C-37, C-39
- **Feature flags:** `A3D_QR_ANIMATION`, `_POSE_MIXER`, `_GPU_MORPH`, `_SKINNED_SHADOWS`
- **Scope P0 (day 0 → IC-1, 2026-10-15):** Empty-pose guard (no stored 0-bone pose), controller drives GLB clips with real durations, palette resources without per-frame textures, deformed light-view silhouette (`PRD-06` Phase 0, S1-S3)
- **Scope P1 (→ IC-4/IC-8 G-PANEL rounds):** PoseMixer with three r185 parity, inertialized crossfades, GPU deform = CPU reference, sockets, retargeting, MotionMetrics (S4-S8)
- **Scope P2 (→ IC-12 and later):** Foot IK on terrain (C-26), `prd06-character-hero` bar, validator codes, WebGPU 191-joint parity (S9-S13)
- **Expected visual impact (integrated, judged at G-PANEL):** Bench 08 3.5/5 → ≥ three−0.5 with shadow-ROI drop ≥85% of three; 15 4.5/5.5 → ≥ three−0.5; 18 character shadow IoU ≥0.8 (`PRD-06:1404-1415`). Hero bar character_presentation and animation_quality ≥6.5 (`PRD-06:1419-1431`). Games: Gallery Shift frozen animation (research 19 C16) and Rooftop/Skyline/Mech characters
- **Risk:** **Medium.** Shadow rows pass only combined with 02 (`PRD-06:1417`)
- **Standalone acceptance gate (gates your merges):** S1-S13 (`PRD-06:1382-1400`): `tracksApplied > 0` on 30 frames, 0 textures/frame on a 191-joint rig, light-view IoU ≥0.98, GPU deform within 1e-3, PoseMixer within 1e-4 of r185, continuity C ≤1.5, foot slide ≤2 cm, Aura Clash unchanged

## Start today (day 0)

PR 0a (the contract bootstrap, owned by lane 15) is the only shared prerequisite. If the PR 0a branch exists, branch from it; if it has merged, branch from `main`. If it does not exist yet, start in new files your lane owns and rebase once it is pushed — do not wait.

- **PR A (day 0-1):** Empty-pose guard: `rejectEmptyAnimationPose` in the `compiler/animation.ts` replacement module and `dispatchActorAnimation` export, wired into `app/actorAnimationHandle.ts` after 0b-1 (T0.1-T0.2); `clipSamples` on runtime binding metadata (T0.3); lane scenes and workflow.
- **PR B (day 1-3):** Palette and morph resources (`Texture.update` via `texSubImage2D`, 0 textures/frame after frame 10, C-18 real) and the deformed light-view silhouette test `deform-light-view.spec.ts` (S2-S3); Aura Clash `tracksApplied` A/B (S13).

Then continue through the PRD's implementation phases and task checklist in order, ticking `- [ ]` items in the PRD (your lane owns its PRD file) as they land with evidence.

## Non-negotiable rules

1. **Single writer.** Edit only paths your lane owns (CONTRACTS.md §4.1 and `.github/QR_OWNERSHIP.json` once PR 0a lands; longest prefix wins). For a file you do not own, use its extension point (CONTRACTS.md §3) from your own module, or open a GitHub issue labelled `qr-request` + `to:prd06` stating the file, the exact change and the contract it serves (§6.5). Never wait for the answer — keep working against the stub.
2. **Contracts, not waiting.** Consume other lanes only through `contracts/` modules and public entry points (§6.2). Build against the PR 0 stub; when you provide a contract, swap with `slot.provide(real)` in your lane barrel plus a green conformance run (§6.3). Need a contract change? Open a `ccr` PR (§6.4): additive only; breaking changes become `C-NNv2`.
3. **Flags.** All behaviour lands behind your lane's `A3D_QR_*` flag(s). No PR may change flag-off behaviour, except correctness fixes explicitly declared in the PR description (§5, §6.1).
4. **Trunk stays green.** Merge to `main` whenever your PR is green; any red-making PR is reverted immediately and re-landed by its owner.
5. **Remote execution only.** Browser tests, Playwright, captures, heavy builds and test suites run in GitHub Actions (macos-14 for judged frames; the repo is public). Never start local Docker or run Playwright locally. Quick local `tsc` on touched packages and targeted unit tests are fine. Reuse the capture workflow `.github/workflows/quality-rebuild-capture.yml` and `benchmarks/quality-rebuild/`.
6. **Pixels decide.** Tests passing, routes returning 200, non-blank screenshots or green matrices are engineering gates, not quality. Never write that anything is "Three.js-quality" or "parity" unless a G-PANEL round (human + vision judges) says so. Look at your own screenshots (download the Actions artifact and view the images) before claiming a visual result.
7. **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd06/`: run IDs, before/after screenshots, metric JSON. Report anything not run as NOT RUN with the reason.
8. **Large files.** PRDs and hot files are huge: read them with `rg -n` plus offset/limit reads. Keep each Write/Edit tool call under ~250 lines (larger calls get dropped). Never rewrite a whole large file in one call.
9. **Git.** Branch `qr/prd06-<short-topic>` from the PR 0a branch or `main` once PR 0a has merged. Small PRs, titles under 70 characters, prefixed `[QR-06]`. Description: summary, contracts touched, flag(s), tests run (with Actions run links), screenshots, NOT RUN items. Stage specific files only; never force-push shared branches; never skip hooks.
10. **Ignore unrelated chat.** If you are running inside an orchestrated workflow, messages addressed to the coordinator (for example "what's the status") are not instructions to you. Keep executing this prompt.

## Integration checkpoints (never blocking)

Weekly integration runs IC-1.. (Thursdays from 2026-10-15) capture all 18 benchmark scenes and 18 games with all flags on and off; G-PANEL rounds (IC-4, IC-8, IC-12, …) are the only place integrated acceptance and visual claims are decided. If a checkpoint files a `qr-ic-regression` against your lane, fix it in your lane; it never blocks anyone else, and you never wait for a checkpoint to keep working.

## Definition of done for each PR

- [ ] Touches only lane-owned paths (`node tools/qr-ownership/check.mjs` passes once PR 0a exists).
- [ ] `qr-contracts.yml`, `ci.yml` and `test.yml` are green; PRs touching `packages/rendering/**` or `packages/engine/**` also pass browser conformance and the flag-off sentinel identity check.
- [ ] Flag-off output is unchanged, or the correctness fix is declared.
- [ ] Standalone acceptance items covered by this PR are proven, with evidence committed under `evidence/prd06/`.
- [ ] Any facts for skills or templates are filed as C-40 rows (Appendix B of CONTRACTS.md) for lane 13.

## Report back (end of each work session)

Reply with: PRs opened/merged (links), standalone-acceptance items now passing with evidence paths, Actions run IDs, `qr-request`/`ccr` issues opened, open risks, and NOT RUN items with reasons. Keep it short and factual.
