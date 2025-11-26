/**
 * @fileoverview Distortion effect using WaveShaperNode.
 * Creates overdrive, distortion, and saturation effects using waveshaping curves.
 * @module audio/effects/Distortion
 */

import { AudioContext } from '../AudioContext';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

/**
 * Distortion configuration options.
 *
 * @example
 * ```typescript
 * const config: DistortionConfig = {
 *   amount: 50,
 *   curve: 'sigmoid',
 *   oversample: '4x',
 *   wetDryMix: 0.7
 * };
 * ```
 */
export interface DistortionConfig {
  /**
   * Distortion amount (0 to 100).
   * Higher values create more aggressive distortion.
   * Default: 50
   */
  amount?: number;

  /**
   * Waveshaper curve type.
   * Default: 'sigmoid'
   */
  curve?: 'sigmoid' | 'asymmetric' | 'hardclip' | 'softclip' | 'fuzz' | 'custom';

  /**
   * Oversample quality.
   * Higher quality reduces aliasing artifacts.
   * Default: '4x'
   */
  oversample?: OverSampleType;

  /**
   * Wet/dry mix (0.0 = dry only, 1.0 = wet only).
   * Default: 1.0
   */
  wetDryMix?: number;

  /**
   * Custom waveshaper curve (Float32Array).
   * Only used when curve is 'custom'.
   */
  customCurve?: Float32Array;

  /**
   * Pre-gain before distortion (linear, 0.0 to 10.0).
   * Default: 1.0
   */
  preGain?: number;

  /**
   * Post-gain after distortion (linear, 0.0 to 10.0).
   * Default: 1.0
   */
  postGain?: number;
}

/**
 * Distortion presets for common effects.
 */
export enum DistortionPreset {
  LIGHT_OVERDRIVE = 'light_overdrive',
  HEAVY_OVERDRIVE = 'heavy_overdrive',
  SOFT_DISTORTION = 'soft_distortion',
  HARD_DISTORTION = 'hard_distortion',
  FUZZ = 'fuzz',
  SATURATION = 'saturation',
  BIT_CRUSHER = 'bit_crusher'
}

/**
 * Distortion effect using WaveShaperNode for harmonic generation.
 *
 * Features:
 * - Multiple waveshaping curves
 * - Configurable distortion amount
 * - Oversampling for aliasing reduction
 * - Wet/dry mix control
 * - Pre and post gain controls
 * - Custom curve support
 * - Common presets
 *
 * @example
 * ```typescript
 * const distortion = new Distortion();
 * distortion.initialize({
 *   amount: 50,
 *   curve: 'sigmoid',
 *   wetDryMix: 0.7
 * });
 *
 * // Connect to audio graph
 * audioSource.connect(distortion.getInput());
 * distortion.getOutput().connect(destination);
 *
 * // Adjust parameters
 * distortion.setAmount(75);
 * distortion.setCurveType('fuzz');
 *
 * // Use preset
 * distortion.loadPreset(DistortionPreset.HEAVY_OVERDRIVE);
 * ```
 */
export class Distortion {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private preGainNode: GainNode;
  private postGainNode: GainNode;
  private waveshaper: WaveShaperNode;
  private wetGain: GainNode;
  private dryGain: GainNode;

  private enabled: boolean = true;
  private amount: number = 50;
  private curveType: 'sigmoid' | 'asymmetric' | 'hardclip' | 'softclip' | 'fuzz' | 'custom' = 'sigmoid';
  private wetDryMix: number = 1.0;

  /**
   * Creates a new distortion effect.
   *
   * @example
   * ```typescript
   * const distortion = new Distortion();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.preGainNode = this.context.createGain();
    this.postGainNode = this.context.createGain();
    this.waveshaper = this.context.createWaveShaper();
    this.wetGain = this.context.createGain();
    this.dryGain = this.context.createGain();

    // Setup audio graph
    this.inputNode.connect(this.preGainNode);
    this.preGainNode.connect(this.waveshaper);
    this.waveshaper.connect(this.postGainNode);
    this.postGainNode.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);
  }

  /**
   * Initializes the distortion effect.
   *
   * @param config - Configuration options
   *
   * @example
   * ```typescript
   * distortion.initialize({
   *   amount: 60,
   *   curve: 'sigmoid',
   *   oversample: '4x',
   *   wetDryMix: 0.8
   * });
   * ```
   */
  public initialize(config: DistortionConfig = {}): void {
    this.setAmount(config.amount ?? 50);
    this.setOversample(config.oversample ?? '4x');
    this.setWetDryMix(config.wetDryMix ?? 1.0);
    this.setPreGain(config.preGain ?? 1.0);
    this.setPostGain(config.postGain ?? 1.0);

    if (config.curve && config.curve !== 'custom') {
      this.setCurveType(config.curve);
    } else if (config.customCurve) {
      this.setCustomCurve(config.customCurve);
    } else {
      this.setCurveType('sigmoid');
    }

    logger.info('Distortion', 'Initialized distortion effect');
  }

