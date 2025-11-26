import { Logger } from '../../core/Logger';

/**
 * Supported model formats
 */
export enum ModelFormat {
  ONNX = 'onnx',
  TFJS = 'tfjs',
  UNKNOWN = 'unknown'
}

/**
 * Model metadata
 */
export interface ModelMetadata {
  /** Model name */
  name: string;
  /** Model type (classification, detection, etc.) */
  type: string;
  /** Model format */
  format: ModelFormat;
  /** Input shape [batch, height, width, channels] */
  inputShape: number[];
  /** Output shape */
  outputShape: number[];
  /** Class labels */
  labels?: string[];
  /** Preprocessing mean values */
  mean?: number[];
  /** Preprocessing std values */
  std?: number[];
}

/**
 * Loaded model container
 */
export interface LoadedModel {
  /** Model metadata */
  metadata: ModelMetadata;
  /** Model data (format-specific) */
  model: any;
  /** Model session or runtime */
  session?: any;
}

/**
 * Computer Vision Model Loader
 *
 * Handles loading and caching of computer vision models in various formats
 * including ONNX and TensorFlow.js. Provides model metadata and preprocessing
 * information.
 *
 * @example
 * ```typescript
 * const loader = new ModelLoader('/models');
 *
 * const model = await loader.loadModel('detection', 'yolov5');
 * console.log('Model loaded:', model.metadata.name);
 *
 * const cached = loader.getModel('detection', 'yolov5');
 * console.log('From cache:', cached !== undefined);
 * ```
 */
export class ModelLoader {
  private logger: Logger;
  private basePath: string;
  private modelCache: Map<string, LoadedModel>;
  private loadingPromises: Map<string, Promise<LoadedModel>>;

  /**
   * Creates a new model loader
   *
   * @param basePath - Base path for model files
   */
  constructor(basePath: string = '/models') {
    this.logger = new Logger('ModelLoader');
    this.basePath = basePath;
    this.modelCache = new Map();
    this.loadingPromises = new Map();
  }

