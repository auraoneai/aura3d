import { Logger } from '../../core/Logger';

/**
 * Configuration options for AudioAnalyzer
 */
export interface AudioAnalyzerConfig {
  /** FFT size (must be power of 2, between 32 and 32768) */
  fftSize?: number;
  /** Smoothing time constant (0-1) */
  smoothingTimeConstant?: number;
  /** Minimum decibels for frequency data */
  minDecibels?: number;
  /** Maximum decibels for frequency data */
  maxDecibels?: number;
}

/**
 * Audio analysis data structure
 */
export interface AudioAnalysisData {
  /** Time domain data (waveform) */
  timeDomain: Uint8Array;
  /** Frequency domain data (spectrum) */
  frequencyData: Uint8Array;
  /** Float frequency data for precise analysis */
  floatFrequencyData: Float32Array;
  /** Current timestamp */
  timestamp: number;
  /** Sample rate */
  sampleRate: number;
}

/**
 * Real-time audio analyzer using Web Audio API's AnalyserNode.
 * Provides time-domain and frequency-domain analysis for visualization and processing.
 *
 * @example
 * ```typescript
 * const analyzer = new AudioAnalyzer(audioContext, sourceNode);
 * const data = analyzer.getAnalysisData();
 * console.log('Frequency data:', data.frequencyData);
 * ```
 */
export class AudioAnalyzer {
  private logger: Logger;
  private analyserNode: AnalyserNode;
  private audioContext: AudioContext;
  private timeDomainData: Uint8Array;
  private frequencyData: Uint8Array;
  private floatFrequencyData: Float32Array;
  private connected: boolean = false;

  /**
   * Creates a new AudioAnalyzer instance
   *
   * @param audioContext - Web Audio API audio context
   * @param config - Analyzer configuration options
   */
  constructor(audioContext: AudioContext, config: AudioAnalyzerConfig = {}) {
    this.logger = Logger.getInstance();
    this.audioContext = audioContext;

    // Create analyser node with configuration
    this.analyserNode = audioContext.createAnalyser();
    this.analyserNode.fftSize = config.fftSize ?? 2048;
    this.analyserNode.smoothingTimeConstant = config.smoothingTimeConstant ?? 0.8;
    this.analyserNode.minDecibels = config.minDecibels ?? -90;
    this.analyserNode.maxDecibels = config.maxDecibels ?? -10;

    // Initialize data arrays
    const bufferLength = this.analyserNode.frequencyBinCount;
    this.timeDomainData = new Uint8Array(this.analyserNode.fftSize);
    this.frequencyData = new Uint8Array(bufferLength);
    this.floatFrequencyData = new Float32Array(bufferLength);

    this.logger.info('AudioAnalyzer', `Initialized with FFT size: ${this.analyserNode.fftSize}`);
  }

  /**
   * Connects the analyzer to an audio source
   *
   * @param sourceNode - Audio source node to analyze
   */
  connect(sourceNode: AudioNode): void {
    if (this.connected) {
      this.logger.warn('AudioAnalyzer', 'Already connected to a source');
      return;
    }

    sourceNode.connect(this.analyserNode);
    this.connected = true;
    this.logger.info('AudioAnalyzer', 'Connected to audio source');
  }

  /**
   * Disconnects the analyzer from its source
   */
  disconnect(): void {
    if (!this.connected) {
      return;
    }

    this.analyserNode.disconnect();
    this.connected = false;
    this.logger.info('AudioAnalyzer', 'Disconnected from audio source');
  }

  /**
   * Gets the current analysis data
   *
   * @returns Current audio analysis data including time and frequency domain
   */
  getAnalysisData(): AudioAnalysisData {
    this.analyserNode.getByteTimeDomainData(this.timeDomainData as any);
    this.analyserNode.getByteFrequencyData(this.frequencyData as any);
    this.analyserNode.getFloatFrequencyData(this.floatFrequencyData as any);

    return {
      timeDomain: this.timeDomainData,
      frequencyData: this.frequencyData,
      floatFrequencyData: this.floatFrequencyData,
      timestamp: this.audioContext.currentTime,
      sampleRate: this.audioContext.sampleRate
    };
  }

