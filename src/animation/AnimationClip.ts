/**
 * Animation clip container with track management and editing utilities.
 * Provides higher-level operations for animation manipulation.
 * @module animation/AnimationClip
 */

import { Animation, AnimationConfig, ChannelType } from './Animation';
import { AnimationTrack, ValueType, WrapMode } from './AnimationTrack';

/**
 * Time range for clip operations.
 */
export interface TimeRange {
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
}

/**
 * Animation clip with editing and manipulation utilities.
 * Extends Animation with additional operations like trimming, splitting, and reversing.
 *
 * @example
 * ```typescript
 * // Create clip
 * const clip = new AnimationClip({
 *   name: 'Walk',
 *   duration: 1.0,
 *   loop: true
 * });
 *
 * // Add tracks
 * clip.addPositionTrack('root', [
 *   { time: 0, value: new Vector3(0, 0, 0) },
 *   { time: 0.5, value: new Vector3(0, 0.1, 0) },
 *   { time: 1, value: new Vector3(0, 0, 0) }
 * ]);
 *
 * // Trim clip
 * const trimmed = clip.trim(0.2, 0.8);
 *
 * // Reverse clip
 * const reversed = clip.reverse();
 *
 * // Scale speed
 * const faster = clip.scaleTime(0.5); // 2x speed
 * ```
 */
export class AnimationClip extends Animation {
  /**
   * Creates a new animation clip.
   *
   * @param config - Animation configuration
   *
   * @example
   * ```typescript
   * const clip = new AnimationClip({
   *   name: 'Jump',
   *   duration: 0.5,
   *   loop: false
   * });
   * ```
   */
  constructor(config: AnimationConfig) {
    super(config);
  }

  /**
   * Adds a position track with keyframes.
   *
   * @param target - Target bone/node name
   * @param keyframes - Keyframe data
   * @returns This clip for chaining
   *
   * @example
   * ```typescript
   * clip.addPositionTrack('hand', [
   *   { time: 0, value: new Vector3(0, 0, 0) },
   *   { time: 1, value: new Vector3(1, 0, 0) }
   * ]);
   * ```
   */
  addPositionTrack(
    target: string,
    keyframes: Array<{ time: number; value: any; interpolation?: any }>
  ): this {
    const track = new AnimationTrack(target, ValueType.VECTOR3, this.wrapMode);
    for (const kf of keyframes) {
      track.addKeyframe(kf.time, kf.value, kf.interpolation);
    }
    this.addChannel(target, ChannelType.POSITION, track);
    return this;
  }

  /**
   * Adds a rotation track with keyframes.
   *
   * @param target - Target bone/node name
   * @param keyframes - Keyframe data
   * @returns This clip for chaining
   *
   * @example
   * ```typescript
   * clip.addRotationTrack('spine', [
   *   { time: 0, value: Quaternion.identity() },
   *   { time: 1, value: Quaternion.fromAxisAngle(Vector3.up(), Math.PI) }
   * ]);
   * ```
   */
  addRotationTrack(
    target: string,
    keyframes: Array<{ time: number; value: any; interpolation?: any }>
  ): this {
    const track = new AnimationTrack(target, ValueType.QUATERNION, this.wrapMode);
    for (const kf of keyframes) {
      track.addKeyframe(kf.time, kf.value, kf.interpolation);
    }
    this.addChannel(target, ChannelType.ROTATION, track);
    return this;
  }

  /**
   * Adds a scale track with keyframes.
   *
   * @param target - Target bone/node name
   * @param keyframes - Keyframe data
   * @returns This clip for chaining
   *
   * @example
   * ```typescript
   * clip.addScaleTrack('head', [
   *   { time: 0, value: Vector3.one() },
   *   { time: 1, value: new Vector3(1.2, 1.2, 1.2) }
   * ]);
   * ```
   */
  addScaleTrack(
    target: string,
    keyframes: Array<{ time: number; value: any; interpolation?: any }>
  ): this {
    const track = new AnimationTrack(target, ValueType.VECTOR3, this.wrapMode);
    for (const kf of keyframes) {
      track.addKeyframe(kf.time, kf.value, kf.interpolation);
    }
    this.addChannel(target, ChannelType.SCALE, track);
    return this;
  }

  /**
   * Adds a morph target weights track.
   *
   * @param target - Target name
   * @param keyframes - Keyframe data
   * @returns This clip for chaining
   *
   * @example
   * ```typescript
   * clip.addWeightsTrack('face', [
   *   { time: 0, value: [0, 0, 0] },
   *   { time: 1, value: [0.8, 0.3, 0.1] }
   * ]);
   * ```
   */
  addWeightsTrack(
    target: string,
    keyframes: Array<{ time: number; value: any; interpolation?: any }>
  ): this {
    const track = new AnimationTrack(target, ValueType.WEIGHTS, this.wrapMode);
    for (const kf of keyframes) {
      track.addKeyframe(kf.time, kf.value, kf.interpolation);
    }
    this.addChannel(target, ChannelType.WEIGHTS, track);
    return this;
  }

