/**
 * @fileoverview Chorus effect with modulation for rich, ensemble sounds.
 * Creates depth and width by modulating delayed copies of the signal.
 * @module audio/effects/Chorus
 */

import { AudioContext } from '../AudioContext';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

/**
 * Chorus configuration options.
 *
 * @example
 * ```typescript
 * const config: ChorusConfig = {
 *   rate: 1.5,
 *   depth: 0.002,
 *   feedback: 0.2,
 *   wetDryMix: 0.5,
 *   delay: 0.02
 * };
 * ```
 */
export interface ChorusConfig {
  /**
   * Modulation rate in Hz (0.1 to 10).
   * Default: 1.5
   */
  rate?: number;

  /**
   * Modulation depth in seconds (0.0 to 0.01).
   * Higher values create more pronounced chorus.
   * Default: 0.002
   */
  depth?: number;

  /**
   * Feedback amount (0.0 to 0.9).
   * Default: 0.2
   */
  feedback?: number;

  /**
   * Wet/dry mix (0.0 = dry only, 1.0 = wet only).
   * Default: 0.5
   */
  wetDryMix?: number;

  /**
   * Base delay time in seconds (0.001 to 0.05).
   * Default: 0.02
   */
  delay?: number;

  /**
   * Number of voices (1 to 4).
   * More voices create thicker sound but use more CPU.
   * Default: 2
   */
  voices?: number;
}

/**
 * Chorus presets for common effects.
 */
export enum ChorusPreset {
  SUBTLE = 'subtle',
  CLASSIC = 'classic',
  DEEP = 'deep',
  WIDE = 'wide',
  ENSEMBLE = 'ensemble',
  VIBRATO = 'vibrato'
}

/**
 * Single chorus voice with modulated delay.
 */
class ChorusVoice {
  private delay: DelayNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private feedback: GainNode;

  constructor(
    context: globalThis.AudioContext,
    baseDelay: number,
    rate: number,
    depth: number,
    feedbackAmount: number,
    phaseOffset: number
  ) {
    this.delay = context.createDelay(1.0);
    this.lfo = context.createOscillator();
    this.lfoGain = context.createGain();
    this.feedback = context.createGain();

    // Setup LFO modulation
    this.lfo.type = 'sine';
    this.lfo.frequency.value = rate;
    this.lfoGain.gain.value = depth;

    // Connect LFO to delay time
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);

    // Set base delay
    this.delay.delayTime.value = baseDelay;

    // Setup feedback
    this.feedback.gain.value = feedbackAmount;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);

    // Start LFO with phase offset
    this.lfo.start(context.currentTime + phaseOffset);
  }

  public getDelay(): DelayNode {
    return this.delay;
  }

  public setRate(rate: number): void {
    this.lfo.frequency.value = rate;
  }

  public setDepth(depth: number): void {
    this.lfoGain.gain.value = depth;
  }

  public setFeedback(feedback: number): void {
    this.feedback.gain.value = feedback;
  }

  public setBaseDelay(delay: number): void {
    this.delay.delayTime.value = delay;
  }

  public disconnect(): void {
    this.delay.disconnect();
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.feedback.disconnect();
  }
}

/**
 * Chorus effect using modulated delays for ensemble sounds.
 *
 * Features:
 * - Multiple chorus voices for thick sound
 * - Configurable modulation rate and depth
 * - Feedback control
 * - Wet/dry mix
 * - Stereo widening
 * - Common presets
 *
 * @example
 * ```typescript
 * const chorus = new Chorus();
 * chorus.initialize({
 *   rate: 1.5,
 *   depth: 0.002,
 *   feedback: 0.2,
 *   wetDryMix: 0.5,
 *   voices: 2
 * });
 *
 * // Connect to audio graph
 * audioSource.connect(chorus.getInput());
 * chorus.getOutput().connect(destination);
 *
 * // Adjust parameters
 * chorus.setRate(2.0);
 * chorus.setDepth(0.003);
 *
 * // Use preset
 * chorus.loadPreset(ChorusPreset.CLASSIC);
 * ```
 */
export class Chorus {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private voiceMixer: GainNode;
  private voices: ChorusVoice[] = [];

  private enabled: boolean = true;
  private rate: number = 1.5;
  private depth: number = 0.002;
  private feedback: number = 0.2;
  private wetDryMix: number = 0.5;
  private baseDelay: number = 0.02;
  private voiceCount: number = 2;

