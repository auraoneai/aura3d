# PRD Amendment - Round 6 Engine Performance and Particle Repair

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

Round 5 failed. The result is recorded in:

- `benchmark/results/round-5.md`
- `benchmark/results/round-5-engine.md`
- `benchmark/results/round-5-decision.md`

The first Round 6 amendment repaired prompt-facing API and context issues, but
the remaining Round 5 engine gaps also needed library changes before another
full benchmark round would be useful. This amendment targets engine city
performance, sneaker/product performance, and particle visual parity.

The immediate Round 5 failures addressed by this amendment are:

- Engine city scene performance and memory pressure from many individual
  primitive meshes.
- Engine sneaker/product performance regression from expensive material/light
  defaults.
- Engine particle visual parity gap where Aura3D produced a sparse/light
  fountain compared with the raw Three.js dense swirl.

## Files Changed

- `packages/engine/src/agent-api/index.ts`
- `tests/unit/agent-api/agent-api.test.ts`
- `docs/project/public-api-contract.md`
- `benchmark/results/phase-d-progress.md`

## Standard Change

- Batch non-animated primitive nodes into `THREE.InstancedMesh` groups when
  primitive geometry and material are equivalent. This preserves public scene
  authoring behavior while reducing draw calls for city and repeated-primitive
  scenes.
- Disable point-light shadow casting by default in the Three renderer. Studio
  and city scenes still receive directional shadows, but prompt-authored point
  lights no longer multiply shadow-map cost.
- Use `MeshPhysicalMaterial` only for transmission and clearcoat materials.
  Opacity-only materials now use cheaper `MeshStandardMaterial` settings with
  transparency and depth-write handling.
- Add a multicolor swirl halo to `prefabs.particleFountain(...)` and render
  swirl/multicolor particle systems with per-particle HSL colors, larger point
  size, and stronger opacity.

## Prior Result Invalidated

Round 5 remains a valid failed historical result, but it is invalid for shipping
or future release claims under this amended standard. A future pass requires a
new full benchmark round from the amended context and library state.

## New Benchmark Round Required

Yes. The local smoke screenshots and diagnostics are repair evidence only.
Partial reruns do not count as release evidence.

## Diagnostic Evidence

Local Round 6 smoke screenshots were captured outside the benchmark runner:

- `/tmp/aura3d-round6-city-smoke.png`
- `/tmp/aura3d-round6-particles-smoke.png`
- `/tmp/aura3d-round6-product-smoke.png`

The smoke readout reported:

- City: `fps=60`, `drawCalls=11`
- Particles: `fps=60`, `drawCalls=6`
- Product: `fps=60`, `drawCalls=6`

These numbers are not benchmark pass evidence. They show that the targeted
engine repairs are behaving sanely enough to justify the next full round.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `git diff --check`
