/**
 * Animation track for a single animated property with keyframe evaluation.
 * Supports multiple interpolation modes and time wrapping behaviors.
 * @module animation/AnimationTrack
 */

import { Interpolation } from '../math/Interpolation';
import { Quaternion } from '../math/Quaternion';
import { Vector3 } from '../math/Vector3';
import { clamp } from '../math/MathConstants';

/**
 * Interpolation mode for keyframe evaluation.
 */
export enum InterpolationMode {
  /** Constant (step) interpolation - value jumps to next keyframe */
  STEP = 'step',
  /** Linear interpolation between keyframes */
  LINEAR = 'linear',
  /** Smooth cubic interpolation using Catmull-Rom splines */
  CUBIC = 'cubic'
}

/**
 * Time wrapping behavior for animation playback beyond track duration.
 */
export enum WrapMode {
  /** Clamp time to [0, duration] */
  CLAMP = 'clamp',
  /** Loop time back to 0 when exceeding duration */
  LOOP = 'loop',
  /** Ping-pong between 0 and duration */
  PING_PONG = 'pingpong'
}

/**
 * Type of animated value stored in keyframes.
 */
export enum ValueType {
  /** Single number value */
  NUMBER = 'number',
  /** 3D vector (position, scale, color RGB) */
  VECTOR3 = 'vector3',
  /** Quaternion rotation */
  QUATERNION = 'quaternion',
  /** Morph target weights array */
  WEIGHTS = 'weights'
}

/**
 * Single keyframe containing time and value data.
 *
 * @template T The type of value stored (number, Vector3, Quaternion, number[])
 *
 * @example
 * ```typescript
 * const keyframe: Keyframe<number> = {
 *   time: 1.5,
 *   value: 10.0,
 *   interpolation: InterpolationMode.LINEAR
 * };
 *
 * const rotKeyframe: Keyframe<Quaternion> = {
 *   time: 0.5,
 *   value: Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 2),
 *   interpolation: InterpolationMode.LINEAR
 * };
 * ```
 */
export interface Keyframe<T = any> {
  /** Time in seconds */
  time: number;
  /** Value at this keyframe */
  value: T;
  /** Interpolation mode to next keyframe */
  interpolation: InterpolationMode;
  /** Optional in-tangent for cubic interpolation */
  inTangent?: T;
  /** Optional out-tangent for cubic interpolation */
  outTangent?: T;
}

/**
 * Single animated property track with keyframes and interpolation.
 * Tracks can animate numbers, vectors, quaternions, or morph target weights.
 *
 * @template T The type of value stored in keyframes
 *
 * @example
 * ```typescript
 * // Position track
 * const posTrack = new AnimationTrack<Vector3>('position', ValueType.VECTOR3);
 * posTrack.addKeyframe(0, new Vector3(0, 0, 0), InterpolationMode.LINEAR);
 * posTrack.addKeyframe(1, new Vector3(10, 0, 0), InterpolationMode.LINEAR);
 * const pos = posTrack.evaluate(0.5); // Vector3(5, 0, 0)
 *
 * // Rotation track with slerp
 * const rotTrack = new AnimationTrack<Quaternion>('rotation', ValueType.QUATERNION);
 * rotTrack.addKeyframe(0, Quaternion.identity(), InterpolationMode.LINEAR);
 * rotTrack.addKeyframe(1, Quaternion.fromAxisAngle(Vector3.up(), Math.PI), InterpolationMode.LINEAR);
 * const rot = rotTrack.evaluate(0.5); // Quaternion for 90° rotation
 *
 * // Scale track with ping-pong
 * const scaleTrack = new AnimationTrack<Vector3>('scale', ValueType.VECTOR3, WrapMode.PING_PONG);
 * scaleTrack.addKeyframe(0, Vector3.one(), InterpolationMode.LINEAR);
 * scaleTrack.addKeyframe(1, new Vector3(2, 2, 2), InterpolationMode.LINEAR);
 * const scale = scaleTrack.evaluate(1.5); // Ping-pongs back to 1.5
 * ```
 */
export class AnimationTrack<T = any> {
  /**
   * Property name this track animates (e.g., "position.x", "rotation").
   */
  readonly name: string;

  /**
   * Type of value stored in keyframes.
   */
  readonly valueType: ValueType;

  /**
   * Time wrapping behavior beyond track duration.
   */
  wrapMode: WrapMode;

