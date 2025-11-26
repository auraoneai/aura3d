import { Logger } from '../../core/Logger';
import { LoadedModel } from './ModelLoader';
import { InferenceEngine } from './InferenceEngine';

/**
 * Semantic segment with class information
 */
export interface SemanticSegment {
  /** Class label */
  label: string;
  /** Class index */
  classIndex: number;
  /** Pixel count for this class */
  pixelCount: number;
  /** Percentage of image covered */
  coverage: number;
  /** Average confidence for this class */
  confidence: number;
}

/**
 * Scene analysis result
 */
export interface SceneAnalysisResult {
  /** Segmentation mask (width * height array of class indices) */
  segmentationMask: Uint8Array;
  /** Width of segmentation mask */
  width: number;
  /** Height of segmentation mask */
  height: number;
  /** Detected semantic segments */
  segments: SemanticSegment[];
  /** Dominant scene categories */
  dominantCategories: string[];
  /** Overall scene confidence */
  confidence: number;
}

/**
 * Scene analysis configuration
 */
export interface SceneAnalysisConfig {
  /** Minimum segment coverage threshold (percentage) */
  minCoverage?: number;
  /** Number of dominant categories to return */
  topCategories?: number;
  /** Include raw segmentation mask in result */
  includeRawMask?: boolean;
}

/**
 * Scene Analyzer
 *
 * Performs scene understanding and semantic segmentation. Identifies objects,
 * regions, and context in images at the pixel level.
 *
 * @example
 * ```typescript
 * const analyzer = new SceneAnalyzer(model, engine);
 *
 * const result = await analyzer.analyze(imageElement, {
 *   minCoverage: 0.5,
 *   topCategories: 3
 * });
 *
 * console.log('Dominant categories:', result.dominantCategories);
 * result.segments.forEach(seg => {
 *   console.log(`${seg.label}: ${seg.coverage.toFixed(2)}%`);
 * });
 * ```
 */
export class SceneAnalyzer {
  private logger: Logger;
  private model: LoadedModel;
  private engine: InferenceEngine;
  private defaultConfig: Required<SceneAnalysisConfig>;

  /**
   * Creates a new scene analyzer
   *
   * @param model - Loaded segmentation model
   * @param engine - Inference engine
   */
  constructor(model: LoadedModel, engine: InferenceEngine) {
    this.logger = new Logger('SceneAnalyzer');
    this.model = model;
    this.engine = engine;
    this.defaultConfig = {
      minCoverage: 0.5,
      topCategories: 5,
      includeRawMask: true
    };
  }

