/**
 * BatchProcessor - Batch processing system for multiple products
 *
 * @example
 * ```typescript
 * const processor = new BatchProcessor();
 *
 * // Add processing tasks
 * processor.addTask({
 *   id: 'product1',
 *   model: model1,
 *   operations: ['thumbnail', 'ar-export', '360-spin']
 * });
 *
 * processor.addTask({
 *   id: 'product2',
 *   model: model2,
 *   operations: ['screenshot', 'ar-export']
 * });
 *
 * // Process with progress callback
 * const results = await processor.process({
 *   parallel: 2,
 *   onProgress: (current, total, task) => {
 *     console.log(`Processing ${current}/${total}: ${task.id}`);
 *   }
 * });
 *
 * // Export results
 * await processor.exportManifest(results, 'manifest.json');
 * ```
 */

import { ARExporter, ModelData } from './ARExporter';
import { CaptureManager, CaptureFrame } from './CaptureManager';

export type ProcessOperation =
  | 'thumbnail'
  | 'screenshot'
  | 'ar-export'
  | '360-spin'
  | 'video'
  | 'all';

export interface BatchTask {
  /** Unique task ID */
  id: string;
  /** Model data */
  model: ModelData;
  /** Operations to perform */
  operations: ProcessOperation[];
  /** Task-specific config */
  config?: {
    thumbnail?: {
      width?: number;
      height?: number;
      format?: 'png' | 'jpeg' | 'webp';
      quality?: number;
    };
    screenshot?: {
      width?: number;
      height?: number;
      format?: 'png' | 'jpeg' | 'webp';
      quality?: number;
      views?: string[]; // e.g., ['front', 'side', 'top']
    };
    arExport?: {
      formats?: ('usdz' | 'glb')[];
      optimize?: boolean;
    };
    spin360?: {
      duration?: number;
      frameRate?: number;
      width?: number;
      height?: number;
    };
    video?: {
      duration?: number;
      frameRate?: number;
    };
  };
  /** Custom metadata */
  metadata?: Record<string, any>;
}

export interface TaskResult {
  /** Task ID */
  id: string;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Generated outputs */
  outputs: {
    thumbnail?: string; // Data URL or file path
    screenshots?: Record<string, string>;
    arFiles?: Record<string, Blob>;
    spin360?: CaptureFrame[];
    video?: Blob;
  };
  /** Processing time in ms */
  processingTime: number;
  /** Metadata */
  metadata?: Record<string, any>;
}

export interface BatchProcessConfig {
  /** Number of parallel tasks */
  parallel?: number;
  /** Progress callback */
  onProgress?: (current: number, total: number, task: BatchTask) => void;
  /** Task start callback */
  onTaskStart?: (task: BatchTask) => void;
  /** Task complete callback */
  onTaskComplete?: (result: TaskResult) => void;
  /** Task error callback */
  onTaskError?: (task: BatchTask, error: Error) => void;
  /** Output directory (for file system) */
  outputDir?: string;
  /** Auto-save outputs */
  autoSave?: boolean;
}

export interface ProcessManifest {
  /** Generation timestamp */
  timestamp: string;
  /** Total tasks */
  totalTasks: number;
  /** Successful tasks */
  successfulTasks: number;
  /** Failed tasks */
  failedTasks: number;
  /** Total processing time */
  totalTime: number;
  /** Task results */
  results: TaskResult[];
}

/**
 * BatchProcessor handles batch processing of multiple products
 */
export class BatchProcessor {
  private _tasks: BatchTask[];
  private _queue: BatchTask[];
  private _results: Map<string, TaskResult>;
  private _isProcessing: boolean;
  private _arExporter: ARExporter;
  private _captureManager: CaptureManager | null;

  constructor() {
    this._tasks = [];
    this._queue = [];
    this._results = new Map();
    this._isProcessing = false;
    this._arExporter = new ARExporter();
    this._captureManager = null;
  }

  /**
   * Set capture manager (required for screenshot/video operations)
   */
  public setCaptureManager(captureManager: CaptureManager): void {
    this._captureManager = captureManager;
  }

  /**
   * Add task to batch
   */
  public addTask(task: BatchTask): void {
    this._tasks.push(task);
  }

