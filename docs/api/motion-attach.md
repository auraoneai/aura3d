# attachToBone: pin a bat, club or ball to a hand

`import { attachToBone, resolveBone, boneWorldPosition, attachmentDistance } from "@aura3d/engine/game"`

Wraps the engine's `handle.attach({ socket, target })` with bone-name resolution and a loud failure. The engine resolves the node from the bone's current-frame world matrix after the pose is applied, so the item stays rigid through fast swings.

```ts
const hand = attachToBone(batter, { bone: "rightHand", target: "bat", position: [0, 0.05, 0], rotation: [0, 0, Math.PI / 2] });
// hand.bone === "mixamorig:RightHand"; hand.detach() releases it
```

- `bone` is a role (`rightHand`, `leftHand`, `head`, `hips`, `spine`, `rightFoot`, `leftFoot`, lower arms, shoulders) or an exact bone name. Roles resolve across Mixamo, Blender (`Hand.R`), and generic (`hand_r`) naming.
- Pass `boneNames` (from the skeleton) for exact matching; without it the aliases are probed with `actor.socket(name).valid`.
- No match throws `ATTACH_BONE_NOT_FOUND` listing similar names. Never swallow it: a missing bone is why a bat ends up on the ground.
- The target must be a root-level runtime node that your code no longer drives.
- Measure in a test or QA hook: `attachmentDistance(nodeWorldPosition, boneWorldPosition(actor, bone))`. For a zero-offset attach it should stay under 0.05 m on every frame of idle, swing and follow-through.

Pitfalls: attach after the model has loaded and the first pose has applied; set the offset in bone space (a bat's grip is not at its centre).
