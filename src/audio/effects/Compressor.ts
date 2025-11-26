/**
 * @fileoverview Dynamic range compressor effect using DynamicsCompressorNode.
 * Reduces dynamic range for consistent volume levels and prevents clipping.
 * @module audio/effects/Compressor
 */

import { AudioContext } from '../AudioContext';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

/**
 * Compressor configuration options.
 *
 * @example
 * ```typescript
 * const config: CompressorConfig = {
 *   threshold: -24,
 *   knee: 30,
 *   ratio: 4,
 *   attack: 0.003,
 *   release: 0.25
 * };
 * ```
 */
export interface CompressorConfig {
  /**
   * Threshold in dB (-100 to 0).
   * Compression starts when signal exceeds this level.
   * Default: -24
   */
  threshold?: number;

  /**
   * Knee in dB (0 to 40).
   * Controls how gradually compression is applied.
   * 0 = hard knee, 40 = soft knee.
   * Default: 30
   */
  knee?: number;

  /**
   * Compression ratio (1 to 20).
   * 1 = no compression, 20 = limiting.
   * Default: 12
   */
  ratio?: number;

  /**
   * Attack time in seconds (0 to 1).
   * How quickly compression engages.
   * Default: 0.003
   */
  attack?: number;

  /**
   * Release time in seconds (0 to 1).
   * How quickly compression disengages.
   * Default: 0.25
   */
  release?: number;
}

/**
 * Compressor presets for common scenarios.
 */
export enum CompressorPreset {
  GENTLE = 'gentle',
  MODERATE = 'moderate',
  AGGRESSIVE = 'aggressive',
  LIMITER = 'limiter',
  VOCAL = 'vocal',
  DRUMS = 'drums',
  MASTER = 'master',
  SIDECHAIN = 'sidechain'
}

/**
 * Dynamic range compressor effect using DynamicsCompressorNode.
 *
 * Features:
 * - Configurable threshold, ratio, attack, and release
 * - Soft/hard knee control
 * - Real-time gain reduction monitoring
 * - Makeup gain compensation
 * - Common presets for different sources
 *
 * @example
 * ```typescript
 * const compressor = new Compressor();
 * compressor.initialize({
 *   threshold: -24,
 *   ratio: 4,
 *   attack: 0.003,
 *   release: 0.25
 * });
 *
 * // Connect to audio graph
 * audioSource.connect(compressor.getInput());
 * compressor.getOutput().connect(destination);
 *
 * // Adjust parameters
 * compressor.setThreshold(-20);
 * compressor.setRatio(6);
 *
 * // Monitor gain reduction
 * const reduction = compressor.getReduction();
 * console.log(`Reducing by ${reduction} dB`);
 *
 * // Use preset
 * compressor.loadPreset(CompressorPreset.VOCAL);
 * ```
 */
export class Compressor {
  private context: globalThis.AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private compressorNode: DynamicsCompressorNode;
  private makeupGain: GainNode;

  private enabled: boolean = true;
  private autoMakeupGain: boolean = true;