  /**
   * Add multiple tasks
   */
  public addTasks(tasks: BatchTask[]): void {
    this._tasks.push(...tasks);
  }

  /**
   * Remove task
   */
  public removeTask(id: string): boolean {
    const index = this._tasks.findIndex((t) => t.id === id);
    if (index === -1) return false;

    this._tasks.splice(index, 1);
    return true;
  }

  /**
   * Clear all tasks
   */
  public clear(): void {
    this._tasks = [];
    this._queue = [];
    this._results.clear();
  }

  /**
   * Get task count
   */
  public get taskCount(): number {
    return this._tasks.length;
  }

  /**
   * Process all tasks
   */
  public async process(config: BatchProcessConfig = {}): Promise<TaskResult[]> {
    if (this._isProcessing) {
      throw new Error('Batch processing already in progress');
    }

    if (this._tasks.length === 0) {
      throw new Error('No tasks to process');
    }

    this._isProcessing = true;
    this._queue = [...this._tasks];
    this._results.clear();

    const { parallel = 1, onProgress, onTaskStart, onTaskComplete, onTaskError } = config;

    const startTime = Date.now();
    let completed = 0;
    const total = this._queue.length;

    // Process tasks in parallel batches
    while (this._queue.length > 0) {
      const batch = this._queue.splice(0, parallel);
      const promises = batch.map(async (task) => {
        try {
          // Task start callback
          if (onTaskStart) {
            onTaskStart(task);
          }

          // Process task
          const result = await this._processTask(task);

          // Store result
          this._results.set(task.id, result);

          // Task complete callback
          if (onTaskComplete) {
            onTaskComplete(result);
          }

          completed++;

          // Progress callback
          if (onProgress) {
            onProgress(completed, total, task);
          }

          return result;
        } catch (error) {
          const errorResult: TaskResult = {
            id: task.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            outputs: {},
            processingTime: 0,
            metadata: task.metadata
          };

          this._results.set(task.id, errorResult);

          // Error callback
          if (onTaskError) {
            onTaskError(task, error instanceof Error ? error : new Error(String(error)));
          }

          completed++;

          // Progress callback
          if (onProgress) {
            onProgress(completed, total, task);
          }

          return errorResult;
        }
      });

      await Promise.all(promises);
    }

    this._isProcessing = false;

    const results = Array.from(this._results.values());

    // Auto-save if enabled
    if (config.autoSave) {
      await this._saveResults(results, config.outputDir);
    }

    return results;
  }

  /**
   * Process single task
   */
  private async _processTask(task: BatchTask): Promise<TaskResult> {
    const startTime = Date.now();
    const outputs: TaskResult['outputs'] = {};

    // Expand 'all' operation
    const operations = task.operations.includes('all')
      ? ['thumbnail', 'screenshot', 'ar-export', '360-spin']
      : task.operations;

    // Process each operation
    for (const operation of operations) {
      switch (operation) {
        case 'thumbnail':
          outputs.thumbnail = await this._generateThumbnail(task);
          break;

        case 'screenshot':
          outputs.screenshots = await this._generateScreenshots(task);
          break;

        case 'ar-export':
          outputs.arFiles = await this._exportAR(task);
          break;

        case '360-spin':
          outputs.spin360 = await this._generate360Spin(task);
          break;

        case 'video':
          outputs.video = await this._generateVideo(task);
          break;
      }
    }

    const processingTime = Date.now() - startTime;

    return {
      id: task.id,
      success: true,
      outputs,
      processingTime,
      metadata: task.metadata
    };
  }

  /**
   * Generate thumbnail
   */
  private async _generateThumbnail(task: BatchTask): Promise<string> {
    if (!this._captureManager) {
      throw new Error('CaptureManager not set');
    }

    const config = task.config?.thumbnail || {};
    const { width = 256, height = 256, format = 'jpeg', quality = 0.8 } = config;

    const dataURL = await this._captureManager.takeScreenshot({
      width,
      height,
      format,
      quality
    });

    return dataURL;
  }

