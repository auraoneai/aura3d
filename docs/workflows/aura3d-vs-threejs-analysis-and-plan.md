# Making Aura3D the better choice: superiority thesis and execution plan

Status: v2, 2026-10-24; statuses refreshed against main the same day. Agent-handoff PRD (policy section 6). Replaces v1, which was a competitor scorecard. Inputs: `aura3d-vs-threejs-matrix.md`, `evidence/vs-threejs/RESULTS.md`, `aura3d-only-audit.md`, `threejs-parity-gaps.md`, `evidence/live-slam/`, `evidence/perf-frame-cost/`, `docs/aura-slam/ARCHITECTURE.md`.

Claims discipline (`docs/agents/claims-and-boundaries.md` applies): every number here is software WebGL2 (SwiftShader) or counted from source, never real-GPU. A target is a target until `evidence/` holds a run that meets it.

## 0. The thesis

three.js is a rendering library: it draws what you tell it, and everything around drawing (assets, UI, input, audio, testing, deploy, art) is yours to assemble. Aura3D wins by being the shortest, safest path from an idea to a shipped, verified, good-looking browser 3D game or product scene, for a person or an AI agent.

**Positioning line (testable):** "Describe it, get a scene that renders, ships, and proves itself." Developers do not choose engines on triangle throughput; they choose on time to a working thing, how rarely it breaks, and how little they must glue together. That is where Aura3D already leads and where it can lead by a wide margin.

We do not win by matching three.js on every axis. We win by (1) being clearly best at four things nobody else does, and (2) removing the few dealbreakers that stop a developer from ever getting to those four things.

## 1. The four pillars where Aura3D should be unmistakably better

### Pillar A: Time to a shipped game (the whole pipeline, not just rendering)

What exists today (verified in repo): `create-aura3d` templates (mini-game, racing, falling-blocks, fighting, character-controller), game kit (HUD, touch, juice, session), QA/replay hooks, fixed-step loop, seeded RNG, audio cue bank, scatter/merge, shader chunk library, typed asset bridge, `check-deploy`, 26 games on the 4.x lineage, Aura Slam as a complete native port.

The superiority claim to earn: from `npm create aura3d` to a deployed, playable, mobile-ready game with sound and HUD in under 30 minutes, with no glue code. three.js has no equivalent for HUD, touch, session, audio synth, replay, or deploy checks; every three.js game re-writes them (our own ports hand-rolled them nine times before we promoted them).

Measure: **time-to-first-playable (TTFP)** and **glue lines** (lines that are not scene, rules, or art). Baseline from the bench game-loop scene: 61 vs 82 scene lines, and the three.js side needed hand-written fixed timestep, hooks and HUD.

### Pillar B: Agent-native authoring (AI writes it, and it works first time)

What exists: `llms.txt`, boundary and claims docs, 24 mirrored skills with a gate, typed declarative scene API, codemod from three.js, evidence and review loop, catalog of 652 assets, Meshy pipeline with caps and provenance.

The superiority claim to earn: a coding agent working only from `llms.txt` and types produces a correct scene on the first try more often with Aura3D than with three.js. Today the only trial (RESULTS section 13) favoured three.js, mainly because of a build failure and two silent no-ops. Those are fixable, and fixing them turns this pillar into a measured win. This is the biggest differentiator for 2026 developers: most of them now build with agents.

Measure: **first-try success rate** and **edits-to-green** over a fixed scene suite, run by an independent agent with no repo context (WP-8).

### Pillar C: Safe by construction (things that silently break in three.js fail loudly or self-heal here)

What exists: black-frame self-heal with quality ladder and `?diag=1`, loud custom-shader failures, NaN-safe math chunks (found on real Apple hardware), provenance-gated production assets (same-origin, sha256, else nothing draws), diagnostics for ignored options (to be extended), draw-call and asset budgets in `check-deploy`.

The superiority claim to earn: a shipped Aura3D game cannot go black, load an unvetted asset, or fail a shader in silence. In three.js those are the classic launch-day bugs. We found and fixed six of them on real devices during this program; that history is the proof, and it must be presented as a feature, not hidden.

