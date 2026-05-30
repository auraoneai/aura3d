# PRD Amendment - Round 6 Viewport Layout Defaults

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

The partial Round 6 diagnostic contact sheet showed recipe-based outputs with
white page bands or partial-height canvas captures when agents did not add CSS.
This is a bad default for an agent-facing 3D API: benchmark recipes should not
need custom CSS just to remove browser body margin or make the canvas fill the
screenshot.

The issue reproduced with a no-CSS copy of the animated humanoid recipe:

- `#app` and the canvas measured `1424 x 712` at `x=8`, `y=8`.
- Browser default body margin remained visible.
- The screenshot had a white band below the canvas.

## Files Changed

- `packages/engine/src/agent-api/index.ts`
- `llms.txt`
- `docs/agents/build-playbook.md`
- `benchmark/context/aura3d/files/llms.txt`
- `benchmark/context/aura3d/files/docs/agents/build-playbook.md`
- `benchmark/context/aura3d/manifest.sha256`
- `docs/project/public-api-contract.md`
- `benchmark/results/phase-d-progress.md`

## Standard Change

- `createAuraApp("#app", ...)` now applies viewport-safe layout defaults when
  mounting into a direct empty app container.
- For direct body child app containers, Aura3D clears default body margin,
  fixes body/html dimensions, hides overflow, and gives the app container
  `100vh` sizing.
- Canvas CSS size is pinned to the measured viewport size during configuration
  so browser intrinsic canvas sizing cannot produce partial-height captures.
- Callers can opt out of the default page-layout behavior by adding
  `data-aura3d-preserve-page-layout` to the target container.
- Agent docs now say benchmark scenes do not need CSS merely to fill the
  screenshot; CSS should be reserved for overlays and controls.

## Prior Partial Run Invalidated

The partial local Round 6 run under `benchmark/runs/round-6/` was diagnostic
only and is not a valid benchmark result. It must not be committed or scored as
Round 6.

## New Benchmark Round Required

Yes. A future pass requires a clean full benchmark round from the amended
standard. Partial reruns do not count as release evidence.

## Diagnostic Evidence

Before this amendment:

- `/tmp/aura3d-no-css-humanoid-smoke.png` showed a white band below the canvas.
- `/tmp/aura3d-no-css-humanoid-smoke.json` measured the app and canvas at
  `1424 x 712`, `x=8`, `y=8`.

After this amendment:

- `/tmp/aura3d-no-css-humanoid-smoke-fixed.png` shows the no-CSS humanoid
  recipe filling the viewport.
- `/tmp/aura3d-no-css-humanoid-smoke-fixed.json` measured the app and canvas at
  `1440 x 960`, `x=0`, `y=0`, with body margin `0px`.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`
- Disposable no-CSS humanoid smoke at `/tmp/aura3d-no-css-humanoid-smoke-fixed.png`
