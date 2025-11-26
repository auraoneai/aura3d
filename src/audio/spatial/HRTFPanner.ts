import { Logger } from '../../core/Logger';
import { Vector3 } from '../../math/Vector3';

/**
 * HRTF profile configuration
 */
export interface HRTFProfile {
  /** Profile name */
  name: string;
  /** Head radius in meters */
  headRadius: number;
  /** Ear spacing in meters */
  earSpacing: number;
  /** Custom HRTF impulse responses (optional) */
  impulseResponses?: {
    left: AudioBuffer;
    right: AudioBuffer;
  };
}

/**
 * Binaural panning parameters
 */
export interface BinauralParams {
  /** Azimuth angle in radians (-π to π) */
  azimuth: number;
  /** Elevation angle in radians (-π/2 to π/2) */
  elevation: number;
  /** Distance from listener */
  distance: number;
  /** Interaural time difference in seconds */
  itd: number;
  /** Interaural level difference in dB */
  ild: number;
}

/**
 * HRTF-based binaural panner for realistic 3D audio.
 * Uses Head-Related Transfer Functions for accurate spatial positioning.
 *
 * @example
 * ```typescript
 * const panner = new HRTFPanner(audioContext);
 * panner.setSourcePosition(new Vector3(5, 0, 0));
 * panner.setListenerPosition(new Vector3(0, 0, 0));
 * panner.connect(audioContext.destination);
 * ```
 */
export class HRTFPanner {
  private logger: Logger;
  private audioContext: AudioContext;
  private profile: HRTFProfile;

  private inputNode: GainNode;
  private leftChannel: GainNode;
  private rightChannel: GainNode;
  private leftDelay: DelayNode;
  private rightDelay: DelayNode;
  private merger: ChannelMergerNode;

  private listenerPosition: Vector3 = new Vector3(0, 0, 0);
  private listenerForward: Vector3 = new Vector3(0, 0, -1);
  private listenerUp: Vector3 = new Vector3(0, 1, 0);
  private sourcePosition: Vector3 = new Vector3(0, 0, 0);

  private readonly SPEED_OF_SOUND = 343;
  private readonly MAX_ITD = 0.0007;

  /**
   * Creates a new HRTFPanner instance
   *
   * @param audioContext - Web Audio API audio context
   * @param profile - HRTF profile configuration
   */
  constructor(audioContext: AudioContext, profile?: Partial<HRTFProfile>) {
    this.logger = Logger.getInstance();
    this.audioContext = audioContext;

    this.profile = {
      name: profile?.name ?? 'default',
      headRadius: profile?.headRadius ?? 0.0875,
      earSpacing: profile?.earSpacing ?? 0.175,
      impulseResponses: profile?.impulseResponses
    };

    this.inputNode = audioContext.createGain();
    this.leftChannel = audioContext.createGain();
    this.rightChannel = audioContext.createGain();
    this.leftDelay = audioContext.createDelay(this.MAX_ITD);
    this.rightDelay = audioContext.createDelay(this.MAX_ITD);
    this.merger = audioContext.createChannelMerger(2);

    this.setupRoutingGraph();

    this.logger.info('HRTFPanner', `Initialized with profile: ${this.profile.name}`);
  }

  /**
   * Sets up the audio routing graph
   */
  private setupRoutingGraph(): void {
    this.inputNode.connect(this.leftDelay);
    this.inputNode.connect(this.rightDelay);

    this.leftDelay.connect(this.leftChannel);
    this.rightDelay.connect(this.rightChannel);

    this.leftChannel.connect(this.merger, 0, 0);
    this.rightChannel.connect(this.merger, 0, 1);
  }

  /**
   * Calculates binaural parameters based on source position
   *
   * @returns Binaural panning parameters
   */
  private calculateBinauralParams(): BinauralParams {
    const relativePosition = this.sourcePosition.clone().sub(this.listenerPosition);
    const distance = relativePosition.length();

    if (distance < 0.001) {
      return {
        azimuth: 0,
        elevation: 0,
        distance: 0,
        itd: 0,
        ild: 0
      };
    }

    const direction = relativePosition.clone().normalize();

    const listenerRight = this.listenerForward.clone()
      .cross(this.listenerUp)
      .normalize();

    const azimuth = Math.atan2(
      direction.dot(listenerRight),
      -direction.dot(this.listenerForward)
    );

    const elevation = Math.asin(direction.dot(this.listenerUp));

    const itd = this.calculateITD(azimuth);
    const ild = this.calculateILD(azimuth, elevation, distance);

    return {
      azimuth,
      elevation,
      distance,
      itd,
      ild
    };
  }

