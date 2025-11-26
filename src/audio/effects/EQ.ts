/**
 * @fileoverview Parametric equalizer with multiple frequency bands.
 * Provides precise frequency control with independent band adjustment.
 * @module audio/effects/EQ
 */

import { AudioContext } from '../AudioContext';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

/**
 * EQ band configuration.
 *
 * @example
 * ```typescript
 * const bandConfig: EQBandConfig = {
 *   frequency: 1000,
 *   q: 1.0,
 *   gain: 3,
 *   type: 'peaking'
 * };
 * ```
 */
export interface EQBandConfig {
  /**
   * Center/cutoff frequency in Hz.
   */
  frequency: number;

  /**
   * Q factor (bandwidth).
   * Default: 1.0
   */
  q?: number;

  /**
   * Gain in dB (for peaking/shelving bands).
   * Default: 0
   */
  gain?: number;

  /**
   * Filter type.
   * Default: 'peaking'
   */
  type?: BiquadFilterType;

  /**
   * Enable this band.
   * Default: true
   */
  enabled?: boolean;
}

/**
 * EQ configuration options.
 *
 * @example
 * ```typescript
 * const config: EQConfig = {
 *   bands: [
 *     { frequency: 100, q: 0.7, gain: 3, type: 'lowshelf' },
 *     { frequency: 1000, q: 1.0, gain: -2, type: 'peaking' },
 *     { frequency: 8000, q: 0.7, gain: 4, type: 'highshelf' }
 *   ]
 * };
 * ```
 */
export interface EQConfig {
  /**
   * Array of EQ band configurations.
   */
  bands?: EQBandConfig[];

  /**
   * Output gain adjustment.
   * Default: 1.0
   */
  outputGain?: number;
}

/**
 * EQ presets for common scenarios.
 */
export enum EQPreset {
  FLAT = 'flat',
  BASS_BOOST = 'bass_boost',
  TREBLE_BOOST = 'treble_boost',
  VOCAL = 'vocal',
  SPEECH = 'speech',
  ROCK = 'rock',
  ELECTRONIC = 'electronic',
  CLASSICAL = 'classical',
  JAZZ = 'jazz',
  V_SHAPE = 'v_shape'
}

/**
 * Single EQ band using BiquadFilterNode.
 */
class EQBand {
  private filter: BiquadFilterNode;
  private enabled: boolean = true;

  constructor(context: globalThis.AudioContext, config: EQBandConfig) {
    this.filter = context.createBiquadFilter();
    this.configure(config);
  }

  public configure(config: EQBandConfig): void {
    this.filter.type = config.type ?? 'peaking';
    this.filter.frequency.value = config.frequency;
    this.filter.Q.value = config.q ?? 1.0;
    this.filter.gain.value = config.gain ?? 0;
    this.enabled = config.enabled ?? true;
  }

  public getFilter(): BiquadFilterNode {
    return this.filter;
  }

  public setFrequency(frequency: number): void {
    this.filter.frequency.value = frequency;
  }

  public getFrequency(): number {
    return this.filter.frequency.value;
  }

  public setQ(q: number): void {
    this.filter.Q.value = q;
  }

  public getQ(): number {
    return this.filter.Q.value;
  }

  public setGain(gain: number): void {
    this.filter.gain.value = gain;
  }

  public getGain(): number {
    return this.filter.gain.value;
  }

  public setType(type: BiquadFilterType): void {
    this.filter.type = type;
  }

  public getType(): BiquadFilterType {
    return this.filter.type;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public disconnect(): void {
    this.filter.disconnect();
  }
}

/**
 * Parametric equalizer with multiple frequency bands.
 *
 * Features:
 * - Configurable number of bands
 * - Independent frequency, Q, and gain control per band
 * - Multiple filter types per band
 * - Band enable/disable without reconnecting
 * - Common EQ presets
 * - Output gain control
 *
 * @example
 * ```typescript
 * const eq = new EQ();
 * eq.initialize({
 *   bands: [
 *     { frequency: 100, q: 0.7, gain: 3, type: 'lowshelf' },
 *     { frequency: 1000, q: 1.0, gain: -2, type: 'peaking' },
 *     { frequency: 8000, q: 0.7, gain: 4, type: 'highshelf' }
 *   ]
 * });
 *
 * // Connect to audio graph
 * audioSource.connect(eq.getInput());
 * eq.getOutput().connect(destination);
 *
 * // Adjust band
 * eq.setBandGain(1, -4);
 * eq.setBandFrequency(1, 1200);
 *
 * // Add band
 * eq.addBand({ frequency: 500, q: 2.0, gain: 2, type: 'peaking' });
 *
 * // Use preset
 * eq.loadPreset(EQPreset.VOCAL);
 * ```
 */
export class EQ {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private outputGain: GainNode;
  private bands: EQBand[] = [];

