/**
 * @module Shaders
 * @description
 * GLSL ES 3.0 code generator for shader graphs and templates.
 * Generates complete vertex and fragment shaders from abstract representations.
 */

import { Logger } from '../core/Logger';
import { ShaderChunkRegistry } from './ShaderChunkRegistry';

const logger = Logger.create('GLSLCodeGenerator');

/**
 * GLSL shader output
 */
export interface GLSLOutput {
  /** Vertex shader source */
  vertex: string;
  /** Fragment shader source */
  fragment: string;
  /** Preprocessor defines */
  defines: Record<string, string>;
  /** Uniform declarations */
  uniforms: UniformDescriptor[];
  /** Attribute declarations */
  attributes: AttributeDescriptor[];
  /** Varying declarations */
  varyings: VaryingDescriptor[];
}

/**
 * Uniform descriptor
 */
export interface UniformDescriptor {
  /** Uniform name */
  name: string;
  /** GLSL type */
  type: string;
  /** Default value (optional) */
  defaultValue?: any;
  /** Uniform buffer binding (optional) */
  binding?: number;
}

/**
 * Attribute descriptor
 */
export interface AttributeDescriptor {
  /** Attribute name */
  name: string;
  /** GLSL type */
  type: string;
  /** Location index */
  location: number;
}

/**
 * Varying descriptor
 */
export interface VaryingDescriptor {
  /** Varying name */
  name: string;
  /** GLSL type */
  type: string;
  /** Interpolation qualifier */
  interpolation?: 'flat' | 'smooth' | 'noperspective';
}

/**
 * Texture sampler descriptor
 */
export interface TextureSampler {
  /** Sampler name */
  name: string;
  /** Sampler type */
  type: 'sampler2D' | 'sampler3D' | 'samplerCube' | 'sampler2DShadow';
  /** Texture binding index */
  binding: number;
}

/**
 * Precision qualifier
 */
export type PrecisionQualifier = 'lowp' | 'mediump' | 'highp';

/**
 * Shader graph node (simplified interface)
 */
export interface ShaderGraphNode {
  id: string;
  type: string;
  inputs: Record<string, any>;
  outputs: Record<string, string>;
}

/**
 * Shader graph (simplified interface)
 */
export interface ShaderGraph {
  nodes: ShaderGraphNode[];
  connections: Array<{ from: string; to: string }>;
  outputNode: string;
}

/**
 * Template parameters
 */
export interface TemplateParams {
  /** Uniform declarations */
  uniforms?: Record<string, string>;
  /** Attribute declarations */
  attributes?: Record<string, string>;
  /** Varying declarations */
  varyings?: Record<string, string>;
  /** Custom defines */
  defines?: Record<string, string>;
  /** Code chunks to include */
  chunks?: string[];
  /** Vertex shader main code */
  vertexMain?: string;
  /** Fragment shader main code */
  fragmentMain?: string;
  /** Global constants */
  constants?: Record<string, any>;
}

/**
 * GLSL ES 3.0 code generator.
 * Generates shader source code from graphs or templates with automatic
 * varying generation, uniform buffer layouts, and extension detection.
 *
 * @example
 * ```typescript
 * const generator = new GLSLCodeGenerator();
 *
 * // Generate from template
 * const shader = generator.generateFromTemplate(`
 *   uniform sampler2D uTexture;
 *   in vec2 vUV;
 *   out vec4 fragColor;
 *   void main() {
 *     fragColor = texture(uTexture, vUV);
 *   }
 * `, {
 *   attributes: { aPosition: 'vec3', aUV: 'vec2' },
 *   varyings: { vUV: 'vec2' }
 * });
 *
 * // Generate from graph
 * const output = generator.generate(shaderGraph);
 * ```
 */
export class GLSLCodeGenerator {
  /**
   * Default precision for fragment shaders
   */
  private defaultFragmentPrecision: PrecisionQualifier = 'highp';

  /**
   * Required extensions
   */
  private requiredExtensions: Set<string> = new Set();

  /**
   * Detected uniforms
   */
  private uniforms: UniformDescriptor[] = [];

  /**
   * Detected attributes
   */
  private attributes: AttributeDescriptor[] = [];

  /**
   * Detected varyings
   */
  private varyings: VaryingDescriptor[] = [];

  /**
   * Texture samplers
   */
  private samplers: TextureSampler[] = [];