Measure: **silent-failure count** in a fault-injection suite (black frame, bad shader, missing asset, NaN uniform, empty instance array) that Aura3D catches and three.js does not (WP-6 builds the suite).

### Pillar D: Verified quality (provable, repeatable, deterministic)

What exists: deterministic replay (Aura Slam simulation bit-identical in differential tests, HEATSINK to 1e-6, identical replay hashes across libraries), render parity gates (G1 replay, G3 render within a draw-call budget), blind judge protocol, evidence folders, live-site verification per release.

The superiority claim to earn: Aura3D games ship with machine-checkable evidence (replay hash, render gate, route health). No other web 3D stack ships a test and evidence story at all. For studios and for agents this removes the "does it still work?" fear on every change.

Measure: games shipped with replay gate plus render gate plus `check-deploy` green (today: Aura Slam; target: all 15 index games).

## 2. Dealbreakers to remove first (a developer who hits these never reaches the pillars)

Each is measured, reproducible, and currently loses developers in the first hour. These come before any new feature.

| # | Dealbreaker | Evidence | Fix | WP |
|---|---|---|---|---|
| D1 | Stock `vite build` of `@aura3d/engine@4.1.2` fails on `node:fs` in `ThreeCompatAssetRegistry`; shipped template fails the same way and its lockfile is out of sync | RESULTS 12.1, 12.2 | Browser-safe `exports`, no Node-only import on the browser path, regenerated lockfiles | WP-1: import fix on main (`04b7726ef`), remote smoke pending |
| D2 | Options that type-check and do nothing (`plane` segments, `orbit` options) | RESULTS 12.4, 12.5 | Implement or reject with a diagnostic naming the field; lint rule for ignored options | WP-2 |
| D3 | 404 on `/aura-environments/neutral.manifest.json` in every app from published packages | RESULTS 12.3 | Self-contained neutral environment, no fetch | WP-2 |
| D4 | 2.9 MB over 25 requests for a cube; 7.7x to 8.7x three.js | RESULTS 4, 5 | Lazy and subpath-only heavy subsystems; precise `sideEffects` | WP-3 |
| D5 | Slow first frame and software-GL frame cost | RESULTS 6, 7; perf-frame-cost already cut the cube from 666 ms to 50 ms and forest 38 s to 6.4 s | Cascade selection, shadow batching, named MSAA/HDR profiles | WP-4 |
| D6 | Legacy post chain: warning plus 25-40% darker frames | RESULTS 12.6; parity doc | Migrate to PostGraph | WP-5 |
| D7 | No real-GPU proof | matrix row 52 | Hardware runner or owner checklist | WP-7 |

Exit criterion for this layer: an independent agent can `npm create aura3d`, build, and deploy with zero workarounds, with no console errors, and the cube app loads under the stage-1 bundle target (section 5).

## 3. Differentiators to build (the part that attracts developers)

Ordered by developer pull per unit effort. All reuse existing code (promotion survey `/tmp/promote-candidates.md` and the 4.1.x kits).

1. **One-command game from a prompt.** `aura3d new game "<prompt>"` selects a genre kit, scaffolds typed assets (catalog, then Meshy through Kiro Prism with a credit cap and provenance), wires HUD, touch, audio, replay and `check-deploy`, runs the look-dev loop and reports evidence. Builds on `create-aura3d`, `scene kits`, `meshy-cli`, `aura3d-evidence-review`. This is the demo that no other engine can match.
2. **Live playground with agent mode.** Browser editor on aura3d.auraone.ai: edit scene source, hot reload, one-click share, "fix with agent" using `llms.txt` plus diagnostics. Lowers the first-hour cost to zero install.
3. **Showcase as proof.** The 15 index games plus 11 ports become the front door: each page shows source size, bundle size, draw calls, evidence badge (replay and render gate status) and a "view source" link. Honest per-game disclosure text already exists; add metrics automatically from `evidence/`.
4. **Fault-injection and safety page.** A public page that breaks a scene on purpose (black frame, bad shader, bad asset) and shows Aura3D reporting or healing it, with the same fault in raw three.js beside it. Turns Pillar C into a visible, shareable demo.
5. **Art quality by default.** Genre look recipes, neutral and studio environments that need no fetch, Meshy-ready asset slots, and the look-dev loop as a single command. The visual quality program (quality rebuild autopsy) already found most of the render defects; the remaining step is making the default look good with zero tuning (exposure parity, post chain fixed).
6. **Migration that sells itself.** `aura3d migrate three` already classifies 245 rows (21 exact, 174 approximate, 47 none, 3 pending). Raise exact coverage on the most common 40 three.js APIs, ship a side-by-side "your scene before and after" report with line and bundle deltas. Never claim drop-in.
7. **Game kit as a first-class product.** Publish and document `@aura3d/engine/game` (HUD widgets, touch, juice, session, accessibility) with a gallery. Developers choose engines for the batteries; this is the largest battery set in web 3D.
8. **Capability fill that removes objections.** `effects.toon`, Matcap and Lambert materials, camera rigs, more TSL names, `MeshSurfaceSampler` equivalent. Each closes a row in the matrix where three.js is currently better, and each is a one-package job.

