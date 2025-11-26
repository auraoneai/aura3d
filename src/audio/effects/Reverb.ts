/**
 * @fileoverview Reverb effect with room simulation using ConvolverNode.
 * Simulates acoustic spaces from small rooms to large halls using impulse responses.
 * @module audio/effects/Reverb
 */

import { AudioContext } from '../AudioContext';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

/**
 * Reverb configuration options.
 *
 * @example
 * ```typescript
 * const config: ReverbConfig = {
 *   impulseResponseURL: '/audio/hall.wav',
 *   wetDryMix: 0.3,
 *   preDelay: 0.02,
 *   decay: 2.0
 * };
 * ```
 */
export interface ReverbConfig {
  /**
   * URL to impulse response audio file.
   * If not provided, generates a synthetic impulse response.
   */
  impulseResponseURL?: string;

  /**
   * Wet/dry mix ratio (0.0 = dry only, 1.0 = wet only).
   * Default: 0.3
   */
  wetDryMix?: number;

  /**
   * Pre-delay before reverb onset in seconds.
   * Default: 0.0
   */
  preDelay?: number;

  /**
   * Decay time for synthetic reverb in seconds.
   * Default: 2.0
   */
  decay?: number;

  /**
   * Room size for synthetic reverb (0.0 to 1.0).
   * Default: 0.5
   */
  roomSize?: number;
}

/**
 * Room presets for quick configuration.
 */
export enum ReverbPreset {
  SMALL_ROOM = 'small_room',
  MEDIUM_ROOM = 'medium_room',
  LARGE_ROOM = 'large_room',
  SMALL_HALL = 'small_hall',
  LARGE_HALL = 'large_hall',
  CATHEDRAL = 'cathedral',
  PLATE = 'plate',
  SPRING = 'spring'
}

/**
 * Reverb effect using ConvolverNode for realistic room simulation.
 *
 * Features:
 * - Impulse response loading for realistic acoustic spaces
 * - Synthetic impulse generation for custom reverb characteristics
 * - Wet/dry mix control
 * - Pre-delay for early reflections simulation
 * - Room presets for common acoustic spaces
 *
 * @example
 * ```typescript
 * const reverb = new Reverb();
 * await reverb.initialize({
 *   impulseResponseURL: '/audio/cathedral.wav',
 *   wetDryMix: 0.4,
 *   preDelay: 0.02
 * });
 *
 * // Connect to audio graph
 * audioSource.connect(reverb.getInput());
 * reverb.getOutput().connect(destination);
 *
 * // Adjust mix
 * reverb.setWetDryMix(0.5);
 *
 * // Use preset
 * await reverb.loadPreset(ReverbPreset.LARGE_HALL);
 * ```
 */
export class Reverb {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private preDelayNode: DelayNode;
  private convolver: ConvolverNode;
  private wetGain: GainNode;
  private dryGain: GainNode;

  private enabled: boolean = true;
  private wetDryMix: number = 0.3;
  private preDelay: number = 0.0;

  /**
   * Creates a new reverb effect.
   *
   * @example
   * ```typescript
   * const reverb = new Reverb();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.preDelayNode = this.context.createDelay(1.0);
    this.convolver = this.context.createConvolver();
    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();

    // Setup audio graph: input -> [preDelay -> convolver -> wet, dry] -> output
    this.inputNode.connect(this.preDelayNode);
    this.preDelayNode.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    this.setWetDryMix(this.wetDryMix);
    this.setPreDelay(this.preDelay);
  }

  /**
   * Initializes the reverb effect.
   *
   * @param config - Configuration options
   * @returns Promise that resolves when initialization completes
   *
   * @example
   * ```typescript
   * await reverb.initialize({
   *   impulseResponseURL: '/audio/hall.wav',
   *   wetDryMix: 0.3,
   *   preDelay: 0.02
   * });
   * ```
   */
  public async initialize(config: ReverbConfig = {}): Promise<void> {
    if (config.impulseResponseURL) {
      await this.loadImpulseResponse(config.impulseResponseURL);
    } else {
      // Generate synthetic impulse response
      this.generateImpulseResponse({
        decay: config.decay ?? 2.0,
        roomSize: config.roomSize ?? 0.5
      });
    }

    if (config.wetDryMix !== undefined) {
      this.setWetDryMix(config.wetDryMix);
    }

    if (config.preDelay !== undefined) {
      this.setPreDelay(config.preDelay);
    }

    logger.info('Reverb', 'Initialized reverb effect');
  }

