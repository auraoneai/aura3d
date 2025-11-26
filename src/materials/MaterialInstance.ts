/**
 * G3D 5.0 Material System
 * Material Instance - Per-entity parameter overrides
 *
 * @module materials/MaterialInstance
 * @implements PRD Section 7.1.2
 */

import type { Material, MaterialParameter, GPUBindGroup } from './Material';
import type { RenderDevice } from '../rendering/RenderDevice';
import type { RenderContext } from '../rendering/RenderContext';

/**
 * Material instance providing per-entity parameter overrides
 *
 * Memory efficient - only stores differences from base material
 * Allows many entities to share a base material while customizing specific parameters
 */
export class MaterialInstance {
  /**
   * Base material that this instance derives from
   */
  readonly baseMaterial: Material;

  /**
   * Parameter overrides (only stores differences)
   * @private
   */
  private overrides: Map<string, any> = new Map();

  /**
   * Dirty flag for rebinding
   * @private
   */
  private dirty: boolean = true;

  /**
   * Cached bind group
   * @private
   */
  private cachedBindGroup: GPUBindGroup | null = null;

  /**
   * Instance identifier
   */
  readonly id: string;

  /**
   * Instance name
   */
  name: string;

  /**
   * Constructor
   * @param baseMaterial - Base material to derive from
   * @param name - Instance name
   */
  constructor(baseMaterial: Material, name?: string) {
    this.baseMaterial = baseMaterial;
    this.id = `${baseMaterial.id}_instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = name || `${baseMaterial.name} Instance`;
  }

  /**
   * Set parameter override
   * @param name - Parameter name
   * @param value - Override value
   */
  setParameter(name: string, value: any): void {
    // Verify parameter exists on base material
    if (!this.baseMaterial.hasParameter(name)) {
      console.warn(
        `Parameter "${name}" does not exist on base material "${this.baseMaterial.name}"`
      );
      return;
    }

    // Validate against base material parameter descriptor
    const params = this.baseMaterial.getParameters();
    const param = params.find(p => p.name === name);

    if (!param) {
      return;
    }

    // Range validation
    if (param.range && typeof value === 'number') {
      const [min, max] = param.range;
      if (value < min || value > max) {
        console.warn(
          `Parameter "${name}" value ${value} is out of range [${min}, ${max}]`
        );
      }
    }

    this.overrides.set(name, value);
    this.dirty = true;
  }

  /**
   * Get parameter value (returns override or base material value)
   * @param name - Parameter name
   * @returns Parameter value
   */
  getParameter(name: string): any {
    if (this.overrides.has(name)) {
      return this.overrides.get(name);
    }
    return this.baseMaterial.getParameter(name);
  }

  /**
   * Clear a specific override (reverts to base material value)
   * @param name - Parameter name
   */
  clearOverride(name: string): void {
    if (this.overrides.has(name)) {
      this.overrides.delete(name);
      this.dirty = true;
    }
  }

  /**
   * Clear all overrides (reverts to base material for all parameters)
   */
  clearAllOverrides(): void {
    if (this.overrides.size > 0) {
      this.overrides.clear();
      this.dirty = true;
    }
  }

  /**
   * Get effective parameter value (resolves override or base)
   * @param name - Parameter name
   * @returns Effective value
   */
  getEffectiveParameter(name: string): any {
    return this.getParameter(name);
  }

  /**
   * Get all parameter overrides
   * @returns Map of overrides
   */
  getOverrides(): Map<string, any> {
    return new Map(this.overrides);
  }

  /**
   * Check if a parameter is overridden
   * @param name - Parameter name
   */
  hasOverride(name: string): boolean {
    return this.overrides.has(name);
  }

  /**
   * Get count of overrides
   */
  getOverrideCount(): number {
    return this.overrides.size;
  }

  /**
   * Bind material instance resources to GPU
   *
   * Creates bind group combining base material and overrides
   *
   * @param device - Render device
   * @param context - Render context
   * @returns GPU bind group
   */
  bind(device: RenderDevice, context: RenderContext): GPUBindGroup {
    // If no overrides, use base material binding
    if (this.overrides.size === 0) {
      return this.baseMaterial.bind(device, context);
    }

    // Check if we need to rebind
    if (!this.dirty && this.cachedBindGroup) {
      return this.cachedBindGroup;
    }

    this.cachedBindGroup = this.createBindGroup(device, context);
    this.dirty = false;
    return this.cachedBindGroup;
  }

  /**
   * Create GPU bind group for this instance
   * @private
   */
  private createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    // Get base material bind group
    const baseBindGroup = this.baseMaterial.bind(device, context);

    // If no overrides, return base
    if (this.overrides.size === 0) {
      return baseBindGroup;
    }

    // Create override bind group
    // In a real implementation, this would create a new bind group
    // that includes base material bindings plus overrides
    // For now, we'll use a simplified approach

    return {
      webgpu: baseBindGroup.webgpu,
      webgl: baseBindGroup.webgl,
      // Metadata for override handling
      overrides: this.getOverrides()
    } as any;
  }

  /**
   * Mark instance as dirty (needs rebinding)
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Clone this material instance
   * @returns New instance with same overrides
   */
  clone(): MaterialInstance {
    const cloned = new MaterialInstance(this.baseMaterial, this.name + ' (Clone)');

    // Copy overrides
    for (const [key, value] of this.overrides.entries()) {
      cloned.setParameter(key, this.cloneValue(value));
    }

    return cloned;
  }

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

    // Vector types with clone method
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
   * Dispose of instance resources
   */
  dispose(): void {
    this.overrides.clear();
    this.cachedBindGroup = null;
    this.dirty = true;
  }

  /**
   * Get instance statistics
   */
  getStats(): MaterialInstanceStats {
    return {
      id: this.id,
      name: this.name,
      baseMaterialId: this.baseMaterial.id,
      overrideCount: this.overrides.size,
      isDirty: this.dirty,
      memoryEstimate: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage in bytes
   * @private
   */
  private estimateMemoryUsage(): number {
    // Rough estimate:
    // - Map overhead: ~100 bytes
    // - Per override: ~50 bytes + value size
    let size = 100;

    for (const [key, value] of this.overrides.entries()) {
      size += 50; // Key + overhead
      size += this.estimateValueSize(value);
    }

    return size;
  }

  /**
   * Estimate size of a value in bytes
   * @private
   */
  private estimateValueSize(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return 8;
    }

    if (typeof value === 'string') {
      return value.length * 2;
    }

    if (typeof value === 'object') {
      // Vector types
      if ('x' in value && 'y' in value) {
        if ('z' in value) {
          if ('w' in value) {
            return 32; // vec4
          }
          return 24; // vec3
        }
        return 16; // vec2
      }

      // Matrix types
      if ('elements' in value && Array.isArray(value.elements)) {
        return value.elements.length * 4;
      }

      // Texture - just reference
      return 8;
    }

    return 8;
  }

  /**
   * Serialize instance to JSON
   */
  toJSON(): MaterialInstanceJSON {
    const overrides: Record<string, any> = {};

    for (const [key, value] of this.overrides.entries()) {
      overrides[key] = this.serializeValue(value);
    }

    return {
      name: this.name,
      baseMaterialId: this.baseMaterial.id,
      overrides
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
   * Create instance from JSON
   * @static
   */
  static fromJSON(json: MaterialInstanceJSON, baseMaterial: Material): MaterialInstance {
    const instance = new MaterialInstance(baseMaterial, json.name);

    for (const [key, value] of Object.entries(json.overrides)) {
      instance.setParameter(key, value);
    }

    return instance;
  }
}

/**
 * Material instance statistics
 */
export interface MaterialInstanceStats {
  id: string;
  name: string;
  baseMaterialId: string;
  overrideCount: number;
  isDirty: boolean;
  memoryEstimate: number;
}

/**
 * Material instance JSON representation
 */
export interface MaterialInstanceJSON {
  name: string;
  baseMaterialId: string;
  overrides: Record<string, any>;
}
