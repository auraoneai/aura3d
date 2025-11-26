/**
 * @fileoverview Audio effects system for the G3D engine.
 * Provides common audio effects like reverb, delay, filters, and compression.
 * @module audio/AudioEffect
 */

import { AudioContext } from './AudioContext';

/**
 * Base audio effect interface.
 * All effects implement this for consistent API.
 */
export interface IAudioEffect {
  /**
   * Gets the input node for connecting audio sources.
   */
  getInput(): AudioNode;

  /**
   * Gets the output node for connecting to destination.
   */
  getOutput(): AudioNode;

  /**
   * Enables or disables the effect (bypasses when disabled).
   */
  setEnabled(enabled: boolean): void;

  /**
   * Gets the enabled state.
   */
  isEnabled(): boolean;

  /**
   * Disposes the effect and releases resources.
   */
  dispose(): void;
}

/**
 * Reverb effect using ConvolverNode.
 *
 * Simulates room acoustics and reflections.
 *
 * @example
 * ```typescript
 * const reverb = new ReverbEffect();
 * await reverb.initialize({ impulseResponseURL: '/audio/impulse.wav' });
 * reverb.setWetDryMix(0.3);
 *
 * // Connect audio through reverb
 * audioSource.connect(reverb.getInput());
 * reverb.getOutput().connect(destination);
 * ```
 */
export class ReverbEffect implements IAudioEffect {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private convolver: ConvolverNode;
  private wetGain: GainNode;
  private dryGain: GainNode;

  private enabled: boolean = true;
  private wetDryMix: number = 0.5; // 0 = dry, 1 = wet

  /**
   * Creates a reverb effect.
   *
   * @example
   * ```typescript
   * const reverb = new ReverbEffect();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.convolver = this.context.createConvolver();
    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();

    // Setup audio graph: input -> [convolver -> wet, dry] -> output
    this.inputNode.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    this.setWetDryMix(this.wetDryMix);
  }

  /**
   * Initializes the reverb with an impulse response.
   *
   * @param config - Configuration options
   * @param config.impulseResponseURL - URL to impulse response audio file
   * @param config.wetDryMix - Wet/dry mix (0.0 to 1.0)
   * @returns Promise that resolves when impulse response is loaded
   *
   * @example
   * ```typescript
   * await reverb.initialize({
   *   impulseResponseURL: '/audio/hall.wav',
   *   wetDryMix: 0.3
   * });
   * ```
   */
  public async initialize(config: { impulseResponseURL?: string; wetDryMix?: number } = {}): Promise<void> {
    if (config.impulseResponseURL) {
      await this.loadImpulseResponse(config.impulseResponseURL);
    } else {
      // Generate simple impulse response if none provided
      this.generateSimpleImpulse();
    }

    if (config.wetDryMix !== undefined) {
      this.setWetDryMix(config.wetDryMix);
    }
  }

  /**
   * Loads an impulse response from URL.
   *
   * @param url - Path to impulse response audio file
   * @returns Promise that resolves when loaded
   *
   * @example
   * ```typescript
   * await reverb.loadImpulseResponse('/audio/cathedral.wav');
   * ```
   */
  public async loadImpulseResponse(url: string): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
    this.convolver.buffer = audioBuffer;
  }

  /**
   * Sets the wet/dry mix.
   *
   * @param mix - Mix amount (0.0 = dry only, 1.0 = wet only)
   *
   * @example
   * ```typescript
   * reverb.setWetDryMix(0.3); // 30% wet, 70% dry
   * ```
   */
  public setWetDryMix(mix: number): void {
    mix = Math.max(0, Math.min(1, mix));
    this.wetDryMix = mix;

    this.wetGain.gain.value = mix;
    this.dryGain.gain.value = 1 - mix;
  }

  /**
   * Gets the wet/dry mix.
   *
   * @returns Mix amount
   *
   * @example
   * ```typescript
   * const mix = reverb.getWetDryMix();
   * ```
   */
  public getWetDryMix(): number {
    return this.wetDryMix;
  }

  public getInput(): AudioNode {
    return this.inputNode;
  }

  public getOutput(): AudioNode {
    return this.outputNode;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.outputNode.gain.value = enabled ? 1.0 : 0.0;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.convolver.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
  }

  /**
   * Generates a simple impulse response for basic reverb.
   */
  private generateSimpleImpulse(): void {
    const sampleRate = this.context.sampleRate;
    const duration = 2; // 2 seconds
    const length = sampleRate * duration;

    const impulse = this.context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        // Exponential decay with random noise
        const decay = Math.exp(-i / (sampleRate * 0.5));
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }

    this.convolver.buffer = impulse;
  }
}

