/**
 * @fileoverview Shader graph system exports
 * @module shaders/graph
 */

// Core graph
export { ShaderGraph } from './ShaderGraph';
export type { CompilationTarget, CompilationResult, GraphMetadata } from './ShaderGraph';

// Nodes
export {
  ShaderNode
} from './ShaderNode';
export type {
  ShaderType,
  NodeInput,
  NodeOutput,
  CodeGenContext,
  NodeMetadata
} from './ShaderNode';

// Edges
export { ShaderEdge } from './ShaderEdge';
export type { NodeOutputRef, NodeInputRef, EdgeValidationResult } from './ShaderEdge';

// Node library
export { NodeLibrary } from './NodeLibrary';

// Validation
export {
  GraphValidator,
  ValidationSeverity
} from './GraphValidator';
export type {
  ValidationResult,
  ValidationError
} from './GraphValidator';

// Serialization
export {
  GraphSerializer
} from './GraphSerializer';
export type {
  SerializedGraph,
  SerializationOptions,
  DeserializationOptions
} from './GraphSerializer';