  private enabled: boolean = true;

  /**
   * Creates a new parametric EQ.
   *
   * @example
   * ```typescript
   * const eq = new EQ();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.outputGain = this.context.createGain();

    this.outputGain.connect(this.outputNode);
  }

  /**
   * Initializes the EQ with band configuration.
   *
   * @param config - Configuration options
   *
   * @example
   * ```typescript
   * eq.initialize({
   *   bands: [
   *     { frequency: 80, q: 0.7, gain: 2, type: 'lowshelf' },
   *     { frequency: 250, q: 1.0, gain: -1, type: 'peaking' },
   *     { frequency: 2000, q: 1.5, gain: 3, type: 'peaking' },
   *     { frequency: 10000, q: 0.7, gain: 2, type: 'highshelf' }
   *   ],
   *   outputGain: 0.9
   * });
   * ```
   */
  public initialize(config: EQConfig = {}): void {
    this.clearBands();

    if (config.bands && config.bands.length > 0) {
      for (const bandConfig of config.bands) {
        this.addBand(bandConfig);
      }
    } else {
      // Default 3-band EQ
      this.addBand({ frequency: 100, q: 0.7, gain: 0, type: 'lowshelf' });
      this.addBand({ frequency: 1000, q: 1.0, gain: 0, type: 'peaking' });
      this.addBand({ frequency: 8000, q: 0.7, gain: 0, type: 'highshelf' });
    }

    this.setOutputGain(config.outputGain ?? 1.0);

    logger.info('EQ', `Initialized EQ with ${this.bands.length} bands`);
  }

