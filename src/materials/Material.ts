/**
 * G3D 5.0 Material System
 * Base Material Class - Foundation for all materials in G3D
 *
 * @module materials/Material
 * @implements PRD Section 7.1.1
 */

import type { RenderDevice } from '../rendering/RenderDevice';
import type { RenderContext } from '../rendering/RenderContext';

/**
 * Shader program descriptor for material shaders.
 */
export interface ShaderProgram {
  id: string;
  vertexSource: string;
  fragmentSource: string;
  uniforms: { name: string; type: string }[];
  attributes: { name: string; type: string; location: number }[];
}

/**
 * Render queue priorities determining draw order
 */
export enum RenderQueue {
  BACKGROUND = 1000,
  OPAQUE = 2000,
  TRANSPARENT = 3000,
  OVERLAY = 4000
}

/**
 * Blend modes for transparency and compositing
 */
export enum BlendMode {
  OPAQUE = 'opaque',
  ALPHA = 'alpha',
  ADDITIVE = 'additive',
  MULTIPLY = 'multiply',
  PREMULTIPLIED = 'premultiplied'
}

/**
 * Face culling modes
 */
export enum CullMode {
  NONE = 'none',
  FRONT = 'front',
  BACK = 'back'
}

/**
 * Material parameter types
 */
export type MaterialParameterType =
  | 'float'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'mat3'
  | 'mat4'
  | 'texture2d'
  | 'textureCube'
  | 'color'
  | 'int'
  | 'bool';

/**
 * Material parameter descriptor with metadata
 */
export interface MaterialParameter {
  name: string;
  type: MaterialParameterType;
  defaultValue: any;
  range?: [number, number];
  description?: string;
  uniform?: boolean;
  texture?: boolean;
}

/**
 * WebGPU bind group (or WebGL equivalent)
 */
export interface GPUBindGroup {
  webgpu?: any; // GPUBindGroup
  webgl?: any; // WebGL uniform locations
}

/**
 * Material identifier
 */
let materialIdCounter = 0;

/**
 * Base class for all materials in G3D
 * Provides shader access, parameter management, render state, and binding
 */
export abstract class Material {
  /**
   * Unique material identifier
   */
  readonly id: string;

  /**
   * Human-readable material name
   */
  name: string;

  /**
   * Render queue priority (determines draw order)
   */
  renderQueue: RenderQueue = RenderQueue.OPAQUE;

  /**
   * Blend mode for transparency
   */
  blendMode: BlendMode = BlendMode.OPAQUE;

  /**
   * Face culling mode
   */
  cullMode: CullMode = CullMode.BACK;

  /**
   * Enable depth testing
   */
  depthTest: boolean = true;

  /**
   * Enable depth writing
   */
  depthWrite: boolean = true;

  /**
   * Material parameters storage
   * @private
   */
  protected parameters: Map<string, any> = new Map();

  /**
   * Dirty flag for rebinding optimization
   * @private
   */
  protected dirty: boolean = true;

  /**
   * Cached bind group
   * @private
   */
  protected cachedBindGroup: GPUBindGroup | null = null;

  /**
   * Shader variant cache
   * @private
   */
  protected shaderVariants: Map<string, ShaderProgram> = new Map();

  /**
   * Constructor
   * @param name - Material name
   */
  constructor(name: string = 'Material') {
    this.id = `material_${materialIdCounter++}`;
    this.name = name;
    this.initializeParameters();
  }

  /**
   * Initialize material parameters with default values
   * @protected
   */
  protected initializeParameters(): void {
    const params = this.getParameters();
    for (const param of params) {
      this.parameters.set(param.name, param.defaultValue);
    }
  }

  /**
   * Get the primary shader program for this material
   * @abstract
   */
  abstract getShader(): ShaderProgram;

  /**
   * Get a shader variant with specific defines
   * @param defines - Preprocessor defines
   * @abstract
   */
  abstract getShaderVariant(defines: Record<string, string>): ShaderProgram;

