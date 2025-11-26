/**
 * @fileoverview Built-in shader node library
 * @module shaders/graph/NodeLibrary
 */

import { ShaderNode, NodeMetadata, CodeGenContext, ShaderType } from './ShaderNode';

/**
 * Node factory function type
 */
type NodeFactory = (id: string) => ShaderNode;

/**
 * Node registry entry
 */
interface NodeRegistryEntry {
  /** Node factory function */
  factory: NodeFactory;
  /** Node metadata */
  metadata: NodeMetadata;
}

/**
 * Library of built-in shader nodes
 */
export class NodeLibrary {
  private static registry = new Map<string, NodeRegistryEntry>();
  private static initialized = false;

  /**
   * Initializes the node library with built-in nodes
   */
  public static initialize(): void {
    if (this.initialized) return;

    // Math nodes
    this.registerMathNodes();

    // Vector nodes
    this.registerVectorNodes();

    // Texture nodes
    this.registerTextureNodes();

    // UV nodes
    this.registerUVNodes();

    // Color nodes
    this.registerColorNodes();

    // PBR nodes
    this.registerPBRNodes();

    // Utility nodes
    this.registerUtilityNodes();

    this.initialized = true;
  }

  /**
   * Registers a node type
   * @param type - Node type identifier
   * @param factory - Node factory function
   * @param metadata - Node metadata
   */
  public static register(type: string, factory: NodeFactory, metadata: NodeMetadata): void {
    this.registry.set(type, { factory, metadata });
  }

  /**
   * Creates a node instance
   * @param type - Node type
   * @param id - Node ID
   * @returns New node instance
   */
  public static create(type: string, id: string): ShaderNode {
    this.initialize();
    const entry = this.registry.get(type);
    if (!entry) {
      throw new Error(`Unknown node type: ${type}`);
    }
    return entry.factory(id);
  }

  /**
   * Gets all registered categories
   * @returns Array of category names
   */
  public static getCategories(): string[] {
    this.initialize();
    const categories = new Set<string>();
    for (const entry of this.registry.values()) {
      categories.add(entry.metadata.category);
    }
    return Array.from(categories).sort();
  }

  /**
   * Gets all nodes in a category
   * @param category - Category name
   * @returns Array of node types in category
   */
  public static getNodesInCategory(category: string): string[] {
    this.initialize();
    const nodes: string[] = [];
    for (const [type, entry] of this.registry) {
      if (entry.metadata.category === category) {
        nodes.push(type);
      }
    }
    return nodes.sort();
  }

  /**
   * Gets node metadata
   * @param type - Node type
   * @returns Node metadata or undefined
   */
  public static getMetadata(type: string): NodeMetadata | undefined {
    this.initialize();
    return this.registry.get(type)?.metadata;
  }

  // ============================================================================
  // Math Nodes
  // ============================================================================

  private static registerMathNodes(): void {
    // Add
    this.register('math.add', (id) => new MathAddNode(id), {
      category: 'Math',
      displayName: 'Add',
      description: 'Adds two values',
      tags: ['math', 'arithmetic', 'add', 'plus'],
    });

    // Subtract
    this.register('math.subtract', (id) => new MathSubtractNode(id), {
      category: 'Math',
      displayName: 'Subtract',
      description: 'Subtracts B from A',
      tags: ['math', 'arithmetic', 'subtract', 'minus'],
    });

    // Multiply
    this.register('math.multiply', (id) => new MathMultiplyNode(id), {
      category: 'Math',
      displayName: 'Multiply',
      description: 'Multiplies two values',
      tags: ['math', 'arithmetic', 'multiply', 'times'],
    });

    // Divide
    this.register('math.divide', (id) => new MathDivideNode(id), {
      category: 'Math',
      displayName: 'Divide',
      description: 'Divides A by B',
      tags: ['math', 'arithmetic', 'divide'],
    });

    // Power
    this.register('math.power', (id) => new MathPowerNode(id), {
      category: 'Math',
      displayName: 'Power',
      description: 'Raises A to the power of B',
      tags: ['math', 'power', 'exponent'],
    });

    // Sqrt
    this.register('math.sqrt', (id) => new MathSqrtNode(id), {
      category: 'Math',
      displayName: 'Square Root',
      description: 'Square root of input',
      tags: ['math', 'sqrt', 'root'],
    });

    // Abs
    this.register('math.abs', (id) => new MathAbsNode(id), {
      category: 'Math',
      displayName: 'Absolute',
      description: 'Absolute value',
      tags: ['math', 'abs', 'absolute'],
    });

    // Sign
    this.register('math.sign', (id) => new MathSignNode(id), {
      category: 'Math',
      displayName: 'Sign',
      description: 'Sign of input (-1, 0, or 1)',
      tags: ['math', 'sign'],
    });

    // Floor
    this.register('math.floor', (id) => new MathFloorNode(id), {
      category: 'Math',
      displayName: 'Floor',
      description: 'Rounds down to nearest integer',
      tags: ['math', 'floor', 'round'],
    });

    // Ceil
    this.register('math.ceil', (id) => new MathCeilNode(id), {
      category: 'Math',
      displayName: 'Ceiling',
      description: 'Rounds up to nearest integer',
      tags: ['math', 'ceil', 'ceiling', 'round'],
    });

    // Fract
    this.register('math.fract', (id) => new MathFractNode(id), {
      category: 'Math',
      displayName: 'Fraction',
      description: 'Fractional part of input',
      tags: ['math', 'fract', 'fraction'],
    });

    // Mod
    this.register('math.mod', (id) => new MathModNode(id), {
      category: 'Math',
      displayName: 'Modulo',
      description: 'Modulo operation',
      tags: ['math', 'mod', 'modulo', 'remainder'],
    });

    // Min
    this.register('math.min', (id) => new MathMinNode(id), {
      category: 'Math',
      displayName: 'Minimum',
      description: 'Minimum of two values',
      tags: ['math', 'min', 'minimum'],
    });

    // Max
    this.register('math.max', (id) => new MathMaxNode(id), {
      category: 'Math',
      displayName: 'Maximum',
      description: 'Maximum of two values',
      tags: ['math', 'max', 'maximum'],
    });

    // Clamp
    this.register('math.clamp', (id) => new MathClampNode(id), {
      category: 'Math',
      displayName: 'Clamp',
      description: 'Clamps value between min and max',
      tags: ['math', 'clamp', 'limit'],
    });

    // Lerp
    this.register('math.lerp', (id) => new MathLerpNode(id), {
      category: 'Math',
      displayName: 'Lerp',
      description: 'Linear interpolation',
      tags: ['math', 'lerp', 'mix', 'interpolate'],
    });

    // Step
    this.register('math.step', (id) => new MathStepNode(id), {
      category: 'Math',
      displayName: 'Step',
      description: 'Step function',
      tags: ['math', 'step'],
    });

    // Smoothstep
    this.register('math.smoothstep', (id) => new MathSmoothstepNode(id), {
      category: 'Math',
      displayName: 'Smoothstep',
      description: 'Smooth interpolation',
      tags: ['math', 'smoothstep', 'smooth'],
    });
  }

