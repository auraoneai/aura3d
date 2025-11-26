/**
 * Animation clip data structure containing multiple animation tracks.
 * Represents a complete animation that can be played by an AnimationMixer.
 * @module animation/Animation
 */

import { AnimationTrack, ValueType, InterpolationMode, WrapMode } from './AnimationTrack';
import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';

/**
 * Animation channel type for skeletal and morph target animation.
 */
export enum ChannelType {
  /** Position (translation) channel */
  POSITION = 'position',
  /** Rotation channel */
  ROTATION = 'rotation',
  /** Scale channel */
  SCALE = 'scale',
  /** Morph target weights channel */
  WEIGHTS = 'weights',
  /** Generic property channel */
  PROPERTY = 'property'
}

/**
 * Animation channel targeting a specific bone or node.
 *
 * @example
 * ```typescript
 * const channel: AnimationChannel = {
 *   target: 'spine',
 *   type: ChannelType.ROTATION,
 *   track: rotationTrack
 * };
 * ```
 */
export interface AnimationChannel {
  /** Target bone/node name */
  target: string;
  /** Channel type */
  type: ChannelType;
  /** Animation track for this channel */
  track: AnimationTrack;
}

/**
 * Configuration for creating animations.
 */
export interface AnimationConfig {
  /** Animation name */
  name: string;
  /** Duration in seconds (optional, computed from tracks if not provided) */
  duration?: number;
  /** Sample rate for baked animations (default: 60 FPS) */
  sampleRate?: number;
  /** Default wrap mode for all tracks (default: CLAMP) */
  wrapMode?: WrapMode;
  /** Whether to loop the animation (default: false) */
  loop?: boolean;
}

/**
 * Animation clip containing multiple animation channels and tracks.
 * Animations are collections of tracks that animate different properties over time.
 *
 * Supports:
 * - Skeletal animation (position, rotation, scale per bone)
 * - Morph target animation (blend shape weights)
 * - Generic property animation
 * - Multiple sample rates and interpolation modes
 *
 * @example
 * ```typescript
 * // Create skeletal animation
 * const walkAnim = new Animation({
 *   name: 'Walk',
 *   duration: 1.0,
 *   loop: true
 * });
 *
 * // Add position track for root bone
 * const posTrack = new AnimationTrack<Vector3>('root', ValueType.VECTOR3);
 * posTrack.addKeyframe(0, new Vector3(0, 0, 0));
 * posTrack.addKeyframe(0.5, new Vector3(0, 0.1, 0));
 * posTrack.addKeyframe(1, new Vector3(0, 0, 0));
 * walkAnim.addChannel('root', ChannelType.POSITION, posTrack);
 *
 * // Add rotation track for arm bone
 * const rotTrack = new AnimationTrack<Quaternion>('arm_L', ValueType.QUATERNION);
 * rotTrack.addKeyframe(0, Quaternion.identity());
 * rotTrack.addKeyframe(0.5, Quaternion.fromAxisAngle(Vector3.forward(), Math.PI / 4));
 * rotTrack.addKeyframe(1, Quaternion.identity());
 * walkAnim.addChannel('arm_L', ChannelType.ROTATION, rotTrack);
 *
 * // Sample animation at time
 * const time = 0.3;
 * const rootPos = walkAnim.sampleChannel('root', ChannelType.POSITION, time);
 * const armRot = walkAnim.sampleChannel('arm_L', ChannelType.ROTATION, time);
 * ```
 */
export class Animation {
  /**
   * Animation name for identification.
   */
  readonly name: string;

  /**
   * Animation duration in seconds.
   * Computed from tracks if not explicitly set.
   */
  private _duration: number;

  /**
   * Sample rate for baked animations (keyframes per second).
   */
  readonly sampleRate: number;

  /**
   * Default wrap mode for tracks.
   */
  wrapMode: WrapMode;

  /**
   * Whether this animation loops.
   */
  loop: boolean;

  /**
   * Animation channels mapped by "target:type" key.
   */
  private channels: Map<string, AnimationChannel>;

  /**
   * Cached list of unique target names for quick iteration.
   */
  private cachedTargets: string[] | null;

