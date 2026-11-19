/**
 * Idol motion animator for the games: a thin re-export of the public humanoid clip player in `@aura3d/engine/animation`
 * (packages/animation/src/smpl/animator.ts, public since 5.7.0), under the names the games already use.
 *
 *   createMotionAnimator  = createHumanoidAnimator       MotionAnimator = HumanoidAnimator
 *   MotionRequest         = HumanoidMotionRequest        ClipSet        = HumanoidClipSet
 *   clipGroundSpeed       = humanoidClipGroundSpeed      locomotionTime = humanoidLocomotionTime
 *   locomotionRate        = humanoidLocomotionRate       eventTime      = humanoidEventTime
 *   airTime               = humanoidAirTime
 */
export {
  createMotionAnimator,
  humanoidAirTime as airTime,
  humanoidClipGroundSpeed as clipGroundSpeed,
  humanoidEventTime as eventTime,
  humanoidLocomotionRate as locomotionRate,
  humanoidLocomotionTime as locomotionTime,
  type HumanoidAnimator as MotionAnimator,
  type HumanoidClipSet as ClipSet,
  type HumanoidMotionRequest as MotionRequest
} from "@aura3d/engine/animation";