## 4. What stays honest

- Do not claim faster, smaller, or drop-in. Today three.js wins runtime and size; the plan above closes the gap where it matters (first load, first frame, build) and does not pretend otherwise.
- Claim what is measured: scene source size, import count, glue lines, first-try success once WP-8 runs, safety coverage once WP-6 runs, evidence coverage per game.
- Label software-GL numbers as such everywhere; the real-GPU lane (WP-7) is a prerequisite for any performance headline.
- three.js remains the right choice for: WebGPU-first work, huge existing three.js codebases, exotic loaders and post-processing, and anything needing the largest ecosystem. Saying so builds trust and is consistent with the claims boundary doc.

## 5. Scorecard we will publish (targets and where they come from)

| Metric | Today (measured) | Target | Pillar |
|---|---|---|---|
| Stock build with zero workarounds | fails | passes (3 Vite versions, npm and pnpm) | Dealbreaker D1 |
| Cube app JS, total / requests | 3,841 KB / 26 | stage 1: at or under 1,500 KB / under 10; stage 2: at or under 800 KB | D4 |
| Cube frame, software GL | 666 ms (before) → 50 ms (4.1.3) | within 2x of three.js 4x MSAA | D5 |
| Forest 18k instances, software GL | 38 s → 6.4 s per frame | completes the bench plan within the time limit | D5 |
| Time to first playable from `npm create aura3d` | not measured | under 30 minutes, no glue | A |
| Glue lines for a complete game (HUD, input, audio, replay, deploy) | hand-rolled in ports | 0 beyond scene, rules, art | A |
| First-try agent success on 5-scene suite | worse than three.js (one author, anecdote) | at or above three.js, independent run | B |
| Edits to green, same suite | 7 vs 3 | at or under three.js | B |
| Silent faults caught in injection suite | partial | 100% reported or healed | C |
| Games with replay gate plus render gate plus `check-deploy` | 1 of 26 (Aura Slam) | all 15 index games | D |
| Real-GPU evidence | owner screenshots for 3 games | recorded run per index game | D, D7 |
| Matrix rows where three.js is better | 19 of 54 | under 12 after WP-6, tracked per release | all |

## 6. Codebase grounding and autonomous decisions

- D1: keep the three.js-compatible renderer lineage; superiority comes from the pipeline, safety, agent tooling and evidence, not a new renderer.
- D2: sequence is dealbreakers (WP-1 to WP-5) first, then differentiators, because a failed first build erases every other advantage.
- D3: no WebGPU default in this plan; revisit after real-GPU evidence exists.
- D4: 4.1.3 carries fixes only (build, no-ops, perf, Aura Slam UI); 4.2.0 only if defaults or exports change (post chain migration, deprecated export moves).
- D5: scorecard numbers are published only from runs stored under `evidence/`.
- Invariants: `tests/unit/agent-api/public-example-boundary.test.ts` green; Aura Slam draw calls at most 150 and G1/G3 green; tracked files under 15,000; no `.github/workflows`; no local Docker or Playwright; never run `pnpm` in worktrees with symlinked `node_modules`.

## 7. File-by-file breakdown