  // ============================================================================
  // Vector Nodes
  // ============================================================================

  private static registerVectorNodes(): void {
    this.register('vector.split', (id) => new VectorSplitNode(id), {
      category: 'Vector',
      displayName: 'Split',
      description: 'Splits vector into components',
      tags: ['vector', 'split', 'separate'],
    });

    this.register('vector.combine', (id) => new VectorCombineNode(id), {
      category: 'Vector',
      displayName: 'Combine',
      description: 'Combines components into vector',
      tags: ['vector', 'combine', 'join'],
    });

    this.register('vector.normalize', (id) => new VectorNormalizeNode(id), {
      category: 'Vector',
      displayName: 'Normalize',
      description: 'Normalizes vector to unit length',
      tags: ['vector', 'normalize'],
    });

    this.register('vector.dot', (id) => new VectorDotNode(id), {
      category: 'Vector',
      displayName: 'Dot Product',
      description: 'Dot product of two vectors',
      tags: ['vector', 'dot', 'product'],
    });

    this.register('vector.cross', (id) => new VectorCrossNode(id), {
      category: 'Vector',
      displayName: 'Cross Product',
      description: 'Cross product of two vec3s',
      tags: ['vector', 'cross', 'product'],
    });

    this.register('vector.length', (id) => new VectorLengthNode(id), {
      category: 'Vector',
      displayName: 'Length',
      description: 'Length/magnitude of vector',
      tags: ['vector', 'length', 'magnitude'],
    });

    this.register('vector.distance', (id) => new VectorDistanceNode(id), {
      category: 'Vector',
      displayName: 'Distance',
      description: 'Distance between two points',
      tags: ['vector', 'distance'],
    });

    this.register('vector.reflect', (id) => new VectorReflectNode(id), {
      category: 'Vector',
      displayName: 'Reflect',
      description: 'Reflects vector around normal',
      tags: ['vector', 'reflect', 'reflection'],
    });

    this.register('vector.refract', (id) => new VectorRefractNode(id), {
      category: 'Vector',
      displayName: 'Refract',
      description: 'Refracts vector through surface',
      tags: ['vector', 'refract', 'refraction'],
    });
  }

  // ============================================================================
  // Texture Nodes
  // ============================================================================

  private static registerTextureNodes(): void {
    this.register('texture.sample2D', (id) => new TextureSample2DNode(id), {
      category: 'Texture',
      displayName: 'Sample 2D',
      description: 'Samples a 2D texture',
      tags: ['texture', 'sample', '2d'],
    });

    this.register('texture.sampleCube', (id) => new TextureSampleCubeNode(id), {
      category: 'Texture',
      displayName: 'Sample Cube',
      description: 'Samples a cube texture',
      tags: ['texture', 'sample', 'cube', 'cubemap'],
    });

    this.register('texture.sampleNormal', (id) => new TextureSampleNormalNode(id), {
      category: 'Texture',
      displayName: 'Sample Normal Map',
      description: 'Samples and unpacks a normal map',
      tags: ['texture', 'normal', 'normalmap'],
    });

    this.register('texture.triplanar', (id) => new TextureTriplanarNode(id), {
      category: 'Texture',
      displayName: 'Triplanar Mapping',
      description: 'Triplanar texture projection',
      tags: ['texture', 'triplanar', 'projection'],
    });
  }

  // ============================================================================
  // UV Nodes
  // ============================================================================

  private static registerUVNodes(): void {
    this.register('uv.tilingOffset', (id) => new UVTilingOffsetNode(id), {
      category: 'UV',
      displayName: 'Tiling and Offset',
      description: 'Scales and offsets UVs',
      tags: ['uv', 'tiling', 'offset', 'scale'],
    });

    this.register('uv.rotate', (id) => new UVRotateNode(id), {
      category: 'UV',
      displayName: 'Rotate',
      description: 'Rotates UVs around center',
      tags: ['uv', 'rotate', 'rotation'],
    });

    this.register('uv.parallax', (id) => new UVParallaxNode(id), {
      category: 'UV',
      displayName: 'Parallax',
      description: 'Parallax occlusion mapping',
      tags: ['uv', 'parallax', 'pom'],
    });
  }

  // ============================================================================
  // Color Nodes
  // ============================================================================

  private static registerColorNodes(): void {
    this.register('color.hsv', (id) => new ColorHSVNode(id), {
      category: 'Color',
      displayName: 'HSV Adjust',
      description: 'Adjusts hue, saturation, and value',
      tags: ['color', 'hsv', 'hue', 'saturation'],
    });

    this.register('color.contrast', (id) => new ColorContrastNode(id), {
      category: 'Color',
      displayName: 'Contrast',
      description: 'Adjusts contrast',
      tags: ['color', 'contrast'],
    });

    this.register('color.saturation', (id) => new ColorSaturationNode(id), {
      category: 'Color',
      displayName: 'Saturation',
      description: 'Adjusts saturation',
      tags: ['color', 'saturation'],
    });

    this.register('color.blend', (id) => new ColorBlendNode(id), {
      category: 'Color',
      displayName: 'Blend',
      description: 'Blends two colors',
      tags: ['color', 'blend', 'mix'],
    });
  }

  // ============================================================================
  // PBR Nodes
  // ============================================================================

