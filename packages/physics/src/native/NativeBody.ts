import type { RigidBody } from "../RigidBody.js";
import { rotateVec3ByQuat, validateFiniteVec3, type Vec3 } from "../Shape.js";
import { nativeInertia, nativeInverseInertia, nativeLocalCenterOfMass } from "./NativeMassProperties.js";

/** Forces are retained for every substep, then cleared only after the outer step. */
export interface NativeBodyForces {
  readonly force: Vec3;
  readonly torque: Vec3;
}

/** Capture the previous public pose and the forces applied for this outer step. */
export function beginNativeBodyStep(body: RigidBody): NativeBodyForces {
  validateFiniteVec3(body.position, "body position");
  validateFiniteVec3(body.velocity, "body velocity");
  validateFiniteVec3(body.angularVelocity, "body angular velocity");
  const rotationLength = Math.hypot(...body.rotation);
  if (body.rotation.length !== 4 || !body.rotation.every(Number.isFinite) || !Number.isFinite(rotationLength) || rotationLength < 1e-9) {
    throw new Error("body rotation must be a finite non-zero quaternion.");
  }
  validateDamping(body);
  if (body.type === "dynamic" && body.inverseInertia.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("body inverse inertia must contain finite positive principal values.");
  }
  const force = body.pendingForce();
  const torque = body.pendingTorque();
  validateFiniteVec3(force, "body force");
  validateFiniteVec3(torque, "body torque");
  body.rotation = [body.rotation[0] / rotationLength, body.rotation[1] / rotationLength, body.rotation[2] / rotationLength, body.rotation[3] / rotationLength];
  body.previousPosition = [...body.position];
  body.previousRotation = [...body.rotation];
  return { force, torque };
}

/** Integrate forces in world coordinates; constraints and contacts modify the resulting velocity. */
export function integrateNativeBodyVelocity(body: RigidBody, gravity: Vec3, forces: NativeBodyForces, dt: number): void {
  validateStep(dt);
  validateFiniteVec3(gravity, "gravity");
  validateFiniteVec3(forces.force, "body force");
  validateFiniteVec3(forces.torque, "body torque");
  validateDamping(body);
  if (body.type !== "dynamic" || body.sleeping) return;
  const linearDamping = Math.exp(-body.linearDamping * dt);
  const angularDamping = Math.exp(-body.angularDamping * dt);
  const angularMomentum = nativeInertia(body, body.angularVelocity);
  const gyro = cross(body.angularVelocity, angularMomentum);
  const angularAcceleration = nativeInverseInertia(body, [
    forces.torque[0] - gyro[0], forces.torque[1] - gyro[1], forces.torque[2] - gyro[2]
  ]);
  const velocity: [number, number, number] = [
    (body.velocity[0] + (gravity[0] + forces.force[0] * body.inverseMass) * dt) * linearDamping,
    (body.velocity[1] + (gravity[1] + forces.force[1] * body.inverseMass) * dt) * linearDamping,
    (body.velocity[2] + (gravity[2] + forces.force[2] * body.inverseMass) * dt) * linearDamping
  ];
  const angularVelocity: [number, number, number] = [
    (body.angularVelocity[0] + angularAcceleration[0] * dt) * angularDamping,
    (body.angularVelocity[1] + angularAcceleration[1] * dt) * angularDamping,
    (body.angularVelocity[2] + angularAcceleration[2] * dt) * angularDamping
  ];
  validateFiniteVec3(velocity, "integrated body velocity");
  validateFiniteVec3(angularVelocity, "integrated body angular velocity");
  body.velocity = velocity;
  body.angularVelocity = angularVelocity;
}

/** Advance a dynamic pose using world-space angular velocity and a unit quaternion. */
export function integrateNativeBodyPose(body: RigidBody, dt: number): void {
  validateStep(dt);
  if (body.type !== "dynamic" || body.sleeping) return;
  validateFiniteVec3(body.velocity, "body velocity");
  validateFiniteVec3(body.angularVelocity, "body angular velocity");
  const [wx, wy, wz] = body.angularVelocity;
  const speed = Math.hypot(wx, wy, wz);
  if (!Number.isFinite(speed * dt)) throw new Error("integrated body angular displacement must be finite.");
  let rotation = body.rotation;
  if (speed > 0) {
    const factor = Math.sin(speed * dt * 0.5) / speed;
    const dx = wx * factor, dy = wy * factor, dz = wz * factor, dw = Math.cos(speed * dt * 0.5);
    const [x, y, z, w] = body.rotation;
    const next: [number, number, number, number] = [
      dw * x + dx * w + dy * z - dz * y,
      dw * y - dx * z + dy * w + dz * x,
      dw * z + dx * y - dy * x + dz * w,
      dw * w - dx * x - dy * y - dz * z
    ];
    const length = Math.hypot(...next);
    rotation = [next[0] / length, next[1] / length, next[2] / length, next[3] / length];
  }
  // Linear velocity describes the center of mass; collider geometry is relative
  // to the body origin, which moves around an off-center COM when rotating.
  const localCenter = nativeLocalCenterOfMass(body);
  const before = rotateVec3ByQuat(localCenter, body.rotation);
  const after = rotateVec3ByQuat(localCenter, rotation);
  const position: [number, number, number] = [
    body.position[0] + (before[0] - after[0]) + body.velocity[0] * dt,
    body.position[1] + (before[1] - after[1]) + body.velocity[1] * dt,
    body.position[2] + (before[2] - after[2]) + body.velocity[2] * dt
  ];
  validateFiniteVec3(position, "integrated body position");
  body.position = position;
  body.rotation = rotation;
}

/** Call once after a successful outer step, never after a rejected step. */
export function finishNativeBodyStep(body: RigidBody): void {
  body.clearForces();
  body.poseOverridden = false;
  body.velocityOverridden = false;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function validateStep(dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) throw new Error("native body step dt must be finite and positive.");
}

function validateDamping(body: RigidBody): void {
  if (!Number.isFinite(body.linearDamping) || body.linearDamping < 0 || !Number.isFinite(body.angularDamping) || body.angularDamping < 0) {
    throw new Error("body damping must be finite and non-negative.");
  }
}