  /**
   * Gets raw time domain data (waveform)
   *
   * @returns Uint8Array containing waveform data (0-255)
   */
  getTimeDomainData(): Uint8Array {
    this.analyserNode.getByteTimeDomainData(this.timeDomainData as any);
    return this.timeDomainData;
  }

  /**
   * Gets raw frequency domain data (spectrum)
   *
   * @returns Uint8Array containing frequency magnitude data (0-255)
   */
  getFrequencyData(): Uint8Array {
    this.analyserNode.getByteFrequencyData(this.frequencyData as any);
    return this.frequencyData;
  }

  /**
   * Gets float frequency domain data for precise analysis
   *
   * @returns Float32Array containing frequency magnitude in dB
   */
  getFloatFrequencyData(): Float32Array {
    this.analyserNode.getFloatFrequencyData(this.floatFrequencyData as any);
    return this.floatFrequencyData;
  }

  /**
   * Gets the frequency for a given bin index
   *
   * @param binIndex - FFT bin index
   * @returns Frequency in Hz
   */
  getFrequencyForBin(binIndex: number): number {
    return (binIndex * this.audioContext.sampleRate) / this.analyserNode.fftSize;
  }

  /**
   * Gets the bin index for a given frequency
   *
   * @param frequency - Frequency in Hz
   * @returns FFT bin index
   */
  getBinForFrequency(frequency: number): number {
    return Math.round((frequency * this.analyserNode.fftSize) / this.audioContext.sampleRate);
  }

  /**
   * Gets the magnitude for a specific frequency range
   *
   * @param minFreq - Minimum frequency in Hz
   * @param maxFreq - Maximum frequency in Hz
   * @returns Average magnitude in the frequency range (0-255)
   */
  getFrequencyRangeMagnitude(minFreq: number, maxFreq: number): number {
    const minBin = this.getBinForFrequency(minFreq);
    const maxBin = this.getBinForFrequency(maxFreq);

    this.analyserNode.getByteFrequencyData(this.frequencyData as any);

    let sum = 0;
    const count = maxBin - minBin + 1;

    for (let i = minBin; i <= maxBin; i++) {
      sum += this.frequencyData[i];
    }

    return sum / count;
  }

  /**
   * Updates analyzer configuration
   *
   * @param config - New configuration options
   */
  updateConfig(config: AudioAnalyzerConfig): void {
    if (config.fftSize !== undefined) {
      this.analyserNode.fftSize = config.fftSize;
      this.timeDomainData = new Uint8Array(this.analyserNode.fftSize);
      const bufferLength = this.analyserNode.frequencyBinCount;
      this.frequencyData = new Uint8Array(bufferLength);
      this.floatFrequencyData = new Float32Array(bufferLength);
    }

    if (config.smoothingTimeConstant !== undefined) {
      this.analyserNode.smoothingTimeConstant = config.smoothingTimeConstant;
    }

    if (config.minDecibels !== undefined) {
      this.analyserNode.minDecibels = config.minDecibels;
    }

    if (config.maxDecibels !== undefined) {
      this.analyserNode.maxDecibels = config.maxDecibels;
    }

    this.logger.info('AudioAnalyzer', 'Configuration updated');
  }

  /**
   * Gets the underlying AnalyserNode
   *
   * @returns Web Audio API AnalyserNode
   */
  getAnalyserNode(): AnalyserNode {
    return this.analyserNode;
  }

  /**
   * Gets the FFT size
   *
   * @returns Current FFT size
   */
  getFFTSize(): number {
    return this.analyserNode.fftSize;
  }

  /**
   * Gets the number of frequency bins
   *
   * @returns Number of frequency bins (fftSize / 2)
   */
  getFrequencyBinCount(): number {
    return this.analyserNode.frequencyBinCount;
  }

  /**
   * Gets the sample rate
   *
   * @returns Audio context sample rate in Hz
   */
  getSampleRate(): number {
    return this.audioContext.sampleRate;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.disconnect();
    this.logger.info('AudioAnalyzer', 'Disposed');
  }
}
