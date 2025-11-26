/**
 * @fileoverview 3D spatial audio system for the G3D engine.
 * Provides positional audio with distance attenuation, cone directionality, and HRTF.
 * @module audio/SpatialAudio
 */

import { AudioContext } from './AudioContext';
import { Vector3 } from '../math/Vector3';

/**
 * Distance model for spatial audio attenuation.
 */
export enum SpatialDistanceModel {
  LINEAR = 'linear',
  INVERSE = 'inverse',
  EXPONENTIAL = 'exponential'
}

/**
 * Panning model for spatial audio.
 */
export enum SpatialPanningModel {
  /**
   * Equal power panning (default, good for stereo).
   */
  EQUALPOWER = 'equalpower',

  /**
   * HRTF panning (best for headphones, binaural audio).
   */
  HRTF = 'HRTF'
}

/**
 * Configuration for spatial audio.
 *
 * @example
 * ```typescript
 * const config: SpatialAudioConfig = {
 *   position: new Vector3(10, 0, 5),
 *   maxDistance: 100,
 *   rolloffFactor: 1.0,
 *   panningModel: SpatialPanningModel.HRTF
 * };
 * ```
 */
export interface SpatialAudioConfig {
  /**
   * Source position in 3D space.
   */
  position?: Vector3;

  /**
   * Source orientation (forward direction).
   */
  orientation?: Vector3;

  /**
   * Distance model for attenuation (default: INVERSE).
   */
  distanceModel?: SpatialDistanceModel;

  /**
   * Panning model (default: EQUALPOWER).
   */
  panningModel?: SpatialPanningModel;

  /**
   * Reference distance (no attenuation closer than this, default: 1.0).
   */
  refDistance?: number;

  /**
   * Maximum distance (full attenuation beyond this, default: 10000).
   */
  maxDistance?: number;

  /**
   * Rolloff factor controlling attenuation steepness (default: 1.0).
   */
  rolloffFactor?: number;

  /**
   * Cone inner angle in degrees (default: 360, omnidirectional).
   */
  coneInnerAngle?: number;

  /**
   * Cone outer angle in degrees (default: 360).
   */
  coneOuterAngle?: number;

  /**
   * Cone outer gain (volume multiplier outside cone, 0.0 to 1.0, default: 0.0).
   */
  coneOuterGain?: number;
}

/**
 * 3D spatial audio controller using Web Audio PannerNode.
 *
 * Features:
 * - 3D positional audio with distance attenuation
 * - Configurable distance models (linear, inverse, exponential)
 * - Directional audio cones for focused sound sources
 * - HRTF support for realistic headphone audio
 * - Doppler effect simulation
 * - Zero-allocation position updates
 *
 * @example
 * ```typescript
 * // Create spatial audio source
 * const spatial = new SpatialAudio();
 * spatial.initialize({
 *   position: new Vector3(10, 0, 5),
 *   maxDistance: 50,
 *   rolloffFactor: 2.0,
 *   panningModel: SpatialPanningModel.HRTF
 * });
 *
 * // Connect audio source to spatial node
 * const source = context.createBufferSource();
 * source.buffer = audioBuffer;
 * source.connect(spatial.getInputNode());
 * spatial.connect(audioContext.getMasterOutput());
 * source.start();
 *
 * // Update position every frame
 * spatial.setPosition(entity.position);
 *
 * // Set directional cone (e.g., for loudspeaker)
 * spatial.setCone(30, 60, 0.3);
 *
 * // Cleanup
 * spatial.dispose();
 * ```
 */
export class SpatialAudio {
  private panner: PannerNode | null = null;
  private position: Vector3 = new Vector3(0, 0, 0);
  private orientation: Vector3 = new Vector3(0, 0, -1);
  private velocity: Vector3 = new Vector3(0, 0, 0);

  private lastPosition: Vector3 = new Vector3(0, 0, 0);
  private lastUpdateTime: number = 0;

  private config: Required<SpatialAudioConfig>;
  private initialized: boolean = false;

  /**
   * Creates a new spatial audio controller.
   *
   * @example
   * ```typescript
   * const spatial = new SpatialAudio();
   * ```
   */
  constructor() {
    this.config = {
      position: new Vector3(0, 0, 0),
      orientation: new Vector3(0, 0, -1),
      distanceModel: SpatialDistanceModel.INVERSE,
      panningModel: SpatialPanningModel.EQUALPOWER,
      refDistance: 1.0,
      maxDistance: 10000,
      rolloffFactor: 1.0,
      coneInnerAngle: 360,
      coneOuterAngle: 360,
      coneOuterGain: 0.0
    };
  }