  /**
   * Creates a new animation clip.
   *
   * @param config - Animation configuration
   *
   * @example
   * ```typescript
   * const anim = new Animation({
   *   name: 'Jump',
   *   duration: 0.5,
   *   sampleRate: 60,
   *   wrapMode: WrapMode.CLAMP,
   *   loop: false
   * });
   * ```
   */
  constructor(config: AnimationConfig) {
    this.name = config.name;
    this._duration = config.duration ?? 0;
    this.sampleRate = config.sampleRate ?? 60;
    this.wrapMode = config.wrapMode ?? WrapMode.CLAMP;
    this.loop = config.loop ?? false;
    this.channels = new Map();
    this.cachedTargets = null;
  }

  /**
   * Adds an animation channel to this animation.
   *
   * @param target - Target bone/node name
   * @param type - Channel type
   * @param track - Animation track
   * @returns This animation for chaining
   *
   * @example
   * ```typescript
   * const track = new AnimationTrack<Vector3>('hand', ValueType.VECTOR3);
   * anim.addChannel('hand_R', ChannelType.POSITION, track);
   * ```
   */
  addChannel(target: string, type: ChannelType, track: AnimationTrack): this {
    const key = this.makeChannelKey(target, type);

    this.channels.set(key, {
      target,
      type,
      track
    });

    // Invalidate target cache
    this.cachedTargets = null;

    // Update duration if track is longer
    if (track.duration > this._duration) {
      this._duration = track.duration;
    }

    // Apply wrap mode to track if it doesn't have one
    if (track.wrapMode === WrapMode.CLAMP && this.wrapMode !== WrapMode.CLAMP) {
      track.wrapMode = this.wrapMode;
    }

    return this;
  }

  /**
   * Removes an animation channel.
   *
   * @param target - Target bone/node name
   * @param type - Channel type
   * @returns True if channel was removed, false otherwise
   *
   * @example
   * ```typescript
   * anim.removeChannel('hand_R', ChannelType.POSITION);
   * ```
   */
  removeChannel(target: string, type: ChannelType): boolean {
    const key = this.makeChannelKey(target, type);
    const removed = this.channels.delete(key);

    if (removed) {
      this.cachedTargets = null;
      this.recomputeDuration();
    }

    return removed;
  }

  /**
   * Gets an animation channel.
   *
   * @param target - Target bone/node name
   * @param type - Channel type
   * @returns Animation channel or undefined if not found
   *
   * @example
   * ```typescript
   * const channel = anim.getChannel('spine', ChannelType.ROTATION);
   * if (channel) {
   *   console.log(`Channel duration: ${channel.track.duration}s`);
   * }
   * ```
   */
  getChannel(target: string, type: ChannelType): AnimationChannel | undefined {
    const key = this.makeChannelKey(target, type);
    return this.channels.get(key);
  }

  /**
   * Checks if channel exists for target and type.
   *
   * @param target - Target bone/node name
   * @param type - Channel type
   * @returns True if channel exists
   *
   * @example
   * ```typescript
   * if (anim.hasChannel('root', ChannelType.POSITION)) {
   *   console.log('Root has position animation');
   * }
   * ```
   */
  hasChannel(target: string, type: ChannelType): boolean {
    return this.channels.has(this.makeChannelKey(target, type));
  }

  /**
   * Gets all channels for a specific target.
   *
   * @param target - Target bone/node name
   * @returns Array of channels for target
   *
   * @example
   * ```typescript
   * const handChannels = anim.getChannelsForTarget('hand_L');
   * for (const channel of handChannels) {
   *   console.log(`${channel.type}: ${channel.track.keyframeCount} keyframes`);
   * }
   * ```
   */
  getChannelsForTarget(target: string): AnimationChannel[] {
    const result: AnimationChannel[] = [];

    for (const channel of this.channels.values()) {
      if (channel.target === target) {
        result.push(channel);
      }
    }

    return result;
  }

  /**
   * Gets all unique target names in this animation.
   *
   * @returns Array of target names
   *
   * @example
   * ```typescript
   * const targets = anim.getTargets();
   * console.log(`Animation affects ${targets.length} bones/nodes`);
   * ```
   */
  getTargets(): string[] {
    if (this.cachedTargets === null) {
      const targetSet = new Set<string>();
      for (const channel of this.channels.values()) {
        targetSet.add(channel.target);
      }
      this.cachedTargets = Array.from(targetSet);
    }
    return this.cachedTargets;
  }

