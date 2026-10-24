# attachToBone: pin a bat, club or ball to a hand

`import { attachToBone, resolveBone, boneWorldPosition, attachmentDistance } from "@aura3d/engine/game"`

Wraps the engine's `handle.attach({ socket, target })` with bone-name resolution and a loud failure. The engine resolves the node from the bone's current-frame world matrix after the pose is applied, so the item stays rigid through fast swings.

```ts
const hand = attachToBone(batter, { bone: "rightHand", target: "bat", position: [0, 0.05, 0], rotation: [0, 0, Math.PI / 2] });
// hand.bone === "mixamorig:RightHand"; hand.detach() releases it
```

- `bone` is a role (`rightHand`/`leftHand`, `rightForearm`/`leftForearm`, `rightUpperArm`/`leftUpperArm`, `rightShoulder`/`leftShoulder`, `rightThigh`/`leftThigh`, `rightShin`/`leftShin`, `rightFoot`/`leftFoot`, `hips`, `spine`, `head`; `rightLowerArm` is an alias of `rightForearm`) or an exact bone name. Matching is case-, punctuation- and rig-prefix-insensitive: `mixamorig:RightForeArm`, `RightForearm`, `right_forearm`, `R_Forearm`, `forearm.R`, `DEF-forearm.R`, `lowerarm_r` and `Bip01 R Forearm` all resolve. Covered rigs: Mixamo, Meshy and glTF Avatar (VRM, Ready Player Me), Blender Rigify, Unreal mannequin, 3ds Max Biped.
- Pass `boneNames` (from the skeleton) for matching by normalised name. Without it the common spellings are probed one by one with `actor.socket(name).valid`, and each miss logs `ANIMATION_SOCKET_UNKNOWN_BONE` once, so prefer `boneNames`, or an exact name, when you know the rig.
- No match throws `ATTACH_BONE_NOT_FOUND` listing the names it tried (and similar bones when `boneNames` is given). Never swallow it: a missing bone is why a bat ends up on the ground.
- The target must be a root-level runtime node that your code no longer drives.
- Measure in a test or QA hook: `attachmentDistance(nodeWorldPosition, boneWorldPosition(actor, bone))`. For a zero-offset attach it should stay under 0.05 m on every frame of idle, swing and follow-through.

Pitfalls: attach after the model has loaded and the first pose has applied; set the offset in bone space (a bat's grip is not at its centre).