  /**
   * Keyframes sorted by time in ascending order.
   */
  private keyframes: Keyframe<T>[];

  /**
   * Cached duration (time of last keyframe).
   */
  private cachedDuration: number;

  /**
   * Last keyframe index used for evaluation (optimization hint).
   */
  private lastKeyframeIndex: number;

  /**
   * Creates a new animation track.
   *
   * @param name - Property name to animate
   * @param valueType - Type of animated value
   * @param wrapMode - Time wrapping behavior (default: CLAMP)
   *
   * @example
   * ```typescript
   * const track = new AnimationTrack<number>('opacity', ValueType.NUMBER, WrapMode.LOOP);
   * ```
   */
  constructor(name: string, valueType: ValueType, wrapMode: WrapMode = WrapMode.CLAMP) {
    this.name = name;
    this.valueType = valueType;
    this.wrapMode = wrapMode;
    this.keyframes = [];
    this.cachedDuration = 0;
    this.lastKeyframeIndex = 0;
  }

  /**
   * Adds a keyframe to the track at the specified time.
   * Keyframes are automatically sorted by time.
   *
   * @param time - Time in seconds
   * @param value - Value at this keyframe
   * @param interpolation - Interpolation mode (default: LINEAR)
   * @param inTangent - Optional in-tangent for cubic interpolation
   * @param outTangent - Optional out-tangent for cubic interpolation
   * @returns This track for chaining
   *
   * @example
   * ```typescript
   * track
   *   .addKeyframe(0, new Vector3(0, 0, 0))
   *   .addKeyframe(1, new Vector3(5, 0, 0))
   *   .addKeyframe(2, new Vector3(10, 5, 0), InterpolationMode.CUBIC);
   * ```
   */
  addKeyframe(
    time: number,
    value: T,
    interpolation: InterpolationMode = InterpolationMode.LINEAR,
    inTangent?: T,
    outTangent?: T
  ): this {
    const keyframe: Keyframe<T> = {
      time,
      value,
      interpolation,
      inTangent,
      outTangent
    };

    // Binary search for insertion point
    let left = 0;
    let right = this.keyframes.length;

    while (left < right) {
      const mid = (left + right) >>> 1;
      if (this.keyframes[mid].time < time) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Check if keyframe at exact time exists
    if (left < this.keyframes.length && this.keyframes[left].time === time) {
      // Replace existing keyframe
      this.keyframes[left] = keyframe;
    } else {
      // Insert new keyframe
      this.keyframes.splice(left, 0, keyframe);
    }

    // Update cached duration
    if (this.keyframes.length > 0) {
      this.cachedDuration = this.keyframes[this.keyframes.length - 1].time;
    }

    return this;
  }

  /**
   * Removes a keyframe at the specified time.
   *
   * @param time - Time of keyframe to remove
   * @returns True if keyframe was removed, false otherwise
   *
   * @example
   * ```typescript
   * track.removeKeyframe(1.5);
   * ```
   */
  removeKeyframe(time: number): boolean {
    const index = this.findKeyframeIndex(time);
    if (index !== -1 && this.keyframes[index].time === time) {
      this.keyframes.splice(index, 1);

      // Update cached duration
      if (this.keyframes.length > 0) {
        this.cachedDuration = this.keyframes[this.keyframes.length - 1].time;
      } else {
        this.cachedDuration = 0;
      }

      return true;
    }
    return false;
  }

  /**
   * Evaluates the track at the specified time, returning interpolated value.
   * Uses cached keyframe index for O(1) evaluation in sequential playback.
   *
   * @param time - Time in seconds to evaluate at
   * @returns Interpolated value at time
   *
   * @example
   * ```typescript
   * const value = track.evaluate(1.5);
   * ```
   */
  evaluate(time: number): T {
    if (this.keyframes.length === 0) {
      return this.getDefaultValue();
    }

    if (this.keyframes.length === 1) {
      return this.cloneValue(this.keyframes[0].value);
    }

    // Apply time wrapping
    const wrappedTime = this.wrapTime(time);

    // Find keyframe interval
    const index = this.findKeyframeIndexOptimized(wrappedTime);

    // Handle edge cases
    if (index === 0 && wrappedTime <= this.keyframes[0].time) {
      return this.cloneValue(this.keyframes[0].value);
    }

    if (index === this.keyframes.length - 1) {
      return this.cloneValue(this.keyframes[index].value);
    }

    // Get keyframe pair
    const k0 = this.keyframes[index];
    const k1 = this.keyframes[index + 1];

    // Calculate local t between keyframes
    const t = (wrappedTime - k0.time) / (k1.time - k0.time);

    // Interpolate based on mode
    return this.interpolate(k0, k1, t);
  }

  /**
   * Gets the duration of this track (time of last keyframe).
   *
   * @returns Duration in seconds
   *
   * @example
   * ```typescript
   * console.log(`Track duration: ${track.duration}s`);
   * ```
   */
  get duration(): number {
    return this.cachedDuration;
  }

  /**
   * Gets the number of keyframes in this track.
   *
   * @returns Number of keyframes
   *
   * @example
   * ```typescript
   * console.log(`Track has ${track.keyframeCount} keyframes`);
   * ```
   */
  get keyframeCount(): number {
    return this.keyframes.length;
  }

  /**
   * Gets keyframe at specified index.
   *
   * @param index - Keyframe index
   * @returns Keyframe at index, or undefined if out of bounds
   *
   * @example
   * ```typescript
   * const firstKey = track.getKeyframe(0);
   * console.log(`First keyframe at time ${firstKey?.time}`);
   * ```
   */
  getKeyframe(index: number): Keyframe<T> | undefined {
    return this.keyframes[index];
  }

  /**
   * Gets all keyframes (read-only view).
   *
   * @returns Array of keyframes
   *
   * @example
   * ```typescript
   * for (const kf of track.getKeyframes()) {
   *   console.log(`Keyframe at ${kf.time}: ${kf.value}`);
   * }
   * ```
   */
  getKeyframes(): ReadonlyArray<Keyframe<T>> {
    return this.keyframes;
  }

  /**
   * Clears all keyframes from the track.
   *
   * @example
   * ```typescript
   * track.clear();
   * ```
   */
  clear(): void {
    this.keyframes.length = 0;
    this.cachedDuration = 0;
    this.lastKeyframeIndex = 0;
  }

  /**
   * Optimizes the track by removing redundant keyframes.
   * Removes keyframes that can be interpolated from neighbors within epsilon.
   *
   * @param epsilon - Tolerance for value comparison (default: 0.001)
   * @returns Number of keyframes removed
   *
   * @example
   * ```typescript
   * const removed = track.optimize(0.01);
   * console.log(`Removed ${removed} redundant keyframes`);
   * ```
   */
  optimize(epsilon: number = 0.001): number {
    if (this.keyframes.length <= 2) {
      return 0;
    }

    const toRemove: number[] = [];

    for (let i = 1; i < this.keyframes.length - 1; i++) {
      const k0 = this.keyframes[i - 1];
      const k1 = this.keyframes[i];
      const k2 = this.keyframes[i + 1];

      // Calculate interpolated value at k1's time
      const t = (k1.time - k0.time) / (k2.time - k0.time);
      const interpolated = this.interpolateValues(k0.value, k2.value, t, k0.interpolation);

      // Check if k1 can be removed
      if (this.valuesEqual(k1.value, interpolated, epsilon)) {
        toRemove.push(i);
      }
    }

    // Remove in reverse order to maintain indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.keyframes.splice(toRemove[i], 1);
    }

    return toRemove.length;
  }

