/**
 * G3D Metrics Collector
 * Collects performance metrics, frame rates, and error rates
 * @module Analytics
 */

import { EventTracker } from './EventTracker';

/**
 * Performance metric
 */
export interface PerformanceMetric {
  /** Metric name */
  name: string;
  /** Metric value */
  value: number;
  /** Metric unit */
  unit: string;
  /** Timestamp */
  timestamp: number;
  /** Additional tags */
  tags?: Record<string, string>;
}

/**
 * Frame rate statistics
 */
export interface FrameRateStats {
  /** Current FPS */
  current: number;
  /** Average FPS */
  average: number;
  /** Minimum FPS */
  min: number;
  /** Maximum FPS */
  max: number;
  /** Frame time (ms) */
  frameTime: number;
  /** Total frames counted */
  totalFrames: number;
}

/**
 * Load time metric
 */
export interface LoadTimeMetric {
  /** Resource name */
  resource: string;
  /** Load duration (ms) */
  duration: number;
  /** Resource size (bytes) */
  size?: number;
  /** Resource type */
  type?: string;
  /** Success status */
  success: boolean;
}

/**
 * Error rate statistics
 */
export interface ErrorRateStats {
  /** Total errors */
  totalErrors: number;
  /** Errors per minute */
  errorsPerMinute: number;
  /** Error types count */
  errorTypes: Map<string, number>;
  /** Last error timestamp */
  lastError?: number;
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /** Enable metrics collection */
  enabled: boolean;
  /** FPS sampling interval (ms) */
  fpsSampleInterval: number;
  /** Report interval (ms) */
  reportInterval: number;
  /** Track memory usage */
  trackMemory: boolean;
  /** Track network performance */
  trackNetwork: boolean;
}

/**
 * Default metrics configuration
 */
const DEFAULT_CONFIG: MetricsConfig = {
  enabled: true,
  fpsSampleInterval: 1000,
  reportInterval: 60000, // 1 minute
  trackMemory: true,
  trackNetwork: true
};

/**
 * Metrics Collector
 * Collects and reports various performance and error metrics
 */
export class MetricsCollector {
  private eventTracker: EventTracker;
  private config: MetricsConfig;
  private frameRateStats: FrameRateStats;
  private loadTimeMetrics: LoadTimeMetric[] = [];
  private errorStats: ErrorRateStats;
  private customMetrics: Map<string, PerformanceMetric[]> = new Map();
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private fpsInterval: number | null = null;
  private reportInterval: number | null = null;
  private errorTimestamps: number[] = [];

  constructor(eventTracker?: EventTracker, config?: Partial<MetricsConfig>) {
    this.eventTracker = eventTracker || new EventTracker();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.frameRateStats = {
      current: 0,
      average: 0,
      min: Infinity,
      max: 0,
      frameTime: 0,
      totalFrames: 0
    };

    this.errorStats = {
      totalErrors: 0,
      errorsPerMinute: 0,
      errorTypes: new Map()
    };

    if (this.config.enabled) {
      this.startTracking();
    }
  }

  /**
   * Start metrics tracking
   */
  public startTracking(): void {
    if (this.fpsInterval !== null) {
      return; // Already tracking
    }

    // Start FPS tracking
    this.lastFrameTime = performance.now();
    this.trackFrame();

    // Start periodic reporting
    this.reportInterval = window.setInterval(() => {
      this.reportMetrics();
    }, this.config.reportInterval);

    // Setup Performance Observer if available
    if (typeof PerformanceObserver !== 'undefined') {
      this.setupPerformanceObserver();
    }
  }

  /**
   * Stop metrics tracking
   */
  public stopTracking(): void {
    if (this.fpsInterval !== null) {
      cancelAnimationFrame(this.fpsInterval);
      this.fpsInterval = null;
    }

    if (this.reportInterval !== null) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
  }

  /**
   * Track a frame (call this every frame)
   */
  public trackFrame(): void {
    const now = performance.now();
    const delta = now - this.lastFrameTime;

    if (delta >= this.config.fpsSampleInterval) {
      const fps = (this.frameCount * 1000) / delta;

      this.frameRateStats.current = Math.round(fps);
      this.frameRateStats.frameTime = delta / this.frameCount;
      this.frameRateStats.totalFrames += this.frameCount;

      // Update min/max
      if (fps < this.frameRateStats.min) {
        this.frameRateStats.min = fps;
      }
      if (fps > this.frameRateStats.max) {
        this.frameRateStats.max = fps;
      }

      // Update average
      const totalTime = now;
      this.frameRateStats.average = (this.frameRateStats.totalFrames * 1000) / totalTime;

      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    this.frameCount++;

    // Schedule next frame
    this.fpsInterval = requestAnimationFrame(() => this.trackFrame());
  }

  /**
   * Get current frame rate statistics
   */
  public getFrameRateStats(): Readonly<FrameRateStats> {
    return { ...this.frameRateStats };
  }

  /**
   * Track load time
   */
  public trackLoadTime(
    resource: string,
    duration: number,
    options?: {
      size?: number;
      type?: string;
      success?: boolean;
    }
  ): void {
    const metric: LoadTimeMetric = {
      resource,
      duration,
      size: options?.size,
      type: options?.type,
      success: options?.success ?? true
    };

    this.loadTimeMetrics.push(metric);

    // Track event
    this.eventTracker.track('load_time', {
      resource,
      duration_ms: duration,
      size_bytes: options?.size,
      type: options?.type,
      success: options?.success ?? true
    });
  }

  /**
   * Track resource load from Performance API
   */
  public trackResourceLoad(entry: PerformanceResourceTiming): void {
    this.trackLoadTime(entry.name, entry.duration, {
      size: entry.transferSize,
      type: entry.initiatorType,
      success: entry.responseStatus === 200 || entry.responseStatus === 0
    });
  }

  /**
   * Track error
   */
  public trackError(errorType: string, errorMessage?: string, fatal: boolean = false): void {
    this.errorStats.totalErrors++;
    this.errorTimestamps.push(Date.now());

    // Update error types
    const currentCount = this.errorStats.errorTypes.get(errorType) || 0;
    this.errorStats.errorTypes.set(errorType, currentCount + 1);

    this.errorStats.lastError = Date.now();

    // Calculate errors per minute
    this.updateErrorRate();

    // Track event
    this.eventTracker.track('error_tracked', {
      error_type: errorType,
      error_message: errorMessage,
      fatal,
      total_errors: this.errorStats.totalErrors,
      errors_per_minute: this.errorStats.errorsPerMinute
    });
  }

  /**
   * Get error rate statistics
   */
  public getErrorStats(): Readonly<ErrorRateStats> {
    return {
      ...this.errorStats,
      errorTypes: new Map(this.errorStats.errorTypes)
    };
  }

  /**
   * Track custom metric
   */
  public trackCustomMetric(
    name: string,
    value: number,
    unit: string = '',
    tags?: Record<string, string>
  ): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags
    };

