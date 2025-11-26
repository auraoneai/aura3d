/**
 * @module Shaders
 * @description
 * Shader system for G3D 5.0.
 * Provides shader compilation, chunk management, caching, and code generation
 * for both GLSL ES 3.0 (WebGL2) and WGSL (WebGPU).
 */

// Shader Compiler
export {
  ShaderCompiler,
  ShaderType,
  ShaderTarget,
  type CompileError,
  type CompileWarning,
  type CompiledShader,
  type LinkedProgram,
  type CompileResult,
  type ValidationResult,
  type SourceMap
} from './ShaderCompiler';

// Shader Chunk Registry
export {
  ShaderChunkRegistry,
  type ShaderChunk
} from './ShaderChunkRegistry';

// Shader Chunk Cache
export {
  ShaderChunkCache,
  type CachedChunk,
  type CacheStats
} from './ShaderChunkCache';

// GLSL Code Generator
export {
  GLSLCodeGenerator,
  type GLSLOutput,
  type UniformDescriptor,
  type AttributeDescriptor,
  type VaryingDescriptor,
  type TextureSampler,
  type PrecisionQualifier,
  type ShaderGraph,
  type ShaderGraphNode,
  type TemplateParams
} from './GLSLCodeGenerator';

// WGSL Code Generator
export {
  WGSLCodeGenerator,
  type WGSLOutput,
  type BindingLayout,
  type BindGroup,
  type Binding,
  ShaderStage,
  type EntryPoints,
  type WorkgroupSize,
  type StorageBuffer,
  type WGSLTemplateParams
} from './WGSLCodeGenerator';

// Re-export from rendering/shader for compatibility
export { ShaderChunks, ShaderLanguage, type IShaderChunk } from '../rendering/shader/ShaderChunks';
