/**
 * Physics-based spring bone system for secondary motion.
 * Uses Verlet integration for realistic hair, cloth, and tail physics.
 * Supports collision detection with sphere and capsule colliders.
 * Performance: 100+ chains @ 60 FPS.
 * @module animation/SpringBoneSystem
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Skeleton } from './Skeleton';
import { SpringBoneChain, SphereCollider, CapsuleCollider } from './SpringBoneChain';

/**
 * Spring bone system for physics-based secondary animation.
 * Simulates dynamic motion for hair, tails, clothing, and accessories.
 * Uses Verlet integration with collision detection and constraints.
 *
 * @example
 * ```typescript
 * const springSystem = new SpringBoneSystem();
 *
 * // Add hair chain
 * const hairChain = new SpringBoneChain({
 *   name: 'ponytail',
 *   rootBone: 'head',
 *   bones: ['hair_1', 'hair_2', 'hair_3', 'hair_4'],
 *   stiffness: 0.6,
 *   damping: 0.4,
 *   gravity: new Vector3(0, -9.8, 0),
 *   collisionRadius: 0.05,
 *   sphereColliders: [
 *     { center: new Vector3(0, 0.5, 0), radius: 0.15, attachedBone: 'head' }
 *   ]
 * });
 *
 * springSystem.addChain(hairChain);
 *
 * // Update each frame
 * springSystem.update(skeleton, deltaTime);
 * ```
 */
export class SpringBoneSystem {
  private chains: Map<string, SpringBoneChain> = new Map();
  private globalWeight: number = 1.0;
  private timeAccumulator: number = 0;
  private fixedTimeStep: number = 1 / 60;
  private maxSubSteps: number = 3;

  /**
   * Adds a spring bone chain to the system.
   *
   * @param chain - Spring bone chain
   */
  addChain(chain: SpringBoneChain): void {
    this.chains.set(chain.name, chain);
  }

  /**
   * Removes a spring bone chain.
   *
   * @param name - Chain name
   */
  removeChain(name: string): void {
    this.chains.delete(name);
  }

  /**
   * Gets a spring bone chain by name.
   *
   * @param name - Chain name
   * @returns Spring bone chain or undefined
   */
  getChain(name: string): SpringBoneChain | undefined {
    return this.chains.get(name);
  }

  /**
   * Gets all chains.
   *
   * @returns Array of chains
   */
  getChains(): SpringBoneChain[] {
    return Array.from(this.chains.values());
  }

  /**
   * Updates all spring bone chains.
   *
   * @param skeleton - Target skeleton
   * @param deltaTime - Time delta in seconds
   */
  update(skeleton: Skeleton, deltaTime: number): void {
    if (this.globalWeight <= 0 || this.chains.size === 0) {
      return;
    }

    skeleton.update(true);

    this.timeAccumulator += deltaTime;

    let subSteps = 0;
    while (this.timeAccumulator >= this.fixedTimeStep && subSteps < this.maxSubSteps) {
      this.chains.forEach((chain) => {
        if (chain.getWeight() > 0) {
          this.updateChain(skeleton, chain, this.fixedTimeStep);
        }
      });

      this.timeAccumulator -= this.fixedTimeStep;
      subSteps++;
    }

    this.chains.forEach((chain) => {
      if (chain.getWeight() > 0) {
        this.applyToSkeleton(skeleton, chain);
      }
    });

    skeleton.update(true);
  }

  /**
   * Initializes a chain with skeleton data.
   *
   * @param skeleton - Target skeleton
   * @param chain - Spring bone chain
   */
  private initializeChain(skeleton: Skeleton, chain: SpringBoneChain): void {
    const rootIndex = skeleton.getBoneIndex(chain.rootBone);
    if (rootIndex === -1) {
      console.warn(`SpringBone: Could not find root bone ${chain.rootBone}`);
      return;
    }

    const boneIndices: number[] = [];
    for (const boneName of chain.bones) {
      const index = skeleton.getBoneIndex(boneName);
      if (index === -1) {
        console.warn(`SpringBone: Could not find bone ${boneName}`);
        return;
      }
      boneIndices.push(index);
    }

    chain.setRootIndex(rootIndex);
    chain.setBoneIndices(boneIndices);
    chain.allocateArrays(boneIndices.length);

    skeleton.update(true);

    const positions: Vector3[] = [];
    for (const index of boneIndices) {
      const worldMat = skeleton['worldMatrices'][index];
      positions.push(worldMat.getPosition());
    }

    const lengths: number[] = [];
    for (let i = 0; i < positions.length - 1; i++) {
      lengths.push(Vector3.distance(positions[i], positions[i + 1]));
    }

    chain.setCurrentPositions(positions.map(p => p.clone()));
    chain.setPreviousPositions(positions.map(p => p.clone()));
    chain.setBoneLengths(lengths);
    chain.setInitialized(true);
  }

