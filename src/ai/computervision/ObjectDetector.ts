import { Logger } from '../../core/Logger';
import { LoadedModel } from './ModelLoader';
import { InferenceEngine } from './InferenceEngine';

/**
 * Bounding box coordinates [x, y, width, height]
 */
export type BoundingBox = [number, number, number, number];

/**
 * Object detection result
 */
export interface DetectionResult {
  /** Class label */
  label: string;
  /** Confidence score [0-1] */
  confidence: number;
  /** Bounding box [x, y, width, height] normalized to [0-1] */
  bbox: BoundingBox;
  /** Class index */
  classIndex: number;
}

/**
 * Detection configuration
 */
export interface DetectionConfig {
  /** Confidence threshold for filtering detections */
  confidenceThreshold?: number;
  /** IoU threshold for Non-Maximum Suppression */
  iouThreshold?: number;
  /** Maximum number of detections to return */
  maxDetections?: number;
}

/**
 * Object Detector
 *
 * Performs object detection using YOLO-style models. Supports bounding box prediction,
 * Non-Maximum Suppression (NMS), and multi-class detection.
 *
 * @example
 * ```typescript
 * const detector = new ObjectDetector(model, engine);
 *
 * const detections = await detector.detect(imageElement, {
 *   confidenceThreshold: 0.5,
 *   iouThreshold: 0.45
 * });
 *
 * detections.forEach(det => {
 *   console.log(`${det.label}: ${det.confidence.toFixed(2)} at`, det.bbox);
 * });
 * ```
 */
export class ObjectDetector {
  private logger: Logger;
  private model: LoadedModel;
  private engine: InferenceEngine;
  private defaultConfig: Required<DetectionConfig>;

  /**
   * Creates a new object detector
   *
   * @param model - Loaded detection model
   * @param engine - Inference engine
   */
  constructor(model: LoadedModel, engine: InferenceEngine) {
    this.logger = new Logger('ObjectDetector');
    this.model = model;
    this.engine = engine;
    this.defaultConfig = {
      confidenceThreshold: 0.5,
      iouThreshold: 0.45,
      maxDetections: 100
    };
  }

  /**
   * Detects objects in an image
   *
   * @param image - Image to process
   * @param config - Detection configuration
   * @returns Detected objects with bounding boxes
   */
  async detect(
    image: ImageData | HTMLImageElement | HTMLCanvasElement,
    config: DetectionConfig = {}
  ): Promise<DetectionResult[]> {
    const cfg = { ...this.defaultConfig, ...config };

    try {
      const imageData = image instanceof ImageData
        ? image
        : this.engine.imageToImageData(image);

      const inputTensor = this.preprocessImage(imageData);

      const output = await this.engine.runInference(
        this.model,
        inputTensor,
        this.model.metadata.inputShape
      );

      const rawDetections = this.parseDetections(output, imageData.width, imageData.height);

      const filteredDetections = this.filterByConfidence(rawDetections, cfg.confidenceThreshold);

      const nmsDetections = this.applyNMS(filteredDetections, cfg.iouThreshold);

      const finalDetections = nmsDetections.slice(0, cfg.maxDetections);

      this.logger.debug(`Detection complete: ${finalDetections.length} objects found`);
      return finalDetections;
    } catch (error) {
      this.logger.error('Detection failed:', error);
      throw error;
    }
  }

  /**
   * Preprocesses image for detection
   */
  private preprocessImage(imageData: ImageData): Float32Array {
    const [, height, width] = this.model.metadata.inputShape;
    const mean = this.model.metadata.mean || [0, 0, 0];
    const std = this.model.metadata.std || [1, 1, 1];

    return this.engine.preprocessImage(imageData, width, height, mean, std);
  }

