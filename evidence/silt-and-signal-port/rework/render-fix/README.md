# Duneglide: camera clipping scenery and HUD speed 0 (render fix)

Group C screenshot problems. Remote software WebGL2; chapter 0, objective 2, boosting and steering for 300 steps then straight.

## HUD speed 0

Cause: `stepFrames`, `replay` and the `render` QA hook never called `updateHud()`; the HUD refreshes only inside the live loop. Live play was already correct. Fix: the hooks refresh the HUD. Measured (`render-fix-regression.spec.ts`): before, HUD 0 against sim speed 41.5; after, HUD 42 (`before-hud-speed-0.jpg`, `after-hud-speed-42-eased-camera.jpg`).

## Camera inside scenery

- In QA stepping the camera only eased from its old pose, so the earlier "slab filling the left third" frames were not the computed eye. QA stepping now cuts to the chase pose (`before-hud-speed-0.jpg` and `after-hud-speed-42-eased-camera.jpg` are those eased frames; both show the artifact).
- Real defect (unit test over the same flight, `tests/unit/silt-and-signal-port/camera-clear.test.ts`): with chapter colliders plus tree, rock and pier columns, the unobstructed chase eye was inside scenery on **153 of 300** sampled steps. Trees and rocks have no sim collider, which is why a collider-only check missed them.
- Fix: `createCameraClearance` (`@aura3d/engine/game`, `docs/api/motion-camera-clear.md`) with `examples/silt-and-signal-port/camera.ts`; the eye keeps 1.8 m from colliders and from tree/rock/pier columns. After: **3 of 300** (1%), all at the 2.5 m minimum distance behind a rider hugging a crown.
- Browser spec `tests/browser/render-fix-duneglide.spec.ts` flies the flight with `?camclear=0` and with clearance and reads the eye through the new `camera()` hook. Run `fixrc-dune3` (colliders only, margin 1.8): off blocked at 6 of 60 samples (steps 660 to 760), on 0 of 60 (`camera-off/on-colliders-only-step660.jpg`: both still show a green mass, which is why scenery columns were added). Run `fixrc-dune4` (with scenery columns): clearance off blocked at 25 of 60 samples.

## Open

The clearance-on pass and the paired frames of the final run (`fixrc-dune4`) had not finished when this was committed, so the browser numbers with scenery columns for clearance on are not recorded; the unit test numbers above are. Real GPU not checked.
