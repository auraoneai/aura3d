/**
 * ComponentRegistry.ts
 *
 * Central registry for component type registration and lookup.
 * Provides O(1) lookup performance and manages component metadata.
 */

/**
 * Component identifier type (1-1024, 0 reserved for invalid)
 */
export type ComponentId = number;

/**
 * Component interface that all components must implement
 */
export interface IComponent {
  readonly __componentBrand?: unique symbol;

  /**
   * Optional lifecycle hook called when component is attached to an entity.
   */
  onAttach?(entity: number): void;

  /**
   * Optional lifecycle hook called when component is detached from an entity.
   */
  onDetach?(entity: number): void;

  /**
   * Optional reset method for object pooling.
   */
  reset?(): void;

  /**
   * Optional serialization method.
   */
  serialize?(): object;

  /**
   * Optional deserialization method.
   */
  deserialize?(data: object): void;
}

/**
 * Component type constructor
 */
export type ComponentType<T extends IComponent = IComponent> = new (...args: any[]) => T;

/**
 * Field types for SoA (Structure of Arrays) layout
 */
export type ComponentFieldType =
  | 'f32' | 'f64'
  | 'i8' | 'i16' | 'i32'
  | 'u8' | 'u16' | 'u32'
  | 'bool'
  | 'vec2' | 'vec3' | 'vec4'
  | 'quat'
  | 'mat3' | 'mat4'
  | 'entity'
  | 'string'
  | 'ref';

/**
 * Schema field definition
 */
export interface ComponentSchemaField {
  name: string;
  type: ComponentFieldType;
  offset?: number;
}

/**
 * Component schema for serialization and SoA layout
 */
export interface ComponentSchema {
  fields: ComponentSchemaField[];
  totalSize?: number;
}

/**
 * Metadata stored for each registered component type
 */
export interface ComponentMetadata {
  id: ComponentId;
  name: string;
  type: ComponentType;
  schema?: ComponentSchema;
  poolSize?: number;
}

/**
 * Options for component registration
 */
export interface RegisterOptions {
  /** Override default class name */
  name?: string;
  /** Schema definition for SoA layout */
  schema?: ComponentSchema;
  /** Initial pool size for this component type */
  poolSize?: number;
}

/**
 * Static property key for storing component ID on class
 */
const COMPONENT_ID_KEY = '__componentId__';

/**
 * Maximum number of components (fits in 10 bits)
 */
const MAX_COMPONENTS = 1024;

/**
 * Central registry for component type registration and lookup.
 *
 * Provides O(1) lookup by ID and type, maintains metadata for all registered components,
 * and supports decorator-based registration.
 *
 * @example
 * ```typescript
 * // Manual registration
 * class Position implements IComponent {
 *   x: number = 0;
 *   y: number = 0;
 *   z: number = 0;
 * }
 * const positionId = ComponentRegistry.register(Position, {
 *   name: 'Position',
 *   poolSize: 1000
 * });
 *
 * // Decorator registration
 * @ComponentRegistry.component({
 *   name: 'Velocity',
 *   schema: {
 *     fields: [
 *       { name: 'x', type: 'f32' },
 *       { name: 'y', type: 'f32' },
 *       { name: 'z', type: 'f32' }
 *     ]
 *   }
 * })
 * class Velocity implements IComponent {
 *   x: number = 0;
 *   y: number = 0;
 *   z: number = 0;
 * }
 *
 * // Lookup
 * const id = ComponentRegistry.getId(Position);
 * const type = ComponentRegistry.getType(id);
 * const metadata = ComponentRegistry.getMetadata(id);
 *
 * // Factory
 * const instance = ComponentRegistry.create(Position);
 * ```
 */
export class ComponentRegistry {
  /**
   * Array of metadata indexed by ComponentId for O(1) lookup
   */
  private static metadata: (ComponentMetadata | undefined)[] = [];

  /**
   * Map from component name to ComponentId
   */
  private static nameToId: Map<string, ComponentId> = new Map();

  /**
   * Next available component ID (auto-incrementing, starts at 1)
   */
  private static nextId: ComponentId = 1;

  /**
   * Platform pointer size in bytes (4 for 32-bit, 8 for 64-bit)
   */
  private static readonly POINTER_SIZE = (() => {
    // Check if we're in a 64-bit environment
    // In JavaScript, we assume 64-bit for modern browsers/Node.js
    return 8;
  })();

