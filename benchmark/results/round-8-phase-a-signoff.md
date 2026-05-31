# Round 8 Phase A Sign-Off

Round 8 is authorized only from the amended standard after the hard-prompt,
city/material/product, and agent-renderer FPS repairs. This sign-off does not
convert any prior failed result into shipping evidence.

## Required Fields

Round: 8
Base commit SHA before this sign-off: `08230eb78813ef06cd6f09e429fb510cc81a1e83`
Date: 2026-05-30 America/Los_Angeles / 2026-05-31 UTC
Reviewer: `gchahal1982`
User signature: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Checklist

- [x] `FinalizedPromptPlan.md` remains the authoritative release standard.
- [x] Round 1 is recorded as failed in `benchmark/results/round-1.md`.
- [x] Round 2 is recorded as failed in `benchmark/results/round-2.md`.
- [x] Round 3 is recorded as failed in `benchmark/results/round-3.md`.
- [x] Round 5 is recorded as failed in `benchmark/results/round-5.md`.
- [x] Round 7 is recorded as failed in `benchmark/results/round-7.md`.
- [x] `benchmark/results/amendment-round-8-hard-prompt-performance.md` records the material, city, product, and context repair.
- [x] `benchmark/results/amendment-round-8-shadowless-fps.md` records the agent-renderer FPS repair.
- [x] `benchmark/prompts/manifest.md` still defines the prompt files and order.
- [x] `benchmark/rubric.md` is unchanged for Round 8.
- [x] `benchmark/protocol.md` is unchanged for Round 8.
- [x] `benchmark/context/aura3d/manifest.sha256` matches the Aura3D context files.
- [x] `benchmark/context/threejs/manifest.sha256` matches the Three.js context files.
- [x] `benchmark/runner/README.md` includes calibrated FPS instrumentation rules.
- [x] `benchmark/assets/sneaker.glb` remains the only allowed asset for prompt 10.
- [x] Round 8 may start only after this sign-off is committed.
- [x] A future release claim still requires a complete full benchmark pass; local smoke screenshots and prior failed rounds do not count.

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
I, gchahal1982, approve the Round 8 hard-prompt and renderer-FPS amendments recorded in benchmark/results/amendment-round-8-hard-prompt-performance.md and benchmark/results/amendment-round-8-shadowless-fps.md, and the Round 8 Phase A sign-off recorded in benchmark/results/round-8-phase-a-signoff.md. I confirm that all prior failed rounds remain invalid for shipping, and I approve starting Round 8 from the amended standard after this commit.
```
