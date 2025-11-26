import { Logger } from '../../core/Logger';

/**
 * Performance metric types.
 */
export enum MetricType {
  WIN_RATE = 'win_rate',
  DEATH_RATE = 'death_rate',
  COMPLETION_TIME = 'completion_time',
  DAMAGE_TAKEN = 'damage_taken',
  DAMAGE_DEALT = 'damage_dealt',
  ACCURACY = 'accuracy',
  RESOURCE_EFFICIENCY = 'resource_efficiency',
  PROGRESSION_RATE = 'progression_rate',
  RETRY_COUNT = 'retry_count',
  CUSTOM = 'custom'
}

/**
 * Single metric data point.
 */
export interface MetricDataPoint {
  /** Metric type */
  type: MetricType;
  /** Metric value */
  value: number;
  /** Timestamp */
  timestamp: number;
  /** Optional context data */
  context?: Record<string, any>;
}

/**
 * Aggregated metric statistics.
 */
export interface MetricStats {
  /** Metric type */
  type: MetricType;
  /** Sample count */
  count: number;
  /** Mean value */
  mean: number;
  /** Median value */
  median: number;
  /** Standard deviation */
  stdDev: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Recent trend (positive = improving, negative = declining) */
  trend: number;
}

/**
 * Configuration for difficulty metrics.
 */
export interface DifficultyMetricsConfig {
  /** Maximum number of data points to retain per metric */
  maxDataPoints?: number;
  /** Time window for recent metrics (milliseconds) */
  recentWindow?: number;
  /** Time window for trend analysis (milliseconds) */
  trendWindow?: number;
}

/**
 * Difficulty Metrics Tracker.
 *
 * Tracks player performance metrics over time to inform difficulty adjustments.
 * Maintains historical data and computes statistics like mean, median, trends, etc.
 *
 * @example
 * ```typescript
 * const metrics = new DifficultyMetrics({
 *   maxDataPoints: 100,
 *   recentWindow: 300000 // 5 minutes
 * });
 *
 * metrics.recordMetric(MetricType.WIN_RATE, 0.75);
 * metrics.recordMetric(MetricType.ACCURACY, 0.82);
 *
 * const stats = metrics.getStats(MetricType.WIN_RATE);
 * const isPerformingWell = stats.mean > 0.6;
 * ```
 */
export class DifficultyMetrics {
  private metrics: Map<MetricType, MetricDataPoint[]>;
  private maxDataPoints: number;
  private recentWindow: number;
  private trendWindow: number;
  private logger: Logger;

  /**
   * Creates a new difficulty metrics tracker.
   * @param config - Configuration options
   */
  constructor(config: DifficultyMetricsConfig = {}) {
    this.logger = new Logger('DifficultyMetrics');
    this.metrics = new Map();
    this.maxDataPoints = config.maxDataPoints ?? 100;
    this.recentWindow = config.recentWindow ?? 300000; // 5 minutes
    this.trendWindow = config.trendWindow ?? 60000; // 1 minute

    this.logger.info('Difficulty metrics tracker initialized');
  }

  /**
   * Records a metric data point.
   * @param type - Metric type
   * @param value - Metric value
   * @param context - Optional context data
   */
  public recordMetric(
    type: MetricType,
    value: number,
    context?: Record<string, any>
  ): void {
    if (!this.metrics.has(type)) {
      this.metrics.set(type, []);
    }

    const dataPoints = this.metrics.get(type)!;
    dataPoints.push({
      type,
      value,
      timestamp: Date.now(),
      context
    });

    // Trim old data points
    if (dataPoints.length > this.maxDataPoints) {
      dataPoints.shift();
    }

    this.logger.debug(`Recorded ${type}: ${value}`);
  }