/**
 * Delay effect using DelayNode.
 *
 * Creates echo and delay effects.
 *
 * @example
 * ```typescript
 * const delay = new DelayEffect();
 * delay.initialize({ delayTime: 0.3, feedback: 0.4 });
 *
 * audioSource.connect(delay.getInput());
 * delay.getOutput().connect(destination);
 * ```
 */
export class DelayEffect implements IAudioEffect {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private delayNode: DelayNode;
  private feedbackGain: GainNode;
  private wetGain: GainNode;
  private dryGain: GainNode;

  private enabled: boolean = true;

  /**
   * Creates a delay effect.
   *
   * @example
   * ```typescript
   * const delay = new DelayEffect();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.delayNode = this.context.createDelay(5.0); // Max 5 seconds
    this.feedbackGain = this.context.createGain();
    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();

    // Setup audio graph
    this.inputNode.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);
  }

  /**
   * Initializes the delay effect.
   *
   * @param config - Configuration options
   * @param config.delayTime - Delay time in seconds (default: 0.25)
   * @param config.feedback - Feedback amount 0.0 to 1.0 (default: 0.3)
   * @param config.wetDryMix - Wet/dry mix 0.0 to 1.0 (default: 0.5)
   *
   * @example
   * ```typescript
   * delay.initialize({
   *   delayTime: 0.5,
   *   feedback: 0.4,
   *   wetDryMix: 0.3
   * });
   * ```
   */
  public initialize(config: { delayTime?: number; feedback?: number; wetDryMix?: number } = {}): void {
    this.setDelayTime(config.delayTime ?? 0.25);
    this.setFeedback(config.feedback ?? 0.3);
    this.setWetDryMix(config.wetDryMix ?? 0.5);
  }

  /**
   * Sets the delay time.
   *
   * @param time - Delay time in seconds
   *
   * @example
   * ```typescript
   * delay.setDelayTime(0.5); // 500ms delay
   * ```
   */
  public setDelayTime(time: number): void {
    time = Math.max(0, Math.min(5.0, time));
    this.delayNode.delayTime.value = time;
  }

  /**
   * Gets the delay time.
   *
   * @returns Delay time in seconds
   *
   * @example
   * ```typescript
   * const time = delay.getDelayTime();
   * ```
   */
  public getDelayTime(): number {
    return this.delayNode.delayTime.value;
  }

  /**
   * Sets the feedback amount.
   *
   * @param feedback - Feedback (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * delay.setFeedback(0.5); // 50% feedback
   * ```
   */
  public setFeedback(feedback: number): void {
    feedback = Math.max(0, Math.min(0.95, feedback)); // Cap at 0.95 to prevent runaway
    this.feedbackGain.gain.value = feedback;
  }

  /**
   * Gets the feedback amount.
   *
   * @returns Feedback amount
   *
   * @example
   * ```typescript
   * const fb = delay.getFeedback();
   * ```
   */
  public getFeedback(): number {
    return this.feedbackGain.gain.value;
  }

  /**
   * Sets the wet/dry mix.
   *
   * @param mix - Mix amount (0.0 = dry only, 1.0 = wet only)
   *
   * @example
   * ```typescript
   * delay.setWetDryMix(0.3);
   * ```
   */
  public setWetDryMix(mix: number): void {
    mix = Math.max(0, Math.min(1, mix));
    this.wetGain.gain.value = mix;
    this.dryGain.gain.value = 1 - mix;
  }

  public getInput(): AudioNode {
    return this.inputNode;
  }

  public getOutput(): AudioNode {
    return this.outputNode;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.outputNode.gain.value = enabled ? 1.0 : 0.0;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.delayNode.disconnect();
    this.feedbackGain.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
  }
}

