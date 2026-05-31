# PRD-AMENDMENT: Round 10 Targeted Repair Standard

Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Amendment status: active targeted repair standard for the next proof round
User approval: `gchahal1982`, active-goal authorization to execute all tasks in
`REMAINING.md` without additional permission

This document records the concrete standard change after the Round 9 failure.
It is not a benchmark pass, does not mark any pass task complete, and does not
turn smoke screenshots into release proof. Round 10 may start only after this
amendment, the regenerated context manifest, and the Round 10 Phase A sign-off
are committed.

## Reason

Round 9 completed clean prompt generation, runtime capture, engine capture, and
neutral scoring, but failed both release gates:

- Prompt benchmark failed:
  - Codex with Aura3D reached 6/10 wins; required 7/10.
  - Claude Code with Aura3D reached 2/10 wins; required 7/10.
  - Codex hard-prompt wins for prompts 07/08/10 reached 1/3; required 2/3.
  - Claude hard-prompt wins for prompts 07/08/10 reached 0/3; required 2/3.
- Engine benchmark failed:
  - Visual parity passed for all 5 scenes.
  - Aura3D p50 FPS was below 30 in material grid, city block, and physics
    ramp.
  - Aura3D FPS gap versus Three.js exceeded allowed thresholds in material
    grid, city block, and physics ramp.
  - Draw-call gaps above 25% were not explained in the result files.

Round 10 must be a targeted repair round, not a blind rerun of Round 9.

## Files Changed

This amendment covers targeted post-Round-9 repair work in these areas:

- Public agent API and renderer behavior:
  `packages/engine/src/agent-api/index.ts`.
- Focused regression tests:
  `tests/unit/agent-api/agent-api.test.ts` and
  `tests/unit/tools/benchmark-fps-calibration.test.ts`.
- Agent-facing docs:
  `llms.txt`, `docs/agents/agent-context.md`,
  `docs/agents/api-surface.md`, `docs/agents/asset-workflow.md`,
  `docs/agents/benchmark-recipes.md`, `docs/agents/build-playbook.md`,
  `docs/agents/templates.md`, `docs/agents/troubleshooting.md`, and
  `docs/agents/verification.md`.
- Product-viewer templates:
  `templates/product-viewer/**` and
  `packages/create-aura3d/templates/product-viewer/**`.
- Aura3D benchmark context bundle:
  `benchmark/context/aura3d/files/**` and
  `benchmark/context/aura3d/manifest.sha256`.
- Benchmark protocol and runner:
  `benchmark/protocol.md`, `benchmark/runner/README.md`,
  `benchmark/runner/fps-calibration.mjs`,
  `benchmark/runner/fps-calibration.d.mts`,
  `benchmark/runner/setup-engine.mjs`,
  `benchmark/runner/capture-engine.mjs`, and
  `benchmark/runner/capture-engine-batch.mjs`.
- Benchmark result records:
  `benchmark/results/round-9.md`,
  `benchmark/results/round-9-engine.md`,
  `benchmark/results/round-9-decision.md`,
  `benchmark/results/amendment-round-10-targeted-repair-standard.md`, and
  `benchmark/results/round-10-phase-a-signoff.md`.

The amendment does not modify Round 9 run outputs or Round 9 scorer JSON. Those
artifacts remain failed historical evidence.

## Standard Changes

Prompt repairs must preserve the public Aura3D API, typed asset workflow, and
neutral scoring rules. The goal is to make the Aura3D output visibly stronger
or measurably easier to use without adding hidden scorer hints.

- Prompt 02 particle fountain: make the default/recipe output show a clear
  nozzle or emitter source, upward fountain arc, strong lifetime color change,
  visible ground/grid context, and collision/splash ring evidence. The repair
  must not reduce the scene to symbolic emitter geometry or a HUD counter.
- Prompt 03 solar system: make labels attach/read as planet labels rather than
  a detached legend, keep at least six planets and orbit paths visible, show
  sun glow, and expose enough recipe or helper parameters that modifiability is
  not scored as opaque prefab usage.