  /**
   * Loads a computer vision model
   *
   * @param modelType - Type of model (classification, detection, pose, segmentation)
   * @param modelName - Name of the model
   * @returns Loaded model
   */
  async loadModel(modelType: string, modelName: string): Promise<LoadedModel> {
    const cacheKey = `${modelType}/${modelName}`;

    const cached = this.modelCache.get(cacheKey);
    if (cached) {
      this.logger.info(`Model loaded from cache: ${cacheKey}`);
      return cached;
    }

    const loading = this.loadingPromises.get(cacheKey);
    if (loading) {
      this.logger.info(`Waiting for model to load: ${cacheKey}`);
      return loading;
    }

    const loadPromise = this.loadModelInternal(modelType, modelName, cacheKey);
    this.loadingPromises.set(cacheKey, loadPromise);

    try {
      const model = await loadPromise;
      this.modelCache.set(cacheKey, model);
      return model;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }

  /**
   * Internal model loading implementation
   */
  private async loadModelInternal(
    modelType: string,
    modelName: string,
    cacheKey: string
  ): Promise<LoadedModel> {
    this.logger.info(`Loading model: ${cacheKey}`);

    const modelPath = `${this.basePath}/${modelType}/${modelName}`;
    const format = await this.detectModelFormat(modelPath);

    let model: LoadedModel;

    switch (format) {
      case ModelFormat.ONNX:
        model = await this.loadONNXModel(modelPath, modelType, modelName);
        break;
      case ModelFormat.TFJS:
        model = await this.loadTFJSModel(modelPath, modelType, modelName);
        break;
      default:
        model = this.createMockModel(modelType, modelName);
        this.logger.warn(`Model format unknown, using mock model: ${cacheKey}`);
        break;
    }

    this.logger.info(`Model loaded successfully: ${cacheKey}`);
    return model;
  }

  /**
   * Detects the model format based on available files
   */
  private async detectModelFormat(modelPath: string): Promise<ModelFormat> {
    try {
      const onnxResponse = await fetch(`${modelPath}/model.onnx`, { method: 'HEAD' });
      if (onnxResponse.ok) return ModelFormat.ONNX;
    } catch {}

    try {
      const tfjsResponse = await fetch(`${modelPath}/model.json`, { method: 'HEAD' });
      if (tfjsResponse.ok) return ModelFormat.TFJS;
    } catch {}

    return ModelFormat.UNKNOWN;
  }

  /**
   * Loads an ONNX model
   */
  private async loadONNXModel(
    modelPath: string,
    modelType: string,
    modelName: string
  ): Promise<LoadedModel> {
    let metadata: ModelMetadata;
    let session: any;

    try {
      const metadataResponse = await fetch(`${modelPath}/metadata.json`);
      if (metadataResponse.ok) {
        metadata = await metadataResponse.json();
      } else {
        metadata = this.getDefaultMetadata(modelType, modelName, ModelFormat.ONNX);
      }

      if (typeof window !== 'undefined' && (window as any).ort) {
        const ort = (window as any).ort;
        session = await ort.InferenceSession.create(`${modelPath}/model.onnx`);
        this.logger.info(`ONNX Runtime session created: ${modelName}`);
      } else {
        this.logger.warn('ONNX Runtime not available, model will use mock inference');
      }
    } catch (error) {
      this.logger.warn(`Failed to load ONNX model metadata: ${error}`);
      metadata = this.getDefaultMetadata(modelType, modelName, ModelFormat.ONNX);
    }

    return {
      metadata,
      model: null,
      session
    };
  }

  /**
   * Loads a TensorFlow.js model
   */
  private async loadTFJSModel(
    modelPath: string,
    modelType: string,
    modelName: string
  ): Promise<LoadedModel> {
    let metadata: ModelMetadata;
    let model: any;

    try {
      const metadataResponse = await fetch(`${modelPath}/metadata.json`);
      if (metadataResponse.ok) {
        metadata = await metadataResponse.json();
      } else {
        metadata = this.getDefaultMetadata(modelType, modelName, ModelFormat.TFJS);
      }

      if (typeof window !== 'undefined' && (window as any).tf) {
        const tf = (window as any).tf;
        model = await tf.loadGraphModel(`${modelPath}/model.json`);
        this.logger.info(`TensorFlow.js model loaded: ${modelName}`);
      } else {
        this.logger.warn('TensorFlow.js not available, model will use mock inference');
      }
    } catch (error) {
      this.logger.warn(`Failed to load TFJS model: ${error}`);
      metadata = this.getDefaultMetadata(modelType, modelName, ModelFormat.TFJS);
    }

    return {
      metadata,
      model
    };
  }

  /**
   * Creates a mock model for cases where actual model files are not available
   */
  private createMockModel(modelType: string, modelName: string): LoadedModel {
    const metadata = this.getDefaultMetadata(modelType, modelName, ModelFormat.UNKNOWN);

    return {
      metadata,
      model: null
    };
  }

  /**
   * Gets default metadata for a model type
   */
  private getDefaultMetadata(
    modelType: string,
    modelName: string,
    format: ModelFormat
  ): ModelMetadata {
    const baseMetadata: ModelMetadata = {
      name: modelName,
      type: modelType,
      format,
      inputShape: [1, 224, 224, 3],
      outputShape: [1, 1000],
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225]
    };

    switch (modelType) {
      case 'classification':
        return {
          ...baseMetadata,
          labels: this.getImageNetLabels()
        };

      case 'detection':
        return {
          ...baseMetadata,
          inputShape: [1, 640, 640, 3],
          outputShape: [1, 25200, 85],
          labels: this.getCOCOLabels()
        };

      case 'pose':
        return {
          ...baseMetadata,
          inputShape: [1, 257, 257, 3],
          outputShape: [1, 17, 3]
        };

      case 'segmentation':
        return {
          ...baseMetadata,
          inputShape: [1, 513, 513, 3],
          outputShape: [1, 513, 513, 21],
          labels: this.getPascalVOCLabels()
        };

      default:
        return baseMetadata;
    }
  }

  /**
   * Gets a cached model
   *
   * @param modelType - Type of model
   * @param modelName - Name of the model
   * @returns Cached model or undefined
   */
  getModel(modelType: string, modelName: string): LoadedModel | undefined {
    const cacheKey = `${modelType}/${modelName}`;
    return this.modelCache.get(cacheKey);
  }

  /**
   * Clears the model cache
   */
  clearCache(): void {
    this.modelCache.clear();
    this.logger.info('Model cache cleared');
  }

  /**
   * Gets ImageNet class labels (subset)
   */
  private getImageNetLabels(): string[] {
    return [
      'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
      'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
      'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack'
    ];
  }

  /**
   * Gets COCO dataset labels
   */
  private getCOCOLabels(): string[] {
    return [
      'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
      'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
      'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
      'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
      'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
      'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
      'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
      'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
      'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
      'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
    ];
  }

  /**
   * Gets Pascal VOC segmentation labels
   */
  private getPascalVOCLabels(): string[] {
    return [
      'background', 'aeroplane', 'bicycle', 'bird', 'boat', 'bottle', 'bus', 'car', 'cat',
      'chair', 'cow', 'diningtable', 'dog', 'horse', 'motorbike', 'person', 'pottedplant',
      'sheep', 'sofa', 'train', 'tvmonitor'
    ];
  }
}
