/**
 * Serializer.ts
 *
 * Serialization/deserialization of ECS world state with support for JSON and binary formats.
 * Provides efficient entity/component serialization, ID remapping, and prefab system.
 *
 * Features:
 * - JSON format for human-readable saves
 * - Binary format for network/compact storage
 * - Entity ID remapping on deserialize
 * - Component filtering for partial serialization
 * - Schema-based serialization for efficient encoding
 * - Prefab system for entity hierarchy templates
 * - Version support for migration
 *
 * Performance targets:
 * - Serialize 10k entities < 100ms
 * - Binary format significantly smaller than JSON
 *
 * @module ecs/Serializer
 */

import { Entity, EntityUtils } from './Entity';
import { IComponent, ComponentType, ComponentFieldType, ComponentRegistry, ComponentSchema } from './ComponentRegistry';

/**
 * Serialized component data structure.
 */
export interface SerializedComponent {
  /** Component type name */
  type: string;
  /** Serialized component data as plain object */
  data: object;
}

/**
 * Serialized entity data structure.
 */
export interface SerializedEntity {
  /** Original entity ID for reference mapping */
  id: number;
  /** Array of serialized components */
  components: SerializedComponent[];
}

/**
 * Serialized world data structure.
 */
export interface SerializedWorld {
  /** Serialization format version */
  version: number;
  /** Array of serialized entities */
  entities: SerializedEntity[];
  /** Optional metadata for custom data */
  metadata?: object;
}

/**
 * Options for world serialization.
 */
export interface SerializerOptions {
  /** Include disabled/inactive entities (default: false) */
  includeDisabled?: boolean;
  /** Filter which component types to serialize */
  componentFilter?: (type: ComponentType) => boolean;
  /** Filter which entities to serialize */
  entityFilter?: (entity: Entity) => boolean;
  /** Pretty-print JSON output (default: false) */
  prettyPrint?: boolean;
}

/**
 * Options for world deserialization.
 */
export interface DeserializerOptions {
  /** Clear existing entities before deserializing (default: true) */
  clearWorld?: boolean;
  /** Output map of old entity IDs to new entities */
  entityMapping?: Map<number, Entity>;
  /** Custom factory for creating components from serialized data */
  componentFactory?: (type: string, data: object) => IComponent | null;
}

/**
 * Minimal World interface for serialization.
 * Represents the subset of World functionality needed by the serializer.
 */
export interface World {
  createEntity(): Entity;
  destroyEntity(entity: Entity): void;
  addComponent<T extends IComponent>(entity: Entity, component: T): void;
  getComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): T | undefined;
  hasComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): boolean;
  removeComponent<T extends IComponent>(entity: Entity, type: ComponentType<T>): void;
  forEachEntity(callback: (entity: Entity) => void): void;
  clear?(): void;
}

/**
 * ECS serializer with support for JSON and binary formats.
 *
 * Handles serialization and deserialization of ECS world state including:
 * - Entity ID remapping to handle non-sequential IDs
 * - Component data serialization using schema or custom methods
 * - Entity reference tracking and remapping
 * - Efficient binary encoding for network transmission
 *
 * @example
 * ```typescript
 * const serializer = new ECSSerializer();
 *
 * // Serialize world to JSON
 * const json = serializer.worldToJSON(world, {
 *   prettyPrint: true,
 *   entityFilter: (entity) => !isTemporary(entity)
 * });
 *
 * // Save to file
 * fs.writeFileSync('save.json', json);
 *
 * // Load from file
 * const savedJson = fs.readFileSync('save.json', 'utf8');
 * const entityMap = serializer.worldFromJSON(world, savedJson, {
 *   clearWorld: true
 * });
 *
 * // Update entity references
 * for (const [oldId, newEntity] of entityMap) {
 *   updateReferences(oldId, newEntity);
 * }
 * ```
 */
export class ECSSerializer {
  /**
   * Current serialization format version.
   */
  static readonly VERSION: number = 1;

  /**
   * Registered component schemas for serialization.
   * Maps component type constructor to its schema.
   */
  private schemas: Map<ComponentType, ComponentSchema>;

