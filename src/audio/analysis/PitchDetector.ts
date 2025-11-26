import { Logger } from '../../core/Logger';
import { AudioAnalyzer } from './AudioAnalyzer';

/**
 * Pitch detection result
 */
export interface PitchDetectionResult {
  /** Detected frequency in Hz */
  frequency: number;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Note name (e.g., "A4") */
  note: string;
  /** MIDI note number */
  midiNote: number;
  /** Cents deviation from the note (-50 to +50) */
  cents: number;
  /** Clarity of the pitch (0-1) */
  clarity: number;
}

/**
 * Pitch detection configuration
 */
export interface PitchDetectorConfig {
  /** Minimum frequency to detect in Hz */
  minFrequency?: number;
  /** Maximum frequency to detect in Hz */
  maxFrequency?: number;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  /** Algorithm to use */
  algorithm?: 'autocorrelation' | 'yin' | 'hps';
}

/**
 * Pitch detector for musical applications.
 * Implements multiple algorithms including autocorrelation, YIN, and harmonic product spectrum.
 *
 * @example
 * ```typescript
 * const detector = new PitchDetector(analyzer);
 * const pitch = detector.detectPitch();
 * if (pitch) {
 *   console.log('Note:', pitch.note, 'Frequency:', pitch.frequency);
 * }
 * ```
 */
export class PitchDetector {
  private logger: Logger;
  private analyzer: AudioAnalyzer;
  private config: Required<PitchDetectorConfig>;

  private readonly NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  private readonly A4_FREQUENCY = 440;
  private readonly A4_MIDI = 69;

  /**
   * Creates a new PitchDetector instance
   *
   * @param analyzer - AudioAnalyzer instance to use
   * @param config - Pitch detection configuration
   */
  constructor(analyzer: AudioAnalyzer, config: PitchDetectorConfig = {}) {
    this.logger = Logger.getInstance();
    this.analyzer = analyzer;

    this.config = {
      minFrequency: config.minFrequency ?? 80,
      maxFrequency: config.maxFrequency ?? 1000,
      minConfidence: config.minConfidence ?? 0.5,
      algorithm: config.algorithm ?? 'autocorrelation'
    };

    this.logger.info('PitchDetector', `Initialized with ${this.config.algorithm} algorithm`);
  }

  /**
   * Detects pitch from current audio
   *
   * @returns Pitch detection result, or null if no pitch detected
   */
  detectPitch(): PitchDetectionResult | null {
    let result: PitchDetectionResult | null = null;

    switch (this.config.algorithm) {
      case 'autocorrelation':
        result = this.detectWithAutocorrelation();
        break;
      case 'yin':
        result = this.detectWithYIN();
        break;
      case 'hps':
        result = this.detectWithHPS();
        break;
    }

    if (result && result.confidence >= this.config.minConfidence) {
      return result;
    }

    return null;
  }

  /**
   * Detects pitch using autocorrelation algorithm
   *
   * @returns Pitch detection result
   */
  private detectWithAutocorrelation(): PitchDetectionResult | null {
    const timeDomainData = this.analyzer.getTimeDomainData();
    const sampleRate = this.analyzer.getSampleRate();

    // Convert to normalized float array
    const buffer = new Float32Array(timeDomainData.length);
    for (let i = 0; i < timeDomainData.length; i++) {
      buffer[i] = (timeDomainData[i] - 128) / 128;
    }

    // Calculate autocorrelation
    const minPeriod = Math.floor(sampleRate / this.config.maxFrequency);
    const maxPeriod = Math.floor(sampleRate / this.config.minFrequency);
    const correlations = new Float32Array(maxPeriod + 1);

    for (let lag = minPeriod; lag <= maxPeriod; lag++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length - lag; i++) {
        correlation += buffer[i] * buffer[i + lag];
      }
      correlations[lag] = correlation;
    }

    // Find the peak
    let maxCorrelation = 0;
    let bestLag = 0;

