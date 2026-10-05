# Agent prompt — Lane 01: PRD 01: Rendering Core, Scene Graph, Color, HDR, PBR

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the implementation agent for **Lane 01** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local checkout: repo root). Fifteen lanes run **at the same time**; none waits for another. Your job is to execute **PRD-01-rendering-core-color-hdr-pbr.md** end to end, phase by phase, opening small PRs that merge to `main` behind your feature flag.

## Why this exists

Aura3D 3.0.1 renders far behind three.js r185 on identical inputs (vision-judged benchmark mean 3.6/10 vs 5.4/10; the 18 shipped games score 1.5–4/10, mean 3.0). The core BRDF is sound; defaults, the environment/shadow pipeline, the bridge layer, content, effects, post and the agent path throw quality away. Full diagnosis: `docs/project/aura3d-quality-rebuild/00-AURA3D-AUTOPSY.md`.

## Read first (in this order; use `rg -n '^#'` and offset/limit reads)

1. `docs/project/aura3d-quality-rebuild/PRD-01-rendering-core-color-hdr-pbr.md` — your PRD. Sections:
  - line 12: ## 1. Problem statement
  - line 28: ## 2. Evidence from current code (path:line)
  - line 126: ## 3. Root cause
  - line 139: ## 4. Affected packages
  - line 149: ## 5. Affected files and directories
  - line 192: ## 6. Architecture proposal
  - line 348: ## 7. APIs to add, change, remove
  - line 593: ## 8. Shader changes (GLSL level; WGSL twins by lane 11 through C-02 `ShaderChunk.wgsl`)
  - line 778: ## 9. Rendering changes (frame level)
  - line 791: ## 10. Per-recommendation impact
  - line 813: ## 11. Migration plan
  - line 833: ## 12. Backward compatibility
  - line 860: ## 13. Contracts consumed / provided
  - line 952: ## 13A. Parallel execution
  - line 995: ## 14. Implementation phases
  - line 1048: ## 15. Task checklist
  - line 1157: ## 16. Test requirements
  - line 1182: ## 17. Acceptance: standalone and integrated
  - line 1289: ## 18. Browser coverage
  - line 1302: ## 19. Performance budgets
  - line 1329: ## 20. Mobile coverage
  - line 1336: ## 21. Screenshots and evidence required
  - line 1350: ## 22. Completion criteria
  - line 1364: ## 23. Rollback considerations
  - line 1373: ## 24. Risks
  - line 1395: ## 25. Explicitly out of scope
2. `docs/project/aura3d-quality-rebuild/CONTRACTS.md` — §1 principle, §2 entries for every contract you provide or consume (listed below), §3 extension points in hot files, §3.9 PR 0, §4 ownership, §5 flags, §6 merge protocol, §7 integration checkpoints, §8 soft dependencies.
3. `docs/project/aura3d-quality-rebuild/AURA3D-QUALITY-MASTER-PLAN.md` — §1 execution model, your rows in §2A/§2B, §4 checkpoint calendar, §8 first PRs.
4. The research files your PRD cites under `docs/project/aura3d-quality-rebuild/research/`, and the actual source files before changing them.

## Your lane at a glance