  /**
   * Creates a new ECS serializer.
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * ```
   */
  constructor() {
    this.schemas = new Map();
  }

  /**
   * Serializes a world to a plain object structure.
   *
   * @param world - World instance to serialize
   * @param options - Serialization options
   * @returns Serialized world data
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const data = serializer.serializeWorld(world, {
   *   entityFilter: (entity) => !world.hasComponent(entity, Temporary),
   *   componentFilter: (type) => type !== DebugInfo
   * });
   * ```
   */
  serializeWorld(world: World, options: SerializerOptions = {}): SerializedWorld {
    const entities: SerializedEntity[] = [];
    const { entityFilter, componentFilter } = options;

    world.forEachEntity((entity) => {
      if (entityFilter && !entityFilter(entity)) {
        return;
      }

      const serializedEntity = this.serializeEntityFromWorld(world, entity, componentFilter);
      if (serializedEntity.components.length > 0) {
        entities.push(serializedEntity);
      }
    });

    return {
      version: ECSSerializer.VERSION,
      entities,
      metadata: {}
    };
  }

  /**
   * Deserializes a world from serialized data.
   *
   * @param world - World instance to deserialize into
   * @param data - Serialized world data
   * @param options - Deserialization options
   * @returns Map of old entity IDs to new entities
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const entityMap = serializer.deserializeWorld(world, data, {
   *   clearWorld: true
   * });
   *
   * console.log(`Loaded ${entityMap.size} entities`);
   * ```
   */
  deserializeWorld(
    world: World,
    data: SerializedWorld,
    options: DeserializerOptions = {}
  ): Map<number, Entity> {
    const { clearWorld = true, entityMapping, componentFactory } = options;

    if (clearWorld && world.clear) {
      world.clear();
    }

    const idMap = entityMapping || new Map<number, Entity>();

    for (const serializedEntity of data.entities) {
      const entity = world.createEntity();
      idMap.set(serializedEntity.id, entity);

      for (const serializedComponent of serializedEntity.components) {
        let component: IComponent | null = null;

        if (componentFactory) {
          component = componentFactory(serializedComponent.type, serializedComponent.data);
        }

        if (!component) {
          component = this.deserializeComponentDefault(
            serializedComponent.type,
            serializedComponent.data
          );
        }

        if (component) {
          world.addComponent(entity, component);
        }
      }
    }

    this.remapEntityReferences(world, idMap);

    return idMap;
  }

  /**
   * Serializes a world to JSON string.
   *
   * @param world - World instance to serialize
   * @param options - Serialization options
   * @returns JSON string representation
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const json = serializer.worldToJSON(world, { prettyPrint: true });
   * fs.writeFileSync('world.json', json);
   * ```
   */
  worldToJSON(world: World, options: SerializerOptions = {}): string {
    const data = this.serializeWorld(world, options);
    return options.prettyPrint
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
  }

  /**
   * Deserializes a world from JSON string.
   *
   * @param world - World instance to deserialize into
   * @param json - JSON string to parse
   * @param options - Deserialization options
   * @returns Map of old entity IDs to new entities
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const json = fs.readFileSync('world.json', 'utf8');
   * const entityMap = serializer.worldFromJSON(world, json);
   * ```
   */
  worldFromJSON(
    world: World,
    json: string,
    options: DeserializerOptions = {}
  ): Map<number, Entity> {
    const data = JSON.parse(json) as SerializedWorld;
    return this.deserializeWorld(world, data, options);
  }

  /**
   * Serializes a single entity from a world.
   *
   * @param world - World instance containing the entity
   * @param entity - Entity to serialize
   * @returns Serialized entity data
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const entityData = serializer.serializeEntity(world, entity);
   * console.log(`Entity has ${entityData.components.length} components`);
   * ```
   */
  serializeEntity(world: World, entity: Entity): SerializedEntity {
    return this.serializeEntityFromWorld(world, entity);
  }

