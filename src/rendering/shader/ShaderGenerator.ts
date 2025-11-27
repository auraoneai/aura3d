/**
 * @module ShaderGenerator
 * @description Programmatic shader generation and node-based composition.
 */

import { Logger } from '../../core/Logger';
import { ShaderSource } from './Shader';
import { ShaderLanguage, ShaderChunks } from './ShaderChunks';
import { DefinesMap } from './ShaderPreprocessor';

const logger = Logger.create('ShaderGenerator');

/**
 * Shader node types
 */
export enum ShaderNodeType {
  // Inputs
  Attribute = 'attribute',
  Uniform = 'uniform',
  Varying = 'varying',
  Constant = 'constant',

  // Math operations
  Add = 'add',
  Subtract = 'subtract',
  Multiply = 'multiply',
  Divide = 'divide',
  Dot = 'dot',
  Cross = 'cross',
  Normalize = 'normalize',
  Length = 'length',
  Pow = 'pow',
  Clamp = 'clamp',
  Mix = 'mix',

  // Texture operations
  Texture2D = 'texture2D',
  TextureCube = 'textureCube',

  // Lighting
  Lambert = 'lambert',
  Phong = 'phong',
  PBR = 'pbr',

  // Utility
  Split = 'split',
  Combine = 'combine',
  Custom = 'custom'
}

/**
 * Shader node connection
 */
export interface ShaderNodeConnection {
  /** Source node ID */
  from: string;
  /** Source output name */
  fromOutput?: string;
  /** Target node ID */
  to: string;
  /** Target input name */
  toInput: string;
}

/**
 * Shader node definition
 */
export interface ShaderNode {
  /** Node ID */
  id: string;
  /** Node type */
  type: ShaderNodeType;
  /** Node parameters */
  params?: Record<string, any>;
  /** Custom code (for Custom node type) */
  code?: string;
}

/**
 * Shader graph definition
 */
export interface ShaderGraph {
  /** Graph nodes */
  nodes: ShaderNode[];
  /** Node connections */
  connections: ShaderNodeConnection[];
  /** Output node ID */
  outputNode: string;
}

/**
 * Material template
 */
export interface MaterialTemplate {
  /** Template name */
  name: string;
  /** Vertex shader template */
  vertexTemplate: string;
  /** Fragment shader template */
  fragmentTemplate: string;
  /** Template parameters */
  params: Record<string, any>;
}

/**
 * Code generation context
 */
interface GenerationContext {
  /** Variable declarations */
  declarations: string[];
  /** Statement code */
  statements: string[];
  /** Varying variables */
  varyings: Map<string, string>;
  /** Uniforms */
  uniforms: Map<string, string>;
  /** Attributes */
  attributes: Map<string, string>;
  /** Node output variable names */
  nodeOutputs: Map<string, string>;
  /** Variable counter */
  varCounter: number;
}

/**
 * Shader generator for programmatic shader creation.
 *
 * Features:
 * - Node-based shader graph to GLSL/WGSL
 * - Material template expansion
 * - Code generation from high-level descriptions
 *
 * @example
 * ```typescript
 * const generator = new ShaderGenerator();
 *
 * // Generate from graph
 * const graph: ShaderGraph = {
 *   nodes: [
 *     { id: 'position', type: ShaderNodeType.Attribute, params: { name: 'a_position' } },
 *     { id: 'mvp', type: ShaderNodeType.Uniform, params: { name: 'u_mvpMatrix', type: 'mat4' } },
 *     { id: 'transform', type: ShaderNodeType.Multiply, params: {} }
 *   ],
 *   connections: [
 *     { from: 'mvp', to: 'transform', toInput: 'a' },
 *     { from: 'position', to: 'transform', toInput: 'b' }
 *   ],
 *   outputNode: 'transform'
 * };
 *
 * const source = generator.generateFromGraph(graph);
 * ```
 */
export class ShaderGenerator {
  private language: ShaderLanguage;

  /**
   * Creates a new shader generator
   *
   * @param language - Target shader language
   */
  constructor(language: ShaderLanguage = ShaderLanguage.GLSL300) {
    this.language = language;
  }

