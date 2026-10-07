/**
 * Lane prd06 barrel — owned by lane 06 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here.
 */
export { createPoseBuffer, copyPose, resetPoseToIdentity } from "../pose/PoseBuffer.js";
export type { PoseBuffer } from "../pose/PoseBuffer.js";
export { bindSkeleton } from "../pose/SkeletonBinding.js";
export type { BindSkeletonOptions, SkeletonBinding, SkeletonNodeRef } from "../pose/SkeletonBinding.js";
export { createBoneMask } from "../pose/BoneMask.js";
export type { BoneMaskPreset, BoneMaskSelector, BoneMaskSkeleton, BoneMaskSpec } from "../pose/BoneMask.js";
export { makeClipAdditive, isClipAdditive } from "../pose/makeClipAdditive.js";
export type { AdditiveReference } from "../pose/makeClipAdditive.js";
export { compileTrack, compileClip, createTrackCursors, sampleTrackInto, sampleTrackRaw } from "../pose/CompiledClip.js";
export type { CompiledClip, CompiledTrack, CompiledTrackCursor } from "../pose/CompiledClip.js";
export { PoseMixer, PoseAction } from "../pose/PoseMixer.js";
export type { PoseActionOptions, PoseBlendMode, PoseChannel, PoseCrossFadeOptions, PoseLayer, PoseLayerOptions, PoseLoopMode, PoseSampleSpec, PoseTransition } from "../pose/PoseMixer.js";
export { PoseInertializer, DEFAULT_POSE_TRANSITION_HALF_LIFE } from "../pose/PoseInertializer.js";
export { setPoseMixerBlendFlagProvider, poseMixerBlendEnabled } from "../pose/poseMixerFlags.js";
export { blendBaseValue, additiveContributionValue, applyAdditiveValue, combineAdditiveValue } from "../pose/blendKernels.js";
export type { PoseBlendAccumulatorLike, PoseBlendChannel } from "../pose/blendKernels.js";
// T1.14 — §17.3 motion-quality metrics (E42: not built on MotionQuality.ts).
export { isHumanoidMotionBone, motionFrame, motionSampleFromMatrix, quatAngleDegrees, boneAngularSpeeds, maxAngularSpeedInWindow, transitionContinuity, footSlide, locomotionPhaseError } from "../pose/MotionMetrics.js";
export type { MotionBoneSample, MotionFrame, MotionQuat, MotionVec3, BoneAngularSpeed, ContinuityResult, FootContactPhase, FootSlideResult, LocomotionPhaseSample, LocomotionPhaseErrorResult } from "../pose/MotionMetrics.js";
// T3.x — pose-space constraints (PRD-06 §7.1/7.2). Solve + spec types.
export { solveTwoBoneIkRotations } from "../IK.js";
export type { TwoBoneIkConstraintSpec } from "../IK.js";
export { solveFootIkConstraint } from "../FootIk.js";
export type { FootIkConstraintSpec } from "../FootIk.js";
export { createLookAtConstraint } from "../pose/LookAtConstraint.js";
export type { LookAtConstraintSpec, LookAtConstraint } from "../pose/LookAtConstraint.js";
export { solveCcdIk } from "../pose/CcdIkConstraint.js";
export type { CcdIkConstraintSpec, CcdIkResult } from "../pose/CcdIkConstraint.js";

// T3.8 (PRD-06 §7.2) — clip retarget baking + limb-flip detector + IDB cache.
export { bakeRetargetedClips, bakeRetargetedClipMap, decompileCompiledClip, detectLimbFlips, humanoidRigForSkeleton, rigWithRestPose } from "../pose/Retarget.js";
export type { AuraHumanoidBoneMap, BakeRetargetedClipsOptions, LimbFlip, RetargetSource } from "../pose/Retarget.js";
export { AURA3D_RETARGET_ENGINE_VERSION, retargetCacheKey, retargetClipsHash, retargetSkeletonHash, readRetargetCache, writeRetargetCache } from "../pose/RetargetCache.js";
export { createRetargetWorker, bakeClipsInWorker } from "../pose/RetargetWorker.js";
