/**
 * Procedural animation system for runtime-generated animations.
 * Generates animations programmatically based on mathematical functions,
 * noise, and physics simulations. Supports layering and blending.
 * @module animation/ProceduralAnimationSystem
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Skeleton } from './Skeleton';

/**
 * Procedural animation types.
 */
export enum ProceduralAnimationType {
  /** Sine wave oscillation */
  Sine = 0,
  /** Noise-based motion */
  Noise = 1,
  /** Spring physics */
  Spring = 2,
  /** Breathing motion */
  Breathing = 3,
  /** Idle fidgeting */
  Idle = 4,
  /** Head bobbing */
  HeadBob = 5,
  /** Recoil effect */
  Recoil = 6
}

/**
 * Configuration for procedural animation.
 */
export interface ProceduralAnimationConfig {
  /** Animation type */
  type: ProceduralAnimationType;
  /** Target bone name */
  boneName: string;
  /** Animation frequency (Hz) */
  frequency?: number;
  /** Animation amplitude */
  amplitude?: Vector3;
  /** Rotation amplitude (radians) */
  rotationAmplitude?: Vector3;
  /** Phase offset */
  phaseOffset?: number;
  /** Blend weight [0-1] */
  weight?: number;
  /** Custom parameters */
  params?: Record<string, number>;
}

/**
 * Active procedural animation instance.
 */
interface ProceduralAnimation {
  /** Configuration */
  config: ProceduralAnimationConfig;
  /** Current time */
  time: number;
  /** Previous position */
  prevPosition: Vector3;
  /** Previous rotation */
  prevRotation: Quaternion;
  /** Velocity for spring */
  velocity: Vector3;
  /** Angular velocity for spring */
  angularVelocity: Vector3;
  /** Is active */
  active: boolean;
}

/**
 * Procedural animation system for runtime-generated animations.
 * Creates dynamic animations using mathematical functions and physics.
 * Useful for breathing, idle motions, and reactive animations.
 *
 * @example
 * ```typescript
 * const procAnim = new ProceduralAnimationSystem();
 *
 * // Add breathing animation
 * procAnim.addAnimation({
 *   type: ProceduralAnimationType.Breathing,
 *   boneName: 'chest',
 *   frequency: 0.25,
 *   amplitude: new Vector3(0, 0.02, 0.01),
 *   weight: 1.0
 * });
 *
 * // Add head bobbing
 * procAnim.addAnimation({
 *   type: ProceduralAnimationType.HeadBob,
 *   boneName: 'head',
 *   frequency: 2.0,
 *   rotationAmplitude: new Vector3(0.1, 0, 0),
 *   weight: 0.5
 * });
 *
 * procAnim.update(skeleton, deltaTime);
 * ```
 */
export class ProceduralAnimationSystem {
  private animations: Map<string, ProceduralAnimation> = new Map();
  private globalWeight: number = 1.0;

  /**
   * Adds a procedural animation.
   *
   * @param config - Animation configuration
   * @returns Animation ID
   */
  addAnimation(config: ProceduralAnimationConfig): string {
    const id = `${config.boneName}_${config.type}_${Date.now()}`;

    this.animations.set(id, {
      config: {
        ...config,
        frequency: config.frequency ?? 1.0,
        amplitude: config.amplitude ?? Vector3.one(),
        rotationAmplitude: config.rotationAmplitude ?? Vector3.zero(),
        phaseOffset: config.phaseOffset ?? 0,
        weight: config.weight ?? 1.0,
        params: config.params ?? {}
      },
      time: 0,
      prevPosition: Vector3.zero(),
      prevRotation: Quaternion.identity(),
      velocity: Vector3.zero(),
      angularVelocity: Vector3.zero(),
      active: true
    });

    return id;
  }

  /**
   * Removes a procedural animation.
   *
   * @param id - Animation ID
   */
  removeAnimation(id: string): void {
    this.animations.delete(id);
  }

  /**
   * Sets animation weight.
   *
   * @param id - Animation ID
   * @param weight - Weight [0-1]
   */
  setAnimationWeight(id: string, weight: number): void {
    const anim = this.animations.get(id);
    if (anim) {
      anim.config.weight = Math.max(0, Math.min(1, weight));
    }
  }

  /**
   * Activates or deactivates an animation.
   *
   * @param id - Animation ID
   * @param active - Active state
   */
  setAnimationActive(id: string, active: boolean): void {
    const anim = this.animations.get(id);
    if (anim) {
      anim.active = active;
    }
  }

