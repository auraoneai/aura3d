/**
 * Declaration-only physics vocabulary for consumers that do not load a world.
 *
 * Re-export the original declarations rather than reconstructing their shapes:
 * classes such as RigidBody and Constraint have private members and their
 * identity is part of the public TypeScript contract. Do not export the root or
 * world barrels here; their initialization exports depend on the optional
 * simulation adapter.
 */
export type { Collider, ColliderDescriptor, ColliderMaterial, CollisionFilter } from "./Collider.js";
export type { CollisionEvent, CollisionEventType, Contact } from "./CollisionEvents.js";
export type { Constraint, ConstraintDescriptor, ConstraintType } from "./Constraint.js";
export type {
  PhysicsCharacterController,
  PhysicsCharacterControllerDescriptor,
  PhysicsCharacterMovement
} from "./PhysicalCharacterController.js";
export type {
  PhysicsVehicleAxis,
  PhysicsVehicleController,
  PhysicsVehiclePose,
  PhysicsWheelCommand,
  PhysicsWheelSpec,
  PhysicsWheelState,
  PhysicsWheelTuning
} from "./PhysicalVehicleController.js";
export type {
  DebugLine,
  DebugLineCategory,
  PhysicsDebugDrawBudgetedResult,
  PhysicsDebugDrawOptions,
  PhysicsDebugDrawTelemetry
} from "./PhysicsDebugDraw.js";
export type {
  PhysicsBackend,
  PhysicsBackendPreference,
  PhysicsBackendSelection,
  PhysicsContinuousCollisionDescriptor,
  PhysicsContinuousCollisionSelection,
  PhysicsSnapshot,
  PhysicsStepStats,
  PhysicsWorld,
  PhysicsWorldDescriptor
} from "./PhysicsWorld.js";
export type { RaycastHit, RaycastOptions, SphereCastHit } from "./Raycast.js";
export type { Quat, RigidBody, RigidBodyDescriptor, RigidBodySnapshot, RigidBodyType } from "./RigidBody.js";
export type { ScenePhysicsBinding, ScenePhysicsNode } from "./ScenePhysicsBridge.js";
export type {
  Bounds,
  BoxShape,
  CapsuleShape,
  ConvexHullShape,
  HeightfieldShape,
  MeshShape,
  PhysicsShape,
  PlaneShape,
  SphereShape,
  Vec3
} from "./Shape.js";
