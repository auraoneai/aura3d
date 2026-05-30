# Round 2 Decision

Date: 2026-05-30
Decision: fix specific gaps and re-run. Do not ship.

## Result

Round 2 failed the release standard.

- Codex/Aura3D won 1/10 prompts; required 7/10.
- Claude/Aura3D won 0/10 prompts; required 7/10.
- Codex hard-prompt floor was 0/3; required 2/3.
- Claude hard-prompt floor was 0/3; required 2/3.
- Engine visual parity was 2/5; required 4/5.

## Primary Failure Signals

1. Codex/Aura regressed or failed visually on prompts 01, 04, 05, 06, 07, 08, 09, and 10 relative to raw Three.js. The particle fountain repair helped prompt 02, but the benchmark still landed at only 1 win.
2. Claude/Aura is process-noncompliant: 8 of 10 attempts timed out despite the explicit dev-server termination instruction.
3. Claude/Aura prompt 02 also failed capture/build.
4. Engine parity improved in physics and sneaker scenes, but material-grid, city-block, and particles still miss visual parity; Aura engine parity reached only 2/5.
5. Calibrated FPS instrumentation now records invalid controls instead of false renderer claims, but scene 01 and marginal scene 02/03 Aura FPS still miss or sit below the p50 floor when calibration passes.

## Required Next Fixes

- Rendering/runtime: repair the top-level Aura3D renderer path that produced a black Codex/Aura physics viewport and weak/blank data-viz framing.
- Agent context/process: Claude still starts or waits on long-lived processes. The context must give Claude a finite verification path that does not require attached dev servers.
- Visual defaults: improve default camera/framing, lighting, and scale for material lab, data-viz, city, humanoid, and product-viewer scenes.
- Engine prefabs: make `prefabs.materialSwatches()`, `prefabs.cityBlock()`, and `prefabs.particleFountain()` visually closer to equivalent Three.js outputs at parity-scene scale.
- Product staging: fix `prefabs.productStage()`/model staging so the plinth is round, visible, and not artifact-like.
- Re-run from scratch only after fixes. Partial reruns do not count.

Round 1 and Round 2 are both failed benchmark rounds. Neither can be cited as proof that Aura3D is a proven Three.js competitor.
