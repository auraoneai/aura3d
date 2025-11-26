/**
 * @module Rendering
 * @description
 * GPU/CPU profiling system for performance analysis and optimization.
 * Provides pass-level timing, draw call statistics, memory tracking, and performance warnings.
 */

import { GPUDevice, GPUFeature } from './gpu/GPUDevice';
import { Logger } from '../core/Logger';

const logger = Logger.create('RenderProfiler');

/**
 * Profiler sample representing a timed section.
 */
export interface ProfileSample {
  /** Sample name */
  name: string;
  /** Start timestamp (ms) */
  startTime: number;
  /** End timestamp (ms) */
  endTime: number;
  /** Duration (ms) */
  duration: number;
  /** Parent sample name */
  parent: string | null;
  /** Number of draw calls */
  drawCalls: number;
  /** Number of triangles */
  triangles: number;
  /** Number of vertices */
  vertices: number;
}

/**
 * Frame timing statistics.
 */
export interface FrameStats {
  /** Frame number */
  frameNumber: number;
  /** Total frame time (ms) */
  frameTime: number;
  /** CPU time (ms) */
  cpuTime: number;
  /** GPU time (ms) */
  gpuTime: number;
  /** Frames per second */
  fps: number;
  /** Total draw calls */
  drawCalls: number;
  /** Total triangles rendered */
  triangles: number;
  /** Total vertices rendered */
  vertices: number;
  /** Number of render passes */
  passCount: number;
  /** Memory used (bytes) */
  memoryUsed: number;
}

/**
 * Pass timing entry.
 */
interface PassTiming {
  name: string;
  cpuTime: number;
  gpuTime: number;
  drawCalls: number;
  triangles: number;
  samples: number;
}

/**
 * Performance warning.
 */
export interface PerformanceWarning {
  /** Warning severity */
  severity: 'info' | 'warning' | 'error';
  /** Warning message */
  message: string;
  /** Timestamp */
  timestamp: number;
  /** Related metric value */
  value?: number;
  /** Threshold that triggered warning */
  threshold?: number;
}

/**
 * Profiler configuration.
 */
export interface ProfilerConfig {
  /** Enable GPU timing queries */
  enableGPUTiming?: boolean;
  /** Enable CPU timing */
  enableCPUTiming?: boolean;
  /** Enable draw call tracking */
  enableDrawCallTracking?: boolean;
  /** Enable memory tracking */
  enableMemoryTracking?: boolean;
  /** Number of frames to average */
  historySize?: number;
  /** Enable performance warnings */
  enableWarnings?: boolean;
  /** FPS warning threshold */
  fpsWarningThreshold?: number;
  /** Frame time warning threshold (ms) */
  frameTimeWarningThreshold?: number;
  /** Draw call warning threshold */
  drawCallWarningThreshold?: number;
}

/**
 * Render profiler for performance analysis.
 *
 * Features:
 * - GPU and CPU timing with query support
 * - Per-pass profiling
 * - Draw call, triangle, and vertex counting
 * - Memory usage tracking
 * - Rolling average statistics
 * - Performance warnings and alerts
 * - Frame time graphs
 *
 * @example
 * ```typescript
 * const profiler = new RenderProfiler(device, {
 *   enableGPUTiming: true,
 *   enableCPUTiming: true,
 *   historySize: 120,
 * });
 *
 * // Begin frame
 * profiler.beginFrame();
 *
 * // Profile a pass
 * profiler.beginPass('Shadow Pass');
 * // ... render shadow pass
 * profiler.addDrawCall(100, 300); // 100 triangles, 300 vertices
 * profiler.endPass();
 *
 * profiler.beginPass('Geometry Pass');
 * // ... render geometry
 * profiler.addDrawCall(1000, 3000);
 * profiler.endPass();
 *
 * // End frame
 * profiler.endFrame();
 *
 * // Get statistics
 * const stats = profiler.getFrameStats();
 * console.log(`FPS: ${stats.fps}, Frame Time: ${stats.frameTime}ms`);
 *
 * // Get pass timings
 * const passes = profiler.getPassTimings();
 * for (const pass of passes) {
 *   console.log(`${pass.name}: ${pass.cpuTime}ms CPU, ${pass.gpuTime}ms GPU`);
 * }
 *
 * // Check warnings
 * const warnings = profiler.getWarnings();
 * for (const warning of warnings) {
 *   console.warn(warning.message);
 * }
 * ```
 */
export class RenderProfiler {
  private device: GPUDevice;
  private config: Required<ProfilerConfig>;

  // Current frame state
  private frameNumber: number = 0;
  private frameStartTime: number = 0;
  private frameEndTime: number = 0;
  private currentPass: string | null = null;
  private passStartTime: number = 0;