  /**
   * Get all material parameters with metadata
   * @abstract
   */
  abstract getParameters(): MaterialParameter[];

  /**
   * Set a material parameter value
   * @param name - Parameter name
   * @param value - Parameter value
   */
  setParameter(name: string, value: any): void {
    const param = this.getParameters().find(p => p.name === name);

    if (!param) {
      console.warn(`Parameter "${name}" does not exist on material "${this.name}"`);
      return;
    }

    // Validate range if specified
    if (param.range && typeof value === 'number') {
      const [min, max] = param.range;
      if (value < min || value > max) {
        console.warn(
          `Parameter "${name}" value ${value} is out of range [${min}, ${max}]`
        );
      }
    }

    // Type validation
    if (!this.validateParameterType(value, param.type)) {
      console.warn(
        `Parameter "${name}" type mismatch. Expected ${param.type}, got ${typeof value}`
      );
      return;
    }

    this.parameters.set(name, value);
    this.dirty = true;
  }

  /**
   * Get a material parameter value
   * @param name - Parameter name
   * @returns Parameter value
   */
  getParameter(name: string): any {
    return this.parameters.get(name);
  }

  /**
   * Check if material has a parameter
   * @param name - Parameter name
   */
  hasParameter(name: string): boolean {
    return this.parameters.has(name);
  }

  /**
   * Validate parameter type
   * @private
   */
  private validateParameterType(value: any, type: MaterialParameterType): boolean {
    switch (type) {
      case 'float':
      case 'int':
        return typeof value === 'number';
      case 'bool':
        return typeof value === 'boolean';
      case 'vec2':
        return value && typeof value === 'object' && 'x' in value && 'y' in value;
      case 'vec3':
      case 'color':
        return value && typeof value === 'object' && 'x' in value && 'y' in value && 'z' in value;
      case 'vec4':
        return value && typeof value === 'object' && 'x' in value && 'y' in value && 'z' in value && 'w' in value;
      case 'mat3':
      case 'mat4':
        return value && typeof value === 'object' && 'elements' in value;
      case 'texture2d':
      case 'textureCube':
        return value === null || (value && typeof value === 'object');
      default:
        return true;
    }
  }

  /**
   * Bind material resources to GPU
   * Creates or updates GPU bind groups with current parameters
   *
   * @param device - Render device
   * @param context - Render context
   * @returns GPU bind group
   */
  bind(device: RenderDevice, context: RenderContext): GPUBindGroup {
    if (!this.dirty && this.cachedBindGroup) {
      return this.cachedBindGroup;
    }

    this.cachedBindGroup = this.createBindGroup(device, context);
    this.dirty = false;
    return this.cachedBindGroup;
  }

  /**
   * Create GPU bind group
   * @protected
   * @param device - Render device
   * @param context - Render context
   */
  protected abstract createBindGroup(
    device: RenderDevice,
    context: RenderContext
  ): GPUBindGroup;

  /**
   * Mark material as dirty (needs rebinding)
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Clone this material
   * Creates a deep copy with the same parameters
   */
  clone(): Material {
    const cloned = this.createClone();
    cloned.name = this.name + ' (Clone)';
    cloned.renderQueue = this.renderQueue;
    cloned.blendMode = this.blendMode;
    cloned.cullMode = this.cullMode;
    cloned.depthTest = this.depthTest;
    cloned.depthWrite = this.depthWrite;

    // Copy parameters
    for (const [key, value] of this.parameters.entries()) {
      cloned.parameters.set(key, this.cloneValue(value));
    }

    return cloned;
  }

  /**
   * Create a clone of this material (subclass-specific)
   * @protected
   */
  protected abstract createClone(): Material;