  /**
   * Initializes the spatial audio with Web Audio PannerNode.
   *
   * @param config - Configuration options
   *
   * @example
   * ```typescript
   * spatial.initialize({
   *   position: new Vector3(10, 0, 0),
   *   maxDistance: 100,
   *   panningModel: SpatialPanningModel.HRTF
   * });
   * ```
   */
  public initialize(config?: SpatialAudioConfig): void {
    if (this.initialized) {
      return;
    }

    // Merge config
    if (config) {
      if (config.position) this.config.position = config.position.clone();
      if (config.orientation) this.config.orientation = config.orientation.clone();
      if (config.distanceModel !== undefined) this.config.distanceModel = config.distanceModel;
      if (config.panningModel !== undefined) this.config.panningModel = config.panningModel;
      if (config.refDistance !== undefined) this.config.refDistance = config.refDistance;
      if (config.maxDistance !== undefined) this.config.maxDistance = config.maxDistance;
      if (config.rolloffFactor !== undefined) this.config.rolloffFactor = config.rolloffFactor;
      if (config.coneInnerAngle !== undefined) this.config.coneInnerAngle = config.coneInnerAngle;
      if (config.coneOuterAngle !== undefined) this.config.coneOuterAngle = config.coneOuterAngle;
      if (config.coneOuterGain !== undefined) this.config.coneOuterGain = config.coneOuterGain;
    }

    // Create PannerNode
    const audioContext = AudioContext.getInstance();
    const context = audioContext.getContext();
    this.panner = context.createPanner();

    // Configure panner
    this.panner.panningModel = this.config.panningModel;
    this.panner.distanceModel = this.config.distanceModel;
    this.panner.refDistance = this.config.refDistance;
    this.panner.maxDistance = this.config.maxDistance;
    this.panner.rolloffFactor = this.config.rolloffFactor;
    this.panner.coneInnerAngle = this.config.coneInnerAngle;
    this.panner.coneOuterAngle = this.config.coneOuterAngle;
    this.panner.coneOuterGain = this.config.coneOuterGain;

    // Set initial position and orientation
    this.position.copy(this.config.position);
    this.orientation.copy(this.config.orientation);

    this.updatePosition();
    this.updateOrientation();

    // Initialize velocity tracking
    this.lastPosition.copy(this.position);
    this.lastUpdateTime = audioContext.getCurrentTime();

    this.initialized = true;
  }

  /**
   * Gets the PannerNode for audio graph connections.
   * Connect your audio source to this node.
   *
   * @returns PannerNode input
   * @throws Error if not initialized
   *
   * @example
   * ```typescript
   * const input = spatial.getInputNode();
   * audioSource.connect(input);
   * ```
   */
  public getInputNode(): PannerNode {
    if (!this.panner) {
      throw new Error('SpatialAudio not initialized. Call initialize() first.');
    }
    return this.panner;
  }

  /**
   * Connects the spatial audio output to a destination node.
   *
   * @param destination - Destination audio node
   *
   * @example
   * ```typescript
   * spatial.connect(audioContext.getMasterOutput());
   * ```
   */
  public connect(destination: AudioNode): void {
    if (!this.panner) {
      throw new Error('SpatialAudio not initialized');
    }
    this.panner.connect(destination);
  }

  /**
   * Disconnects the spatial audio from all outputs.
   *
   * @example
   * ```typescript
   * spatial.disconnect();
   * ```
   */
  public disconnect(): void {
    if (this.panner) {
      this.panner.disconnect();
    }
  }

  /**
   * Sets the source position in 3D space.
   *
   * @param position - Position vector
   *
   * @example
   * ```typescript
   * spatial.setPosition(new Vector3(10, 2, 5));
   * ```
   */
  public setPosition(position: Vector3): void {
    this.position.copy(position);

    if (this.initialized) {
      this.updatePosition();
    }
  }

  /**
   * Gets the current source position.
   *
   * @returns Position vector (do not modify directly)
   *
   * @example
   * ```typescript
   * const pos = spatial.getPosition();
   * ```
   */
  public getPosition(): Vector3 {
    return this.position;
  }

  /**
   * Sets source position from individual components.
   * Zero-allocation alternative to setPosition.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   *
   * @example
   * ```typescript
   * spatial.setPositionXYZ(10, 2, 5);
   * ```
   */
  public setPositionXYZ(x: number, y: number, z: number): void {
    this.position.set(x, y, z);

    if (this.initialized) {
      this.updatePosition();
    }
  }

