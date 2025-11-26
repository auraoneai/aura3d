import { Logger } from '../../core/Logger';
import { ModelLoader } from './ModelLoader';
import { InferenceEngine } from './InferenceEngine';
import { ImageClassifier } from './ImageClassifier';
import { ObjectDetector } from './ObjectDetector';
import { PoseEstimator } from './PoseEstimator';
import { SceneAnalyzer, SceneAnalysisResult } from './SceneAnalyzer';
import { ObjectTracker } from './ObjectTracker';

/**
 * Camera source configuration for computer vision processing
 */
export interface CVCameraConfig {
  /** Camera element ID or HTMLVideoElement */
  source: string | HTMLVideoElement;
  /** Target frame rate for processing */
  fps?: number;
  /** Processing resolution (width) */
  width?: number;
  /** Processing resolution (height) */
  height?: number;
  /** Enable automatic frame capture */
  autoCapture?: boolean;
}

/**
 * Computer vision system configuration
 */
export interface CVSystemConfig {
  /** Base path for models */
  modelBasePath?: string;
  /** Enable image classification */
  enableClassification?: boolean;
  /** Enable object detection */
  enableDetection?: boolean;
  /** Enable pose estimation */
  enablePose?: boolean;
  /** Enable scene analysis */
  enableScene?: boolean;
  /** Enable object tracking */
  enableTracking?: boolean;
  /** Maximum inference batch size */
  maxBatchSize?: number;
  /** Use GPU acceleration if available */
  useGPU?: boolean;
}

/**
 * Computer Vision System Manager
 *
 * Central system for managing computer vision capabilities including
 * model loading, inference execution, and camera integration.
 *
 * @example
 * ```typescript
 * const cvSystem = new CVSystem({
 *   enableDetection: true,
 *   enablePose: true,
 *   useGPU: true
 * });
 *
 * await cvSystem.initialize();
 *
 * const camera = await cvSystem.attachCamera({
 *   source: videoElement,
 *   fps: 30
 * });
 *
 * cvSystem.onDetection((results) => {
 *   console.log('Detected objects:', results);
 * });
 * ```
 */
export class CVSystem {
  private logger: Logger;
  private config: Required<CVSystemConfig>;
  private modelLoader: ModelLoader;
  private inferenceEngine: InferenceEngine;
  private classifier?: ImageClassifier;
  private detector?: ObjectDetector;
  private poseEstimator?: PoseEstimator;
  private sceneAnalyzer?: SceneAnalyzer;
  private tracker?: ObjectTracker;
  private cameras: Map<string, CVCamera>;
  private initialized: boolean;

  /**
   * Creates a new computer vision system
   *
   * @param config - System configuration
   */
  constructor(config: CVSystemConfig = {}) {
    this.logger = new Logger('CVSystem');
    this.config = {
      modelBasePath: config.modelBasePath || '/models',
      enableClassification: config.enableClassification ?? false,
      enableDetection: config.enableDetection ?? false,
      enablePose: config.enablePose ?? false,
      enableScene: config.enableScene ?? false,
      enableTracking: config.enableTracking ?? false,
      maxBatchSize: config.maxBatchSize || 4,
      useGPU: config.useGPU ?? true
    };

    this.modelLoader = new ModelLoader(this.config.modelBasePath);
    this.inferenceEngine = new InferenceEngine({
      maxBatchSize: this.config.maxBatchSize,
      useGPU: this.config.useGPU
    });

    this.cameras = new Map();
    this.initialized = false;
  }

  /**
   * Initializes the computer vision system and loads requested models
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('CVSystem already initialized');
      return;
    }

    this.logger.info('Initializing computer vision system...');

    try {
      const loadPromises: Promise<void>[] = [];

      if (this.config.enableClassification) {
        loadPromises.push(this.initializeClassifier());
      }

      if (this.config.enableDetection) {
        loadPromises.push(this.initializeDetector());
      }

      if (this.config.enablePose) {
        loadPromises.push(this.initializePoseEstimator());
      }

      if (this.config.enableScene) {
        loadPromises.push(this.initializeSceneAnalyzer());
      }

      if (this.config.enableTracking) {
        this.tracker = new ObjectTracker();
      }

      await Promise.all(loadPromises);

      this.initialized = true;
      this.logger.info('Computer vision system initialized');
    } catch (error) {
      this.logger.error('Failed to initialize CV system:', error);
      throw error;
    }
  }

  /**
   * Initializes the image classifier
   */
  private async initializeClassifier(): Promise<void> {
    const model = await this.modelLoader.loadModel('classification', 'mobilenet');
    this.classifier = new ImageClassifier(model, this.inferenceEngine);
    this.logger.info('Image classifier initialized');
  }

  /**
   * Initializes the object detector
   */
  private async initializeDetector(): Promise<void> {
    const model = await this.modelLoader.loadModel('detection', 'yolo');
    this.detector = new ObjectDetector(model, this.inferenceEngine);
    this.logger.info('Object detector initialized');
  }

  /**
   * Initializes the pose estimator
   */
  private async initializePoseEstimator(): Promise<void> {
    const model = await this.modelLoader.loadModel('pose', 'posenet');
    this.poseEstimator = new PoseEstimator(model, this.inferenceEngine);
    this.logger.info('Pose estimator initialized');
  }

  /**
   * Initializes the scene analyzer
   */
  private async initializeSceneAnalyzer(): Promise<void> {
    const model = await this.modelLoader.loadModel('segmentation', 'deeplabv3');
    this.sceneAnalyzer = new SceneAnalyzer(model, this.inferenceEngine);
    this.logger.info('Scene analyzer initialized');
  }

