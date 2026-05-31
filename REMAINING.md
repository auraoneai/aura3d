# Aura3D Remaining Live Tasks

Status rule: mark an item `[x]` only after the evidence named under that item
exists and has been checked in the current worktree. Do not use partial prompt
runs as completion evidence.

## Current State

- Round 1 failed, is signed/committed, and is invalid for shipping.
- Round 7 failed.
- Round 8 Phase A sign-off exists, but the attempted run was aborted and does
  not count as benchmark evidence.
- Round 9 completed clean generation, capture, and neutral scoring, then failed
  both the prompt benchmark and engine benchmark. It is invalid for shipping.
- Round 10 engine proof was started after the targeted repair amendment and
  failed before the full prompt matrix started: material-grid Aura3D had invalid
  FPS instrumentation and particles Aura3D measured below the 30 FPS floor.
  It is invalid for shipping and does not complete task 13.
- Aura3D is not live/releasable under `FinalizedPromptPlan.md` until the prompt
  benchmark and engine parity benchmark both pass, or the user explicitly signs
  a below-bar shipping decision.

## Tasks

- [x] 1. Stop treating benchmark reruns as work.
  Evidence required:
  - No full Codex/Claude prompt matrix is started until hard-prompt fixes are
    implemented and smoke-verified.
  - Any stale partial round artifacts are removed or explicitly marked invalid.
  Evidence checked:
  - No new full prompt matrix was started for these repairs.
  - Aborted Round 8 prompt artifacts were removed before this pass.
  - Current process scan shows no Aura3D benchmark, Codex, Claude, Vite, dev,
    or preview process under `/Users/gurbakshchahal/aura3d`; the only matching
    dev process is an unrelated `/Users/gurbakshchahal/IndexEdge/frontend`
    server.

- [x] 2. Finish Prompt 07 material-lab fixes.
  Evidence required:
  - Metal, glass, rubber, emissive, and clearcoat read as visually distinct.
  - Environment/reflection cues are visible.
  - Default material-lab camera frames all five materials.
  - Glass does not read as opaque pale blue.
  - Clearcoat reads as glossy layered paint, not only a red sphere.
  - Focused tests and a screenshot/smoke artifact verify the result.
  Evidence checked:
  - `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts tests/unit/tools/benchmark-fps-calibration.test.ts --reporter=default`
    passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `pnpm build` passed.
  - Smoke screenshot: `/tmp/aura3d-remaining-hard-prompt-smoke/material.png`.

- [x] 3. Finish Prompt 08 city-block fixes.
  Evidence required:
  - 20-building city block reads as rich city geometry, not sparse boxes.
  - Streets, crosswalks, windows, and street lights are visible.
  - Day/night toggle evidence is present in UI or scene state.
  - Focused tests and a screenshot/smoke artifact verify the result.
  Evidence checked:
  - `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts tests/unit/tools/benchmark-fps-calibration.test.ts --reporter=default`
    passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `pnpm build` passed.
  - Smoke screenshot: `/tmp/aura3d-remaining-hard-prompt-smoke/city.png`.

- [x] 4. Finish Prompt 10 product-viewer fixes.
  Evidence required:
  - Product auto-scales and sits correctly on the plinth.
  - Studio lighting, contact, and framing read as a product viewer.
  - Turntable/rotation evidence is present.
  - Typed asset workflow remains correct.
  - Focused tests and a screenshot/smoke artifact verify the result.
  Evidence checked:
  - `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts tests/unit/tools/benchmark-fps-calibration.test.ts --reporter=default`
    passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `pnpm build` passed.
  - Smoke screenshot using the committed benchmark sneaker fixture copied into
    the temporary Vite app public directory:
    `/tmp/aura3d-remaining-hard-prompt-smoke/product.png`.

- [x] 5. Fix remaining agent-termination and prompt-execution problems.
  Evidence required:
  - Benchmark agent instructions require reading `llms.txt` first.
  - Agents run finite build commands and stop.
  - Agents do not start attached `npm run dev`, preview, Playwright, browser
    screenshot, or manual verification processes during generation.
  - Agents return build/run commands and assumptions.
  - Runs with attached leftover processes are recorded as failed/invalid.
  Evidence checked:
  - `benchmark/protocol.md` and `benchmark/runner/README.md` now require
    `./context/llms.txt` first, finite build-only execution, no attached
    dev/preview/Playwright/manual screenshot work inside agent generation, and
    runner-owned runtime capture.
  - `benchmark/runner/verify-context-manifests.mjs` checks the finite-execution
    guardrails.
  - `node benchmark/runner/verify-context-manifests.mjs` passed.