  /**
   * Registers a component type and assigns it a unique ComponentId.
   *
   * @param type - Component class constructor
   * @param options - Optional registration configuration
   * @returns The assigned ComponentId
   * @throws Error if the component is already registered or max components exceeded
   *
   * @example
   * ```typescript
   * class Health implements IComponent {
   *   current: number = 100;
   *   max: number = 100;
   * }
   * const healthId = ComponentRegistry.register(Health, {
   *   name: 'Health',
   *   poolSize: 500
   * });
   * ```
   */
  static register<T extends IComponent>(
    type: ComponentType<T>,
    options: RegisterOptions = {}
  ): ComponentId {
    // Check if already registered
    if (this.isRegistered(type)) {
      throw new Error(
        `Component type "${type.name}" is already registered with ID ${this.getId(type)}`
      );
    }

    // Check max components limit
    if (this.nextId >= MAX_COMPONENTS) {
      throw new Error(
        `Maximum number of component types (${MAX_COMPONENTS}) exceeded`
      );
    }

    // Determine component name
    const name = options.name || type.name;
    if (!name) {
      throw new Error('Component type must have a name or provide name in options');
    }

    // Check for name collision
    if (this.nameToId.has(name)) {
      const existingId = this.nameToId.get(name)!;
      throw new Error(
        `Component name "${name}" is already registered with ID ${existingId}`
      );
    }

    // Assign ID
    const id = this.nextId++;

    // Process schema if provided
    let schema = options.schema;
    if (schema) {
      schema = this.processSchema(schema);
    }

    // Create and store metadata
    const metadata: ComponentMetadata = {
      id,
      name,
      type,
      schema,
      poolSize: options.poolSize,
    };

    this.metadata[id] = metadata;
    this.nameToId.set(name, id);

    // Store ID on the component class for fast lookup
    (type as any)[COMPONENT_ID_KEY] = id;

    return id;
  }

  /**
   * Decorator for registering component classes at definition time.
   *
   * @param options - Optional registration configuration
   * @returns ClassDecorator function
   *
   * @example
   * ```typescript
   * @ComponentRegistry.component({
   *   name: 'Transform',
   *   schema: {
   *     fields: [
   *       { name: 'x', type: 'f32' },
   *       { name: 'y', type: 'f32' },
   *       { name: 'z', type: 'f32' }
   *     ]
   *   }
   * })
   * class TransformComponent implements IComponent {
   *   x: number = 0;
   *   y: number = 0;
   *   z: number = 0;
   * }
   * ```
   */
  static component(options: RegisterOptions = {}): ClassDecorator {
    return function <TFunction extends Function>(target: TFunction): TFunction {
      ComponentRegistry.register(target as any, options);
      return target;
    };
  }

  /**
   * Gets the ComponentId for a registered component type.
   *
   * @param type - Component class constructor
   * @returns The ComponentId
   * @throws Error if the component type is not registered
   *
   * @example
   * ```typescript
   * const id = ComponentRegistry.getId(Position);
   * ```
   */
  static getId<T extends IComponent>(type: ComponentType<T>): ComponentId {
    const id = (type as any)[COMPONENT_ID_KEY];
    if (id === undefined) {
      throw new Error(`Component type "${type.name}" is not registered`);
    }
    return id;
  }

  /**
   * Gets the component type for a given ComponentId.
   *
   * @param id - Component identifier
   * @returns The component type constructor, or undefined if not found
   *
   * @example
   * ```typescript
   * const type = ComponentRegistry.getType(positionId);
   * if (type) {
   *   const instance = new type();
   * }
   * ```
   */
  static getType(id: ComponentId): ComponentType | undefined {
    const metadata = this.metadata[id];
    return metadata?.type;
  }

  /**
   * Gets the metadata for a given ComponentId.
   *
   * @param id - Component identifier
   * @returns The component metadata, or undefined if not found
   *
   * @example
   * ```typescript
   * const metadata = ComponentRegistry.getMetadata(positionId);
   * console.log(`Component: ${metadata.name}, Pool size: ${metadata.poolSize}`);
   * ```
   */
  static getMetadata(id: ComponentId): ComponentMetadata | undefined {
    return this.metadata[id];
  }

  /**
   * Gets the metadata for a component by name.
   *
   * @param name - Component name
   * @returns The component metadata, or undefined if not found
   *
   * @example
   * ```typescript
   * const metadata = ComponentRegistry.getMetadataByName('Position');
   * if (metadata) {
   *   const instance = new metadata.type();
   * }
   * ```
   */
  static getMetadataByName(name: string): ComponentMetadata | undefined {
    const id = this.nameToId.get(name);
    if (id === undefined) {
      return undefined;
    }
    return this.metadata[id];
  }

  /**
   * Checks if a component type is registered.
   *
   * @param type - Component class constructor
   * @returns true if registered, false otherwise
   *
   * @example
   * ```typescript
   * if (ComponentRegistry.isRegistered(Position)) {
   *   const id = ComponentRegistry.getId(Position);
   * }
   * ```
   */
  static isRegistered<T extends IComponent>(type: ComponentType<T>): boolean {
    return (type as any)[COMPONENT_ID_KEY] !== undefined;
  }

  /**
   * Gets the total number of registered component types.
   *
   * @returns The count of registered components
   *
   * @example
   * ```typescript
   * console.log(`Total components: ${ComponentRegistry.getRegisteredCount()}`);
   * ```
   */
  static getRegisteredCount(): number {
    return this.nextId - 1;
  }

