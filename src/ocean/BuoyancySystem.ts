import { Vector3 } from '../math/Vector3';
import { Logger } from '../core/Logger';
import { WaveCascade } from './WaveCascade';
import { GerstnerWaves } from './GerstnerWaves';

/**
 * Buoyant object
 */
export interface BuoyantObject {
  id: string;
  position: Vector3;
  velocity: Vector3;
  mass: number;
  volume: number;
  dragCoefficient: number;
  samplePoints: Vector3[];
}

/**
 * Buoyancy force result
 */
export interface BuoyancyForce {
  force: Vector3;
  torque: Vector3;
  waterHeight: number;
  submergedVolume: number;
}

/**
 * BuoyancySystem - Physics buoyancy for floating objects
 *
 * Simulates realistic buoyancy forces for objects floating on water.
 * Uses multiple sample points to calculate accurate forces and torques.
 *
 * Features:
 * - Multi-point sampling for accuracy
 * - Archimedes principle physics
 * - Drag forces
 * - Wave height sampling
 * - Torque calculation for rotation
 *
 * @example
 * ```typescript
 * const buoyancy = new BuoyancySystem(cascade);
 * const object = {
 *   id: 'boat',
 *   position: new Vector3(0, 0, 0),
 *   velocity: new Vector3(0, 0, 0),
 *   mass: 1000,
 *   volume: 50,
 *   dragCoefficient: 0.5,
 *   samplePoints: [...]
 * };
 * const force = buoyancy.calculateBuoyancy(object, time);
 * ```
 */
export class BuoyancySystem {
  private cascade: WaveCascade | null;
  private gerstner: GerstnerWaves | null;
  private logger: Logger;
  private waterDensity: number = 1000;
  private gravity: number = 9.81;

  constructor(cascade?: WaveCascade, gerstner?: GerstnerWaves) {
    this.cascade = cascade || null;
    this.gerstner = gerstner || null;
    this.logger = Logger.getInstance();
  }

  /**
   * Sets wave cascade
   */
  public setCascade(cascade: WaveCascade): void {
    this.cascade = cascade;
  }

  /**
   * Sets Gerstner waves
   */
  public setGerstner(gerstner: GerstnerWaves): void {
    this.gerstner = gerstner;
  }

  /**
   * Sets water density in kg/m³
   */
  public setWaterDensity(density: number): void {
    this.waterDensity = density;
  }

  /**
   * Sets gravity in m/s²
   */
  public setGravity(gravity: number): void {
    this.gravity = gravity;
  }

  /**
   * Calculates buoyancy forces for an object
   */
  public calculateBuoyancy(object: BuoyantObject, time: number): BuoyancyForce {
    const totalForce = new Vector3(0, 0, 0);
    const totalTorque = new Vector3(0, 0, 0);
    let submergedCount = 0;
    let totalWaterHeight = 0;

    // Sample each point
    for (const samplePoint of object.samplePoints) {
      const worldPos = object.position.clone().add(samplePoint);
      const waterHeight = this.getWaterHeight(worldPos.x, worldPos.z, time);
      totalWaterHeight += waterHeight;

      const depth = waterHeight - worldPos.y;

      if (depth > 0) {
        submergedCount++;

        // Buoyancy force (Archimedes' principle)
        const buoyancy = this.waterDensity * this.gravity * depth / object.samplePoints.length;
        const buoyancyForce = new Vector3(0, buoyancy, 0);

        totalForce.add(buoyancyForce);

        // Torque from offset force
        const r = samplePoint.clone();
        const torque = r.clone().cross(buoyancyForce);
        totalTorque.add(torque);

        // Drag force
        const dragForce = this.calculateDrag(object, samplePoint, depth);
        totalForce.add(dragForce);
      }
    }

    // Add gravity
    const gravityForce = new Vector3(0, -object.mass * this.gravity, 0);
    totalForce.add(gravityForce);

    const submergedVolume = (submergedCount / object.samplePoints.length) * object.volume;
    const avgWaterHeight = totalWaterHeight / object.samplePoints.length;

    return {
      force: totalForce,
      torque: totalTorque,
      waterHeight: avgWaterHeight,
      submergedVolume
    };
  }

  /**
   * Gets water height at position
   */
  private getWaterHeight(x: number, z: number, time: number): number {
    let height = 0;

    if (this.cascade) {
      height += this.cascade.getHeightAt(x, z);
    }

    if (this.gerstner) {
      height += this.gerstner.getHeight(x, z, time);
    }

    return height;
  }

  /**
   * Calculates drag force
   */
  private calculateDrag(object: BuoyantObject, samplePoint: Vector3, depth: number): Vector3 {
    const worldVel = object.velocity.clone();

    // Drag force: F = -0.5 * ρ * Cd * A * v²
    const speedSq = worldVel.lengthSquared();
    const dragMagnitude = 0.5 * this.waterDensity * object.dragCoefficient * depth * speedSq / object.samplePoints.length;

    if (speedSq > 0) {
      return worldVel.normalize().multiplyScalar(-dragMagnitude);
    }

    return new Vector3(0, 0, 0);
  }

  /**
   * Creates sample points for a box-shaped object
   */
  public static createBoxSamplePoints(width: number, height: number, depth: number, resolution: number = 3): Vector3[] {
    const points: Vector3[] = [];
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        for (let k = 0; k < resolution; k++) {
          const x = -halfW + (width / (resolution - 1)) * i;
          const y = -halfH + (height / (resolution - 1)) * j;
          const z = -halfD + (depth / (resolution - 1)) * k;
          points.push(new Vector3(x, y, z));
        }
      }
    }

    return points;
  }

  /**
   * Creates sample points for a sphere
   */
  public static createSphereSamplePoints(radius: number, resolution: number = 3): Vector3[] {
    const points: Vector3[] = [];

    for (let i = 0; i < resolution; i++) {
      const phi = (Math.PI * i) / (resolution - 1);

      for (let j = 0; j < resolution; j++) {
        const theta = (2 * Math.PI * j) / resolution;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        points.push(new Vector3(x, y, z));
      }
    }

    return points;
  }

  /**
   * Updates object physics (simplified integration)
   */
  public updateObject(object: BuoyantObject, time: number, deltaTime: number): void {
    const buoyancy = this.calculateBuoyancy(object, time);

    // Apply force to velocity
    const acceleration = buoyancy.force.clone().scale(1 / object.mass);
    object.velocity.add(acceleration.multiplyScalar(deltaTime));

    // Apply velocity to position
    object.position.add(object.velocity.clone().multiplyScalar(deltaTime));
  }
}