  /**
   * Generate GLSL from shader graph
   *
   * @param graph - Shader graph to compile
   * @returns GLSL vertex and fragment shaders
   *
   * @example
   * ```typescript
   * const generator = new GLSLCodeGenerator();
   * const output = generator.generate(shaderGraph);
   * console.log(output.vertex);
   * console.log(output.fragment);
   * ```
   */
  generate(graph: ShaderGraph): GLSLOutput {
    this.reset();

    // Analyze graph for uniforms, attributes, and varyings
    this.analyzeGraph(graph);

    // Generate vertex shader
    const vertexCode = this.generateVertexFromGraph(graph);
    const vertex = this.wrapVertexShader(vertexCode);

    // Generate fragment shader
    const fragmentCode = this.generateFragmentFromGraph(graph);
    const fragment = this.wrapFragmentShader(fragmentCode);

    return {
      vertex,
      fragment,
      defines: {},
      uniforms: this.uniforms,
      attributes: this.attributes,
      varyings: this.varyings
    };
  }

  /**
   * Generate GLSL from template
   *
   * @param template - Shader template code
   * @param params - Template parameters
   * @returns Complete GLSL shader source
   *
   * @example
   * ```typescript
   * const generator = new GLSLCodeGenerator();
   * const shader = generator.generateFromTemplate(fragmentCode, {
   *   uniforms: { uTime: 'float', uResolution: 'vec2' },
   *   chunks: ['common', 'noise']
   * });
   * ```
   */
  generateFromTemplate(template: string, params: TemplateParams = {}): string {
    this.reset();

    let code = '';

    // Add version
    code += '#version 300 es\n\n';

    // Add precision
    code += `precision ${this.defaultFragmentPrecision} float;\n`;
    code += `precision ${this.defaultFragmentPrecision} int;\n\n`;

    // Add extensions
    if (this.requiredExtensions.size > 0) {
      for (const ext of this.requiredExtensions) {
        code += `#extension ${ext} : enable\n`;
      }
      code += '\n';
    }

    // Add defines
    if (params.defines) {
      for (const [name, value] of Object.entries(params.defines)) {
        code += `#define ${name} ${value}\n`;
      }
      code += '\n';
    }

    // Add constants
    if (params.constants) {
      for (const [name, value] of Object.entries(params.constants)) {
        code += `const ${this.getGLSLType(value)} ${name} = ${this.formatValue(value)};\n`;
      }
      code += '\n';
    }

    // Add chunks
    if (params.chunks) {
      for (const chunkName of params.chunks) {
        const chunk = ShaderChunkRegistry.resolve(chunkName);
        if (chunk) {
          code += `// Chunk: ${chunkName}\n`;
          code += chunk + '\n\n';
        }
      }
    }

    // Add uniforms
    if (params.uniforms) {
      for (const [name, type] of Object.entries(params.uniforms)) {
        code += `uniform ${type} ${name};\n`;
      }
      code += '\n';
    }

    // Add attributes
    if (params.attributes) {
      for (const [name, type] of Object.entries(params.attributes)) {
        code += `in ${type} ${name};\n`;
      }
      code += '\n';
    }

    // Add varyings
    if (params.varyings) {
      for (const [name, type] of Object.entries(params.varyings)) {
        const isVertex = template.includes('gl_Position');
        const qualifier = isVertex ? 'out' : 'in';
        code += `${qualifier} ${type} ${name};\n`;
      }
      code += '\n';
    }

    // Add template code
    code += template;

    return code;
  }

  /**
   * Generate uniform buffer layout
   *
   * @param uniforms - Uniform descriptors
   * @param bindingPoint - Buffer binding point
   * @returns GLSL uniform buffer declaration
   *
   * @example
   * ```typescript
   * const layout = generator.generateUniformBufferLayout([
   *   { name: 'viewMatrix', type: 'mat4' },
   *   { name: 'projectionMatrix', type: 'mat4' }
   * ], 0);
   * ```
   */
  generateUniformBufferLayout(uniforms: UniformDescriptor[], bindingPoint: number): string {
    let code = `layout(std140, binding = ${bindingPoint}) uniform UniformBlock {\n`;

    for (const uniform of uniforms) {
      code += `  ${uniform.type} ${uniform.name};\n`;
    }

    code += '};\n';
    return code;
  }

  /**
   * Generate varying declarations
   *
   * @param varyings - Varying descriptors
   * @param isVertex - True for vertex shader, false for fragment
   * @returns GLSL varying declarations
   */
  generateVaryingDeclarations(varyings: VaryingDescriptor[], isVertex: boolean): string {
    const qualifier = isVertex ? 'out' : 'in';
    let code = '';

    for (const varying of varyings) {
      const interpolation = varying.interpolation ? `${varying.interpolation} ` : '';
      code += `${interpolation}${qualifier} ${varying.type} ${varying.name};\n`;
    }

    return code;
  }