  /**
   * Parses raw model output into detection results
   */
  private parseDetections(
    output: Float32Array,
    imageWidth: number,
    imageHeight: number
  ): DetectionResult[] {
    const detections: DetectionResult[] = [];
    const labels = this.model.metadata.labels || [];

    const numDetections = Math.min(100, output.length / 85);

    for (let i = 0; i < numDetections; i++) {
      const offset = i * 85;

      const objectness = output[offset + 4];
      if (objectness < 0.1) continue;

      const centerX = output[offset + 0];
      const centerY = output[offset + 1];
      const width = output[offset + 2];
      const height = output[offset + 3];

      const classScores = output.slice(offset + 5, offset + 85);
      let maxScore = 0;
      let maxIndex = 0;

      for (let j = 0; j < classScores.length; j++) {
        if (classScores[j] > maxScore) {
          maxScore = classScores[j];
          maxIndex = j;
        }
      }

      const confidence = objectness * maxScore;

      const x = Math.max(0, Math.min(1, centerX - width / 2));
      const y = Math.max(0, Math.min(1, centerY - height / 2));
      const w = Math.max(0, Math.min(1 - x, width));
      const h = Math.max(0, Math.min(1 - y, height));

      detections.push({
        label: labels[maxIndex] || `class_${maxIndex}`,
        confidence,
        bbox: [x, y, w, h],
        classIndex: maxIndex
      });
    }

    return detections;
  }

  /**
   * Filters detections by confidence threshold
   */
  private filterByConfidence(
    detections: DetectionResult[],
    threshold: number
  ): DetectionResult[] {
    return detections.filter(det => det.confidence >= threshold);
  }

  /**
   * Applies Non-Maximum Suppression to remove overlapping detections
   */
  private applyNMS(
    detections: DetectionResult[],
    iouThreshold: number
  ): DetectionResult[] {
    if (detections.length === 0) return [];

    detections.sort((a, b) => b.confidence - a.confidence);

    const keep: DetectionResult[] = [];

    while (detections.length > 0) {
      const current = detections.shift()!;
      keep.push(current);

      detections = detections.filter(det => {
        if (det.classIndex !== current.classIndex) return true;

        const iou = this.calculateIoU(current.bbox, det.bbox);
        return iou < iouThreshold;
      });
    }

    return keep;
  }

  /**
   * Calculates Intersection over Union (IoU) between two bounding boxes
   *
   * @param box1 - First bounding box
   * @param box2 - Second bounding box
   * @returns IoU value [0-1]
   */
  private calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;

    const xMin1 = x1;
    const yMin1 = y1;
    const xMax1 = x1 + w1;
    const yMax1 = y1 + h1;

    const xMin2 = x2;
    const yMin2 = y2;
    const xMax2 = x2 + w2;
    const yMax2 = y2 + h2;

    const intersectXMin = Math.max(xMin1, xMin2);
    const intersectYMin = Math.max(yMin1, yMin2);
    const intersectXMax = Math.min(xMax1, xMax2);
    const intersectYMax = Math.min(yMax1, yMax2);

    const intersectWidth = Math.max(0, intersectXMax - intersectXMin);
    const intersectHeight = Math.max(0, intersectYMax - intersectYMin);
    const intersectArea = intersectWidth * intersectHeight;

    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    const unionArea = box1Area + box2Area - intersectArea;

    return unionArea > 0 ? intersectArea / unionArea : 0;
  }

  /**
   * Converts normalized bbox to pixel coordinates
   *
   * @param bbox - Normalized bounding box
   * @param imageWidth - Image width in pixels
   * @param imageHeight - Image height in pixels
   * @returns Pixel coordinates [x, y, width, height]
   */
  toPixelCoordinates(
    bbox: BoundingBox,
    imageWidth: number,
    imageHeight: number
  ): BoundingBox {
    const [x, y, w, h] = bbox;
    return [
      x * imageWidth,
      y * imageHeight,
      w * imageWidth,
      h * imageHeight
    ];
  }

  /**
   * Detects objects in multiple images
   *
   * @param images - Images to process
   * @param config - Detection configuration
   * @returns Array of detection results per image
   */
  async detectBatch(
    images: (ImageData | HTMLImageElement | HTMLCanvasElement)[],
    config: DetectionConfig = {}
  ): Promise<DetectionResult[][]> {
    const results = await Promise.all(
      images.map(image => this.detect(image, config))
    );
    return results;
  }

  /**
   * Gets the model metadata
   */
  getModelMetadata() {
    return this.model.metadata;
  }
}
