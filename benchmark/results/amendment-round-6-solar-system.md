# PRD Amendment - Round 6 Solar System Helper

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

After the humanoid repair, the updated local ten-recipe smoke sheet showed the
next clear pre-benchmark risk: prompt 03 still used an ad-hoc sun plus a few
planets, without six visible planets, orbit paths, or readable labels. Round 5
also recorded Codex/Aura prompt 03 as an Aura3D loss.

This amendment repairs that prompt family before another full benchmark run.
It is targeted repair work, not a benchmark pass.

## Files Changed

- `packages/engine/src/agent-api/index.ts`
- `tests/unit/agent-api/agent-api.test.ts`
- `llms.txt`
- `docs/agents/agent-context.md`
- `docs/agents/api-surface.md`
- `docs/agents/benchmark-recipes.md`
- `docs/agents/build-playbook.md`
- `docs/project/public-api-contract.md`
- `benchmark/context/aura3d/files/llms.txt`
- `benchmark/context/aura3d/files/docs/agents/agent-context.md`
- `benchmark/context/aura3d/files/docs/agents/api-surface.md`
- `benchmark/context/aura3d/files/docs/agents/benchmark-recipes.md`
- `benchmark/context/aura3d/files/docs/agents/build-playbook.md`
- `benchmark/context/aura3d/manifest.sha256`
- `benchmark/results/phase-d-progress.md`
- `benchmark/results/amendment-round-6-solar-system.md`

## Standard Change

- Add public `prefabs.solarSystem()`.
- The helper creates a glowing sun, six named planets, orbit-path segments, a
  Saturn ring cue, starfield points, per-planet label plinths, and bloom.
- Update the prompt 03 benchmark recipe to start from `prefabs.solarSystem()`
  and add a small `ui.html` overlay listing Mercury, Venus, Earth, Mars,
  Jupiter, and Saturn.
- Update agent docs and frozen context so solar-system prompts no longer depend
  on hand-rolled primitive placement.

## Prior Result Invalidated

Round 5 and all earlier rounds remain failed historical results. They cannot be
cited as shipping evidence. The partial local Round 6 diagnostic screenshots
before this amendment remain diagnostic-only and must not be scored as Round 6.

## New Benchmark Round Required

Yes. This amendment is targeted repair evidence only. A full clean benchmark
round is still required before any release claim.

## Local Visual Evidence

The repair was checked with a disposable no-agent smoke capture:

- `/tmp/aura3d-solar-system-smoke.png`
- `/tmp/aura3d-solar-system-smoke.json`

The readout measured a full `1440x960` canvas, body margin `0px`, and visible
label text for `Mercury,Venus,Earth,Mars,Jupiter,Saturn`.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`
- Disposable prompt 03 smoke build and screenshot capture in `/tmp/aura3d-ten-recipe-smoke`