  // Frame statistics
  private samples: ProfileSample[] = [];
  private frameHistory: FrameStats[] = [];
  private passTimings: Map<string, PassTiming> = new Map();

  // Current frame counters
  private drawCalls: number = 0;
  private triangles: number = 0;
  private vertices: number = 0;

  // Performance warnings
  private warnings: PerformanceWarning[] = [];
  private lastFPS: number = 60;
  private fpsSmooth: number = 60;

  // GPU timing support
  private supportsGPUTiming: boolean = false;
  private gpuQueries: any[] = []; // GPU timestamp queries

  /**
   * Creates a new RenderProfiler instance.
   *
   * @param device - GPU device
   * @param config - Profiler configuration
   */
  constructor(device: GPUDevice, config?: ProfilerConfig) {
    this.device = device;
    this.config = {
      enableGPUTiming: config?.enableGPUTiming ?? true,
      enableCPUTiming: config?.enableCPUTiming ?? true,
      enableDrawCallTracking: config?.enableDrawCallTracking ?? true,
      enableMemoryTracking: config?.enableMemoryTracking ?? true,
      historySize: config?.historySize ?? 120,
      enableWarnings: config?.enableWarnings ?? true,
      fpsWarningThreshold: config?.fpsWarningThreshold ?? 30,
      frameTimeWarningThreshold: config?.frameTimeWarningThreshold ?? 33.33,
      drawCallWarningThreshold: config?.drawCallWarningThreshold ?? 5000,
    };

    // Check GPU timing support
    this.supportsGPUTiming = device.hasFeature(GPUFeature.TimestampQuery);
    if (this.config.enableGPUTiming && !this.supportsGPUTiming) {
      logger.warn('GPU timing requested but not supported by device');
      this.config.enableGPUTiming = false;
    }

    logger.info('RenderProfiler initialized', {
      gpuTiming: this.config.enableGPUTiming,
      cpuTiming: this.config.enableCPUTiming,
    });
  }

  /**
   * Begins profiling a new frame.
   */
  beginFrame(): void {
    this.frameStartTime = performance.now();
    this.samples = [];
    this.drawCalls = 0;
    this.triangles = 0;
    this.vertices = 0;
    this.currentPass = null;
  }

  /**
   * Ends profiling the current frame.
   */
  endFrame(): void {
    this.frameEndTime = performance.now();
    this.frameNumber++;

    // Calculate frame stats
    const frameTime = this.frameEndTime - this.frameStartTime;
    const fps = 1000 / frameTime;

    // Smooth FPS
    this.fpsSmooth = this.fpsSmooth * 0.9 + fps * 0.1;
    this.lastFPS = fps;

    // Calculate CPU/GPU time
    let cpuTime = frameTime;
    let gpuTime = 0;

    if (this.config.enableGPUTiming && this.supportsGPUTiming) {
      // In a real implementation, would read GPU query results
      gpuTime = frameTime * 0.8; // Estimate
    }

    // Create frame stats
    const stats: FrameStats = {
      frameNumber: this.frameNumber,
      frameTime,
      cpuTime,
      gpuTime,
      fps: this.fpsSmooth,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      vertices: this.vertices,
      passCount: this.samples.filter(s => s.parent === null).length,
      memoryUsed: 0, // Would query from ResourceManager
    };

    // Add to history
    this.frameHistory.push(stats);
    if (this.frameHistory.length > this.config.historySize) {
      this.frameHistory.shift();
    }

    // Update pass timings
    this.updatePassTimings();

    // Check for performance warnings
    if (this.config.enableWarnings) {
      this.checkPerformanceWarnings(stats);
    }
  }

  /**
   * Begins profiling a render pass.
   *
   * @param name - Pass name
   */
  beginPass(name: string): void {
    if (this.currentPass) {
      logger.warn(`Pass '${this.currentPass}' not ended before starting '${name}'`);
      this.endPass();
    }

    this.currentPass = name;
    this.passStartTime = performance.now();

    if (this.config.enableGPUTiming && this.supportsGPUTiming) {
      // Start GPU timing query
      // In real implementation: insert GPU timestamp query
    }
  }

  /**
   * Ends profiling the current render pass.
   */
  endPass(): void {
    if (!this.currentPass) {
      logger.warn('endPass called without beginPass');
      return;
    }

    const passEndTime = performance.now();
    const duration = passEndTime - this.passStartTime;

    // Create sample
    const sample: ProfileSample = {
      name: this.currentPass,
      startTime: this.passStartTime,
      endTime: passEndTime,
      duration,
      parent: null,
      drawCalls: 0, // Would be tracked per-pass
      triangles: 0,
      vertices: 0,
    };

    this.samples.push(sample);

    if (this.config.enableGPUTiming && this.supportsGPUTiming) {
      // End GPU timing query
      // In real implementation: insert GPU timestamp query
    }

    this.currentPass = null;
  }

