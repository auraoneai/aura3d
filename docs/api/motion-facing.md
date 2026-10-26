# faceTowards: actors that look at their target

`import { faceTowards, yawToFace, facingError, visualHeading, wrapAngle } from "@aura3d/engine/game"`

Model forward axes are not standardised. Meshy GLBs look down +Z (the glTF default); hand-built rigs and compass-yaw simulations often treat -Z as forward. Hand a sim yaw to `node.setRotation` without saying which axis the model faces and the actor looks away from the target (the Bunker Zero defect: every enemy drawn with its back to the player). State the forward axis once per model and let the helper derive the yaw.

```ts
import { faceTowards, facingError } from "@aura3d/engine/game";

// per model, measured from the GLB (toes, muzzle, face), not guessed
const FORWARD = { guard: "+z", hound: "+z" } as const;

// each frame: turn toward the player at 12 rad/s, the short way round
yaw = faceTowards(yaw, enemy, player, { forwardAxis: FORWARD[enemy.kind], turnRate: 12, dt });
node.setRotation(0, yaw, 0);

// a probe: angle (radians) between where the model looks and the direction to the player
const err = facingError(yaw, player.x - enemy.x, player.z - enemy.z, FORWARD[enemy.kind]);
```

- **Convention.** Engine node yaw `t` maps local +Z to the world direction `(sin t, cos t)`. `yawToFace(dx, dz, axis)` returns the `t` that points the model's own `axis` along `(dx, dz)`; `visualHeading(yaw, axis)` is the inverse (the world heading `atan2(x, z)` the node really looks along).
- **Axes.** `"+z"`, `"-z"`, `"+x"`, `"-x"`: the local axis that points out of the model's face. Default `"+z"`.
- **Turn rate.** Omit `turnRate` to snap. A finite `turnRate` needs `dt`, limits each call to `turnRate * dt` radians and takes the short way (a half turn at 12.5 rad/s takes about 0.25 s).
- **Measure the axis.** For a humanoid, the lowest vertices sit toward the toes of the foot bones; for anything else, render one frame with the actor placed in front of the camera. Record the result next to the asset and assert it in a unit test.
- **Prove it.** Run a QA hook that stages one actor of each kind in front of the player and prints `facingError` in degrees; it must be at most 10 while the actor is aggressive and converge within 0.4 s after a turn.
