/**
 * @fileoverview Advanced binary and JSON serialization with type registry.
 * Provides efficient serialization for network transmission with automatic type handling.
 * @module net/Serialization
 */

import { Logger } from '../core/Logger';
import { Vector3 } from '../math/Vector3';

const logger = Logger.create('Serialization');

/**
 * Serializable type interface.
 */
export interface Serializable {
  /**
   * Serializes the object to a DataView.
   * @param view - DataView to write to
   * @param offset - Offset to start writing
   * @returns Number of bytes written
   */
  serialize(view: DataView, offset: number): number;

  /**
   * Deserializes the object from a DataView.
   * @param view - DataView to read from
   * @param offset - Offset to start reading
   * @returns Number of bytes read
   */
  deserialize(view: DataView, offset: number): number;

  /**
   * Gets the serialized size in bytes.
   * @returns Size in bytes
   */
  getSerializedSize(): number;
}

/**
 * Type serializer function signature.
 */
export type TypeNetworkSerializer<T = any> = (
  value: T,
  view: DataView,
  offset: number
) => number;

/**
 * Type deserializer function signature.
 */
export type TypeDeserializer<T = any> = (
  view: DataView,
  offset: number
) => [T, number];

/**
 * Type metadata for registry.
 */
interface TypeMetadata<T = any> {
  /** Type ID */
  id: number;
  /** Type name */
  name: string;
  /** NetworkSerializer function */
  serializer: TypeNetworkSerializer<T>;
  /** Deserializer function */
  deserializer: TypeDeserializer<T>;
  /** Fixed size in bytes (0 = variable size) */
  fixedSize: number;
}

/**
 * Type registry for automatic serialization.
 * Maps type names to serializers/deserializers for automatic type handling.
 *
 * @example
 * ```typescript
 * // Register a custom type
 * TypeRegistry.register('Player', {
 *   serializer: (player, view, offset) => {
 *     view.setUint32(offset, player.id, true);
 *     view.setFloat32(offset + 4, player.health, true);
 *     return 8;
 *   },
 *   deserializer: (view, offset) => {
 *     const id = view.getUint32(offset, true);
 *     const health = view.getFloat32(offset + 4, true);
 *     return [{ id, health }, 8];
 *   },
 *   fixedSize: 8,
 * });
 *
 * // Serialize a value
 * const buffer = TypeRegistry.serializeValue('Player', playerData);
 *
 * // Deserialize a value
 * const [player, bytesRead] = TypeRegistry.deserializeValue(buffer);
 * ```
 */
export class TypeRegistry {
  private static nextId = 1;
  private static typesByName = new Map<string, TypeMetadata>();
  private static typesById = new Map<number, TypeMetadata>();

  /**
   * Registers a new type with the registry.
   *
   * @param name - Type name
   * @param serializer - NetworkSerializer function
   * @param deserializer - Deserializer function
   * @param fixedSize - Fixed size in bytes (0 for variable size)
   * @returns Type ID
   *
   * @example
   * ```typescript
   * TypeRegistry.register(
   *   'Vector3',
   *   (v, view, offset) => {
   *     view.setFloat32(offset, v.x, true);
   *     view.setFloat32(offset + 4, v.y, true);
   *     view.setFloat32(offset + 8, v.z, true);
   *     return 12;
   *   },
   *   (view, offset) => {
   *     const x = view.getFloat32(offset, true);
   *     const y = view.getFloat32(offset + 4, true);
   *     const z = view.getFloat32(offset + 8, true);
   *     return [new Vector3(x, y, z), 12];
   *   },
   *   12
   * );
   * ```
   */
  static register<T>(
    name: string,
    serializer: TypeNetworkSerializer<T>,
    deserializer: TypeDeserializer<T>,
    fixedSize: number = 0
  ): number {
    if (this.typesByName.has(name)) {
      throw new Error(`Type '${name}' is already registered`);
    }

    const id = this.nextId++;
    const metadata: TypeMetadata<T> = {
      id,
      name,
      serializer,
      deserializer,
      fixedSize,
    };

    this.typesByName.set(name, metadata);
    this.typesById.set(id, metadata);

    logger.debug(`Registered type: ${name} (ID: ${id})`);

    return id;
  }

  /**
   * Gets type metadata by name.
   *
   * @param name - Type name
   * @returns Type metadata or undefined
   */
  static getByName(name: string): TypeMetadata | undefined {
    return this.typesByName.get(name);
  }

  /**
   * Gets type metadata by ID.
   *
   * @param id - Type ID
   * @returns Type metadata or undefined
   */
  static getById(id: number): TypeMetadata | undefined {
    return this.typesById.get(id);
  }

