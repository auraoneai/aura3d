/**
 * Blend tree for parametric animation blending.
 * Supports hierarchical blending with multiple blend modes.
 * @module animation/BlendTree
 */

import { AnimationClip } from './AnimationClip';
import {
  BlendNode,
  BlendNodeResult,
  ClipBlendNode,
  Blend1DNode,
  Blend2DSimpleNode,
  Blend2DFreeformNode,
  Blend2DCartesianNode,
  BlendDirectNode
} from './BlendNode';
import { ChannelType } from './Animation';

/**
 * Blend tree for parametric animation blending.
 * A blend tree takes parameters and produces a blended animation pose.
 *
 * Features:
 * - 1D linear blending
 * - 2D blending (simple directional, freeform directional, cartesian)
 * - Direct weight control
 * - Nested blend trees
 * - Automatic weight normalization
 *
 * @example
 * ```typescript
 * const blendTree = new BlendTree('locomotion');
 *
 * // Create 1D speed blend
 * const speedBlend = blendTree.create1DBlend('speed_blend', 'speed');
 * speedBlend.addMotion(idleClip, 0);
 * speedBlend.addMotion(walkClip, 1);
 * speedBlend.addMotion(runClip, 2);
 *
 * blendTree.setRootNode(speedBlend);
 *
 * // Set parameters and sample
 * blendTree.setParameter('speed', 1.5);
 * blendTree.update(deltaTime);
 * const pose = blendTree.getPose();
 * ```
 */
export class BlendTree {
  /**
   * Blend tree name.
   */
  readonly name: string;

  /**
   * Root blend node.
   */
  private rootNode: BlendNode | null;

  /**
   * Blend parameters.
   */
  private parameters: Map<string, number>;

  /**
   * Current playback time.
   */
  private time: number;

  /**
   * Playback speed multiplier.
   */
  speed: number;

  /**
   * Whether to normalize blend weights to sum to 1.0.
   */
  normalizeWeights: boolean;

  /**
   * Cached blend result.
   */
  private cachedResult: BlendNodeResult | null;

  /**
   * Whether cache is dirty.
   */
  private isDirty: boolean;

  /**
   * Creates a new blend tree.
   *
   * @param name - Blend tree name
   *
   * @example
   * ```typescript
   * const tree = new BlendTree('movement');
   * ```
   */
  constructor(name: string) {
    this.name = name;
    this.rootNode = null;
    this.parameters = new Map();
    this.time = 0;
    this.speed = 1.0;
    this.normalizeWeights = true;
    this.cachedResult = null;
    this.isDirty = true;
  }

  /**
   * Sets the root blend node.
   *
   * @param node - Root node
   * @returns This tree for chaining
   *
   * @example
   * ```typescript
   * const rootNode = tree.create1DBlend('root', 'speed');
   * tree.setRootNode(rootNode);
   * ```
   */
  setRootNode(node: BlendNode): this {
    this.rootNode = node;
    this.markDirty();
    return this;
  }

  /**
   * Gets the root blend node.
   *
   * @returns Root node or null
   */
  getRootNode(): BlendNode | null {
    return this.rootNode;
  }

  /**
   * Creates a clip blend node.
   *
   * @param name - Node name
   * @param clip - Animation clip
   * @returns Clip node
   *
   * @example
   * ```typescript
   * const idleNode = tree.createClipNode('idle', idleClip);
   * ```
   */
  createClipNode(name: string, clip: AnimationClip): ClipBlendNode {
    return new ClipBlendNode(name, clip);
  }

  /**
   * Creates a 1D linear blend node.
   *
   * @param name - Node name
   * @param parameterName - Parameter to blend on
   * @returns 1D blend node
   *
   * @example
   * ```typescript
   * const speedBlend = tree.create1DBlend('speed', 'moveSpeed');
   * speedBlend.addMotion(walkClip, 1.0);
   * speedBlend.addMotion(runClip, 2.0);
   * ```
   */
  create1DBlend(name: string, parameterName: string): Blend1DNode {
    return new Blend1DNode(name, parameterName);
  }

  /**
   * Creates a 2D simple directional blend node.
   *
   * @param name - Node name
   * @param parameterX - X parameter name
   * @param parameterY - Y parameter name
   * @returns 2D simple blend node
   *
   * @example
   * ```typescript
   * const moveBlend = tree.create2DSimpleBlend('move', 'moveX', 'moveY');
   * moveBlend.addMotion(idleClip, 0, 0);
   * moveBlend.addMotion(walkForwardClip, 0, 1);
   * ```
   */
  create2DSimpleBlend(name: string, parameterX: string, parameterY: string): Blend2DSimpleNode {
    return new Blend2DSimpleNode(name, parameterX, parameterY);
  }

