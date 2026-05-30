# PRD Amendment - Round 6 Humanoid Readability

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

The partial Round 6 diagnostic contact sheet showed that the viewport/layout
repair made prompt 09 render full-screen, but the humanoid itself still read as
weak primitive assembly: the head and hands appeared visually detached and the
scene did not clearly communicate a procedural walk cycle.

Continuing to rerun the full benchmark before repairing this visible default
would waste time and create benchmark-loop noise. This amendment targets the
specific prompt 09 visual failure before any future full Round 6 run.

## Files Changed

- `packages/engine/src/agent-api/index.ts`
- `tests/unit/agent-api/agent-api.test.ts`
- `llms.txt`
- `docs/agents/agent-context.md`
- `docs/agents/benchmark-recipes.md`
- `docs/agents/build-playbook.md`
- `docs/project/public-api-contract.md`
- `benchmark/context/aura3d/files/llms.txt`
- `benchmark/context/aura3d/files/docs/agents/agent-context.md`
- `benchmark/context/aura3d/files/docs/agents/benchmark-recipes.md`
- `benchmark/context/aura3d/files/docs/agents/build-playbook.md`
- `benchmark/context/aura3d/manifest.sha256`
- `benchmark/results/phase-d-progress.md`
- `benchmark/results/amendment-round-6-humanoid-readability.md`

## Standard Change

- Improve `prefabs.primitiveHumanoid()` so prompt 09 starts from a connected
  primitive character rather than loose body parts.
- Add face cues, a neck connector, hands, planted feet, a contact shadow, a
  walking path, stride markers, and a motion arrow.
- Add a runtime `walk` animation clip for primitive nodes. The clip moves the
  character across the ground plane, adds body bob, and swings arms, legs,
  hands, and feet.
- Update the prompt 09 benchmark recipe to use a front-biased perspective
  camera so the connected character is readable in the captured screenshot.
- Update agent docs and frozen context to document the `walk` clip and the
  improved humanoid helper.

## Prior Result Invalidated

Round 5 and all earlier rounds remain failed historical results. They cannot be
cited as shipping evidence. The partial local Round 6 diagnostic screenshots
before this amendment remain diagnostic-only and must not be scored as Round 6.

## New Benchmark Round Required

Yes. This amendment is targeted repair evidence only. A full clean benchmark
round is still required before any release claim.

## Local Visual Evidence

The repair was checked with a disposable no-agent smoke capture:

- `/tmp/aura3d-humanoid-readability-smoke.png`
- `/tmp/aura3d-humanoid-readability-smoke.json`

The readout measured `#app` and canvas at `1440x960`, body margin `0px`,
body overflow `hidden`, and one canvas.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`
- Disposable prompt 09 smoke build and screenshot capture in `/tmp/aura3d-ten-recipe-smoke`
