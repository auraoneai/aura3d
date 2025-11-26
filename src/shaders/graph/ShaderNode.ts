/**
 * @fileoverview Base class and interfaces for shader graph nodes
 * @module shaders/graph/ShaderNode
 */

/**
 * Supported shader data types
 */
export type ShaderType =
  | 'float'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'mat3'
  | 'mat4'
  | 'sampler2D'
  | 'samplerCube'
  | 'int'
  | 'bool';

/**
 * Shader type component counts
 */
const TYPE_COMPONENTS: Record<ShaderType, number> = {
  float: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
  mat3: 9,
  mat4: 16,
  sampler2D: 0,
  samplerCube: 0,
  int: 1,
  bool: 1,
};

/**
 * Node input port definition
 */
export interface NodeInput {
  /** Unique name for this input */
  name: string;
  /** Data type expected */
  type: ShaderType;
  /** Default value when not connected */
  defaultValue?: any;
  /** Connected edge ID if any */
  connection?: string;
  /** Human-readable label */
  label?: string;
  /** Input constraints */
  constraints?: {
    min?: number;
    max?: number;
    options?: string[];
  };
}

/**
 * Node output port definition
 */
export interface NodeOutput {
  /** Unique name for this output */
  name: string;
  /** Data type produced */
  type: ShaderType;
  /** Human-readable label */
  label?: string;
}

/**
 * Code generation context
 */
export interface CodeGenContext {
  /** Target shader language */
  target: 'glsl' | 'wgsl';
  /** Current indentation level */
  indent: number;
  /** Generated variable declarations */
  variables: Map<string, string>;
  /** Generated function definitions */
  functions: Set<string>;
  /** Uniform declarations */
  uniforms: Map<string, { type: ShaderType; binding?: number }>;
  /** Texture bindings */
  textures: Map<string, { type: 'sampler2D' | 'samplerCube'; binding: number }>;
  /** Current shader stage */
  stage: 'vertex' | 'fragment';
}

/**
 * Node metadata
 */
export interface NodeMetadata {
  /** Node category for organization */
  category: string;
  /** Display name */
  displayName: string;
  /** Description of node functionality */
  description: string;
  /** Tags for searching */
  tags?: string[];
}

/**
 * Base class for all shader graph nodes
 */
export abstract class ShaderNode {
  /** Unique node identifier */
  public readonly id: string;

  /** Node type identifier */
  public readonly type: string;

  /** Input ports */
  public readonly inputs: Map<string, NodeInput>;

  /** Output ports */
  public readonly outputs: Map<string, NodeOutput>;

  /** Node metadata */
  public readonly metadata: NodeMetadata;

  /** Visual position in graph editor */
  public position: { x: number; y: number };

  /** Custom node properties */
  protected properties: Map<string, any>;

  /**
   * Creates a new shader node
   * @param id - Unique identifier
   * @param type - Node type
   * @param metadata - Node metadata
   */
  constructor(id: string, type: string, metadata: NodeMetadata) {
    this.id = id;
    this.type = type;
    this.metadata = metadata;
    this.inputs = new Map();
    this.outputs = new Map();
    this.position = { x: 0, y: 0 };
    this.properties = new Map();

    this.initializePorts();
  }

  /**
   * Initialize input and output ports
   * Must be implemented by derived classes
   */
  protected abstract initializePorts(): void;

  /**
   * Generate shader code for this node
   * @param context - Code generation context
   * @param inputValues - Map of input names to their resolved values (variable names or constants)
   * @returns Map of output names to their generated variable names
   */
  public abstract generateCode(
    context: CodeGenContext,
    inputValues: Map<string, string>
  ): Map<string, string>;

  /**
   * Adds an input port
   * @param input - Input port definition
   */
  protected addInput(input: NodeInput): void {
    this.inputs.set(input.name, input);
  }

  /**
   * Adds an output port
   * @param output - Output port definition
   */
  protected addOutput(output: NodeOutput): void {
    this.outputs.set(output.name, output);
  }

  /**
   * Gets an input port by name
   * @param name - Input name
   * @returns Input definition or undefined
   */
  public getInput(name: string): NodeInput | undefined {
    return this.inputs.get(name);
  }

  /**
   * Gets an output port by name
   * @param name - Output name
   * @returns Output definition or undefined
   */
  public getOutput(name: string): NodeOutput | undefined {
    return this.outputs.get(name);
  }

  /**
   * Sets a property value
   * @param name - Property name
   * @param value - Property value
   */
  public setProperty(name: string, value: any): void {
    this.properties.set(name, value);
  }

  /**
   * Gets a property value
   * @param name - Property name
   * @returns Property value or undefined
   */
  public getProperty(name: string): any {
    return this.properties.get(name);
  }

  /**
   * Validates the node configuration
   * @returns Array of validation error messages
   */
  public validate(): string[] {
    const errors: string[] = [];

    // Check required inputs are connected
    for (const [name, input] of this.inputs) {
      if (!input.connection && input.defaultValue === undefined) {
        errors.push(`Input '${name}' requires a connection or default value`);
      }
    }

    return errors;
  }