  /**
   * Creates a new chorus effect.
   *
   * @example
   * ```typescript
   * const chorus = new Chorus();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();
    this.voiceMixer = this.context.createGain();

    // Setup dry path
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    // Setup wet path
    this.voiceMixer.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);
  }

  /**
   * Initializes the chorus effect.
   *
   * @param config - Configuration options
   *
   * @example
   * ```typescript
   * chorus.initialize({
   *   rate: 2.0,
   *   depth: 0.003,
   *   feedback: 0.3,
   *   wetDryMix: 0.6,
   *   voices: 3
   * });
   * ```
   */
  public initialize(config: ChorusConfig = {}): void {
    this.rate = config.rate ?? 1.5;
    this.depth = config.depth ?? 0.002;
    this.feedback = config.feedback ?? 0.2;
    this.wetDryMix = config.wetDryMix ?? 0.5;
    this.baseDelay = config.delay ?? 0.02;
    this.voiceCount = Math.max(1, Math.min(4, config.voices ?? 2));

    this.createVoices();
    this.setWetDryMix(this.wetDryMix);

    logger.info('Chorus', `Initialized chorus with ${this.voiceCount} voices`);
  }

  /**
   * Loads a chorus preset with predefined characteristics.
   *
   * @param preset - Chorus preset to load
   *
   * @example
   * ```typescript
   * chorus.loadPreset(ChorusPreset.CLASSIC);
   * ```
   */
  public loadPreset(preset: ChorusPreset): void {
    const presets: Record<ChorusPreset, ChorusConfig> = {
      [ChorusPreset.SUBTLE]: {
        rate: 0.8,
        depth: 0.001,
        feedback: 0.1,
        wetDryMix: 0.3,
        delay: 0.015,
        voices: 1
      },
      [ChorusPreset.CLASSIC]: {
        rate: 1.5,
        depth: 0.002,
        feedback: 0.2,
        wetDryMix: 0.5,
        delay: 0.02,
        voices: 2
      },
      [ChorusPreset.DEEP]: {
        rate: 0.5,
        depth: 0.004,
        feedback: 0.3,
        wetDryMix: 0.6,
        delay: 0.025,
        voices: 2
      },
      [ChorusPreset.WIDE]: {
        rate: 2.0,
        depth: 0.003,
        feedback: 0.25,
        wetDryMix: 0.5,
        delay: 0.02,
        voices: 3
      },
      [ChorusPreset.ENSEMBLE]: {
        rate: 1.2,
        depth: 0.0025,
        feedback: 0.15,
        wetDryMix: 0.4,
        delay: 0.018,
        voices: 4
      },
      [ChorusPreset.VIBRATO]: {
        rate: 5.0,
        depth: 0.005,
        feedback: 0.0,
        wetDryMix: 1.0,
        delay: 0.01,
        voices: 1
      }
    };

    const config = presets[preset];
    this.initialize(config);

    logger.info('Chorus', `Loaded preset: ${preset}`);
  }

  /**
   * Sets the modulation rate.
   *
   * @param rate - Rate in Hz (0.1 to 10)
   *
   * @example
   * ```typescript
   * chorus.setRate(2.0); // 2 Hz modulation
   * ```
   */
  public setRate(rate: number): void {
    rate = Math.max(0.1, Math.min(10, rate));
    this.rate = rate;

    for (const voice of this.voices) {
      voice.setRate(rate);
    }
  }

  /**
   * Gets the modulation rate.
   *
   * @returns Rate in Hz
   *
   * @example
   * ```typescript
   * const rate = chorus.getRate();
   * ```
   */
  public getRate(): number {
    return this.rate;
  }

  /**
   * Sets the modulation depth.
   *
   * @param depth - Depth in seconds (0.0 to 0.01)
   *
   * @example
   * ```typescript
   * chorus.setDepth(0.003); // 3ms depth
   * ```
   */
  public setDepth(depth: number): void {
    depth = Math.max(0, Math.min(0.01, depth));
    this.depth = depth;

    for (const voice of this.voices) {
      voice.setDepth(depth);
    }
  }

  /**
   * Gets the modulation depth.
   *
   * @returns Depth in seconds
   *
   * @example
   * ```typescript
   * const depth = chorus.getDepth();
   * ```
   */
  public getDepth(): number {
    return this.depth;
  }

