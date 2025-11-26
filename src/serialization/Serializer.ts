import { Logger } from '../core/Logger';

const logger = Logger.create('Serializer');

/**
 * Serialization format
 */
export enum SerializationFormat {
  JSON = 'json',
  BINARY = 'binary',
  MSGPACK = 'msgpack'
}

/**
 * Serializable interface
 */
export interface ISerializable {
  /**
   * Serializes the object to a plain object
   */
  serialize(): any;

  /**
   * Deserializes from a plain object
   */
  deserialize(data: any): void;
}

/**
 * Type serializer interface
 */
export interface ITypeSerializer<T = any> {
  /**
   * Gets the type name this serializer handles
   */
  getTypeName(): string;

  /**
   * Serializes a value
   */
  serialize(value: T): any;

  /**
   * Deserializes a value
   */
  deserialize(data: any): T;
}

/**
 * Serialization context
 */
export interface SerializationContext {
  /** Serialization format */
  format: SerializationFormat;
  /** Reference map for circular references */
  refs: Map<any, number>;
  /** Reference counter */
  refCounter: number;
  /** Custom serializers */
  serializers: Map<string, ITypeSerializer>;
}

/**
 * Serializer registry and core serialization logic
 */
export class Serializer {
  private static typeSerializers = new Map<string, ITypeSerializer>();
  private static typeConstructors = new Map<string, new (...args: any[]) => any>();

  /**
   * Registers a type serializer
   */
  static registerType<T>(
    typeName: string,
    serializer: ITypeSerializer<T>,
    constructor?: new (...args: any[]) => T
  ): void {
    this.typeSerializers.set(typeName, serializer);

    if (constructor) {
      this.typeConstructors.set(typeName, constructor);
    }

    logger.debug(`Registered type serializer: ${typeName}`);
  }

  /**
   * Unregisters a type serializer
   */
  static unregisterType(typeName: string): void {
    this.typeSerializers.delete(typeName);
    this.typeConstructors.delete(typeName);
  }

  /**
   * Gets a type serializer
   */
  static getTypeSerializer(typeName: string): ITypeSerializer | undefined {
    return this.typeSerializers.get(typeName);
  }

  /**
   * Gets a type constructor
   */
  static getTypeConstructor(typeName: string): (new (...args: any[]) => any) | undefined {
    return this.typeConstructors.get(typeName);
  }

  /**
   * Serializes a value
   */
  static serialize(value: any, format: SerializationFormat = SerializationFormat.JSON): any {
    const context: SerializationContext = {
      format,
      refs: new Map(),
      refCounter: 0,
      serializers: this.typeSerializers
    };

    return this.serializeValue(value, context);
  }

  /**
   * Deserializes a value
   */
  static deserialize(data: any, format: SerializationFormat = SerializationFormat.JSON): any {
    const context: SerializationContext = {
      format,
      refs: new Map(),
      refCounter: 0,
      serializers: this.typeSerializers
    };

    return this.deserializeValue(data, context);
  }

  /**
   * Serializes a single value
   */
  private static serializeValue(value: any, context: SerializationContext): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (context.refs.has(value)) {
      return { $ref: context.refs.get(value) };
    }

    if (typeof value === 'object') {
      const refId = context.refCounter++;
      context.refs.set(value, refId);
    }

    if (typeof value === 'function') {
      return undefined;
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (value instanceof Date) {
      return { $type: 'Date', value: value.toISOString() };
    }

    if (value instanceof RegExp) {
      return { $type: 'RegExp', source: value.source, flags: value.flags };
    }

    if (value instanceof Map) {
      return {
        $type: 'Map',
        entries: Array.from(value.entries()).map(([k, v]) => [
          this.serializeValue(k, context),
          this.serializeValue(v, context)
        ])
      };
    }

    if (value instanceof Set) {
      return {
        $type: 'Set',
        values: Array.from(value).map(v => this.serializeValue(v, context))
      };
    }

    if (ArrayBuffer.isView(value)) {
      return {
        $type: value.constructor.name,
        data: Array.from(value as any)
      };
    }

    if (value instanceof ArrayBuffer) {
      return {
        $type: 'ArrayBuffer',
        data: Array.from(new Uint8Array(value))
      };
    }

    const typeName = value.constructor?.name;
    const serializer = typeName ? this.typeSerializers.get(typeName) : undefined;

    if (serializer) {
      return {
        $type: typeName,
        data: serializer.serialize(value)
      };
    }

    if (typeof value.serialize === 'function') {
      return {
        $type: typeName,
        data: value.serialize()
      };
    }

    if (Array.isArray(value)) {
      return value.map(item => this.serializeValue(item, context));
    }

    const result: any = {};

    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        const serialized = this.serializeValue(value[key], context);
        if (serialized !== undefined) {
          result[key] = serialized;
        }
      }
    }

    return result;
  }

  /**
   * Deserializes a single value
   */
  private static deserializeValue(data: any, context: SerializationContext): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data !== 'object') {
      return data;
    }

    if (data.$ref !== undefined) {
      return context.refs.get(data.$ref);
    }

    if (data.$type) {
      const refId = context.refCounter++;

      switch (data.$type) {
        case 'Date': {
          const date = new Date(data.value);
          (context.refs as any).set(refId, date);
          return date;
        }

        case 'RegExp': {
          const regexp = new RegExp(data.source, data.flags);
          (context.refs as any).set(refId, regexp);
          return regexp;
        }

        case 'Map': {
          const map = new Map();
          (context.refs as any).set(refId, map);
          for (const [k, v] of data.entries) {
            map.set(
              this.deserializeValue(k, context),
              this.deserializeValue(v, context)
            );
          }
          return map;
        }

        case 'Set': {
          const set = new Set();
          (context.refs as any).set(refId, set);
          for (const v of data.values) {
            set.add(this.deserializeValue(v, context));
          }
          return set;
        }

        case 'ArrayBuffer': {
          const buffer = new Uint8Array(data.data).buffer;
          (context.refs as any).set(refId, buffer);
          return buffer;
        }

        case 'Uint8Array':
        case 'Uint16Array':
        case 'Uint32Array':
        case 'Int8Array':
        case 'Int16Array':
        case 'Int32Array':
        case 'Float32Array':
        case 'Float64Array': {
          const TypedArrayConstructor = (globalThis as any)[data.$type];
          if (TypedArrayConstructor) {
            const typedArray = new TypedArrayConstructor(data.data);
            (context.refs as any).set(refId, typedArray);
            return typedArray;
          }
          return null;
        }

        default: {
          const serializer = this.typeSerializers.get(data.$type);
          if (serializer) {
            const instance = serializer.deserialize(data.data);
            (context.refs as any).set(refId, instance);
            return instance;
          }

          const constructor = this.typeConstructors.get(data.$type);
          if (constructor) {
            const instance = new constructor();
            (context.refs as any).set(refId, instance);

            if (typeof instance.deserialize === 'function') {
              instance.deserialize(data.data);
            } else {
              Object.assign(instance, this.deserializeValue(data.data, context));
            }

            return instance;
          }

          logger.warn(`Unknown type: ${data.$type}`);
          return data.data;
        }
      }
    }

    if (Array.isArray(data)) {
      return data.map(item => this.deserializeValue(item, context));
    }

    const result: any = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        result[key] = this.deserializeValue(data[key], context);
      }
    }

    return result;
  }

  /**
   * Clears all registered types
   */
  static clear(): void {
    this.typeSerializers.clear();
    this.typeConstructors.clear();
  }
}