  /**
   * Creates a unique variable name for this node
   * @param suffix - Optional suffix
   * @returns Unique variable name
   */
  protected createVarName(suffix: string = 'out'): string {
    return `node_${this.id.replace(/-/g, '_')}_${suffix}`;
  }

  /**
   * Generates indentation string
   * @param context - Code generation context
   * @returns Indentation string
   */
  protected indent(context: CodeGenContext): string {
    return '  '.repeat(context.indent);
  }

  /**
   * Converts a value to shader code representation
   * @param value - Value to convert
   * @param type - Target shader type
   * @param context - Code generation context
   * @returns Shader code string
   */
  protected valueToCode(value: any, type: ShaderType, context: CodeGenContext): string {
    if (value === undefined || value === null) {
      return this.defaultValueForType(type, context);
    }

    switch (type) {
      case 'float':
        return `${Number(value).toFixed(6)}`;
      case 'int':
        return `${Math.floor(Number(value))}`;
      case 'bool':
        return context.target === 'glsl' ? (value ? 'true' : 'false') : (value ? 'true' : 'false');
      case 'vec2':
        if (Array.isArray(value)) {
          return `vec2(${value[0]}, ${value[1]})`;
        }
        return `vec2(${value})`;
      case 'vec3':
        if (Array.isArray(value)) {
          return `vec3(${value[0]}, ${value[1]}, ${value[2]})`;
        }
        return `vec3(${value})`;
      case 'vec4':
        if (Array.isArray(value)) {
          return `vec4(${value[0]}, ${value[1]}, ${value[2]}, ${value[3]})`;
        }
        return `vec4(${value})`;
      default:
        return this.defaultValueForType(type, context);
    }
  }

  /**
   * Gets default value for a shader type
   * @param type - Shader type
   * @param context - Code generation context
   * @returns Default value as code string
   */
  protected defaultValueForType(type: ShaderType, context: CodeGenContext): string {
    switch (type) {
      case 'float':
        return '0.0';
      case 'int':
        return '0';
      case 'bool':
        return 'false';
      case 'vec2':
        return 'vec2(0.0)';
      case 'vec3':
        return 'vec3(0.0)';
      case 'vec4':
        return 'vec4(0.0)';
      case 'mat3':
        return 'mat3(1.0)';
      case 'mat4':
        return 'mat4(1.0)';
      default:
        return 'vec3(0.0)';
    }
  }

  /**
   * Infers output types based on input types
   * Override in derived classes for dynamic type inference
   * @param inputTypes - Map of input names to their resolved types
   * @returns Map of output names to their inferred types
   */
  public inferOutputTypes(inputTypes: Map<string, ShaderType>): Map<string, ShaderType> {
    const outputTypes = new Map<string, ShaderType>();
    for (const [name, output] of this.outputs) {
      outputTypes.set(name, output.type);
    }
    return outputTypes;
  }

  /**
   * Serializes node to JSON
   * @returns Serialized node data
   */
  public serialize(): any {
    return {
      id: this.id,
      type: this.type,
      position: { ...this.position },
      inputs: Array.from(this.inputs.entries()).map(([name, input]) => ({
        name,
        type: input.type,
        defaultValue: input.defaultValue,
        connection: input.connection,
      })),
      outputs: Array.from(this.outputs.entries()).map(([name, output]) => ({
        name,
        type: output.type,
      })),
      properties: Array.from(this.properties.entries()),
    };
  }

  /**
   * Deserializes node data
   * @param data - Serialized node data
   */
  public deserialize(data: any): void {
    if (data.position) {
      this.position = { ...data.position };
    }

    if (data.properties) {
      this.properties = new Map(data.properties);
    }

    // Update input connections and default values
    if (data.inputs) {
      for (const inputData of data.inputs) {
        const input = this.inputs.get(inputData.name);
        if (input) {
          if (inputData.defaultValue !== undefined) {
            input.defaultValue = inputData.defaultValue;
          }
          if (inputData.connection !== undefined) {
            input.connection = inputData.connection;
          }
        }
      }
    }
  }

  /**
   * Gets the number of components for a shader type
   * @param type - Shader type
   * @returns Number of components
   */
  protected getTypeComponents(type: ShaderType): number {
    return TYPE_COMPONENTS[type] || 1;
  }

  /**
   * Checks if a type can be implicitly converted to another
   * @param from - Source type
   * @param to - Target type
   * @returns True if conversion is possible
   */
  public static canConvertType(from: ShaderType, to: ShaderType): boolean {
    if (from === to) return true;

    // Float can be converted to any vector type
    if (from === 'float' && (to === 'vec2' || to === 'vec3' || to === 'vec4')) {
      return true;
    }

    // Smaller vectors can be converted to larger ones (with padding)
    if (from === 'vec2' && (to === 'vec3' || to === 'vec4')) {
      return true;
    }
    if (from === 'vec3' && to === 'vec4') {
      return true;
    }

    return false;
  }
}
