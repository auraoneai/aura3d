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
