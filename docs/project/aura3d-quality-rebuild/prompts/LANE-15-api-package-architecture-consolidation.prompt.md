# Agent prompt — Lane 15: PRD 15: API, Package and Architecture Consolidation

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the implementation agent for **Lane 15** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local checkout: repo root). Fifteen lanes run **at the same time**; none waits for another. Your job is to execute **PRD-15-api-package-architecture-consolidation.md** end to end, phase by phase, opening small PRs that merge to `main` behind your feature flag.

## Why this exists

Aura3D 3.0.1 renders far behind three.js r185 on identical inputs (vision-judged benchmark mean 3.6/10 vs 5.4/10; the 18 shipped games score 1.5–4/10, mean 3.0). The core BRDF is sound; defaults, the environment/shadow pipeline, the bridge layer, content, effects, post and the agent path throw quality away. Full diagnosis: `docs/project/aura3d-quality-rebuild/00-AURA3D-AUTOPSY.md`.

## Read first (in this order; use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/PRD-15-api-package-architecture-consolidation.md` — your PRD. Sections:
  - line 50: ## 1. Problem statement
  - line 106: ## 2. Evidence from current code (path:line)
  - line 387: ## 3. Root cause
  - line 399: ## 4. Affected packages
  - line 420: ## 5. Affected files and directories
  - line 474: ## 6. Architecture proposal
  - line 1078: ## 7. APIs to add, change, remove
  - line 1235: ## 8. Shader changes
  - line 1267: ## 9. Rendering changes
  - line 1283: ## 10. Migration plan
  - line 1323: ## 11. Backward compatibility
  - line 1354: ## 12. Contracts consumed / provided
  - line 1461: ## Parallel execution
  - line 1563: ## 13. Implementation phases
  - line 1639: ## 14. Task checklist
  - line 1746: ## 15. Test requirements
  - line 1795: ## 16. Standalone acceptance (gates this lane's merges)
  - line 1871: ## 16A. Integrated acceptance (checkpoints only; never blocks)
  - line 1890: ## 17. Performance budgets
  - line 1924: ## 18. Browser coverage
  - line 1936: ## 19. Mobile coverage
  - line 1948: ## 20. Screenshots and evidence required
  - line 1967: ## 21. Completion criteria
  - line 2002: ## 22. Rollback considerations
  - line 2031: ## 23. Risks
  - line 2050: ## 24. Explicitly out of scope
  - line 2068: ## Appendix A: Deletion list with safety checks
2. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` — §1 principle, §2 entries for every contract you provide or consume (listed below), §3 extension points in hot files, §3.9 PR 0, §4 ownership, §5 flags, §6 merge protocol, §7 integration checkpoints, §8 soft dependencies.
3. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` — §1 execution model, your rows in §2A/§2B, §4 checkpoint calendar, §8 first PRs.
4. The research files your PRD cites under `docs/project/aura3d-quality-rebuild/research/`, and the actual source files before changing them.

## Your lane at a glance