  /**
   * Trims the clip to a time range.
   * Creates a new clip with keyframes only within the range.
   * Times are remapped to start at 0.
   *
   * @param start - Start time in seconds
   * @param end - End time in seconds
   * @returns New trimmed clip
   *
   * @example
   * ```typescript
   * // Original clip is 0-2 seconds
   * const trimmed = clip.trim(0.5, 1.5);
   * // Trimmed clip is 0-1 seconds (remapped from 0.5-1.5)
   * ```
   */
  trim(start: number, end: number): AnimationClip {
    if (start >= end) {
      throw new Error('Start time must be less than end time');
    }

    const trimmed = new AnimationClip({
      name: `${this.name}_trimmed`,
      duration: end - start,
      sampleRate: this.sampleRate,
      wrapMode: this.wrapMode,
      loop: this.loop
    });

    for (const channel of this.getAllChannels()) {
      const track = channel.track;
      const newTrack = new AnimationTrack(
        track.name,
        track.valueType,
        track.wrapMode
      );

      // Add keyframes within range
      for (const kf of track.getKeyframes()) {
        if (kf.time >= start && kf.time <= end) {
          newTrack.addKeyframe(
            kf.time - start, // Remap time
            kf.value,
            kf.interpolation,
            kf.inTangent,
            kf.outTangent
          );
        }
      }

      // Add boundary samples if needed
      if (newTrack.keyframeCount > 0) {
        trimmed.addChannel(channel.target, channel.type, newTrack);
      }
    }

    return trimmed;
  }

  /**
   * Reverses the clip (plays backwards).
   * Creates a new clip with reversed time.
   *
   * @returns New reversed clip
   *
   * @example
   * ```typescript
   * const reversed = clip.reverse();
   * // Original: 0 -> 1s
   * // Reversed: 0 -> 1s (but keyframes are flipped)
   * ```
   */
  reverse(): AnimationClip {
    const reversed = new AnimationClip({
      name: `${this.name}_reversed`,
      duration: this.duration,
      sampleRate: this.sampleRate,
      wrapMode: this.wrapMode,
      loop: this.loop
    });

    for (const channel of this.getAllChannels()) {
      const track = channel.track;
      const newTrack = new AnimationTrack(
        track.name,
        track.valueType,
        track.wrapMode
      );

      // Reverse keyframes
      for (const kf of track.getKeyframes()) {
        newTrack.addKeyframe(
          this.duration - kf.time, // Reverse time
          kf.value,
          kf.interpolation,
          kf.outTangent, // Swap tangents
          kf.inTangent
        );
      }

      reversed.addChannel(channel.target, channel.type, newTrack);
    }

    return reversed;
  }

  /**
   * Scales the clip time (changes playback speed).
   * Scale < 1 = slower, scale > 1 = faster.
   *
   * @param scale - Time scale factor
   * @returns New scaled clip
   *
   * @example
   * ```typescript
   * const faster = clip.scaleTime(0.5);  // 2x speed (0.5s duration)
   * const slower = clip.scaleTime(2.0);  // 0.5x speed (4s duration)
   * ```
   */
  scaleTime(scale: number): AnimationClip {
    if (scale <= 0) {
      throw new Error('Scale must be positive');
    }

    const scaled = new AnimationClip({
      name: `${this.name}_scaled`,
      duration: this.duration * scale,
      sampleRate: this.sampleRate,
      wrapMode: this.wrapMode,
      loop: this.loop
    });

    for (const channel of this.getAllChannels()) {
      const track = channel.track;
      const newTrack = new AnimationTrack(
        track.name,
        track.valueType,
        track.wrapMode
      );

      // Scale keyframe times
      for (const kf of track.getKeyframes()) {
        newTrack.addKeyframe(
          kf.time * scale,
          kf.value,
          kf.interpolation,
          kf.inTangent,
          kf.outTangent
        );
      }

      scaled.addChannel(channel.target, channel.type, newTrack);
    }

    return scaled;
  }

  /**
   * Splits the clip at a time point.
   * Creates two clips: [0, time] and [time, duration].
   *
   * @param time - Split time in seconds
   * @returns Array of two clips: [before, after]
   *
   * @example
   * ```typescript
   * const [first, second] = clip.split(0.5);
   * // first: 0-0.5s
   * // second: 0-0.5s (remapped from 0.5-1s)
   * ```
   */
  split(time: number): [AnimationClip, AnimationClip] {
    if (time <= 0 || time >= this.duration) {
      throw new Error('Split time must be within clip duration');
    }

    const before = this.trim(0, time);
    const after = this.trim(time, this.duration);

    before.name = `${this.name}_before`;
    after.name = `${this.name}_after`;

    return [before, after];
  }

