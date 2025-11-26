import { Logger } from '../../core/Logger';
import { AudioAnalyzer } from './AudioAnalyzer';

/**
 * Loudness measurement types
 */
export enum LoudnessType {
  /** Root Mean Square (average power) */
  RMS = 'rms',
  /** Peak amplitude */
  PEAK = 'peak',
  /** Integrated loudness (LUFS approximation) */
  LUFS = 'lufs'
}

/**
 * Loudness analysis result
 */
export interface LoudnessData {
  /** RMS loudness in dB */
  rms: number;
  /** Peak loudness in dB */
  peak: number;
  /** LUFS approximation in dB */
  lufs: number;
  /** Linear RMS (0-1) */
  rmsLinear: number;
  /** Linear peak (0-1) */
  peakLinear: number;
  /** Crest factor (peak to RMS ratio in dB) */
  crestFactor: number;
}

/**
 * Loudness range statistics
 */
export interface LoudnessRange {
  /** Minimum loudness in dB */
  min: number;
  /** Maximum loudness in dB */
  max: number;
  /** Average loudness in dB */
  average: number;
  /** Loudness range (max - min) in dB */
  range: number;
}

/**
 * Gate configuration for LUFS measurement
 */
interface GateConfig {
  /** Absolute gate threshold in LUFS */
  absoluteThreshold: number;
  /** Relative gate threshold in LU */
  relativeThreshold: number;
}

/**
 * Loudness analyzer with RMS, peak, and LUFS approximation.
 * Provides real-time loudness measurement for mixing and mastering.
 *
 * @example
 * ```typescript
 * const loudness = new LoudnessAnalyzer(analyzer);
 * const data = loudness.getLoudness();
 * console.log('RMS:', data.rms, 'dB');
 * console.log('LUFS:', data.lufs, 'dB');
 * ```
 */
export class LoudnessAnalyzer {
  private logger: Logger;
  private analyzer: AudioAnalyzer;
  private historySize: number;
  private rmsHistory: number[] = [];
  private peakHistory: number[] = [];
  private gateConfig: GateConfig;

  /**
   * Creates a new LoudnessAnalyzer instance
   *
   * @param analyzer - AudioAnalyzer instance to use
   * @param historySize - Number of measurements to keep for statistics
   */
  constructor(analyzer: AudioAnalyzer, historySize: number = 100) {
    this.logger = Logger.getInstance();
    this.analyzer = analyzer;
    this.historySize = historySize;

    this.gateConfig = {
      absoluteThreshold: -70,
      relativeThreshold: -10
    };

    this.logger.info('LoudnessAnalyzer', 'Initialized');
  }

  /**
   * Gets current loudness measurements
   *
   * @returns Loudness data including RMS, peak, and LUFS
   */
  getLoudness(): LoudnessData {
    const timeDomainData = this.analyzer.getTimeDomainData();

    // Calculate RMS
    const rmsLinear = this.calculateRMS(timeDomainData);
    const rms = this.linearToDecibels(rmsLinear);

    // Calculate peak
    const peakLinear = this.calculatePeak(timeDomainData);
    const peak = this.linearToDecibels(peakLinear);

    // Update history
    this.rmsHistory.push(rmsLinear);
    if (this.rmsHistory.length > this.historySize) {
      this.rmsHistory.shift();
    }

    this.peakHistory.push(peakLinear);
    if (this.peakHistory.length > this.historySize) {
      this.peakHistory.shift();
    }

    // Calculate LUFS approximation
    const lufs = this.calculateLUFS();

    // Calculate crest factor
    const crestFactor = peak - rms;

    return {
      rms,
      peak,
      lufs,
      rmsLinear,
      peakLinear,
      crestFactor
    };
  }

  /**
   * Calculates RMS (Root Mean Square) from time domain data
   *
   * @param timeDomainData - Waveform data
   * @returns RMS value (0-1)
   */
  private calculateRMS(timeDomainData: Uint8Array): number {
    let sum = 0;

    for (let i = 0; i < timeDomainData.length; i++) {
      const normalized = (timeDomainData[i] - 128) / 128;
      sum += normalized * normalized;
    }

    return Math.sqrt(sum / timeDomainData.length);
  }

  /**
   * Calculates peak amplitude from time domain data
   *
   * @param timeDomainData - Waveform data
   * @returns Peak value (0-1)
   */
  private calculatePeak(timeDomainData: Uint8Array): number {
    let peak = 0;

    for (let i = 0; i < timeDomainData.length; i++) {
      const normalized = Math.abs((timeDomainData[i] - 128) / 128);
      if (normalized > peak) {
        peak = normalized;
      }
    }

    return peak;
  }

  /**
   * Calculates LUFS (Loudness Units relative to Full Scale) approximation
   * This is a simplified version using RMS with K-weighting approximation
   *
   * @returns LUFS value in dB
   */
  private calculateLUFS(): number {
    if (this.rmsHistory.length === 0) {
      return -Infinity;
    }

    // Apply gating
    const gatedValues: number[] = [];

    for (const rms of this.rmsHistory) {
      const db = this.linearToDecibels(rms);

      // Absolute gate
      if (db >= this.gateConfig.absoluteThreshold) {
        gatedValues.push(rms);
      }
    }

    if (gatedValues.length === 0) {
      return -Infinity;
    }

    // Calculate mean of gated values
    const meanGated = gatedValues.reduce((a, b) => a + b, 0) / gatedValues.length;
    const meanGatedDb = this.linearToDecibels(meanGated);

    // Relative gate
    const relativeThreshold = meanGatedDb + this.gateConfig.relativeThreshold;
    const relativeGatedValues: number[] = [];

    for (const rms of gatedValues) {
      const db = this.linearToDecibels(rms);
      if (db >= relativeThreshold) {
        relativeGatedValues.push(rms);
      }
    }

    if (relativeGatedValues.length === 0) {
      return -Infinity;
    }

    // Calculate integrated loudness
    const integratedMean = relativeGatedValues.reduce((a, b) => a + b, 0) / relativeGatedValues.length;
    const lufs = this.linearToDecibels(integratedMean);

    // Apply K-weighting approximation (simplified)
    return lufs - 0.691;
  }