  /**
   * Deserializes a single entity into a world.
   *
   * @param world - World instance to create entity in
   * @param data - Serialized entity data
   * @returns Newly created entity
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const newEntity = serializer.deserializeEntity(world, entityData);
   * ```
   */
  deserializeEntity(world: World, data: SerializedEntity): Entity {
    const entity = world.createEntity();

    for (const serializedComponent of data.components) {
      const component = this.deserializeComponentDefault(
        serializedComponent.type,
        serializedComponent.data
      );

      if (component) {
        world.addComponent(entity, component);
      }
    }

    return entity;
  }

  /**
   * Serializes a component instance.
   *
   * @param component - Component to serialize
   * @returns Serialized component data
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const position = new Position(10, 20, 30);
   * const data = serializer.serializeComponent(position);
   * console.log(data.type); // "Position"
   * console.log(data.data); // { x: 10, y: 20, z: 30 }
   * ```
   */
  serializeComponent(component: IComponent): SerializedComponent {
    const type = component.constructor as ComponentType;
    const metadata = ComponentRegistry.getMetadata(ComponentRegistry.getId(type));

    if (!metadata) {
      throw new Error(`Component type not registered: ${type.name}`);
    }

    let data: object;

    if ((component as any).serialize) {
      data = (component as any).serialize();
    } else {
      const schema = this.schemas.get(type) || metadata.schema;
      if (schema) {
        data = this.serializeWithSchema(component, schema);
      } else {
        data = this.serializeGeneric(component);
      }
    }

    return {
      type: metadata.name,
      data
    };
  }

  /**
   * Deserializes a component from serialized data.
   *
   * @param data - Serialized component data
   * @returns Component instance, or null if type not found
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const component = serializer.deserializeComponent({
   *   type: 'Position',
   *   data: { x: 10, y: 20, z: 30 }
   * });
   * ```
   */
  deserializeComponent(data: SerializedComponent): IComponent | null {
    return this.deserializeComponentDefault(data.type, data.data);
  }

