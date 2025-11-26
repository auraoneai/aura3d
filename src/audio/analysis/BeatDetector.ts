import { Logger } from '../../core/Logger';
import { AudioAnalyzer } from './AudioAnalyzer';

/**
 * Configuration options for BeatDetector
 */
export interface BeatDetectorConfig {
  /** Onset detection threshold (0-1) */
  threshold?: number;
  /** Energy history size for adaptive thresholding */
  historySize?: number;
  /** Minimum time between beats in milliseconds */
  minBeatInterval?: number;
  /** Frequency range for beat detection */
  frequencyRange?: { min: number; max: number };
  /** Sensitivity multiplier (higher = more sensitive) */
  sensitivity?: number;
}

/**
 * Beat detection event
 */
export interface BeatEvent {
  /** Time of beat detection */
  timestamp: number;
  /** Beat energy level (0-1) */
  energy: number;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * BPM estimation result
 */
export interface BPMEstimate {
  /** Estimated BPM */
  bpm: number;
  /** Confidence in the estimate (0-1) */
  confidence: number;
  /** Number of beats analyzed */
  beatCount: number;
}

/**
 * Beat detector with BPM estimation and onset detection.
 * Uses spectral flux and energy-based analysis for real-time beat detection.
 *
 * @example
 * ```typescript
 * const detector = new BeatDetector(analyzer);
 * detector.onBeat((event) => {
 *   console.log('Beat detected!', event.energy);
 * });
 * detector.start();
 * ```
 */
export class BeatDetector {
  private logger: Logger;
  private analyzer: AudioAnalyzer;
  private config: Required<BeatDetectorConfig>;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  private energyHistory: number[] = [];
  private previousSpectrum: Float32Array | null = null;
  private beatTimes: number[] = [];
  private lastBeatTime: number = 0;

  private beatCallbacks: Array<(event: BeatEvent) => void> = [];

  private readonly DEFAULT_CONFIG: Required<BeatDetectorConfig> = {
    threshold: 0.7,
    historySize: 43,
    minBeatInterval: 300,
    frequencyRange: { min: 60, max: 250 },
    sensitivity: 1.5
  };

  /**
   * Creates a new BeatDetector instance
   *
   * @param analyzer - AudioAnalyzer instance to use for analysis
   * @param config - Beat detection configuration
   */
  constructor(analyzer: AudioAnalyzer, config: BeatDetectorConfig = {}) {
    this.logger = Logger.getInstance();
    this.analyzer = analyzer;
    this.config = { ...this.DEFAULT_CONFIG, ...config };

    this.logger.info('BeatDetector', 'Initialized');
  }

  /**
   * Starts beat detection
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('BeatDetector', 'Already running');
      return;
    }

    this.isRunning = true;
    this.energyHistory = [];
    this.previousSpectrum = null;
    this.analyze();

    this.logger.info('BeatDetector', 'Started');
  }

  /**
   * Stops beat detection
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.logger.info('BeatDetector', 'Stopped');
  }

  /**
   * Registers a callback for beat events
   *
   * @param callback - Function to call when a beat is detected
   */
  onBeat(callback: (event: BeatEvent) => void): void {
    this.beatCallbacks.push(callback);
  }

  /**
   * Removes a beat callback
   *
   * @param callback - Callback to remove
   */
  offBeat(callback: (event: BeatEvent) => void): void {
    const index = this.beatCallbacks.indexOf(callback);
    if (index !== -1) {
      this.beatCallbacks.splice(index, 1);
    }
  }

  /**
   * Main analysis loop
   */
  private analyze(): void {
    if (!this.isRunning) {
      return;
    }

    const currentTime = performance.now();
    const spectrum = this.analyzer.getFloatFrequencyData();

    // Calculate spectral flux and energy
    const flux = this.calculateSpectralFlux(spectrum);
    const energy = this.calculateBandEnergy(spectrum);

    // Update energy history
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.config.historySize) {
      this.energyHistory.shift();
    }

    // Detect onset
    if (this.detectOnset(flux, energy, currentTime)) {
      const beatEvent: BeatEvent = {
        timestamp: currentTime,
        energy: energy,
        confidence: this.calculateConfidence(energy)
      };

      this.beatTimes.push(currentTime);
      this.lastBeatTime = currentTime;

      // Trigger callbacks
      this.beatCallbacks.forEach(callback => callback(beatEvent));
    }

    // Clean up old beat times (keep last 100)
    if (this.beatTimes.length > 100) {
      this.beatTimes = this.beatTimes.slice(-100);
    }

    this.previousSpectrum = new Float32Array(spectrum);
    this.animationFrameId = requestAnimationFrame(() => this.analyze());
  }

