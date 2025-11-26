import { Logger } from '../../core/Logger';
import { AudioAnalyzer } from './AudioAnalyzer';

/**
 * Waveform visualization data
 */
export interface WaveformData {
  /** Waveform points (normalized -1 to 1) */
  points: number[];
  /** Number of points */
  pointCount: number;
  /** Peak amplitude */
  peak: number;
  /** Average amplitude */
  average: number;
}

/**
 * Spectrum bars visualization data
 */
export interface SpectrumBarsData {
  /** Bar heights (0-1) */
  bars: number[];
  /** Number of bars */
  barCount: number;
  /** Peak bar index */
  peakIndex: number;
  /** Peak bar height */
  peakHeight: number;
}

/**
 * Circular visualization data
 */
export interface CircularVisualizationData {
  /** Radius values for each angle */
  radii: number[];
  /** Number of points */
  pointCount: number;
  /** Angle step in radians */
  angleStep: number;
}

/**
 * Oscilloscope configuration
 */
export interface OscilloscopeConfig {
  /** Number of points to render */
  points?: number;
  /** Smoothing factor (0-1) */
  smoothing?: number;
  /** Trigger threshold for stable display */
  triggerThreshold?: number;
}

/**
 * Spectrum bar configuration
 */
export interface SpectrumBarConfig {
  /** Number of bars */
  barCount?: number;
  /** Logarithmic frequency scaling */
  logarithmic?: boolean;
  /** Smoothing factor (0-1) */
  smoothing?: number;
  /** Peak hold time in milliseconds */
  peakHold?: number;
}

/**
 * Audio visualization utilities for waveforms and spectrum displays.
 * Provides pre-processed data optimized for rendering.
 *
 * @example
 * ```typescript
 * const visualizer = new AudioVisualizer(analyzer);
 * const waveform = visualizer.getWaveform(512);
 * const spectrum = visualizer.getSpectrumBars(64);
 * ```
 */
export class AudioVisualizer {
  private logger: Logger;
  private analyzer: AudioAnalyzer;

  private smoothedWaveform: number[] = [];
  private smoothedBars: number[] = [];
  private peakBars: number[] = [];
  private peakTimestamps: number[] = [];

  /**
   * Creates a new AudioVisualizer instance
   *
   * @param analyzer - AudioAnalyzer instance to use
   */
  constructor(analyzer: AudioAnalyzer) {
    this.logger = Logger.getInstance();
    this.analyzer = analyzer;
    this.logger.info('AudioVisualizer', 'Initialized');
  }

  /**
   * Gets waveform visualization data
   *
   * @param config - Oscilloscope configuration
   * @returns Waveform data ready for rendering
   */
  getWaveform(config: OscilloscopeConfig = {}): WaveformData {
    const pointCount = config.points ?? 512;
    const smoothing = config.smoothing ?? 0.5;
    const triggerThreshold = config.triggerThreshold ?? 128;

    const timeDomainData = this.analyzer.getTimeDomainData();
    const points: number[] = [];

    // Find trigger point for stable oscilloscope display
    let triggerPoint = 0;
    if (triggerThreshold > 0) {
      for (let i = 0; i < timeDomainData.length - 1; i++) {
        if (timeDomainData[i] <= triggerThreshold && timeDomainData[i + 1] > triggerThreshold) {
          triggerPoint = i;
          break;
        }
      }
    }

    // Initialize smoothed waveform if needed
    if (this.smoothedWaveform.length !== pointCount) {
      this.smoothedWaveform = new Array(pointCount).fill(0);
    }

    // Sample and normalize waveform
    let peak = 0;
    let sum = 0;

    for (let i = 0; i < pointCount; i++) {
      const sourceIndex = triggerPoint + Math.floor((i / pointCount) * (timeDomainData.length - triggerPoint));
      const clampedIndex = Math.min(sourceIndex, timeDomainData.length - 1);
      const normalized = (timeDomainData[clampedIndex] - 128) / 128;

      // Apply smoothing
      this.smoothedWaveform[i] = this.smoothedWaveform[i] * smoothing + normalized * (1 - smoothing);
      points.push(this.smoothedWaveform[i]);

      const absValue = Math.abs(this.smoothedWaveform[i]);
      if (absValue > peak) {
        peak = absValue;
      }
      sum += absValue;
    }

    const average = sum / pointCount;

    return {
      points,
      pointCount,
      peak,
      average
    };
  }

