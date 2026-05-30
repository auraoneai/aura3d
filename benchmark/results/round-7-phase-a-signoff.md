# Round 7 Phase A Sign-Off

Round 7 is authorized only from the amended standard after the nullable mount
target repair. This sign-off does not convert any prior failed result into
shipping evidence.

## Required Fields

Round: 7
Base commit SHA before this amendment: `87d6663796bd15e08195fb06f3b5ebb38ea5cee5`
Date: 2026-05-30
Reviewer: `gchahal1982`
User signature: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Checklist

- [x] `FinalizedPromptPlan.md` remains the authoritative release standard.
- [x] Round 1 is recorded as failed in `benchmark/results/round-1.md`.
- [x] Round 2 is recorded as failed in `benchmark/results/round-2.md`.
- [x] Round 3 is recorded as failed in `benchmark/results/round-3.md`.
- [x] Round 5 is recorded as failed in `benchmark/results/round-5.md`.
- [x] The partial Round 6 local attempt exposed Codex/Aura prompt 08 compile failure and is not shipping evidence.
- [x] `benchmark/prompts/manifest.md` still defines the prompt files and order.
- [x] `benchmark/rubric.md` is unchanged for Round 7.
- [x] `benchmark/protocol.md` is unchanged for Round 7.
- [x] `benchmark/context/aura3d/manifest.sha256` matches the Aura3D context files.
- [x] `benchmark/context/threejs/manifest.sha256` matches the Three.js context files.
- [x] `benchmark/runner/README.md` includes calibrated FPS instrumentation rules.
- [x] `benchmark/assets/sneaker.glb` remains the only allowed asset for prompt 10.
- [x] `benchmark/results/amendment-round-7-nullable-target.md` records the Round 7 standard repair.
- [x] Round 7 may start only after this sign-off is committed.
- [x] A future release claim still requires a complete full benchmark pass; local smoke screenshots and partial Round 6 captures do not count.

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
I, gchahal1982, approve the Round 7 nullable mount target amendment recorded in benchmark/results/amendment-round-7-nullable-target.md and the Round 7 Phase A sign-off recorded in benchmark/results/round-7-phase-a-signoff.md. I confirm that all prior failed rounds and the partial Round 6 local attempt remain invalid for shipping, and I approve starting Round 7 from the amended standard after this commit.
```
