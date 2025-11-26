/**
 * @fileoverview Delay effect with feedback and wet/dry mix.
 * Creates echo and delay effects with configurable timing and feedback.
 * @module audio/effects/Delay
 */

import { AudioContext } from '../AudioContext';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

/**
 * Delay configuration options.
 *
 * @example
 * ```typescript
 * const config: DelayConfig = {
 *   delayTime: 0.5,
 *   feedback: 0.4,
 *   wetDryMix: 0.5,
 *   filterFrequency: 2000
 * };
 * ```
 */
export interface DelayConfig {
  /**
   * Delay time in seconds (0.0 to 5.0).
   * Default: 0.25
   */
  delayTime?: number;

  /**
   * Feedback amount (0.0 to 0.95).
   * Higher values create more repeats.
   * Default: 0.3
   */
  feedback?: number;

  /**
   * Wet/dry mix (0.0 = dry only, 1.0 = wet only).
   * Default: 0.5
   */
  wetDryMix?: number;

  /**
   * Low-pass filter frequency for feedback path (Hz).
   * Creates natural-sounding decay. Set to 0 to disable.
   * Default: 2000
   */
  filterFrequency?: number;

  /**
   * Ping-pong stereo delay effect.
   * Default: false
   */
  pingPong?: boolean;
}

/**
 * Delay presets for common effects.
 */
export enum DelayPreset {
  SLAP_BACK = 'slapback',
  SHORT_ECHO = 'short_echo',
  MEDIUM_ECHO = 'medium_echo',
  LONG_ECHO = 'long_echo',
  PING_PONG = 'ping_pong',
  TAPE_ECHO = 'tape_echo'
}

/**
 * Delay effect using DelayNode with feedback and filtering.
 *
 * Features:
 * - Configurable delay time up to 5 seconds
 * - Feedback control for repeats
 * - Low-pass filtering in feedback path for natural decay
 * - Wet/dry mix control
 * - Ping-pong stereo delay
 * - Preset configurations
 *
 * @example
 * ```typescript
 * const delay = new Delay();
 * delay.initialize({
 *   delayTime: 0.5,
 *   feedback: 0.4,
 *   wetDryMix: 0.5
 * });
 *
 * // Connect to audio graph
 * audioSource.connect(delay.getInput());
 * delay.getOutput().connect(destination);
 *
 * // Adjust parameters
 * delay.setDelayTime(0.375);
 * delay.setFeedback(0.5);
 *
 * // Use preset
 * delay.loadPreset(DelayPreset.TAPE_ECHO);
 * ```
 */
export class Delay {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private delayNodeL: DelayNode;
  private delayNodeR: DelayNode;
  private feedbackGainL: GainNode;
  private feedbackGainR: GainNode;
  private filterL: BiquadFilterNode;
  private filterR: BiquadFilterNode;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private merger: ChannelMergerNode;
  private splitter: ChannelSplitterNode;

  private enabled: boolean = true;
  private delayTime: number = 0.25;
  private feedback: number = 0.3;
  private wetDryMix: number = 0.5;
  private filterFrequency: number = 2000;
  private pingPong: boolean = false;

  /**
   * Creates a new delay effect.
   *
   * @example
   * ```typescript
   * const delay = new Delay();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.splitter = this.context.createChannelSplitter(2);
    this.merger = this.context.createChannelMerger(2);

    // Create stereo delay lines
    this.delayNodeL = this.context.createDelay(5.0);
    this.delayNodeR = this.context.createDelay(5.0);
    this.feedbackGainL = this.context.createGain();
    this.feedbackGainR = this.context.createGain();
    this.filterL = this.context.createBiquadFilter();
    this.filterR = this.context.createBiquadFilter();
    this.filterL.type = 'lowpass';
    this.filterR.type = 'lowpass';

    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();

    // Setup normal (non-ping-pong) routing
    this.setupNormalRouting();
  }

  /**
   * Initializes the delay effect.
   *
   * @param config - Configuration options
   *
   * @example
   * ```typescript
   * delay.initialize({
   *   delayTime: 0.5,
   *   feedback: 0.4,
   *   wetDryMix: 0.5,
   *   filterFrequency: 2000
   * });
   * ```
   */
  public initialize(config: DelayConfig = {}): void {
    this.setDelayTime(config.delayTime ?? 0.25);
    this.setFeedback(config.feedback ?? 0.3);
    this.setWetDryMix(config.wetDryMix ?? 0.5);
    this.setFilterFrequency(config.filterFrequency ?? 2000);
    this.setPingPong(config.pingPong ?? false);

    logger.info('Delay', 'Initialized delay effect');
  }