  /**
   * Gets spectrum bars visualization data
   *
   * @param config - Spectrum bar configuration
   * @returns Spectrum bars data ready for rendering
   */
  getSpectrumBars(config: SpectrumBarConfig = {}): SpectrumBarsData {
    const barCount = config.barCount ?? 64;
    const logarithmic = config.logarithmic ?? true;
    const smoothing = config.smoothing ?? 0.7;
    const peakHold = config.peakHold ?? 1000;

    const frequencyData = this.analyzer.getFrequencyData();
    const bars: number[] = new Array(barCount).fill(0);

    // Initialize arrays if needed
    if (this.smoothedBars.length !== barCount) {
      this.smoothedBars = new Array(barCount).fill(0);
      this.peakBars = new Array(barCount).fill(0);
      this.peakTimestamps = new Array(barCount).fill(0);
    }

    const sampleRate = this.analyzer.getSampleRate();
    const binCount = this.analyzer.getFrequencyBinCount();
    const nyquist = sampleRate / 2;
    const currentTime = performance.now();

    let peakIndex = 0;
    let peakHeight = 0;

    if (logarithmic) {
      // Logarithmic frequency distribution
      const minFreq = 20;
      const maxFreq = Math.min(nyquist, 20000);
      const logMin = Math.log10(minFreq);
      const logMax = Math.log10(maxFreq);
      const logRange = logMax - logMin;

      for (let i = 0; i < barCount; i++) {
        const logFreq1 = logMin + (i / barCount) * logRange;
        const logFreq2 = logMin + ((i + 1) / barCount) * logRange;
        const freq1 = Math.pow(10, logFreq1);
        const freq2 = Math.pow(10, logFreq2);

        const bin1 = this.analyzer.getBinForFrequency(freq1);
        const bin2 = this.analyzer.getBinForFrequency(freq2);

        let sum = 0;
        let count = 0;

        for (let j = bin1; j <= bin2 && j < frequencyData.length; j++) {
          sum += frequencyData[j];
          count++;
        }

        const magnitude = count > 0 ? sum / (count * 255) : 0;

        // Apply smoothing
        this.smoothedBars[i] = this.smoothedBars[i] * smoothing + magnitude * (1 - smoothing);
        bars[i] = this.smoothedBars[i];

        // Update peak bars
        if (bars[i] > this.peakBars[i]) {
          this.peakBars[i] = bars[i];
          this.peakTimestamps[i] = currentTime;
        } else if (currentTime - this.peakTimestamps[i] > peakHold) {
          this.peakBars[i] = bars[i];
        }

        if (bars[i] > peakHeight) {
          peakHeight = bars[i];
          peakIndex = i;
        }
      }
    } else {
      // Linear frequency distribution
      const binsPerBar = Math.floor(binCount / barCount);

      for (let i = 0; i < barCount; i++) {
        const startBin = i * binsPerBar;
        const endBin = Math.min(startBin + binsPerBar, binCount);

        let sum = 0;
        for (let j = startBin; j < endBin; j++) {
          sum += frequencyData[j];
        }

        const magnitude = sum / (binsPerBar * 255);

        // Apply smoothing
        this.smoothedBars[i] = this.smoothedBars[i] * smoothing + magnitude * (1 - smoothing);
        bars[i] = this.smoothedBars[i];

        // Update peak bars
        if (bars[i] > this.peakBars[i]) {
          this.peakBars[i] = bars[i];
          this.peakTimestamps[i] = currentTime;
        } else if (currentTime - this.peakTimestamps[i] > peakHold) {
          this.peakBars[i] = bars[i];
        }

        if (bars[i] > peakHeight) {
          peakHeight = bars[i];
          peakIndex = i;
        }
      }
    }

    return {
      bars,
      barCount,
      peakIndex,
      peakHeight
    };
  }

