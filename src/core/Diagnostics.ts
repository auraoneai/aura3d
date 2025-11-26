/**
 * Central diagnostics API for runtime health monitoring and performance tracking.
 *
 * Provides comprehensive engine health monitoring including FPS tracking,
 * frame time analysis, memory usage tracking, warning/error history,
 * custom metric registration, and report generation for debugging.
 *
 * @example
 * ```typescript
 * // Enable diagnostics
 * Diagnostics.enable();
 *
 * // Register custom metrics
 * Diagnostics.registerMetric('entityCount', () => world.entityCount);
 * Diagnostics.registerMetric('drawCalls', () => renderer.drawCalls);
 *
 * // Record warnings
 * Diagnostics.warn('Physics', 'High step count detected');
 *
 * // Get diagnostic report
 * const report = Diagnostics.getReport();
 * console.log(`FPS: ${report.fps.average.toFixed(1)}`);
 *
 * // Export report
 * const html = Diagnostics.exportHTML();
 * ```
 */

import { Logger } from './Logger';
import { Time } from './Time';
import { EventBus } from './EventBus';

/**
 * Memory information structure.
 */
export interface MemoryInfo {
  /** Used JS heap size in bytes */
  usedJSHeapSize: number;
  /** Total JS heap size in bytes */
  totalJSHeapSize: number;
  /** JS heap size limit in bytes */
  jsHeapSizeLimit: number;
  /** Memory usage percentage (0-1) */
  usagePercent: number;
}

/**
 * FPS tracking information.
 */
export interface FPSInfo {
  /** Current FPS */
  current: number;
  /** Average FPS over window */
  average: number;
  /** Minimum FPS over window */
  min: number;
  /** Maximum FPS over window */
  max: number;
  /** Frame time in milliseconds */
  frameTime: number;
}

/**
 * Frame timing information.
 */
export interface FrameTimingInfo {
  /** CPU frame time in milliseconds */
  cpu: number;
  /** GPU frame time in milliseconds (if available) */
  gpu: number | null;
  /** Total frame time in milliseconds */
  total: number;
}

/**
 * Warning or error entry with timestamp.
 */
export interface DiagnosticMessage {
  /** Subsystem that generated the message */
  subsystem: string;
  /** Message text */
  message: string;
  /** Timestamp when message was recorded */
  timestamp: number;
  /** Severity level */
  severity: 'warning' | 'error';
}

/**
 * Performance warning entry.
 */
export interface PerformanceWarning {
  /** Metric name */
  metric: string;
  /** Current value */
  value: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Timestamp when warning was generated */
  timestamp: number;
}

/**
 * Complete diagnostic report for engine health.
 */
export interface DiagnosticReport {
  /** Report timestamp */
  timestamp: number;
  /** FPS information */
  fps: FPSInfo;
  /** Frame timing information */
  frameTiming: FrameTimingInfo;
  /** Memory usage information */
  memoryUsage: MemoryInfo;
  /** Estimated GPU memory usage in bytes */
  gpuMemory: number;
  /** Custom registered metrics */
  customMetrics: Record<string, number>;
  /** Recent warnings */
  warnings: DiagnosticMessage[];
  /** Recent errors */
  errors: DiagnosticMessage[];
  /** Recent performance warnings */
  performanceWarnings: PerformanceWarning[];
}

/**
 * Custom metric getter function.
 */
type MetricGetter = () => number;

/**
 * Central diagnostics system for runtime health monitoring.
 *
 * Features:
 * - FPS tracking with min/max/average over configurable window
 * - Frame time tracking (CPU, GPU if available via extensions)
 * - Memory usage tracking (JS heap, estimated GPU memory)
 * - Warning/error history with timestamps
 * - Custom metric registration for subsystem-specific stats
 * - Performance warning thresholds
 * - Snapshot generation for debugging
 * - HTML/JSON report export
 * - Event-based reporting for real-time monitoring
 */
export class Diagnostics {
  /** Logger instance for diagnostic events */
  private static logger = new Logger('Diagnostics');

  /** Enabled state */
  private static enabled = false;

  /** FPS history buffer (circular buffer) */
  private static fpsHistory: number[] = [];
  private static fpsHistorySize = 60; // 1 second at 60fps
  private static fpsHistoryIndex = 0;

  /** Frame timing history */
  private static frameTimings: number[] = [];
  private static frameTimingSize = 60;
  private static frameTimingIndex = 0;

