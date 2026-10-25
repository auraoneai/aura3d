# Saltwind Highway: white car and trees (render fix)

Group C screenshot problem: the player car and the roadside trees rendered pure white. All runs are remote software WebGL2 (SwiftShader), not a GPU.

## Cause

Not a broken material and not a regression. Textured materials upgrade **one at a time, in scene order, after mount**, and on SwiftShader each new shader takes tens of seconds. A frame taken early shows plain white models until the upgrade pass reaches them. The `meshy=0` fallback renders correctly, and all 15 texture hashes match the manifest.

- Bisect (`/examples/roadster-hours-port/?autostart=1`, texture requests over 75 s) on `909ad506e` (the Meshy art pass whose frames were textured), `4a9b53f31` (4.1.1), `a816facf6` (frame-cost commit) and `04b7726ef` (browser-entry fix): the same pace on all four (first texture at 27 to 35 s, the second at 81 to 87 s). The earlier textured frames were captured much later.
- Timeline at the head before the fix (live load, 960x540): lighthouse 28 s, villa 81, townhouse 114, palm 134, pine 178, boulders 219, hatch 266, sedan 313, pickup 350, suv 391, bus 438, semi 476. **`roadster.jpg` (the player's car) was not requested by 480 s**, because the car was added to the scene after the props and traffic.

## Fix

- `world.ts`: the player's `car-body` node is added before the generated props and traffic. Timeline after: **`roadster.jpg` at 28 s**, then lighthouse 75, villa 113, townhouse 150, palm 189, pine 228, boulders 269, hatch 310, sedan 351, pickup 392, suv 435, bus 468. Unit test `tests/unit/roadster-hours-port/hero-first.test.ts` (fails on the old order).
- `main.ts`: QA hook `textures()` returns `summarizeTextureUpgrade(app.diagnostics())` (new, `@aura3d/engine/game`, `docs/api/motion-camera-clear.md`).
- `tests/browser/render-fix-regression.spec.ts` ("Saltwind Highway hero textures settle"): waits until `car-body` reads `textured`, then compares the car region of an early and a late frame.

## Measured (`render-fix-regression.spec.ts`, run `fixrc-after`)

- `car-body` read `textured` after 998 s in the manual run (700 autopilot steps, then polling with `renderNow`); at that point 15 materials were textured and 0 pending (68 rows in the status table, most are untextured scalar materials).
- Near-white fraction of the car region: early frame 0.303, late frame 0.006 (mean luma 171 to 112).

## Frames

`before-early-white-car.jpg` (head before the fix, early frame), `after-early.jpg`, `after-late-textured.jpg` (teal car with white stripe, green trees).

## Not shown

- Real GPUs: each upgrade should be near-instant there, so the white window should be short. Not measured; it needs a run on the owner's Mac.
- In live play the time at which `car-body` reads `textured` was not measured; only when its image was requested (28 s).
