/**
 * Blend tree node types and base classes.
 * Supports hierarchical blending with multiple node types.
 * @module animation/BlendNode
 */

import { AnimationClip } from './AnimationClip';
import { Vector2 } from '../math/Vector2';

/**
 * Type of blend node.
 */
export enum BlendNodeType {
  /** Single animation clip */
  CLIP = 'clip',
  /** 1D linear blend between clips */
  BLEND_1D = 'blend_1d',
  /** 2D simple directional blend */
  BLEND_2D_SIMPLE = 'blend_2d_simple',
  /** 2D freeform directional blend */
  BLEND_2D_FREEFORM = 'blend_2d_freeform',
  /** 2D freeform cartesian blend */
  BLEND_2D_CARTESIAN = 'blend_2d_cartesian',
  /** Direct weight control */
  BLEND_DIRECT = 'blend_direct'
}

/**
 * Result of evaluating a blend node.
 * Contains weighted clips ready for blending.
 */
export interface BlendNodeResult {
  /** Clips with their blend weights */
  clips: Array<{ clip: AnimationClip; weight: number; time: number }>;
  /** Total weight (should be normalized to 1.0) */
  totalWeight: number;
}

/**
 * Base class for blend tree nodes.
 * All blend node types inherit from this.
 *
 * @example
 * ```typescript
 * class CustomBlendNode extends BlendNode {
 *   evaluate(params: Map<string, number>): BlendNodeResult {
 *     // Custom blending logic
 *   }
 * }
 * ```
 */
export abstract class BlendNode {
  /**
   * Node name for identification.
   */
  readonly name: string;

  /**
   * Node type.
   */
  readonly type: BlendNodeType;

  /**
   * Current playback time.
   */
  protected time: number;

  /**
   * Playback speed multiplier.
   */
  speed: number;

  /**
   * Creates a new blend node.
   *
   * @param name - Node name
   * @param type - Node type
   */
  constructor(name: string, type: BlendNodeType) {
    this.name = name;
    this.type = type;
    this.time = 0;
    this.speed = 1.0;
  }

  /**
   * Evaluates this node with given parameters.
   *
   * @param params - Blend parameters
   * @returns Blend result with weighted clips
   */
  abstract evaluate(params: Map<string, number>): BlendNodeResult;

  /**
   * Updates the node's internal time.
   *
   * @param deltaTime - Time delta in seconds
   */
  update(deltaTime: number): void {
    this.time += deltaTime * this.speed;
  }

  /**
   * Sets the playback time.
   *
   * @param time - Time in seconds
   */
  setTime(time: number): void {
    this.time = time;
  }

  /**
   * Gets the current playback time.
   *
   * @returns Time in seconds
   */
  getTime(): number {
    return this.time;
  }

  /**
   * Resets the node to initial state.
   */
  reset(): void {
    this.time = 0;
  }

  /**
   * Gets all animation clips used by this node (including children).
   *
   * @returns Array of clips
   */
  abstract getClips(): AnimationClip[];

  /**
   * Gets the maximum duration of all clips in this node.
   *
   * @returns Duration in seconds
   */
  getDuration(): number {
    const clips = this.getClips();
    if (clips.length === 0) {
      return 0;
    }
    return Math.max(...clips.map(c => c.duration));
  }
}

/**
 * Clip node containing a single animation.
 *
 * @example
 * ```typescript
 * const walkNode = new ClipBlendNode('walk', walkClip);
 * const result = walkNode.evaluate(params);
 * ```
 */
export class ClipBlendNode extends BlendNode {
  /**
   * Animation clip for this node.
   */
  readonly clip: AnimationClip;

  /**
   * Creates a clip blend node.
   *
   * @param name - Node name
   * @param clip - Animation clip
   *
   * @example
   * ```typescript
   * const node = new ClipBlendNode('idle', idleClip);
   * ```
   */
  constructor(name: string, clip: AnimationClip) {
    super(name, BlendNodeType.CLIP);
    this.clip = clip;
  }

  /**
   * Evaluates this clip node.
   *
   * @param params - Blend parameters (unused for clip nodes)
   * @returns Blend result with single clip at weight 1.0
   */
  evaluate(params: Map<string, number>): BlendNodeResult {
    const normalizedTime = this.clip.duration > 0
      ? (this.time % this.clip.duration) / this.clip.duration
      : 0;

    return {
      clips: [{
        clip: this.clip,
        weight: 1.0,
        time: normalizedTime * this.clip.duration
      }],
      totalWeight: 1.0
    };
  }

