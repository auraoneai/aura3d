# Pixel neutrality of lane 519 on live games

Question: does lane 519's engine change (on-demand branch in `createAuraAppCore.ts`, `PhysicsRuntime.ready()`, the `loadMode` getter
on the legacy physics access, `physicsLoadMode` through `physics-rapier` / `physics`) change what a game renders in the default
eager build? Games do not use the new Vite plugin, so this isolates the engine change.

## Method (lane 514's, `../../physics-514/neutrality/README.md`)

- Base = `cf536d3bc` (tip of `origin/lane/514-physics-out-of-box`, this lane's parent), branch = this lane's engine source as
  committed in `363220ebc`, except that five games were built just before the last edit to the on-demand replay check (a path an
  eager game never runs); Cross Hop and Grid Dispatch were built from the final source. Both builds from the
  same worktree: for base, `packages/` was checked out at `cf536d3bc` for the duration and restored from HEAD afterwards
  (`../tools/games-build.sh`). Each game: `vite build` with the app's own config, public dir served at capture time (the main
  checkout's `public/`, read-only) instead of copied; apps without their own config use the repo root config and copy their small
  `public/`.
- Capture (`../../physics-514/tools/cap.mjs` via `../tools/games-capture.sh`): headless Chrome with the real GPU (ANGLE Metal) over
  loopback CDP, 960x540, the virtual-clock shim from `origin/lane/504-bellkeeper` (`../../physics-514/tools/shim.js`), 10 s real-time
  settle with rAF held, then 240 frames of 1/60 s with frame-indexed key input, then a screenshot. Serialized under
  `/tmp/a3d-rea.lock`.
- Two captures per build (`a`, `b`) for base and branch, so every comparison has a same-build noise run.
- `../tools/pixdiff.mjs`: mean absolute RGB difference, share of differing pixels, bounding box. All numbers and the sha256 of every
  capture are in `frames.json`; byte-identical captures are stored once. Every distinct frame was looked at.

## Result

| Game | Physics | base a vs base b (noise) | branch a vs branch b (noise) | base a vs branch a | base a vs branch b |
| --- | --- | --- | --- | --- | --- |
| Bank Shot | `physics.world` (Rapier) | 0 | 0 | 0 | 0 |
| Slingshot Siege (`seed=1&level=0&demo=1`) | `physics.world` (Rapier) | 0 | 25.25 | 25.25 | 0 |
| Blockfall Reactor | `game.collisionWorld` Rapier proof | 0 | 0 | 0 | 0 |
| Aurora Lander | - | 0.0594 | 0.0167 | 0.0178 | 0.0011 |
| Grid Dispatch (`showcase-teleoperator`) | - | 0 | 0 | 0 | 0 |
| Vault Breakers | - | 0 | 0 | 0 | 0 |
| Cross Hop | - | 0 | 0 | 0 | 0 |

- Bank Shot, Blockfall Reactor, Grid Dispatch: all four captures byte-identical.
- Slingshot Siege: branch `b` is byte-identical to base `a` and base `b`; branch `a` (the first branch capture) shows the camera and
  windmill at a different phase over the whole frame, and differs from branch `b` of the same build by exactly the same amount. Same
  capture-start noise lane 514 recorded for this game.
- Aurora Lander: the only differing pixels are the box `[224,86]-[345,114]`, the "GUST INBOUND" HUD badge, which flips between runs of
  the same build (lane 514 saw the same).
- Vault Breakers and Cross Hop render no 3D in this harness on base and branch alike (`RENDERER_MOUNT_FAILED`:
  `MODEL_CUSTOM_MATERIAL_UNSUPPORTED` for Vault Breakers, an app-public asset 404 for Cross Hop because only the main checkout's
  `public/` is served); their HUD frames are byte-identical but say nothing about 3D, which is why Grid Dispatch was added.
