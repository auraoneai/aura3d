import { Logger } from '../../core/Logger';
import { Vector3 } from '../../math/Vector3';

/**
 * Doppler effect configuration
 */
export interface DopplerConfig {
  /** Speed of sound in meters per second */
  speedOfSound?: number;
  /** Maximum Doppler shift factor */
  maxDopplerFactor?: number;
  /** Smoothing time for pitch changes */
  smoothingTime?: number;
  /** Enable/disable Doppler effect */
  enabled?: boolean;
}

/**
 * Velocity tracking for moving objects
 */
export interface VelocityTracker {
  /** Position history */
  positions: Vector3[];
  /** Timestamp history */
  timestamps: number[];
  /** Maximum history size */
  maxHistorySize: number;
}

/**
 * Doppler shift calculation result
 */
export interface DopplerShift {
  /** Pitch shift factor (1.0 = no shift) */
  pitchFactor: number;
  /** Relative velocity in m/s */
  relativeVelocity: number;
  /** Approaching (true) or receding (false) */
  approaching: boolean;
  /** Frequency shift in Hz */
  frequencyShift: number;
}

/**
 * Doppler effect implementation for moving audio sources.
 * Simulates realistic pitch shifts based on relative velocity.
 *
 * @example
 * ```typescript
 * const doppler = new DopplerEffect(audioContext);
 * doppler.setListenerPosition(listenerPos);
 * doppler.setSourcePosition(sourcePos);
 * doppler.updateVelocities(deltaTime);
 * const shift = doppler.getDopplerShift();
 * ```
 */
export class DopplerEffect {
  private logger: Logger;
  private audioContext: AudioContext;
  private config: Required<DopplerConfig>;

  private sourceTracker: VelocityTracker;
  private listenerTracker: VelocityTracker;

  private sourceVelocity: Vector3 = new Vector3(0, 0, 0);
  private listenerVelocity: Vector3 = new Vector3(0, 0, 0);

  private pitchShiftNode: AudioBufferSourceNode | null = null;
  private currentPitchFactor: number = 1.0;

  private readonly DEFAULT_HISTORY_SIZE = 5;

  /**
   * Creates a new DopplerEffect instance
   *
   * @param audioContext - Web Audio API audio context
   * @param config - Doppler effect configuration
   */
  constructor(audioContext: AudioContext, config: DopplerConfig = {}) {
    this.logger = Logger.getInstance();
    this.audioContext = audioContext;

    this.config = {
      speedOfSound: config.speedOfSound ?? 343,
      maxDopplerFactor: config.maxDopplerFactor ?? 2.0,
      smoothingTime: config.smoothingTime ?? 0.05,
      enabled: config.enabled ?? true
    };

    this.sourceTracker = {
      positions: [],
      timestamps: [],
      maxHistorySize: this.DEFAULT_HISTORY_SIZE
    };

    this.listenerTracker = {
      positions: [],
      timestamps: [],
      maxHistorySize: this.DEFAULT_HISTORY_SIZE
    };

    this.logger.info('DopplerEffect', `Initialized with speed of sound: ${this.config.speedOfSound} m/s`);
  }

  /**
   * Updates source position and velocity tracking
   *
   * @param position - Current source position
   */
  setSourcePosition(position: Vector3): void {
    const timestamp = this.audioContext.currentTime;

    this.sourceTracker.positions.push(position.clone());
    this.sourceTracker.timestamps.push(timestamp);

    if (this.sourceTracker.positions.length > this.sourceTracker.maxHistorySize) {
      this.sourceTracker.positions.shift();
      this.sourceTracker.timestamps.shift();
    }

    this.updateSourceVelocity();
  }

  /**
   * Updates listener position and velocity tracking
   *
   * @param position - Current listener position
   */
  setListenerPosition(position: Vector3): void {
    const timestamp = this.audioContext.currentTime;

    this.listenerTracker.positions.push(position.clone());
    this.listenerTracker.timestamps.push(timestamp);

    if (this.listenerTracker.positions.length > this.listenerTracker.maxHistorySize) {
      this.listenerTracker.positions.shift();
      this.listenerTracker.timestamps.shift();
    }

    this.updateListenerVelocity();
  }

  /**
   * Calculates source velocity from position history
   */
  private updateSourceVelocity(): void {
    if (this.sourceTracker.positions.length < 2) {
      this.sourceVelocity.set(0, 0, 0);
      return;
    }

    const recentPositions = this.sourceTracker.positions.slice(-2);
    const recentTimes = this.sourceTracker.timestamps.slice(-2);

    const deltaPos = recentPositions[1].clone().sub(recentPositions[0]);
    const deltaTime = recentTimes[1] - recentTimes[0];

    if (deltaTime > 0) {
      this.sourceVelocity = deltaPos.scale(1 / deltaTime);
    }
  }

  /**
   * Calculates listener velocity from position history
   */
  private updateListenerVelocity(): void {
    if (this.listenerTracker.positions.length < 2) {
      this.listenerVelocity.set(0, 0, 0);
      return;
    }

    const recentPositions = this.listenerTracker.positions.slice(-2);
    const recentTimes = this.listenerTracker.timestamps.slice(-2);

    const deltaPos = recentPositions[1].clone().sub(recentPositions[0]);
    const deltaTime = recentTimes[1] - recentTimes[0];

    if (deltaTime > 0) {
      this.listenerVelocity = deltaPos.scale(1 / deltaTime);
    }
  }