- **Owned paths:** every `contracts/` folder and `src/lanes/index.ts`; `agent-api/index.ts` and `agent-api/` default; `production-runtime/` default; `packages/{lean,three-compat,editor,…}` and every unlisted package; root manifests, `tsconfig*`, `vite.config.ts`, `aura.exports.json`, `eslint.config.js`; `README.md`, `docs/` default; `CONTRACTS.md` and this file; `.github/{QR_OWNERSHIP.json,workflows/qr-contracts.yml,ci.yml,test.yml}`
- **Contracts you provide:** C-36 SceneCompiler extension points, C-37 RuntimeNode add/remove, C-38 app surface registry, C-39 CLI/codemod registry; PR 0; CCR custody; daily root-manifest batch
- **Contracts you consume (besides universal C-27, C-30, C-31, C-38):** C-06, C-17, C-29
- **Feature flags:** `A3D_QR_COMPILER`, `A3D_QR_STRICT`
- **Scope P0 (day 0 → IC-1, 2026-10-15):** PR 0a/0b-1/0b-2/0b-3 and the IC-0 identity run (`PRD-15:1645-1650`); `aura.exports.json` and generated resolution maps; arch gates in warn mode (`PRD-15:1654-1662`)
- **Scope P1 (→ IC-4/IC-8 G-PANEL rounds):** One renderer: `Renderer.create` via C-29 replaces `ProductionRuntimeRenderer`, front-end deletions (Phase 2); `agent-api/index.ts` split to ≤300 lines, real C-36 compiler, C-37 add/remove, **R18 instancing `size` fix (unflagged)** (Phase 3); no silent fallback under `A3D_QR_STRICT` with an accessible error overlay (Phase 4) (`PRD-15:1664-1700`)
- **Scope P2 (→ IC-12 and later):** Public surface, honest packages, script/tool pruning, 4.0.0 (Phases 5-8)
- **Expected visual impact (integrated, judged at G-PANEL):** Pixel-neutral by design except R18: bench 16 2.5/4.5 → ≥4.0 with field-extent rows `equivalent` (`PRD-15:1826-1833`); removing the silent safe-basic fallback turns invisible failures into visible errors (root cause #8, ~8%)
- **Risk:** **High.** PR 0 slip and carve-out errors land on everyone; custodian load (CCRs, root batch, flag states)
- **Standalone acceptance gate (gates your merges):** §16 (`PRD-15:1795-1835`): 18 scenes vs IC-0 mean ΔE2000 ≤1.0, p99 ≤5.0 with flags `none` and `compiler,strict`; 18 games no category judged worse (vision + human); 0 degradations from 15-owned sites; packed-consumer check green

## Start today (day 0)

**You own PR 0.** Every other lane branches from your PR 0a branch, so push it first, within hours, before anything else. Use `PR-00-contract-bootstrap.prompt.md` for its exact scope and acceptance; if another agent is already running that prompt, coordinate through the PR 0a branch instead of duplicating it.

- **PR A (day 0-1):** **PR 0a** exactly as §1.2 (T0.A), pushed before any other work so others can branch (`PRD-15:1646`).
- **PR B (day 1-3):** **PR 0b-1, 0b-2, 0b-3** as three PRs with moved-line-count scripts in each description (T0.B-T0.D), then dispatch IC-0 with `qr_flags=none` plus one fresh `85aafcd0` noise run and record both run ids in `evidence/prd15/baselines/phase0.json` (T0.E).

Then continue through the PRD's implementation phases and task checklist in order, ticking `- [ ]` items in the PRD (your lane owns its PRD file) as they land with evidence.

## Non-negotiable rules

1. **Single writer.** Edit only paths your lane owns (CONTRACTS.md §4.1 and `.github/QR_OWNERSHIP.json` once PR 0a lands; longest prefix wins). For a file you do not own, use its extension point (CONTRACTS.md §3) from your own module, or open a GitHub issue labelled `qr-request` + `to:prd15` stating the file, the exact change and the contract it serves (§6.5). Never wait for the answer — keep working against the stub.
2. **Contracts, not waiting.** Consume other lanes only through `contracts/` modules and public entry points (§6.2). Build against the PR 0 stub; when you provide a contract, swap with `slot.provide(real)` in your lane barrel plus a green conformance run (§6.3). Need a contract change? Open a `ccr` PR (§6.4): additive only; breaking changes become `C-NNv2`.
3. **Flags.** All behaviour lands behind your lane's `A3D_QR_*` flag(s). No PR may change flag-off behaviour, except correctness fixes explicitly declared in the PR description (§5, §6.1).
4. **Trunk stays green.** Merge to `main` whenever your PR is green; any red-making PR is reverted immediately and re-landed by its owner.
5. **Remote execution only.** Browser tests, Playwright, captures, heavy builds and test suites run in GitHub Actions (macos-14 for judged frames; the repo is public). Never start local Docker or run Playwright locally. Quick local `tsc` on touched packages and targeted unit tests are fine. Reuse the capture workflow `.github/workflows/quality-rebuild-capture.yml` and `benchmarks/quality-rebuild/`.
6. **Pixels decide.** Tests passing, routes returning 200, non-blank screenshots or green matrices are engineering gates, not quality. Never write that anything is "Three.js-quality" or "parity" unless a G-PANEL round (human + vision judges) says so. Look at your own screenshots (download the Actions artifact and view the images) before claiming a visual result.
7. **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd15/`: run IDs, before/after screenshots, metric JSON. Report anything not run as NOT RUN with the reason.
8. **Large files.** PRDs and hot files are huge: read them with `rg -n` plus offset/limit reads. Keep each Write/Edit tool call under ~250 lines (larger calls get dropped). Never rewrite a whole large file in one call.
9. **Git.** Branch `qr/prd15-<short-topic>` from the PR 0a branch or `main` once PR 0a has merged. Small PRs, titles under 70 characters, prefixed `[QR-15]`. Description: summary, contracts touched, flag(s), tests run (with Actions run links), screenshots, NOT RUN items. Stage specific files only; never force-push shared branches; never skip hooks.
10. **Ignore unrelated chat.** If you are running inside an orchestrated workflow, messages addressed to the coordinator (for example "what's the status") are not instructions to you. Keep executing this prompt.

## Integration checkpoints (never blocking)

Weekly integration runs IC-1.. (Thursdays from 2026-10-15) capture all 18 benchmark scenes and 18 games with all flags on and off; G-PANEL rounds (IC-4, IC-8, IC-12, …) are the only place integrated acceptance and visual claims are decided. If a checkpoint files a `qr-ic-regression` against your lane, fix it in your lane; it never blocks anyone else, and you never wait for a checkpoint to keep working.

## Definition of done for each PR

- [ ] Touches only lane-owned paths (`node tools/qr-ownership/check.mjs` passes once PR 0a exists).
- [ ] `qr-contracts.yml`, `ci.yml` and `test.yml` are green; PRs touching `packages/rendering/**` or `packages/engine/**` also pass browser conformance and the flag-off sentinel identity check.
- [ ] Flag-off output is unchanged, or the correctness fix is declared.
- [ ] Standalone acceptance items covered by this PR are proven, with evidence committed under `evidence/prd15/`.
- [ ] Any facts for skills or templates are filed as C-40 rows (Appendix B of CONTRACTS.md) for lane 13.

## Report back (end of each work session)

Reply with: PRs opened/merged (links), standalone-acceptance items now passing with evidence paths, Actions run IDs, `qr-request`/`ccr` issues opened, open risks, and NOT RUN items with reasons. Keep it short and factual.