  /** Last frame timestamp */
  private static lastFrameTime = 0;
  private static currentFPS = 0;

  /** Message history */
  private static warnings: DiagnosticMessage[] = [];
  private static errors: DiagnosticMessage[] = [];
  private static maxMessageHistory = 100;

  /** Performance warnings */
  private static perfWarnings: PerformanceWarning[] = [];
  private static maxPerfWarnings = 50;

  /** Custom metrics registry */
  private static customMetrics: Map<string, MetricGetter> = new Map();

  /** Performance warning thresholds */
  private static thresholds = {
    minFPS: 30,
    maxFrameTime: 33.33, // ms (30 FPS)
    maxMemoryPercent: 0.9,
  };

  /** GPU memory estimate (rough) */
  private static estimatedGPUMemory = 0;

  /** Report update interval handle */
  private static reportInterval: number | null = null;
  private static reportIntervalMs = 1000; // 1 second

  /**
   * Enable diagnostics monitoring.
   *
   * Starts tracking FPS, frame times, and memory usage.
   * In production builds, this may be a no-op for performance.
   *
   * @example
   * ```typescript
   * Diagnostics.enable();
   * ```
   */
  static enable(): void {
    if (this.enabled) {
      return;
    }

    this.enabled = true;
    this.lastFrameTime = performance.now();

    // Initialize circular buffers
    this.fpsHistory = new Array(this.fpsHistorySize).fill(60);
    this.frameTimings = new Array(this.frameTimingSize).fill(16.67);

    // Start periodic report generation
    this.startReportInterval();

    this.logger.info('Diagnostics enabled');
  }

  /**
   * Disable diagnostics monitoring.
   *
   * Stops all tracking and clears history.
   *
   * @example
   * ```typescript
   * Diagnostics.disable();
   * ```
   */
  static disable(): void {
    if (!this.enabled) {
      return;
    }

    this.enabled = false;

    // Stop periodic reports
    this.stopReportInterval();

    // Clear history
    this.fpsHistory = [];
    this.frameTimings = [];
    this.warnings = [];
    this.errors = [];
    this.perfWarnings = [];

    this.logger.info('Diagnostics disabled');
  }

  /**
   * Get whether diagnostics is enabled.
   */
  static get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Update diagnostics (should be called once per frame).
   *
   * Tracks FPS and frame timing. Called automatically by Engine.
   *
   * @internal
   */
  static update(): void {
    if (!this.enabled) {
      return;
    }

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    // Calculate FPS
    this.currentFPS = deltaTime > 0 ? 1000 / deltaTime : 60;

    // Update FPS history (circular buffer)
    this.fpsHistory[this.fpsHistoryIndex] = this.currentFPS;
    this.fpsHistoryIndex = (this.fpsHistoryIndex + 1) % this.fpsHistorySize;

    // Update frame timing history
    this.frameTimings[this.frameTimingIndex] = deltaTime;
    this.frameTimingIndex = (this.frameTimingIndex + 1) % this.frameTimingSize;

    // Check performance thresholds
    if (this.currentFPS < this.thresholds.minFPS) {
      this.perfWarning('FPS', this.currentFPS, this.thresholds.minFPS);
    }

    if (deltaTime > this.thresholds.maxFrameTime) {
      this.perfWarning('FrameTime', deltaTime, this.thresholds.maxFrameTime);
    }

    // Check memory threshold
    const memInfo = this.getMemoryInfo();
    if (memInfo.usagePercent > this.thresholds.maxMemoryPercent) {
      this.perfWarning('MemoryUsage', memInfo.usagePercent * 100, this.thresholds.maxMemoryPercent * 100);
    }
  }

  /**
   * Record a warning message.
   *
   * @param subsystem - Subsystem that generated the warning
   * @param message - Warning message
   *
   * @example
   * ```typescript
   * Diagnostics.warn('Physics', 'High velocity detected on entity');
   * ```
   */
  static warn(subsystem: string, message: string): void {
    if (!this.enabled) {
      return;
    }

    const entry: DiagnosticMessage = {
      subsystem,
      message,
      timestamp: performance.now(),
      severity: 'warning',
    };

    this.warnings.push(entry);

    // Trim history if needed
    if (this.warnings.length > this.maxMessageHistory) {
      this.warnings.shift();
    }

    this.logger.warn(`[${subsystem}] ${message}`);
  }

