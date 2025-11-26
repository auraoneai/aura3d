/**
 * Cloth simulation module using Position Based Dynamics (PBD).
 *
 * Provides high-performance cloth simulation with realistic behavior including:
 * - Distance and bending constraints
 * - Collision detection with rigid shapes
 * - Cloth tearing and cutting
 * - Wind forces and turbulence
 * - CPU and GPU implementations
 *
 * Performance: 100k particles @ 60 FPS with GPU acceleration.
 *
 * @module Simulation/Cloth
 *
 * @example
 * ```typescript
 * import {
 *   ClothSimulation,
 *   PBDSolver,
 *   ClothCollisionSystem,
 *   ClothTearingSystem
 * } from './simulation/cloth';
 *
 * // Create cloth
 * const cloth = new ClothSimulation({
 *   width: 2,
 *   height: 2,
 *   segmentsX: 30,
 *   segmentsY: 30,
 *   structuralStiffness: 0.95,
 *   bendingStiffness: 0.2
 * });
 *
 * // Pin corners
 * cloth.pinVertex(0, 0);
 * cloth.pinVertex(cloth.segmentsX, 0);
 *
 * // Add wind
 * cloth.setWind({
 *   direction: new Vector3(5, 0, 0),
 *   turbulence: 0.3,
 *   frequency: 1.0
 * });
 *
 * // Simulate
 * function animate(deltaTime: number) {
 *   cloth.update(deltaTime);
 *
 *   // Get buffers for rendering
 *   const positions = cloth.getPositionBuffer();
 *   const normals = cloth.getNormalBuffer();
 *   const indices = cloth.getIndexBuffer();
 *
 *   // Update GPU mesh...
 * }
 * ```
 */

export { ClothSimulation } from './ClothSimulation';
export type { ClothConfig, WindConfig } from './ClothSimulation';

export {
  PBDSolver,
  DistanceConstraint,
  BendingConstraint,
  CollisionConstraint
} from './PBDSolver';
export type { PBDSolverConfig, IPBDConstraint } from './PBDSolver';

export { ClothCollisionSystem } from './ClothCollisionSystem';
export type { CollisionInfo } from './ClothCollisionSystem';

export { ClothTearingSystem } from './ClothTearingSystem';
export type { TearingConfig, TearEvent } from './ClothTearingSystem';
