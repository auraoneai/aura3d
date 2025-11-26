import { Logger } from '../core/Logger';

/**
 * Voice processing configuration
 */
export interface VoiceProcessorConfig {
  /** Enable noise suppression */
  noiseSuppression?: boolean;
  /** Enable automatic gain control */
  autoGainControl?: boolean;
  /** Enable echo cancellation */
  echoCancellation?: boolean;
  /** Target volume level (0-1) */
  targetLevel?: number;
  /** Noise gate threshold in dB */
  noiseGateThreshold?: number;
  /** Attack time for compression in seconds */
  attackTime?: number;
  /** Release time for compression in seconds */
  releaseTime?: number;
  /** Compression ratio */
  compressionRatio?: number;
}

/**
 * Voice activity detection result
 */
export interface VoiceActivity {
  /** Whether voice is detected */
  isVoice: boolean;
  /** Voice probability (0-1) */
  probability: number;
  /** Energy level */
  energy: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Voice processor with noise suppression and gain control.
 * Optimizes voice audio for communication and recording.
 *
 * @example
 * ```typescript
 * const processor = new VoiceProcessor(audioContext, {
 *   noiseSuppression: true,
 *   autoGainControl: true
 * });
 * sourceNode.connect(processor.getInputNode());
 * processor.connect(audioContext.destination);
 * ```
 */
export class VoiceProcessor {
  private logger: Logger;
  private audioContext: AudioContext;
  private config: Required<VoiceProcessorConfig>;

  private inputNode: GainNode;
  private outputNode: GainNode;
  private compressor: DynamicsCompressorNode;
  private noiseGate: GainNode;
  private highPassFilter: BiquadFilterNode;
  private lowPassFilter: BiquadFilterNode;

  private analyserNode: AnalyserNode;
  private timeDomainData: Uint8Array;

  private currentGain: number = 1.0;
  private voiceActive: boolean = false;
  private energyHistory: number[] = [];
  private readonly HISTORY_SIZE = 20;

  /**
   * Creates a new VoiceProcessor instance
   *
   * @param audioContext - Web Audio API audio context
   * @param config - Voice processing configuration
   */
  constructor(audioContext: AudioContext, config: VoiceProcessorConfig = {}) {
    this.logger = Logger.getInstance();
    this.audioContext = audioContext;

    this.config = {
      noiseSuppression: config.noiseSuppression ?? true,
      autoGainControl: config.autoGainControl ?? true,
      echoCancellation: config.echoCancellation ?? true,
      targetLevel: config.targetLevel ?? 0.7,
      noiseGateThreshold: config.noiseGateThreshold ?? -50,
      attackTime: config.attackTime ?? 0.003,
      releaseTime: config.releaseTime ?? 0.25,
      compressionRatio: config.compressionRatio ?? 4
    };

    this.inputNode = audioContext.createGain();
    this.outputNode = audioContext.createGain();

    this.compressor = audioContext.createDynamicsCompressor();
    this.noiseGate = audioContext.createGain();

    this.highPassFilter = audioContext.createBiquadFilter();
    this.lowPassFilter = audioContext.createBiquadFilter();

    this.analyserNode = audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.timeDomainData = new Uint8Array(this.analyserNode.fftSize);

    this.setupAudioGraph();
    this.setupCompressor();
    this.setupFilters();

    this.logger.info('VoiceProcessor', 'Initialized');
  }

  /**
   * Sets up the audio processing graph
   */
  private setupAudioGraph(): void {
    this.inputNode.connect(this.highPassFilter);
    this.highPassFilter.connect(this.lowPassFilter);
    this.lowPassFilter.connect(this.noiseGate);
    this.noiseGate.connect(this.compressor);
    this.compressor.connect(this.outputNode);

    this.inputNode.connect(this.analyserNode);
  }

  /**
   * Sets up the compressor for automatic gain control
   */
  private setupCompressor(): void {
    if (!this.config.autoGainControl) {
      this.compressor.threshold.value = 0;
      this.compressor.knee.value = 0;
      this.compressor.ratio.value = 1;
      this.compressor.attack.value = 0;
      this.compressor.release.value = 0;
      return;
    }

    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = this.config.compressionRatio;
    this.compressor.attack.value = this.config.attackTime;
    this.compressor.release.value = this.config.releaseTime;
  }

  /**
   * Sets up filters for noise suppression
   */
  private setupFilters(): void {
    if (!this.config.noiseSuppression) {
      this.highPassFilter.type = 'allpass';
      this.lowPassFilter.type = 'allpass';
      return;
    }

    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.value = 80;
    this.highPassFilter.Q.value = 0.7;

    this.lowPassFilter.type = 'lowpass';
    this.lowPassFilter.frequency.value = 8000;
    this.lowPassFilter.Q.value = 0.7;
  }

  /**
   * Updates noise gate based on audio analysis
   */
  private updateNoiseGate(): void {
    this.analyserNode.getByteTimeDomainData(this.timeDomainData as any);

    let sum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const normalized = (this.timeDomainData[i] - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / this.timeDomainData.length);
    const db = 20 * Math.log10(rms + 0.0001);

    this.energyHistory.push(rms);
    if (this.energyHistory.length > this.HISTORY_SIZE) {
      this.energyHistory.shift();
    }

    if (db > this.config.noiseGateThreshold) {
      this.noiseGate.gain.setTargetAtTime(1, this.audioContext.currentTime, 0.01);
      this.voiceActive = true;
    } else {
      this.noiseGate.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.1);
      this.voiceActive = false;
    }

    if (this.config.autoGainControl) {
      this.updateAutoGain(rms);
    }
  }

