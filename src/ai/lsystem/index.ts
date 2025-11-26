/**
 * L-Systems Module
 *
 * Provides multiple L-system implementations for procedural generation:
 * - D0L-systems (deterministic, context-free)
 * - Context-sensitive L-systems
 * - Stochastic L-systems
 * - Parametric L-systems
 *
 * Also includes interpreters for turtle graphics and behavior generation,
 * mesh generators, and a library of predefined grammars.
 *
 * @module ai/lsystem
 */

export { DOLSystem } from './DOLSystem';
export type { DOLSystemConfig, DOLProductionRule } from './DOLSystem';

export {
  ContextSensitiveLSystem,
} from './ContextSensitiveLSystem';
export type {
  ContextSensitiveLSystemConfig,
  ContextSensitiveRule
} from './ContextSensitiveLSystem';

export { StochasticLSystem } from './StochasticLSystem';
export type { StochasticLSystemConfig, StochasticRule } from './StochasticLSystem';

export {
  ParametricLSystem,
} from './ParametricLSystem';
export type {
  ParametricLSystemConfig,
  ParametricRule,
  ParametricSymbol,
  ParametricCondition,
  ParametricSuccessor
} from './ParametricLSystem';

export {
  TurtleInterpreter,
} from './TurtleInterpreter';
export type {
  TurtleInterpreterConfig,
  TurtleState,
  TurtleSegment
} from './TurtleInterpreter';

export {
  BehaviorInterpreter,
  BehaviorActionType,
} from './BehaviorInterpreter';
export type {
  BehaviorInterpreterConfig,
  BehaviorAction,
  BehaviorCommandMap
} from './BehaviorInterpreter';

export {
  LSystemMeshGenerator,
} from './LSystemMeshGenerator';
export type {
  MeshGeneratorConfig,
  GeneratedMesh,
  MeshVertex,
  MeshFace
} from './LSystemMeshGenerator';

export { GrammarLibrary } from './GrammarLibrary';
export { LSystemParser } from './LSystemParser';
export type { LSystemJSON } from './LSystemParser';

export {
  LSystemManager,
} from './LSystemManager';
export type {
  LSystemType,
  LSystemInstance,
  RegisteredLSystem
} from './LSystemManager';
