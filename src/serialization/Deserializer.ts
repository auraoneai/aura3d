import { Serializer, SerializationFormat } from './Serializer';
import { Logger } from '../core/Logger';

const logger = Logger.create('Deserializer');

/**
 * Deserialization options
 */
export interface DeserializationOptions {
  /** Serialization format */
  format?: SerializationFormat;
  /** Strict mode - throw on unknown types */
  strict?: boolean;
  /** Type validation */
  validate?: boolean;
}

/**
 * Deserialization result
 */
export interface DeserializationResult<T = any> {
  /** Deserialized data */
  data: T;
  /** Warnings encountered during deserialization */
  warnings: string[];
  /** Errors encountered (in non-strict mode) */
  errors: string[];
}

/**
 * Deserializer with validation and error handling
 */
export class Deserializer {
  /**
   * Deserializes data with options
   */
  static deserialize<T = any>(
    data: any,
    options: DeserializationOptions = {}
  ): DeserializationResult<T> {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      const format = options.format || SerializationFormat.JSON;
      const deserialized = Serializer.deserialize(data, format) as T;

      return {
        data: deserialized,
        warnings,
        errors
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Deserialization failed', error);

      if (options.strict) {
        throw error;
      }

      errors.push(message);

      return {
        data: null as any,
        warnings,
        errors
      };
    }
  }

  /**
   * Deserializes from JSON string
   */
  static fromJSON<T = any>(
    json: string,
    options: DeserializationOptions = {}
  ): DeserializationResult<T> {
    try {
      const parsed = JSON.parse(json);
      return this.deserialize<T>(parsed, {
        ...options,
        format: SerializationFormat.JSON
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('JSON parsing failed', error);

      if (options.strict) {
        throw error;
      }

      return {
        data: null as any,
        warnings: [],
        errors: [message]
      };
    }
  }

  /**
   * Deserializes from binary data
   */
  static fromBinary<T = any>(
    buffer: ArrayBuffer,
    options: DeserializationOptions = {}
  ): DeserializationResult<T> {
    try {
      const data = this.decodeBinary(buffer);
      return this.deserialize<T>(data, {
        ...options,
        format: SerializationFormat.BINARY
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Binary deserialization failed', error);

      if (options.strict) {
        throw error;
      }

      return {
        data: null as any,
        warnings: [],
        errors: [message]
      };
    }
  }

  /**
   * Decodes binary data (simplified)
   */
  private static decodeBinary(buffer: ArrayBuffer): any {
    const decoder = new TextDecoder();
    const json = decoder.decode(buffer);
    return JSON.parse(json);
  }
}