/**
 * Filter effect using BiquadFilterNode.
 *
 * Provides low-pass, high-pass, band-pass, and other filter types.
 *
 * @example
 * ```typescript
 * const filter = new FilterEffect();
 * filter.initialize({
 *   type: 'lowpass',
 *   frequency: 800,
 *   q: 1.0
 * });
 *
 * audioSource.connect(filter.getInput());
 * filter.getOutput().connect(destination);
 * ```
 */
export class FilterEffect implements IAudioEffect {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private filterNode: BiquadFilterNode;

  private enabled: boolean = true;

  /**
   * Creates a filter effect.
   *
   * @example
   * ```typescript
   * const filter = new FilterEffect();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.filterNode = this.context.createBiquadFilter();

    this.inputNode.connect(this.filterNode);
    this.filterNode.connect(this.outputNode);
  }

  /**
   * Initializes the filter.
   *
   * @param config - Configuration options
   * @param config.type - Filter type (default: 'lowpass')
   * @param config.frequency - Cutoff frequency in Hz (default: 1000)
   * @param config.q - Q factor (default: 1.0)
   * @param config.gain - Gain in dB for peaking/shelving (default: 0)
   *
   * @example
   * ```typescript
   * filter.initialize({
   *   type: 'highpass',
   *   frequency: 200,
   *   q: 0.7
   * });
   * ```
   */
  public initialize(config: {
    type?: BiquadFilterType;
    frequency?: number;
    q?: number;
    gain?: number;
  } = {}): void {
    this.setType(config.type ?? 'lowpass');
    this.setFrequency(config.frequency ?? 1000);
    this.setQ(config.q ?? 1.0);
    this.setGain(config.gain ?? 0);
  }

  /**
   * Sets the filter type.
   *
   * @param type - Filter type
   *
   * @example
   * ```typescript
   * filter.setType('lowpass');
   * filter.setType('highpass');
   * filter.setType('bandpass');
   * ```
   */
  public setType(type: BiquadFilterType): void {
    this.filterNode.type = type;
  }

  /**
   * Gets the filter type.
   *
   * @returns Filter type
   *
   * @example
   * ```typescript
   * const type = filter.getType();
   * ```
   */
  public getType(): BiquadFilterType {
    return this.filterNode.type;
  }

  /**
   * Sets the cutoff frequency.
   *
   * @param frequency - Frequency in Hz
   *
   * @example
   * ```typescript
   * filter.setFrequency(800); // 800 Hz cutoff
   * ```
   */
  public setFrequency(frequency: number): void {
    this.filterNode.frequency.value = Math.max(10, Math.min(this.context.sampleRate / 2, frequency));
  }

  /**
   * Gets the cutoff frequency.
   *
   * @returns Frequency in Hz
   *
   * @example
   * ```typescript
   * const freq = filter.getFrequency();
   * ```
   */
  public getFrequency(): number {
    return this.filterNode.frequency.value;
  }

  /**
   * Sets the Q factor (resonance).
   *
   * @param q - Q factor
   *
   * @example
   * ```typescript
   * filter.setQ(5.0); // High resonance
   * ```
   */
  public setQ(q: number): void {
    this.filterNode.Q.value = Math.max(0.0001, q);
  }

  /**
   * Gets the Q factor.
   *
   * @returns Q factor
   *
   * @example
   * ```typescript
   * const q = filter.getQ();
   * ```
   */
  public getQ(): number {
    return this.filterNode.Q.value;
  }

  /**
   * Sets the gain (for peaking/shelving filters).
   *
   * @param gain - Gain in dB
   *
   * @example
   * ```typescript
   * filter.setGain(6); // +6dB boost
   * ```
   */
  public setGain(gain: number): void {
    this.filterNode.gain.value = gain;
  }

  /**
   * Gets the gain.
   *
   * @returns Gain in dB
   *
   * @example
   * ```typescript
   * const gain = filter.getGain();
   * ```
   */
  public getGain(): number {
    return this.filterNode.gain.value;
  }

  public getInput(): AudioNode {
    return this.inputNode;
  }