  /**
   * Serializes a value with type information.
   *
   * @param typeName - Type name
   * @param value - Value to serialize
   * @returns Serialized buffer with type header
   *
   * @example
   * ```typescript
   * const buffer = TypeRegistry.serializeValue('Vector3', new Vector3(1, 2, 3));
   * ```
   */
  static serializeValue<T>(typeName: string, value: T): ArrayBuffer {
    const metadata = this.typesByName.get(typeName);
    if (!metadata) {
      throw new Error(`Unknown type: ${typeName}`);
    }

    // Allocate buffer with type ID header (2 bytes)
    const size = metadata.fixedSize > 0 ? metadata.fixedSize : 1024; // Estimate for variable size
    const buffer = new ArrayBuffer(size + 2);
    const view = new DataView(buffer);

    // Write type ID
    view.setUint16(0, metadata.id, true);

    // Write value
    const bytesWritten = metadata.serializer(value, view, 2);

    // Return properly sized buffer
    return buffer.slice(0, 2 + bytesWritten);
  }

  /**
   * Deserializes a value with type information.
   *
   * @param buffer - Buffer containing type header and data
   * @returns Tuple of [value, total bytes read]
   *
   * @example
   * ```typescript
   * const [vector, bytesRead] = TypeRegistry.deserializeValue(buffer);
   * ```
   */
  static deserializeValue<T>(buffer: ArrayBuffer): [T, number] {
    const view = new DataView(buffer);

    // Read type ID
    const typeId = view.getUint16(0, true);

    const metadata = this.typesById.get(typeId);
    if (!metadata) {
      throw new Error(`Unknown type ID: ${typeId}`);
    }

    // Deserialize value
    const [value, bytesRead] = metadata.deserializer(view, 2);

    return [value, 2 + bytesRead];
  }

  /**
   * Clears all registered types (for testing).
   * @internal
   */
  static clear(): void {
    this.nextId = 1;
    this.typesByName.clear();
    this.typesById.clear();
  }
}

/**
 * Advanced network serialization utilities.
 * Provides helpers for common serialization patterns.
 */
export class NetworkSerializer {
  /**
   * Serializes a string with length prefix.
   *
   * @param str - String to serialize
   * @param view - DataView to write to
   * @param offset - Offset to start writing
   * @returns Number of bytes written
   */
  static writeString(str: string, view: DataView, offset: number): number {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);

    // Write length (2 bytes)
    view.setUint16(offset, encoded.length, true);

    // Write bytes
    const target = new Uint8Array(view.buffer, view.byteOffset + offset + 2);
    target.set(encoded);

