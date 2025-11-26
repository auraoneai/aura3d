/**
 * @module Shaders
 * @description
 * WGSL code generator for WebGPU shader graphs and templates.
 * Generates vertex, fragment, and compute shaders from abstract representations.
 */

import { Logger } from '../core/Logger';
import { ShaderChunkRegistry } from './ShaderChunkRegistry';

const logger = Logger.create('WGSLCodeGenerator');

/**
 * WGSL shader output
 */
export interface WGSLOutput {
  /** Vertex shader source */
  vertex: string;
  /** Fragment shader source */
  fragment: string;
  /** Compute shader source (optional) */
  compute?: string;
  /** Bind group layouts */
  bindings: BindingLayout;
  /** Entry point names */
  entryPoints: EntryPoints;
}

/**
 * Binding layout descriptor
 */
export interface BindingLayout {
  /** Bind groups */
  groups: BindGroup[];
}

/**
 * Bind group descriptor
 */
export interface BindGroup {
  /** Group index */
  group: number;
  /** Bindings in this group */
  bindings: Binding[];
}

/**
 * Individual binding descriptor
 */
export interface Binding {
  /** Binding index */
  binding: number;
  /** Binding name */
  name: string;
  /** Binding type */
  type: 'uniform' | 'storage' | 'texture' | 'sampler' | 'storage-texture';
  /** Resource type */
  resourceType: string;
  /** Visibility (vertex, fragment, compute) */
  visibility: ShaderStage[];
}

/**
 * Shader stage visibility
 */
export enum ShaderStage {
  Vertex = 'vertex',
  Fragment = 'fragment',
  Compute = 'compute'
}

/**
 * Entry point names
 */
export interface EntryPoints {
  vertex?: string;
  fragment?: string;
  compute?: string;
}

/**
 * Workgroup size for compute shaders
 */
export interface WorkgroupSize {
  x: number;
  y: number;
  z: number;
}

/**
 * Storage buffer descriptor
 */
export interface StorageBuffer {
  name: string;
  binding: number;
  group: number;
  readOnly: boolean;
  type: string;
}

/**
 * Shader graph (simplified)
 */
export interface ShaderGraph {
  nodes: any[];
  connections: Array<{ from: string; to: string }>;
  outputNode: string;
}

/**
 * Template parameters for WGSL
 */
export interface WGSLTemplateParams {
  /** Uniform bindings */
  uniforms?: Record<string, { type: string; binding: number; group: number }>;
  /** Storage buffer bindings */
  storageBuffers?: StorageBuffer[];
  /** Texture bindings */
  textures?: Array<{ name: string; binding: number; group: number; type: string }>;
  /** Sampler bindings */
  samplers?: Array<{ name: string; binding: number; group: number }>;
  /** Vertex attributes */
  attributes?: Record<string, { type: string; location: number }>;
  /** Custom structs */
  structs?: Record<string, Record<string, string>>;
  /** Code chunks */
  chunks?: string[];
  /** Workgroup size (for compute) */
  workgroupSize?: WorkgroupSize;
  /** Entry point name */
  entryPoint?: string;
}

/**
 * WGSL code generator for WebGPU.
 * Generates shader source code from graphs or templates with bind group
 * layouts, storage buffer support, and compute shader generation.
 *
 * @example
 * ```typescript
 * const generator = new WGSLCodeGenerator();
 *
 * // Generate compute shader
 * const compute = generator.generateComputeShader({
 *   storageBuffers: [{
 *     name: 'particles',
 *     binding: 0,
 *     group: 0,
 *     readOnly: false,
 *     type: 'array<Particle>'
 *   }],
 *   workgroupSize: { x: 256, y: 1, z: 1 }
 * }, computeCode);
 *
 * // Generate from template
 * const shader = generator.generateFromTemplate(fragmentCode, params);
 * ```
 */
export class WGSLCodeGenerator {
  /**
   * Current bind group index
   */
  private currentGroup = 0;

  /**
   * Current binding index
   */
  private currentBinding = 0;

  /**
   * Collected bindings
   */
  private bindings: BindGroup[] = [];

  /**
   * Vertex attributes
   */
  private attributes: Array<{ name: string; location: number; type: string }> = [];