| Path | Action | Change |
|---|---|---|
| `packages/assets/src/threejs-compatibility/ThreeCompatAssetRegistry.ts` | MODIFY | Move `node:fs` use behind a Node-only entry |
| `packages/assets/package.json`, `packages/engine/package.json` | MODIFY | `browser`/`node` export conditions; precise `sideEffects` |
| `packages/create-aura3d/templates/{mini-game,racing-starter,falling-blocks-starter}/package-lock.json` | MODIFY | Regenerate to match manifests |
| `packages/engine/src/agent-api/nodes/primitives.ts` | MODIFY | Honour segments on plane/box/sphere or emit a named diagnostic |
| `packages/engine/src/agent-api/nodes/interactions.ts` | MODIFY | Validate `orbit` options |
| `packages/engine/src/devtools/environments/EnvironmentRegistry.ts` | MODIFY | Self-contained `neutral` environment |
| `packages/rendering/src/renderer/PostprocessExecution.ts`, `packages/rendering/src/Renderer.ts` | MODIFY | Migrate legacy post chain to PostGraph |
| `packages/rendering/src/renderer/*` (shadows) | MODIFY | Per-pixel cascade selection, larger shadow batches, named MSAA/HDR profiles |
| `packages/aura3d-cli/src/commands/new-game.ts` | CREATE | `aura3d new game "<prompt>"` pipeline (scaffold, assets, kit wiring, evidence) |
| `packages/aura3d-cli/src/commands/migrate-three/**` | MODIFY | More exact mappings for the 40 most common APIs; before/after report |
| `packages/engine/src/agent-api/nodes/effects.toon.ts`, `material.matcap.ts`, `material.lambert.ts`, `cameras.rigs.ts` | CREATE | Capability fill (matrix rows 12, 16) |
| `packages/engine/src/public/index.ts` | MODIFY | Move deprecated exports behind subpaths (4.2) |
| `packages/debug/src/fault-injection/**`, `tests/unit/fault-injection/**` | CREATE | Fault suite for Pillar C |
| `apps/showcase-index/index.html` and generator under `tools/showcase-port-pages/` | MODIFY | Per-game metrics and evidence badges from `evidence/` |
| `apps/showcase-safety/**` | CREATE | Public fault-injection demo page |
| `apps/playground/**` | CREATE | Live editor with share link and agent-fix |
| `tools/bench-vs-threejs/**`, `BUNDLE_SIZES.md` | MODIFY | Re-run on fixed build; add TTFP and first-try suites |
| `evidence/scorecard/**`, `docs/workflows/aura3d-vs-threejs-matrix.md`, `evidence/vs-threejs/RESULTS.md` | MODIFY/CREATE | Generated scorecard; refresh rows each release |

## 8. Work packages (parallel, disjoint ownership)

- **WP-1 Stock build.** Status: root cause fixed (`ModelTextureShare` now imports `@aura3d/assets/browser`, `04b7726ef`); `mini-game` built once against patched 4.1.2; remote smoke across all templates and Vite versions pending. Browser-safe exports, template lockfiles (the repo `mini-game` has no lockfile, so the reported mismatch did not reproduce). Test: remote `vite build` of cube app and `mini-game` from packed tarballs on Vite 7.3.2 and 7.3.7, npm and pnpm.
- **WP-2 Silent no-ops and offline environment.** Plane segments, orbit validation, self-contained `neutral`. Tests: `tests/unit/agent-api/plane-segments.test.ts`, `orbit-options.test.ts`, `environment-neutral-offline.test.ts`. Add an "ignored option" diagnostic path used by all typed builders.
- **WP-3 Bundle.** Per-module size report; lazy or subpath-only animation, audio, physics, devtools, legacy post and WebGPU; stage targets in section 5; gate in `BUNDLE_SIZES.md`.
- **WP-4 Frame cost.** Status: partly landed (`a816facf6`: cube 666 to 50 ms, 18,000-instance forest 38 s to 6.4 s per frame on software GL); cascade selection and shadow batching open. Cascade selection, shadow batching, named profiles; re-bench against a packed 4.1.3 tarball.
- **WP-5 Post chain.** PostGraph migration; luma regression test; ships in 4.2.0.
- **WP-6 Fault-injection suite and safety demo.** Five faults (black frame, bad shader, missing/unvetted asset, NaN uniform, empty instances); same fault in raw three.js for the comparison page; `apps/showcase-safety`.
- **WP-7 Real-GPU lane.** Hardware runner under the serverless-first policy, or the owner's M4 Max checklist (Drift world, Silt rings, Last Train Enter/E/W, native Tennis); record under `evidence/real-gpu/`.
- **WP-8 Independent authoring trial.** Fresh agent, no repo context, `llms.txt` plus types only, five scenes in both libraries; replaces RESULTS section 13; repeat after WP-1 and WP-2.
- **WP-9 One-command game.** `aura3d new game`; TTFP measurement on three prompts; Meshy through Kiro Prism with cap and provenance.
- **WP-10 Showcase and playground.** Metrics and evidence badges on the index; playground MVP with share links.
- **WP-11 Capability fill.** Status: `effects.toon` landed (`09a29e514`); camera rig, objective marker and minimap in flight; judge CLI landed (`2c2218d71`). Remaining: `effects.toon`, Matcap, Lambert, camera rigs, TSL names, surface sampler; one package per row, each with docs, codemod row and test.
- **WP-12 Evidence on every game.** Replay gate plus render gate plus `check-deploy` for all 15 index games, following the Aura Slam recipe (`docs/aura-slam/ARCHITECTURE.md`).
- **WP-13 Test baseline.** Triage the 106 to 116 baseline unit failures (fix, delete removed features, or quarantine with a reason); goal is a green remote unit run.
- **WP-14 Aura Slam follow-ups.** Portrait framing needs a camera change gated by G3; Phase 2 modes deferred; menu and quick-bar fixes landed (`259acdd14`), deploy with the next release.

