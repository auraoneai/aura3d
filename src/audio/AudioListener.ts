/**
 * @fileoverview Spatial audio listener component for the G3D engine.
 * Represents the player's ears in 3D audio space with position and orientation.
 * @module audio/AudioListener
 */

import { AudioContext } from './AudioContext';
import { Vector3 } from '../math/Vector3';

/**
 * Distance model for spatial audio attenuation.
 */
export enum DistanceModel {
  LINEAR = 'linear',
  INVERSE = 'inverse',
  EXPONENTIAL = 'exponential'
}

/**
 * Configuration for audio listener.
 *
 * @example
 * ```typescript
 * const config: AudioListenerConfig = {
 *   position: new Vector3(0, 1.8, 0),
 *   forward: Vector3.forward(),
 *   up: Vector3.up()
 * };
 * ```
 */
export interface AudioListenerConfig {
  /**
   * Listener position in 3D space.
   */
  position?: Vector3;

  /**
   * Forward direction vector.
   */
  forward?: Vector3;

  /**
   * Up direction vector.
   */
  up?: Vector3;

  /**
   * Doppler effect factor (0.0 = disabled, 1.0 = normal, default: 1.0).
   */
  dopplerFactor?: number;

  /**
   * Speed of sound in units per second (default: 343.3 m/s).
   */
  speedOfSound?: number;
}

/**
 * Spatial audio listener component.
 *
 * Represents the player's position and orientation in 3D audio space.
 * Typically one listener exists per scene, usually attached to the camera/player.
 *
 * Features:
 * - 3D position and orientation tracking
 * - Doppler effect simulation
 * - Distance model configuration
 * - Automatic synchronization with transform
 *
 * @example
 * ```typescript
 * // Create listener
 * const listener = new AudioListener();
 * listener.initialize();
 *
 * // Set position and orientation
 * listener.setPosition(new Vector3(0, 1.8, 0));
 * listener.setOrientation(
 *   Vector3.forward(),
 *   Vector3.up()
 * );
 *
 * // Enable Doppler effect
 * listener.setDopplerFactor(1.0);
 *
 * // Update every frame with camera transform
 * function update() {
 *   listener.setPosition(camera.position);
 *   listener.setOrientation(camera.forward, camera.up);
 * }
 * ```
 */
export class AudioListener {
  private listener: AudioListener | null = null;
  private position: Vector3 = new Vector3(0, 0, 0);
  private forward: Vector3 = new Vector3(0, 0, -1);
  private up: Vector3 = new Vector3(0, 1, 0);

  private velocity: Vector3 = new Vector3(0, 0, 0);
  private lastPosition: Vector3 = new Vector3(0, 0, 0);
  private lastUpdateTime: number = 0;

  private config: Required<AudioListenerConfig>;
  private initialized: boolean = false;

  /**
   * Creates a new audio listener.
   *
   * @example
   * ```typescript
   * const listener = new AudioListener();
   * ```
   */
  constructor() {
    this.config = {
      position: new Vector3(0, 0, 0),
      forward: new Vector3(0, 0, -1),
      up: new Vector3(0, 1, 0),
      dopplerFactor: 1.0,
      speedOfSound: 343.3
    };
  }

  /**
   * Initializes the audio listener with the Web Audio API.
   * Must be called before use.
   *
   * @param config - Configuration options
   *
   * @example
   * ```typescript
   * listener.initialize({
   *   position: new Vector3(0, 1.8, 0),
   *   dopplerFactor: 1.0
   * });
   * ```
   */
  public initialize(config?: AudioListenerConfig): void {
    if (this.initialized) {
      return;
    }

    // Merge config
    if (config) {
      if (config.position) this.config.position = config.position.clone();
      if (config.forward) this.config.forward = config.forward.clone();
      if (config.up) this.config.up = config.up.clone();
      if (config.dopplerFactor !== undefined) this.config.dopplerFactor = config.dopplerFactor;
      if (config.speedOfSound !== undefined) this.config.speedOfSound = config.speedOfSound;
    }

    // Get Web Audio listener
    const audioContext = AudioContext.getInstance();
    const context = audioContext.getContext();
    this.listener = context.listener as any;

    // Set initial position and orientation
    this.position.copy(this.config.position);
    this.forward.copy(this.config.forward);
    this.up.copy(this.config.up);

    this.updatePosition();
    this.updateOrientation();

    // Initialize velocity tracking
    this.lastPosition.copy(this.position);
    this.lastUpdateTime = audioContext.getCurrentTime();

    this.initialized = true;
  }