  /**
   * Detect required extensions
   *
   * @param source - Shader source code
   * @returns Set of required extension names
   */
  detectExtensions(source: string): Set<string> {
    const extensions = new Set<string>();

    // Check for derivative functions
    if (source.includes('dFdx') || source.includes('dFdy') || source.includes('fwidth')) {
      extensions.add('GL_OES_standard_derivatives');
    }

    // Check for texture LOD functions
    if (source.includes('textureLod') || source.includes('textureGrad')) {
      extensions.add('GL_EXT_shader_texture_lod');
    }

    // Check for draw buffers
    if (source.includes('gl_FragData')) {
      extensions.add('GL_EXT_draw_buffers');
    }

    return extensions;
  }

  /**
   * Set fragment shader precision
   */
  setFragmentPrecision(precision: PrecisionQualifier): void {
    this.defaultFragmentPrecision = precision;
  }

  /**
   * Reset generator state
   */
  private reset(): void {
    this.requiredExtensions.clear();
    this.uniforms = [];
    this.attributes = [];
    this.varyings = [];
    this.samplers = [];
  }

  /**
   * Analyze shader graph for declarations
   */
  private analyzeGraph(graph: ShaderGraph): void {
    // Simple analysis - would be more complex in real implementation
    for (const node of graph.nodes) {
      if (node.type === 'uniform') {
        this.uniforms.push({
          name: node.outputs.value,
          type: 'vec4' // Simplified
        });
      } else if (node.type === 'attribute') {
        this.attributes.push({
          name: node.outputs.value,
          type: 'vec3',
          location: this.attributes.length
        });
      }
    }

    // Auto-generate varyings
    this.varyings.push({
      name: 'vWorldPosition',
      type: 'vec3'
    });
    this.varyings.push({
      name: 'vNormal',
      type: 'vec3'
    });
    this.varyings.push({
      name: 'vUV',
      type: 'vec2'
    });
  }

  /**
   * Generate vertex shader from graph
   */
  private generateVertexFromGraph(graph: ShaderGraph): string {
    // Simplified implementation
    return `
  gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
  vWorldPosition = (uModelMatrix * vec4(aPosition, 1.0)).xyz;
  vNormal = mat3(uNormalMatrix) * aNormal;
  vUV = aUV;
`;
  }

  /**
   * Generate fragment shader from graph
   */
  private generateFragmentFromGraph(graph: ShaderGraph): string {
    // Simplified implementation
    return `
  vec3 normal = normalize(vNormal);
  vec4 baseColor = texture(uBaseColorMap, vUV);
  fragColor = baseColor;
`;
  }

  /**
   * Wrap vertex shader with boilerplate
   */
  private wrapVertexShader(mainCode: string): string {
    let code = '#version 300 es\n\n';
    code += 'precision highp float;\n\n';

    // Standard attributes
    code += 'in vec3 aPosition;\n';
    code += 'in vec3 aNormal;\n';
    code += 'in vec2 aUV;\n\n';

    // Standard uniforms
    code += 'uniform mat4 uModelMatrix;\n';
    code += 'uniform mat4 uViewMatrix;\n';
    code += 'uniform mat4 uProjectionMatrix;\n';
    code += 'uniform mat3 uNormalMatrix;\n\n';

    // Varyings
    code += this.generateVaryingDeclarations(this.varyings, true) + '\n';

    // Main function
    code += 'void main() {\n';
    code += mainCode;
    code += '}\n';

    return code;
  }

  /**
   * Wrap fragment shader with boilerplate
   */
  private wrapFragmentShader(mainCode: string): string {
    let code = '#version 300 es\n\n';
    code += `precision ${this.defaultFragmentPrecision} float;\n\n`;

    // Varyings
    code += this.generateVaryingDeclarations(this.varyings, false) + '\n';

    // Standard uniforms
    code += 'uniform sampler2D uBaseColorMap;\n\n';

    // Output
    code += 'out vec4 fragColor;\n\n';

    // Main function
    code += 'void main() {\n';
    code += mainCode;
    code += '}\n';

    return code;
  }

  /**
   * Get GLSL type from JavaScript value
   */
  private getGLSLType(value: any): string {
    if (typeof value === 'number') return 'float';
    if (Array.isArray(value)) {
      const len = value.length;
      if (len === 2) return 'vec2';
      if (len === 3) return 'vec3';
      if (len === 4) return 'vec4';
    }
    return 'float';
  }

  /**
   * Format value for GLSL
   */
  private formatValue(value: any): string {
    if (typeof value === 'number') {
      return value.toString().includes('.') ? value.toString() : `${value}.0`;
    }
    if (Array.isArray(value)) {
      const type = this.getGLSLType(value);
      const values = value.map(v => this.formatValue(v)).join(', ');
      return `${type}(${values})`;
    }
    return '0.0';
  }
}