  /**
   * Serializes a world to binary format.
   *
   * Binary format structure:
   * - Header: version (u32) + entity count (u32)
   * - For each entity:
   *   - Entity ID (u32)
   *   - Component count (u32)
   *   - For each component:
   *     - Component name length (u16) + name (UTF-8)
   *     - Data length (u32) + data (JSON)
   *
   * @param world - World instance to serialize
   * @param options - Serialization options
   * @returns ArrayBuffer containing binary data
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const buffer = serializer.serializeWorldBinary(world);
   * const size = buffer.byteLength;
   * console.log(`Binary size: ${size} bytes`);
   * ```
   */
  serializeWorldBinary(world: World, options: SerializerOptions = {}): ArrayBuffer {
    const serialized = this.serializeWorld(world, options);
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    const headerBuffer = new ArrayBuffer(8);
    const headerView = new DataView(headerBuffer);
    headerView.setUint32(0, ECSSerializer.VERSION, true);
    headerView.setUint32(4, serialized.entities.length, true);
    chunks.push(new Uint8Array(headerBuffer));
    totalSize += 8;

    for (const entity of serialized.entities) {
      const entityBuffer = new ArrayBuffer(8);
      const entityView = new DataView(entityBuffer);
      entityView.setUint32(0, entity.id, true);
      entityView.setUint32(4, entity.components.length, true);
      chunks.push(new Uint8Array(entityBuffer));
      totalSize += 8;

      for (const component of entity.components) {
        const nameBytes = new TextEncoder().encode(component.type);
        const nameLengthBuffer = new ArrayBuffer(2);
        new DataView(nameLengthBuffer).setUint16(0, nameBytes.length, true);
        chunks.push(new Uint8Array(nameLengthBuffer));
        chunks.push(nameBytes);
        totalSize += 2 + nameBytes.length;

        const dataJson = JSON.stringify(component.data);
        const dataBytes = new TextEncoder().encode(dataJson);
        const dataLengthBuffer = new ArrayBuffer(4);
        new DataView(dataLengthBuffer).setUint32(0, dataBytes.length, true);
        chunks.push(new Uint8Array(dataLengthBuffer));
        chunks.push(dataBytes);
        totalSize += 4 + dataBytes.length;
      }
    }

    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  /**
   * Deserializes a world from binary format.
   *
   * @param world - World instance to deserialize into
   * @param buffer - ArrayBuffer containing binary data
   * @param options - Deserialization options
   * @returns Map of old entity IDs to new entities
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const buffer = fs.readFileSync('world.bin').buffer;
   * const entityMap = serializer.deserializeWorldBinary(world, buffer);
   * ```
   */
  deserializeWorldBinary(
    world: World,
    buffer: ArrayBuffer,
    options: DeserializerOptions = {}
  ): Map<number, Entity> {
    const { clearWorld = true, entityMapping, componentFactory } = options;

    if (clearWorld && world.clear) {
      world.clear();
    }

    const idMap = entityMapping || new Map<number, Entity>();
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    let offset = 0;

    const version = view.getUint32(offset, true);
    offset += 4;

    if (version !== ECSSerializer.VERSION) {
      throw new Error(`Unsupported serialization version: ${version}`);
    }

    const entityCount = view.getUint32(offset, true);
    offset += 4;

    for (let i = 0; i < entityCount; i++) {
      const entityId = view.getUint32(offset, true);
      offset += 4;

      const componentCount = view.getUint32(offset, true);
      offset += 4;

      const entity = world.createEntity();
      idMap.set(entityId, entity);

      for (let j = 0; j < componentCount; j++) {
        const nameLength = view.getUint16(offset, true);
        offset += 2;

        const nameBytes = new Uint8Array(buffer, offset, nameLength);
        const componentName = decoder.decode(nameBytes);
        offset += nameLength;

        const dataLength = view.getUint32(offset, true);
        offset += 4;

        const dataBytes = new Uint8Array(buffer, offset, dataLength);
        const dataJson = decoder.decode(dataBytes);
        const componentData = JSON.parse(dataJson);
        offset += dataLength;

        let component: IComponent | null = null;

        if (componentFactory) {
          component = componentFactory(componentName, componentData);
        }

        if (!component) {
          component = this.deserializeComponentDefault(componentName, componentData);
        }

        if (component) {
          world.addComponent(entity, component);
        }
      }
    }

    this.remapEntityReferences(world, idMap);

    return idMap;
  }

  /**
   * Registers a schema for a component type.
   * Schema-based serialization is more efficient than generic serialization.
   *
   * @param componentType - Component class/constructor
   * @param schema - Component schema definition
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * serializer.registerSchema(Position, {
   *   fields: [
   *     { name: 'x', type: 'f32' },
   *     { name: 'y', type: 'f32' },
   *     { name: 'z', type: 'f32' }
   *   ]
   * });
   * ```
   */
  registerSchema(componentType: ComponentType, schema: ComponentSchema): void {
    this.schemas.set(componentType, schema);
  }

  /**
   * Gets the registered schema for a component type.
   *
   * @param componentType - Component class/constructor
   * @returns Component schema, or undefined if not registered
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const schema = serializer.getSchema(Position);
   * if (schema) {
   *   console.log(`Position has ${schema.fields.length} fields`);
   * }
   * ```
   */
  getSchema(componentType: ComponentType): ComponentSchema | undefined {
    return this.schemas.get(componentType);
  }

  /**
   * Serializes an entity from a world with optional component filtering.
   *
   * @param world - World instance containing the entity
   * @param entity - Entity to serialize
   * @param componentFilter - Optional filter for component types
   * @returns Serialized entity data
   */
  private serializeEntityFromWorld(
    world: World,
    entity: Entity,
    componentFilter?: (type: ComponentType) => boolean
  ): SerializedEntity {
    const components: SerializedComponent[] = [];
    const allMetadata = ComponentRegistry.getAllMetadata();

    for (const metadata of allMetadata) {
      const type = metadata.type;

      if (componentFilter && !componentFilter(type)) {
        continue;
      }

      const component = world.getComponent(entity, type);
      if (component) {
        try {
          const serialized = this.serializeComponent(component);
          components.push(serialized);
        } catch (error) {
          console.warn(`Failed to serialize component ${metadata.name}:`, error);
        }
      }
    }

    return {
      id: entity,
      components
    };
  }

  /**
   * Deserializes a component using default logic.
   *
   * @param typeName - Component type name
   * @param data - Component data
   * @returns Component instance, or null if type not found
   */
  private deserializeComponentDefault(typeName: string, data: object): IComponent | null {
    const metadata = ComponentRegistry.getMetadataByName(typeName);
    if (!metadata) {
      console.warn(`Component type not found: ${typeName}`);
      return null;
    }

    const component = ComponentRegistry.createById(metadata.id);
    if (!component) {
      return null;
    }

    if ((component as any).deserialize) {
      (component as any).deserialize(data);
    } else {
      const schema = this.schemas.get(metadata.type) || metadata.schema;
      if (schema) {
        this.deserializeWithSchema(component, data, schema);
      } else {
        this.deserializeGeneric(component, data);
      }
    }

    return component;
  }

  /**
   * Serializes a component using its schema.
   *
   * @param component - Component instance
   * @param schema - Component schema
   * @returns Serialized data
   */
  private serializeWithSchema(component: IComponent, schema: ComponentSchema): object {
    const data: any = {};

    for (const field of schema.fields) {
      const value = (component as any)[field.name];
      if (value !== undefined) {
        data[field.name] = this.serializeFieldValue(value, field.type);
      }
    }

    return data;
  }

  /**
   * Deserializes a component using its schema.
   *
   * @param component - Component instance to populate
   * @param data - Serialized data
   * @param schema - Component schema
   */
  private deserializeWithSchema(component: IComponent, data: any, schema: ComponentSchema): void {
    for (const field of schema.fields) {
      if (data[field.name] !== undefined) {
        (component as any)[field.name] = this.deserializeFieldValue(data[field.name], field.type);
      }
    }
  }

  /**
   * Serializes a field value based on its type.
   *
   * @param value - Field value
   * @param type - Field type
   * @returns Serialized value
   */
  private serializeFieldValue(value: any, type: ComponentFieldType): any {
    switch (type) {
      case 'vec2':
        return Array.isArray(value) ? value : [value.x, value.y];
      case 'vec3':
        return Array.isArray(value) ? value : [value.x, value.y, value.z];
      case 'vec4':
      case 'quat':
        return Array.isArray(value) ? value : [value.x, value.y, value.z, value.w];
      case 'mat3':
        return Array.isArray(value) ? value : Array.from(value);
      case 'mat4':
        return Array.isArray(value) ? value : Array.from(value);
      case 'entity':
        return value;
      default:
        return value;
    }
  }

  /**
   * Deserializes a field value based on its type.
   *
   * @param value - Serialized value
   * @param type - Field type
   * @returns Deserialized value
   */
  private deserializeFieldValue(value: any, type: ComponentFieldType): any {
    return value;
  }

  /**
   * Serializes a component using generic property enumeration.
   *
   * @param component - Component instance
   * @returns Serialized data
   */
  private serializeGeneric(component: IComponent): object {
    const data: any = {};
    const obj = component as any;

    for (const key in obj) {
      if (obj.hasOwnProperty(key) && !key.startsWith('_')) {
        const value = obj[key];
        if (typeof value !== 'function') {
          data[key] = value;
        }
      }
    }

    return data;
  }

  /**
   * Deserializes a component using generic property assignment.
   *
   * @param component - Component instance to populate
   * @param data - Serialized data
   */
  private deserializeGeneric(component: IComponent, data: any): void {
    const obj = component as any;

    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        obj[key] = data[key];
      }
    }
  }

  /**
   * Remaps entity references in components after deserialization.
   * Iterates through all entities and updates entity-typed fields.
   *
   * @param world - World instance
   * @param idMap - Map of old entity IDs to new entities
   */
  private remapEntityReferences(world: World, idMap: Map<number, Entity>): void {
    const allMetadata = ComponentRegistry.getAllMetadata();

    world.forEachEntity((entity) => {
      for (const metadata of allMetadata) {
        const component = world.getComponent(entity, metadata.type);
        if (!component) {
          continue;
        }

        const schema = this.schemas.get(metadata.type) || metadata.schema;
        if (schema) {
          for (const field of schema.fields) {
            if (field.type === 'entity') {
              const oldId = (component as any)[field.name];
              if (oldId !== undefined && oldId !== 0) {
                const newEntity = idMap.get(oldId);
                if (newEntity !== undefined) {
                  (component as any)[field.name] = newEntity;
                } else {
                  (component as any)[field.name] = 0;
                }
              }
            }
          }
        }
      }
    });
  }
}

