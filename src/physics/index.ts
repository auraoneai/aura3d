/**
 * G3D Physics Module
 *
 * Complete physics simulation system with rigid bodies, collision detection,
 * constraints, and ECS integration.
 *
 * @module Physics
 *
 * @example
 * ```typescript
 * import {
 *   PhysicsWorld,
 *   RigidBody,
 *   BodyType,
 *   Collider,
 *   BoxShape,
 *   PhysicsMaterial,
 *   PhysicsSystem
 * } from './physics';
 *
 * // Create physics world
 * const world = new PhysicsWorld({
 *   gravity: new Vector3(0, -9.81, 0)
 * });
 *
 * // Create rigid body with collider
 * const body = new RigidBody({
 *   type: BodyType.Dynamic,
 *   mass: 10,
 *   position: new Vector3(0, 10, 0)
 * });
 *
 * const collider = new Collider({
 *   shape: new BoxShape(new Vector3(1, 1, 1)),
 *   material: PhysicsMaterial.wood()
 * });
 *
 * body.addCollider(collider);
 * world.addRigidBody(body);
 *
 * // Simulate
 * world.step(1/60);
 * ```
 */

// Core physics
export * from './PhysicsWorld';
export * from './RigidBody';
export * from './Collider';
export * from './PhysicsMaterial';

// Shapes
export * from './shapes/BoxShape';
export * from './shapes/SphereShape';
export * from './shapes/CapsuleShape';
export * from './shapes/MeshShape';

// Collision detection
export * from './Collision';
export * from './CollisionPair';

// Constraints
export * from './Constraint';

// Raycasting
// Rename exports to avoid conflicts with math.Ray and animation.RaycastHit
export {
  Ray as PhysicsRay,
  Raycast
} from './Raycast';
export type { RaycastHit as PhysicsRaycastHit } from './Raycast';

// ECS integration
export * from './PhysicsSystem';

// Phase C: Physics Backends
// Export types and classes from PhysicsBackend but avoid duplicates
export {
  PhysicsBackend
} from './PhysicsBackend';
export type {
  PhysicsMaterialData,
  RigidBodyConfig,
  ShapeConfig,
  ConstraintConfig,
  HingeConstraintConfig,
  SliderConstraintConfig,
  SpringConstraintConfig,
  RaycastQuery,
  PhysicsWorldConfig,
  BackendInitOptions,
  PhysicsBodyHandle,
  PhysicsShapeHandle,
  PhysicsConstraintHandle
} from './PhysicsBackend';
export * from './CannonBackend';
export * from './RapierBackend';
export * from './AmmoBackend';
export * from './MockPhysicsWorld';

// Phase C: Character & Vehicle Physics
export * from './CharacterController';
export * from './VehiclePhysics';
export * from './TireModel';

// Phase C: Advanced Collision & Constraints
export {
  CollisionFilter,
  NaiveBroadPhase,
  SweepAndPruneBroadPhase,
  BVHBroadPhase,
  StandardNarrowPhase,
  ContactGenerator,
  CollisionDetector
} from './CollisionDetection';
export type {
  IBroadPhase,
  INarrowPhase,
  ContactManifold
} from './CollisionDetection';
export {
  ConstraintSolver,
  PointToPointConstraint as SolverPointToPointConstraint,
  HingeConstraint as SolverHingeConstraint,
  SliderConstraint as SolverSliderConstraint,
  ConeTwistConstraint,
  SpringConstraint as SolverSpringConstraint,
  FixedConstraint as SolverFixedConstraint
} from './ConstraintSolver';
export type {
  ConstraintSolverConfig
} from './ConstraintSolver';

// Phase C: Debug Visualization
export * from './PhysicsDebugDraw';