  /**
   * Samples a channel at the specified time.
   *
   * @param target - Target bone/node name
   * @param type - Channel type
   * @param time - Time in seconds
   * @returns Sampled value or undefined if channel doesn't exist
   *
   * @example
   * ```typescript
   * const rotation = anim.sampleChannel('spine', ChannelType.ROTATION, 0.5);
   * if (rotation) {
   *   bone.rotation.copy(rotation as Quaternion);
   * }
   * ```
   */
  sampleChannel(target: string, type: ChannelType, time: number): any {
    const channel = this.getChannel(target, type);
    if (!channel) {
      return undefined;
    }
    return channel.track.evaluate(time);
  }

  /**
   * Samples all channels at the specified time.
   * Returns a map of target:type to sampled values.
   *
   * @param time - Time in seconds
   * @returns Map of channel keys to sampled values
   *
   * @example
   * ```typescript
   * const samples = anim.sampleAll(0.5);
   * for (const [key, value] of samples) {
   *   console.log(`${key}: ${value}`);
   * }
   * ```
   */
  sampleAll(time: number): Map<string, any> {
    const result = new Map<string, any>();

    for (const [key, channel] of this.channels) {
      result.set(key, channel.track.evaluate(time));
    }

    return result;
  }

  /**
   * Gets the animation duration.
   * This is either explicitly set or computed from longest track.
   *
   * @returns Duration in seconds
   *
   * @example
   * ```typescript
   * console.log(`Animation duration: ${anim.duration}s`);
   * ```
   */
  get duration(): number {
    return this._duration;
  }

  /**
   * Sets the animation duration.
   * Note: This doesn't modify track keyframes.
   *
   * @param value - Duration in seconds
   *
   * @example
   * ```typescript
   * anim.duration = 2.0; // Extend animation to 2 seconds
   * ```
   */
  set duration(value: number) {
    this._duration = value;
  }

  /**
   * Gets the number of channels in this animation.
   *
   * @returns Channel count
   *
   * @example
   * ```typescript
   * console.log(`Animation has ${anim.channelCount} channels`);
   * ```
   */
  get channelCount(): number {
    return this.channels.size;
  }

  /**
   * Gets all channels (read-only).
   *
   * @returns Array of all channels
   *
   * @example
   * ```typescript
   * for (const channel of anim.getAllChannels()) {
   *   console.log(`${channel.target}.${channel.type}`);
   * }
   * ```
   */
  getAllChannels(): AnimationChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Clears all channels from this animation.
   *
   * @example
   * ```typescript
   * anim.clear();
   * console.log(`Channels remaining: ${anim.channelCount}`); // 0
   * ```
   */
  clear(): void {
    this.channels.clear();
    this.cachedTargets = null;
    this._duration = 0;
  }

  /**
   * Optimizes all tracks by removing redundant keyframes.
   *
   * @param epsilon - Tolerance for value comparison (default: 0.001)
   * @returns Total number of keyframes removed
   *
   * @example
   * ```typescript
   * const removed = anim.optimize(0.01);
   * console.log(`Removed ${removed} redundant keyframes`);
   * ```
   */
  optimize(epsilon: number = 0.001): number {
    let totalRemoved = 0;

    for (const channel of this.channels.values()) {
      totalRemoved += channel.track.optimize(epsilon);
    }

    return totalRemoved;
  }

  /**
   * Clones this animation (deep copy).
   *
   * @returns Cloned animation
   *
   * @example
   * ```typescript
   * const walkCopy = walkAnim.clone();
   * walkCopy.name = 'Walk_Copy';
   * ```
   */
  clone(): Animation {
    const cloned = new Animation({
      name: this.name,
      duration: this._duration,
      sampleRate: this.sampleRate,
      wrapMode: this.wrapMode,
      loop: this.loop
    });

    for (const [key, channel] of this.channels) {
      // Clone track by recreating with same keyframes
      const track = channel.track;
      const clonedTrack = new AnimationTrack(
        track.name,
        track.valueType,
        track.wrapMode
      );

      for (const keyframe of track.getKeyframes()) {
        clonedTrack.addKeyframe(
          keyframe.time,
          this.cloneValue(keyframe.value, track.valueType),
          keyframe.interpolation,
          keyframe.inTangent ? this.cloneValue(keyframe.inTangent, track.valueType) : undefined,
          keyframe.outTangent ? this.cloneValue(keyframe.outTangent, track.valueType) : undefined
        );
      }

      cloned.channels.set(key, {
        target: channel.target,
        type: channel.type,
        track: clonedTrack
      });
    }

    return cloned;
  }