/**
 * Prefab data structure for entity hierarchy templates.
 */
export interface Prefab {
  /** Unique prefab name */
  name: string;
  /** Array of serialized entities in the prefab */
  entities: SerializedEntity[];
  /** ID of the root entity in the prefab */
  rootEntity: number;
}

/**
 * Manages prefab creation, instantiation, and storage.
 *
 * Prefabs are templates for entity hierarchies that can be instantiated
 * multiple times. They preserve component data and entity relationships.
 *
 * @example
 * ```typescript
 * const serializer = new ECSSerializer();
 * const prefabManager = new PrefabManager(serializer);
 *
 * // Create prefab from entity
 * const playerTemplate = world.createEntity();
 * world.addComponent(playerTemplate, new Position(0, 0, 0));
 * world.addComponent(playerTemplate, new Health(100));
 * const prefab = prefabManager.createPrefab(world, playerTemplate, 'Player');
 *
 * // Register prefab
 * prefabManager.register(prefab);
 *
 * // Instantiate prefab
 * const player1 = prefabManager.instantiate(world, prefab, { x: 10, y: 0, z: 0 });
 * const player2 = prefabManager.instantiate(world, prefab, { x: 20, y: 0, z: 0 });
 *
 * // Save/load prefabs
 * const json = prefabManager.savePrefab(prefab);
 * fs.writeFileSync('player.prefab', json);
 *
 * const loaded = prefabManager.loadPrefab(fs.readFileSync('player.prefab', 'utf8'));
 * prefabManager.register(loaded);
 * ```
 */
