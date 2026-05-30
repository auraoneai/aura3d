# PRD Amendment: Round 4 Standard

Date: 2026-05-30
Amendment commit: pending
User authorization: `gchahal1982` standing instruction to complete all tasks without further permission.
Status: approved for the next full rerun after commit

## Reason

Round 3 failed. The repair work after Round 3 changes both the Aura3D public
API behavior and the frozen Aura3D context bundle that future agents will read.
Per `FinalizedPromptPlan.md`, benchmark results obtained under the prior
standard remain invalidated and cannot be mixed with a new round.

## Standard Changes

- `prefabs.materialSwatches()` now renders engine-parity-scale swatches so the
  five material classes are readable at benchmark camera distance.
- `prefabs.particleFountain(...)` now distributes particle angle and lifecycle
  independently so fountain output appears as a dense particle volume instead
  of a single curve.
- `prefabs.cityBlock(...)` now defaults toward the 20-building benchmark shape:
  denser grid, larger towers, roads, lane strips, and larger lit windows.
- `prefabs.productStage()` now uses a larger round plinth and product placement
  guidance that seats normalized models on the stage.
- The Aura3D agent context bundle now tells agents to use dense particle
  counts, 20-building city blocks, product `position(0, 0.65, -0.65)`, and
  finite benchmark commands that exit instead of keeping dev servers attached.
- `benchmark/context/aura3d/manifest.sha256` was regenerated and verified
  against the post-repair context bundle.

## Prior Results

Round 1, Round 2, and Round 3 remain failed benchmark rounds. They are not
evidence that Aura3D is a proven Three.js competitor and cannot be cited as a
passing result.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=dot`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-api`
- Disposable browser smoke: `/tmp/aura3d-round4-prefab-smoke.png`, sampled
  `nonDark=604250`, `colorful=164554`
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`

## Next Valid Round

Round 4 must be run from scratch from this amended standard after this file and
the regenerated context manifest are committed. Partial reruns do not count.
