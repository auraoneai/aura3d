# Phase D Progress

Date: 2026-05-30
Base failed rounds: `benchmark/results/round-1.md`,
`benchmark/results/round-2.md`

Round 1 and Round 2 remain failed. These commits are repair work before a
required full Phase B rerun.

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

### `6fd5de9` - Round 2 prompt-family repair helpers

Targeted Round 2 gaps:

- Prompt 01 physics: added `prefabs.physicsPlayground({ cubes: 50 })` so
  agents can render visible ramp/cube/contact evidence through Aura3D instead
  of building only a custom 2D physics canvas that may screenshot as an empty
  viewport.
- Prompt 05 data visualization: added `prefabs.dataBars3D({ grid: 6 })` so
  agents can render a stable 36-bar chart once, with `.animate(...)` and
  pointer metadata, instead of repeatedly disposing and recreating the app.
- Prompt 04, 06, and 09: added `prefabs.neonTunnel(...)`,
  `prefabs.miniGolfHole()`, and `prefabs.primitiveHumanoid()` as prompt-family
  starters for the scenes where Aura3D lost on visual completeness/framing.
- Prompt 07 and engine material parity: expanded `prefabs.materialSwatches()`
  to include five distinct material spheres: metal, transparent glass, rubber,
  emissive, and clearcoat.
- Prompt 08 and engine city parity: made `prefabs.cityBlock(...)` support up to
  24 buildings with denser windows, side-window planes, lane dividers, and
  visible street lamps.
- Prompt 10 and engine product parity: changed `prefabs.productStage()` to use
  a brighter round plinth and an elliptical cylinder contact shadow instead of
  the dark rectangular shadow artifact seen in Round 2.
- Camera/framing: changed `camera.orbit(...)` and both render paths to preserve
  an angled orbit camera position, reducing flat lineup screenshots.
- Context reliability: updated `llms.txt` and the Aura3D benchmark context so
  agents are told not to recreate `createAuraApp(...)` in animation loops and to
  start benchmark-family prompts from the matching `prefabs.*` helpers.

Verification:

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=dot`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-api`
- Disposable browser smoke: `/tmp/aura3d-prefab-smoke-PMpqQi/smoke.png`,
  sampled `nonDark=5071`, `colorful=2220`.
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`

## Remaining Work Before Round 3

- Re-run the entire Phase B benchmark from scratch. Partial reruns do not count.
