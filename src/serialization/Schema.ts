import { Logger } from '../core/Logger';

const logger = Logger.create('Schema');

/**
 * Field type enumeration
 */
export enum FieldType {
  BOOLEAN = 'boolean',
  INT8 = 'int8',
  INT16 = 'int16',
  INT32 = 'int32',
  UINT8 = 'uint8',
  UINT16 = 'uint16',
  UINT32 = 'uint32',
  FLOAT32 = 'float32',
  FLOAT64 = 'float64',
  STRING = 'string',
  ARRAY = 'array',
  OBJECT = 'object'
}

/**
 * Schema field definition
 */
export interface SchemaField {
  /** Field name */
  name: string;
  /** Field type */
  type: FieldType;
  /** Required field */
  required?: boolean;
  /** Default value */
  default?: any;
  /** Array element type */
  elementType?: FieldType;
  /** Nested schema for objects */
  schema?: Schema;
}

/**
 * Serialization schema for optimization
 * Defines data structure for efficient serialization
 */
export class Schema {
  private fields: Map<string, SchemaField> = new Map();
  private name: string;

  /**
   * Creates a new schema
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Gets the schema name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Adds a field to the schema
   */
  addField(field: SchemaField): void {
    this.fields.set(field.name, field);
  }

  /**
   * Gets a field definition
   */
  getField(name: string): SchemaField | undefined {
    return this.fields.get(name);
  }

  /**
   * Gets all fields
   */
  getFields(): SchemaField[] {
    return Array.from(this.fields.values());
  }

  /**
   * Validates data against schema
   */
  validate(data: any): boolean {
    for (const field of this.fields.values()) {
      const value = data[field.name];

      if (field.required && value === undefined) {
        logger.error(`Missing required field: ${field.name}`);
        return false;
      }

      if (value !== undefined) {
        if (!this.validateType(value, field.type)) {
          logger.error(`Invalid type for field ${field.name}: expected ${field.type}`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validates a value type
   */
  private validateType(value: any, type: FieldType): boolean {
    switch (type) {
      case FieldType.BOOLEAN:
        return typeof value === 'boolean';

      case FieldType.INT8:
      case FieldType.INT16:
      case FieldType.INT32:
      case FieldType.UINT8:
      case FieldType.UINT16:
      case FieldType.UINT32:
        return typeof value === 'number' && Number.isInteger(value);

      case FieldType.FLOAT32:
      case FieldType.FLOAT64:
        return typeof value === 'number';

      case FieldType.STRING:
        return typeof value === 'string';

      case FieldType.ARRAY:
        return Array.isArray(value);

      case FieldType.OBJECT:
        return typeof value === 'object' && value !== null;

      default:
        return false;
    }
  }

  /**
   * Serializes data using schema
   */
  serialize(data: any): any {
    const result: any = {};

    for (const field of this.fields.values()) {
      const value = data[field.name];

      if (value !== undefined) {
        result[field.name] = value;
      } else if (field.default !== undefined) {
        result[field.name] = field.default;
      }
    }

    return result;
  }

  /**
   * Deserializes data using schema
   */
  deserialize(data: any): any {
    const result: any = {};

    for (const field of this.fields.values()) {
      const value = data[field.name];

      if (value !== undefined) {
        result[field.name] = value;
      } else if (field.default !== undefined) {
        result[field.name] = field.default;
      }
    }

    return result;
  }

  /**
   * Creates a builder for fluent schema creation
   */
  static builder(name: string): SchemaBuilder {
    return new SchemaBuilder(name);
  }
}

/**
 * Schema builder for fluent API
 */
export class SchemaBuilder {
  private schema: Schema;

  constructor(name: string) {
    this.schema = new Schema(name);
  }

  /**
   * Adds a boolean field
   */
  boolean(name: string, required?: boolean, defaultValue?: boolean): this {
    this.schema.addField({
      name,
      type: FieldType.BOOLEAN,
      required,
      default: defaultValue
    });
    return this;
  }

  /**
   * Adds an integer field
   */
  int32(name: string, required?: boolean, defaultValue?: number): this {
    this.schema.addField({
      name,
      type: FieldType.INT32,
      required,
      default: defaultValue
    });
    return this;
  }

  /**
   * Adds a float field
   */
  float32(name: string, required?: boolean, defaultValue?: number): this {
    this.schema.addField({
      name,
      type: FieldType.FLOAT32,
      required,
      default: defaultValue
    });
    return this;
  }

  /**
   * Adds a string field
   */
  string(name: string, required?: boolean, defaultValue?: string): this {
    this.schema.addField({
      name,
      type: FieldType.STRING,
      required,
      default: defaultValue
    });
    return this;
  }

  /**
   * Adds an array field
   */
  array(name: string, elementType: FieldType, required?: boolean): this {
    this.schema.addField({
      name,
      type: FieldType.ARRAY,
      elementType,
      required
    });
    return this;
  }

  /**
   * Adds an object field
   */
  object(name: string, schema: Schema, required?: boolean): this {
    this.schema.addField({
      name,
      type: FieldType.OBJECT,
      schema,
      required
    });
    return this;
  }

  /**
   * Builds the schema
   */
  build(): Schema {
    return this.schema;
  }
}