  /**
   * Updates automatic gain control
   *
   * @param currentLevel - Current RMS level
   */
  private updateAutoGain(currentLevel: number): void {
    if (this.energyHistory.length < this.HISTORY_SIZE) {
      return;
    }

    const avgLevel = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

    if (avgLevel > 0.001) {
      const targetGain = this.config.targetLevel / avgLevel;
      const clampedGain = Math.max(0.1, Math.min(10, targetGain));

      this.currentGain = this.currentGain * 0.95 + clampedGain * 0.05;
      this.inputNode.gain.setTargetAtTime(
        this.currentGain,
        this.audioContext.currentTime,
        0.1
      );
    }
  }

  /**
   * Starts processing (begins noise gate updates)
   */
  start(): void {
    this.processLoop();
    this.logger.info('VoiceProcessor', 'Started processing');
  }

  /**
   * Processing loop
   */
  private processLoop(): void {
    this.updateNoiseGate();
    requestAnimationFrame(() => this.processLoop());
  }

  /**
   * Detects voice activity
   *
   * @returns Voice activity detection result
   */
  detectVoiceActivity(): VoiceActivity {
    this.analyserNode.getByteTimeDomainData(this.timeDomainData as any);

    let sum = 0;
    let zeroCrossings = 0;

    for (let i = 0; i < this.timeDomainData.length; i++) {
      const normalized = (this.timeDomainData[i] - 128) / 128;
      sum += normalized * normalized;

      if (i > 0) {
        const prev = (this.timeDomainData[i - 1] - 128) / 128;
        if ((prev >= 0 && normalized < 0) || (prev < 0 && normalized >= 0)) {
          zeroCrossings++;
        }
      }
    }

    const energy = Math.sqrt(sum / this.timeDomainData.length);
    const energyDb = 20 * Math.log10(energy + 0.0001);

    const zcr = zeroCrossings / this.timeDomainData.length;

    const energyScore = energyDb > this.config.noiseGateThreshold ? 1 : 0;
    const zcrScore = (zcr > 0.02 && zcr < 0.3) ? 1 : 0;

    const probability = (energyScore + zcrScore) / 2;
    const isVoice = probability > 0.5;

    return {
      isVoice,
      probability,
      energy,
      timestamp: this.audioContext.currentTime
    };
  }

  /**
   * Gets the current voice activity state
   *
   * @returns True if voice is active
   */
  isVoiceActive(): boolean {
    return this.voiceActive;
  }

  /**
   * Sets the noise gate threshold
   *
   * @param threshold - Threshold in dB
   */
  setNoiseGateThreshold(threshold: number): void {
    this.config.noiseGateThreshold = threshold;
    this.logger.info('VoiceProcessor', `Noise gate threshold set to ${threshold} dB`);
  }

  /**
   * Sets the target level for auto gain control
   *
   * @param level - Target level (0-1)
   */
  setTargetLevel(level: number): void {
    this.config.targetLevel = Math.max(0, Math.min(1, level));
  }

  /**
   * Enables or disables noise suppression
   *
   * @param enabled - Enable state
   */
  setNoiseSuppression(enabled: boolean): void {
    this.config.noiseSuppression = enabled;
    this.setupFilters();
    this.logger.info('VoiceProcessor', `Noise suppression ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enables or disables automatic gain control
   *
   * @param enabled - Enable state
   */
  setAutoGainControl(enabled: boolean): void {
    this.config.autoGainControl = enabled;
    this.setupCompressor();
    this.logger.info('VoiceProcessor', `Auto gain control ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Gets the current gain level
   *
   * @returns Current gain
   */
  getCurrentGain(): number {
    return this.currentGain;
  }

  /**
   * Gets the current energy level
   *
   * @returns Energy level (0-1)
   */
  getEnergyLevel(): number {
    if (this.energyHistory.length === 0) {
      return 0;
    }

    return this.energyHistory[this.energyHistory.length - 1];
  }

  /**
   * Updates processor configuration
   *
   * @param config - New configuration options
   */
  updateConfig(config: Partial<VoiceProcessorConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.noiseSuppression !== undefined) {
      this.setupFilters();
    }

    if (config.autoGainControl !== undefined ||
        config.compressionRatio !== undefined ||
        config.attackTime !== undefined ||
        config.releaseTime !== undefined) {
      this.setupCompressor();
    }

    this.logger.info('VoiceProcessor', 'Configuration updated');
  }

  /**
   * Connects the processor input to a source
   *
   * @param source - Audio source node
   */
  connectSource(source: AudioNode): void {
    source.connect(this.inputNode);
  }

  /**
   * Connects the processor output to a destination
   *
   * @param destination - Destination audio node
   */
  connect(destination: AudioNode): void {
    this.outputNode.connect(destination);
  }

  /**
   * Disconnects the processor from all sources and destinations
   */
  disconnect(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
  }

  /**
   * Gets the input node
   *
   * @returns Input gain node
   */
  getInputNode(): GainNode {
    return this.inputNode;
  }

  /**
   * Gets the output node
   *
   * @returns Output gain node
   */
  getOutputNode(): GainNode {
    return this.outputNode;
  }

  /**
   * Gets the compressor node
   *
   * @returns Dynamics compressor node
   */
  getCompressorNode(): DynamicsCompressorNode {
    return this.compressor;
  }

  /**
   * Resets the processor state
   */
  reset(): void {
    this.energyHistory = [];
    this.currentGain = 1.0;
    this.voiceActive = false;
    this.inputNode.gain.value = 1.0;
    this.logger.info('VoiceProcessor', 'Reset');
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.disconnect();
    this.inputNode.disconnect();
    this.highPassFilter.disconnect();
    this.lowPassFilter.disconnect();
    this.noiseGate.disconnect();
    this.compressor.disconnect();
    this.analyserNode.disconnect();

    this.logger.info('VoiceProcessor', 'Disposed');
  }
}
