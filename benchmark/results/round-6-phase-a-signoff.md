# Round 6 Phase A Sign-Off

Round 6 is authorized only from the current amended standard. This sign-off
does not convert any prior failed result into shipping evidence.

## Required Fields

Round: 6
Base commit SHA: `9c1ed0e26aab814af47e57939053127a84567dbd`
Date: 2026-05-30
Reviewer: `gchahal1982`
User signature: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Checklist

- [x] `FinalizedPromptPlan.md` remains the authoritative release standard.
- [x] Round 1 is recorded as failed in `benchmark/results/round-1.md`.
- [x] Round 2 is recorded as failed in `benchmark/results/round-2.md`.
- [x] Round 3 is recorded as failed in `benchmark/results/round-3.md`.
- [x] Round 5 is recorded as failed in `benchmark/results/round-5.md`.
- [x] Round 5 decision requires targeted repairs before another full round.
- [x] Phase D repairs are summarized in `benchmark/results/phase-d-progress.md`.
- [x] `benchmark/prompts/manifest.md` still defines the prompt files and order.
- [x] `benchmark/rubric.md` is unchanged for Round 6.
- [x] `benchmark/protocol.md` is unchanged for Round 6.
- [x] `benchmark/context/aura3d/manifest.sha256` matches the Aura3D context files.
- [x] `benchmark/context/threejs/manifest.sha256` matches the Three.js context files.
- [x] `benchmark/runner/README.md` includes calibrated FPS instrumentation rules.
- [x] `benchmark/runner/fps-calibration.mjs` exists and has focused unit coverage.
- [x] `benchmark/assets/sneaker.glb` remains the only allowed asset for prompt 10.
- [x] `benchmark/results/amendment-round-6-standard.md` records the prompt-facing Round 6 repair standard.
- [x] `benchmark/results/amendment-round-6-engine-performance.md` records the engine performance and particle repair standard.
- [x] Round 6 may start only after this sign-off is committed.
- [x] A future release claim still requires a complete full benchmark pass; local smoke screenshots do not count.

## Verification Commands

```bash
cd benchmark/context/aura3d/files
shasum -a 256 -c ../manifest.sha256

cd ../../threejs/files
shasum -a 256 -c ../manifest.sha256

pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
pnpm build
pnpm run check:agent-docs
pnpm run check:agent-api
pnpm run check:public-api
```

## Sign-Off Statement

```text
I, gchahal1982, approve the Round 6 standard amendments recorded in benchmark/results/amendment-round-6-standard.md and benchmark/results/amendment-round-6-engine-performance.md, and the Round 6 Phase A sign-off recorded in benchmark/results/round-6-phase-a-signoff.md. I confirm that all prior failed rounds remain invalid for shipping, and I approve starting Round 6 from commit 9c1ed0e26aab814af47e57939053127a84567dbd.
```