  /**
   * Deep clone a value
   * @private
   */
  private cloneValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== 'object') {
      return value;
    }

    // Vector types
    if ('clone' in value && typeof value.clone === 'function') {
      return value.clone();
    }

    // Arrays
    if (Array.isArray(value)) {
      return value.map(v => this.cloneValue(v));
    }

    // Plain objects
    return { ...value };
  }

  /**
   * Generate shader variant key from defines
   * @protected
   */
  protected generateVariantKey(defines: Record<string, string>): string {
    const keys = Object.keys(defines).sort();
    return keys.map(k => `${k}=${defines[k]}`).join('|');
  }

  /**
   * Get or create shader variant
   * @protected
   */
  protected getOrCreateVariant(
    defines: Record<string, string>,
    factory: () => ShaderProgram
  ): ShaderProgram {
    const key = this.generateVariantKey(defines);

    if (!this.shaderVariants.has(key)) {
      this.shaderVariants.set(key, factory());
    }

    return this.shaderVariants.get(key)!;
  }

  /**
   * Dispose of material resources
   */
  dispose(): void {
    this.parameters.clear();
    this.shaderVariants.clear();
    this.cachedBindGroup = null;
    this.dirty = true;
  }

  /**
   * Get material statistics
   */
  getStats(): MaterialStats {
    return {
      id: this.id,
      name: this.name,
      parameterCount: this.parameters.size,
      variantCount: this.shaderVariants.size,
      isDirty: this.dirty
    };
  }

  /**
   * Serialize material to JSON
   */
  toJSON(): MaterialJSON {
    const params: Record<string, any> = {};
    for (const [key, value] of this.parameters.entries()) {
      params[key] = this.serializeValue(value);
    }

    return {
      type: this.constructor.name,
      name: this.name,
      renderQueue: this.renderQueue,
      blendMode: this.blendMode,
      cullMode: this.cullMode,
      depthTest: this.depthTest,
      depthWrite: this.depthWrite,
      parameters: params
    };
  }

  /**
   * Serialize a value for JSON
   * @private
   */
  private serializeValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'object') {
      return value;
    }

    if ('toArray' in value && typeof value.toArray === 'function') {
      return value.toArray();
    }

    return value;
  }

  /**
   * Deserialize material from JSON
   * @static
   */
  static fromJSON(json: MaterialJSON): Material {
    throw new Error('fromJSON must be implemented by subclass');
  }
}

/**
 * Material statistics
 */
export interface MaterialStats {
  id: string;
  name: string;
  parameterCount: number;
  variantCount: number;
  isDirty: boolean;
}

/**
 * Material JSON representation
 */
export interface MaterialJSON {
  type: string;
  name: string;
  renderQueue: RenderQueue;
  blendMode: BlendMode;
  cullMode: CullMode;
  depthTest: boolean;
  depthWrite: boolean;
  parameters: Record<string, any>;
}

/**
 * Helper functions for render state
 */
export class MaterialHelpers {
  /**
   * Get WebGPU blend state from blend mode
   */
  static getBlendState(mode: BlendMode): any {
    switch (mode) {
      case BlendMode.OPAQUE:
        return null;

      case BlendMode.ALPHA:
        return {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add'
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add'
          }
        };

      case BlendMode.ADDITIVE:
        return {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one',
            operation: 'add'
          },
          alpha: {
            srcFactor: 'zero',
            dstFactor: 'one',
            operation: 'add'
          }
        };

      case BlendMode.MULTIPLY:
        return {
          color: {
            srcFactor: 'dst-color',
            dstFactor: 'zero',
            operation: 'add'
          },
          alpha: {
            srcFactor: 'dst-alpha',
            dstFactor: 'zero',
            operation: 'add'
          }
        };

      case BlendMode.PREMULTIPLIED:
        return {
          color: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add'
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add'
          }
        };

      default:
        return null;
    }
  }

  /**
   * Get WebGPU cull mode from cull mode enum
   */
  static getCullMode(mode: CullMode): 'none' | 'front' | 'back' {
    return mode as 'none' | 'front' | 'back';
  }
}