  /**
   * Gets clips (returns single clip).
   *
   * @returns Array with single clip
   */
  getClips(): AnimationClip[] {
    return [this.clip];
  }
}

/**
 * Motion field for 1D blending.
 * Associates a clip with a threshold value.
 */
export interface MotionField1D {
  /** Animation clip */
  clip: AnimationClip;
  /** Threshold value for this motion */
  threshold: number;
}

/**
 * 1D linear blend node.
 * Blends between clips based on a single parameter.
 *
 * @example
 * ```typescript
 * const speedBlend = new Blend1DNode('locomotion', 'speed');
 * speedBlend.addMotion(idleClip, 0);
 * speedBlend.addMotion(walkClip, 1);
 * speedBlend.addMotion(runClip, 2);
 *
 * const result = speedBlend.evaluate(new Map([['speed', 1.5]]));
 * // Blends 50% walk + 50% run
 * ```
 */
export class Blend1DNode extends BlendNode {
  /**
   * Parameter name to blend on.
   */
  readonly parameterName: string;

  /**
   * Motions sorted by threshold.
   */
  private motions: MotionField1D[];

  /**
   * Creates a 1D blend node.
   *
   * @param name - Node name
   * @param parameterName - Parameter to blend on
   *
   * @example
   * ```typescript
   * const node = new Blend1DNode('speed_blend', 'moveSpeed');
   * ```
   */
  constructor(name: string, parameterName: string) {
    super(name, BlendNodeType.BLEND_1D);
    this.parameterName = parameterName;
    this.motions = [];
  }

  /**
   * Adds a motion at a threshold value.
   *
   * @param clip - Animation clip
   * @param threshold - Threshold value
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * node.addMotion(walkClip, 1.0);
   * ```
   */
  addMotion(clip: AnimationClip, threshold: number): this {
    this.motions.push({ clip, threshold });
    this.motions.sort((a, b) => a.threshold - b.threshold);
    return this;
  }

