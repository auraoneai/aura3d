# Round 10 Phase A Sign-Off

Round 10 is authorized only from the amended targeted repair standard recorded
in `benchmark/results/amendment-round-10-targeted-repair-standard.md`. This
sign-off does not convert Round 9, local smoke screenshots, or internal
verification commands into shipping evidence.

## Required Fields

Round: 10
Base commit SHA before this amendment: `d6c23ea14043fd4fbb99a97b650186ff1c7e7df2`
Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Reviewer: `gchahal1982`
User signature: `gchahal1982`, active-goal authorization to execute all tasks in
`REMAINING.md` without additional permission

## Checklist

- [x] `FinalizedPromptPlan.md` remains the authoritative release standard.
- [x] Round 1 is recorded as failed in `benchmark/results/round-1.md`.
- [x] Round 7 is recorded as failed.
- [x] Round 8 has no complete valid benchmark result and cannot be used as
      release evidence.
- [x] Round 9 is recorded as a complete failed result in
      `benchmark/results/round-9.md`,
      `benchmark/results/round-9-engine.md`, and
      `benchmark/results/round-9-decision.md`.
- [x] `benchmark/results/amendment-round-10-targeted-repair-standard.md`
      records the targeted prompt, engine, context, and runner repairs required
      after Round 9.
- [x] `benchmark/prompts/manifest.md` still defines the prompt files and order.
- [x] `benchmark/rubric.md` remains the scoring standard for Round 10.
- [x] `benchmark/protocol.md` requires finite agent generation and runner-owned
      runtime capture.
- [x] `benchmark/context/aura3d/manifest.sha256` matches the Aura3D context
      files.
- [x] `benchmark/context/threejs/manifest.sha256` matches the Three.js context
      files.
- [x] `benchmark/runner/README.md` includes calibrated FPS instrumentation
      rules and failed-round repair rules.
- [x] `benchmark/runner/verify-context-manifests.mjs` passes for both context
      bundles and runner guardrails.
- [x] `benchmark/assets/sneaker.glb` remains the only allowed asset for prompt
      10.
- [x] Round 10 may start only after this sign-off is committed in the same
      `PRD-AMENDMENT:` commit as the targeted repair standard.
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
I, gchahal1982, approve the Round 10 targeted repair standard amendment recorded in benchmark/results/amendment-round-10-targeted-repair-standard.md and the Round 10 Phase A sign-off recorded in benchmark/results/round-10-phase-a-signoff.md. I confirm that all prior failed or partial rounds remain invalid for shipping, and I approve starting Round 10 from the amended standard after this PRD-AMENDMENT commit.
```
