# Round 9 Phase A Sign-Off

Round 9 is authorized only from the amended standard recorded in
`benchmark/results/amendment-round-9-final-proof-standard.md`. This sign-off
does not convert any prior failed result, local smoke screenshot, or internal
verification command into shipping evidence.

## Required Fields

Round: 9
Base commit SHA before this amendment: `e63a87e84f42cf67e72209759f3b7efe6a7063bd`
Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Reviewer: `gchahal1982`
User signature: `gchahal1982`, active-goal authorization to execute all tasks in
`REMAINING.md` without additional permission

## Checklist

- [x] `FinalizedPromptPlan.md` remains the authoritative release standard.
- [x] Round 1 is recorded as failed in `benchmark/results/round-1.md`.
- [x] Round 2 is recorded as failed in `benchmark/results/round-2.md`.
- [x] Round 3 is recorded as failed in `benchmark/results/round-3.md`.
- [x] Round 5 is recorded as failed in `benchmark/results/round-5.md`.
- [x] Round 7 is recorded as failed in `benchmark/results/round-7.md`.
- [x] Round 8 has no complete valid benchmark result and cannot be used as
      release evidence.
- [x] `benchmark/results/amendment-round-9-final-proof-standard.md` records the
      material, city, product, process, FPS calibration, and release-proof
      repairs.
- [x] `benchmark/prompts/manifest.md` still defines the prompt files and order.
- [x] `benchmark/rubric.md` remains the scoring standard for Round 9.
- [x] `benchmark/protocol.md` requires finite agent generation and runner-owned
      runtime capture.
- [x] `benchmark/context/aura3d/manifest.sha256` matches the Aura3D context
      files.
- [x] `benchmark/context/threejs/manifest.sha256` matches the Three.js context
      files.
- [x] `benchmark/runner/README.md` includes calibrated FPS instrumentation rules
      and standard cleanliness checks.
- [x] `benchmark/runner/verify-context-manifests.mjs` passes for both context
      bundles and runner guardrails.
- [x] `benchmark/assets/sneaker.glb` remains the only allowed asset for prompt
      10.
- [x] Round 9 may start only after this sign-off is committed.
- [x] A release claim still requires a complete full benchmark pass; local
      smoke screenshots and prior failed rounds do not count.

## Verification Commands

```bash
pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts tests/unit/tools/benchmark-fps-calibration.test.ts --reporter=default
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
pnpm build
pnpm run check:agent-docs
pnpm run check:agent-api
pnpm run check:public-api
node benchmark/runner/verify-context-manifests.mjs
git diff --check
```

## Sign-Off Statement

```text
I, gchahal1982, approve the Round 9 final proof standard amendment recorded in benchmark/results/amendment-round-9-final-proof-standard.md and the Round 9 Phase A sign-off recorded in benchmark/results/round-9-phase-a-signoff.md. I confirm that all prior failed or partial rounds remain invalid for shipping, and I approve starting Round 9 from the amended standard after this PRD-AMENDMENT commit.
```