  /**
   * Generate shader from graph
   *
   * @param graph - Shader graph
   * @returns Generated shader source
   */
  generateFromGraph(graph: ShaderGraph): ShaderSource {
    logger.debug(`Generating shader from graph with ${graph.nodes.length} nodes`);

    // Create generation contexts
    const vertexCtx = this.createContext();
    const fragmentCtx = this.createContext();

    // Process nodes and generate code
    this.processGraph(graph, vertexCtx, fragmentCtx);

    // Build final shader source
    const vertex = this.buildVertexShader(vertexCtx);
    const fragment = this.buildFragmentShader(fragmentCtx);

    return { vertex, fragment };
  }

  /**
   * Generate shader from material template
   *
   * @param template - Material template
   * @param params - Template parameters
   * @returns Generated shader source
   *
   * @example
   * ```typescript
   * const template: MaterialTemplate = {
   *   name: 'Standard',
   *   vertexTemplate: `...`,
   *   fragmentTemplate: `...`,
   *   params: {
   *     useNormalMap: true,
   *     useShadows: false
   *   }
   * };
   *
   * const source = generator.generateFromTemplate(template, {
   *   useShadows: true
   * });
   * ```
   */
  generateFromTemplate(template: MaterialTemplate, params?: Record<string, any>): ShaderSource {
    logger.debug(`Generating shader from template: ${template.name}`);

    const mergedParams = { ...template.params, ...params };

    // Expand templates
    const vertex = this.expandTemplate(template.vertexTemplate, mergedParams);
    const fragment = this.expandTemplate(template.fragmentTemplate, mergedParams);

    return { vertex, fragment };
  }

  /**
   * Generate basic PBR shader
   *
   * @param options - PBR shader options
   * @returns Generated PBR shader source
   */
  generatePBR(options: {
    useNormalMap?: boolean;
    useMetallicRoughnessMap?: boolean;
    useAO?: boolean;
    useEmissive?: boolean;
    numLights?: number;
  } = {}): ShaderSource {
    const {
      useNormalMap = false,
      useMetallicRoughnessMap = false,
      useAO = false,
      useEmissive = false,
      numLights = 1
    } = options;

    const chunks = ['common_math', 'pbr_brdf'];

    if (useNormalMap) {
      chunks.push('normal_mapping');
    }

    const includeCode = chunks.map(c => `#include <${c}>`).join('\n');

    const vertex = `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;
in vec2 a_texcoord;
${useNormalMap ? 'in vec4 a_tangent;' : ''}

uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

out vec3 v_worldPosition;
out vec3 v_normal;
out vec2 v_texcoord;
${useNormalMap ? 'out mat3 v_TBN;' : ''}

void main() {
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  v_worldPosition = worldPos.xyz;
  v_normal = normalize(u_normalMatrix * a_normal);
  v_texcoord = a_texcoord;

  ${useNormalMap ? `
  vec3 T = normalize(u_normalMatrix * a_tangent.xyz);
  vec3 N = v_normal;
  vec3 B = cross(N, T) * a_tangent.w;
  v_TBN = mat3(T, B, N);
  ` : ''}

  gl_Position = u_projectionMatrix * u_viewMatrix * worldPos;
}
`;

    const fragment = `#version 300 es
precision highp float;

${includeCode}

in vec3 v_worldPosition;
in vec3 v_normal;
in vec2 v_texcoord;
${useNormalMap ? 'in mat3 v_TBN;' : ''}

uniform vec3 u_cameraPosition;
uniform vec3 u_lightPositions[${numLights}];
uniform vec3 u_lightColors[${numLights}];

uniform sampler2D u_albedoMap;
${useNormalMap ? 'uniform sampler2D u_normalMap;' : ''}
${useMetallicRoughnessMap ? 'uniform sampler2D u_metallicRoughnessMap;' : ''}
${useAO ? 'uniform sampler2D u_aoMap;' : ''}
${useEmissive ? 'uniform sampler2D u_emissiveMap;' : ''}

uniform vec4 u_albedo;
uniform float u_metallic;
uniform float u_roughness;
${useAO ? 'uniform float u_aoStrength;' : ''}

out vec4 fragColor;

void main() {
  // Sample textures
  vec4 albedo = texture(u_albedoMap, v_texcoord) * u_albedo;

  ${useNormalMap ? `
  vec3 normal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
  normal = normalize(v_TBN * normal);
  ` : `
  vec3 normal = normalize(v_normal);
  `}

  ${useMetallicRoughnessMap ? `
  vec2 metallicRoughness = texture(u_metallicRoughnessMap, v_texcoord).bg;
  float metallic = metallicRoughness.x * u_metallic;
  float roughness = metallicRoughness.y * u_roughness;
  ` : `
  float metallic = u_metallic;
  float roughness = u_roughness;
  `}

  ${useAO ? `
  float ao = texture(u_aoMap, v_texcoord).r;
  ao = mix(1.0, ao, u_aoStrength);
  ` : `
  float ao = 1.0;
  `}

  // Calculate lighting
  vec3 V = normalize(u_cameraPosition - v_worldPosition);
  vec3 Lo = vec3(0.0);

  for (int i = 0; i < ${numLights}; i++) {
    vec3 L = normalize(u_lightPositions[i] - v_worldPosition);
    vec3 radiance = u_lightColors[i];

    Lo += cookTorranceBRDF(normal, V, L, albedo.rgb, metallic, roughness) * radiance;
  }

  // Ambient
  vec3 ambient = vec3(0.03) * albedo.rgb * ao;
  vec3 color = ambient + Lo;

  ${useEmissive ? `
  vec3 emissive = texture(u_emissiveMap, v_texcoord).rgb;
  color += emissive;
  ` : ''}

  fragColor = vec4(color, albedo.a);
}
`;

    return { vertex, fragment };
  }