  /**
   * Manually sets source velocity (bypasses position tracking)
   *
   * @param velocity - Source velocity vector
   */
  setSourceVelocity(velocity: Vector3): void {
    this.sourceVelocity.copy(velocity);
  }

  /**
   * Manually sets listener velocity (bypasses position tracking)
   *
   * @param velocity - Listener velocity vector
   */
  setListenerVelocity(velocity: Vector3): void {
    this.listenerVelocity.copy(velocity);
  }

  /**
   * Calculates Doppler shift based on current velocities
   *
   * @param baseFrequency - Base frequency in Hz (optional, for frequency shift calculation)
   * @returns Doppler shift data
   */
  getDopplerShift(baseFrequency?: number): DopplerShift {
    if (!this.config.enabled) {
      return {
        pitchFactor: 1.0,
        relativeVelocity: 0,
        approaching: false,
        frequencyShift: 0
      };
    }

    if (this.sourceTracker.positions.length === 0 || this.listenerTracker.positions.length === 0) {
      return {
        pitchFactor: 1.0,
        relativeVelocity: 0,
        approaching: false,
        frequencyShift: 0
      };
    }

    const sourcePos = this.sourceTracker.positions[this.sourceTracker.positions.length - 1];
    const listenerPos = this.listenerTracker.positions[this.listenerTracker.positions.length - 1];

    const direction = sourcePos.clone().sub(listenerPos);
    const distance = direction.length();

    if (distance < 0.001) {
      return {
        pitchFactor: 1.0,
        relativeVelocity: 0,
        approaching: false,
        frequencyShift: 0
      };
    }

    direction.normalize();

    const sourceRadialVelocity = this.sourceVelocity.dot(direction);
    const listenerRadialVelocity = this.listenerVelocity.dot(direction);

    const relativeVelocity = sourceRadialVelocity - listenerRadialVelocity;
    const approaching = relativeVelocity < 0;

    const speedOfSound = this.config.speedOfSound;
    const pitchFactor = (speedOfSound + listenerRadialVelocity) / (speedOfSound + sourceRadialVelocity);

    const clampedPitchFactor = Math.max(
      1 / this.config.maxDopplerFactor,
      Math.min(this.config.maxDopplerFactor, pitchFactor)
    );

    const frequencyShift = baseFrequency ? baseFrequency * (clampedPitchFactor - 1) : 0;

    return {
      pitchFactor: clampedPitchFactor,
      relativeVelocity,
      approaching,
      frequencyShift
    };
  }

  /**
   * Applies Doppler shift to an audio buffer source
   *
   * @param sourceNode - Audio buffer source node
   * @param baseFrequency - Base frequency for calculation
   */
  applyToSource(sourceNode: AudioBufferSourceNode, baseFrequency?: number): void {
    if (!this.config.enabled) {
      return;
    }

    const shift = this.getDopplerShift(baseFrequency);

    const targetPlaybackRate = shift.pitchFactor;
    const currentTime = this.audioContext.currentTime;

    sourceNode.playbackRate.setTargetAtTime(
      targetPlaybackRate,
      currentTime,
      this.config.smoothingTime
    );

    this.currentPitchFactor = shift.pitchFactor;
  }

  /**
   * Gets the current pitch factor
   *
   * @returns Current pitch shift factor
   */
  getCurrentPitchFactor(): number {
    return this.currentPitchFactor;
  }

  /**
   * Calculates the time dilation factor for distance changes
   *
   * @returns Time dilation factor
   */
  getTimeDilation(): number {
    if (!this.config.enabled) {
      return 1.0;
    }

    const shift = this.getDopplerShift();
    return 1 / shift.pitchFactor;
  }

  /**
   * Enables or disables the Doppler effect
   *
   * @param enabled - Enable state
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;

    if (!enabled) {
      this.currentPitchFactor = 1.0;
    }

    this.logger.info('DopplerEffect', `Doppler effect ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Checks if Doppler effect is enabled
   *
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Updates configuration
   *
   * @param config - New configuration options
   */
  updateConfig(config: Partial<DopplerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('DopplerEffect', 'Configuration updated');
  }

  /**
   * Gets the current source velocity
   *
   * @returns Source velocity vector
   */
  getSourceVelocity(): Vector3 {
    return this.sourceVelocity.clone();
  }

  /**
   * Gets the current listener velocity
   *
   * @returns Listener velocity vector
   */
  getListenerVelocity(): Vector3 {
    return this.listenerVelocity.clone();
  }

  /**
   * Resets velocity tracking
   */
  reset(): void {
    this.sourceTracker.positions = [];
    this.sourceTracker.timestamps = [];
    this.listenerTracker.positions = [];
    this.listenerTracker.timestamps = [];

    this.sourceVelocity.set(0, 0, 0);
    this.listenerVelocity.set(0, 0, 0);
    this.currentPitchFactor = 1.0;

    this.logger.info('DopplerEffect', 'Reset');
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.reset();
    this.logger.info('DopplerEffect', 'Disposed');
  }
}