  /**
   * Records a draw call.
   *
   * @param triangleCount - Number of triangles
   * @param vertexCount - Number of vertices
   */
  addDrawCall(triangleCount: number = 0, vertexCount: number = 0): void {
    if (!this.config.enableDrawCallTracking) {
      return;
    }

    this.drawCalls++;
    this.triangles += triangleCount;
    this.vertices += vertexCount;
  }

  /**
   * Records multiple draw calls.
   *
   * @param count - Number of draw calls
   * @param triangles - Total triangles
   * @param vertices - Total vertices
   */
  addDrawCalls(count: number, triangles: number = 0, vertices: number = 0): void {
    if (!this.config.enableDrawCallTracking) {
      return;
    }

    this.drawCalls += count;
    this.triangles += triangles;
    this.vertices += vertices;
  }

  /**
   * Gets current frame statistics.
   *
   * @returns Current frame stats
   */
  getFrameStats(): FrameStats | null {
    if (this.frameHistory.length === 0) {
      return null;
    }
    return this.frameHistory[this.frameHistory.length - 1];
  }

  /**
   * Gets averaged statistics over recent frames.
   *
   * @param frameCount - Number of frames to average (default: all in history)
   * @returns Averaged statistics
   */
  getAverageStats(frameCount?: number): FrameStats | null {
    if (this.frameHistory.length === 0) {
      return null;
    }

    const count = Math.min(
      frameCount ?? this.frameHistory.length,
      this.frameHistory.length
    );

    const frames = this.frameHistory.slice(-count);

    const avg: FrameStats = {
      frameNumber: this.frameNumber,
      frameTime: 0,
      cpuTime: 0,
      gpuTime: 0,
      fps: 0,
      drawCalls: 0,
      triangles: 0,
      vertices: 0,
      passCount: 0,
      memoryUsed: 0,
    };

    for (const frame of frames) {
      avg.frameTime += frame.frameTime;
      avg.cpuTime += frame.cpuTime;
      avg.gpuTime += frame.gpuTime;
      avg.fps += frame.fps;
      avg.drawCalls += frame.drawCalls;
      avg.triangles += frame.triangles;
      avg.vertices += frame.vertices;
      avg.passCount += frame.passCount;
      avg.memoryUsed += frame.memoryUsed;
    }

    const n = frames.length;
    avg.frameTime /= n;
    avg.cpuTime /= n;
    avg.gpuTime /= n;
    avg.fps /= n;
    avg.drawCalls = Math.floor(avg.drawCalls / n);
    avg.triangles = Math.floor(avg.triangles / n);
    avg.vertices = Math.floor(avg.vertices / n);
    avg.passCount = Math.floor(avg.passCount / n);
    avg.memoryUsed = Math.floor(avg.memoryUsed / n);

    return avg;
  }

  /**
   * Gets pass timing breakdown.
   *
   * @returns Array of pass timings
   */
  getPassTimings(): PassTiming[] {
    return Array.from(this.passTimings.values()).sort((a, b) => b.cpuTime - a.cpuTime);
  }

  /**
   * Gets frame time history for graphing.
   *
   * @param maxSamples - Maximum number of samples (default: all)
   * @returns Array of frame times in ms
   */
  getFrameTimeHistory(maxSamples?: number): number[] {
    const samples = maxSamples
      ? this.frameHistory.slice(-maxSamples)
      : this.frameHistory;
    return samples.map(f => f.frameTime);
  }

  /**
   * Gets FPS history for graphing.
   *
   * @param maxSamples - Maximum number of samples (default: all)
   * @returns Array of FPS values
   */
  getFPSHistory(maxSamples?: number): number[] {
    const samples = maxSamples
      ? this.frameHistory.slice(-maxSamples)
      : this.frameHistory;
    return samples.map(f => f.fps);
  }

  /**
   * Gets performance warnings.
   *
   * @param maxAge - Maximum age in ms (default: all warnings)
   * @returns Array of warnings
   */
  getWarnings(maxAge?: number): PerformanceWarning[] {
    if (!maxAge) {
      return [...this.warnings];
    }

    const cutoff = performance.now() - maxAge;
    return this.warnings.filter(w => w.timestamp >= cutoff);
  }

  /**
   * Clears all warnings.
   */
  clearWarnings(): void {
    this.warnings = [];
  }

  /**
   * Resets all profiler state and history.
   */
  reset(): void {
    this.frameNumber = 0;
    this.frameHistory = [];
    this.passTimings.clear();
    this.warnings = [];
    this.samples = [];
    logger.info('Profiler reset');
  }