  /**
   * Generate simple unlit shader
   *
   * @returns Unlit shader source
   */
  generateUnlit(): ShaderSource {
    const vertex = `#version 300 es
precision highp float;

in vec3 a_position;
in vec2 a_texcoord;

uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

out vec2 v_texcoord;

void main() {
  v_texcoord = a_texcoord;
  gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
}
`;

    const fragment = `#version 300 es
precision highp float;

in vec2 v_texcoord;

uniform sampler2D u_mainTexture;
uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = texture(u_mainTexture, v_texcoord) * u_color;
}
`;

    return { vertex, fragment };
  }

  /**
   * Generate skybox shader
   *
   * @returns Skybox shader source
   */
  generateSkybox(): ShaderSource {
    const vertex = `#version 300 es
precision highp float;

in vec3 a_position;

uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

out vec3 v_direction;

void main() {
  v_direction = a_position;
  mat4 viewNoTranslation = mat4(mat3(u_viewMatrix));
  vec4 pos = u_projectionMatrix * viewNoTranslation * vec4(a_position, 1.0);
  gl_Position = pos.xyww; // Ensure skybox is at far plane
}
`;

    const fragment = `#version 300 es
precision highp float;

in vec3 v_direction;

uniform samplerCube u_skybox;
uniform float u_exposure;

out vec4 fragColor;

void main() {
  vec3 color = texture(u_skybox, v_direction).rgb;
  color *= u_exposure;
  fragColor = vec4(color, 1.0);
}
`;

    return { vertex, fragment };
  }

  /**
   * Create generation context
   *
   * @returns New generation context
   */
  private createContext(): GenerationContext {
    return {
      declarations: [],
      statements: [],
      varyings: new Map(),
      uniforms: new Map(),
      attributes: new Map(),
      nodeOutputs: new Map(),
      varCounter: 0
    };
  }

  /**
   * Process shader graph
   *
   * @param graph - Shader graph
   * @param vertexCtx - Vertex shader context
   * @param fragmentCtx - Fragment shader context
   */
  private processGraph(
    graph: ShaderGraph,
    vertexCtx: GenerationContext,
    fragmentCtx: GenerationContext
  ): void {
    // Build dependency graph
    const dependencyMap = new Map<string, Set<string>>();
    for (const conn of graph.connections) {
      if (!dependencyMap.has(conn.to)) {
        dependencyMap.set(conn.to, new Set());
      }
      dependencyMap.get(conn.to)!.add(conn.from);
    }

    // Topological sort
    const sorted = this.topologicalSort(graph.nodes, dependencyMap);

    // Generate code for each node
    for (const node of sorted) {
      this.generateNodeCode(node, graph, vertexCtx, fragmentCtx);
    }
  }