  /**
   * Attaches a camera for computer vision processing
   *
   * @param config - Camera configuration
   * @returns Camera instance
   */
  async attachCamera(config: CVCameraConfig): Promise<CVCamera> {
    const camera = new CVCamera(this, config);
    await camera.initialize();

    const cameraId = typeof config.source === 'string' ? config.source : `camera_${this.cameras.size}`;
    this.cameras.set(cameraId, camera);

    this.logger.info(`Camera attached: ${cameraId}`);
    return camera;
  }

  /**
   * Detaches a camera
   *
   * @param cameraId - Camera identifier
   */
  detachCamera(cameraId: string): void {
    const camera = this.cameras.get(cameraId);
    if (camera) {
      camera.stop();
      this.cameras.delete(cameraId);
      this.logger.info(`Camera detached: ${cameraId}`);
    }
  }

  /**
   * Gets the image classifier
   */
  getClassifier(): ImageClassifier | undefined {
    return this.classifier;
  }

  /**
   * Gets the object detector
   */
  getDetector(): ObjectDetector | undefined {
    return this.detector;
  }

  /**
   * Gets the pose estimator
   */
  getPoseEstimator(): PoseEstimator | undefined {
    return this.poseEstimator;
  }

  /**
   * Gets the scene analyzer
   */
  getSceneAnalyzer(): SceneAnalyzer | undefined {
    return this.sceneAnalyzer;
  }

  /**
   * Gets the object tracker
   */
  getTracker(): ObjectTracker | undefined {
    return this.tracker;
  }

  /**
   * Processes a single image through all enabled CV modules
   *
   * @param image - Image to process
   * @returns Combined results
   */
  async processImage(image: ImageData | HTMLImageElement | HTMLCanvasElement): Promise<CVResults> {
    if (!this.initialized) {
      throw new Error('CVSystem not initialized');
    }

    const results: CVResults = {};

    const promises: Promise<void>[] = [];

    if (this.classifier) {
      promises.push(
        this.classifier.classify(image).then(r => { results.classification = r; })
      );
    }

    if (this.detector) {
      promises.push(
        this.detector.detect(image).then(r => { results.detection = r; })
      );
    }

    if (this.poseEstimator) {
      promises.push(
        this.poseEstimator.estimate(image).then(r => { results.poses = r; })
      );
    }

    if (this.sceneAnalyzer) {
      promises.push(
        this.sceneAnalyzer.analyze(image).then(r => { results.scene = r; })
      );
    }

    await Promise.all(promises);

    return results;
  }

  /**
   * Shuts down the computer vision system
   */
  shutdown(): void {
    this.cameras.forEach(camera => camera.stop());
    this.cameras.clear();
    this.initialized = false;
    this.logger.info('Computer vision system shut down');
  }
}

/**
 * Combined computer vision results
 */
export interface CVResults {
  classification?: Array<{ label: string; confidence: number }>;
  detection?: Array<{ label: string; confidence: number; bbox: number[] }>;
  poses?: Array<{ keypoints: Array<{ x: number; y: number; confidence: number }> }>;
  scene?: SceneAnalysisResult;
}

/**
 * Camera instance for continuous CV processing
 */
export class CVCamera {
  private cvSystem: CVSystem;
  private config: Required<CVCameraConfig>;
  private videoElement?: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private animationFrameId?: number;
  private intervalId?: number;
  private running: boolean;
  private callbacks: Map<string, (results: CVResults) => void>;

  constructor(cvSystem: CVSystem, config: CVCameraConfig) {
    this.cvSystem = cvSystem;
    this.config = {
      source: config.source,
      fps: config.fps || 30,
      width: config.width || 640,
      height: config.height || 480,
      autoCapture: config.autoCapture ?? true
    };

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    this.context = this.canvas.getContext('2d')!;
    this.running = false;
    this.callbacks = new Map();
  }

  /**
   * Initializes the camera
   */
  async initialize(): Promise<void> {
    if (typeof this.config.source === 'string') {
      const element = document.getElementById(this.config.source);
      if (element instanceof HTMLVideoElement) {
        this.videoElement = element;
      } else {
        throw new Error(`Element ${this.config.source} is not a video element`);
      }
    } else {
      this.videoElement = this.config.source;
    }

    if (this.config.autoCapture) {
      this.start();
    }
  }

  /**
   * Starts capturing and processing frames
   */
  start(): void {
    if (this.running || !this.videoElement) return;

    this.running = true;
    const frameInterval = 1000 / this.config.fps;

    this.intervalId = window.setInterval(() => {
      this.captureFrame();
    }, frameInterval);
  }

  /**
   * Stops capturing frames
   */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  /**
   * Captures and processes a single frame
   */
  private async captureFrame(): Promise<void> {
    if (!this.videoElement || !this.running) return;

    this.context.drawImage(this.videoElement, 0, 0, this.config.width, this.config.height);
    const imageData = this.context.getImageData(0, 0, this.config.width, this.config.height);

    const results = await this.cvSystem.processImage(imageData);

    this.callbacks.forEach(callback => callback(results));
  }

  /**
   * Registers a callback for CV results
   *
   * @param id - Callback identifier
   * @param callback - Result handler
   */
  onResults(id: string, callback: (results: CVResults) => void): void {
    this.callbacks.set(id, callback);
  }

  /**
   * Unregisters a callback
   *
   * @param id - Callback identifier
   */
  offResults(id: string): void {
    this.callbacks.delete(id);
  }

  /**
   * Gets the canvas element for rendering
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