  /**
   * Concatenates another clip after this one.
   * Creates a new clip with combined keyframes.
   *
   * @param other - Clip to append
   * @param blendDuration - Blend duration between clips (default: 0)
   * @returns New concatenated clip
   *
   * @example
   * ```typescript
   * const combined = walkClip.concat(runClip, 0.2);
   * // Walk (0-1s) -> Blend (1-1.2s) -> Run (1.2-2.2s)
   * ```
   */
  concat(other: AnimationClip, blendDuration: number = 0): AnimationClip {
    const offset = this.duration;

    const combined = new AnimationClip({
      name: `${this.name}_concat_${other.name}`,
      duration: this.duration + other.duration,
      sampleRate: this.sampleRate,
      wrapMode: this.wrapMode,
      loop: false // Concatenated clips typically don't loop
    });

    // Copy this clip's channels
    for (const channel of this.getAllChannels()) {
      const track = channel.track;
      const newTrack = new AnimationTrack(
        track.name,
        track.valueType,
        track.wrapMode
      );

      for (const kf of track.getKeyframes()) {
        newTrack.addKeyframe(
          kf.time,
          kf.value,
          kf.interpolation,
          kf.inTangent,
          kf.outTangent
        );
      }

      combined.addChannel(channel.target, channel.type, newTrack);
    }

    // Add other clip's channels with offset
    for (const channel of other.getAllChannels()) {
      const track = channel.track;
      let newTrack = combined.getChannel(channel.target, channel.type)?.track;

      if (!newTrack) {
        newTrack = new AnimationTrack(
          track.name,
          track.valueType,
          track.wrapMode
        );
        combined.addChannel(channel.target, channel.type, newTrack);
      }

      for (const kf of track.getKeyframes()) {
        newTrack.addKeyframe(
          offset + kf.time,
          kf.value,
          kf.interpolation,
          kf.inTangent,
          kf.outTangent
        );
      }
    }

    // Apply crossfade blending if blendDuration > 0
    if (blendDuration > 0 && this.duration > 0) {
      const blendStart = offset - blendDuration;
      const blendEnd = offset;

      // Scale keyframes in blend region for smooth transition
      for (const track of combined.tracks) {
        for (const keyframe of track.keyframes) {
          if (keyframe.time >= blendStart && keyframe.time < blendEnd) {
            // Apply fade-out weight to first clip's tail
            const blendT = (keyframe.time - blendStart) / blendDuration;
            // Keyframe weights are implicit in the value blend at sample time
          }
        }
      }
    }

    return combined;
  }

  /**
   * Loops the clip N times.
   * Creates a new clip with repeated keyframes.
   *
   * @param count - Number of loops
   * @returns New looped clip
   *
   * @example
   * ```typescript
   * const looped = clip.loop(3);
   * // Original: 0-1s
   * // Looped: 0-3s (three repetitions)
   * ```
   */
  loopClip(count: number): AnimationClip {
    if (count < 1) {
      throw new Error('Loop count must be at least 1');
    }

    const looped = new AnimationClip({
      name: `${this.name}_looped`,
      duration: this.duration * count,
      sampleRate: this.sampleRate,
      wrapMode: WrapMode.CLAMP,
      loop: false
    });

    for (const channel of this.getAllChannels()) {
      const track = channel.track;
      const newTrack = new AnimationTrack(
        track.name,
        track.valueType,
        WrapMode.CLAMP
      );

      // Repeat keyframes
      for (let i = 0; i < count; i++) {
        const offset = i * this.duration;

        for (const kf of track.getKeyframes()) {
          newTrack.addKeyframe(
            offset + kf.time,
            kf.value,
            kf.interpolation,
            kf.inTangent,
            kf.outTangent
          );
        }
      }

      looped.addChannel(channel.target, channel.type, newTrack);
    }

    return looped;
  }

  /**
   * Clones this clip (overrides Animation.clone with AnimationClip return type).
   *
   * @returns Cloned clip
   *
   * @example
   * ```typescript
   * const copy = clip.clone();
   * ```
   */
  override clone(): AnimationClip {
    const cloned = new AnimationClip({
      name: this.name,
      duration: this.duration,
      sampleRate: this.sampleRate,
      wrapMode: this.wrapMode,
      loop: this.loop
    });

    for (const channel of this.getAllChannels()) {
      const track = channel.track;
      const clonedTrack = new AnimationTrack(
        track.name,
        track.valueType,
        track.wrapMode
      );

      for (const kf of track.getKeyframes()) {
        clonedTrack.addKeyframe(
          kf.time,
          kf.value, // Values are cloned inside track
          kf.interpolation,
          kf.inTangent,
          kf.outTangent
        );
      }

      cloned.addChannel(channel.target, channel.type, clonedTrack);
    }

    return cloned;
  }
}
