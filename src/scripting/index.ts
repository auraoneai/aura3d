/**
 * scripting/index.ts - Visual Scripting Module
 *
 * Main export point for G3D 5.0 Visual Scripting System.
 *
 * A complete flow-based visual scripting system with:
 * - Type-safe port connections
 * - Flow control and data flow
 * - Hot reload support
 * - Debug breakpoints
 * - Performance profiling
 * - Graph optimization
 *
 * @module G3D/Scripting
 * @version 5.0.0
 */

// Core
export * from './ScriptingEngine';
export * from './Graph';
export * from './Node';
export * from './Edge';
export * from './Port';

// Execution
export * from './execution';

// Compiler
export * from './compiler';

// Nodes
export * as EventNodes from './nodes/EventNodes';
export * as FlowNodes from './nodes/FlowNodes';
export * as MathNodes from './nodes/MathNodes';
export * as LogicNodes from './nodes/LogicNodes';
export * as VariableNodes from './nodes/VariableNodes';
export * as ComponentNodes from './nodes/ComponentNodes';
export * as PhysicsNodes from './nodes/PhysicsNodes';
export * as AnimationNodes from './nodes/AnimationNodes';
export * as DebugNodes from './nodes/DebugNodes';

// Re-export all nodes as a single namespace
export * from './nodes';