  /**
   * Updates a single spring bone chain.
   *
   * @param skeleton - Target skeleton
   * @param chain - Spring bone chain
   * @param deltaTime - Time delta
   */
  private updateChain(skeleton: Skeleton, chain: SpringBoneChain, deltaTime: number): void {
    if (!chain.isInitialized()) {
      this.initializeChain(skeleton, chain);
      if (!chain.isInitialized()) {
        return;
      }
    }

    const rootWorld = skeleton['worldMatrices'][chain.getRootIndex()];
    const rootPos = rootWorld.getPosition();

    const currentPositions = chain.getCurrentPositions();
    const previousPositions = chain.getPreviousPositions();
    const boneIndices = chain.getBoneIndices();

    currentPositions[0] = rootPos.clone();
    previousPositions[0] = rootPos.clone();

    for (let i = 1; i < currentPositions.length; i++) {
      const current = currentPositions[i];
      const previous = previousPositions[i];

      const velocity = current.sub(previous);

      const damping = 1.0 - chain.damping;
      const dampedVelocity = velocity.scale(damping);

      const externalForce = chain.gravity.add(chain.wind).scale(deltaTime * deltaTime);

      let newPosition = current.add(dampedVelocity).add(externalForce);

      const toParent = currentPositions[i - 1].sub(newPosition);
      const distance = toParent.length();
      const targetLength = chain.getBoneLengths()[i - 1];

      if (distance > 0.0001) {
        const stiffnessForce = toParent.normalize().scale(
          (distance - targetLength) * chain.stiffness
        );
        newPosition = newPosition.add(stiffnessForce);
      }

      previousPositions[i] = current.clone();
      currentPositions[i] = newPosition;
    }

    this.applyConstraints(chain);

    this.resolveCollisions(skeleton, chain);
  }