  /**
   * Calculates Interaural Time Difference using Woodworth formula
   *
   * @param azimuth - Azimuth angle in radians
   * @returns ITD in seconds
   */
  private calculateITD(azimuth: number): number {
    const headRadius = this.profile.headRadius;
    const sinAzimuth = Math.sin(azimuth);
    const itd = (headRadius / this.SPEED_OF_SOUND) * (sinAzimuth + azimuth);

    return Math.max(-this.MAX_ITD, Math.min(this.MAX_ITD, itd));
  }

  /**
   * Calculates Interaural Level Difference
   *
   * @param azimuth - Azimuth angle in radians
   * @param elevation - Elevation angle in radians
   * @param distance - Distance from listener
   * @returns ILD in dB
   */
  private calculateILD(azimuth: number, elevation: number, distance: number): number {
    const absAzimuth = Math.abs(azimuth);

    const shadowFactor = Math.min(1, absAzimuth / (Math.PI / 2));

    const freqDependent = 6;
    const ild = freqDependent * shadowFactor;

    const distanceFactor = Math.cos(elevation);
    return ild * distanceFactor;
  }

  /**
   * Updates the panning based on current positions
   */
  private updatePanning(): void {
    const params = this.calculateBinauralParams();

    if (params.itd >= 0) {
      this.leftDelay.delayTime.value = 0;
      this.rightDelay.delayTime.value = params.itd;
    } else {
      this.leftDelay.delayTime.value = -params.itd;
      this.rightDelay.delayTime.value = 0;
    }

    const leftGain = Math.pow(10, params.ild / 20);
    const rightGain = Math.pow(10, -params.ild / 20);

    this.leftChannel.gain.value = leftGain;
    this.rightChannel.gain.value = rightGain;
  }

  /**
   * Sets the source position
   *
   * @param position - Source position in 3D space
   */
  setSourcePosition(position: Vector3): void {
    this.sourcePosition.copy(position);
    this.updatePanning();
  }

  /**
   * Sets the listener position
   *
   * @param position - Listener position in 3D space
   */
  setListenerPosition(position: Vector3): void {
    this.listenerPosition.copy(position);
    this.updatePanning();
  }

  /**
   * Sets the listener orientation
   *
   * @param forward - Forward direction vector
   * @param up - Up direction vector
   */
  setListenerOrientation(forward: Vector3, up: Vector3): void {
    this.listenerForward.copy(forward).normalize();
    this.listenerUp.copy(up).normalize();
    this.updatePanning();
  }

  /**
   * Gets the current binaural parameters
   *
   * @returns Current binaural panning parameters
   */
  getBinauralParams(): BinauralParams {
    return this.calculateBinauralParams();
  }

  /**
   * Updates the HRTF profile
   *
   * @param profile - New HRTF profile
   */
  updateProfile(profile: Partial<HRTFProfile>): void {
    this.profile = { ...this.profile, ...profile };
    this.updatePanning();
    this.logger.info('HRTFPanner', `Profile updated: ${this.profile.name}`);
  }

  /**
   * Connects the panner to a destination node
   *
   * @param destination - Destination audio node
   */
  connect(destination: AudioNode): void {
    this.merger.connect(destination);
  }

  /**
   * Disconnects the panner from all destinations
   */
  disconnect(): void {
    this.merger.disconnect();
  }

  /**
   * Gets the input node for connecting sources
   *
   * @returns Input gain node
   */
  getInputNode(): GainNode {
    return this.inputNode;
  }

  /**
   * Gets the output node
   *
   * @returns Channel merger node (stereo output)
   */
  getOutputNode(): ChannelMergerNode {
    return this.merger;
  }

  /**
   * Calculates the perceived distance with distance attenuation
   *
   * @param distance - Actual distance
   * @param refDistance - Reference distance
   * @param maxDistance - Maximum distance
   * @param rolloffFactor - Rolloff factor
   * @returns Attenuation multiplier
   */
  calculateDistanceAttenuation(
    distance: number,
    refDistance: number = 1,
    maxDistance: number = 10000,
    rolloffFactor: number = 1
  ): number {
    const clampedDistance = Math.max(refDistance, Math.min(maxDistance, distance));

    return refDistance / (refDistance + rolloffFactor * (clampedDistance - refDistance));
  }

  /**
   * Applies distance attenuation to the input
   *
   * @param refDistance - Reference distance
   * @param maxDistance - Maximum distance
   * @param rolloffFactor - Rolloff factor
   */
  applyDistanceAttenuation(
    refDistance: number = 1,
    maxDistance: number = 10000,
    rolloffFactor: number = 1
  ): void {
    const params = this.calculateBinauralParams();
    const attenuation = this.calculateDistanceAttenuation(
      params.distance,
      refDistance,
      maxDistance,
      rolloffFactor
    );

    this.inputNode.gain.value = attenuation;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.disconnect();
    this.inputNode.disconnect();
    this.leftChannel.disconnect();
    this.rightChannel.disconnect();
    this.leftDelay.disconnect();
    this.rightDelay.disconnect();

    this.logger.info('HRTFPanner', 'Disposed');
  }
}