  /**
   * Sets the listener position in 3D space.
   *
   * @param position - Position vector
   *
   * @example
   * ```typescript
   * listener.setPosition(new Vector3(10, 2, 5));
   * ```
   */
  public setPosition(position: Vector3): void {
    this.position.copy(position);

    if (this.initialized) {
      this.updatePosition();
    }
  }

  /**
   * Gets the current listener position.
   *
   * @returns Position vector (do not modify directly)
   *
   * @example
   * ```typescript
   * const pos = listener.getPosition();
   * console.log(`Listener at: ${pos.x}, ${pos.y}, ${pos.z}`);
   * ```
   */
  public getPosition(): Vector3 {
    return this.position;
  }

  /**
   * Sets the listener orientation.
   *
   * @param forward - Forward direction vector (should be normalized)
   * @param up - Up direction vector (should be normalized)
   *
   * @example
   * ```typescript
   * listener.setOrientation(
   *   new Vector3(0, 0, -1), // Forward
   *   new Vector3(0, 1, 0)   // Up
   * );
   * ```
   */
  public setOrientation(forward: Vector3, up: Vector3): void {
    this.forward.copy(forward);
    this.up.copy(up);

    if (this.initialized) {
      this.updateOrientation();
    }
  }

  /**
   * Gets the forward direction.
   *
   * @returns Forward vector (do not modify directly)
   *
   * @example
   * ```typescript
   * const forward = listener.getForward();
   * ```
   */
  public getForward(): Vector3 {
    return this.forward;
  }

  /**
   * Gets the up direction.
   *
   * @returns Up vector (do not modify directly)
   *
   * @example
   * ```typescript
   * const up = listener.getUp();
   * ```
   */
  public getUp(): Vector3 {
    return this.up;
  }

  /**
   * Sets the Doppler effect factor.
   * Controls the strength of pitch shifting based on relative velocity.
   *
   * @param factor - Doppler factor (0.0 = disabled, 1.0 = realistic, higher = exaggerated)
   *
   * @example
   * ```typescript
   * listener.setDopplerFactor(1.0); // Realistic Doppler
   * listener.setDopplerFactor(0.0); // Disable Doppler
   * listener.setDopplerFactor(2.0); // Exaggerated Doppler
   * ```
   */
  public setDopplerFactor(factor: number): void {
    this.config.dopplerFactor = Math.max(0, factor);

    // Note: Modern Web Audio API doesn't support doppler on listener directly
    // This is typically handled per-source in PannerNode
  }

  /**
   * Gets the Doppler factor.
   *
   * @returns Doppler factor
   *
   * @example
   * ```typescript
   * const doppler = listener.getDopplerFactor();
   * ```
   */
  public getDopplerFactor(): number {
    return this.config.dopplerFactor;
  }

  /**
   * Sets the speed of sound in units per second.
   * Used for Doppler effect calculations.
   *
   * @param speed - Speed of sound (default: 343.3 m/s)
   *
   * @example
   * ```typescript
   * listener.setSpeedOfSound(343.3); // Air at 20°C
   * listener.setSpeedOfSound(1484); // Water
   * ```
   */
  public setSpeedOfSound(speed: number): void {
    this.config.speedOfSound = Math.max(0.1, speed);
  }

