# PRD Amendment - Round 6 Physics and Mini-Golf Evidence

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

The latest local ten-recipe smoke sheet no longer showed blank or cropped
failures, but prompts 01 and 06 still carried known benchmark risks:

- Round 3 and Round 5 recorded prompt 01 physics playground losses because the
  Aura3D result looked staged and did not communicate collision/contact
  behavior strongly enough.
- Round 3 and Round 5 recorded prompt 06 mini-golf losses because the Aura3D
  result did not clearly show coherent 3D gameplay, score, aim/shoot, and
  ball-follow camera evidence.

This amendment repairs those visible prompt-family gaps before another full
benchmark run. It is targeted repair work, not a benchmark pass.

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
- `benchmark/results/amendment-round-6-physics-minigolf.md`

## Standard Change

- Improve `prefabs.physicsPlayground({ cubes: 50 })` with a contact grid floor,
  visible falling cubes, settled cubes, fall streaks, a bright contact patch,
  red contact normal vectors, and gravity direction cues.
- Improve `prefabs.miniGolfHole()` with course boundary walls, tee mat, ball
  aim selection ring, dotted shot preview, cup capture ring, score cue, and a
  pointer interaction on the named golf ball.
- Make `camera.follow({ targetNode })` resolve named model/primitive nodes in
  the runtime camera update path so mini-golf recipes can actually frame the
  ball instead of falling back to a generic camera.
- Update the prompt 06 benchmark recipe to use
  `camera.follow({ targetNode: "white physics golf ball" })` and a visible
  strokes HUD.
- Update agent docs and frozen context so prompt 01/06 agents start from the
  repaired helpers and do not build gameplay only in detached 2D overlays.

## Prior Result Invalidated

Round 5 and all earlier rounds remain failed historical results. They cannot be
cited as shipping evidence. The partial local Round 6 diagnostic screenshots
before this amendment remain diagnostic-only and must not be scored as Round 6.

## New Benchmark Round Required

Yes. This amendment is targeted repair evidence only. A full clean benchmark
round is still required before any release claim.

## Local Visual Evidence

The repairs were checked with disposable no-agent smoke captures:

- `/tmp/aura3d-prompt-01-physics-gameplay-smoke.png`
- `/tmp/aura3d-prompt-06-physics-gameplay-smoke.png`
- `/tmp/aura3d-physics-minigolf-smoke.json`

The readout measured full `1440x960` canvases, body margin `0px`, overlay text
`reset contacts: 24` for prompt 01, and overlay text `strokes: 1` for prompt
06.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`
- Disposable prompt 01 and 06 smoke build and screenshot capture in `/tmp/aura3d-ten-recipe-smoke`