  /**
   * Loads an impulse response from a URL.
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
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.convolver.buffer = audioBuffer;
      logger.info('Reverb', `Loaded impulse response: ${url}`);
    } catch (error) {
      logger.error('Reverb', `Failed to load impulse response: ${error}`);
      throw error;
    }
  }

  /**
   * Loads a reverb preset with predefined characteristics.
   *
   * @param preset - Reverb preset to load
   * @returns Promise that resolves when preset is loaded
   *
   * @example
   * ```typescript
   * await reverb.loadPreset(ReverbPreset.LARGE_HALL);
   * ```
   */
  public async loadPreset(preset: ReverbPreset): Promise<void> {
    const presets: Record<ReverbPreset, { decay: number; roomSize: number; wetMix: number; preDelay: number }> = {
      [ReverbPreset.SMALL_ROOM]: { decay: 0.5, roomSize: 0.2, wetMix: 0.2, preDelay: 0.005 },
      [ReverbPreset.MEDIUM_ROOM]: { decay: 1.0, roomSize: 0.4, wetMix: 0.25, preDelay: 0.01 },
      [ReverbPreset.LARGE_ROOM]: { decay: 1.5, roomSize: 0.6, wetMix: 0.3, preDelay: 0.015 },
      [ReverbPreset.SMALL_HALL]: { decay: 2.0, roomSize: 0.7, wetMix: 0.35, preDelay: 0.02 },
      [ReverbPreset.LARGE_HALL]: { decay: 3.0, roomSize: 0.85, wetMix: 0.4, preDelay: 0.03 },
      [ReverbPreset.CATHEDRAL]: { decay: 4.5, roomSize: 0.95, wetMix: 0.5, preDelay: 0.05 },
      [ReverbPreset.PLATE]: { decay: 1.2, roomSize: 0.3, wetMix: 0.3, preDelay: 0.002 },
      [ReverbPreset.SPRING]: { decay: 0.8, roomSize: 0.15, wetMix: 0.35, preDelay: 0.001 }
    };

    const config = presets[preset];
    this.generateImpulseResponse({
      decay: config.decay,
      roomSize: config.roomSize
    });
    this.setWetDryMix(config.wetMix);
    this.setPreDelay(config.preDelay);

    logger.info('Reverb', `Loaded preset: ${preset}`);
  }

  /**
   * Generates a synthetic impulse response.
   *
   * @param config - Generation parameters
   * @param config.decay - Decay time in seconds
   * @param config.roomSize - Room size (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * reverb.generateImpulseResponse({ decay: 2.5, roomSize: 0.7 });
   * ```
   */
  public generateImpulseResponse(config: { decay: number; roomSize: number }): void {
    const sampleRate = this.context.sampleRate;
    const duration = Math.max(0.1, Math.min(10, config.decay));
    const length = Math.floor(sampleRate * duration);

    const impulse = this.context.createBuffer(2, length, sampleRate);
    const roomSize = Math.max(0.01, Math.min(1.0, config.roomSize));

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);

      // Generate early reflections and diffuse reverb tail
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // Exponential decay
        const decay = Math.exp(-t / duration);

        // Add early reflections (first 50ms)
        let sample = 0;
        if (t < 0.05) {
          const reflectionCount = Math.floor(roomSize * 20);
          for (let j = 0; j < reflectionCount; j++) {
            const reflectionTime = (j / reflectionCount) * 0.05;
            const reflectionDecay = 1 - (j / reflectionCount) * 0.7;
            if (Math.abs(t - reflectionTime) < 0.001) {
              sample += reflectionDecay * 0.5;
            }
          }
        }

        // Add diffuse tail with noise
        sample += (Math.random() * 2 - 1) * decay;

        // Apply room size to density
        const densityFactor = 0.5 + roomSize * 0.5;
        if (Math.random() > densityFactor) {
          sample *= 0.5;
        }

        data[i] = sample * 0.5; // Scale down to prevent clipping
      }
    }

    this.convolver.buffer = impulse;
    logger.debug('Reverb', `Generated impulse response: decay=${duration}s, roomSize=${roomSize}`);
  }

  /**
   * Sets the wet/dry mix.
   *
   * @param mix - Mix amount (0.0 = dry only, 1.0 = wet only)
   *
   * @example
   * ```typescript
   * reverb.setWetDryMix(0.4); // 40% wet, 60% dry
   * ```
   */
  public setWetDryMix(mix: number): void {
    mix = Math.max(0, Math.min(1, mix));
    this.wetDryMix = mix;

    // Equal power crossfade for smooth transition
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
   * const mix = reverb.getWetDryMix();
   * ```
   */
  public getWetDryMix(): number {
    return this.wetDryMix;
  }

  /**
   * Sets the pre-delay time.
   * Pre-delay creates space before the reverb onset, simulating distance.
   *
   * @param delay - Pre-delay time in seconds (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * reverb.setPreDelay(0.02); // 20ms pre-delay
   * ```
   */
  public setPreDelay(delay: number): void {
    delay = Math.max(0, Math.min(1.0, delay));
    this.preDelay = delay;
    this.preDelayNode.delayTime.value = delay;
  }

  /**
   * Gets the pre-delay time.
   *
   * @returns Pre-delay in seconds
   *
   * @example
   * ```typescript
   * const preDelay = reverb.getPreDelay();
   * ```
   */
  public getPreDelay(): number {
    return this.preDelay;
  }

  /**
   * Gets the input node for connecting audio sources.
   *
   * @returns Input GainNode
   *
   * @example
   * ```typescript
   * const input = reverb.getInput();
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
   * const output = reverb.getOutput();
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
   * reverb.setEnabled(false); // Bypass reverb
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
   * if (reverb.isEnabled()) {
   *   console.log('Reverb is active');
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
   * reverb.dispose();
   * ```
   */
  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.preDelayNode.disconnect();
    this.convolver.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
  }
}
