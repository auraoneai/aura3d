# Neon Corridor Strike — BLOCKED evidence

Status: **blocked**. The example `examples/neon-corridor-strike` was built end-to-end,
proven visually excellent as a *static* scene, then **deleted** because neither public
engine surface can render it as a *stable, playable* 10/10 FPS. This folder holds the
named failing evidence.

## Evidence files

- `engine-static-first-load.png` — the `@aura3d/engine createAuraApp` route on its first
  drawn frame. Proves the typed CC0 assets are genuinely 10/10: a readable Kenney blaster
  **rifle viewmodel**, a tiled **neon space-station corridor** (real textured GLBs), engine
  emissive + bloom neon lighting, and a full FPS HUD. Nothing about the *assets* or the
  *static* render is a "yellow blob / white plane / floating shard".

- `engine-playable-crash-frozen.png` — the same route after `deploy()` + attempted fire.
  Ammo is frozen at `14/14` (no shot registered), no muzzle burst, no advancing hostile:
  the render loop **crashed**. `app.diagnostics().errors` and `page.on("pageerror")` both
  report exactly one uncaught `RenderDeviceError: Renderer matrix inputs must be finite
  mat4 values`, after which the engine's rAF loop stops (frame counter frozen at ~4 for
  10+ seconds; `onFrame` never runs again).

- `lean-muzzle-blob-FAIL.png` — the same game rebuilt on `@aura3d/lean/game` (the only
  surface whose runtime moves multiple typed-GLB actors without crashing). Lean has **no
  emissive materials, no bloom, and only fixed built-in lighting**, so the muzzle flash can
  only be matte pastel `pbr` spheres. The result is exactly the forbidden **"yellow blob"
  gunfire** (fail condition #1). The corridor also washes out under lean's flat lighting.

## Why blocked (root cause — an upstream `packages/**` runtime limitation)

Reproduced in isolation with a minimal harness (all runtime mutation deferred until after
`app.ready()`):

- `@aura3d/engine` root `createAuraApp` (production WebGL runtime): mutating **one** runtime
  model node per frame (`setPosition`/`setRotation`/`setScale`) is stable. As soon as the
  scene contains **more than one runtime (mutable) model node** and any of them is mutated,
  the renderer throws an uncaught `RenderDeviceError` ("Renderer matrix inputs must be finite
  mat4 values") from inside `productionController.render()`. The per-frame `render()` call is
  not wrapped in a try/catch, so a single throw stops the animation-frame loop. A real
  corridor shooter needs many mutable actors (enemies + rifle recoil + muzzle), so it cannot
  run. `group(...).runtime(...)` is not a workaround — groups are flattened before the runtime
  registry is built (`groups.flatten` in `createProductionRuntimeSceneRenderer`), so a group's
  runtime id never registers. `app.setScene()` per frame re-mounts the async renderer and draws
  blank frames.

- `@aura3d/lean/game` (lean runtime): moves multiple actors per frame with **no** matrix
  crash, but exposes no emissive materials, no bloom, no controllable/point lights, and no
  runtime rotation (`createAuraLeanModelMatrix` ignores rotation). Muzzle fire therefore
  cannot read as fire — see `lean-muzzle-blob-FAIL.png`.

Both blockers live under `packages/**` (engine production runtime; lean renderer + API
surface), which this task is explicitly forbidden to modify. The **assets look like
characters and fire *can* look like fire on the engine surface**; the wall is purely the
runtime, so per the task's fallback the example and its (unwritten) specs are removed rather
than shipped below a true 10/10.

## What was actually produced (reproducible before deletion)

- 8 typed CC0 GLB assets acquired via the Aura3D CLI with full provenance
  (`aura.assets.json` + `src/aura-assets.ts`): `rifle` (Kenney blaster-kit, CC0), `corridor`
  / `corridorWide` / `corridorEnd` / `gateLasers` (Kenney modular-space-kit, CC0),
  `enemyVanguard` / `enemyStriker` / `enemyHeavy` (Kenney blocky-characters, CC0, textures
  embedded + hierarchy flattened for the safe renderer).
- A complete route (`createAuraApp`, corridor, rifle viewmodel, humanoid hostiles, particle-
  free emissive muzzle burst, WASD + pointer aim + fire, objective / score / fail / reset,
  wave progression) — stable and beautiful statically, crashing the moment it animates.