  /**
   * Creates a 2D freeform directional blend node.
   *
   * @param name - Node name
   * @param parameterX - X parameter name
   * @param parameterY - Y parameter name
   * @returns 2D freeform blend node
   *
   * @example
   * ```typescript
   * const moveBlend = tree.create2DFreeformBlend('move', 'velX', 'velY');
   * moveBlend.addMotion(walkClip, 0, 1);
   * moveBlend.addMotion(runClip, 0, 2);
   * ```
   */
  create2DFreeformBlend(name: string, parameterX: string, parameterY: string): Blend2DFreeformNode {
    return new Blend2DFreeformNode(name, parameterX, parameterY);
  }

  /**
   * Creates a 2D cartesian blend node.
   *
   * @param name - Node name
   * @param parameterX - X parameter name
   * @param parameterY - Y parameter name
   * @returns 2D cartesian blend node
   *
   * @example
   * ```typescript
   * const aimBlend = tree.create2DCartesianBlend('aim', 'aimX', 'aimY');
   * aimBlend.addMotion(aimCenterClip, 0, 0);
   * aimBlend.addMotion(aimUpClip, 0, 1);
   * ```
   */
  create2DCartesianBlend(name: string, parameterX: string, parameterY: string): Blend2DCartesianNode {
    return new Blend2DCartesianNode(name, parameterX, parameterY);
  }

  /**
   * Creates a direct blend node.
   *
   * @param name - Node name
   * @returns Direct blend node
   *
   * @example
   * ```typescript
   * const directBlend = tree.createDirectBlend('layers');
   * directBlend.addMotion(baseClip, 'baseWeight');
   * directBlend.addMotion(additiveClip, 'additiveWeight');
   * ```
   */
  createDirectBlend(name: string): BlendDirectNode {
    return new BlendDirectNode(name);
  }

  /**
   * Sets a blend parameter value.
   *
   * @param name - Parameter name
   * @param value - Parameter value
   * @returns This tree for chaining
   *
   * @example
   * ```typescript
   * tree.setParameter('speed', 1.5);
   * tree.setParameter('direction', 0.8);
   * ```
   */
  setParameter(name: string, value: number): this {
    const currentValue = this.parameters.get(name);
    if (currentValue !== value) {
      this.parameters.set(name, value);
      this.markDirty();
    }
    return this;
  }

  /**
   * Gets a blend parameter value.
   *
   * @param name - Parameter name
   * @returns Parameter value or 0 if not set
   *
   * @example
   * ```typescript
   * const speed = tree.getParameter('speed');
   * ```
   */
  getParameter(name: string): number {
    return this.parameters.get(name) ?? 0;
  }

  /**
   * Sets multiple parameters at once.
   *
   * @param params - Parameter map
   * @returns This tree for chaining
   *
   * @example
   * ```typescript
   * tree.setParameters(new Map([
   *   ['speed', 1.5],
   *   ['direction', 0.8]
   * ]));
   * ```
   */
  setParameters(params: Map<string, number>): this {
    for (const [name, value] of params) {
      this.setParameter(name, value);
    }
    return this;
  }

  /**
   * Gets all parameters.
   *
   * @returns Parameter map
   *
   * @example
   * ```typescript
   * const params = tree.getParameters();
   * ```
   */
  getParameters(): ReadonlyMap<string, number> {
    return this.parameters;
  }

  /**
   * Updates the blend tree.
   *
   * @param deltaTime - Time delta in seconds
   *
   * @example
   * ```typescript
   * tree.update(deltaTime);
   * ```
   */
  update(deltaTime: number): void {
    this.time += deltaTime * this.speed;

    if (this.rootNode) {
      this.rootNode.update(deltaTime * this.speed);
    }

    this.markDirty();
  }

  /**
   * Evaluates the blend tree and returns weighted clips.
   *
   * @returns Blend result
   *
   * @example
   * ```typescript
   * const result = tree.evaluate();
   * for (const { clip, weight, time } of result.clips) {
   *   console.log(`${clip.name}: ${weight}`);
   * }
   * ```
   */
  evaluate(): BlendNodeResult {
    if (!this.isDirty && this.cachedResult) {
      return this.cachedResult;
    }

    if (!this.rootNode) {
      this.cachedResult = { clips: [], totalWeight: 0 };
      this.isDirty = false;
      return this.cachedResult;
    }

    let result = this.rootNode.evaluate(this.parameters);

    if (this.normalizeWeights && result.totalWeight > 0 && Math.abs(result.totalWeight - 1.0) > 0.001) {
      for (const clipData of result.clips) {
        clipData.weight /= result.totalWeight;
      }
      result.totalWeight = 1.0;
    }

    this.cachedResult = result;
    this.isDirty = false;

    return result;
  }