  /**
   * Loads an EQ preset with predefined characteristics.
   *
   * @param preset - EQ preset to load
   *
   * @example
   * ```typescript
   * eq.loadPreset(EQPreset.VOCAL);
   * ```
   */
  public loadPreset(preset: EQPreset): void {
    const presets: Record<EQPreset, EQConfig> = {
      [EQPreset.FLAT]: {
        bands: [
          { frequency: 100, q: 0.7, gain: 0, type: 'lowshelf' },
          { frequency: 1000, q: 1.0, gain: 0, type: 'peaking' },
          { frequency: 8000, q: 0.7, gain: 0, type: 'highshelf' }
        ]
      },
      [EQPreset.BASS_BOOST]: {
        bands: [
          { frequency: 60, q: 0.7, gain: 6, type: 'lowshelf' },
          { frequency: 200, q: 1.0, gain: 3, type: 'peaking' },
          { frequency: 1000, q: 1.0, gain: 0, type: 'peaking' },
          { frequency: 8000, q: 0.7, gain: 0, type: 'highshelf' }
        ],
        outputGain: 0.7
      },
      [EQPreset.TREBLE_BOOST]: {
        bands: [
          { frequency: 100, q: 0.7, gain: 0, type: 'lowshelf' },
          { frequency: 2000, q: 1.0, gain: 2, type: 'peaking' },
          { frequency: 5000, q: 1.0, gain: 4, type: 'peaking' },
          { frequency: 10000, q: 0.7, gain: 5, type: 'highshelf' }
        ],
        outputGain: 0.8
      },
      [EQPreset.VOCAL]: {
        bands: [
          { frequency: 80, q: 0.7, gain: -2, type: 'lowshelf' },
          { frequency: 300, q: 1.5, gain: -3, type: 'peaking' },
          { frequency: 1000, q: 1.0, gain: 2, type: 'peaking' },
          { frequency: 3000, q: 1.2, gain: 4, type: 'peaking' },
          { frequency: 8000, q: 0.7, gain: 2, type: 'highshelf' }
        ]
      },
      [EQPreset.SPEECH]: {
        bands: [
          { frequency: 100, q: 0.7, gain: -6, type: 'lowshelf' },
          { frequency: 500, q: 1.0, gain: -2, type: 'peaking' },
          { frequency: 2000, q: 1.0, gain: 3, type: 'peaking' },
          { frequency: 4000, q: 1.0, gain: 2, type: 'peaking' },
          { frequency: 10000, q: 0.7, gain: -3, type: 'highshelf' }
        ]
      },
      [EQPreset.ROCK]: {
        bands: [
          { frequency: 60, q: 0.7, gain: 4, type: 'lowshelf' },
          { frequency: 200, q: 1.0, gain: -2, type: 'peaking' },
          { frequency: 1000, q: 1.0, gain: -1, type: 'peaking' },
          { frequency: 3000, q: 1.5, gain: 3, type: 'peaking' },
          { frequency: 8000, q: 0.7, gain: 4, type: 'highshelf' }
        ],
        outputGain: 0.75
      },
      [EQPreset.ELECTRONIC]: {
        bands: [
          { frequency: 40, q: 0.7, gain: 6, type: 'lowshelf' },
          { frequency: 100, q: 1.5, gain: 3, type: 'peaking' },
          { frequency: 500, q: 1.0, gain: -2, type: 'peaking' },
          { frequency: 2000, q: 1.0, gain: 0, type: 'peaking' },
          { frequency: 10000, q: 0.7, gain: 4, type: 'highshelf' }
        ],
        outputGain: 0.7
      },
      [EQPreset.CLASSICAL]: {
        bands: [
          { frequency: 60, q: 0.7, gain: 0, type: 'lowshelf' },
          { frequency: 250, q: 1.0, gain: -1, type: 'peaking' },
          { frequency: 1000, q: 0.7, gain: 0, type: 'peaking' },
          { frequency: 4000, q: 1.0, gain: 2, type: 'peaking' },
          { frequency: 10000, q: 0.7, gain: 1, type: 'highshelf' }
        ]
      },
      [EQPreset.JAZZ]: {
        bands: [
          { frequency: 80, q: 0.7, gain: 2, type: 'lowshelf' },
          { frequency: 300, q: 1.0, gain: -1, type: 'peaking' },
          { frequency: 1000, q: 1.0, gain: 1, type: 'peaking' },
          { frequency: 3000, q: 1.0, gain: 2, type: 'peaking' },
          { frequency: 8000, q: 0.7, gain: 1, type: 'highshelf' }
        ]
      },
      [EQPreset.V_SHAPE]: {
        bands: [
          { frequency: 60, q: 0.7, gain: 6, type: 'lowshelf' },
          { frequency: 200, q: 1.0, gain: 2, type: 'peaking' },
          { frequency: 1000, q: 1.5, gain: -4, type: 'peaking' },
          { frequency: 3000, q: 1.0, gain: 2, type: 'peaking' },
          { frequency: 10000, q: 0.7, gain: 6, type: 'highshelf' }
        ],
        outputGain: 0.7
      }
    };

    const config = presets[preset];
    this.initialize(config);

    logger.info('EQ', `Loaded preset: ${preset}`);
  }

  /**
   * Adds a new EQ band.
   *
   * @param config - Band configuration
   * @returns Index of the added band
   *
   * @example
   * ```typescript
   * const index = eq.addBand({ frequency: 500, q: 2.0, gain: 3, type: 'peaking' });
   * ```
   */
  public addBand(config: EQBandConfig): number {
    const band = new EQBand(this.context, config);
    this.bands.push(band);
    this.reconnectBands();
    return this.bands.length - 1;
  }

  /**
   * Removes an EQ band by index.
   *
   * @param index - Band index
   * @returns True if removed
   *
   * @example
   * ```typescript
   * eq.removeBand(2);
   * ```
   */
  public removeBand(index: number): boolean {
    if (index < 0 || index >= this.bands.length) {
      return false;
    }

    this.bands[index].disconnect();
    this.bands.splice(index, 1);
    this.reconnectBands();
    return true;
  }

  /**
   * Clears all EQ bands.
   *
   * @example
   * ```typescript
   * eq.clearBands();
   * ```
   */
  public clearBands(): void {
    for (const band of this.bands) {
      band.disconnect();
    }
    this.bands.length = 0;
  }

  /**
   * Gets the number of EQ bands.
   *
   * @returns Number of bands
   *
   * @example
   * ```typescript
   * const count = eq.getBandCount();
   * ```
   */
  public getBandCount(): number {
    return this.bands.length;
  }

  /**
   * Sets a band's frequency.
   *
   * @param index - Band index
   * @param frequency - Frequency in Hz
   *
   * @example
   * ```typescript
   * eq.setBandFrequency(0, 120);
   * ```
   */
  public setBandFrequency(index: number, frequency: number): void {
    if (index >= 0 && index < this.bands.length) {
      this.bands[index].setFrequency(frequency);
    }
  }