  /**
   * Applies distance constraints to maintain bone lengths.
   *
   * @param chain - Spring bone chain
   */
  private applyConstraints(chain: SpringBoneChain): void {
    const currentPositions = chain.getCurrentPositions();
    const boneLengths = chain.getBoneLengths();

    const iterations = 2;

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < boneLengths.length; i++) {
        const a = currentPositions[i];
        const b = currentPositions[i + 1];

        const delta = b.sub(a);
        const distance = delta.length();
        const targetLength = boneLengths[i];

        if (distance > 0.0001) {
          const correction = delta.scale((distance - targetLength) / distance * 0.5);

          if (i > 0) {
            currentPositions[i] = a.add(correction);
          }
          currentPositions[i + 1] = b.sub(correction);
        }
      }
    }
  }

  /**
   * Resolves collisions with sphere and capsule colliders.
   *
   * @param skeleton - Target skeleton
   * @param chain - Spring bone chain
   */
  private resolveCollisions(skeleton: Skeleton, chain: SpringBoneChain): void {
    const currentPositions = chain.getCurrentPositions();

    for (const collider of chain.sphereColliders) {
      let center = collider.center.clone();

      if (collider.attachedBone) {
        const boneIndex = skeleton.getBoneIndex(collider.attachedBone);
        if (boneIndex !== -1) {
          const boneWorld = skeleton['worldMatrices'][boneIndex];
          center = boneWorld.getPosition().add(collider.center);
        }
      }

      for (let i = 1; i < currentPositions.length; i++) {
        const pos = currentPositions[i];
        const toPos = pos.sub(center);
        const distance = toPos.length();
        const minDistance = collider.radius + chain.collisionRadius;

        if (distance < minDistance && distance > 0.0001) {
          const correction = toPos.normalize().scale(minDistance - distance);
          currentPositions[i] = pos.add(correction);
        }
      }
    }

    for (const collider of chain.capsuleColliders) {
      let start = collider.start.clone();
      let end = collider.end.clone();

      if (collider.attachedBoneStart) {
        const boneIndex = skeleton.getBoneIndex(collider.attachedBoneStart);
        if (boneIndex !== -1) {
          const boneWorld = skeleton['worldMatrices'][boneIndex];
          start = boneWorld.getPosition().add(collider.start);
        }
      }

      if (collider.attachedBoneEnd) {
        const boneIndex = skeleton.getBoneIndex(collider.attachedBoneEnd);
        if (boneIndex !== -1) {
          const boneWorld = skeleton['worldMatrices'][boneIndex];
          end = boneWorld.getPosition().add(collider.end);
        }
      }

      for (let i = 1; i < currentPositions.length; i++) {
        const pos = currentPositions[i];
        const closestPoint = this.closestPointOnLineSegment(pos, start, end);
        const toPos = pos.sub(closestPoint);
        const distance = toPos.length();
        const minDistance = collider.radius + chain.collisionRadius;

        if (distance < minDistance && distance > 0.0001) {
          const correction = toPos.normalize().scale(minDistance - distance);
          currentPositions[i] = pos.add(correction);
        }
      }
    }
  }

  /**
   * Finds closest point on line segment to a point.
   */
  private closestPointOnLineSegment(point: Vector3, start: Vector3, end: Vector3): Vector3 {
    const line = end.sub(start);
    const lineLength = line.length();

    if (lineLength < 0.0001) {
      return start;
    }

    const t = Math.max(0, Math.min(1, point.sub(start).dot(line) / (lineLength * lineLength)));
    return start.add(line.scale(t));
  }

  /**
   * Applies spring bone results to skeleton.
   *
   * @param skeleton - Target skeleton
   * @param chain - Spring bone chain
   */
  private applyToSkeleton(skeleton: Skeleton, chain: SpringBoneChain): void {
    const currentPositions = chain.getCurrentPositions();
    const boneIndices = chain.getBoneIndices();
    const weight = chain.getWeight() * this.globalWeight;

    for (let i = 0; i < boneIndices.length - 1; i++) {
      const boneIndex = boneIndices[i];
      const bone = skeleton.getBoneByIndex(boneIndex)!;

      const currentDir = currentPositions[i + 1].sub(currentPositions[i]).normalize();

      const worldMat = skeleton['worldMatrices'][boneIndex];
      const worldRotData = worldMat.getRotation();
      const worldRot = new Quaternion(worldRotData.x, worldRotData.y, worldRotData.z, worldRotData.w);
      const localUp = new Vector3(0, 1, 0);
      const qv = new Quaternion(localUp.x, localUp.y, localUp.z, 0);
      const qResult = worldRot.multiply(qv).multiply(worldRot.conjugate());
      const boneWorldDir = new Vector3(qResult.x, qResult.y, qResult.z).normalize();

      if (currentDir.lengthSquared() > 0.0001 && boneWorldDir.lengthSquared() > 0.0001) {
        const rotation = Quaternion.fromUnitVectors(boneWorldDir, currentDir);

        const parentRotData = bone.parentIndex >= 0
          ? skeleton['worldMatrices'][bone.parentIndex].getRotation()
          : { x: 0, y: 0, z: 0, w: 1 };
        const parentRot = new Quaternion(parentRotData.x, parentRotData.y, parentRotData.z, parentRotData.w);

        const newWorldRot = rotation.multiply(worldRot);
        const newLocalRot = parentRot.invert().multiply(newWorldRot);

        bone.rotation = bone.rotation.slerp(newLocalRot, weight);
      }
    }
  }

  /**
   * Sets global weight for all chains.
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
   * Sets fixed time step for simulation.
   *
   * @param timeStep - Time step in seconds
   */
  setFixedTimeStep(timeStep: number): void {
    this.fixedTimeStep = Math.max(1 / 240, Math.min(1 / 30, timeStep));
  }

  /**
   * Gets number of chains.
   *
   * @returns Chain count
   */
  getChainCount(): number {
    return this.chains.size;
  }

  /**
   * Clears all chains.
   */
  clear(): void {
    this.chains.clear();
  }

  /**
   * Resets all chains.
   */
  reset(): void {
    this.chains.forEach((chain) => {
      chain.setInitialized(false);
    });
    this.timeAccumulator = 0;
  }
}