- **Owned paths:** `packages/rendering/` default: `Renderer.ts`, `ForwardPass.ts`, `WebGL2Device.ts`, `WebGL2StateCache.ts`, `renderer/` (incl. `FrameGraph.ts`), `forward/`, `webgl2/`, `program/`, `output/`, `resources/`, `shaders/`, frozen `ShaderLibrary*.ts`/`ShaderChunks.ts`, `BRDFLut.ts`, `BlendModes.ts`, `ResolutionGovernor.ts`; `agent-api/{sceneGraph,color}.ts`, `compiler/{sceneGraph,color}.ts`; `tools/{shader-lint,quality-rebuild-codemods}/`
- **Contracts you provide:** C-01 FrameGraph hooks, C-02 ProgramFeatures/chunk registry/ProgramCache, C-04 blend/render state, C-05 output (HDR target, tone map, exposure), C-06 scene graph + color, C-07 primitives + InstanceBuffer, C-08 frame UBOs + CameraLike
- **Contracts you consume (besides universal C-27, C-30, C-31, C-38):** C-03, C-18, C-28, C-29, C-36, C-39
- **Feature flags:** `A3D_QR_CORE` (`off`\|`v2`), `_OUTPUT`, `_GENERATOR`
- **Scope P0 (day 0 → IC-1, 2026-10-15):** Lane scenes + `qr-prd01-core.yml`; scene-graph composition, primitives with caps and tessellation, color parser, instance composition (C-06/C-07); blend modes (C-04); DPR policy `min(2, tier cap)` (`PRD-01:999-1017`)
- **Scope P1 (→ IC-4/IC-8 G-PANEL rounds):** UBOs → ProgramKey → chunks → ProgramGenerator/ProgramCache (C-02/C-08); FrameGraph split with `sceneDepthCopy` (C-01); HDR end-to-end + OutputPass, single tone map + single sRGB encode (C-05) (`PRD-01:1019-1034`)
- **Scope P2 (→ IC-12 and later):** Tone-map default A/B (ACES vs AgX) from G-PANEL; submission perf (0 GL objects/frame); flag removal deleting `u_outputColorSpace` and legacy programs (`PRD-01:1036-1046`)
- **Expected visual impact (integrated, judged at G-PANEL):** Bench 01 3.5/4.5 → ≥4.0 no bug class; 02 plinth fixed; 06 4/7 → ≥5.0 (with 02); 13 faceting gone; 16 2.5/4.5 → ≥ three−0.5 (with R18); joint with 02/03/04: every scene within 1.0 of three (`PRD-01:1211-1249`). Games: "low resolution/soft" complaint gone on 14 DPR≤1 games; Deep Recovery fps ≥10× IC-0 (`PRD-01:1254-1259`). Root causes #8/#10 (~8%/~5%)
- **Risk:** **High.** Generator + lobes are the hardest ceiling (`00-AURA3D-AUTOPSY.md:78, 177-179`); every chunk-based lane is invisible on production draws until C-02 is real
- **Standalone acceptance gate (gates your merges):** S1-S14 (`PRD-01:1190-1209`): conformance real = stub, flag-off bit-identical; hierarchy IoU ≥0.98; primitive cap IoU ≥0.97; blend MAD ≤2/255 vs three; generator-only program keys on 18 scenes; BRDF within 1e-3 of r185; tone ramp ΔE2000 ≤2 (mean ≤1); 0 compiles after ready

## Start today (day 0)

PR 0a (the contract bootstrap, owned by lane 15) is the only shared prerequisite. If the PR 0a branch exists, branch from it; if it has merged, branch from `main`. If it does not exist yet, start in new files your lane owns and rebase once it is pushed — do not wait.