  /**
   * Sets the feedback amount.
   *
   * @param feedback - Feedback (0.0 to 0.9)
   *
   * @example
   * ```typescript
   * chorus.setFeedback(0.3);
   * ```
   */
  public setFeedback(feedback: number): void {
    feedback = Math.max(0, Math.min(0.9, feedback));
    this.feedback = feedback;

    for (const voice of this.voices) {
      voice.setFeedback(feedback);
    }
  }

  /**
   * Gets the feedback amount.
   *
   * @returns Feedback
   *
   * @example
   * ```typescript
   * const fb = chorus.getFeedback();
   * ```
   */
  public getFeedback(): number {
    return this.feedback;
  }

  /**
   * Sets the wet/dry mix.
   *
   * @param mix - Mix amount (0.0 = dry only, 1.0 = wet only)
   *
   * @example
   * ```typescript
   * chorus.setWetDryMix(0.5);
   * ```
   */
  public setWetDryMix(mix: number): void {
    mix = Math.max(0, Math.min(1, mix));
    this.wetDryMix = mix;

    // Equal power crossfade
    const wetAngle = mix * Math.PI * 0.5;
    this.wetGain.gain.value = Math.sin(wetAngle);
    this.dryGain.gain.value = Math.cos(wetAngle);
  }

  /**
   * Gets the wet/dry mix.
   *
   * @returns Mix amount
   *
   * @example
   * ```typescript
   * const mix = chorus.getWetDryMix();
   * ```
   */
  public getWetDryMix(): number {
    return this.wetDryMix;
  }

  /**
   * Sets the base delay time.
   *
   * @param delay - Delay in seconds (0.001 to 0.05)
   *
   * @example
   * ```typescript
   * chorus.setDelay(0.025);
   * ```
   */
  public setDelay(delay: number): void {
    delay = Math.max(0.001, Math.min(0.05, delay));
    this.baseDelay = delay;

    for (const voice of this.voices) {
      voice.setBaseDelay(delay);
    }
  }

  /**
   * Gets the base delay time.
   *
   * @returns Delay in seconds
   *
   * @example
   * ```typescript
   * const delay = chorus.getDelay();
   * ```
   */
  public getDelay(): number {
    return this.baseDelay;
  }

  /**
   * Gets the input node for connecting audio sources.
   *
   * @returns Input GainNode
   *
   * @example
   * ```typescript
   * const input = chorus.getInput();
   * audioSource.connect(input);
   * ```
   */
  public getInput(): AudioNode {
    return this.inputNode;
  }

  /**
   * Gets the output node for connecting to destination.
   *
   * @returns Output GainNode
   *
   * @example
   * ```typescript
   * const output = chorus.getOutput();
   * output.connect(destination);
   * ```
   */
  public getOutput(): AudioNode {
    return this.outputNode;
  }

  /**
   * Enables or disables the effect.
   *
   * @param enabled - Enable state
   *
   * @example
   * ```typescript
   * chorus.setEnabled(false); // Bypass chorus
   * ```
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.outputNode.gain.value = enabled ? 1.0 : 0.0;
  }

  /**
   * Gets the enabled state.
   *
   * @returns True if enabled
   *
   * @example
   * ```typescript
   * if (chorus.isEnabled()) {
   *   console.log('Chorus is active');
   * }
   * ```
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Disposes the effect and releases all resources.
   *
   * @example
   * ```typescript
   * chorus.dispose();
   * ```
   */
  public dispose(): void {
    this.destroyVoices();
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.voiceMixer.disconnect();
  }

  /**
   * Creates chorus voices with phase-shifted LFOs.
   */
  private createVoices(): void {
    this.destroyVoices();

    // Calculate voice gain for normalization
    const voiceGain = 1.0 / Math.sqrt(this.voiceCount);
    this.voiceMixer.gain.value = voiceGain;

    for (let i = 0; i < this.voiceCount; i++) {
      // Stagger phase for each voice
      const phaseOffset = i / this.voiceCount;

      // Slightly vary delay time for each voice
      const delayVariation = (i * 0.003) / this.voiceCount;
      const voiceDelay = this.baseDelay + delayVariation;

      const voice = new ChorusVoice(
        this.context,
        voiceDelay,
        this.rate,
        this.depth,
        this.feedback,
        phaseOffset
      );

      this.voices.push(voice);

      // Connect voice to mixer
      this.inputNode.connect(voice.getDelay());
      voice.getDelay().connect(this.voiceMixer);
    }
  }

  /**
   * Destroys all chorus voices.
   */
  private destroyVoices(): void {
    for (const voice of this.voices) {
      voice.disconnect();
    }
    this.voices.length = 0;
  }
}
