/**
 * G3D Animation System
 *
 * Complete animation system for skeletal and morph target animation.
 * Supports animation playback, blending, state machines, and GPU skinning.
 *
 * @module animation
 *
 * @example
 * ```typescript
 * import {
 *   Animation,
 *   AnimationTrack,
 *   AnimationMixer,
 *   Skeleton,
 *   SkinnedMesh,
 *   MorphTargets,
 *   AnimationSystem,
 *   ValueType,
 *   InterpolationMode,
 *   ChannelType
 * } from './animation';
 *
 * // Create skeleton
 * const skeleton = new Skeleton({
 *   name: 'Character',
 *   bones: [
 *     { name: 'root', parentIndex: -1, position: Vector3.zero(), rotation: Quaternion.identity(), scale: Vector3.one() },
 *     { name: 'spine', parentIndex: 0, position: new Vector3(0, 1, 0), rotation: Quaternion.identity(), scale: Vector3.one() }
 *   ]
 * });
 *
 * // Create animation
 * const walkAnim = new Animation({
 *   name: 'Walk',
 *   duration: 1.0,
 *   loop: true
 * });
 *
 * // Add position track
 * const posTrack = new AnimationTrack<Vector3>('root', ValueType.VECTOR3);
 * posTrack.addKeyframe(0, new Vector3(0, 0, 0), InterpolationMode.LINEAR);
 * posTrack.addKeyframe(0.5, new Vector3(0, 0.1, 0), InterpolationMode.LINEAR);
 * posTrack.addKeyframe(1, new Vector3(0, 0, 0), InterpolationMode.LINEAR);
 * walkAnim.addChannel('root', ChannelType.POSITION, posTrack);
 *
 * // Play animation
 * const mixer = new AnimationMixer();
 * const action = mixer.play(walkAnim);
 *
 * // Update each frame
 * mixer.update(deltaTime);
 *
 * // Apply to skeleton
 * const pose = mixer.getPose();
 * for (const [target, channels] of pose) {
 *   if (channels.position) skeleton.setBonePosition(target, channels.position);
 *   if (channels.rotation) skeleton.setBoneRotation(target, channels.rotation);
 * }
 * skeleton.update();
 * ```
 */

// Core animation types
export { Animation, ChannelType } from './Animation';
export type { AnimationConfig, AnimationChannel } from './Animation';
export {
  AnimationTrack,
  InterpolationMode,
  WrapMode,
  ValueType
} from './AnimationTrack';
export type {
  Keyframe
} from './AnimationTrack';

// Playback and mixing
export {
  AnimationMixer,
  AnimationAction,
  PlaybackState
} from './AnimationMixer';

// State machine
export {
  AnimationStateMachine
} from './AnimationState';
export type {
  AnimationStateData,
  AnimationTransition,
  TransitionCondition
} from './AnimationState';

// Skeletal animation
export {
  Skeleton
} from './Skeleton';
export type {
  Bone,
  SkeletonConfig
} from './Skeleton';

export {
  SkinnedMesh
} from './SkinnedMesh';
export type {
  SkinnedMeshConfig,
  VertexSkinData
} from './SkinnedMesh';

// Morph targets
export {
  MorphTargets
} from './MorphTargets';
export type {
  MorphTargetsConfig,
  MorphTarget
} from './MorphTargets';

// Clip utilities
export {
  AnimationClip
} from './AnimationClip';
export type {
  TimeRange
} from './AnimationClip';

// ECS integration
export {
  AnimationSystem,
  AnimationComponent,
  createAnimatedEntity,
  createAnimatedEntityWithStateMachine
} from './AnimationSystem';

// Motion Matching System (Phase C)
export { KDTree } from './KDTree';
export type { KDSearchResult, KDTreeConfig } from './KDTree';
export {
  MotionFeatureExtractor,
  DEFAULT_FEATURE_WEIGHTS
} from './MotionFeatures';
export type {
  PoseFeatures,
  TrajectorySample,
  FeatureConfig,
  FeatureWeights
} from './MotionFeatures';
export {
  TrajectoryGenerator
} from './TrajectoryGenerator';
export type {
  PlayerInput,
  PathWaypoint,
  TrajectoryConfig
} from './TrajectoryGenerator';
export {
  MotionDatabase
} from './MotionDatabase';
export type {
  PoseEntry,
  ClipMetadata,
  DatabaseConfig,
  SearchOptions
} from './MotionDatabase';
export {
  MotionMatcher
} from './MotionMatcher';
export type {
  MotionMatchResult,
  MotionMatcherConfig
} from './MotionMatcher';
export {
  MotionMatchingSystem
} from './MotionMatchingSystem';
export type {
  MotionMatchingConfig,
  MotionMatchingState,
  MotionMatchingStats
} from './MotionMatchingSystem';

// Inverse Kinematics (Phase C)
export { TwoBoneIKSolver } from './IK/TwoBoneIKSolver';
export type { TwoBoneIKConfig } from './IK/TwoBoneIKSolver';
export {
  FABRIKSolver,
  JointConstraintType
} from './IK/FABRIKSolver';
export type {
  FABRIKConfig,
  JointConstraint
} from './IK/FABRIKSolver';
export { CCDSolver } from './IK/CCDSolver';
export type { CCDConfig, JointLimit } from './IK/CCDSolver';
export {
  FullBodyIKSolver
} from './IK/FullBodyIKSolver';
export type {
  FullBodyIKConfig,
  IKTarget
} from './IK/FullBodyIKSolver';

// Foot IK and Ground Adaptation
export {
  FootIKSolver
} from './FootIKSolver';
export type {
  FootIKConfig,
  RaycastHit,
  RaycastFunction
} from './FootIKSolver';

// Procedural Animation
export {
  ProceduralAnimationSystem,
  ProceduralAnimationType
} from './ProceduralAnimationSystem';
export type {
  ProceduralAnimationConfig
} from './ProceduralAnimationSystem';

export {
  LocomotionGenerator,
  LocomotionGait
} from './LocomotionGenerator';
export type {
  LocomotionConfig
} from './LocomotionGenerator';

// Spring Bone Physics
export {
  SpringBoneSystem
} from './SpringBoneSystem';

export {
  SpringBoneChain
} from './SpringBoneChain';
export type {
  SpringBoneChainConfig,
  SphereCollider,
  CapsuleCollider
} from './SpringBoneChain';