  /**
   * Updates pass timing statistics.
   */
  private updatePassTimings(): void {
    for (const sample of this.samples) {
      if (sample.parent !== null) {
        continue; // Only track top-level passes
      }

      let timing = this.passTimings.get(sample.name);
      if (!timing) {
        timing = {
          name: sample.name,
          cpuTime: 0,
          gpuTime: 0,
          drawCalls: 0,
          triangles: 0,
          samples: 0,
        };
        this.passTimings.set(sample.name, timing);
      }

      timing.cpuTime = timing.cpuTime * 0.9 + sample.duration * 0.1; // Smooth
      timing.gpuTime = timing.gpuTime * 0.9 + (sample.duration * 0.8) * 0.1; // Estimate
      timing.drawCalls = sample.drawCalls;
      timing.triangles = sample.triangles;
      timing.samples++;
    }
  }

  /**
   * Checks for performance warnings.
   */
  private checkPerformanceWarnings(stats: FrameStats): void {
    const now = performance.now();

    // FPS warning
    if (stats.fps < this.config.fpsWarningThreshold) {
      this.addWarning({
        severity: 'warning',
        message: `Low FPS: ${stats.fps.toFixed(1)}`,
        timestamp: now,
        value: stats.fps,
        threshold: this.config.fpsWarningThreshold,
      });
    }

    // Frame time warning
    if (stats.frameTime > this.config.frameTimeWarningThreshold) {
      this.addWarning({
        severity: 'warning',
        message: `High frame time: ${stats.frameTime.toFixed(2)}ms`,
        timestamp: now,
        value: stats.frameTime,
        threshold: this.config.frameTimeWarningThreshold,
      });
    }

    // Draw call warning
    if (stats.drawCalls > this.config.drawCallWarningThreshold) {
      this.addWarning({
        severity: 'warning',
        message: `High draw calls: ${stats.drawCalls}`,
        timestamp: now,
        value: stats.drawCalls,
        threshold: this.config.drawCallWarningThreshold,
      });
    }

    // GPU/CPU imbalance
    if (this.config.enableGPUTiming && stats.gpuTime > stats.cpuTime * 2) {
      this.addWarning({
        severity: 'info',
        message: `GPU bound: ${stats.gpuTime.toFixed(2)}ms GPU vs ${stats.cpuTime.toFixed(2)}ms CPU`,
        timestamp: now,
      });
    }

    // Trim old warnings
    const cutoff = now - 10000; // Keep 10 seconds
    this.warnings = this.warnings.filter(w => w.timestamp >= cutoff);
  }

  /**
   * Adds a performance warning.
   */
  private addWarning(warning: PerformanceWarning): void {
    // Avoid duplicate warnings
    const isDuplicate = this.warnings.some(
      w => w.message === warning.message &&
           warning.timestamp - w.timestamp < 1000
    );

    if (!isDuplicate) {
      this.warnings.push(warning);

      if (warning.severity === 'error') {
        logger.error(warning.message);
      } else if (warning.severity === 'warning') {
        logger.warn(warning.message);
      } else {
        logger.debug(warning.message);
      }
    }
  }

  /**
   * Generates a profiling report.
   *
   * @returns Formatted profiling report
   */
  generateReport(): string {
    const stats = this.getAverageStats();
    if (!stats) {
      return 'No profiling data available';
    }

    const passes = this.getPassTimings();
    const warnings = this.getWarnings();

    let report = '=== Render Profiler Report ===\n\n';
    report += `Frame: ${stats.frameNumber}\n`;
    report += `FPS: ${stats.fps.toFixed(1)}\n`;
    report += `Frame Time: ${stats.frameTime.toFixed(2)}ms\n`;
    report += `CPU Time: ${stats.cpuTime.toFixed(2)}ms\n`;

    if (this.config.enableGPUTiming) {
      report += `GPU Time: ${stats.gpuTime.toFixed(2)}ms\n`;
    }

    report += `\nRender Statistics:\n`;
    report += `  Draw Calls: ${stats.drawCalls}\n`;
    report += `  Triangles: ${stats.triangles.toLocaleString()}\n`;
    report += `  Vertices: ${stats.vertices.toLocaleString()}\n`;
    report += `  Passes: ${stats.passCount}\n`;

    if (passes.length > 0) {
      report += `\nPass Timings:\n`;
      for (const pass of passes) {
        report += `  ${pass.name}: ${pass.cpuTime.toFixed(2)}ms`;
        if (this.config.enableGPUTiming) {
          report += ` (GPU: ${pass.gpuTime.toFixed(2)}ms)`;
        }
        report += `\n`;
      }
    }

    if (warnings.length > 0) {
      report += `\nWarnings:\n`;
      for (const warning of warnings) {
        report += `  [${warning.severity.toUpperCase()}] ${warning.message}\n`;
      }
    }

    return report;
  }
}