  /**
   * Gets peak bars for peak hold visualization
   *
   * @returns Array of peak bar heights
   */
  getPeakBars(): number[] {
    return [...this.peakBars];
  }

  /**
   * Gets circular waveform visualization data
   *
   * @param pointCount - Number of points around the circle
   * @returns Circular visualization data
   */
  getCircularWaveform(pointCount: number = 128): CircularVisualizationData {
    const timeDomainData = this.analyzer.getTimeDomainData();
    const radii: number[] = [];
    const angleStep = (2 * Math.PI) / pointCount;

    for (let i = 0; i < pointCount; i++) {
      const sourceIndex = Math.floor((i / pointCount) * timeDomainData.length);
      const normalized = (timeDomainData[sourceIndex] - 128) / 128;
      const radius = 0.5 + normalized * 0.5;
      radii.push(Math.max(0, radius));
    }

    return {
      radii,
      pointCount,
      angleStep
    };
  }

  /**
   * Gets circular spectrum visualization data
   *
   * @param barCount - Number of bars around the circle
   * @returns Circular visualization data
   */
  getCircularSpectrum(barCount: number = 64): CircularVisualizationData {
    const frequencyData = this.analyzer.getFrequencyData();
    const radii: number[] = [];
    const angleStep = (2 * Math.PI) / barCount;

    const binsPerBar = Math.floor(this.analyzer.getFrequencyBinCount() / barCount);

    for (let i = 0; i < barCount; i++) {
      const startBin = i * binsPerBar;
      const endBin = Math.min(startBin + binsPerBar, frequencyData.length);

      let sum = 0;
      for (let j = startBin; j < endBin; j++) {
        sum += frequencyData[j];
      }

      const magnitude = sum / (binsPerBar * 255);
      radii.push(magnitude);
    }

    return {
      radii,
      pointCount: barCount,
      angleStep
    };
  }

  /**
   * Gets stereo waveform data (simulated from mono)
   *
   * @param pointCount - Number of points per channel
   * @returns Object with left and right channel data
   */
  getStereoWaveform(pointCount: number = 512): { left: number[]; right: number[] } {
    const timeDomainData = this.analyzer.getTimeDomainData();
    const left: number[] = [];
    const right: number[] = [];

    for (let i = 0; i < pointCount; i++) {
      const index = Math.floor((i / pointCount) * timeDomainData.length);
      const normalized = (timeDomainData[index] - 128) / 128;

      left.push(normalized);
      right.push(normalized);
    }

    return { left, right };
  }

  /**
   * Gets mirrored spectrum data for symmetric visualizations
   *
   * @param barCount - Number of bars (total will be doubled)
   * @returns Array of mirrored bar heights
   */
  getMirroredSpectrum(barCount: number = 32): number[] {
    const bars = this.getSpectrumBars({ barCount }).bars;
    return [...bars.slice().reverse(), ...bars];
  }

  /**
   * Generates volume meter data
   *
   * @returns Object with current and peak levels (0-1)
   */
  getVolumeMeter(): { current: number; peak: number } {
    const timeDomainData = this.analyzer.getTimeDomainData();

    let rmsSum = 0;
    let peak = 0;

    for (let i = 0; i < timeDomainData.length; i++) {
      const normalized = Math.abs((timeDomainData[i] - 128) / 128);
      rmsSum += normalized * normalized;
      if (normalized > peak) {
        peak = normalized;
      }
    }

    const current = Math.sqrt(rmsSum / timeDomainData.length);

    return { current, peak };
  }

  /**
   * Resets all smoothing and peak data
   */
  reset(): void {
    this.smoothedWaveform = [];
    this.smoothedBars = [];
    this.peakBars = [];
    this.peakTimestamps = [];
    this.logger.info('AudioVisualizer', 'Reset');
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.reset();
    this.logger.info('AudioVisualizer', 'Disposed');
  }
}
