/**
 * Animation layering system for additive and override animation blending.
 * Enables partial body animation and animation composition.
 * @module animation/AnimationLayer
 */

import { AnimationClip } from './AnimationClip';
import { BlendTree } from './BlendTree';
import { ChannelType } from './Animation';

/**
 * Layer blending mode.
 */
export enum LayerBlendMode {
  /** Override mode - replaces base layer */
  OVERRIDE = 'override',
  /** Additive mode - adds to base layer */
  ADDITIVE = 'additive'
}

/**
 * Avatar mask for selective bone animation.
 * Defines which bones are affected by a layer.
 *
 * @example
 * ```typescript
 * const upperBodyMask = new AvatarMask();
 * upperBodyMask.addBone('spine');
 * upperBodyMask.addBone('arm_L');
 * upperBodyMask.addBone('arm_R');
 * upperBodyMask.addBone('hand_L');
 * upperBodyMask.addBone('hand_R');
 * ```
 */
export class AvatarMask {
  /**
   * Mask name.
   */
  readonly name: string;

  /**
   * Set of included bone names.
   */
  private includedBones: Set<string>;

  /**
   * Set of excluded bone names.
   */
  private excludedBones: Set<string>;

  /**
   * Whether to include all bones by default.
   */
  includeAll: boolean;

  /**
   * Creates a new avatar mask.
   *
   * @param name - Mask name
   * @param includeAll - Include all bones by default
   *
   * @example
   * ```typescript
   * const mask = new AvatarMask('upper_body', false);
   * ```
   */
  constructor(name: string = 'mask', includeAll: boolean = false) {
    this.name = name;
    this.includedBones = new Set();
    this.excludedBones = new Set();
    this.includeAll = includeAll;
  }

  /**
   * Adds a bone to the mask.
   *
   * @param boneName - Bone name or pattern
   * @returns This mask for chaining
   *
   * @example
   * ```typescript
   * mask.addBone('spine');
   * mask.addBone('arm_L');
   * ```
   */
  addBone(boneName: string): this {
    this.includedBones.add(boneName);
    this.excludedBones.delete(boneName);
    return this;
  }

  /**
   * Removes a bone from the mask.
   *
   * @param boneName - Bone name
   * @returns This mask for chaining
   *
   * @example
   * ```typescript
   * mask.removeBone('leg_L');
   * ```
   */
  removeBone(boneName: string): this {
    this.excludedBones.add(boneName);
    this.includedBones.delete(boneName);
    return this;
  }