  /**
   * Loads a distortion preset with predefined characteristics.
   *
   * @param preset - Distortion preset to load
   *
   * @example
   * ```typescript
   * distortion.loadPreset(DistortionPreset.HEAVY_OVERDRIVE);
   * ```
   */
  public loadPreset(preset: DistortionPreset): void {
    const presets: Record<DistortionPreset, DistortionConfig> = {
      [DistortionPreset.LIGHT_OVERDRIVE]: {
        amount: 30,
        curve: 'sigmoid',
        oversample: '2x',
        wetDryMix: 0.6,
        preGain: 1.5,
        postGain: 0.8
      },
      [DistortionPreset.HEAVY_OVERDRIVE]: {
        amount: 60,
        curve: 'asymmetric',
        oversample: '4x',
        wetDryMix: 0.8,
        preGain: 2.0,
        postGain: 0.7
      },
      [DistortionPreset.SOFT_DISTORTION]: {
        amount: 40,
        curve: 'softclip',
        oversample: '2x',
        wetDryMix: 1.0,
        preGain: 1.0,
        postGain: 1.0
      },
      [DistortionPreset.HARD_DISTORTION]: {
        amount: 80,
        curve: 'hardclip',
        oversample: '4x',
        wetDryMix: 1.0,
        preGain: 2.5,
        postGain: 0.5
      },
      [DistortionPreset.FUZZ]: {
        amount: 90,
        curve: 'fuzz',
        oversample: '4x',
        wetDryMix: 1.0,
        preGain: 3.0,
        postGain: 0.4
      },
      [DistortionPreset.SATURATION]: {
        amount: 25,
        curve: 'sigmoid',
        oversample: '2x',
        wetDryMix: 1.0,
        preGain: 1.2,
        postGain: 0.9
      },
      [DistortionPreset.BIT_CRUSHER]: {
        amount: 70,
        curve: 'hardclip',
        oversample: 'none',
        wetDryMix: 1.0,
        preGain: 2.0,
        postGain: 0.6
      }
    };

    const config = presets[preset];
    this.initialize(config);

    logger.info('Distortion', `Loaded preset: ${preset}`);
  }

  /**
   * Sets the distortion amount.
   *
   * @param amount - Distortion amount (0 to 100)
   *
   * @example
   * ```typescript
   * distortion.setAmount(75);
   * ```
   */
  public setAmount(amount: number): void {
    amount = Math.max(0, Math.min(100, amount));
    this.amount = amount;
    this.updateCurve();
  }

  /**
   * Gets the distortion amount.
   *
   * @returns Distortion amount (0 to 100)
   *
   * @example
   * ```typescript
   * const amount = distortion.getAmount();
   * ```
   */
  public getAmount(): number {
    return this.amount;
  }

  /**
   * Sets the waveshaper curve type.
   *
   * @param type - Curve type
   *
   * @example
   * ```typescript
   * distortion.setCurveType('sigmoid');
   * distortion.setCurveType('fuzz');
   * ```
   */
  public setCurveType(type: 'sigmoid' | 'asymmetric' | 'hardclip' | 'softclip' | 'fuzz'): void {
    this.curveType = type;
    this.updateCurve();
  }

  /**
   * Gets the current curve type.
   *
   * @returns Curve type
   *
   * @example
   * ```typescript
   * const type = distortion.getCurveType();
   * ```
   */
  public getCurveType(): string {
    return this.curveType;
  }

  /**
   * Sets a custom waveshaper curve.
   *
   * @param curve - Float32Array with curve values
   *
   * @example
   * ```typescript
   * const customCurve = new Float32Array(256);
   * for (let i = 0; i < 256; i++) {
   *   customCurve[i] = Math.tanh(i / 128 - 1);
   * }
   * distortion.setCustomCurve(customCurve);
   * ```
   */
  public setCustomCurve(curve: Float32Array): void {
    this.curveType = 'custom';
    this.waveshaper.curve = curve as any;
  }

  /**
   * Sets the oversample quality.
   * Higher quality reduces aliasing but increases CPU usage.
   *
   * @param oversample - Oversample type
   *
   * @example
   * ```typescript
   * distortion.setOversample('4x'); // Best quality
   * distortion.setOversample('none'); // Lowest CPU
   * ```
   */
  public setOversample(oversample: OverSampleType): void {
    this.waveshaper.oversample = oversample;
  }