  /**
   * Creates a new compressor effect.
   *
   * @example
   * ```typescript
   * const compressor = new Compressor();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.inputNode = this.context.createGain();
    this.outputNode = this.context.createGain();
    this.compressorNode = this.context.createDynamicsCompressor();
    this.makeupGain = this.context.createGain();

    this.inputNode.connect(this.compressorNode);
    this.compressorNode.connect(this.makeupGain);
    this.makeupGain.connect(this.outputNode);
  }

  /**
   * Initializes the compressor effect.
   *
   * @param config - Configuration options
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
  public initialize(config: CompressorConfig = {}): void {
    this.setThreshold(config.threshold ?? -24);
    this.setKnee(config.knee ?? 30);
    this.setRatio(config.ratio ?? 12);
    this.setAttack(config.attack ?? 0.003);
    this.setRelease(config.release ?? 0.25);

    logger.info('Compressor', 'Initialized compressor effect');
  }

  /**
   * Loads a compressor preset with predefined characteristics.
   *
   * @param preset - Compressor preset to load
   *
   * @example
   * ```typescript
   * compressor.loadPreset(CompressorPreset.VOCAL);
   * ```
   */
  public loadPreset(preset: CompressorPreset): void {
    const presets: Record<CompressorPreset, CompressorConfig> = {
      [CompressorPreset.GENTLE]: {
        threshold: -30,
        knee: 20,
        ratio: 2,
        attack: 0.01,
        release: 0.3
      },
      [CompressorPreset.MODERATE]: {
        threshold: -24,
        knee: 30,
        ratio: 4,
        attack: 0.005,
        release: 0.25
      },
      [CompressorPreset.AGGRESSIVE]: {
        threshold: -18,
        knee: 10,
        ratio: 8,
        attack: 0.001,
        release: 0.1
      },
      [CompressorPreset.LIMITER]: {
        threshold: -6,
        knee: 0,
        ratio: 20,
        attack: 0.001,
        release: 0.05
      },
      [CompressorPreset.VOCAL]: {
        threshold: -20,
        knee: 15,
        ratio: 3,
        attack: 0.005,
        release: 0.2
      },
      [CompressorPreset.DRUMS]: {
        threshold: -18,
        knee: 5,
        ratio: 6,
        attack: 0.001,
        release: 0.15
      },
      [CompressorPreset.MASTER]: {
        threshold: -12,
        knee: 6,
        ratio: 2,
        attack: 0.003,
        release: 0.1
      },
      [CompressorPreset.SIDECHAIN]: {
        threshold: -24,
        knee: 0,
        ratio: 10,
        attack: 0.001,
        release: 0.2
      }
    };

    const config = presets[preset];
    this.initialize(config);

    logger.info('Compressor', `Loaded preset: ${preset}`);
  }

  /**
   * Sets the threshold level.
   * Compression starts when signal exceeds this level.
   *
   * @param threshold - Threshold in dB (-100 to 0)
   *
   * @example
   * ```typescript
   * compressor.setThreshold(-20); // Compress above -20dB
   * ```
   */
  public setThreshold(threshold: number): void {
    threshold = Math.max(-100, Math.min(0, threshold));
    this.compressorNode.threshold.value = threshold;

    if (this.autoMakeupGain) {
      this.updateMakeupGain();
    }
  }

  /**
   * Gets the threshold level.
   *
   * @returns Threshold in dB
   *
   * @example
   * ```typescript
   * const threshold = compressor.getThreshold();
   * ```
   */
  public getThreshold(): number {
    return this.compressorNode.threshold.value;
  }

  /**
   * Sets the knee width.
   * Controls how gradually compression is applied around the threshold.
   *
   * @param knee - Knee in dB (0 to 40)
   *
   * @example
   * ```typescript
   * compressor.setKnee(10); // Moderate knee
   * compressor.setKnee(0); // Hard knee
   * compressor.setKnee(40); // Soft knee
   * ```
   */
  public setKnee(knee: number): void {
    knee = Math.max(0, Math.min(40, knee));
    this.compressorNode.knee.value = knee;
  }

  /**
   * Gets the knee width.
   *
   * @returns Knee in dB
   *
   * @example
   * ```typescript
   * const knee = compressor.getKnee();
   * ```
   */
  public getKnee(): number {
    return this.compressorNode.knee.value;
  }

  /**
   * Sets the compression ratio.
   * Determines how much compression is applied above threshold.
   *
   * @param ratio - Ratio (1 to 20)
   *
   * @example
   * ```typescript
   * compressor.setRatio(4); // 4:1 compression
   * compressor.setRatio(20); // 20:1 limiting
   * ```
   */
  public setRatio(ratio: number): void {
    ratio = Math.max(1, Math.min(20, ratio));
    this.compressorNode.ratio.value = ratio;

    if (this.autoMakeupGain) {
      this.updateMakeupGain();
    }
  }

  /**
   * Gets the compression ratio.
   *
   * @returns Ratio
   *
   * @example
   * ```typescript
   * const ratio = compressor.getRatio();
   * ```
   */
  public getRatio(): number {
    return this.compressorNode.ratio.value;
  }

  /**
   * Sets the attack time.
   * How quickly compression engages when signal exceeds threshold.
   *
   * @param attack - Attack time in seconds (0 to 1)
   *
   * @example
   * ```typescript
   * compressor.setAttack(0.005); // 5ms attack
   * ```
   */
  public setAttack(attack: number): void {
    attack = Math.max(0, Math.min(1, attack));
    this.compressorNode.attack.value = attack;
  }

  /**
   * Gets the attack time.
   *
   * @returns Attack time in seconds
   *
   * @example
   * ```typescript
   * const attack = compressor.getAttack();
   * ```
   */
  public getAttack(): number {
    return this.compressorNode.attack.value;
  }