export class PrefabManager {
  /**
   * ECS serializer instance for entity serialization.
   */
  private serializer: ECSSerializer;

  /**
   * Map of prefab names to prefab data.
   */
  private prefabs: Map<string, Prefab>;

  /**
   * Creates a new prefab manager.
   *
   * @param serializer - ECS serializer instance
   *
   * @example
   * ```typescript
   * const serializer = new ECSSerializer();
   * const prefabManager = new PrefabManager(serializer);
   * ```
   */
  constructor(serializer: ECSSerializer) {
    this.serializer = serializer;
    this.prefabs = new Map();
  }

  /**
   * Creates a prefab from an entity hierarchy.
   *
   * Currently creates a prefab from a single root entity. Future versions
   * may support multi-entity hierarchies with parent-child relationships.
   *
   * @param world - World instance containing the entity
   * @param rootEntity - Root entity of the hierarchy
   * @param name - Unique prefab name
   * @returns Prefab data structure
   *
   * @example
   * ```typescript
   * const prefabManager = new PrefabManager(serializer);
   * const entity = world.createEntity();
   * world.addComponent(entity, new Position(0, 0, 0));
   * const prefab = prefabManager.createPrefab(world, entity, 'Bullet');
   * ```
   */
  createPrefab(world: World, rootEntity: Entity, name: string): Prefab {
    const entities: SerializedEntity[] = [];
    const rootSerialized = this.serializer.serializeEntity(world, rootEntity);
    entities.push(rootSerialized);

    return {
      name,
      entities,
      rootEntity: rootSerialized.id
    };
  }

  /**
   * Instantiates a prefab in the world.
   *
   * Creates new entities from the prefab template and optionally applies
   * a position offset to transform components.
   *
   * @param world - World instance to create entities in
   * @param prefab - Prefab to instantiate
   * @param position - Optional position offset for transform
   * @returns Root entity of the instantiated hierarchy
   *
   * @example
   * ```typescript
   * const prefabManager = new PrefabManager(serializer);
   * const prefab = prefabManager.get('Bullet');
   * if (prefab) {
   *   const bullet = prefabManager.instantiate(world, prefab, {
   *     x: playerPos.x,
   *     y: playerPos.y,
   *     z: playerPos.z
   *   });
   * }
   * ```
   */
  instantiate(
    world: World,
    prefab: Prefab,
    position?: { x: number; y: number; z: number }
  ): Entity {
    const idMap = new Map<number, Entity>();

    for (const serializedEntity of prefab.entities) {
      const entity = this.serializer.deserializeEntity(world, serializedEntity);
      idMap.set(serializedEntity.id, entity);

      if (position && serializedEntity.id === prefab.rootEntity) {
        const posMetadata = ComponentRegistry.getMetadataByName('Position');
        if (posMetadata) {
          const posComponent = world.getComponent(entity, posMetadata.type);
          if (posComponent) {
            (posComponent as any).x += position.x;
            (posComponent as any).y += position.y;
            (posComponent as any).z += position.z;
          }
        }
      }
    }

    this.remapPrefabReferences(world, idMap);

    return idMap.get(prefab.rootEntity)!;
  }

