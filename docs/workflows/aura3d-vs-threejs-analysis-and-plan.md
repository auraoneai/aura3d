# Aura3D vs three.js: analysis and execution plan

Status: v1, 2026-10-24. Agent-handoff PRD (policy section 6). Inputs: `aura3d-vs-threejs-matrix.md` (54-row capability matrix), `evidence/vs-threejs/RESULTS.md` (measured, software GL), `aura3d-only-audit.md`, `threejs-parity-gaps.md`, `evidence/live-slam/`, `evidence/perf-frame-cost/`.

## 0. Bottom line

- Aura3D is better as an authoring and agent workflow layer: less scene source, one import, typed nodes, asset provenance, QA/replay hooks, a self-healing safety net, agent docs and skills, a Meshy pipeline, and a codemod from three.js.
- three.js is better as a runtime and ecosystem: bundle size, requests, time to first frame, frame cost on software GL, material and post-processing breadth, WebGPU, TSL breadth, maturity, field testing, and a stock `vite build` that works.
- No claim in this document is real-GPU evidence. Every timing is software WebGL2 (SwiftShader). Three games were seen on the owner's M4 Max.
- The plan below attacks the measurable losses first (build, bundle, frame cost, silent no-ops, missing environment files), then widens capability.

## 1. Where each side wins (measured or counted)

### 1.1 three.js wins

| Area | Measured | Source |
|---|---|---|
| Bundle, one cube, JS only | 495.7 KB raw / 124.8 KB gzip vs 3,841 KB / 1,089 KB (7.7x / 8.7x) | RESULTS 4 |
| Requests on load | 2 vs 26 (25 JS files) | RESULTS 5 |
| Time to first frame (cube) | 95 ms vs 3,269 ms | RESULTS 6 |
| Frame time, software GL | cube 0.9 ms vs 623 ms before 4.1.3 perf work; 50 ms after (`a816facf6`) | RESULTS 7, perf-frame-cost |
| Draw calls / programs | equal or lower in most rows (game loop 19 vs 38) | RESULTS 8 |
| Stock build | `vite build` works; Aura3D 4.1.2 needed a plugin, an extra package and a config file | RESULTS 12.1 |
| First-try authoring success | 3 edits vs 7, 0 vs 2 silent wrong-API uses (one author, not independent) | RESULTS 13 |
| Breadth | TSL about 638 names vs 62; 8 non-PBR material types; GTAO/SSR/SSGI; WebGPU; WebXR; many loaders | matrix 1.1, 1.2 |
| Maturity | about 15.2M vs about 391 weekly downloads; 314 vs 42 versions | matrix 1.6 (snapshot) |

### 1.2 Aura3D wins

| Area | Measured or counted | Source |
|---|---|---|
| Scene source lines | viewer 24 vs 49, forest 49 vs 71, character 45 vs 62, game loop 61 vs 82 | RESULTS 1 |
| Import modules, API symbols | 1 vs up to 8 modules; fewer symbols in every scene | RESULTS 3 |
| Out-of-box features | bloom, shadows, instancing with colour, fixed-step loop, QA hooks, shader pass, cue bank, scatter and merge | RESULTS 11 |
| Safety | provenance-gated asset bridge, black-frame self-heal, shader failures reported loudly | matrix rows 7, 30 |
| Agent workflow | `llms.txt`, boundaries doc, 24 synced skills, `check-deploy`, evidence collection, catalog of 652 assets, Meshy ledger | matrix 1.4, 1.5 |
| Migration | codemod: 245 rows (21 exact, 174 approximate, 47 none, 3 pending) | matrix row 42 |
| Verified in production | 26 games on the 4.x lineage; Aura Slam native port with replay and render gates; live route check 119 draw calls, 0 console errors | evidence/live-slam |

### 1.3 Ties and unknowns

Shader water picture identical (JSD 0.0000); game-loop replay hashes identical; PBR, lights, primitives, instancing and helpers at parity. Real-GPU performance, WebGPU, mobile, compute and the game-kit HUD were not measured.

## 2. Root causes behind the losses