  /**
   * Converts linear amplitude to decibels
   *
   * @param linear - Linear amplitude (0-1)
   * @returns Decibel value
   */
  private linearToDecibels(linear: number): number {
    if (linear === 0) {
      return -Infinity;
    }
    return 20 * Math.log10(linear);
  }

  /**
   * Converts decibels to linear amplitude
   *
   * @param db - Decibel value
   * @returns Linear amplitude (0-1)
   */
  private decibelsToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }

  /**
   * Gets RMS loudness range statistics
   *
   * @returns Loudness range data
   */
  getRMSRange(): LoudnessRange {
    if (this.rmsHistory.length === 0) {
      return { min: -Infinity, max: -Infinity, average: -Infinity, range: 0 };
    }

    const rmsDb = this.rmsHistory.map(rms => this.linearToDecibels(rms));
    const min = Math.min(...rmsDb);
    const max = Math.max(...rmsDb);
    const average = rmsDb.reduce((a, b) => a + b, 0) / rmsDb.length;
    const range = max - min;

    return { min, max, average, range };
  }

  /**
   * Gets peak loudness range statistics
   *
   * @returns Loudness range data
   */
  getPeakRange(): LoudnessRange {
    if (this.peakHistory.length === 0) {
      return { min: -Infinity, max: -Infinity, average: -Infinity, range: 0 };
    }

    const peakDb = this.peakHistory.map(peak => this.linearToDecibels(peak));
    const min = Math.min(...peakDb);
    const max = Math.max(...peakDb);
    const average = peakDb.reduce((a, b) => a + b, 0) / peakDb.length;
    const range = max - min;

    return { min, max, average, range };
  }

  /**
   * Gets momentary loudness (400ms window)
   *
   * @returns Momentary loudness in LUFS
   */
  getMomentaryLoudness(): number {
    const sampleRate = this.analyzer.getSampleRate();
    const fftSize = this.analyzer.getFFTSize();
    const windowDuration = fftSize / sampleRate;
    const targetDuration = 0.4;
    const samples = Math.floor(targetDuration / windowDuration);

    if (this.rmsHistory.length < samples) {
      return -Infinity;
    }

    const recentRMS = this.rmsHistory.slice(-samples);
    const mean = recentRMS.reduce((a, b) => a + b, 0) / recentRMS.length;

    return this.linearToDecibels(mean) - 0.691;
  }

  /**
   * Gets short-term loudness (3s window)
   *
   * @returns Short-term loudness in LUFS
   */
  getShortTermLoudness(): number {
    const sampleRate = this.analyzer.getSampleRate();
    const fftSize = this.analyzer.getFFTSize();
    const windowDuration = fftSize / sampleRate;
    const targetDuration = 3.0;
    const samples = Math.floor(targetDuration / windowDuration);

    if (this.rmsHistory.length < samples) {
      return -Infinity;
    }

    const recentRMS = this.rmsHistory.slice(-samples);
    const mean = recentRMS.reduce((a, b) => a + b, 0) / recentRMS.length;

    return this.linearToDecibels(mean) - 0.691;
  }

  /**
   * Checks if audio is clipping
   *
   * @param threshold - Clipping threshold (default 0.99)
   * @returns True if clipping detected
   */
  isClipping(threshold: number = 0.99): boolean {
    const { peakLinear } = this.getLoudness();
    return peakLinear >= threshold;
  }

  /**
   * Gets headroom (distance from peak to 0dBFS)
   *
   * @returns Headroom in dB
   */
  getHeadroom(): number {
    const { peak } = this.getLoudness();
    return -peak;
  }

  /**
   * Gets dynamic range (difference between peak and RMS)
   *
   * @returns Dynamic range in dB
   */
  getDynamicRange(): number {
    const { crestFactor } = this.getLoudness();
    return crestFactor;
  }

  /**
   * Updates gate configuration for LUFS measurement
   *
   * @param config - Gate configuration
   */
  updateGateConfig(config: Partial<GateConfig>): void {
    this.gateConfig = { ...this.gateConfig, ...config };
    this.logger.info('LoudnessAnalyzer', 'Gate configuration updated');
  }

  /**
   * Updates history size
   *
   * @param size - New history size
   */
  updateHistorySize(size: number): void {
    this.historySize = size;

    if (this.rmsHistory.length > size) {
      this.rmsHistory = this.rmsHistory.slice(-size);
    }

    if (this.peakHistory.length > size) {
      this.peakHistory = this.peakHistory.slice(-size);
    }

    this.logger.info('LoudnessAnalyzer', `History size updated to ${size}`);
  }

  /**
   * Resets loudness history
   */
  reset(): void {
    this.rmsHistory = [];
    this.peakHistory = [];
    this.logger.info('LoudnessAnalyzer', 'Reset');
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.reset();
    this.logger.info('LoudnessAnalyzer', 'Disposed');
  }
}
