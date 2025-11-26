import { Serializer } from './Serializer';
import { Logger } from '../core/Logger';

const logger = Logger.create('JSONSerializer');

/**
 * JSON serialization options
 */
export interface JSONSerializationOptions {
  /** Pretty print with indentation */
  pretty?: boolean;
  /** Indentation spaces */
  indent?: number;
  /** Include type information */
  includeTypes?: boolean;
}

/**
 * JSON serializer with type preservation
 */
export class JSONSerializer {
  /**
   * Serializes data to JSON string
   */
  static stringify(data: any, options: JSONSerializationOptions = {}): string {
    try {
      const serialized = Serializer.serialize(data);

      if (options.pretty) {
        return JSON.stringify(serialized, null, options.indent || 2);
      }

      return JSON.stringify(serialized);
    } catch (error) {
      logger.error('JSON serialization failed', error);
      throw error;
    }
  }

  /**
   * Deserializes JSON string to data
   */
  static parse(json: string): any {
    try {
      const parsed = JSON.parse(json);
      return Serializer.deserialize(parsed);
    } catch (error) {
      logger.error('JSON deserialization failed', error);
      throw error;
    }
  }

  /**
   * Creates a deep clone using JSON serialization
   */
  static clone<T>(data: T): T {
    const json = this.stringify(data);
    return this.parse(json);
  }
}