  /**
   * Sets the release time.
   * How quickly compression disengages when signal falls below threshold.
   *
   * @param release - Release time in seconds (0 to 1)
   *
   * @example
   * ```typescript
   * compressor.setRelease(0.25); // 250ms release
   * ```
   */
  public setRelease(release: number): void {
    release = Math.max(0, Math.min(1, release));
    this.compressorNode.release.value = release;
  }

  /**
   * Gets the release time.
   *
   * @returns Release time in seconds
   *
   * @example
   * ```typescript
   * const release = compressor.getRelease();
   * ```
   */
  public getRelease(): number {
    return this.compressorNode.release.value;
  }

  /**
   * Gets the current gain reduction in dB.
   * Negative values indicate amount of compression being applied.
   *
   * @returns Reduction in dB (typically -40 to 0)
   *
   * @example
   * ```typescript
   * const reduction = compressor.getReduction();
   * console.log(`Compressing by ${Math.abs(reduction)} dB`);
   * ```
   */
  public getReduction(): number {
    return this.compressorNode.reduction;
  }

  /**
   * Sets the makeup gain.
   * Compensates for volume loss due to compression.
   *
   * @param gain - Makeup gain multiplier (0.0 to 10.0)
   *
   * @example
   * ```typescript
   * compressor.setMakeupGain(2.0); // +6dB makeup gain
   * ```
   */
  public setMakeupGain(gain: number): void {
    gain = Math.max(0, Math.min(10, gain));
    this.makeupGain.gain.value = gain;
    this.autoMakeupGain = false;
  }

  /**
   * Gets the makeup gain.
   *
   * @returns Makeup gain multiplier
   *
   * @example
   * ```typescript
   * const gain = compressor.getMakeupGain();
   * ```
   */
  public getMakeupGain(): number {
    return this.makeupGain.gain.value;
  }

  /**
   * Enables automatic makeup gain calculation.
   * Automatically adjusts output level based on threshold and ratio.
   *
   * @param enabled - Enable auto makeup gain
   *
   * @example
   * ```typescript
   * compressor.setAutoMakeupGain(true);
   * ```
   */
  public setAutoMakeupGain(enabled: boolean): void {
    this.autoMakeupGain = enabled;
    if (enabled) {
      this.updateMakeupGain();
    }
  }

  /**
   * Gets auto makeup gain state.
   *
   * @returns True if auto makeup gain is enabled
   *
   * @example
   * ```typescript
   * if (compressor.isAutoMakeupGain()) {
   *   console.log('Auto makeup gain active');
   * }
   * ```
   */
  public isAutoMakeupGain(): boolean {
    return this.autoMakeupGain;
  }

  /**
   * Gets the input node for connecting audio sources.
   *
   * @returns Input GainNode
   *
   * @example
   * ```typescript
   * const input = compressor.getInput();
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
   * const output = compressor.getOutput();
   * output.connect(destination);
   * ```
   */
  public getOutput(): AudioNode {
    return this.outputNode;
  }

  /**
   * Enables or disables the effect.
   * When disabled, audio bypasses the compressor.
   *
   * @param enabled - Enable state
   *
   * @example
   * ```typescript
   * compressor.setEnabled(false); // Bypass compressor
   * ```
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    // Bypass compressor when disabled
    if (enabled) {
      this.inputNode.disconnect();
      this.inputNode.connect(this.compressorNode);
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
   * if (compressor.isEnabled()) {
   *   console.log('Compressor is active');
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
   * compressor.dispose();
   * ```
   */
  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.compressorNode.disconnect();
    this.makeupGain.disconnect();
  }

  /**
   * Updates automatic makeup gain based on threshold and ratio.
   * Compensates for average gain reduction.
   */
  private updateMakeupGain(): void {
    const threshold = this.compressorNode.threshold.value;
    const ratio = this.compressorNode.ratio.value;

    // Estimate average gain reduction
    // Assumes signal is ~12dB above threshold on average
    const averageExcess = 12;
    const gainReduction = averageExcess * (1 - 1 / ratio);

    // Convert dB to linear gain
    const makeupGainDb = gainReduction * 0.5; // Apply 50% compensation
    const makeupGainLinear = Math.pow(10, makeupGainDb / 20);

    this.makeupGain.gain.value = Math.max(1, Math.min(4, makeupGainLinear));
  }
}