  /**
   * Checks if a bone is included in the mask.
   *
   * @param boneName - Bone name to test
   * @returns True if bone is included
   *
   * @example
   * ```typescript
   * if (mask.isBoneIncluded('arm_L')) {
   *   // Apply animation to arm
   * }
   * ```
   */
  isBoneIncluded(boneName: string): boolean {
    if (this.excludedBones.has(boneName)) {
      return false;
    }

    if (this.includedBones.has(boneName)) {
      return true;
    }

    if (this.includeAll) {
      return true;
    }

    for (const pattern of this.includedBones) {
      if (this.matchesPattern(boneName, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Gets the weight for a bone (0 = excluded, 1 = included).
   *
   * @param boneName - Bone name
   * @returns Weight [0, 1]
   *
   * @example
   * ```typescript
   * const weight = mask.getBoneWeight('spine');
   * ```
   */
  getBoneWeight(boneName: string): number {
    return this.isBoneIncluded(boneName) ? 1.0 : 0.0;
  }

  /**
   * Clears all bone inclusions/exclusions.
   *
   * @example
   * ```typescript
   * mask.clear();
   * ```
   */
  clear(): void {
    this.includedBones.clear();
    this.excludedBones.clear();
  }

  /**
   * Clones this mask.
   *
   * @returns Cloned mask
   *
   * @example
   * ```typescript
   * const maskCopy = mask.clone();
   * ```
   */
  clone(): AvatarMask {
    const cloned = new AvatarMask(this.name, this.includeAll);
    cloned.includedBones = new Set(this.includedBones);
    cloned.excludedBones = new Set(this.excludedBones);
    return cloned;
  }

  /**
   * Matches bone name against pattern.
   * Supports wildcards: * (any characters), ? (single character).
   *
   * @param boneName - Bone name
   * @param pattern - Pattern to match
   * @returns True if matches
   * @private
   */
  private matchesPattern(boneName: string, pattern: string): boolean {
    if (!pattern.includes('*') && !pattern.includes('?')) {
      return boneName === pattern;
    }

    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(boneName);
  }
}

/**
 * Animation layer with blending mode and masking.
 * Layers can override or add to base animations with selective bone control.
 *
 * @example
 * ```typescript
 * const baseLayer = new AnimationLayer('base', baseClip);
 * baseLayer.weight = 1.0;
 *
 * const upperBodyLayer = new AnimationLayer(
 *   'upper_body',
 *   reloadClip,
 *   LayerBlendMode.OVERRIDE
 * );
 * upperBodyLayer.setMask(upperBodyMask);
 * upperBodyLayer.weight = 1.0;
 * ```
 */
export class AnimationLayer {
  /**
   * Layer name.
   */
  readonly name: string;

  /**
   * Animation clip or blend tree.
   */
  private source: AnimationClip | BlendTree;

  /**
   * Layer blend mode.
   */
  blendMode: LayerBlendMode;

  /**
   * Layer weight [0, 1].
   */
  weight: number;

  /**
   * Avatar mask for selective blending.
   */
  private mask: AvatarMask | null;

  /**
   * Whether this layer is enabled.
   */
  enabled: boolean;

  /**
   * Current playback time.
   */
  private time: number;

  /**
   * Playback speed multiplier.
   */
  speed: number;

  /**
   * Creates a new animation layer.
   *
   * @param name - Layer name
   * @param source - Animation clip or blend tree
   * @param blendMode - Blend mode (default: override)
   *
   * @example
   * ```typescript
   * const layer = new AnimationLayer('walk', walkClip);
   * ```
   */
  constructor(
    name: string,
    source: AnimationClip | BlendTree,
    blendMode: LayerBlendMode = LayerBlendMode.OVERRIDE
  ) {
    this.name = name;
    this.source = source;
    this.blendMode = blendMode;
    this.weight = 1.0;
    this.mask = null;
    this.enabled = true;
    this.time = 0;
    this.speed = 1.0;
  }

  /**
   * Sets the animation source.
   *
   * @param source - Clip or blend tree
   * @returns This layer for chaining
   *
   * @example
   * ```typescript
   * layer.setSource(runClip);
   * ```
   */
  setSource(source: AnimationClip | BlendTree): this {
    this.source = source;
    return this;
  }

  /**
   * Gets the animation source.
   *
   * @returns Clip or blend tree
   */
  getSource(): AnimationClip | BlendTree {
    return this.source;
  }

  /**
   * Sets the avatar mask.
   *
   * @param mask - Avatar mask or null for no masking
   * @returns This layer for chaining
   *
   * @example
   * ```typescript
   * layer.setMask(upperBodyMask);
   * ```
   */
  setMask(mask: AvatarMask | null): this {
    this.mask = mask;
    return this;
  }

  /**
   * Gets the avatar mask.
   *
   * @returns Avatar mask or null
   */
  getMask(): AvatarMask | null {
    return this.mask;
  }

  /**
   * Updates the layer.
   *
   * @param deltaTime - Time delta in seconds
   *
   * @example
   * ```typescript
   * layer.update(deltaTime);
   * ```
   */
  update(deltaTime: number): void {
    if (!this.enabled || this.weight <= 0) {
      return;
    }

    const scaledDelta = deltaTime * this.speed;
    this.time += scaledDelta;

    if (this.source instanceof BlendTree) {
      this.source.update(scaledDelta);
    }
  }

  /**
   * Samples the layer animation at current time.
   * Returns a map of target:type to sampled values.
   *
   * @returns Pose data
   *
   * @example
   * ```typescript
   * const pose = layer.sample();
   * ```
   */
  sample(): Map<string, any> {
    if (!this.enabled || this.weight <= 0) {
      return new Map();
    }

    let pose: Map<string, any>;

    if (this.source instanceof BlendTree) {
      pose = this.source.getPose();
    } else {
      const duration = this.source.duration;
      const sampleTime = duration > 0 ? this.time % duration : 0;
      pose = this.source.sampleAll(sampleTime);
    }

    if (this.mask) {
      const filtered = new Map<string, any>();

      for (const [key, value] of pose) {
        const [target] = key.split(':');
        if (this.mask.isBoneIncluded(target)) {
          filtered.set(key, value);
        }
      }

      return filtered;
    }

    return pose;
  }

  /**
   * Resets the layer to initial state.
   *
   * @example
   * ```typescript
   * layer.reset();
   * ```
   */
  reset(): void {
    this.time = 0;
    if (this.source instanceof BlendTree) {
      this.source.reset();
    }
  }

  /**
   * Sets the playback time.
   *
   * @param time - Time in seconds
   *
   * @example
   * ```typescript
   * layer.setTime(0.5);
   * ```
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
   * Gets the layer duration.
   *
   * @returns Duration in seconds
   */
  getDuration(): number {
    if (this.source instanceof BlendTree) {
      return this.source.getDuration();
    }
    return this.source.duration;
  }
}

/**
 * Animation layer mixer for compositing multiple layers.
 * Manages layer blending with override and additive modes.
 *
 * @example
 * ```typescript
 * const mixer = new AnimationLayerMixer();
 *
 * // Base layer
 * const baseLayer = new AnimationLayer('base', walkClip);
 * mixer.addLayer(baseLayer);
 *
 * // Upper body override layer
 * const upperBodyLayer = new AnimationLayer(
 *   'upper_body',
 *   aimBlendTree,
 *   LayerBlendMode.OVERRIDE
 * );
 * upperBodyLayer.setMask(upperBodyMask);
 * mixer.addLayer(upperBodyLayer);
 *
 * // Additive layer
 * const breathingLayer = new AnimationLayer(
 *   'breathing',
 *   breatheClip,
 *   LayerBlendMode.ADDITIVE
 * );
 * mixer.addLayer(breathingLayer);
 *
 * // Update and get final pose
 * mixer.update(deltaTime);
 * const pose = mixer.getPose();
 * ```
 */
export class AnimationLayerMixer {
  /**
   * Animation layers sorted by priority.
   */
  private layers: AnimationLayer[];

  /**
   * Creates a new layer mixer.
   *
   * @example
   * ```typescript
   * const mixer = new AnimationLayerMixer();
   * ```
   */
  constructor() {
    this.layers = [];
  }

  /**
   * Adds a layer to the mixer.
   *
   * @param layer - Layer to add
   * @param index - Index to insert at (default: end)
   * @returns This mixer for chaining
   *
   * @example
   * ```typescript
   * mixer.addLayer(baseLayer);
   * mixer.addLayer(additiveLayer, 1); // Insert at index 1
   * ```
   */
  addLayer(layer: AnimationLayer, index?: number): this {
    if (index !== undefined) {
      this.layers.splice(index, 0, layer);
    } else {
      this.layers.push(layer);
    }
    return this;
  }

  /**
   * Removes a layer from the mixer.
   *
   * @param layer - Layer to remove
   * @returns True if removed
   *
   * @example
   * ```typescript
   * mixer.removeLayer(upperBodyLayer);
   * ```
   */
  removeLayer(layer: AnimationLayer): boolean {
    const index = this.layers.indexOf(layer);
    if (index !== -1) {
      this.layers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Removes a layer by name.
   *
   * @param name - Layer name
   * @returns True if removed
   *
   * @example
   * ```typescript
   * mixer.removeLayerByName('upper_body');
   * ```
   */
  removeLayerByName(name: string): boolean {
    const index = this.layers.findIndex(l => l.name === name);
    if (index !== -1) {
      this.layers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Gets a layer by name.
   *
   * @param name - Layer name
   * @returns Layer or undefined
   *
   * @example
   * ```typescript
   * const layer = mixer.getLayer('base');
   * if (layer) {
   *   layer.weight = 0.5;
   * }
   * ```
   */
  getLayer(name: string): AnimationLayer | undefined {
    return this.layers.find(l => l.name === name);
  }

  /**
   * Gets all layers.
   *
   * @returns Array of layers
   *
   * @example
   * ```typescript
   * const layers = mixer.getLayers();
   * ```
   */
  getLayers(): ReadonlyArray<AnimationLayer> {
    return this.layers;
  }

  /**
   * Updates all enabled layers.
   *
   * @param deltaTime - Time delta in seconds
   *
   * @example
   * ```typescript
   * mixer.update(deltaTime);
   * ```
   */
  update(deltaTime: number): void {
    for (const layer of this.layers) {
      if (layer.enabled) {
        layer.update(deltaTime);
      }
    }
  }

  /**
   * Gets the final blended pose from all layers.
   * Applies override and additive blending based on layer modes.
   *
   * @returns Final blended pose
   *
   * @example
   * ```typescript
   * const pose = mixer.getPose();
   * for (const [key, value] of pose) {
   *   const [target, type] = key.split(':');
   *   applyToSkeleton(target, type, value);
   * }
   * ```
   */
  getPose(): Map<string, any> {
    if (this.layers.length === 0) {
      return new Map();
    }

    const basePose = new Map<string, any>();
    const additivePoses: Map<string, any>[] = [];

    for (const layer of this.layers) {
      if (!layer.enabled || layer.weight <= 0) {
        continue;
      }

      const layerPose = layer.sample();

      if (layer.blendMode === LayerBlendMode.OVERRIDE) {
        for (const [key, value] of layerPose) {
          const [target, typeStr] = key.split(':');
          const type = typeStr as ChannelType;

          if (!basePose.has(key)) {
            basePose.set(key, this.scaleValue(value, layer.weight, type));
          } else {
            const existing = basePose.get(key);
            basePose.set(key, this.blendValues(existing, value, layer.weight, type));
          }
        }
      } else if (layer.blendMode === LayerBlendMode.ADDITIVE) {
        const scaledPose = new Map<string, any>();
        for (const [key, value] of layerPose) {
          const [, typeStr] = key.split(':');
          const type = typeStr as ChannelType;
          scaledPose.set(key, this.scaleValue(value, layer.weight, type));
        }
        additivePoses.push(scaledPose);
      }
    }

    for (const additivePose of additivePoses) {
      for (const [key, value] of additivePose) {
        const [, typeStr] = key.split(':');
        const type = typeStr as ChannelType;

        if (!basePose.has(key)) {
          basePose.set(key, value);
        } else {
          const existing = basePose.get(key);
          basePose.set(key, this.addValues(existing, value, type));
        }
      }
    }

    return basePose;
  }

  /**
   * Resets all layers.
   *
   * @example
   * ```typescript
   * mixer.reset();
   * ```
   */
  reset(): void {
    for (const layer of this.layers) {
      layer.reset();
    }
  }

  /**
   * Clears all layers.
   *
   * @example
   * ```typescript
   * mixer.clear();
   * ```
   */
  clear(): void {
    this.layers.length = 0;
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
   * Adds two values (for additive blending).
   *
   * @param a - Base value
   * @param b - Additive value
   * @param type - Channel type
   * @returns Added value
   * @private
   */
  private addValues(a: any, b: any, type: ChannelType): any {
    switch (type) {
      case ChannelType.POSITION:
      case ChannelType.SCALE:
        if (a && typeof a.add === 'function') {
          return a.add(b);
        }
        return b;

      case ChannelType.ROTATION:
        if (a && typeof a.x === 'number' && b && typeof b.x === 'number') {
          return this.multiplyQuaternion(a, b);
        }
        return b;

      case ChannelType.WEIGHTS: {
        if (Array.isArray(a) && Array.isArray(b)) {
          const result = [];
          for (let i = 0; i < Math.min(a.length, b.length); i++) {
            result[i] = a[i] + b[i];
          }
          return result;
        }
        return b;
      }

      default:
        return b;
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

  /**
   * Multiplies two quaternions (for additive rotation).
   *
   * @param a - First quaternion
   * @param b - Second quaternion
   * @returns Product quaternion
   * @private
   */
  private multiplyQuaternion(a: any, b: any): any {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y + a.y * b.w + a.z * b.x - a.x * b.z,
      z: a.w * b.z + a.z * b.w + a.x * b.y - a.y * b.x,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
  }
}