  /**
   * Topological sort of nodes
   *
   * @param nodes - Graph nodes
   * @param dependencyMap - Node dependencies
   * @returns Sorted nodes
   */
  private topologicalSort(
    nodes: ShaderNode[],
    dependencyMap: Map<string, Set<string>>
  ): ShaderNode[] {
    const sorted: ShaderNode[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (node: ShaderNode): void => {
      if (visited.has(node.id)) return;
      if (visiting.has(node.id)) {
        throw new Error(`Circular dependency detected at node: ${node.id}`);
      }

      visiting.add(node.id);

      const deps = dependencyMap.get(node.id);
      if (deps) {
        for (const depId of deps) {
          const depNode = nodes.find(n => n.id === depId);
          if (depNode) {
            visit(depNode);
          }
        }
      }

      visiting.delete(node.id);
      visited.add(node.id);
      sorted.push(node);
    };

    for (const node of nodes) {
      visit(node);
    }

    return sorted;
  }

  /**
   * Generate code for a node
   *
   * @param node - Shader node
   * @param graph - Complete graph
   * @param vertexCtx - Vertex context
   * @param fragmentCtx - Fragment context
   */
  private generateNodeCode(
    node: ShaderNode,
    graph: ShaderGraph,
    vertexCtx: GenerationContext,
    fragmentCtx: GenerationContext
  ): void {
    // Determine which context to use based on node type
    const isVertexNode = this.isVertexShaderNode(node);
    const ctx = isVertexNode ? vertexCtx : fragmentCtx;

    // Get inputs from connections
    const inputs = this.getNodeInputs(node, graph, ctx);

    // Generate output variable name
    const outputVar = this.generateVarName(ctx);
    ctx.nodeOutputs.set(node.id, outputVar);

    switch (node.type) {
      case ShaderNodeType.Attribute:
        this.generateAttributeNode(node, ctx, outputVar);
        break;

      case ShaderNodeType.Uniform:
        this.generateUniformNode(node, ctx, outputVar);
        break;

      case ShaderNodeType.Varying:
        this.generateVaryingNode(node, vertexCtx, fragmentCtx, outputVar);
        break;

      case ShaderNodeType.Constant:
        this.generateConstantNode(node, ctx, outputVar);
        break;

      case ShaderNodeType.Add:
        this.generateBinaryOpNode(node, ctx, outputVar, inputs, '+');
        break;

      case ShaderNodeType.Subtract:
        this.generateBinaryOpNode(node, ctx, outputVar, inputs, '-');
        break;

      case ShaderNodeType.Multiply:
        this.generateBinaryOpNode(node, ctx, outputVar, inputs, '*');
        break;

      case ShaderNodeType.Divide:
        this.generateBinaryOpNode(node, ctx, outputVar, inputs, '/');
        break;

      case ShaderNodeType.Dot:
        this.generateFunctionNode(node, ctx, outputVar, inputs, 'dot');
        break;

      case ShaderNodeType.Cross:
        this.generateFunctionNode(node, ctx, outputVar, inputs, 'cross');
        break;

      case ShaderNodeType.Normalize:
        this.generateFunctionNode(node, ctx, outputVar, inputs, 'normalize');
        break;

      case ShaderNodeType.Length:
        this.generateFunctionNode(node, ctx, outputVar, inputs, 'length');
        break;

      case ShaderNodeType.Pow:
        this.generateFunctionNode(node, ctx, outputVar, inputs, 'pow');
        break;

      case ShaderNodeType.Clamp:
        this.generateFunctionNode(node, ctx, outputVar, inputs, 'clamp');
        break;

      case ShaderNodeType.Mix:
        this.generateFunctionNode(node, ctx, outputVar, inputs, 'mix');
        break;

      case ShaderNodeType.Texture2D:
        this.generateTextureNode(node, ctx, outputVar, inputs, 'texture');
        break;

      case ShaderNodeType.TextureCube:
        this.generateTextureNode(node, ctx, outputVar, inputs, 'texture');
        break;

      case ShaderNodeType.Split:
        this.generateSplitNode(node, ctx, outputVar, inputs);
        break;

      case ShaderNodeType.Combine:
        this.generateCombineNode(node, ctx, outputVar, inputs);
        break;

      case ShaderNodeType.Custom:
        this.generateCustomNode(node, ctx, outputVar, inputs);
        break;

      default:
        logger.warn(`Unsupported node type: ${node.type}`);
    }
  }

  /**
   * Check if node should be in vertex shader
   */
  private isVertexShaderNode(node: ShaderNode): boolean {
    return node.type === ShaderNodeType.Attribute ||
           (node.params?.stage === 'vertex');
  }

  /**
   * Get input variables for a node
   */
  private getNodeInputs(
    node: ShaderNode,
    graph: ShaderGraph,
    ctx: GenerationContext
  ): Map<string, string> {
    const inputs = new Map<string, string>();

    for (const conn of graph.connections) {
      if (conn.to === node.id) {
        const inputVar = ctx.nodeOutputs.get(conn.from);
        if (inputVar) {
          inputs.set(conn.toInput, inputVar);
        }
      }
    }

    return inputs;
  }

  /**
   * Generate unique variable name
   */
  private generateVarName(ctx: GenerationContext): string {
    return `v${ctx.varCounter++}`;
  }

  /**
   * Generate attribute node
   */
  private generateAttributeNode(node: ShaderNode, ctx: GenerationContext, outputVar: string): void {
    const name = node.params?.name || 'a_attribute';
    const type = node.params?.type || 'vec3';

    ctx.attributes.set(name, type);
    ctx.declarations.push(`${type} ${outputVar} = ${name};`);
  }

  /**
   * Generate uniform node
   */
  private generateUniformNode(node: ShaderNode, ctx: GenerationContext, outputVar: string): void {
    const name = node.params?.name || 'u_uniform';
    const type = node.params?.type || 'vec3';

    ctx.uniforms.set(name, type);
    ctx.declarations.push(`${type} ${outputVar} = ${name};`);
  }

  /**
   * Generate varying node
   */
  private generateVaryingNode(
    node: ShaderNode,
    vertexCtx: GenerationContext,
    fragmentCtx: GenerationContext,
    outputVar: string
  ): void {
    const name = node.params?.name || 'v_varying';
    const type = node.params?.type || 'vec3';

    vertexCtx.varyings.set(name, type);
    fragmentCtx.varyings.set(name, type);

    // In vertex shader, assign to varying
    vertexCtx.statements.push(`${name} = ${outputVar};`);

    // In fragment shader, read from varying
    fragmentCtx.declarations.push(`${type} ${outputVar} = ${name};`);
  }

  /**
   * Generate constant node
   */
  private generateConstantNode(node: ShaderNode, ctx: GenerationContext, outputVar: string): void {
    const value = node.params?.value || '0.0';
    const type = node.params?.type || 'float';

    ctx.declarations.push(`${type} ${outputVar} = ${type}(${value});`);
  }

  /**
   * Generate binary operation node
   */
  private generateBinaryOpNode(
    node: ShaderNode,
    ctx: GenerationContext,
    outputVar: string,
    inputs: Map<string, string>,
    op: string
  ): void {
    const inputA = inputs.get('a') || '0.0';
    const inputB = inputs.get('b') || '0.0';
    const type = node.params?.outputType || 'auto';

    if (type === 'auto') {
      ctx.declarations.push(`auto ${outputVar} = ${inputA} ${op} ${inputB};`);
    } else {
      ctx.declarations.push(`${type} ${outputVar} = ${inputA} ${op} ${inputB};`);
    }
  }

  /**
   * Generate function call node
   */
  private generateFunctionNode(
    node: ShaderNode,
    ctx: GenerationContext,
    outputVar: string,
    inputs: Map<string, string>,
    funcName: string
  ): void {
    const args: string[] = [];

    // Get arguments in order
    const argOrder = node.params?.argOrder || ['a', 'b', 'c'];
    for (const argName of argOrder) {
      const inputVar = inputs.get(argName);
      if (inputVar) {
        args.push(inputVar);
      }
    }

    const type = node.params?.outputType || 'auto';
    const argsStr = args.join(', ');

    if (type === 'auto') {
      ctx.declarations.push(`auto ${outputVar} = ${funcName}(${argsStr});`);
    } else {
      ctx.declarations.push(`${type} ${outputVar} = ${funcName}(${argsStr});`);
    }
  }

  /**
   * Generate texture sample node
   */
  private generateTextureNode(
    node: ShaderNode,
    ctx: GenerationContext,
    outputVar: string,
    inputs: Map<string, string>,
    funcName: string
  ): void {
    const sampler = inputs.get('sampler') || node.params?.sampler || 'u_texture';
    const uv = inputs.get('uv') || 'v_texcoord';
    const type = node.params?.outputType || 'vec4';

    ctx.declarations.push(`${type} ${outputVar} = ${funcName}(${sampler}, ${uv});`);
  }

  /**
   * Generate split/swizzle node
   */
  private generateSplitNode(
    node: ShaderNode,
    ctx: GenerationContext,
    outputVar: string,
    inputs: Map<string, string>
  ): void {
    const input = inputs.get('input') || 'vec4(0.0)';
    const swizzle = node.params?.swizzle || 'xyz';
    const type = node.params?.outputType || 'vec3';

    ctx.declarations.push(`${type} ${outputVar} = ${input}.${swizzle};`);
  }

  /**
   * Generate combine/constructor node
   */
  private generateCombineNode(
    node: ShaderNode,
    ctx: GenerationContext,
    outputVar: string,
    inputs: Map<string, string>
  ): void {
    const args: string[] = [];
    const components = node.params?.components || ['x', 'y', 'z', 'w'];

    for (const comp of components) {
      const inputVar = inputs.get(comp);
      if (inputVar) {
        args.push(inputVar);
      }
    }

    const type = node.params?.outputType || 'vec4';
    const argsStr = args.join(', ');

    ctx.declarations.push(`${type} ${outputVar} = ${type}(${argsStr});`);
  }

  /**
   * Generate custom code node
   */
  private generateCustomNode(
    node: ShaderNode,
    ctx: GenerationContext,
    outputVar: string,
    inputs: Map<string, string>
  ): void {
    if (!node.code) {
      logger.warn(`Custom node ${node.id} has no code`);
      return;
    }

    // Replace input placeholders
    let code = node.code;
    for (const [name, varName] of inputs) {
      code = code.replace(new RegExp(`\\$\\{${name}\\}`, 'g'), varName);
    }

    // Replace output placeholder
    code = code.replace(/\$\{output\}/g, outputVar);

    ctx.statements.push(code);
  }

  /**
   * Build vertex shader from context
   *
   * @param ctx - Generation context
   * @returns Vertex shader source
   */
  private buildVertexShader(ctx: GenerationContext): string {
    const parts: string[] = [];

    parts.push('#version 300 es');
    parts.push('precision highp float;');
    parts.push('');

    // Attributes
    for (const [name, type] of ctx.attributes) {
      parts.push(`in ${type} ${name};`);
    }
    parts.push('');

    // Uniforms
    for (const [name, type] of ctx.uniforms) {
      parts.push(`uniform ${type} ${name};`);
    }
    parts.push('');

    // Varyings
    for (const [name, type] of ctx.varyings) {
      parts.push(`out ${type} ${name};`);
    }
    parts.push('');

    // Main function
    parts.push('void main() {');
    parts.push(...ctx.declarations.map(d => `  ${d}`));
    parts.push(...ctx.statements.map(s => `  ${s}`));
    parts.push('}');

    return parts.join('\n');
  }

  /**
   * Build fragment shader from context
   *
   * @param ctx - Generation context
   * @returns Fragment shader source
   */
  private buildFragmentShader(ctx: GenerationContext): string {
    const parts: string[] = [];

    parts.push('#version 300 es');
    parts.push('precision highp float;');
    parts.push('');

    // Varyings (inputs)
    for (const [name, type] of ctx.varyings) {
      parts.push(`in ${type} ${name};`);
    }
    parts.push('');

    // Uniforms
    for (const [name, type] of ctx.uniforms) {
      parts.push(`uniform ${type} ${name};`);
    }
    parts.push('');

    parts.push('out vec4 fragColor;');
    parts.push('');

    // Main function
    parts.push('void main() {');
    parts.push(...ctx.declarations.map(d => `  ${d}`));
    parts.push(...ctx.statements.map(s => `  ${s}`));
    parts.push('}');

    return parts.join('\n');
  }

  /**
   * Expand template with parameters
   *
   * @param template - Template string
   * @param params - Template parameters
   * @returns Expanded string
   */
  private expandTemplate(template: string, params: Record<string, any>): string {
    let result = template;

    // Replace {{param}} with values
    for (const [key, value] of Object.entries(params)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }

    // Handle conditionals {{#if param}}...{{/if}}
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
      return params[key] ? content : '';
    });

    // Handle loops {{#each array}}...{{/each}}
    result = result.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
      const array = params[key];
      if (!Array.isArray(array)) return '';
      return array.map((item, index) => {
        let itemContent = content;
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
        itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
        return itemContent;
      }).join('');
    });

    return result;
  }
}
