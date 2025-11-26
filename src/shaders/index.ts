/**
 * @module Shaders
 * @description
 * Shader system for G3D 5.0.
 * Provides shader compilation, chunk management, caching, and code generation
 * for both GLSL ES 3.0 (WebGL2) and WGSL (WebGPU).
 */

// Shader Compiler
// Note: ShaderType is exported from rendering module to avoid duplicates
export {
  ShaderCompiler,
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
// Note: CacheStats is exported from rendering module to avoid duplicates
export {
  ShaderChunkCache,
  type CachedChunk
} from './ShaderChunkCache';

// GLSL Code Generator
// Note: ShaderGraph is exported from rendering module to avoid duplicates
export {
  GLSLCodeGenerator,
  type GLSLOutput,
  type UniformDescriptor,
  type AttributeDescriptor,
  type VaryingDescriptor,
  type TextureSampler,
  type PrecisionQualifier,
  type ShaderGraphNode,
  type TemplateParams
} from './GLSLCodeGenerator';

// WGSL Code Generator
// Note: ShaderStage is exported from rendering module to avoid duplicates
export {
  WGSLCodeGenerator,
  type WGSLOutput,
  type BindingLayout,
  type BindGroup,
  type Binding,
  type EntryPoints,
  type WorkgroupSize,
  type StorageBuffer,
  type WGSLTemplateParams
} from './WGSLCodeGenerator';

// Re-export from rendering/shader for compatibility
export { ShaderChunks, ShaderLanguage, type IShaderChunk } from '../rendering/shader/ShaderChunks';
