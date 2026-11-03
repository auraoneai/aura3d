import { Collider, RigidBody, Shape } from "@aura3d/physics/solverless";
import { Constraint } from "../../../../../physics/src/Constraint.js";

// This key is deliberately private to this module: a structurally identical
// object cannot accidentally become a second accepted core in TypeScript.
const coreIdentity: unique symbol = Symbol("aura3d.physics.v5.core");

/**
 * The shared source-level identity and constructors for v5 physics connectors.
 *
 * A connector must import this same object, and must use these constructors
 * when adapting bodies, colliders, shapes and constraints. The provider checks
 * object identity before initialization, so a second installed copy fails
 * explicitly instead of silently mixing nominal physics classes. A connector
 * still needs its own behavioral checks to prove it honors this contract.
 */
export const v5PhysicsCore = Object.freeze({
  [coreIdentity]: true as const,
  Collider,
  Constraint,
  RigidBody,
  Shape
});

export type V5PhysicsCore = typeof v5PhysicsCore;
