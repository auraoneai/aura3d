/**
 * Material System
 *
 * Comprehensive material management for the G3D rendering engine.
 * Supports PBR materials, custom shader materials, and material libraries.
 *
 * @module rendering/material
 */

export {
  Material,
  AlphaMode,
  CullMode,
  DepthTest,
} from './Material';

export type {
  PBRProperties,
  MaterialTextures,
  MaterialState,
  MaterialDescriptor,
  ShaderFeatures,
} from './Material';

export {
  MaterialLibrary,
} from './MaterialLibrary';

export type {
  MaterialLoadDescriptor,
} from './MaterialLibrary';

export {
  ShaderMaterial,
  UniformType,
} from './ShaderMaterial';

export type {
  UniformValue,
  ShaderUniform,
  ShaderSource,
} from './ShaderMaterial';