  /**
   * Record an error message.
   *
   * @param subsystem - Subsystem that generated the error
   * @param message - Error message
   *
   * @example
   * ```typescript
   * Diagnostics.error('Renderer', 'Failed to compile shader');
   * ```
   */
  static error(subsystem: string, message: string): void {
    if (!this.enabled) {
      return;
    }

    const entry: DiagnosticMessage = {
      subsystem,
      message,
      timestamp: performance.now(),
      severity: 'error',
    };

    this.errors.push(entry);

    // Trim history if needed
    if (this.errors.length > this.maxMessageHistory) {
      this.errors.shift();
    }

    this.logger.error(`[${subsystem}] ${message}`);
  }

  /**
   * Record a performance warning when a metric exceeds threshold.
   *
   * @param metric - Metric name
   * @param value - Current value
   * @param threshold - Threshold that was exceeded
   *
   * @example
   * ```typescript
   * Diagnostics.perfWarning('DrawCalls', 5000, 3000);
   * ```
   */
  static perfWarning(metric: string, value: number, threshold: number): void {
    if (!this.enabled) {
      return;
    }

    // Avoid duplicate warnings within short time window
    const now = performance.now();
    const recentWarning = this.perfWarnings.find(
      w => w.metric === metric && (now - w.timestamp) < 1000
    );

    if (recentWarning) {
      return; // Skip duplicate
    }

    const warning: PerformanceWarning = {
      metric,
      value,
      threshold,
      timestamp: now,
    };

    this.perfWarnings.push(warning);

    // Trim history if needed
    if (this.perfWarnings.length > this.maxPerfWarnings) {
      this.perfWarnings.shift();
    }

    this.logger.warn(`Performance warning: ${metric} = ${value.toFixed(2)} (threshold: ${threshold.toFixed(2)})`);
  }

  /**
   * Register a custom metric getter.
   *
   * The getter function will be called when generating reports.
   *
   * @param name - Metric name
   * @param getter - Function that returns current metric value
   *
   * @example
   * ```typescript
   * Diagnostics.registerMetric('entityCount', () => world.entities.length);
   * Diagnostics.registerMetric('drawCalls', () => renderer.stats.drawCalls);
   * ```
   */
  static registerMetric(name: string, getter: MetricGetter): void {
    this.customMetrics.set(name, getter);
    this.logger.debug(`Registered metric: ${name}`);
  }

  /**
   * Unregister a custom metric.
   *
   * @param name - Metric name to unregister
   *
   * @example
   * ```typescript
   * Diagnostics.unregisterMetric('entityCount');
   * ```
   */
  static unregisterMetric(name: string): void {
    this.customMetrics.delete(name);
    this.logger.debug(`Unregistered metric: ${name}`);
  }

  /**
   * Get complete diagnostic report.
   *
   * @returns Current diagnostic report snapshot
   *
   * @example
   * ```typescript
   * const report = Diagnostics.getReport();
   * console.log(`FPS: ${report.fps.average.toFixed(1)}`);
   * console.log(`Memory: ${(report.memoryUsage.usagePercent * 100).toFixed(1)}%`);
   * ```
   */
  static getReport(): DiagnosticReport {
    const fpsInfo = this.getFPSInfo();
    const frameTimingInfo = this.getFrameTimingInfo();
    const memoryInfo = this.getMemoryInfo();
    const customMetrics = this.getCustomMetrics();

    return {
      timestamp: performance.now(),
      fps: fpsInfo,
      frameTiming: frameTimingInfo,
      memoryUsage: memoryInfo,
      gpuMemory: this.estimatedGPUMemory,
      customMetrics,
      warnings: [...this.warnings],
      errors: [...this.errors],
      performanceWarnings: [...this.perfWarnings],
    };
  }

  /**
   * Update estimated GPU memory usage.
   *
   * Should be called by renderer when allocating/deallocating GPU resources.
   *
   * @param bytes - GPU memory usage in bytes
   * @internal
   */
  static updateGPUMemory(bytes: number): void {
    this.estimatedGPUMemory = bytes;
  }

  /**
   * Set performance warning thresholds.
   *
   * @param thresholds - Threshold values
   *
   * @example
   * ```typescript
   * Diagnostics.setThresholds({
   *   minFPS: 30,
   *   maxFrameTime: 33.33,
   *   maxMemoryPercent: 0.9
   * });
   * ```
   */
  static setThresholds(thresholds: Partial<typeof Diagnostics.thresholds>): void {
    Object.assign(this.thresholds, thresholds);
    this.logger.debug('Updated performance thresholds', thresholds);
  }

