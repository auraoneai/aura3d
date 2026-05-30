# PRD Amendment - Round 6 UI Mount Repair

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

A partial Round 6 diagnostic run showed that Codex/Aura prompt 08 compiled and
captured a screenshot, but the screenshot was blank except for the day/night
toggle. This was not a city-prefab visual-quality failure. It was a public API
mounting failure:

- The generated app called `ui.html("#app", ...)` with markup containing
  `<div id="scene"></div>` and then mounted Aura3D into `#scene`.
- `ui.html` inserted markup as a sibling by default using `afterend`.
- Because `#app` was full viewport height and the body hid overflow, `#scene`
  was placed below the viewport.
- The canvas existed and route health passed, but the visible screenshot showed
  only the overlay button.

That failure mode can affect any benchmark prompt that uses `ui.html` for a HUD
plus nested scene container. Another full round would be wasteful until this
default is repaired.

## Files Changed

- `packages/engine/src/agent-api/index.ts`
- `tests/unit/agent-api/agent-api.test.ts`
- `docs/agents/api-surface.md`
- `docs/agents/build-playbook.md`
- `benchmark/context/aura3d/files/docs/agents/api-surface.md`
- `benchmark/context/aura3d/files/docs/agents/build-playbook.md`
- `benchmark/context/aura3d/manifest.sha256`
- `docs/project/public-api-contract.md`
- `benchmark/results/phase-d-progress.md`

## Standard Change

- Change `ui.html(target, markup)` to insert markup inside the target by
  default with `beforeend`.
- Keep the optional `InsertPosition` argument so callers can still intentionally
  request sibling insertion.
- Document that `ui.html("#app", markup)` is safe for nested scene containers
  and HUDs.
- Add a regression test that asserts the default insertion position is
  `beforeend`.

## Prior Partial Run Invalidated

The partial local Round 6 run under `benchmark/runs/round-6/` was diagnostic
only and is not a valid benchmark result. It was stopped after Codex/Aura and
Codex/Three.js revealed enough evidence to identify the UI mount bug. It must
not be committed or scored as Round 6.

## New Benchmark Round Required

Yes. A future pass requires a clean full benchmark round from the amended
standard. Partial reruns do not count as release evidence.

## Diagnostic Evidence

Before this amendment:

- `benchmark/runs/round-6/codex-aura3d/prompt-08/screenshot.png` showed a
  blank dark viewport with only the toggle button visible.
- Route health still showed one full-size canvas, proving a screenshot/route
  pass was too weak to catch the visual failure.

After this amendment:

- A disposable copy of the same generated prompt-08 app rendered the city in
  viewport.
- Screenshot: `/tmp/aura3d-ui-mount-city-smoke.png`
- Readout: `/tmp/aura3d-ui-mount-city-smoke.json`
- The readout showed `#app`, `#scene`, and the canvas all at
  `1440 x 960` with `x=0`, `y=0`.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`
- Disposable prompt-08 smoke at `/tmp/aura3d-ui-mount-city-smoke.png`