  /**
   * Gets the blended animation pose.
   * Returns a map of target:type to blended values.
   *
   * @returns Blended pose data
   *
   * @example
   * ```typescript
   * const pose = tree.getPose();
   * for (const [key, value] of pose) {
   *   const [target, type] = key.split(':');
   *   applyToSkeleton(target, type, value);
   * }
   * ```
   */
  getPose(): Map<string, any> {
    const result = this.evaluate();
    const pose = new Map<string, any>();

    if (result.clips.length === 0) {
      return pose;
    }

    for (const { clip, weight, time } of result.clips) {
      if (weight <= 0.001) {
        continue;
      }

      const samples = clip.sampleAll(time);

      for (const [key, value] of samples) {
        const [target, typeStr] = key.split(':');
        const type = typeStr as ChannelType;

        if (!pose.has(key)) {
          pose.set(key, this.scaleValue(value, weight, type));
        } else {
          const existing = pose.get(key);
          pose.set(key, this.blendValues(existing, value, weight, type));
        }
      }
    }

    return pose;
  }

  /**
   * Gets all animation clips used in this blend tree.
   *
   * @returns Array of clips
   *
   * @example
   * ```typescript
   * const clips = tree.getClips();
   * console.log(`Tree uses ${clips.length} clips`);
   * ```
   */
  getClips(): AnimationClip[] {
    if (!this.rootNode) {
      return [];
    }
    return this.rootNode.getClips();
  }

  /**
   * Gets the duration of the longest clip in the tree.
   *
   * @returns Duration in seconds
   *
   * @example
   * ```typescript
   * const duration = tree.getDuration();
   * ```
   */
  getDuration(): number {
    if (!this.rootNode) {
      return 0;
    }
    return this.rootNode.getDuration();
  }

  /**
   * Resets the blend tree to initial state.
   *
   * @example
   * ```typescript
   * tree.reset();
   * ```
   */
  reset(): void {
    this.time = 0;
    if (this.rootNode) {
      this.rootNode.reset();
    }
    this.markDirty();
  }

  /**
   * Marks the cached result as dirty.
   * @private
   */
  private markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Scales a value by weight.
   *
   * @param value - Value to scale
   * @param weight - Weight factor
   * @param type - Channel type
   * @returns Scaled value
   * @private
   */
  private scaleValue(value: any, weight: number, type: ChannelType): any {
    if (weight === 1.0) {
      return value;
    }

    switch (type) {
      case ChannelType.POSITION:
      case ChannelType.SCALE:
        if (value && typeof value.scale === 'function') {
          return value.scale(weight);
        }
        return value;

      case ChannelType.ROTATION: {
        if (value && typeof value.x === 'number') {
          const identity = { x: 0, y: 0, z: 0, w: 1 };
          return this.slerpQuaternion(identity, value, weight);
        }
        return value;
      }

      case ChannelType.WEIGHTS:
        if (Array.isArray(value)) {
          return value.map((w: number) => w * weight);
        }
        return value;

      default:
        return value;
    }
  }

  /**
   * Blends two values.
   *
   * @param a - First value
   * @param b - Second value
   * @param weight - Blend weight for b
   * @param type - Channel type
   * @returns Blended value
   * @private
   */
  private blendValues(a: any, b: any, weight: number, type: ChannelType): any {
    if (weight === 0) {
      return a;
    }

    if (weight === 1.0) {
      return b;
    }

    switch (type) {
      case ChannelType.POSITION:
      case ChannelType.SCALE:
        if (a && typeof a.lerp === 'function') {
          return a.lerp(b, weight);
        }
        return b;

      case ChannelType.ROTATION:
        if (a && typeof a.x === 'number') {
          return this.slerpQuaternion(a, b, weight);
        }
        return b;

      case ChannelType.WEIGHTS: {
        if (Array.isArray(a) && Array.isArray(b)) {
          const result = [];
          for (let i = 0; i < Math.min(a.length, b.length); i++) {
            result[i] = a[i] * (1 - weight) + b[i] * weight;
          }
          return result;
        }
        return b;
      }

      default:
        return weight < 0.5 ? a : b;
    }
  }

  /**
   * Spherical linear interpolation for quaternions.
   *
   * @param a - Start quaternion
   * @param b - End quaternion
   * @param t - Interpolation factor
   * @returns Interpolated quaternion
   * @private
   */
  private slerpQuaternion(a: any, b: any, t: number): any {
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (dot < 0) {
      dot = -dot;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }

    if (dot > 0.9995) {
      return {
        x: a.x + (bx - a.x) * t,
        y: a.y + (by - a.y) * t,
        z: a.z + (bz - a.z) * t,
        w: a.w + (bw - a.w) * t
      };
    }

    const theta = Math.acos(Math.min(dot, 1));
    const sinTheta = Math.sin(theta);
    const w0 = Math.sin((1 - t) * theta) / sinTheta;
    const w1 = Math.sin(t * theta) / sinTheta;

    return {
      x: a.x * w0 + bx * w1,
      y: a.y * w0 + by * w1,
      z: a.z * w0 + bz * w1,
      w: a.w * w0 + bw * w1
    };
  }
}
