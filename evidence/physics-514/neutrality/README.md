# Pixel neutrality of lane 514 on live games

Question: does the lane's change to the success path of `createAuraAppCore.ts` (`stageDeclaredBodies().commit()`,
`createRuntimeScenePhysicsWithAccess` and `appPhysics()` wrapped in try/catch for `PHYSICS_BACKEND_MISSING`), `PhysicsWorldProvider.ts`
and `physics-rapier/src/index.ts` change what a game renders when Rapier is installed?

## Method

- Base = `e5387f3b0` (the lane's parent on origin/main), branch = `59106f712` (lane engine source; later lane commits touch docs,
  tests and evidence only). Both builds come from the same worktree and the same app sources and assets; for base the three changed
  files were replaced by their `e5387f3b0` versions and `backendMissing.ts` removed (`../tools/build.sh`, `../tools/build-extra.sh`).
  Each game: `vite build -c vite.nocopy.config.ts` (the app's own config, public dir served at capture time instead of copied).
- Capture (`../tools/cap.mjs`, `../tools/capture-all.sh`): headless Chrome 156 with the real GPU (ANGLE Metal) over loopback CDP,
  960x540, the virtual-clock shim from `origin/lane/504-bellkeeper` `evidence/bellkeeper-504/tools/shim.js` (`../tools/shim.js`),
  10 s real-time settle with rAF held, then 240 frames of 1/60 s with frame-indexed key input, then a screenshot.
- Two captures per build (`a`, `b`) for both base and branch, so every comparison has a same-build noise run.
- `../tools/pixdiff.mjs`: mean absolute RGB difference, share of differing pixels, bounding box. All numbers are in `frames.json`
  together with the sha256 of all 28 captures. Byte-identical captures are stored once.

## Result

| Game | Physics | base a vs base b (noise) | branch a vs branch b (noise) | base a vs branch b | base a vs branch a |
| --- | --- | --- | --- | --- | --- |
| Bank Shot | `physics.world` (Rapier) | 0 | 0 | 0 | 0 |
| Slingshot Siege (`seed=1&level=0&demo=1`) | `physics.world` (Rapier) | 0 | 16.40 | 0 | 16.40 |
| Blockfall Reactor | `game.collisionWorld` Rapier proof | 0 | 0 | 0 | 0 |
| Aurora Lander | - | 0.0075 | 0.0037 | 0.0037 | 0 |
| Apex Overdrive (`showcase-roadster-rush`) | - | 0 | 0 | 0 | 0 |
| Grid Dispatch (`showcase-teleoperator`) | - | 0 | 0 | 0 | 0 |

Every branch frame is byte-identical to a base frame. The two non-zero rows are capture noise, not the lane:

- Slingshot Siege: branch `a` (the first capture of the session, taken with the machine at load 15+) differs over the whole frame
  (camera and windmill phase, i.e. a different start offset on the virtual clock); branch `b` of the same build is byte-identical to
  base `a` and base `b`. Branch a vs branch b shows exactly the same difference as base vs branch a.
- Aurora Lander: the only differing pixels are the box `[224,86]-[345,114]`, the "GUST INBOUND" HUD badge (most likely animated on the
  real clock, which the shim does not control). It flips between runs of the same build (base a vs base b, branch a vs branch b).

Recipe 16 (declared `.physics({...})` bodies plus `app.physics`, i.e. the changed `stageDeclaredBodies` and `appPhysics` paths): base
and branch report identical physics state after 140 fixed steps (`steps 140, solidHits 109, hardestHit 1.40986, firstCrateHitStep 78`,
no diagnostics errors). Its monorepo source build renders a black canvas under this harness in base and branch alike, so that frame is
not used; the same source in the clean consumer renders (`../clean-consumer-present-steps140.png`).

Not usable as evidence (harness or pre-existing, identical on base where base was captured): Vault Breakers
(`RENDERER_MOUNT_FAILED: MODEL_CUSTOM_MATERIAL_UNSUPPORTED`, black playfield, base and branch), Bunker Zero and Cross Hop (renderer
mount failed on a 404 for `/aura-assets/bzGuardMeshy.010bba7b.glb` and `/aura-assets/trafficSedan.5c9c3aaf.glb`: the capture serves the
main checkout's `public/`, which lacks those files; base and branch), Dot Dash (the branch page stopped answering CDP under the shim;
base not captured).