  /**
   * Export diagnostic report as JSON string.
   *
   * @returns JSON string representation of current report
   *
   * @example
   * ```typescript
   * const json = Diagnostics.exportJSON();
   * localStorage.setItem('diagnostics', json);
   * ```
   */
  static exportJSON(): string {
    const report = this.getReport();
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export diagnostic report as HTML document.
   *
   * @returns HTML string with formatted diagnostic report
   *
   * @example
   * ```typescript
   * const html = Diagnostics.exportHTML();
   * const blob = new Blob([html], { type: 'text/html' });
   * const url = URL.createObjectURL(blob);
   * window.open(url);
   * ```
   */
  static exportHTML(): string {
    const report = this.getReport();

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>G3D Diagnostic Report - ${new Date().toISOString()}</title>
  <style>
    body { font-family: monospace; margin: 20px; background: #1e1e1e; color: #d4d4d4; }
    h1 { color: #4ec9b0; }
    h2 { color: #569cd6; margin-top: 20px; }
    .section { margin-bottom: 20px; }
    .metric { display: flex; justify-content: space-between; padding: 4px 0; }
    .metric-name { color: #9cdcfe; }
    .metric-value { color: #ce9178; }
    .warning { color: #dcdcaa; }
    .error { color: #f48771; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #3c3c3c; }
    th { color: #4ec9b0; }
  </style>
</head>
<body>
  <h1>G3D Diagnostic Report</h1>
  <p>Generated: ${new Date(report.timestamp).toISOString()}</p>

  <div class="section">
    <h2>Performance</h2>
    <div class="metric">
      <span class="metric-name">FPS (Current):</span>
      <span class="metric-value">${report.fps.current.toFixed(1)}</span>
    </div>
    <div class="metric">
      <span class="metric-name">FPS (Average):</span>
      <span class="metric-value">${report.fps.average.toFixed(1)}</span>
    </div>
    <div class="metric">
      <span class="metric-name">FPS (Min/Max):</span>
      <span class="metric-value">${report.fps.min.toFixed(1)} / ${report.fps.max.toFixed(1)}</span>
    </div>
    <div class="metric">
      <span class="metric-name">Frame Time:</span>
      <span class="metric-value">${report.fps.frameTime.toFixed(2)} ms</span>
    </div>
    <div class="metric">
      <span class="metric-name">CPU Time:</span>
      <span class="metric-value">${report.frameTiming.cpu.toFixed(2)} ms</span>
    </div>
    <div class="metric">
      <span class="metric-name">GPU Time:</span>
      <span class="metric-value">${report.frameTiming.gpu !== null ? report.frameTiming.gpu.toFixed(2) + ' ms' : 'N/A'}</span>
    </div>
  </div>

  <div class="section">
    <h2>Memory</h2>
    <div class="metric">
      <span class="metric-name">JS Heap Used:</span>
      <span class="metric-value">${(report.memoryUsage.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB</span>
    </div>
    <div class="metric">
      <span class="metric-name">JS Heap Total:</span>
      <span class="metric-value">${(report.memoryUsage.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB</span>
    </div>
    <div class="metric">
      <span class="metric-name">JS Heap Limit:</span>
      <span class="metric-value">${(report.memoryUsage.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB</span>
    </div>
    <div class="metric">
      <span class="metric-name">Usage:</span>
      <span class="metric-value">${(report.memoryUsage.usagePercent * 100).toFixed(1)}%</span>
    </div>
    <div class="metric">
      <span class="metric-name">GPU Memory (Est):</span>
      <span class="metric-value">${(report.gpuMemory / 1024 / 1024).toFixed(2)} MB</span>
    </div>
  </div>

  ${Object.keys(report.customMetrics).length > 0 ? `
  <div class="section">
    <h2>Custom Metrics</h2>
    ${Object.entries(report.customMetrics).map(([name, value]) => `
    <div class="metric">
      <span class="metric-name">${name}:</span>
      <span class="metric-value">${typeof value === 'number' ? value.toFixed(2) : value}</span>
    </div>
    `).join('')}
  </div>
  ` : ''}

  ${report.performanceWarnings.length > 0 ? `
  <div class="section">
    <h2>Performance Warnings</h2>
    <table>
      <tr>
        <th>Time</th>
        <th>Metric</th>
        <th>Value</th>
        <th>Threshold</th>
      </tr>
      ${report.performanceWarnings.slice(-20).reverse().map(w => `
      <tr class="warning">
        <td>${new Date(w.timestamp).toLocaleTimeString()}</td>
        <td>${w.metric}</td>
        <td>${w.value.toFixed(2)}</td>
        <td>${w.threshold.toFixed(2)}</td>
      </tr>
      `).join('')}
    </table>
  </div>
  ` : ''}

  ${report.warnings.length > 0 ? `
  <div class="section">
    <h2>Warnings</h2>
    <table>
      <tr>
        <th>Time</th>
        <th>Subsystem</th>
        <th>Message</th>
      </tr>
      ${report.warnings.slice(-20).reverse().map(w => `
      <tr class="warning">
        <td>${new Date(w.timestamp).toLocaleTimeString()}</td>
        <td>${w.subsystem}</td>
        <td>${w.message}</td>
      </tr>
      `).join('')}
    </table>
  </div>
  ` : ''}

  ${report.errors.length > 0 ? `
  <div class="section">
    <h2>Errors</h2>
    <table>
      <tr>
        <th>Time</th>
        <th>Subsystem</th>
        <th>Message</th>
      </tr>
      ${report.errors.slice(-20).reverse().map(e => `
      <tr class="error">
        <td>${new Date(e.timestamp).toLocaleTimeString()}</td>
        <td>${e.subsystem}</td>
        <td>${e.message}</td>
      </tr>
      `).join('')}
    </table>
  </div>
  ` : ''}
</body>
</html>`;
  }

  /**
   * Get FPS information.
   */
  private static getFPSInfo(): FPSInfo {
    if (this.fpsHistory.length === 0) {
      return {
        current: 60,
        average: 60,
        min: 60,
        max: 60,
        frameTime: 16.67,
      };
    }

    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    const average = sum / this.fpsHistory.length;
    const min = Math.min(...this.fpsHistory);
    const max = Math.max(...this.fpsHistory);
    const frameTime = this.currentFPS > 0 ? 1000 / this.currentFPS : 16.67;

    return {
      current: this.currentFPS,
      average,
      min,
      max,
      frameTime,
    };
  }

  /**
   * Get frame timing information.
   */
  private static getFrameTimingInfo(): FrameTimingInfo {
    if (this.frameTimings.length === 0) {
      return {
        cpu: 16.67,
        gpu: null,
        total: 16.67,
      };
    }

    const sum = this.frameTimings.reduce((a, b) => a + b, 0);
    const average = sum / this.frameTimings.length;

    return {
      cpu: average,
      gpu: null, // GPU timing requires WebGL/WebGPU extension query
      total: average,
    };
  }

  /**
   * Get memory information.
   */
  private static getMemoryInfo(): MemoryInfo {
    // Check if performance.memory is available (Chrome/Edge)
    const perf = performance as any;

    if (perf.memory) {
      const used = perf.memory.usedJSHeapSize;
      const total = perf.memory.totalJSHeapSize;
      const limit = perf.memory.jsHeapSizeLimit;

      return {
        usedJSHeapSize: used,
        totalJSHeapSize: total,
        jsHeapSizeLimit: limit,
        usagePercent: total > 0 ? used / limit : 0,
      };
    }

    // Fallback for browsers without performance.memory
    return {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0,
      usagePercent: 0,
    };
  }

  /**
   * Get all custom metrics.
   */
  private static getCustomMetrics(): Record<string, number> {
    const metrics: Record<string, number> = {};

    for (const [name, getter] of this.customMetrics) {
      try {
        metrics[name] = getter();
      } catch (error) {
        this.logger.error(`Error getting metric ${name}`, error);
        metrics[name] = -1;
      }
    }

    return metrics;
  }

  /**
   * Start periodic report generation.
   */
  private static startReportInterval(): void {
    if (this.reportInterval !== null) {
      return;
    }

    this.reportInterval = setInterval(() => {
      if (this.enabled) {
        const report = this.getReport();
        // Emit report event via EventBus if needed
        // EventBus.emit('diagnostics:report', report);
      }
    }, this.reportIntervalMs) as unknown as number;
  }

  /**
   * Stop periodic report generation.
   */
  private static stopReportInterval(): void {
    if (this.reportInterval !== null) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
  }

  /**
   * Clear all diagnostic history.
   *
   * @example
   * ```typescript
   * Diagnostics.clearHistory();
   * ```
   */
  static clearHistory(): void {
    this.warnings = [];
    this.errors = [];
    this.perfWarnings = [];
    this.logger.info('Diagnostic history cleared');
  }
}