  /**
   * Gets the speed of sound.
   *
   * @returns Speed of sound in units per second
   *
   * @example
   * ```typescript
   * const speed = listener.getSpeedOfSound();
   * ```
   */
  public getSpeedOfSound(): number {
    return this.config.speedOfSound;
  }

  /**
   * Updates velocity based on position changes.
   * Should be called once per frame with deltaTime.
   *
   * @param deltaTime - Time elapsed since last update in seconds
   *
   * @example
   * ```typescript
   * // In update loop
   * listener.setPosition(camera.position);
   * listener.updateVelocity(deltaTime);
   * ```
   */
  public updateVelocity(deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }

    // Calculate velocity: (currentPos - lastPos) / deltaTime
    this.velocity.x = (this.position.x - this.lastPosition.x) / deltaTime;
    this.velocity.y = (this.position.y - this.lastPosition.y) / deltaTime;
    this.velocity.z = (this.position.z - this.lastPosition.z) / deltaTime;

    this.lastPosition.copy(this.position);
  }

  /**
   * Gets the current velocity vector.
   * Used for Doppler effect calculations.
   *
   * @returns Velocity vector in units per second (do not modify directly)
   *
   * @example
   * ```typescript
   * const velocity = listener.getVelocity();
   * console.log(`Listener moving at: ${velocity.length()} units/s`);
   * ```
   */
  public getVelocity(): Vector3 {
    return this.velocity;
  }

  /**
   * Sets listener position from individual components.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   *
   * @example
   * ```typescript
   * listener.setPositionXYZ(10, 2, 5);
   * ```
   */
  public setPositionXYZ(x: number, y: number, z: number): void {
    this.position.set(x, y, z);

    if (this.initialized) {
      this.updatePosition();
    }
  }

  /**
   * Sets listener orientation from individual components.
   *
   * @param fx - Forward X
   * @param fy - Forward Y
   * @param fz - Forward Z
   * @param ux - Up X
   * @param uy - Up Y
   * @param uz - Up Z
   *
   * @example
   * ```typescript
   * listener.setOrientationXYZ(0, 0, -1, 0, 1, 0);
   * ```
   */
  public setOrientationXYZ(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
    this.forward.set(fx, fy, fz);
    this.up.set(ux, uy, uz);

    if (this.initialized) {
      this.updateOrientation();
    }
  }

  /**
   * Disposes the audio listener.
   *
   * @example
   * ```typescript
   * listener.dispose();
   * ```
   */
  public dispose(): void {
    this.listener = null;
    this.initialized = false;
  }

  /**
   * Updates the Web Audio API listener position.
   * Zero-allocation update using cached values.
   */
  private updatePosition(): void {
    if (!this.listener) {
      return;
    }

    const listener = this.listener as any;

    // Modern API (positionX/Y/Z)
    if (listener.positionX !== undefined) {
      listener.positionX.value = this.position.x;
      listener.positionY.value = this.position.y;
      listener.positionZ.value = this.position.z;
    }
    // Legacy API (setPosition)
    else if (listener.setPosition) {
      listener.setPosition(this.position.x, this.position.y, this.position.z);
    }
  }

  /**
   * Updates the Web Audio API listener orientation.
   * Zero-allocation update using cached values.
   */
  private updateOrientation(): void {
    if (!this.listener) {
      return;
    }

    const listener = this.listener as any;

    // Modern API (forwardX/Y/Z, upX/Y/Z)
    if (listener.forwardX !== undefined) {
      listener.forwardX.value = this.forward.x;
      listener.forwardY.value = this.forward.y;
      listener.forwardZ.value = this.forward.z;
      listener.upX.value = this.up.x;
      listener.upY.value = this.up.y;
      listener.upZ.value = this.up.z;
    }
    // Legacy API (setOrientation)
    else if (listener.setOrientation) {
      listener.setOrientation(
        this.forward.x, this.forward.y, this.forward.z,
        this.up.x, this.up.y, this.up.z
      );
    }
  }
}
