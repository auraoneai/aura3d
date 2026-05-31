# PRD Amendment - Round 8 Hard Prompt and FPS Repair

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

Round 7 failed. The result is recorded in:

- `benchmark/results/round-7.md`
- `benchmark/results/round-7-engine.md`
- `benchmark/results/round-7-decision.md`

Round 7 showed real progress: both agents generated, built, ran, and captured
all 10 Aura3D prompts, and engine visual parity reached 5 of 5 scenes. The
remaining release blockers are narrower:

- Prompt 07 material lab did not clearly beat raw Three.js on material identity,
  reflections, and lighting.
- Prompt 08 city block did not clearly beat raw Three.js on detail, streets,
  lighting, and scale variation.
- Prompt 10 product sneaker tied or lost because product framing and lighting
  were not consistently stronger than raw Three.js.
- Engine material-grid and city-block missed the absolute 30 FPS floor under
  valid FPS calibration.

This amendment targets those specific failures. It is not a benchmark pass and
does not authorize a ship claim.

## Files Changed

- `packages/engine/src/agent-api/index.ts`
- `tests/unit/agent-api/agent-api.test.ts`
- `llms.txt`
- `docs/agents/benchmark-recipes.md`
- `docs/agents/build-playbook.md`
- `docs/agents/templates.md`
- `benchmark/context/aura3d/files/llms.txt`
- `benchmark/context/aura3d/files/docs/agents/benchmark-recipes.md`
- `benchmark/context/aura3d/files/docs/agents/build-playbook.md`
- `benchmark/context/aura3d/files/docs/agents/templates.md`
- `benchmark/context/aura3d/manifest.sha256`
- `docs/project/public-api-contract.md`
- `benchmark/results/phase-d-progress.md`

## Standard Change

- Improve `prefabs.materialSwatches()` with stronger black/white reflection
  contrast, cyan glass contrast cards, a red automotive clearcoat swatch, and a
  wider material-lab camera recipe so all five material classes remain visible.
- Improve `prefabs.cityBlock(...)` with cross streets, crosswalk stripes,
  larger readable street-grid cues, roofline signs, and tall emissive window
  columns.
- Replace per-floor city window boxes with four window-column strips per tower.
  This preserves visible lit windows while reducing primitive count and draw
  pressure for the city benchmark scene.
- Improve `prefabs.productStage()` with a tighter plinth, smaller contact
  highlight, cleaner softboxes, and a three-quarter product camera recipe.
- Reduce default agent API primitive tessellation for spheres and cylinders so
  screenshot-oriented benchmark scenes are less overbuilt without changing the
  public authoring API.
- Update the frozen Aura3D context recipes so future agents copy the amended
  material, city, and product framing instead of Round 7's weaker defaults.

## Prior Result Invalidated

Round 7 remains a valid failed historical result, but it is invalid for shipping
or future release claims under this amended standard. A future pass requires a
new full benchmark round from the amended context and library state.

## New Benchmark Round Required

Yes. The local smoke screenshots and focused tests are repair evidence only.
Partial reruns do not count as release evidence.

## Diagnostic Evidence

Local targeted smoke screenshots were captured outside the benchmark runner:

- `/tmp/aura3d-round8-material-smoke.png`
- `/tmp/aura3d-round8-city-smoke.png`
- `/tmp/aura3d-round8-product-smoke.png`

The smoke pages rendered one scene per 1280x720 capture and reported one canvas
with no Vite error overlay for each scene. These screenshots are not committed
because benchmark PNG/JPG artifacts remain local evidence unless explicitly
requested.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`
- `git diff --check`