    return 2 + encoded.length;
  }

  /**
   * Deserializes a string with length prefix.
   *
   * @param view - DataView to read from
   * @param offset - Offset to start reading
   * @returns Tuple of [string, bytes read]
   */
  static readString(view: DataView, offset: number): [string, number] {
    const length = view.getUint16(offset, true);
    const decoder = new TextDecoder();
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset + 2, length);
    const str = decoder.decode(bytes);

    return [str, 2 + length];
  }

  /**
   * Serializes a Vector3.
   *
   * @param v - Vector to serialize
   * @param view - DataView to write to
   * @param offset - Offset to start writing
   * @returns Number of bytes written (12)
   */
  static writeVector3(v: Vector3, view: DataView, offset: number): number {
    view.setFloat32(offset, v.x, true);
    view.setFloat32(offset + 4, v.y, true);
    view.setFloat32(offset + 8, v.z, true);
    return 12;
  }

  /**
   * Deserializes a Vector3.
   *
   * @param view - DataView to read from
   * @param offset - Offset to start reading
   * @returns Tuple of [Vector3, bytes read]
   */
  static readVector3(view: DataView, offset: number): [Vector3, number] {
    const x = view.getFloat32(offset, true);
    const y = view.getFloat32(offset + 4, true);
    const z = view.getFloat32(offset + 8, true);
    return [new Vector3(x, y, z), 12];
  }

  /**
   * Serializes an array with type information.
   *
   * @param array - Array to serialize
   * @param elementNetworkSerializer - Function to serialize each element
   * @param view - DataView to write to
   * @param offset - Offset to start writing
   * @returns Number of bytes written
   *
   * @example
   * ```typescript
   * const bytesWritten = NetworkSerializer.writeArray(
   *   numbers,
   *   (n, v, o) => { v.setFloat32(o, n, true); return 4; },
   *   view,
   *   offset
   * );
   * ```
   */
  static writeArray<T>(
    array: T[],
    elementNetworkSerializer: (item: T, view: DataView, offset: number) => number,
    view: DataView,
    offset: number
  ): number {
    // Write length (2 bytes)
    view.setUint16(offset, array.length, true);
    let currentOffset = offset + 2;

    // Write elements
    for (const item of array) {
      const bytesWritten = elementNetworkSerializer(item, view, currentOffset);
      currentOffset += bytesWritten;
    }

    return currentOffset - offset;
  }

  /**
   * Deserializes an array with type information.
   *
   * @param elementDeserializer - Function to deserialize each element
   * @param view - DataView to read from
   * @param offset - Offset to start reading
   * @returns Tuple of [array, bytes read]
   *
   * @example
   * ```typescript
   * const [numbers, bytesRead] = NetworkSerializer.readArray(
   *   (v, o) => [v.getFloat32(o, true), 4],
   *   view,
   *   offset
   * );
   * ```
   */
  static readArray<T>(
    elementDeserializer: (view: DataView, offset: number) => [T, number],
    view: DataView,
    offset: number
  ): [T[], number] {
    // Read length
    const length = view.getUint16(offset, true);
    let currentOffset = offset + 2;

    const array: T[] = [];

    // Read elements
    for (let i = 0; i < length; i++) {
      const [item, bytesRead] = elementDeserializer(view, currentOffset);
      array.push(item);
      currentOffset += bytesRead;
    }

    return [array, currentOffset - offset];
  }

  /**
   * Serializes a Map with type information.
   *
   * @param map - Map to serialize
   * @param keyNetworkSerializer - Function to serialize keys
   * @param valueNetworkSerializer - Function to serialize values
   * @param view - DataView to write to
   * @param offset - Offset to start writing
   * @returns Number of bytes written
   */
  static writeMap<K, V>(
    map: Map<K, V>,
    keyNetworkSerializer: (key: K, view: DataView, offset: number) => number,
    valueNetworkSerializer: (value: V, view: DataView, offset: number) => number,
    view: DataView,
    offset: number
  ): number {
    // Write size (2 bytes)
    view.setUint16(offset, map.size, true);
    let currentOffset = offset + 2;

    // Write entries
    for (const [key, value] of map) {
      const keyBytes = keyNetworkSerializer(key, view, currentOffset);
      currentOffset += keyBytes;

      const valueBytes = valueNetworkSerializer(value, view, currentOffset);
      currentOffset += valueBytes;
    }

    return currentOffset - offset;
  }

  /**
   * Deserializes a Map with type information.
   *
   * @param keyDeserializer - Function to deserialize keys
   * @param valueDeserializer - Function to deserialize values
   * @param view - DataView to read from
   * @param offset - Offset to start reading
   * @returns Tuple of [map, bytes read]
   */
  static readMap<K, V>(
    keyDeserializer: (view: DataView, offset: number) => [K, number],
    valueDeserializer: (view: DataView, offset: number) => [V, number],
    view: DataView,
    offset: number
  ): [Map<K, V>, number] {
    // Read size
    const size = view.getUint16(offset, true);
    let currentOffset = offset + 2;

    const map = new Map<K, V>();

    // Read entries
    for (let i = 0; i < size; i++) {
      const [key, keyBytes] = keyDeserializer(view, currentOffset);
      currentOffset += keyBytes;

      const [value, valueBytes] = valueDeserializer(view, currentOffset);
      currentOffset += valueBytes;

      map.set(key, value);
    }

    return [map, currentOffset - offset];
  }

  /**
   * Serializes a boolean.
   *
   * @param value - Boolean value
   * @param view - DataView to write to
   * @param offset - Offset to start writing
   * @returns Number of bytes written (1)
   */
  static writeBoolean(value: boolean, view: DataView, offset: number): number {
    view.setUint8(offset, value ? 1 : 0);
    return 1;
  }

  /**
   * Deserializes a boolean.
   *
   * @param view - DataView to read from
   * @param offset - Offset to start reading
   * @returns Tuple of [boolean, bytes read]
   */
  static readBoolean(view: DataView, offset: number): [boolean, number] {
    return [view.getUint8(offset) !== 0, 1];
  }
}

/**
 * JSON serializer for complex objects.
 * Provides JSON serialization as an alternative to binary for debugging or compatibility.
 */
export class JSONNetworkSerializer {
  /**
   * Serializes an object to JSON bytes.
   *
   * @param obj - Object to serialize
   * @returns ArrayBuffer containing UTF-8 JSON
   *
   * @example
   * ```typescript
   * const buffer = JSONNetworkSerializer.serialize({ x: 1, y: 2 });
   * ```
   */
  static serialize(obj: any): ArrayBuffer {
    const json = JSON.stringify(obj);
    const encoder = new TextEncoder();
    return encoder.encode(json).buffer;
  }

  /**
   * Deserializes an object from JSON bytes.
   *
   * @param buffer - ArrayBuffer containing UTF-8 JSON
   * @returns Deserialized object
   *
   * @example
   * ```typescript
   * const obj = JSONNetworkSerializer.deserialize(buffer);
   * ```
   */
  static deserialize<T = any>(buffer: ArrayBuffer): T {
    const decoder = new TextDecoder();
    const json = decoder.decode(buffer);
    return JSON.parse(json);
  }
}

// Register built-in types
TypeRegistry.register(
  'string',
  NetworkSerializer.writeString,
  NetworkSerializer.readString
);

TypeRegistry.register(
  'Vector3',
  NetworkSerializer.writeVector3,
  NetworkSerializer.readVector3,
  12
);

TypeRegistry.register(
  'boolean',
  NetworkSerializer.writeBoolean,
  NetworkSerializer.readBoolean,
  1
);

TypeRegistry.register(
  'float32',
  (v: number, view: DataView, offset: number) => {
    view.setFloat32(offset, v, true);
    return 4;
  },
  (view: DataView, offset: number) => [view.getFloat32(offset, true), 4],
  4
);

TypeRegistry.register(
  'uint32',
  (v: number, view: DataView, offset: number) => {
    view.setUint32(offset, v, true);
    return 4;
  },
  (view: DataView, offset: number) => [view.getUint32(offset, true), 4],
  4
);
