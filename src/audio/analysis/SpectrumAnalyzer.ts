import { Logger } from '../../core/Logger';
import { AudioAnalyzer } from './AudioAnalyzer';

/**
 * Frequency band definition
 */
export interface FrequencyBand {
  /** Band name */
  name: string;
  /** Minimum frequency in Hz */
  minFreq: number;
  /** Maximum frequency in Hz */
  maxFreq: number;
  /** Current magnitude (0-1) */
  magnitude: number;
}

/**
 * Spectrum visualization data
 */
export interface SpectrumVisualizationData {
  /** Array of frequency magnitudes for visualization */
  bars: number[];
  /** Number of bars */
  barCount: number;
  /** Frequency range per bar */
  frequencyPerBar: number;
  /** Peak frequency */
  peakFrequency: number;
  /** Peak magnitude */
  peakMagnitude: number;
}

/**
 * Spectrum analysis configuration
 */
export interface SpectrumAnalyzerConfig {
  /** Number of frequency bands for analysis */
  bandCount?: number;
  /** Custom frequency bands */
  customBands?: Omit<FrequencyBand, 'magnitude'>[];
  /** Smoothing factor for visualization (0-1) */
  smoothing?: number;
  /** Whether to use logarithmic scaling */
  logarithmicScale?: boolean;
}

/**
 * Frequency spectrum analyzer with visualization support.
 * Provides FFT-based frequency analysis with configurable bands and scaling.
 *
 * @example
 * ```typescript
 * const spectrum = new SpectrumAnalyzer(analyzer);
 * const vizData = spectrum.getVisualizationData(32);
 * console.log('Spectrum bars:', vizData.bars);
 * ```
 */
export class SpectrumAnalyzer {
  private logger: Logger;
  private analyzer: AudioAnalyzer;
  private config: Required<Omit<SpectrumAnalyzerConfig, 'customBands'>> & { customBands?: FrequencyBand[] };
  private bands: FrequencyBand[];
  private smoothedBars: number[] = [];

  private readonly DEFAULT_BANDS: Omit<FrequencyBand, 'magnitude'>[] = [
    { name: 'Sub Bass', minFreq: 20, maxFreq: 60 },
    { name: 'Bass', minFreq: 60, maxFreq: 250 },
    { name: 'Low Mid', minFreq: 250, maxFreq: 500 },
    { name: 'Mid', minFreq: 500, maxFreq: 2000 },
    { name: 'High Mid', minFreq: 2000, maxFreq: 4000 },
    { name: 'Presence', minFreq: 4000, maxFreq: 6000 },
    { name: 'Brilliance', minFreq: 6000, maxFreq: 20000 }
  ];

  /**
   * Creates a new SpectrumAnalyzer instance
   *
   * @param analyzer - AudioAnalyzer instance to use
   * @param config - Spectrum analyzer configuration
   */
  constructor(analyzer: AudioAnalyzer, config: SpectrumAnalyzerConfig = {}) {
    this.logger = Logger.getInstance();
    this.analyzer = analyzer;

    this.config = {
      bandCount: config.bandCount ?? 7,
      smoothing: config.smoothing ?? 0.7,
      logarithmicScale: config.logarithmicScale ?? true,
      customBands: config.customBands?.map(b => ({ ...b, magnitude: 0 }))
    };

    this.bands = this.initializeBands();
    this.logger.info('SpectrumAnalyzer', `Initialized with ${this.bands.length} frequency bands`);
  }

  /**
   * Initializes frequency bands
   *
   * @returns Array of frequency bands
   */
  private initializeBands(): FrequencyBand[] {
    if (this.config.customBands) {
      return this.config.customBands;
    }

    return this.DEFAULT_BANDS.map(band => ({
      ...band,
      magnitude: 0
    }));
  }

  /**
   * Analyzes the frequency spectrum and updates band magnitudes
   */
  analyze(): void {
    const frequencyData = this.analyzer.getFrequencyData();

    for (const band of this.bands) {
      const minBin = this.analyzer.getBinForFrequency(band.minFreq);
      const maxBin = this.analyzer.getBinForFrequency(band.maxFreq);

      let sum = 0;
      let count = 0;

      for (let i = minBin; i <= maxBin && i < frequencyData.length; i++) {
        sum += frequencyData[i];
        count++;
      }

      const magnitude = count > 0 ? sum / (count * 255) : 0;
      band.magnitude = magnitude;
    }
  }

  /**
   * Gets the current frequency bands with magnitudes
   *
   * @returns Array of frequency bands
   */
  getBands(): FrequencyBand[] {
    this.analyze();
    return [...this.bands];
  }

  /**
   * Gets magnitude for a specific frequency band by name
   *
   * @param bandName - Name of the frequency band
   * @returns Band magnitude (0-1), or 0 if not found
   */
  getBandMagnitude(bandName: string): number {
    const band = this.bands.find(b => b.name === bandName);
    return band ? band.magnitude : 0;
  }

