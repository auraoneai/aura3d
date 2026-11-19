# Camera clearance and texture readiness

`clearCameraEye`, `createCameraClearance`, `summarizeTextureUpgrade` and `texturedNodesReady` live in `@aura3d/engine/game`.
`computeCameraClearance` (5.5.6) is a root export of `@aura3d/engine`.

## `computeCameraClearance` (root, 5.5.6)

`computeCameraClearance` is a pure solve against simple occluder shapes, for when you know your props as circles and boxes
instead of a `blocked(x, y, z)` predicate. It sweeps the `target -> desired` segment, pulls the camera in along the same line
of sight in front of the nearest blocker and, when there is no room above `minDistance`, can crane it up instead. It does no
smoothing; ease `result.fraction` yourself and feed the eased value back through `maxFraction`.

```text
computeCameraClearance(
  target: AuraVec3,
  desired: AuraVec3,
  obstacles: readonly AuraCameraClearanceObstacle[],
  options?: AuraCameraClearanceOptions,
  out?: AuraCameraClearanceResult
): AuraCameraClearanceResult
```

Obstacles (`AuraCameraClearanceObstacle`):

| Shape | Fields |
| --- | --- |
| `{ shape: "circle" }` | `x`, `z`, `radius`: a vertical cylinder (trunk, pillar, NPC). |
| `{ shape: "box" }` | `x`, `z`, `halfX`, `halfZ`, optional `yaw` (radians about +Y, default 0, same convention as `rotation: [0, yaw, 0]`). |
| Both | Optional vertical extent: `minY` / `maxY`, or `baseY` plus `height`. A missing bound is unbounded, so an obstacle with no vertical fields is an infinitely tall column. |

Options (`AuraCameraClearanceOptions`, all optional):

| Option | Default | Meaning |
| --- | --- | --- |
| `minDistance` | `0` | Closest the camera may come to the target, in metres. |
| `padding` | `0.2` | Metres added to every obstacle's radius or half-extents (the lens radius). |
| `backoff` | `0` | Metres the camera is kept back from the blocker along the line of sight. |
| `allowVerticalRise` | `false` | When the clear point is closer than `minDistance`, rise over the target at `minDistance` instead of stopping short. |
| `riseMinHorizontal` | `1` | Smallest horizontal offset kept while rising, so the view never looks straight down. |
| `maxFraction` | `1` | Upper bound on the boom fraction in `[0, 1]`; pass your eased fraction here. |

Result (`AuraCameraClearanceResult`; pass `out` to reuse one object and avoid the allocation):

| Field | Meaning |
| --- | --- |
| `position` | Cleared camera position `[x, y, z]`. |
| `fraction` | Boom fraction along `target -> desired`, `1` when unobstructed. In `"rise"` mode, the line fraction before rising. |
| `distance` | Distance from the target to `position`. |
| `mode` | `"clear"` (desired position), `"pull-in"` (moved in along the line of sight) or `"rise"` (craned up at `minDistance`). |
| `clamped` | `true` when `position` differs from the desired position. |
| `occluder` | Index of the nearest blocking obstacle, or `-1`. |

Obstacles whose padded footprint already contains the target are ignored, as are obstacles the segment passes over or under.
The risen position is not swept again.

```ts
import { computeCameraClearance, createAuraApp, scene, type AuraCameraClearanceObstacle, type AuraCameraClearanceResult } from "@aura3d/engine";

const app = createAuraApp("#app", { scene: scene() });
void app.ready();

const obstacles: AuraCameraClearanceObstacle[] = [
  { shape: "circle", x: 2, z: -6, radius: 0.4, baseY: 0, height: 3 },
  { shape: "box", x: -4, z: -9, halfX: 3, halfZ: 2, yaw: 0.5, minY: 0, maxY: 4.2 }
];
const out: AuraCameraClearanceResult = { position: [0, 0, 0], fraction: 1, distance: 0, mode: "clear", clamped: false, occluder: -1 };
let boom = 1;

export function updateCamera(chest: [number, number, number], desired: [number, number, number], dt: number): void {
  const hit = computeCameraClearance(chest, desired, obstacles, { minDistance: 3, padding: 0.2 }, out);
  // Snap in, ease back out.
  boom = hit.fraction < boom ? hit.fraction : boom + (hit.fraction - boom) * (1 - Math.exp(-4 * dt));
  const pose = computeCameraClearance(chest, desired, [], { minDistance: 3, allowVerticalRise: true, maxFraction: boom }, out);
  app.camera?.setPose({ position: pose.position, target: chest });
}
```

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
