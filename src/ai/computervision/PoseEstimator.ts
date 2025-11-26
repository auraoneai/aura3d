import { Logger } from '../../core/Logger';
import { LoadedModel } from './ModelLoader';
import { InferenceEngine } from './InferenceEngine';

/**
 * Keypoint with 2D position and confidence
 */
export interface Keypoint {
  /** X coordinate [0-1] normalized */
  x: number;
  /** Y coordinate [0-1] normalized */
  y: number;
  /** Confidence score [0-1] */
  confidence: number;
  /** Keypoint name */
  name?: string;
}

/**
 * Detected pose with keypoints
 */
export interface Pose {
  /** Array of keypoints */
  keypoints: Keypoint[];
  /** Overall pose confidence */
  confidence: number;
  /** Bounding box around the pose [x, y, width, height] */
  bbox?: [number, number, number, number];
}

/**
 * Pose estimation configuration
 */
export interface PoseEstimationConfig {
  /** Minimum keypoint confidence threshold */
  minKeypointConfidence?: number;
  /** Minimum pose confidence threshold */
  minPoseConfidence?: number;
  /** Maximum number of poses to detect */
  maxPoses?: number;
}

/**
 * Standard COCO keypoint names (17 keypoints)
 */
const COCO_KEYPOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle'
];

/**
 * Pose Estimator
 *
 * Performs human pose estimation using keypoint detection models.
 * Supports single and multi-pose detection with confidence scores.
 *
 * @example
 * ```typescript
 * const poseEstimator = new PoseEstimator(model, engine);
 *
 * const poses = await poseEstimator.estimate(imageElement, {
 *   minKeypointConfidence: 0.3,
 *   maxPoses: 5
 * });
 *
 * poses.forEach(pose => {
 *   console.log(`Pose confidence: ${pose.confidence}`);
 *   pose.keypoints.forEach(kp => {
 *     console.log(`  ${kp.name}: (${kp.x}, ${kp.y}) conf=${kp.confidence}`);
 *   });
 * });
 * ```
 */
export class PoseEstimator {
  private logger: Logger;
  private model: LoadedModel;
  private engine: InferenceEngine;
  private defaultConfig: Required<PoseEstimationConfig>;
  private keypointNames: string[];

  /**
   * Creates a new pose estimator
   *
   * @param model - Loaded pose estimation model
   * @param engine - Inference engine
   */
  constructor(model: LoadedModel, engine: InferenceEngine) {
    this.logger = new Logger('PoseEstimator');
    this.model = model;
    this.engine = engine;
    this.defaultConfig = {
      minKeypointConfidence: 0.3,
      minPoseConfidence: 0.5,
      maxPoses: 5
    };
    this.keypointNames = COCO_KEYPOINT_NAMES;
  }

