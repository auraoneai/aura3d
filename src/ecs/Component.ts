/**
 * @fileoverview Base component types and metadata system for the ECS.
 * Provides interfaces, types, and utilities for component registration and management.
 * @module ecs/Component
 */

/**
 * Component type ID (assigned at registration).
 * Unique integer identifier for each registered component type.
 */
export type ComponentId = number;

/**
 * Supported field types for component schema definitions.
 * Enables automatic serialization and struct-of-arrays layouts.
 */
export type ComponentFieldType =
  | 'f32' | 'f64'
  | 'i8' | 'i16' | 'i32'
  | 'u8' | 'u16' | 'u32'
  | 'bool'
  | 'string'
  | 'vec2' | 'vec3' | 'vec4'
  | 'quat' | 'mat3' | 'mat4'
  | 'entity'
  | 'ref';

/**
 * Schema for automatic serialization of component fields.
 * Maps field names to their data types.
 *
 * @example
 * ```typescript
 * const schema: ComponentSchema = {
 *   x: 'f32',
 *   y: 'f32',
 *   z: 'f32',
 *   name: 'string',
 *   active: 'bool'
 * };
 * ```
 */
export interface ComponentSchema {
  [fieldName: string]: ComponentFieldType;
}

/**
 * Base component interface that all components should implement.
 * Provides optional lifecycle hooks and serialization methods.
 *
 * @example
 * ```typescript
 * class Transform implements IComponent {
 *   x = 0;
 *   y = 0;
 *   z = 0;
 *
 *   onAttach(entity: number): void {
 *     console.log(`Transform attached to entity ${entity}`);
 *   }
 *
 *   reset(): void {
 *     this.x = 0;
 *     this.y = 0;
 *     this.z = 0;
 *   }
 *
 *   serialize(): object {
 *     return { x: this.x, y: this.y, z: this.z };
 *   }
 *
 *   deserialize(data: object): void {
 *     const d = data as { x: number; y: number; z: number };
 *     this.x = d.x;
 *     this.y = d.y;
 *     this.z = d.z;
 *   }
 * }
 * ```
 */
export interface IComponent {
  /**
   * Optional lifecycle hook called when component is attached to an entity.
   * @param entity - The entity ID this component is being attached to
   */
  onAttach?(entity: number): void;

  /**
   * Optional lifecycle hook called when component is detached from an entity.
   * @param entity - The entity ID this component is being detached from
   */
  onDetach?(entity: number): void;

  /**
   * Optional reset method for object pooling.
   * Should reset the component to its default state for reuse.
   */
  reset?(): void;

  /**
   * Optional serialization method.
   * @returns Plain object representation of component data
   */
  serialize?(): object;

  /**
   * Optional deserialization method.
   * @param data - Plain object containing component data
   */
  deserialize?(data: object): void;
}

/**
 * Metadata for a registered component type.
 * Contains runtime information about the component.
 *
 * @example
 * ```typescript
 * const metadata: ComponentMetadata = {
 *   id: 1,
 *   name: 'Transform',
 *   size: 12, // 3 floats * 4 bytes
 *   schema: {
 *     x: 'f32',
 *     y: 'f32',
 *     z: 'f32'
 *   }
 * };
 * ```
 */
export interface ComponentMetadata {
  /**
   * Unique component type ID.
   */
  id: ComponentId;

  /**
   * Human-readable component name.
   */
  name: string;

  /**
   * Size in bytes for struct-of-arrays layout.
   * Use 0 for object-based components.
   */
  size: number;

  /**
   * Optional schema for automatic serialization.
   */
  schema?: ComponentSchema;
}

/**
 * Component class constructor type.
 * Includes static properties for metadata storage.
 *
 * @typeParam T - The component type implementing IComponent
 *
 * @example
 * ```typescript
 * class Position implements IComponent {
 *   static _componentId: ComponentId;
 *   static _componentName: string;
 *   x = 0;
 *   y = 0;
 * }
 *
 * const PositionType: ComponentType<Position> = Position;
 * ```
 */
export type ComponentType<T extends IComponent = IComponent> = {
  new (...args: any[]): T;
  _componentId?: ComponentId;
  _componentName?: string;
  _componentSchema?: ComponentSchema;
};

/**
 * Internal registry storing all component metadata.
 * Indexed by component ID for O(1) access.
 */
const componentRegistry: ComponentMetadata[] = [];

/**
 * Internal map from component name to metadata.
 * Enables fast lookup by name.
 */
const componentNameMap: Map<string, ComponentMetadata> = new Map();

/**
 * Utility functions for component metadata access.
 * Provides global access to registered component information.
 *
 * @example
 * ```typescript
 * // Get component ID
 * const id = ComponentUtils.getId(Transform);
 *
 * // Check if registered
 * if (ComponentUtils.isRegistered(Transform)) {
 *   const name = ComponentUtils.getName(Transform);
 *   console.log(`Transform is registered as ${name}`);
 * }
 *
 * // Get all registered components
 * const all = ComponentUtils.getAll();
 * console.log(`Registered ${all.length} component types`);
 * ```
 */
