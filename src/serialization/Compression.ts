import { Logger } from '../core/Logger';

const logger = Logger.create('Compression');

/**
 * Compression algorithm
 */
export enum CompressionAlgorithm {
  /** GZIP compression */
  GZIP = 'gzip',
  /** DEFLATE compression */
  DEFLATE = 'deflate',
  /** No compression */
  NONE = 'none'
}

/**
 * Compression options
 */
export interface CompressionOptions {
  /** Compression algorithm */
  algorithm?: CompressionAlgorithm;
  /** Compression level (1-9) */
  level?: number;
}

/**
 * Data compression for smaller saves
 * Uses browser's native CompressionStream API
 */
export class Compression {
  /**
   * Compresses data
   */
  static async compress(
    data: ArrayBuffer,
    options: CompressionOptions = {}
  ): Promise<ArrayBuffer> {
    const algorithm = options.algorithm || CompressionAlgorithm.GZIP;

    if (algorithm === CompressionAlgorithm.NONE) {
      return data;
    }

    if (!('CompressionStream' in window)) {
      logger.warn('CompressionStream not available, returning uncompressed data');
      return data;
    }

    try {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(data));
          controller.close();
        }
      });

      const compressedStream = stream.pipeThrough(
        new CompressionStream(algorithm as 'gzip' | 'deflate')
      );

      const chunks: Uint8Array[] = [];
      const reader = compressedStream.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      const ratio = ((1 - result.length / data.byteLength) * 100).toFixed(1);
      logger.debug(`Compressed ${data.byteLength} -> ${result.length} bytes (${ratio}% reduction)`);

      return result.buffer;
    } catch (error) {
      logger.error('Compression failed', error);
      return data;
    }
  }

  /**
   * Decompresses data
   */
  static async decompress(
    data: ArrayBuffer,
    options: CompressionOptions = {}
  ): Promise<ArrayBuffer> {
    const algorithm = options.algorithm || CompressionAlgorithm.GZIP;

    if (algorithm === CompressionAlgorithm.NONE) {
      return data;
    }

    if (!('DecompressionStream' in window)) {
      logger.warn('DecompressionStream not available, assuming uncompressed data');
      return data;
    }

    try {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(data));
          controller.close();
        }
      });

      const decompressedStream = stream.pipeThrough(
        new DecompressionStream(algorithm as 'gzip' | 'deflate')
      );

      const chunks: Uint8Array[] = [];
      const reader = decompressedStream.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      logger.debug(`Decompressed ${data.byteLength} -> ${result.length} bytes`);

      return result.buffer;
    } catch (error) {
      logger.error('Decompression failed', error);
      throw error;
    }
  }

  /**
   * Estimates compression ratio
   */
  static async estimateRatio(data: ArrayBuffer): Promise<number> {
    const compressed = await this.compress(data);
    return compressed.byteLength / data.byteLength;
  }
}