## 9. Verification and acceptance checklist

- [ ] WP-1: a clean app importing only `@aura3d/engine` builds with `npx vite build` and no extra plugin; template `npm ci` succeeds.
- [ ] WP-2: the three new unit files pass; a built app logs no `ENV_FETCH_FAILED`; every typed builder reports ignored options.
- [ ] WP-3: bench bundle table meets the stage target, or `BUNDLE_SIZES.md` carries a written re-baseline.
- [ ] WP-4: remote bench shows forest completing and cube within the stated ratio, labelled software GL.
- [ ] WP-5: no `POSTPROCESS_V2_UNMIGRATED` in any console log; luma regression test passes.
- [ ] WP-6: fault suite green; comparison page published; each fault shows caught or healed in Aura3D.
- [ ] WP-7: `evidence/real-gpu/` has device, driver and frames, or the owner checklist is recorded as answered.
- [ ] WP-8: independent run recorded; first-try success and edits-to-green at or better than three.js, or the gap and its causes written down.
- [ ] WP-9: three prompts produce deployable games with TTFP recorded and `check-deploy` green.
- [ ] WP-10: every index game page shows generated metrics and badge; playground share link round-trips.
- [ ] WP-11: each new node typed, documented, tested, and reflected in the matrix and codemod.
- [ ] WP-12: all 15 index games pass replay, render and `check-deploy` gates.
- [ ] Always: `vitest run tests/unit/agent-api/public-example-boundary.test.ts`; Aura Slam G1/G3; tracked files under 15,000; `tools/release/publish-all.mjs --dry-run` clean before any publish; refresh scorecard after each release; re-verify live from a clean-worktree deploy.

## 10. Appendix: honest competitor comparison (reference only)

Where three.js wins today (measured, software GL): bundle 7.7x to 8.7x smaller, 2 vs 26 requests, faster first frame in four of five scenes, lower frame cost, fewer draws and programs, stock build works, broader materials, post, TSL (about 638 vs 62 names), WebGPU, WebXR and loaders, far larger ecosystem (about 15.2M vs about 391 weekly downloads, snapshot).

Where Aura3D wins today (measured or counted): fewer scene lines in four of five scenes, one import vs up to eight, fewer API symbols in every scene, bloom, shadow, instancing, fixed-step, QA hooks and shader pass in one call, asset provenance, self-heal, agent docs and skills, catalog, Meshy pipeline, codemod, shipped games with evidence.

Ties: PBR, lights, primitives, instancing, helpers; water scene picture identical; replay hashes identical.

Full detail: `aura3d-vs-threejs-matrix.md` and `evidence/vs-threejs/RESULTS.md`.