  private static registerPBRNodes(): void {
    this.register('pbr.fresnel', (id) => new PBRFresnelNode(id), {
      category: 'PBR',
      displayName: 'Fresnel (Schlick)',
      description: 'Schlick Fresnel approximation',
      tags: ['pbr', 'fresnel', 'schlick'],
    });

    this.register('pbr.ggx', (id) => new PBRGGXNode(id), {
      category: 'PBR',
      displayName: 'GGX Distribution',
      description: 'GGX normal distribution function',
      tags: ['pbr', 'ggx', 'distribution'],
    });

    this.register('pbr.lambert', (id) => new PBRLambertNode(id), {
      category: 'PBR',
      displayName: 'Lambert',
      description: 'Lambert diffuse calculation',
      tags: ['pbr', 'lambert', 'diffuse'],
    });

    this.register('pbr.cookTorrance', (id) => new PBRCookTorranceNode(id), {
      category: 'PBR',
      displayName: 'Cook-Torrance',
      description: 'Cook-Torrance BRDF',
      tags: ['pbr', 'cook-torrance', 'brdf'],
    });
  }

  // ============================================================================
  // Utility Nodes
  // ============================================================================

  private static registerUtilityNodes(): void {
    this.register('utility.time', (id) => new UtilityTimeNode(id), {
      category: 'Utility',
      displayName: 'Time',
      description: 'Current time value',
      tags: ['utility', 'time'],
    });

    this.register('utility.viewDirection', (id) => new UtilityViewDirectionNode(id), {
      category: 'Utility',
      displayName: 'View Direction',
      description: 'Camera view direction',
      tags: ['utility', 'view', 'camera'],
    });

    this.register('utility.worldPosition', (id) => new UtilityWorldPositionNode(id), {
      category: 'Utility',
      displayName: 'World Position',
      description: 'World space position',
      tags: ['utility', 'position', 'world'],
    });

    this.register('utility.screenPosition', (id) => new UtilityScreenPositionNode(id), {
      category: 'Utility',
      displayName: 'Screen Position',
      description: 'Screen space position',
      tags: ['utility', 'position', 'screen'],
    });

    this.register('utility.constant', (id) => new UtilityConstantNode(id), {
      category: 'Utility',
      displayName: 'Constant',
      description: 'Constant value',
      tags: ['utility', 'constant', 'value'],
    });

    this.register('utility.output', (id) => new UtilityOutputNode(id), {
      category: 'Utility',
      displayName: 'Output',
      description: 'Shader output node',
      tags: ['utility', 'output'],
    });
  }
}

// ============================================================================
// Math Node Implementations
// ============================================================================

class MathAddNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.add', NodeLibrary.getMetadata('math.add')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'b', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || '0.0';
    const b = inputs.get('b') || '0.0';
    const varName = this.createVarName('add');

    const aInput = this.getInput('a')!;
    const type = aInput.type;
    context.variables.set(varName, `${type} ${varName} = ${a} + ${b};`);

    return new Map([['result', varName]]);
  }
}

class MathSubtractNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.subtract', NodeLibrary.getMetadata('math.subtract')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'b', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || '0.0';
    const b = inputs.get('b') || '0.0';
    const varName = this.createVarName('sub');

    const aInput = this.getInput('a')!;
    const type = aInput.type;
    context.variables.set(varName, `${type} ${varName} = ${a} - ${b};`);

    return new Map([['result', varName]]);
  }
}

class MathMultiplyNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.multiply', NodeLibrary.getMetadata('math.multiply')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'float', defaultValue: 1 });
    this.addInput({ name: 'b', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || '1.0';
    const b = inputs.get('b') || '1.0';
    const varName = this.createVarName('mul');

    const aInput = this.getInput('a')!;
    const type = aInput.type;
    context.variables.set(varName, `${type} ${varName} = ${a} * ${b};`);

    return new Map([['result', varName]]);
  }
}

class MathDivideNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.divide', NodeLibrary.getMetadata('math.divide')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'float', defaultValue: 1 });
    this.addInput({ name: 'b', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || '1.0';
    const b = inputs.get('b') || '1.0';
    const varName = this.createVarName('div');

    const aInput = this.getInput('a')!;
    const type = aInput.type;
    context.variables.set(varName, `${type} ${varName} = ${a} / ${b};`);

    return new Map([['result', varName]]);
  }
}

class MathPowerNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.power', NodeLibrary.getMetadata('math.power')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'base', type: 'float', defaultValue: 1 });
    this.addInput({ name: 'exponent', type: 'float', defaultValue: 2 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const base = inputs.get('base') || '1.0';
    const exp = inputs.get('exponent') || '2.0';
    const varName = this.createVarName('pow');

    const baseInput = this.getInput('base')!;
    const type = baseInput.type;
    context.variables.set(varName, `${type} ${varName} = pow(${base}, ${exp});`);

    return new Map([['result', varName]]);
  }
}

class MathSqrtNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.sqrt', NodeLibrary.getMetadata('math.sqrt')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'value', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const value = inputs.get('value') || '1.0';
    const varName = this.createVarName('sqrt');

    const input = this.getInput('value')!;
    const type = input.type;
    context.variables.set(varName, `${type} ${varName} = sqrt(${value});`);

    return new Map([['result', varName]]);
  }
}

class MathAbsNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.abs', NodeLibrary.getMetadata('math.abs')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'value', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const value = inputs.get('value') || '0.0';
    const varName = this.createVarName('abs');

    const input = this.getInput('value')!;
    const type = input.type;
    context.variables.set(varName, `${type} ${varName} = abs(${value});`);

    return new Map([['result', varName]]);
  }
}

class MathSignNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.sign', NodeLibrary.getMetadata('math.sign')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'value', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const value = inputs.get('value') || '0.0';
    const varName = this.createVarName('sign');

    const input = this.getInput('value')!;
    const type = input.type;
    context.variables.set(varName, `${type} ${varName} = sign(${value});`);

    return new Map([['result', varName]]);
  }
}

class MathFloorNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.floor', NodeLibrary.getMetadata('math.floor')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'value', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const value = inputs.get('value') || '0.0';
    const varName = this.createVarName('floor');

    const input = this.getInput('value')!;
    const type = input.type;
    context.variables.set(varName, `${type} ${varName} = floor(${value});`);

    return new Map([['result', varName]]);
  }
}

class MathCeilNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.ceil', NodeLibrary.getMetadata('math.ceil')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'value', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const value = inputs.get('value') || '0.0';
    const varName = this.createVarName('ceil');

    const input = this.getInput('value')!;
    const type = input.type;
    context.variables.set(varName, `${type} ${varName} = ceil(${value});`);

    return new Map([['result', varName]]);
  }
}

class MathFractNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.fract', NodeLibrary.getMetadata('math.fract')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'value', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const value = inputs.get('value') || '0.0';
    const varName = this.createVarName('fract');

    const input = this.getInput('value')!;
    const type = input.type;
    context.variables.set(varName, `${type} ${varName} = fract(${value});`);

    return new Map([['result', varName]]);
  }
}

class MathModNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.mod', NodeLibrary.getMetadata('math.mod')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'b', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || '0.0';
    const b = inputs.get('b') || '1.0';
    const varName = this.createVarName('mod');

    const aInput = this.getInput('a')!;
    const type = aInput.type;
    context.variables.set(varName, `${type} ${varName} = mod(${a}, ${b});`);

    return new Map([['result', varName]]);
  }
}

class MathMinNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.min', NodeLibrary.getMetadata('math.min')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'b', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || '0.0';
    const b = inputs.get('b') || '0.0';
    const varName = this.createVarName('min');

    const aInput = this.getInput('a')!;
    const type = aInput.type;
    context.variables.set(varName, `${type} ${varName} = min(${a}, ${b});`);

    return new Map([['result', varName]]);
  }
}

class MathMaxNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.max', NodeLibrary.getMetadata('math.max')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'b', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || '0.0';
    const b = inputs.get('b') || '0.0';
    const varName = this.createVarName('max');

    const aInput = this.getInput('a')!;
    const type = aInput.type;
    context.variables.set(varName, `${type} ${varName} = max(${a}, ${b});`);

    return new Map([['result', varName]]);
  }
}

class MathClampNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.clamp', NodeLibrary.getMetadata('math.clamp')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'value', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'min', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'max', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const value = inputs.get('value') || '0.0';
    const min = inputs.get('min') || '0.0';
    const max = inputs.get('max') || '1.0';
    const varName = this.createVarName('clamp');

    const valueInput = this.getInput('value')!;
    const type = valueInput.type;
    context.variables.set(varName, `${type} ${varName} = clamp(${value}, ${min}, ${max});`);

    return new Map([['result', varName]]);
  }
}

class MathLerpNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.lerp', NodeLibrary.getMetadata('math.lerp')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'b', type: 'float', defaultValue: 1 });
    this.addInput({ name: 't', type: 'float', defaultValue: 0.5 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || '0.0';
    const b = inputs.get('b') || '1.0';
    const t = inputs.get('t') || '0.5';
    const varName = this.createVarName('lerp');

    const aInput = this.getInput('a')!;
    const type = aInput.type;
    const funcName = context.target === 'glsl' ? 'mix' : 'mix';
    context.variables.set(varName, `${type} ${varName} = ${funcName}(${a}, ${b}, ${t});`);

    return new Map([['result', varName]]);
  }
}

class MathStepNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.step', NodeLibrary.getMetadata('math.step')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'edge', type: 'float', defaultValue: 0.5 });
    this.addInput({ name: 'value', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const edge = inputs.get('edge') || '0.5';
    const value = inputs.get('value') || '0.0';
    const varName = this.createVarName('step');

    const edgeInput = this.getInput('edge')!;
    const type = edgeInput.type;
    context.variables.set(varName, `${type} ${varName} = step(${edge}, ${value});`);

    return new Map([['result', varName]]);
  }
}

class MathSmoothstepNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'math.smoothstep', NodeLibrary.getMetadata('math.smoothstep')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'edge0', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'edge1', type: 'float', defaultValue: 1 });
    this.addInput({ name: 'value', type: 'float', defaultValue: 0.5 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const edge0 = inputs.get('edge0') || '0.0';
    const edge1 = inputs.get('edge1') || '1.0';
    const value = inputs.get('value') || '0.5';
    const varName = this.createVarName('smoothstep');

    const edge0Input = this.getInput('edge0')!;
    const type = edge0Input.type;
    context.variables.set(varName, `${type} ${varName} = smoothstep(${edge0}, ${edge1}, ${value});`);

    return new Map([['result', varName]]);
  }
}

// ============================================================================
// Vector Node Implementations
// ============================================================================

class VectorSplitNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'vector.split', NodeLibrary.getMetadata('vector.split')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'vector', type: 'vec4', defaultValue: [0, 0, 0, 0] });
    this.addOutput({ name: 'x', type: 'float' });
    this.addOutput({ name: 'y', type: 'float' });
    this.addOutput({ name: 'z', type: 'float' });
    this.addOutput({ name: 'w', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const vector = inputs.get('vector') || 'vec4(0.0)';
    const outputs = new Map<string, string>();

    const xVar = this.createVarName('x');
    const yVar = this.createVarName('y');
    const zVar = this.createVarName('z');
    const wVar = this.createVarName('w');

    context.variables.set(xVar, `float ${xVar} = ${vector}.x;`);
    context.variables.set(yVar, `float ${yVar} = ${vector}.y;`);
    context.variables.set(zVar, `float ${zVar} = ${vector}.z;`);
    context.variables.set(wVar, `float ${wVar} = ${vector}.w;`);

    outputs.set('x', xVar);
    outputs.set('y', yVar);
    outputs.set('z', zVar);
    outputs.set('w', wVar);

    return outputs;
  }
}

class VectorCombineNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'vector.combine', NodeLibrary.getMetadata('vector.combine')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'x', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'y', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'z', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'w', type: 'float', defaultValue: 0 });
    this.addOutput({ name: 'vector', type: 'vec4' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const x = inputs.get('x') || '0.0';
    const y = inputs.get('y') || '0.0';
    const z = inputs.get('z') || '0.0';
    const w = inputs.get('w') || '0.0';
    const varName = this.createVarName('combine');

    context.variables.set(varName, `vec4 ${varName} = vec4(${x}, ${y}, ${z}, ${w});`);

    return new Map([['vector', varName]]);
  }
}

class VectorNormalizeNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'vector.normalize', NodeLibrary.getMetadata('vector.normalize')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'vector', type: 'vec3', defaultValue: [0, 0, 1] });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const vector = inputs.get('vector') || 'vec3(0.0, 0.0, 1.0)';
    const varName = this.createVarName('normalize');

    const input = this.getInput('vector')!;
    const type = input.type;
    context.variables.set(varName, `${type} ${varName} = normalize(${vector});`);

    return new Map([['result', varName]]);
  }
}

class VectorDotNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'vector.dot', NodeLibrary.getMetadata('vector.dot')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'vec3', defaultValue: [0, 0, 0] });
    this.addInput({ name: 'b', type: 'vec3', defaultValue: [0, 0, 0] });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || 'vec3(0.0)';
    const b = inputs.get('b') || 'vec3(0.0)';
    const varName = this.createVarName('dot');

    context.variables.set(varName, `float ${varName} = dot(${a}, ${b});`);

    return new Map([['result', varName]]);
  }
}

class VectorCrossNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'vector.cross', NodeLibrary.getMetadata('vector.cross')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'vec3', defaultValue: [1, 0, 0] });
    this.addInput({ name: 'b', type: 'vec3', defaultValue: [0, 1, 0] });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || 'vec3(1.0, 0.0, 0.0)';
    const b = inputs.get('b') || 'vec3(0.0, 1.0, 0.0)';
    const varName = this.createVarName('cross');

    context.variables.set(varName, `vec3 ${varName} = cross(${a}, ${b});`);

    return new Map([['result', varName]]);
  }
}

class VectorLengthNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'vector.length', NodeLibrary.getMetadata('vector.length')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'vector', type: 'vec3', defaultValue: [0, 0, 0] });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const vector = inputs.get('vector') || 'vec3(0.0)';
    const varName = this.createVarName('length');

    context.variables.set(varName, `float ${varName} = length(${vector});`);

    return new Map([['result', varName]]);
  }
}

class VectorDistanceNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'vector.distance', NodeLibrary.getMetadata('vector.distance')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'a', type: 'vec3', defaultValue: [0, 0, 0] });
    this.addInput({ name: 'b', type: 'vec3', defaultValue: [0, 0, 0] });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const a = inputs.get('a') || 'vec3(0.0)';
    const b = inputs.get('b') || 'vec3(0.0)';
    const varName = this.createVarName('distance');

    context.variables.set(varName, `float ${varName} = distance(${a}, ${b});`);

    return new Map([['result', varName]]);
  }
}

class VectorReflectNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'vector.reflect', NodeLibrary.getMetadata('vector.reflect')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'incident', type: 'vec3', defaultValue: [0, 0, -1] });
    this.addInput({ name: 'normal', type: 'vec3', defaultValue: [0, 0, 1] });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const incident = inputs.get('incident') || 'vec3(0.0, 0.0, -1.0)';
    const normal = inputs.get('normal') || 'vec3(0.0, 0.0, 1.0)';
    const varName = this.createVarName('reflect');

    context.variables.set(varName, `vec3 ${varName} = reflect(${incident}, ${normal});`);

    return new Map([['result', varName]]);
  }
}

class VectorRefractNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'vector.refract', NodeLibrary.getMetadata('vector.refract')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'incident', type: 'vec3', defaultValue: [0, 0, -1] });
    this.addInput({ name: 'normal', type: 'vec3', defaultValue: [0, 0, 1] });
    this.addInput({ name: 'eta', type: 'float', defaultValue: 0.67 });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const incident = inputs.get('incident') || 'vec3(0.0, 0.0, -1.0)';
    const normal = inputs.get('normal') || 'vec3(0.0, 0.0, 1.0)';
    const eta = inputs.get('eta') || '0.67';
    const varName = this.createVarName('refract');

    context.variables.set(varName, `vec3 ${varName} = refract(${incident}, ${normal}, ${eta});`);

    return new Map([['result', varName]]);
  }
}

// ============================================================================
// Texture Node Implementations
// ============================================================================

class TextureSample2DNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'texture.sample2D', NodeLibrary.getMetadata('texture.sample2D')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'texture', type: 'sampler2D' });
    this.addInput({ name: 'uv', type: 'vec2', defaultValue: [0, 0] });
    this.addOutput({ name: 'rgba', type: 'vec4' });
    this.addOutput({ name: 'rgb', type: 'vec3' });
    this.addOutput({ name: 'a', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const texture = inputs.get('texture') || 'sampler2D(0)';
    const uv = inputs.get('uv') || 'vec2(0.0)';
    const varName = this.createVarName('tex2D');

    const funcName = context.target === 'glsl' ? 'texture' : 'textureSample';
    context.variables.set(varName, `vec4 ${varName} = ${funcName}(${texture}, ${uv});`);

    const rgbVar = this.createVarName('rgb');
    const aVar = this.createVarName('a');

    context.variables.set(rgbVar, `vec3 ${rgbVar} = ${varName}.rgb;`);
    context.variables.set(aVar, `float ${aVar} = ${varName}.a;`);

    const outputs = new Map<string, string>();
    outputs.set('rgba', varName);
    outputs.set('rgb', rgbVar);
    outputs.set('a', aVar);

    return outputs;
  }
}

class TextureSampleCubeNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'texture.sampleCube', NodeLibrary.getMetadata('texture.sampleCube')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'texture', type: 'samplerCube' });
    this.addInput({ name: 'direction', type: 'vec3', defaultValue: [0, 0, 1] });
    this.addOutput({ name: 'rgba', type: 'vec4' });
    this.addOutput({ name: 'rgb', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const texture = inputs.get('texture') || 'samplerCube(0)';
    const direction = inputs.get('direction') || 'vec3(0.0, 0.0, 1.0)';
    const varName = this.createVarName('texCube');

    const funcName = context.target === 'glsl' ? 'texture' : 'textureSample';
    context.variables.set(varName, `vec4 ${varName} = ${funcName}(${texture}, ${direction});`);

    const rgbVar = this.createVarName('rgb');
    context.variables.set(rgbVar, `vec3 ${rgbVar} = ${varName}.rgb;`);

    const outputs = new Map<string, string>();
    outputs.set('rgba', varName);
    outputs.set('rgb', rgbVar);

    return outputs;
  }
}

class TextureSampleNormalNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'texture.sampleNormal', NodeLibrary.getMetadata('texture.sampleNormal')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'texture', type: 'sampler2D' });
    this.addInput({ name: 'uv', type: 'vec2', defaultValue: [0, 0] });
    this.addInput({ name: 'strength', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'normal', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const texture = inputs.get('texture') || 'sampler2D(0)';
    const uv = inputs.get('uv') || 'vec2(0.0)';
    const strength = inputs.get('strength') || '1.0';
    const varName = this.createVarName('normal');

    const funcName = context.target === 'glsl' ? 'texture' : 'textureSample';
    const tmpVar = this.createVarName('normalSample');

    context.variables.set(tmpVar, `vec3 ${tmpVar} = ${funcName}(${texture}, ${uv}).rgb;`);
    context.variables.set(varName,
      `vec3 ${varName} = normalize(${tmpVar} * 2.0 - 1.0) * vec3(${strength}, ${strength}, 1.0);`
    );

    return new Map([['normal', varName]]);
  }
}

class TextureTriplanarNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'texture.triplanar', NodeLibrary.getMetadata('texture.triplanar')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'texture', type: 'sampler2D' });
    this.addInput({ name: 'position', type: 'vec3', defaultValue: [0, 0, 0] });
    this.addInput({ name: 'normal', type: 'vec3', defaultValue: [0, 0, 1] });
    this.addInput({ name: 'scale', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'rgba', type: 'vec4' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const texture = inputs.get('texture') || 'sampler2D(0)';
    const position = inputs.get('position') || 'vec3(0.0)';
    const normal = inputs.get('normal') || 'vec3(0.0, 0.0, 1.0)';
    const scale = inputs.get('scale') || '1.0';
    const varName = this.createVarName('triplanar');

    const funcName = context.target === 'glsl' ? 'texture' : 'textureSample';

    const weightsVar = this.createVarName('weights');
    const xVar = this.createVarName('x');
    const yVar = this.createVarName('y');
    const zVar = this.createVarName('z');

    context.variables.set(weightsVar, `vec3 ${weightsVar} = abs(${normal});`);
    context.variables.set(weightsVar + '_norm', `${weightsVar} = ${weightsVar} / (${weightsVar}.x + ${weightsVar}.y + ${weightsVar}.z);`);

    context.variables.set(xVar, `vec4 ${xVar} = ${funcName}(${texture}, ${position}.yz * ${scale});`);
    context.variables.set(yVar, `vec4 ${yVar} = ${funcName}(${texture}, ${position}.xz * ${scale});`);
    context.variables.set(zVar, `vec4 ${zVar} = ${funcName}(${texture}, ${position}.xy * ${scale});`);

    context.variables.set(varName,
      `vec4 ${varName} = ${xVar} * ${weightsVar}.x + ${yVar} * ${weightsVar}.y + ${zVar} * ${weightsVar}.z;`
    );

    return new Map([['rgba', varName]]);
  }
}

// ============================================================================
// UV Node Implementations
// ============================================================================

class UVTilingOffsetNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'uv.tilingOffset', NodeLibrary.getMetadata('uv.tilingOffset')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'uv', type: 'vec2', defaultValue: [0, 0] });
    this.addInput({ name: 'tiling', type: 'vec2', defaultValue: [1, 1] });
    this.addInput({ name: 'offset', type: 'vec2', defaultValue: [0, 0] });
    this.addOutput({ name: 'result', type: 'vec2' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const uv = inputs.get('uv') || 'vec2(0.0)';
    const tiling = inputs.get('tiling') || 'vec2(1.0)';
    const offset = inputs.get('offset') || 'vec2(0.0)';
    const varName = this.createVarName('uv');

    context.variables.set(varName, `vec2 ${varName} = ${uv} * ${tiling} + ${offset};`);

    return new Map([['result', varName]]);
  }
}

class UVRotateNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'uv.rotate', NodeLibrary.getMetadata('uv.rotate')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'uv', type: 'vec2', defaultValue: [0, 0] });
    this.addInput({ name: 'angle', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'center', type: 'vec2', defaultValue: [0.5, 0.5] });
    this.addOutput({ name: 'result', type: 'vec2' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const uv = inputs.get('uv') || 'vec2(0.0)';
    const angle = inputs.get('angle') || '0.0';
    const center = inputs.get('center') || 'vec2(0.5)';
    const varName = this.createVarName('uvRotated');

    const cosVar = this.createVarName('cosAngle');
    const sinVar = this.createVarName('sinAngle');
    const translatedVar = this.createVarName('translated');

    context.variables.set(cosVar, `float ${cosVar} = cos(${angle});`);
    context.variables.set(sinVar, `float ${sinVar} = sin(${angle});`);
    context.variables.set(translatedVar, `vec2 ${translatedVar} = ${uv} - ${center};`);
    context.variables.set(varName,
      `vec2 ${varName} = vec2(${translatedVar}.x * ${cosVar} - ${translatedVar}.y * ${sinVar}, ${translatedVar}.x * ${sinVar} + ${translatedVar}.y * ${cosVar}) + ${center};`
    );

    return new Map([['result', varName]]);
  }
}

class UVParallaxNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'uv.parallax', NodeLibrary.getMetadata('uv.parallax')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'uv', type: 'vec2', defaultValue: [0, 0] });
    this.addInput({ name: 'heightMap', type: 'sampler2D' });
    this.addInput({ name: 'viewDir', type: 'vec3', defaultValue: [0, 0, 1] });
    this.addInput({ name: 'scale', type: 'float', defaultValue: 0.1 });
    this.addOutput({ name: 'result', type: 'vec2' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const uv = inputs.get('uv') || 'vec2(0.0)';
    const heightMap = inputs.get('heightMap') || 'sampler2D(0)';
    const viewDir = inputs.get('viewDir') || 'vec3(0.0, 0.0, 1.0)';
    const scale = inputs.get('scale') || '0.1';
    const varName = this.createVarName('parallaxUV');

    const funcName = context.target === 'glsl' ? 'texture' : 'textureSample';
    const heightVar = this.createVarName('height');

    context.variables.set(heightVar, `float ${heightVar} = ${funcName}(${heightMap}, ${uv}).r;`);
    context.variables.set(varName,
      `vec2 ${varName} = ${uv} - ${viewDir}.xy * (${heightVar} * ${scale});`
    );

    return new Map([['result', varName]]);
  }
}

