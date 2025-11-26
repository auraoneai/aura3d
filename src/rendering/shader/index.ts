/**
 * @module Shader
 * @description Complete shader system for G3D 5.0 rendering engine.
 *
 * This module provides a comprehensive shader management system including:
 *
 * **Core Components:**
 * - Shader: WebGL shader program with introspection and hot-reload
 * - ShaderLibrary: Caching, variant management, and async loading
 * - ShaderPreprocessor: Include directives, defines, and conditionals
 * - ShaderChunks: Reusable GLSL/WGSL code snippets
 * - UniformBuffer: std140/std430 layout with dirty tracking
 * - ShaderGenerator: Programmatic shader generation
 *
 * **Features:**
 * - Automatic uniform and attribute introspection
 * - Compile error parsing with line numbers
 * - Shader variant compilation with feature flags
 * - Hot-reload support for development
 * - Zero-allocation uniform updates
 * - Node-based shader graph to GLSL/WGSL
 * - Material template expansion
 * - Built-in shader management
 *
 * @example
 * ```typescript
 * import {
 *   Shader,
 *   ShaderLibrary,
 *   ShaderGenerator,
 *   ShaderLanguage
 * } from './rendering/shader';
 *
 * // Create shader library
 * const library = new ShaderLibrary(gl);
 *
 * // Load shader
 * const shader = await library.load('pbr', {
 *   defines: {
 *     USE_SHADOWS: 1,
 *     MAX_LIGHTS: 4
 *   }
 * });
 *
 * // Use shader
 * shader.bind();
 * shader.setUniform('modelMatrix', modelMatrix);
 * shader.setUniform('albedo', new Vector3(1, 0, 0));
 *
 * // Generate shader programmatically
 * const generator = new ShaderGenerator();
 * const pbrSource = generator.generatePBR({
 *   useNormalMap: true,
 *   numLights: 3
 * });
 * ```
 */

// Core shader classes
export { Shader, ShaderType } from './Shader';
export type { ShaderSource, ShaderOptions, ShaderError, UniformInfo, AttributeInfo, UniformValue } from './Shader';
export { ShaderLibrary, initShaderLibrary, getShaderLibrary } from './ShaderLibrary';
export type { ShaderLoadOptions, BuiltinShaderDescriptor } from './ShaderLibrary';

// Preprocessing
export { ShaderPreprocessor, preprocessShader } from './ShaderPreprocessor';
export type { DefinesMap, PreprocessorOptions, PreprocessorResult } from './ShaderPreprocessor';

// Chunks
export { ShaderChunks, ShaderLanguage } from './ShaderChunks';
export type { IShaderChunk } from './ShaderChunks';

// Uniform buffers
export { UniformBuffer, UniformLayout, UniformType } from './UniformBuffer';
export type { UniformField, UniformBufferDescriptor } from './UniformBuffer';

// Shader generation
export {
  ShaderGenerator,
  ShaderNodeType,
} from './ShaderGenerator';
export type {
  ShaderNode,
  ShaderNodeConnection,
  ShaderGraph,
  MaterialTemplate
} from './ShaderGenerator';