  /**
   * Gets visualization data for spectrum bars
   *
   * @param barCount - Number of bars to generate
   * @returns Spectrum visualization data
   */
  getVisualizationData(barCount: number): SpectrumVisualizationData {
    const frequencyData = this.analyzer.getFrequencyData();
    const bars: number[] = new Array(barCount).fill(0);

    // Initialize smoothed bars if needed
    if (this.smoothedBars.length !== barCount) {
      this.smoothedBars = new Array(barCount).fill(0);
    }

    const binCount = this.analyzer.getFrequencyBinCount();
    const sampleRate = this.analyzer.getSampleRate();
    const nyquist = sampleRate / 2;

    let peakMagnitude = 0;
    let peakFrequency = 0;

    if (this.config.logarithmicScale) {
      // Logarithmic distribution for better musical representation
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
        bars[i] = magnitude;

        if (magnitude > peakMagnitude) {
          peakMagnitude = magnitude;
          peakFrequency = (freq1 + freq2) / 2;
        }
      }
    } else {
      // Linear distribution
      const binsPerBar = Math.floor(binCount / barCount);

      for (let i = 0; i < barCount; i++) {
        const startBin = i * binsPerBar;
        const endBin = Math.min(startBin + binsPerBar, binCount);

        let sum = 0;
        for (let j = startBin; j < endBin; j++) {
          sum += frequencyData[j];
        }

        const magnitude = sum / (binsPerBar * 255);
        bars[i] = magnitude;

        if (magnitude > peakMagnitude) {
          peakMagnitude = magnitude;
          peakFrequency = this.analyzer.getFrequencyForBin(startBin + binsPerBar / 2);
        }
      }
    }

    // Apply smoothing
    for (let i = 0; i < barCount; i++) {
      this.smoothedBars[i] = this.smoothedBars[i] * this.config.smoothing +
                             bars[i] * (1 - this.config.smoothing);
      bars[i] = this.smoothedBars[i];
    }

    const frequencyPerBar = nyquist / barCount;

    return {
      bars,
      barCount,
      frequencyPerBar,
      peakFrequency,
      peakMagnitude
    };
  }

  /**
   * Gets the dominant frequency in the spectrum
   *
   * @returns Dominant frequency in Hz
   */
  getDominantFrequency(): number {
    const frequencyData = this.analyzer.getFrequencyData();
    let maxMagnitude = 0;
    let maxBin = 0;

    for (let i = 0; i < frequencyData.length; i++) {
      if (frequencyData[i] > maxMagnitude) {
        maxMagnitude = frequencyData[i];
        maxBin = i;
      }
    }

    return this.analyzer.getFrequencyForBin(maxBin);
  }

  /**
   * Gets spectral centroid (brightness measure)
   *
   * @returns Spectral centroid in Hz
   */
  getSpectralCentroid(): number {
    const frequencyData = this.analyzer.getFrequencyData();
    let weightedSum = 0;
    let magnitudeSum = 0;

    for (let i = 0; i < frequencyData.length; i++) {
      const magnitude = frequencyData[i];
      const frequency = this.analyzer.getFrequencyForBin(i);
      weightedSum += frequency * magnitude;
      magnitudeSum += magnitude;
    }

    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  /**
   * Gets spectral rolloff (frequency below which 85% of energy is contained)
   *
   * @param threshold - Energy threshold (default 0.85)
   * @returns Spectral rolloff frequency in Hz
   */
  getSpectralRolloff(threshold: number = 0.85): number {
    const frequencyData = this.analyzer.getFrequencyData();
    let totalEnergy = 0;

    for (let i = 0; i < frequencyData.length; i++) {
      totalEnergy += frequencyData[i];
    }

    const targetEnergy = totalEnergy * threshold;
    let cumulativeEnergy = 0;

    for (let i = 0; i < frequencyData.length; i++) {
      cumulativeEnergy += frequencyData[i];
      if (cumulativeEnergy >= targetEnergy) {
        return this.analyzer.getFrequencyForBin(i);
      }
    }

    return this.analyzer.getSampleRate() / 2;
  }

  /**
   * Gets spectral flatness (measure of how noise-like vs. tonal)
   *
   * @returns Spectral flatness (0-1, higher = more noise-like)
   */
  getSpectralFlatness(): number {
    const frequencyData = this.analyzer.getFloatFrequencyData();
    let geometricMean = 0;
    let arithmeticMean = 0;
    let count = 0;

    for (let i = 0; i < frequencyData.length; i++) {
      const magnitude = Math.pow(10, frequencyData[i] / 20);
      if (magnitude > 0) {
        geometricMean += Math.log(magnitude);
        arithmeticMean += magnitude;
        count++;
      }
    }

    if (count === 0) {
      return 0;
    }

    geometricMean = Math.exp(geometricMean / count);
    arithmeticMean /= count;

    return arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
  }

  /**
   * Updates analyzer configuration
   *
   * @param config - New configuration options
   */
  updateConfig(config: SpectrumAnalyzerConfig): void {
    if (config.bandCount !== undefined) {
      this.config.bandCount = config.bandCount;
    }
    if (config.smoothing !== undefined) {
      this.config.smoothing = config.smoothing;
    }
    if (config.logarithmicScale !== undefined) {
      this.config.logarithmicScale = config.logarithmicScale;
    }
    if (config.customBands !== undefined) {
      this.config.customBands = config.customBands.map(b => ({ ...b, magnitude: 0 }));
      this.bands = this.initializeBands();
    }

    this.logger.info('SpectrumAnalyzer', 'Configuration updated');
  }

  /**
   * Resets smoothed visualization data
   */
  reset(): void {
    this.smoothedBars = [];
    this.bands.forEach(band => band.magnitude = 0);
    this.logger.info('SpectrumAnalyzer', 'Reset');
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.smoothedBars = [];
    this.bands = [];
    this.logger.info('SpectrumAnalyzer', 'Disposed');
  }
}
