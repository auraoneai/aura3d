/**
 * Idol humanoid toolkit for the games: a thin re-export of the public `@aura3d/engine/animation` surface.
 *
 * The bone mapping, driver, clip codec, quaternion helpers and pose helpers live in @aura3d/animation
 * (packages/animation/src/smpl/humanoid.ts, shared with `aura3d animation import`) and are public API since 5.7.0. They
 * come in here through `@aura3d/engine/animation`, so a game installed from the packed candidate (the examples-source
 * check) resolves them from the engine archive, never from workspace package source. New code can import them from
 * `@aura3d/engine/animation` directly.
 */
export {
  ARM_ROLES,
  HUMANOID_ROLES,
  blendHumanoidPoses,
  createHumanoidDriver,
  createHumanoidSource,
  encodeHumanoidClip,
  eulerZYX,
  layerHumanoidPose,
  loadIdolHumanoid,
  mapHumanoid,
  mirrorHumanoidPose,
  parseGlbJson,
  quatAxisAngle,
  quatFromTo,
  quatInv,
  quatMul,
  quatNorm,
  quatPow,
  quatSlerp,
  readIdolSkeleton,
  rotateVec,
  sampleHumanoidClip,
  type GltfJsonLike,
  type HumanoidAnimationPose,
  type HumanoidClip,
  type HumanoidDriver,
  type HumanoidDriverOptions,
  type HumanoidMap,
  type HumanoidPoseInput,
  type HumanoidRole,
  type HumanoidSource,
  type IdolBone,
  type IdolSkeleton,
  type Quat,
  type Vec3
} from "@aura3d/engine/animation";