  /**
   * Generate WGSL from shader graph
   *
   * @param graph - Shader graph to compile
   * @returns WGSL shaders and binding layout
   *
   * @example
   * ```typescript
   * const generator = new WGSLCodeGenerator();
   * const output = generator.generate(shaderGraph);
   * ```
   */
  generate(graph: ShaderGraph): WGSLOutput {
    this.reset();

    // Analyze graph
    this.analyzeGraph(graph);

    // Generate shaders
    const vertex = this.generateVertexFromGraph(graph);
    const fragment = this.generateFragmentFromGraph(graph);

    return {
      vertex,
      fragment,
      bindings: { groups: this.bindings },
      entryPoints: {
        vertex: 'vertexMain',
        fragment: 'fragmentMain'
      }
    };
  }

  /**
   * Generate WGSL from template
   *
   * @param template - Shader template code
   * @param params - Template parameters
   * @returns Complete WGSL shader source
   *
   * @example
   * ```typescript
   * const generator = new WGSLCodeGenerator();
   * const shader = generator.generateFromTemplate(code, {
   *   uniforms: {
   *     camera: { type: 'CameraUniforms', binding: 0, group: 0 }
   *   }
   * });
   * ```
   */
  generateFromTemplate(template: string, params: WGSLTemplateParams = {}): string {
    this.reset();

    let code = '';

    // Add structs
    if (params.structs) {
      for (const [name, fields] of Object.entries(params.structs)) {
        code += this.generateStruct(name, fields) + '\n\n';
      }
    }

    // Add chunks
    if (params.chunks) {
      for (const chunkName of params.chunks) {
        const chunk = ShaderChunkRegistry.get(chunkName);
        if (chunk) {
          code += `// Chunk: ${chunkName}\n`;
          code += chunk + '\n\n';
        }
      }
    }

    // Add uniforms
    if (params.uniforms) {
      for (const [name, config] of Object.entries(params.uniforms)) {
        code += `@group(${config.group}) @binding(${config.binding})\n`;
        code += `var<uniform> ${name}: ${config.type};\n\n`;

        this.addBinding(config.group, {
          binding: config.binding,
          name,
          type: 'uniform',
          resourceType: config.type,
          visibility: [ShaderStage.Vertex, ShaderStage.Fragment]
        });
      }
    }

    // Add storage buffers
    if (params.storageBuffers) {
      for (const buffer of params.storageBuffers) {
        const access = buffer.readOnly ? 'read' : 'read_write';
        code += `@group(${buffer.group}) @binding(${buffer.binding})\n`;
        code += `var<storage, ${access}> ${buffer.name}: ${buffer.type};\n\n`;

        this.addBinding(buffer.group, {
          binding: buffer.binding,
          name: buffer.name,
          type: 'storage',
          resourceType: buffer.type,
          visibility: [ShaderStage.Compute]
        });
      }
    }

    // Add textures
    if (params.textures) {
      for (const tex of params.textures) {
        code += `@group(${tex.group}) @binding(${tex.binding})\n`;
        code += `var ${tex.name}: ${tex.type};\n\n`;

        this.addBinding(tex.group, {
          binding: tex.binding,
          name: tex.name,
          type: 'texture',
          resourceType: tex.type,
          visibility: [ShaderStage.Fragment]
        });
      }
    }

    // Add samplers
    if (params.samplers) {
      for (const samp of params.samplers) {
        code += `@group(${samp.group}) @binding(${samp.binding})\n`;
        code += `var ${samp.name}: sampler;\n\n`;

        this.addBinding(samp.group, {
          binding: samp.binding,
          name: samp.name,
          type: 'sampler',
          resourceType: 'sampler',
          visibility: [ShaderStage.Fragment]
        });
      }
    }

    // Add template code
    code += template;

    return code;
  }