- Prompt 04 neon tunnel: make the scene read as a tunnel interior with depth
  falloff, glow/bloom, fog or atmospheric layering, and a camera-path/flythrough
  cue. It must not read as only nested rectangular frames.
- Prompt 05 3D data visualization: show 36 varied bars with readable axes, tick
  labels, color/height mapping, and data/readout affordances. The repair must
  expose data and styling inputs clearly enough for scorer-visible
  modifiability.
- Prompt 06 mini-golf: show ball-focused framing, a playable lane, hole,
  obstacle, score/state HUD, aim or shot cue, and physics/follow-camera
  evidence. The result must read as an interactive mini-golf hole, not only a
  static course prefab.
- Prompt 08 city block: preserve about 20 varied buildings, windows, streets,
  street lights, and day/night state, but add screenshot-visible detail or
  state evidence strong enough for Aura3D to win the hard prompt. Avoid extra
  stylesheet/files unless they are required for visible UI; default viewport
  layout should carry the scene.
- Prompt 09 primitive humanoid: make limbs visually connected, pose and walk
  cycle readable, ground contact clear, and face/path cues visible. The repair
  must address the Round 9 detached-limb read.
- Prompt 10 product viewer: keep the typed asset workflow and provided sneaker
  asset. Improve product-inspection evidence with centering, plinth contact,
  studio lighting, turntable/rotation cue, orbit/control affordance, and
  three-quarter framing. Because file count and bundle size may favor raw
  Three.js, the Aura3D output must win through visible product-viewer quality,
  time-to-first-usable-render improvement, or clearer modifiability without
  bypassing generated `aura-assets.ts`.

Engine repairs must address the failed thresholds before another proof round:

- Material grid, city block, and physics ramp must have targeted performance
  evidence showing Aura3D can meet the 30 FPS floor on the agreed machine
  before Round 10 starts. If repair smokes expose invalid FPS instrumentation,
  fix the runner first; do not use suspect FPS as renderer-quality evidence.
- FPS calibration must be captured in the same browser path used for scene
  sampling, and any calibration or sample-count failure must make FPS fields
  unavailable rather than pass or fail silently.
- Draw-call gaps above 25% must either be reduced or explained in the engine
  result notes before neutral scoring.
- Engine visual parity must not regress below the Round 9 visual bar.

## Prior Result Invalidated

Round 9 remains a valid failed historical result. It is invalid for shipping or
for claiming Aura3D is a proven Three.js competitor. Round 10 must run from the
amended repair standard after Phase A sign-off.

## New Benchmark Round Required

Yes. Targeted smoke screenshots, local tests, and manifest checks are repair
evidence only. They do not satisfy the prompt benchmark, neutral scoring, or
engine parity proof required for release.

## Verification Before Round 10

The Round 10 amendment/sign-off package must record the exact commands run. At
minimum, use the focused checks for changed areas plus:

```bash
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
pnpm build
pnpm run check:agent-docs
pnpm run check:agent-api
pnpm run check:public-api
node benchmark/runner/verify-context-manifests.mjs
git diff --check
```

If prompt visuals, renderer behavior, or engine metrics change, include
targeted browser/screenshot or engine smoke evidence for the changed scenes.
Do not start the Round 10 full prompt matrix until the amendment, regenerated
context manifests, and Phase A sign-off are committed.

## Targeted Smoke Evidence

The targeted repair smoke screenshots are repair evidence only:

- Round 9 benchmark screenshot sheets:
  `/tmp/aura3d-current-sheets/round9-codex-aura3d.png`,
  `/tmp/aura3d-current-sheets/round9-claude-aura3d.png`, and
  `/tmp/aura3d-current-sheets/round9-engine.png`.
- Round 10 targeted engine smoke sheet:
  `/tmp/aura3d-current-sheets/round10-engine-smoke.png`.
- Current-worktree repair smoke sheet covering particle, solar, neon, data,
  mini-golf, material, city, humanoid, and product prefabs:
  `/tmp/aura3d-current-repair-smoke/contact-sheet.png`.

These screenshots help inspect repair direction. They do not satisfy task 12 or
task 13; those tasks require a complete valid proof round and neutral scoring.