- **PR A (day 0-1):** Lane scaffolding: six `prd01-*` scene specs with Aura and three adapters in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd01/`; `tests/qr/prd01/metrics/{maskIoU,regionSsim,deltaE2000,temporalSigma}.ts`; `.github/workflows/qr-prd01-core.yml`; C-31 sections `output/resolution/programs/frameAllocations` with observed values or `null`; `diagnosticOnly.prd01.ts` (`PRD-01:1052-1059`).
- **PR B (day 1-3):** Scene graph + primitives behind `A3D_QR_CORE`: `agent-api/{sceneGraph,color}.ts`, `geometry/Primitives.ts` with real cylinder/capsule caps and tessellation, `resources/InstanceBuffer.ts` with `world · instance · geometry`; exit `prd01-scene-graph-hierarchy` IoU ≥0.98 and `prd01-primitive-catalog` cap IoU ≥0.97 (`PRD-01:1003-1009`).

Then continue through the PRD's implementation phases and task checklist in order, ticking `- [ ]` items in the PRD (your lane owns its PRD file) as they land with evidence.

## Non-negotiable rules

1. **Single writer.** Edit only paths your lane owns (CONTRACTS.md §4.1 and `.github/QR_OWNERSHIP.json` once PR 0a lands; longest prefix wins). For a file you do not own, use its extension point (CONTRACTS.md §3) from your own module, or open a GitHub issue labelled `qr-request` + `to:prd01` stating the file, the exact change and the contract it serves (§6.5). Never wait for the answer — keep working against the stub.
2. **Contracts, not waiting.** Consume other lanes only through `contracts/` modules and public entry points (§6.2). Build against the PR 0 stub; when you provide a contract, swap with `slot.provide(real)` in your lane barrel plus a green conformance run (§6.3). Need a contract change? Open a `ccr` PR (§6.4): additive only; breaking changes become `C-NNv2`.
3. **Flags.** All behaviour lands behind your lane's `A3D_QR_*` flag(s). No PR may change flag-off behaviour, except correctness fixes explicitly declared in the PR description (§5, §6.1).
4. **Trunk stays green.** Merge to `main` whenever your PR is green; any red-making PR is reverted immediately and re-landed by its owner.
5. **Remote execution only.** Browser tests, Playwright, captures, heavy builds and test suites run in GitHub Actions (macos-14 for judged frames; the repo is public). Never start local Docker or run Playwright locally. Quick local `tsc` on touched packages and targeted unit tests are fine. Reuse the capture workflow `.github/workflows/quality-rebuild-capture.yml` and `benchmarks/quality-rebuild/`.
6. **Pixels decide.** Tests passing, routes returning 200, non-blank screenshots or green matrices are engineering gates, not quality. Never write that anything is "Three.js-quality" or "parity" unless a G-PANEL round (human + vision judges) says so. Look at your own screenshots (download the Actions artifact and view the images) before claiming a visual result.
7. **Honest evidence.** Commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prd01/`: run IDs, before/after screenshots, metric JSON. Report anything not run as NOT RUN with the reason.
8. **Large files.** PRDs and hot files are huge: read them with `rg -n` plus offset/limit reads. Keep each Write/Edit tool call under ~250 lines (larger calls get dropped). Never rewrite a whole large file in one call.
9. **Git.** Branch `qr/prd01-<short-topic>` from the PR 0a branch or `main` once PR 0a has merged. Small PRs, titles under 70 characters, prefixed `[QR-01]`. Description: summary, contracts touched, flag(s), tests run (with Actions run links), screenshots, NOT RUN items. Stage specific files only; never force-push shared branches; never skip hooks.
10. **Ignore unrelated chat.** If you are running inside an orchestrated workflow, messages addressed to the coordinator (for example "what's the status") are not instructions to you. Keep executing this prompt.

## Integration checkpoints (never blocking)

Weekly integration runs IC-1.. (Thursdays from 2026-10-15) capture all 18 benchmark scenes and 18 games with all flags on and off; G-PANEL rounds (IC-4, IC-8, IC-12, …) are the only place integrated acceptance and visual claims are decided. If a checkpoint files a `qr-ic-regression` against your lane, fix it in your lane; it never blocks anyone else, and you never wait for a checkpoint to keep working.

## Definition of done for each PR

- [ ] Touches only lane-owned paths (`node tools/qr-ownership/check.mjs` passes once PR 0a exists).
- [ ] `qr-contracts.yml`, `ci.yml` and `test.yml` are green; PRs touching `packages/rendering/**` or `packages/engine/**` also pass browser conformance and the flag-off sentinel identity check.
- [ ] Flag-off output is unchanged, or the correctness fix is declared.
- [ ] Standalone acceptance items covered by this PR are proven, with evidence committed under `evidence/prd01/`.
- [ ] Any facts for skills or templates are filed as C-40 rows (Appendix B of CONTRACTS.md) for lane 13.

## Report back (end of each work session)

Reply with: PRs opened/merged (links), standalone-acceptance items now passing with evidence paths, Actions run IDs, `qr-request`/`ccr` issues opened, open risks, and NOT RUN items with reasons. Keep it short and factual.