  /**
   * Generate compute shader
   *
   * @param params - Template parameters
   * @param mainCode - Compute shader main code
   * @returns Complete WGSL compute shader
   *
   * @example
   * ```typescript
   * const shader = generator.generateComputeShader({
   *   workgroupSize: { x: 256, y: 1, z: 1 },
   *   storageBuffers: [particleBuffer]
   * }, computeCode);
   * ```
   */
  generateComputeShader(params: WGSLTemplateParams, mainCode: string): string {
    const workgroup = params.workgroupSize || { x: 64, y: 1, z: 1 };
    const entryPoint = params.entryPoint || 'computeMain';

    let code = this.generateFromTemplate('', params);

    code += `@compute @workgroup_size(${workgroup.x}, ${workgroup.y}, ${workgroup.z})\n`;
    code += `fn ${entryPoint}(\n`;
    code += '  @builtin(global_invocation_id) globalId: vec3<u32>,\n';
    code += '  @builtin(local_invocation_id) localId: vec3<u32>,\n';
    code += '  @builtin(workgroup_id) workgroupId: vec3<u32>,\n';
    code += '  @builtin(local_invocation_index) localIndex: u32\n';
    code += ') {\n';
    code += mainCode;
    code += '\n}\n';

    return code;
  }

  /**
   * Generate bind group layout
   *
   * @param group - Group index
   * @returns Bind group layout descriptor
   *
   * @example
   * ```typescript
   * const layout = generator.generateBindGroupLayout(0);
   * ```
   */
  generateBindGroupLayout(group: number): BindGroup | undefined {
    return this.bindings.find(g => g.group === group);
  }

  /**
   * Optimize workgroup size
   *
   * @param totalInvocations - Total number of invocations needed
   * @param maxWorkgroupSize - Maximum workgroup size
   * @returns Optimized workgroup dimensions
   *
   * @example
   * ```typescript
   * const size = generator.optimizeWorkgroupSize(1024 * 1024);
   * // Returns something like { x: 256, y: 1, z: 1 }
   * ```
   */
  optimizeWorkgroupSize(
    totalInvocations: number,
    maxWorkgroupSize: number = 256
  ): WorkgroupSize {
    // Simple 1D optimization
    if (totalInvocations <= maxWorkgroupSize) {
      return { x: totalInvocations, y: 1, z: 1 };
    }

    // Use power of 2 sizes for better hardware utilization
    const powers = [256, 128, 64, 32, 16, 8, 4, 2, 1];
    for (const size of powers) {
      if (size <= maxWorkgroupSize && totalInvocations % size === 0) {
        return { x: size, y: 1, z: 1 };
      }
    }

    // Default to 64
    return { x: 64, y: 1, z: 1 };
  }

  /**
   * Generate struct definition
   *
   * @param name - Struct name
   * @param fields - Field definitions
   * @returns WGSL struct definition
   */
  generateStruct(name: string, fields: Record<string, string>): string {
    let code = `struct ${name} {\n`;

    for (const [fieldName, fieldType] of Object.entries(fields)) {
      code += `  ${fieldName}: ${fieldType},\n`;
    }

    code += '}';
    return code;
  }

  /**
   * Generate vertex input struct
   *
   * @param attributes - Vertex attributes
   * @returns WGSL vertex input struct
   */
  generateVertexInput(
    attributes: Array<{ name: string; type: string; location: number }>
  ): string {
    let code = 'struct VertexInput {\n';

    for (const attr of attributes) {
      code += `  @location(${attr.location}) ${attr.name}: ${attr.type},\n`;
    }

    code += '}';
    return code;
  }

  /**
   * Generate vertex output / fragment input struct
   *
   * @param varyings - Varying variables
   * @returns WGSL struct definition
   */
  generateVaryingStruct(
    varyings: Array<{ name: string; type: string; location: number }>
  ): string {
    let code = 'struct VertexOutput {\n';
    code += '  @builtin(position) position: vec4<f32>,\n';

    for (const varying of varyings) {
      code += `  @location(${varying.location}) ${varying.name}: ${varying.type},\n`;
    }

    code += '}';
    return code;
  }

  /**
   * Reset generator state
   */
  private reset(): void {
    this.currentGroup = 0;
    this.currentBinding = 0;
    this.bindings = [];
    this.attributes = [];
  }

  /**
   * Add binding to current layout
   */
  private addBinding(group: number, binding: Binding): void {
    let bindGroup = this.bindings.find(g => g.group === group);

    if (!bindGroup) {
      bindGroup = { group, bindings: [] };
      this.bindings.push(bindGroup);
      this.bindings.sort((a, b) => a.group - b.group);
    }

    bindGroup.bindings.push(binding);
    bindGroup.bindings.sort((a, b) => a.binding - b.binding);
  }