  /**
   * Registers a prefab for later retrieval.
   *
   * @param prefab - Prefab to register
   *
   * @example
   * ```typescript
   * const prefabManager = new PrefabManager(serializer);
   * prefabManager.register(bulletPrefab);
   * prefabManager.register(enemyPrefab);
   * ```
   */
  register(prefab: Prefab): void {
    this.prefabs.set(prefab.name, prefab);
  }

  /**
   * Gets a registered prefab by name.
   *
   * @param name - Prefab name
   * @returns Prefab data, or undefined if not found
   *
   * @example
   * ```typescript
   * const prefabManager = new PrefabManager(serializer);
   * const prefab = prefabManager.get('Player');
   * if (prefab) {
   *   const player = prefabManager.instantiate(world, prefab);
   * }
   * ```
   */
  get(name: string): Prefab | undefined {
    return this.prefabs.get(name);
  }

  /**
   * Removes a prefab from the registry.
   *
   * @param name - Prefab name
   * @returns true if prefab was removed, false if not found
   *
   * @example
   * ```typescript
   * const prefabManager = new PrefabManager(serializer);
   * if (prefabManager.remove('OldPrefab')) {
   *   console.log('Prefab removed');
   * }
   * ```
   */
  remove(name: string): boolean {
    return this.prefabs.delete(name);
  }

  /**
   * Serializes a prefab to JSON string.
   *
   * @param prefab - Prefab to serialize
   * @returns JSON string representation
   *
   * @example
   * ```typescript
   * const prefabManager = new PrefabManager(serializer);
   * const json = prefabManager.savePrefab(prefab);
   * fs.writeFileSync('prefab.json', json);
   * ```
   */
  savePrefab(prefab: Prefab): string {
    return JSON.stringify(prefab, null, 2);
  }

  /**
   * Deserializes a prefab from JSON string.
   *
   * @param json - JSON string to parse
   * @returns Prefab data structure
   *
   * @example
   * ```typescript
   * const prefabManager = new PrefabManager(serializer);
   * const json = fs.readFileSync('prefab.json', 'utf8');
   * const prefab = prefabManager.loadPrefab(json);
   * prefabManager.register(prefab);
   * ```
   */
  loadPrefab(json: string): Prefab {
    return JSON.parse(json) as Prefab;
  }

  /**
   * Remaps entity references in prefab components after instantiation.
   *
   * @param world - World instance
   * @param idMap - Map of old entity IDs to new entities
   */
  private remapPrefabReferences(world: World, idMap: Map<number, Entity>): void {
    const allMetadata = ComponentRegistry.getAllMetadata();

    for (const newEntity of idMap.values()) {
      for (const metadata of allMetadata) {
        const component = world.getComponent(newEntity, metadata.type);
        if (!component) {
          continue;
        }

        const schema = this.serializer.getSchema(metadata.type) || metadata.schema;
        if (schema) {
          for (const field of schema.fields) {
            if (field.type === 'entity') {
              const oldId = (component as any)[field.name];
              if (oldId !== undefined && oldId !== 0) {
                const remappedEntity = idMap.get(oldId);
                if (remappedEntity !== undefined) {
                  (component as any)[field.name] = remappedEntity;
                } else {
                  (component as any)[field.name] = 0;
                }
              }
            }
          }
        }
      }
    }
  }
}

// Classes already exported above, no need to re-export