// ============================================================================
// Color Node Implementations
// ============================================================================

class ColorHSVNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'color.hsv', NodeLibrary.getMetadata('color.hsv')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'color', type: 'vec3', defaultValue: [1, 1, 1] });
    this.addInput({ name: 'hue', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'saturation', type: 'float', defaultValue: 1 });
    this.addInput({ name: 'value', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const color = inputs.get('color') || 'vec3(1.0)';
    const hue = inputs.get('hue') || '0.0';
    const saturation = inputs.get('saturation') || '1.0';
    const value = inputs.get('value') || '1.0';
    const varName = this.createVarName('hsvAdjusted');

    // Add HSV conversion functions
    const funcName = 'rgb2hsv_' + this.id.replace(/-/g, '_');
    const func2Name = 'hsv2rgb_' + this.id.replace(/-/g, '_');

    if (!context.functions.has(funcName)) {
      context.functions.add(funcName);
      context.functions.add(func2Name);
    }

    const hsvVar = this.createVarName('hsv');
    context.variables.set(hsvVar, `vec3 ${hsvVar} = ${funcName}(${color});`);
    context.variables.set(hsvVar + '_adj',
      `${hsvVar} = vec3(${hsvVar}.x + ${hue}, ${hsvVar}.y * ${saturation}, ${hsvVar}.z * ${value});`
    );
    context.variables.set(varName, `vec3 ${varName} = ${func2Name}(${hsvVar});`);

    return new Map([['result', varName]]);
  }
}

class ColorContrastNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'color.contrast', NodeLibrary.getMetadata('color.contrast')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'color', type: 'vec3', defaultValue: [0.5, 0.5, 0.5] });
    this.addInput({ name: 'contrast', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const color = inputs.get('color') || 'vec3(0.5)';
    const contrast = inputs.get('contrast') || '1.0';
    const varName = this.createVarName('contrast');

    context.variables.set(varName,
      `vec3 ${varName} = (${color} - 0.5) * ${contrast} + 0.5;`
    );

    return new Map([['result', varName]]);
  }
}

class ColorSaturationNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'color.saturation', NodeLibrary.getMetadata('color.saturation')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'color', type: 'vec3', defaultValue: [1, 1, 1] });
    this.addInput({ name: 'saturation', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const color = inputs.get('color') || 'vec3(1.0)';
    const saturation = inputs.get('saturation') || '1.0';
    const varName = this.createVarName('saturated');

    const lumVar = this.createVarName('lum');
    context.variables.set(lumVar, `float ${lumVar} = dot(${color}, vec3(0.299, 0.587, 0.114));`);
    context.variables.set(varName,
      `vec3 ${varName} = mix(vec3(${lumVar}), ${color}, ${saturation});`
    );

    return new Map([['result', varName]]);
  }
}

class ColorBlendNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'color.blend', NodeLibrary.getMetadata('color.blend')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'base', type: 'vec3', defaultValue: [1, 1, 1] });
    this.addInput({ name: 'blend', type: 'vec3', defaultValue: [1, 1, 1] });
    this.addInput({ name: 'alpha', type: 'float', defaultValue: 0.5 });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const base = inputs.get('base') || 'vec3(1.0)';
    const blend = inputs.get('blend') || 'vec3(1.0)';
    const alpha = inputs.get('alpha') || '0.5';
    const varName = this.createVarName('blended');

    context.variables.set(varName, `vec3 ${varName} = mix(${base}, ${blend}, ${alpha});`);

    return new Map([['result', varName]]);
  }
}

// ============================================================================
// PBR Node Implementations
// ============================================================================

class PBRFresnelNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'pbr.fresnel', NodeLibrary.getMetadata('pbr.fresnel')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'F0', type: 'vec3', defaultValue: [0.04, 0.04, 0.04] });
    this.addInput({ name: 'VdotH', type: 'float', defaultValue: 1 });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const F0 = inputs.get('F0') || 'vec3(0.04)';
    const VdotH = inputs.get('VdotH') || '1.0';
    const varName = this.createVarName('fresnel');

    context.variables.set(varName,
      `vec3 ${varName} = ${F0} + (1.0 - ${F0}) * pow(1.0 - ${VdotH}, 5.0);`
    );

    return new Map([['result', varName]]);
  }
}

class PBRGGXNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'pbr.ggx', NodeLibrary.getMetadata('pbr.ggx')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'NdotH', type: 'float', defaultValue: 1 });
    this.addInput({ name: 'roughness', type: 'float', defaultValue: 0.5 });
    this.addOutput({ name: 'result', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const NdotH = inputs.get('NdotH') || '1.0';
    const roughness = inputs.get('roughness') || '0.5';
    const varName = this.createVarName('ggx');

    const a2Var = this.createVarName('a2');
    const denomVar = this.createVarName('denom');

    context.variables.set(a2Var, `float ${a2Var} = ${roughness} * ${roughness};`);
    context.variables.set(denomVar,
      `float ${denomVar} = ${NdotH} * ${NdotH} * (${a2Var} - 1.0) + 1.0;`
    );
    context.variables.set(varName,
      `float ${varName} = ${a2Var} / (3.14159265359 * ${denomVar} * ${denomVar});`
    );

    return new Map([['result', varName]]);
  }
}

class PBRLambertNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'pbr.lambert', NodeLibrary.getMetadata('pbr.lambert')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'NdotL', type: 'float', defaultValue: 1 });
    this.addInput({ name: 'albedo', type: 'vec3', defaultValue: [1, 1, 1] });
    this.addOutput({ name: 'result', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const NdotL = inputs.get('NdotL') || '1.0';
    const albedo = inputs.get('albedo') || 'vec3(1.0)';
    const varName = this.createVarName('lambert');

    context.variables.set(varName,
      `vec3 ${varName} = ${albedo} * max(${NdotL}, 0.0) / 3.14159265359;`
    );

    return new Map([['result', varName]]);
  }
}

class PBRCookTorranceNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'pbr.cookTorrance', NodeLibrary.getMetadata('pbr.cookTorrance')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'normal', type: 'vec3', defaultValue: [0, 0, 1] });
    this.addInput({ name: 'viewDir', type: 'vec3', defaultValue: [0, 0, 1] });
    this.addInput({ name: 'lightDir', type: 'vec3', defaultValue: [0, 1, 1] });
    this.addInput({ name: 'roughness', type: 'float', defaultValue: 0.5 });
    this.addInput({ name: 'F0', type: 'vec3', defaultValue: [0.04, 0.04, 0.04] });
    this.addOutput({ name: 'specular', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const normal = inputs.get('normal') || 'vec3(0.0, 0.0, 1.0)';
    const viewDir = inputs.get('viewDir') || 'vec3(0.0, 0.0, 1.0)';
    const lightDir = inputs.get('lightDir') || 'vec3(0.0, 1.0, 1.0)';
    const roughness = inputs.get('roughness') || '0.5';
    const F0 = inputs.get('F0') || 'vec3(0.04)';
    const varName = this.createVarName('cookTorrance');

    // Simplified Cook-Torrance
    const HVar = this.createVarName('H');
    const NdotHVar = this.createVarName('NdotH');
    const VdotHVar = this.createVarName('VdotH');
    const NdotVVar = this.createVarName('NdotV');
    const NdotLVar = this.createVarName('NdotL');

    context.variables.set(HVar, `vec3 ${HVar} = normalize(${viewDir} + ${lightDir});`);
    context.variables.set(NdotHVar, `float ${NdotHVar} = max(dot(${normal}, ${HVar}), 0.0);`);
    context.variables.set(VdotHVar, `float ${VdotHVar} = max(dot(${viewDir}, ${HVar}), 0.0);`);
    context.variables.set(NdotVVar, `float ${NdotVVar} = max(dot(${normal}, ${viewDir}), 0.0);`);
    context.variables.set(NdotLVar, `float ${NdotLVar} = max(dot(${normal}, ${lightDir}), 0.0);`);

    const DVar = this.createVarName('D');
    const FVar = this.createVarName('F');
    const denomVar = this.createVarName('denom');

    context.variables.set(DVar,
      `float ${DVar} = ${roughness} * ${roughness} / (3.14159265359 * pow(${NdotHVar} * ${NdotHVar} * (${roughness} * ${roughness} - 1.0) + 1.0, 2.0));`
    );
    context.variables.set(FVar,
      `vec3 ${FVar} = ${F0} + (1.0 - ${F0}) * pow(1.0 - ${VdotHVar}, 5.0);`
    );
    context.variables.set(denomVar,
      `float ${denomVar} = 4.0 * ${NdotVVar} * ${NdotLVar} + 0.0001;`
    );
    context.variables.set(varName,
      `vec3 ${varName} = ${DVar} * ${FVar} / ${denomVar};`
    );

    return new Map([['specular', varName]]);
  }
}

// ============================================================================
// Utility Node Implementations
// ============================================================================

class UtilityTimeNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'utility.time', NodeLibrary.getMetadata('utility.time')!);
  }

  protected initializePorts(): void {
    this.addOutput({ name: 'time', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    // Add uniform declaration
    context.uniforms.set('u_time', { type: 'float' });

    return new Map([['time', 'u_time']]);
  }
}

class UtilityViewDirectionNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'utility.viewDirection', NodeLibrary.getMetadata('utility.viewDirection')!);
  }

  protected initializePorts(): void {
    this.addOutput({ name: 'direction', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    // Assume these are available in the shader
    return new Map([['direction', 'v_viewDirection']]);
  }
}

class UtilityWorldPositionNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'utility.worldPosition', NodeLibrary.getMetadata('utility.worldPosition')!);
  }

  protected initializePorts(): void {
    this.addOutput({ name: 'position', type: 'vec3' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    return new Map([['position', 'v_worldPosition']]);
  }
}

class UtilityScreenPositionNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'utility.screenPosition', NodeLibrary.getMetadata('utility.screenPosition')!);
  }

  protected initializePorts(): void {
    this.addOutput({ name: 'position', type: 'vec2' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    return new Map([['position', 'gl_FragCoord.xy']]);
  }
}

class UtilityConstantNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'utility.constant', NodeLibrary.getMetadata('utility.constant')!);
    this.setProperty('valueType', 'float');
    this.setProperty('value', 0);
  }

  protected initializePorts(): void {
    this.addOutput({ name: 'value', type: 'float' });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    const valueType = this.getProperty('valueType') || 'float';
    const value = this.getProperty('value') || 0;
    const varName = this.createVarName('constant');

    const codeValue = this.valueToCode(value, valueType as ShaderType, context);
    context.variables.set(varName, `${valueType} ${varName} = ${codeValue};`);

    return new Map([['value', varName]]);
  }
}

class UtilityOutputNode extends ShaderNode {
  constructor(id: string) {
    super(id, 'utility.output', NodeLibrary.getMetadata('utility.output')!);
  }

  protected initializePorts(): void {
    this.addInput({ name: 'albedo', type: 'vec3', defaultValue: [1, 1, 1] });
    this.addInput({ name: 'normal', type: 'vec3', defaultValue: [0, 0, 1] });
    this.addInput({ name: 'metallic', type: 'float', defaultValue: 0 });
    this.addInput({ name: 'roughness', type: 'float', defaultValue: 0.5 });
    this.addInput({ name: 'emissive', type: 'vec3', defaultValue: [0, 0, 0] });
    this.addInput({ name: 'alpha', type: 'float', defaultValue: 1 });
  }

  public generateCode(context: CodeGenContext, inputs: Map<string, string>): Map<string, string> {
    // Output node doesn't generate code, it's used to identify final outputs
    return new Map();
  }
}