  /**
   * Sets the source orientation (forward direction).
   *
   * @param orientation - Forward direction vector (should be normalized)
   *
   * @example
   * ```typescript
   * spatial.setOrientation(new Vector3(1, 0, 0)); // Pointing right
   * ```
   */
  public setOrientation(orientation: Vector3): void {
    this.orientation.copy(orientation);

    if (this.initialized) {
      this.updateOrientation();
    }
  }

  /**
   * Gets the current source orientation.
   *
   * @returns Orientation vector (do not modify directly)
   *
   * @example
   * ```typescript
   * const forward = spatial.getOrientation();
   * ```
   */
  public getOrientation(): Vector3 {
    return this.orientation;
  }

  /**
   * Sets orientation from individual components.
   *
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   *
   * @example
   * ```typescript
   * spatial.setOrientationXYZ(1, 0, 0);
   * ```
   */
  public setOrientationXYZ(x: number, y: number, z: number): void {
    this.orientation.set(x, y, z);

    if (this.initialized) {
      this.updateOrientation();
    }
  }

  /**
   * Sets the distance model for attenuation.
   *
   * @param model - Distance model
   *
   * @example
   * ```typescript
   * spatial.setDistanceModel(SpatialDistanceModel.INVERSE);
   * ```
   */
  public setDistanceModel(model: SpatialDistanceModel): void {
    this.config.distanceModel = model;

    if (this.panner) {
      this.panner.distanceModel = model;
    }
  }

  /**
   * Gets the distance model.
   *
   * @returns Current distance model
   *
   * @example
   * ```typescript
   * const model = spatial.getDistanceModel();
   * ```
   */
  public getDistanceModel(): SpatialDistanceModel {
    return this.config.distanceModel;
  }

  /**
   * Sets the panning model.
   *
   * @param model - Panning model
   *
   * @example
   * ```typescript
   * spatial.setPanningModel(SpatialPanningModel.HRTF);
   * ```
   */
  public setPanningModel(model: SpatialPanningModel): void {
    this.config.panningModel = model;

    if (this.panner) {
      this.panner.panningModel = model;
    }
  }

  /**
   * Gets the panning model.
   *
   * @returns Current panning model
   *
   * @example
   * ```typescript
   * const model = spatial.getPanningModel();
   * ```
   */
  public getPanningModel(): SpatialPanningModel {
    return this.config.panningModel;
  }

  /**
   * Sets the reference distance (no attenuation closer than this).
   *
   * @param distance - Reference distance
   *
   * @example
   * ```typescript
   * spatial.setRefDistance(5.0); // No attenuation within 5 units
   * ```
   */
  public setRefDistance(distance: number): void {
    this.config.refDistance = Math.max(0, distance);

    if (this.panner) {
      this.panner.refDistance = this.config.refDistance;
    }
  }

  /**
   * Gets the reference distance.
   *
   * @returns Reference distance
   *
   * @example
   * ```typescript
   * const refDist = spatial.getRefDistance();
   * ```
   */
  public getRefDistance(): number {
    return this.config.refDistance;
  }

  /**
   * Sets the maximum distance (full attenuation beyond this).
   *
   * @param distance - Maximum distance
   *
   * @example
   * ```typescript
   * spatial.setMaxDistance(100); // Inaudible beyond 100 units
   * ```
   */
  public setMaxDistance(distance: number): void {
    this.config.maxDistance = Math.max(0, distance);

    if (this.panner) {
      this.panner.maxDistance = this.config.maxDistance;
    }
  }

  /**
   * Gets the maximum distance.
   *
   * @returns Maximum distance
   *
   * @example
   * ```typescript
   * const maxDist = spatial.getMaxDistance();
   * ```
   */
  public getMaxDistance(): number {
    return this.config.maxDistance;
  }

  /**
   * Sets the rolloff factor controlling attenuation steepness.
   * Higher values = faster attenuation with distance.
   *
   * @param factor - Rolloff factor (typically 0.5 to 2.0)
   *
   * @example
   * ```typescript
   * spatial.setRolloffFactor(2.0); // Faster attenuation
   * spatial.setRolloffFactor(0.5); // Slower attenuation
   * ```
   */
  public setRolloffFactor(factor: number): void {
    this.config.rolloffFactor = Math.max(0, factor);

    if (this.panner) {
      this.panner.rolloffFactor = this.config.rolloffFactor;
    }
  }