  /**
   * Updates all procedural animations.
   *
   * @param skeleton - Target skeleton
   * @param deltaTime - Time delta in seconds
   */
  update(skeleton: Skeleton, deltaTime: number): void {
    if (this.globalWeight <= 0) {
      return;
    }

    this.animations.forEach((anim, id) => {
      if (!anim.active || anim.config.weight! <= 0) {
        return;
      }

      anim.time += deltaTime;

      const boneIndex = skeleton.getBoneIndex(anim.config.boneName);
      if (boneIndex === -1) continue;

      const bone = skeleton.getBoneByIndex(boneIndex)!;

      switch (anim.config.type) {
        case ProceduralAnimationType.Sine:
          this.applySineAnimation(bone, anim, deltaTime);
          break;

        case ProceduralAnimationType.Noise:
          this.applyNoiseAnimation(bone, anim, deltaTime);
          break;

        case ProceduralAnimationType.Spring:
          this.applySpringAnimation(bone, anim, deltaTime);
          break;

        case ProceduralAnimationType.Breathing:
          this.applyBreathingAnimation(bone, anim, deltaTime);
          break;

        case ProceduralAnimationType.Idle:
          this.applyIdleAnimation(bone, anim, deltaTime);
          break;

        case ProceduralAnimationType.HeadBob:
          this.applyHeadBobAnimation(bone, anim, deltaTime);
          break;

        case ProceduralAnimationType.Recoil:
          this.applyRecoilAnimation(bone, anim, deltaTime);
          break;
      }
    });

    skeleton.update(true);
  }

  /**
   * Applies sine wave animation.
   */
  private applySineAnimation(bone: any, anim: ProceduralAnimation, deltaTime: number): void {
    const config = anim.config;
    const phase = anim.time * config.frequency! * Math.PI * 2 + config.phaseOffset!;

    const posOffset = new Vector3(
      Math.sin(phase) * config.amplitude!.x,
      Math.sin(phase + Math.PI / 3) * config.amplitude!.y,
      Math.sin(phase + Math.PI / 6) * config.amplitude!.z
    );

    bone.position.addInPlace(posOffset.scale(config.weight! * this.globalWeight));

    if (config.rotationAmplitude!.lengthSquared() > 0) {
      const rotX = Math.sin(phase) * config.rotationAmplitude!.x;
      const rotY = Math.sin(phase + Math.PI / 4) * config.rotationAmplitude!.y;
      const rotZ = Math.sin(phase + Math.PI / 2) * config.rotationAmplitude!.z;

      const rotation = Quaternion.fromEuler(rotX, rotY, rotZ, 'XYZ');
      bone.rotation = bone.rotation.slerp(bone.rotation.multiply(rotation), config.weight! * this.globalWeight);
    }
  }

  /**
   * Applies Perlin noise-based animation.
   */
  private applyNoiseAnimation(bone: any, anim: ProceduralAnimation, deltaTime: number): void {
    const config = anim.config;
    const t = anim.time * config.frequency!;

    const noiseX = this.perlinNoise(t, 0) * config.amplitude!.x;
    const noiseY = this.perlinNoise(t, 100) * config.amplitude!.y;
    const noiseZ = this.perlinNoise(t, 200) * config.amplitude!.z;

    const posOffset = new Vector3(noiseX, noiseY, noiseZ);
    bone.position.addInPlace(posOffset.scale(config.weight! * this.globalWeight));
  }

  /**
   * Applies spring physics animation.
   */
  private applySpringAnimation(bone: any, anim: ProceduralAnimation, deltaTime: number): void {
    const config = anim.config;
    const stiffness = config.params?.['stiffness'] ?? 50;
    const damping = config.params?.['damping'] ?? 5;

    const targetPos = Vector3.zero();
    const displacement = bone.position.sub(targetPos);

    const force = displacement.scale(-stiffness).sub(anim.velocity.scale(damping));
    anim.velocity.addInPlace(force.scale(deltaTime));

    const offset = anim.velocity.scale(deltaTime);
    bone.position.addInPlace(offset.scale(config.weight! * this.globalWeight));
  }