  /**
   * Analyze shader graph
   */
  private analyzeGraph(graph: ShaderGraph): void {
    // Simplified analysis
    this.addBinding(0, {
      binding: 0,
      name: 'camera',
      type: 'uniform',
      resourceType: 'CameraUniforms',
      visibility: [ShaderStage.Vertex]
    });

    this.addBinding(0, {
      binding: 1,
      name: 'model',
      type: 'uniform',
      resourceType: 'ModelUniforms',
      visibility: [ShaderStage.Vertex]
    });

    this.addBinding(1, {
      binding: 0,
      name: 'baseColorTexture',
      type: 'texture',
      resourceType: 'texture_2d<f32>',
      visibility: [ShaderStage.Fragment]
    });

    this.addBinding(1, {
      binding: 1,
      name: 'baseSampler',
      type: 'sampler',
      resourceType: 'sampler',
      visibility: [ShaderStage.Fragment]
    });
  }

  /**
   * Generate vertex shader from graph
   */
  private generateVertexFromGraph(graph: ShaderGraph): string {
    let code = '';

    // Structs
    code += this.generateStruct('CameraUniforms', {
      viewMatrix: 'mat4x4<f32>',
      projectionMatrix: 'mat4x4<f32>',
      viewProjectionMatrix: 'mat4x4<f32>'
    }) + '\n\n';

    code += this.generateStruct('ModelUniforms', {
      modelMatrix: 'mat4x4<f32>',
      normalMatrix: 'mat3x3<f32>'
    }) + '\n\n';

    code += this.generateVertexInput([
      { name: 'position', type: 'vec3<f32>', location: 0 },
      { name: 'normal', type: 'vec3<f32>', location: 1 },
      { name: 'uv', type: 'vec2<f32>', location: 2 }
    ]) + '\n\n';

    code += this.generateVaryingStruct([
      { name: 'worldPosition', type: 'vec3<f32>', location: 0 },
      { name: 'normal', type: 'vec3<f32>', location: 1 },
      { name: 'uv', type: 'vec2<f32>', location: 2 }
    ]) + '\n\n';

    // Bindings
    code += '@group(0) @binding(0)\n';
    code += 'var<uniform> camera: CameraUniforms;\n\n';
    code += '@group(0) @binding(1)\n';
    code += 'var<uniform> model: ModelUniforms;\n\n';

    // Entry point
    code += '@vertex\n';
    code += 'fn vertexMain(input: VertexInput) -> VertexOutput {\n';
    code += '  var output: VertexOutput;\n';
    code += '  let worldPos = model.modelMatrix * vec4<f32>(input.position, 1.0);\n';
    code += '  output.position = camera.viewProjectionMatrix * worldPos;\n';
    code += '  output.worldPosition = worldPos.xyz;\n';
    code += '  output.normal = model.normalMatrix * input.normal;\n';
    code += '  output.uv = input.uv;\n';
    code += '  return output;\n';
    code += '}\n';

    return code;
  }

  /**
   * Generate fragment shader from graph
   */
  private generateFragmentFromGraph(graph: ShaderGraph): string {
    let code = '';

    // Varying struct (shared with vertex)
    code += this.generateVaryingStruct([
      { name: 'worldPosition', type: 'vec3<f32>', location: 0 },
      { name: 'normal', type: 'vec3<f32>', location: 1 },
      { name: 'uv', type: 'vec2<f32>', location: 2 }
    ]) + '\n\n';

    // Bindings
    code += '@group(1) @binding(0)\n';
    code += 'var baseColorTexture: texture_2d<f32>;\n\n';
    code += '@group(1) @binding(1)\n';
    code += 'var baseSampler: sampler;\n\n';

    // Entry point
    code += '@fragment\n';
    code += 'fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {\n';
    code += '  let baseColor = textureSample(baseColorTexture, baseSampler, input.uv);\n';
    code += '  let normal = normalize(input.normal);\n';
    code += '  return baseColor;\n';
    code += '}\n';

    return code;
  }
}
