# Round 2 Phase A Sign-Off

Round 2 is authorized only from the `PRD-AMENDMENT:` commit that includes this
sign-off and the matching amendment record.

## Required Fields

Round: 2
Base commit SHA: `415d76c7b21de980f8f947129d09506c837ef57e`
Date: 2026-05-30
Reviewer: `gchahal1982`
User signature: `gchahal1982`

## Checklist

- [x] `FinalizedPromptPlan.md` remains the authoritative release standard.
- [x] Round 1 is recorded as failed in `benchmark/results/round-1.md`.
- [x] Round 1 engine result is recorded in `benchmark/results/round-1-engine.md`.
- [x] Round 1 decision is recorded in `benchmark/results/round-1-decision.md`.
- [x] Phase D repairs are summarized in `benchmark/results/phase-d-progress.md`.
- [x] `benchmark/prompts/manifest.md` still matches the prompt files and order.
- [x] `benchmark/rubric.md` is unchanged for Round 2.
- [x] `benchmark/protocol.md` is unchanged for Round 2.
- [x] `benchmark/context/aura3d/manifest.sha256` matches the Aura3D context files.
- [x] `benchmark/context/threejs/manifest.sha256` matches the Three.js context files.
- [x] `benchmark/runner/README.md` includes the Round 2 FPS calibration requirement.
- [x] `benchmark/metrics/README.md` defines calibrated FPS and invalid instrumentation handling.
- [x] `benchmark/engine/README.md` requires FPS calibration before FPS thresholds are used.
- [x] `benchmark/runs/README.md` documents `fpsCalibration` fields in engine metrics.
- [x] `benchmark/runner/fps-calibration.mjs` exists and has focused unit coverage.
- [x] `benchmark/runs/round-2/_tools/run-agent.mjs` records agent nontermination with a 20-minute timeout instead of requiring manual cleanup.
- [x] `benchmark/assets/sneaker.glb` remains the only allowed asset for prompt 10.
- [x] `benchmark/results/amendment-round-2-standard.md` identifies standard changes and invalidated prior results.
- [x] `benchmark/results/amendment-round-2-agent-timeout.md` identifies the timeout rule and voids the partial pre-timeout local Round 2 attempt.
- [x] User approval from `gchahal1982` is recorded in the amendment commit body.
- [x] The final amendment commit message starts with `PRD-AMENDMENT:`.

## Verification Commands

```bash
cd benchmark/context/aura3d/files
shasum -a 256 -c ../manifest.sha256

cd ../../threejs/files
shasum -a 256 -c ../manifest.sha256

pnpm exec vitest run tests/unit/tools/benchmark-fps-calibration.test.ts --reporter=default

node --check benchmark/runs/round-2/_tools/run-agent.mjs
```

## Sign-Off Statement

```text
I, gchahal1982, approve the Round 2 standard amendment recorded in benchmark/results/amendment-round-2-standard.md and the Round 2 Phase A sign-off recorded in benchmark/results/round-2-phase-a-signoff.md. I confirm that Round 1 remains failed and invalid for shipping, and I approve a PRD-AMENDMENT commit to start Round 2 from the amended standard.
```
