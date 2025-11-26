/**
 * ML and Neural AI Systems for G3D 5.0
 *
 * Provides machine learning capabilities including:
 * - ONNX Runtime integration for neural network inference
 * - Model lifecycle management and caching
 * - Tensor utilities and feature extraction
 * - Policy and value networks for RL
 * - Behavior cloning and reinforcement learning
 * - ML-based NPC control and neural pathfinding
 *
 * @module ai/ml
 */

// ONNX Runtime and model management
export {
  ONNXRuntimeWrapper,
  InferenceSession,
} from './ONNXRuntimeWrapper';

export type {
  ONNXTensor,
  TensorDataType,
  TensorShape,
  InferenceSessionOptions,
  FeedDict,
  OutputDict,
} from './ONNXRuntimeWrapper';

export {
  ModelManager,
} from './ModelManager';

export type {
  ModelInfo,
  ModelManagerOptions,
} from './ModelManager';

// Tensor utilities
export {
  createTensor,
  zeros,
  ones,
  randomUniform,
  randomNormal,
  vectorToTensor,
  vectorArrayToTensor,
  tensorToVector,
  normalizeTensor,
  scaleTensor,
  concatenate,
  stack,
  reshape,
  softmax,
  sampleCategorical,
  clip,
} from './TensorUtils';

// Feature extraction
export {
  FeatureExtractor,
} from './FeatureExtractor';

export type {
  Observation,
  FeatureExtractorConfig,
} from './FeatureExtractor';

// Policy network
export {
  PolicyNetwork,
} from './PolicyNetwork';

export type {
  ActionSpace,
  PolicyOutput,
  PolicyNetworkConfig,
} from './PolicyNetwork';

// Value network
export {
  ValueNetwork,
} from './ValueNetwork';

export type {
  ValueNetworkConfig,
  ValueOutput,
} from './ValueNetwork';

// Reward function
export {
  RewardFunction,
} from './RewardFunction';

export type {
  RewardComponents,
  RewardFunctionConfig,
} from './RewardFunction';

// Experience buffer
export {
  ExperienceBuffer,
} from './ExperienceBuffer';

export type {
  Experience,
  Trajectory,
  ExperienceBufferConfig,
} from './ExperienceBuffer';

// Behavior cloning
export {
  BehaviorCloningAgent,
} from './BehaviorCloningAgent';

export type {
  Demonstration,
  BehaviorCloningConfig,
  TrainingMetrics,
} from './BehaviorCloningAgent';

// Reinforcement learning
export {
  RLAgent,
} from './RLAgent';

export type {
  RLAgentConfig,
  StepResult,
  TrainingStats,
} from './RLAgent';

// NPC controller
export {
  NPCController,
} from './NPCController';

export type {
  NPCState,
  NPCAction,
  NPCControllerConfig,
} from './NPCController';

// Neural pathfinder
export {
  NeuralPathfinder,
} from './NeuralPathfinder';

export type {
  Waypoint,
  PathResult,
  NeuralPathfinderConfig,
} from './NeuralPathfinder';
