# PRD Amendment - Round 6 Material Lab Framing

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

The partial Round 6 diagnostic contact sheet showed Codex/Aura prompt 07 using
the material helper, but the material row was crowded and edge swatches were
cropped or visually over-dominant. This makes the material-lab prompt fragile:
agents can use the intended helper and still produce a screenshot that is hard
to score as a complete material comparison.

## Files Changed

- `packages/engine/src/agent-api/index.ts`
- `tests/unit/agent-api/agent-api.test.ts`
- `docs/agents/benchmark-recipes.md`
- `benchmark/context/aura3d/files/docs/agents/benchmark-recipes.md`
- `benchmark/context/aura3d/manifest.sha256`
- `docs/project/public-api-contract.md`
- `benchmark/results/phase-d-progress.md`

## Standard Change

- Tighten `prefabs.materialSwatches()` from a wide diagonal row to a compact
  inspection row.
- Reduce swatch sphere scale and move edge swatches inward so all five material
  classes fit in one benchmark screenshot.
- Narrow the floor, backdrop, softbox strip, label plinths, and glass contrast
  card to match the compact row.
- Change the material-lab benchmark recipe from an oblique orbit camera to a
  front-biased perspective camera so all five materials are equally readable.
- Add a unit regression test that the five sphere swatches stay within the
  compact framing bounds.

## Prior Partial Run Invalidated

The partial local Round 6 run under `benchmark/runs/round-6/` was diagnostic
only and is not a valid benchmark result. It must not be committed or scored as
Round 6.

## New Benchmark Round Required

Yes. A future pass requires a clean full benchmark round from the amended
standard. Partial reruns do not count as release evidence.

## Diagnostic Evidence

- Before repair: `/tmp/aura3d-round6-sheets/codex-aura3d.png` showed prompt 07
  as a cropped, diagonal material row.
- After repair: `/tmp/aura3d-material-framing-smoke-perspective.png` shows all
  five swatches fully visible in a front-biased material inspection row.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`
- Disposable material smoke at `/tmp/aura3d-material-framing-smoke-perspective.png`