  /**
   * Sets a band's Q factor.
   *
   * @param index - Band index
   * @param q - Q factor
   *
   * @example
   * ```typescript
   * eq.setBandQ(0, 1.5);
   * ```
   */
  public setBandQ(index: number, q: number): void {
    if (index >= 0 && index < this.bands.length) {
      this.bands[index].setQ(q);
    }
  }

  /**
   * Sets a band's gain.
   *
   * @param index - Band index
   * @param gain - Gain in dB
   *
   * @example
   * ```typescript
   * eq.setBandGain(0, 3);
   * ```
   */
  public setBandGain(index: number, gain: number): void {
    if (index >= 0 && index < this.bands.length) {
      this.bands[index].setGain(gain);
    }
  }

  /**
   * Sets a band's filter type.
   *
   * @param index - Band index
   * @param type - Filter type
   *
   * @example
   * ```typescript
   * eq.setBandType(0, 'lowshelf');
   * ```
   */
  public setBandType(index: number, type: BiquadFilterType): void {
    if (index >= 0 && index < this.bands.length) {
      this.bands[index].setType(type);
    }
  }

  /**
   * Enables or disables a band.
   *
   * @param index - Band index
   * @param enabled - Enable state
   *
   * @example
   * ```typescript
   * eq.setBandEnabled(0, false);
   * ```
   */
  public setBandEnabled(index: number, enabled: boolean): void {
    if (index >= 0 && index < this.bands.length) {
      this.bands[index].setEnabled(enabled);
    }
  }

  /**
   * Gets a band's configuration.
   *
   * @param index - Band index
   * @returns Band configuration or null
   *
   * @example
   * ```typescript
   * const config = eq.getBandConfig(0);
   * ```
   */
  public getBandConfig(index: number): EQBandConfig | null {
    if (index < 0 || index >= this.bands.length) {
      return null;
    }

    const band = this.bands[index];
    return {
      frequency: band.getFrequency(),
      q: band.getQ(),
      gain: band.getGain(),
      type: band.getType(),
      enabled: band.isEnabled()
    };
  }

  /**
   * Sets the output gain.
   *
   * @param gain - Output gain multiplier (0.0 to 10.0)
   *
   * @example
   * ```typescript
   * eq.setOutputGain(0.8);
   * ```
   */
  public setOutputGain(gain: number): void {
    gain = Math.max(0, Math.min(10, gain));
    this.outputGain.gain.value = gain;
  }

  /**
   * Gets the output gain.
   *
   * @returns Output gain multiplier
   *
   * @example
   * ```typescript
   * const gain = eq.getOutputGain();
   * ```
   */
  public getOutputGain(): number {
    return this.outputGain.gain.value;
  }

  /**
   * Gets the input node for connecting audio sources.
   *
   * @returns Input GainNode
   *
   * @example
   * ```typescript
   * const input = eq.getInput();
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
   * const output = eq.getOutput();
   * output.connect(destination);
   * ```
   */
  public getOutput(): AudioNode {
    return this.outputNode;
  }

  /**
   * Enables or disables the entire EQ.
   *
   * @param enabled - Enable state
   *
   * @example
   * ```typescript
   * eq.setEnabled(false); // Bypass EQ
   * ```
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (enabled) {
      this.reconnectBands();
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
   * if (eq.isEnabled()) {
   *   console.log('EQ is active');
   * }
   * ```
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Disposes the EQ and releases all resources.
   *
   * @example
   * ```typescript
   * eq.dispose();
   * ```
   */
  public dispose(): void {
    this.clearBands();
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.outputGain.disconnect();
  }

  /**
   * Reconnects all bands in series.
   */
  private reconnectBands(): void {
    // Disconnect everything
    this.inputNode.disconnect();
    for (const band of this.bands) {
      band.getFilter().disconnect();
    }
    this.outputGain.disconnect();

    if (this.bands.length === 0) {
      this.inputNode.connect(this.outputGain);
    } else {
      // Connect bands in series
      this.inputNode.connect(this.bands[0].getFilter());

      for (let i = 0; i < this.bands.length - 1; i++) {
        this.bands[i].getFilter().connect(this.bands[i + 1].getFilter());
      }

      this.bands[this.bands.length - 1].getFilter().connect(this.outputGain);
    }

    this.outputGain.connect(this.outputNode);
  }
}