  /**
   * Applies breathing animation.
   */
  private applyBreathingAnimation(bone: any, anim: ProceduralAnimation, deltaTime: number): void {
    const config = anim.config;
    const phase = anim.time * config.frequency! * Math.PI * 2;

    const breathCycle = Math.sin(phase) * 0.5 + 0.5;
    const breathAmount = breathCycle * breathCycle;

    const posOffset = new Vector3(
      config.amplitude!.x * breathAmount,
      config.amplitude!.y * breathAmount,
      config.amplitude!.z * breathAmount
    );

    bone.position.addInPlace(posOffset.scale(config.weight! * this.globalWeight));

    const chestExpansion = Quaternion.fromEuler(
      breathAmount * config.rotationAmplitude!.x,
      0,
      0,
      'XYZ'
    );
    bone.rotation = bone.rotation.slerp(bone.rotation.multiply(chestExpansion), config.weight! * this.globalWeight);
  }

  /**
   * Applies idle fidgeting animation.
   */
  private applyIdleAnimation(bone: any, anim: ProceduralAnimation, deltaTime: number): void {
    const config = anim.config;
    const t = anim.time * config.frequency!;

    const shift = Math.sin(t * 0.3) * Math.cos(t * 0.7);
    const tilt = Math.sin(t * 0.5) * Math.cos(t * 0.4);

    const posOffset = new Vector3(
      shift * config.amplitude!.x * 0.5,
      Math.abs(Math.sin(t * 0.2)) * config.amplitude!.y * 0.3,
      tilt * config.amplitude!.z * 0.5
    );

    bone.position.addInPlace(posOffset.scale(config.weight! * this.globalWeight));

    const rotation = Quaternion.fromEuler(
      tilt * config.rotationAmplitude!.x * 0.5,
      shift * config.rotationAmplitude!.y,
      shift * config.rotationAmplitude!.z * 0.3,
      'XYZ'
    );
    bone.rotation = bone.rotation.slerp(bone.rotation.multiply(rotation), config.weight! * this.globalWeight * 0.5);
  }

  /**
   * Applies head bobbing animation.
   */
  private applyHeadBobAnimation(bone: any, anim: ProceduralAnimation, deltaTime: number): void {
    const config = anim.config;
    const phase = anim.time * config.frequency! * Math.PI * 2;

    const verticalBob = Math.sin(phase * 2) * config.amplitude!.y;
    const horizontalSway = Math.sin(phase) * config.amplitude!.x;

    const posOffset = new Vector3(horizontalSway, verticalBob, 0);
    bone.position.addInPlace(posOffset.scale(config.weight! * this.globalWeight));

    const tilt = Math.sin(phase) * config.rotationAmplitude!.z;
    const nod = Math.sin(phase * 2) * config.rotationAmplitude!.x;

    const rotation = Quaternion.fromEuler(nod, 0, tilt, 'XYZ');
    bone.rotation = bone.rotation.slerp(bone.rotation.multiply(rotation), config.weight! * this.globalWeight);
  }

  /**
   * Applies recoil effect animation.
   */
  private applyRecoilAnimation(bone: any, anim: ProceduralAnimation, deltaTime: number): void {
    const config = anim.config;
    const decay = Math.exp(-anim.time * 5);

    const recoilAmount = decay;
    const posOffset = new Vector3(0, 0, -config.amplitude!.z * recoilAmount);

    bone.position.addInPlace(posOffset.scale(config.weight! * this.globalWeight));

    const rotation = Quaternion.fromEuler(
      -config.rotationAmplitude!.x * recoilAmount,
      0,
      0,
      'XYZ'
    );
    bone.rotation = bone.rotation.slerp(bone.rotation.multiply(rotation), config.weight! * this.globalWeight);

    if (decay < 0.01) {
      anim.active = false;
    }
  }

  /**
   * Simple Perlin noise approximation.
   */
  private perlinNoise(x: number, seed: number): number {
    const X = Math.floor(x) & 255;
    x -= Math.floor(x);

    const u = this.fade(x);

    const p = new Array(512);
    for (let i = 0; i < 256; i++) {
      p[i] = p[i + 256] = Math.floor(Math.sin(i + seed) * 256) & 255;
    }

    return this.lerp(u, this.grad(p[X], x), this.grad(p[X + 1], x - 1));
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number): number {
    return (hash & 1) === 0 ? x : -x;
  }

  /**
   * Sets global weight for all animations.
   *
   * @param weight - Global weight [0-1]
   */
  setGlobalWeight(weight: number): void {
    this.globalWeight = Math.max(0, Math.min(1, weight));
  }

  /**
   * Gets global weight.
   *
   * @returns Global weight
   */
  getGlobalWeight(): number {
    return this.globalWeight;
  }

  /**
   * Clears all animations.
   */
  clear(): void {
    this.animations.clear();
  }

  /**
   * Gets number of active animations.
   *
   * @returns Animation count
   */
  getAnimationCount(): number {
    return this.animations.size;
  }
}