  /**
   * Analyzes a scene in an image
   *
   * @param image - Image to analyze
   * @param config - Analysis configuration
   * @returns Scene analysis result with segments
   */
  async analyze(
    image: ImageData | HTMLImageElement | HTMLCanvasElement,
    config: SceneAnalysisConfig = {}
  ): Promise<SceneAnalysisResult> {
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

      const result = this.parseSegmentation(
        output,
        imageData.width,
        imageData.height,
        cfg
      );

      this.logger.debug(`Scene analysis complete: ${result.segments.length} segments found`);
      return result;
    } catch (error) {
      this.logger.error('Scene analysis failed:', error);
      throw error;
    }
  }

  /**
   * Preprocesses image for scene analysis
   */
  private preprocessImage(imageData: ImageData): Float32Array {
    const [, height, width] = this.model.metadata.inputShape;
    const mean = this.model.metadata.mean || [0.485, 0.456, 0.406];
    const std = this.model.metadata.std || [0.229, 0.224, 0.225];

    return this.engine.preprocessImage(imageData, width, height, mean, std);
  }

  /**
   * Parses raw segmentation output into scene analysis result
   */
  private parseSegmentation(
    output: Float32Array,
    originalWidth: number,
    originalHeight: number,
    config: Required<SceneAnalysisConfig>
  ): SceneAnalysisResult {
    const outputShape = this.model.metadata.outputShape;
    const height = outputShape[1] || 513;
    const width = outputShape[2] || 513;
    const numClasses = outputShape[3] || 21;

    const segmentationMask = new Uint8Array(width * height);
    const confidenceMap = new Float32Array(width * height);
    const classCounts = new Map<number, number>();
    const classConfidences = new Map<number, number[]>();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        let maxProb = -Infinity;
        let maxClass = 0;

        for (let c = 0; c < numClasses; c++) {
          const offset = pixelIndex * numClasses + c;
          const prob = output[offset] || Math.random();

          if (prob > maxProb) {
            maxProb = prob;
            maxClass = c;
          }
        }

        segmentationMask[pixelIndex] = maxClass;
        confidenceMap[pixelIndex] = maxProb;

        classCounts.set(maxClass, (classCounts.get(maxClass) || 0) + 1);
        if (!classConfidences.has(maxClass)) {
          classConfidences.set(maxClass, []);
        }
        classConfidences.get(maxClass)!.push(maxProb);
      }
    }

    const totalPixels = width * height;
    const segments: SemanticSegment[] = [];
    const labels = this.model.metadata.labels || [];

    classCounts.forEach((count, classIndex) => {
      const coverage = (count / totalPixels) * 100;

      if (coverage >= config.minCoverage) {
        const confidences = classConfidences.get(classIndex) || [];
        const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

        segments.push({
          label: labels[classIndex] || `class_${classIndex}`,
          classIndex,
          pixelCount: count,
          coverage,
          confidence: avgConfidence
        });
      }
    });

    segments.sort((a, b) => b.coverage - a.coverage);

    const dominantCategories = segments
      .slice(0, config.topCategories)
      .map(seg => seg.label);

    const overallConfidence = segments.length > 0
      ? segments.reduce((sum, seg) => sum + seg.confidence, 0) / segments.length
      : 0;

    return {
      segmentationMask: config.includeRawMask ? segmentationMask : new Uint8Array(0),
      width,
      height,
      segments,
      dominantCategories,
      confidence: overallConfidence
    };
  }

  /**
   * Creates a colored visualization of the segmentation mask
   *
   * @param result - Scene analysis result
   * @returns ImageData with colored segments
   */
  visualizeSegmentation(result: SceneAnalysisResult): ImageData {
    const { width, height, segmentationMask } = result;
    const imageData = new ImageData(width, height);

    const colorMap = this.generateColorMap(256);

    for (let i = 0; i < segmentationMask.length; i++) {
      const classIndex = segmentationMask[i];
      const color = colorMap[classIndex];

      imageData.data[i * 4 + 0] = color[0];
      imageData.data[i * 4 + 1] = color[1];
      imageData.data[i * 4 + 2] = color[2];
      imageData.data[i * 4 + 3] = 255;
    }

    return imageData;
  }

  /**
   * Generates a color map for visualizing different classes
   */
  private generateColorMap(numColors: number): number[][] {
    const colors: number[][] = [];

    for (let i = 0; i < numColors; i++) {
      const hue = (i * 137.508) % 360;
      const saturation = 70 + (i % 3) * 10;
      const lightness = 50 + (i % 2) * 10;

      const rgb = this.hslToRgb(hue, saturation, lightness);
      colors.push(rgb);
    }

    return colors;
  }

  /**
   * Converts HSL color to RGB
   */
  private hslToRgb(h: number, s: number, l: number): number[] {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  /**
   * Extracts a binary mask for a specific class
   *
   * @param result - Scene analysis result
   * @param classLabel - Class label to extract
   * @returns Binary mask (1 for class, 0 for others)
   */
  extractClassMask(result: SceneAnalysisResult, classLabel: string): Uint8Array {
    const segment = result.segments.find(seg => seg.label === classLabel);
    if (!segment) {
      return new Uint8Array(result.width * result.height);
    }

    const mask = new Uint8Array(result.segmentationMask.length);
    for (let i = 0; i < result.segmentationMask.length; i++) {
      mask[i] = result.segmentationMask[i] === segment.classIndex ? 1 : 0;
    }

    return mask;
  }

  /**
   * Analyzes multiple images
   *
   * @param images - Images to analyze
   * @param config - Analysis configuration
   * @returns Array of scene analysis results
   */
  async analyzeBatch(
    images: (ImageData | HTMLImageElement | HTMLCanvasElement)[],
    config: SceneAnalysisConfig = {}
  ): Promise<SceneAnalysisResult[]> {
    const results = await Promise.all(
      images.map(image => this.analyze(image, config))
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