  /**
   * Removes a motion by clip.
   *
   * @param clip - Clip to remove
   * @returns True if removed
   */
  removeMotion(clip: AnimationClip): boolean {
    const index = this.motions.findIndex(m => m.clip === clip);
    if (index !== -1) {
      this.motions.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Evaluates the 1D blend.
   *
   * @param params - Blend parameters
   * @returns Blend result
   */
  evaluate(params: Map<string, number>): BlendNodeResult {
    if (this.motions.length === 0) {
      return { clips: [], totalWeight: 0 };
    }

    if (this.motions.length === 1) {
      const motion = this.motions[0];
      const normalizedTime = motion.clip.duration > 0
        ? (this.time % motion.clip.duration) / motion.clip.duration
        : 0;

      return {
        clips: [{
          clip: motion.clip,
          weight: 1.0,
          time: normalizedTime * motion.clip.duration
        }],
        totalWeight: 1.0
      };
    }

    const value = params.get(this.parameterName) ?? 0;

    if (value <= this.motions[0].threshold) {
      const motion = this.motions[0];
      const normalizedTime = motion.clip.duration > 0
        ? (this.time % motion.clip.duration) / motion.clip.duration
        : 0;

      return {
        clips: [{
          clip: motion.clip,
          weight: 1.0,
          time: normalizedTime * motion.clip.duration
        }],
        totalWeight: 1.0
      };
    }

    const lastMotion = this.motions[this.motions.length - 1];
    if (value >= lastMotion.threshold) {
      const normalizedTime = lastMotion.clip.duration > 0
        ? (this.time % lastMotion.clip.duration) / lastMotion.clip.duration
        : 0;

      return {
        clips: [{
          clip: lastMotion.clip,
          weight: 1.0,
          time: normalizedTime * lastMotion.clip.duration
        }],
        totalWeight: 1.0
      };
    }

    for (let i = 0; i < this.motions.length - 1; i++) {
      const motionA = this.motions[i];
      const motionB = this.motions[i + 1];

      if (value >= motionA.threshold && value <= motionB.threshold) {
        const range = motionB.threshold - motionA.threshold;
        const t = range > 0 ? (value - motionA.threshold) / range : 0;

        const weightA = 1.0 - t;
        const weightB = t;

        const timeA = motionA.clip.duration > 0
          ? (this.time % motionA.clip.duration) / motionA.clip.duration
          : 0;
        const timeB = motionB.clip.duration > 0
          ? (this.time % motionB.clip.duration) / motionB.clip.duration
          : 0;

        return {
          clips: [
            { clip: motionA.clip, weight: weightA, time: timeA * motionA.clip.duration },
            { clip: motionB.clip, weight: weightB, time: timeB * motionB.clip.duration }
          ],
          totalWeight: weightA + weightB
        };
      }
    }

    return { clips: [], totalWeight: 0 };
  }

  /**
   * Gets all clips in this blend.
   *
   * @returns Array of clips
   */
  getClips(): AnimationClip[] {
    return this.motions.map(m => m.clip);
  }
}

/**
 * Motion field for 2D blending.
 * Associates a clip with a 2D position.
 */
export interface MotionField2D {
  /** Animation clip */
  clip: AnimationClip;
  /** Position in 2D blend space */
  position: Vector2;
}

/**
 * 2D blend node base class.
 * Blends between clips based on two parameters.
 */
export abstract class Blend2DNode extends BlendNode {
  /**
   * First parameter name (X axis).
   */
  readonly parameterX: string;

  /**
   * Second parameter name (Y axis).
   */
  readonly parameterY: string;

  /**
   * Motions positioned in 2D space.
   */
  protected motions: MotionField2D[];

  /**
   * Creates a 2D blend node.
   *
   * @param name - Node name
   * @param type - Blend node type
   * @param parameterX - X parameter name
   * @param parameterY - Y parameter name
   */
  constructor(name: string, type: BlendNodeType, parameterX: string, parameterY: string) {
    super(name, type);
    this.parameterX = parameterX;
    this.parameterY = parameterY;
    this.motions = [];
  }

  /**
   * Adds a motion at a 2D position.
   *
   * @param clip - Animation clip
   * @param x - X position
   * @param y - Y position
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * node.addMotion(strafeLeftClip, -1, 0);
   * node.addMotion(forwardClip, 0, 1);
   * node.addMotion(strafeRightClip, 1, 0);
   * ```
   */
  addMotion(clip: AnimationClip, x: number, y: number): this {
    this.motions.push({
      clip,
      position: new Vector2(x, y)
    });
    return this;
  }

  /**
   * Removes a motion by clip.
   *
   * @param clip - Clip to remove
   * @returns True if removed
   */
  removeMotion(clip: AnimationClip): boolean {
    const index = this.motions.findIndex(m => m.clip === clip);
    if (index !== -1) {
      this.motions.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Gets all clips in this blend.
   *
   * @returns Array of clips
   */
  getClips(): AnimationClip[] {
    return this.motions.map(m => m.clip);
  }

  /**
   * Normalizes blend weights to sum to 1.0.
   *
   * @param weights - Weights to normalize
   * @returns Normalized weights
   * @protected
   */
  protected normalizeWeights(weights: number[]): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      return weights.map(w => w / sum);
    }
    return weights;
  }
}

/**
 * 2D simple directional blend node.
 * Uses gradient band interpolation (best for directional locomotion).
 *
 * @example
 * ```typescript
 * const movement = new Blend2DSimpleNode('movement', 'moveX', 'moveY');
 * movement.addMotion(idleClip, 0, 0);
 * movement.addMotion(walkForwardClip, 0, 1);
 * movement.addMotion(strafeLeftClip, -1, 0);
 * movement.addMotion(strafeRightClip, 1, 0);
 * ```
 */
export class Blend2DSimpleNode extends Blend2DNode {
  /**
   * Creates a 2D simple directional blend node.
   *
   * @param name - Node name
   * @param parameterX - X parameter name
   * @param parameterY - Y parameter name
   */
  constructor(name: string, parameterX: string, parameterY: string) {
    super(name, BlendNodeType.BLEND_2D_SIMPLE, parameterX, parameterY);
  }

  /**
   * Evaluates the 2D simple blend.
   *
   * @param params - Blend parameters
   * @returns Blend result
   */
  evaluate(params: Map<string, number>): BlendNodeResult {
    if (this.motions.length === 0) {
      return { clips: [], totalWeight: 0 };
    }

    const x = params.get(this.parameterX) ?? 0;
    const y = params.get(this.parameterY) ?? 0;
    const inputPos = new Vector2(x, y);

    const weights: number[] = [];
    const clips: Array<{ clip: AnimationClip; weight: number; time: number }> = [];

    for (const motion of this.motions) {
      const distance = inputPos.distanceTo(motion.position);
      const weight = distance > 0 ? 1.0 / distance : 1000.0;
      weights.push(weight);
    }

    const normalizedWeights = this.normalizeWeights(weights);

    for (let i = 0; i < this.motions.length; i++) {
      const weight = normalizedWeights[i];
      if (weight > 0.001) {
        const motion = this.motions[i];
        const normalizedTime = motion.clip.duration > 0
          ? (this.time % motion.clip.duration) / motion.clip.duration
          : 0;

        clips.push({
          clip: motion.clip,
          weight,
          time: normalizedTime * motion.clip.duration
        });
      }
    }

    return {
      clips,
      totalWeight: clips.reduce((sum, c) => sum + c.weight, 0)
    };
  }
}

/**
 * 2D freeform directional blend node.
 * Uses Delaunay triangulation for smooth blending.
 *
 * @example
 * ```typescript
 * const movement = new Blend2DFreeformNode('movement', 'velocityX', 'velocityY');
 * movement.addMotion(idleClip, 0, 0);
 * movement.addMotion(walkClip, 0, 1);
 * movement.addMotion(runClip, 0, 2);
 * ```
 */
export class Blend2DFreeformNode extends Blend2DNode {
  /**
   * Creates a 2D freeform directional blend node.
   *
   * @param name - Node name
   * @param parameterX - X parameter name
   * @param parameterY - Y parameter name
   */
  constructor(name: string, parameterX: string, parameterY: string) {
    super(name, BlendNodeType.BLEND_2D_FREEFORM, parameterX, parameterY);
  }

  /**
   * Evaluates the 2D freeform blend using barycentric coordinates.
   *
   * @param params - Blend parameters
   * @returns Blend result
   */
  evaluate(params: Map<string, number>): BlendNodeResult {
    if (this.motions.length === 0) {
      return { clips: [], totalWeight: 0 };
    }

    if (this.motions.length === 1) {
      const motion = this.motions[0];
      const normalizedTime = motion.clip.duration > 0
        ? (this.time % motion.clip.duration) / motion.clip.duration
        : 0;

      return {
        clips: [{
          clip: motion.clip,
          weight: 1.0,
          time: normalizedTime * motion.clip.duration
        }],
        totalWeight: 1.0
      };
    }

    const x = params.get(this.parameterX) ?? 0;
    const y = params.get(this.parameterY) ?? 0;
    const inputPos = new Vector2(x, y);

    const clips: Array<{ clip: AnimationClip; weight: number; time: number }> = [];
    const triangle = this.findContainingTriangle(inputPos);

    if (triangle) {
      const weights = this.computeBarycentricWeights(
        inputPos,
        triangle[0].position,
        triangle[1].position,
        triangle[2].position
      );

      for (let i = 0; i < 3; i++) {
        if (weights[i] > 0.001) {
          const motion = triangle[i];
          const normalizedTime = motion.clip.duration > 0
            ? (this.time % motion.clip.duration) / motion.clip.duration
            : 0;

          clips.push({
            clip: motion.clip,
            weight: weights[i],
            time: normalizedTime * motion.clip.duration
          });
        }
      }
    } else {
      const closest = this.findClosestMotion(inputPos);
      const normalizedTime = closest.clip.duration > 0
        ? (this.time % closest.clip.duration) / closest.clip.duration
        : 0;

      clips.push({
        clip: closest.clip,
        weight: 1.0,
        time: normalizedTime * closest.clip.duration
      });
    }

    return {
      clips,
      totalWeight: clips.reduce((sum, c) => sum + c.weight, 0)
    };
  }

  /**
   * Finds the triangle containing the input point.
   *
   * @param point - Input point
   * @returns Triangle vertices or null
   * @private
   */
  private findContainingTriangle(point: Vector2): [MotionField2D, MotionField2D, MotionField2D] | null {
    for (let i = 0; i < this.motions.length; i++) {
      for (let j = i + 1; j < this.motions.length; j++) {
        for (let k = j + 1; k < this.motions.length; k++) {
          const a = this.motions[i];
          const b = this.motions[j];
          const c = this.motions[k];

          if (this.isPointInTriangle(point, a.position, b.position, c.position)) {
            return [a, b, c];
          }
        }
      }
    }
    return null;
  }

  /**
   * Checks if point is inside triangle.
   *
   * @param p - Point to test
   * @param a - Triangle vertex A
   * @param b - Triangle vertex B
   * @param c - Triangle vertex C
   * @returns True if inside
   * @private
   */
  private isPointInTriangle(p: Vector2, a: Vector2, b: Vector2, c: Vector2): boolean {
    const v0x = c.x - a.x;
    const v0y = c.y - a.y;
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = p.x - a.x;
    const v2y = p.y - a.y;

    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;

    const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    return (u >= 0) && (v >= 0) && (u + v <= 1);
  }

  /**
   * Computes barycentric weights for point in triangle.
   *
   * @param p - Point
   * @param a - Triangle vertex A
   * @param b - Triangle vertex B
   * @param c - Triangle vertex C
   * @returns Barycentric weights [u, v, w]
   * @private
   */
  private computeBarycentricWeights(p: Vector2, a: Vector2, b: Vector2, c: Vector2): [number, number, number] {
    const v0x = b.x - a.x;
    const v0y = b.y - a.y;
    const v1x = c.x - a.x;
    const v1y = c.y - a.y;
    const v2x = p.x - a.x;
    const v2y = p.y - a.y;

    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;

    const denom = dot00 * dot11 - dot01 * dot01;
    if (Math.abs(denom) < 0.0001) {
      return [1, 0, 0];
    }

    const invDenom = 1 / denom;
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    const w = 1 - u - v;

    return [w, u, v];
  }

  /**
   * Finds the closest motion to a point.
   *
   * @param point - Input point
   * @returns Closest motion
   * @private
   */
  private findClosestMotion(point: Vector2): MotionField2D {
    let closest = this.motions[0];
    let minDist = point.distanceTo(closest.position);

    for (let i = 1; i < this.motions.length; i++) {
      const dist = point.distanceTo(this.motions[i].position);
      if (dist < minDist) {
        minDist = dist;
        closest = this.motions[i];
      }
    }

    return closest;
  }
}

/**
 * 2D freeform cartesian blend node.
 * Blends based on 2D cartesian coordinates (best for non-directional blending).
 *
 * @example
 * ```typescript
 * const blend = new Blend2DCartesianNode('aim', 'aimX', 'aimY');
 * blend.addMotion(aimCenterClip, 0, 0);
 * blend.addMotion(aimUpClip, 0, 1);
 * blend.addMotion(aimDownClip, 0, -1);
 * ```
 */
export class Blend2DCartesianNode extends Blend2DFreeformNode {
  /**
   * Creates a 2D cartesian blend node.
   *
   * @param name - Node name
   * @param parameterX - X parameter name
   * @param parameterY - Y parameter name
   */
  constructor(name: string, parameterX: string, parameterY: string) {
    super(name, parameterX, parameterY);
    (this as any).type = BlendNodeType.BLEND_2D_CARTESIAN;
  }
}

/**
 * Direct blend node with manual weight control.
 * Each clip has its weight directly controlled by a parameter.
 *
 * @example
 * ```typescript
 * const blend = new BlendDirectNode('layers');
 * blend.addMotion(baseClip, 'baseWeight');
 * blend.addMotion(additive1Clip, 'additive1Weight');
 * blend.addMotion(additive2Clip, 'additive2Weight');
 * ```
 */
export class BlendDirectNode extends BlendNode {
  /**
   * Motions with parameter names for weights.
   */
  private motions: Array<{ clip: AnimationClip; parameterName: string }>;

  /**
   * Creates a direct blend node.
   *
   * @param name - Node name
   *
   * @example
   * ```typescript
   * const node = new BlendDirectNode('direct_blend');
   * ```
   */
  constructor(name: string) {
    super(name, BlendNodeType.BLEND_DIRECT);
    this.motions = [];
  }

  /**
   * Adds a motion with parameter name for weight.
   *
   * @param clip - Animation clip
   * @param parameterName - Parameter name for weight
   * @returns This node for chaining
   *
   * @example
   * ```typescript
   * node.addMotion(clip, 'clipWeight');
   * ```
   */
  addMotion(clip: AnimationClip, parameterName: string): this {
    this.motions.push({ clip, parameterName });
    return this;
  }

  /**
   * Removes a motion by clip.
   *
   * @param clip - Clip to remove
   * @returns True if removed
   */
  removeMotion(clip: AnimationClip): boolean {
    const index = this.motions.findIndex(m => m.clip === clip);
    if (index !== -1) {
      this.motions.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Evaluates the direct blend.
   *
   * @param params - Blend parameters
   * @returns Blend result
   */
  evaluate(params: Map<string, number>): BlendNodeResult {
    const clips: Array<{ clip: AnimationClip; weight: number; time: number }> = [];
    let totalWeight = 0;

    for (const motion of this.motions) {
      const weight = params.get(motion.parameterName) ?? 0;

      if (weight > 0.001) {
        const normalizedTime = motion.clip.duration > 0
          ? (this.time % motion.clip.duration) / motion.clip.duration
          : 0;

        clips.push({
          clip: motion.clip,
          weight,
          time: normalizedTime * motion.clip.duration
        });

        totalWeight += weight;
      }
    }

    return { clips, totalWeight };
  }

  /**
   * Gets all clips in this blend.
   *
   * @returns Array of clips
   */
  getClips(): AnimationClip[] {
    return this.motions.map(m => m.clip);
  }
}