  /**
   * Serializes animation to JSON.
   *
   * @returns JSON representation
   *
   * @example
   * ```typescript
   * const json = anim.toJSON();
   * const jsonStr = JSON.stringify(json, null, 2);
   * ```
   */
  toJSON(): any {
    const channels: any[] = [];

    for (const channel of this.channels.values()) {
      const keyframes = [];
      for (const kf of channel.track.getKeyframes()) {
        keyframes.push({
          time: kf.time,
          value: this.serializeValue(kf.value, channel.track.valueType),
          interpolation: kf.interpolation
        });
      }

      channels.push({
        target: channel.target,
        type: channel.type,
        valueType: channel.track.valueType,
        wrapMode: channel.track.wrapMode,
        keyframes
      });
    }

    return {
      name: this.name,
      duration: this._duration,
      sampleRate: this.sampleRate,
      wrapMode: this.wrapMode,
      loop: this.loop,
      channels
    };
  }

  /**
   * Deserializes animation from JSON.
   *
   * @param json - JSON representation
   * @returns Deserialized animation
   *
   * @example
   * ```typescript
   * const anim = Animation.fromJSON(jsonData);
   * ```
   */
  static fromJSON(json: any): Animation {
    const anim = new Animation({
      name: json.name,
      duration: json.duration,
      sampleRate: json.sampleRate,
      wrapMode: json.wrapMode,
      loop: json.loop
    });

    for (const channelData of json.channels) {
      const track = new AnimationTrack(
        channelData.target,
        channelData.valueType,
        channelData.wrapMode
      );

      for (const kfData of channelData.keyframes) {
        track.addKeyframe(
          kfData.time,
          Animation.deserializeValue(kfData.value, channelData.valueType),
          kfData.interpolation
        );
      }

      anim.addChannel(channelData.target, channelData.type, track);
    }

    return anim;
  }

  /**
   * Creates channel key from target and type.
   *
   * @param target - Target name
   * @param type - Channel type
   * @returns Channel key string
   * @private
   */
  private makeChannelKey(target: string, type: ChannelType): string {
    return `${target}:${type}`;
  }

  /**
   * Recomputes duration from all tracks.
   * @private
   */
  private recomputeDuration(): void {
    let maxDuration = 0;

    for (const channel of this.channels.values()) {
      if (channel.track.duration > maxDuration) {
        maxDuration = channel.track.duration;
      }
    }

    this._duration = maxDuration;
  }

  /**
   * Clones a value based on value type.
   * @private
   */
  private cloneValue(value: any, valueType: ValueType): any {
    switch (valueType) {
      case ValueType.NUMBER:
        return value;
      case ValueType.VECTOR3:
        return (value as Vector3).clone();
      case ValueType.QUATERNION:
        return (value as Quaternion).clone();
      case ValueType.WEIGHTS:
        return [...value];
      default:
        return value;
    }
  }

  /**
   * Serializes a value to JSON.
   * @private
   */
  private serializeValue(value: any, valueType: ValueType): any {
    switch (valueType) {
      case ValueType.NUMBER:
        return value;
      case ValueType.VECTOR3:
        return (value as Vector3).toArray();
      case ValueType.QUATERNION:
        return (value as Quaternion).toArray();
      case ValueType.WEIGHTS:
        return value;
      default:
        return value;
    }
  }

  /**
   * Deserializes a value from JSON.
   * @private
   */
  private static deserializeValue(value: any, valueType: ValueType): any {
    switch (valueType) {
      case ValueType.NUMBER:
        return value;
      case ValueType.VECTOR3:
        return new Vector3().fromArray(value);
      case ValueType.QUATERNION:
        return new Quaternion().fromArray(value);
      case ValueType.WEIGHTS:
        return value;
      default:
        return value;
    }
  }
}