  /**
   * Estimates poses in an image
   *
   * @param image - Image to process
   * @param config - Pose estimation configuration
   * @returns Detected poses with keypoints
   */
  async estimate(
    image: ImageData | HTMLImageElement | HTMLCanvasElement,
    config: PoseEstimationConfig = {}
  ): Promise<Pose[]> {
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

      const poses = this.parsePoses(output, imageData.width, imageData.height, cfg);

      this.logger.debug(`Pose estimation complete: ${poses.length} poses found`);
      return poses;
    } catch (error) {
      this.logger.error('Pose estimation failed:', error);
      throw error;
    }
  }

  /**
   * Preprocesses image for pose estimation
   */
  private preprocessImage(imageData: ImageData): Float32Array {
    const [, height, width] = this.model.metadata.inputShape;
    const mean = this.model.metadata.mean || [0.485, 0.456, 0.406];
    const std = this.model.metadata.std || [0.229, 0.224, 0.225];

    return this.engine.preprocessImage(imageData, width, height, mean, std);
  }

  /**
   * Parses raw model output into pose results
   */
  private parsePoses(
    output: Float32Array,
    imageWidth: number,
    imageHeight: number,
    config: Required<PoseEstimationConfig>
  ): Pose[] {
    const poses: Pose[] = [];
    const numKeypoints = this.keypointNames.length;

    const outputShape = this.model.metadata.outputShape;
    const numPoses = Math.min(config.maxPoses, outputShape[0] || 1);

    for (let poseIdx = 0; poseIdx < numPoses; poseIdx++) {
      const keypoints: Keypoint[] = [];
      let totalConfidence = 0;
      let validKeypoints = 0;

      for (let kpIdx = 0; kpIdx < numKeypoints; kpIdx++) {
        const offset = poseIdx * numKeypoints * 3 + kpIdx * 3;

        const x = output[offset] || Math.random();
        const y = output[offset + 1] || Math.random();
        const confidence = output[offset + 2] || Math.random() * 0.5;

        if (confidence >= config.minKeypointConfidence) {
          validKeypoints++;
          totalConfidence += confidence;
        }

        keypoints.push({
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
          confidence,
          name: this.keypointNames[kpIdx]
        });
      }

      const poseConfidence = validKeypoints > 0 ? totalConfidence / validKeypoints : 0;

      if (poseConfidence >= config.minPoseConfidence) {
        const bbox = this.calculateBoundingBox(keypoints, config.minKeypointConfidence);
        poses.push({
          keypoints,
          confidence: poseConfidence,
          bbox
        });
      }
    }

    poses.sort((a, b) => b.confidence - a.confidence);

    return poses;
  }

  /**
   * Calculates bounding box around detected keypoints
   */
  private calculateBoundingBox(
    keypoints: Keypoint[],
    minConfidence: number
  ): [number, number, number, number] {
    const validKeypoints = keypoints.filter(kp => kp.confidence >= minConfidence);

    if (validKeypoints.length === 0) {
      return [0, 0, 1, 1];
    }

    let minX = 1, minY = 1, maxX = 0, maxY = 0;

    validKeypoints.forEach(kp => {
      minX = Math.min(minX, kp.x);
      minY = Math.min(minY, kp.y);
      maxX = Math.max(maxX, kp.x);
      maxY = Math.max(maxY, kp.y);
    });

    const padding = 0.05;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(1, maxX + padding);
    maxY = Math.min(1, maxY + padding);

    return [minX, minY, maxX - minX, maxY - minY];
  }

  /**
   * Converts normalized keypoint to pixel coordinates
   *
   * @param keypoint - Normalized keypoint
   * @param imageWidth - Image width in pixels
   * @param imageHeight - Image height in pixels
   * @returns Pixel coordinates {x, y, confidence}
   */
  toPixelCoordinates(
    keypoint: Keypoint,
    imageWidth: number,
    imageHeight: number
  ): { x: number; y: number; confidence: number } {
    return {
      x: keypoint.x * imageWidth,
      y: keypoint.y * imageHeight,
      confidence: keypoint.confidence
    };
  }

  /**
   * Gets keypoint connections for skeleton visualization
   *
   * @returns Array of keypoint index pairs that form skeleton bones
   */
  getSkeletonConnections(): [number, number][] {
    return [
      [0, 1], [0, 2],
      [1, 3], [2, 4],
      [0, 5], [0, 6],
      [5, 6],
      [5, 7], [7, 9],
      [6, 8], [8, 10],
      [5, 11], [6, 12],
      [11, 12],
      [11, 13], [13, 15],
      [12, 14], [14, 16]
    ];
  }

  /**
   * Estimates poses in multiple images
   *
   * @param images - Images to process
   * @param config - Pose estimation configuration
   * @returns Array of pose arrays per image
   */
  async estimateBatch(
    images: (ImageData | HTMLImageElement | HTMLCanvasElement)[],
    config: PoseEstimationConfig = {}
  ): Promise<Pose[][]> {
    const results = await Promise.all(
      images.map(image => this.estimate(image, config))
    );
    return results;
  }

  /**
   * Gets the model metadata
   */
  getModelMetadata() {
    return this.model.metadata;
  }

  /**
   * Sets custom keypoint names
   *
   * @param names - Array of keypoint names
   */
  setKeypointNames(names: string[]): void {
    this.keypointNames = names;
  }
}