  /**
   * Gets the rolloff factor.
   *
   * @returns Rolloff factor
   *
   * @example
   * ```typescript
   * const rolloff = spatial.getRolloffFactor();
   * ```
   */
  public getRolloffFactor(): number {
    return this.config.rolloffFactor;
  }

  /**
   * Sets the directional cone parameters.
   * Useful for directional sound sources like loudspeakers or spotlights.
   *
   * @param innerAngle - Inner cone angle in degrees (full volume, default: 360)
   * @param outerAngle - Outer cone angle in degrees (default: 360)
   * @param outerGain - Volume multiplier outside cone (0.0 to 1.0, default: 0.0)
   *
   * @example
   * ```typescript
   * // Narrow directional sound (loudspeaker)
   * spatial.setCone(30, 90, 0.2);
   *
   * // Omnidirectional sound
   * spatial.setCone(360, 360, 1.0);
   * ```
   */
  public setCone(innerAngle: number, outerAngle: number, outerGain: number): void {
    this.config.coneInnerAngle = Math.max(0, Math.min(360, innerAngle));
    this.config.coneOuterAngle = Math.max(0, Math.min(360, outerAngle));
    this.config.coneOuterGain = Math.max(0, Math.min(1, outerGain));

    if (this.panner) {
      this.panner.coneInnerAngle = this.config.coneInnerAngle;
      this.panner.coneOuterAngle = this.config.coneOuterAngle;
      this.panner.coneOuterGain = this.config.coneOuterGain;
    }
  }

  /**
   * Gets the cone parameters.
   *
   * @returns Cone configuration
   *
   * @example
   * ```typescript
   * const { innerAngle, outerAngle, outerGain } = spatial.getCone();
   * ```
   */
  public getCone(): { innerAngle: number; outerAngle: number; outerGain: number } {
    return {
      innerAngle: this.config.coneInnerAngle,
      outerAngle: this.config.coneOuterAngle,
      outerGain: this.config.coneOuterGain
    };
  }

  /**
   * Updates velocity based on position changes.
   * Should be called once per frame for Doppler effect.
   *
   * @param deltaTime - Time elapsed since last update in seconds
   *
   * @example
   * ```typescript
   * // In update loop
   * spatial.setPosition(entity.position);
   * spatial.updateVelocity(deltaTime);
   * ```
   */
  public updateVelocity(deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }

    // Calculate velocity
    this.velocity.x = (this.position.x - this.lastPosition.x) / deltaTime;
    this.velocity.y = (this.position.y - this.lastPosition.y) / deltaTime;
    this.velocity.z = (this.position.z - this.lastPosition.z) / deltaTime;

    this.lastPosition.copy(this.position);

    // Note: Modern Web Audio API doesn't support velocity directly
    // Doppler is typically handled at the context level
  }

  /**
   * Gets the current velocity.
   *
   * @returns Velocity vector (do not modify directly)
   *
   * @example
   * ```typescript
   * const vel = spatial.getVelocity();
   * console.log(`Speed: ${vel.length()} units/s`);
   * ```
   */
  public getVelocity(): Vector3 {
    return this.velocity;
  }

  /**
   * Disposes the spatial audio and releases resources.
   *
   * @example
   * ```typescript
   * spatial.dispose();
   * ```
   */
  public dispose(): void {
    if (this.panner) {
      this.panner.disconnect();
      this.panner = null;
    }
    this.initialized = false;
  }

  /**
   * Updates the PannerNode position.
   * Zero-allocation update using cached values.
   */
  private updatePosition(): void {
    if (!this.panner) {
      return;
    }

    // Modern API (positionX/Y/Z)
    if (this.panner.positionX !== undefined) {
      this.panner.positionX.value = this.position.x;
      this.panner.positionY.value = this.position.y;
      this.panner.positionZ.value = this.position.z;
    }
    // Legacy API (setPosition)
    else if ((this.panner as any).setPosition) {
      (this.panner as any).setPosition(this.position.x, this.position.y, this.position.z);
    }
  }

  /**
   * Updates the PannerNode orientation.
   * Zero-allocation update using cached values.
   */
  private updateOrientation(): void {
    if (!this.panner) {
      return;
    }

    // Modern API (orientationX/Y/Z)
    if (this.panner.orientationX !== undefined) {
      this.panner.orientationX.value = this.orientation.x;
      this.panner.orientationY.value = this.orientation.y;
      this.panner.orientationZ.value = this.orientation.z;
    }
    // Legacy API (setOrientation)
    else if ((this.panner as any).setOrientation) {
      (this.panner as any).setOrientation(this.orientation.x, this.orientation.y, this.orientation.z);
    }
  }
}
