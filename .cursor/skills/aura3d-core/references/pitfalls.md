# Known pitfalls (from porting eleven games and rebuilding four)

Every item below cost a debugging session and is now either fixed in 4.1 or has a
rule. Read it before you ship a route, and when a page looks wrong on a real device
but passes in CI.

## Rendering that passes in CI and fails on a player's GPU

- **NaN from `pow` (Apple GPUs).** A custom shader's `pow` call with a base that
  rounds slightly negative returns NaN on Apple silicon; bloom spreads it and the
  page presents black while the engine reports hundreds of draw calls. Use the
  `a3d_math` chunk helpers; 4.1 injects a total `pow` into `material.custom` and
  drops non-finite samples in the output stage and bloom downsample.
- **Software GL is not real-GPU proof.** SwiftShader passed pages that were black or
  missing objects on an M-series Mac. Say "software GL" in reports; install the
  safety net (`installSafetyNet`, `?diag=1`, black-frame self-heal) on shipped
  routes and ask for a `?diag=1` screenshot from a real device.
- **Custom shader colour.** Custom shaders write linear light that the output stage
  sRGB-encodes and ACES tones down: use `#include <colorspace_decode>` and
  `toneMapping: "none"` for authored colours. See `aura3d-materials-environments`.
- **Directional shadow depth range.** With a narrow-fov camera far from the scene
  (fov 15 at 40 m) one small caster used to darken a third of the frame; fixed in
  4.1 by clamping receiver depth to [0, 1] in every directional sampler.
- **Instanced textures.** `instances.mesh` and `batched.mesh` drew textured models
  white before 4.1. A multi-geometry `batched.mesh` also needs the `tiers.batching`
  flag for packed multi-draw; without it the engine now falls back to per-geometry
  instancing.
- **Empty instance arrays.** A zero-length `instances.*`, zero-position points or
  lines, or a zero draw range used to throw on every render and blank the canvas.
  They are now no-ops with `INSTANCES_EMPTY` / `GEOMETRY_EMPTY` diagnostics.

## Assets and the production bridge

- The production bridge refuses `model()` assets whose URL is http(s) or that lack a
  valid `sha256` and provenance, and then draws nothing while the game state keeps
  advancing. Declare models with `defineModelAssets`; check every asset URL returns
  200 on the built site.
- Never run `assets import-meshy`, `validate` or `typegen` from the repo root while
  other work is open: they rewrite `aura.assets.json`, `src/aura-assets.ts` (a
  100k-line diff) and `public/aura-assets/*`. Use `import-meshy --into <dir>
  --prefix <game> --name <role>`.
- Prefix every raw download with the game name: unprefixed `rocks.raw.glb` files
  collide across games.
- A rate-limited Meshy poll is not a failed task: record it `unconfirmed`, resume it
  with `get`, and never create it again.
- A large imported model set blows past upload and budget limits: run
  `assets optimize --role` and keep a game's assets under about 25 MB.

## Bundles, builds and tooling

- Bare side-effect imports of self-registering modules are tree-shaken from
  production bundles unless the root `sideEffects` allowlist covers them (4.1 covers
  `./examples/**`, `./apps/**`, `./templates/**`). Test the production build, not the
  dev server.
- Never `git add -A` in a worktree whose `node_modules` is a symlink, and never run
  `pnpm` there: it tries to remove the linked modules directory. Call the binaries
  directly.
- A deploy upload over 15,000 files fails: deploy from a clean export of a committed
  commit, not the working tree.
- A game that pins post-processing or the compiler off for everyone hides a bug and
  makes the look worse. Fix the bug or let the safety net step down on the one
  machine that breaks.