  /**
   * Generate screenshots from multiple views
   */
  private async _generateScreenshots(task: BatchTask): Promise<Record<string, string>> {
    if (!this._captureManager) {
      throw new Error('CaptureManager not set');
    }

    const config = task.config?.screenshot || {};
    const { width = 1920, height = 1080, format = 'png', quality = 0.92, views = ['default'] } = config;

    const screenshots: Record<string, string> = {};

    for (const view of views) {
      // In real implementation, would set camera position for each view
      // For now, just take screenshot
      const dataURL = await this._captureManager.takeScreenshot({
        width,
        height,
        format,
        quality
      });

      screenshots[view] = dataURL;

      // Small delay between captures
      await this._delay(100);
    }

    return screenshots;
  }

  /**
   * Export AR formats
   */
  private async _exportAR(task: BatchTask): Promise<Record<string, Blob>> {
    const config = task.config?.arExport || {};
    const { formats = ['glb', 'usdz'], optimize = true } = config;

    const files: Record<string, Blob> = {};

    for (const format of formats) {
      let blob: Blob;

      if (format === 'usdz') {
        blob = await this._arExporter.exportUSDZ(task.model, { optimize });
      } else {
        blob = await this._arExporter.exportGLB(task.model, { optimize });
      }

      files[format] = blob;
    }

    return files;
  }

  /**
   * Generate 360° spin
   */
  private async _generate360Spin(task: BatchTask): Promise<CaptureFrame[]> {
    if (!this._captureManager) {
      throw new Error('CaptureManager not set');
    }

    const config = task.config?.spin360 || {};
    const { duration = 4, frameRate = 30, width = 1920, height = 1080 } = config;

    const frames = await this._captureManager.record360Spin({
      duration,
      frameRate,
      width,
      height
    });

    return frames;
  }

  /**
   * Generate video
   */
  private async _generateVideo(task: BatchTask): Promise<Blob> {
    if (!this._captureManager) {
      throw new Error('CaptureManager not set');
    }

    const config = task.config?.video || {};
    const { duration = 5, frameRate = 30 } = config;

    // Start recording
    await this._captureManager.startVideoRecording({ frameRate });

    // Wait for duration
    await this._delay(duration * 1000);

    // Stop recording
    const blob = await this._captureManager.stopVideoRecording();

    return blob;
  }

  /**
   * Save results to file system
   */
  private async _saveResults(results: TaskResult[], outputDir?: string): Promise<void> {
    // In real implementation, would save files to file system
    // For now, just log
    console.log('Results ready for saving:', results);

    if (outputDir) {
      console.log('Output directory:', outputDir);
    }
  }

  /**
   * Export manifest file
   */
  public async exportManifest(results: TaskResult[], filename: string = 'manifest.json'): Promise<string> {
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalTime = results.reduce((sum, r) => sum + r.processingTime, 0);

    const manifest: ProcessManifest = {
      timestamp: new Date().toISOString(),
      totalTasks: results.length,
      successfulTasks: successful,
      failedTasks: failed,
      totalTime,
      results
    };

    const manifestJSON = JSON.stringify(manifest, null, 2);

    // Download manifest
    const blob = new Blob([manifestJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 100);

    return manifestJSON;
  }

  /**
   * Get processing statistics
   */
  public getStatistics(): {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    averageTime: number;
  } {
    const results = Array.from(this._results.values());
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const pending = this._queue.length;
    const totalTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    const averageTime = results.length > 0 ? totalTime / results.length : 0;

    return {
      total: this._tasks.length,
      successful,
      failed,
      pending,
      averageTime
    };
  }

  /**
   * Get result by task ID
   */
  public getResult(id: string): TaskResult | undefined {
    return this._results.get(id);
  }

  /**
   * Get all results
   */
  public getResults(): TaskResult[] {
    return Array.from(this._results.values());
  }

  /**
   * Check if processing
   */
  public get isProcessing(): boolean {
    return this._isProcessing;
  }

  /**
   * Cancel processing
   */
  public cancel(): void {
    this._queue = [];
    this._isProcessing = false;
  }

  /**
   * Delay helper
   */
  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Dispose processor
   */
  public dispose(): void {
    this.cancel();
    this.clear();
  }
}
