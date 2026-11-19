# Humanoid motion import and playback (`@aura3d/animation`)

**New in 5.6.0.** This module lives in `packages/animation/src/smpl/` and is re-exported from the `@aura3d/animation`
root of the published 5.6.0 packages. The CLI commands that use it,
[`aura3d animation import`](cli-reference.md#aura3d-animation-import) and
[`aura3d animation generate`](cli-reference.md#aura3d-animation-generate), are new in 5.6.0 too.

The module turns motion into a canonical humanoid frame and bakes it onto a rigged GLB:

1. **Source to canonical frames.** HY-Motion (SMPL) output from fal `fal-ai/hunyuan-motion`, or any sampled skeletal clip
   (BVH, FBX, glTF clips read by the CLI), becomes per-frame local rotations for 19 humanoid roles in a fixed rest frame:
   arms and legs hanging straight down, facing +Z, +Y up, the character's left at +X.
2. **Canonical frames to a target rig.** Roles are mapped onto the target skeleton automatically from hierarchy and rest
   positions, including rigs with unnamed `bone_N` joints, then baked into glTF rotation channels plus a hips translation
   channel.

`aura3d animation import <src> --onto rigged.glb --out hero.glb` runs both steps and writes real glTF animation clips. Its
`--map`, `--root-motion`, `--window`, `--loop`, `--fps`, `--face-forward` / `--keep-turn` and `--source-facing` /
`--target-facing` flags map onto the options below.

## Roles, skeletons and mapping

| Export | Description |
| --- | --- |
| `HUMANOID_ROLES` | The 19 roles: `hips`, `spine`, `chest`, `neck`, `head`, left and right `Shoulder`, `UpperArm`, `LowerArm`, `Hand`, `UpperLeg`, `LowerLeg`, `Foot`. |
| `HumanoidRole` | One entry of `HUMANOID_ROLES`. |
| `parseGlbJson(bytes)` | Returns the JSON chunk of a `.glb` (`ArrayBuffer` or `Uint8Array`); throws on a bad magic or a non-JSON first chunk. |
| `readIdolSkeleton(gltf)` | Joint table of the first skin (`IdolSkeleton`: `bones` with parent index and rest TRS, plus the fixed transform above each root joint). |
| `mapHumanoid(skeleton, opts?)` | `HumanoidMap`: role to bone name, `spineChain`, `neckChain`, `hipHeight`, `missing` roles and `ok`. |
| `IdolBone`, `IdolSkeleton`, `HumanoidMap` | The types above. |

`HumanoidDriverOptions` (shared by the driver, source and bake):

| Option | Default | Meaning |
| --- | --- | --- |
| `facing` | `"+z"` | Model-space axis the character faces: `"+z"`, `"-z"`, `"+x"` or `"-x"`. |
| `shoulderDrop` | `0.3` | Share of the T-pose to hanging-arm turn given to the clavicles. |
| `roles` | automatic | Role to bone-name overrides (`--map`). Spine and neck chains are re-derived from them. |
| `maxForearmTwistDeg` | `75` | Largest forearm twist relative to the upper arm. |
| `maxWristTwistDeg` | `60` | Largest hand twist relative to the forearm. |

## Driving and reading rigs

| Export | Description |
| --- | --- |
| `createHumanoidDriver(skeleton, opts?)` | `HumanoidDriver` with `map`, `skeleton`, `pose(input)` (a `{ bones, mode: "replace" }` pose for `handle.setAnimationPose`), `modelPositions(input)` and `palmPoints(input)`. |
| `createHumanoidSource(skeleton, opts?)` | `HumanoidSource`, the inverse: `toCanonical(worldRot, hipsPos)` reads one source-rig frame into a canonical pose. Throws when roles cannot be mapped. |
| `HumanoidPoseInput` | `rotations` (local rotation per role), optional `hipsOffset` (in units of rest hip height) and optional model-space `handTargets` solved with two-bone IK. |
| `HumanoidDriver`, `HumanoidDriverOptions`, `HumanoidSource` | The types above. |

## Canonical clips

| Export | Description |
| --- | --- |
| `encodeHumanoidClip(name, fps, roles, frames, meta?)` | Packs canonical frames into a `HumanoidClip` (Int16 base64 data). |
| `sampleHumanoidClip(clip, time, opts?)` | Samples a pose at `time` (slerp between frames). Wraps by default; `opts.loop: false` clamps to the clip. |
| `HumanoidClip` | `name`, `fps`, `duration`, `roles`, `frameCount`, `data`, optional `meta` timing facts. |
| `crossfadeLoop(frames, fps, blend?)` | Cross-fades the last `blend` seconds (default `0.2`) into the start. |
| `resampleCanonicalFrames(frames, fromFps, toFps)` | Resamples to another rate, keeping duration to the last frame. |

## HY-Motion (SMPL) input

| Export | Description |
| --- | --- |
| `SMPL_JOINTS`, `SMPL_PARENTS` | The 22 SMPL body joints and their parent indices. |
| `HyMotionDict` | `rot6d` `[1][F][22][6]` local rotations, `transl` `[1][F][3]`, `keypoints3d` `[1][F][J][3]`; 30 fps. |
| `isHyMotionDict(value)` | Type guard for that shape. |
| `smplMotionToFrames(dict, opts?)` | `SmplFramesResult`: canonical frames at 30 fps, `roles`, timing `meta` and `restOffsets`. |
| `smplMotionToClip(name, dict, opts?)` | `SmplClipResult`: the same, packed into a `HumanoidClip`. |
| `SmplClipOptions` | `loop`, `loopBlend` (default `0.2`), `window` `[start, end]` seconds, `faceForward` (default `true`), `rootMotion`. |

`rootMotion` is `"in-place"` (default: drop horizontal travel, keep the vertical hip bob), `"keep"` or `"strip"`.

## Any skeletal clip

| Export | Description |
| --- | --- |
| `SkeletalMotion`, `SkeletalMotionFrame` | A joint table with rest TRS plus per-frame local rotations `r` and translations `t`, at `fps`. |
| `skeletalMotionToFrames(motion, opts?)` | `CanonicalMotion`: frames, roles, `meta`, `map`, detected `facing` and `facingMethod`. |
| `CanonicalMotionOptions` | `window`, `loop`, `loopBlend`, `faceForward`, `rootMotion`, `facing` (`"auto"` by default) and source `roles` overrides. |
| `detectHumanoidFacing(skeleton)` | `FacingDetection`: rest facing from sided bone names, else the feet, else `+z`; `method` is `"names"`, `"toes"`, `"default"` or `"explicit"`. |
| `boneSide(name)` | `"left"`, `"right"` or `null` for names like `LeftArm`, `L_hip`, `thigh.L`. |
| `skeletonWorld(skeleton, r?, t?, order?)` | World transform of every joint for given local rotations and translations. |
| `HumanoidFacing`, `RootMotionMode`, `CanonicalMotion`, `FacingDetection` | The types above. |

## Baking to glTF

| Export | Description |
| --- | --- |
| `bakeHumanoidFramesToGltf(name, target, frames, fps, opts?)` | `HumanoidGltfBake`: `times`, per-joint `channels` (`GltfChannelData`), `flips`, `limbError` (`maxDeg`, `meanDeg`), `motionDeg`, `map` and per-frame `expected` limb directions. |
| `BakeHumanoidGltfOptions` | `HumanoidDriverOptions` plus `flipThresholdDeg` (default `120`). |
| `detectHumanoidKeyFlips(channels, thresholdDeg?)` | Rotation keys whose single-key swing exceeds the threshold (default `120`). |
| `canonicalLimbDirections(frame)` | Model-space unit direction per limb role for one canonical frame. |
| `limbAngleDeg(a, b)` | Angle between two vectors in degrees. |
| `humanoidFacingQuat(facing)` | The yaw quaternion for a `facing` value. |
| `LIMB_SEGMENTS` | The upper and lower arm and leg segments checked for `limbError`. |

The bake reports instead of deciding: callers (the CLI included) should fail on `flips`, on a `limbError` above their bound,
and on `motionDeg` near zero (a frozen T-pose), rather than write a clip that renders a broken body.

## Runtime playback and pose helpers (5.7.0)

**New in 5.7.0.** The canonical clip player and the pose and quaternion helpers the showcase games built on are public on
`@aura3d/engine/animation` (source: `packages/animation/src/smpl/animator.ts` and `humanoid.ts`). The games'
`apps/showcase-port-shared/idol/{motion,humanoid}.ts` are now thin re-exports of these. Import them from
`@aura3d/engine/animation`: the browser build of the bare `@aura3d/animation` root (its `browser` condition) does not carry
the humanoid module.

A frame of playback is: pick a request, `animator.update(dt, request)` returns a canonical `HumanoidPoseInput`, then
`handle.setAnimationPose(driver.pose(pose))` draws it on the rigged model. Root motion is never applied; the game moves
the body node.

| Export | Description |
| --- | --- |
| `createHumanoidAnimator(clips)` | `HumanoidAnimator` over a named clip set (for example a generated `MOTION_CLIPS`). One per body. |
| `createMotionAnimator` | Alias of `createHumanoidAnimator` (the name the games used). |
| `HumanoidAnimator` | `current` (`"Run"`, `"Run~m"` mirrored, `"pose:<key>"`), `time` (clip seconds) and `update(dt, request)`. |
| `HumanoidMotionRequest` | `{ clip, time?, rate?, loop?, mirror?, fade? }` or `{ pose, key?, fade? }`. |
| `HumanoidClipSet` | `Readonly<Record<string, HumanoidClip>>`. |
| `humanoidClipGroundSpeed(clip, hipHeight)` | Metres per second one loop represents on a body of this hip height (`meta.groundSpeedHip`, else `meta.stanceSpeedHip`). |
| `humanoidLocomotionTime(clip, metres, hipHeight)` | Clip time driven by distance travelled, so planted feet do not slide. |
| `humanoidLocomotionRate(clip, groundSpeed, hipHeight)` | Playback `rate` that matches a ground speed. |
| `humanoidEventTime(clip, u, eventFrac, keyField, window?)` | Clip time that lands the clip's key frame (`meta[keyField]`) on the game's event fraction. |
| `humanoidAirTime(clip, y, vy, g, takeoff)` | Clip time that lines a captured jump's take-off and apex (`meta.apexTime`) up with a ballistic game jump. |

`update(dt, request)` rules:

- `dt` is real frame time in seconds, clamped to `0..0.25`; a non-finite `dt` counts as `0`.
- A change of source (clip name, `mirror`, or code-pose `key`) restarts the clock at `0` and blends from the last returned
  pose over `fade` seconds (default `0.18`, linear weight). The first source ever played shows at full weight.
- `time` sets the clip time directly; otherwise the clock advances by `dt * rate` (default `rate` `1`).
- `loop` defaults to the clip's `meta.loop` (`1` wraps, `0` clamps); clips without `meta.loop` wrap.

| Export | Description |
| --- | --- |
| `mirrorHumanoidPose(pose)` | Left-right mirror: swaps `left*`/`right*` roles, each rotation `[x, y, z, w]` becomes `[x, -y, -z, w]`, hips X negated. Applying it twice gives the original. |
| `blendHumanoidPoses(a, b, w)` | Per-role slerp and hips lerp, `w` the weight of `b`; `w <= 0` returns `a`, `w >= 1` returns `b`. Roles set on one side blend against the identity. |
| `layerHumanoidPose(base, top, roles)` | `base` with the listed roles' rotations taken from `top` (roles `top` does not set keep `base`). |
| `ARM_ROLES` | The eight shoulder, upper-arm, lower-arm and hand roles. |
| `loadIdolHumanoid(url, opts?)` | Fetches a rigged GLB once and builds its `HumanoidDriver`, cached per URL and `facing`; a failed load is evicted so a later call retries. |
| `HumanoidAnimationPose`, `HumanoidBonePose`, `GltfJsonLike` | What `driver.pose(...)` returns (object-form bones for `setAnimationPose`), and the `parseGlbJson` result. |

Quaternions are `[x, y, z, w]` tuples (the package's `Quat` and `Vec3` types):

| Export | Description |
| --- | --- |
| `QUAT_IDENTITY` | `[0, 0, 0, 1]`. |
| `quatMul(a, b)`, `quatInv(q)`, `quatNorm(q)` | Product (`b` applied first), inverse, unit length. |
| `quatAxisAngle(axis, angle)`, `quatFromTo(from, to)` | Rotation about an axis; shortest arc between two directions. |
| `quatSlerp(a, b, t)`, `quatPow(q, t)` | Short-arc slerp (nlerp when nearly parallel); `q` scaled by `t` from the identity. |
| `rotateVec(q, v)` | Rotates a vector. |
| `eulerZYX(x, y, z)` | The quaternion for the engine's `setRotation(x, y, z)` (Rz·Ry·Rx, X applied first). |

<!-- aura3d-docs-example: exempt uses @aura3d/engine/animation 5.7.0 exports that are not in the packed 5.6.0 candidate -->
```ts
import { createHumanoidAnimator, humanoidLocomotionTime, loadIdolHumanoid, type HumanoidClip } from "@aura3d/engine/animation";

export async function createRunner(url: string, clips: Readonly<Record<"Idle" | "Run", HumanoidClip>>, hipHeight: number) {
  const driver = await loadIdolHumanoid(url);
  const anim = createHumanoidAnimator(clips);
  let travelled = 0;
  return (dt: number, speed: number) => {
    travelled += speed * dt;
    const pose = speed > 0.2
      ? anim.update(dt, { clip: "Run", time: humanoidLocomotionTime(clips.Run, travelled, hipHeight) })
      : anim.update(dt, { clip: "Idle" });
    return driver.pose(pose); // pass to handle.setAnimationPose(...)
  };
}
```

## Example

<!-- aura3d-docs-example: exempt uses @aura3d/animation 5.6.0 exports that are not in the packed 5.5.6 candidate -->
```ts
import { bakeHumanoidFramesToGltf, isHyMotionDict, parseGlbJson, readIdolSkeleton, smplMotionToFrames } from "@aura3d/animation";

export function bakeMotion(motionJson: unknown, riggedGlb: Uint8Array) {
  if (!isHyMotionDict(motionJson)) throw new Error("not a HY-Motion dict");
  const target = readIdolSkeleton(parseGlbJson(riggedGlb));
  const { fps, frames } = smplMotionToFrames(motionJson, { loop: true, rootMotion: "in-place" });
  const bake = bakeHumanoidFramesToGltf("Walk", target, frames, fps);
  if (bake.flips.length > 0 || bake.motionDeg < 1) throw new Error("retarget failed");
  return bake;
}
```

## Boundaries

Mapping is automatic only for skeletons that resolve to the 19 humanoid roles; other rigs need `roles` overrides. Fingers,
toes and other unmapped bones follow their parent at rest. No claim is made about retarget quality beyond the reported
`flips`, `limbError` and `motionDeg` values. See [claims-and-boundaries](../agents/claims-and-boundaries.md).