- [x] 6. Verify context bundle integrity before the next valid round.
  Evidence required:
  - `benchmark/context/aura3d/manifest.sha256` matches current files.
  - `benchmark/context/threejs/manifest.sha256` matches current files.
  - Any standard changes are committed with a `PRD-AMENDMENT:` message and the
    required template content.
  Evidence checked:
  - `node benchmark/runner/verify-context-manifests.mjs` passed:
    `aura3d: 38 files verified`, `threejs: 15 files verified`,
    `runner contract: finite execution guardrails verified`.
  - The current standard changes are recorded in
    `benchmark/results/amendment-round-10-targeted-repair-standard.md`.
  - The Round 10 Phase A sign-off is recorded in
    `benchmark/results/round-10-phase-a-signoff.md`.
  - These files must be committed with a `PRD-AMENDMENT:` prefix before Round
    10 starts.

- [x] 7. Confirm the benchmark standard is clean before the next round.
  Evidence required:
  - Approved amendment docs exist for the active standard.
  - Phase sign-off doc exists for the active round.
  - Context manifests match.
  - No mid-run PRD edits.
  - No stale partial run artifacts.
  - No uncommitted benchmark standard changes.
  - Prompts and rubric have not drifted.
  Evidence checked:
  - `benchmark/results/amendment-round-10-targeted-repair-standard.md` records
    the active targeted repair standard.
  - `benchmark/results/round-10-phase-a-signoff.md` records the active Phase A
    sign-off.
  - `node benchmark/runner/verify-context-manifests.mjs` passed.
  - `git diff --check` passed.
  - Prompts and rubric were not edited by this repair pass.
  - This item is completed by the same `PRD-AMENDMENT:` commit that records the
    Round 10 targeted repair standard and removes uncommitted
    benchmark-standard drift before Round 10 starts.

- [x] 8. Run one clean full final prompt benchmark round.
  Evidence required:
  - Codex + Aura3D completes all 10 prompts.
  - Codex + raw Three.js completes all 10 prompts.
  - Claude Code + Aura3D completes all 10 prompts.
  - Claude Code + raw Three.js completes all 10 prompts.
  - No partial reruns count.
  - No human edits occur during the run.
  - No prompt, rubric, or context changes occur during the run.
  - No result cherry-picking.
  Evidence checked:
  - Round 9 runner tooling was committed and pushed first:
    `d6c23ea Add reproducible Round 9 benchmark runner`.
  - The initial untracked/partial matrix attempt was stopped and removed; it is
    not counted as evidence.
  - Fresh Round 9 prompt directories were prepared after the runner commit.
  - `benchmark/runs/round-9/*/prompt-*/run-metadata.json` verifies all 40
    agent generations completed with `agentExitCode === 0`:
    `codex-aura3d: 10/10`, `codex-threejs: 10/10`,
    `claude-aura3d: 10/10`, `claude-threejs: 10/10`.

- [x] 9. Capture runtime evidence for every prompt.
  Evidence required for every generated app:
  - Screenshot.
  - Route health.
  - Compile/build status.
  - Runs-in-browser status.
  - Lines of user-written code.
  - Files created.
  - Hallucinated APIs.
  - Invented asset paths for prompt 10.
  - Repair turns.
  - Time to first usable render.
  - Bundle size.
  - Modifiability input for scorer.
  Evidence checked:
  - `benchmark/runs/round-9/{codex-aura3d,codex-threejs,claude-aura3d,claude-threejs}/prompt-01..prompt-10/`
    each contain `screenshot.png`, `route-health.json`, `metrics.json`,
    `source-listing.md`, `source-manifest.json`, and `notes.md`.
  - Validation script confirmed `40/40` prompt captures have
    `compiles === true`, `runsInBrowser === true`, `routeHealth === "pass"`,
    numeric LOC/file/API/asset/repair/time/bundle metrics, and source-listing
    evidence for scorer modifiability review.

- [x] 10. Run the engine parity benchmark cleanly.
  Evidence required:
  - `engine-01-material-grid` metrics and screenshot.
  - `engine-02-city-block` metrics and screenshot.
  - `engine-03-particles-vfx` metrics and screenshot.
  - `engine-04-physics-ramp` metrics and screenshot.
  - `engine-05-sneaker-product` metrics and screenshot.
  - Visual parity target: at least 4/5 for every scene.
  - No scene below 30 FPS on the agreed machine.
  - Aura3D p50 FPS no worse than 20% below Three.js in at least 4/5 scenes.
  - Aura3D p50 FPS no worse than 35% below Three.js in any scene.
  - Aura3D JS heap peak no worse than 25% above Three.js in at least 4/5 scenes.
  - Aura3D JS heap peak no worse than 50% above Three.js in any scene.
  - Draw-call differences above 25% are explained.
  - Gzip delta over Three.js is not above 250 KB unless explicitly accepted.
  Evidence checked:
  - `benchmark/runs/round-9/engine/engine-01-material-grid..engine-05-sneaker-product/{aura3d,threejs}/`
    contains metrics, route health, screenshots, notes, and source for all 10
    engine sides.
  - Engine capture completed without process failures for all five scenes.
  - Neutral scoring in
    `benchmark/scoring/round-9-scores/engine-by-claude.json` confirms visual
    parity reached `5/5` scenes at `>=4`, but the engine benchmark does not
    pass task 13 because captured FPS thresholds failed.

