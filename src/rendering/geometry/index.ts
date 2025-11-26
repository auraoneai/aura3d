/**
 * @module Geometry
 * @description
 * Geometry and mesh system for the G3D rendering engine.
 *
 * This module provides comprehensive geometry management for 3D rendering:
 *
 * **Vertex Format System:**
 * - VertexFormat: Defines vertex attribute layout and memory structure
 * - Support for multiple attribute types (float, normalized integers, etc.)
 * - Common format presets (P3, P3N3, P3N3T2, P3N3T4T2, etc.)
 * - Interleaved and separate buffer layouts
 *
 * **Buffer Management:**
 * - VertexBuffer: Typed array-backed vertex data storage
 * - IndexBuffer: 16-bit and 32-bit index buffers
 * - Efficient attribute accessors
 * - Dynamic buffer updates
 *
 * **Mesh System:**
 * - Mesh: Complete renderable geometry with metadata
 * - Submesh support for multi-material meshes
 * - LOD (Level of Detail) system
 * - Morph targets for blend shapes
 * - Skinning support (joints and weights)
 * - Bounding volume computation
 *
 * **Mesh Building:**
 * - MeshBuilder: Fluent API for programmatic mesh construction
 * - Automatic vertex deduplication
 * - Normal generation (area-weighted)
 * - Tangent generation (MikkTSpace-like algorithm)
 *
 * **Procedural Generation:**
 * - GeometryGenerator: Built-in primitive generators
 * - Sphere, Box, Cylinder, Cone, Torus
 * - Plane, Grid, Quad, Capsule, Pyramid
 * - Configurable subdivision and UV mapping
 *
 * **Optimization:**
 * - MeshOptimizer: Performance optimization tools
 * - Vertex cache optimization (Forsyth algorithm)
 * - Overdraw reduction
 * - Vertex fetch optimization
 * - Mesh simplification (quadric error metrics)
 *
 * @example
 * ```typescript
 * import {
 *   VertexFormat,
 *   VertexBuffer,
 *   IndexBuffer,
 *   Mesh,
 *   MeshBuilder,
 *   GeometryGenerator,
 *   MeshOptimizer
 * } from './rendering/geometry';
 *
 * // Create a mesh using the builder
 * const mesh = new MeshBuilder(VertexFormat.P3N3T2())
 *   .begin()
 *   .position(-1, -1, 0).normal(0, 0, 1).texCoord(0, 0).vertex()
 *   .position( 1, -1, 0).normal(0, 0, 1).texCoord(1, 0).vertex()
 *   .position( 1,  1, 0).normal(0, 0, 1).texCoord(1, 1).vertex()
 *   .position(-1,  1, 0).normal(0, 0, 1).texCoord(0, 1).vertex()
 *   .quad(0, 1, 2, 3)
 *   .build('Quad');
 *
 * // Generate procedural geometry
 * const sphere = GeometryGenerator.sphere(1.0, 32, 16);
 * const box = GeometryGenerator.box(2, 2, 2);
 *
 * // Optimize for GPU
 * const optimized = MeshOptimizer.optimizeVertexCache(sphere);
 * console.log('ACMR improved by:', optimized.improvement, '%');
 * ```
 */

// Vertex format and attributes
export {
  VertexAttributeType,
  VertexAttributeSemantic,
  VertexFormat,
} from './VertexFormat';

export type {
  VertexAttribute,
} from './VertexFormat';

// Buffer management
export {
  BufferUsage,
  VertexBuffer,
} from './VertexBuffer';

export {
  IndexType,
  PrimitiveTopology,
  IndexBuffer,
} from './IndexBuffer';

// Mesh system
export {
  Mesh,
} from './Mesh';

export type {
  Submesh,
  LODLevel,
  MorphTarget,
} from './Mesh';

// Mesh building
export {
  MeshBuilder,
} from './MeshBuilder';

// Procedural generation
export {
  GeometryGenerator,
} from './GeometryGenerator';

export type {
  UVOptions,
} from './GeometryGenerator';

// Optimization
export {
  MeshOptimizer,
} from './MeshOptimizer';