  /**
   * Gets statistics for a metric type.
   * @param type - Metric type
   * @param timeWindow - Optional time window (milliseconds)
   * @returns Metric statistics
   */
  public getStats(type: MetricType, timeWindow?: number): MetricStats | null {
    const dataPoints = this.getDataPoints(type, timeWindow);

    if (dataPoints.length === 0) {
      return null;
    }

    const values = dataPoints.map(d => d.value).sort((a, b) => a - b);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const median = this.calculateMedian(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const min = values[0];
    const max = values[values.length - 1];
    const trend = this.calculateTrend(type);

    return {
      type,
      count: dataPoints.length,
      mean,
      median,
      stdDev,
      min,
      max,
      trend
    };
  }

  /**
   * Gets recent metric value (most recent data point).
   * @param type - Metric type
   * @returns Most recent value, or null if no data
   */
  public getRecentValue(type: MetricType): number | null {
    const dataPoints = this.metrics.get(type);
    if (!dataPoints || dataPoints.length === 0) {
      return null;
    }
    return dataPoints[dataPoints.length - 1].value;
  }

  /**
   * Gets average of recent metrics within the recent window.
   * @param type - Metric type
   * @returns Average recent value, or null if no data
   */
  public getRecentAverage(type: MetricType): number | null {
    const dataPoints = this.getDataPoints(type, this.recentWindow);
    if (dataPoints.length === 0) {
      return null;
    }
    return dataPoints.reduce((sum, d) => sum + d.value, 0) / dataPoints.length;
  }

  /**
   * Gets data points for a metric type within a time window.
   * @param type - Metric type
   * @param timeWindow - Time window in milliseconds (optional)
   * @returns Array of data points
   */
  private getDataPoints(type: MetricType, timeWindow?: number): MetricDataPoint[] {
    const dataPoints = this.metrics.get(type) || [];

    if (!timeWindow) {
      return dataPoints;
    }

    const cutoff = Date.now() - timeWindow;
    return dataPoints.filter(d => d.timestamp >= cutoff);
  }

  /**
   * Calculates the median of an array of values.
   * @param sortedValues - Sorted array of values
   * @returns Median value
   */
  private calculateMedian(sortedValues: number[]): number {
    const mid = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 0) {
      return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
    }
    return sortedValues[mid];
  }

  /**
   * Calculates the trend of a metric (linear regression slope).
   * @param type - Metric type
   * @returns Trend value (positive = improving, negative = declining)
   */
  private calculateTrend(type: MetricType): number {
    const dataPoints = this.getDataPoints(type, this.trendWindow);

    if (dataPoints.length < 2) {
      return 0;
    }

    // Simple linear regression
    const n = dataPoints.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = dataPoints[i].value;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * Clears all metrics for a specific type.
   * @param type - Metric type
   */
  public clearMetric(type: MetricType): void {
    this.metrics.delete(type);
    this.logger.debug(`Cleared metrics for ${type}`);
  }

  /**
   * Clears all metrics.
   */
  public clearAll(): void {
    this.metrics.clear();
    this.logger.info('All metrics cleared');
  }

  /**
   * Gets all metric types being tracked.
   * @returns Array of metric types
   */
  public getTrackedMetrics(): MetricType[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Checks if player is performing well based on metrics.
   * @param thresholds - Metric thresholds to check
   * @returns True if performing well
   */
  public isPerformingWell(thresholds: Partial<Record<MetricType, number>>): boolean {
    for (const [type, threshold] of Object.entries(thresholds)) {
      const stats = this.getStats(type as MetricType);
      if (!stats || stats.mean < threshold) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks if player is struggling based on metrics.
   * @param thresholds - Metric thresholds to check
   * @returns True if struggling
   */
  public isStruggling(thresholds: Partial<Record<MetricType, number>>): boolean {
    for (const [type, threshold] of Object.entries(thresholds)) {
      const stats = this.getStats(type as MetricType);
      if (!stats || stats.mean > threshold) {
        return true;
      }
    }
    return false;
  }

  /**
   * Exports metrics as JSON.
   * @returns JSON representation of all metrics
   */
  public toJSON(): Record<string, MetricDataPoint[]> {
    const result: Record<string, MetricDataPoint[]> = {};
    this.metrics.forEach((points, type) => {
      result[type] = points;
    });
    return result;
  }

  /**
   * Imports metrics from JSON.
   * @param json - JSON data
   */
  public fromJSON(json: Record<string, MetricDataPoint[]>): void {
    this.metrics.clear();
    for (const [type, points] of Object.entries(json)) {
      this.metrics.set(type as MetricType, points);
    }
    this.logger.info('Metrics imported from JSON');
  }
}
