# Round 11 Phase A Sign-Off

Round 11 is authorized only from the amended engine FPS repair standard
recorded in `benchmark/results/amendment-round-11-engine-fps-repair.md`. This
sign-off does not convert Round 10 or any local smoke screenshot into shipping
evidence.

## Required Fields

Round: 11
Base commit SHA before this sign-off: `2d1cb87cb0875b3b8be7e35aeb5b2a979f0e3c95`
Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Reviewer: `gchahal1982`
User signature: `gchahal1982`, active-goal authorization to execute all tasks in
`REMAINING.md` without additional permission

## Checklist

- [x] `FinalizedPromptPlan.md` remains the authoritative release standard.
- [x] Round 9 remains failed and invalid for shipping.
- [x] Round 10 engine attempt remains failed and invalid for shipping.
- [x] `benchmark/results/amendment-round-11-engine-fps-repair.md` records the
      active engine repair standard.
- [x] `benchmark/prompts/manifest.md` still defines the prompt files and order.
- [x] `benchmark/rubric.md` remains the scoring standard for Round 11.
- [x] `benchmark/protocol.md` requires finite agent generation and runner-owned
      runtime capture.
- [x] `benchmark/context/aura3d/manifest.sha256` matches the Aura3D context
      files.
- [x] `benchmark/context/threejs/manifest.sha256` matches the Three.js context
      files.
- [x] `benchmark/runner/README.md` includes calibrated FPS instrumentation
      rules.
- [x] `benchmark/assets/sneaker.glb` remains the only allowed asset for prompt
      10.
- [x] A release claim still requires a complete full benchmark pass; local
      smoke screenshots and prior failed rounds do not count.

## Sign-Off Statement

```text
I, gchahal1982, approve the Round 11 engine FPS repair amendment recorded in benchmark/results/amendment-round-11-engine-fps-repair.md and the Round 11 Phase A sign-off recorded in benchmark/results/round-11-phase-a-signoff.md. I confirm that all prior failed or partial rounds remain invalid for shipping, and I approve starting Round 11 from the amended standard after this sign-off commit.
```