    for (let lag = minPeriod; lag <= maxPeriod; lag++) {
      if (correlations[lag] > maxCorrelation) {
        maxCorrelation = correlations[lag];
        bestLag = lag;
      }
    }

    if (bestLag === 0 || maxCorrelation === 0) {
      return null;
    }

    // Parabolic interpolation for better accuracy
    const interpolatedLag = this.parabolicInterpolation(
      correlations,
      bestLag,
      minPeriod,
      maxPeriod
    );

    const frequency = sampleRate / interpolatedLag;

    // Calculate confidence based on autocorrelation peak
    const rmsSum = buffer.reduce((sum, val) => sum + val * val, 0);
    const confidence = Math.min(1, maxCorrelation / (rmsSum + 0.001));

    // Calculate clarity (ratio of peak to average correlation)
    const avgCorrelation = correlations.slice(minPeriod, maxPeriod + 1)
      .reduce((a, b) => a + b, 0) / (maxPeriod - minPeriod + 1);
    const clarity = avgCorrelation > 0 ? Math.min(1, maxCorrelation / (avgCorrelation * 2)) : 0;

    return this.enrichPitchData(frequency, confidence, clarity);
  }

  /**
   * Detects pitch using YIN algorithm (more accurate than autocorrelation)
   *
   * @returns Pitch detection result
   */
  private detectWithYIN(): PitchDetectionResult | null {
    const timeDomainData = this.analyzer.getTimeDomainData();
    const sampleRate = this.analyzer.getSampleRate();
    const bufferSize = timeDomainData.length;

    // Convert to float
    const buffer = new Float32Array(bufferSize);
    for (let i = 0; i < bufferSize; i++) {
      buffer[i] = (timeDomainData[i] - 128) / 128;
    }

    const minPeriod = Math.floor(sampleRate / this.config.maxFrequency);
    const maxPeriod = Math.floor(sampleRate / this.config.minFrequency);

    // Step 1: Calculate difference function
    const difference = new Float32Array(maxPeriod + 1);
    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      let sum = 0;
      for (let i = 0; i < bufferSize - tau; i++) {
        const delta = buffer[i] - buffer[i + tau];
        sum += delta * delta;
      }
      difference[tau] = sum;
    }

    // Step 2: Cumulative mean normalized difference
    const cmndf = new Float32Array(maxPeriod + 1);
    cmndf[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau <= maxPeriod; tau++) {
      runningSum += difference[tau];
      cmndf[tau] = difference[tau] / (runningSum / tau);
    }

    // Step 3: Absolute threshold
    const threshold = 0.15;
    let tau = minPeriod;

    while (tau < maxPeriod) {
      if (cmndf[tau] < threshold) {
        while (tau + 1 < maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        break;
      }
      tau++;
    }

    if (tau >= maxPeriod || cmndf[tau] >= threshold) {
      return null;
    }

    // Parabolic interpolation
    const interpolatedTau = this.parabolicInterpolation(cmndf, tau, minPeriod, maxPeriod, true);
    const frequency = sampleRate / interpolatedTau;

    const confidence = 1 - cmndf[tau];
    const clarity = confidence;

    return this.enrichPitchData(frequency, confidence, clarity);
  }

  /**
   * Detects pitch using Harmonic Product Spectrum
   *
   * @returns Pitch detection result
   */
  private detectWithHPS(): PitchDetectionResult | null {
    const frequencyData = this.analyzer.getFloatFrequencyData();
    const sampleRate = this.analyzer.getSampleRate();
    const fftSize = this.analyzer.getFFTSize();
    const harmonics = 5;

    // Create HPS by multiplying downsampled spectra
    const hps = new Float32Array(frequencyData.length);

    for (let i = 0; i < frequencyData.length; i++) {
      hps[i] = Math.pow(10, frequencyData[i] / 20);
    }

    for (let h = 2; h <= harmonics; h++) {
      for (let i = 0; i < Math.floor(frequencyData.length / h); i++) {
        const magnitude = Math.pow(10, frequencyData[i * h] / 20);
        hps[i] *= magnitude;
      }
    }

    // Find peak in frequency range
    const minBin = this.analyzer.getBinForFrequency(this.config.minFrequency);
    const maxBinFreq = this.analyzer.getBinForFrequency(this.config.maxFrequency);

    let maxValue = 0;
    let maxBin = 0;

    for (let i = minBin; i <= maxBinFreq && i < hps.length; i++) {
      if (hps[i] > maxValue) {
        maxValue = hps[i];
        maxBin = i;
      }
    }

    if (maxBin === 0 || maxValue === 0) {
      return null;
    }

    const frequency = this.analyzer.getFrequencyForBin(maxBin);

    // Calculate confidence based on peak prominence
    const avgValue = hps.slice(minBin, maxBinFreq + 1).reduce((a, b) => a + b, 0) / (maxBinFreq - minBin + 1);
    const confidence = avgValue > 0 ? Math.min(1, maxValue / (avgValue * 3)) : 0;
    const clarity = confidence;

    return this.enrichPitchData(frequency, confidence, clarity);
  }

  /**
   * Performs parabolic interpolation for sub-sample accuracy
   *
   * @param array - Data array
   * @param index - Peak index
   * @param min - Minimum valid index
   * @param max - Maximum valid index
   * @param invert - Whether to invert values (for YIN)
   * @returns Interpolated index
   */
  private parabolicInterpolation(
    array: Float32Array,
    index: number,
    min: number,
    max: number,
    invert: boolean = false
  ): number {
    if (index <= min || index >= max) {
      return index;
    }

    const alpha = array[index - 1];
    const beta = array[index];
    const gamma = array[index + 1];

    const multiplier = invert ? -1 : 1;
    const offset = multiplier * 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);

    return index + offset;
  }

  /**
   * Enriches frequency data with note information
   *
   * @param frequency - Detected frequency in Hz
   * @param confidence - Detection confidence
   * @param clarity - Pitch clarity
   * @returns Complete pitch detection result
   */
  private enrichPitchData(
    frequency: number,
    confidence: number,
    clarity: number
  ): PitchDetectionResult {
    // Calculate MIDI note number
    const midiNote = Math.round(12 * Math.log2(frequency / this.A4_FREQUENCY) + this.A4_MIDI);

    // Calculate exact note frequency
    const noteFrequency = this.A4_FREQUENCY * Math.pow(2, (midiNote - this.A4_MIDI) / 12);

    // Calculate cents deviation
    const cents = 1200 * Math.log2(frequency / noteFrequency);

    // Get note name
    const noteIndex = (midiNote % 12 + 12) % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    const note = `${this.NOTE_NAMES[noteIndex]}${octave}`;

    return {
      frequency,
      confidence,
      note,
      midiNote,
      cents,
      clarity
    };
  }

  /**
   * Converts MIDI note number to frequency
   *
   * @param midiNote - MIDI note number
   * @returns Frequency in Hz
   */
  midiToFrequency(midiNote: number): number {
    return this.A4_FREQUENCY * Math.pow(2, (midiNote - this.A4_MIDI) / 12);
  }

  /**
   * Converts frequency to MIDI note number
   *
   * @param frequency - Frequency in Hz
   * @returns MIDI note number
   */
  frequencyToMidi(frequency: number): number {
    return Math.round(12 * Math.log2(frequency / this.A4_FREQUENCY) + this.A4_MIDI);
  }

  /**
   * Gets the note name for a given frequency
   *
   * @param frequency - Frequency in Hz
   * @returns Note name (e.g., "A4")
   */
  frequencyToNote(frequency: number): string {
    const midiNote = this.frequencyToMidi(frequency);
    const noteIndex = (midiNote % 12 + 12) % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    return `${this.NOTE_NAMES[noteIndex]}${octave}`;
  }

  /**
   * Updates detector configuration
   *
   * @param config - New configuration options
   */
  updateConfig(config: PitchDetectorConfig): void {
    this.config = { ...this.config, ...config };
    this.logger.info('PitchDetector', 'Configuration updated');
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.logger.info('PitchDetector', 'Disposed');
  }
}