    if (!this.customMetrics.has(name)) {
      this.customMetrics.set(name, []);
    }

    this.customMetrics.get(name)!.push(metric);

    // Track event
    this.eventTracker.track('custom_metric', {
      metric_name: name,
      metric_value: value,
      metric_unit: unit,
      ...tags
    });
  }

  /**
   * Get custom metrics
   */
  public getCustomMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      return [...(this.customMetrics.get(name) || [])];
    }

    // Return all metrics
    const allMetrics: PerformanceMetric[] = [];
    for (const metrics of this.customMetrics.values()) {
      allMetrics.push(...metrics);
    }
    return allMetrics;
  }

  /**
   * Track memory usage
   */
  public trackMemoryUsage(): void {
    if (!this.config.trackMemory) {
      return;
    }

    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;

      this.trackCustomMetric('memory_used', memory.usedJSHeapSize, 'bytes', {
        type: 'js_heap'
      });

      this.trackCustomMetric('memory_total', memory.totalJSHeapSize, 'bytes', {
        type: 'js_heap'
      });

      this.trackCustomMetric('memory_limit', memory.jsHeapSizeLimit, 'bytes', {
        type: 'js_heap'
      });
    }
  }

  /**
   * Get average load time for a resource type
   */
  public getAverageLoadTime(resourceType?: string): number {
    let metrics = this.loadTimeMetrics;

    if (resourceType) {
      metrics = metrics.filter(m => m.type === resourceType);
    }

    if (metrics.length === 0) {
      return 0;
    }

    const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
    return totalDuration / metrics.length;
  }

  /**
   * Clear all metrics
   */
  public clearMetrics(): void {
    this.loadTimeMetrics = [];
    this.customMetrics.clear();
    this.errorTimestamps = [];

    this.frameRateStats = {
      current: 0,
      average: 0,
      min: Infinity,
      max: 0,
      frameTime: 0,
      totalFrames: 0
    };

    this.errorStats = {
      totalErrors: 0,
      errorsPerMinute: 0,
      errorTypes: new Map()
    };
  }

  /**
   * Report all metrics
   */
  public reportMetrics(): void {
    // Report FPS
    this.eventTracker.track('performance_fps', {
      fps_current: this.frameRateStats.current,
      fps_average: Math.round(this.frameRateStats.average),
      fps_min: Math.round(this.frameRateStats.min),
      fps_max: Math.round(this.frameRateStats.max),
      frame_time_ms: Math.round(this.frameRateStats.frameTime)
    });

    // Report load times
    if (this.loadTimeMetrics.length > 0) {
      const avgLoadTime = this.getAverageLoadTime();
      this.eventTracker.track('performance_load', {
        avg_load_time_ms: Math.round(avgLoadTime),
        total_resources: this.loadTimeMetrics.length
      });
    }

    // Report errors
    if (this.errorStats.totalErrors > 0) {
      this.eventTracker.track('performance_errors', {
        total_errors: this.errorStats.totalErrors,
        errors_per_minute: this.errorStats.errorsPerMinute,
        error_types_count: this.errorStats.errorTypes.size
      });
    }

    // Report memory
    this.trackMemoryUsage();
  }

  /**
   * Setup Performance Observer
   */
  private setupPerformanceObserver(): void {
    try {
      // Observe resource timing
      const resourceObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            this.trackResourceLoad(entry as PerformanceResourceTiming);
          }
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });

      // Observe navigation timing
      const navigationObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            this.trackCustomMetric('dom_content_loaded', navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart, 'ms');
            this.trackCustomMetric('page_load', navEntry.loadEventEnd - navEntry.loadEventStart, 'ms');
          }
        }
      });
      navigationObserver.observe({ entryTypes: ['navigation'] });

      // Observe long tasks if available
      if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        const longTaskObserver = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            this.trackCustomMetric('long_task', entry.duration, 'ms');
          }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      }
    } catch (error) {
      console.warn('Failed to setup PerformanceObserver:', error);
    }
  }

  /**
   * Update error rate
   */
  private updateErrorRate(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Filter errors from last minute
    this.errorTimestamps = this.errorTimestamps.filter(ts => ts >= oneMinuteAgo);
    this.errorStats.errorsPerMinute = this.errorTimestamps.length;
  }

  /**
   * Dispose metrics collector
   */
  public dispose(): void {
    this.stopTracking();
    this.clearMetrics();
  }
}