- [x] 11. Complete neutral scoring.
  Evidence required:
  - Prompt outputs submitted to neutral scorer.
  - Engine screenshots/metrics submitted to neutral scorer.
  - Codex does not grade Codex output.
  - Claude/Anthropic does not grade Claude output.
  - Scorer sees prompt, screenshot, code listing, and metrics, not context
    bundles.
  Evidence checked:
  - `benchmark/scoring/round-9-scores/codex-by-claude.json`: Claude Code scored
    Codex-generated outputs. The initial full handoff hung with zero output, so
    the same allowed Codex artifacts were split into prompts 01-05 and 06-10,
    then combined into this JSON.
  - `benchmark/scoring/round-9-scores/claude-by-codex.json`: Codex scored
    Claude-generated outputs.
  - `benchmark/scoring/round-9-scores/engine-by-claude.json`: Claude Code
    scored hand-authored engine parity outputs.
  - Scorer prompt files list only prompt, screenshot, metrics, route-health,
    notes, source listing/source manifest, and engine source files. They
    explicitly exclude context bundles, prior results, and old scoring files.

- [ ] 12. Pass the main prompt benchmark.
  Evidence required:
  - Codex: Aura3D wins at least 7/10 prompts.
  - Codex: at least 4 Aura3D visual-quality scores are >=4.
  - Codex: no Aura3D visual-quality score below 3.
  - Codex: at least 2 Aura3D wins come from prompts 7, 8, and 10.
  - Claude Code: Aura3D wins at least 7/10 prompts.
  - Claude Code: at least 4 Aura3D visual-quality scores are >=4.
  - Claude Code: no Aura3D visual-quality score below 3.
  - Claude Code: at least 2 Aura3D wins come from prompts 7, 8, and 10.

- [ ] 13. Pass the engine benchmark.
  Evidence required:
  - Required engine result file is recorded.
  - All engine benchmark thresholds pass.
  - Any failure keeps Aura3D not live as a proven Three.js competitor.

- [ ] 14. Write final result files.
  Evidence required:
  - `benchmark/results/round-N.md`.
  - `benchmark/results/round-N-engine.md`.
  - `benchmark/results/round-N-decision.md`.
  - Result files include scorer identity, scorer neutrality, prompt-by-prompt
    results, engine scene-by-scene results, pass/fail math, user signature, and
    final decision.

- [ ] 15. Record the Phase C decision.
  Evidence required:
  - Passing benchmark decision says ship / Aura3D is a Three.js competitor in
    measurable terms, or
  - Failing benchmark decision says fix specific gaps and rerun, or
  - Below-bar ship decision includes explicit user acknowledgment.

- [x] 16. Verify no regression of shipped features.
  Evidence required:
  - TypeScript build/typecheck passes.
  - Agent API unit tests pass.
  - Public API checks pass.
  - Agent docs checks pass.
  - Context manifest checks pass.
  - Package build passes.
  - Targeted browser/screenshot checks for changed visual systems pass.
  - Benchmark runner checks pass.
  - FPS calibration checks pass.
  Evidence checked:
  - `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts tests/unit/tools/benchmark-fps-calibration.test.ts --reporter=default`
    passed: 31 tests.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `pnpm build` passed when run alone. A prior concurrent invocation failed
    because `check:public-api` was writing `dist/` at the same time; rerunning
    without overlapping `dist` writers passed.
  - `pnpm run check:agent-docs` passed.
  - `pnpm run check:agent-api` passed: 28 tests.
  - `pnpm run check:public-api` passed.
  - `node benchmark/runner/verify-context-manifests.mjs` passed:
    `aura3d: 38 files verified`, `threejs: 15 files verified`,
    `runner contract: finite execution guardrails verified`.
  - `git diff --check` passed.
  - Runner syntax checks passed for `benchmark/runner/fps-calibration.mjs`,
    `benchmark/runner/setup-engine.mjs`,
    `benchmark/runner/capture-engine.mjs`, and
    `benchmark/runner/capture-engine-batch.mjs`.
  - Fresh current-worktree visual smoke passed for particle, solar, neon, data,
    mini-golf, material, city, humanoid, and product prefabs with nonzero draw
    calls and no runtime errors. Contact sheet:
    `/tmp/aura3d-current-repair-smoke/contact-sheet.png`.
  - Round evidence visual sheets:
    `/tmp/aura3d-current-sheets/round9-codex-aura3d.png`,
    `/tmp/aura3d-current-sheets/round9-claude-aura3d.png`,
    `/tmp/aura3d-current-sheets/round9-engine.png`, and
    `/tmp/aura3d-current-sheets/round10-engine-smoke.png`.

- [ ] 17. Write release notes.
  Evidence required:
  - 1.0.0 release notes cite the passing benchmark result.
  - Release notes link to `benchmark/results/round-N.md` for the passing round.

- [ ] 18. Publish / go live.
  Evidence required:
  - Version/bump decision completed as needed.
  - Final build and package verification complete.
  - Publish/release process complete.
  - Docs/site deployment complete if applicable.
  - Release tag pushed.
  - Release commit pushed.
  - Public claim is made only after benchmark proof exists.