  /**
   * Calculates spectral flux between current and previous spectrum
   *
   * @param spectrum - Current frequency spectrum
   * @returns Spectral flux value
   */
  private calculateSpectralFlux(spectrum: Float32Array): number {
    if (!this.previousSpectrum) {
      return 0;
    }

    const minBin = this.analyzer.getBinForFrequency(this.config.frequencyRange.min);
    const maxBin = this.analyzer.getBinForFrequency(this.config.frequencyRange.max);

    let flux = 0;
    for (let i = minBin; i <= maxBin && i < spectrum.length; i++) {
      const diff = spectrum[i] - this.previousSpectrum[i];
      flux += diff > 0 ? diff : 0;
    }

    return flux;
  }

  /**
   * Calculates energy in the beat frequency range
   *
   * @param spectrum - Frequency spectrum
   * @returns Normalized energy value (0-1)
   */
  private calculateBandEnergy(spectrum: Float32Array): number {
    const minBin = this.analyzer.getBinForFrequency(this.config.frequencyRange.min);
    const maxBin = this.analyzer.getBinForFrequency(this.config.frequencyRange.max);

    let sum = 0;
    let count = 0;

    for (let i = minBin; i <= maxBin && i < spectrum.length; i++) {
      // Convert from dB to linear scale
      const magnitude = Math.pow(10, spectrum[i] / 20);
      sum += magnitude * magnitude;
      count++;
    }

    const energy = count > 0 ? Math.sqrt(sum / count) : 0;
    return Math.min(1, energy);
  }

  /**
   * Detects onset based on energy and adaptive threshold
   *
   * @param flux - Spectral flux value
   * @param energy - Current energy level
   * @param currentTime - Current timestamp
   * @returns True if onset detected
   */
  private detectOnset(flux: number, energy: number, currentTime: number): boolean {
    // Check minimum beat interval
    if (currentTime - this.lastBeatTime < this.config.minBeatInterval) {
      return false;
    }

    // Not enough history yet
    if (this.energyHistory.length < this.config.historySize) {
      return false;
    }

    // Calculate adaptive threshold
    const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const variance = this.energyHistory.reduce((sum, e) => sum + Math.pow(e - avgEnergy, 2), 0) / this.energyHistory.length;
    const stdDev = Math.sqrt(variance);

    const threshold = avgEnergy + (stdDev * this.config.threshold * this.config.sensitivity);

    return energy > threshold && energy > 0.1;
  }

  /**
   * Calculates confidence score for beat detection
   *
   * @param energy - Beat energy level
   * @returns Confidence score (0-1)
   */
  private calculateConfidence(energy: number): number {
    if (this.energyHistory.length === 0) {
      return 0.5;
    }

    const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const ratio = energy / (avgEnergy + 0.001);

    return Math.min(1, ratio / 3);
  }

  /**
   * Estimates BPM based on recent beat intervals
   *
   * @param windowSize - Number of recent beats to analyze
   * @returns BPM estimation result
   */
  estimateBPM(windowSize: number = 20): BPMEstimate {
    if (this.beatTimes.length < 2) {
      return { bpm: 0, confidence: 0, beatCount: this.beatTimes.length };
    }

    const recentBeats = this.beatTimes.slice(-windowSize);
    const intervals: number[] = [];

    for (let i = 1; i < recentBeats.length; i++) {
      intervals.push(recentBeats[i] - recentBeats[i - 1]);
    }

    if (intervals.length === 0) {
      return { bpm: 0, confidence: 0, beatCount: this.beatTimes.length };
    }

    // Calculate median interval for robustness
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];

    // Convert interval to BPM
    const bpm = 60000 / medianInterval;

    // Calculate confidence based on interval consistency
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = stdDev / (avgInterval + 0.001);

    const confidence = Math.max(0, Math.min(1, 1 - coefficient));

    return {
      bpm: Math.round(bpm),
      confidence,
      beatCount: this.beatTimes.length
    };
  }

  /**
   * Gets the current beat phase (0-1)
   * Useful for syncing animations to beats
   *
   * @returns Beat phase (0-1), or -1 if not enough data
   */
  getBeatPhase(): number {
    if (this.beatTimes.length < 2) {
      return -1;
    }

    const bpmEstimate = this.estimateBPM(4);
    if (bpmEstimate.bpm === 0) {
      return -1;
    }

    const beatInterval = 60000 / bpmEstimate.bpm;
    const timeSinceLastBeat = performance.now() - this.lastBeatTime;

    return (timeSinceLastBeat % beatInterval) / beatInterval;
  }

  /**
   * Updates detector configuration
   *
   * @param config - New configuration options
   */
  updateConfig(config: BeatDetectorConfig): void {
    this.config = { ...this.config, ...config };
    this.logger.info('BeatDetector', 'Configuration updated');
  }

  /**
   * Resets the beat detector state
   */
  reset(): void {
    this.energyHistory = [];
    this.previousSpectrum = null;
    this.beatTimes = [];
    this.lastBeatTime = 0;
    this.logger.info('BeatDetector', 'Reset');
  }

  /**
   * Gets whether the detector is currently running
   *
   * @returns True if running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.stop();
    this.beatCallbacks = [];
    this.logger.info('BeatDetector', 'Disposed');
  }
}
