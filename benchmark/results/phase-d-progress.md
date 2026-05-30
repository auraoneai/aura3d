# Phase D Progress

Date: 2026-05-30
Base failed round: `benchmark/results/round-1.md`

Round 1 remains failed. These commits are repair work before a required full
Phase B rerun.

## Landed Repairs

### `7b459df` - Agent repair helpers

Targeted Round 1 gaps:

- Prompt 02 particles: added `effects.particles(...)` and
  `prefabs.particleFountain(...)` so agents can render visible high-density
  particle systems instead of symbolic emitters or HUD counters.
- Prompt 07 material lab: added material presets for metal, rubber,
  glass/transmission, and clearcoat, plus `prefabs.materialSwatches()`.
- Prompt 08 city: added `prefabs.cityBlock(...)` with streets, scale variation,
  and lit window rows.
- Prompt 10 product viewer: added `prefabs.productStage()`, cylinder plinths,
  and documented orbit/product-stage patterns.
- Prompt 01 physics: added `prefabs.physicsRamp()` as the visible scene cue and
  documented that real physics state is still required for simulation claims.
- Prompt 09 animation: wired `.animate({ clip: "float" | "pulse", speed })`
  into the Three renderer frame loop.
- Context reliability: updated `llms.txt`, `docs/agents/*`, and the benchmark
  Aura3D context bundle with the new repair patterns and dev-server
  termination guidance.

Verification:

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts tests/unit/agent-api/line-count-acceptance.test.ts --reporter=default`
- `pnpm typecheck`
- `pnpm check:agent-docs`
- `pnpm check:agent-api`
- `pnpm check:public-api`

### `aa2f147` - Engine FPS calibration

Targeted Round 1 gap:

- Engine FPS instrumentation: added `benchmark/runner/fps-calibration.mjs` with
  empty rAF and minimal WebGL controls. Future engine captures must record
  `fpsCalibration`; if controls fail, `p50Fps` and `p95FrameTimeMs` are set to
  `null` and the result is marked `fpsInstrumentationStatus: "invalid"`.

This preserves the frozen FPS criterion without letting bad browser controls
produce false renderer-performance claims.

Verification:

- `pnpm exec vitest run tests/unit/tools/benchmark-fps-calibration.test.ts --reporter=default`
- `pnpm typecheck`

## Remaining Work Before Round 2

- Run a fresh dogfood scene or focused browser capture using the new
  `prefabs.particleFountain`, `prefabs.cityBlock`, `prefabs.materialSwatches`,
  `prefabs.productStage`, and `effects.particles` paths to verify the visual
  improvements in screenshots, not only in unit tests.
- Decide whether `prefabs.physicsRamp()` is enough for agent prompt 01 or
  whether the top-level `@aura3d/engine` API needs a more explicit physics
  simulation wrapper around `@aura3d/physics`.
- Rebuild the engine benchmark setup for Round 2 with FPS calibration wired
  into capture output.
- Re-run the entire Phase B benchmark from scratch. Partial reruns do not count.
