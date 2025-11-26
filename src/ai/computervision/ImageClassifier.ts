import { Logger } from '../../core/Logger';
import { LoadedModel } from './ModelLoader';
import { InferenceEngine } from './InferenceEngine';

/**
 * Classification result
 */
export interface ClassificationResult {
  /** Class label */
  label: string;
  /** Confidence score [0-1] */
  confidence: number;
  /** Class index */
  classIndex: number;
}

/**
 * Image Classifier
 *
 * Performs image classification using trained models. Supports top-k predictions
 * with confidence scores and label mapping.
 *
 * @example
 * ```typescript
 * const classifier = new ImageClassifier(model, engine);
 *
 * const results = await classifier.classify(imageElement, 5);
 * results.forEach(result => {
 *   console.log(`${result.label}: ${(result.confidence * 100).toFixed(2)}%`);
 * });
 * ```
 */
export class ImageClassifier {
  private logger: Logger;
  private model: LoadedModel;
  private engine: InferenceEngine;

  /**
   * Creates a new image classifier
   *
   * @param model - Loaded classification model
   * @param engine - Inference engine
   */
  constructor(model: LoadedModel, engine: InferenceEngine) {
    this.logger = new Logger('ImageClassifier');
    this.model = model;
    this.engine = engine;
  }

  /**
   * Classifies an image
   *
   * @param image - Image to classify
   * @param topK - Number of top predictions to return
   * @returns Classification results sorted by confidence
   */
  async classify(
    image: ImageData | HTMLImageElement | HTMLCanvasElement,
    topK: number = 5
  ): Promise<ClassificationResult[]> {
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

      const probabilities = this.engine.softmax(output);

      const results = this.getTopKPredictions(probabilities, topK);

      this.logger.debug(`Classification complete: ${results.length} results`);
      return results;
    } catch (error) {
      this.logger.error('Classification failed:', error);
      throw error;
    }
  }

  /**
   * Preprocesses image for classification
   */
  private preprocessImage(imageData: ImageData): Float32Array {
    const [, height, width] = this.model.metadata.inputShape;
    const mean = this.model.metadata.mean || [0.485, 0.456, 0.406];
    const std = this.model.metadata.std || [0.229, 0.224, 0.225];

    return this.engine.preprocessImage(imageData, width, height, mean, std);
  }

  /**
   * Gets top-k predictions from probabilities
   */
  private getTopKPredictions(
    probabilities: Float32Array,
    topK: number
  ): ClassificationResult[] {
    const indexed = Array.from(probabilities).map((prob, index) => ({
      probability: prob,
      index
    }));

    indexed.sort((a, b) => b.probability - a.probability);

    const topResults = indexed.slice(0, topK);
    const labels = this.model.metadata.labels || [];

    return topResults.map(result => ({
      label: labels[result.index] || `class_${result.index}`,
      confidence: result.probability,
      classIndex: result.index
    }));
  }

  /**
   * Classifies multiple images in a batch
   *
   * @param images - Images to classify
   * @param topK - Number of top predictions per image
   * @returns Array of classification results
   */
  async classifyBatch(
    images: (ImageData | HTMLImageElement | HTMLCanvasElement)[],
    topK: number = 5
  ): Promise<ClassificationResult[][]> {
    const results = await Promise.all(
      images.map(image => this.classify(image, topK))
    );
    return results;
  }

  /**
   * Gets the confidence threshold for filtering predictions
   *
   * @param results - Classification results
   * @param threshold - Minimum confidence [0-1]
   * @returns Filtered results
   */
  filterByConfidence(
    results: ClassificationResult[],
    threshold: number
  ): ClassificationResult[] {
    return results.filter(result => result.confidence >= threshold);
  }

  /**
   * Gets the model metadata
   */
  getModelMetadata() {
    return this.model.metadata;
  }
}