1. **Build failure.** `@aura3d/assets` ships `threejs-compatibility/ThreeCompatAssetRegistry` which imports `node:fs`; Vite stubs it as `__vite-browser-external`, so `readFileSync` is not exported. A browser build must not reach that module.
2. **Bundle size.** The engine root pulls the whole package graph (186 live exports, 66 deprecated); 25 JS files are fetched for one cube. `BUNDLE_SIZES.md` records the critical path at 3.9 MB against a 190 KB budget; the repo already fails its own budget.
3. **Frame cost** (fixed in part, `a816facf6`): dead-branch tone-map shader (about 600 ms to about 31 ms equivalent), instance tessellation, per-instance allocation in bounds code. Open: three shadow cascades, 4x MSAA RGBA16F default, shadow draws at 64 instances per call.
4. **Silent no-ops.** `primitives.plane({ params: { widthSegments } })` type-checks and is ignored; `interactions.orbit` takes only `{ target?: string }` and accepts anything behind a cast.
5. **Missing runtime files.** `/aura-environments/neutral.manifest.json` 404s in apps built from published packages; the baked files live only in the repo `public/aura-environments`.
6. **Legacy post chain.** `POSTPROCESS_V2_UNMIGRATED` warning and 25-40% darker frames when post is on (`packages/rendering/src/renderer/PostprocessExecution.ts`, `packages/rendering/src/Renderer.ts`).
7. **Verification gap.** No real-GPU runner; about 106-116 baseline unit-test failures.

## 3. Codebase grounding and autonomous decisions

- Decision D1: keep the three.js-compatible renderer lineage. A ground-up renderer is out of scope; the wins above come from API, tooling and safety, not from a new renderer.
- D2: fix losses in this order: build, silent no-ops and 404 (cheap, high agent-impact), bundle, frame cost, then capability breadth.
- D3: do not add a WebGPU default in this plan. Track it as a separate decision after real-GPU evidence exists.
- D4: every public claim stays labelled per `docs/agents/claims-and-boundaries.md`; software-GL numbers are never presented as GPU numbers.
- D5: release as 4.1.3 for fixes only; promote to 4.2.0 only if public exports or defaults change (the WP-6 environment default and WP-5 diagnostics likely do not).
- Invariants: `tests/unit/agent-api/public-example-boundary.test.ts` stays green (no raw GLB URLs or renderer-internal imports in public examples); draw-call budget 150 for Aura Slam; replay gates G1 and G3 stay green; tracked file count stays under 15,000 for Vercel.

## 4. File-by-file breakdown

| Path | Action | Change |
|---|---|---|
| `packages/assets/src/threejs-compatibility/ThreeCompatAssetRegistry.ts` | MODIFY | Remove top-level `node:fs` use from the browser-reachable path (dynamic import behind a Node-only entry) |
| `packages/assets/package.json`, `packages/engine/package.json` | MODIFY | `exports` conditions (`browser`/`node`) and `sideEffects` so the registry is not bundled for browsers |
| `packages/create-aura3d/templates/{mini-game,racing-starter,falling-blocks-starter}/package-lock.json` | MODIFY | Regenerate so `npm ci` matches `package.json` |
| `packages/engine/src/agent-api/nodes/primitives.ts` | MODIFY | Honour `widthSegments`/`heightSegments` on `plane` (and box/sphere) or emit a diagnostic naming the ignored field |
| `packages/engine/src/agent-api/nodes/interactions.ts` | MODIFY | Reject or warn on unknown `orbit` options; document `target` is a node name |
| `packages/engine/src/devtools/environments/EnvironmentRegistry.ts` | MODIFY | Resolve `neutral` without a network fetch (inline the SH9 and a small specular) or ship the files in the package |
| `packages/rendering/src/renderer/PostprocessExecution.ts`, `packages/rendering/src/Renderer.ts` | MODIFY | Migrate the legacy post chain onto PostGraph; remove `POSTPROCESS_V2_UNMIGRATED` and the darkening |
| `packages/rendering/src/renderer/*` (shadow system) | MODIFY | Per-pixel cascade selection; raise shadow draw batch size; profile switch for MSAA |
| `packages/engine/src/public/index.ts` | MODIFY | Retire or move the 66 deprecated exports behind subpaths (breaking: needs 4.2) |
| `BUNDLE_SIZES.md`, `tools/bench-vs-threejs/**` | MODIFY | Re-run on the new build; add Aura3D-with-fix rows; add a real-GPU lane when available |
| `docs/workflows/aura3d-vs-threejs-matrix.md`, `evidence/vs-threejs/RESULTS.md` | MODIFY | Refresh numbers; update rows 48, 49, 9, 12 after each WP lands |
| `packages/engine/src/agent-api/nodes/effects*.ts` | CREATE/MODIFY | `effects.toon` pass (promotion candidate 11); Matcap and Lambert material builders |
| `tests/unit/**` for each WP | CREATE | One focused test file per WP (names below) |

## 5. Parallelizable work packages

Each package has a disjoint owner path. Never run `pnpm`; run vitest by file; browsers only via `tools/remote-acr/run.sh`.

