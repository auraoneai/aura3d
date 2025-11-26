/**
 * @fileoverview Frequency filter effect using BiquadFilterNode.
 * Provides low-pass, high-pass, band-pass, and other filter types with Q factor control.
 * @module audio/effects/Filter
 */

import { AudioContext } from '../AudioContext';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

/**
 * Filter configuration options.
 *
 * @example
 * ```typescript
 * const config: FilterConfig = {
 *   type: 'lowpass',
 *   frequency: 1000,
 *   q: 1.0,
 *   gain: 0
 * };
 * ```
 */
export interface FilterConfig {
  /**
   * Filter type.
   * Default: 'lowpass'
   */
  type?: BiquadFilterType;

  /**
   * Cutoff/center frequency in Hz.
   * Default: 1000
   */
  frequency?: number;

  /**
   * Q factor (resonance).
   * Higher values create sharper filtering.
   * Default: 1.0
   */
  q?: number;

  /**
   * Gain in dB (for peaking and shelving filters).
   * Default: 0
   */
  gain?: number;

  /**
   * Detune in cents.
   * Default: 0
   */
  detune?: number;
}

/**
 * Filter presets for common effects.
 */
export enum FilterPreset {
  BASS_BOOST = 'bass_boost',
  TREBLE_BOOST = 'treble_boost',
  TELEPHONE = 'telephone',
  RADIO = 'radio',
  UNDERWATER = 'underwater',
  MUFFLED = 'muffled',
  BRIGHT = 'bright',
  WARM = 'warm'
}

/**
 * Frequency filter effect using BiquadFilterNode.
 *
 * Features:
 * - Multiple filter types (lowpass, highpass, bandpass, notch, etc.)
 * - Configurable frequency, Q factor, and gain
 * - Automated frequency sweeps
 * - Filter presets for common effects
 * - Real-time parameter modulation
 *
 * @example
 * ```typescript
 * const filter = new Filter();
 * filter.initialize({
 *   type: 'lowpass',
 *   frequency: 800,
 *   q: 2.0
 * });
 *
 * // Connect to audio graph
 * audioSource.connect(filter.getInput());
 * filter.getOutput().connect(destination);
 *
 * // Adjust parameters
 * filter.setFrequency(1200);
 * filter.setQ(5.0);
 *
 * // Sweep frequency
 * filter.sweepFrequency(200, 2000, 2.0);
 *
 * // Use preset
 * filter.loadPreset(FilterPreset.TELEPHONE);
 * ```
 */
export class Filter {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private filterNode: BiquadFilterNode;

  private enabled: boolean = true;

  /**
   * Creates a new filter effect.
   *
   * @example
   * ```typescript
   * const filter = new Filter();
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
   * Initializes the filter effect.
   *
   * @param config - Configuration options
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
  public initialize(config: FilterConfig = {}): void {
    this.setType(config.type ?? 'lowpass');
    this.setFrequency(config.frequency ?? 1000);
    this.setQ(config.q ?? 1.0);
    this.setGain(config.gain ?? 0);
    this.setDetune(config.detune ?? 0);

    logger.info('Filter', 'Initialized filter effect');
  }

  /**
   * Loads a filter preset with predefined characteristics.
   *
   * @param preset - Filter preset to load
   *
   * @example
   * ```typescript
   * filter.loadPreset(FilterPreset.TELEPHONE);
   * ```
   */
  public loadPreset(preset: FilterPreset): void {
    const presets: Record<FilterPreset, FilterConfig> = {
      [FilterPreset.BASS_BOOST]: {
        type: 'lowshelf',
        frequency: 200,
        q: 1.0,
        gain: 6
      },
      [FilterPreset.TREBLE_BOOST]: {
        type: 'highshelf',
        frequency: 4000,
        q: 1.0,
        gain: 6
      },
      [FilterPreset.TELEPHONE]: {
        type: 'bandpass',
        frequency: 1000,
        q: 2.0,
        gain: 0
      },
      [FilterPreset.RADIO]: {
        type: 'bandpass',
        frequency: 1500,
        q: 1.5,
        gain: 0
      },
      [FilterPreset.UNDERWATER]: {
        type: 'lowpass',
        frequency: 400,
        q: 0.7,
        gain: 0
      },
      [FilterPreset.MUFFLED]: {
        type: 'lowpass',
        frequency: 600,
        q: 1.0,
        gain: 0
      },
      [FilterPreset.BRIGHT]: {
        type: 'highshelf',
        frequency: 3000,
        q: 0.7,
        gain: 4
      },
      [FilterPreset.WARM]: {
        type: 'lowshelf',
        frequency: 300,
        q: 0.7,
        gain: 3
      }
    };

    const config = presets[preset];
    this.initialize(config);

    logger.info('Filter', `Loaded preset: ${preset}`);
  }

