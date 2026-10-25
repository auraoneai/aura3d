# Camera clearance and texture readiness

Both live in `@aura3d/engine/game`.

## `clearCameraEye` and `createCameraClearance`

A chase camera sits behind the player. In a town or canyon that spot can be inside a wall. `clearCameraEye` takes the point the camera
looks at (`focus`), the eye your chase rig wants (`eye`) and a `blocked(x, y, z)` predicate for solid space, and returns the eye pulled
back along the focus-to-eye segment to just before the first solid sample. `createCameraClearance` wraps it with smoothing: the eye
moves in quickly when something blocks it (`pullRate`, default 18) and eases back out once clear (`releaseRate`, default 2), so the
camera does not pop at a doorway. It never returns a blocked point when a clear one exists.

```ts
import { createCameraClearance } from "@aura3d/engine/game";

const clearance = createCameraClearance({ pullRate: 18, releaseRate: 1.6 });
// each frame, after your rig computes `wantedEye`:
const eye = clearance.update(dt, {
  focus: [player.x, player.y + 2.2, player.z],
  eye: wantedEye,
  minDistance: 2.5,
  blocked: (x, y, z) => y < groundHeight(x, z) + 1 || insideAnyCollider(x, y, z, 1.2)
});
app.camera?.setPose({ position: eye, target, up: [0, 1, 0], fov }, { cut: false });
```

`blocked` should include a margin about the size of the near plane plus a little (Duneglide uses 1.2 m against a 0.3 near plane).
`minDistance` stops the eye collapsing onto the player in a tight spot.

## `summarizeTextureUpgrade` and `texturedNodesReady`

After mount the engine upgrades textured materials one at a time. A frame taken in the first seconds can show models in their plain
white scalar material; on a software-rendered runner (SwiftShader) each new shader takes tens of seconds, so a screenshot taken right
after `begin()` shows white cars and trees. The engine reports each material's status (`none`, `pending`, `textured`, `fallback`) in
`app.diagnostics().renderer.runtime.texturedMaterials`. These helpers read it:

```ts
const summary = summarizeTextureUpgrade(app.diagnostics());   // { total, textured, pending, fallback, none, byNode }
const hero = texturedNodesReady(summary, (name) => name === "car-body");
if (!hero.ready) { /* wait, then capture */ }
```

Expose the summary through your QA hook (`extras: { textures: () => summarizeTextureUpgrade(app.diagnostics()) }`) and make capture
specs wait for the nodes that matter before taking a frame. A node counts as ready when it is `textured` or has settled on its
`fallback`. A row that is still `none` has either no texture or has not been reached yet, so wait on named nodes, not on the total.