  public getOutput(): AudioNode {
    return this.outputNode;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // Bypass filter when disabled
    if (enabled) {
      this.inputNode.disconnect();
      this.inputNode.connect(this.filterNode);
    } else {
      this.inputNode.disconnect();
      this.inputNode.connect(this.outputNode);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.filterNode.disconnect();
  }
}

/**
 * Compressor effect using DynamicsCompressorNode.
 *
 * Reduces dynamic range for consistent volume levels.
 *
 * @example
 * ```typescript
 * const compressor = new CompressorEffect();
 * compressor.initialize({
 *   threshold: -24,
 *   ratio: 4,
 *   attack: 0.003,
 *   release: 0.25
 * });
 *
 * audioSource.connect(compressor.getInput());
 * compressor.getOutput().connect(destination);
 * ```
 */
export class CompressorEffect implements IAudioEffect {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private compressor: DynamicsCompressorNode;

  private enabled: boolean = true;

  /**
   * Creates a compressor effect.
   *
   * @example
   * ```typescript
   * const compressor = new CompressorEffect();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();

    this.inputNode.connect(this.compressor);
    this.compressor.connect(this.outputNode);
  }

  /**
   * Initializes the compressor.
   *
   * @param config - Configuration options
   * @param config.threshold - Threshold in dB (default: -24)
   * @param config.knee - Knee in dB (default: 30)
   * @param config.ratio - Compression ratio (default: 12)
   * @param config.attack - Attack time in seconds (default: 0.003)
   * @param config.release - Release time in seconds (default: 0.25)
   *
   * @example
   * ```typescript
   * compressor.initialize({
   *   threshold: -20,
   *   ratio: 6,
   *   attack: 0.005,
   *   release: 0.1
   * });
   * ```
   */
  public initialize(config: {
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  } = {}): void {
    this.setThreshold(config.threshold ?? -24);
    this.setKnee(config.knee ?? 30);
    this.setRatio(config.ratio ?? 12);
    this.setAttack(config.attack ?? 0.003);
    this.setRelease(config.release ?? 0.25);
  }

  /**
   * Sets the threshold.
   *
   * @param threshold - Threshold in dB
   *
   * @example
   * ```typescript
   * compressor.setThreshold(-20);
   * ```
   */
  public setThreshold(threshold: number): void {
    this.compressor.threshold.value = Math.max(-100, Math.min(0, threshold));
  }

  /**
   * Sets the knee.
   *
   * @param knee - Knee in dB
   *
   * @example
   * ```typescript
   * compressor.setKnee(10);
   * ```
   */
  public setKnee(knee: number): void {
    this.compressor.knee.value = Math.max(0, Math.min(40, knee));
  }

  /**
   * Sets the compression ratio.
   *
   * @param ratio - Ratio (1 to 20)
   *
   * @example
   * ```typescript
   * compressor.setRatio(4);
   * ```
   */
  public setRatio(ratio: number): void {
    this.compressor.ratio.value = Math.max(1, Math.min(20, ratio));
  }

  /**
   * Sets the attack time.
   *
   * @param attack - Attack time in seconds
   *
   * @example
   * ```typescript
   * compressor.setAttack(0.005);
   * ```
   */
  public setAttack(attack: number): void {
    this.compressor.attack.value = Math.max(0, Math.min(1, attack));
  }

  /**
   * Sets the release time.
   *
   * @param release - Release time in seconds
   *
   * @example
   * ```typescript
   * compressor.setRelease(0.25);
   * ```
   */
  public setRelease(release: number): void {
    this.compressor.release.value = Math.max(0, Math.min(1, release));
  }

  /**
   * Gets the current reduction in dB.
   *
   * @returns Reduction in dB
   *
   * @example
   * ```typescript
   * const reduction = compressor.getReduction();
   * console.log(`Compressing by ${reduction} dB`);
   * ```
   */
  public getReduction(): number {
    return this.compressor.reduction;
  }

  public getInput(): AudioNode {
    return this.inputNode;
  }

  public getOutput(): AudioNode {
    return this.outputNode;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // Bypass compressor when disabled
    if (enabled) {
      this.inputNode.disconnect();
      this.inputNode.connect(this.compressor);
    } else {
      this.inputNode.disconnect();
      this.inputNode.connect(this.outputNode);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.compressor.disconnect();
  }
}
