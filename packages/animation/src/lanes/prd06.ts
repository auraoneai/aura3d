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