  /**
   * Gets the oversample quality.
   *
   * @returns Oversample type
   *
   * @example
   * ```typescript
   * const oversample = distortion.getOversample();
   * ```
   */
  public getOversample(): OverSampleType {
    return this.waveshaper.oversample;
  }

  /**
   * Sets the wet/dry mix.
   *
   * @param mix - Mix amount (0.0 = dry only, 1.0 = wet only)
   *
   * @example
   * ```typescript
   * distortion.setWetDryMix(0.7); // 70% wet, 30% dry
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
   * const mix = distortion.getWetDryMix();
   * ```
   */
  public getWetDryMix(): number {
    return this.wetDryMix;
  }

  /**
   * Sets the pre-gain (before distortion).
   * Higher pre-gain increases distortion intensity.
   *
   * @param gain - Pre-gain multiplier (0.0 to 10.0)
   *
   * @example
   * ```typescript
   * distortion.setPreGain(2.0); // Double the input signal
   * ```
   */
  public setPreGain(gain: number): void {
    gain = Math.max(0, Math.min(10, gain));
    this.preGainNode.gain.value = gain;
  }

  /**
   * Gets the pre-gain.
   *
   * @returns Pre-gain multiplier
   *
   * @example
   * ```typescript
   * const gain = distortion.getPreGain();
   * ```
   */
  public getPreGain(): number {
    return this.preGainNode.gain.value;
  }

  /**
   * Sets the post-gain (after distortion).
   * Adjusts output level to compensate for distortion.
   *
   * @param gain - Post-gain multiplier (0.0 to 10.0)
   *
   * @example
   * ```typescript
   * distortion.setPostGain(0.5); // Reduce output by half
   * ```
   */
  public setPostGain(gain: number): void {
    gain = Math.max(0, Math.min(10, gain));
    this.postGainNode.gain.value = gain;
  }

  /**
   * Gets the post-gain.
   *
   * @returns Post-gain multiplier
   *
   * @example
   * ```typescript
   * const gain = distortion.getPostGain();
   * ```
   */
  public getPostGain(): number {
    return this.postGainNode.gain.value;
  }

  /**
   * Gets the input node for connecting audio sources.
   *
   * @returns Input GainNode
   *
   * @example
   * ```typescript
   * const input = distortion.getInput();
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
   * const output = distortion.getOutput();
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
   * distortion.setEnabled(false); // Bypass distortion
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
   * if (distortion.isEnabled()) {
   *   console.log('Distortion is active');
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
   * distortion.dispose();
   * ```
   */
  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.preGainNode.disconnect();
    this.postGainNode.disconnect();
    this.waveshaper.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
  }

  /**
   * Updates the waveshaper curve based on current settings.
   */
  private updateCurve(): void {
    if (this.curveType === 'custom') {
      return;
    }

    const samples = 4096;
    const curve = new Float32Array(samples);
    const intensity = this.amount / 100;

    for (let i = 0; i < samples; i++) {
      const x = (i / samples) * 2 - 1;

      switch (this.curveType) {
        case 'sigmoid':
          curve[i] = this.sigmoidCurve(x, intensity);
          break;
        case 'asymmetric':
          curve[i] = this.asymmetricCurve(x, intensity);
          break;
        case 'hardclip':
          curve[i] = this.hardClipCurve(x, intensity);
          break;
        case 'softclip':
          curve[i] = this.softClipCurve(x, intensity);
          break;
        case 'fuzz':
          curve[i] = this.fuzzCurve(x, intensity);
          break;
      }
    }

    this.waveshaper.curve = curve;
  }

  /**
   * Sigmoid waveshaping curve (smooth saturation).
   */
  private sigmoidCurve(x: number, intensity: number): number {
    const k = intensity * 10 + 1;
    return (2 / (1 + Math.exp(-k * x))) - 1;
  }

  /**
   * Asymmetric waveshaping curve (different positive/negative characteristics).
   */
  private asymmetricCurve(x: number, intensity: number): number {
    if (x > 0) {
      return Math.tanh(x * (1 + intensity * 5));
    } else {
      return Math.tanh(x * (1 + intensity * 3));
    }
  }

  /**
   * Hard clipping curve.
   */
  private hardClipCurve(x: number, intensity: number): number {
    const threshold = 1 - intensity * 0.9;
    if (x > threshold) return threshold;
    if (x < -threshold) return -threshold;
    return x;
  }

  /**
   * Soft clipping curve (smooth compression).
   */
  private softClipCurve(x: number, intensity: number): number {
    const k = intensity * 3 + 1;
    return Math.tanh(x * k);
  }

  /**
   * Fuzz curve (aggressive square wave-like distortion).
   */
  private fuzzCurve(x: number, intensity: number): number {
    const k = intensity * 20 + 1;
    return Math.sign(x) * (1 - Math.exp(-Math.abs(x * k)));
  }
}