export const ComponentUtils = {
  /**
   * Get the component ID from a component type.
   * This is an O(1) operation via static property access.
   *
   * @typeParam T - The component type implementing IComponent
   * @param type - The component class/constructor
   * @returns The component ID, or -1 if not registered
   *
   * @example
   * ```typescript
   * const id = ComponentUtils.getId(Transform);
   * if (id !== -1) {
   *   console.log(`Transform has ID ${id}`);
   * }
   * ```
   */
  getId<T extends IComponent>(type: ComponentType<T>): ComponentId {
    return type._componentId ?? -1;
  },

  /**
   * Get the component name from a component type.
   *
   * @typeParam T - The component type implementing IComponent
   * @param type - The component class/constructor
   * @returns The component name, or the class name if not registered
   *
   * @example
   * ```typescript
   * const name = ComponentUtils.getName(Transform);
   * console.log(`Component name: ${name}`);
   * ```
   */
  getName<T extends IComponent>(type: ComponentType<T>): string {
    return type._componentName ?? type.name;
  },

  /**
   * Check if a component type is registered.
   *
   * @typeParam T - The component type implementing IComponent
   * @param type - The component class/constructor
   * @returns True if the component is registered, false otherwise
   *
   * @example
   * ```typescript
   * if (!ComponentUtils.isRegistered(CustomComponent)) {
   *   throw new Error('CustomComponent must be registered');
   * }
   * ```
   */
  isRegistered<T extends IComponent>(type: ComponentType<T>): boolean {
    return type._componentId !== undefined && type._componentId >= 0;
  },

  /**
   * Get all registered component metadata.
   * Returns a copy of the internal registry.
   *
   * @returns Array of all component metadata
   *
   * @example
   * ```typescript
   * const components = ComponentUtils.getAll();
   * for (const meta of components) {
   *   console.log(`${meta.name} (ID: ${meta.id})`);
   * }
   * ```
   */
  getAll(): ComponentMetadata[] {
    return [...componentRegistry];
  },

  /**
   * Get component metadata by ID.
   * This is an O(1) operation.
   *
   * @param id - The component ID
   * @returns The component metadata, or undefined if not found
   *
   * @example
   * ```typescript
   * const metadata = ComponentUtils.getById(5);
   * if (metadata) {
   *   console.log(`Found component: ${metadata.name}`);
   * }
   * ```
   */
  getById(id: ComponentId): ComponentMetadata | undefined {
    return componentRegistry[id];
  },

  /**
   * Get component metadata by name.
   * This is an O(1) operation via Map lookup.
   *
   * @param name - The component name
   * @returns The component metadata, or undefined if not found
   *
   * @example
   * ```typescript
   * const metadata = ComponentUtils.getByName('Transform');
   * if (metadata) {
   *   console.log(`Transform has ID ${metadata.id}`);
   * }
   * ```
   */
  getByName(name: string): ComponentMetadata | undefined {
    return componentNameMap.get(name);
  },

  /**
   * Internal method to register a component type.
   * Should only be called by ComponentRegistry.
   *
   * @internal
   * @param type - The component class/constructor
   * @param metadata - The component metadata
   * @throws {Error} If component is already registered
   *
   * @example
   * ```typescript
   * // Internal use only - typically called by ComponentRegistry
   * ComponentUtils._register(Transform, {
   *   id: 0,
   *   name: 'Transform',
   *   size: 12,
   *   schema: { x: 'f32', y: 'f32', z: 'f32' }
   * });
   * ```
   */
  _register<T extends IComponent>(
    type: ComponentType<T>,
    metadata: ComponentMetadata
  ): void {
    if (this.isRegistered(type)) {
      throw new Error(
        `Component ${metadata.name} is already registered with ID ${type._componentId}`
      );
    }

    if (componentRegistry[metadata.id] !== undefined) {
      throw new Error(
        `Component ID ${metadata.id} is already taken by ${componentRegistry[metadata.id].name}`
      );
    }

    if (componentNameMap.has(metadata.name)) {
      throw new Error(
        `Component name ${metadata.name} is already registered`
      );
    }

    // Store static metadata on the component class
    type._componentId = metadata.id;
    type._componentName = metadata.name;
    type._componentSchema = metadata.schema;

    // Store in registries
    componentRegistry[metadata.id] = metadata;
    componentNameMap.set(metadata.name, metadata);
  },

  /**
   * Internal method to unregister a component type.
   * Should only be called by ComponentRegistry for cleanup.
   *
   * @internal
   * @param type - The component class/constructor
   * @throws {Error} If component is not registered
   *
   * @example
   * ```typescript
   * // Internal use only - typically called by ComponentRegistry
   * ComponentUtils._unregister(Transform);
   * ```
   */
  _unregister<T extends IComponent>(type: ComponentType<T>): void {
    if (!this.isRegistered(type)) {
      throw new Error(
        `Component ${type.name} is not registered`
      );
    }

    const id = type._componentId!;
    const name = type._componentName!;

    // Remove from registries
    delete componentRegistry[id];
    componentNameMap.delete(name);

    // Clear static metadata
    delete type._componentId;
    delete type._componentName;
    delete type._componentSchema;
  },

  /**
   * Internal method to clear all registered components.
   * Should only be called for testing or cleanup.
   *
   * @internal
   *
   * @example
   * ```typescript
   * // Internal use only - typically called in test cleanup
   * ComponentUtils._clear();
   * ```
   */
  _clear(): void {
    componentRegistry.length = 0;
    componentNameMap.clear();
  }
};
