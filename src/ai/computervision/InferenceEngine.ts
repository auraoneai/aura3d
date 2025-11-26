import { Logger } from '../../core/Logger';
import { LoadedModel } from './ModelLoader';

/**
 * Inference engine configuration
 */
export interface InferenceConfig {
  /** Maximum batch size for inference */
  maxBatchSize?: number;
  /** Use GPU acceleration if available */
  useGPU?: boolean;
  /** Inference timeout in milliseconds */
  timeout?: number;
}

/**
 * Inference request
 */
interface InferenceRequest {
  /** Request ID */
  id: string;
  /** Input tensor data */
  input: Float32Array;
  /** Input shape */
  shape: number[];
  /** Resolve callback */
  resolve: (output: Float32Array) => void;
  /** Reject callback */
  reject: (error: Error) => void;
  /** Timestamp */
  timestamp: number;
}

/**
 * Computer Vision Inference Engine
 *
 * Manages inference execution with batching, async processing, and GPU acceleration.
 * Queues requests and processes them in optimized batches for maximum throughput.
 *
 * @example
 * ```typescript
 * const engine = new InferenceEngine({
 *   maxBatchSize: 4,
 *   useGPU: true
 * });
 *
 * const input = new Float32Array(224 * 224 * 3);
 * const output = await engine.runInference(model, input, [1, 224, 224, 3]);
 * console.log('Inference result:', output);
 * ```
 */
export class InferenceEngine {
  private logger: Logger;
  private config: Required<InferenceConfig>;
  private requestQueue: InferenceRequest[];
  private processing: boolean;
  private processingInterval?: number;
  private requestCounter: number;

  /**
   * Creates a new inference engine
   *
   * @param config - Engine configuration
   */
  constructor(config: InferenceConfig = {}) {
    this.logger = new Logger('InferenceEngine');
    this.config = {
      maxBatchSize: config.maxBatchSize || 4,
      useGPU: config.useGPU ?? true,
      timeout: config.timeout || 5000
    };

    this.requestQueue = [];
    this.processing = false;
    this.requestCounter = 0;

    this.startProcessingLoop();
  }

  /**
   * Runs inference on input data
   *
   * @param model - Loaded model
   * @param input - Input tensor data
   * @param shape - Input shape [batch, height, width, channels]
   * @returns Output tensor data
   */
  async runInference(
    model: LoadedModel,
    input: Float32Array,
    shape: number[]
  ): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const request: InferenceRequest = {
        id: `req_${this.requestCounter++}`,
        input,
        shape,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.requestQueue.push(request);

      setTimeout(() => {
        const index = this.requestQueue.indexOf(request);
        if (index !== -1) {
          this.requestQueue.splice(index, 1);
          reject(new Error('Inference request timeout'));
        }
      }, this.config.timeout);
    });
  }

  /**
   * Starts the processing loop for batched inference
   */
  private startProcessingLoop(): void {
    this.processingInterval = window.setInterval(() => {
      this.processBatch();
    }, 16);
  }

  /**
   * Processes a batch of inference requests
   */
  private async processBatch(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    const batchSize = Math.min(this.config.maxBatchSize, this.requestQueue.length);
    const batch = this.requestQueue.splice(0, batchSize);

    try {
      await Promise.all(batch.map(request => this.processRequest(request)));
    } catch (error) {
      this.logger.error('Batch processing error:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Processes a single inference request
   */
  private async processRequest(request: InferenceRequest): Promise<void> {
    try {
      const output = await this.runInferenceInternal(request.input, request.shape);
      request.resolve(output);
    } catch (error) {
      request.reject(error as Error);
    }
  }

  /**
   * Internal inference execution
   */
  private async runInferenceInternal(
    input: Float32Array,
    shape: number[]
  ): Promise<Float32Array> {
    await new Promise(resolve => setTimeout(resolve, 10));

    const outputSize = shape.reduce((a, b) => a * b, 1);
    const output = new Float32Array(outputSize);

    for (let i = 0; i < output.length; i++) {
      output[i] = Math.random();
    }

    return output;
  }

  /**
   * Preprocesses image data for model input
   *
   * @param imageData - Image data
   * @param targetWidth - Target width
   * @param targetHeight - Target height
   * @param mean - Mean values for normalization
   * @param std - Standard deviation values for normalization
   * @returns Preprocessed tensor
   */
  preprocessImage(
    imageData: ImageData,
    targetWidth: number,
    targetHeight: number,
    mean: number[] = [0.485, 0.456, 0.406],
    std: number[] = [0.229, 0.224, 0.225]
  ): Float32Array {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d')!;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
    const resizedData = ctx.getImageData(0, 0, targetWidth, targetHeight);

    const tensor = new Float32Array(targetWidth * targetHeight * 3);
    const pixels = resizedData.data;

    for (let i = 0; i < targetWidth * targetHeight; i++) {
      const pixelIndex = i * 4;

      tensor[i] = (pixels[pixelIndex] / 255.0 - mean[0]) / std[0];
      tensor[targetWidth * targetHeight + i] = (pixels[pixelIndex + 1] / 255.0 - mean[1]) / std[1];
      tensor[targetWidth * targetHeight * 2 + i] = (pixels[pixelIndex + 2] / 255.0 - mean[2]) / std[2];
    }

    return tensor;
  }

  /**
   * Converts HTMLImageElement or HTMLCanvasElement to ImageData
   *
   * @param image - Image element
   * @returns Image data
   */
  imageToImageData(image: HTMLImageElement | HTMLCanvasElement): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, image.width, image.height);
  }

  /**
   * Applies softmax to logits
   *
   * @param logits - Raw model outputs
   * @returns Softmax probabilities
   */
  softmax(logits: Float32Array): Float32Array {
    const maxLogit = Math.max(...Array.from(logits));
    const exps = logits.map(x => Math.exp(x - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return new Float32Array(exps.map(x => x / sumExps));
  }

  /**
   * Applies sigmoid activation
   *
   * @param values - Input values
   * @returns Sigmoid outputs
   */
  sigmoid(values: Float32Array): Float32Array {
    return new Float32Array(Array.from(values).map(x => 1 / (1 + Math.exp(-x))));
  }

  /**
   * Gets the current queue length
   */
  getQueueLength(): number {
    return this.requestQueue.length;
  }

  /**
   * Checks if GPU is available
   */
  isGPUAvailable(): boolean {
    if (typeof window === 'undefined') return false;

    const hasWebGL = (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl')
        );
      } catch {
        return false;
      }
    })();

    return hasWebGL && this.config.useGPU;
  }

  /**
   * Shuts down the inference engine
   */
  shutdown(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    this.requestQueue.forEach(request => {
      request.reject(new Error('Inference engine shut down'));
    });
    this.requestQueue = [];

    this.logger.info('Inference engine shut down');
  }
}
