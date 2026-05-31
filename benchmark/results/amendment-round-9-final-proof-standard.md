# PRD Amendment - Round 9 Final Proof Standard

Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Amendment commit: this commit
User approval: `gchahal1982`, active-goal authorization to execute all tasks in
`REMAINING.md` without additional permission

## Reason

Round 7 failed and Round 8 was not completed as a valid benchmark run. Round 8
repair work improved hard-prompt content and renderer FPS, but the remaining
`REMAINING.md` execution pass found that the next valid round still needed a
cleaner final standard before any full prompt matrix could be meaningful:

- Prompt 07 material lab needed stronger material identity, real reflection
  cues, clearer glass/transmission, and a layered clearcoat read.
- Prompt 08 city block needed richer city evidence, visible streets/crosswalks,
  street lights, vehicles/detail, and explicit day/night state evidence.
- Prompt 10 product viewer needed typed-asset product placement, plinth contact,
  studio framing, and turntable evidence.
- The benchmark protocol needed stricter separation between agent generation and
  runner-owned capture to prevent nontermination and prompt-loop churn.
- The engine FPS calibration harness needed stronger sample-count and timeout
  guards so stalled browser timing cannot become renderer-quality evidence.
- Release/go-live docs needed to state that a passing neutral benchmark, not
  local smoke screenshots or internal verification commands, is the release
  proof gate.

This amendment targets those gaps. It is not a benchmark pass and does not
authorize a ship claim.

## Files Changed

- `REMAINING.md`
- `CHANGELOG.md`
- `llms.txt`
- `packages/engine/src/agent-api/index.ts`
- `tests/unit/agent-api/agent-api.test.ts`
- `tests/unit/tools/benchmark-fps-calibration.test.ts`
- `docs/agents/agent-context.md`
- `docs/agents/api-surface.md`
- `docs/agents/asset-workflow.md`
- `docs/agents/benchmark-recipes.md`
- `docs/agents/build-playbook.md`
- `docs/agents/templates.md`
- `docs/project/final-proof-release-readiness.md`
- `docs/project/public-api-contract.md`
- `docs/project/release-checklist.md`
- `docs/project/release-process.md`
- `docs/project/site-map.md`
- `benchmark/context/README.md`
- `benchmark/context/aura3d/README.md`
- `benchmark/context/aura3d/files/llms.txt`
- `benchmark/context/aura3d/files/docs/agents/agent-context.md`
- `benchmark/context/aura3d/files/docs/agents/api-surface.md`
- `benchmark/context/aura3d/files/docs/agents/asset-workflow.md`
- `benchmark/context/aura3d/files/docs/agents/benchmark-recipes.md`
- `benchmark/context/aura3d/files/docs/agents/build-playbook.md`
- `benchmark/context/aura3d/files/docs/agents/templates.md`
- `benchmark/context/aura3d/manifest.sha256`
- `benchmark/context/threejs/README.md`
- `benchmark/context/threejs/files/llms.txt`
- `benchmark/context/threejs/manifest.sha256`
- `benchmark/protocol.md`
- `benchmark/runner/README.md`
- `benchmark/runner/fps-calibration.d.mts`
- `benchmark/runner/fps-calibration.mjs`
- `benchmark/runner/verify-context-manifests.mjs`
- `benchmark/results/amendment-round-9-final-proof-standard.md`
- `benchmark/results/round-9-phase-a-signoff.md`

## Standard Change

- Material lab: expand the public material spec with physical material fields
  needed for visible glass and clearcoat cues; update material presets and the
  Three.js renderer mapping; add a material-inspection environment for
  material-swatches scenes; add explicit reflection cards, glass contrast
  stripes, emissive halo, and layered clearcoat geometry.
- City block: add `timeOfDay`, default the city evidence to night, enrich the
  city block with sidewalks, curbs, crosswalks, storefronts, roof details,
  vehicles, street lamps, traffic lights, and an in-scene day/night toggle
  marker while preserving aggregated window columns.
- Product viewer: add product-stage turntable/rotation cues, normalized
  plinth-top model placement, explicit `turntable` animation support, and
  prompt-plan/docs guidance that uses typed assets and no invented string IDs.
- Agent execution: make `./context/llms.txt` the first required context read
  for both Aura3D and raw Three.js runs; clarify that agents run finite build
  commands and return the run command to the runner, while runtime capture,
  screenshots, and Playwright are runner-owned.
- Context integrity: add `benchmark/runner/verify-context-manifests.mjs` to
  verify both context manifests and the finite-execution guardrails before a
  new round starts.
- Engine FPS calibration: add sample-count, timeout, and control-page failure
  handling; calibration failure now invalidates FPS fields without aborting the
  rest of metrics capture.
- Release readiness: add a final proof readiness document and make release
  docs/changelog cite the neutral benchmark as the only competitive proof gate.

## Prior Result Invalidated

Round 1, Round 2, Round 3, Round 5, and Round 7 remain valid failed historical
results but are invalid for shipping. Round 8 Phase A sign-off remains valid
historical authorization for the prior amended standard, but no complete Round
8 result exists and Round 8 cannot be used as release evidence. A future pass
requires a new full Round 9 benchmark from this amended standard.

## New Benchmark Round Required

Yes. Local unit tests, type checks, manifest checks, and smoke screenshots are
repair evidence only. They do not satisfy the prompt benchmark, neutral scoring,
or engine parity proof required by `FinalizedPromptPlan.md`.

## Diagnostic Evidence

Focused hard-prompt smoke screenshots were captured outside the benchmark
runner:

- `/tmp/aura3d-remaining-hard-prompt-smoke/material.png`
- `/tmp/aura3d-remaining-hard-prompt-smoke/city.png`
- `/tmp/aura3d-remaining-hard-prompt-smoke/product.png`

Those screenshots verify that the current helper output renders credible
material, city, and product scenes at 1440 x 960 with full-size canvases. They
are not release benchmark evidence.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts tests/unit/tools/benchmark-fps-calibration.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `node benchmark/runner/verify-context-manifests.mjs`
- `git diff --check`
