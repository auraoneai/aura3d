# Build playbook: browser games and generated assets

For a scene or product viewer, use `docs/agents/prompt-to-3d-workflow.md`. This page is for games, ports and generated 3D assets. Start from the template (`mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`, `arena-shooter`, `character-controller`; see `docs/agents/templates.md`), not an empty project.

## Do not hand-roll the game shell

These are library surface (API pages in `docs/api/`):

- **Lifecycle, pause, results, DOM HUD, touch, juice, game sound:** `createGame` from `@aura3d/engine/game` (`game-kit.md`). The root `createGame` is a headless stub that logs `CREATE_GAME_STUB`.
- **Deterministic simulation and automated checks:** `createFixedStepLoop`, `installQaHooks`, `readQaParams`, `createCountedRng` (`qa-kit.md`).
- **Sound:** `createCueBank`, `createStepSequencer`, `createToneLoop`, `createSampleSlices` from `@aura3d/engine/audio` (`audio-synth.md`).
- **Production models:** `defineModelAssets` (`model-loader.md`): same-origin URL, `sha256`, license, `?models=0` procedural fallback.
- **Draw-call budgets:** `scatterAlongPath`, `scatterInArea`, `splitScatterByDistance`, `mergeStatic` (`scatter-merge.md`).
- **Custom shaders:** `#include <a3d_math>`, `<a3d_noise>`, `<a3d_sky>`, `<a3d_fog>`, `<a3d_toon>`, `<colorspace_decode>` (`glsl-chunks.md`). Cel look as a screen pass: `effects.toon({ bands, outline })` (`toon.md`).
- **Racket sports:** `game.racketSports()` with `ballFlight`, `scoring`, `athleteRig` (`ball-flight.md`, `racket-athlete-rig.md`).
- **Shipping safety:** `installSafetyNet` from `@aura3d/debug` (`safety-net.md`): `?diag=1` panel and black-frame self-heal.

Read `packages/aura3d-cli/skills/aura3d-core/references/pitfalls.md` before shipping: bugs that passed CI and failed on real GPUs (NaN from `pow`, empty instance arrays, unhashed model URLs, instanced textures, shadow depth range, custom-shader colour encoding).

## Game and scene guardrails

1. **No primitive-box heroes.** Characters, athletes, enemies, vehicles, aircraft, trees and landmarks are GLBs: `model(assets.x, { targetMaxDimension, role })`. If the catalog lacks one, generate it (below). Primitives are for ground and court surfaces, field lines, UI rings and reticles, beams and invisible colliders.
2. **Boot into live gameplay with manual control.** No opaque full-screen start modal hiding the canvas on load and no query parameter required for the scene to animate. Autopilot defaults to `false` (the player has control on Frame 1); enable a demo autopilot only for `?autoplay=1`, `?demo=1` or an `Auto` HUD button. Keep mode, stage and roster selectors in a compact HUD bar and call `button.blur()` after clicks so Space and Enter never re-trigger a focused button. Gate Frame 1 on `await app.ready()`.
3. **Optimize Meshy GLBs before admission.** Raw exports can hold 200,000 to 1,750,000 vertices and 20 to 65 MB of 4K textures. Run `assets optimize --file in.glb --out out.glb --role <role>` (vertex budgets: prop 6,000, background 15,000, character 30,000, hero or vehicle 40,000; textures 1024 to 2048 px; 16-bit indices), admit in an isolated project, and keep a game near 25 MB.
4. **Typed asset refs with a `hash`.** The production bridge requires a typed manifest entry with a 64-character `sha256-...` `hash` and `public/aura-assets/...` provenance. Never omit `hash` in `defineAuraAssets(...)` and never put unhashed duplicate GLBs in a route-local `public/aura-assets/`.
5. **Mutate node handles; do not call `app.setScene()` on same-stage restarts.** Remounting disposes GPU resources, breaks lighting and postprocess continuity and aborts GLB loads. Reset position, visibility and animation through `app.nodes.require(...)`.
6. **Avoid fog whitewash and emissive blowout.** If a route shows a haze wall pass `{ fogDensityScale: 0, exposureEv: -0.1 }` to `looks.preset(...)`; do not pin post-processing off for every player (fix the route and install the safety net). Do not stack extra high-intensity `lights.*` on a look (it already supplies environment, key shadow and bloom). Do not set a white `emissive` with high `emissiveIntensity` on an instanced material: per-instance colours multiply the base colour, not the emissive, so every instance blows out. Pass an explicit `material.pbr({ color })` on untextured preview GLBs.
7. **Ground models correctly.** `model(asset, { targetHeight })` puts `position[1]` at the model's feet; boxes and cylinders are centred, so a platform at `(y, sy)` has its top at `y + sy / 2`. Place grounded characters and vehicles at `platform.y + platform.sy / 2`. Custom meshes (`geometry.custom(...)`) wind triangles counter-clockwise seen from `+Y`.
8. **Full viewport and separation.** Size `html, body, #app, canvas` to `100vw` by `100vh` (`position: fixed; inset: 0; overflow: hidden`); extend the ground apron under the camera frustum so no black void shows. Turn off `collision: true` on `camera.rigs.shoulder` when the target has child nodes at the same position. In fighting and sports games enforce at least 1.4 m pushbox separation every frame and spawn at `|x| >= 1.8` m.

Before calling a game done it must prove keyboard (and touch) input, an objective, reset, and score or fail or progression, with a looked-at first frame.

## Generated 3D assets (Meshy)

1. Try the catalog first (`aura3d-assets`); generate only what it lacks.
2. Write a text prompt in your own words; never image-to-3D from screenshots of someone else's game.
3. Keep a credit ledger (`aura3d meshy ledger reserve | settle | status`) (uncapped by default; any cap is opt-in); a rate-limited call is `unconfirmed`, not failed (`meshy-cli`).
4. `assets optimize --role`, then `assets import-meshy --into <dir> --prefix <game> --name <role>` (isolated admission), then declare it with `defineModelAssets`.
5. Prove it renders in the production build: non-blank canvas and `drawCalls > 0`. Details: `docs/api/cli-asset-tools.md`.

## Converting an existing browser game

Capture a deterministic reference of the original, write a typed contract, transcribe the pure simulation behind differential tests, port render, input, audio and UI behind the contract, then gate on replay, matching frames, a real-input play-through and a production-build check before swapping the route (`docs/aura-slam/ARCHITECTURE.md`, `docs/workflows/crayon-game-reverse-engineering.md`). Reproduce mechanics, tuning and look; never copy the original's art, text or audio.

Keep edits scoped to active product paths. Archived legacy runtime files are historical reference only.