  /**
   * Sets the filter type.
   *
   * Available types:
   * - lowpass: Allows frequencies below cutoff
   * - highpass: Allows frequencies above cutoff
   * - bandpass: Allows frequencies around center
   * - lowshelf: Boosts/cuts low frequencies
   * - highshelf: Boosts/cuts high frequencies
   * - peaking: Boosts/cuts around center frequency
   * - notch: Removes frequencies around center
   * - allpass: Phase shift without amplitude change
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
   * Sets the cutoff/center frequency.
   *
   * @param frequency - Frequency in Hz (10 to Nyquist frequency)
   * @param rampTime - Ramp time in seconds for smooth transition
   *
   * @example
   * ```typescript
   * filter.setFrequency(800); // Instant change
   * filter.setFrequency(1200, 0.5); // Ramp over 0.5 seconds
   * ```
   */
  public setFrequency(frequency: number, rampTime: number = 0): void {
    frequency = Math.max(10, Math.min(this.context.sampleRate / 2, frequency));

    const now = this.context.currentTime;
    if (rampTime <= 0) {
      this.filterNode.frequency.setValueAtTime(frequency, now);
    } else {
      this.filterNode.frequency.setValueAtTime(this.filterNode.frequency.value, now);
      this.filterNode.frequency.linearRampToValueAtTime(frequency, now + rampTime);
    }
  }

  /**
   * Gets the cutoff/center frequency.
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
   * Sets the Q factor (resonance/bandwidth).
   * Higher Q creates sharper, more resonant filtering.
   *
   * @param q - Q factor (0.0001 to 1000)
   *
   * @example
   * ```typescript
   * filter.setQ(5.0); // High resonance
   * filter.setQ(0.7); // Gentle slope
   * ```
   */
  public setQ(q: number): void {
    q = Math.max(0.0001, Math.min(1000, q));
    this.filterNode.Q.value = q;
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
   * @param gain - Gain in dB (-40 to 40)
   *
   * @example
   * ```typescript
   * filter.setGain(6); // +6dB boost
   * filter.setGain(-3); // -3dB cut
   * ```
   */
  public setGain(gain: number): void {
    gain = Math.max(-40, Math.min(40, gain));
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

  /**
   * Sets the detune amount in cents.
   *
   * @param detune - Detune in cents (-1200 to 1200)
   *
   * @example
   * ```typescript
   * filter.setDetune(100); // +100 cents
   * ```
   */
  public setDetune(detune: number): void {
    detune = Math.max(-1200, Math.min(1200, detune));
    this.filterNode.detune.value = detune;
  }

  /**
   * Gets the detune amount.
   *
   * @returns Detune in cents
   *
   * @example
   * ```typescript
   * const detune = filter.getDetune();
   * ```
   */
  public getDetune(): number {
    return this.filterNode.detune.value;
  }

  /**
   * Sweeps the filter frequency from start to end over a duration.
   * Creates filter sweep effects.
   *
   * @param startFreq - Starting frequency in Hz
   * @param endFreq - Ending frequency in Hz
   * @param duration - Sweep duration in seconds
   * @param curve - Use exponential curve (true) or linear (false)
   *
   * @example
   * ```typescript
   * // Linear sweep from 200Hz to 2000Hz over 2 seconds
   * filter.sweepFrequency(200, 2000, 2.0, false);
   *
   * // Exponential sweep (more natural sounding)
   * filter.sweepFrequency(200, 2000, 2.0, true);
   * ```
   */
  public sweepFrequency(startFreq: number, endFreq: number, duration: number, curve: boolean = true): void {
    startFreq = Math.max(10, Math.min(this.context.sampleRate / 2, startFreq));
    endFreq = Math.max(10, Math.min(this.context.sampleRate / 2, endFreq));
    duration = Math.max(0, duration);

    const now = this.context.currentTime;
    this.filterNode.frequency.cancelScheduledValues(now);
    this.filterNode.frequency.setValueAtTime(startFreq, now);

    if (curve) {
      this.filterNode.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    } else {
      this.filterNode.frequency.linearRampToValueAtTime(endFreq, now + duration);
    }
  }

  /**
   * Gets the frequency response at a given frequency.
   * Useful for analyzing filter characteristics.
   *
   * @param frequency - Frequency to analyze in Hz
   * @returns Object with magnitude (gain) and phase response
   *
   * @example
   * ```typescript
   * const response = filter.getFrequencyResponse(1000);
   * console.log(`At 1kHz: ${response.magnitude}x gain, ${response.phase} radians phase`);
   * ```
   */
  public getFrequencyResponse(frequency: number): { magnitude: number; phase: number } {
    const frequencyArray = new Float32Array([frequency]);
    const magResponse = new Float32Array(1);
    const phaseResponse = new Float32Array(1);

    this.filterNode.getFrequencyResponse(frequencyArray, magResponse, phaseResponse);

    return {
      magnitude: magResponse[0],
      phase: phaseResponse[0]
    };
  }

  /**
   * Gets the input node for connecting audio sources.
   *
   * @returns Input GainNode
   *
   * @example
   * ```typescript
   * const input = filter.getInput();
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
   * const output = filter.getOutput();
   * output.connect(destination);
   * ```
   */
  public getOutput(): AudioNode {
    return this.outputNode;
  }

  /**
   * Enables or disables the effect.
   * When disabled, audio bypasses the filter.
   *
   * @param enabled - Enable state
   *
   * @example
   * ```typescript
   * filter.setEnabled(false); // Bypass filter
   * ```
   */
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

  /**
   * Gets the enabled state.
   *
   * @returns True if enabled
   *
   * @example
   * ```typescript
   * if (filter.isEnabled()) {
   *   console.log('Filter is active');
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
   * filter.dispose();
   * ```
   */
  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.filterNode.disconnect();
  }
}