  /**
   * Gets metadata for all registered components.
   *
   * @returns Readonly array of all component metadata
   *
   * @example
   * ```typescript
   * const allComponents = ComponentRegistry.getAllMetadata();
   * for (const metadata of allComponents) {
   *   console.log(`ID: ${metadata.id}, Name: ${metadata.name}`);
   * }
   * ```
   */
  static getAllMetadata(): readonly ComponentMetadata[] {
    const result: ComponentMetadata[] = [];
    for (let i = 1; i < this.nextId; i++) {
      const metadata = this.metadata[i];
      if (metadata) {
        result.push(metadata);
      }
    }
    return result;
  }

  /**
   * Creates a new instance of a component type.
   *
   * @param type - Component class constructor
   * @returns New instance of the component
   * @throws Error if the component type is not registered
   *
   * @example
   * ```typescript
   * const position = ComponentRegistry.create(Position);
   * position.x = 10;
   * ```
   */
  static create<T extends IComponent>(type: ComponentType<T>): T {
    if (!this.isRegistered(type)) {
      throw new Error(`Component type "${type.name}" is not registered`);
    }
    return new type();
  }

  /**
   * Creates a new instance of a component by its ComponentId.
   *
   * @param id - Component identifier
   * @returns New instance of the component, or undefined if ID not found
   *
   * @example
   * ```typescript
   * const component = ComponentRegistry.createById(positionId);
   * if (component) {
   *   // Use component
   * }
   * ```
   */
  static createById(id: ComponentId): IComponent | undefined {
    const type = this.getType(id);
    if (!type) {
      return undefined;
    }
    return new type();
  }

  /**
   * Gets the schema for a component by its ComponentId.
   *
   * @param id - Component identifier
   * @returns The component schema, or undefined if not found or no schema defined
   *
   * @example
   * ```typescript
   * const schema = ComponentRegistry.getSchema(positionId);
   * if (schema) {
   *   const totalSize = schema.totalSize;
   * }
   * ```
   */
  static getSchema(id: ComponentId): ComponentSchema | undefined {
    const metadata = this.metadata[id];
    return metadata?.schema;
  }

  /**
   * Gets the size in bytes for a field type in SoA layout.
   *
   * @param fieldType - The component field type
   * @returns Size in bytes
   *
   * @example
   * ```typescript
   * const vec3Size = ComponentRegistry.getFieldSize('vec3'); // 12
   * const f32Size = ComponentRegistry.getFieldSize('f32');   // 4
   * ```
   */
  static getFieldSize(fieldType: ComponentFieldType): number {
    switch (fieldType) {
      // 1 byte
      case 'i8':
      case 'u8':
      case 'bool':
        return 1;

      // 2 bytes
      case 'i16':
      case 'u16':
        return 2;

      // 4 bytes
      case 'f32':
      case 'i32':
      case 'u32':
      case 'entity':
        return 4;

      // 8 bytes
      case 'f64':
      case 'vec2':
        return 8;

      // 12 bytes
      case 'vec3':
        return 12;

      // 16 bytes
      case 'vec4':
      case 'quat':
        return 16;

      // 36 bytes
      case 'mat3':
        return 36;

      // 64 bytes
      case 'mat4':
        return 64;

      // Pointer size (platform dependent)
      case 'string':
      case 'ref':
        return this.POINTER_SIZE;

      default:
        throw new Error(`Unknown field type: ${fieldType}`);
    }
  }

  /**
   * Resets the registry to its initial state.
   *
   * WARNING: This should only be used in testing. Calling this in production
   * will invalidate all existing component references and IDs.
   *
   * @example
   * ```typescript
   * // In test teardown
   * afterEach(() => {
   *   ComponentRegistry.reset();
   * });
   * ```
   */
  static reset(): void {
    this.metadata = [];
    this.nameToId.clear();
    this.nextId = 1;
  }

  /**
   * Processes a schema to compute field offsets and total size.
   *
   * @param schema - The input schema
   * @returns Processed schema with computed offsets and total size
   */
  private static processSchema(schema: ComponentSchema): ComponentSchema {
    let offset = 0;
    const processedFields: ComponentSchemaField[] = [];

    for (const field of schema.fields) {
      const size = this.getFieldSize(field.type);

      // Align offset to field size (up to 8 bytes)
      const alignment = Math.min(size, 8);
      if (offset % alignment !== 0) {
        offset += alignment - (offset % alignment);
      }

      processedFields.push({
        ...field,
        offset,
      });

      offset += size;
    }

    // Align total size to 8 bytes for struct alignment
    if (offset % 8 !== 0) {
      offset += 8 - (offset % 8);
    }

    return {
      fields: processedFields,
      totalSize: offset,
    };
  }
}