  /**
   * Loads a delay preset with predefined characteristics.
   *
   * @param preset - Delay preset to load
   *
   * @example
   * ```typescript
   * delay.loadPreset(DelayPreset.TAPE_ECHO);
   * ```
   */
  public loadPreset(preset: DelayPreset): void {
    const presets: Record<DelayPreset, DelayConfig> = {
      [DelayPreset.SLAP_BACK]: {
        delayTime: 0.08,
        feedback: 0.2,
        wetDryMix: 0.3,
        filterFrequency: 8000,
        pingPong: false
      },
      [DelayPreset.SHORT_ECHO]: {
        delayTime: 0.25,
        feedback: 0.3,
        wetDryMix: 0.4,
        filterFrequency: 4000,
        pingPong: false
      },
      [DelayPreset.MEDIUM_ECHO]: {
        delayTime: 0.5,
        feedback: 0.45,
        wetDryMix: 0.5,
        filterFrequency: 3000,
        pingPong: false
      },
      [DelayPreset.LONG_ECHO]: {
        delayTime: 1.0,
        feedback: 0.6,
        wetDryMix: 0.5,
        filterFrequency: 2000,
        pingPong: false
      },
      [DelayPreset.PING_PONG]: {
        delayTime: 0.375,
        feedback: 0.5,
        wetDryMix: 0.6,
        filterFrequency: 3000,
        pingPong: true
      },
      [DelayPreset.TAPE_ECHO]: {
        delayTime: 0.375,
        feedback: 0.55,
        wetDryMix: 0.45,
        filterFrequency: 1500,
        pingPong: false
      }
    };

    const config = presets[preset];
    this.initialize(config);

    logger.info('Delay', `Loaded preset: ${preset}`);
  }

  /**
   * Sets the delay time.
   *
   * @param time - Delay time in seconds (0.0 to 5.0)
   *
   * @example
   * ```typescript
   * delay.setDelayTime(0.5); // 500ms delay
   * ```
   */
  public setDelayTime(time: number): void {
    time = Math.max(0, Math.min(5.0, time));
    this.delayTime = time;

    const now = this.context.currentTime;
    this.delayNodeL.delayTime.setValueAtTime(time, now);
    this.delayNodeR.delayTime.setValueAtTime(time, now);
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
    return this.delayTime;
  }

  /**
   * Sets the feedback amount.
   * Higher feedback creates more repeats.
   *
   * @param feedback - Feedback amount (0.0 to 0.95)
   *
   * @example
   * ```typescript
   * delay.setFeedback(0.5); // 50% feedback
   * ```
   */
  public setFeedback(feedback: number): void {
    feedback = Math.max(0, Math.min(0.95, feedback));
    this.feedback = feedback;

    this.feedbackGainL.gain.value = feedback;
    this.feedbackGainR.gain.value = feedback;
  }

  /**
   * Gets the feedback amount.
   *
   * @returns Feedback amount (0.0 to 0.95)
   *
   * @example
   * ```typescript
   * const fb = delay.getFeedback();
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
   * delay.setWetDryMix(0.5); // 50/50 mix
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
   * @returns Mix amount (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const mix = delay.getWetDryMix();
   * ```
   */
  public getWetDryMix(): number {
    return this.wetDryMix;
  }

  /**
   * Sets the low-pass filter frequency in the feedback path.
   * Lower frequencies create darker, more natural-sounding echoes.
   *
   * @param frequency - Filter frequency in Hz (20 to 20000, or 0 to disable)
   *
   * @example
   * ```typescript
   * delay.setFilterFrequency(2000); // 2kHz cutoff
   * ```
   */
  public setFilterFrequency(frequency: number): void {
    if (frequency <= 0) {
      frequency = 20000; // Effectively bypass
    }
    frequency = Math.max(20, Math.min(20000, frequency));
    this.filterFrequency = frequency;

    this.filterL.frequency.value = frequency;
    this.filterR.frequency.value = frequency;
  }

