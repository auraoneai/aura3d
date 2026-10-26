export { smoothDamp, createSmoothFollow3, lerpAngle, createRenderInterpolator, secondDifferenceRms, jitterReport } from "./smoothing";
export type { DampResult, SmoothFollow3, RenderInterpolator, JitterReport } from "./smoothing";
export { createLocomotion, proceduralLegSwing } from "./locomotion";
export type { LocomotionGait, LocomotionOptions, LocomotionFrame, Locomotion, LegPose, ProceduralGait } from "./locomotion";
export { createFootSlideMeter } from "./footSlide";
export type { FootSlideOptions, FootSlideReport, FootSlideMeter } from "./footSlide";
export { createImpactWorld, createHitStop, createCameraShake, createImpactFeedback } from "./impact";
export type {
  ImpactBoxCollider, ImpactSphereCollider, ImpactCollider, ImpactBody, Impact, ImpactWorldOptions, ImpactWorld,
  HitStop, CameraShake, ParticleBurst, ImpactFeedbackOptions, ImpactFeedbackResult
} from "./impact";
export { attachToBone, resolveBone, boneAliases, boneWorldPosition, attachmentDistance } from "./boneAttach";
export type { BoneRole, SocketLike, AttachableActor, AttachToBoneOptions, BoneAttachment } from "./boneAttach";
export { checkDoubleFrame, detectSharedSkeleton, detectCoincidentModels, detectDoubleBlend } from "./doubleFrame";
export type { DrawEntry, ModelInstance, AnimLayer, DoubleFrameFinding, DoubleFrameReport } from "./doubleFrame";
export { createFixedStepPresenter, createRecordBlend } from "./presenter";
export type { AlphaSource, FixedStepPresenterOptions, FixedStepPresenter, RecordBlendOptions } from "./presenter";
export { runMotionGate } from "./motionGate";
export type { MotionGateOptions, MotionGateReport } from "./motionGate";
export { clearCameraEye, createCameraClearance } from "./cameraClear";
export type { CameraVec3, ClearEyeOptions, ClearEye, CameraClearanceOptions, CameraClearance } from "./cameraClear";
export {
  createHandBounce, resolveHandBounceConfig, handBounceCycle, handBounceBallY, handBounceContactWeight, handBounceBallXZ,
  clampPalmReach, handBounceOverlayAngles, measureHandBall, DEFAULT_HAND_BOUNCE_LIMITS, RUNNING_HAND_BOUNCE_LIMITS
} from "./handBounce";
export type {
  HandBounceVec3, HandBounceGait, HandBounceOptions, HandBouncePhases, HandBounceConfig, HandBounceCycle, HandBounceOverlayBone,
  HandBounceOverlay, HandBounceInput, HandBounceFrame, HandBounceState, HandBounceRelease, HandBounce, HandBounceSample,
  HandBounceReport, HandBounceLimits
} from "./handBounce";
export {
  createTwoHandGrip, solveTwoHandGrip, calibrateGripSocket, mirrorTwoHandGripBodyRig, twoHandGripBonesForEngine, relaxedTopHand,
  measureGrip, handCentroid, DEFAULT_GRIP_LIMITS, DEFAULT_GRIP_BONE_NAMES,
  solveGripTwoBone, orbitGripElbow, gripAzimuthTwist, gripQNorm, gripQMul, gripQConj, gripQAxis, gripQRot, gripQFromTo,
  gripQToEulerXYZ, gripQToEulerZYX, gripUnit, gripRotY, GRIP_Q_ID
} from "./twoHandGrip";
export type {
  GripVec3, GripQuat, TwoHandGripBoneNames, TwoHandGripBodyRig, TwoHandGripRig, TwoHandGripTarget, TwoHandGripPrev, TwoHandGripBone,
  TwoHandGripPose, SolveTwoHandGripOptions, TwoHandGripState, TwoHandGrip, GripSample, GripLimits, GripPhaseReport, GripReport
} from "./twoHandGrip";
export { wrapAngle, yawToFace, visualHeading, facingError, faceTowards } from "./facing";
export type { ForwardAxis, FacingTarget, FaceTowardsOptions } from "./facing";