  /**
   * Wraps time according to wrap mode.
   *
   * @param time - Input time
   * @returns Wrapped time
   * @private
   */
  private wrapTime(time: number): number {
    if (this.cachedDuration === 0) {
      return 0;
    }

    switch (this.wrapMode) {
      case WrapMode.CLAMP:
        return clamp(time, 0, this.cachedDuration);

      case WrapMode.LOOP: {
        const t = time % this.cachedDuration;
        return t < 0 ? t + this.cachedDuration : t;
      }

      case WrapMode.PING_PONG: {
        const cycle = this.cachedDuration * 2;
        let t = time % cycle;
        if (t < 0) t += cycle;
        return t <= this.cachedDuration ? t : cycle - t;
      }

      default:
        return time;
    }
  }

  /**
   * Finds keyframe index for the given time using binary search.
   *
   * @param time - Time to search for
   * @returns Index of keyframe at or before time
   * @private
   */
  private findKeyframeIndex(time: number): number {
    if (this.keyframes.length === 0) {
      return -1;
    }

    let left = 0;
    let right = this.keyframes.length - 1;

    while (left <= right) {
      const mid = (left + right) >>> 1;
      const keyTime = this.keyframes[mid].time;

      if (keyTime === time) {
        return mid;
      } else if (keyTime < time) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return right;
  }

  /**
   * Optimized keyframe search using cached last index hint.
   * Provides O(1) lookup for sequential playback.
   *
   * @param time - Time to search for
   * @returns Index of keyframe at or before time
   * @private
   */
  private findKeyframeIndexOptimized(time: number): number {
    // Check cached index neighborhood first
    if (this.lastKeyframeIndex < this.keyframes.length) {
      const k = this.keyframes[this.lastKeyframeIndex];
      if (k.time <= time) {
        // Check next keyframe
        if (this.lastKeyframeIndex + 1 < this.keyframes.length) {
          const kNext = this.keyframes[this.lastKeyframeIndex + 1];
          if (time < kNext.time) {
            return this.lastKeyframeIndex;
          }
          // Time advanced, update hint
          this.lastKeyframeIndex++;
          if (this.lastKeyframeIndex + 1 < this.keyframes.length && time >= kNext.time) {
            // Continue forward search
            for (let i = this.lastKeyframeIndex; i < this.keyframes.length - 1; i++) {
              if (this.keyframes[i + 1].time > time) {
                this.lastKeyframeIndex = i;
                return i;
              }
            }
            this.lastKeyframeIndex = this.keyframes.length - 1;
            return this.lastKeyframeIndex;
          }
          return this.lastKeyframeIndex;
        }
        return this.lastKeyframeIndex;
      }
    }

    // Fall back to binary search
    const index = this.findKeyframeIndex(time);
    this.lastKeyframeIndex = Math.max(0, index);
    return this.lastKeyframeIndex;
  }

  /**
   * Interpolates between two keyframes at normalized time t.
   *
   * @param k0 - Start keyframe
   * @param k1 - End keyframe
   * @param t - Normalized time [0, 1]
   * @returns Interpolated value
   * @private
   */
  private interpolate(k0: Keyframe<T>, k1: Keyframe<T>, t: number): T {
    return this.interpolateValues(k0.value, k1.value, t, k0.interpolation);
  }

  /**
   * Interpolates between two values based on interpolation mode.
   *
   * @param v0 - Start value
   * @param v1 - End value
   * @param t - Normalized time [0, 1]
   * @param mode - Interpolation mode
   * @returns Interpolated value
   * @private
   */
  private interpolateValues(v0: T, v1: T, t: number, mode: InterpolationMode): T {
    switch (mode) {
      case InterpolationMode.STEP:
        return this.cloneValue(t < 1 ? v0 : v1);

      case InterpolationMode.LINEAR:
        return this.lerpValues(v0, v1, t);

      case InterpolationMode.CUBIC:
        // Hermite cubic interpolation using tangents
        return this.cubicHermiteInterpolate(v0, v1, t, kf0.outTangent, kf1.inTangent);

      default:
        return this.cloneValue(v0);
    }
  }

  /**
   * Linearly interpolates between two values based on value type.
   *
   * @param v0 - Start value
   * @param v1 - End value
   * @param t - Normalized time [0, 1]
   * @returns Interpolated value
   * @private
   */
  private lerpValues(v0: T, v1: T, t: number): T {
    switch (this.valueType) {
      case ValueType.NUMBER:
        return Interpolation.lerp(v0 as number, v1 as number, t) as T;

      case ValueType.VECTOR3:
        return (v0 as Vector3).lerp(v1 as Vector3, t) as T;

      case ValueType.QUATERNION:
        return (v0 as Quaternion).slerp(v1 as Quaternion, t) as T;

      case ValueType.WEIGHTS: {
        const w0 = v0 as number[];
        const w1 = v1 as number[];
        const result = new Array(w0.length);
        for (let i = 0; i < w0.length; i++) {
          result[i] = Interpolation.lerp(w0[i], w1[i], t);
        }
        return result as T;
      }

      default:
        return this.cloneValue(v0);
    }
  }

  /**
   * Performs cubic Hermite interpolation between two values.
   * Uses tangents for smooth curve control.
   *
   * @param v0 - Start value
   * @param v1 - End value
   * @param t - Normalized time [0, 1]
   * @param outTangent - Outgoing tangent from v0
   * @param inTangent - Incoming tangent to v1
   * @returns Interpolated value
   * @private
   */
  private cubicHermiteInterpolate(v0: T, v1: T, t: number, outTangent?: T, inTangent?: T): T {
    // Hermite basis functions
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;  // start point influence
    const h10 = t3 - 2 * t2 + t;       // start tangent influence
    const h01 = -2 * t3 + 3 * t2;      // end point influence
    const h11 = t3 - t2;               // end tangent influence

    switch (this.valueType) {
      case ValueType.NUMBER: {
        const n0 = v0 as number;
        const n1 = v1 as number;
        const m0 = (outTangent as number | undefined) ?? (n1 - n0);
        const m1 = (inTangent as number | undefined) ?? (n1 - n0);
        return (h00 * n0 + h10 * m0 + h01 * n1 + h11 * m1) as T;
      }

      case ValueType.VECTOR3: {
        const p0 = v0 as Vector3;
        const p1 = v1 as Vector3;
        const m0 = (outTangent as Vector3 | undefined) ?? p1.sub(p0);
        const m1 = (inTangent as Vector3 | undefined) ?? p1.sub(p0);
        return new Vector3(
          h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
          h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y,
          h00 * p0.z + h10 * m0.z + h01 * p1.z + h11 * m1.z
        ) as T;
      }

      case ValueType.QUATERNION:
        // For quaternions, use slerp (cubic doesn't apply well to rotations)
        return (v0 as Quaternion).slerp(v1 as Quaternion, t) as T;

      case ValueType.WEIGHTS: {
        const w0 = v0 as number[];
        const w1 = v1 as number[];
        const wm0 = (outTangent as number[] | undefined) ?? w0.map((_, i) => w1[i] - w0[i]);
        const wm1 = (inTangent as number[] | undefined) ?? w0.map((_, i) => w1[i] - w0[i]);
        const result = new Array(w0.length);
        for (let i = 0; i < w0.length; i++) {
          result[i] = h00 * w0[i] + h10 * wm0[i] + h01 * w1[i] + h11 * wm1[i];
        }
        return result as T;
      }

      default:
        return this.lerpValues(v0, v1, t);
    }
  }

  /**
   * Clones a value based on value type.
   *
   * @param value - Value to clone
   * @returns Cloned value
   * @private
   */
  private cloneValue(value: T): T {
    switch (this.valueType) {
      case ValueType.NUMBER:
        return value;

      case ValueType.VECTOR3:
        return (value as Vector3).clone() as T;

      case ValueType.QUATERNION:
        return (value as Quaternion).clone() as T;

      case ValueType.WEIGHTS:
        return [...(value as number[])] as T;

      default:
        return value;
    }
  }

  /**
   * Gets default value for value type.
   *
   * @returns Default value
   * @private
   */
  private getDefaultValue(): T {
    switch (this.valueType) {
      case ValueType.NUMBER:
        return 0 as T;

      case ValueType.VECTOR3:
        return Vector3.zero() as T;

      case ValueType.QUATERNION:
        return Quaternion.identity() as T;

      case ValueType.WEIGHTS:
        return [] as T;

      default:
        return undefined as T;
    }
  }

  /**
   * Checks if two values are equal within epsilon tolerance.
   *
   * @param v0 - First value
   * @param v1 - Second value
   * @param epsilon - Tolerance
   * @returns True if values are equal within epsilon
   * @private
   */
  private valuesEqual(v0: T, v1: T, epsilon: number): boolean {
    switch (this.valueType) {
      case ValueType.NUMBER:
        return Math.abs((v0 as number) - (v1 as number)) < epsilon;

      case ValueType.VECTOR3:
        return (v0 as Vector3).equals(v1 as Vector3, epsilon);

      case ValueType.QUATERNION:
        return (v0 as Quaternion).equals(v1 as Quaternion, epsilon);

      case ValueType.WEIGHTS: {
        const w0 = v0 as number[];
        const w1 = v1 as number[];
        if (w0.length !== w1.length) return false;
        for (let i = 0; i < w0.length; i++) {
          if (Math.abs(w0[i] - w1[i]) >= epsilon) return false;
        }
        return true;
      }

      default:
        return false;
    }
  }
}