  /**
   * Gets the filter frequency.
   *
   * @returns Filter frequency in Hz
   *
   * @example
   * ```typescript
   * const freq = delay.getFilterFrequency();
   * ```
   */
  public getFilterFrequency(): number {
    return this.filterFrequency;
  }

  /**
   * Sets ping-pong stereo delay mode.
   * In ping-pong mode, delays alternate between left and right channels.
   *
   * @param enabled - Enable ping-pong mode
   *
   * @example
   * ```typescript
   * delay.setPingPong(true);
   * ```
   */
  public setPingPong(enabled: boolean): void {
    if (this.pingPong === enabled) {
      return;
    }

    this.pingPong = enabled;

    // Disconnect all nodes
    this.disconnectAll();

    // Setup appropriate routing
    if (enabled) {
      this.setupPingPongRouting();
    } else {
      this.setupNormalRouting();
    }
  }

  /**
   * Gets ping-pong mode state.
   *
   * @returns True if ping-pong mode is enabled
   *
   * @example
   * ```typescript
   * if (delay.isPingPong()) {
   *   console.log('Ping-pong delay active');
   * }
   * ```
   */
  public isPingPong(): boolean {
    return this.pingPong;
  }

  /**
   * Gets the input node for connecting audio sources.
   *
   * @returns Input GainNode
   *
   * @example
   * ```typescript
   * const input = delay.getInput();
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
   * const output = delay.getOutput();
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
   * delay.setEnabled(false); // Bypass delay
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
   * if (delay.isEnabled()) {
   *   console.log('Delay is active');
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
   * delay.dispose();
   * ```
   */
  public dispose(): void {
    this.disconnectAll();
  }

  /**
   * Disconnects all audio nodes.
   */
  private disconnectAll(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.splitter.disconnect();
    this.merger.disconnect();
    this.delayNodeL.disconnect();
    this.delayNodeR.disconnect();
    this.feedbackGainL.disconnect();
    this.feedbackGainR.disconnect();
    this.filterL.disconnect();
    this.filterR.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
  }

  /**
   * Sets up normal (non-ping-pong) delay routing.
   * Each channel has independent delay and feedback.
   */
  private setupNormalRouting(): void {
    // Split input to stereo
    this.inputNode.connect(this.splitter);

    // Left channel delay chain
    this.splitter.connect(this.delayNodeL, 0);
    this.delayNodeL.connect(this.filterL);
    this.filterL.connect(this.feedbackGainL);
    this.feedbackGainL.connect(this.delayNodeL);
    this.filterL.connect(this.merger, 0, 0);

    // Right channel delay chain
    this.splitter.connect(this.delayNodeR, 1);
    this.delayNodeR.connect(this.filterR);
    this.filterR.connect(this.feedbackGainR);
    this.feedbackGainR.connect(this.delayNodeR);
    this.filterR.connect(this.merger, 0, 1);

    // Mix wet and dry
    this.merger.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);
  }

  /**
   * Sets up ping-pong delay routing.
   * Delays alternate between left and right channels.
   */
  private setupPingPongRouting(): void {
    // Split input to stereo
    this.inputNode.connect(this.splitter);

    // Left channel feeds right delay
    this.splitter.connect(this.delayNodeL, 0);
    this.delayNodeL.connect(this.filterL);
    this.filterL.connect(this.feedbackGainL);
    this.feedbackGainL.connect(this.delayNodeR); // Cross-feed to right
    this.filterL.connect(this.merger, 0, 0);

    // Right channel feeds left delay
    this.splitter.connect(this.delayNodeR, 1);
    this.delayNodeR.connect(this.filterR);
    this.filterR.connect(this.feedbackGainR);
    this.feedbackGainR.connect(this.delayNodeL); // Cross-feed to left
    this.filterR.connect(this.merger, 0, 1);

    // Mix wet and dry
    this.merger.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);
  }
}