- **WP-1 Stock build (in flight, `fix-stock-build`).** Steps: trace browser-reachable `node:fs` imports; split Node-only code; add `exports` conditions; remove the need for `@aura3d/assets/vite` and a stub plugin; fix template lockfiles. Test: `tests/unit/build/stock-vite-build.test.ts` plus a remote `vite build` of the cube app and the `mini-game` template from published tarballs. Edge cases: Vite 7.3.2 and 7.3.7, npm `ci`, pnpm.
- **WP-2 Silent no-ops and 404.** Steps: implement or diagnose plane segments; validate orbit options; make `neutral` environment self-contained. Tests: `tests/unit/agent-api/plane-segments.test.ts`, `orbit-options.test.ts`, `environment-neutral-offline.test.ts`. Edge cases: segments of 0 or 1, huge segments (cap with diagnostic), offline apps.
- **WP-3 Bundle size.** Steps: measure the import graph with a per-module size report; make heavy subsystems (animation, audio, physics, devtools, WebGPU path, legacy post) lazy or subpath-only; set `sideEffects` precisely. Target: cube app at or under 1.5 MB raw JS and under 10 requests in stage 1; at or under 800 KB raw in stage 2. Gate: `BUNDLE_SIZES.md` budgets pass or are re-baselined with a written reason.
- **WP-4 Frame cost and defaults.** Steps: per-pixel cascade selection; shadow draw batching; document and expose the MSAA and HDR target policy as a named profile; re-run `tools/bench-vs-threejs` on the new build (bench builds against published, so publish 4.1.3 first or point it at a packed tarball). Target: forest scene completes within the 55-minute limit; cube within 2x of three.js 4x MSAA on software GL.
- **WP-5 Legacy post chain.** Steps: migrate chain to PostGraph; update expected pixels for the 25-40% darkening; remove the warning. Tests: existing post specs plus a luma-delta regression test. Ship in 4.2.0 because default output changes.
- **WP-6 Capability breadth.** Steps in order: `effects.toon`; Matcap and Lambert; camera rigs (promotion candidate 10); expand `tsl` names from the codemod `none`/`approximate` rows. Each lands with a typed node, docs under `docs/api/`, and a codemod row update.
- **WP-7 Real-GPU verification.** Steps: obtain a hardware-GPU runner under the serverless-first policy (or have the owner run a short checklist on the M4 Max: Drift world, Silt rings, Last Train Enter/E/W, native Tennis); re-run the bench there; record under `evidence/real-gpu/`. Never label software-GL results as GPU.
- **WP-8 Independent authoring trial.** Steps: a fresh agent with no repo context writes the five bench scenes in both libraries from `llms.txt` and the types only; count edits, silent no-ops and blocking failures; replace RESULTS section 13. Success: Aura3D edits at or under three.js edits.
- **WP-9 Test baseline.** Steps: triage the 106-116 baseline failures into fix, delete (removed features), or quarantine with a reason; goal is a green unit suite in CI-equivalent remote run.
- **WP-10 Aura Slam follow-ups.** Portrait framing needs a camera change gated by G3 (the 15 degree FOV is pinned); Phase 2 modes (tournament, tour, online) remain deferred; deploy `259acdd14` with the next release.

## 6. Verification and acceptance checklist

- [ ] WP-1: a clean app importing only `@aura3d/engine` builds with `npx vite build` and no extra plugin; template `npm ci` succeeds.
- [ ] WP-2: `vitest run tests/unit/agent-api/plane-segments.test.ts tests/unit/agent-api/orbit-options.test.ts tests/unit/agent-api/environment-neutral-offline.test.ts` passes; a built app logs no `ENV_FETCH_FAILED`.
- [ ] WP-3: `node tools/bench-vs-threejs/...` bundle table shows the stage target; `BUNDLE_SIZES.md` gate passes or carries a written re-baseline.
- [ ] WP-4: remote bench run shows forest completes; cube frame within the stated ratio; numbers recorded as software GL.
- [ ] WP-5: no `POSTPROCESS_V2_UNMIGRATED` in any bench console log; luma regression test passes.
- [ ] WP-6: new nodes typed, documented, and covered by the codemod table.
- [ ] WP-7: `evidence/real-gpu/` exists with device, driver and frames, or the owner checklist is recorded as answered.
- [ ] WP-8: new RESULTS section 13 written by an independent run.
- [ ] Always: `vitest run tests/unit/agent-api/public-example-boundary.test.ts`; Aura Slam G1 and G3 gates; tracked file count under 15,000; `tools/release/publish-all.mjs --dry-run` clean before any publish; no `.github/workflows`; no local Docker or Playwright.
- [ ] After each release: refresh the matrix rows and the RESULTS tables, and re-verify the live site from a clean-worktree deploy.

## 7. What not to claim

- Not "faster than three.js": every measured frame row favours three.js on software GL.
- Not "smaller": the bundle is 7.7x to 8.7x larger today.
- Not "drop-in": the codemod is 21 exact rows of 245.
- Fair to claim: less scene source for most scenes, one import, built-in QA and safety tooling, agent documentation, and asset provenance, each with the numbers above and the software-GL caveat.
